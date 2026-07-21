import { v, type Infer } from "convex/values";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { vVaultDeletionCleanupStep, type VaultDeletionCleanupStep } from "./model";

const { id, literal, number, object, union } = v;

const deleteOnlyByVaultCleanupTables = union(
  literal("ui_vaultBranches_filters"),
  literal("ui_vaultResourceLinks_settings"),
  literal("vaultStagedFileUpdates"),
  literal("ui_vaultFileTree_folderExpansions"),
  literal("observations_vaultRepository_branches"),
  literal("vaultDomains"),
  literal("vaultConvexProjects"),
  literal("observations_vaultConvexSchema_snapshots"),
  literal("ui_vaultConvexSchemaGraph_nodeLayouts"),
  literal("vaultCloudflareWorkers"),
  literal("workflow_vaultProvisioning_plans"),
  literal("workflow_vaultProvisioning_writeLocks"),
  literal("codespaces"),
  literal("ui_agentGraphNode_layouts"),
);
type DeleteOnlyByVaultCleanupTable = Infer<typeof deleteOnlyByVaultCleanupTables>;

const vaultLocalCleanupTable = union(
  deleteOnlyByVaultCleanupTables,
  literal("vaultStagedFiles"),
  literal("observations_vaultFiles_blobs"),
  literal("observations_vaultRepository_branchTrees"),
  literal("aiProductionReadRequests"),
  literal("workflow_vaultProvisioning_events"),
  literal("workflow_vaultProvisioning_runs"),
  literal("chatThreadContexts"),
  literal("vaultRepositoryRefreshRequests"),
);
type VaultLocalCleanupTable = Infer<typeof vaultLocalCleanupTable>;

const vaultLocalCleanupBatchResult = union(
  object({
    state: literal("needs_more"),
    table: vaultLocalCleanupTable,
    rowsChanged: number(),
  }),
  object({
    state: literal("deleted"),
  }),
);
export type VaultLocalCleanupBatchResult = Infer<typeof vaultLocalCleanupBatchResult>;

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

async function patchAiProdAccessRequestsBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("aiProductionReadRequests")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.patch(row._id, {
      vaultId: undefined,
      status: row.status === "proposed" || row.status === "approved" ? "expired" : row.status,
      error:
        row.status === "proposed" || row.status === "approved"
          ? "Vault was deleted before production access was used."
          : row.error,
    });
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

async function deleteAgentThreadContextsBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const contexts = await ctx.db
    .query("chatThreadContexts")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  let rowsChanged = 0;

  for (const context of contexts) {
    const metadata = await ctx.db
      .query("chatMessagePayloads")
      .withIndex("by_threadId", (q) => q.eq("threadId", context.threadId))
      .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE - rowsChanged);

    for (const row of metadata) {
      await ctx.db.delete(row._id);
      rowsChanged += 1;
    }

    if (metadata.length > 0) {
      return rowsChanged;
    }

    await ctx.db.delete(context._id);
    rowsChanged += 1;

    if (rowsChanged === VAULT_LOCAL_CLEANUP_BATCH_SIZE) {
      return rowsChanged;
    }
  }

  return rowsChanged;
}

async function deleteRepositoryRefreshRequestsBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("vaultRepositoryRefreshRequests")
    .withIndex("by_vaultId_and_updatedAt", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);

  for (const row of rows) {
    await ctx.db.delete(row._id);
  }

  return rows.length;
}

const vaultLocalCleanupRegistry = [
  {
    table: "ui_vaultBranches_filters",
    cleanup: deleteByVaultBatch("ui_vaultBranches_filters"),
  },
  {
    table: "ui_vaultResourceLinks_settings",
    cleanup: deleteByVaultBatch("ui_vaultResourceLinks_settings"),
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
    table: "observations_vaultRepository_branches",
    cleanup: deleteByVaultBatch("observations_vaultRepository_branches"),
  },
  {
    table: "observations_vaultRepository_branchTrees",
    cleanup: deleteVaultBranchTreesBatch,
  },
  {
    table: "vaultDomains",
    cleanup: deleteByVaultBatch("vaultDomains"),
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
    table: "codespaces",
    cleanup: deleteByVaultBatch("codespaces"),
  },
  {
    table: "ui_agentGraphNode_layouts",
    cleanup: deleteByVaultBatch("ui_agentGraphNode_layouts"),
  },
  {
    table: "aiProductionReadRequests",
    cleanup: patchAiProdAccessRequestsBatch,
  },
  {
    table: "chatThreadContexts",
    cleanup: deleteAgentThreadContextsBatch,
  },
  {
    table: "vaultRepositoryRefreshRequests",
    cleanup: deleteRepositoryRefreshRequestsBatch,
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
    "ui_vaultBranches_filters",
    "ui_vaultResourceLinks_settings",
    "ui_vaultFileTree_folderExpansions",
    "observations_vaultRepository_branches",
    "observations_vaultRepository_branchTrees",
    "vaultRepositoryRefreshRequests",
  ],
  cleanup_runtime_state: [
    "vaultDomains",
    "vaultConvexProjects",
    "observations_vaultConvexSchema_snapshots",
    "ui_vaultConvexSchemaGraph_nodeLayouts",
    "vaultCloudflareWorkers",
    "workflow_vaultProvisioning_plans",
    "workflow_vaultProvisioning_writeLocks",
    "codespaces",
    "ui_agentGraphNode_layouts",
  ],
  cleanup_access_state: ["aiProductionReadRequests"],
  detach_agent_context: ["chatThreadContexts"],
  cleanup_provisioning_history: [
    "workflow_vaultProvisioning_events",
    "workflow_vaultProvisioning_runs",
  ],
} satisfies Record<VaultDeletionCleanupStep, readonly VaultLocalCleanupTable[]>;

export async function deleteVaultLocalDataBatchForUser(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<VaultLocalCleanupBatchResult> {
  const vault = await ctx.db.get(args.vaultId);
  if (!vault) {
    return { state: "deleted" };
  }
  if (vault.userId !== args.userId) {
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

    if (vault.userId !== args.userId) {
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
    if (vault.userId !== args.userId) {
      throw new Error("Vault not found");
    }

    await ctx.db.delete(vault._id);
    return null;
  },
});
