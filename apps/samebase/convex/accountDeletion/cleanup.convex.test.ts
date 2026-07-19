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

  it("blocks while separately-authorized vault deletion is active", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const runId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      return await ctx.db.insert("workflow_vaultDeletion_runs", {
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
              owner: "owner",
              name: "repository",
              repositoryFullName: "owner/repository",
            },
            codespaces: { action: "skip", reason: "not_requested" },
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

  it("deletes terminal refresh requests after their vault row is already gone", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const requestId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      const seededRequestId = await ctx.db.insert("vaultRepositoryRefreshRequests", {
        userId,
        vaultId,
        dedupeKey: `${vaultId}:main`,
        demand: { scope: "branch", branch: "main", source: "file_view" },
        lifecycle: { state: "canceled", canceledAt: 1, reason: "vault_deleted" },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.delete(vaultId);
      return seededRequestId;
    });

    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "needs_more",
      target: "vaultRepositoryRefreshRequests",
      rowsChanged: 1,
    });
    await expect(t.run(async (ctx) => await ctx.db.get(requestId))).resolves.toBeNull();
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

  it("preserves repository commit check caches shared with another vault", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const survivingUserId = await seedUser(t, "surviving-owner@example.com");
    const survivingVaultId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId,
        vaultId,
        repositoryFullName: "owner/repository",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 2,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "shared-repository-id",
        owner: "owner",
        name: "repository",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 2,
      });

      const survivingVaultId = await ctx.db.insert("vaults", {
        userId: survivingUserId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      const survivingRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: survivingUserId,
        vaultId: survivingVaultId,
        repositoryFullName: "owner/repository",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 2,
      });
      await ctx.db.replace(survivingVaultId, {
        userId: survivingUserId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId: survivingRunId,
        ghRepoId: "shared-repository-id",
        owner: "owner",
        name: "repository",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 2,
      });
      return survivingVaultId;
    });
    await t.mutation(internal.commitChecks.replaceGitHubCommitChecks, {
      githubRepositoryId: "shared-repository-id",
      commitSha: "commit-sha",
      syncedAt: 3,
      items: [
        {
          source: "check_run",
          sourceKey: "check-1",
          name: "tests",
          state: "success",
          status: "completed",
        },
      ],
    });

    let result = await runCleanup(t, userId);
    for (let attempt = 0; attempt < 20 && result.state !== "done"; attempt += 1) {
      result = await runCleanup(t, userId);
    }
    expect(result).toEqual({ state: "done" });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(survivingVaultId)).not.toBeNull();
      expect(await ctx.db.query("observations_githubCommit_checks").collect()).toHaveLength(1);
      expect(await ctx.db.query("derived_githubCommit_checkSummaries").collect()).toHaveLength(1);
    });
  });

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
