import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
import { TREE_REFRESH_STALE_LOCK_MS } from "../../shared/treeRefresh";
import { cleanupAccountLocalDataBatchForUser } from "./cleanup";
import { INITIAL_ACCOUNT_DELETION_DATA_PROGRESS } from "./model";

async function seedUser(t: ReturnType<typeof makeConvexTest>, email: string) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", { email, isApproved: true });
  });
}

async function runCleanup(
  t: ReturnType<typeof makeConvexTest>,
  userId: Awaited<ReturnType<typeof seedUser>>,
) {
  return await t.run(async (ctx) => {
    return await cleanupAccountLocalDataBatchForUser(ctx, { userId });
  });
}

async function deleteVault(
  t: ReturnType<typeof makeConvexTest>,
  userId: Awaited<ReturnType<typeof seedUser>>,
  vaultId: Awaited<ReturnType<typeof seedVault>>,
) {
  let result = await t.mutation(internal.vault.deletion.cleanup.deleteVaultLocalDataBatch, {
    userId,
    vaultId,
  });
  while (result.state === "needs_more") {
    result = await t.mutation(internal.vault.deletion.cleanup.deleteVaultLocalDataBatch, {
      userId,
      vaultId,
    });
  }
  expect(result).toEqual({ state: "deleted" });
}

async function seedVault(
  t: ReturnType<typeof makeConvexTest>,
  userId: Awaited<ReturnType<typeof seedUser>>,
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("vaults", {
      userId,
      state: "not_connected",
      deletion: { state: "not_deleting" },
    });
  });
}

async function seedConnectedVaultWithRefresh(
  t: ReturnType<typeof makeConvexTest>,
  userId: Awaited<ReturnType<typeof seedUser>>,
  treeRefreshStartedAt: number,
) {
  return await t.run(async (ctx) => {
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      state: "not_connected",
      deletion: { state: "not_deleting" },
    });
    const provisioningRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId,
      vaultId,
      repositoryFullName: "owner/repository",
      trigger: "create",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 3,
    });
    await ctx.db.replace(vaultId, {
      userId,
      state: "connected",
      githubMode: "create_repository",
      deletion: { state: "not_deleting" },
      treeRefreshStartedAt,
      runId: provisioningRunId,
      ghRepoId: `repository-${vaultId}`,
      defaultBranch: "main",
      connectedAt: 4,
      owner: "owner",
      name: `repository-${vaultId}`,
      visibility: "private",
    });
    return vaultId;
  });
}

async function seedRunningDeletion(
  t: ReturnType<typeof makeConvexTest>,
  userId: Awaited<ReturnType<typeof seedUser>>,
) {
  return await t.run(async (ctx) => {
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60_000,
    });
    return await ctx.db.insert("workflow_accountDeletion_runs", {
      identity: { state: "active", userId, email: "owner@example.com" },
      completionCapability: "progress-test",
      state: "running",
      workflow: { state: "started", workflowId: "workflow-1", attempt: 1 },
      currentStep: "delete_samebase_data",
      requestedAt: 1,
      updatedAt: 1,
      initiatingSessionId: sessionId,
      retryCount: 0,
      outcomes: {
        billing: { state: "not_applicable" },
        providerRevocation: { state: "not_started" },
        completionEmail: { state: "not_started" },
      },
      dataDeletion: INITIAL_ACCOUNT_DELETION_DATA_PROGRESS,
    });
  });
}

