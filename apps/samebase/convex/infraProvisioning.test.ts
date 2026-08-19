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
      state: "active",
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: `installation-${args.repoName}`,
      githubOwnerId: `owner-${args.repoName}`,
      githubOwnerLogin: "ada",
      githubOwnerLoginNormalized: "ada",
      githubOwnerType: "user",
    });
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      organizationId,
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
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        name: args.repoName,
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
    } else if (args.vaultState === "provisioning") {
      await ctx.db.replace(vaultId, {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        state: "provisioning",
        githubMode: "create_repository",
        runId,
        startedAt: 20,
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

    return { organizationId, runId, vaultId };
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

  it("keeps the Convex team mismatch visible", async () => {
    const t = makeConvexTest();
    const ids = await seedRun(t, {
      repoName: "convex-team-mismatch",
      trigger: "retry",
      currentStep: "attach_convex",
      workflowId: "workflow-convex-team",
      vaultState: "connected",
      activeOwnership: true,
    });
    const expectedMessage = "Connected Convex team does not match the provisioning plan.";

    await t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow-convex-team",
      message: `Error: ${expectedMessage}`,
    });

    await expect(t.run(async (ctx) => await ctx.db.get(ids.runId))).resolves.toMatchObject({
      state: "failed",
      lastError: expectedMessage,
    });
  });

  it("shows the required recovery when a planned Workers Builds token leaves the list", async () => {
    const t = makeConvexTest();
    const ids = await seedRun(t, {
      repoName: "cloudflare-build-token-missing",
      trigger: "retry",
      currentStep: "configure_workers_builds_for_github",
      workflowId: "workflow-cloudflare-build-token",
      vaultState: "connected",
      activeOwnership: true,
    });
    const providerMessage =
      "The selected Cloudflare Workers Builds token is not in Cloudflare's current list for account account-1. Select another token and retry.";
    const expectedMessage =
      "The selected Cloudflare Workers Builds token is no longer in Cloudflare's current list. Remove this failed app, then create it again with another token.";

    await t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow-cloudflare-build-token",
      message: `Error: Uncaught ConvexError: ${providerMessage}`,
    });

    const result = await t.run(async (ctx) => ({
      run: await ctx.db.get(ids.runId),
      event: await ctx.db
        .query("workflow_vaultProvisioning_events")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .first(),
    }));
    expect(result).toMatchObject({
      run: { state: "failed", lastError: expectedMessage },
      event: { level: "error", message: expectedMessage },
    });
  });

  it.each([
    ["cloudflare-quota", "attach_worker", "Organization connection limit reached (6)."],
    [
      "cloudflare-interrupted-create",
      "attach_worker",
      "Cloudflare Worker managed-worker exists after an interrupted create. Delete it in the Cloudflare dashboard, then retry.",
    ],
    ["convex-quota", "attach_convex", "Organization connection limit reached (6)."],
    [
      "convex-interrupted-create",
      "attach_convex",
      "Convex project managed-project exists after an interrupted create. Delete it in the Convex dashboard, then retry.",
    ],
    [
      "paid-member-seat-limit",
      "validate_connections",
      "This organization needs more paid member seats. Billing and member management are still available.",
    ],
  ] as const)("keeps %s errors visible", async (repoName, currentStep, message) => {
    const t = makeConvexTest();
    const ids = await seedRun(t, {
      repoName,
      trigger: "retry",
      currentStep,
      workflowId: `workflow-${repoName}`,
      vaultState: "connected",
      activeOwnership: true,
    });

    await t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: `workflow-${repoName}`,
      message: `Error: ${message}`,
    });

    const result = await t.run(async (ctx) => ({
      run: await ctx.db.get(ids.runId),
      event: await ctx.db
        .query("workflow_vaultProvisioning_events")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .first(),
    }));
    expect(result).toMatchObject({
      run: { state: "failed", lastError: message },
      event: { level: "error", message },
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
        organizationId: ids.organizationId,
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
