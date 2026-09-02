import { describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import { startRepositoryInfrastructureProvisioningWorkflow } from "./repositoryProvisioningWorkflow";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "./test.setup";

async function createComposedRepository(buildTokenUuid: string | null = "build-token") {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "composed-app-installation",
      githubOwnerId: "composed-app-owner",
      githubOwnerLogin: "ada",
      githubOwnerLoginNormalized: "ada",
      githubOwnerType: "user",
      convexTeam: { teamId: "convex-team" },
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
      },
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId,
      repositoryId,
      githubRepositoryFullName: "ada/composed-app",
      trigger: "create",
      state: "running",
      currentStep: "sync_tree",
      createdAt: 10,
      updatedAt: 20,
    });
    await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
      repositoryId,
      owner: { kind: "managed_run", runId },
      state: "active",
      lastWriteAt: {},
      updatedAt: 20,
    });
    await ctx.db.replace(repositoryId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "connected",
      githubMode: "create_repository",
      runId,
      githubRepositoryDatabaseId: "123",
      githubRepositoryName: "composed-app",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
    });
    const planId = await ctx.db.insert("workflow_repositoryProvisioning_plans", {
      repositoryId,
      convexConfigPath: "convex.json",
      convex: {
        state: "planned",
        projectName: "composed-app",
        deploymentRegion: "aws-eu-west-1",
      },
      cloudflare: {
        state: "planned",
        workerName: "composed-app",
        rootDirectory: "/",
        buildTokenUuid,
      },
      createdAt: 30,
      updatedAt: 30,
    });
    return {
      organizationId,
      planId,
      runId,
      userId,
      repositoryId,
    };
  });
  return { ids, t };
}

async function attachComposedResources({
  ids,
  t,
}: Awaited<ReturnType<typeof createComposedRepository>>) {
  return await t.run(async (ctx) => {
    const plan = await ctx.db.get(ids.planId);
    if (!plan) {
      throw new Error("Expected provisioning plan.");
    }
    await ctx.db.patch(plan._id, {
      convex: {
        state: "created",
        projectName: "composed-app",
        deploymentRegion: "aws-eu-west-1",
        projectId: "convex-project",
      },
      cloudflare: {
        state: "created",
        workerName: "composed-app",
        workerTag: "composed-worker-tag",
        rootDirectory: plan.cloudflare.rootDirectory,
        buildTokenUuid: "build-token",
      },
    });
    const convexProjectId = await ctx.db.insert("repositoryConvexProjects", {
      repositoryId: ids.repositoryId,
      organizationId: ids.organizationId,
      teamId: "convex-team",
      projectId: "convex-project",
      convexConfigPath: "convex.json",
      origin: "provisioned",
    });
    const workerId = await ctx.db.insert("repositoryCloudflareWorkers", {
      repositoryId: ids.repositoryId,
      organizationId: ids.organizationId,
      accountId: "cloudflare-account",
      workerName: "composed-app",
      workerTag: "composed-worker-tag",
      rootDirectory: plan.cloudflare.rootDirectory,
      origin: "provisioned",
    });
    return { convexProjectId, workerId };
  });
}

