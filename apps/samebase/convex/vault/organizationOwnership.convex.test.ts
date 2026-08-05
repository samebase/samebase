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
        ghRepoOwner: "second-owner",
        ghRepoName: "second-repository",
        defaultBranch: "main",
        visibility: "private",
      }),
    ).rejects.toThrow("Vault already exists for this GitHub repository.");
  });

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

  it("stores external provider resource IDs in managed plans", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "owner@example.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "401",
      ownerLogin: "managed-owner",
    });
    const convexProviderConnectionId = await t.mutation(
      internal.providerConnections.createConnected,
      {
        organizationId,
        connectedByUserId: userId,
        connection: {
          kind: "convex",
          auth: { method: "api_key", credential: "convex-credential" },
          teamId: "convex-team",
        },
      },
    );
    const cloudflareProviderConnectionId = await t.mutation(
      internal.providerConnections.createConnected,
      {
        organizationId,
        connectedByUserId: userId,
        connection: {
          kind: "cloudflare",
          auth: { method: "api_key", credential: "cloudflare-credential" },
          defaultAccount: { state: "not_selected" },
        },
      },
    );

    const { vaultId } = await t.mutation(
      internal.vault.records.createInitializingSamebaseManagedVaultForUser,
      {
        organizationId,
        userId,
        ghRepoOwner: "managed-owner",
        ghRepoName: "managed-app",
        visibility: "private",
        description: null,
        convexProjectName: "managed-app",
        convexTeamId: "convex-team",
        convexProviderConnectionId,
        cloudflareAccountId: "cloudflare-account",
        cloudflareWorkerName: "managed-app",
        cloudflareProviderConnectionId,
      },
    );
    const plan = await t.run(async (ctx) => {
      return await ctx.db
        .query("workflow_vaultProvisioning_plans")
        .withIndex("by_vault", (query) => query.eq("vaultId", vaultId))
        .unique();
    });

    expect(plan).toMatchObject({
      vaultId,
      convex: { teamId: "convex-team" },
      cloudflare: { accountId: "cloudflare-account" },
    });
    expect(plan).not.toHaveProperty("convexProviderConnectionId");
    expect(plan).not.toHaveProperty("cloudflareProviderConnectionId");
    expect(plan).not.toHaveProperty("userId");
    expect(plan).not.toHaveProperty("githubProviderConnectionId");
  });

  it("keeps provider attachment writes inside the vault organization", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "provider-owner@example.com");
    const firstOrganizationId = await createOrganization(t, {
      userId,
      ownerId: "501",
      ownerLogin: "first-provider-owner",
    });
    const secondOrganizationId = await createOrganization(t, {
      userId,
      ownerId: "502",
      ownerLogin: "second-provider-owner",
    });
    const firstVault = await createConnectedVault(t, {
      organizationId: firstOrganizationId,
      userId,
      owner: "first-provider-owner",
      name: "first-app",
      ghRepoId: "repository-501",
    });
    const secondVault = await createConnectedVault(t, {
      organizationId: secondOrganizationId,
      userId,
      owner: "second-provider-owner",
      name: "second-app",
      ghRepoId: "repository-502",
    });
    const firstConvexConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId: firstOrganizationId,
      connectedByUserId: userId,
      connection: {
        kind: "convex",
        auth: { method: "api_key", credential: "first-convex-credential" },
        teamId: "first-team",
      },
    });
    const secondConvexConnectionId = await t.mutation(
      internal.providerConnections.createConnected,
      {
        organizationId: secondOrganizationId,
        connectedByUserId: userId,
        connection: {
          kind: "convex",
          auth: { method: "api_key", credential: "second-convex-credential" },
          teamId: "second-team",
        },
      },
    );
    const firstCloudflareConnectionId = await t.mutation(
      internal.providerConnections.createConnected,
      {
        organizationId: firstOrganizationId,
        connectedByUserId: userId,
        connection: {
          kind: "cloudflare",
          auth: { method: "api_key", credential: "first-cloudflare-credential" },
          defaultAccount: {
            state: "selected",
            accountId: "first-account",
            accountName: "First Account",
          },
        },
      },
    );
    const secondCloudflareConnectionId = await t.mutation(
      internal.providerConnections.createConnected,
      {
        organizationId: secondOrganizationId,
        connectedByUserId: userId,
        connection: {
          kind: "cloudflare",
          auth: { method: "api_key", credential: "second-cloudflare-credential" },
          defaultAccount: {
            state: "selected",
            accountId: "second-account",
            accountName: "Second Account",
          },
        },
      },
    );

    await expect(
      t.mutation(internal.vault.convexMutations.attachProjects, {
        vaultId: firstVault.vaultId,
        userId,
        providerConnectionId: secondConvexConnectionId,
        projects: [
          {
            teamId: "second-team",
            projectId: "cross-organization-project",
            codeLocation: { kind: "config", convexConfigPath: "convex.json" },
            origin: "selected_existing",
          },
        ],
      }),
    ).rejects.toThrow("Convex provider connection does not match the project team.");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
        vaultId: firstVault.vaultId,
        userId,
        providerConnectionId: secondCloudflareConnectionId,
        workers: [
          {
            accountId: "second-account",
            workerName: "cross-organization-worker",
            workerTag: "cross-organization-worker-tag",
            origin: "selected_existing",
          },
        ],
      }),
    ).rejects.toThrow("Cloudflare provider connection does not match the Worker account.");

    const [firstConvexProjectId] = await t.mutation(internal.vault.convexMutations.attachProjects, {
      vaultId: firstVault.vaultId,
      userId,
      providerConnectionId: firstConvexConnectionId,
      projects: [
        {
          teamId: "first-team",
          projectId: "first-project",
          codeLocation: { kind: "config", convexConfigPath: "convex.json" },
          origin: "selected_existing",
        },
      ],
    });
    const [secondConvexProjectId] = await t.mutation(
      internal.vault.convexMutations.attachProjects,
      {
        vaultId: secondVault.vaultId,
        userId,
        providerConnectionId: secondConvexConnectionId,
        projects: [
          {
            teamId: "second-team",
            projectId: "second-project",
            codeLocation: { kind: "config", convexConfigPath: "convex.json" },
            origin: "selected_existing",
          },
        ],
      },
    );
    const [firstWorkerId] = await t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
      vaultId: firstVault.vaultId,
      userId,
      providerConnectionId: firstCloudflareConnectionId,
      workers: [
        {
          accountId: "first-account",
          workerName: "first-worker",
          workerTag: "first-worker-tag",
          origin: "selected_existing",
        },
      ],
    });
    const [secondWorkerId] = await t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
      vaultId: secondVault.vaultId,
      userId,
      providerConnectionId: secondCloudflareConnectionId,
      workers: [
        {
          accountId: "second-account",
          workerName: "second-worker",
          workerTag: "second-worker-tag",
          origin: "selected_existing",
        },
      ],
    });

    await expect(
      t.mutation(internal.vault.convexMutations.reconcileProjectTeam, {
        vaultId: firstVault.vaultId,
        userId,
        convexProjectId: secondConvexProjectId,
        projectId: "second-project",
        expectedTeamId: "second-team",
        nextTeamId: "first-team",
      }),
    ).rejects.toThrow("Convex project attachment changed before team reconciliation.");
    await expect(
      t.mutation(internal.vault.convexMutations.reconcileProjectCodeLocation, {
        vaultId: firstVault.vaultId,
        userId,
        convexProjectId: secondConvexProjectId,
        projectId: "second-project",
        expectedCodeLocation: { kind: "config", convexConfigPath: "convex.json" },
        nextCodeLocation: { kind: "directory", convexDirectoryPath: "convex" },
      }),
    ).rejects.toThrow("Convex project attachment changed before code location reconciliation.");
    await expect(
      t.mutation(internal.vault.convexMutations.detachProject, {
        vaultId: firstVault.vaultId,
        userId,
        convexProjectId: secondConvexProjectId,
        teamId: "second-team",
        projectId: "second-project",
        codeLocation: { kind: "config", convexConfigPath: "convex.json" },
      }),
    ).rejects.toThrow("Convex project attachment not found.");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.detachWorker, {
        vaultId: firstVault.vaultId,
        userId,
        workerId: secondWorkerId,
        accountId: "second-account",
        workerName: "second-worker",
        workerTag: "second-worker-tag",
      }),
    ).rejects.toThrow("Cloudflare Worker attachment not found.");

    await t.mutation(internal.vault.convexMutations.reconcileProjectTeam, {
      vaultId: firstVault.vaultId,
      userId,
      convexProjectId: firstConvexProjectId,
      projectId: "first-project",
      expectedTeamId: "first-team",
      nextTeamId: "first-team-refreshed",
    });
    await t.mutation(internal.vault.convexMutations.reconcileProjectCodeLocation, {
      vaultId: firstVault.vaultId,
      userId,
      convexProjectId: firstConvexProjectId,
      projectId: "first-project",
      expectedCodeLocation: { kind: "config", convexConfigPath: "convex.json" },
      nextCodeLocation: { kind: "directory", convexDirectoryPath: "convex" },
    });
    await t.mutation(internal.vault.convexMutations.detachProject, {
      vaultId: firstVault.vaultId,
      userId,
      convexProjectId: firstConvexProjectId,
      teamId: "first-team-refreshed",
      projectId: "first-project",
      codeLocation: { kind: "directory", convexDirectoryPath: "convex" },
    });
    await t.mutation(internal.vault.cloudflareMutations.detachWorker, {
      vaultId: firstVault.vaultId,
      userId,
      workerId: firstWorkerId,
      accountId: "first-account",
      workerName: "first-worker",
      workerTag: "first-worker-tag",
    });

    const resources = await t.run(async (ctx) => ({
      firstProject: await ctx.db.get(firstConvexProjectId),
      firstWorker: await ctx.db.get(firstWorkerId),
      secondProject: await ctx.db.get(secondConvexProjectId),
      secondWorker: await ctx.db.get(secondWorkerId),
    }));
    expect(resources).toMatchObject({
      firstProject: null,
      firstWorker: null,
      secondProject: {
        organizationId: secondOrganizationId,
        vaultId: secondVault.vaultId,
        teamId: "second-team",
        convexConfigPath: "convex.json",
      },
      secondWorker: {
        organizationId: secondOrganizationId,
        vaultId: secondVault.vaultId,
        accountId: "second-account",
      },
    });
  });
});
