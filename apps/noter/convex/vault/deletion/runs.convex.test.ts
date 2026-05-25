import { describe, expect, it } from "vite-plus/test";

import { internal } from "../../_generated/api";
import { makeConvexTest } from "../../test.setup";

async function createExistingRepositoryVaultWithConvex(args: {
  origin: "provisioned" | "selected_existing";
}) {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/manual-convex",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 10,
      updatedAt: 20,
      completedAt: 20,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: "123",
      owner: "ada",
      name: "manual-convex",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
      convex: {
        state: "connected",
        projectId: "convex-project",
        projectSlug: "manual-convex",
        deploymentName: "manual-convex-prod",
        origin: args.origin,
        connectedAt: 14,
      },
    });
    if (args.origin === "provisioned") {
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        userId,
        auth: {
          method: "api_key",
          credential: "convex-token",
        },
        teamId: "team-id",
        teamSlug: "ada-team",
        createdAt: 15,
        updatedAt: 15,
      });
    }

    return { userId, vaultId };
  });

  return { ids, t };
}

async function createLegacyNoterManagedVaultWithConvex(args: { withInfrastructure: boolean }) {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/managed-convex",
      trigger: "create",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 10,
      updatedAt: 20,
      completedAt: 20,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "create_repository",
      runId,
      ghRepoId: "123",
      owner: "ada",
      name: "managed-convex",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
      convex: {
        state: "connected",
        projectId: "convex-project",
        projectSlug: "managed-convex",
        deploymentName: "managed-convex-prod",
        connectedAt: 14,
      },
    });
    await ctx.db.insert("providerConnections", {
      kind: "convex",
      userId,
      auth: {
        method: "api_key",
        credential: "convex-token",
      },
      teamId: "team-id",
      teamSlug: "ada-team",
      createdAt: 15,
      updatedAt: 15,
    });
    if (args.withInfrastructure) {
      await ctx.db.insert("vaultInfrastructure", {
        vaultId,
        convexProjectId: "convex-project",
        convexTeamSlug: "ada-team",
        convexProjectSlug: "managed-convex",
        convexDeploymentName: "managed-convex-prod",
        convexDeploymentType: "prod",
        convexCloudUrl: "https://managed-convex-prod.convex.cloud",
        convexSiteUrl: "https://managed-convex-prod.convex.site",
        convexDeployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
      });
    }

    return { userId, vaultId };
  });

  return { ids, t };
}

async function createExistingRepositoryVaultWithFailedCreatedConvexProject() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const sourceRunId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/manual-convex",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 10,
      updatedAt: 20,
      completedAt: 20,
    });
    const convexRunId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/manual-convex",
      trigger: "connect_convex_deployment",
      createdConvexProject: {
        projectName: "manual-convex",
        projectId: "created-convex-project",
        projectSlug: "manual-convex",
      },
      state: "failed",
      currentStep: "ensure_convex",
      lastError: "Convex project attach failed.",
      createdAt: 30,
      updatedAt: 40,
      completedAt: 40,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId: sourceRunId,
      ghRepoId: "123",
      owner: "ada",
      name: "manual-convex",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
      convex: {
        state: "failed",
        runId: convexRunId,
        failedAt: 40,
      },
    });
    await ctx.db.insert("providerConnections", {
      kind: "convex",
      userId,
      auth: {
        method: "api_key",
        credential: "convex-token",
      },
      teamId: "team-id",
      teamSlug: "ada-team",
      createdAt: 15,
      updatedAt: 15,
    });

    return { userId, vaultId };
  });

  return { ids, t };
}

const deleteConvexOptions = {
  removeCodespaces: false,
  removeGithubRepo: false,
  removeConvexProvision: true,
  removeCloudflareProvision: false,
};

