/// <reference types="vite/client" />

import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";
import { REPOSITORY_MIGRATION_INVENTORY_BATCH_SIZE } from "./inventory";
import { repositoryMigrationTablePairs } from "./manifest";

async function insertFixtureRoots(t: ReturnType<typeof makeConvexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "repository-migration-inventory@example.com",
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "repository-migration-inventory",
      githubOwnerId: "repository-migration-inventory",
      githubOwnerLogin: "repository-migration-inventory",
      githubOwnerLoginNormalized: "repository-migration-inventory",
      githubOwnerType: "organization",
    });
    return { organizationId, userId };
  });
}

async function insertVault(
  t: ReturnType<typeof makeConvexTest>,
  organizationId: Id<"organizations">,
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("vaults", {
      state: "not_connected",
      organizationId,
      deletion: { state: "not_deleting" },
    });
  });
}

describe("repository migration inventory", () => {
  it("accepts every source table in the migration manifest", async () => {
    const t = makeConvexTest();

    for (const pair of repositoryMigrationTablePairs) {
      await expect(
        t.query(internal.repositoryMigration.inventory.inventoryBatch, {
          sourceTable: pair.source,
          cursor: null,
        }),
      ).resolves.toMatchObject({
        sourceTable: pair.source,
        targetTable: pair.target,
        isDone: true,
        sourceRows: 0,
      });
    }
  });

  it("reads each source table through a fixed bounded page", async () => {
    const t = makeConvexTest();
    const { organizationId, userId } = await insertFixtureRoots(t);
    await t.run(async (ctx) => {
      for (let index = 0; index <= REPOSITORY_MIGRATION_INVENTORY_BATCH_SIZE; index += 1) {
        await ctx.db.insert("ui_vaultFolders", {
          userId,
          organizationId,
          name: `Folder ${index}`,
          nameKey: `folder-${index}`,
          position: index,
          collapsed: false,
        });
      }
    });

    const first = await t.query(internal.repositoryMigration.inventory.inventoryBatch, {
      sourceTable: "ui_vaultFolders",
      cursor: null,
    });
    expect(first).toMatchObject({
      sourceTable: "ui_vaultFolders",
      targetTable: "ui_repositoryTree_folders",
      isDone: false,
      sourceRows: REPOSITORY_MIGRATION_INVENTORY_BATCH_SIZE,
      storedIdEdges: 0,
      missingReferences: 0,
      validMissingRepositoryRoots: 0,
      storageReferences: 0,
      missingStorageReferences: 0,
    });
    expect(first.continueCursor).not.toBe("");

    const second = await t.query(internal.repositoryMigration.inventory.inventoryBatch, {
      sourceTable: "ui_vaultFolders",
      cursor: first.continueCursor,
    });
    expect(second).toEqual({
      sourceTable: "ui_vaultFolders",
      targetTable: "ui_repositoryTree_folders",
      continueCursor: second.continueCursor,
      isDone: true,
      sourceRows: 1,
      storedIdEdges: 0,
      missingReferences: 0,
      validMissingRepositoryRoots: 0,
      storageReferences: 0,
      missingStorageReferences: 0,
    });
  });

  it("counts stored document and storage references without returning documents", async () => {
    const t = makeConvexTest();
    const { organizationId, userId } = await insertFixtureRoots(t);
    const vaultId = await insertVault(t, organizationId);
    const storageId = await t.run(async (ctx) => {
      const folderId = await ctx.db.insert("ui_vaultFolders", {
        userId,
        organizationId,
        name: "Folder",
        nameKey: "folder",
        position: 0,
        collapsed: false,
      });
      await ctx.db.insert("ui_vaultFolderAssignments", {
        userId,
        organizationId,
        vaultId,
        folderId,
      });
      const storageId = await ctx.storage.store(new Blob(["stored content"]));
      await ctx.db.insert("vaultStagedFiles", {
        vaultId,
        fileDeleted: false,
        kind: "text",
        filePath: "src/example.ts",
        initialFilePath: "src/example.ts",
        content: "stored content",
        initialContent: "stored content",
        storageId,
        parentCommitSha: null,
        lastEditTime: 1,
        lastEditUserId: userId,
        branch: "main",
        version: 1,
      });
      await ctx.db.delete(folderId);
      return storageId;
    });

    const assignment = await t.query(internal.repositoryMigration.inventory.inventoryBatch, {
      sourceTable: "ui_vaultFolderAssignments",
      cursor: null,
    });
    expect(assignment).toMatchObject({
      sourceRows: 1,
      storedIdEdges: 2,
      missingReferences: 1,
      validMissingRepositoryRoots: 0,
      storageReferences: 0,
      missingStorageReferences: 0,
    });
    const stagedFile = await t.query(internal.repositoryMigration.inventory.inventoryBatch, {
      sourceTable: "vaultStagedFiles",
      cursor: null,
    });
    expect(stagedFile).toMatchObject({
      sourceRows: 1,
      storedIdEdges: 1,
      missingReferences: 0,
      storageReferences: 1,
      missingStorageReferences: 0,
    });

    await t.run(async (ctx) => await ctx.storage.delete(storageId));
    const missingStorage = await t.query(internal.repositoryMigration.inventory.inventoryBatch, {
      sourceTable: "vaultStagedFiles",
      cursor: null,
    });
    expect(missingStorage).toMatchObject({
      storageReferences: 1,
      missingStorageReferences: 1,
    });
  });

  it("allows only succeeded deletion history to retain a missing repository root", async () => {
    const t = makeConvexTest();
    const { organizationId, userId } = await insertFixtureRoots(t);
    const deletedVaultId = await insertVault(t, organizationId);
    await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "succeeded",
        organizationId,
        userId,
        vaultId: deletedVaultId,
        repositoryFullName: "repository-migration-inventory/deleted",
        createdAt: 1,
        updatedAt: 2,
        attempt: { kind: "initial" },
        workflow: { state: "started", workflowId: "repository-migration-inventory" },
        currentStep: "finish",
        snapshot: { state: "scrubbed_after_success" },
        completedAt: 2,
      });
      await ctx.db.insert("workflow_vaultDeletion_events", {
        organizationId,
        userId,
        vaultId: deletedVaultId,
        repositoryFullName: "repository-migration-inventory/deleted",
        runId,
        step: "finish",
        level: "info",
        message: "Deletion completed.",
        createdAt: 2,
      });
      await ctx.db.delete(deletedVaultId);
    });

    const runInventory = await t.query(internal.repositoryMigration.inventory.inventoryBatch, {
      sourceTable: "workflow_vaultDeletion_runs",
      cursor: null,
    });
    expect(runInventory).toMatchObject({
      sourceRows: 1,
      storedIdEdges: 1,
      missingReferences: 0,
      validMissingRepositoryRoots: 1,
    });
    const eventInventory = await t.query(internal.repositoryMigration.inventory.inventoryBatch, {
      sourceTable: "workflow_vaultDeletion_events",
      cursor: null,
    });
    expect(eventInventory).toMatchObject({
      sourceRows: 1,
      storedIdEdges: 2,
      missingReferences: 0,
      validMissingRepositoryRoots: 1,
    });

    const invalidVaultId = await insertVault(t, organizationId);
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultStagedFileUpdates", {
        vaultId: invalidVaultId,
        branch: "main",
        filePath: "src/example.ts",
        version: 1,
        clientId: "repository-migration-inventory",
        changes: "[]",
        userId,
        timestamp: 1,
      });
      await ctx.db.delete(invalidVaultId);
    });
    await expect(
      t.query(internal.repositoryMigration.inventory.inventoryBatch, {
        sourceTable: "vaultStagedFileUpdates",
        cursor: null,
      }),
    ).rejects.toThrow("A repository-domain row has an invalid missing vault root.");
  });

  it("allows a failed deletion attempt and its events when a successful retry removed the root", async () => {
    const t = makeConvexTest();
    const { organizationId, userId } = await insertFixtureRoots(t);
    const deletedVaultId = await insertVault(t, organizationId);
    await t.run(async (ctx) => {
      const failedRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "failed",
        organizationId,
        userId,
        vaultId: deletedVaultId,
        repositoryFullName: "repository-migration-inventory/retried",
        createdAt: 1,
        updatedAt: 2,
        attempt: { kind: "initial" },
        workflow: { state: "not_started" },
        currentStep: "lock_vault",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "existing_repository",
              ghRepoId: "github-repository-id",
              owner: "repository-migration-inventory",
              name: "retried",
              repositoryFullName: "repository-migration-inventory/retried",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
        lastError: "Retry required.",
        completedAt: 2,
      });
      await ctx.db.insert("workflow_vaultDeletion_events", {
        organizationId,
        userId,
        vaultId: deletedVaultId,
        repositoryFullName: "repository-migration-inventory/retried",
        runId: failedRunId,
        step: "lock_vault",
        level: "error",
        message: "Deletion failed.",
        createdAt: 2,
      });
      const succeededRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "succeeded",
        organizationId,
        userId,
        vaultId: deletedVaultId,
        repositoryFullName: "repository-migration-inventory/retried",
        createdAt: 3,
        updatedAt: 4,
        attempt: { kind: "retry", retryOf: failedRunId },
        workflow: { state: "started", workflowId: "repository-migration-inventory-retry" },
        currentStep: "finish",
        snapshot: { state: "scrubbed_after_success" },
        completedAt: 4,
      });
      await ctx.db.insert("workflow_vaultDeletion_events", {
        organizationId,
        userId,
        vaultId: deletedVaultId,
        repositoryFullName: "repository-migration-inventory/retried",
        runId: succeededRunId,
        step: "finish",
        level: "info",
        message: "Deletion completed.",
        createdAt: 4,
      });
      await ctx.db.delete(deletedVaultId);
    });

    const runInventory = await t.query(internal.repositoryMigration.inventory.inventoryBatch, {
      sourceTable: "workflow_vaultDeletion_runs",
      cursor: null,
    });
    expect(runInventory).toMatchObject({
      sourceRows: 2,
      storedIdEdges: 3,
      missingReferences: 0,
      validMissingRepositoryRoots: 2,
    });
    const eventInventory = await t.query(internal.repositoryMigration.inventory.inventoryBatch, {
      sourceTable: "workflow_vaultDeletion_events",
      cursor: null,
    });
    expect(eventInventory).toMatchObject({
      sourceRows: 2,
      storedIdEdges: 4,
      missingReferences: 0,
      validMissingRepositoryRoots: 2,
    });
  });
});
