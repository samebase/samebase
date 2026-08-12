import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubAppMocks = vi.hoisted(() => ({
  revokeGitHubAppUserToken: vi.fn(),
  verifyGitHubAppConnectionInstallation: vi.fn(),
  verifyGitHubUserAuthorization: vi.fn(),
}));

vi.mock("./githubApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./githubApp")>();
  return {
    ...actual,
    revokeGitHubAppUserToken: githubAppMocks.revokeGitHubAppUserToken,
    verifyGitHubAppConnectionInstallation: githubAppMocks.verifyGitHubAppConnectionInstallation,
    verifyGitHubUserAuthorization: githubAppMocks.verifyGitHubUserAuthorization,
  };
});

import { buildAuthorizationErrorUrl } from "../shared/authorizationError";
import { buildGitHubOrganizationProvidersReturnUrl } from "../shared/githubApp";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { makeConvexTest } from "./test.setup";

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

async function insertUser(ctx: MutationCtx, email: string): Promise<Id<"users">> {
  return await ctx.db.insert("users", {
    state: "active",
    email,
    isApproved: true,
  });
}

async function insertGitHubSignInAccount(
  ctx: MutationCtx,
  args: { githubUserId: string; githubUserLogin: string; userId: Id<"users"> },
) {
  return await ctx.db.insert("authAccounts", {
    userId: args.userId,
    provider: "github",
    providerAccountId: args.githubUserId,
    emailVerified: `${args.githubUserLogin}@example.com`,
    githubLogin: args.githubUserLogin,
  });
}

async function insertGitHubUserAuthorization(
  ctx: MutationCtx,
  args: {
    accessToken?: string;
    githubUserId: string;
    githubUserLogin: string;
    userId: Id<"users">;
  },
) {
  const now = Date.now();
  return await ctx.db.insert("githubUserAuthorizations", {
    userId: args.userId,
    githubUserId: args.githubUserId,
    githubUserLogin: args.githubUserLogin,
    accessToken: args.accessToken ?? `${args.githubUserLogin}-access-token`,
    accessTokenExpiresAt: now + 8 * 60 * 60 * 1000,
    refreshToken: `${args.githubUserLogin}-refresh-token`,
    refreshTokenExpiresAt: now + 180 * 24 * 60 * 60 * 1000,
    createdAt: now,
    updatedAt: now,
  });
}

async function insertAuthorizedUser(
  ctx: MutationCtx,
  args: { email: string; githubUserId: string; githubUserLogin: string },
) {
  const userId = await insertUser(ctx, args.email);
  await insertGitHubSignInAccount(ctx, { ...args, userId });
  const authorizationId = await insertGitHubUserAuthorization(ctx, { ...args, userId });
  return { authorizationId, userId };
}

