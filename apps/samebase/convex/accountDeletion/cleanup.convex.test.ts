import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
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

async function seedRunningDeletion(
  t: ReturnType<typeof makeConvexTest>,
  userId: Awaited<ReturnType<typeof seedUser>>,
) {
  return await t.run(async (ctx) => {
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60_000,
    });
    return await ctx.db.insert("accountDeletionRuns", {
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
      await ctx.db.insert("fileStaging", {
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
      await ctx.db.insert("connectedMachines", {
        userId,
        machineId: "machine-1",
        displayName: "Machine 1",
        hostname: "host-1",
        os: "linux",
        status: "offline",
        lastSeenAt: 1,
        connectorVersion: "test",
        capabilities: ["presence"],
        allowedRoots: [],
      });
    });
    const args = {
      runId,
      workflowId: "workflow-1",
      group: "connectedMachines" as const,
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

  it("completes one vault beyond the former 96-batch cleanup budget", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "large-vault@example.com");
    const runId = await seedRunningDeletion(t, userId);
    const vaultId = await seedVault(t, userId);
    const rowCount = 50 * 96 + 1;

    for (let start = 0; start < rowCount; start += 500) {
      await t.run(async (ctx) => {
        for (let index = start; index < Math.min(start + 500, rowCount); index += 1) {
          await ctx.db.insert("folderExpansionState", {
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
        .query("folderExpansionState")
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
      return await ctx.db.insert("accountDeletionRuns", {
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

  it("blocks while separately-authorized vault deletion is active", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const runId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      return await ctx.db.insert("vaultDeletionRuns", {
        userId,
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
              routeRepositoryFullName: "owner/repository",
            },
            codespaces: { action: "skip", reason: "not_requested" },
            convex: { action: "skip", reason: "not_requested" },
            convexDependencyDeployKeys: { action: "skip", reason: "not_recorded" },
            cloudflare: { action: "skip", reason: "not_requested" },
            cloudflareBuildTriggers: { action: "skip", reason: "not_recorded" },
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

  it("does not delete rows while app provisioning can still write provider state", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const runId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      return await ctx.db.insert("appProvisioningRuns", {
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
      await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "owner/repository",
        trigger: "create",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 1,
        updatedAt: 1,
      });
      return await ctx.db.insert("dashboardSettings", {
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

  it("deletes every published repository inventory row before its vault", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const vaultId = await seedVault(t, userId);
    await t.run(async (ctx) => {
      const rowKey = "pull-request:PR_cleanup";
      const snapshotId = await ctx.db.insert("vaultRepositoryInventorySnapshots", {
        state: "ready",
        observedAt: 1,
        vaultId,
        branchCount: 0,
        buildCount: 0,
        buildAssociationCount: 0,
        unattributedBuildCount: 0,
        pullRequestCount: 1,
        labelCount: 1,
        labelChunkCount: 1,
        labelFacetCount: 1,
        noLabelPullRequestCount: 0,
        repositoryNodeId: "R_repository",
        repositoryFullName: "owner/repository",
        defaultBranch: "main",
        fingerprint: "inventory-fingerprint",
        crawlCost: 1,
        summaryDefaultBranch: {
          state: "ready",
          name: "main",
          headSha: "cleanup-head",
          checkState: "none",
        },
      });
      const filterViewId = await ctx.db.insert("vaultRepositoryInventoryFilterViews", {
        state: "complete",
        vaultId,
        snapshotId,
        filterRevision: 1,
        totalPullRequestCount: 1,
        processedPullRequestCount: 1,
        visiblePullRequestCount: 1,
      });
      const filterId = await ctx.db.insert("vaultRepositoryInventoryFilters", {
        userId,
        vaultId,
        includeDrafts: false,
        includeNoLabel: true,
        revision: 1,
        excludedLabelCount: 1,
        excludedLabelGeneration: 0,
      });
      await ctx.db.insert("vaultRepositoryInventoryExcludedLabels", {
        vaultId,
        filterId,
        generation: 0,
        labelKey: "cleanup",
        name: "cleanup",
      });
      await ctx.db.insert("vaultRepositoryInventories", {
        userId,
        vaultId,
        wantedUntil: 1,
        writeVersion: 1,
        observedWriteVersion: 1,
        requiredFailureCount: 0,
        lifecycle: { state: "idle" },
        publication: {
          snapshotId,
          filterViewId,
          filterRevision: 1,
          repositoryNodeId: "R_repository",
          repositoryFullName: "owner/repository",
          defaultBranch: "main",
          unattributedBuildCount: 0,
          publishedAt: 1,
          checkedAt: 1,
          fingerprint: "inventory-fingerprint",
        },
      });
      const pullRequestItemId = await ctx.db.insert("vaultRepositoryInventoryItems", {
        kind: "pull_request",
        vaultId,
        snapshotId,
        sortGroup: 1,
        sortTime: -1,
        rowKey,
        buildCount: 0,
        expectedBuildCount: 0,
        headCommit: {
          sha: "commit-sha",
          checks: {
            state: "success",
            totalCount: 0,
            checkRunCount: 0,
            statusContextCount: 0,
            successCount: 0,
            failureCount: 0,
            runningCount: 0,
            neutralCount: 0,
            unknownCount: 0,
          },
        },
        number: 1,
        url: "https://github.com/owner/repository/pull/1",
        title: "Cleanup inventory",
        isDraft: false,
        additions: 4,
        deletions: 2,
        changedFiles: 2,
        baseRefName: "main",
        isCrossRepository: false,
        headRepository: {
          state: "available",
          repositoryNodeId: "R_repository",
          repositoryFullName: "owner/repository",
        },
        headRefName: "cleanup-inventory",
        comparison: { state: "ready", aheadBy: 1, behindBy: 0 },
        canOpenInSamebase: true,
        labelCount: 1,
        localHeadRefName: "cleanup-inventory",
        labelChunkCount: 1,
      });
      await ctx.db.insert("vaultRepositoryInventoryFilterViewRows", {
        vaultId,
        snapshotId,
        viewId: filterViewId,
        pullRequestItemId,
        rowKey,
        sortTime: -1,
      });
      await ctx.db.insert("vaultRepositoryInventoryLabelFacets", {
        vaultId,
        snapshotId,
        labelKey: "cleanup",
        sortKey: "cleanup",
        name: "cleanup",
        color: "00ff00",
        pullRequestCount: 1,
      });
      await ctx.db.insert("vaultRepositoryInventoryLabelChunks", {
        vaultId,
        snapshotId,
        rowKey,
        chunkIndex: 0,
        labels: [{ name: "cleanup", color: "00ff00" }],
      });
    });

    let result = await runCleanup(t, userId);
    for (let attempt = 0; attempt < 20 && result.state !== "done"; attempt += 1) {
      result = await runCleanup(t, userId);
    }
    expect(result).toEqual({ state: "done" });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(vaultId)).toBeNull();
      expect(await ctx.db.query("vaultRepositoryInventories").collect()).toEqual([]);
      expect(await ctx.db.query("vaultRepositoryInventorySnapshots").collect()).toEqual([]);
      expect(await ctx.db.query("vaultRepositoryInventoryItems").collect()).toEqual([]);
      expect(await ctx.db.query("vaultRepositoryInventoryLabelChunks").collect()).toEqual([]);
      expect(await ctx.db.query("vaultRepositoryInventoryFilters").collect()).toEqual([]);
      expect(await ctx.db.query("vaultRepositoryInventoryExcludedLabels").collect()).toEqual([]);
      expect(await ctx.db.query("vaultRepositoryInventoryFilterViews").collect()).toEqual([]);
      expect(await ctx.db.query("vaultRepositoryInventoryFilterViewRows").collect()).toEqual([]);
      expect(await ctx.db.query("vaultRepositoryInventoryLabelFacets").collect()).toEqual([]);
    });
  });

  it("revokes machine bearer access before deleting machine identity rows", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    await t.run(async (ctx) => {
      await ctx.db.insert("machineCredentials", {
        userId,
        machineId: "machine-1",
        credentialHash: "credential-hash",
        createdAt: 1,
      });
      await ctx.db.insert("machineControlTokens", {
        userId,
        machineId: "machine-1",
        tokenHash: "control-token-hash",
        createdAt: 1,
        expiresAt: 2,
      });
      await ctx.db.insert("machineRegistrationRequests", {
        requestId: "registration-1",
        credentialHash: "registration-hash",
        userId,
        machineId: "machine-1",
        displayName: "Machine 1",
        hostname: "host-1",
        os: "linux",
        connectorVersion: "test",
        createdAt: 1,
        expiresAt: 2,
      });
      await ctx.db.insert("connectedMachines", {
        userId,
        machineId: "machine-1",
        displayName: "Machine 1",
        hostname: "host-1",
        os: "linux",
        status: "offline",
        lastSeenAt: 1,
        connectorVersion: "test",
        capabilities: ["presence"],
        allowedRoots: [],
      });
    });

    await expect(runCleanup(t, userId)).resolves.toMatchObject({
      state: "needs_more",
      target: "machineCredentials",
    });
    await expect(runCleanup(t, userId)).resolves.toMatchObject({
      state: "needs_more",
      target: "machineControlTokens",
    });
    await expect(runCleanup(t, userId)).resolves.toMatchObject({
      state: "needs_more",
      target: "machineRegistrationRequests",
    });
    await expect(runCleanup(t, userId)).resolves.toMatchObject({
      state: "needs_more",
      target: "connectedMachines",
    });
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
      await ctx.db.insert("fileStaging", {
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
        await ctx.db.insert("connectedMachines", {
          userId,
          machineId: `machine-${index}`,
          displayName: `Machine ${index}`,
          hostname: `host-${index}`,
          os: "linux",
          status: "offline",
          lastSeenAt: 1,
          connectorVersion: "test",
          capabilities: ["presence"],
          allowedRoots: [],
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
      expect(await ctx.db.query("connectedMachines").collect()).toEqual([]);
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
          await ctx.db.insert("fileStaging", {
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
          await ctx.db.insert("fileStaging", {
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
          await ctx.db.insert("blobs", {
            vaultId: deletingVaultId,
            sha: "deleting-sha",
            size: 14,
            storageId,
          });
          await ctx.db.insert("blobs", {
            vaultId: deletingVaultId,
            sha: "deleting-copy-sha",
            size: 14,
            storageId,
          });
        }

        if (survivingReference === "staging") {
          await ctx.db.insert("fileStaging", {
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
          await ctx.db.insert("blobs", {
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
