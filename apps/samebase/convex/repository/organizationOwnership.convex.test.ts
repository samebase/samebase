import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";
import { isSamebaseProvisioningPlan } from "./provisioningPlan";

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
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
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

async function createConnectedRepository(
  t: ConvexTest,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    githubOwnerLogin: string;
    githubRepositoryName: string;
    githubRepositoryDatabaseId: string;
  },
) {
  const ids = await t.mutation(
    internal.repository.records.createInitializingExistingRepositoryForUser,
    {
      organizationId: args.organizationId,
      userId: args.userId,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      githubOwnerLogin: args.githubOwnerLogin,
      githubRepositoryName: args.githubRepositoryName,
    },
  );
  await t.mutation(internal.repository.records.connectExistingRepositoryGitHub, {
    ...ids,
    userId: args.userId,
    githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
    githubOwnerLogin: args.githubOwnerLogin,
    githubRepositoryName: args.githubRepositoryName,
    defaultBranch: "main",
    visibility: "private",
  });
  return ids;
}

describe("organization-owned repositories", () => {
  it("connects an existing repository without deployment provider destinations", async () => {
    const t = makeConvexTest();
    const ownerUserId = await createUser(t, "source-only@example.com");
    const organization = await t.mutation(
      internal.organizations.createOrReconnectVerifiedOrganization,
      {
        userId: ownerUserId,
        githubOwnerId: "source-only-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "source-only",
        githubInstallationId: "source-only-installation",
      },
    );
    const source = await t.mutation(
      internal.repository.records.createInitializingExistingRepositoryForUser,
      {
        organizationId: organization.organizationId,
        userId: ownerUserId,
        githubRepositoryDatabaseId: "source-only-repository",
        githubOwnerLogin: "source-only",
        githubRepositoryName: "app",
      },
    );

    await t.mutation(internal.repository.records.connectExistingRepositoryGitHub, {
      ...source,
      userId: ownerUserId,
      githubRepositoryDatabaseId: "source-only-repository",
      githubOwnerLogin: "source-only",
      githubRepositoryName: "app",
      defaultBranch: "main",
      visibility: "private",
    });

    const repository = await t.run(async (ctx) => await ctx.db.get(source.repositoryId));
    expect(repository).toMatchObject({
      state: "connected",
      githubMode: "connect_existing_repository",
    });
    expect(repository).not.toHaveProperty("convexTeamId");
    expect(repository).not.toHaveProperty("cloudflareAccountId");
  });

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
      asMember.action(api.repository.create, {
        organizationId: organization.organizationId,
        githubRepositoryName: "member-app",
        convexProjectName: "member-app",
        convexDeploymentRegion: "aws-us-east-1",
        cloudflareWorkerName: "member-app",
        cloudflareBuildTokenUuid: "build-token",
        private: true,
      }),
    ).rejects.toThrow("GitHub user authorization is not available for this owner.");
    await expect(
      t.run(async (ctx) => {
        return {
          runs: await ctx.db.query("workflow_repositoryProvisioning_runs").collect(),
          repositories: await ctx.db.query("repositories").collect(),
        };
      }),
    ).resolves.toEqual({ runs: [], repositories: [] });
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
      t.mutation(internal.repository.records.createInitializingExistingRepositoryForUser, {
        organizationId,
        userId: outsiderUserId,
        githubRepositoryDatabaseId: "outsider-app-id",
        githubOwnerLogin: "Samebase",
        githubRepositoryName: "app",
      }),
    ).rejects.toThrow("Organization membership is required.");
    await expect(
      t.mutation(internal.repository.records.createInitializingExistingRepositoryForUser, {
        organizationId,
        userId: ownerUserId,
        githubRepositoryDatabaseId: "wrong-owner-app-id",
        githubOwnerLogin: "another-owner",
        githubRepositoryName: "app",
      }),
    ).rejects.toThrow("Repository owner does not match the organization GitHub owner.");

    const { repositoryId } = await t.mutation(
      internal.repository.records.createInitializingExistingRepositoryForUser,
      {
        organizationId,
        userId: ownerUserId,
        githubRepositoryDatabaseId: "root-app-id",
        githubOwnerLogin: " samebase ",
        githubRepositoryName: "app",
      },
    );
    const snapshot = await t.run(async (ctx) => {
      const repository = await ctx.db.get(repositoryId);
      const preference = await ctx.db
        .query("ui_repositoryResourceLinks_settings")
        .withIndex("by_user_and_repository", (query) =>
          query.eq("userId", ownerUserId).eq("repositoryId", repositoryId),
        )
        .unique();
      return { preference, repository };
    });

    expect(snapshot.repository).toMatchObject({
      organizationId,
      githubRepositoryName: "app",
    });
    expect(snapshot.repository).not.toHaveProperty("owner");
    expect(snapshot.repository).not.toHaveProperty("userId");
    expect(snapshot.preference).toMatchObject({ userId: ownerUserId, repositoryId });
    await expect(
      t.mutation(internal.repository.records.createInitializingExistingRepositoryForUser, {
        organizationId,
        userId: ownerUserId,
        githubRepositoryDatabaseId: "root-app-uppercase-id",
        githubOwnerLogin: "samebase",
        githubRepositoryName: "APP",
      }),
    ).rejects.toThrow("Repository already exists for this repository.");
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
    const zetaRepository = await createConnectedRepository(t, {
      organizationId: zetaOrganizationId,
      userId: memberUserId,
      githubOwnerLogin: "zeta",
      githubRepositoryName: "app-z",
      githubRepositoryDatabaseId: "repository-201",
    });
    const alphaRepository = await createConnectedRepository(t, {
      organizationId: alphaOrganizationId,
      userId: memberUserId,
      githubOwnerLogin: "alpha",
      githubRepositoryName: "app-a",
      githubRepositoryDatabaseId: "repository-202",
    });

    const repositories = await t.query(
      internal.repository.records.listConnectedRepositoriesForUser,
      {
        userId: memberUserId,
      },
    );
    expect(
      repositories.map(
        (repository) => `${repository.githubOwnerLogin}/${repository.githubRepositoryName}`,
      ),
    ).toEqual(["alpha/app-a", "zeta/app-z"]);

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
      asMember.query(api.repository.records.getRepositoryByRepository, {
        githubRepositoryFullName: "alpha/app-a",
      }),
    ).resolves.toMatchObject({ repositoryId: alphaRepository.repositoryId });
    await expect(
      asOutsider.query(api.repository.records.getRepositoryByRepository, {
        githubRepositoryFullName: "alpha/app-a",
      }),
    ).resolves.toBeNull();
    await expect(asOtherMember.query(api.repository.list)).resolves.toMatchObject([
      { repositoryId: zetaRepository.repositoryId, githubRepositoryFullName: "zeta/app-z" },
    ]);

    const firstDashboardRead = await asMember.query(api.repository.list);
    const secondDashboardRead = await asMember.query(api.repository.list);
    expect(secondDashboardRead).toEqual(firstDashboardRead);
    expect(firstDashboardRead.map((repository) => repository.repositoryId).sort()).toEqual(
      [alphaRepository.repositoryId, zetaRepository.repositoryId].sort(),
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
    await createConnectedRepository(t, {
      organizationId: firstOrganizationId,
      userId,
      githubOwnerLogin: "first-owner",
      githubRepositoryName: "first-repository",
      githubRepositoryDatabaseId: "stable-repository-id",
    });
    await expect(
      t.mutation(internal.repository.records.createInitializingExistingRepositoryForUser, {
        organizationId: secondOrganizationId,
        userId,
        githubRepositoryDatabaseId: "stable-repository-id",
        githubOwnerLogin: "second-owner",
        githubRepositoryName: "second-repository",
      }),
    ).rejects.toThrow("Repository already exists for this GitHub repository.");
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
      internal.repository.records.createInitializingExistingRepositoryForUser,
      {
        organizationId,
        userId,
        githubRepositoryDatabaseId: "selected-repository-id",
        githubOwnerLogin: "samebase",
        githubRepositoryName: "selected-repository",
      },
    );

    await expect(
      t.mutation(internal.repository.records.connectExistingRepositoryGitHub, {
        runId: selected.runId,
        repositoryId: selected.repositoryId,
        userId,
        githubRepositoryDatabaseId: "different-repository-id",
        githubOwnerLogin: "samebase",
        githubRepositoryName: "different-repository",
        defaultBranch: "main",
        visibility: "private",
      }),
    ).rejects.toThrow("Provisioning GitHub repository identity cannot be changed.");
    await expect(
      t.run(async (ctx) => await ctx.db.get(selected.repositoryId)),
    ).resolves.toMatchObject({
      state: "provisioning",
      githubRepositoryDatabaseId: "selected-repository-id",
      githubRepositoryName: "selected-repository",
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
      internal.repository.records.createInitializingExistingRepositoryForUser,
      {
        organizationId,
        userId,
        githubRepositoryDatabaseId: "failed-stable-repository-id",
        githubOwnerLogin: "samebase",
        githubRepositoryName: "agent-plugins",
      },
    );
    await t.mutation(internal.repository.records.markGithubProvisioningFailed, {
      runId: failed.runId,
    });

    await expect(
      t.run(async (ctx) => await ctx.db.get(failed.repositoryId)),
    ).resolves.toMatchObject({
      state: "failed",
      githubMode: "connect_existing_repository",
      githubRepositoryDatabaseId: "failed-stable-repository-id",
    });
    const asUser = t.withIdentity({
      subject: `${userId}|failed-repository-identity`,
      tokenIdentifier: `test:${userId}`,
    });
    await expect(asUser.query(api.repository.list, {})).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repositoryId: failed.repositoryId,
          githubRepositoryDatabaseId: "failed-stable-repository-id",
        }),
      ]),
    );

    await expect(
      t.mutation(internal.repository.records.createInitializingExistingRepositoryForUser, {
        organizationId,
        userId,
        githubRepositoryDatabaseId: "failed-stable-repository-id",
        githubOwnerLogin: "samebase",
        githubRepositoryName: "plugin",
      }),
    ).rejects.toThrow("Repository already exists for this GitHub repository.");
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("repositories")
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
    const renamedRepository = await createConnectedRepository(t, {
      organizationId,
      userId,
      githubOwnerLogin: "samebase",
      githubRepositoryName: "agent-plugins",
      githubRepositoryDatabaseId: "renamed-repository-id",
    });

    await expect(
      t.mutation(internal.repository.records.updateGitHubRepositoryNameForUser, {
        userId,
        repositoryId: renamedRepository.repositoryId,
        githubRepositoryDatabaseId: "renamed-repository-id",
        githubOwnerId: "repository-rename-owner",
        expectedStoredName: "agent-plugins",
        repositoryName: "plugin",
      }),
    ).resolves.toEqual({ githubOwnerLogin: "samebase", repositoryName: "plugin" });
    await expect(
      t.mutation(internal.repository.records.updateGitHubRepositoryNameForUser, {
        userId,
        repositoryId: renamedRepository.repositoryId,
        githubRepositoryDatabaseId: "renamed-repository-id",
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
      t.mutation(internal.repository.records.updateGitHubRepositoryNameForUser, {
        userId: memberUserId,
        repositoryId: renamedRepository.repositoryId,
        githubRepositoryDatabaseId: "renamed-repository-id",
        githubOwnerId: "repository-rename-owner",
        expectedStoredName: "plugin",
        repositoryName: "member-update",
      }),
    ).rejects.toThrow("Organization owner access is required.");

    const collisionTarget = await t.mutation(
      internal.repository.records.createInitializingExistingRepositoryForUser,
      {
        organizationId,
        userId,
        githubRepositoryDatabaseId: "occupied-repository-id",
        githubOwnerLogin: "samebase",
        githubRepositoryName: "occupied-name",
      },
    );
    await t.mutation(internal.repository.records.markGithubProvisioningFailed, {
      runId: collisionTarget.runId,
    });
    await expect(
      t.mutation(internal.repository.records.updateGitHubRepositoryNameForUser, {
        userId,
        repositoryId: renamedRepository.repositoryId,
        githubRepositoryDatabaseId: "renamed-repository-id",
        githubOwnerId: "repository-rename-owner",
        expectedStoredName: "plugin",
        repositoryName: "occupied-name",
      }),
    ).rejects.toThrow("Repository already exists for this repository name.");

    const asUser = t.withIdentity({
      subject: `${userId}|repository-rename`,
      tokenIdentifier: `test:${userId}`,
    });
    await expect(asUser.query(api.repository.list, {})).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repositoryId: renamedRepository.repositoryId,
          githubRepositoryDatabaseId: "renamed-repository-id",
          githubRepositoryFullName: "samebase/plugin",
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
    const { repositoryId } = await createConnectedRepository(t, {
      organizationId,
      userId,
      githubOwnerLogin: "before-rename",
      githubRepositoryName: "rename-app",
      githubRepositoryDatabaseId: "rename-repository-id",
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
      asUser.query(api.repository.records.getRepositoryByRepository, {
        githubRepositoryFullName: "before-rename/rename-app",
      }),
    ).resolves.toBeNull();
    await expect(
      asUser.query(api.repository.records.getRepositoryByRepository, {
        githubRepositoryFullName: "after-rename/rename-app",
      }),
    ).resolves.toMatchObject({ repositoryId, githubOwnerLogin: "after-rename" });
    await expect(
      t.query(internal.repository.records.listConnectedRepositoriesForUser, { userId }),
    ).resolves.toMatchObject([{ repositoryId, githubOwnerLogin: "after-rename" }]);
    await expect(asUser.query(api.repository.list)).resolves.toMatchObject([
      { repositoryId, githubRepositoryFullName: "after-rename/rename-app" },
    ]);
    await expect(t.run(async (ctx) => await ctx.db.get(repositoryId))).resolves.not.toHaveProperty(
      "owner",
    );
  });

  it("copies organization destinations into both repository creation paths and preserves them", async () => {
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
      internal.repository.records.createInitializingExistingRepositoryForUser,
      {
        organizationId,
        userId,
        githubRepositoryDatabaseId: "existing-repository-401",
        githubOwnerLogin: "destination-owner",
        githubRepositoryName: "existing-app",
      },
    );
    await expect(
      t.run(async (ctx) => await ctx.db.get(existing.repositoryId)),
    ).resolves.toMatchObject(expectedDestinations);
    await t.mutation(internal.repository.records.connectExistingRepositoryGitHub, {
      ...existing,
      userId,
      githubRepositoryDatabaseId: "existing-repository-401",
      githubOwnerLogin: "destination-owner",
      githubRepositoryName: "existing-app",
      defaultBranch: "main",
      visibility: "private",
    });

    const managed = await t.mutation(
      internal.repository.records.createInitializingSamebaseManagedRepositoryForUser,
      {
        organizationId,
        userId,
        githubOwnerLogin: "destination-owner",
        githubRepositoryName: "managed-app",
        visibility: "private",
        description: null,
        convexTeamId: expectedDestinations.convexTeamId,
        cloudflareAccountId: expectedDestinations.cloudflareAccountId,
        plan: {
          provisioning: "samebase",
          convexProjectName: "managed-app",
          convexDeploymentRegion: "aws-us-east-1",
          cloudflareWorkerName: "managed-app",
          cloudflareBuildTokenUuid: "build-token",
        },
      },
    );
    const initialManagedState = await t.run(async (ctx) => {
      const existingRun = await ctx.db.get(existing.runId);
      const managedRun = await ctx.db.get(managed.runId);
      const repository = await ctx.db.get(managed.repositoryId);
      const plan = await ctx.db
        .query("workflow_repositoryProvisioning_plans")
        .withIndex("by_repository", (query) => query.eq("repositoryId", managed.repositoryId))
        .unique();
      return { existingRun, managedRun, plan, repository };
    });
    expect(initialManagedState.existingRun).toMatchObject({ organizationId });
    expect(initialManagedState.managedRun).toMatchObject({ organizationId });
    expect(initialManagedState.repository).toMatchObject(expectedDestinations);
    const initialPlan = initialManagedState.plan;
    if (!isSamebaseProvisioningPlan(initialPlan)) {
      throw new Error("Expected a samebase provisioning plan.");
    }
    expect(initialPlan.convex).not.toHaveProperty("teamId");
    expect(initialPlan.cloudflare).toMatchObject({ buildTokenUuid: "build-token" });
    expect(initialPlan.cloudflare).not.toHaveProperty("accountId");

    await t.mutation(internal.repository.records.connectSamebaseManagedRepositoryGitHub, {
      ...managed,
      userId,
      githubRepositoryDatabaseId: "managed-repository-401",
      githubOwnerLogin: "destination-owner",
      githubRepositoryName: "managed-app",
      defaultBranch: "main",
      visibility: "private",
    });

    const connectedRepositories = await t.run(async (ctx) => {
      return await Promise.all([
        ctx.db.get(existing.repositoryId),
        ctx.db.get(managed.repositoryId),
      ]);
    });
    expect(connectedRepositories).toEqual([
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
      internal.repository.records.createInitializingExistingRepositoryForUser,
      {
        organizationId,
        userId,
        githubRepositoryDatabaseId: "existing-failure-repository-402",
        githubOwnerLogin: "failure-owner",
        githubRepositoryName: "existing-failure",
      },
    );
    const managed = await t.mutation(
      internal.repository.records.createInitializingSamebaseManagedRepositoryForUser,
      {
        organizationId,
        userId,
        githubOwnerLogin: "failure-owner",
        githubRepositoryName: "managed-failure",
        visibility: "private",
        description: null,
        convexTeamId: expectedDestinations.convexTeamId,
        cloudflareAccountId: expectedDestinations.cloudflareAccountId,
        plan: {
          provisioning: "samebase",
          convexProjectName: "managed-failure",
          convexDeploymentRegion: "aws-us-east-1",
          cloudflareWorkerName: "managed-failure",
          cloudflareBuildTokenUuid: "build-token",
        },
      },
    );

    await t.mutation(internal.repository.records.markGithubProvisioningFailed, {
      runId: existing.runId,
    });
    await t.mutation(internal.repository.records.markGithubProvisioningFailed, {
      runId: managed.runId,
    });

    const failedRepositories = await t.run(async (ctx) => {
      return await Promise.all([
        ctx.db.get(existing.repositoryId),
        ctx.db.get(managed.repositoryId),
      ]);
    });
    expect(failedRepositories).toEqual([
      expect.objectContaining({ ...expectedDestinations, state: "failed" }),
      expect.objectContaining({ ...expectedDestinations, state: "failed" }),
    ]);
  });

  it("rejects provider resources outside the repository destinations", async () => {
    const t = makeConvexTest();
    const userId = await createUser(t, "attachment-owner@example.com");
    const organizationId = await createOrganization(t, {
      userId,
      ownerId: "503",
      ownerLogin: "attachment-owner",
    });
    const repository = await createConnectedRepository(t, {
      organizationId,
      userId,
      githubOwnerLogin: "attachment-owner",
      githubRepositoryName: "attachment-app",
      githubRepositoryDatabaseId: "repository-503",
    });

    await expect(
      t.mutation(internal.repository.convexMutations.attachProjects, {
        repositoryId: repository.repositoryId,
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
    ).rejects.toThrow("Convex project team does not match the repository destination.");
    await expect(
      t.mutation(internal.repository.cloudflareMutations.attachWorkers, {
        repositoryId: repository.repositoryId,
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
    ).rejects.toThrow("Cloudflare Worker account does not match the repository destination.");

    const resources = await t.run(async (ctx) => ({
      projects: await ctx.db
        .query("repositoryConvexProjects")
        .withIndex("by_repository", (query) => query.eq("repositoryId", repository.repositoryId))
        .collect(),
      workers: await ctx.db
        .query("repositoryCloudflareWorkers")
        .withIndex("by_repository", (query) => query.eq("repositoryId", repository.repositoryId))
        .collect(),
    }));
    expect(resources).toEqual({ projects: [], workers: [] });
  });
});
