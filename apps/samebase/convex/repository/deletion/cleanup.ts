import { v, type Infer } from "convex/values";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireActiveRepositoryDeletionRun } from "../../repositoryWorkflowAuthority";
import { vRepositoryDeletionCleanupStep, type RepositoryDeletionCleanupStep } from "./model";
import { components } from "../../_generated/api";
import { deleteReleasedStagingStorage } from "../../gitOperations";

const { id, literal, number, object, union } = v;

const deleteOnlyByRepositoryCleanupTables = union(
  literal("ui_repositoryPullRequests_filters"),
  literal("ui_repositoryResourceLinks_settings"),
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
  literal("gitWorkspace.stagedFiles"),
  literal("gitWorkspace.fileUpdates"),
  literal("gitWorkspace.fileBlobs"),
  literal("gitWorkspace.branchTrees"),
  literal("gitWorkspace.repositorySyncState"),
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

type RepositoryLocalCleanupCtx = Pick<MutationCtx, "db" | "storage" | "runQuery" | "runMutation">;
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
): Promise<Doc<"repositories"> | null> {
  const run = await requireActiveRepositoryDeletionRun(ctx.db, { runId: args.runId });
  if (run.repositoryId !== args.repositoryId) {
    throw new Error("Repository deletion run does not match its repository.");
  }
  const repository = await ctx.db.get(args.repositoryId);
  if (!repository) {
    return null;
  }
  if (repository.organizationId !== run.organizationId) {
    throw new Error("Repository deletion run does not match its repository.");
  }
  const deletion = repository.deletion;
  if (deletion.state !== "deleting" || deletion.runId !== run._id) {
    throw new Error("Repository deletion gate does not match run.");
  }
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

async function deleteStorageBackedByRepositoryBatch(
  ctx: RepositoryLocalCleanupCtx,
  args: RepositoryLocalCleanupArgs,
): Promise<number> {
  const result = await ctx.runMutation(components.gitWorkspace.blobs.deleteRepositoryBatch, {
    repositoryId: args.repositoryId,
  });
  await deleteReleasedStagingStorage(ctx, result.releasedStorageIds);
  return result.rowsChanged;
}

function deleteWorkingCopyBatch(
  table: "stagedFiles" | "fileUpdates",
): RepositoryLocalCleanupHandler {
  return async (ctx, args) => {
    const result = await ctx.runMutation(components.gitWorkspace.staging.deleteRepositoryBatch, {
      repositoryId: args.repositoryId,
      table,
    });
    await deleteReleasedStagingStorage(ctx, result.releasedStorageIds);
    return result.rowsChanged;
  };
}

function deleteBranchStateBatch(
  table: "branchTrees" | "repositorySyncState",
): RepositoryLocalCleanupHandler {
  return async (ctx, args) =>
    await ctx.runMutation(components.gitWorkspace.branches.deleteRepositoryBatch, {
      repositoryId: args.repositoryId,
      table,
    });
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
    table: "gitWorkspace.stagedFiles",
    cleanup: deleteWorkingCopyBatch("stagedFiles"),
  },
  {
    table: "gitWorkspace.fileUpdates",
    cleanup: deleteWorkingCopyBatch("fileUpdates"),
  },
  {
    table: "gitWorkspace.fileBlobs",
    cleanup: deleteStorageBackedByRepositoryBatch,
  },
  {
    table: "ui_repositoryFileTree_folderExpansions",
    cleanup: deleteByRepositoryBatch("ui_repositoryFileTree_folderExpansions"),
  },
  {
    table: "gitWorkspace.branchTrees",
    cleanup: deleteBranchStateBatch("branchTrees"),
  },
  {
    table: "gitWorkspace.repositorySyncState",
    cleanup: deleteBranchStateBatch("repositorySyncState"),
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
    "gitWorkspace.stagedFiles",
    "gitWorkspace.fileUpdates",
    "gitWorkspace.fileBlobs",
  ],
  cleanup_source_caches: [
    "ui_repositoryPullRequests_filters",
    "ui_repositoryResourceLinks_settings",
    "ui_repositoryTree_folderAssignments",
    "ui_repositoryFileTree_folderExpansions",
    "gitWorkspace.branchTrees",
    "gitWorkspace.repositorySyncState",
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
