import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";
import { deleteVaultLocalDataBatchForOrganization } from "../vault/deletion/cleanup";
import { cleanupAccountLocalDataBatchForUser } from "./cleanup";
import { INITIAL_ACCOUNT_DELETION_DATA_PROGRESS } from "./model";

async function seedUser(
  t: ReturnType<typeof makeConvexTest>,
  email: string,
  organizationId?: Id<"organizations">,
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email, isApproved: true });
    const resolvedOrganizationId =
      organizationId ?? (await ctx.db.insert("organizations", { name: "Test organization" }));
    await ctx.db.insert("organizationMemberships", {
      organizationId: resolvedOrganizationId,
      userId,
    });
    if (organizationId === undefined) {
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId: resolvedOrganizationId,
        plan: "free",
        status: "inactive",
      });
    }
    return userId;
  });
}

async function readOrganizationId(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (query) => query.eq("userId", userId))
      .unique();
    if (membership === null) {
      throw new Error("Expected organization membership.");
    }
    return membership.organizationId;
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
  const organizationId = await readOrganizationId(t, userId);
  const args = { organizationId, vaultId };
  let result = await t.run(async (ctx) => {
    return await deleteVaultLocalDataBatchForOrganization(ctx, args);
  });
  while (result.state === "needs_more") {
    result = await t.run(async (ctx) => {
      return await deleteVaultLocalDataBatchForOrganization(ctx, args);
    });
  }
  expect(result).toEqual({ state: "deleted" });
}

async function seedVault(
  t: ReturnType<typeof makeConvexTest>,
  userId: Awaited<ReturnType<typeof seedUser>>,
) {
  const organizationId = await readOrganizationId(t, userId);
  return await t.run(async (ctx) => {
    return await ctx.db.insert("vaults", {
      organizationId,
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
      expect(run.dataDeletion.vaultsAndStagedChanges).toMatchObject({
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
      expect(run.dataDeletion.vaultsAndStagedChanges).toMatchObject({
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
      expect(run.dataDeletion.vaultsAndStagedChanges).toMatchObject({
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

  it("deletes vault lifecycle events before runs on the organization cleanup path", async () => {
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
    const organizationId = await readOrganizationId(t, userId);
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
        .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
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
      expect(run.dataDeletion.vaultsAndStagedChanges).toMatchObject({
        state: "completed",
        deletedVaultCount: 1,
      });
    });
  });

  it("blocks sole-member organization work", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const organizationId = await readOrganizationId(t, userId);
    const runId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      return await ctx.db.insert("workflow_vaultDeletion_runs", {
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

  it("preserves all organization resources when another member remains", async () => {
    const t = makeConvexTest();
    const deletingUserId = await seedUser(t, "deleting@example.com");
    const organizationId = await readOrganizationId(t, deletingUserId);
    await seedUser(t, "remaining@example.com", organizationId);
    const resources = await t.run(async (ctx) => {
      const deletingVaultId = await ctx.db.insert("vaults", {
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      const remainingVaultId = await ctx.db.insert("vaults", {
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
      deletingVault: expect.any(Object),
      organization: expect.any(Object),
      remainingVault: expect.any(Object),
    });
  });

  it("does not delete rows while app provisioning can still write provider state", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const organizationId = await readOrganizationId(t, userId);
    const runId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      return await ctx.db.insert("workflow_vaultProvisioning_runs", {
        requestedByUserId: userId,
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
    const organizationId = await readOrganizationId(t, userId);
    const settingsId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      await ctx.db.insert("workflow_vaultProvisioning_runs", {
        requestedByUserId: userId,
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
    const organizationId = await readOrganizationId(t, userId);
    const { storageId, vaultId } = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      const storageId = await ctx.storage.store(new Blob(["private draft"]));
      await ctx.db.insert("vaultStagedFiles", {
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
    const organizationId = await readOrganizationId(t, userId);
    await t.run(async (ctx) => {
      await ctx.db.insert("mcpGrants", {
        grantId: "grant-1",
        userId,
        organizationId,
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
