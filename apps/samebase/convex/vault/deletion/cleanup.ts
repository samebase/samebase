import { v, type Infer } from "convex/values";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { vVaultDeletionCleanupStep, type VaultDeletionCleanupStep } from "./model";

const { id, literal, number, object, union } = v;

const deleteOnlyByVaultCleanupTables = union(
  literal("vaultBranchFilters"),
  literal("vaultResourceLinksState"),
  literal("collaborativeUpdates"),
  literal("folderExpansionState"),
  literal("vaultRemoteBranches"),
  literal("vaultDomains"),
  literal("vaultWorkerDeploymentDependencies"),
  literal("vaultApps"),
  literal("vaultConvexDeployments"),
  literal("vaultConvexSchemaSnapshots"),
  literal("vaultConvexSchemaGraphLayouts"),
  literal("vaultCloudflareWorkers"),
  literal("vaultInfrastructureTargets"),
  literal("vaultInfrastructureOwnership"),
  literal("codespaces"),
  literal("agentGraphNodeLayout"),
);
type DeleteOnlyByVaultCleanupTable = Infer<typeof deleteOnlyByVaultCleanupTables>;

const vaultLocalCleanupTable = union(
  deleteOnlyByVaultCleanupTables,
  literal("fileStaging"),
  literal("blobs"),
  literal("vaultBranchTrees"),
  literal("aiProdAccessRequests"),
  literal("appProvisioningEvents"),
  literal("appProvisioningRuns"),
  literal("agentThreadContext"),
  literal("repositoryRefreshRequests"),
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
  tableName: "fileStaging" | "blobs",
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
        .query("fileStaging")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .first();

      if (survivingStaging) {
        continue;
      }

      const survivingBlob = await ctx.db
        .query("blobs")
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
    .query("vaultBranchTrees")
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
    .query("aiProdAccessRequests")
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
    .query("appProvisioningEvents")
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
    .query("appProvisioningRuns")
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
    .query("repositoryRefreshRequests")
    .withIndex("by_vaultId_and_updatedAt", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);

  for (const row of rows) {
    await ctx.db.delete(row._id);
  }

  return rows.length;
}

const vaultLocalCleanupRegistry = [
  {
    table: "vaultBranchFilters",
    cleanup: deleteByVaultBatch("vaultBranchFilters"),
  },
  {
    table: "vaultResourceLinksState",
    cleanup: deleteByVaultBatch("vaultResourceLinksState"),
  },
  {
    table: "fileStaging",
    cleanup: deleteStorageBackedByVaultBatch("fileStaging"),
  },
  {
    table: "collaborativeUpdates",
    cleanup: deleteByVaultBatch("collaborativeUpdates"),
  },
  {
    table: "blobs",
    cleanup: deleteStorageBackedByVaultBatch("blobs"),
  },
  {
    table: "folderExpansionState",
    cleanup: deleteByVaultBatch("folderExpansionState"),
  },
  {
    table: "vaultRemoteBranches",
    cleanup: deleteByVaultBatch("vaultRemoteBranches"),
  },
  {
    table: "vaultBranchTrees",
    cleanup: deleteVaultBranchTreesBatch,
  },
  {
    table: "vaultDomains",
    cleanup: deleteByVaultBatch("vaultDomains"),
  },
  {
    table: "vaultWorkerDeploymentDependencies",
    cleanup: deleteByVaultBatch("vaultWorkerDeploymentDependencies"),
  },
  {
    table: "vaultConvexDeployments",
    cleanup: deleteByVaultBatch("vaultConvexDeployments"),
  },
  {
    table: "vaultConvexSchemaSnapshots",
    cleanup: deleteByVaultBatch("vaultConvexSchemaSnapshots"),
  },
  {
    table: "vaultConvexSchemaGraphLayouts",
    cleanup: deleteByVaultBatch("vaultConvexSchemaGraphLayouts"),
  },
  {
    table: "vaultCloudflareWorkers",
    cleanup: deleteByVaultBatch("vaultCloudflareWorkers"),
  },
  {
    table: "vaultInfrastructureTargets",
    cleanup: deleteByVaultBatch("vaultInfrastructureTargets"),
  },
  {
    table: "vaultInfrastructureOwnership",
    cleanup: deleteByVaultBatch("vaultInfrastructureOwnership"),
  },
  {
    table: "vaultApps",
    cleanup: deleteByVaultBatch("vaultApps"),
  },
  {
    table: "codespaces",
    cleanup: deleteByVaultBatch("codespaces"),
  },
  {
    table: "agentGraphNodeLayout",
    cleanup: deleteByVaultBatch("agentGraphNodeLayout"),
  },
  {
    table: "aiProdAccessRequests",
    cleanup: patchAiProdAccessRequestsBatch,
  },
  {
    table: "agentThreadContext",
    cleanup: deleteAgentThreadContextsBatch,
  },
  {
    table: "repositoryRefreshRequests",
    cleanup: deleteRepositoryRefreshRequestsBatch,
  },
  {
    table: "appProvisioningEvents",
    cleanup: deleteAppProvisioningEventsBatch,
  },
  {
    table: "appProvisioningRuns",
    cleanup: deleteAppProvisioningRunsBatch,
  },
] satisfies ReadonlyArray<{
  table: VaultLocalCleanupTable;
  cleanup: VaultLocalCleanupHandler;
}>;

const vaultLocalCleanupRegistryByStep = {
  cleanup_editor_state: ["fileStaging", "collaborativeUpdates", "blobs"],
  cleanup_source_caches: [
    "vaultBranchFilters",
    "vaultResourceLinksState",
    "folderExpansionState",
    "vaultRemoteBranches",
    "vaultBranchTrees",
    "repositoryRefreshRequests",
  ],
  cleanup_runtime_state: [
    "vaultDomains",
    "vaultWorkerDeploymentDependencies",
    "vaultConvexDeployments",
    "vaultConvexSchemaSnapshots",
    "vaultConvexSchemaGraphLayouts",
    "vaultCloudflareWorkers",
    "vaultInfrastructureTargets",
    "vaultInfrastructureOwnership",
    "vaultApps",
    "codespaces",
    "agentGraphNodeLayout",
  ],
  cleanup_access_state: ["aiProdAccessRequests"],
  detach_agent_context: ["agentThreadContext"],
  cleanup_provisioning_history: ["appProvisioningEvents", "appProvisioningRuns"],
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
