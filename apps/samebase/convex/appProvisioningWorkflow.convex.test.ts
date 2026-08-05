import { describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

async function createComposedVault() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "composed-app-installation",
      githubOwnerId: "composed-app-owner",
      githubOwnerLogin: "ada",
      githubOwnerLoginNormalized: "ada",
      githubOwnerType: "user",
    });
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    const convexProviderConnectionId = await ctx.db.insert("providerConnections", {
      kind: "convex",
      organizationId,
      connectedByUserId: userId,
      auth: { method: "api_key", credential: "convex-token" },
      teamId: "convex-team",
      createdAt: 1,
      updatedAt: 1,
    });
    const cloudflareProviderConnectionId = await ctx.db.insert("providerConnections", {
      kind: "cloudflare",
      organizationId,
      connectedByUserId: userId,
      auth: { method: "api_key", credential: "cloudflare-token" },
      defaultAccount: { state: "not_selected" },
      createdAt: 1,
      updatedAt: 1,
    });
    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
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
    await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
      vaultId,
      owner: { kind: "managed_run", runId },
      state: "active",
      lastWriteAt: {},
      updatedAt: 20,
    });
    await ctx.db.replace(vaultId, {
      organizationId,
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
    const planId = await ctx.db.insert("workflow_vaultProvisioning_plans", {
      vaultId,
      convexProviderConnectionId,
      cloudflareProviderConnectionId,
      convexConfigPath: "convex.json",
      convex: {
        state: "planned",
        projectName: "composed-app",
        teamId: "convex-team",
      },
      cloudflare: {
        state: "planned",
        accountId: "cloudflare-account",
        workerName: "composed-app",
        rootDirectory: "/",
      },
      createdAt: 30,
      updatedAt: 30,
    });
    return {
      cloudflareProviderConnectionId,
      convexProviderConnectionId,
      organizationId,
      planId,
      runId,
      userId,
      vaultId,
    };
  });
  return { ids, t };
}

async function attachComposedResources({
  ids,
  t,
}: Awaited<ReturnType<typeof createComposedVault>>) {
  return await t.run(async (ctx) => {
    const plan = await ctx.db.get(ids.planId);
    if (!plan) {
      throw new Error("Expected provisioning plan.");
    }
    await ctx.db.patch(plan._id, {
      convex: {
        state: "created",
        projectName: "composed-app",
        teamId: "convex-team",
        projectId: "convex-project",
      },
      cloudflare: {
        state: "created",
        accountId: "cloudflare-account",
        workerName: "composed-app",
        workerTag: "composed-worker-tag",
        rootDirectory: plan.cloudflare.rootDirectory,
      },
    });
    const convexProjectId = await ctx.db.insert("vaultConvexProjects", {
      vaultId: ids.vaultId,
      organizationId: ids.organizationId,
      providerConnectionId: ids.convexProviderConnectionId,
      teamId: "convex-team",
      projectId: "convex-project",
      convexConfigPath: "convex.json",
      origin: "provisioned",
    });
    const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId: ids.vaultId,
      organizationId: ids.organizationId,
      providerConnectionId: ids.cloudflareProviderConnectionId,
      accountId: "cloudflare-account",
      workerName: "composed-app",
      workerTag: "composed-worker-tag",
      origin: "provisioned",
    });
    return { convexProjectId, workerId };
  });
}

describe("app provisioning workflow composition", () => {
  it("maps the provisioning root to the Convex config path and reads exact attachments", async () => {
    const { ids, t } = await createComposedVault();

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      convexConfigPath: "convex.json",
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

  it("keeps managed provider freshness when infrastructure ownership completes", async () => {
    const { ids, t } = await createComposedVault();
    await attachComposedResources({ ids, t });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      await t.mutation(internal.appProvisioningWorkflow.claimComposedInfrastructureProvisioning, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: ids.runId,
      });
      vi.setSystemTime(2_000);
      await t.mutation(internal.vault.infrastructureOperation.recordManagedProviderWrites, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        providers: ["cloudflare"],
      });
      vi.setSystemTime(3_000);
      await t.mutation(internal.vault.infrastructureOperation.recordManagedProviderWrites, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        providers: ["convex", "cloudflare"],
      });
      vi.setSystemTime(4_000);
      await t.mutation(internal.appProvisioningWorkflow.finishComposedInfrastructureProvisioning, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: ids.runId,
      });
    } finally {
      vi.useRealTimers();
    }

    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_vaultProvisioning_writeLocks")
            .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      owner: { kind: "managed_run", runId: ids.runId },
      state: "succeeded",
      lastWriteAt: {
        convex: 3_000,
        cloudflare: 3_000,
      },
      updatedAt: 4_000,
    });
  });

  it("does not finish a managed lock owned by a newer run", async () => {
    const { ids, t } = await createComposedVault();
    const newerRunId = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/composed-app",
        trigger: "retry",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 40,
        updatedAt: 40,
      });
      const writeLock = await ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      if (!writeLock) {
        throw new Error("Expected managed write lock.");
      }
      await ctx.db.replace(writeLock._id, {
        vaultId: ids.vaultId,
        owner: { kind: "managed_run", runId },
        state: "active",
        lastWriteAt: { cloudflare: 41 },
        updatedAt: 42,
      });
      return runId;
    });

    await expect(
      t.mutation(internal.appProvisioningWorkflow.finishComposedInfrastructureProvisioning, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: ids.runId,
      }),
    ).rejects.toThrow("Composed infrastructure run no longer holds the provisioning write lock.");
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_vaultProvisioning_writeLocks")
            .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      owner: { kind: "managed_run", runId: newerRunId },
      state: "active",
      lastWriteAt: { cloudflare: 41 },
      updatedAt: 42,
    });
  });

  it("records a managed provider failure without a finish event", async () => {
    const { ids, t } = await createComposedVault();
    await attachComposedResources({ ids, t });
    await t.mutation(internal.appProvisioningWorkflow.claimComposedInfrastructureProvisioning, {
      userId: ids.userId,
      vaultId: ids.vaultId,
      runId: ids.runId,
    });
    await t.mutation(internal.appProvisioningRuns.appendRunEvent, {
      runId: ids.runId,
      step: "rotate_convex_deploy_keys_for_workers_builds",
      level: "info",
      message: "Rotating Convex deploy keys for Workers Builds.",
      state: "running",
    });
    await t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow",
      message: "Could not set build variables.",
    });

    const result = await t.run(async (ctx) => {
      const events = await ctx.db
        .query("workflow_vaultProvisioning_events")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      return {
        run: await ctx.db.get(ids.runId),
        write: await ctx.db
          .query("workflow_vaultProvisioning_writeLocks")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique(),
        steps: events.map((event) => event.step),
      };
    });
    expect(result.run).toMatchObject({
      state: "failed",
      currentStep: "rotate_convex_deploy_keys_for_workers_builds",
    });
    expect(result.write).toMatchObject({
      owner: { kind: "managed_run", runId: ids.runId },
      state: "failed",
    });
    expect(result.steps).not.toContain("finish");
  });

  it("never takes an active provisioning lock from another run", async () => {
    const { ids, t } = await createComposedVault();
    const retryRunId = await t.run(async (ctx) => {
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
    ).resolves.toMatchObject({
      owner: { kind: "managed_run", runId: ids.runId },
      state: "active",
    });
  });
});
