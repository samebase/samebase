import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createCodeChallenge } from "../oauthUtils";
import { makeConvexTest } from "../test.setup";

const now = 1_000;
const clientId = "mcpc_refresh_replay";
const grantId = "mcpg_refresh_replay";
const resource = "https://samebase.test/mcp";
const scope = "access_dashboard";
const initialRefreshTokenHash = "refresh_hash_initial";

const inactiveRefreshTokenError = {
  ok: false,
  status: 400,
  error: "invalid_grant",
  errorDescription: "Refresh token is no longer active.",
};

const inactiveGrantError = {
  ok: false,
  status: 400,
  error: "invalid_grant",
  errorDescription: "Grant is no longer active.",
};

function successfulExchange(userId: Id<"users">) {
  return {
    ok: true,
    grantId,
    userId,
    clientId,
    scope,
    resource,
    refreshTokenIssued: true,
  };
}

async function seedRefreshTokenFamily() {
  const t = makeConvexTest();
  const userId = await t.run(async (ctx) => {
    const seededUserId = await ctx.db.insert("users", {
      email: "refresh-replay@example.test",
      isApproved: true,
      name: "Refresh Replay User",
    });
    await ctx.db.insert("mcpOauthClients", {
      clientId,
      clientName: "Refresh replay client",
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
      userId: seededUserId,
      clientId,
      resource,
      scope,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("operations_mcpRefreshTokens", {
      grantId,
      clientId,
      userId: seededUserId,
      tokenHash: initialRefreshTokenHash,
      status: "active",
      createdAt: now,
      expiresAt: now + 60_000,
    });
    return seededUserId;
  });

  const exchange = async (args: {
    refreshTokenHash: string;
    newRefreshTokenHash: string;
    accessTokenHash: string;
    now: number;
  }) => {
    return await t.mutation(internal.mcp.oauth.exchangeRefreshToken, {
      ...args,
      clientId,
      accessTokenExpiresAt: args.now + 60_000,
      refreshTokenExpiresAt: args.now + 60_000,
    });
  };

  const readContainmentState = async () => {
    return await t.run(async (ctx) => {
      const grant = await ctx.db
        .query("mcpGrants")
        .withIndex("by_grant_id", (q) => q.eq("grantId", grantId))
        .unique();
      const refreshTokens = await ctx.db
        .query("operations_mcpRefreshTokens")
        .withIndex("by_grant_id", (q) => q.eq("grantId", grantId))
        .collect();
      const accessTokens = await ctx.db
        .query("operations_mcpAccessTokens")
        .withIndex("by_grant_id", (q) => q.eq("grantId", grantId))
        .collect();
      const audits = await ctx.db
        .query("audit_mcpAccessEvents")
        .withIndex("by_grant_id", (q) => q.eq("grantId", grantId))
        .collect();

      return {
        accessTokenCount: accessTokens.length,
        grant: grant && {
          lastUsedAt: grant.lastUsedAt,
          status: grant.status,
          updatedAt: grant.updatedAt,
        },
        refreshTokens: refreshTokens.map((token) => ({
          status: token.status,
          tokenHash: token.tokenHash,
        })),
        replayAudits: audits
          .filter((audit) => audit.action === "refresh_token_replay_detected")
          .map((audit) => ({
            createdAt: audit.createdAt,
            detailsJson: audit.detailsJson,
          })),
      };
    });
  };

  const readDatabaseState = async () => {
    return await t.run(async (ctx) => ({
      clients: await ctx.db.query("mcpOauthClients").collect(),
      grants: await ctx.db.query("mcpGrants").collect(),
      refreshTokens: await ctx.db.query("operations_mcpRefreshTokens").collect(),
      accessTokens: await ctx.db.query("operations_mcpAccessTokens").collect(),
      audits: await ctx.db.query("audit_mcpAccessEvents").collect(),
    }));
  };

  return { exchange, readContainmentState, readDatabaseState, userId };
}

describe("MCP OAuth refresh token replay", () => {
  it("revokes the grant once without walking the replacement chain", async () => {
    const { exchange, readContainmentState, readDatabaseState, userId } =
      await seedRefreshTokenFamily();

    await expect(
      exchange({
        refreshTokenHash: initialRefreshTokenHash,
        newRefreshTokenHash: "refresh_hash_descendant_1",
        accessTokenHash: "access_hash_1",
        now: now + 1,
      }),
    ).resolves.toEqual(successfulExchange(userId));
    await expect(
      exchange({
        refreshTokenHash: "refresh_hash_descendant_1",
        newRefreshTokenHash: "refresh_hash_descendant_2",
        accessTokenHash: "access_hash_2",
        now: now + 2,
      }),
    ).resolves.toEqual(successfulExchange(userId));

    await expect(
      exchange({
        refreshTokenHash: initialRefreshTokenHash,
        newRefreshTokenHash: "refresh_hash_replay_unused",
        accessTokenHash: "access_hash_replay_unused",
        now: now + 3,
      }),
    ).resolves.toEqual(inactiveRefreshTokenError);

    await expect(readContainmentState()).resolves.toEqual({
      accessTokenCount: 2,
      grant: {
        lastUsedAt: now + 2,
        status: "revoked",
        updatedAt: now + 3,
      },
      refreshTokens: [
        { status: "rotated", tokenHash: initialRefreshTokenHash },
        { status: "rotated", tokenHash: "refresh_hash_descendant_1" },
        { status: "active", tokenHash: "refresh_hash_descendant_2" },
      ],
      replayAudits: [
        {
          createdAt: now + 3,
          detailsJson: '{"outcome":"grant_revoked"}',
        },
      ],
    });

    const containedState = await readDatabaseState();
    await expect(
      exchange({
        refreshTokenHash: initialRefreshTokenHash,
        newRefreshTokenHash: "refresh_hash_repeated_replay_unused",
        accessTokenHash: "access_hash_repeated_replay_unused",
        now: now + 4,
      }),
    ).resolves.toEqual(inactiveRefreshTokenError);
    await expect(readDatabaseState()).resolves.toEqual(containedState);

    await expect(
      exchange({
        refreshTokenHash: "refresh_hash_descendant_2",
        newRefreshTokenHash: "refresh_hash_descendant_3_unused",
        accessTokenHash: "access_hash_3_unused",
        now: now + 5,
      }),
    ).resolves.toEqual(inactiveGrantError);
    await expect(readDatabaseState()).resolves.toEqual(containedState);
  });

  it("does not write for an unknown refresh token", async () => {
    const { exchange, readDatabaseState } = await seedRefreshTokenFamily();
    const before = await readDatabaseState();

    await expect(
      exchange({
        refreshTokenHash: "refresh_hash_unknown",
        newRefreshTokenHash: "refresh_hash_unknown_replacement_unused",
        accessTokenHash: "access_hash_unknown_unused",
        now: now + 1,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: "invalid_grant",
      errorDescription: "Refresh token is invalid.",
    });

    await expect(readDatabaseState()).resolves.toEqual(before);
  });
});

describe("MCP OAuth account deletion access", () => {
  it("does not create authenticated authorization requests for deleting or missing users", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const deletingUserId = await ctx.db.insert("users", {
        email: "deleting-auth-request@example.test",
        isApproved: true,
      });
      const missingUserId = await ctx.db.insert("users", {
        email: "missing-auth-request@example.test",
        isApproved: true,
      });
      const initiatingSessionId = await ctx.db.insert("authSessions", {
        userId: deletingUserId,
        expirationTime: now + 60_000,
      });
      const runId = await ctx.db.insert("operations_accountDeletionRuns", {
        identity: {
          state: "active",
          userId: deletingUserId,
          email: "deleting-auth-request@example.test",
        },
        completionCapability: "mcp-auth-request-test",
        state: "running",
        workflow: { state: "started", workflowId: "mcp-auth-request-test", attempt: 1 },
        currentStep: "revoke_access",
        requestedAt: now,
        updatedAt: now,
        initiatingSessionId,
        retryCount: 0,
        outcomes: {
          billing: { state: "not_started" },
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
      });
      await ctx.db.patch(deletingUserId, {
        accountDeletion: { state: "deleting", runId, requestedAt: now },
      });
      await ctx.db.delete(missingUserId);
      return { deletingUserId, missingUserId };
    });
    const createArgs = {
      clientId,
      redirectUri: "http://127.0.0.1/callback",
      resource,
      scope,
      codeChallenge: "unused-code-challenge",
      codeChallengeMethod: "S256" as const,
      createdAt: now,
      expiresAt: now + 60_000,
    };

    for (const [requestId, userId] of [
      ["mcpar_deleting_auth_request", ids.deletingUserId],
      ["mcpar_missing_auth_request", ids.missingUserId],
    ] as const) {
      await expect(
        t.mutation(internal.mcp.oauth.createAuthRequest, {
          ...createArgs,
          requestId,
          userId,
        }),
      ).rejects.toThrow("Account deletion is in progress.");
    }

    await expect(
      t.mutation(internal.mcp.oauth.createAuthRequest, {
        ...createArgs,
        requestId: "mcpar_anonymous_auth_request",
      }),
    ).resolves.toBeDefined();
    await expect(
      t.run(async (ctx) => await ctx.db.query("operations_mcpAuthRequests").collect()),
    ).resolves.toHaveLength(1);
  });

  it("does not issue authorization codes for deleting or missing users", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const deletingUserId = await ctx.db.insert("users", {
        email: "deleting-code-owner@example.test",
        isApproved: true,
      });
      const missingUserId = await ctx.db.insert("users", {
        email: "missing-code-owner@example.test",
        isApproved: true,
      });
      const initiatingSessionId = await ctx.db.insert("authSessions", {
        userId: deletingUserId,
        expirationTime: now + 60_000,
      });
      const runId = await ctx.db.insert("operations_accountDeletionRuns", {
        identity: {
          state: "active",
          userId: deletingUserId,
          email: "deleting-code-owner@example.test",
        },
        completionCapability: "mcp-code-owner-test",
        state: "running",
        workflow: { state: "started", workflowId: "mcp-code-deletion-test", attempt: 1 },
        currentStep: "revoke_access",
        requestedAt: now,
        updatedAt: now,
        initiatingSessionId,
        retryCount: 0,
        outcomes: {
          billing: { state: "not_started" },
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
      });
      await ctx.db.patch(deletingUserId, {
        accountDeletion: { state: "deleting", runId, requestedAt: now },
      });
      await ctx.db.insert("mcpOauthClients", {
        clientId,
        clientName: "Authorization code deletion client",
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
      for (const authRequest of [
        { requestId: "mcpar_deleting_code_owner", userId: deletingUserId },
        { requestId: "mcpar_missing_code_owner", userId: missingUserId },
      ]) {
        await ctx.db.insert("operations_mcpAuthRequests", {
          requestId: authRequest.requestId,
          clientId,
          redirectUri: "http://127.0.0.1/callback",
          resource,
          scope,
          codeChallenge: "unused-code-challenge",
          codeChallengeMethod: "S256",
          userId: authRequest.userId,
          status: "pending",
          createdAt: now,
          expiresAt: now + 60_000,
        });
      }
      await ctx.db.delete(missingUserId);
      return { deletingUserId, missingUserId };
    });

    const readIssuanceState = async () => {
      return await t.run(async (ctx) => ({
        accessAudits: await ctx.db.query("audit_mcpAccessEvents").collect(),
        authRequests: await ctx.db.query("operations_mcpAuthRequests").collect(),
        authorizationCodes: await ctx.db.query("operations_mcpAuthorizationCodes").collect(),
        grants: await ctx.db.query("mcpGrants").collect(),
      }));
    };
    const before = await readIssuanceState();

    for (const request of [
      { requestId: "mcpar_deleting_code_owner", userId: ids.deletingUserId },
      { requestId: "mcpar_missing_code_owner", userId: ids.missingUserId },
    ]) {
      await expect(
        t.mutation(internal.mcp.oauth.issueAuthorizationCodeForAuthRequest, {
          requestId: request.requestId,
          userId: request.userId,
          codeHash: `${request.requestId}_code_hash`,
          codeExpiresAt: now + 60_000,
          now: now + 1,
        }),
      ).resolves.toEqual(inactiveGrantError);
    }

    await expect(readIssuanceState()).resolves.toEqual(before);
  });

  it("rejects every existing MCP credential without rotating or recording usage", async () => {
    const t = makeConvexTest();
    const codeVerifier = "account-deletion-code-verifier";
    const codeChallenge = await createCodeChallenge(codeVerifier);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "deleting-mcp@example.test",
        isApproved: true,
      });
      const initiatingSessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: now + 60_000,
      });
      const runId = await ctx.db.insert("operations_accountDeletionRuns", {
        identity: { state: "active", userId, email: "deleting-mcp@example.test" },
        completionCapability: "mcp-deletion-test",
        state: "running",
        workflow: { state: "started", workflowId: "mcp-deletion-test", attempt: 1 },
        currentStep: "revoke_access",
        requestedAt: now,
        updatedAt: now,
        initiatingSessionId,
        retryCount: 0,
        outcomes: {
          billing: { state: "not_started" },
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
      });
      await ctx.db.patch(userId, {
        accountDeletion: { state: "deleting", runId, requestedAt: now },
      });

      await ctx.db.insert("mcpOauthClients", {
        clientId,
        clientName: "Deleting user client",
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
      await ctx.db.insert("operations_mcpAuthRequests", {
        requestId: "mcpar_deleting_user",
        clientId,
        redirectUri: "http://127.0.0.1/callback",
        resource,
        scope,
        state: "state",
        codeChallenge,
        codeChallengeMethod: "S256",
        userId,
        status: "approved",
        createdAt: now,
        expiresAt: now + 60_000,
      });
      await ctx.db.insert("mcpGrants", {
        grantId,
        userId,
        clientId,
        resource,
        scope,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("operations_mcpAuthorizationCodes", {
        codeHash: "authorization_code_hash",
        requestId: "mcpar_deleting_user",
        grantId,
        clientId,
        userId,
        redirectUri: "http://127.0.0.1/callback",
        resource,
        scope,
        expiresAt: now + 60_000,
      });
      await ctx.db.insert("operations_mcpRefreshTokens", {
        grantId,
        clientId,
        userId,
        tokenHash: "deleting_refresh_token_hash",
        status: "active",
        createdAt: now,
        expiresAt: now + 60_000,
      });
      await ctx.db.insert("operations_mcpAccessTokens", {
        grantId,
        clientId,
        userId,
        tokenHash: "deleting_access_token_hash",
        resource,
        scope,
        createdAt: now,
        expiresAt: now + 60_000,
      });
    });

    const readCredentialState = async () => {
      return await t.run(async (ctx) => ({
        accessTokens: await ctx.db.query("operations_mcpAccessTokens").collect(),
        authorizationCodes: await ctx.db.query("operations_mcpAuthorizationCodes").collect(),
        audits: await ctx.db.query("audit_mcpAccessEvents").collect(),
        grants: await ctx.db.query("mcpGrants").collect(),
        refreshTokens: await ctx.db.query("operations_mcpRefreshTokens").collect(),
      }));
    };
    const before = await readCredentialState();

    await expect(
      t.mutation(internal.mcp.oauth.exchangeAuthorizationCode, {
        codeHash: "authorization_code_hash",
        clientId,
        redirectUri: "http://127.0.0.1/callback",
        codeVerifier,
        accessTokenHash: "unused_access_token_hash",
        refreshTokenHash: "unused_refresh_token_hash",
        accessTokenExpiresAt: now + 60_000,
        refreshTokenExpiresAt: now + 60_000,
        now: now + 1,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: "invalid_grant",
      errorDescription: "Grant is no longer active.",
    });
    await expect(
      t.mutation(internal.mcp.oauth.exchangeRefreshToken, {
        refreshTokenHash: "deleting_refresh_token_hash",
        clientId,
        accessTokenHash: "unused_refresh_access_token_hash",
        newRefreshTokenHash: "unused_rotated_refresh_token_hash",
        accessTokenExpiresAt: now + 60_000,
        refreshTokenExpiresAt: now + 60_000,
        now: now + 1,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: "invalid_grant",
      errorDescription: "Grant is no longer active.",
    });
    await expect(
      t.mutation(internal.mcp.oauth.validateAccessToken, {
        tokenHash: "deleting_access_token_hash",
        now: now + 1,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 401,
      error: "invalid_token",
      errorDescription: "Grant is no longer active.",
    });
    await expect(readCredentialState()).resolves.toEqual(before);
  });
});
