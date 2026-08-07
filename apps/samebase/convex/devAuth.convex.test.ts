import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ACCOUNT_EMAIL_MAX_LENGTH } from "../shared/accountPresentation";

const devAuthMocks = vi.hoisted(() => ({
  discoverPreviewSeedGitHubAppInstallations: vi.fn(),
}));

vi.mock("./githubApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./githubApp")>();
  return {
    ...actual,
    discoverPreviewSeedGitHubAppInstallations:
      devAuthMocks.discoverPreviewSeedGitHubAppInstallations,
  };
});

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("devAuth password account seed", () => {
  it("enforces the canonical email maximum for the seed account boundary", async () => {
    const suffix = "@b.co";
    const maximumEmail = "a".repeat(ACCOUNT_EMAIL_MAX_LENGTH - suffix.length) + suffix;
    const tooLongEmail = "a".repeat(ACCOUNT_EMAIL_MAX_LENGTH + 1 - suffix.length) + suffix;
    const t = makeConvexTest();

    await expect(
      t.mutation(internal.devAuth.resolveSeedPasswordAccountUser, {
        email: maximumEmail,
      }),
    ).resolves.toEqual({ kind: "missing" });
    await expect(
      t.mutation(internal.devAuth.resolveSeedPasswordAccountUser, {
        email: tooLongEmail,
      }),
    ).rejects.toThrowError(
      `Email address must be ${ACCOUNT_EMAIL_MAX_LENGTH} characters or fewer.`,
    );
  });

  it("resolves an existing seed password account", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const insertedUserId = await ctx.db.insert("users", {
        email: "seed@example.com",
        emailVerificationTime: 1,
        isApproved: true,
      });
      await ctx.db.insert("authAccounts", {
        userId: insertedUserId,
        provider: "password",
        providerAccountId: "seed@example.com",
      });
      return insertedUserId;
    });

    await expect(
      t.mutation(internal.devAuth.resolveSeedPasswordAccountUser, {
        email: "seed@example.com",
      }),
    ).resolves.toEqual({
      kind: "existing",
      userId,
    });
  });

  it("approves the explicit seed user", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "seed@example.com",
      });
    });

    await expect(
      t.mutation(internal.devAuth.approveSeedPasswordAccount, { userId }),
    ).resolves.toBeNull();

    await expect(t.run(async (ctx) => (await ctx.db.get(userId))?.isApproved)).resolves.toBe(true);
  });

  it("seeds one repeat-safe organization graph with singleton provider credentials", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "seed@example.com",
        isApproved: true,
      });
    });
    const seed = {
      userId,
      githubOwnerId: "285392744",
      githubOwnerType: "organization",
      githubOwnerLogin: "samebase",
      githubInstallationId: "151325701",
      convexConnection: {
        credential: "convex-test-credential",
        teamId: "convex-team-id",
        teamSlug: "samebase",
      },
      cloudflareConnection: {
        credential: "cloudflare-test-credential",
        accountId: "cloudflare-account-id",
      },
    } as const;

    await t.mutation(internal.devAuth.seedOrganizationWithProviderConnections, seed);
    const initialProviderCredentials = await t.run(async (ctx) => {
      return await ctx.db.query("organizationProviderCredentials").unique();
    });
    await t.mutation(internal.devAuth.seedOrganizationWithProviderConnections, {
      ...seed,
      convexConnection: {
        ...seed.convexConnection,
        credential: "convex-updated-credential",
      },
      cloudflareConnection: {
        ...seed.cloudflareConnection,
        credential: "cloudflare-updated-credential",
      },
    });

    const snapshot = await t.run(async (ctx) => {
      return {
        organizations: await ctx.db.query("organizations").collect(),
        memberships: await ctx.db.query("organizationMemberships").collect(),
        billingAccounts: await ctx.db.query("organizationBillingAccounts").collect(),
        providerCredentials: await ctx.db.query("organizationProviderCredentials").collect(),
      };
    });

    expect(snapshot.organizations).toHaveLength(1);
    expect(snapshot.memberships).toHaveLength(1);
    expect(snapshot.billingAccounts).toHaveLength(1);
    expect(snapshot.providerCredentials).toHaveLength(1);

    const organization = snapshot.organizations[0];
    expect(organization).toMatchObject({
      githubOwnerId: seed.githubOwnerId,
      githubOwnerType: seed.githubOwnerType,
      githubOwnerLogin: seed.githubOwnerLogin,
      githubOwnerLoginNormalized: seed.githubOwnerLogin,
      githubInstallationId: seed.githubInstallationId,
      convexTeam: {
        teamId: seed.convexConnection.teamId,
        teamSlug: seed.convexConnection.teamSlug,
      },
      cloudflareAccount: {
        accountId: seed.cloudflareConnection.accountId,
        accountName: seed.cloudflareConnection.accountId,
      },
    });
    expect(snapshot.memberships[0]).toMatchObject({
      organizationId: organization._id,
      userId,
      role: "owner",
    });
    expect(snapshot.billingAccounts[0]).toMatchObject({
      organizationId: organization._id,
      plan: "free",
      status: "inactive",
    });

    expect(snapshot.providerCredentials[0]).toMatchObject({
      _id: initialProviderCredentials?._id,
      convex: {
        connectedByUserId: userId,
        auth: { credential: "convex-updated-credential" },
      },
      cloudflare: {
        connectedByUserId: userId,
        auth: { credential: "cloudflare-updated-credential" },
      },
    });
  });

  it("uses the preview API key without storing it and repeats organization seeding safely", async () => {
    const t = makeConvexTest();
    vi.stubEnv("CONVEX_DEPLOYMENT", "preview:organization-context");
    vi.stubEnv("PREVIEW_SEED_AUTH_EMAIL", "preview@example.com");
    vi.stubEnv("PREVIEW_SEED_AUTH_PASSWORD", "preview-password-123");
    vi.stubEnv("DEV_SEED_GITHUB_API_KEY", "preview-github-api-key");
    vi.stubEnv("DEV_SEED_CONVEX_MANAGEMENT_API_KEY", "preview-convex-credential");
    vi.stubEnv("DEV_SEED_CONVEX_TEAM_ID", "preview-convex-team-id");
    vi.stubEnv("DEV_SEED_CLOUDFLARE_API_KEY", "preview-cloudflare-credential");
    vi.stubEnv("DEV_SEED_CLOUDFLARE_ACCOUNT_ID", "preview-cloudflare-account-id");
    devAuthMocks.discoverPreviewSeedGitHubAppInstallations.mockResolvedValue([
      {
        githubInstallationId: "1001",
        githubOwnerId: "101",
        githubOwnerType: "organization",
        githubOwnerLogin: "samebase",
      },
      {
        githubInstallationId: "1002",
        githubOwnerId: "202",
        githubOwnerType: "user",
        githubOwnerLogin: "octocat",
      },
    ]);

    await expect(t.action(internal.devAuth.seedPasswordAccount, {})).resolves.toEqual({
      email: "preview@example.com",
      created: true,
    });
    await expect(t.action(internal.devAuth.seedPasswordAccount, {})).resolves.toEqual({
      email: "preview@example.com",
      created: false,
    });

    const snapshot = await t.run(async (ctx) => ({
      organizations: await ctx.db.query("organizations").collect(),
      memberships: await ctx.db.query("organizationMemberships").collect(),
      billingAccounts: await ctx.db.query("organizationBillingAccounts").collect(),
      githubUserAuthorizations: await ctx.db.query("githubUserAuthorizations").collect(),
      providerConnections: await ctx.db.query("providerConnections").collect(),
    }));
    expect(devAuthMocks.discoverPreviewSeedGitHubAppInstallations).toHaveBeenCalledTimes(2);
    expect(devAuthMocks.discoverPreviewSeedGitHubAppInstallations).toHaveBeenCalledWith(
      "preview-github-api-key",
    );
    expect(snapshot.organizations).toHaveLength(2);
    expect(snapshot.memberships).toHaveLength(2);
    expect(snapshot.billingAccounts).toHaveLength(2);
    expect(snapshot.githubUserAuthorizations).toEqual([]);
    expect(snapshot.providerConnections).toHaveLength(4);
    expect(snapshot.providerConnections).not.toContainEqual(
      expect.objectContaining({
        auth: { method: "api_key", credential: "preview-github-api-key" },
      }),
    );
    for (const organization of snapshot.organizations) {
      const organizationConnections = snapshot.providerConnections.filter(
        (connection) => connection.organizationId === organization._id,
      );
      expect(organizationConnections).toHaveLength(2);
      const convexConnection = organizationConnections.find(
        (connection) => connection.kind === "convex",
      );
      const cloudflareConnection = organizationConnections.find(
        (connection) => connection.kind === "cloudflare",
      );
      expect(convexConnection).toMatchObject({
        connectedByUserId: snapshot.memberships[0].userId,
        auth: { method: "api_key", credential: "preview-convex-credential" },
        teamId: "preview-convex-team-id",
      });
      expect(cloudflareConnection).toMatchObject({
        connectedByUserId: snapshot.memberships[0].userId,
        auth: { method: "api_key", credential: "preview-cloudflare-credential" },
        defaultAccount: {
          state: "selected",
          accountId: "preview-cloudflare-account-id",
        },
      });
      expect(organization.selectedConvexProviderConnectionId).toBe(convexConnection?._id);
      expect(organization.selectedCloudflareProviderConnectionId).toBe(cloudflareConnection?._id);
    }
  });

  it("fails preview seeding when the shared provider setup is missing", async () => {
    const t = makeConvexTest();
    vi.stubEnv("CONVEX_DEPLOYMENT", "preview:organization-context");
    vi.stubEnv("PREVIEW_SEED_AUTH_EMAIL", "preview@example.com");
    vi.stubEnv("PREVIEW_SEED_AUTH_PASSWORD", "preview-password-123");
    vi.stubEnv("DEV_SEED_GITHUB_API_KEY", "preview-github-api-key");
    vi.stubEnv("DEV_SEED_CONVEX_MANAGEMENT_API_KEY", "");
    vi.stubEnv("DEV_SEED_CONVEX_TEAM_ID", "");
    vi.stubEnv("DEV_SEED_CLOUDFLARE_API_KEY", "");
    vi.stubEnv("DEV_SEED_CLOUDFLARE_ACCOUNT_ID", "");

    await expect(t.action(internal.devAuth.seedPasswordAccount, {})).rejects.toThrowError(
      "Preview organization provider seeding requires DEV_SEED_CONVEX_MANAGEMENT_API_KEY, DEV_SEED_CONVEX_TEAM_ID, DEV_SEED_CLOUDFLARE_API_KEY, and DEV_SEED_CLOUDFLARE_ACCOUNT_ID",
    );
    expect(devAuthMocks.discoverPreviewSeedGitHubAppInstallations).not.toHaveBeenCalled();
  });

  it("fails closed when the seed user is missing", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const insertedUserId = await ctx.db.insert("users", {
        email: "missing@example.com",
      });
      await ctx.db.delete(insertedUserId);
      return insertedUserId;
    });

    await expect(
      t.mutation(internal.devAuth.approveSeedPasswordAccount, { userId }),
    ).rejects.toThrowError("Cannot approve missing seed user");
  });
});
