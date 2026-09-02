import type { GenericMutationCtx } from "convex/server";

import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { requireFrozenRepositoryMigrationWrite } from "./maintenance";
import type { RepositoryMigrationTargetTable } from "./manifest";
import { repositoryMigrations } from "./migrations";

type MigrationMutationCtx = GenericMutationCtx<DataModel>;

function defineTargetMappingVerification<Target extends RepositoryMigrationTargetTable>({
  target,
  findMapping,
}: {
  target: Target;
  findMapping: (
    ctx: MigrationMutationCtx,
    targetId: Id<Target>,
  ) => Promise<Doc<"repositoryMigrationIdMaps"> | null>;
}) {
  return repositoryMigrations.define({
    table: target,
    migrateOne: async (ctx, targetDocument) => {
      await requireFrozenRepositoryMigrationWrite(ctx);
      const mapping = await findMapping(ctx, targetDocument._id);
      if (mapping?.kind !== "copied_document" || mapping.targetKind !== target) {
        throw new Error(`Target ${target}:${targetDocument._id} has no copied source mapping.`);
      }
    },
  });
}

export const verifyRepositoryTargets = defineTargetMappingVerification({
  target: "repositories",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "repositories").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryCloudflareWorkerTargets = defineTargetMappingVerification({
  target: "repositoryCloudflareWorkers",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "repositoryCloudflareWorkers").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryConvexProjectTargets = defineTargetMappingVerification({
  target: "repositoryConvexProjects",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "repositoryConvexProjects").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryBranchTreeTargets = defineTargetMappingVerification({
  target: "observations_repository_branchTrees",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "observations_repository_branchTrees").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryPullRequestFilterTargets = defineTargetMappingVerification({
  target: "ui_repositoryPullRequests_filters",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "ui_repositoryPullRequests_filters").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryResourceLinkSettingTargets = defineTargetMappingVerification({
  target: "ui_repositoryResourceLinks_settings",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "ui_repositoryResourceLinks_settings").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryFolderTargets = defineTargetMappingVerification({
  target: "ui_repositoryTree_folders",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "ui_repositoryTree_folders").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryFolderAssignmentTargets = defineTargetMappingVerification({
  target: "ui_repositoryTree_folderAssignments",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "ui_repositoryTree_folderAssignments").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryOrganizationTreeSettingTargets = defineTargetMappingVerification({
  target: "ui_repositoryTree_organizationSettings",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "ui_repositoryTree_organizationSettings").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryConvexSchemaSnapshotTargets = defineTargetMappingVerification({
  target: "observations_repositoryConvexSchema_snapshots",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query
          .eq("targetKind", "observations_repositoryConvexSchema_snapshots")
          .eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryConvexSchemaLayoutTargets = defineTargetMappingVerification({
  target: "ui_repositoryConvexSchemaGraph_nodeLayouts",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query
          .eq("targetKind", "ui_repositoryConvexSchemaGraph_nodeLayouts")
          .eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryDeletionRunTargets = defineTargetMappingVerification({
  target: "workflow_repositoryDeletion_runs",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "workflow_repositoryDeletion_runs").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryDeletionEventTargets = defineTargetMappingVerification({
  target: "workflow_repositoryDeletion_events",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "workflow_repositoryDeletion_events").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryProvisioningPlanTargets = defineTargetMappingVerification({
  target: "workflow_repositoryProvisioning_plans",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "workflow_repositoryProvisioning_plans").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryProvisioningWriteLockTargets = defineTargetMappingVerification({
  target: "workflow_repositoryProvisioning_writeLocks",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query
          .eq("targetKind", "workflow_repositoryProvisioning_writeLocks")
          .eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryProvisioningRunTargets = defineTargetMappingVerification({
  target: "workflow_repositoryProvisioning_runs",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "workflow_repositoryProvisioning_runs").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryProvisioningEventTargets = defineTargetMappingVerification({
  target: "workflow_repositoryProvisioning_events",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "workflow_repositoryProvisioning_events").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryStagedFileTargets = defineTargetMappingVerification({
  target: "repositoryStagedFiles",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "repositoryStagedFiles").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryFileBlobTargets = defineTargetMappingVerification({
  target: "observations_repositoryFiles_blobs",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "observations_repositoryFiles_blobs").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryFileTreeFolderExpansionTargets = defineTargetMappingVerification({
  target: "ui_repositoryFileTree_folderExpansions",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "ui_repositoryFileTree_folderExpansions").eq("targetId", targetId),
      )
      .unique(),
});

export const verifyRepositoryStagedFileUpdateTargets = defineTargetMappingVerification({
  target: "repositoryStagedFileUpdates",
  findMapping: async (ctx, targetId) =>
    await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_target", (query) =>
        query.eq("targetKind", "repositoryStagedFileUpdates").eq("targetId", targetId),
      )
      .unique(),
});
