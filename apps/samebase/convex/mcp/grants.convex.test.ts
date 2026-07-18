import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";

const now = 10_000;
const resource = "https://api.samebase.test/mcp";

type ConvexTest = ReturnType<typeof makeConvexTest>;

function asUser(t: ConvexTest, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

async function seedGrants() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      email: "owner@example.test",
      isApproved: true,
      name: "Owner",
    });
    const otherUserId = await ctx.db.insert("users", {
      email: "other@example.test",
      isApproved: true,
      name: "Other",
    });
    await ctx.db.insert("mcpOauthClients", {
      clientId: "mcpc_named",
      clientName: "Codex",
      createdAt: now,
      createdBy: "dynamic_registration",
      grantTypes: ["authorization_code", "refresh_token"],
      metadataJson: "{}",
      redirectUris: ["http://127.0.0.1/callback"],
      registrationStatus: "active",
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "none",
      updatedAt: now,
    });
    await ctx.db.insert("mcpOauthClients", {
      clientId: "mcpc_unnamed",
      createdAt: now,
      createdBy: "dynamic_registration",
      grantTypes: ["authorization_code", "refresh_token"],
      metadataJson: "{}",
      redirectUris: ["http://127.0.0.1/callback"],
      registrationStatus: "active",
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "none",
      updatedAt: now,
    });

    await ctx.db.insert("mcpGrants", {
      clientId: "mcpc_named",
      createdAt: now,
      grantId: "mcpg_older",
      lastUsedAt: now + 5,
      resource,
      scope: "access_dashboard access_browser_login_handoff",
      status: "active",
      updatedAt: now + 5,
      userId: ownerId,
    });
    await ctx.db.insert("mcpGrants", {
      clientId: "mcpc_unnamed",
      createdAt: now + 1,
      grantId: "mcpg_newer",
      resource,
      scope: "access_dashboard",
      status: "active",
      updatedAt: now + 1,
      userId: ownerId,
    });
    await ctx.db.insert("mcpGrants", {
      clientId: "mcpc_named",
      createdAt: now + 2,
      grantId: "mcpg_revoked",
      resource,
      scope: "access_dashboard",
      status: "revoked",
      updatedAt: now + 2,
      userId: ownerId,
    });
    await ctx.db.insert("mcpGrants", {
      clientId: "mcpc_named",
      createdAt: now + 3,
      grantId: "mcpg_other",
      resource,
      scope: "access_dashboard",
      status: "active",
      updatedAt: now + 3,
      userId: otherUserId,
    });

    return { otherUserId, ownerId };
  });
  return { ids, t };
}

describe("MCP grant management", () => {
  it("paginates only the current user's active grants in newest-first order", async () => {
    const { ids, t } = await seedGrants();
    const owner = asUser(t, ids.ownerId);

    const firstPage = await owner.query(api.mcp.grants.listCurrentUserGrants, {
      paginationOpts: { cursor: null, numItems: 1 },
    });
    expect(firstPage.page).toEqual([
      {
        clientId: "mcpc_unnamed",
        createdAt: now + 1,
        grantId: "mcpg_newer",
        resource,
        scopes: ["access_dashboard"],
      },
    ]);
    expect(firstPage.isDone).toBe(false);

    const secondPage = await owner.query(api.mcp.grants.listCurrentUserGrants, {
      paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 },
    });
    expect(secondPage.page).toEqual([
      {
        clientId: "mcpc_named",
        clientName: "Codex",
        createdAt: now,
        grantId: "mcpg_older",
        lastUsedAt: now + 5,
        resource,
        scopes: ["access_dashboard", "access_browser_login_handoff"],
      },
    ]);
    expect(secondPage.isDone).toBe(true);
  });

  it("lets only the owner revoke a grant and audits the transition once", async () => {
    const { ids, t } = await seedGrants();
    const owner = asUser(t, ids.ownerId);
    const other = asUser(t, ids.otherUserId);

    await expect(
      other.mutation(api.mcp.grants.revokeCurrentUserGrant, { grantId: "mcpg_older" }),
    ).rejects.toThrow("MCP client connection was not found.");

    await expect(
      owner.mutation(api.mcp.grants.revokeCurrentUserGrant, { grantId: "mcpg_older" }),
    ).resolves.toEqual({ revoked: true });
    await expect(
      owner.mutation(api.mcp.grants.revokeCurrentUserGrant, { grantId: "mcpg_older" }),
    ).resolves.toEqual({ revoked: false });

    const state = await t.run(async (ctx) => {
      const grant = await ctx.db
        .query("mcpGrants")
        .withIndex("by_grant_id", (q) => q.eq("grantId", "mcpg_older"))
        .unique();
      const audits = await ctx.db
        .query("audit_mcpAccessEvents")
        .withIndex("by_grant_id", (q) => q.eq("grantId", "mcpg_older"))
        .collect();
      return { audits, grant };
    });
    expect(state.grant?.status).toBe("revoked");
    expect(state.audits).toMatchObject([
      {
        action: "grant_revoked",
        clientId: "mcpc_named",
        detailsJson: '{"source":"user"}',
        grantId: "mcpg_older",
        userId: ids.ownerId,
      },
    ]);
  });

  it("blocks every credential derived from a revoked grant immediately", async () => {
    const { ids, t } = await seedGrants();
    const owner = asUser(t, ids.ownerId);
    await t.run(async (ctx) => {
      await ctx.db.insert("operations_mcpAccessTokens", {
        clientId: "mcpc_named",
        createdAt: now,
        expiresAt: now + 60_000,
        grantId: "mcpg_older",
        resource,
        scope: "access_dashboard access_browser_login_handoff",
        tokenHash: "access_hash",
        userId: ids.ownerId,
      });
      await ctx.db.insert("operations_mcpRefreshTokens", {
        clientId: "mcpc_named",
        createdAt: now,
        expiresAt: now + 60_000,
        grantId: "mcpg_older",
        status: "active",
        tokenHash: "refresh_hash",
        userId: ids.ownerId,
      });
      await ctx.db.insert("operations_mcpBrowserLoginHandoffs", {
        clientId: "mcpc_named",
        createdAt: now,
        expiresAt: now + 60_000,
        grantId: "mcpg_older",
        tokenHash: "handoff_hash",
        userId: ids.ownerId,
      });
    });

    await owner.mutation(api.mcp.grants.revokeCurrentUserGrant, { grantId: "mcpg_older" });

    await expect(
      t.mutation(internal.mcp.oauth.validateAccessToken, {
        now: now + 1,
        tokenHash: "access_hash",
      }),
    ).resolves.toMatchObject({
      error: "invalid_token",
      errorDescription: "Grant is no longer active.",
      ok: false,
      status: 401,
    });
    await expect(
      t.mutation(internal.mcp.oauth.exchangeRefreshToken, {
        accessTokenExpiresAt: now + 60_000,
        accessTokenHash: "unused_access_hash",
        clientId: "mcpc_named",
        newRefreshTokenHash: "unused_refresh_hash",
        now: now + 1,
        refreshTokenExpiresAt: now + 60_000,
        refreshTokenHash: "refresh_hash",
      }),
    ).resolves.toMatchObject({
      error: "invalid_grant",
      errorDescription: "Grant is no longer active.",
      ok: false,
      status: 400,
    });
    await expect(
      t.mutation(internal.agentBrowserHandoff.redeemForAuth, {
        now: now + 1,
        tokenHash: "handoff_hash",
      }),
    ).resolves.toEqual({ ok: false, reason: "grant_inactive" });
  });
});
