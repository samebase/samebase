import { v, type Infer } from "convex/values";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { vVaultDeletionCleanupStep, type VaultDeletionCleanupStep } from "./model";

const { id, literal, number, object, union } = v;

const deleteOnlyByVaultCleanupTables = union(
  literal("ui_vaultBranchFilters"),
  literal("ui_vaultResourceLinksState"),
  literal("operations_collaborativeFileUpdates"),
  literal("ui_folderExpansionState"),
  literal("observations_vaultRemoteBranches"),
  literal("vaultDomains"),
  literal("vaultApps"),
  literal("vaultConvexDeployments"),
  literal("observations_vaultConvexSchemaSnapshots"),
  literal("ui_vaultConvexSchemaGraphLayouts"),
  literal("vaultCloudflareWorkers"),
  literal("operations_vaultProvisioningPlans"),
  literal("operations_vaultProvisioningRunClaims"),
  literal("codespaces"),
  literal("ui_agentGraphNodeLayout"),
);
type DeleteOnlyByVaultCleanupTable = Infer<typeof deleteOnlyByVaultCleanupTables>;

const vaultLocalCleanupTable = union(
  deleteOnlyByVaultCleanupTables,
  literal("operations_fileStaging"),
  literal("observations_vaultFileBlobs"),
  literal("observations_vaultBranchTrees"),
  literal("operations_aiProductionReadRequests"),
  literal("operations_vaultProvisioningEvents"),
  literal("operations_vaultProvisioningRuns"),
  literal("agentThreadContext"),
  literal("operations_vaultRepositoryRefreshRequests"),
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
  tableName: "operations_fileStaging" | "observations_vaultFileBlobs",
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
        .query("operations_fileStaging")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .first();

      if (survivingStaging) {
        continue;
      }

      const survivingBlob = await ctx.db
        .query("observations_vaultFileBlobs")
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
    .query("observations_vaultBranchTrees")
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
    .query("operations_aiProductionReadRequests")
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
    .query("operations_vaultProvisioningEvents")
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
    .query("operations_vaultProvisioningRuns")
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
    .query("agentThreadContext")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  let rowsChanged = 0;

  for (const context of contexts) {
    const metadata = await ctx.db
      .query("chatMessageMetadata")
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
    .query("operations_vaultRepositoryRefreshRequests")
    .withIndex("by_vaultId_and_updatedAt", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);

  for (const row of rows) {
    await ctx.db.delete(row._id);
  }

  return rows.length;
}

const vaultLocalCleanupRegistry = [
  {
    table: "ui_vaultBranchFilters",
    cleanup: deleteByVaultBatch("ui_vaultBranchFilters"),
  },
  {
    table: "ui_vaultResourceLinksState",
    cleanup: deleteByVaultBatch("ui_vaultResourceLinksState"),
  },
  {
    table: "operations_fileStaging",
    cleanup: deleteStorageBackedByVaultBatch("operations_fileStaging"),
  },
  {
    table: "operations_collaborativeFileUpdates",
    cleanup: deleteByVaultBatch("operations_collaborativeFileUpdates"),
  },
  {
    table: "observations_vaultFileBlobs",
    cleanup: deleteStorageBackedByVaultBatch("observations_vaultFileBlobs"),
  },
  {
    table: "ui_folderExpansionState",
    cleanup: deleteByVaultBatch("ui_folderExpansionState"),
  },
  {
    table: "observations_vaultRemoteBranches",
    cleanup: deleteByVaultBatch("observations_vaultRemoteBranches"),
  },
  {
    table: "observations_vaultBranchTrees",
    cleanup: deleteVaultBranchTreesBatch,
  },
  {
    table: "vaultDomains",
    cleanup: deleteByVaultBatch("vaultDomains"),
  },
  {
    table: "vaultApps",
    cleanup: deleteByVaultBatch("vaultApps"),
  },
  {
    table: "vaultConvexDeployments",
    cleanup: deleteByVaultBatch("vaultConvexDeployments"),
  },
  {
    table: "observations_vaultConvexSchemaSnapshots",
    cleanup: deleteByVaultBatch("observations_vaultConvexSchemaSnapshots"),
  },
  {
    table: "ui_vaultConvexSchemaGraphLayouts",
    cleanup: deleteByVaultBatch("ui_vaultConvexSchemaGraphLayouts"),
  },
  {
    table: "vaultCloudflareWorkers",
    cleanup: deleteByVaultBatch("vaultCloudflareWorkers"),
  },
  {
    table: "operations_vaultProvisioningPlans",
    cleanup: deleteByVaultBatch("operations_vaultProvisioningPlans"),
  },
  {
    table: "operations_vaultProvisioningRunClaims",
    cleanup: deleteByVaultBatch("operations_vaultProvisioningRunClaims"),
  },
  {
    table: "codespaces",
    cleanup: deleteByVaultBatch("codespaces"),
  },
  {
    table: "ui_agentGraphNodeLayout",
    cleanup: deleteByVaultBatch("ui_agentGraphNodeLayout"),
  },
  {
    table: "operations_aiProductionReadRequests",
    cleanup: patchAiProdAccessRequestsBatch,
  },
  {
    table: "agentThreadContext",
    cleanup: deleteAgentThreadContextsBatch,
  },
  {
    table: "operations_vaultRepositoryRefreshRequests",
    cleanup: deleteRepositoryRefreshRequestsBatch,
  },
  {
    table: "operations_vaultProvisioningEvents",
    cleanup: deleteAppProvisioningEventsBatch,
  },
  {
    table: "operations_vaultProvisioningRuns",
    cleanup: deleteAppProvisioningRunsBatch,
  },
] satisfies ReadonlyArray<{
  table: VaultLocalCleanupTable;
  cleanup: VaultLocalCleanupHandler;
}>;

const vaultLocalCleanupRegistryByStep = {
  cleanup_editor_state: [
    "operations_fileStaging",
    "operations_collaborativeFileUpdates",
    "observations_vaultFileBlobs",
  ],
  cleanup_source_caches: [
    "ui_vaultBranchFilters",
    "ui_vaultResourceLinksState",
    "ui_folderExpansionState",
    "observations_vaultRemoteBranches",
    "observations_vaultBranchTrees",
    "operations_vaultRepositoryRefreshRequests",
  ],
  cleanup_runtime_state: [
    "vaultDomains",
    "vaultApps",
    "vaultConvexDeployments",
    "observations_vaultConvexSchemaSnapshots",
    "ui_vaultConvexSchemaGraphLayouts",
    "vaultCloudflareWorkers",
    "operations_vaultProvisioningPlans",
    "operations_vaultProvisioningRunClaims",
    "codespaces",
    "ui_agentGraphNodeLayout",
  ],
  cleanup_access_state: ["operations_aiProductionReadRequests"],
  detach_agent_context: ["agentThreadContext"],
  cleanup_provisioning_history: [
    "operations_vaultProvisioningEvents",
    "operations_vaultProvisioningRuns",
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
