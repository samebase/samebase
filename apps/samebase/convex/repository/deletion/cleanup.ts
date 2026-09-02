import { v, type Infer } from "convex/values";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireRepositoryAuthorityContinuation } from "../../repositoryMigration/maintenance";
import { requireActiveRepositoryDeletionRun } from "../../repositoryWorkflowAuthority";
import { isRuntimeRepository, type RuntimeRepository } from "../../organizationAccess";
import { vRepositoryDeletionCleanupStep, type RepositoryDeletionCleanupStep } from "./model";
import { readRepositoryDeletionState } from "./state";

const { id, literal, number, object, union } = v;

const deleteOnlyByRepositoryCleanupTables = union(
  literal("ui_repositoryPullRequests_filters"),
  literal("ui_repositoryResourceLinks_settings"),
  literal("repositoryStagedFileUpdates"),
  literal("ui_repositoryFileTree_folderExpansions"),
  literal("repositoryConvexProjects"),
  literal("observations_repositoryConvexSchema_snapshots"),
  literal("ui_repositoryConvexSchemaGraph_nodeLayouts"),
  literal("repositoryCloudflareWorkers"),
  literal("workflow_repositoryProvisioning_plans"),
  literal("workflow_repositoryProvisioning_writeLocks"),
);
type DeleteOnlyByRepositoryCleanupTable = Infer<typeof deleteOnlyByRepositoryCleanupTables>;

const repositoryLocalCleanupTable = union(
  deleteOnlyByRepositoryCleanupTables,
  literal("ui_repositoryTree_folderAssignments"),
  literal("repositoryStagedFiles"),
  literal("observations_repositoryFiles_blobs"),
  literal("observations_repository_branchTrees"),
  literal("workflow_repositoryProvisioning_events"),
  literal("workflow_repositoryProvisioning_runs"),
);
type RepositoryLocalCleanupTable = Infer<typeof repositoryLocalCleanupTable>;

const repositoryLocalCleanupStepBatchResult = union(
  object({
    state: literal("needs_more"),
    table: repositoryLocalCleanupTable,
    rowsChanged: number(),
  }),
  object({
    state: literal("done"),
  }),
);
export type RepositoryLocalCleanupStepBatchResult = Infer<
  typeof repositoryLocalCleanupStepBatchResult
>;

export const REPOSITORY_LOCAL_CLEANUP_BATCH_SIZE = 50;

type RepositoryLocalCleanupCtx = Pick<MutationCtx, "db" | "storage">;
type RepositoryLocalCleanupArgs = {
  repositoryId: Id<"repositories">;
  runId: Id<"workflow_repositoryDeletion_runs">;
};
type RepositoryLocalCleanupHandler = (
  ctx: RepositoryLocalCleanupCtx,
  args: RepositoryLocalCleanupArgs,
) => Promise<number>;

async function loadRepositoryForDeletionActor(
  ctx: RepositoryLocalCleanupCtx,
  args: RepositoryLocalCleanupArgs,
): Promise<RuntimeRepository | null> {
  const run = await requireActiveRepositoryDeletionRun(ctx.db, { runId: args.runId });
  if (run.repositoryId !== args.repositoryId) {
    throw new Error("Repository deletion run does not match its repository.");
  }
  const repository = await ctx.db.get(args.repositoryId);
  if (!repository || !isRuntimeRepository(repository)) {
    return null;
  }
  if (repository.organizationId !== run.organizationId) {
    throw new Error("Repository deletion run does not match its repository.");
  }
  const deletion = readRepositoryDeletionState(repository);
  if (deletion.state !== "deleting" || deletion.runId !== run._id) {
    throw new Error("Repository deletion gate does not match run.");
  }
  await requireRepositoryAuthorityContinuation(ctx);
  return repository;
}

function deleteByRepositoryBatch(
  tableName: DeleteOnlyByRepositoryCleanupTable,
): RepositoryLocalCleanupHandler {
  return async function deleteByRepository(
    ctx: RepositoryLocalCleanupCtx,
    args: RepositoryLocalCleanupArgs,
  ): Promise<number> {
    const rows = await ctx.db
      .query(tableName)
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .take(REPOSITORY_LOCAL_CLEANUP_BATCH_SIZE);

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }

    return rows.length;
  };
}

async function deleteFolderAssignmentsByRepositoryBatch(
  ctx: RepositoryLocalCleanupCtx,
  args: RepositoryLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("ui_repositoryTree_folderAssignments")
    .withIndex("by_repositoryId", (q) => q.eq("repositoryId", args.repositoryId))
    .take(REPOSITORY_LOCAL_CLEANUP_BATCH_SIZE);

  for (const row of rows) {
    await ctx.db.delete(row._id);
  }

  return rows.length;
}