describe("account-local deletion cleanup", () => {
  it("persists exact vault cleanup phases and completed-vault counts", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const firstVaultId = await seedVault(t, userId);
    await seedVault(t, userId);
    const runId = await seedRunningDeletion(t, userId);
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultStagedFiles", {
        ownerId: userId,
        vaultId: firstVaultId,
        fileDeleted: false,
        kind: "text",
        filePath: "draft.txt",
        initialFilePath: "draft.txt",
        content: "draft",
        initialContent: "",
        parentCommitSha: null,
        lastEditTime: 1,
        lastEditUserId: userId,
        branch: "main",
        version: 1,
      });
    });

    const workflowArgs = { runId, workflowId: "workflow-1" };
    await t.mutation(internal.accountDeletion.cleanup.startVaultDataDeletion, workflowArgs);
    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupVaultDataDeletionBatch, workflowArgs),
    ).resolves.toBe(false);
    await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      if (run === null || run.state !== "running") {
        throw new Error("Expected a running deletion run.");
      }
      expect(run.dataDeletion?.vaultsAndStagedChanges).toMatchObject({
        state: "in_progress",
        deletedVaultCount: 0,
        currentVaultPhase: "staged_changes",
      });
    });

    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupVaultDataDeletionBatch, workflowArgs),
    ).resolves.toBe(false);
    await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      if (run === null || run.state !== "running") {
        throw new Error("Expected a running deletion run.");
      }
      expect(run.dataDeletion?.vaultsAndStagedChanges).toMatchObject({
        state: "in_progress",
        deletedVaultCount: 1,
        currentVaultPhase: "vault_data",
      });
    });

    let done = false;
    for (let attempt = 0; attempt < 10 && !done; attempt += 1) {
      done = await t.mutation(
        internal.accountDeletion.cleanup.cleanupVaultDataDeletionBatch,
        workflowArgs,
      );
    }
    expect(done).toBe(true);
    await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      if (run === null || run.state !== "running") {
        throw new Error("Expected a running deletion run.");
      }
      expect(run.dataDeletion?.vaultsAndStagedChanges).toMatchObject({
        state: "completed",
        deletedVaultCount: 2,
        currentVaultPhase: null,
      });
    });
  });

  it("keeps completed data groups completed when a workflow retries", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const runId = await seedRunningDeletion(t, userId);
    await t.run(async (ctx) => {
      await ctx.db.insert("ui_user_settings", {
        userId,
        providersPanelOpen: false,
        pricingBillingCycle: "monthly",
      });
    });
    const args = {
      runId,
      workflowId: "workflow-1",
      group: "preferences" as const,
    };

    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupDataDeletionGroupBatch, args),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupDataDeletionGroupBatch, args),
    ).resolves.toBe(true);
    const completed = await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      if (run === null || run.state !== "running") {
        throw new Error("Expected a running deletion run.");
      }
      return run.dataDeletion;
    });

    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupDataDeletionGroupBatch, args),
    ).resolves.toBe(true);
    await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      if (run === null || run.state !== "running") {
        throw new Error("Expected a running deletion run.");
      }
      expect(run.dataDeletion).toEqual(completed);
    });
  });

  it("deletes vault lifecycle events before runs on the legacy cleanup path", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const vaultId = await seedVault(t, userId);
    const lifecycle = await t.run(async (ctx) => {
      const plan = {
        target: {
          kind: "failed_repository_setup" as const,
          githubMode: "connect_existing_repository" as const,
          owner: "owner",
          name: "repository",
          repositoryFullName: "owner/repository",
        },
        convex: { action: "skip" as const, reason: "not_requested" as const },
        cloudflare: { action: "skip" as const, reason: "not_requested" as const },
        githubRepository: { action: "skip" as const, reason: "not_requested" as const },
      };

      const lifecycleRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        userId,
        requestedByUserId: userId,
        vaultId,
        repositoryFullName: "owner/deleting",
        attempt: { kind: "initial" },
        state: "failed",
        workflow: { state: "not_started" },
        currentStep: "initialize_deletion",
        snapshot: { state: "retained_for_retry", plan },
        lastError: "Deletion failed.",
        createdAt: 100,
        updatedAt: 100,
        completedAt: 100,
      });
      const lifecycleEventId = await ctx.db.insert("workflow_vaultDeletion_events", {
        userId,
        vaultId,
        repositoryFullName: "owner/deleting",
        runId: lifecycleRunId,
        step: "initialize_deletion",
        level: "error",
        message: "Deletion failed.",
        createdAt: 100,
      });
      return { lifecycleEventId, lifecycleRunId };
    });

    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "needs_more",
      target: "vaults",
      rowsChanged: 1,
    });
    await expect(t.run(async (ctx) => ctx.db.get(lifecycle.lifecycleEventId))).resolves.toBeNull();
    await expect(
      t.run(async (ctx) => ctx.db.get(lifecycle.lifecycleRunId)),
    ).resolves.not.toBeNull();
    await expect(t.run(async (ctx) => ctx.db.get(vaultId))).resolves.not.toBeNull();

    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "needs_more",
      target: "vaults",
      rowsChanged: 1,
    });
    await expect(t.run(async (ctx) => ctx.db.get(lifecycle.lifecycleRunId))).resolves.toBeNull();
    await expect(t.run(async (ctx) => ctx.db.get(vaultId))).resolves.not.toBeNull();

    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "needs_more",
      target: "vaults",
      rowsChanged: 1,
    });
    await expect(t.run(async (ctx) => ctx.db.get(vaultId))).resolves.toBeNull();
    await expect(runCleanup(t, userId)).resolves.toEqual({ state: "done" });
  });

  it("completes one vault beyond the former 96-batch cleanup budget", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "large-vault@example.com");
    const runId = await seedRunningDeletion(t, userId);
    const vaultId = await seedVault(t, userId);
    const rowCount = 50 * 96 + 1;

    for (let start = 0; start < rowCount; start += 500) {
      await t.run(async (ctx) => {
        for (let index = start; index < Math.min(start + 500, rowCount); index += 1) {
          await ctx.db.insert("ui_vaultFileTree_folderExpansions", {
            userId,
            vaultId,
            folderPath: `folder-${index}`,
            isExpanded: true,
          });
        }
      });
    }

    const args = { runId, workflowId: "workflow-1" };

    await t.mutation(internal.accountDeletion.cleanup.startVaultDataDeletion, args);
    await expect(
      t.action(internal.accountDeletion.cleanupActions.cleanupVaultData, args),
    ).resolves.toBeNull();

    await t.run(async (ctx) => {
      const vaults = await ctx.db
        .query("vaults")
        .withIndex("by_userId", (query) => query.eq("userId", userId))
        .collect();
      const folderState = await ctx.db
        .query("ui_vaultFileTree_folderExpansions")
        .withIndex("by_vault", (query) => query.eq("vaultId", vaultId))
        .collect();
      const run = await ctx.db.get(runId);

      expect(vaults).toHaveLength(0);
      expect(folderState).toHaveLength(0);
      if (run === null || run.state !== "running") {
        throw new Error("Expected a running deletion run.");
      }
      expect(run.dataDeletion?.vaultsAndStagedChanges).toMatchObject({
        state: "completed",
        deletedVaultCount: 1,
      });
    });
  });

  it("rejects workflow calls for scrubbed deletion receipts", async () => {
    const t = makeConvexTest();
    const runId = await t.run(async (ctx) => {
      return await ctx.db.insert("workflow_accountDeletion_runs", {
        identity: { state: "scrubbed" },
        completionCapability: "cleanup-test",
        state: "succeeded",
        currentStep: "finish",
        requestedAt: 1,
        updatedAt: 2,
        retryCount: 0,
        completedAt: 2,
        outcomes: {
          billing: { state: "not_applicable" },
          providerRevocation: {
            state: "completed",
            github: { state: "not_connected" },
            cloudflare: { state: "not_connected" },
            convex: { state: "not_connected" },
          },
          completionEmail: { state: "sent" },
        },
      });
    });

    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupAccountLocalDataBatch, {
        runId,
        workflowId: "stale-workflow",
      }),
    ).rejects.toThrow("Account deletion workflow is not running.");
  });

  it("blocks all sole-member organization work through the Phase 1 user index", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const runId = await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", {});
      await ctx.db.insert("organizationMemberships", { organizationId, userId });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      return await ctx.db.insert("workflow_vaultDeletion_runs", {
        userId,
        requestedByUserId: userId,
        vaultId,
        repositoryFullName: "owner/repository",
        attempt: { kind: "initial" },
        state: "queued",
        workflow: { state: "not_started" },
        currentStep: "initialize_deletion",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "failed_repository_setup",
              githubMode: "connect_existing_repository",
              owner: "owner",
              name: "repository",
              repositoryFullName: "owner/repository",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "blocked",
      blocker: "active_vault_deletion",
      runId,
    });
  });

  it("does not wait for a remaining member's work in a shared organization", async () => {
    const t = makeConvexTest();
    const deletingUserId = await seedUser(t, "deleting@example.com");
    const remainingUserId = await seedUser(t, "remaining@example.com");
    const accountDeletionRunId = await seedRunningDeletion(t, deletingUserId);
    const activeRunId = await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", {});
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: deletingUserId,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: remainingUserId,
      });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId: remainingUserId,
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      return await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: remainingUserId,
        requestedByUserId: remainingUserId,
        vaultId,
        repositoryFullName: "remaining/repository",
        trigger: "create",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const remainingRefreshVaultId = await seedConnectedVaultWithRefresh(
      t,
      remainingUserId,
      Date.now(),
    );

    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, {
        runId: accountDeletionRunId,
        workflowId: "workflow-1",
      }),
    ).resolves.toEqual({ state: "done" });
    await expect(runCleanup(t, deletingUserId)).resolves.toEqual({ state: "done" });
    await expect(t.run(async (ctx) => await ctx.db.get(activeRunId))).resolves.not.toBeNull();
    await expect(
      t.run(async (ctx) => await ctx.db.get(remainingRefreshVaultId)),
    ).resolves.not.toBeNull();
  });

  it("keeps remaining-member resources while Phase 1 deletes legacy user-owned vaults", async () => {
    const t = makeConvexTest();
    const deletingUserId = await seedUser(t, "deleting@example.com");
    const remainingUserId = await seedUser(t, "remaining@example.com");
    const resources = await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", {});
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: deletingUserId,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: remainingUserId,
      });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      const deletingVaultId = await ctx.db.insert("vaults", {
        userId: deletingUserId,
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      const remainingVaultId = await ctx.db.insert("vaults", {
        userId: remainingUserId,
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      return { deletingVaultId, organizationId, remainingVaultId };
    });

    let result = await runCleanup(t, deletingUserId);
    for (let attempt = 0; attempt < 10 && result.state !== "done"; attempt += 1) {
      result = await runCleanup(t, deletingUserId);
    }
    expect(result).toEqual({ state: "done" });
    await expect(
      t.run(async (ctx) => ({
        deletingVault: await ctx.db.get(resources.deletingVaultId),
        organization: await ctx.db.get(resources.organizationId),
        remainingVault: await ctx.db.get(resources.remainingVaultId),
      })),
    ).resolves.toMatchObject({
      deletingVault: null,
      organization: expect.any(Object),
      remainingVault: expect.any(Object),
    });
  });

  it("does not delete rows while app provisioning can still write provider state", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const runId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      return await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId,
        vaultId,
        repositoryFullName: "owner/repository",
        trigger: "create",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "blocked",
      blocker: "active_app_provisioning",
      runId,
    });
  });

  it("blocks active repository refresh before quiescence and destructive batches", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const runId = await seedRunningDeletion(t, userId);
    const vaultId = await seedConnectedVaultWithRefresh(t, userId, Date.now());
    const branchTreeId = await t.run(async (ctx) => {
      return await ctx.db.insert("observations_vaultRepository_branchTrees", {
        vaultId,
        branch: "main",
        commitSHA: "commit",
        treeData: { sha: "tree", truncated: false, tree: [] },
        lastTreeRefreshAt: 1,
      });
    });
    const workflowArgs = { runId, workflowId: "workflow-1" };

    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, workflowArgs),
    ).resolves.toEqual({ state: "waiting", blocker: "active_repository_refresh" });
    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "blocked",
      blocker: "active_repository_refresh",
      vaultId,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(vaultId, { treeRefreshStartedAt: undefined });
    });
    await t.mutation(internal.accountDeletion.cleanup.startVaultDataDeletion, workflowArgs);
    await t.run(async (ctx) => {
      await ctx.db.patch(vaultId, { treeRefreshStartedAt: Date.now() });
    });

    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupVaultDataDeletionBatch, workflowArgs),
    ).rejects.toThrow("Account deletion cleanup is blocked by active work.");
    await expect(t.run(async (ctx) => await ctx.db.get(branchTreeId))).resolves.not.toBeNull();
  });

  it("does not block cleanup for a stale repository refresh lock", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const runId = await seedRunningDeletion(t, userId);
    const vaultId = await seedConnectedVaultWithRefresh(
      t,
      userId,
      Date.now() - TREE_REFRESH_STALE_LOCK_MS - 1,
    );
    const workflowArgs = { runId, workflowId: "workflow-1" };

    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, workflowArgs),
    ).resolves.toEqual({ state: "done" });
    await t.mutation(internal.accountDeletion.cleanup.startVaultDataDeletion, workflowArgs);

    let done = false;
    for (let attempt = 0; attempt < 10 && !done; attempt += 1) {
      done = await t.mutation(
        internal.accountDeletion.cleanup.cleanupVaultDataDeletionBatch,
        workflowArgs,
      );
    }

    expect(done).toBe(true);
    await expect(t.run(async (ctx) => await ctx.db.get(vaultId))).resolves.toBeNull();
  });

  it("rechecks active work before every detailed deletion batch", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const runId = await seedRunningDeletion(t, userId);
    const settingsId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId,
        vaultId,
        repositoryFullName: "owner/repository",
        trigger: "create",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 1,
        updatedAt: 1,
      });
      return await ctx.db.insert("ui_user_settings", {
        userId,
        providersPanelOpen: false,
        pricingBillingCycle: "monthly",
      });
    });

    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupDataDeletionGroupBatch, {
        runId,
        workflowId: "workflow-1",
        group: "preferences",
      }),
    ).rejects.toThrow("Account deletion cleanup is blocked by active work.");
    await expect(t.run(async (ctx) => await ctx.db.get(settingsId))).resolves.not.toBeNull();
  });

  it("deletes staged storage before its vault and proceeds in bounded batches", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const { storageId, vaultId } = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      const storageId = await ctx.storage.store(new Blob(["private draft"]));
      await ctx.db.insert("vaultStagedFiles", {
        ownerId: userId,
        vaultId,
        fileDeleted: false,
        kind: "binary",
        filePath: "private.txt",
        initialFilePath: "private.txt",
        content: "",
        initialContent: "",
        storageId,
        parentCommitSha: null,
        lastEditTime: 1,
        lastEditUserId: userId,
        branch: "main",
        version: 1,
      });
      for (let index = 0; index < 30; index += 1) {
        await ctx.db.insert("ui_user_settings", {
          userId,
          providersPanelOpen: index % 2 === 0,
          pricingBillingCycle: "monthly",
        });
      }
      return { storageId, vaultId };
    });

    const first = await runCleanup(t, userId);
    expect(first).toEqual({ state: "needs_more", target: "vaults", rowsChanged: 1 });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(vaultId)).not.toBeNull();
      expect(await ctx.storage.get(storageId)).toBeNull();
    });

    let result = first;
    for (let attempt = 0; attempt < 10 && result.state !== "done"; attempt += 1) {
      result = await runCleanup(t, userId);
    }
    expect(result).toEqual({ state: "done" });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(vaultId)).toBeNull();
      expect(await ctx.db.query("ui_user_settings").collect()).toEqual([]);
    });
  });

  for (const [deletedReference, survivingReference] of [
    ["staging", "staging"],
    ["staging", "blob"],
    ["blob", "staging"],
    ["blob", "blob"],
  ] as const) {
    it(`retains shared storage across ${deletedReference} and ${survivingReference} references`, async () => {
      const t = makeConvexTest();
      const deletingUserId = await seedUser(t, "deleting@example.com");
      const survivingUserId = await seedUser(t, "surviving@example.com");
      const deletingVaultId = await seedVault(t, deletingUserId);
      const survivingVaultId = await seedVault(t, survivingUserId);
      const storageId = await t.run(async (ctx) => {
        const storageId = await ctx.storage.store(new Blob(["shared storage"]));
        if (deletedReference === "staging") {
          await ctx.db.insert("vaultStagedFiles", {
            ownerId: deletingUserId,
            vaultId: deletingVaultId,
            fileDeleted: false,
            kind: "binary",
            filePath: "deleting.bin",
            initialFilePath: "deleting.bin",
            content: "",
            initialContent: "",
            storageId,
            parentCommitSha: null,
            lastEditTime: 1,
            lastEditUserId: deletingUserId,
            branch: "main",
            version: 1,
          });
          await ctx.db.insert("vaultStagedFiles", {
            ownerId: deletingUserId,
            vaultId: deletingVaultId,
            fileDeleted: false,
            kind: "binary",
            filePath: "deleting-copy.bin",
            initialFilePath: "deleting-copy.bin",
            content: "",
            initialContent: "",
            storageId,
            parentCommitSha: null,
            lastEditTime: 1,
            lastEditUserId: deletingUserId,
            branch: "main",
            version: 1,
          });
        } else {
          await ctx.db.insert("observations_vaultFiles_blobs", {
            vaultId: deletingVaultId,
            sha: "deleting-sha",
            size: 14,
            storageId,
          });
          await ctx.db.insert("observations_vaultFiles_blobs", {
            vaultId: deletingVaultId,
            sha: "deleting-copy-sha",
            size: 14,
            storageId,
          });
        }

        if (survivingReference === "staging") {
          await ctx.db.insert("vaultStagedFiles", {
            ownerId: survivingUserId,
            vaultId: survivingVaultId,
            fileDeleted: false,
            kind: "binary",
            filePath: "surviving.bin",
            initialFilePath: "surviving.bin",
            content: "",
            initialContent: "",
            storageId,
            parentCommitSha: null,
            lastEditTime: 1,
            lastEditUserId: survivingUserId,
            branch: "main",
            version: 1,
          });
        } else {
          await ctx.db.insert("observations_vaultFiles_blobs", {
            vaultId: survivingVaultId,
            sha: "surviving-sha",
            size: 14,
            storageId,
          });
        }
        return storageId;
      });

      await deleteVault(t, deletingUserId, deletingVaultId);
      await t.run(async (ctx) => {
        expect(await ctx.db.system.get("_storage", storageId)).not.toBeNull();
      });

      await deleteVault(t, survivingUserId, survivingVaultId);
      await t.run(async (ctx) => {
        expect(await ctx.db.system.get("_storage", storageId)).toBeNull();
      });
    });
  }

  it("removes MCP credentials before grants", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    await t.run(async (ctx) => {
      await ctx.db.insert("mcpGrants", {
        grantId: "grant-1",
        userId,
        clientId: "client-1",
        resource: "https://samebase.com/mcp",
        scope: "mcp",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("mcpAccessTokens", {
        tokenHash: "token-hash",
        grantId: "grant-1",
        clientId: "client-1",
        userId,
        resource: "https://samebase.com/mcp",
        scope: "mcp",
        createdAt: 1,
        expiresAt: 2,
      });
    });

    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "needs_more",
      target: "mcpAccessTokens",
      rowsChanged: 1,
    });
    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "needs_more",
      target: "mcpGrants",
      rowsChanged: 1,
    });
  });
});
