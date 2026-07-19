import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

const appRoot = ".";

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
    const sourceRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
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
    await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      appRoot,
      createdAt: 25,
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId,
      vaultId,
      repositoryFullName: "ada/manual-convex",
      trigger: "connect_convex_deployment",
      state: "queued",
      currentStep: "run_created",
      createdAt: 30,
      updatedAt: 30,
    });

    return { runId, userId, vaultId };
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
        appRoot,
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
        ...ids,
        appRoot,
        convex: convexRecord,
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ attached: true });
    await expect(
      t.mutation(internal.vault.convexMutations.finishConvexDeploymentConnection, {
        ...ids,
        appRoot,
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
      const writeLock = await ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      const events = await ctx.db
        .query("workflow_vaultProvisioning_events")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      return { deployment, events, writeLock, run };
    });

    expect(result.writeLock).toMatchObject({
      runId: ids.runId,
      state: "succeeded",
    });
    expect(result.run).toMatchObject({
      state: "succeeded",
      currentStep: "finish",
    });
    expect(result.deployment).toMatchObject({
      appRoot,
      projectId: "convex-project",
      deploymentName: "manual-convex-prod",
      origin: "selected_existing",
    });
    expect(result.events.map((event) => event.step)).toEqual([
      "claim_infra",
      "attach_convex",
      "finish",
    ]);
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
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId: ids.vaultId,
        runId: ids.runId,
        state: "active",
        updatedAt: 40,
      });
    });

    await t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
      ...ids,
      appRoot,
      convex: convexRecord,
      origin: "provisioned",
    });
    await expect(
      t.mutation(internal.vault.convexMutations.finishConvexDeploymentConnection, {
        ...ids,
        appRoot,
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(ids.runId);
      const writeLock = await ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      const events = await ctx.db
        .query("workflow_vaultProvisioning_events")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      return { events, writeLock, run };
    });

    expect(result.writeLock).toMatchObject({
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
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId: ids.vaultId,
        runId: ids.runId,
        state: "failed",
        updatedAt: 40,
      });
    });

    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        ...ids,
        appRoot,
      }),
    ).resolves.toEqual({ claimed: true });

    const writeLock = await t.run(async (ctx) => {
      return await ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
    });
    expect(writeLock).toMatchObject({ state: "active", runId: ids.runId });
  });

  it("does not attach when the write lock was superseded", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
      ...ids,
      appRoot,
    });
    await t.run(async (ctx) => {
      const otherRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-convex",
        trigger: "connect_convex_deployment",
        state: "running",
        currentStep: "attach_convex",
        createdAt: 40,
        updatedAt: 40,
      });
      const writeLock = await ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      if (!writeLock) {
        throw new Error("Expected active provisioning write lock.");
      }
      await ctx.db.patch(writeLock._id, {
        runId: otherRunId,
        updatedAt: 40,
      });
    });

    await expect(
      t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
        ...ids,
        appRoot,
        convex: convexRecord,
        origin: "provisioned",
      }),
    ).resolves.toEqual({ attached: false });

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
      appRoot,
    });
    await t.mutation(internal.vault.convexMutations.recordCreatedProjectForRun, {
      ...ids,
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
      const writeLock = await ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      return { writeLock, run };
    });

    expect(result.writeLock).toMatchObject({ state: "failed" });
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
