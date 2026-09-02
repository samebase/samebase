import { type Infer, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../_generated/server";
import {
  repositoryMigrationTablePairs,
  type RepositoryMigrationSourceTable,
  type RepositoryMigrationTargetTable,
} from "./manifest";

const { boolean, literal, number, object, string, union } = v;

export const REPOSITORY_MIGRATION_INVENTORY_BATCH_SIZE = 25;

const vRepositoryMigrationSourceTable = union(
  literal("vaults"),
  literal("vaultCloudflareWorkers"),
  literal("vaultConvexProjects"),
  literal("observations_vaultRepository_branchTrees"),
  literal("ui_vaultPullRequests_filters"),
  literal("ui_vaultResourceLinks_settings"),
  literal("ui_vaultFolders"),
  literal("ui_vaultFolderAssignments"),
  literal("ui_vaultOrganizationTree_settings"),
  literal("observations_vaultConvexSchema_snapshots"),
  literal("ui_vaultConvexSchemaGraph_nodeLayouts"),
  literal("workflow_vaultDeletion_runs"),
  literal("workflow_vaultDeletion_events"),
  literal("workflow_vaultProvisioning_plans"),
  literal("workflow_vaultProvisioning_writeLocks"),
  literal("workflow_vaultProvisioning_runs"),
  literal("workflow_vaultProvisioning_events"),
  literal("vaultStagedFiles"),
  literal("observations_vaultFiles_blobs"),
  literal("ui_vaultFileTree_folderExpansions"),
  literal("vaultStagedFileUpdates"),
);

const vRepositoryMigrationTargetTable = union(
  literal("repositories"),
  literal("repositoryCloudflareWorkers"),
  literal("repositoryConvexProjects"),
  literal("observations_repository_branchTrees"),
  literal("ui_repositoryPullRequests_filters"),
  literal("ui_repositoryResourceLinks_settings"),
  literal("ui_repositoryTree_folders"),
  literal("ui_repositoryTree_folderAssignments"),
  literal("ui_repositoryTree_organizationSettings"),
  literal("observations_repositoryConvexSchema_snapshots"),
  literal("ui_repositoryConvexSchemaGraph_nodeLayouts"),
  literal("workflow_repositoryDeletion_runs"),
  literal("workflow_repositoryDeletion_events"),
  literal("workflow_repositoryProvisioning_plans"),
  literal("workflow_repositoryProvisioning_writeLocks"),
  literal("workflow_repositoryProvisioning_runs"),
  literal("workflow_repositoryProvisioning_events"),
  literal("repositoryStagedFiles"),
  literal("observations_repositoryFiles_blobs"),
  literal("ui_repositoryFileTree_folderExpansions"),
  literal("repositoryStagedFileUpdates"),
);

const vRepositoryMigrationInventoryResult = object({
  sourceTable: vRepositoryMigrationSourceTable,
  targetTable: vRepositoryMigrationTargetTable,
  continueCursor: string(),
  isDone: boolean(),
  sourceRows: number(),
  storedIdEdges: number(),
  missingReferences: number(),
  validMissingRepositoryRoots: number(),
  storageReferences: number(),
  missingStorageReferences: number(),
});

export type RepositoryMigrationInventoryResult = Infer<typeof vRepositoryMigrationInventoryResult>;

type InventoryCounts = Omit<
  RepositoryMigrationInventoryResult,
  "continueCursor" | "isDone" | "sourceRows" | "sourceTable" | "targetTable"
>;

type SourcePage<Row> = {
  page: Row[];
  continueCursor: string;
  isDone: boolean;
};

function emptyInventoryCounts(): InventoryCounts {
  return {
    storedIdEdges: 0,
    missingReferences: 0,
    validMissingRepositoryRoots: 0,
    storageReferences: 0,
    missingStorageReferences: 0,
  };
}

async function loadStoredReference<TableName extends RepositoryMigrationSourceTable>(
  ctx: QueryCtx,
  counts: InventoryCounts,
  id: Id<TableName>,
): Promise<Doc<TableName> | null> {
  counts.storedIdEdges += 1;
  return await ctx.db.get(id);
}

async function recordStoredReference<TableName extends RepositoryMigrationSourceTable>(
  ctx: QueryCtx,
  counts: InventoryCounts,
  id: Id<TableName>,
): Promise<void> {
  if ((await loadStoredReference(ctx, counts, id)) === null) {
    counts.missingReferences += 1;
  }
}

async function recordRepositoryRootReference(
  ctx: QueryCtx,
  counts: InventoryCounts,
  vaultId: Id<"vaults">,
  validRetainedSucceededDeletionHistory: boolean,
): Promise<void> {
  if ((await loadStoredReference(ctx, counts, vaultId)) !== null) {
    return;
  }
  if (validRetainedSucceededDeletionHistory) {
    counts.validMissingRepositoryRoots += 1;
    return;
  }
  throw new Error("A repository-domain row has an invalid missing vault root.");
}

async function hasSucceededDeletionHistory(ctx: QueryCtx, vaultId: Id<"vaults">): Promise<boolean> {
  return (
    (await ctx.db
      .query("workflow_vaultDeletion_runs")
      .withIndex("by_vault_and_state_and_updated_at", (indexQuery) =>
        indexQuery.eq("vaultId", vaultId).eq("state", "succeeded"),
      )
      .first()) !== null
  );
}

async function recordStorageReference(
  ctx: QueryCtx,
  counts: InventoryCounts,
  storageId: Id<"_storage">,
): Promise<void> {
  counts.storageReferences += 1;
  if ((await ctx.db.system.get("_storage", storageId)) === null) {
    counts.missingStorageReferences += 1;
  }
}

async function recordRepositoryRootRows(
  ctx: QueryCtx,
  counts: InventoryCounts,
  rows: readonly { vaultId: Id<"vaults"> }[],
): Promise<void> {
  for (const row of rows) {
    await recordRepositoryRootReference(ctx, counts, row.vaultId, false);
  }
}

async function paginateSource<TableName extends RepositoryMigrationSourceTable>(
  ctx: QueryCtx,
  sourceTable: TableName,
  cursor: string | null,
): Promise<SourcePage<Doc<TableName>>> {
  return await ctx.db.query(sourceTable).order("asc").paginate({
    cursor,
    numItems: REPOSITORY_MIGRATION_INVENTORY_BATCH_SIZE,
  });
}

async function inventoryTable<TableName extends RepositoryMigrationSourceTable>(
  ctx: QueryCtx,
  sourceTable: TableName,
  targetTable: RepositoryMigrationTargetTable,
  cursor: string | null,
  inspect: (rows: Doc<TableName>[], counts: InventoryCounts) => Promise<void>,
): Promise<RepositoryMigrationInventoryResult> {
  const page = await paginateSource(ctx, sourceTable, cursor);
  const counts = emptyInventoryCounts();
  await inspect(page.page, counts);
  return {
    sourceTable,
    targetTable,
    continueCursor: page.continueCursor,
    isDone: page.isDone,
    sourceRows: page.page.length,
    ...counts,
  };
}

function targetTableForSource(
  sourceTable: RepositoryMigrationSourceTable,
): RepositoryMigrationTargetTable {
  const pair = repositoryMigrationTablePairs.find((candidate) => candidate.source === sourceTable);
  if (pair === undefined) {
    throw new Error(`Source table ${sourceTable} is not in the repository migration manifest.`);
  }
  return pair.target;
}

export const inventoryBatch = internalQuery({
  args: {
    sourceTable: vRepositoryMigrationSourceTable,
    cursor: union(string(), v.null()),
  },
  returns: vRepositoryMigrationInventoryResult,
  handler: async (ctx, args): Promise<RepositoryMigrationInventoryResult> => {
    const targetTable = targetTableForSource(args.sourceTable);
    switch (args.sourceTable) {
      case "vaults":
        return await inventoryTable(
          ctx,
          "vaults",
          targetTable,
          args.cursor,
          async (rows, counts) => {
            for (const row of rows) {
              if ("runId" in row) {
                await recordStoredReference(ctx, counts, row.runId);
              }
              if (row.deletion.state !== "not_deleting") {
                await recordStoredReference(ctx, counts, row.deletion.runId);
              }
            }
          },
        );
      case "vaultCloudflareWorkers":
        return await inventoryTable(
          ctx,
          "vaultCloudflareWorkers",
          targetTable,
          args.cursor,
          async (rows, counts) => recordRepositoryRootRows(ctx, counts, rows),
        );
      case "vaultConvexProjects":
        return await inventoryTable(
          ctx,
          "vaultConvexProjects",
          targetTable,
          args.cursor,
          async (rows, counts) => recordRepositoryRootRows(ctx, counts, rows),
        );
      case "observations_vaultRepository_branchTrees":
        return await inventoryTable(
          ctx,
          "observations_vaultRepository_branchTrees",
          targetTable,
          args.cursor,
          async (rows, counts) => recordRepositoryRootRows(ctx, counts, rows),
        );
      case "ui_vaultPullRequests_filters":
        return await inventoryTable(
          ctx,
          "ui_vaultPullRequests_filters",
          targetTable,
          args.cursor,
          async (rows, counts) => recordRepositoryRootRows(ctx, counts, rows),
        );
      case "ui_vaultResourceLinks_settings":
        return await inventoryTable(
          ctx,
          "ui_vaultResourceLinks_settings",
          targetTable,
          args.cursor,
          async (rows, counts) => recordRepositoryRootRows(ctx, counts, rows),
        );
      case "ui_vaultFolders":
        return await inventoryTable(
          ctx,
          "ui_vaultFolders",
          targetTable,
          args.cursor,
          async () => {},
        );
      case "ui_vaultFolderAssignments":
        return await inventoryTable(
          ctx,
          "ui_vaultFolderAssignments",
          targetTable,
          args.cursor,
          async (rows, counts) => {
            for (const row of rows) {
              await recordRepositoryRootReference(ctx, counts, row.vaultId, false);
              await recordStoredReference(ctx, counts, row.folderId);
            }
          },
        );
      case "ui_vaultOrganizationTree_settings":
        return await inventoryTable(
          ctx,
          "ui_vaultOrganizationTree_settings",
          targetTable,
          args.cursor,
          async () => {},
        );
      case "observations_vaultConvexSchema_snapshots":
        return await inventoryTable(
          ctx,
          "observations_vaultConvexSchema_snapshots",
          targetTable,
          args.cursor,
          async (rows, counts) => {
            for (const row of rows) {
              await recordRepositoryRootReference(ctx, counts, row.vaultId, false);
              await recordStoredReference(ctx, counts, row.convexProjectId);
            }
          },
        );
      case "ui_vaultConvexSchemaGraph_nodeLayouts":
        return await inventoryTable(
          ctx,
          "ui_vaultConvexSchemaGraph_nodeLayouts",
          targetTable,
          args.cursor,
          async (rows, counts) => {
            for (const row of rows) {
              await recordRepositoryRootReference(ctx, counts, row.vaultId, false);
              await recordStoredReference(ctx, counts, row.convexProjectId);
            }
          },
        );
      case "workflow_vaultDeletion_runs":
        return await inventoryTable(
          ctx,
          "workflow_vaultDeletion_runs",
          targetTable,
          args.cursor,
          async (rows, counts) => {
            for (const row of rows) {
              await recordRepositoryRootReference(
                ctx,
                counts,
                row.vaultId,
                row.state === "succeeded" || (await hasSucceededDeletionHistory(ctx, row.vaultId)),
              );
              if (row.attempt.kind === "retry") {
                await recordStoredReference(ctx, counts, row.attempt.retryOf);
              }
            }
          },
        );
      case "workflow_vaultDeletion_events":
        return await inventoryTable(
          ctx,
          "workflow_vaultDeletion_events",
          targetTable,
          args.cursor,
          async (rows, counts) => {
            for (const row of rows) {
              const run = await loadStoredReference(ctx, counts, row.runId);
              if (run === null) {
                counts.missingReferences += 1;
              }
              await recordRepositoryRootReference(
                ctx,
                counts,
                row.vaultId,
                (run?.state === "succeeded" && run.vaultId === row.vaultId) ||
                  (await hasSucceededDeletionHistory(ctx, row.vaultId)),
              );
            }
          },
        );
      case "workflow_vaultProvisioning_plans":
        return await inventoryTable(
          ctx,
          "workflow_vaultProvisioning_plans",
          targetTable,
          args.cursor,
          async (rows, counts) => recordRepositoryRootRows(ctx, counts, rows),
        );
      case "workflow_vaultProvisioning_writeLocks":
        return await inventoryTable(
          ctx,
          "workflow_vaultProvisioning_writeLocks",
          targetTable,
          args.cursor,
          async (rows, counts) => {
            for (const row of rows) {
              await recordRepositoryRootReference(ctx, counts, row.vaultId, false);
              if (row.owner.kind === "managed_run") {
                await recordStoredReference(ctx, counts, row.owner.runId);
              }
            }
          },
        );
      case "workflow_vaultProvisioning_runs":
        return await inventoryTable(
          ctx,
          "workflow_vaultProvisioning_runs",
          targetTable,
          args.cursor,
          async (rows, counts) => recordRepositoryRootRows(ctx, counts, rows),
        );
      case "workflow_vaultProvisioning_events":
        return await inventoryTable(
          ctx,
          "workflow_vaultProvisioning_events",
          targetTable,
          args.cursor,
          async (rows, counts) => {
            for (const row of rows) {
              await recordRepositoryRootReference(ctx, counts, row.vaultId, false);
              await recordStoredReference(ctx, counts, row.runId);
            }
          },
        );
      case "vaultStagedFiles":
        return await inventoryTable(
          ctx,
          "vaultStagedFiles",
          targetTable,
          args.cursor,
          async (rows, counts) => {
            for (const row of rows) {
              await recordRepositoryRootReference(ctx, counts, row.vaultId, false);
              if (row.storageId !== undefined) {
                await recordStorageReference(ctx, counts, row.storageId);
              }
            }
          },
        );
      case "observations_vaultFiles_blobs":
        return await inventoryTable(
          ctx,
          "observations_vaultFiles_blobs",
          targetTable,
          args.cursor,
          async (rows, counts) => {
            for (const row of rows) {
              await recordRepositoryRootReference(ctx, counts, row.vaultId, false);
              if (row.storageId !== undefined) {
                await recordStorageReference(ctx, counts, row.storageId);
              }
            }
          },
        );
      case "ui_vaultFileTree_folderExpansions":
        return await inventoryTable(
          ctx,
          "ui_vaultFileTree_folderExpansions",
          targetTable,
          args.cursor,
          async (rows, counts) => recordRepositoryRootRows(ctx, counts, rows),
        );
      case "vaultStagedFileUpdates":
        return await inventoryTable(
          ctx,
          "vaultStagedFileUpdates",
          targetTable,
          args.cursor,
          async (rows, counts) => recordRepositoryRootRows(ctx, counts, rows),
        );
      default:
        args.sourceTable satisfies never;
        throw new Error("Unsupported repository migration source table.");
    }
  },
});
