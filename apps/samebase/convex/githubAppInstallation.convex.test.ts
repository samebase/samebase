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
import { buildAuthorizationErrorUrl } from "../shared/authorizationError";

async function expectGitHubCompletion(response: Response, returnUrl: string) {
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(html).toContain(`const returnTo = ${JSON.stringify(returnUrl)};`);
  expect(html).toContain('{ type: "github-app-setup-complete", returnTo }');
  expect(html).toContain("window.opener.location.replace(returnTo);");
  expect(html).toContain("window.close();");
  expect(html).toContain("window.location.replace(returnTo);");
  return html;
}

function stubGitHubAppConfiguration() {
  vi.stubEnv("GITHUB_APP_ID", "42");
  vi.stubEnv("GITHUB_APP_SLUG", "samebase-test");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "github-client-id");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "github-client-secret");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "private-key");
  vi.stubEnv("GITHUB_APP_OAUTH_CALLBACK_URL", "https://api.samebase.com/oauth/github/callback");
}

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
    if (result.status !== "stored") {
      throw new Error(`Expected stored GitHub setup, received ${result.status}.`);
    }

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

  it("does not complete an installation after the user loses app creation access", async () => {
    const t = makeConvexTest();
    const { setupStateId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "installation-access-lost@example.com",
        isApproved: true,
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "installation-access-lost-state",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      await ctx.db.patch(userId, { isApproved: false });
      return { setupStateId, userId };
    });

    await expect(
      t.mutation(internal.githubAppInstallation.completeVerifiedSetup, {
        setupStateId,
        state: "installation-access-lost-state",
        installationId: "1002",
        githubOwnerId: "102",
        githubOwnerType: "user",
        githubOwnerLogin: "access-lost-owner",
        githubUserId: "102",
        githubUserLogin: "access-lost-owner",
        accessToken: "access-lost-token",
        accessTokenExpiresAt: Date.now() + 8 * 60 * 60 * 1000,
        refreshToken: "access-lost-refresh-token",
        refreshTokenExpiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000,
      }),
    ).resolves.toEqual({ status: "access_lost" });

    const snapshot = await t.run(async (ctx) => ({
      authorization: await ctx.db
        .query("githubUserAuthorizations")
        .withIndex("by_user", (query) => query.eq("userId", userId))
        .unique(),
      billingAccount: await ctx.db.query("organizationBillingAccounts").first(),
      membership: await ctx.db.query("organizationMemberships").first(),
      organization: await ctx.db.query("organizations").first(),
      setupState: await ctx.db.get(setupStateId),
    }));
    expect(snapshot).toEqual({
      authorization: null,
      billingAccount: null,
      membership: null,
      organization: null,
      setupState: null,
    });
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

    const authorizationSetup = await t
      .withIdentity({
        subject: `${userId}|authorization-session`,
        tokenIdentifier: `test:${userId}`,
      })
      .mutation(api.githubAppInstallation.getGitHubUserAuthorizationUrl, {
        returnToPath: "/settings",
      });
    expect(authorizationSetup.callbackOrigin).toBe("https://api.samebase.com");
    const parsedAuthorizationUrl = new URL(authorizationSetup.setupUrl);
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
    ).resolves.toEqual({ status: "access_lost" });

    const snapshot = await t.run(async (ctx) => ({
      authorization: await ctx.db
        .query("githubUserAuthorizations")
        .withIndex("by_user", (query) => query.eq("userId", userId))
        .unique(),
      setupState: await ctx.db.get(setupStateId),
    }));
    expect(snapshot).toEqual({ authorization: null, setupState: null });
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

    await expectGitHubCompletion(response, "https://samebase.com/settings");
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

    await expectGitHubCompletion(
      response,
      buildAuthorizationErrorUrl("https://samebase.com/settings", {
        provider: "github-user",
        code: "canceled",
      }),
    );
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

  it("keeps both organizations unchanged and uses the current route when reconnect selects another owner", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "reconnect-mismatch@example.com",
        isApproved: true,
      });
    });
    const first = await t.mutation(internal.organizations.createOrReconnectVerifiedOrganization, {
      userId,
      githubOwnerId: "owner-a",
      githubOwnerType: "organization",
      githubOwnerLogin: "Owner-A",
      githubInstallationId: "installation-a",
    });
    const second = await t.mutation(internal.organizations.createOrReconnectVerifiedOrganization, {
      userId,
      githubOwnerId: "owner-b",
      githubOwnerType: "organization",
      githubOwnerLogin: "Owner-B",
      githubInstallationId: "installation-b",
    });
    stubGitHubAppConfiguration();
    const reconnectSetup = await t
      .withIdentity({
        subject: `${userId}|reconnect-session`,
        tokenIdentifier: `test:${userId}`,
      })
      .mutation(api.githubAppInstallation.getGitHubAppReconnectUrl, {
        organizationId: first.organizationId,
        returnToPath: "/org/owner-a/settings?prod-ui#github",
      });
    expect(reconnectSetup.callbackOrigin).toBe("https://api.samebase.com");
    const state = new URL(reconnectSetup.setupUrl).searchParams.get("state");
    if (state === null) {
      throw new Error("GitHub reconnect state is required.");
    }
    const setupState = await t.run(async (ctx) => {
      return await ctx.db
        .query("githubAppSetupStates")
        .withIndex("by_state", (query) => query.eq("state", state))
        .unique();
    });
    expect(setupState).toMatchObject({
      organizationId: first.organizationId,
      purpose: "installation_reconnect",
      returnToPath: "/org/owner-a/settings?prod-ui#github",
    });
    if (setupState === null) {
      throw new Error("GitHub reconnect setup state is required.");
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(first.organizationId, { githubOwnerLogin: "Renamed-Owner-A" });
    });
    const now = Date.now();
    githubAppMocks.verifyGitHubAppInstallation.mockResolvedValue({
      installationId: "replacement-installation",
      githubOwnerId: "owner-b",
      githubOwnerType: "organization",
      githubOwnerLogin: "Owner-B",
      githubUserId: "viewer",
      githubUserLogin: "viewer",
      accessToken: "new-access-token",
      accessTokenExpiresAt: now + 8 * 60 * 60 * 1000,
      refreshToken: "new-refresh-token",
      refreshTokenExpiresAt: now + 180 * 24 * 60 * 60 * 1000,
    });
    vi.stubEnv("SITE_URL", "https://samebase.com");

    const response = await t.fetch(
      `/oauth/github/callback?code=provider-code&installation_id=9999&state=${state}`,
    );
    const html = await expectGitHubCompletion(
      response,
      buildAuthorizationErrorUrl(
        "https://samebase.com/org/renamed-owner-a/settings?prod-ui#github",
        {
          provider: "github-app",
          code: "target-mismatch",
        },
      ),
    );
    const snapshot = await t.run(async (ctx) => ({
      first: await ctx.db.get(first.organizationId),
      second: await ctx.db.get(second.organizationId),
      setupState: await ctx.db.get(setupState._id),
    }));
    expect(snapshot.first).toMatchObject({
      githubOwnerId: "owner-a",
      githubOwnerLogin: "Renamed-Owner-A",
      githubInstallationId: "installation-a",
    });
    expect(snapshot.second).toMatchObject({
      githubOwnerId: "owner-b",
      githubOwnerLogin: "Owner-B",
      githubInstallationId: "installation-b",
    });
    expect(snapshot.setupState).toBeNull();
    expect(html).not.toContain("provider-code");
    expect(html).not.toContain("new-access-token");
  });

  it("keeps the current user authorization after GitHub verification fails", async () => {
    const t = makeConvexTest();
    const { setupStateId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "verification-failure@example.com",
        isApproved: true,
      });
      await ctx.db.insert("githubUserAuthorizations", {
        userId,
        githubUserId: "current-user",
        githubUserLogin: "current-login",
        accessToken: "current-access-token",
        accessTokenExpiresAt: Date.now() + 8 * 60 * 60 * 1000,
        refreshToken: "current-refresh-token",
        refreshTokenExpiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000,
        createdAt: 1,
        updatedAt: 1,
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "verification-failure-state",
        purpose: "user_authorization",
        returnToPath: "/settings?prod-ui#github",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      return { setupStateId, userId };
    });
    githubAppMocks.verifyGitHubUserAuthorization.mockRejectedValue(
      new Error("provider-secret-detail"),
    );
    vi.stubEnv("SITE_URL", "https://samebase.com");

    const response = await t.fetch(
      "/oauth/github/callback?code=provider-code&state=verification-failure-state",
    );
    const html = await expectGitHubCompletion(
      response,
      buildAuthorizationErrorUrl("https://samebase.com/settings?prod-ui#github", {
        provider: "github-user",
        code: "failed",
      }),
    );
    const snapshot = await t.run(async (ctx) => ({
      authorization: await ctx.db
        .query("githubUserAuthorizations")
        .withIndex("by_user", (query) => query.eq("userId", userId))
        .unique(),
      setupState: await ctx.db.get(setupStateId),
    }));
    expect(snapshot.authorization).toMatchObject({
      githubUserId: "current-user",
      githubUserLogin: "current-login",
      accessToken: "current-access-token",
      refreshToken: "current-refresh-token",
    });
    expect(snapshot.setupState).toBeNull();
    expect(html).not.toContain("provider-code");
    expect(html).not.toContain("provider-secret-detail");
  });
});
