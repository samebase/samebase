import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

const now = 10_000;
const resource = "https://api.samebase.test/mcp";

describe("MCP organization grants", () => {
  it("binds consent to one current membership and rejects the token after membership removal", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "owner@example.test",
        isApproved: true,
        name: "Owner",
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubInstallationId: "installation_allowed",
        githubOwnerId: "owner_allowed",
        githubOwnerLogin: "allowed-owner",
        githubOwnerLoginNormalized: "allowed-owner",
        githubOwnerType: "organization",
      });
      const otherOrganizationId = await ctx.db.insert("organizations", {
        githubInstallationId: "installation_denied",
        githubOwnerId: "owner_denied",
        githubOwnerLogin: "denied-owner",
        githubOwnerLoginNormalized: "denied-owner",
        githubOwnerType: "organization",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
      });
      await ctx.db.insert("mcpOauthClients", {
        clientId: "client_test",
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
      await ctx.db.insert("mcpAuthorizationRequests", {
        clientId: "client_test",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        createdAt: now,
        expiresAt: now + 60_000,
        redirectUri: "http://127.0.0.1/callback",
        requestId: "request_test",
        resource,
        scope: "access_dashboard",
        status: "pending",
        userId,
      });

      return { organizationId, otherOrganizationId, userId };
    });

    await expect(
      t.mutation(internal.mcp.oauth.issueAuthorizationCodeForAuthRequest, {
        allowLoopbackHttpRedirectUris: true,
        codeExpiresAt: now + 60_000,
        codeHash: "denied_code_hash",
        now,
        organizationId: ids.otherOrganizationId,
        requestId: "request_test",
        userId: ids.userId,
      }),
    ).resolves.toMatchObject({
      error: "access_denied",
      ok: false,
      status: 403,
    });

    await expect(
      t.mutation(internal.mcp.oauth.issueAuthorizationCodeForAuthRequest, {
        allowLoopbackHttpRedirectUris: true,
        codeExpiresAt: now + 60_000,
        codeHash: "allowed_code_hash",
        now,
        organizationId: ids.organizationId,
        requestId: "request_test",
        userId: ids.userId,
      }),
    ).resolves.toMatchObject({ ok: true });

    const grant = await t.run(async (ctx) => {
      const activeGrant = await ctx.db
        .query("mcpGrants")
        .withIndex("by_user_id_and_status", (query) =>
          query.eq("userId", ids.userId).eq("status", "active"),
        )
        .unique();
      if (activeGrant === null) {
        throw new Error("Expected an active MCP grant.");
      }

      await ctx.db.insert("mcpAccessTokens", {
        clientId: activeGrant.clientId,
        createdAt: now,
        expiresAt: now + 60_000,
        grantId: activeGrant.grantId,
        resource: activeGrant.resource,
        scope: activeGrant.scope,
        tokenHash: "access_hash",
        userId: activeGrant.userId,
      });
      return activeGrant;
    });
    expect(grant.organizationId).toBe(ids.organizationId);

    await expect(
      t.mutation(internal.mcp.oauth.validateAccessToken, {
        now: now + 1,
        tokenHash: "access_hash",
      }),
    ).resolves.toMatchObject({
      ok: true,
      organizationId: ids.organizationId,
    });

    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", ids.organizationId).eq("userId", ids.userId),
        )
        .unique();
      if (membership === null) {
        throw new Error("Expected an organization membership.");
      }
      await ctx.db.delete(membership._id);
    });

    await expect(
      t.mutation(internal.mcp.oauth.validateAccessToken, {
        now: now + 2,
        tokenHash: "access_hash",
      }),
    ).resolves.toMatchObject({
      error: "invalid_token",
      errorDescription: "Grant is no longer active.",
      ok: false,
      status: 401,
    });
  });
});
