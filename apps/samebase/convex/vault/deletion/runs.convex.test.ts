import { describe, expect, it } from "vite-plus/test";

import { internal } from "../../_generated/api";
import { makeConvexTest } from "../../test.setup";

const appRoot = ".";

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
    });
    await ctx.db.insert("vaultConvexDeployments", {
      vaultId,
      userId,
      appRoot,
      projectId: "convex-project",
      teamSlug: "ada-team",
      projectSlug: "manual-convex",
      deploymentName: "manual-convex-prod",
      deploymentType: "prod",
      cloudUrl: "https://manual-convex-prod.convex.cloud",
      siteUrl: "https://manual-convex-prod.convex.site",
      previewDeployment: { state: "not_ensured" },
      deployKeys: {
        production: { state: "not_created" },
        preview: { state: "not_created" },
      },
      origin: args.origin,
      connectedAt: 14,
      lastObservedAt: 14,
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

async function createSamebaseManagedVaultWithConvex(args: { withDeployment: boolean }) {
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
    if (args.withDeployment) {
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId,
        userId,
        appRoot,
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "managed-convex",
        deploymentName: "managed-convex-prod",
        deploymentType: "prod",
        cloudUrl: "https://managed-convex-prod.convex.cloud",
        siteUrl: "https://managed-convex-prod.convex.site",
        previewDeployment: { state: "not_ensured" },
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
        origin: "provisioned",
        connectedAt: 14,
        lastObservedAt: 14,
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
    await ctx.db.insert("appProvisioningRuns", {
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
      currentStep: "attach_convex",
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

  it("deletes recorded created Convex projects before deployment ownership checks", async () => {
    const { ids, t } = await createSamebaseManagedVaultWithConvex({
      withDeployment: false,
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
        currentStep: "attach_convex",
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

  it("deletes a managed Convex project only when the deployment proves ownership", async () => {
    const withDeployment = await createSamebaseManagedVaultWithConvex({
      withDeployment: true,
    });
    const withoutDeployment = await createSamebaseManagedVaultWithConvex({
      withDeployment: false,
    });

    const { deletionRunId: deleteRunId } = await withDeployment.t.mutation(
      internal.vault.deletion.runs.createInitialRun,
      {
        ...withDeployment.ids,
        options: deleteConvexOptions,
      },
    );
    const { deletionRunId: skipRunId } = await withoutDeployment.t.mutation(
      internal.vault.deletion.runs.createInitialRun,
      {
        ...withoutDeployment.ids,
        options: deleteConvexOptions,
      },
    );
    const [deleteRun, skipRun] = await Promise.all([
      withDeployment.t.run(async (ctx) => await ctx.db.get(deleteRunId)),
      withoutDeployment.t.run(async (ctx) => await ctx.db.get(skipRunId)),
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
            reason: "not_recorded",
          },
        },
      },
    });
  });
});
