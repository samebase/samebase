import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubAppMocks = vi.hoisted(() => ({
  verifyGitHubAppInstallation: vi.fn(),
  verifyGitHubUserAuthorization: vi.fn(),
}));

vi.mock("./githubApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./githubApp")>();
  return {
    ...actual,
    verifyGitHubAppInstallation: githubAppMocks.verifyGitHubAppInstallation,
    verifyGitHubUserAuthorization: githubAppMocks.verifyGitHubUserAuthorization,
  };
});

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verified GitHub App installation completion", () => {
  it("atomically creates a personal organization, saves its user authorization, and consumes state", async () => {
    const t = makeConvexTest();
    const { setupStateId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "owner@example.com",
        isApproved: true,
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "setup-state",
        returnToPath: "/",
        createdAt: 1,
        expiresAt: Date.now() + 60_000,
      });
      return { setupStateId, userId };
    });

    const result = await t.mutation(internal.githubAppInstallation.completeVerifiedSetup, {
      setupStateId,
      state: "setup-state",
      installationId: "1001",
      githubOwnerId: "101",
      githubOwnerType: "user",
      githubOwnerLogin: "owner",
      githubUserId: "101",
      githubUserLogin: "owner",
      accessToken: "access-token",
      accessTokenExpiresAt: Date.now() + 8 * 60 * 60 * 1000,
      refreshToken: "refresh-token",
      refreshTokenExpiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000,
    });

    const snapshot = await t.run(async (ctx) => {
      return {
        organization: await ctx.db.get(result.organizationId),
        authorization: await ctx.db
          .query("githubUserAuthorizations")
          .withIndex("by_user", (query) => query.eq("userId", userId))
          .unique(),
        setupState: await ctx.db.get(setupStateId),
      };
    });

    expect(result.created).toBe(true);
    expect(snapshot.organization).toMatchObject({
      githubOwnerId: "101",
      githubInstallationId: "1001",
    });
    expect(snapshot.authorization).toMatchObject({
      userId,
      githubUserId: "101",
      githubUserLogin: "owner",
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    expect(snapshot.setupState).toBeNull();
    await expect(
      t
        .withIdentity({
          subject: `${userId}|test-session`,
          tokenIdentifier: `test:${userId}`,
        })
        .query(api.organizations.listForViewer, {}),
    ).resolves.toMatchObject([{ canCreateRepository: true }]);
  });

  it("authorizes the current GitHub user without creating an organization", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "authorization@example.com",
        isApproved: true,
      });
    });
    vi.stubEnv("GITHUB_APP_ID", "42");
    vi.stubEnv("GITHUB_APP_SLUG", "samebase-test");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "github-client-id");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "github-client-secret");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "private-key");
    vi.stubEnv("GITHUB_APP_OAUTH_CALLBACK_URL", "https://api.samebase.com/oauth/github/callback");

    const authorizationUrl = await t
      .withIdentity({
        subject: `${userId}|authorization-session`,
        tokenIdentifier: `test:${userId}`,
      })
      .mutation(api.githubAppInstallation.getGitHubUserAuthorizationUrl, {
        returnToPath: "/settings",
      });
    const parsedAuthorizationUrl = new URL(authorizationUrl);
    expect(`${parsedAuthorizationUrl.origin}${parsedAuthorizationUrl.pathname}`).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(parsedAuthorizationUrl.searchParams.get("client_id")).toBe("github-client-id");
    expect(parsedAuthorizationUrl.searchParams.get("redirect_uri")).toBe(
      "https://api.samebase.com/oauth/github/callback",
    );
    const state = parsedAuthorizationUrl.searchParams.get("state");
    expect(state).not.toBeNull();
    if (state === null) {
      throw new Error("GitHub authorization state is required.");
    }

    const setupState = await t.run(async (ctx) => {
      return await ctx.db
        .query("githubAppSetupStates")
        .withIndex("by_state", (query) => query.eq("state", state))
        .unique();
    });
    expect(setupState).toMatchObject({
      userId,
      purpose: "user_authorization",
      returnToPath: "/settings",
    });
    if (setupState === null) {
      throw new Error("GitHub authorization setup state is required.");
    }

    await t.mutation(internal.githubAppInstallation.completeUserAuthorization, {
      setupStateId: setupState._id,
      state,
      githubUserId: "202",
      githubUserLogin: "alice",
      accessToken: "user-access-token",
      accessTokenExpiresAt: Date.now() + 8 * 60 * 60 * 1000,
      refreshToken: "user-refresh-token",
      refreshTokenExpiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000,
    });

    const snapshot = await t.run(async (ctx) => ({
      authorization: await ctx.db
        .query("githubUserAuthorizations")
        .withIndex("by_user", (query) => query.eq("userId", userId))
        .unique(),
      organizations: await ctx.db.query("organizations").take(1),
      memberships: await ctx.db.query("organizationMemberships").take(1),
      setupState: await ctx.db.get(setupState._id),
    }));
    expect(snapshot.authorization).toMatchObject({
      userId,
      githubUserId: "202",
      githubUserLogin: "alice",
      accessToken: "user-access-token",
      refreshToken: "user-refresh-token",
    });
    expect(snapshot.organizations).toEqual([]);
    expect(snapshot.memberships).toEqual([]);
    expect(snapshot.setupState).toBeNull();
  });

  it("denies personal GitHub authorization setup to a pending user", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "pending-authorization@example.com",
        isApproved: false,
      });
    });
    const asPendingUser = t.withIdentity({
      subject: `${userId}|pending-authorization-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(
      asPendingUser.mutation(api.githubAppInstallation.getGitHubUserAuthorizationUrl, {
        returnToPath: "/settings",
      }),
    ).rejects.toThrowError("Access denied");

    const setupState = await t.run(async (ctx) => {
      return await ctx.db.query("githubAppSetupStates").first();
    });
    expect(setupState).toBeNull();
  });

  it("does not store GitHub credentials after the user loses provider access", async () => {
    const t = makeConvexTest();
    const { setupStateId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "authorization-access-lost@example.com",
        isApproved: true,
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "authorization-access-lost-state",
        purpose: "user_authorization",
        returnToPath: "/settings",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      await ctx.db.patch(userId, { isApproved: false });
      return { setupStateId, userId };
    });

    await expect(
      t.mutation(internal.githubAppInstallation.completeUserAuthorization, {
        setupStateId,
        state: "authorization-access-lost-state",
        githubUserId: "404",
        githubUserLogin: "access-lost-user",
        accessToken: "access-lost-token",
        accessTokenExpiresAt: Date.now() + 8 * 60 * 60 * 1000,
        refreshToken: "access-lost-refresh-token",
        refreshTokenExpiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000,
      }),
    ).rejects.toThrowError("Access denied");

    const authorization = await t.run(async (ctx) => {
      return await ctx.db
        .query("githubUserAuthorizations")
        .withIndex("by_user", (query) => query.eq("userId", userId))
        .unique();
    });
    expect(authorization).toBeNull();
  });

  it("routes the shared GitHub callback by the user authorization purpose", async () => {
    const t = makeConvexTest();
    const { setupStateId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "authorization-callback@example.com",
        isApproved: true,
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "authorization-callback-state",
        purpose: "user_authorization",
        returnToPath: "/settings",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      return { setupStateId, userId };
    });
    const now = Date.now();
    githubAppMocks.verifyGitHubUserAuthorization.mockResolvedValue({
      githubUserId: "303",
      githubUserLogin: "callback-user",
      accessToken: "callback-access-token",
      accessTokenExpiresAt: now + 8 * 60 * 60 * 1000,
      refreshToken: "callback-refresh-token",
      refreshTokenExpiresAt: now + 180 * 24 * 60 * 60 * 1000,
    });
    vi.stubEnv("SITE_URL", "https://samebase.com");

    const response = await t.fetch(
      "/oauth/github/callback?code=authorization-code&state=authorization-callback-state",
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("https://samebase.com/settings");
    expect(githubAppMocks.verifyGitHubUserAuthorization).toHaveBeenCalledWith({
      code: "authorization-code",
      state: "authorization-callback-state",
    });
    const snapshot = await t.run(async (ctx) => ({
      authorization: await ctx.db
        .query("githubUserAuthorizations")
        .withIndex("by_user", (query) => query.eq("userId", userId))
        .unique(),
      organization: await ctx.db.query("organizations").first(),
      setupState: await ctx.db.get(setupStateId),
    }));
    expect(snapshot.authorization).toMatchObject({
      githubUserId: "303",
      githubUserLogin: "callback-user",
    });
    expect(snapshot.organization).toBeNull();
    expect(snapshot.setupState).toBeNull();
  });

  it("consumes canceled user authorization state and returns through user settings", async () => {
    const t = makeConvexTest();
    const { setupStateId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "authorization-canceled@example.com",
        isApproved: true,
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "authorization-canceled-state",
        purpose: "user_authorization",
        returnToPath: "/settings",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      return { setupStateId, userId };
    });
    vi.stubEnv("SITE_URL", "https://samebase.com");

    const response = await t.fetch(
      "/oauth/github/callback?error=access_denied&state=authorization-canceled-state",
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("https://samebase.com/settings");
    expect(githubAppMocks.verifyGitHubAppInstallation).not.toHaveBeenCalled();
    expect(githubAppMocks.verifyGitHubUserAuthorization).not.toHaveBeenCalled();
    const snapshot = await t.run(async (ctx) => ({
      authorization: await ctx.db
        .query("githubUserAuthorizations")
        .withIndex("by_user", (query) => query.eq("userId", userId))
        .unique(),
      membership: await ctx.db
        .query("organizationMemberships")
        .withIndex("by_user", (query) => query.eq("userId", userId))
        .first(),
      organization: await ctx.db.query("organizations").first(),
      setupState: await ctx.db.get(setupStateId),
    }));
    expect(snapshot.authorization).toBeNull();
    expect(snapshot.membership).toBeNull();
    expect(snapshot.organization).toBeNull();
    expect(snapshot.setupState).toBeNull();

    const replayResponse = await t.fetch(
      "/oauth/github/callback?error=access_denied&state=authorization-canceled-state",
    );
    expect(replayResponse.status).toBe(400);
    await expect(replayResponse.text()).resolves.toBe("Invalid GitHub App setup state");
  });
});
