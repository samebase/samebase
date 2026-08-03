import { v, type Infer } from "convex/values";
import { internal } from "../../_generated/api";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { hasPhaseOneUserOwnership, readPhaseOneOwnershipContext } from "../../phaseOneOwnership";
import { vVaultDeletionCleanupStep, type VaultDeletionCleanupStep } from "./model";

const { id, literal, number, object, union } = v;

const deleteOnlyByVaultCleanupTables = union(
  literal("ui_vaultPullRequests_filters"),
  literal("ui_vaultResourceLinks_settings"),
  literal("vaultStagedFileUpdates"),
  literal("ui_vaultFileTree_folderExpansions"),
  literal("vaultConvexProjects"),
  literal("observations_vaultConvexSchema_snapshots"),
  literal("ui_vaultConvexSchemaGraph_nodeLayouts"),
  literal("vaultCloudflareWorkers"),
  literal("workflow_vaultProvisioning_plans"),
  literal("workflow_vaultProvisioning_writeLocks"),
);
type DeleteOnlyByVaultCleanupTable = Infer<typeof deleteOnlyByVaultCleanupTables>;

const vaultLocalCleanupTable = union(
  deleteOnlyByVaultCleanupTables,
  literal("ui_vaultFolderAssignments"),
  literal("vaultStagedFiles"),
  literal("observations_vaultFiles_blobs"),
  literal("observations_vaultRepository_branchTrees"),
  literal("workflow_vaultProvisioning_events"),
  literal("workflow_vaultProvisioning_runs"),
);
type VaultLocalCleanupTable = Infer<typeof vaultLocalCleanupTable>;

const vaultDeletionBoundaryCleanupTable = union(
  vaultLocalCleanupTable,
  literal("workflow_vaultDeletion_events"),
  literal("workflow_vaultDeletion_runs"),
);

const vaultLocalCleanupBatchResult = union(
  object({
    state: literal("needs_more"),
    table: vaultDeletionBoundaryCleanupTable,
    rowsChanged: number(),
  }),
  object({
    state: literal("deleted"),
  }),
);
export type VaultLocalCleanupBatchResult = Infer<typeof vaultLocalCleanupBatchResult>;

const vaultLifecycleCleanupBatchResult = union(
  object({
    state: literal("needs_more"),
    table: union(literal("workflow_vaultDeletion_events"), literal("workflow_vaultDeletion_runs")),
    rowsChanged: number(),
  }),
  object({ state: literal("done") }),
);
type VaultLifecycleCleanupBatchResult = Infer<typeof vaultLifecycleCleanupBatchResult>;

const vaultLocalCleanupStepBatchResult = union(
  object({
    state: literal("needs_more"),
    table: vaultLocalCleanupTable,
    rowsChanged: number(),
  }),
  object({
    state: literal("done"),
  }),
);
export type VaultLocalCleanupStepBatchResult = Infer<typeof vaultLocalCleanupStepBatchResult>;

export const VAULT_LOCAL_CLEANUP_BATCH_SIZE = 50;

type VaultLocalCleanupCtx = Pick<MutationCtx, "db" | "storage">;
type VaultLocalCleanupArgs = {
  vaultId: Id<"vaults">;
  userId: Id<"users">;
};
type VaultLocalCleanupHandler = (
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
) => Promise<number>;

function deleteByVaultBatch(tableName: DeleteOnlyByVaultCleanupTable): VaultLocalCleanupHandler {
  return async function deleteByVault(
    ctx: VaultLocalCleanupCtx,
    args: VaultLocalCleanupArgs,
  ): Promise<number> {
    const rows = await ctx.db
      .query(tableName)
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }

    return rows.length;
  };
}

async function deleteFolderAssignmentsByVaultBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("ui_vaultFolderAssignments")
    .withIndex("by_vaultId", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);

  for (const row of rows) {
    await ctx.db.delete(row._id);
  }

  return rows.length;
}

function deleteStorageBackedByVaultBatch(
  tableName: "vaultStagedFiles" | "observations_vaultFiles_blobs",
): VaultLocalCleanupHandler {
  return async function deleteStorageBackedByVault(ctx, args) {
    const rows = await ctx.db
      .query(tableName)
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
    const storageIds = new Set<Id<"_storage">>();

    for (const row of rows) {
      if (row.storageId) {
        storageIds.add(row.storageId);
      }

      await ctx.db.delete(row._id);
    }

    for (const storageId of storageIds) {
      const survivingStaging = await ctx.db
        .query("vaultStagedFiles")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .first();

      if (survivingStaging) {
        continue;
      }

      const survivingBlob = await ctx.db
        .query("observations_vaultFiles_blobs")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .first();

      if (survivingBlob) {
        continue;
      }

      await ctx.storage.delete(storageId);
    }

    return rows.length;
  };
}

async function deleteVaultBranchTreesBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("observations_vaultRepository_branchTrees")
    .withIndex("by_vault_and_branch", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteAppProvisioningEventsBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("workflow_vaultProvisioning_events")
    .withIndex("by_vault_and_created_at", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteAppProvisioningRunsBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("workflow_vaultProvisioning_runs")
    .withIndex("by_vault_and_updated_at", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

const vaultLocalCleanupRegistry = [
  {
    table: "ui_vaultPullRequests_filters",
    cleanup: deleteByVaultBatch("ui_vaultPullRequests_filters"),
  },
  {
    table: "ui_vaultResourceLinks_settings",
    cleanup: deleteByVaultBatch("ui_vaultResourceLinks_settings"),
  },
  {
    table: "ui_vaultFolderAssignments",
    cleanup: deleteFolderAssignmentsByVaultBatch,
  },
  {
    table: "vaultStagedFiles",
    cleanup: deleteStorageBackedByVaultBatch("vaultStagedFiles"),
  },
  {
    table: "vaultStagedFileUpdates",
    cleanup: deleteByVaultBatch("vaultStagedFileUpdates"),
  },
  {
    table: "observations_vaultFiles_blobs",
    cleanup: deleteStorageBackedByVaultBatch("observations_vaultFiles_blobs"),
  },
  {
    table: "ui_vaultFileTree_folderExpansions",
    cleanup: deleteByVaultBatch("ui_vaultFileTree_folderExpansions"),
  },
  {
    table: "observations_vaultRepository_branchTrees",
    cleanup: deleteVaultBranchTreesBatch,
  },
  {
    table: "vaultConvexProjects",
    cleanup: deleteByVaultBatch("vaultConvexProjects"),
  },
  {
    table: "observations_vaultConvexSchema_snapshots",
    cleanup: deleteByVaultBatch("observations_vaultConvexSchema_snapshots"),
  },
  {
    table: "ui_vaultConvexSchemaGraph_nodeLayouts",
    cleanup: deleteByVaultBatch("ui_vaultConvexSchemaGraph_nodeLayouts"),
  },
  {
    table: "vaultCloudflareWorkers",
    cleanup: deleteByVaultBatch("vaultCloudflareWorkers"),
  },
  {
    table: "workflow_vaultProvisioning_plans",
    cleanup: deleteByVaultBatch("workflow_vaultProvisioning_plans"),
  },
  {
    table: "workflow_vaultProvisioning_writeLocks",
    cleanup: deleteByVaultBatch("workflow_vaultProvisioning_writeLocks"),
  },
  {
    table: "workflow_vaultProvisioning_events",
    cleanup: deleteAppProvisioningEventsBatch,
  },
  {
    table: "workflow_vaultProvisioning_runs",
    cleanup: deleteAppProvisioningRunsBatch,
  },
] satisfies ReadonlyArray<{
  table: VaultLocalCleanupTable;
  cleanup: VaultLocalCleanupHandler;
}>;

const vaultLocalCleanupRegistryByStep = {
  cleanup_editor_state: [
    "vaultStagedFiles",
    "vaultStagedFileUpdates",
    "observations_vaultFiles_blobs",
  ],
  cleanup_source_caches: [
    "ui_vaultPullRequests_filters",
    "ui_vaultResourceLinks_settings",
    "ui_vaultFolderAssignments",
    "ui_vaultFileTree_folderExpansions",
    "observations_vaultRepository_branchTrees",
  ],
  cleanup_runtime_state: [
    "vaultConvexProjects",
    "observations_vaultConvexSchema_snapshots",
    "ui_vaultConvexSchemaGraph_nodeLayouts",
    "vaultCloudflareWorkers",
    "workflow_vaultProvisioning_plans",
    "workflow_vaultProvisioning_writeLocks",
  ],
  cleanup_provisioning_history: [
    "workflow_vaultProvisioning_events",
    "workflow_vaultProvisioning_runs",
  ],
} satisfies Record<VaultDeletionCleanupStep, readonly VaultLocalCleanupTable[]>;

/**
 * Deletes one terminal lifecycle slice for a vault. Events for a run are
 * always deleted before that run, and an active run stops cleanup.
 */
export async function deleteVaultLifecycleDataBatchForVault(
  ctx: Pick<MutationCtx, "db">,
  args: { vaultId: Id<"vaults"> },
): Promise<VaultLifecycleCleanupBatchResult> {
  const run = await ctx.db
    .query("workflow_vaultDeletion_runs")
    .withIndex("by_vault_and_updated_at", (query) => query.eq("vaultId", args.vaultId))
    .order("asc")
    .first();

  if (run === null) {
    return { state: "done" };
  }
  if (run.state === "queued" || run.state === "running") {
    throw new Error("Active vault deletion lifecycle cannot be removed.");
  }

  const events = await ctx.db
    .query("workflow_vaultDeletion_events")
    .withIndex("by_run_and_created_at", (query) => query.eq("runId", run._id))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);

  if (events.length > 0) {
    for (const event of events) {
      await ctx.db.delete(event._id);
    }
    return {
      state: "needs_more",
      table: "workflow_vaultDeletion_events",
      rowsChanged: events.length,
    };
  }

  await ctx.db.delete(run._id);
  return {
    state: "needs_more",
    table: "workflow_vaultDeletion_runs",
    rowsChanged: 1,
  };
}

export async function deleteVaultLocalDataBatchForUser(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<VaultLocalCleanupBatchResult> {
  const vault = await ctx.db.get(args.vaultId);
  if (!vault) {
    return { state: "deleted" };
  }
  const ownership = await readPhaseOneOwnershipContext(ctx.db, args.userId);
  if (!hasPhaseOneUserOwnership(ownership, vault)) {
    throw new Error("Vault not found");
  }

  // Deletion is fail-closed: every vault-scoped table must live in this
  // registry or be intentionally preserved by the deletion spec.
  for (const entry of vaultLocalCleanupRegistry) {
    const rowsChanged = await entry.cleanup(ctx, args);
    if (rowsChanged > 0) {
      return {
        state: "needs_more",
        table: entry.table,
        rowsChanged,
      };
    }
  }

  const lifecycle = await deleteVaultLifecycleDataBatchForVault(ctx, {
    vaultId: args.vaultId,
  });
  if (lifecycle.state === "needs_more") {
    return lifecycle;
  }

  await ctx.db.delete(vault._id);
  return { state: "deleted" };
}

export const deleteVaultLocalDataBatch = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
  },
  returns: vaultLocalCleanupBatchResult,
  handler: deleteVaultLocalDataBatchForUser,
});

