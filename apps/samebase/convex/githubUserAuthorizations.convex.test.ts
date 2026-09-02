import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubAuthMocks = vi.hoisted(() => ({
  createOAuthUserAuth: vi.fn(),
  auth: vi.fn(),
}));

vi.mock("@octokit/auth-app", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@octokit/auth-app")>();
  return {
    ...actual,
    createOAuthUserAuth: githubAuthMocks.createOAuthUserAuth,
  };
});

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { upsertGitHubUserAuthorization } from "./githubUserAuthorizations";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "./test.setup";

const accountDeletionWorkflowId = "github-refresh-account-deletion";

beforeEach(() => {
  vi.clearAllMocks();
  githubAuthMocks.createOAuthUserAuth.mockReturnValue(githubAuthMocks.auth);
  githubAuthMocks.auth.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function insertGitHubSignInAccount(
  ctx: MutationCtx,
  args: {
    githubUserId: string;
    githubUserLogin: string;
    userId: Id<"users">;
  },
) {
  return await ctx.db.insert("authAccounts", {
    userId: args.userId,
    provider: "github",
    providerAccountId: args.githubUserId,
    emailVerified: `${args.githubUserLogin}@example.com`,
    githubLogin: args.githubUserLogin,
  });
}

async function seedGitHubRefreshCandidate(email: string, githubUserId: string) {
  const t = makeConvexTest();
  const { authorizationId, userId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email,
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    await insertGitHubSignInAccount(ctx, {
      userId,
      githubUserId,
      githubUserLogin: `refresh-${githubUserId}`,
    });
    const now = Date.now();
    const authorizationId = await ctx.db.insert("githubUserAuthorizations", {
      userId,
      githubUserId,
      githubUserLogin: `refresh-${githubUserId}`,
      accessToken: "old-access-token",
      accessTokenExpiresAt: now - 1,
      refreshToken: "old-refresh-token",
      refreshTokenExpiresAt: now + 120_000,
      createdAt: now,
      updatedAt: now,
    });
    return { authorizationId, userId };
  });
  return { authorizationId, t, userId };
}

async function seedClaimedGitHubRefresh(email: string, githubUserId: string) {
  const candidate = await seedGitHubRefreshCandidate(email, githubUserId);
  const { authorizationId, t, userId } = candidate;
  const claim = await t.mutation(internal.githubUserAuthorizations.claimForUse, {
    userId,
    githubUserId,
  });
  if (claim.kind !== "claimed") {
    throw new Error("Expected a GitHub refresh claim.");
  }
  return { authorizationId, claim, t, userId };
}

async function transitionToDraining(t: ReturnType<typeof makeConvexTest>) {
  await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
    mode: "draining",
  });
}

async function forceFrozenMaintenance(t: ReturnType<typeof makeConvexTest>) {
  await t.run(async (ctx) => {
    const gate = await ctx.db
      .query("repositoryWriteGates")
      .withIndex("by_scope", (query) => query.eq("scope", "global"))
      .unique();
    if (gate === null) {
      await ctx.db.insert("repositoryWriteGates", {
        scope: "global",
        mode: "frozen",
        changedAt: Date.now(),
      });
      return;
    }
    await ctx.db.patch(gate._id, { mode: "frozen", changedAt: Date.now() });
  });
}

async function createProvisioningAuthority(
  t: ReturnType<typeof makeConvexTest>,
  userId: Id<"users">,
) {
  return await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "maintenance-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "Maintenance",
      githubOwnerLoginNormalized: "maintenance",
      githubInstallationId: "maintenance-installation",
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId, {
      polarBillingUserId: userId,
      polarSeatQuantity: 1,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId,
      role: "owner",
    });
    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      organizationId,
      userId,
      vaultId,
      repositoryFullName: "Maintenance/repository",
      trigger: "create",
      state: "running",
      currentStep: "create_github_repo",
      createdAt: 1,
      updatedAt: 1,
    });
    return { runId, userId, vaultId };
  });
}

