import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";
import { ACCESS_BROWSER_LOGIN_HANDOFF } from "../shared/accessModel";
import { sha256Hex } from "./mcp/tokens";

const now = 1_000;
const clientId = "mcpc_test";
const grantId = "mcpg_test";
const token = "agbh_test";
const resource = "https://samebase.test/mcp";

async function seedGrant(args?: { approved?: boolean; scope?: string }) {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "handoff@example.test",
      isApproved: args?.approved ?? true,
      name: "Handoff User",
    });
    const organizationId = await ctx.db.insert("organizations", {});
    await ctx.db.insert("organizationMemberships", { organizationId, userId });
    await ctx.db.insert("mcpOauthClients", {
      clientId,
      clientName: "Test MCP client",
      redirectUris: ["http://127.0.0.1/callback"],
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "none",
      createdAt: now,
      updatedAt: now,
      createdBy: "dynamic_registration",
      registrationStatus: "active",
      metadataJson: "{}",
    });
    await ctx.db.insert("mcpGrants", {
      grantId,
      userId,
      organizationId,
      clientId,
      resource,
      scope: args?.scope ?? ACCESS_BROWSER_LOGIN_HANDOFF,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { organizationId, userId };
  });
  return { t, ids };
}

async function createHandoff(ids: { userId: Id<"users">; organizationId: Id<"organizations"> }) {
  return {
    tokenHash: await sha256Hex(token),
    userId: ids.userId,
    organizationId: ids.organizationId,
    grantId,
    clientId,
    createdAt: now,
    expiresAt: now + 60_000,
  };
}

