import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
import { isWorkerDeploymentDependencyCurrentlyWired } from "./deploymentDependencies";

async function createConvexConnectionVault() {
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
      rootDirectory: "/",
      createdAt: 25,
    });
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/manual-convex",
      trigger: "connect_convex_deployment",
      state: "queued",
      currentStep: "run_created",
      createdAt: 30,
      updatedAt: 30,
    });

    return { appId, runId, userId, vaultId };
  });

  return { ids, t };
}

const convexRecord = {
  convexProjectId: "convex-project",
  convexTeamSlug: "ada-team",
  convexProjectSlug: "manual-convex",
  convexDeploymentName: "manual-convex-prod",
  convexDeploymentType: "prod",
  convexCloudUrl: "https://manual-convex-prod.convex.cloud",
  convexSiteUrl: "https://manual-convex-prod.convex.site",
} as const;

describe("vault Convex deployment connection mutations", () => {
  it("claims, attaches, and finishes a durable Convex deployment connection run", async () => {
    const { ids, t } = await createConvexConnectionVault();

    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        ...ids,
      }),
    ).resolves.toEqual({ claimed: true });
    const attachment = await t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
      ...ids,
      convex: convexRecord,
      origin: "selected_existing",
    });
    expect(attachment.state).toBe("attached");
    if (attachment.state !== "attached") {
      throw new Error("Expected Convex deployment to attach.");
    }
    await expect(
      t.mutation(internal.vault.convexMutations.finishConvexDeploymentConnection, {
        deploymentId: attachment.deploymentId,
        runId: ids.runId,
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const [run, deployment] = await Promise.all([
        ctx.db.get(ids.runId),
        ctx.db
          .query("vaultConvexDeployments")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .first(),
      ]);
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      return { deployment, events, ownership, run };
    });

    expect(result.ownership).toMatchObject({
      runId: ids.runId,
      state: "succeeded",
    });
    expect(result.run).toMatchObject({
      state: "succeeded",
      currentStep: "finish",
    });
    expect(result.deployment).toMatchObject({
      appId: ids.appId,
      projectId: "convex-project",
      teamSlug: "ada-team",
      projectSlug: "manual-convex",
      deploymentName: "manual-convex-prod",
      origin: "selected_existing",
    });
    expect(result.events.map((event) => event.step)).toEqual([
      "claim_infra",
      "attach_convex",
      "finish",
    ]);
  });

  it("retargets a missing-upstream deployment without rewriting dependent Worker rows", async () => {
    const { ids, t } = await createConvexConnectionVault();
    const dependencyIds = await t.run(async (ctx) => {
      const deploymentId = await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        projectId: "old-project",
        teamSlug: "old-team",
        projectSlug: "old-project",
        deploymentName: "old-prod",
        deploymentType: "prod",
        cloudUrl: "https://old-prod.convex.cloud",
        siteUrl: "https://old-prod.convex.site",
        origin: "selected_existing",
        upstream: { state: "missing_upstream" },
        connectedAt: 20,
        lastObservedAt: 20,
      });
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "cloudflare-account",
        workerName: "manual-convex-worker",
        workerTag: "manual-convex-worker-tag",
        origin: "selected_existing",
        upstream: { state: "present" },
        builds: { state: "not_connected" },
        connectedAt: 20,
        lastObservedAt: 20,
      });
      const dependencyId = await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        workerId,
        convexDeploymentId: deploymentId,
        wiring: {
          state: "wired",
          deployKeys: {
            production: {
              state: "created",
              name: "old-production-key",
              deploymentName: "old-prod",
            },
            preview: {
              state: "created",
              name: "old-preview-key",
              projectId: "old-project",
            },
          },
        },
        createdAt: 20,
        updatedAt: 20,
      });
      const siblingWorkerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "cloudflare-account",
        workerName: "manual-convex-sibling",
        workerTag: "manual-convex-sibling-tag",
        origin: "selected_existing",
        upstream: { state: "present" },
        builds: { state: "not_connected" },
        connectedAt: 20,
        lastObservedAt: 20,
      });
      const siblingDependencyId = await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        workerId: siblingWorkerId,
        convexDeploymentId: deploymentId,
        wiring: {
          state: "wired",
          deployKeys: {
            production: {
              state: "created",
              name: "old-sibling-production-key",
              deploymentName: "old-prod",
            },
            preview: {
              state: "created",
              name: "old-sibling-preview-key",
              projectId: "old-project",
            },
          },
        },
        createdAt: 20,
        updatedAt: 20,
      });
      return [dependencyId, siblingDependencyId];
    });

    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        ...ids,
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.query(internal.vault.convexMutations.readActiveConvexDeploymentConnection, {
        ...ids,
      }),
    ).resolves.toEqual({ active: true });
    const attachment = await t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
      ...ids,
      convex: convexRecord,
      origin: "selected_existing",
    });
    expect(attachment.state).toBe("attached");
    if (attachment.state !== "attached") {
      throw new Error("Expected Convex deployment to attach.");
    }
    await expect(
      t.mutation(internal.vault.convexMutations.finishConvexDeploymentConnection, {
        deploymentId: attachment.deploymentId,
        runId: ids.runId,
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toBeNull();

    const persisted = await t.run(async (ctx) => {
      const deployments = await ctx.db
        .query("vaultConvexDeployments")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
      const dependencies = await Promise.all(
        dependencyIds.map(async (dependencyId) => await ctx.db.get(dependencyId)),
      );
      const deployment = deployments[0];
      return {
        currentlyWired: dependencies.map((dependency) =>
          dependency ? isWorkerDeploymentDependencyCurrentlyWired(dependency, deployment) : null,
        ),
        dependencies,
        deployments,
      };
    });

    expect(persisted.deployments).toHaveLength(1);
    expect(persisted.deployments[0]).toMatchObject({
      projectId: "convex-project",
      deploymentName: "manual-convex-prod",
      upstream: { state: "present" },
    });
    expect(persisted.dependencies).toMatchObject([
      {
        wiring: {
          state: "wired",
          deployKeys: {
            production: {
              state: "created",
              name: "old-production-key",
              deploymentName: "old-prod",
            },
            preview: {
              state: "created",
              name: "old-preview-key",
              projectId: "old-project",
            },
          },
        },
      },
      {
        wiring: {
          state: "wired",
          deployKeys: {
            production: {
              state: "created",
              name: "old-sibling-production-key",
              deploymentName: "old-prod",
            },
            preview: {
              state: "created",
              name: "old-sibling-preview-key",
              projectId: "old-project",
            },
          },
        },
      },
    ]);
    expect(persisted.currentlyWired).toEqual([false, false]);
  });

  it("rejects reconnecting a missing-upstream Convex row to a project held by a present row", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.run(async (ctx) => {
      const adminAppId = await ctx.db.insert("vaultApps", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        rootDirectory: "apps/admin",
        createdAt: 26,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        projectId: "old-project",
        teamSlug: "old-team",
        projectSlug: "old-project",
        deploymentName: "old-prod",
        deploymentType: "prod",
        cloudUrl: "https://old-prod.convex.cloud",
        siteUrl: "https://old-prod.convex.site",
        origin: "selected_existing",
        upstream: { state: "missing_upstream" },
        connectedAt: 20,
        lastObservedAt: 20,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: adminAppId,
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "manual-convex",
        deploymentName: "manual-convex-prod",
        deploymentType: "prod",
        cloudUrl: "https://manual-convex-prod.convex.cloud",
        siteUrl: "https://manual-convex-prod.convex.site",
        origin: "selected_existing",
        upstream: { state: "present" },
        connectedAt: 25,
        lastObservedAt: 25,
      });
    });

    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        ...ids,
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
        ...ids,
        convex: convexRecord,
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ state: "not_attached" });

    const events = await t.run(async (ctx) => {
      return await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
    });
    expect(events.at(-1)).toMatchObject({
      level: "warn",
      message: "Convex project is already attached to this vault.",
    });
  });

  it("keeps composed create runs active when finishing the Convex deployment block", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.runId, {
        trigger: "create",
        state: "running",
        currentStep: "attach_convex",
        updatedAt: 40,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId: ids.vaultId,
        runId: ids.runId,
        state: "active",
        updatedAt: 40,
      });
    });

    const attachment = await t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
      ...ids,
      convex: convexRecord,
      origin: "provisioned",
    });
    expect(attachment.state).toBe("attached");
    if (attachment.state !== "attached") {
      throw new Error("Expected Convex deployment to attach.");
    }
    await expect(
      t.mutation(internal.vault.convexMutations.finishConvexDeploymentConnection, {
        deploymentId: attachment.deploymentId,
        runId: ids.runId,
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(ids.runId);
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      return { events, ownership, run };
    });

    expect(result.ownership).toMatchObject({
      runId: ids.runId,
      state: "active",
    });
    expect(result.run).toMatchObject({
      state: "running",
      currentStep: "attach_convex",
    });
    expect(result.events.map((event) => event.step)).toEqual(["attach_convex", "attach_convex"]);
  });

  it("allows a failed Convex connection owner to be claimed again", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId: ids.vaultId,
        runId: ids.runId,
        state: "failed",
        updatedAt: 40,
      });
    });

    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        ...ids,
      }),
    ).resolves.toEqual({ claimed: true });

    const ownership = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
    });
    expect(ownership).toMatchObject({ state: "active", runId: ids.runId });
  });

  it("does not attach when ownership was superseded", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
      ...ids,
    });
    await t.run(async (ctx) => {
      const otherRunId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-convex",
        trigger: "connect_convex_deployment",
        state: "running",
        currentStep: "attach_convex",
        createdAt: 40,
        updatedAt: 40,
      });
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      if (!ownership) {
        throw new Error("Expected active ownership.");
      }
      await ctx.db.patch(ownership._id, {
        runId: otherRunId,
        updatedAt: 40,
      });
    });

    await expect(
      t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
        ...ids,
        convex: convexRecord,
        origin: "provisioned",
      }),
    ).resolves.toEqual({ state: "not_attached" });

    const result = await t.run(async (ctx) => await ctx.db.get(ids.runId));

    expect(result).toMatchObject({
      state: "canceled",
      currentStep: "claim_infra",
    });
  });

  it("marks an active Convex connection owner failed when the workflow fails", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
      ...ids,
    });
    await t.mutation(internal.vault.convexMutations.recordCreatedProjectForRun, {
      runId: ids.runId,
      userId: ids.userId,
      vaultId: ids.vaultId,
      projectName: "manual-convex",
      projectId: "created-convex-project",
      projectSlug: "manual-convex",
    });

    await expect(
      t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
        runId: ids.runId,
        workflowId: "workflow-1",
        message: "Convex deployment lookup failed.",
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(ids.runId);
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      return { ownership, run };
    });

    expect(result.ownership).toMatchObject({ state: "failed" });
    expect(result.run).toMatchObject({
      state: "failed",
      createdConvexProject: {
        projectName: "manual-convex",
        projectId: "created-convex-project",
        projectSlug: "manual-convex",
      },
    });
  });
});