function deleteStorageBackedByRepositoryBatch(
  tableName: "repositoryStagedFiles" | "observations_repositoryFiles_blobs",
): RepositoryLocalCleanupHandler {
  return async function deleteStorageBackedByRepository(ctx, args) {
    const rows = await ctx.db
      .query(tableName)
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .take(REPOSITORY_LOCAL_CLEANUP_BATCH_SIZE);
    const storageIds = new Set<Id<"_storage">>();

    for (const row of rows) {
      if (row.storageId) {
        storageIds.add(row.storageId);
      }

      await ctx.db.delete(row._id);
    }

    for (const storageId of storageIds) {
      const survivingStaging = await ctx.db
        .query("repositoryStagedFiles")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .first();

      if (survivingStaging) {
        continue;
      }

      const survivingBlob = await ctx.db
        .query("observations_repositoryFiles_blobs")
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

async function deleteRepositoryBranchTreesBatch(
  ctx: RepositoryLocalCleanupCtx,
  args: RepositoryLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("observations_repository_branchTrees")
    .withIndex("by_repository_and_branch", (q) => q.eq("repositoryId", args.repositoryId))
    .take(REPOSITORY_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteRepositoryProvisioningEventsBatch(
  ctx: RepositoryLocalCleanupCtx,
  args: RepositoryLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("workflow_repositoryProvisioning_events")
    .withIndex("by_repository_and_created_at_and_source_order", (q) =>
      q.eq("repositoryId", args.repositoryId),
    )
    .take(REPOSITORY_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteRepositoryProvisioningRunsBatch(
  ctx: RepositoryLocalCleanupCtx,
  args: RepositoryLocalCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("workflow_repositoryProvisioning_runs")
    .withIndex("by_repository_and_updated_at", (q) => q.eq("repositoryId", args.repositoryId))
    .take(REPOSITORY_LOCAL_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

const repositoryLocalCleanupRegistry = [
  {
    table: "ui_repositoryPullRequests_filters",
    cleanup: deleteByRepositoryBatch("ui_repositoryPullRequests_filters"),
  },
  {
    table: "ui_repositoryResourceLinks_settings",
    cleanup: deleteByRepositoryBatch("ui_repositoryResourceLinks_settings"),
  },
  {
    table: "ui_repositoryTree_folderAssignments",
    cleanup: deleteFolderAssignmentsByRepositoryBatch,
  },
  {
    table: "repositoryStagedFiles",
    cleanup: deleteStorageBackedByRepositoryBatch("repositoryStagedFiles"),
  },
  {
    table: "repositoryStagedFileUpdates",
    cleanup: deleteByRepositoryBatch("repositoryStagedFileUpdates"),
  },
  {
    table: "observations_repositoryFiles_blobs",
    cleanup: deleteStorageBackedByRepositoryBatch("observations_repositoryFiles_blobs"),
  },
  {
    table: "ui_repositoryFileTree_folderExpansions",
    cleanup: deleteByRepositoryBatch("ui_repositoryFileTree_folderExpansions"),
  },
  {
    table: "observations_repository_branchTrees",
    cleanup: deleteRepositoryBranchTreesBatch,
  },
  {
    table: "repositoryConvexProjects",
    cleanup: deleteByRepositoryBatch("repositoryConvexProjects"),
  },
  {
    table: "observations_repositoryConvexSchema_snapshots",
    cleanup: deleteByRepositoryBatch("observations_repositoryConvexSchema_snapshots"),
  },
  {
    table: "ui_repositoryConvexSchemaGraph_nodeLayouts",
    cleanup: deleteByRepositoryBatch("ui_repositoryConvexSchemaGraph_nodeLayouts"),
  },
  {
    table: "repositoryCloudflareWorkers",
    cleanup: deleteByRepositoryBatch("repositoryCloudflareWorkers"),
  },
  {
    table: "workflow_repositoryProvisioning_plans",
    cleanup: deleteByRepositoryBatch("workflow_repositoryProvisioning_plans"),
  },
  {
    table: "workflow_repositoryProvisioning_writeLocks",
    cleanup: deleteByRepositoryBatch("workflow_repositoryProvisioning_writeLocks"),
  },
  {
    table: "workflow_repositoryProvisioning_events",
    cleanup: deleteRepositoryProvisioningEventsBatch,
  },
  {
    table: "workflow_repositoryProvisioning_runs",
    cleanup: deleteRepositoryProvisioningRunsBatch,
  },
] satisfies ReadonlyArray<{
  table: RepositoryLocalCleanupTable;
  cleanup: RepositoryLocalCleanupHandler;
}>;

const repositoryLocalCleanupRegistryByStep = {
  cleanup_editor_state: [
    "repositoryStagedFiles",
    "repositoryStagedFileUpdates",
    "observations_repositoryFiles_blobs",
  ],
  cleanup_source_caches: [
    "ui_repositoryPullRequests_filters",
    "ui_repositoryResourceLinks_settings",
    "ui_repositoryTree_folderAssignments",
    "ui_repositoryFileTree_folderExpansions",
    "observations_repository_branchTrees",
  ],
  cleanup_runtime_state: [
    "repositoryConvexProjects",
    "observations_repositoryConvexSchema_snapshots",
    "ui_repositoryConvexSchemaGraph_nodeLayouts",
    "repositoryCloudflareWorkers",
    "workflow_repositoryProvisioning_plans",
    "workflow_repositoryProvisioning_writeLocks",
  ],
  cleanup_provisioning_history: [
    "workflow_repositoryProvisioning_events",
    "workflow_repositoryProvisioning_runs",
  ],
} satisfies Record<RepositoryDeletionCleanupStep, readonly RepositoryLocalCleanupTable[]>;

export const cleanupRepositoryLocalDataStepBatch = internalMutation({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryDeletion_runs"),
    step: vRepositoryDeletionCleanupStep,
  },
  returns: repositoryLocalCleanupStepBatchResult,
  handler: async (ctx, args): Promise<RepositoryLocalCleanupStepBatchResult> => {
    const repository = await loadRepositoryForDeletionActor(ctx, args);

    if (!repository) {
      return { state: "done" };
    }

    const tables: readonly RepositoryLocalCleanupTable[] =
      repositoryLocalCleanupRegistryByStep[args.step];

    for (const entry of repositoryLocalCleanupRegistry) {
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

export const deleteRepositoryRow = internalMutation({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryDeletion_runs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const repository = await loadRepositoryForDeletionActor(ctx, args);
    if (!repository) {
      return null;
    }

    await ctx.db.delete(repository._id);
    return null;
  },
});
