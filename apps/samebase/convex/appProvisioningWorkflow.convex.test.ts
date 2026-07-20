import { v } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { makeConvexTest } from "./test.setup";

const workflowCloudflareActions = vi.hoisted(() => {
  const build = {
    production: { triggerUuid: "production-trigger" },
    preview: { triggerUuid: "preview-trigger" },
  };
  return {
    build,
    configureWorkersBuildsForGitHub: vi.fn(async (_args: unknown) => build),
    rotateConvexDeployKeysForWorkersBuilds: vi.fn(async (_args: unknown) => null),
  };
});

vi.mock("./vault/cloudflare", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vault/cloudflare")>();
  const { id, null: nullValue, object, string } = v;
  const preparedBuilds = object({
    production: object({ triggerUuid: string() }),
    preview: object({ triggerUuid: string() }),
  });
  return {
    ...actual,
    configureWorkersBuildsForGitHubForWorkflow: internalAction({
      args: {
        vaultId: id("vaults"),
        runId: id("workflow_vaultProvisioning_runs"),
        userId: id("users"),
        workerId: id("vaultCloudflareWorkers"),
      },
      returns: preparedBuilds,
      handler: async (_ctx, args) => {
        return await workflowCloudflareActions.configureWorkersBuildsForGitHub(args);
      },
    }),
    rotateConvexDeployKeysForWorkersBuildsForWorkflow: internalAction({
      args: {
        vaultId: id("vaults"),
        runId: id("workflow_vaultProvisioning_runs"),
        userId: id("users"),
        workerId: id("vaultCloudflareWorkers"),
        convexProjectId: id("vaultConvexProjects"),
        build: preparedBuilds,
      },
      returns: nullValue(),
      handler: async (_ctx, args): Promise<null> => {
        await workflowCloudflareActions.rotateConvexDeployKeysForWorkersBuilds(args);
        return null;
      },
    }),
  };
});

async function createComposedVault() {
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
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId,
      vaultId,
      repositoryFullName: "ada/composed-app",
      trigger: "create",
      state: "running",
      currentStep: "sync_tree",
      createdAt: 10,
      updatedAt: 20,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "create_repository",
      runId,
      ghRepoId: "123",
      owner: "ada",
      name: "composed-app",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
    });
    const appId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory: "/",
      createdAt: 25,
    });
    await ctx.db.insert("workflow_vaultProvisioning_plans", {
      vaultId,
      userId,
      appRoot: ".",
      convex: {
        state: "planned",
        projectName: "composed-app",
      },
      cloudflare: {
        state: "planned",
        accountId: "cloudflare-account",
        workerName: "composed-app",
        build: {
          rootDirectory: "/",
          buildCommand: "pnpm run build",
          deployCommand: "pnpm run deploy",
          previewDeployCommand: "pnpm run deploy:preview",
          pathIncludes: ["*"],
          pathExcludes: [],
        },
      },
      createdAt: 30,
      updatedAt: 30,
    });
    return { appId, runId, userId, vaultId };
  });
  return { ids, t };
}

async function attachComposedResources({
  ids,
  t,
}: Awaited<ReturnType<typeof createComposedVault>>) {
  return await t.run(async (ctx) => {
    const convexProjectId = await ctx.db.insert("vaultConvexProjects", {
      vaultId: ids.vaultId,
      userId: ids.userId,
      appId: ids.appId,
      teamId: "convex-team",
      projectId: "convex-project",
      origin: "provisioned",
      createdAt: 40,
    });
    const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId: ids.vaultId,
      userId: ids.userId,
      appId: ids.appId,
      accountId: "cloudflare-account",
      workerName: "composed-app",
      workerTag: "composed-worker-tag",
      origin: "provisioned",
      createdAt: 50,
    });
    return { convexProjectId, workerId };
  });
}

