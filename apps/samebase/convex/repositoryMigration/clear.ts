import type { GenericMutationCtx } from "convex/server";

import type { DataModel, Doc } from "../_generated/dataModel";
import { requireFrozenRepositoryMigrationWrite } from "./maintenance";
import { repositoryMigrations } from "./migrations";

type MigrationMutationCtx = GenericMutationCtx<DataModel>;

async function deleteMappedTarget(
  ctx: MigrationMutationCtx,
  targetId: Doc<"repositoryMigrationIdMaps">["targetId"],
): Promise<void> {
  if ((await ctx.db.get(targetId)) !== null) {
    await ctx.db.delete(targetId);
  }
}

async function clearMapping(
  ctx: MigrationMutationCtx,
  mapping: Doc<"repositoryMigrationIdMaps">,
): Promise<void> {
  await deleteMappedTarget(ctx, mapping.targetId);
  await ctx.db.delete(mapping._id);
}

export const clearRepositoryLeafTargets = repositoryMigrations.define({
  table: "repositoryMigrationIdMaps",
  migrateOne: async (ctx, mapping) => {
    await requireFrozenRepositoryMigrationWrite(ctx);
    switch (mapping.targetKind) {
      case "observations_repository_branchTrees":
      case "ui_repositoryPullRequests_filters":
      case "ui_repositoryResourceLinks_settings":
      case "ui_repositoryTree_folderAssignments":
      case "ui_repositoryTree_organizationSettings":
      case "observations_repositoryConvexSchema_snapshots":
      case "ui_repositoryConvexSchemaGraph_nodeLayouts":
      case "workflow_repositoryDeletion_events":
      case "workflow_repositoryProvisioning_plans":
      case "workflow_repositoryProvisioning_writeLocks":
      case "workflow_repositoryProvisioning_events":
      case "repositoryStagedFiles":
      case "observations_repositoryFiles_blobs":
      case "ui_repositoryFileTree_folderExpansions":
      case "repositoryStagedFileUpdates":
        await clearMapping(ctx, mapping);
        return;
      case "repositories":
      case "repositoryCloudflareWorkers":
      case "repositoryConvexProjects":
      case "ui_repositoryTree_folders":
      case "workflow_repositoryDeletion_runs":
      case "workflow_repositoryProvisioning_runs":
        return;
      default:
        mapping satisfies never;
        throw new Error("Unknown repository migration target kind.");
    }
  },
});

export const clearRepositoryRunTargets = repositoryMigrations.define({
  table: "repositoryMigrationIdMaps",
  migrateOne: async (ctx, mapping) => {
    await requireFrozenRepositoryMigrationWrite(ctx);
    switch (mapping.targetKind) {
      case "workflow_repositoryDeletion_runs":
      case "workflow_repositoryProvisioning_runs":
        await clearMapping(ctx, mapping);
        return;
      case "repositories":
      case "repositoryCloudflareWorkers":
      case "repositoryConvexProjects":
      case "observations_repository_branchTrees":
      case "ui_repositoryPullRequests_filters":
      case "ui_repositoryResourceLinks_settings":
      case "ui_repositoryTree_folders":
      case "ui_repositoryTree_folderAssignments":
      case "ui_repositoryTree_organizationSettings":
      case "observations_repositoryConvexSchema_snapshots":
      case "ui_repositoryConvexSchemaGraph_nodeLayouts":
      case "workflow_repositoryDeletion_events":
      case "workflow_repositoryProvisioning_plans":
      case "workflow_repositoryProvisioning_writeLocks":
      case "workflow_repositoryProvisioning_events":
      case "repositoryStagedFiles":
      case "observations_repositoryFiles_blobs":
      case "ui_repositoryFileTree_folderExpansions":
      case "repositoryStagedFileUpdates":
        return;
      default:
        mapping satisfies never;
        throw new Error("Unknown repository migration target kind.");
    }
  },
});

export const clearRepositoryFoundationTargets = repositoryMigrations.define({
  table: "repositoryMigrationIdMaps",
  migrateOne: async (ctx, mapping) => {
    await requireFrozenRepositoryMigrationWrite(ctx);
    switch (mapping.targetKind) {
      case "repositoryCloudflareWorkers":
      case "repositoryConvexProjects":
      case "ui_repositoryTree_folders":
        await clearMapping(ctx, mapping);
        return;
      case "repositories":
      case "observations_repository_branchTrees":
      case "ui_repositoryPullRequests_filters":
      case "ui_repositoryResourceLinks_settings":
      case "ui_repositoryTree_folderAssignments":
      case "ui_repositoryTree_organizationSettings":
      case "observations_repositoryConvexSchema_snapshots":
      case "ui_repositoryConvexSchemaGraph_nodeLayouts":
      case "workflow_repositoryDeletion_runs":
      case "workflow_repositoryDeletion_events":
      case "workflow_repositoryProvisioning_plans":
      case "workflow_repositoryProvisioning_writeLocks":
      case "workflow_repositoryProvisioning_runs":
      case "workflow_repositoryProvisioning_events":
      case "repositoryStagedFiles":
      case "observations_repositoryFiles_blobs":
      case "ui_repositoryFileTree_folderExpansions":
      case "repositoryStagedFileUpdates":
        return;
      default:
        mapping satisfies never;
        throw new Error("Unknown repository migration target kind.");
    }
  },
});

export const clearRepositoryRootTargets = repositoryMigrations.define({
  table: "repositoryMigrationIdMaps",
  migrateOne: async (ctx, mapping) => {
    await requireFrozenRepositoryMigrationWrite(ctx);
    if (mapping.targetKind === "repositories") {
      await clearMapping(ctx, mapping);
    }
  },
});
