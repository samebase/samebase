import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubAppMocks = vi.hoisted(() => ({
  revokeGitHubAppUserToken: vi.fn(),
  verifyGitHubAppInstallation: vi.fn(),
  verifyGitHubUserAuthorization: vi.fn(),
}));

vi.mock("./githubApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./githubApp")>();
  return {
    ...actual,
    revokeGitHubAppUserToken: githubAppMocks.revokeGitHubAppUserToken,
    verifyGitHubAppInstallation: githubAppMocks.verifyGitHubAppInstallation,
    verifyGitHubUserAuthorization: githubAppMocks.verifyGitHubUserAuthorization,
  };
});

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
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

async function insertOrganizationForUser(
  t: ReturnType<typeof makeConvexTest>,
  args: {
    githubOwnerId: string;
    githubOwnerLogin: string;
    githubOwnerType: "organization" | "user";
    userId: Id<"users">;
  },
): Promise<Id<"organizations">> {
  return await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: args.githubOwnerId,
      githubOwnerType: args.githubOwnerType,
      githubOwnerLogin: args.githubOwnerLogin,
      githubOwnerLoginNormalized: args.githubOwnerLogin.toLowerCase(),
      githubInstallationId: `installation-${args.githubOwnerId}`,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: args.userId,
      role: "member",
    });
    return organizationId;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  githubAppMocks.revokeGitHubAppUserToken.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verified GitHub App installation completion", () => {
  it("rejects a stale callback before GitHub exchange for a deleted user", async () => {
    const t = makeConvexTest();
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "deleted-github-callback@example.test",
        isApproved: true,
      });
      await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "deleted-github-callback",
        purpose: "installation",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      await ctx.db.replace(userId, { state: "deleted", deletedAt: Date.now() });
    });

    const response = await t.fetch(
      "/oauth/github/callback?code=provider-code&installation_id=5001&state=deleted-github-callback",
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Invalid GitHub App setup state");
    expect(githubAppMocks.verifyGitHubAppInstallation).not.toHaveBeenCalled();
    expect(githubAppMocks.verifyGitHubUserAuthorization).not.toHaveBeenCalled();
  });

  it("atomically creates a personal organization, saves its user authorization, and consumes state", async () => {
    const t = makeConvexTest();
    const { setupStateId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "owner@example.com",
        isApproved: true,
      });
      await insertGitHubSignInAccount(ctx, {
        userId,
        githubUserId: "101",
        githubUserLogin: "owner",
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "setup-state",
        purpose: "installation",
        githubSignInProviderAccountId: "101",
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
        state: "active",
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

  it.each(["missing", "different"] as const)(
    "does not create a personal organization when GitHub sign-in is %s",
    async (signInState) => {
      const t = makeConvexTest();
      const { setupStateId, userId } = await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", {
          state: "active",
          email: `personal-${signInState}@example.com`,
          isApproved: true,
        });
        if (signInState === "different") {
          await insertGitHubSignInAccount(ctx, {
            userId,
            githubUserId: "different-owner",
            githubUserLogin: "different-owner",
          });
        }
        const setupStateId = await ctx.db.insert("githubAppSetupStates", {
          userId,
          state: `personal-${signInState}-state`,
          purpose: "installation",
          ...(signInState === "different"
            ? { githubSignInProviderAccountId: "different-owner" }
            : {}),
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        });
        return { setupStateId, userId };
      });

      await expect(
        t.mutation(internal.githubAppInstallation.completeVerifiedSetup, {
          setupStateId,
          state: `personal-${signInState}-state`,
          installationId: "personal-installation",
          githubOwnerId: "personal-owner",
          githubOwnerType: "user",
          githubOwnerLogin: "personal-owner",
          githubUserId: "personal-owner",
          githubUserLogin: "personal-owner",
          accessToken: "personal-access-token",
          accessTokenExpiresAt: Date.now() + 60_000,
          refreshToken: "personal-refresh-token",
          refreshTokenExpiresAt: Date.now() + 120_000,
        }),
      ).resolves.toEqual({
        status: signInState === "missing" ? "github_sign_in_required" : "github_sign_in_mismatch",
      });

      await expect(
        t.run(async (ctx) => ({
          authorization: await ctx.db
            .query("githubUserAuthorizations")
            .withIndex("by_user", (query) => query.eq("userId", userId))
            .unique(),
          organization: await ctx.db.query("organizations").first(),
          setupState: await ctx.db.get(setupStateId),
        })),
      ).resolves.toEqual({ authorization: null, organization: null, setupState: null });
    },
  );

  it("does not bind a personal installation when GitHub sign-in was missing at setup start", async () => {
    const t = makeConvexTest();
    const { setupStateId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "personal-linked-after-start@example.com",
        isApproved: true,
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "personal-linked-after-start-state",
        purpose: "installation",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      await insertGitHubSignInAccount(ctx, {
        userId,
        githubUserId: "linked-after-start-owner",
        githubUserLogin: "linked-after-start-owner",
      });
      return { setupStateId, userId };
    });

    await expect(
      t.mutation(internal.githubAppInstallation.completeVerifiedSetup, {
        setupStateId,
        state: "personal-linked-after-start-state",
        installationId: "linked-after-start-installation",
        githubOwnerId: "linked-after-start-owner",
        githubOwnerType: "user",
        githubOwnerLogin: "linked-after-start-owner",
        githubUserId: "linked-after-start-owner",
        githubUserLogin: "linked-after-start-owner",
        accessToken: "linked-after-start-access-token",
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: "linked-after-start-refresh-token",
        refreshTokenExpiresAt: Date.now() + 120_000,
      }),
    ).resolves.toEqual({ status: "github_sign_in_required" });

    await expect(
      t.run(async (ctx) => ({
        authorization: await ctx.db
          .query("githubUserAuthorizations")
          .withIndex("by_user", (query) => query.eq("userId", userId))
          .unique(),
        organization: await ctx.db.query("organizations").first(),
        setupState: await ctx.db.get(setupStateId),
      })),
    ).resolves.toEqual({ authorization: null, organization: null, setupState: null });
  });

  it("creates a GitHub organization when the setup actor has no GitHub sign-in method", async () => {
    const t = makeConvexTest();
    const { setupStateId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "organization-installer@example.com",
        isApproved: true,
      });
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "organization-installation-state",
        purpose: "installation",
        returnToPath: "/organization-installation-complete?prod-ui",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      return { setupStateId };
    });
    githubAppMocks.verifyGitHubAppInstallation.mockResolvedValue({
      installationId: "5001",
      githubOwnerId: "organization-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "organization-owner",
      githubUserId: "organization-admin",
      githubUserLogin: "organization-admin",
      accessToken: "organization-admin-token",
      accessTokenExpiresAt: Date.now() + 60_000,
      refreshToken: "organization-admin-refresh-token",
      refreshTokenExpiresAt: Date.now() + 120_000,
    });
    vi.stubEnv("SITE_URL", "https://samebase.com");

    const response = await t.fetch(
      "/oauth/github/callback?code=organization-provider-code&installation_id=5001&state=organization-installation-state",
    );

    const html = await expectGitHubCompletion(
      response,
      "https://samebase.com/organization-installation-complete?prod-ui",
    );
    const snapshot = await t.run(async (ctx) => ({
      authorization: await ctx.db.query("githubUserAuthorizations").first(),
      organization: await ctx.db.query("organizations").first(),
      setupState: await ctx.db.get(setupStateId),
    }));
    expect(snapshot.authorization).toBeNull();
    expect(snapshot.organization).toMatchObject({
      githubOwnerId: "organization-owner",
      githubOwnerType: "organization",
      githubInstallationId: "5001",
    });
    expect(snapshot.setupState).toBeNull();
    expect(githubAppMocks.revokeGitHubAppUserToken).toHaveBeenCalledWith(
      "organization-admin-token",
    );
    expect(html).not.toContain("organization-provider-code");
    expect(html).not.toContain("organization-admin-token");
  });

  it("authorizes the exact GitHub user for an existing personal organization", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "authorization@example.com",
        isApproved: true,
      });
    });
    await t.run(async (ctx) => {
      await insertGitHubSignInAccount(ctx, {
        userId,
        githubUserId: "202",
        githubUserLogin: "alice",
      });
    });
    const organizationId = await insertOrganizationForUser(t, {
      githubOwnerId: "202",
      githubOwnerLogin: "alice",
      githubOwnerType: "user",
      userId,
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
        organizationId,
        returnToPath: "/org/alice/providers",
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
      organizationId,
      purpose: "user_authorization",
      returnToPath: "/org/alice/providers",
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
      organization: await ctx.db.get(organizationId),
      setupState: await ctx.db.get(setupState._id),
    }));
    expect(snapshot.authorization).toMatchObject({
      userId,
      githubUserId: "202",
      githubUserLogin: "alice",
      accessToken: "user-access-token",
      refreshToken: "user-refresh-token",
    });
    expect(snapshot.organization).toMatchObject({
      githubOwnerId: "202",
      githubOwnerType: "user",
    });
    expect(snapshot.setupState).toBeNull();
  });

  it("denies personal GitHub authorization setup to a pending user", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "pending-authorization@example.com",
        isApproved: false,
      });
    });
    const asPendingUser = t.withIdentity({
      subject: `${userId}|pending-authorization-session`,
      tokenIdentifier: `test:${userId}`,
    });
    const organizationId = await insertOrganizationForUser(t, {
      githubOwnerId: "pending-owner",
      githubOwnerLogin: "pending-owner",
      githubOwnerType: "user",
      userId,
    });

    await expect(
      asPendingUser.mutation(api.githubAppInstallation.getGitHubUserAuthorizationUrl, {
        organizationId,
        returnToPath: "/org/pending-owner/providers",
      }),
    ).rejects.toThrowError("Access denied");

    const setupState = await t.run(async (ctx) => {
      return await ctx.db.query("githubAppSetupStates").first();
    });
    expect(setupState).toBeNull();
  });

  it.each(["missing", "different"] as const)(
    "does not start personal authorization when GitHub sign-in is %s",
    async (signInState) => {
      const t = makeConvexTest();
      const userId = await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", {
          state: "active",
          email: `authorization-${signInState}@example.com`,
          isApproved: true,
        });
        if (signInState === "different") {
          await insertGitHubSignInAccount(ctx, {
            userId,
            githubUserId: "another-owner",
            githubUserLogin: "another-owner",
          });
        }
        return userId;
      });
      const organizationId = await insertOrganizationForUser(t, {
        githubOwnerId: "required-owner",
        githubOwnerLogin: "required-owner",
        githubOwnerType: "user",
        userId,
      });

      await expect(
        t
          .withIdentity({
            subject: `${userId}|authorization-${signInState}-session`,
            tokenIdentifier: `test:${userId}`,
          })
          .mutation(api.githubAppInstallation.getGitHubUserAuthorizationUrl, {
            organizationId,
          }),
      ).rejects.toThrow(
        signInState === "missing" ? "github-sign-in-required" : "github-sign-in-mismatch",
      );
      await expect(
        t.run(async (ctx) => await ctx.db.query("githubAppSetupStates").first()),
      ).resolves.toBeNull();
    },
  );

  it("rechecks the linked GitHub sign-in identity when personal authorization completes", async () => {
    const t = makeConvexTest();
    const { accountId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "authorization-link-changed@example.com",
        isApproved: true,
      });
      const accountId = await insertGitHubSignInAccount(ctx, {
        userId,
        githubUserId: "link-changed-owner",
        githubUserLogin: "link-changed-owner",
      });
      return { accountId, userId };
    });
    const organizationId = await insertOrganizationForUser(t, {
      githubOwnerId: "link-changed-owner",
      githubOwnerLogin: "link-changed-owner",
      githubOwnerType: "user",
      userId,
    });
    stubGitHubAppConfiguration();
    const setup = await t
      .withIdentity({
        subject: `${userId}|authorization-link-changed-session`,
        tokenIdentifier: `test:${userId}`,
      })
      .mutation(api.githubAppInstallation.getGitHubUserAuthorizationUrl, { organizationId });
    const state = new URL(setup.setupUrl).searchParams.get("state");
    if (state === null) {
      throw new Error("GitHub authorization state is required.");
    }
    const setupState = await t.run(async (ctx) => {
      const setupState = await ctx.db
        .query("githubAppSetupStates")
        .withIndex("by_state", (query) => query.eq("state", state))
        .unique();
      await ctx.db.delete(accountId);
      return setupState;
    });
    if (setupState === null) {
      throw new Error("GitHub authorization setup state is required.");
    }

    await expect(
      t.mutation(internal.githubAppInstallation.completeUserAuthorization, {
        setupStateId: setupState._id,
        state,
        githubUserId: "link-changed-owner",
        githubUserLogin: "link-changed-owner",
        accessToken: "link-changed-token",
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: "link-changed-refresh-token",
        refreshTokenExpiresAt: Date.now() + 120_000,
      }),
    ).resolves.toEqual({ status: "github_sign_in_required" });
    await expect(
      t.run(async (ctx) => ({
        authorization: await ctx.db.query("githubUserAuthorizations").first(),
        setupState: await ctx.db.get(setupState._id),
      })),
    ).resolves.toEqual({ authorization: null, setupState: null });
  });

  it.each([
    {
      purpose: "installation",
      provider: "github-app",
      signInState: "missing",
      expectedCode: "github-sign-in-required",
    },
    {
      purpose: "installation",
      provider: "github-app",
      signInState: "different",
      expectedCode: "github-sign-in-mismatch",
    },
    {
      purpose: "user_authorization",
      provider: "github-user",
      signInState: "missing",
      expectedCode: "github-sign-in-required",
    },
    {
      purpose: "user_authorization",
      provider: "github-user",
      signInState: "different",
      expectedCode: "github-sign-in-mismatch",
    },
  ] as const)(
    "returns a safe $expectedCode callback for $purpose with a $signInState GitHub sign-in identity",
    async ({ expectedCode, provider, purpose, signInState }) => {
      const t = makeConvexTest();
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          state: "active",
          email: `${purpose}-${signInState}@example.com`,
          isApproved: true,
        });
      });
      const organizationId =
        purpose === "user_authorization"
          ? await insertOrganizationForUser(t, {
              githubOwnerId: "personal-owner-id",
              githubOwnerLogin: "personal-owner",
              githubOwnerType: "user",
              userId,
            })
          : undefined;
      const state = `${purpose}-${signInState}-callback-state`;
      const returnToPath =
        purpose === "user_authorization"
          ? "/org/personal-owner/providers?prod-ui#github"
          : "/after-personal-install?prod-ui";
      const setupStateId = await t.run(async (ctx) => {
        if (signInState === "different") {
          await insertGitHubSignInAccount(ctx, {
            userId,
            githubUserId: "different-owner-id",
            githubUserLogin: "different-owner",
          });
        }
        return await ctx.db.insert("githubAppSetupStates", {
          userId,
          state,
          purpose,
          ...(organizationId === undefined ? {} : { organizationId }),
          ...(signInState === "different"
            ? { githubSignInProviderAccountId: "different-owner-id" }
            : {}),
          returnToPath,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        });
      });
      const verifiedAuthorization = {
        githubUserId: "personal-owner-id",
        githubUserLogin: "verified-personal-owner",
        accessToken: "uncommitted-callback-access-token",
        accessTokenExpiresAt: Date.now() + 8 * 60 * 60 * 1000,
        refreshToken: "uncommitted-callback-refresh-token",
        refreshTokenExpiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000,
      };
      if (purpose === "installation") {
        githubAppMocks.verifyGitHubAppInstallation.mockResolvedValue({
          ...verifiedAuthorization,
          installationId: "6001",
          githubOwnerId: "personal-owner-id",
          githubOwnerType: "user",
          githubOwnerLogin: "personal-owner",
        });
      } else {
        githubAppMocks.verifyGitHubUserAuthorization.mockResolvedValue(verifiedAuthorization);
      }
      if (purpose === "installation" && signInState === "missing") {
        githubAppMocks.revokeGitHubAppUserToken.mockRejectedValueOnce(
          new Error("token-cleanup-failed"),
        );
      }
      vi.stubEnv("SITE_URL", "https://samebase.com");

      const callbackQuery = new URLSearchParams({ code: "provider-code", state });
      if (purpose === "installation") {
        callbackQuery.set("installation_id", "6001");
      }
      const response = await t.fetch(`/oauth/github/callback?${callbackQuery.toString()}`);
      const html = await expectGitHubCompletion(
        response,
        buildAuthorizationErrorUrl(`https://samebase.com${returnToPath}`, {
          provider,
          code: expectedCode,
        }),
      );
      const snapshot = await t.run(async (ctx) => ({
        authorization: await ctx.db
          .query("githubUserAuthorizations")
          .withIndex("by_user", (query) => query.eq("userId", userId))
          .unique(),
        organizations: await ctx.db.query("organizations").collect(),
        setupState: await ctx.db.get(setupStateId),
      }));

      expect(snapshot.authorization).toBeNull();
      expect(snapshot.organizations).toHaveLength(purpose === "installation" ? 0 : 1);
      expect(snapshot.setupState).toBeNull();
      expect(githubAppMocks.revokeGitHubAppUserToken).toHaveBeenCalledWith(
        "uncommitted-callback-access-token",
      );
      expect(html).not.toContain("provider-code");
      expect(html).not.toContain("uncommitted-callback-access-token");
      expect(html).not.toContain("uncommitted-callback-refresh-token");
      expect(html).not.toContain("verified-personal-owner");
    },
  );

  it("rejects personal repository authorization for a GitHub organization", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "organization-authorization@example.com",
        isApproved: true,
      });
    });
    const organizationId = await insertOrganizationForUser(t, {
      githubOwnerId: "organization-owner",
      githubOwnerLogin: "organization-owner",
      githubOwnerType: "organization",
      userId,
    });

    await expect(
      t
        .withIdentity({
          subject: `${userId}|organization-authorization-session`,
          tokenIdentifier: `test:${userId}`,
        })
        .mutation(api.githubAppInstallation.getGitHubUserAuthorizationUrl, {
          organizationId,
          returnToPath: "/org/organization-owner/providers",
        }),
    ).rejects.toThrow("Personal repository authorization requires a personal GitHub owner.");
    await expect(
      t.run(async (ctx) => await ctx.db.query("githubAppSetupStates").first()),
    ).resolves.toBeNull();
  });

  it("rejects personal repository authorization for a non-member", async () => {
    const t = makeConvexTest();
    const { memberId, viewerId } = await t.run(async (ctx) => {
      const memberId = await ctx.db.insert("users", {
        state: "active",
        email: "authorization-member@example.com",
        isApproved: true,
      });
      const viewerId = await ctx.db.insert("users", {
        state: "active",
        email: "authorization-non-member@example.com",
        isApproved: true,
      });
      return { memberId, viewerId };
    });
    const organizationId = await insertOrganizationForUser(t, {
      githubOwnerId: "member-owner",
      githubOwnerLogin: "member-owner",
      githubOwnerType: "user",
      userId: memberId,
    });

    await expect(
      t
        .withIdentity({
          subject: `${viewerId}|authorization-non-member-session`,
          tokenIdentifier: `test:${viewerId}`,
        })
        .mutation(api.githubAppInstallation.getGitHubUserAuthorizationUrl, {
          organizationId,
          returnToPath: "/org/member-owner/providers",
        }),
    ).rejects.toThrow("Organization membership is required.");
    await expect(
      t.run(async (ctx) => await ctx.db.query("githubAppSetupStates").first()),
    ).resolves.toBeNull();
  });

  it("rejects a different GitHub user and returns a safe target error", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "authorization-target-mismatch@example.com",
        isApproved: true,
      });
    });
    const organizationId = await insertOrganizationForUser(t, {
      githubOwnerId: "expected-user-id",
      githubOwnerLogin: "expected-user",
      githubOwnerType: "user",
      userId,
    });
    const setupStateId = await t.run(async (ctx) => {
      return await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "authorization-target-mismatch-state",
        purpose: "user_authorization",
        organizationId,
        githubSignInProviderAccountId: "expected-user-id",
        returnToPath: "/org/expected-user/providers?prod-ui#github",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
    });
    const now = Date.now();
    githubAppMocks.verifyGitHubUserAuthorization.mockResolvedValue({
      githubUserId: "different-user-id",
      githubUserLogin: "different-user",
      accessToken: "different-user-access-token",
      accessTokenExpiresAt: now + 8 * 60 * 60 * 1000,
      refreshToken: "different-user-refresh-token",
      refreshTokenExpiresAt: now + 180 * 24 * 60 * 60 * 1000,
    });
    vi.stubEnv("SITE_URL", "https://samebase.com");

    const response = await t.fetch(
      "/oauth/github/callback?code=provider-code&state=authorization-target-mismatch-state",
    );

    const html = await expectGitHubCompletion(
      response,
      buildAuthorizationErrorUrl(
        "https://samebase.com/org/expected-user/providers?prod-ui#github",
        {
          provider: "github-user",
          code: "target-mismatch",
        },
      ),
    );
    const snapshot = await t.run(async (ctx) => ({
      authorization: await ctx.db
        .query("githubUserAuthorizations")
        .withIndex("by_user", (query) => query.eq("userId", userId))
        .unique(),
      setupState: await ctx.db.get(setupStateId),
    }));
    expect(snapshot).toEqual({ authorization: null, setupState: null });
    expect(html).not.toContain("provider-code");
    expect(html).not.toContain("different-user-access-token");
  });

  it("does not store GitHub credentials after organization membership is removed", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "authorization-membership-lost@example.com",
        isApproved: true,
      });
    });
    const organizationId = await insertOrganizationForUser(t, {
      githubOwnerId: "membership-owner",
      githubOwnerLogin: "membership-owner",
      githubOwnerType: "user",
      userId,
    });
    const setupStateId = await t.run(async (ctx) => {
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "authorization-membership-lost-state",
        purpose: "user_authorization",
        organizationId,
        returnToPath: "/org/membership-owner/providers",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", organizationId).eq("userId", userId),
        )
        .unique();
      if (membership === null) {
        throw new Error("Test organization membership is required.");
      }
      await ctx.db.delete(membership._id);
      return setupStateId;
    });

    await expect(
      t.mutation(internal.githubAppInstallation.completeUserAuthorization, {
        setupStateId,
        state: "authorization-membership-lost-state",
        githubUserId: "membership-owner",
        githubUserLogin: "membership-owner",
        accessToken: "membership-lost-access-token",
        accessTokenExpiresAt: Date.now() + 8 * 60 * 60 * 1000,
        refreshToken: "membership-lost-refresh-token",
        refreshTokenExpiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000,
      }),
    ).resolves.toEqual({ status: "access_lost" });
    await expect(
      t.run(async (ctx) => ({
        authorization: await ctx.db
          .query("githubUserAuthorizations")
          .withIndex("by_user", (query) => query.eq("userId", userId))
          .unique(),
        setupState: await ctx.db.get(setupStateId),
      })),
    ).resolves.toEqual({ authorization: null, setupState: null });
  });

  it("does not store GitHub credentials after the user loses provider access", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "authorization-access-lost@example.com",
        isApproved: true,
      });
      return userId;
    });
    const organizationId = await insertOrganizationForUser(t, {
      githubOwnerId: "404",
      githubOwnerLogin: "access-lost-user",
      githubOwnerType: "user",
      userId,
    });
    const setupStateId = await t.run(async (ctx) => {
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "authorization-access-lost-state",
        purpose: "user_authorization",
        organizationId,
        returnToPath: "/org/access-lost-user/providers",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      await ctx.db.patch(userId, { isApproved: false });
      return setupStateId;
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
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "authorization-callback@example.com",
        isApproved: true,
      });
    });
    await t.run(async (ctx) => {
      await insertGitHubSignInAccount(ctx, {
        userId,
        githubUserId: "303",
        githubUserLogin: "callback-user",
      });
    });
    const organizationId = await insertOrganizationForUser(t, {
      githubOwnerId: "303",
      githubOwnerLogin: "callback-user",
      githubOwnerType: "user",
      userId,
    });
    const setupStateId = await t.run(async (ctx) => {
      return await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "authorization-callback-state",
        purpose: "user_authorization",
        organizationId,
        githubSignInProviderAccountId: "303",
        returnToPath: "/org/callback-user/providers",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
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

    await expectGitHubCompletion(response, "https://samebase.com/org/callback-user/providers");
    expect(githubAppMocks.verifyGitHubUserAuthorization).toHaveBeenCalledWith({
      code: "authorization-code",
      state: "authorization-callback-state",
    });
    const snapshot = await t.run(async (ctx) => ({
      authorization: await ctx.db
        .query("githubUserAuthorizations")
        .withIndex("by_user", (query) => query.eq("userId", userId))
        .unique(),
      organization: await ctx.db.get(organizationId),
      setupState: await ctx.db.get(setupStateId),
    }));
    expect(snapshot.authorization).toMatchObject({
      githubUserId: "303",
      githubUserLogin: "callback-user",
    });
    expect(snapshot.organization).toMatchObject({ githubOwnerId: "303" });
    expect(snapshot.setupState).toBeNull();
    expect(githubAppMocks.revokeGitHubAppUserToken).not.toHaveBeenCalled();
  });

  it("keeps setup-state cleanup idempotent after a callback race", async () => {
    const t = makeConvexTest();
    const setupStateId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "callback-cleanup@example.com",
        isApproved: true,
      });
      return await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "callback-cleanup-state",
        returnToPath: "/",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
    });

    await t.mutation(internal.githubAppInstallation.deleteSetupState, { setupStateId });
    await t.mutation(internal.githubAppInstallation.deleteSetupState, { setupStateId });

    await expect(t.run(async (ctx) => await ctx.db.get(setupStateId))).resolves.toBeNull();
  });

  it("consumes canceled user authorization state and returns through Providers", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "authorization-canceled@example.com",
        isApproved: true,
      });
    });
    const organizationId = await insertOrganizationForUser(t, {
      githubOwnerId: "canceled-user",
      githubOwnerLogin: "canceled-user",
      githubOwnerType: "user",
      userId,
    });
    const setupStateId = await t.run(async (ctx) => {
      return await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "authorization-canceled-state",
        purpose: "user_authorization",
        organizationId,
        returnToPath: "/org/canceled-user/providers",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
    });
    vi.stubEnv("SITE_URL", "https://samebase.com");

    const response = await t.fetch(
      "/oauth/github/callback?error=access_denied&state=authorization-canceled-state",
    );

    await expectGitHubCompletion(
      response,
      buildAuthorizationErrorUrl("https://samebase.com/org/canceled-user/providers", {
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
      organization: await ctx.db.get(organizationId),
      setupState: await ctx.db.get(setupStateId),
    }));
    expect(snapshot.authorization).toBeNull();
    expect(snapshot.membership).toMatchObject({ organizationId, userId });
    expect(snapshot.organization).toMatchObject({ githubOwnerId: "canceled-user" });
    expect(snapshot.setupState).toBeNull();

    const replayResponse = await t.fetch(
      "/oauth/github/callback?error=access_denied&state=authorization-canceled-state",
    );
    expect(replayResponse.status).toBe(400);
    await expect(replayResponse.text()).resolves.toBe("Invalid GitHub App setup state");
  });

  it("keeps both organizations unchanged and returns to Providers when reconnect selects another owner", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
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
        returnToPath: "/org/owner-a/providers?prod-ui#github",
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
      returnToPath: "/org/owner-a/providers?prod-ui#github",
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
        "https://samebase.com/org/renamed-owner-a/providers?prod-ui#github",
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
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
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
      return userId;
    });
    const organizationId = await insertOrganizationForUser(t, {
      githubOwnerId: "current-user",
      githubOwnerLogin: "current-login",
      githubOwnerType: "user",
      userId,
    });
    const setupStateId = await t.run(async (ctx) => {
      return await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "verification-failure-state",
        purpose: "user_authorization",
        organizationId,
        returnToPath: "/org/current-login/providers?prod-ui#github",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
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
      buildAuthorizationErrorUrl(
        "https://samebase.com/org/current-login/providers?prod-ui#github",
        {
          provider: "github-user",
          code: "failed",
        },
      ),
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
