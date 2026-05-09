import { v, type Infer } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const { id, literal, number, object, union } = v;

const vaultLocalCleanupTable = union(
  literal("vaultBranchFilters"),
  literal("fileStaging"),
  literal("collaborativeUpdates"),
  literal("blobs"),
  literal("folderExpansionState"),
  literal("vaultRemoteBranches"),
  literal("vaultBranchTrees"),
  literal("vaultDomains"),
  literal("vaultInfrastructure"),
  literal("vaultInfrastructureOwnership"),
  literal("codespaces"),
  literal("agentGraphNodeLayout"),
  literal("aiProdAccessRequests"),
  literal("agentThreadContext"),
  literal("appProvisioningEvents"),
  literal("appProvisioningRuns"),
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
export type VaultLocalCleanupBatchResult = Infer<
  typeof vaultLocalCleanupBatchResult
>;

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

async function deleteVaultBranchFiltersBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("vaultBranchFilters")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteFileStagingBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("fileStaging")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteCollaborativeUpdatesBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("collaborativeUpdates")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteBlobsBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("blobs")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    if (row.storageId) {
      await ctx.storage.delete(row.storageId);
    }
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteFolderExpansionStateBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("folderExpansionState")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteVaultRemoteBranchesBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("vaultRemoteBranches")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
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

async function deleteVaultDomainsBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("vaultDomains")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteVaultInfrastructureBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("vaultInfrastructure")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteVaultInfrastructureOwnershipBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("vaultInfrastructureOwnership")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteCodespacesBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("codespaces")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteAgentGraphNodeLayoutBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("agentGraphNodeLayout")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
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
      status:
        row.status === "proposed" || row.status === "approved"
          ? "expired"
          : row.status,
      error:
        row.status === "proposed" || row.status === "approved"
          ? "Vault was deleted before production access was used."
          : row.error,
    });
  }
  return rows.length;
}

async function deleteAgentThreadContextBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("agentThreadContext")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
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

const vaultLocalCleanupRegistry = [
  {
    table: "vaultBranchFilters",
    cleanup: deleteVaultBranchFiltersBatch,
  },
  {
    table: "fileStaging",
    cleanup: deleteFileStagingBatch,
  },
  {
    table: "collaborativeUpdates",
    cleanup: deleteCollaborativeUpdatesBatch,
  },
  {
    table: "blobs",
    cleanup: deleteBlobsBatch,
  },
  {
    table: "folderExpansionState",
    cleanup: deleteFolderExpansionStateBatch,
  },
  {
    table: "vaultRemoteBranches",
    cleanup: deleteVaultRemoteBranchesBatch,
  },
  {
    table: "vaultBranchTrees",
    cleanup: deleteVaultBranchTreesBatch,
  },
  {
    table: "vaultDomains",
    cleanup: deleteVaultDomainsBatch,
  },
  {
    table: "vaultInfrastructure",
    cleanup: deleteVaultInfrastructureBatch,
  },
  {
    table: "vaultInfrastructureOwnership",
    cleanup: deleteVaultInfrastructureOwnershipBatch,
  },
  {
    table: "codespaces",
    cleanup: deleteCodespacesBatch,
  },
  {
    table: "agentGraphNodeLayout",
    cleanup: deleteAgentGraphNodeLayoutBatch,
  },
  {
    table: "aiProdAccessRequests",
    cleanup: patchAiProdAccessRequestsBatch,
  },
  {
    table: "agentThreadContext",
    cleanup: deleteAgentThreadContextBatch,
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
