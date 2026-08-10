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
import { makeConvexTest } from "./test.setup";

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

describe("viewer GitHub user authorization", () => {
  it("returns only the user-facing authorization state, login, and refresh expiry", async () => {
    const t = makeConvexTest();
    const { organizationId, otherOrganizationId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "github-status@example.com",
        isApproved: true,
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
        ctx.db.insert("organizationMemberships", {
          organizationId,
          userId,
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
    const { userId, authorizationId, organizationId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "github-revoke@example.com",
        isApproved: true,
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
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "999",
        githubOwnerType: "user",
        githubOwnerLogin: "another-owner",
        githubOwnerLoginNormalized: "another-owner",
        githubInstallationId: "installation-another-owner",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
        role: "member",
      });
      return { userId, authorizationId, organizationId };
    });
    vi.stubEnv("GITHUB_APP_ID", "42");
    vi.stubEnv("GITHUB_APP_SLUG", "samebase-test");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-id");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "private-key");
    vi.stubEnv("GITHUB_APP_OAUTH_CALLBACK_URL", "https://samebase.test/oauth/github/callback");

    const result = await t
      .withIdentity({
        subject: `${userId}|github-revoke`,
        tokenIdentifier: `test:${userId}`,
      })
      .action(api.githubUserAuthorizations.revokeViewerPersonalRepositoryAuthorization, {
        organizationId,
      });

    expect(result).toBeNull();
    expect(githubAuthMocks.createOAuthUserAuth).toHaveBeenCalledWith({
      clientType: "github-app",
      clientId: "client-id",
      clientSecret: "client-secret",
      token: "revoke-access-token",
    });
    expect(githubAuthMocks.auth).toHaveBeenCalledWith({ type: "deleteAuthorization" });
    await expect(t.run(async (ctx) => await ctx.db.get(authorizationId))).resolves.toBeNull();
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
      });
      const secondUserId = await ctx.db.insert("users", {
        state: "active",
        email: "github-other@example.com",
        isApproved: true,
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
      });
      const secondUserId = await ctx.db.insert("users", {
        state: "active",
        email: "github-access-candidate@example.com",
        isApproved: true,
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

  it("rejects a claimed refresh after the Samebase user becomes deleted", async () => {
    const t = makeConvexTest();
    const { authorizationId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "github-refresh-deleted@example.test",
        isApproved: true,
      });
      await insertGitHubSignInAccount(ctx, {
        userId,
        githubUserId: "901",
        githubUserLogin: "refresh-deleted",
      });
      const now = Date.now();
      const authorizationId = await ctx.db.insert("githubUserAuthorizations", {
        userId,
        githubUserId: "901",
        githubUserLogin: "refresh-deleted",
        accessToken: "old-access-token",
        accessTokenExpiresAt: now - 1,
        refreshToken: "old-refresh-token",
        refreshTokenExpiresAt: now + 120_000,
        createdAt: now,
        updatedAt: now,
      });
      return { authorizationId, userId };
    });
    const claim = await t.mutation(internal.githubUserAuthorizations.claimForUse, {
      userId,
      githubUserId: "901",
    });
    if (claim.kind !== "claimed") throw new Error("Expected a GitHub refresh claim.");
    await t.run(async (ctx) => {
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
    ).rejects.toThrow("An active Samebase user is required.");
    await expect(
      t.mutation(internal.githubUserAuthorizations.releaseRefresh, {
        authorizationId,
        refreshStartedAt: claim.refreshStartedAt,
      }),
    ).rejects.toThrow("An active Samebase user is required.");
  });
});
