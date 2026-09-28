import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createCodeChallenge } from "../lib/oauth";
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
  const ids = await t.run(async (ctx) => {
    const seededUserId = await ctx.db.insert("users", {
      state: "active",
      email: "refresh-replay@example.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
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
    await ctx.db.insert("mcpRefreshTokens", {
      grantId,
      clientId,
      userId: seededUserId,
      tokenHash: initialRefreshTokenHash,
      status: "active",
      createdAt: now,
      expiresAt: now + 60_000,
    });
    return { userId: seededUserId };
  });

  const exchange = async (args: {
    refreshTokenHash: string;
    newRefreshTokenHash: string;
    accessTokenHash: string;
    now: number;
    requestedResource?: string;
  }) => {
    const { requestedResource, ...exchangeArgs } = args;
    return await t.mutation(internal.mcp.oauth.exchangeRefreshToken, {
      ...exchangeArgs,
      clientId,
      resource: requestedResource ?? resource,
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
        .query("mcpRefreshTokens")
        .withIndex("by_grant_id", (q) => q.eq("grantId", grantId))
        .collect();
      const accessTokens = await ctx.db
        .query("mcpAccessTokens")
        .withIndex("by_grant_id", (q) => q.eq("grantId", grantId))
        .collect();
      const audits = await ctx.db
        .query("audit_mcpAccess_events")
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
      refreshTokens: await ctx.db.query("mcpRefreshTokens").collect(),
      accessTokens: await ctx.db.query("mcpAccessTokens").collect(),
      audits: await ctx.db.query("audit_mcpAccess_events").collect(),
    }));
  };

  return { exchange, readContainmentState, readDatabaseState, ...ids };
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

  it("does not rotate a refresh token for a different resource", async () => {
    const { exchange, readDatabaseState } = await seedRefreshTokenFamily();
    const before = await readDatabaseState();

    await expect(
      exchange({
        refreshTokenHash: initialRefreshTokenHash,
        newRefreshTokenHash: "refresh_hash_wrong_resource_unused",
        accessTokenHash: "access_hash_wrong_resource_unused",
        now: now + 1,
        requestedResource: "https://other.example/mcp",
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: "invalid_target",
      errorDescription: "resource does not match the authorization grant.",
    });

    await expect(readDatabaseState()).resolves.toEqual(before);
  });
});

describe("MCP OAuth token resource binding", () => {
  it("does not redeem an authorization code for a different resource", async () => {
    const t = makeConvexTest();
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "authorization-code-resource@example.test",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      await ctx.db.insert("mcpAuthorizationCodes", {
        codeHash: "resource_bound_code_hash",
        requestId: "mcpar_resource_bound_code",
        grantId: "mcpg_resource_bound_code",
        clientId,
        userId,
        redirectUri: "http://127.0.0.1/callback",
        resource,
        scope,
        expiresAt: now + 60_000,
      });
    });
    const before = await t.run(
      async (ctx) => await ctx.db.query("mcpAuthorizationCodes").collect(),
    );

    await expect(
      t.mutation(internal.mcp.oauth.exchangeAuthorizationCode, {
        codeHash: "resource_bound_code_hash",
        clientId,
        redirectUri: "http://127.0.0.1/callback",
        resource: "https://other.example/mcp",
        codeVerifier: "unused-code-verifier",
        accessTokenHash: "unused-access-token-hash",
        refreshTokenHash: "unused-refresh-token-hash",
        accessTokenExpiresAt: now + 60_000,
        refreshTokenExpiresAt: now + 60_000,
        now: now + 1,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: "invalid_target",
      errorDescription: "resource does not match the authorization code.",
    });

    await expect(
      t.run(async (ctx) => await ctx.db.query("mcpAuthorizationCodes").collect()),
    ).resolves.toEqual(before);
  });
});

