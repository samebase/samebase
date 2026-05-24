import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

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
      convex: { state: "not_configured" },
      cloudflare: { state: "not_configured" },
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
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, ids),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
        ...ids,
        convex: convexRecord,
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ attached: true });
    await expect(
      t.mutation(internal.vault.convexMutations.finishConvexDeploymentConnection, ids),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const [vault, run, infrastructure] = await Promise.all([
        ctx.db.get(ids.vaultId),
        ctx.db.get(ids.runId),
        ctx.db
          .query("vaultInfrastructure")
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
      return { events, infrastructure, ownership, run, vault };
    });

    expect(result.ownership).toMatchObject({
      runId: ids.runId,
      state: "succeeded",
    });
    expect(result.run).toMatchObject({
      state: "succeeded",
      currentStep: "finish",
    });
    expect(result.vault).toMatchObject({
      convex: {
        state: "connected",
        projectId: "convex-project",
        projectSlug: "manual-convex",
        deploymentName: "manual-convex-prod",
        origin: "selected_existing",
      },
    });
    expect(result.infrastructure).toMatchObject({
      ...convexRecord,
      convexDeployKeys: {
        production: { state: "not_created" },
        preview: { state: "not_created" },
      },
    });
    expect(result.events.map((event) => event.step)).toEqual([
      "claim_infra",
      "ensure_convex",
      "finish",
    ]);
  });

  it("allows a failed Convex connection row to be claimed again", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.vaultId, {
        convex: {
          state: "failed",
          runId: ids.runId,
          failedAt: 40,
        },
      });
    });

    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, ids),
    ).resolves.toEqual({ claimed: true });

    const vault = await t.run(async (ctx) => await ctx.db.get(ids.vaultId));
    expect(vault).toMatchObject({
      convex: {
        state: "provisioning",
        runId: ids.runId,
      },
    });
  });

  it("resets deploy keys when attaching through an existing infrastructure row", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultInfrastructure", {
        vaultId: ids.vaultId,
        convexProjectId: "old-project",
        convexTeamSlug: "ada-team",
        convexProjectSlug: "old-project",
        convexDeploymentName: "old-prod",
        convexDeploymentType: "prod",
        convexCloudUrl: "https://old-prod.convex.cloud",
        convexSiteUrl: "https://old-prod.convex.site",
        convexDeployKeys: {
          production: { state: "created", id: "prod-key" },
          preview: { state: "created", id: "preview-key" },
        },
      });
    });

    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, ids);
    await expect(
      t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
        ...ids,
        convex: convexRecord,
        origin: "provisioned",
      }),
    ).resolves.toEqual({ attached: true });

    const infrastructure = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultInfrastructure")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .first(),
    );

    expect(infrastructure).toMatchObject({
      ...convexRecord,
      convexDeployKeys: {
        production: { state: "not_created" },
        preview: { state: "not_created" },
      },
    });
  });

  it("does not attach when ownership was superseded", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, ids);
    await t.run(async (ctx) => {
      const otherRunId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-convex",
        trigger: "connect_convex_deployment",
        state: "running",
        currentStep: "ensure_convex",
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
    ).resolves.toEqual({ attached: false });

    const result = await t.run(async (ctx) => {
      const [run, vault] = await Promise.all([ctx.db.get(ids.runId), ctx.db.get(ids.vaultId)]);
      return { run, vault };
    });

    expect(result.run).toMatchObject({
      state: "canceled",
      currentStep: "claim_infra",
    });
    expect(result.vault).toMatchObject({
      convex: { state: "provisioning" },
    });
  });

  it("marks an active Convex connection run and vault row failed when the workflow fails", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, ids);
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
      const [vault, run] = await Promise.all([ctx.db.get(ids.vaultId), ctx.db.get(ids.runId)]);
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      return { ownership, run, vault };
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
    expect(result.vault).toMatchObject({
      convex: {
        state: "failed",
        runId: ids.runId,
      },
    });
  });
});