async function startAccountDeletion(
  t: ReturnType<typeof makeConvexTest>,
  userId: Id<"users">,
  email: string,
) {
  return await t.run(async (ctx) => {
    const initiatingSessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60_000,
    });
    const now = Date.now();
    const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
      state: "running",
      identity: { state: "active", userId, email },
      completionCapability: "g".repeat(64),
      currentStep: "revoke_access",
      requestedAt: now,
      updatedAt: now,
      initiatingSessionId,
      retryCount: 0,
      outcomes: {
        providerRevocation: { state: "not_started" },
        completionEmail: { state: "not_started" },
      },
      workflow: { state: "started", workflowId: accountDeletionWorkflowId, attempt: 1 },
    });
    await ctx.db.patch(userId, { state: "deleting", runId, requestedAt: now });
    return runId;
  });
}

describe("viewer GitHub user authorization", () => {
  it("returns user-facing authorization status while organization work is billing-limited", async () => {
    const t = makeConvexTest();
    const { organizationId, otherOrganizationId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "github-status@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const extraMemberId = await ctx.db.insert("users", {
        state: "active",
        email: "github-status-extra-member@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "101",
        githubOwnerType: "user",
        githubOwnerLogin: "octocat",
        githubOwnerLoginNormalized: "octocat",
        githubInstallationId: "installation-octocat",
      });
      const otherOrganizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "102",
        githubOwnerType: "user",
        githubOwnerLogin: "monalisa",
        githubOwnerLoginNormalized: "monalisa",
        githubInstallationId: "installation-monalisa",
      });
      await Promise.all([
        insertTestOrganizationBillingAccount(ctx.db, organizationId),
        insertTestOrganizationBillingAccount(ctx.db, otherOrganizationId),
      ]);
      await Promise.all([
        ctx.db.insert("organizationMemberships", {
          organizationId,
          userId,
          role: "member",
        }),
        ctx.db.insert("organizationMemberships", {
          organizationId,
          userId: extraMemberId,
          role: "member",
        }),
        ctx.db.insert("organizationMemberships", {
          organizationId: otherOrganizationId,
          userId,
          role: "member",
        }),
      ]);
      return { organizationId, otherOrganizationId, userId };
    });
    const asUser = t.withIdentity({
      subject: `${userId}|github-status`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(
      asUser.query(api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization, {
        organizationId,
      }),
    ).resolves.toEqual({ status: "sign_in_required", authorizationPresent: false });

    const signInAccountId = await t.run(async (ctx) => {
      return await insertGitHubSignInAccount(ctx, {
        userId,
        githubUserId: "102",
        githubUserLogin: "monalisa",
      });
    });
    await expect(
      asUser.query(api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization, {
        organizationId,
      }),
    ).resolves.toEqual({ status: "sign_in_mismatch", authorizationPresent: false });
    await t.run(async (ctx) => {
      await ctx.db.patch(signInAccountId, {
        providerAccountId: "101",
        githubLogin: "octocat",
      });
    });
    await expect(
      asUser.query(api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization, {
        organizationId,
      }),
    ).resolves.toEqual({ status: "not_connected" });

    const refreshTokenExpiresAt = Date.now() + 60_000;
    await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("githubUserAuthorizations", {
        userId,
        githubUserId: "101",
        githubUserLogin: "octocat",
        accessToken: "secret-access-token",
        accessTokenExpiresAt: now - 1,
        refreshToken: "secret-refresh-token",
        refreshTokenExpiresAt,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      asUser.query(api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization, {
        organizationId,
      }),
    ).resolves.toEqual({
      status: "authorized",
      githubUserLogin: "octocat",
      refreshTokenExpiresAt,
    });
    await expect(
      asUser.query(api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization, {
        organizationId: otherOrganizationId,
      }),
    ).resolves.toEqual({
      status: "different_account",
      githubUserLogin: "octocat",
    });
    await t.run(async (ctx) => {
      await ctx.db.delete(signInAccountId);
    });
    await expect(
      asUser.query(api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization, {
        organizationId,
      }),
    ).resolves.toEqual({ status: "sign_in_required", authorizationPresent: true });
    await expect(
      asUser.query(api.githubUserAuthorizations.getViewerPersonalRepositoryAuthorization, {
        organizationId: otherOrganizationId,
      }),
    ).resolves.toEqual({
      status: "different_account",
      githubUserLogin: "octocat",
    });
  });

  it("routes viewer revocation through the existing provider revoke and delete flow", async () => {
    const t = makeConvexTest();
    const { userId, authorizationId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "github-revoke@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const now = Date.now();
      const authorizationId = await ctx.db.insert("githubUserAuthorizations", {
        userId,
        githubUserId: "202",
        githubUserLogin: "monalisa",
        accessToken: "revoke-access-token",
        accessTokenExpiresAt: now + 60_000,
        refreshToken: "revoke-refresh-token",
        refreshTokenExpiresAt: now + 120_000,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, authorizationId };
    });
    vi.stubEnv("GITHUB_APP_ID", "42");
    vi.stubEnv("GITHUB_APP_SLUG", "samebase-test");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-id");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "private-key");
    vi.stubEnv("GITHUB_APP_OAUTH_CALLBACK_URL", "https://samebase.test/oauth/github/callback");
    githubAuthMocks.auth.mockImplementationOnce(async () => {
      await transitionToDraining(t);
      return {};
    });

    const result = await t
      .withIdentity({
        subject: `${userId}|github-revoke`,
        tokenIdentifier: `test:${userId}`,
      })
      .action(api.githubUserAuthorizations.revokeViewerGitHubUserAuthorization, {});

    expect(result).toBeNull();
    expect(githubAuthMocks.createOAuthUserAuth).toHaveBeenCalledWith({
      clientType: "github-app",
      clientId: "client-id",
      clientSecret: "client-secret",
      token: "revoke-access-token",
    });
    expect(githubAuthMocks.auth).toHaveBeenCalledWith({ type: "deleteAuthorization" });
    await expect(t.run(async (ctx) => await ctx.db.get(authorizationId))).resolves.toBeNull();
    await expect(
      t.run(async (ctx) => await ctx.db.query("repositoryOperationLeases").collect()),
    ).resolves.toEqual([]);
  });

  it("does not start viewer revocation while repository writes drain", async () => {
    const { authorizationId, t, userId } = await seedGitHubRefreshCandidate(
      "github-revoke-maintenance@example.test",
      "203",
    );
    vi.stubEnv("GITHUB_APP_ID", "42");
    vi.stubEnv("GITHUB_APP_SLUG", "samebase-test");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-id");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "private-key");
    vi.stubEnv("GITHUB_APP_OAUTH_CALLBACK_URL", "https://samebase.test/oauth/github/callback");
    await transitionToDraining(t);

    await expect(
      t
        .withIdentity({
          subject: `${userId}|github-revoke-maintenance`,
          tokenIdentifier: `test:${userId}`,
        })
        .action(api.githubUserAuthorizations.revokeViewerGitHubUserAuthorization, {}),
    ).rejects.toThrow("Repository changes are paused for maintenance.");
    expect(githubAuthMocks.auth).not.toHaveBeenCalled();
    await expect(t.run(async (ctx) => await ctx.db.get(authorizationId))).resolves.not.toBeNull();
  });
});