describe("vault deletion Convex resource planning", () => {
  it("deletes a provisioned Convex project attached to an existing repository vault", async () => {
    const { ids, t } = await createExistingRepositoryVaultWithConvex({
      origin: "provisioned",
    });

    const { deletionRunId } = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      ...ids,
      options: deleteConvexOptions,
    });
    const run = await t.run(async (ctx) => await ctx.db.get(deletionRunId));

    expect(run).toMatchObject({
      snapshot: {
        state: "retained_for_retry",
        plan: {
          convex: {
            action: "delete_project",
            projectId: "convex-project",
          },
        },
      },
    });
  });

  it("skips a selected existing Convex deployment during vault deletion", async () => {
    const { ids, t } = await createExistingRepositoryVaultWithConvex({
      origin: "selected_existing",
    });

    const { deletionRunId } = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      ...ids,
      options: deleteConvexOptions,
    });
    const run = await t.run(async (ctx) => await ctx.db.get(deletionRunId));

    expect(run).toMatchObject({
      snapshot: {
        state: "retained_for_retry",
        plan: {
          convex: {
            action: "skip",
            reason: "not_managed",
          },
        },
      },
    });
  });

  it("deletes a failed manual Convex project created for an existing repository vault", async () => {
    const { ids, t } = await createExistingRepositoryVaultWithFailedCreatedConvexProject();

    const { deletionRunId } = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      ...ids,
      options: deleteConvexOptions,
    });
    const run = await t.run(async (ctx) => await ctx.db.get(deletionRunId));

    expect(run).toMatchObject({
      snapshot: {
        state: "retained_for_retry",
        plan: {
          convex: {
            action: "delete_project",
            projectId: "created-convex-project",
          },
        },
      },
    });
  });

  it("deletes recorded created Convex projects before legacy ownership checks", async () => {
    const { ids, t } = await createLegacyNoterManagedVaultWithConvex({
      withInfrastructure: false,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/managed-convex",
        trigger: "connect_convex_deployment",
        createdConvexProject: {
          projectName: "manual-convex",
          projectId: "created-convex-project",
          projectSlug: "manual-convex",
        },
        state: "failed",
        currentStep: "ensure_convex",
        lastError: "Convex project attach failed.",
        createdAt: 30,
        updatedAt: 40,
        completedAt: 40,
      });
    });

    const { deletionRunId } = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      ...ids,
      options: deleteConvexOptions,
    });
    const run = await t.run(async (ctx) => await ctx.db.get(deletionRunId));

    expect(run).toMatchObject({
      snapshot: {
        state: "retained_for_retry",
        plan: {
          convex: {
            action: "delete_project",
            projectId: "created-convex-project",
          },
        },
      },
    });
  });

  it("deletes a legacy managed Convex project only when infrastructure proves ownership", async () => {
    const withInfrastructure = await createLegacyNoterManagedVaultWithConvex({
      withInfrastructure: true,
    });
    const withoutInfrastructure = await createLegacyNoterManagedVaultWithConvex({
      withInfrastructure: false,
    });

    const { deletionRunId: deleteRunId } = await withInfrastructure.t.mutation(
      internal.vault.deletion.runs.createInitialRun,
      {
        ...withInfrastructure.ids,
        options: deleteConvexOptions,
      },
    );
    const { deletionRunId: skipRunId } = await withoutInfrastructure.t.mutation(
      internal.vault.deletion.runs.createInitialRun,
      {
        ...withoutInfrastructure.ids,
        options: deleteConvexOptions,
      },
    );
    const [deleteRun, skipRun] = await Promise.all([
      withInfrastructure.t.run(async (ctx) => await ctx.db.get(deleteRunId)),
      withoutInfrastructure.t.run(async (ctx) => await ctx.db.get(skipRunId)),
    ]);

    expect(deleteRun).toMatchObject({
      snapshot: {
        state: "retained_for_retry",
        plan: {
          convex: {
            action: "delete_project",
            projectId: "convex-project",
          },
        },
      },
    });
    expect(skipRun).toMatchObject({
      snapshot: {
        state: "retained_for_retry",
        plan: {
          convex: {
            action: "skip",
            reason: "not_managed",
          },
        },
      },
    });
  });
});
