import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

afterEach(() => {
  vi.unstubAllEnvs();
});

async function createUser(t: ConvexTest, email: string): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      state: "active",
      email,
      isApproved: true,
    });
  });
}

async function createOrganization(
  t: ConvexTest,
  args: {
    userId: Id<"users">;
    ownerId: string;
    ownerLogin: string;
  },
): Promise<Id<"organizations">> {
  const result = await t.mutation(internal.organizations.createOrReconnectVerifiedOrganization, {
    userId: args.userId,
    githubOwnerId: args.ownerId,
    githubOwnerType: "organization",
    githubOwnerLogin: args.ownerLogin,
    githubInstallationId: `installation-${args.ownerId}`,
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(result.organizationId, {
      convexTeam: { teamId: `convex-team-${args.ownerId}` },
      cloudflareAccount: {
        accountId: `cloudflare-account-${args.ownerId}`,
        accountName: `${args.ownerLogin} account`,
      },
    });
  });
  return result.organizationId;
}

async function createConnectedVault(
  t: ConvexTest,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    owner: string;
    name: string;
    ghRepoId: string;
  },
) {
  const organization = await t.run(async (ctx) => await ctx.db.get(args.organizationId));
  if (organization === null) {
    throw new Error("Test organization not found.");
  }
  const ids = await t.mutation(
    internal.vault.records.createInitializingExistingRepositoryVaultForUser,
    {
      organizationId: args.organizationId,
      userId: args.userId,
      ghRepoOwner: args.owner,
      ghRepoName: args.name,
    },
  );
  await t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
    ...ids,
    userId: args.userId,
    ghRepoId: args.ghRepoId,
    expectedGithubOwnerId: organization.githubOwnerId,
    expectedGithubOwnerLogin: args.owner,
    expectedRepositoryName: args.name,
    ghRepoOwner: args.owner,
    ghRepoName: args.name,
    defaultBranch: "main",
    visibility: "private",
  });
  return ids;
}