describe("GitHub user authorization identity boundaries", () => {
  it("does not replace the GitHub account that provides access for a Samebase user", async () => {
    const t = makeConvexTest();
    const { authorizationId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "github-switch@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const now = Date.now();
      const authorizationId = await ctx.db.insert("githubUserAuthorizations", {
        userId,
        githubUserId: "301",
        githubUserLogin: "first-user",
        accessToken: "first-access-token",
        accessTokenExpiresAt: now + 60_000,
        refreshToken: "first-refresh-token",
        refreshTokenExpiresAt: now + 120_000,
        createdAt: now,
        updatedAt: now,
      });
      await insertGitHubSignInAccount(ctx, {
        userId,
        githubUserId: "302",
        githubUserLogin: "second-user",
      });
      return { authorizationId, userId };
    });

    await expect(
      t.run(async (ctx) => {
        await upsertGitHubUserAuthorization(ctx.db, {
          userId,
          githubUserId: "302",
          githubUserLogin: "second-user",
          accessToken: "second-access-token",
          accessTokenExpiresAt: Date.now() + 60_000,
          refreshToken: "second-refresh-token",
          refreshTokenExpiresAt: Date.now() + 120_000,
        });
      }),
    ).rejects.toThrow("A different GitHub account already provides access for this account.");

    await expect(t.run(async (ctx) => await ctx.db.get(authorizationId))).resolves.toMatchObject({
      githubUserId: "301",
      githubUserLogin: "first-user",
      accessToken: "first-access-token",
      refreshToken: "first-refresh-token",
    });
  });

  it("does not use one GitHub account for two Samebase users", async () => {
    const t = makeConvexTest();
    const { authorizationId, secondUserId } = await t.run(async (ctx) => {
      const firstUserId = await ctx.db.insert("users", {
        state: "active",
        email: "github-owner@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const secondUserId = await ctx.db.insert("users", {
        state: "active",
        email: "github-other@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const now = Date.now();
      const authorizationId = await ctx.db.insert("githubUserAuthorizations", {
        userId: firstUserId,
        githubUserId: "401",
        githubUserLogin: "shared-user",
        accessToken: "owner-access-token",
        accessTokenExpiresAt: now + 60_000,
        refreshToken: "owner-refresh-token",
        refreshTokenExpiresAt: now + 120_000,
        createdAt: now,
        updatedAt: now,
      });
      await insertGitHubSignInAccount(ctx, {
        userId: secondUserId,
        githubUserId: "401",
        githubUserLogin: "shared-user",
      });
      return { authorizationId, secondUserId };
    });

    await expect(
      t.run(async (ctx) => {
        await upsertGitHubUserAuthorization(ctx.db, {
          userId: secondUserId,
          githubUserId: "401",
          githubUserLogin: "shared-user",
          accessToken: "other-access-token",
          accessTokenExpiresAt: Date.now() + 60_000,
          refreshToken: "other-refresh-token",
          refreshTokenExpiresAt: Date.now() + 120_000,
        });
      }),
    ).rejects.toThrow("This GitHub account already provides access for another Samebase account.");

    const snapshot = await t.run(async (ctx) => ({
      ownerAuthorization: await ctx.db.get(authorizationId),
      otherAuthorization: await ctx.db
        .query("githubUserAuthorizations")
        .withIndex("by_user", (query) => query.eq("userId", secondUserId))
        .unique(),
    }));
    expect(snapshot.ownerAuthorization).toMatchObject({
      githubUserId: "401",
      accessToken: "owner-access-token",
    });
    expect(snapshot.otherAuthorization).toBeNull();
  });

  it("does not authorize a GitHub account that differs from the linked sign-in account", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "github-sign-in@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "github",
        providerAccountId: "501",
        emailVerified: "github-sign-in@example.com",
      });
      return userId;
    });

    await expect(
      t.run(async (ctx) => {
        await upsertGitHubUserAuthorization(ctx.db, {
          userId,
          githubUserId: "502",
          githubUserLogin: "different-user",
          accessToken: "different-access-token",
          accessTokenExpiresAt: Date.now() + 60_000,
          refreshToken: "different-refresh-token",
          refreshTokenExpiresAt: Date.now() + 120_000,
        });
      }),
    ).rejects.toMatchObject({ data: "github-sign-in-mismatch" });

    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("githubUserAuthorizations")
          .withIndex("by_user", (query) => query.eq("userId", userId))
          .unique(),
      ),
    ).resolves.toBeNull();
  });

  it("does not authorize a GitHub sign-in identity that belongs to another Samebase user", async () => {
    const t = makeConvexTest();
    const secondUserId = await t.run(async (ctx) => {
      const firstUserId = await ctx.db.insert("users", {
        state: "active",
        email: "github-sign-in-owner@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const secondUserId = await ctx.db.insert("users", {
        state: "active",
        email: "github-access-candidate@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      await ctx.db.insert("authAccounts", {
        userId: firstUserId,
        provider: "github",
        providerAccountId: "601",
        emailVerified: "github-sign-in-owner@example.com",
      });
      await insertGitHubSignInAccount(ctx, {
        userId: secondUserId,
        githubUserId: "601",
        githubUserLogin: "sign-in-owner",
      });
      return secondUserId;
    });

    await expect(
      t.run(async (ctx) => {
        await upsertGitHubUserAuthorization(ctx.db, {
          userId: secondUserId,
          githubUserId: "601",
          githubUserLogin: "sign-in-owner",
          accessToken: "access-token",
          accessTokenExpiresAt: Date.now() + 60_000,
          refreshToken: "refresh-token",
          refreshTokenExpiresAt: Date.now() + 120_000,
        });
      }),
    ).rejects.toThrow("This GitHub account has conflicting Samebase sign-in records.");

    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("githubUserAuthorizations")
          .withIndex("by_user", (query) => query.eq("userId", secondUserId))
          .unique(),
      ),
    ).resolves.toBeNull();
  });

  it("does not store personal GitHub access without a linked GitHub sign-in method", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "github-sign-in-required@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
    });

    await expect(
      t.run(async (ctx) => {
        await upsertGitHubUserAuthorization(ctx.db, {
          userId,
          githubUserId: "701",
          githubUserLogin: "required-user",
          accessToken: "access-token",
          accessTokenExpiresAt: Date.now() + 60_000,
          refreshToken: "refresh-token",
          refreshTokenExpiresAt: Date.now() + 120_000,
        });
      }),
    ).rejects.toMatchObject({ data: "github-sign-in-required" });
  });

  it("does not use a legacy personal authorization after GitHub sign-in is removed", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "github-use-sign-in-required@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const now = Date.now();
      await ctx.db.insert("githubUserAuthorizations", {
        userId,
        githubUserId: "801",
        githubUserLogin: "legacy-user",
        accessToken: "legacy-access-token",
        accessTokenExpiresAt: now + 60_000,
        refreshToken: "legacy-refresh-token",
        refreshTokenExpiresAt: now + 120_000,
        createdAt: now,
        updatedAt: now,
      });
      return userId;
    });

    await expect(
      t.mutation(internal.githubUserAuthorizations.claimForUse, {
        userId,
        githubUserId: "801",
      }),
    ).rejects.toMatchObject({ data: "github-sign-in-required" });
  });

  it("requires normal maintenance mode for a new direct refresh claim", async () => {
    const { authorizationId, t, userId } = await seedGitHubRefreshCandidate(
      "github-refresh-draining@example.test",
      "904",
    );
    await transitionToDraining(t);

    await expect(
      t.mutation(internal.githubUserAuthorizations.claimForUse, {
        userId,
        githubUserId: "904",
      }),
    ).rejects.toThrow("Repository changes are paused for maintenance.");
    await expect(
      t.run(async (ctx) => await ctx.db.get(authorizationId)),
    ).resolves.not.toHaveProperty("refreshStartedAt");
  });

  it("uses the callback lease to refresh authorization while writes drain", async () => {
    const { authorizationId, t, userId } = await seedGitHubRefreshCandidate(
      "github-refresh-callback@example.test",
      "910",
    );
    const operationId = "github-app-callback:refresh-test";
    const operationName = "github_app_callback";
    const lease = await t.mutation(internal.repositoryMigration.maintenance.claimOperationLease, {
      operationId,
      operationName,
    });
    await transitionToDraining(t);

    const claim = await t.mutation(
      internal.githubUserAuthorizations.claimForAppConnectionUseForOperation,
      {
        userId,
        leaseId: lease.leaseId,
        operationId,
        operationName,
      },
    );
    if (claim.kind !== "claimed") {
      throw new Error("Expected a callback refresh claim.");
    }
    await t.mutation(internal.githubUserAuthorizations.finishRefreshForOperation, {
      leaseId: lease.leaseId,
      operationId,
      operationName,
      authorizationId,
      refreshStartedAt: claim.refreshStartedAt,
      accessToken: "callback-access-token",
      accessTokenExpiresAt: Date.now() + 60_000,
      refreshToken: "callback-refresh-token",
      refreshTokenExpiresAt: Date.now() + 120_000,
    });
    await t.mutation(internal.repositoryMigration.maintenance.releaseOperationLease, {
      leaseId: lease.leaseId,
      operationId,
      operationName,
    });

    await expect(t.run(async (ctx) => await ctx.db.get(authorizationId))).resolves.toMatchObject({
      accessToken: "callback-access-token",
      refreshToken: "callback-refresh-token",
    });
  });

  it("finishes an exact GitHub refresh claim while draining", async () => {
    const { authorizationId, claim, t } = await seedClaimedGitHubRefresh(
      "github-refresh-finish-draining@example.test",
      "905",
    );
    await transitionToDraining(t);

    await expect(
      t.mutation(internal.githubUserAuthorizations.finishRefresh, {
        authorizationId,
        refreshStartedAt: claim.refreshStartedAt,
        accessToken: "new-access-token",
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: "new-refresh-token",
        refreshTokenExpiresAt: Date.now() + 120_000,
      }),
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => await ctx.db.get(authorizationId))).resolves.toMatchObject({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    });
  });

  it("rejects an exact GitHub refresh claim while frozen", async () => {
    const { authorizationId, claim, t } = await seedClaimedGitHubRefresh(
      "github-refresh-frozen@example.test",
      "906",
    );
    await forceFrozenMaintenance(t);

    await expect(
      t.mutation(internal.githubUserAuthorizations.finishRefresh, {
        authorizationId,
        refreshStartedAt: claim.refreshStartedAt,
        accessToken: "new-access-token",
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: "new-refresh-token",
        refreshTokenExpiresAt: Date.now() + 120_000,
      }),
    ).rejects.toThrow("Repository changes are paused for maintenance.");
    await expect(
      t.mutation(internal.githubUserAuthorizations.releaseRefresh, {
        authorizationId,
        refreshStartedAt: claim.refreshStartedAt,
      }),
    ).rejects.toThrow("Repository changes are paused for maintenance.");
  });

  it("uses an active provisioning authority for refresh while draining", async () => {
    const { authorizationId, t, userId } = await seedGitHubRefreshCandidate(
      "github-refresh-workflow@example.test",
      "907",
    );
    const authority = await createProvisioningAuthority(t, userId);
    await transitionToDraining(t);

    const claim = await t.mutation(internal.githubUserAuthorizations.claimForProvisioningRun, {
      runId: authority.runId,
      userId: authority.userId,
      vaultId: authority.vaultId,
      githubUserId: "907",
    });
    if (claim.kind !== "claimed") throw new Error("Expected a workflow refresh claim.");
    await forceFrozenMaintenance(t);
    await expect(
      t.mutation(internal.githubUserAuthorizations.releaseRefreshForProvisioningRun, {
        runId: authority.runId,
        userId: authority.userId,
        vaultId: authority.vaultId,
        authorizationId,
        refreshStartedAt: claim.refreshStartedAt,
      }),
    ).rejects.toThrow("Repository changes are paused for maintenance.");
  });

  it("finishes a claimed refresh during deletion and revokes the stored token", async () => {
    const email = "github-refresh-deleting@example.test";
    const { authorizationId, claim, t, userId } = await seedClaimedGitHubRefresh(email, "901");
    const runId = await startAccountDeletion(t, userId, email);

    await expect(
      t.mutation(internal.githubUserAuthorizations.claimForUse, {
        userId,
        githubUserId: "901",
      }),
    ).rejects.toThrow("An active Samebase user is required.");
    const finishArgs = {
      authorizationId,
      refreshStartedAt: claim.refreshStartedAt,
      accessToken: "new-access-token",
      accessTokenExpiresAt: Date.now() + 60_000,
      refreshToken: "new-refresh-token",
      refreshTokenExpiresAt: Date.now() + 120_000,
    };
    await expect(
      t.mutation(internal.githubUserAuthorizations.finishRefresh, {
        ...finishArgs,
        refreshStartedAt: claim.refreshStartedAt + 1,
      }),
    ).rejects.toThrow("GitHub user authorization refresh lock changed.");
    await t.mutation(internal.githubUserAuthorizations.finishRefresh, finishArgs);

    vi.stubEnv("GITHUB_APP_ID", "42");
    vi.stubEnv("GITHUB_APP_SLUG", "samebase-test");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-id");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "private-key");
    vi.stubEnv("GITHUB_APP_OAUTH_CALLBACK_URL", "https://samebase.test/oauth/github/callback");
    await t.action(internal.githubUserAuthorizations.revokeForAccountDeletion, {
      runId,
      workflowId: accountDeletionWorkflowId,
    });

    expect(githubAuthMocks.createOAuthUserAuth).toHaveBeenCalledWith({
      clientType: "github-app",
      clientId: "client-id",
      clientSecret: "client-secret",
      token: "new-access-token",
    });
    await expect(t.run(async (ctx) => await ctx.db.get(authorizationId))).resolves.toBeNull();
  });

  it("releases a claimed refresh after the Samebase user starts deletion", async () => {
    const email = "github-refresh-release@example.test";
    const { authorizationId, claim, t, userId } = await seedClaimedGitHubRefresh(email, "902");
    await startAccountDeletion(t, userId, email);

    await t.mutation(internal.githubUserAuthorizations.releaseRefresh, {
      authorizationId,
      refreshStartedAt: claim.refreshStartedAt,
    });
    const authorization = await t.run(async (ctx) => await ctx.db.get(authorizationId));
    expect(authorization).toMatchObject({
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
    });
    expect(authorization?.refreshStartedAt).toBeUndefined();
  });

  it("rejects a claimed refresh after terminal cleanup removes its authorization", async () => {
    const { authorizationId, claim, t, userId } = await seedClaimedGitHubRefresh(
      "github-refresh-deleted@example.test",
      "903",
    );
    await t.run(async (ctx) => {
      await ctx.db.delete(authorizationId);
      await ctx.db.replace(userId, { state: "deleted", deletedAt: Date.now() });
    });

    await expect(
      t.mutation(internal.githubUserAuthorizations.finishRefresh, {
        authorizationId,
        refreshStartedAt: claim.refreshStartedAt,
        accessToken: "new-access-token",
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: "new-refresh-token",
        refreshTokenExpiresAt: Date.now() + 120_000,
      }),
    ).rejects.toThrow("GitHub user authorization refresh lock changed.");
    await expect(
      t.mutation(internal.githubUserAuthorizations.releaseRefresh, {
        authorizationId,
        refreshStartedAt: claim.refreshStartedAt,
      }),
    ).resolves.toBeNull();
  });
});
