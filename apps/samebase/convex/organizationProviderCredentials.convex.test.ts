import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type {
  CloudflareProviderCredential,
  ConvexProviderCredential,
} from "./organizationProviderCredentialModel";
import { hashOrganizationProviderSnapshot } from "./providerAuthFingerprint";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "./test.setup";

const teamId = "team-1";
const accountId = "a".repeat(32);

type TestBackend = ReturnType<typeof makeConvexTest>;
type CloudflareOAuthAuth = Extract<CloudflareProviderCredential["auth"], { method: "oauth" }>;
type RefreshLease = NonNullable<CloudflareProviderCredential["tokenRefreshLease"]>;

function apiKey(credential: string) {
  return { method: "api_key" as const, credential };
}

function cloudflareOAuth(version: string): CloudflareOAuthAuth {
  return {
    method: "oauth",
    credential: `access-${version}`,
    refreshCredential: `refresh-${version}`,
    credentialExpiresAt: Date.now() + 60_000,
  };
}

async function seedOrganization() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const connectorId = await ctx.db.insert("users", {
      state: "active",
      email: "a@x.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const otherOwnerId = await ctx.db.insert("users", {
      state: "active",
      email: "b@x.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const memberId = await ctx.db.insert("users", {
      state: "active",
      email: "c@x.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "owner-1",
      githubOwnerType: "organization",
      githubOwnerLogin: "Primary",
      githubOwnerLoginNormalized: "primary",
      githubInstallationId: "installation-1",
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId, {
      polarBillingUserId: connectorId,
      polarSeatQuantity: 3,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: connectorId,
      role: "owner",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: otherOwnerId,
      role: "owner",
    });
    const memberMembershipId = await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: memberId,
      role: "member",
    });
    return { connectorId, memberId, memberMembershipId, organizationId, otherOwnerId };
  });
  return { ...ids, t };
}

type Seed = Awaited<ReturnType<typeof seedOrganization>>;

async function loadProviderState(t: TestBackend, organizationId: Id<"organizations">) {
  return await t.run(async (ctx) => {
    const organization = await ctx.db.get(organizationId);
    if (organization === null) throw new Error("Expected the test organization.");
    const credentials = await ctx.db
      .query("organizationProviderCredentials")
      .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
      .unique();
    return { credentials, organization };
  });
}

async function providerSnapshot(seed: Seed, provider: "convex" | "cloudflare") {
  const { credentials, organization } = await loadProviderState(seed.t, seed.organizationId);
  return provider === "convex"
    ? await hashOrganizationProviderSnapshot({
        provider,
        teamId: organization.convexTeam?.teamId,
        credential: credentials?.convex,
      })
    : await hashOrganizationProviderSnapshot({
        provider,
        accountId: organization.cloudflareAccount?.accountId,
        credential: credentials?.cloudflare,
      });
}

async function connectConvex(
  seed: Seed,
  userId: Id<"users">,
  auth: ConvexProviderCredential["auth"],
  selectedTeamId = teamId,
) {
  return await seed.t.mutation(internal.organizationProviderCredentials.connectConvex, {
    organizationId: seed.organizationId,
    connectedByUserId: userId,
    expectedProviderSnapshotHash: await providerSnapshot(seed, "convex"),
    auth,
    teamId: selectedTeamId,
  });
}

async function connectCloudflare(
  seed: Seed,
  userId: Id<"users">,
  auth: CloudflareProviderCredential["auth"],
  selectedAccountId = accountId,
  accountName = "Primary account",
) {
  return await seed.t.mutation(internal.organizationProviderCredentials.connectCloudflare, {
    organizationId: seed.organizationId,
    connectedByUserId: userId,
    expectedProviderSnapshotHash: await providerSnapshot(seed, "cloudflare"),
    auth,
    account: {
      accountId: selectedAccountId,
      accountName,
    },
  });
}

async function seedConfiguredProviders() {
  const seed = await seedOrganization();
  await connectConvex(seed, seed.connectorId, apiKey("convex-old"));
  await connectCloudflare(seed, seed.connectorId, apiKey("cloudflare-old"));
  const { credentials } = await loadProviderState(seed.t, seed.organizationId);
  if (credentials === null) throw new Error("Expected credentials.");
  return { ...seed, providerCredentialsId: credentials._id };
}

