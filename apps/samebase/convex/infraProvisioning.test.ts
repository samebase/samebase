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
  connectedVault?: boolean;
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

    if (args.connectedVault) {
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
    }

    if (args.activeOwnership) {
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        runId,
        state: "active",
        updatedAt: 31,
      });
    }

    return { runId, vaultId };
  });
}

async function readRunAndFirstEvent(
  t: ConvexTest,
  runId: Awaited<ReturnType<typeof seedRun>>["runId"],
) {
  return await t.run(async (ctx) => {
    const run = await ctx.db.get(runId);
    const event = await ctx.db
      .query("workflow_vaultProvisioning_events")
      .withIndex("by_run_and_created_at", (q) => q.eq("runId", runId))
      .first();
    return { event, run };
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
      connectedVault: true,
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
        .withIndex("by_run", (q) => q.eq("runId", ids.runId))
        .first();
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
      state: "failed",
    });
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
    });

    await t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow-github",
      message:
        "Error: Uncaught Error: GitHub repository response did not match the vault repo.\n    at fetchGitHubRepoIdentity",
    });

    const result = await readRunAndFirstEvent(t, ids.runId);
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
  });
});
