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
    const ownerOrganizationId = await ctx.db.insert("organizations", { name: "Owner" });
    const otherOrganizationId = await ctx.db.insert("organizations", { name: "Other" });
    await ctx.db.insert("organizationMemberships", {
      organizationId: ownerOrganizationId,
      userId: ownerId,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId: otherOrganizationId,
      userId: otherUserId,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId: otherOrganizationId,
      userId: ownerId,
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
      organizationId: ownerOrganizationId,
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
      organizationId: ownerOrganizationId,
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
      organizationId: ownerOrganizationId,
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
      organizationId: otherOrganizationId,
      resource,
      scope: "access_dashboard",
      status: "active",
      updatedAt: now + 3,
      userId: otherUserId,
    });

    return { otherOrganizationId, otherUserId, ownerId, ownerOrganizationId };
  });
  return { ids, t };
}

describe("MCP grant management", () => {
  it("paginates only the selected organization's active grants in newest-first order", async () => {
    const { ids, t } = await seedGrants();
    const owner = asUser(t, ids.ownerId);

    const firstPage = await owner.query(api.mcp.grants.listCurrentUserGrants, {
      organizationId: ids.ownerOrganizationId,
      paginationOpts: { cursor: null, numItems: 1 },
    });
    expect(firstPage.page).toEqual([
      {
        clientId: "mcpc_unnamed",
        createdAt: now + 1,
        grantId: "mcpg_newer",
        organizationId: ids.ownerOrganizationId,
        resource,
        scopes: ["access_dashboard"],
      },
    ]);
    expect(firstPage.isDone).toBe(false);

    const secondPage = await owner.query(api.mcp.grants.listCurrentUserGrants, {
      organizationId: ids.ownerOrganizationId,
      paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 },
    });
    expect(secondPage.page).toEqual([
      {
        clientId: "mcpc_named",
        clientName: "Codex",
        createdAt: now,
        grantId: "mcpg_older",
        lastUsedAt: now + 5,
        organizationId: ids.ownerOrganizationId,
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
        .query("audit_mcpAccess_events")
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

  it("uses explicit selection for lists and the grant organization for revoke", async () => {
    const { ids, t } = await seedGrants();
    const owner = asUser(t, ids.ownerId);
    await t.run(async (ctx) => {
      const newerGrant = await ctx.db
        .query("mcpGrants")
        .withIndex("by_grant_id", (query) => query.eq("grantId", "mcpg_newer"))
        .unique();
      const otherUserGrant = await ctx.db
        .query("mcpGrants")
        .withIndex("by_grant_id", (query) => query.eq("grantId", "mcpg_other"))
        .unique();
      if (!newerGrant || !otherUserGrant) {
        throw new Error("Expected seeded grants.");
      }
      await ctx.db.patch(newerGrant._id, { organizationId: ids.otherOrganizationId });
      await ctx.db.patch(otherUserGrant._id, { organizationId: ids.ownerOrganizationId });
    });

    const grants = await owner.query(api.mcp.grants.listCurrentUserGrants, {
      organizationId: ids.ownerOrganizationId,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(grants.page.map((grant) => grant.grantId)).toEqual(["mcpg_older"]);

    const otherOrganizationGrants = await owner.query(api.mcp.grants.listCurrentUserGrants, {
      organizationId: ids.otherOrganizationId,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(otherOrganizationGrants.page.map((grant) => grant.grantId)).toEqual(["mcpg_newer"]);

    await expect(
      owner.mutation(api.mcp.grants.revokeCurrentUserGrant, { grantId: "mcpg_newer" }),
    ).resolves.toEqual({ revoked: true });
    await expect(
      owner.mutation(api.mcp.grants.revokeCurrentUserGrant, { grantId: "mcpg_other" }),
    ).rejects.toThrow("MCP client connection was not found.");
  });

  it("blocks every credential derived from a revoked grant immediately", async () => {
    const { ids, t } = await seedGrants();
    const owner = asUser(t, ids.ownerId);
    await t.run(async (ctx) => {
      await ctx.db.insert("mcpAccessTokens", {
        clientId: "mcpc_named",
        createdAt: now,
        expiresAt: now + 60_000,
        grantId: "mcpg_older",
        resource,
        scope: "access_dashboard access_browser_login_handoff",
        tokenHash: "access_hash",
        userId: ids.ownerId,
      });
      await ctx.db.insert("mcpRefreshTokens", {
        clientId: "mcpc_named",
        createdAt: now,
        expiresAt: now + 60_000,
        grantId: "mcpg_older",
        status: "active",
        tokenHash: "refresh_hash",
        userId: ids.ownerId,
      });
      await ctx.db.insert("mcpBrowserLoginTokens", {
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