function asUser(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|github-app-installation-test-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GITHUB_APP_ID", "42");
  vi.stubEnv("GITHUB_APP_SLUG", "samebase-test");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "github-client-id");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "github-client-secret");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "private-key");
  vi.stubEnv("GITHUB_APP_OAUTH_CALLBACK_URL", "https://api.samebase.com/oauth/github/callback");
  vi.stubEnv("SITE_URL", "https://samebase.com");
  githubAppMocks.revokeGitHubAppUserToken.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GitHub App setup", () => {
  it("requires a linked GitHub sign-in before direct authorization", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => await insertUser(ctx, "no-github@example.test"));

    await expect(
      asUser(t, userId).mutation(api.githubAppInstallation.getGitHubUserAuthorizationUrl, {
        returnToPath: "/connect-organization",
      }),
    ).rejects.toThrow("A linked GitHub sign-in is required.");
    await expect(
      t.run(async (ctx) => await ctx.db.query("githubAppSetupStates").collect()),
    ).resolves.toEqual([]);
  });

  it("creates target-neutral direct authorization state for the linked GitHub identity", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "authorization-start@example.test");
      await insertGitHubSignInAccount(ctx, {
        userId,
        githubUserId: "authorization-user-id",
        githubUserLogin: "authorization-user",
      });
      return userId;
    });

    const result = await asUser(t, userId).mutation(
      api.githubAppInstallation.getGitHubUserAuthorizationUrl,
      { returnToPath: "/connect-organization?prod-ui" },
    );
    const setupUrl = new URL(result.setupUrl);
    const state = setupUrl.searchParams.get("state");
    expect(setupUrl.origin).toBe("https://github.com");
    expect(state).not.toBeNull();
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("githubAppSetupStates")
          .withIndex("by_state", (query) => query.eq("state", state ?? ""))
          .unique(),
      ),
    ).resolves.toMatchObject({
      userId,
      purpose: "user_authorization",
      githubSignInProviderAccountId: "authorization-user-id",
      returnToPath: "/connect-organization?prod-ui",
    });
  });

  it("requires the durable authorization before App installation setup", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "installation-start@example.test");
      await insertGitHubSignInAccount(ctx, {
        userId,
        githubUserId: "installation-user-id",
        githubUserLogin: "installation-user",
      });
      return userId;
    });

    await expect(
      asUser(t, userId).mutation(api.githubAppInstallation.getGitHubAppInstallationUrl, {
        returnToPath: "/connect-organization",
      }),
    ).rejects.toThrow("github-authorization-required");
  });

  it("requires fresh durable authorization before App installation setup", async () => {
    const t = makeConvexTest();
    const { authorizationId, userId } = await t.run(async (ctx) => {
      return await insertAuthorizedUser(ctx, {
        email: "expired-installation-start@example.test",
        githubUserId: "expired-installation-user-id",
        githubUserLogin: "expired-installation-user",
      });
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(authorizationId, { refreshTokenExpiresAt: Date.now() - 1 });
    });

    await expect(
      asUser(t, userId).mutation(api.githubAppInstallation.getGitHubAppInstallationUrl, {
        returnToPath: "/connect-organization",
      }),
    ).rejects.toThrow("github-authorization-required");
  });

  it("installs an organization with the saved authorization and issues no second user token", async () => {
    const t = makeConvexTest();
    const { authorizationId, setupStateId, userId } = await t.run(async (ctx) => {
      const { authorizationId, userId } = await insertAuthorizedUser(ctx, {
        email: "organization-installer@example.test",
        githubUserId: "organization-admin-id",
        githubUserLogin: "organization-admin",
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "organization-installation-state",
        purpose: "installation",
        githubSignInProviderAccountId: "organization-admin-id",
        returnToPath: "/connect-organization?prod-ui",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      return { authorizationId, setupStateId, userId };
    });
    githubAppMocks.verifyGitHubAppConnectionInstallation.mockResolvedValue({
      installationId: "5001",
      githubOwnerId: "organization-owner-id",
      githubOwnerType: "organization",
      githubOwnerLogin: "organization-owner",
      canManage: true,
    });

    const response = await t.fetch(
      "/oauth/github/callback?installation_id=5001&state=organization-installation-state",
    );
    const html = await expectGitHubCompletion(
      response,
      "https://samebase.com/connect-organization?prod-ui",
    );
    const snapshot = await t.run(async (ctx) => ({
      authorization: await ctx.db.get(authorizationId),
      membership: await ctx.db
        .query("organizationMemberships")
        .withIndex("by_user", (query) => query.eq("userId", userId))
        .unique(),
      organization: await ctx.db.query("organizations").first(),
      setupState: await ctx.db.get(setupStateId),
    }));
    expect(snapshot.authorization).toMatchObject({
      githubUserId: "organization-admin-id",
      accessToken: "organization-admin-access-token",
    });
    expect(snapshot.organization).toMatchObject({
      githubOwnerId: "organization-owner-id",
      githubInstallationId: "5001",
    });
    expect(snapshot.membership).toMatchObject({ userId, role: "owner" });
    expect(snapshot.setupState).toBeNull();
    expect(githubAppMocks.verifyGitHubAppConnectionInstallation).toHaveBeenCalledWith({
      octokit: expect.any(Object),
      githubUserId: "organization-admin-id",
      installationId: "5001",
    });
    expect(githubAppMocks.verifyGitHubUserAuthorization).not.toHaveBeenCalled();
    expect(githubAppMocks.revokeGitHubAppUserToken).not.toHaveBeenCalled();
    expect(html).not.toContain("organization-admin-access-token");
  });

  it("does not install after the durable authorization is revoked during verification", async () => {
    const t = makeConvexTest();
    const { authorizationId, setupStateId } = await t.run(async (ctx) => {
      const { authorizationId, userId } = await insertAuthorizedUser(ctx, {
        email: "revoked-during-install@example.test",
        githubUserId: "revoked-install-user-id",
        githubUserLogin: "revoked-install-user",
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "revoked-during-install-state",
        purpose: "installation",
        githubSignInProviderAccountId: "revoked-install-user-id",
        returnToPath: "/connect-organization",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      return { authorizationId, setupStateId };
    });
    await t.run(async (ctx) => await ctx.db.delete(authorizationId));

    await expect(
      t.mutation(internal.githubAppInstallation.completeVerifiedSetup, {
        setupStateId,
        state: "revoked-during-install-state",
        installationId: "revoked-installation",
        githubOwnerId: "revoked-owner-id",
        githubOwnerType: "organization",
        githubOwnerLogin: "Revoked-Owner",
        githubUserId: "revoked-install-user-id",
      }),
    ).resolves.toEqual({ status: "authorization_required" });
    await expect(
      t.run(async (ctx) => ({
        organization: await ctx.db.query("organizations").first(),
        setupState: await ctx.db.get(setupStateId),
      })),
    ).resolves.toEqual({ organization: null, setupState: null });
  });

  it("reconnects the same organization with the saved authorization", async () => {
    const t = makeConvexTest();
    const { organizationId, setupStateId } = await t.run(async (ctx) => {
      const { userId } = await insertAuthorizedUser(ctx, {
        email: "reconnect-owner@example.test",
        githubUserId: "reconnect-user-id",
        githubUserLogin: "reconnect-user",
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "reconnect-owner-id",
        githubOwnerType: "organization",
        githubOwnerLogin: "Reconnect-Owner",
        githubOwnerLoginNormalized: "reconnect-owner",
        githubInstallationId: "old-installation",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
        role: "owner",
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "reconnect-state",
        purpose: "installation_reconnect",
        organizationId,
        githubSignInProviderAccountId: "reconnect-user-id",
        returnToPath: "/org/reconnect-owner/providers?prod-ui",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      return { organizationId, setupStateId };
    });
    githubAppMocks.verifyGitHubAppConnectionInstallation.mockResolvedValue({
      installationId: "new-installation",
      githubOwnerId: "reconnect-owner-id",
      githubOwnerType: "organization",
      githubOwnerLogin: "Reconnect-Owner",
      canManage: true,
    });

    const response = await t.fetch(
      "/oauth/github/callback?installation_id=5004&state=reconnect-state",
    );
    await expectGitHubCompletion(
      response,
      "https://samebase.com/org/reconnect-owner/providers?prod-ui",
    );
    await expect(
      t.run(async (ctx) => ({
        organization: await ctx.db.get(organizationId),
        setupState: await ctx.db.get(setupStateId),
      })),
    ).resolves.toMatchObject({
      organization: { githubInstallationId: "new-installation" },
      setupState: null,
    });
    expect(githubAppMocks.verifyGitHubUserAuthorization).not.toHaveBeenCalled();
  });

  it("keeps an existing organization unchanged when the installer lacks Samebase owner access", async () => {
    const t = makeConvexTest();
    const { installerUserId, organizationId, setupStateId } = await t.run(async (ctx) => {
      const ownerUserId = await insertUser(ctx, "existing-owner@example.test");
      const { userId: installerUserId } = await insertAuthorizedUser(ctx, {
        email: "existing-installer@example.test",
        githubUserId: "existing-admin-id",
        githubUserLogin: "existing-admin",
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "existing-owner-id",
        githubOwnerType: "organization",
        githubOwnerLogin: "Existing-Owner",
        githubOwnerLoginNormalized: "existing-owner",
        githubInstallationId: "existing-installation",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: ownerUserId,
        role: "owner",
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId: installerUserId,
        state: "existing-installation-state",
        purpose: "installation",
        githubSignInProviderAccountId: "existing-admin-id",
        returnToPath: "/connect-organization?prod-ui",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      return { installerUserId, organizationId, setupStateId };
    });
    githubAppMocks.verifyGitHubAppConnectionInstallation.mockResolvedValue({
      installationId: "replacement-installation",
      githubOwnerId: "existing-owner-id",
      githubOwnerType: "organization",
      githubOwnerLogin: "Existing-Owner",
      canManage: true,
    });

    const response = await t.fetch(
      "/oauth/github/callback?installation_id=5002&state=existing-installation-state",
    );
    await expectGitHubCompletion(
      response,
      buildAuthorizationErrorUrl(
        buildGitHubOrganizationProvidersReturnUrl({
          githubOwnerLogin: "Existing-Owner",
          previousReturnUrl: "https://samebase.com/connect-organization?prod-ui",
        }),
        { provider: "github-app", code: "organization-owner-required" },
      ),
    );
    const snapshot = await t.run(async (ctx) => ({
      installerMembership: await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", organizationId).eq("userId", installerUserId),
        )
        .unique(),
      organization: await ctx.db.get(organizationId),
      setupState: await ctx.db.get(setupStateId),
    }));
    expect(snapshot.installerMembership).toBeNull();
    expect(snapshot.organization).toMatchObject({ githubInstallationId: "existing-installation" });
    expect(snapshot.setupState).toBeNull();
    expect(githubAppMocks.verifyGitHubUserAuthorization).not.toHaveBeenCalled();
  });

  it("stores direct authorization and returns without a credential URL parameter", async () => {
    const t = makeConvexTest();
    const { setupStateId, userId } = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "authorization-callback@example.test");
      await insertGitHubSignInAccount(ctx, {
        userId,
        githubUserId: "callback-user-id",
        githubUserLogin: "callback-user",
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "authorization-callback-state",
        purpose: "user_authorization",
        githubSignInProviderAccountId: "callback-user-id",
        returnToPath: "/connect-organization?prod-ui#installations",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      return { setupStateId, userId };
    });
    const now = Date.now();
    githubAppMocks.verifyGitHubUserAuthorization.mockResolvedValue({
      githubUserId: "callback-user-id",
      githubUserLogin: "callback-user",
      accessToken: "callback-access-token",
      accessTokenExpiresAt: now + 8 * 60 * 60 * 1000,
      refreshToken: "callback-refresh-token",
      refreshTokenExpiresAt: now + 180 * 24 * 60 * 60 * 1000,
    });

    const response = await t.fetch(
      "/oauth/github/callback?code=authorization-code&state=authorization-callback-state",
    );
    const html = await expectGitHubCompletion(
      response,
      "https://samebase.com/connect-organization?prod-ui#installations",
    );
    const snapshot = await t.run(async (ctx) => ({
      authorization: await ctx.db
        .query("githubUserAuthorizations")
        .withIndex("by_user", (query) => query.eq("userId", userId))
        .unique(),
      setupState: await ctx.db.get(setupStateId),
    }));
    expect(snapshot.authorization).toMatchObject({
      githubUserId: "callback-user-id",
      accessToken: "callback-access-token",
    });
    expect(snapshot.setupState).toBeNull();
    expect(githubAppMocks.verifyGitHubUserAuthorization).toHaveBeenCalledWith({
      code: "authorization-code",
      state: "authorization-callback-state",
    });
    expect(githubAppMocks.revokeGitHubAppUserToken).not.toHaveBeenCalled();
    expect(html).not.toContain("github-connection-session");
    expect(html).not.toContain("callback-access-token");
    expect(html).not.toContain("callback-refresh-token");
  });

  it("revokes the displaced access token when direct authorization rotates credentials", async () => {
    const t = makeConvexTest();
    const { setupStateId, userId } = await t.run(async (ctx) => {
      const { userId } = await insertAuthorizedUser(ctx, {
        email: "authorization-rotation@example.test",
        githubUserId: "rotation-user-id",
        githubUserLogin: "rotation-user",
      });
      const authorization = await ctx.db
        .query("githubUserAuthorizations")
        .withIndex("by_user", (query) => query.eq("userId", userId))
        .unique();
      if (authorization === null) {
        throw new Error("GitHub authorization fixture is missing.");
      }
      await ctx.db.patch(authorization._id, { accessToken: "displaced-access-token" });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "authorization-rotation-state",
        purpose: "user_authorization",
        githubSignInProviderAccountId: "rotation-user-id",
        returnToPath: "/connect-organization",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      return { setupStateId, userId };
    });
    const now = Date.now();
    githubAppMocks.verifyGitHubUserAuthorization.mockResolvedValue({
      githubUserId: "rotation-user-id",
      githubUserLogin: "rotation-user",
      accessToken: "replacement-access-token",
      accessTokenExpiresAt: now + 8 * 60 * 60 * 1000,
      refreshToken: "replacement-refresh-token",
      refreshTokenExpiresAt: now + 180 * 24 * 60 * 60 * 1000,
    });

    const response = await t.fetch(
      "/oauth/github/callback?code=rotation-code&state=authorization-rotation-state",
    );
    await expectGitHubCompletion(response, "https://samebase.com/connect-organization");
    await expect(
      t.run(async (ctx) => ({
        authorization: await ctx.db
          .query("githubUserAuthorizations")
          .withIndex("by_user", (query) => query.eq("userId", userId))
          .unique(),
        setupState: await ctx.db.get(setupStateId),
      })),
    ).resolves.toMatchObject({
      authorization: { accessToken: "replacement-access-token" },
      setupState: null,
    });
    expect(githubAppMocks.revokeGitHubAppUserToken).toHaveBeenCalledOnce();
    expect(githubAppMocks.revokeGitHubAppUserToken).toHaveBeenCalledWith("displaced-access-token");
  });

  it("rejects a different GitHub user and revokes only the uncommitted token", async () => {
    const t = makeConvexTest();
    const { setupStateId, userId } = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "authorization-mismatch@example.test");
      await insertGitHubSignInAccount(ctx, {
        userId,
        githubUserId: "expected-user-id",
        githubUserLogin: "expected-user",
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "authorization-mismatch-state",
        purpose: "user_authorization",
        githubSignInProviderAccountId: "expected-user-id",
        returnToPath: "/connect-organization",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      return { setupStateId, userId };
    });
    const now = Date.now();
    githubAppMocks.verifyGitHubUserAuthorization.mockResolvedValue({
      githubUserId: "different-user-id",
      githubUserLogin: "different-user",
      accessToken: "uncommitted-access-token",
      accessTokenExpiresAt: now + 8 * 60 * 60 * 1000,
      refreshToken: "uncommitted-refresh-token",
      refreshTokenExpiresAt: now + 180 * 24 * 60 * 60 * 1000,
    });

    const response = await t.fetch(
      "/oauth/github/callback?code=mismatch-code&state=authorization-mismatch-state",
    );
    await expectGitHubCompletion(
      response,
      buildAuthorizationErrorUrl("https://samebase.com/connect-organization", {
        provider: "github-user",
        code: "github-sign-in-mismatch",
      }),
    );
    await expect(
      t.run(async (ctx) => ({
        authorization: await ctx.db
          .query("githubUserAuthorizations")
          .withIndex("by_user", (query) => query.eq("userId", userId))
          .unique(),
        setupState: await ctx.db.get(setupStateId),
      })),
    ).resolves.toEqual({ authorization: null, setupState: null });
    expect(githubAppMocks.revokeGitHubAppUserToken).toHaveBeenCalledWith(
      "uncommitted-access-token",
    );
  });

  it("keeps the durable authorization when installation verification fails", async () => {
    const t = makeConvexTest();
    const { authorizationId, setupStateId } = await t.run(async (ctx) => {
      const { authorizationId, userId } = await insertAuthorizedUser(ctx, {
        email: "installation-failure@example.test",
        githubUserId: "installation-failure-user-id",
        githubUserLogin: "installation-failure-user",
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "installation-failure-state",
        purpose: "installation",
        githubSignInProviderAccountId: "installation-failure-user-id",
        returnToPath: "/connect-organization",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      return { authorizationId, setupStateId };
    });
    githubAppMocks.verifyGitHubAppConnectionInstallation.mockRejectedValue(
      new Error("GitHub installation verification failed."),
    );

    const response = await t.fetch(
      "/oauth/github/callback?installation_id=5003&state=installation-failure-state",
    );
    await expectGitHubCompletion(
      response,
      buildAuthorizationErrorUrl("https://samebase.com/connect-organization", {
        provider: "github-app",
        code: "failed",
      }),
    );
    await expect(
      t.run(async (ctx) => ({
        authorization: await ctx.db.get(authorizationId),
        setupState: await ctx.db.get(setupStateId),
      })),
    ).resolves.toMatchObject({
      authorization: { githubUserId: "installation-failure-user-id" },
      setupState: null,
    });
    expect(githubAppMocks.revokeGitHubAppUserToken).not.toHaveBeenCalled();
  });

  it("consumes canceled direct authorization state", async () => {
    const t = makeConvexTest();
    const setupStateId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "authorization-canceled@example.test");
      await insertGitHubSignInAccount(ctx, {
        userId,
        githubUserId: "canceled-user-id",
        githubUserLogin: "canceled-user",
      });
      return await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "authorization-canceled-state",
        purpose: "user_authorization",
        githubSignInProviderAccountId: "canceled-user-id",
        returnToPath: "/connect-organization",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
    });

    const response = await t.fetch(
      "/oauth/github/callback?error=access_denied&state=authorization-canceled-state",
    );
    await expectGitHubCompletion(
      response,
      buildAuthorizationErrorUrl("https://samebase.com/connect-organization", {
        provider: "github-user",
        code: "canceled",
      }),
    );
    await expect(t.run(async (ctx) => await ctx.db.get(setupStateId))).resolves.toBeNull();
    expect(githubAppMocks.verifyGitHubUserAuthorization).not.toHaveBeenCalled();
  });
});