describe("app provisioning workflow composition", () => {
  beforeEach(() => {
    workflowCloudflareActions.configureWorkersBuildsForGitHub.mockReset();
    workflowCloudflareActions.configureWorkersBuildsForGitHub.mockResolvedValue(
      workflowCloudflareActions.build,
    );
    workflowCloudflareActions.rotateConvexDeployKeysForWorkersBuilds.mockReset();
    workflowCloudflareActions.rotateConvexDeployKeysForWorkersBuilds.mockResolvedValue(null);
  });

  it("maps the legacy root plan to the repository-root app and reads attachments", async () => {
    const { ids, t } = await createComposedVault();

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      appId: ids.appId,
      appRoot: ".",
      convex: {
        state: "missing",
        projectName: "composed-app",
      },
      cloudflare: {
        state: "missing",
        accountId: "cloudflare-account",
        workerName: "composed-app",
      },
    });

    const attachments = await attachComposedResources({ ids, t });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toMatchObject({
      convex: { state: "attached", convexProjectId: attachments.convexProjectId },
      cloudflare: { state: "attached", workerId: attachments.workerId },
    });
  });

  it("configures Workers Builds and rotates Convex deploy keys before completing managed infrastructure", async () => {
    const { ids, t } = await createComposedVault();
    const attachments = await attachComposedResources({ ids, t });
    vi.useFakeTimers();
    try {
      await t.mutation(internal.appProvisioningWorkflow.startVaultInfrastructureProvisioning, {
        vaultId: ids.vaultId,
        runId: ids.runId,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    expect(workflowCloudflareActions.configureWorkersBuildsForGitHub).toHaveBeenCalledWith({
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      workerId: attachments.workerId,
    });
    expect(workflowCloudflareActions.rotateConvexDeployKeysForWorkersBuilds).toHaveBeenCalledWith({
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      workerId: attachments.workerId,
      convexProjectId: attachments.convexProjectId,
      build: workflowCloudflareActions.build,
    });
    expect(
      workflowCloudflareActions.configureWorkersBuildsForGitHub.mock.invocationCallOrder[0],
    ).toBeLessThan(
      workflowCloudflareActions.rotateConvexDeployKeysForWorkersBuilds.mock.invocationCallOrder[0],
    );

    const result = await t.run(async (ctx) => {
      const events = await ctx.db
        .query("workflow_vaultProvisioning_events")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      return {
        run: await ctx.db.get(ids.runId),
        steps: events.map((event) => event.step),
      };
    });
    expect(result.run).toMatchObject({ state: "succeeded", currentStep: "finish" });
    expect(result.steps).toEqual([
      "claim_infra",
      "claim_infra",
      "configure_workers_builds_for_github",
      "rotate_convex_deploy_keys_for_workers_builds",
      "finish",
    ]);
  });

  it("does not report success when Convex deploy-key rotation fails", async () => {
    const { ids, t } = await createComposedVault();
    await attachComposedResources({ ids, t });
    workflowCloudflareActions.rotateConvexDeployKeysForWorkersBuilds.mockRejectedValueOnce(
      new Error("Could not set build variables."),
    );
    vi.useFakeTimers();
    try {
      await t.mutation(internal.appProvisioningWorkflow.startVaultInfrastructureProvisioning, {
        vaultId: ids.vaultId,
        runId: ids.runId,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    const result = await t.run(async (ctx) => {
      const events = await ctx.db
        .query("workflow_vaultProvisioning_events")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      return {
        run: await ctx.db.get(ids.runId),
        steps: events.map((event) => event.step),
      };
    });
    expect(result.run).toMatchObject({
      state: "failed",
      currentStep: "rotate_convex_deploy_keys_for_workers_builds",
    });
    expect(result.steps).not.toContain("finish");
  });

  it("never takes an active provisioning lock from another run", async () => {
    const { ids, t } = await createComposedVault();
    const retryRunId = await t.run(async (ctx) => {
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId: ids.vaultId,
        runId: ids.runId,
        state: "active",
        updatedAt: 0,
      });
      return await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/composed-app",
        trigger: "retry",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 100,
        updatedAt: 100,
      });
    });

    await expect(
      t.mutation(internal.appProvisioningWorkflow.claimComposedInfrastructureProvisioning, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: retryRunId,
      }),
    ).resolves.toEqual({ claimed: false });

    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_vaultProvisioning_writeLocks")
            .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
            .unique(),
      ),
    ).resolves.toMatchObject({ runId: ids.runId, state: "active" });
  });
});
