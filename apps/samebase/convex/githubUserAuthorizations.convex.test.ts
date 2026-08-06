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

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

beforeEach(() => {
  vi.clearAllMocks();
  githubAuthMocks.createOAuthUserAuth.mockReturnValue(githubAuthMocks.auth);
  githubAuthMocks.auth.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("viewer GitHub user authorization", () => {
  it("returns only the user-facing authorization state, login, and refresh expiry", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "github-status@example.com",
        isApproved: true,
      });
    });
    const asUser = t.withIdentity({
      subject: `${userId}|github-status`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(asUser.query(api.githubUserAuthorizations.getViewerStatus, {})).resolves.toEqual({
      status: "not_connected",
    });

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

    await expect(asUser.query(api.githubUserAuthorizations.getViewerStatus, {})).resolves.toEqual({
      status: "authorized",
      githubUserLogin: "octocat",
      refreshTokenExpiresAt,
    });
  });

  it("routes viewer revocation through the existing provider revoke and delete flow", async () => {
    const t = makeConvexTest();
    const { userId, authorizationId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
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
      return { userId, authorizationId };
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
      .action(api.githubUserAuthorizations.revokeViewerAuthorization, {});

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
