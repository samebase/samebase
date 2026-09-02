import { v, type Infer } from "convex/values";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireRepositoryAuthorityContinuation } from "../../repositoryMigration/maintenance";
import { requireActiveVaultDeletionRun } from "../../vaultWorkflowAuthority";
import { vVaultDeletionCleanupStep, type VaultDeletionCleanupStep } from "./model";
import { readVaultDeletionState } from "./state";

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
  runId: Id<"workflow_vaultDeletion_runs">;
};
type VaultLocalCleanupHandler = (
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
) => Promise<number>;

async function loadVaultForDeletionActor(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<Doc<"vaults"> | null> {
  const run = await requireActiveVaultDeletionRun(ctx.db, { runId: args.runId });
  if (run.vaultId !== args.vaultId) {
    throw new Error("Vault deletion run does not match its vault.");
  }
  const vault = await ctx.db.get(args.vaultId);
  if (!vault) {
    return null;
  }
  if (vault.organizationId !== run.organizationId) {
    throw new Error("Vault deletion run does not match its vault.");
  }
  const deletion = readVaultDeletionState(vault);
  if (deletion.state !== "deleting" || deletion.runId !== run._id) {
    throw new Error("Vault deletion gate does not match run.");
  }
  await requireRepositoryAuthorityContinuation(ctx);
  return vault;
}

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

export const cleanupVaultLocalDataStepBatch = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultDeletion_runs"),
    step: vVaultDeletionCleanupStep,
  },
  returns: vaultLocalCleanupStepBatchResult,
  handler: async (ctx, args): Promise<VaultLocalCleanupStepBatchResult> => {
    const vault = await loadVaultForDeletionActor(ctx, args);

    if (!vault) {
      return { state: "done" };
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
    runId: id("workflow_vaultDeletion_runs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const vault = await loadVaultForDeletionActor(ctx, args);
    if (!vault) {
      return null;
    }

    await ctx.db.delete(vault._id);
    return null;
  },
});
