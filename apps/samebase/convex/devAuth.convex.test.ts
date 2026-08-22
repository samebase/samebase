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
        state: "active",
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

  it("approves the explicit seed user and accepts the current Terms", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "seed@example.com",
      });
    });

    await expect(
      t.mutation(internal.devAuth.approveSeedPasswordAccount, { userId }),
    ).resolves.toBeNull();

    await expect(t.run(async (ctx) => await ctx.db.get(userId))).resolves.toMatchObject({
      isApproved: true,
      termsAcceptedAt: expect.any(Number),
      termsVersion: "2026-08-12",
    });
  });

  it("seeds one repeat-safe organization graph with singleton provider credentials", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
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

    await t.mutation(internal.devAuth.seedOrganizationWithProviderCredentials, seed);
    const initialProviderCredentials = await t.run(async (ctx) => {
      return await ctx.db.query("organizationProviderCredentials").unique();
    });
    await t.mutation(internal.devAuth.seedOrganizationWithProviderCredentials, {
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
      organizationId: organization._id,
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

  it("seeds provider accounts by GitHub owner and preserves a later connection", async () => {
    const t = makeConvexTest();
    vi.stubEnv("CONVEX_DEPLOYMENT", "preview:organization-context");
    vi.stubEnv("DEV_SEED_AUTH_EMAIL", "preview@example.com");
    vi.stubEnv("DEV_SEED_AUTH_PASSWORD", "preview-password-123");
    vi.stubEnv("DEV_SEED_GITHUB_API_KEY", "preview-github-api-key");
    vi.stubEnv("DEV_SEED_CONVEX_MANAGEMENT_API_KEY", "preview-convex-credential");
    vi.stubEnv("DEV_SEED_CONVEX_TEAM_ID", "preview-convex-team-id");
    vi.stubEnv("DEV_SEED_CLOUDFLARE_API_KEY", "preview-cloudflare-credential");
    vi.stubEnv("DEV_SEED_CLOUDFLARE_ACCOUNT_ID", "preview-cloudflare-account-id");
    vi.stubEnv("DEV_SEED_SAMEBASE_CONVEX_MANAGEMENT_API_KEY", "samebase-convex-credential");
    vi.stubEnv("DEV_SEED_SAMEBASE_CONVEX_TEAM_ID", "samebase-convex-team-id");
    vi.stubEnv("DEV_SEED_SAMEBASE_CLOUDFLARE_API_KEY", "samebase-cloudflare-credential");
    vi.stubEnv("DEV_SEED_SAMEBASE_CLOUDFLARE_ACCOUNT_ID", "samebase-cloudflare-account-id");
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
        githubOwnerLogin: "nicu-chiciuc",
      },
      {
        githubInstallationId: "1003",
        githubOwnerId: "303",
        githubOwnerType: "organization",
        githubOwnerLogin: "samebase-live-tests",
      },
      {
        githubInstallationId: "1004",
        githubOwnerId: "404",
        githubOwnerType: "organization",
        githubOwnerLogin: "later-organization",
      },
    ]);

    await expect(t.action(internal.devAuth.seedPasswordAccount, {})).resolves.toEqual({
      email: "preview@example.com",
      created: true,
    });

    const initialSnapshot = await t.run(async (ctx) => ({
      organizations: await ctx.db.query("organizations").collect(),
      memberships: await ctx.db.query("organizationMemberships").collect(),
    }));
    expect(initialSnapshot.organizations).toHaveLength(3);
    expect(initialSnapshot.memberships).toHaveLength(3);
    expect(
      initialSnapshot.organizations
        .map(({ githubOwnerId }) => githubOwnerId)
        .sort((left, right) => left.localeCompare(right)),
    ).toEqual(["101", "202", "303"]);

    const seedUser = await t.mutation(internal.devAuth.resolveSeedPasswordAccountUser, {
      email: "preview@example.com",
    });
    if (seedUser.kind === "missing") {
      throw new Error("The preview seed user was not created.");
    }
    await t.mutation(internal.organizations.createOrReconnectVerifiedOrganization, {
      userId: seedUser.userId,
      githubInstallationId: "1004",
      githubOwnerId: "404",
      githubOwnerType: "organization",
      githubOwnerLogin: "later-organization",
    });

    await expect(t.action(internal.devAuth.seedPasswordAccount, {})).resolves.toEqual({
      email: "preview@example.com",
      created: false,
    });

    const snapshot = await t.run(async (ctx) => ({
      organizations: await ctx.db.query("organizations").collect(),
      memberships: await ctx.db.query("organizationMemberships").collect(),
      billingAccounts: await ctx.db.query("organizationBillingAccounts").collect(),
      authAccounts: await ctx.db.query("authAccounts").collect(),
      githubUserAuthorizations: await ctx.db.query("githubUserAuthorizations").collect(),
      providerCredentials: await ctx.db.query("organizationProviderCredentials").collect(),
      vaults: await ctx.db.query("vaults").collect(),
    }));
    expect(devAuthMocks.discoverPreviewSeedGitHubAppInstallations).toHaveBeenCalledTimes(2);
    expect(devAuthMocks.discoverPreviewSeedGitHubAppInstallations).toHaveBeenCalledWith(
      "preview-github-api-key",
    );
    expect(snapshot.organizations).toHaveLength(4);
    expect(snapshot.memberships).toHaveLength(4);
    expect(snapshot.billingAccounts).toHaveLength(4);
    expect(snapshot.authAccounts).toHaveLength(1);
    expect(snapshot.authAccounts[0]).toMatchObject({
      provider: "password",
      providerAccountId: "preview@example.com",
    });
    expect(snapshot.githubUserAuthorizations).toEqual([]);
    expect(snapshot.providerCredentials).toHaveLength(3);
    expect(snapshot.vaults).toEqual([]);
    const connectedGithubOwnerIds = snapshot.memberships
      .map((membership) =>
        snapshot.organizations.find(
          (organization) => organization._id === membership.organizationId,
        ),
      )
      .map((organization) => organization?.githubOwnerId)
      .sort((left, right) => (left ?? "").localeCompare(right ?? ""));
    expect(connectedGithubOwnerIds).toEqual(["101", "202", "303", "404"]);

    const samebaseOrganization = snapshot.organizations.find(
      ({ githubOwnerId }) => githubOwnerId === "101",
    );
    const samebaseCredentials = snapshot.providerCredentials.find(
      ({ organizationId }) => organizationId === samebaseOrganization?._id,
    );
    expect(samebaseOrganization).toMatchObject({
      convexTeam: { teamId: "samebase-convex-team-id" },
      cloudflareAccount: { accountId: "samebase-cloudflare-account-id" },
    });
    expect(samebaseCredentials).toMatchObject({
      convex: { auth: { credential: "samebase-convex-credential" } },
      cloudflare: { auth: { credential: "samebase-cloudflare-credential" } },
    });

    const personalOrganization = snapshot.organizations.find(
      ({ githubOwnerId }) => githubOwnerId === "202",
    );
    const personalCredentials = snapshot.providerCredentials.find(
      ({ organizationId }) => organizationId === personalOrganization?._id,
    );
    expect(personalOrganization).toMatchObject({
      convexTeam: { teamId: "samebase-convex-team-id" },
      cloudflareAccount: { accountId: "samebase-cloudflare-account-id" },
    });
    expect(personalCredentials).toMatchObject({
      convex: { auth: { credential: "samebase-convex-credential" } },
      cloudflare: { auth: { credential: "samebase-cloudflare-credential" } },
    });

    const liveTestsOrganization = snapshot.organizations.find(
      ({ githubOwnerId }) => githubOwnerId === "303",
    );
    const liveTestsCredentials = snapshot.providerCredentials.find(
      ({ organizationId }) => organizationId === liveTestsOrganization?._id,
    );
    expect(liveTestsOrganization).toMatchObject({
      convexTeam: { teamId: "preview-convex-team-id" },
      cloudflareAccount: { accountId: "preview-cloudflare-account-id" },
    });
    expect(liveTestsCredentials).toMatchObject({
      convex: { auth: { credential: "preview-convex-credential" } },
      cloudflare: { auth: { credential: "preview-cloudflare-credential" } },
    });
  });

  it("fails preview seeding when the Samebase provider setup is missing", async () => {
    const t = makeConvexTest();
    vi.stubEnv("CONVEX_DEPLOYMENT", "preview:organization-context");
    vi.stubEnv("DEV_SEED_AUTH_EMAIL", "preview@example.com");
    vi.stubEnv("DEV_SEED_AUTH_PASSWORD", "preview-password-123");
    vi.stubEnv("DEV_SEED_GITHUB_API_KEY", "preview-github-api-key");
    vi.stubEnv("DEV_SEED_SAMEBASE_CONVEX_MANAGEMENT_API_KEY", "");
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
        githubOwnerLogin: "nicu-chiciuc",
      },
    ]);

    await expect(t.action(internal.devAuth.seedPasswordAccount, {})).rejects.toThrowError(
      "DEV_SEED_SAMEBASE_CONVEX_MANAGEMENT_API_KEY is required",
    );
    expect(devAuthMocks.discoverPreviewSeedGitHubAppInstallations).toHaveBeenCalledOnce();
  });

  it("fails closed when the seed user is missing", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const insertedUserId = await ctx.db.insert("users", {
        state: "active",
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
