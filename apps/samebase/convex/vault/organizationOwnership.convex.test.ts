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
  const ids = await t.mutation(
    internal.vault.records.createInitializingExistingRepositoryVaultForUser,
    {
      organizationId: args.organizationId,
      userId: args.userId,
      ghRepoId: args.ghRepoId,
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
        cloudflareBuildTokenUuid: "build-token",
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
        ghRepoId: "outsider-app-id",
        ghRepoOwner: "Samebase",
        ghRepoName: "app",
      }),
    ).rejects.toThrow("Organization membership is required.");
    await expect(
      t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
        organizationId,
        userId: ownerUserId,
        ghRepoId: "wrong-owner-app-id",
        ghRepoOwner: "another-owner",
        ghRepoName: "app",
      }),
    ).rejects.toThrow("Repository owner does not match the organization GitHub owner.");

    const { vaultId } = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        organizationId,
        userId: ownerUserId,
        ghRepoId: "root-app-id",
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
        ghRepoId: "root-app-uppercase-id",
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
    await expect(
      t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
        organizationId: secondOrganizationId,
        userId,
        ghRepoId: "stable-repository-id",
        ghRepoOwner: "second-owner",
        ghRepoName: "second-repository",
      }),
    ).rejects.toThrow("Vault already exists for this GitHub repository.");
  });

  it("does not replace the selected repository ID during finalization", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "provisioning-repository-identity@example.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "provisioning-repository-owner",
      ownerLogin: "samebase",
    });
    const selected = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        organizationId,
        userId,
        ghRepoId: "selected-repository-id",
        ghRepoOwner: "samebase",
        ghRepoName: "selected-repository",
      },
    );

    await expect(
      t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
        runId: selected.runId,
        vaultId: selected.vaultId,
        userId,
        ghRepoId: "different-repository-id",
        ghRepoOwner: "samebase",
        ghRepoName: "different-repository",
        defaultBranch: "main",
        visibility: "private",
      }),
    ).rejects.toThrow("Provisioning vault repository identity cannot be changed.");
    await expect(t.run(async (ctx) => await ctx.db.get(selected.vaultId))).resolves.toMatchObject({
      state: "provisioning",
      ghRepoId: "selected-repository-id",
      name: "selected-repository",
    });
  });

  it("retains a failed connection repository ID and blocks a renamed retry", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "failed-repository-identity@example.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "failed-repository-owner",
      ownerLogin: "samebase",
    });
    const failed = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        organizationId,
        userId,
        ghRepoId: "failed-stable-repository-id",
        ghRepoOwner: "samebase",
        ghRepoName: "agent-plugins",
      },
    );
    await t.mutation(internal.vault.records.markGithubProvisioningFailed, {
      runId: failed.runId,
    });

    await expect(t.run(async (ctx) => await ctx.db.get(failed.vaultId))).resolves.toMatchObject({
      state: "failed",
      githubMode: "connect_existing_repository",
      ghRepoId: "failed-stable-repository-id",
    });
    const asUser = t.withIdentity({
      subject: `${userId}|failed-repository-identity`,
      tokenIdentifier: `test:${userId}`,
    });
    await expect(asUser.query(api.vault.dashboard.getUserVaults, {})).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: failed.vaultId,
          ghRepoId: "failed-stable-repository-id",
        }),
      ]),
    );

    await expect(
      t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
        organizationId,
        userId,
        ghRepoId: "failed-stable-repository-id",
        ghRepoOwner: "samebase",
        ghRepoName: "plugin",
      }),
    ).rejects.toThrow("Vault already exists for this GitHub repository.");
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("vaults")
          .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
          .collect(),
      ),
    ).resolves.toHaveLength(1);
  });

  it("updates only a verified repository name and rejects a local name collision", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "repository-rename@example.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "repository-rename-owner",
      ownerLogin: "samebase",
    });
    const renamedVault = await createConnectedVault(t, {
      organizationId,
      userId,
      owner: "samebase",
      name: "agent-plugins",
      ghRepoId: "renamed-repository-id",
    });

    await expect(
      t.mutation(internal.vault.records.updateGitHubRepositoryNameForUser, {
        userId,
        vaultId: renamedVault.vaultId,
        ghRepoId: "renamed-repository-id",
        githubOwnerId: "repository-rename-owner",
        expectedStoredName: "agent-plugins",
        repositoryName: "plugin",
      }),
    ).resolves.toEqual({ githubOwnerLogin: "samebase", repositoryName: "plugin" });
    await expect(
      t.mutation(internal.vault.records.updateGitHubRepositoryNameForUser, {
        userId,
        vaultId: renamedVault.vaultId,
        ghRepoId: "renamed-repository-id",
        githubOwnerId: "repository-rename-owner",
        expectedStoredName: "agent-plugins",
        repositoryName: "plugin",
      }),
    ).resolves.toEqual({ githubOwnerLogin: "samebase", repositoryName: "plugin" });
    const memberUserId = await createUser(t, "repository-rename-member@example.com");
    await t.run(async (ctx) => {
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: memberUserId,
        role: "member",
      });
    });
    await expect(
      t.mutation(internal.vault.records.updateGitHubRepositoryNameForUser, {
        userId: memberUserId,
        vaultId: renamedVault.vaultId,
        ghRepoId: "renamed-repository-id",
        githubOwnerId: "repository-rename-owner",
        expectedStoredName: "plugin",
        repositoryName: "member-update",
      }),
    ).rejects.toThrow("Organization owner access is required.");

    const collisionTarget = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        organizationId,
        userId,
        ghRepoId: "occupied-repository-id",
        ghRepoOwner: "samebase",
        ghRepoName: "occupied-name",
      },
    );
    await t.mutation(internal.vault.records.markGithubProvisioningFailed, {
      runId: collisionTarget.runId,
    });
    await expect(
      t.mutation(internal.vault.records.updateGitHubRepositoryNameForUser, {
        userId,
        vaultId: renamedVault.vaultId,
        ghRepoId: "renamed-repository-id",
        githubOwnerId: "repository-rename-owner",
        expectedStoredName: "plugin",
        repositoryName: "occupied-name",
      }),
    ).rejects.toThrow("Vault already exists for this repository name.");

    const asUser = t.withIdentity({
      subject: `${userId}|repository-rename`,
      tokenIdentifier: `test:${userId}`,
    });
    await expect(asUser.query(api.vault.dashboard.getUserVaults, {})).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: renamedVault.vaultId,
          ghRepoId: "renamed-repository-id",
          repositoryFullName: "samebase/plugin",
        }),
      ]),
    );
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
        ghRepoId: "existing-repository-401",
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
        cloudflareBuildTokenUuid: "build-token",
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
    expect(initialManagedState.plan?.cloudflare).toMatchObject({ buildTokenUuid: "build-token" });
    expect(initialManagedState.plan?.cloudflare).not.toHaveProperty("accountId");

    await t.mutation(internal.vault.records.connectSamebaseManagedVaultGitHub, {
      ...managed,
      userId,
      ghRepoId: "managed-repository-401",
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
        ghRepoId: "existing-failure-repository-402",
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
        cloudflareBuildTokenUuid: "build-token",
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
            rootDirectory: "apps/stale-worker",
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
