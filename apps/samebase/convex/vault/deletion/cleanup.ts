import { v, type Infer } from "convex/values";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { vVaultDeletionCleanupStep, type VaultDeletionCleanupStep } from "./model";

const { id, literal, number, object, union } = v;

const deleteOnlyByVaultCleanupTables = union(
  literal("vaultBranchFilters"),
  literal("vaultResourceLinksState"),
  literal("collaborativeUpdates"),
  literal("folderExpansionState"),
  literal("vaultRemoteBranches"),
  literal("vaultDomains"),
  literal("vaultApps"),
  literal("vaultConvexDeployments"),
  literal("vaultConvexSchemaSnapshots"),
  literal("vaultConvexSchemaGraphLayouts"),
  literal("vaultCloudflareWorkers"),
  literal("vaultInfrastructureTargets"),
  literal("vaultInfrastructureOwnership"),
  literal("codespaces"),
  literal("agentGraphNodeLayout"),
  literal("agentThreadContext"),
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

const retainedCodespacesCleanupError =
  "Vault deletion is blocked because retained Codespaces state still requires cleanup. Contact support before deleting this vault.";
const retainedCodespaceStates = [
  "creating",
  "starting",
  "running",
  "stopping",
  "stopped",
  "deleting",
  "failed",
] as const;

export async function assertVaultCodespacesSafeForLocalCleanup(
  ctx: Pick<MutationCtx, "db">,
  vault: Doc<"vaults">,
): Promise<void> {
  for (const state of retainedCodespaceStates) {
    const codespace = await ctx.db
      .query("codespaces")
      .withIndex("by_user_and_vault_and_state", (q) =>
        q.eq("userId", vault.userId).eq("vaultId", vault._id).eq("state", state),
      )
      .first();
    if (codespace) {
      throw new Error(retainedCodespacesCleanupError);
    }
  }

  if (vault.activeCodespaceId === undefined) {
    return;
  }

  const activeCodespace = await ctx.db.get(vault.activeCodespaceId);
  if (
    !activeCodespace ||
    activeCodespace.vaultId !== vault._id ||
    activeCodespace.userId !== vault.userId ||
    activeCodespace.state !== "deleted"
  ) {
    throw new Error(retainedCodespacesCleanupError);
  }
}

async function deleteDeletedCodespacesBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const vault = await ctx.db.get(args.vaultId);
  if (!vault) {
    return 0;
  }
  if (vault.userId !== args.userId) {
    throw new Error("Vault not found");
  }

  await assertVaultCodespacesSafeForLocalCleanup(ctx, vault);
  const codespaces = await ctx.db
    .query("codespaces")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);

  if (vault.activeCodespaceId !== undefined) {
    await ctx.db.patch(vault._id, { activeCodespaceId: undefined });
  }
  for (const codespace of codespaces) {
    await ctx.db.delete(codespace._id);
  }

  return codespaces.length;
}

async function deleteFileStagingBatch(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("fileStaging")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE);
  const rowIdsInBatch = new Set(rows.map((row) => row._id));
  const storageIds = new Set<Id<"_storage">>();
  for (const row of rows) {
    if (row.storageId) {
      storageIds.add(row.storageId);
    }
  }

  for (const storageId of storageIds) {
    const cachedBlob = await ctx.db
      .query("blobs")
      .withIndex("by_vault_and_storageId", (q) =>
        q.eq("vaultId", args.vaultId).eq("storageId", storageId),
      )
      .first();
    if (cachedBlob) {
      continue;
    }

    const stagingReferences = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_storageId", (q) =>
        q.eq("vaultId", args.vaultId).eq("storageId", storageId),
      )
      .take(VAULT_LOCAL_CLEANUP_BATCH_SIZE + 1);
    if (
      stagingReferences.length <= VAULT_LOCAL_CLEANUP_BATCH_SIZE &&
      stagingReferences.every((row) => rowIdsInBatch.has(row._id))
    ) {
      await ctx.storage.delete(storageId);
    }
  }

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
    cleanup: deleteFileStagingBatch,
  },
  {
    table: "collaborativeUpdates",
    cleanup: deleteByVaultBatch("collaborativeUpdates"),
  },
  {
    table: "blobs",
    cleanup: deleteBlobsBatch,
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
    table: "vaultApps",
    cleanup: deleteByVaultBatch("vaultApps"),
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
    table: "codespaces",
    cleanup: deleteDeletedCodespacesBatch,
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
    cleanup: deleteByVaultBatch("agentThreadContext"),
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
  ],
  cleanup_runtime_state: [
    "vaultDomains",
    "vaultApps",
    "vaultConvexDeployments",
    "vaultConvexSchemaSnapshots",
    "vaultConvexSchemaGraphLayouts",
    "vaultCloudflareWorkers",
    "vaultInfrastructureTargets",
    "vaultInfrastructureOwnership",
    "codespaces",
    "agentGraphNodeLayout",
  ],
  cleanup_access_state: ["aiProdAccessRequests"],
  detach_agent_context: ["agentThreadContext"],
  cleanup_provisioning_history: ["appProvisioningEvents", "appProvisioningRuns"],
} satisfies Record<VaultDeletionCleanupStep, readonly VaultLocalCleanupTable[]>;

function cleanupEntriesForStep(step: VaultDeletionCleanupStep): ReadonlyArray<{
  table: VaultLocalCleanupTable;
  cleanup: VaultLocalCleanupHandler;
}> {
  const tables: readonly VaultLocalCleanupTable[] = vaultLocalCleanupRegistryByStep[step];
  return vaultLocalCleanupRegistry.filter((entry) => tables.some((table) => table === entry.table));
}

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

export async function cleanupVaultLocalDataStepBatchForUser(
  ctx: VaultLocalCleanupCtx,
  args: VaultLocalCleanupArgs & {
    step: VaultDeletionCleanupStep;
  },
): Promise<VaultLocalCleanupStepBatchResult> {
  const vault = await ctx.db.get(args.vaultId);
  if (!vault) {
    return { state: "done" };
  }
  if (vault.userId !== args.userId) {
    throw new Error("Vault not found");
  }

  for (const entry of cleanupEntriesForStep(args.step)) {
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
  handler: cleanupVaultLocalDataStepBatchForUser,
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