export const cleanupVaultLocalDataStepBatch = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    step: vVaultDeletionCleanupStep,
  },
  returns: vaultLocalCleanupStepBatchResult,
  handler: async (ctx, args): Promise<VaultLocalCleanupStepBatchResult> => {
    const vault = await ctx.db.get(args.vaultId);

    if (!vault) {
      return { state: "done" };
    }

    const ownership = await readPhaseOneOwnershipContext(ctx.db, args.userId);
    if (!hasPhaseOneUserOwnership(ownership, vault)) {
      throw new Error("Vault not found");
    }

    const tables: readonly VaultLocalCleanupTable[] = vaultLocalCleanupRegistryByStep[args.step];

    for (const entry of vaultLocalCleanupRegistry) {
      if (!tables.some((table) => table === entry.table)) {
        continue;
      }

      const rowsChanged = await entry.cleanup(ctx, args);

      if (rowsChanged > 0) {
        return {
          state: "needs_more",
          table: entry.table,
          rowsChanged,
        };
      }
    }

    return { state: "done" };
  },
});

export const deleteVaultRow = internalMutation({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      return null;
    }
    const ownership = await readPhaseOneOwnershipContext(ctx.db, args.userId);
    if (!hasPhaseOneUserOwnership(ownership, vault)) {
      throw new Error("Vault not found");
    }

    await ctx.db.delete(vault._id);
    return null;
  },
});

export const cleanupDeletedVaultLifecycleDataBatch = internalMutation({
  args: {
    vaultId: id("vaults"),
  },
  returns: vaultLifecycleCleanupBatchResult,
  handler: async (ctx, args): Promise<VaultLifecycleCleanupBatchResult> => {
    if ((await ctx.db.get(args.vaultId)) !== null) {
      throw new Error("Vault lifecycle cleanup requires a deleted vault.");
    }

    return await deleteVaultLifecycleDataBatchForVault(ctx, args);
  },
});

export const continueDeletedVaultLifecycleCleanup = internalMutation({
  args: {
    vaultId: id("vaults"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if ((await ctx.db.get(args.vaultId)) !== null) {
      return null;
    }

    const result = await deleteVaultLifecycleDataBatchForVault(ctx, args);
    if (result.state === "needs_more") {
      await ctx.scheduler.runAfter(
        0,
        internal.vault.deletion.cleanup.continueDeletedVaultLifecycleCleanup,
        args,
      );
    }

    return null;
  },
});