async function seedCloudflareOAuth() {
  const seed = await seedOrganization();
  const auth = cloudflareOAuth("old");
  const providerCredentialsId = await seed.t.run(async (ctx) => {
    const id = await ctx.db.insert("organizationProviderCredentials", {
      organizationId: seed.organizationId,
      cloudflare: { auth, connectedByUserId: seed.connectorId, updatedAt: Date.now() },
    });
    await ctx.db.patch(seed.organizationId, {
      cloudflareAccount: { accountId, accountName: "Primary account" },
    });
    return id;
  });
  return { ...seed, auth, providerCredentialsId };
}

async function createConvexOAuthState(seed: Seed, state: string, expiresAt = Date.now() + 60_000) {
  const id = await seed.t.mutation(internal.oauthState.createOauthState, {
    provider: "convex",
    userId: seed.connectorId,
    organizationId: seed.organizationId,
    state,
    codeVerifier: "verifier",
    createdAt: Date.now(),
    expiresAt,
  });
  const row = await seed.t.run(async (ctx) => await ctx.db.get(id));
  if (row?.provider !== "convex") throw new Error("Expected Convex OAuth state.");
  return row;
}

async function storeConvexOAuth(
  seed: Seed,
  state: Awaited<ReturnType<typeof createConvexOAuthState>>,
  accessToken: string,
  callbackState = state.state,
) {
  return await seed.t.mutation(internal.convexOAuth.storeConvexOauthTokens, {
    organizationId: seed.organizationId,
    connectedByUserId: seed.connectorId,
    expectedProviderSnapshotHash: state.expectedProviderSnapshotHash,
    accessToken,
    teamId,
    oauthStateId: state._id,
    oauthState: callbackState,
  });
}

async function replaceCloudflare(
  seed: Seed,
  userId: Id<"users">,
  expectedAuth: CloudflareOAuthAuth,
  auth: CloudflareOAuthAuth,
  lease: RefreshLease,
) {
  return await seed.t.mutation(
    internal.organizationProviderCredentials.replaceCloudflareCredential,
    {
      organizationId: seed.organizationId,
      userId,
      expectedAuth,
      auth,
      tokenHealth: {
        status: "valid",
        checkedAt: Date.now(),
        expiresAt: auth.credentialExpiresAt,
        source: "expiry_metadata",
      },
      expectedTokenRefreshLease: lease,
    },
  );
}

async function startDeletion(seed: Seed) {
  return await seed.t.run(async (ctx) => {
    const initiatingSessionId = await ctx.db.insert("authSessions", {
      userId: seed.connectorId,
      expirationTime: Date.now() + 60_000,
    });
    const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
      state: "running",
      identity: { state: "active", userId: seed.connectorId, email: "a@x.test" },
      completionCapability: "c".repeat(64),
      currentStep: "revoke_access",
      requestedAt: Date.now(),
      updatedAt: Date.now(),
      initiatingSessionId,
      retryCount: 0,
      outcomes: {
        providerRevocation: { state: "in_progress", convexManualRevocationRequired: false },
        completionEmail: { state: "not_started" },
      },
      workflow: { state: "started", workflowId: "provider-takeover", attempt: 1 },
    });
    await ctx.db.patch(seed.connectorId, {
      state: "deleting",
      runId,
      requestedAt: Date.now(),
    });
    return runId;
  });
}

