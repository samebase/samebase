import { describe, expect, it } from "vite-plus/test";

import { internal } from "../../_generated/api";
import { makeConvexTest } from "../../test.setup";

const rootDirectory = "/";

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
    const appId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory,
      createdAt: 13,
    });
    const convexDeploymentId = await ctx.db.insert("vaultConvexDeployments", {
      upstream: { state: "present" },
      vaultId,
      userId,
      appId,
      teamId: "convex-team",
      projectId: "convex-project",
      teamSlug: "ada-team",
      projectSlug: "manual-convex",
      deploymentName: "manual-convex-prod",
      deploymentType: "prod",
      cloudUrl: "https://manual-convex-prod.convex.cloud",
      siteUrl: "https://manual-convex-prod.convex.site",
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

    return { appId, convexDeploymentId, userId, vaultId };
  });

  return {
    ids: { userId: ids.userId, vaultId: ids.vaultId },
    resources: { appId: ids.appId, convexDeploymentId: ids.convexDeploymentId },
    t,
  };
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
    const appId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory,
      createdAt: 13,
    });
    if (args.withDeployment) {
      await ctx.db.insert("vaultConvexDeployments", {
        upstream: { state: "present" },
        vaultId,
        userId,
        appId,
        teamId: "convex-team",
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "managed-convex",
        deploymentName: "managed-convex-prod",
        deploymentType: "prod",
        cloudUrl: "https://managed-convex-prod.convex.cloud",
        siteUrl: "https://managed-convex-prod.convex.site",
        origin: "provisioned",
        connectedAt: 14,
        lastObservedAt: 14,
      });
    }

    return { appId, userId, vaultId };
  });

  return {
    ids: { userId: ids.userId, vaultId: ids.vaultId },
    resources: { appId: ids.appId },
    t,
  };
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
    const failedRunId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/manual-convex",
      trigger: "connect_convex_deployment",
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
    const appId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory,
      createdAt: 13,
    });
    await ctx.db.insert("vaultConvexProjectCreationClaims", {
      vaultId,
      userId,
      appId,
      runId: failedRunId,
      teamId: "team-id",
      projectName: "manual-convex",
      lifecycle: {
        state: "created",
        projectId: "created-convex-project",
      },
      createdAt: 30,
      updatedAt: 40,
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

async function createExistingRepositoryVaultWithCloudflareWorker(args: {
  origin: "provisioned" | "selected_existing";
}) {
  const { ids, resources, t } = await createExistingRepositoryVaultWithConvex({
    origin: "selected_existing",
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("providerConnections", {
      kind: "cloudflare",
      userId: ids.userId,
      auth: {
        method: "api_key",
        credential: "cloudflare-token",
      },
      defaultAccount: {
        state: "selected",
        accountId: "cloudflare-account",
        accountName: "Ada Cloud",
      },
      createdAt: 15,
      updatedAt: 15,
    });
    await ctx.db.insert("vaultCloudflareWorkers", {
      workersDev: { state: "unknown" },
      upstream: { state: "present" },
      vaultId: ids.vaultId,
      userId: ids.userId,
      appId: resources.appId,
      accountId: "cloudflare-account",
      workerName: "manual-worker",
      workerTag: "worker-tag",
      origin: args.origin,
      builds: {
        state: "connected",
        buildCommand: "pnpm run build",
        deployCommand: "pnpm run deploy",
        previewDeployCommand: "pnpm run deploy:preview",
        pathIncludes: ["*"],
        pathExcludes: [],
        production: {
          triggerUuid: "production-trigger",
          buildTokenUuid: "production-token",
        },
        preview: {
          triggerUuid: "preview-trigger",
          buildTokenUuid: "preview-token",
        },
      },
      connectedAt: 16,
      lastObservedAt: 16,
    });
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
            action: "delete_projects",
            projects: [{ teamId: "convex-team", projectId: "convex-project" }],
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

  it("retains relation-owned Convex deploy keys when provider resources are not selected", async () => {
    const { ids, resources, t } = await createExistingRepositoryVaultWithConvex({
      origin: "selected_existing",
    });
    await t.run(async (ctx) => {
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        workersDev: { state: "unknown" },
        upstream: { state: "present" },
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: resources.appId,
        accountId: "cloudflare-account",
        workerName: "manual-convex-worker",
        workerTag: "worker-tag",
        origin: "selected_existing",
        builds: { state: "not_connected" },
        connectedAt: 16,
        lastObservedAt: 16,
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-convex",
        trigger: "retry",
        state: "failed",
        currentStep: "wire_convex_build_access",
        lastError: "Convex deploy-key creation outcome is unknown.",
        createdAt: 17,
        updatedAt: 17,
        completedAt: 17,
      });
      await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        workerId,
        convexDeploymentId: resources.convexDeploymentId,
        wiring: {
          state: "not_wired",
          deployKeys: {
            production: {
              state: "creating",
              runId,
              name: "production-key-name",
              deploymentName: "existing-prod",
            },
            preview: {
              state: "creating",
              runId,
              name: "preview-key-name",
              projectId: "existing-project",
            },
          },
        },
        createdAt: 17,
        updatedAt: 17,
      });
    });

    const { deletionRunId } = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      ...ids,
      options: {
        removeCodespaces: false,
        removeGithubRepo: false,
        removeConvexProvision: false,
        removeCloudflareProvision: false,
      },
    });
    const run = await t.run(async (ctx) => await ctx.db.get(deletionRunId));

    expect(run?.snapshot).toEqual({
      state: "retained_for_retry",
      plan: {
        target: {
          kind: "existing_repository",
          ghRepoId: "123",
          owner: "ada",
          name: "manual-convex",
          repositoryFullName: "ada/manual-convex",
        },
        codespaces: { action: "skip", reason: "not_requested" },
        convex: { action: "skip", reason: "not_requested" },
        cloudflare: { action: "skip", reason: "not_requested" },
        githubRepository: { action: "skip", reason: "not_requested" },
      },
    });
    await expect(
      t.run(async (ctx) => {
        return await ctx.db
          .query("vaultWorkerDeploymentDependencies")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique();
      }),
    ).resolves.toMatchObject({
      wiring: {
        state: "not_wired",
        deployKeys: {
          production: {
            state: "creating",
            name: "production-key-name",
            deploymentName: "existing-prod",
          },
          preview: {
            state: "creating",
            name: "preview-key-name",
            projectId: "existing-project",
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
            action: "delete_projects",
            projects: [{ teamId: "team-id", projectId: "created-convex-project" }],
          },
        },
      },
    });
  });

  it("deletes recorded created Convex projects before deployment ownership checks", async () => {
    const { ids, resources, t } = await createSamebaseManagedVaultWithConvex({
      withDeployment: false,
    });
    await t.run(async (ctx) => {
      const failedRunId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/managed-convex",
        trigger: "connect_convex_deployment",
        state: "failed",
        currentStep: "attach_convex",
        lastError: "Convex project attach failed.",
        createdAt: 30,
        updatedAt: 40,
        completedAt: 40,
      });
      await ctx.db.insert("vaultConvexProjectCreationClaims", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: resources.appId,
        runId: failedRunId,
        teamId: "team-id",
        projectName: "manual-convex",
        lifecycle: {
          state: "created",
          projectId: "created-convex-project",
        },
        createdAt: 30,
        updatedAt: 40,
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
            action: "delete_projects",
            projects: [{ teamId: "team-id", projectId: "created-convex-project" }],
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
            action: "delete_projects",
            projects: [{ teamId: "convex-team", projectId: "convex-project" }],
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

describe("vault deletion Cloudflare Worker planning", () => {
  it.each([
    {
      description: "selected existing",
      origin: "selected_existing",
      removeCloudflareProvision: true,
      cloudflareReason: "not_recorded",
    },
    {
      description: "unrequested provisioned",
      origin: "provisioned",
      removeCloudflareProvision: false,
      cloudflareReason: "not_requested",
    },
  ] as const)(
    "retains connected builds on a retained $description Worker",
    async ({ cloudflareReason, origin, removeCloudflareProvision }) => {
      const { ids, t } = await createExistingRepositoryVaultWithCloudflareWorker({ origin });

      const { deletionRunId } = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
        ...ids,
        options: {
          removeCodespaces: false,
          removeGithubRepo: false,
          removeConvexProvision: false,
          removeCloudflareProvision,
        },
      });
      const run = await t.run(async (ctx) => await ctx.db.get(deletionRunId));

      expect(run?.snapshot).toEqual({
        state: "retained_for_retry",
        plan: {
          target: {
            kind: "existing_repository",
            ghRepoId: "123",
            owner: "ada",
            name: "manual-convex",
            repositoryFullName: "ada/manual-convex",
          },
          codespaces: { action: "skip", reason: "not_requested" },
          convex: { action: "skip", reason: "not_requested" },
          cloudflare: { action: "skip", reason: cloudflareReason },
          githubRepository: { action: "skip", reason: "not_requested" },
        },
      });
    },
  );

  it("plans an explicitly selected provisioned Worker for deletion", async () => {
    const { ids, t } = await createExistingRepositoryVaultWithCloudflareWorker({
      origin: "provisioned",
    });

    const { deletionRunId } = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      ...ids,
      options: {
        removeCodespaces: false,
        removeGithubRepo: false,
        removeConvexProvision: false,
        removeCloudflareProvision: true,
      },
    });
    const run = await t.run(async (ctx) => await ctx.db.get(deletionRunId));

    expect(run?.snapshot).toEqual({
      state: "retained_for_retry",
      plan: {
        target: {
          kind: "existing_repository",
          ghRepoId: "123",
          owner: "ada",
          name: "manual-convex",
          repositoryFullName: "ada/manual-convex",
        },
        codespaces: { action: "skip", reason: "not_requested" },
        convex: { action: "skip", reason: "not_requested" },
        cloudflare: {
          action: "delete_worker",
          accountId: "cloudflare-account",
          workerName: "manual-worker",
          workerTag: "worker-tag",
        },
        githubRepository: { action: "skip", reason: "not_requested" },
      },
    });
  });
});