describe("agent browser handoff lifecycle", () => {
  it("creates and consumes a one-time handoff for the MCP grant user", async () => {
    const { ids, t } = await seedGrant();
    const createArgs = await createHandoff(ids);

    await expect(
      t.mutation(internal.agentBrowserHandoff.createForMcp, createArgs),
    ).resolves.toEqual({
      ok: true,
    });

    await expect(
      t.mutation(internal.agentBrowserHandoff.redeemForAuth, {
        tokenHash: createArgs.tokenHash,
        now: now + 1,
      }),
    ).resolves.toEqual({
      ok: true,
      userId: ids.userId,
    });

    await expect(
      t.mutation(internal.agentBrowserHandoff.redeemForAuth, {
        tokenHash: createArgs.tokenHash,
        now: now + 2,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "consumed",
    });

    const snapshot = await t.run(async (ctx) => {
      const handoff = await ctx.db
        .query("mcpBrowserLoginTokens")
        .withIndex("by_token_hash", (q) => q.eq("tokenHash", createArgs.tokenHash))
        .unique();
      const audits = await ctx.db
        .query("audit_mcpAccess_events")
        .withIndex("by_grant_id", (q) => q.eq("grantId", grantId))
        .collect();
      return {
        handoff,
        audits,
      };
    });

    expect(snapshot.handoff?.consumedAt).toBe(now + 1);
    const creationAudit = snapshot.audits.find(
      (audit) => audit.action === "agent_browser_handoff_created",
    );
    expect(creationAudit).toBeDefined();
    expect(creationAudit).not.toHaveProperty("detailsJson");
    expect(snapshot.audits.map((audit) => audit.action)).toContain(
      "agent_browser_handoff_consumed",
    );
  });

  it("rejects creation when the grant lacks the browser handoff scope", async () => {
    const { ids, t } = await seedGrant({ scope: "access_dashboard" });

    await expect(
      t.mutation(internal.agentBrowserHandoff.createForMcp, await createHandoff(ids)),
    ).resolves.toEqual({
      ok: false,
      reason: "scope_missing",
    });
  });

  it("keeps handoffs bound to the exact grant user and prepared organization", async () => {
    const { ids, t } = await seedGrant();
    const prepared = await t.run(async (ctx) => {
      const otherOrganizationId = await ctx.db.insert("organizations", {});
      const otherUserId = await ctx.db.insert("users", {
        email: "other-handoff-user@example.test",
        isApproved: true,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: ids.organizationId,
        userId: otherUserId,
      });
      const grant = await ctx.db
        .query("mcpGrants")
        .withIndex("by_grant_id", (query) => query.eq("grantId", grantId))
        .unique();
      if (!grant) {
        throw new Error("Expected seeded grant.");
      }
      return { grantId: grant._id, otherOrganizationId, otherUserId };
    });

    await expect(
      t.mutation(internal.agentBrowserHandoff.createForMcp, {
        ...(await createHandoff(ids)),
        tokenHash: "organization_grant_handoff_hash",
      }),
    ).resolves.toEqual({ ok: true });

    await t.run(async (ctx) => {
      await ctx.db.patch(prepared.grantId, { organizationId: prepared.otherOrganizationId });
    });
    await expect(
      t.mutation(internal.agentBrowserHandoff.createForMcp, {
        ...(await createHandoff(ids)),
        tokenHash: "wrong_organization_handoff_hash",
      }),
    ).resolves.toEqual({ ok: false, reason: "grant_mismatch" });

    await t.run(async (ctx) => {
      await ctx.db.insert("mcpBrowserLoginTokens", {
        tokenHash: "wrong_organization_redeem_hash",
        userId: ids.userId,
        grantId,
        clientId,
        createdAt: now,
        expiresAt: now + 60_000,
      });
    });
    await expect(
      t.mutation(internal.agentBrowserHandoff.redeemForAuth, {
        tokenHash: "wrong_organization_redeem_hash",
        now: now + 1,
      }),
    ).resolves.toEqual({ ok: false, reason: "grant_mismatch" });

    await t.run(async (ctx) => {
      await ctx.db.patch(prepared.grantId, { organizationId: ids.organizationId });
    });
    await expect(
      t.mutation(
        internal.agentBrowserHandoff.createForMcp,
        await createHandoff({
          userId: prepared.otherUserId,
          organizationId: ids.organizationId,
        }),
      ),
    ).resolves.toEqual({ ok: false, reason: "grant_mismatch" });
  });

  it("limits handoff creation per grant within the five-minute window", async () => {
    const { ids, t } = await seedGrant();

    for (let index = 0; index < 10; index += 1) {
      await expect(
        t.mutation(internal.agentBrowserHandoff.createForMcp, {
          ...(await createHandoff(ids)),
          tokenHash: `handoff_hash_${index}`,
        }),
      ).resolves.toEqual({ ok: true });
    }

    await expect(
      t.mutation(internal.agentBrowserHandoff.createForMcp, {
        ...(await createHandoff(ids)),
        tokenHash: "handoff_hash_rate_limited",
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "rate_limited",
    });

    await expect(
      t.mutation(internal.agentBrowserHandoff.createForMcp, {
        ...(await createHandoff(ids)),
        tokenHash: "handoff_hash_next_window",
        createdAt: now + 5 * 60_000,
        expiresAt: now + 6 * 60_000,
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("rejects an unknown handoff token", async () => {
    const t = makeConvexTest();

    await expect(
      t.mutation(internal.agentBrowserHandoff.redeemForAuth, {
        tokenHash: await sha256Hex("agbh_missing"),
        now: now + 1,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });

    await expect(
      t.run(async (ctx) => await ctx.db.query("audit_mcpAccess_events").collect()),
    ).resolves.toHaveLength(0);
  });

  it("rejects an expired handoff token", async () => {
    const { ids, t } = await seedGrant();
    const createArgs = await createHandoff(ids);

    await expect(
      t.mutation(internal.agentBrowserHandoff.createForMcp, createArgs),
    ).resolves.toEqual({
      ok: true,
    });
    await expect(
      t.mutation(internal.agentBrowserHandoff.redeemForAuth, {
        tokenHash: createArgs.tokenHash,
        now: createArgs.expiresAt,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "expired",
    });
    await expect(
      t.mutation(internal.agentBrowserHandoff.redeemForAuth, {
        tokenHash: createArgs.tokenHash,
        now: createArgs.expiresAt + 1,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "consumed",
    });

    const audits = await t.run(
      async (ctx) =>
        await ctx.db
          .query("audit_mcpAccess_events")
          .withIndex("by_grant_id", (q) => q.eq("grantId", grantId))
          .collect(),
    );
    expect(
      audits.filter((audit) => audit.action === "agent_browser_handoff_rejected"),
    ).toHaveLength(1);
  });

  it("deletes an expired handoff when its cleanup job runs", async () => {
    const { ids, t } = await seedGrant();
    const createArgs = await createHandoff(ids);

    await expect(
      t.mutation(internal.agentBrowserHandoff.createForMcp, createArgs),
    ).resolves.toEqual({
      ok: true,
    });
    const handoffId = await t.run(async (ctx) => {
      const handoff = await ctx.db
        .query("mcpBrowserLoginTokens")
        .withIndex("by_token_hash", (q) => q.eq("tokenHash", createArgs.tokenHash))
        .unique();
      return handoff?._id ?? null;
    });
    expect(handoffId).not.toBeNull();
    if (handoffId === null) {
      throw new Error("Expected the handoff row to exist.");
    }

    await expect(
      t.mutation(internal.agentBrowserHandoff.deleteExpired, { handoffId }),
    ).resolves.toBeNull();
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("mcpBrowserLoginTokens")
            .withIndex("by_token_hash", (q) => q.eq("tokenHash", createArgs.tokenHash))
            .unique(),
      ),
    ).resolves.toBeNull();
  });

  it("consumes the handoff when the browser is signed in as a different user", async () => {
    const { ids, t } = await seedGrant();
    const otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "other@example.test",
        isApproved: true,
      });
    });
    const createArgs = await createHandoff(ids);

    await expect(
      t.mutation(internal.agentBrowserHandoff.createForMcp, createArgs),
    ).resolves.toEqual({
      ok: true,
    });
    await expect(
      t.mutation(internal.agentBrowserHandoff.redeemForAuth, {
        tokenHash: createArgs.tokenHash,
        now: now + 1,
        currentUserId: otherUserId,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "browser_user_mismatch",
    });
    await expect(
      t.mutation(internal.agentBrowserHandoff.redeemForAuth, {
        tokenHash: createArgs.tokenHash,
        now: now + 2,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "consumed",
    });
  });

  it("reuses the current auth session for the same signed-in user", async () => {
    const { ids, t } = await seedGrant();
    const sessionId = await t.run(async (ctx) => {
      return await ctx.db.insert("authSessions", {
        userId: ids.userId,
        expirationTime: now + 60_000,
      });
    });
    const createArgs = await createHandoff(ids);

    await expect(
      t.mutation(internal.agentBrowserHandoff.createForMcp, createArgs),
    ).resolves.toEqual({
      ok: true,
    });
    await expect(
      t.mutation(internal.agentBrowserHandoff.redeemForAuth, {
        tokenHash: createArgs.tokenHash,
        now: now + 1,
        currentUserId: ids.userId,
        currentSessionId: sessionId,
      }),
    ).resolves.toEqual({
      ok: true,
      userId: ids.userId,
      sessionId,
    });
  });
});
