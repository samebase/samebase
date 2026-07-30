import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import type { AppProvisioningRunStep, AppProvisioningRunTrigger } from "./appProvisioningModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

type SeedRunArgs = {
  repoName: string;
  trigger: AppProvisioningRunTrigger;
  currentStep: AppProvisioningRunStep;
  workflowId?: string;
  vaultState?: "connected" | "provisioning";
  activeOwnership?: boolean;
};

async function seedRun(t: ConvexTest, args: SeedRunArgs) {
  return await t.run(async (ctx) => {
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
      repositoryFullName: `ada/${args.repoName}`,
      workflowId: args.workflowId,
      trigger: args.trigger,
      state: "running",
      currentStep: args.currentStep,
      createdAt: 10,
      updatedAt: 30,
    });

    if (args.vaultState === "connected") {
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: args.repoName,
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
    } else if (args.vaultState === "provisioning") {
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "provisioning",
        githubMode: "create_repository",
        runId,
        startedAt: 20,
        owner: "ada",
        name: args.repoName,
        visibility: "private",
      });
    }

    if (args.activeOwnership) {
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        owner: { kind: "managed_run", runId },
        state: "active",
        lastWriteAt: {},
        updatedAt: 31,
      });
    }

    return { runId, vaultId };
  });
}

describe("markWorkflowProvisioningFailed", () => {
  it("marks an active composed create-app write lock as failed", async () => {
    const t = makeConvexTest();
    const ids = await seedRun(t, {
      repoName: "composed-worker-failure",
      trigger: "create",
      currentStep: "attach_worker",
      workflowId: "workflow-composed-worker",
      vaultState: "connected",
      activeOwnership: true,
    });
    const expectedMessage = "Cloudflare Worker connection did not attach a Worker.";

    await t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow-composed-worker",
      message: `Error: ${expectedMessage}`,
    });

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(ids.runId);
      const writeLock = await ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      const event = await ctx.db
        .query("workflow_vaultProvisioning_events")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .first();
      return { event, writeLock, run };
    });

    expect(result.run).toMatchObject({
      state: "failed",
      lastError: expectedMessage,
    });
    expect(result.writeLock).toMatchObject({
      owner: { kind: "managed_run", runId: ids.runId },
      state: "failed",
      lastWriteAt: {
        convex: expect.any(Number),
        cloudflare: expect.any(Number),
      },
    });
    expect(result.writeLock?.lastWriteAt.convex).toBe(result.writeLock?.lastWriteAt.cloudflare);
    expect(result.event).toMatchObject({
      step: "attach_worker",
      level: "error",
      message: expectedMessage,
    });
  });

  it("records GitHub repository validation errors before infrastructure starts", async () => {
    const t = makeConvexTest();
    const ids = await seedRun(t, {
      repoName: "github-validation-failure",
      trigger: "create",
      currentStep: "fetch_github_repo",
      workflowId: "workflow-github",
      activeOwnership: true,
    });
    await t.run(async (ctx) => {
      const writeLock = await ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      if (!writeLock) {
        throw new Error("Expected managed write lock.");
      }
      await ctx.db.patch(writeLock._id, { lastWriteAt: { convex: 5 } });
    });

    await t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow-github",
      message:
        "Error: Uncaught Error: GitHub repository response did not match the vault repo.\n    at fetchGitHubRepoIdentity",
    });

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(ids.runId);
      const event = await ctx.db
        .query("workflow_vaultProvisioning_events")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .first();
      const writeLock = await ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      return { event, run, writeLock };
    });
    const expectedMessage = "GitHub repository response did not match the vault repo.";

    expect(result.run).toMatchObject({
      state: "failed",
      lastError: expectedMessage,
    });
    expect(result.event).toMatchObject({
      step: "fetch_github_repo",
      level: "error",
      message: expectedMessage,
    });
    expect(result.writeLock).toMatchObject({
      owner: { kind: "managed_run", runId: ids.runId },
      state: "failed",
      lastWriteAt: { convex: 5 },
    });
  });

  it("fails the matching managed lock when workflow startup fails", async () => {
    const t = makeConvexTest();
    const ids = await seedRun(t, {
      repoName: "workflow-start-failure",
      trigger: "create",
      currentStep: "run_created",
      vaultState: "provisioning",
      activeOwnership: true,
    });

    await t.mutation(internal.infraProvisioning.markWorkflowStartupFailed, {
      runId: ids.runId,
      message: "Workflow did not start.",
    });

    const result = await t.run(async (ctx) => {
      return {
        run: await ctx.db.get(ids.runId),
        vault: await ctx.db.get(ids.vaultId),
        writeLock: await ctx.db
          .query("workflow_vaultProvisioning_writeLocks")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique(),
      };
    });
    expect(result.run).toMatchObject({ state: "failed" });
    expect(result.vault).toMatchObject({
      state: "failed",
      githubMode: "create_repository",
      runId: ids.runId,
    });
    expect(result.writeLock).toMatchObject({
      owner: { kind: "managed_run", runId: ids.runId },
      state: "failed",
      lastWriteAt: {},
    });
  });

  it("does not fail a managed lock owned by a newer run", async () => {
    const t = makeConvexTest();
    const ids = await seedRun(t, {
      repoName: "stale-workflow-failure",
      trigger: "create",
      currentStep: "attach_worker",
      workflowId: "old-workflow",
      vaultState: "connected",
      activeOwnership: true,
    });
    const newerRunId = await t.run(async (ctx) => {
      const oldRun = await ctx.db.get(ids.runId);
      if (!oldRun) {
        throw new Error("Expected old provisioning run.");
      }
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: oldRun.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/stale-workflow-failure",
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
        lastWriteAt: { convex: 41 },
        updatedAt: 42,
      });
      return runId;
    });

    await t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "old-workflow",
      message: "Old workflow failed.",
    });

    const result = await t.run(async (ctx) => {
      return {
        run: await ctx.db.get(ids.runId),
        writeLock: await ctx.db
          .query("workflow_vaultProvisioning_writeLocks")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique(),
      };
    });
    expect(result.run).toMatchObject({ state: "canceled" });
    expect(result.writeLock).toMatchObject({
      owner: { kind: "managed_run", runId: newerRunId },
      state: "active",
      lastWriteAt: { convex: 41 },
      updatedAt: 42,
    });
  });
});