describe("app provisioning workflow composition", () => {
  it("maps the provisioning root to the Convex config path and reads exact attachments", async () => {
    const { ids, t } = await createComposedRepository();

    await expect(
      t.query(internal.repositoryProvisioningWorkflow.readComposedInfrastructureState, {
        runId: ids.runId,
        userId: ids.userId,
        repositoryId: ids.repositoryId,
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
        buildTokenUuid: "build-token",
      },
    });

    const attachments = await attachComposedResources({ ids, t });

    await expect(
      t.query(internal.repositoryProvisioningWorkflow.readComposedInfrastructureState, {
        runId: ids.runId,
        userId: ids.userId,
        repositoryId: ids.repositoryId,
      }),
    ).resolves.toMatchObject({
      convex: { state: "attached", convexProjectId: attachments.convexProjectId },
      cloudflare: { state: "attached", workerId: attachments.workerId },
    });
  });

  it("skips Cloudflare setup when the confirmed token list was empty", async () => {
    const { ids, t } = await createComposedRepository(null);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.planId, {
        convex: {
          state: "created",
          projectName: "composed-app",
          deploymentRegion: "aws-eu-west-1",
          projectId: "convex-project",
        },
      });
      await ctx.db.insert("repositoryConvexProjects", {
        repositoryId: ids.repositoryId,
        organizationId: ids.organizationId,
        teamId: "convex-team",
        projectId: "convex-project",
        convexConfigPath: "convex.json",
        origin: "provisioned",
      });
    });

    vi.useFakeTimers();
    try {
      const workflowId = await t.run(async (ctx) => {
        return await startRepositoryInfrastructureProvisioningWorkflow(ctx, {
          repositoryId: ids.repositoryId,
          runId: ids.runId,
        });
      });
      await t.run(async (ctx) => await ctx.db.patch(ids.runId, { workflowId }));
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const result = await t.run(async (ctx) => {
        const events = await ctx.db
          .query("workflow_repositoryProvisioning_events")
          .withIndex("by_run_and_created_at_and_source_order", (q) => q.eq("runId", ids.runId))
          .collect();
        return {
          run: await ctx.db.get(ids.runId),
          steps: events.map((event) => event.step),
          write: await ctx.db
            .query("workflow_repositoryProvisioning_writeLocks")
            .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
            .unique(),
          plan: await ctx.db.get(ids.planId),
          workers: await ctx.db.query("repositoryCloudflareWorkers").take(1),
        };
      });

      expect(result.run).toMatchObject({ state: "succeeded", currentStep: "finish" });
      expect(result.write).toMatchObject({
        owner: { kind: "managed_run", runId: ids.runId },
        state: "succeeded",
      });
      expect(result.steps).toContain("claim_infra");
      expect(result.steps).toContain("finish");
      expect(result.steps).not.toContain("attach_worker");
      expect(result.steps).not.toContain("configure_workers_builds_for_github");
      expect(result.steps).not.toContain("rotate_convex_deploy_keys_for_workers_builds");
      expect(result.plan).toMatchObject({
        convex: { state: "created", projectId: "convex-project" },
        cloudflare: { state: "planned", buildTokenUuid: null },
      });
      expect(result.workers).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps managed provider freshness when infrastructure ownership completes", async () => {
    const { ids, t } = await createComposedRepository();
    await attachComposedResources({ ids, t });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      await t.mutation(
        internal.repositoryProvisioningWorkflow.claimComposedInfrastructureProvisioning,
        {
          userId: ids.userId,
          repositoryId: ids.repositoryId,
          runId: ids.runId,
        },
      );
      vi.setSystemTime(2_000);
      await t.mutation(internal.repository.infrastructureOperation.recordManagedProviderWrites, {
        repositoryId: ids.repositoryId,
        runId: ids.runId,
        providers: ["cloudflare"],
        lastUsedBuildTokenUuid: "  build-token  ",
      });
      vi.setSystemTime(3_000);
      await t.mutation(internal.repository.infrastructureOperation.recordManagedProviderWrites, {
        repositoryId: ids.repositoryId,
        runId: ids.runId,
        providers: ["convex", "cloudflare"],
      });
      vi.setSystemTime(4_000);
      await t.mutation(
        internal.repositoryProvisioningWorkflow.finishComposedInfrastructureProvisioning,
        {
          userId: ids.userId,
          repositoryId: ids.repositoryId,
          runId: ids.runId,
        },
      );
    } finally {
      vi.useRealTimers();
    }

    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_repositoryProvisioning_writeLocks")
            .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
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
    await expect(
      t.run(async (ctx) => (await ctx.db.get(ids.organizationId))?.cloudflareAccount),
    ).resolves.toEqual({
      accountId: "cloudflare-account",
      accountName: "Cloudflare account",
      lastUsedBuildTokenUuid: "build-token",
    });
  });

  it("does not finish a managed lock owned by a newer run", async () => {
    const { ids, t } = await createComposedRepository();
    const newerRunId = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId: ids.organizationId,
        userId: ids.userId,
        repositoryId: ids.repositoryId,
        githubRepositoryFullName: "ada/composed-app",
        trigger: "retry",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 40,
        updatedAt: 40,
      });
      const writeLock = await ctx.db
        .query("workflow_repositoryProvisioning_writeLocks")
        .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
        .unique();
      if (!writeLock) {
        throw new Error("Expected managed write lock.");
      }
      await ctx.db.replace(writeLock._id, {
        repositoryId: ids.repositoryId,
        owner: { kind: "managed_run", runId },
        state: "active",
        lastWriteAt: { cloudflare: 41 },
        updatedAt: 42,
      });
      return runId;
    });

    await expect(
      t.mutation(internal.repositoryProvisioningWorkflow.finishComposedInfrastructureProvisioning, {
        userId: ids.userId,
        repositoryId: ids.repositoryId,
        runId: ids.runId,
      }),
    ).rejects.toThrow("Composed infrastructure run no longer holds the provisioning write lock.");
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_repositoryProvisioning_writeLocks")
            .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
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
    const { ids, t } = await createComposedRepository();
    await attachComposedResources({ ids, t });
    await t.mutation(
      internal.repositoryProvisioningWorkflow.claimComposedInfrastructureProvisioning,
      {
        userId: ids.userId,
        repositoryId: ids.repositoryId,
        runId: ids.runId,
      },
    );
    await t.mutation(internal.repositoryProvisioningRuns.appendRunEvent, {
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
        .query("workflow_repositoryProvisioning_events")
        .withIndex("by_run_and_created_at_and_source_order", (q) => q.eq("runId", ids.runId))
        .collect();
      return {
        run: await ctx.db.get(ids.runId),
        write: await ctx.db
          .query("workflow_repositoryProvisioning_writeLocks")
          .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
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
    const { ids, t } = await createComposedRepository();
    const retryRunId = await t.run(async (ctx) => {
      return await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId: ids.organizationId,
        userId: ids.userId,
        repositoryId: ids.repositoryId,
        githubRepositoryFullName: "ada/composed-app",
        trigger: "retry",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 100,
        updatedAt: 100,
      });
    });

    await expect(
      t.mutation(internal.repositoryProvisioningWorkflow.claimComposedInfrastructureProvisioning, {
        userId: ids.userId,
        repositoryId: ids.repositoryId,
        runId: retryRunId,
      }),
    ).resolves.toEqual({ claimed: false });

    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_repositoryProvisioning_writeLocks")
            .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      owner: { kind: "managed_run", runId: ids.runId },
      state: "active",
    });
  });
});