describe("organization-owned vaults", () => {
  it("does not start personal repository creation without the matching GitHub user authorization", async () => {
    vi.stubEnv("GITHUB_APP_ID", "123");
    vi.stubEnv("GITHUB_APP_SLUG", "samebase-test");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "test-client");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "test-secret");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "test-private-key");
    vi.stubEnv("GITHUB_APP_OAUTH_CALLBACK_URL", "https://samebase.test/github/callback");

    const t = makeConvexTest();
    const ownerUserId = await createUser(t, "personal-owner@example.com");
    const memberUserId = await createUser(t, "personal-member@example.com");
    const organization = await t.mutation(
      internal.organizations.createOrReconnectVerifiedOrganization,
      {
        userId: ownerUserId,
        githubOwnerId: "101",
        githubOwnerType: "user",
        githubOwnerLogin: "personal-owner",
        githubInstallationId: "1001",
      },
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("organizationMemberships", {
        organizationId: organization.organizationId,
        userId: memberUserId,
        role: "member",
      });
      const billingAccount = await ctx.db
        .query("organizationBillingAccounts")
        .withIndex("by_organization", (query) =>
          query.eq("organizationId", organization.organizationId),
        )
        .unique();
      if (billingAccount === null) {
        throw new Error("Organization billing fixture is missing.");
      }
      await ctx.db.patch(billingAccount._id, {
        provider: "polar",
        plan: "pro",
        status: "active",
        polarBillingUserId: ownerUserId,
        polarExternalCustomerId: `test-polar-customer-${organization.organizationId}`,
        polarSeatQuantity: 2,
      });
      await ctx.db.insert("authAccounts", {
        userId: memberUserId,
        provider: "github",
        providerAccountId: "101",
        emailVerified: "personal-member@example.com",
        githubLogin: "personal-owner",
      });
    });
    const asMember = t.withIdentity({
      subject: `${memberUserId}|test-session`,
      tokenIdentifier: `test:${memberUserId}`,
    });

    await expect(asMember.query(api.organizations.listForViewer, {})).resolves.toMatchObject([
      { canCreateRepository: false },
    ]);

    await expect(
      asMember.action(api.vault.actions.createRepository, {
        organizationId: organization.organizationId,
        name: "member-app",
        convexProjectName: "member-app",
        cloudflareWorkerName: "member-app",
        private: true,
      }),
    ).rejects.toThrow("GitHub user authorization is not available for this owner.");
    await expect(
      t.run(async (ctx) => {
        return {
          runs: await ctx.db.query("workflow_vaultProvisioning_runs").collect(),
          vaults: await ctx.db.query("vaults").collect(),
        };
      }),
    ).resolves.toEqual({ runs: [], vaults: [] });
  });

  it("requires membership and the organization GitHub owner for root creation", async () => {
    const t = makeConvexTest();
    const ownerUserId = await createUser(t, "owner@example.com");
    const outsiderUserId = await createUser(t, "outsider@example.com");
    const organizationId = await createOrganization(t, {
      userId: ownerUserId,
      ownerId: "101",
      ownerLogin: "Samebase",
    });

    await expect(
      t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
        organizationId,
        userId: outsiderUserId,
        ghRepoOwner: "Samebase",
        ghRepoName: "app",
      }),
    ).rejects.toThrow("Organization membership is required.");
    await expect(
      t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
        organizationId,
        userId: ownerUserId,
        ghRepoOwner: "another-owner",
        ghRepoName: "app",
      }),
    ).rejects.toThrow("Repository owner does not match the organization GitHub owner.");

    const { vaultId } = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        organizationId,
        userId: ownerUserId,
        ghRepoOwner: " samebase ",
        ghRepoName: "app",
      },
    );
    const snapshot = await t.run(async (ctx) => {
      const vault = await ctx.db.get(vaultId);
      const preference = await ctx.db
        .query("ui_vaultResourceLinks_settings")
        .withIndex("by_user_and_vault", (query) =>
          query.eq("userId", ownerUserId).eq("vaultId", vaultId),
        )
        .unique();
      return { preference, vault };
    });

    expect(snapshot.vault).toMatchObject({
      organizationId,
      name: "app",
    });
    expect(snapshot.vault).not.toHaveProperty("owner");
    expect(snapshot.vault).not.toHaveProperty("userId");
    expect(snapshot.preference).toMatchObject({ userId: ownerUserId, vaultId });
    await expect(
      t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
        organizationId,
        userId: ownerUserId,
        ghRepoOwner: "samebase",
        ghRepoName: "APP",
      }),
    ).rejects.toThrow("Vault already exists for this repository.");
  });

  it("resolves global routes and lists every current membership in stable order", async () => {
    const t = makeConvexTest();
    const memberUserId = await createUser(t, "nicu@samebase.com");
    const otherMemberUserId = await createUser(t, "other-member@example.com");
    const outsiderUserId = await createUser(t, "nicuchiciuc@gmail.com");
    const zetaOrganizationId = await createOrganization(t, {
      userId: memberUserId,
      ownerId: "201",
      ownerLogin: "zeta",
    });
    const alphaOrganizationId = await createOrganization(t, {
      userId: memberUserId,
      ownerId: "202",
      ownerLogin: "alpha",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("organizationMemberships", {
        organizationId: zetaOrganizationId,
        userId: otherMemberUserId,
        role: "member",
      });
    });
    const zetaVault = await createConnectedVault(t, {
      organizationId: zetaOrganizationId,
      userId: memberUserId,
      owner: "zeta",
      name: "app-z",
      ghRepoId: "repository-201",
    });
    const alphaVault = await createConnectedVault(t, {
      organizationId: alphaOrganizationId,
      userId: memberUserId,
      owner: "alpha",
      name: "app-a",
      ghRepoId: "repository-202",
    });

    const repositories = await t.query(internal.vault.records.listConnectedRepositoriesForUser, {
      userId: memberUserId,
    });
    expect(repositories.map((repository) => `${repository.owner}/${repository.name}`)).toEqual([
      "alpha/app-a",
      "zeta/app-z",
    ]);

    const asMember = t.withIdentity({
      subject: `${memberUserId}|test-session`,
      tokenIdentifier: `test:${memberUserId}`,
    });
    const asOtherMember = t.withIdentity({
      subject: `${otherMemberUserId}|test-session`,
      tokenIdentifier: `test:${otherMemberUserId}`,
    });
    const asOutsider = t.withIdentity({
      subject: `${outsiderUserId}|test-session`,
      tokenIdentifier: `test:${outsiderUserId}`,
    });

    await expect(
      asMember.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "alpha/app-a",
      }),
    ).resolves.toMatchObject({ _id: alphaVault.vaultId });
    await expect(
      asOutsider.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "alpha/app-a",
      }),
    ).resolves.toBeNull();
    await expect(asOtherMember.query(api.vault.dashboard.getUserVaults)).resolves.toMatchObject([
      { _id: zetaVault.vaultId, repositoryFullName: "zeta/app-z" },
    ]);

    const firstDashboardRead = await asMember.query(api.vault.dashboard.getUserVaults);
    const secondDashboardRead = await asMember.query(api.vault.dashboard.getUserVaults);
    expect(secondDashboardRead).toEqual(firstDashboardRead);
    expect(firstDashboardRead.map((vault) => vault._id).sort()).toEqual(
      [alphaVault.vaultId, zetaVault.vaultId].sort(),
    );
  });

  it("enforces stable GitHub repository identity across organizations", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "member@example.com");
    const firstOrganizationId = await createOrganization(t, {
      userId,
      ownerId: "301",
      ownerLogin: "first-owner",
    });
    const secondOrganizationId = await createOrganization(t, {
      userId,
      ownerId: "302",
      ownerLogin: "second-owner",
    });
    await createConnectedVault(t, {
      organizationId: firstOrganizationId,
      userId,
      owner: "first-owner",
      name: "first-repository",
      ghRepoId: "stable-repository-id",
    });
    const secondVault = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        organizationId: secondOrganizationId,
        userId,
        ghRepoOwner: "second-owner",
        ghRepoName: "second-repository",
      },
    );

    await expect(
      t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
        ...secondVault,
        userId,
        ghRepoId: "stable-repository-id",
        expectedGithubOwnerId: "302",
        expectedGithubOwnerLogin: "second-owner",
        expectedRepositoryName: "second-repository",
        ghRepoOwner: "second-owner",
        ghRepoName: "second-repository",
        defaultBranch: "main",
        visibility: "private",
      }),
    ).rejects.toThrow("Vault already exists for this GitHub repository.");
  });

  it("requires verified reconnect when the owner login changes during setup", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "owner-login-change@example.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "owner-login-change-source",
      ownerLogin: "before-owner",
    });
    const vault = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        organizationId,
        userId,
        ghRepoOwner: "before-owner",
        ghRepoName: "before-repository",
      },
    );

    await expect(
      t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
        ...vault,
        userId,
        ghRepoId: "owner-login-change-repository",
        expectedGithubOwnerId: "owner-login-change-source",
        expectedGithubOwnerLogin: "before-owner",
        expectedRepositoryName: "before-repository",
        ghRepoOwner: "after-owner",
        ghRepoName: "after-repository",
        defaultBranch: "main",
        visibility: "private",
      }),
    ).rejects.toThrow(
      "GitHub owner login changed. An organization owner must reconnect the GitHub App.",
    );
    await expect(
      t.run(async (ctx) => ({
        organization: await ctx.db.get(organizationId),
        vault: await ctx.db.get(vault.vaultId),
      })),
    ).resolves.toMatchObject({
      organization: { githubOwnerLogin: "before-owner" },
      vault: { name: "before-repository", state: "provisioning" },
    });
  });

  it("lets only one provisioning vault claim a current repository route", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "repository-route-collision@example.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "repository-route-collision-owner",
      ownerLogin: "samebase",
    });
    const first = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        organizationId,
        userId,
        ghRepoOwner: "samebase",
        ghRepoName: "first-requested-repository",
      },
    );
    const second = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        organizationId,
        userId,
        ghRepoOwner: "samebase",
        ghRepoName: "second-requested-repository",
      },
    );
    const connectCurrentRoute = {
      userId,
      expectedGithubOwnerId: "repository-route-collision-owner",
      expectedGithubOwnerLogin: "samebase",
      ghRepoOwner: "samebase",
      ghRepoName: "current-repository",
      defaultBranch: "main",
      visibility: "private" as const,
    };

    await t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
      ...first,
      ...connectCurrentRoute,
      ghRepoId: "first-stable-repository-id",
      expectedRepositoryName: "first-requested-repository",
    });
    await expect(
      t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
        ...second,
        ...connectCurrentRoute,
        ghRepoId: "second-stable-repository-id",
        expectedRepositoryName: "second-requested-repository",
      }),
    ).rejects.toThrow("Vault already exists for this repository.");
    await expect(
      t.run(async (ctx) => ({
        first: await ctx.db.get(first.vaultId),
        second: await ctx.db.get(second.vaultId),
      })),
    ).resolves.toMatchObject({
      first: { name: "current-repository", state: "connected" },
      second: { name: "second-requested-repository", state: "provisioning" },
    });
  });

  it.each([
    {
      changedCoordinate: "owner",
      error: "GitHub owner login changed. An organization owner must reconnect the GitHub App.",
    },
    {
      changedCoordinate: "repository",
      error: "GitHub repository name changed during repository setup.",
    },
  ])(
    "rejects a third stored $changedCoordinate coordinate",
    async ({ changedCoordinate, error }) => {
      const t = makeConvexTest();
      const userId = await createUser(t, `${changedCoordinate}-race@example.com`);
      const organizationId = await createOrganization(t, {
        userId,
        ownerId: `${changedCoordinate}-race-owner-id`,
        ownerLogin: "before-owner",
      });
      const vault = await t.mutation(
        internal.vault.records.createInitializingExistingRepositoryVaultForUser,
        {
          organizationId,
          userId,
          ghRepoOwner: "before-owner",
          ghRepoName: "before-repository",
        },
      );
      await t.run(async (ctx) => {
        if (changedCoordinate === "owner") {
          await ctx.db.patch(organizationId, {
            githubOwnerLogin: "newest-owner",
            githubOwnerLoginNormalized: "newest-owner",
          });
        } else {
          await ctx.db.patch(vault.vaultId, { name: "newest-repository" });
        }
      });

      await expect(
        t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
          ...vault,
          userId,
          ghRepoId: `${changedCoordinate}-race-repository-id`,
          expectedGithubOwnerId: `${changedCoordinate}-race-owner-id`,
          expectedGithubOwnerLogin: "before-owner",
          expectedRepositoryName: "before-repository",
          ghRepoOwner: changedCoordinate === "owner" ? "after-owner" : "before-owner",
          ghRepoName: "after-repository",
          defaultBranch: "main",
          visibility: "private",
        }),
      ).rejects.toThrow(error);
      await expect(
        t.run(async (ctx) => ({
          organization: await ctx.db.get(organizationId),
          vault: await ctx.db.get(vault.vaultId),
        })),
      ).resolves.toMatchObject({
        organization: {
          githubOwnerLogin: changedCoordinate === "owner" ? "newest-owner" : "before-owner",
        },
        vault: {
          name: changedCoordinate === "repository" ? "newest-repository" : "before-repository",
          state: "provisioning",
        },
      });
    },
  );

  it("uses the organization login after a GitHub owner rename", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "nicu@samebase.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "owner-rename-id",
      ownerLogin: "before-rename",
    });
    const { vaultId } = await createConnectedVault(t, {
      organizationId,
      userId,
      owner: "before-rename",
      name: "rename-app",
      ghRepoId: "rename-repository-id",
    });

    await t.mutation(internal.organizations.createOrReconnectVerifiedOrganization, {
      userId,
      githubOwnerId: "owner-rename-id",
      githubOwnerType: "organization",
      githubOwnerLogin: "after-rename",
      githubInstallationId: "installation-after-rename",
    });

    const asUser = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });
    await expect(
      asUser.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "before-rename/rename-app",
      }),
    ).resolves.toBeNull();
    await expect(
      asUser.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "after-rename/rename-app",
      }),
    ).resolves.toMatchObject({ _id: vaultId, ghRepoOwner: "after-rename" });
    await expect(
      t.query(internal.vault.records.listConnectedRepositoriesForUser, { userId }),
    ).resolves.toMatchObject([{ vaultId, owner: "after-rename" }]);
    await expect(asUser.query(api.vault.dashboard.getUserVaults)).resolves.toMatchObject([
      { _id: vaultId, repositoryFullName: "after-rename/rename-app" },
    ]);
    await expect(t.run(async (ctx) => await ctx.db.get(vaultId))).resolves.not.toHaveProperty(
      "owner",
    );
  });

  it("repairs a repository name without changing stable identity or owner display", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "rename-repair@example.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "stable-owner-id",
      ownerLogin: "before-owner",
    });
    const { vaultId } = await createConnectedVault(t, {
      organizationId,
      userId,
      owner: "before-owner",
      name: "before-repository",
      ghRepoId: "stable-repository-id",
    });
    const repair = {
      userId,
      vaultId,
      expectedGhRepoId: "stable-repository-id",
      expectedGithubOwnerId: "stable-owner-id",
      expectedRepositoryName: "before-repository",
      repositoryName: "after-repository",
    };

    await t.mutation(internal.vault.records.refreshGitHubRepositoryName, repair);
    const firstSnapshot = await t.run(async (ctx) => ({
      organization: await ctx.db.get(organizationId),
      vault: await ctx.db.get(vaultId),
    }));
    await t.mutation(internal.vault.records.refreshGitHubRepositoryName, repair);
    const secondSnapshot = await t.run(async (ctx) => ({
      organization: await ctx.db.get(organizationId),
      vault: await ctx.db.get(vaultId),
    }));

    expect(secondSnapshot).toEqual(firstSnapshot);
    expect(firstSnapshot.organization).toMatchObject({
      githubOwnerId: "stable-owner-id",
      githubOwnerLogin: "before-owner",
      githubOwnerLoginNormalized: "before-owner",
    });
    expect(firstSnapshot.vault).toMatchObject({
      ghRepoId: "stable-repository-id",
      name: "after-repository",
      organizationId,
    });
  });

  it("does not let a delayed repair overwrite newer coordinates", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "delayed-rename-repair@example.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "stable-owner-id",
      ownerLogin: "before-owner",
    });
    const { vaultId } = await createConnectedVault(t, {
      organizationId,
      userId,
      owner: "before-owner",
      name: "before-repository",
      ghRepoId: "stable-repository-id",
    });
    const expectedCoordinates = {
      userId,
      vaultId,
      expectedGhRepoId: "stable-repository-id",
      expectedGithubOwnerId: "stable-owner-id",
      expectedRepositoryName: "before-repository",
    };

    await t.mutation(internal.vault.records.refreshGitHubRepositoryName, {
      ...expectedCoordinates,
      repositoryName: "newest-repository",
    });
    await t.mutation(internal.vault.records.refreshGitHubRepositoryName, {
      ...expectedCoordinates,
      repositoryName: "older-repository",
    });

    await expect(
      t.run(async (ctx) => ({
        organization: await ctx.db.get(organizationId),
        vault: await ctx.db.get(vaultId),
      })),
    ).resolves.toMatchObject({
      organization: { githubOwnerLogin: "before-owner" },
      vault: { name: "newest-repository" },
    });
  });

  it("does not repair onto a repository name reserved by another vault", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "rename-collision@example.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "stable-owner-id",
      ownerLogin: "samebase",
    });
    const { vaultId } = await createConnectedVault(t, {
      organizationId,
      userId,
      owner: "samebase",
      name: "before-repository",
      ghRepoId: "stable-repository-id",
    });
    await t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
      organizationId,
      userId,
      ghRepoOwner: "samebase",
      ghRepoName: "reserved-repository",
    });

    await expect(
      t.mutation(internal.vault.records.refreshGitHubRepositoryName, {
        userId,
        vaultId,
        expectedGhRepoId: "stable-repository-id",
        expectedGithubOwnerId: "stable-owner-id",
        expectedRepositoryName: "before-repository",
        repositoryName: "reserved-repository",
      }),
    ).rejects.toThrow("Vault already exists for this repository.");
  });

  it("does not repair coordinates after either stable identity changes", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "rename-race@example.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "owner-before-race",
      ownerLogin: "owner-before",
    });
    const { vaultId } = await createConnectedVault(t, {
      organizationId,
      userId,
      owner: "owner-before",
      name: "repository-before",
      ghRepoId: "repository-before-race",
    });

    await expect(
      t.mutation(internal.vault.records.refreshGitHubRepositoryName, {
        userId,
        vaultId,
        expectedGhRepoId: "another-repository-id",
        expectedGithubOwnerId: "owner-before-race",
        expectedRepositoryName: "repository-before",
        repositoryName: "repository-after",
      }),
    ).rejects.toThrow("Vault repository identity changed.");
    await expect(
      t.mutation(internal.vault.records.refreshGitHubRepositoryName, {
        userId,
        vaultId,
        expectedGhRepoId: "repository-before-race",
        expectedGithubOwnerId: "another-owner-id",
        expectedRepositoryName: "repository-before",
        repositoryName: "repository-after",
      }),
    ).rejects.toThrow("Vault organization identity changed.");

    await expect(
      t.run(async (ctx) => ({
        organization: await ctx.db.get(organizationId),
        vault: await ctx.db.get(vaultId),
      })),
    ).resolves.toMatchObject({
      organization: {
        githubOwnerId: "owner-before-race",
        githubOwnerLogin: "owner-before",
      },
      vault: {
        ghRepoId: "repository-before-race",
        name: "repository-before",
      },
    });
  });

  it("does not repair coordinates after the acting user loses membership", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "rename-revoked@example.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "owner-before-revocation",
      ownerLogin: "owner-before",
    });
    const { vaultId } = await createConnectedVault(t, {
      organizationId,
      userId,
      owner: "owner-before",
      name: "repository-before",
      ghRepoId: "repository-before-revocation",
    });

    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", organizationId).eq("userId", userId),
        )
        .unique();
      if (membership === null) {
        throw new Error("Test membership not found.");
      }
      await ctx.db.delete(membership._id);
    });

    await expect(
      t.mutation(internal.vault.records.refreshGitHubRepositoryName, {
        userId,
        vaultId,
        expectedGhRepoId: "repository-before-revocation",
        expectedGithubOwnerId: "owner-before-revocation",
        expectedRepositoryName: "repository-before",
        repositoryName: "repository-after",
      }),
    ).rejects.toThrow("Vault not found");
    await expect(t.run(async (ctx) => await ctx.db.get(vaultId))).resolves.toMatchObject({
      ghRepoId: "repository-before-revocation",
      name: "repository-before",
    });
  });

  it("copies organization destinations into both vault creation paths and preserves them", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "destination-owner@example.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "401",
      ownerLogin: "destination-owner",
    });
    const expectedDestinations = {
      convexTeamId: "convex-team-401",
      cloudflareAccountId: "cloudflare-account-401",
    };

    const existing = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        organizationId,
        userId,
        ghRepoOwner: "destination-owner",
        ghRepoName: "existing-app",
      },
    );
    await expect(t.run(async (ctx) => await ctx.db.get(existing.vaultId))).resolves.toMatchObject(
      expectedDestinations,
    );
    await t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
      ...existing,
      userId,
      ghRepoId: "existing-repository-401",
      expectedGithubOwnerId: "401",
      expectedGithubOwnerLogin: "destination-owner",
      expectedRepositoryName: "existing-app",
      ghRepoOwner: "destination-owner",
      ghRepoName: "existing-app",
      defaultBranch: "main",
      visibility: "private",
    });

    const managed = await t.mutation(
      internal.vault.records.createInitializingSamebaseManagedVaultForUser,
      {
        organizationId,
        userId,
        ghRepoOwner: "destination-owner",
        ghRepoName: "managed-app",
        visibility: "private",
        description: null,
        convexProjectName: "managed-app",
        convexTeamId: expectedDestinations.convexTeamId,
        cloudflareAccountId: expectedDestinations.cloudflareAccountId,
        cloudflareWorkerName: "managed-app",
      },
    );
    const initialManagedState = await t.run(async (ctx) => {
      const existingRun = await ctx.db.get(existing.runId);
      const managedRun = await ctx.db.get(managed.runId);
      const vault = await ctx.db.get(managed.vaultId);
      const plan = await ctx.db
        .query("workflow_vaultProvisioning_plans")
        .withIndex("by_vault", (query) => query.eq("vaultId", managed.vaultId))
        .unique();
      return { existingRun, managedRun, plan, vault };
    });
    expect(initialManagedState.existingRun).toMatchObject({ organizationId });
    expect(initialManagedState.managedRun).toMatchObject({ organizationId });
    expect(initialManagedState.vault).toMatchObject(expectedDestinations);
    expect(initialManagedState.plan?.convex).not.toHaveProperty("teamId");
    expect(initialManagedState.plan?.cloudflare).not.toHaveProperty("accountId");

    await t.mutation(internal.vault.records.connectSamebaseManagedVaultGitHub, {
      ...managed,
      userId,
      ghRepoId: "managed-repository-401",
      expectedGithubOwnerId: "401",
      expectedGithubOwnerLogin: "destination-owner",
      expectedRepositoryName: "managed-app",
      ghRepoOwner: "destination-owner",
      ghRepoName: "managed-app",
      defaultBranch: "main",
      visibility: "private",
    });

    const connectedVaults = await t.run(async (ctx) => {
      return await Promise.all([ctx.db.get(existing.vaultId), ctx.db.get(managed.vaultId)]);
    });
    expect(connectedVaults).toEqual([
      expect.objectContaining(expectedDestinations),
      expect.objectContaining(expectedDestinations),
    ]);
  });

  it("preserves organization destinations when either provisioning path fails", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "failure-owner@example.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "402",
      ownerLogin: "failure-owner",
    });
    const expectedDestinations = {
      convexTeamId: "convex-team-402",
      cloudflareAccountId: "cloudflare-account-402",
    };
    const existing = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        organizationId,
        userId,
        ghRepoOwner: "failure-owner",
        ghRepoName: "existing-failure",
      },
    );
    const managed = await t.mutation(
      internal.vault.records.createInitializingSamebaseManagedVaultForUser,
      {
        organizationId,
        userId,
        ghRepoOwner: "failure-owner",
        ghRepoName: "managed-failure",
        visibility: "private",
        description: null,
        convexProjectName: "managed-failure",
        convexTeamId: expectedDestinations.convexTeamId,
        cloudflareAccountId: expectedDestinations.cloudflareAccountId,
        cloudflareWorkerName: "managed-failure",
      },
    );

    await t.mutation(internal.vault.records.markGithubProvisioningFailed, {
      runId: existing.runId,
    });
    await t.mutation(internal.vault.records.markGithubProvisioningFailed, {
      runId: managed.runId,
    });

    const failedVaults = await t.run(async (ctx) => {
      return await Promise.all([ctx.db.get(existing.vaultId), ctx.db.get(managed.vaultId)]);
    });
    expect(failedVaults).toEqual([
      expect.objectContaining({ ...expectedDestinations, state: "failed" }),
      expect.objectContaining({ ...expectedDestinations, state: "failed" }),
    ]);
  });

  it("rejects provider resources outside the vault destinations", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "attachment-owner@example.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "503",
      ownerLogin: "attachment-owner",
    });
    const vault = await createConnectedVault(t, {
      organizationId,
      userId,
      owner: "attachment-owner",
      name: "attachment-app",
      ghRepoId: "repository-503",
    });

    await expect(
      t.mutation(internal.vault.convexMutations.attachProjects, {
        vaultId: vault.vaultId,
        userId,
        projects: [
          {
            teamId: "another-team",
            projectId: "stale-project",
            codeLocation: { kind: "config", convexConfigPath: "convex.json" },
            origin: "selected_existing",
          },
        ],
      }),
    ).rejects.toThrow("Convex project team does not match the vault destination.");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
        vaultId: vault.vaultId,
        userId,
        workers: [
          {
            accountId: "another-account",
            workerName: "stale-worker",
            workerTag: "stale-worker-tag",
            origin: "selected_existing",
          },
        ],
      }),
    ).rejects.toThrow("Cloudflare Worker account does not match the vault destination.");

    const resources = await t.run(async (ctx) => ({
      projects: await ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_vault", (query) => query.eq("vaultId", vault.vaultId))
        .collect(),
      workers: await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault", (query) => query.eq("vaultId", vault.vaultId))
        .collect(),
    }));
    expect(resources).toEqual({ projects: [], workers: [] });
  });
});