describe("MCP OAuth authorization request boundaries", () => {
  it("does not recreate a revoked grant on the no-consent path", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "revoked-grant@example.test",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      await ctx.db.insert("mcpOauthClients", {
        clientId,
        clientName: "Revoked grant client",
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
      await ctx.db.insert("mcpAuthorizationRequests", {
        requestId: "mcpar_revoked_grant",
        clientId,
        redirectUri: "http://127.0.0.1/callback",
        resource,
        scope,
        codeChallenge: "unused-code-challenge",
        codeChallengeMethod: "S256",
        userId,
        status: "pending",
        createdAt: now,
        expiresAt: now + 60_000,
      });
      await ctx.db.insert("mcpGrants", {
        grantId,
        userId,
        clientId,
        resource,
        scope,
        status: "revoked",
        createdAt: now,
        updatedAt: now,
      });
      return userId;
    });

    await expect(
      t.mutation(internal.mcp.oauth.issueAuthorizationCodeForAuthRequest, {
        requestId: "mcpar_revoked_grant",
        userId,
        codeHash: "unused-code-hash",
        codeExpiresAt: now + 60_000,
        grantMode: "reuse_only",
        allowLoopbackHttpRedirectUris: true,
        now: now + 1,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: "consent_required",
      errorDescription: "Authorization consent is required.",
    });
    await expect(
      t.run(async (ctx) => ({
        authorizationCodes: await ctx.db.query("mcpAuthorizationCodes").collect(),
        grants: await ctx.db.query("mcpGrants").collect(),
        request: await ctx.db
          .query("mcpAuthorizationRequests")
          .withIndex("by_request_id", (query) => query.eq("requestId", "mcpar_revoked_grant"))
          .unique(),
      })),
    ).resolves.toMatchObject({
      authorizationCodes: [],
      grants: [{ grantId, status: "revoked" }],
      request: { status: "pending" },
    });
  });

  it("returns only the client fields used by the HTTP OAuth boundary", async () => {
    const t = makeConvexTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("mcpOauthClients", {
        clientId: "mcpc_http_boundary",
        clientName: "HTTP boundary client",
        redirectUris: ["https://example.test/callback"],
        grantTypes: ["authorization_code", "refresh_token"],
        responseTypes: ["code"],
        tokenEndpointAuthMethod: "none",
        createdAt: now,
        updatedAt: now,
        createdBy: "dynamic_registration",
        registrationStatus: "provisional",
        provisionalExpiresAt: now + 60_000,
        metadataJson: '{"private":"not returned"}',
      });
    });

    await expect(
      t.query(internal.mcp.oauth.getClientByClientId, {
        clientId: "mcpc_http_boundary",
      }),
    ).resolves.toEqual({
      redirectUris: ["https://example.test/callback"],
      registrationStatus: "provisional",
      provisionalExpiresAt: now + 60_000,
    });
  });

  it("applies the same pending request checks before approval and denial", async () => {
    const t = makeConvexTest();
    const { otherUserId, ownerUserId } = await t.run(async (ctx) => {
      const ownerUserId = await ctx.db.insert("users", {
        state: "active",
        email: "authorization-owner@example.test",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const otherUserId = await ctx.db.insert("users", {
        state: "active",
        email: "authorization-other@example.test",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      for (const operation of ["issue", "deny"] as const) {
        const sharedRequest = {
          clientId,
          redirectUri: "https://example.test/callback",
          resource,
          scope,
          codeChallenge: "unused-code-challenge",
          codeChallengeMethod: "S256" as const,
          userId: ownerUserId,
          createdAt: now,
        };
        await ctx.db.insert("mcpAuthorizationRequests", {
          ...sharedRequest,
          requestId: `${operation}_not_pending`,
          status: "approved",
          expiresAt: now + 60_000,
        });
        await ctx.db.insert("mcpAuthorizationRequests", {
          ...sharedRequest,
          requestId: `${operation}_expired`,
          status: "pending",
          expiresAt: now,
        });
        await ctx.db.insert("mcpAuthorizationRequests", {
          ...sharedRequest,
          requestId: `${operation}_foreign_user`,
          status: "pending",
          expiresAt: now + 60_000,
        });
      }

      return { otherUserId, ownerUserId };
    });

    const issue = async (requestId: string, userId: Id<"users">, invokedAt: number) => {
      return await t.mutation(internal.mcp.oauth.issueAuthorizationCodeForAuthRequest, {
        requestId,
        userId,
        codeHash: `${requestId}_code_hash`,
        codeExpiresAt: invokedAt + 60_000,
        grantMode: "create_or_reuse",
        now: invokedAt,
      });
    };
    const deny = async (requestId: string, userId: Id<"users">, invokedAt: number) => {
      return await t.mutation(internal.mcp.oauth.denyAuthorizationRequest, {
        requestId,
        userId,
        now: invokedAt,
      });
    };
    const unknownError = {
      ok: false,
      status: 400,
      error: "invalid_request",
      errorDescription: "Unknown authorization request.",
    };
    const notPendingError = {
      ok: false,
      status: 400,
      error: "invalid_request",
      errorDescription: "Authorization request is no longer pending.",
    };
    const expiredError = {
      ok: false,
      status: 400,
      error: "invalid_request",
      errorDescription: "Authorization request expired.",
    };
    const differentUserError = {
      ok: false,
      status: 403,
      error: "invalid_request",
      errorDescription: "Authorization request belongs to a different user.",
    };

    for (const { invoke, operation } of [
      { operation: "issue", invoke: issue },
      { operation: "deny", invoke: deny },
    ]) {
      await expect(invoke(`${operation}_unknown`, ownerUserId, now + 1)).resolves.toEqual(
        unknownError,
      );
      await expect(invoke(`${operation}_not_pending`, ownerUserId, now + 1)).resolves.toEqual(
        notPendingError,
      );
      await expect(invoke(`${operation}_expired`, ownerUserId, now + 1)).resolves.toEqual(
        expiredError,
      );
      await expect(invoke(`${operation}_foreign_user`, otherUserId, now + 1)).resolves.toEqual(
        differentUserError,
      );
    }

    await expect(
      t.run(async (ctx) => {
        const requests = await ctx.db.query("mcpAuthorizationRequests").collect();
        return requests
          .map((request) => ({ requestId: request.requestId, status: request.status }))
          .sort((left, right) => left.requestId.localeCompare(right.requestId));
      }),
    ).resolves.toEqual([
      { requestId: "deny_expired", status: "expired" },
      { requestId: "deny_foreign_user", status: "pending" },
      { requestId: "deny_not_pending", status: "approved" },
      { requestId: "issue_expired", status: "expired" },
      { requestId: "issue_foreign_user", status: "pending" },
      { requestId: "issue_not_pending", status: "approved" },
    ]);
  });
});

describe("MCP OAuth account deletion access", () => {
  it("does not create authenticated authorization requests for deleting or missing users", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const deletingUserId = await ctx.db.insert("users", {
        state: "active",
        email: "deleting-auth-request@example.test",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const missingUserId = await ctx.db.insert("users", {
        state: "active",
        email: "missing-auth-request@example.test",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const initiatingSessionId = await ctx.db.insert("authSessions", {
        userId: deletingUserId,
        expirationTime: now + 60_000,
      });
      const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
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
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
      });
      await ctx.db.patch(deletingUserId, {
        state: "deleting",
        runId,
        requestedAt: now,
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
      t.run(async (ctx) => await ctx.db.query("mcpAuthorizationRequests").collect()),
    ).resolves.toHaveLength(1);
  });

  it("does not issue authorization codes for deleting or missing users", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const deletingUserId = await ctx.db.insert("users", {
        state: "active",
        email: "deleting-code-owner@example.test",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const missingUserId = await ctx.db.insert("users", {
        state: "active",
        email: "missing-code-owner@example.test",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const initiatingSessionId = await ctx.db.insert("authSessions", {
        userId: deletingUserId,
        expirationTime: now + 60_000,
      });
      const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
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
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
      });
      await ctx.db.patch(deletingUserId, {
        state: "deleting",
        runId,
        requestedAt: now,
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
        await ctx.db.insert("mcpAuthorizationRequests", {
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
        accessAudits: await ctx.db.query("audit_mcpAccess_events").collect(),
        authRequests: await ctx.db.query("mcpAuthorizationRequests").collect(),
        authorizationCodes: await ctx.db.query("mcpAuthorizationCodes").collect(),
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
          grantMode: "create_or_reuse",
          now: now + 1,
        }),
      ).resolves.toEqual(inactiveGrantError);
    }

    await expect(readIssuanceState()).resolves.toEqual(before);
  });

  it("rejects every stale MCP credential for a deleted user without recording usage", async () => {
    const t = makeConvexTest();
    const codeVerifier = "account-deletion-code-verifier";
    const codeChallenge = await createCodeChallenge(codeVerifier);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "deleting-mcp@example.test",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const initiatingSessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: now + 60_000,
      });
      const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
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
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
      });
      await ctx.db.patch(userId, {
        state: "deleting",
        runId,
        requestedAt: now,
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
      await ctx.db.insert("mcpAuthorizationRequests", {
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
      await ctx.db.insert("mcpAuthorizationCodes", {
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
      await ctx.db.insert("mcpRefreshTokens", {
        grantId,
        clientId,
        userId,
        tokenHash: "deleting_refresh_token_hash",
        status: "active",
        createdAt: now,
        expiresAt: now + 60_000,
      });
      await ctx.db.insert("mcpAccessTokens", {
        grantId,
        clientId,
        userId,
        tokenHash: "deleting_access_token_hash",
        resource,
        scope,
        createdAt: now,
        expiresAt: now + 60_000,
      });
      await ctx.db.replace(userId, { state: "deleted", deletedAt: now });
    });

    const readCredentialState = async () => {
      return await t.run(async (ctx) => ({
        accessTokens: await ctx.db.query("mcpAccessTokens").collect(),
        authorizationCodes: await ctx.db.query("mcpAuthorizationCodes").collect(),
        audits: await ctx.db.query("audit_mcpAccess_events").collect(),
        grants: await ctx.db.query("mcpGrants").collect(),
        refreshTokens: await ctx.db.query("mcpRefreshTokens").collect(),
      }));
    };
    const before = await readCredentialState();

    await expect(
      t.mutation(internal.mcp.oauth.exchangeAuthorizationCode, {
        codeHash: "authorization_code_hash",
        clientId,
        redirectUri: "http://127.0.0.1/callback",
        resource,
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
        resource,
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