describe("organization provider credential lifecycle", () => {
  it("binds provider destinations after an existing repository connects without them", async () => {
    const seed = await seedOrganization();
    const source = await seed.t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        organizationId: seed.organizationId,
        userId: seed.connectorId,
        ghRepoId: "repository-without-providers",
        ghRepoOwner: "Primary",
        ghRepoName: "source-only",
      },
    );

    await connectConvex(seed, seed.connectorId, apiKey("convex"));
    await seed.t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
      ...source,
      userId: seed.connectorId,
      ghRepoId: "repository-without-providers",
      ghRepoOwner: "Primary",
      ghRepoName: "source-only",
      defaultBranch: "main",
      visibility: "private",
    });

    const convexVault = await seed.t.run(async (ctx) => await ctx.db.get(source.vaultId));
    expect(convexVault).toMatchObject({ convexTeamId: teamId });
    expect(convexVault).not.toHaveProperty("cloudflareAccountId");

    await connectCloudflare(seed, seed.connectorId, apiKey("cloudflare"));
    await expect(
      seed.t.run(async (ctx) => await ctx.db.get(source.vaultId)),
    ).resolves.toMatchObject({
      convexTeamId: teamId,
      cloudflareAccountId: accountId,
    });
  });

  it("rejects a new token refresh claim after the member starts account deletion", async () => {
    const seed = await seedCloudflareOAuth();
    await startDeletion(seed);

    await expect(
      seed.t.mutation(internal.organizationProviderCredentials.claimCloudflareTokenRefresh, {
        organizationId: seed.organizationId,
        userId: seed.connectorId,
        expectedAuth: seed.auth,
        force: true,
      }),
    ).rejects.toThrow("Provider credentials are unavailable during account deletion.");
  });

  it("reuses one credential document for both slots and same-target reauthorization", async () => {
    const seed = await seedConfiguredProviders();
    await seed.t.run(async (ctx) => {
      await ctx.db.patch(seed.organizationId, {
        cloudflareAccount: {
          accountId,
          accountName: "Primary account",
          lastUsedBuildTokenUuid: "last-used-build-token",
        },
      });
    });
    await connectConvex(seed, seed.otherOwnerId, apiKey("convex-new"));
    await connectCloudflare(
      seed,
      seed.otherOwnerId,
      apiKey("cloudflare-new"),
      accountId,
      "Renamed account",
    );

    const { credentials, organization } = await loadProviderState(seed.t, seed.organizationId);
    const rows = await seed.t.run(async (ctx) =>
      ctx.db.query("organizationProviderCredentials").take(2),
    );
    expect(rows).toHaveLength(1);
    expect({
      id: credentials?._id,
      credentialOrganizationId: credentials?.organizationId,
      convexTeamId: organization.convexTeam?.teamId,
      cloudflareAccount: organization.cloudflareAccount,
      convexConnector: credentials?.convex?.connectedByUserId,
      cloudflareConnector: credentials?.cloudflare?.connectedByUserId,
    }).toEqual({
      id: seed.providerCredentialsId,
      credentialOrganizationId: seed.organizationId,
      convexTeamId: teamId,
      cloudflareAccount: {
        accountId,
        accountName: "Renamed account",
        lastUsedBuildTokenUuid: "last-used-build-token",
      },
      convexConnector: seed.otherOwnerId,
      cloudflareConnector: seed.otherOwnerId,
    });
  });

  it("deletes the credential document after both providers disconnect and recreates it", async () => {
    const seed = await seedConfiguredProviders();
    const before = await loadProviderState(seed.t, seed.organizationId);
    if (before.credentials?.convex === undefined || before.credentials.cloudflare === undefined) {
      throw new Error("Expected both credentials.");
    }

    await seed.t.mutation(internal.organizationProviderCredentials.disconnectConvex, {
      organizationId: seed.organizationId,
      disconnectedByUserId: seed.connectorId,
      expectedAuth: before.credentials.convex.auth,
    });
    await seed.t.mutation(internal.organizationProviderCredentials.disconnectCloudflare, {
      organizationId: seed.organizationId,
      disconnectedByUserId: seed.connectorId,
      expectedAuth: before.credentials.cloudflare.auth,
    });

    const after = await loadProviderState(seed.t, seed.organizationId);
    expect(after.credentials).toBeNull();

    await connectCloudflare(seed, seed.otherOwnerId, apiKey("cloudflare-reconnected"));
    const reconnected = await loadProviderState(seed.t, seed.organizationId);
    expect(reconnected.credentials?._id).not.toBe(seed.providerCredentialsId);
    expect(reconnected.credentials).toMatchObject({
      organizationId: seed.organizationId,
      cloudflare: {
        connectedByUserId: seed.otherOwnerId,
        auth: apiKey("cloudflare-reconnected"),
      },
    });
  });

  it("fails closed when one organization has duplicate credential documents", async () => {
    const seed = await seedOrganization();
    await seed.t.run(async (ctx) => {
      await ctx.db.insert("organizationProviderCredentials", {
        organizationId: seed.organizationId,
        convex: {
          auth: apiKey("first"),
          connectedByUserId: seed.connectorId,
          updatedAt: 1,
        },
      });
      await ctx.db.insert("organizationProviderCredentials", {
        organizationId: seed.organizationId,
        convex: {
          auth: apiKey("second"),
          connectedByUserId: seed.connectorId,
          updatedAt: 2,
        },
      });
    });

    await expect(
      seed.t.query(internal.organizationProviderCredentials.loadForOrganization, {
        organizationId: seed.organizationId,
        userId: seed.connectorId,
      }),
    ).rejects.toThrow();
  });

  it("rejects different destinations without changing stored state", async () => {
    const seed = await seedConfiguredProviders();
    const before = await loadProviderState(seed.t, seed.organizationId);

    await expect(connectConvex(seed, seed.otherOwnerId, apiKey("other"), "team-2")).rejects.toThrow(
      "Convex authorization does not match the configured team.",
    );
    await expect(
      connectCloudflare(seed, seed.otherOwnerId, apiKey("other"), "b".repeat(32)),
    ).rejects.toThrow("Cloudflare authorization does not match the configured account.");
    await expect(loadProviderState(seed.t, seed.organizationId)).resolves.toEqual(before);
  });

  it("stores OAuth only with the exact state and rejects replay", async () => {
    const seed = await seedOrganization();
    const state = await createConvexOAuthState(seed, "exact-state");

    await expect(storeConvexOAuth(seed, state, "token", "wrong-state")).rejects.toThrow(
      "OAuth state changed before authorization completed.",
    );
    await expect(storeConvexOAuth(seed, state, "token")).resolves.toEqual({ status: "stored" });
    await expect(seed.t.run(async (ctx) => await ctx.db.get(state._id))).resolves.toBeNull();
    await expect(storeConvexOAuth(seed, state, "replay")).rejects.toThrow(
      "OAuth state changed before authorization completed.",
    );
    expect(
      (await loadProviderState(seed.t, seed.organizationId)).credentials?.convex?.auth,
    ).toEqual({ method: "oauth", credential: "token" });
  });

  it("consumes OAuth state without writing when owner access is lost at storage", async () => {
    const seed = await seedOrganization();
    const state = await createConvexOAuthState(seed, "lost-owner-state");
    await seed.t.run(async (ctx) => {
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", seed.organizationId).eq("userId", seed.connectorId),
        )
        .unique();
      if (membership === null) throw new Error("Expected owner membership.");
      await ctx.db.patch(membership._id, { role: "member" });
    });

    await expect(storeConvexOAuth(seed, state, "unused-token")).resolves.toEqual({
      status: "access_lost",
    });
    await expect(seed.t.run(async (ctx) => await ctx.db.get(state._id))).resolves.toBeNull();
    await expect(loadProviderState(seed.t, seed.organizationId)).resolves.toMatchObject({
      credentials: null,
    });
  });

  it("rejects expired OAuth state and a callback for a changed snapshot", async () => {
    const expired = await seedOrganization();
    const expiredState = await createConvexOAuthState(expired, "expired", Date.now() - 1);
    await expect(storeConvexOAuth(expired, expiredState, "expired-token")).rejects.toThrow(
      "OAuth state expired before authorization completed.",
    );
    await expect(
      expired.t.run(async (ctx) => await ctx.db.get(expiredState._id)),
    ).resolves.not.toBeNull();

    const changed = await seedConfiguredProviders();
    const changedState = await createConvexOAuthState(changed, "changed");
    await connectConvex(changed, changed.otherOwnerId, apiKey("newer"));
    await expect(storeConvexOAuth(changed, changedState, "older")).resolves.toEqual({
      status: "configuration_changed",
    });
    const current = await loadProviderState(changed.t, changed.organizationId);
    expect(current.credentials?.convex).toMatchObject({
      auth: apiKey("newer"),
      connectedByUserId: changed.otherOwnerId,
    });
    await expect(
      changed.t.run(async (ctx) => await ctx.db.get(changedState._id)),
    ).resolves.toBeNull();
  });

  it("finishes refresh after the claimant starts account deletion", async () => {
    const seed = await seedCloudflareOAuth();
    const claim = await seed.t.mutation(
      internal.organizationProviderCredentials.claimCloudflareTokenRefresh,
      {
        organizationId: seed.organizationId,
        userId: seed.connectorId,
        expectedAuth: seed.auth,
        force: true,
      },
    );
    if (!claim.claimed) throw new Error("Expected a refresh lease.");
    await expect(
      seed.t.query(
        internal.organizationProviderCredentials.loadCloudflareTokenRefreshContinuation,
        {
          organizationId: seed.organizationId,
          expectedAuth: cloudflareOAuth("wrong"),
          expectedTokenRefreshLease: claim.tokenRefreshLease,
        },
      ),
    ).rejects.toThrow("Cloudflare credential changed before token refresh continuation.");
    await startDeletion(seed);
    const refreshedAuth = cloudflareOAuth("new");

    await expect(
      replaceCloudflare(seed, seed.connectorId, seed.auth, refreshedAuth, claim.tokenRefreshLease),
    ).resolves.toBeNull();
    await expect(
      replaceCloudflare(seed, seed.connectorId, seed.auth, refreshedAuth, claim.tokenRefreshLease),
    ).rejects.toThrow("Cloudflare credential changed before the update completed.");
    await expect(
      replaceCloudflare(seed, seed.connectorId, refreshedAuth, refreshedAuth, {
        ...claim.tokenRefreshLease,
        startedAt: claim.tokenRefreshLease.startedAt + 1,
      }),
    ).rejects.toThrow("Cloudflare token refresh lease changed before the update completed.");
    await expect(
      seed.t.mutation(internal.organizationProviderCredentials.releaseCloudflareTokenRefresh, {
        organizationId: seed.organizationId,
        expectedTokenRefreshLease: {
          ...claim.tokenRefreshLease,
          startedAt: claim.tokenRefreshLease.startedAt + 1,
        },
      }),
    ).rejects.toThrow("Cloudflare token refresh lease changed before release.");
    await seed.t.mutation(internal.organizationProviderCredentials.releaseCloudflareTokenRefresh, {
      organizationId: seed.organizationId,
      expectedTokenRefreshLease: claim.tokenRefreshLease,
    });
    const cloudflare = (await loadProviderState(seed.t, seed.organizationId)).credentials
      ?.cloudflare;
    expect({
      auth: cloudflare?.auth,
      by: cloudflare?.connectedByUserId,
      lease: cloudflare?.tokenRefreshLease,
    }).toEqual({
      auth: refreshedAuth,
      by: seed.connectorId,
      lease: undefined,
    });
  });

  it("does not restore a credential after disconnect wins a refresh race", async () => {
    const seed = await seedCloudflareOAuth();
    const claim = await seed.t.mutation(
      internal.organizationProviderCredentials.claimCloudflareTokenRefresh,
      {
        organizationId: seed.organizationId,
        userId: seed.connectorId,
        expectedAuth: seed.auth,
        force: true,
      },
    );
    if (!claim.claimed) throw new Error("Expected a refresh lease.");
    await seed.t.mutation(internal.organizationProviderCredentials.disconnectCloudflare, {
      organizationId: seed.organizationId,
      disconnectedByUserId: seed.connectorId,
      expectedAuth: seed.auth,
    });

    await expect(
      replaceCloudflare(
        seed,
        seed.connectorId,
        seed.auth,
        cloudflareOAuth("rotated"),
        claim.tokenRefreshLease,
      ),
    ).rejects.toThrow("Cloudflare credential not found.");
    expect(
      (await loadProviderState(seed.t, seed.organizationId)).credentials?.cloudflare,
    ).toBeUndefined();
  });

  it("does not restore a credential after account deletion cleanup wins a refresh race", async () => {
    const seed = await seedCloudflareOAuth();
    const claim = await seed.t.mutation(
      internal.organizationProviderCredentials.claimCloudflareTokenRefresh,
      {
        organizationId: seed.organizationId,
        userId: seed.connectorId,
        expectedAuth: seed.auth,
        force: true,
      },
    );
    if (!claim.claimed) throw new Error("Expected a refresh lease.");
    const runId = await startDeletion(seed);
    const expected = (await loadProviderState(seed.t, seed.organizationId)).credentials?.cloudflare;
    if (expected === undefined) throw new Error("Expected a Cloudflare credential.");

    await expect(
      seed.t.mutation(internal.accountDeletion.providerActions.deleteRevokedConnection, {
        runId,
        workflowId: "provider-takeover",
        expected: {
          provider: "cloudflare",
          organizationId: seed.organizationId,
          credential: expected,
        },
      }),
    ).resolves.toBe(true);
    await expect(
      replaceCloudflare(
        seed,
        seed.connectorId,
        seed.auth,
        cloudflareOAuth("after-cleanup"),
        claim.tokenRefreshLease,
      ),
    ).rejects.toThrow("Cloudflare credential not found.");
    await expect(
      seed.t.mutation(internal.organizationProviderCredentials.releaseCloudflareTokenRefresh, {
        organizationId: seed.organizationId,
        expectedTokenRefreshLease: claim.tokenRefreshLease,
      }),
    ).resolves.toEqual({});
    await expect(loadProviderState(seed.t, seed.organizationId)).resolves.toMatchObject({
      credentials: null,
    });
  });

  it("finishes a shared token refresh after the actor becomes deleted", async () => {
    const seed = await seedCloudflareOAuth();
    await seed.t.run(async (ctx) => {
      const credentials = await ctx.db.get(seed.providerCredentialsId);
      if (credentials?.cloudflare === undefined) {
        throw new Error("Expected a Cloudflare credential.");
      }
      await ctx.db.patch(credentials._id, {
        cloudflare: { ...credentials.cloudflare, connectedByUserId: seed.otherOwnerId },
      });
    });
    const claim = await seed.t.mutation(
      internal.organizationProviderCredentials.claimCloudflareTokenRefresh,
      {
        organizationId: seed.organizationId,
        userId: seed.connectorId,
        expectedAuth: seed.auth,
        force: true,
      },
    );
    if (!claim.claimed) throw new Error("Expected a refresh lease.");
    await seed.t.run(async (ctx) => {
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", seed.organizationId).eq("userId", seed.connectorId),
        )
        .unique();
      if (membership !== null) {
        await ctx.db.delete(membership._id);
      }
      await ctx.db.replace(seed.connectorId, { state: "deleted", deletedAt: Date.now() });
    });
    const refreshedAuth = cloudflareOAuth("deleted-user");

    await expect(
      replaceCloudflare(seed, seed.connectorId, seed.auth, refreshedAuth, claim.tokenRefreshLease),
    ).resolves.toBeNull();
    await expect(
      seed.t.mutation(internal.organizationProviderCredentials.releaseCloudflareTokenRefresh, {
        organizationId: seed.organizationId,
        expectedTokenRefreshLease: claim.tokenRefreshLease,
      }),
    ).resolves.toEqual({});
    const state = await loadProviderState(seed.t, seed.organizationId);
    expect(state).toMatchObject({
      credentials: {
        cloudflare: {
          auth: refreshedAuth,
          connectedByUserId: seed.otherOwnerId,
        },
      },
    });
    expect(state.credentials?.cloudflare?.tokenRefreshLease).toBeUndefined();
  });

  it("preserves another owner's takeover during old connector account deletion", async () => {
    const seed = await seedConfiguredProviders();
    const before = (await loadProviderState(seed.t, seed.organizationId)).credentials;
    if (before?.convex === undefined || before.cloudflare === undefined) {
      throw new Error("Expected both credentials.");
    }
    const runId = await startDeletion(seed);
    await connectConvex(seed, seed.otherOwnerId, apiKey("convex-takeover"));
    await connectCloudflare(seed, seed.otherOwnerId, apiKey("cloudflare-takeover"));

    const staleConnections = [
      {
        provider: "convex" as const,
        organizationId: seed.organizationId,
        credential: before.convex,
      },
      {
        provider: "cloudflare" as const,
        organizationId: seed.organizationId,
        credential: before.cloudflare,
      },
    ];
    for (const expected of staleConnections) {
      await expect(
        seed.t.mutation(internal.accountDeletion.providerActions.deleteRevokedConnection, {
          runId,
          workflowId: "provider-takeover",
          expected,
        }),
      ).resolves.toBe(false);
    }
    await expect(
      seed.t.action(internal.accountDeletion.providerActions.revokeConnectionBatch, {
        runId,
        workflowId: "provider-takeover",
      }),
    ).resolves.toEqual({ done: true, convexManualRevocationRequired: false });

    const after = await loadProviderState(seed.t, seed.organizationId);
    expect(after.credentials?._id).toBe(seed.providerCredentialsId);
    expect({
      convex: after.credentials?.convex?.connectedByUserId,
      cloudflare: after.credentials?.cloudflare?.connectedByUserId,
    }).toEqual({ convex: seed.otherOwnerId, cloudflare: seed.otherOwnerId });
  });
});
