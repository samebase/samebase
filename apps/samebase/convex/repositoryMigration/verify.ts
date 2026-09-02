import type { GenericMutationCtx } from "convex/server";

import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { findRepositoryMigrationSourceMapping } from "./copyDocument";
import { requireFrozenRepositoryMigrationWrite } from "./maintenance";
import type { RepositoryMigrationSourceTable } from "./manifest";
import { repositoryMigrations } from "./migrations";

type MigrationMutationCtx = GenericMutationCtx<DataModel>;

function defineSourceMappingVerification<Source extends RepositoryMigrationSourceTable>({
  source,
  hasCopiedMapping,
}: {
  source: Source;
  hasCopiedMapping: (ctx: MigrationMutationCtx, sourceId: Id<Source>) => Promise<boolean>;
}) {
  return repositoryMigrations.define({
    table: source,
    migrateOne: async (ctx, sourceDocument) => {
      await requireFrozenRepositoryMigrationWrite(ctx);
      if (!(await hasCopiedMapping(ctx, sourceDocument._id))) {
        throw new Error(`Source ${source}:${sourceDocument._id} has no copied target mapping.`);
      }
    },
  });
}

async function hasCopiedMapping(
  ctx: MigrationMutationCtx,
  sourceKind: Doc<"repositoryMigrationIdMaps">["sourceKind"],
  sourceId: Doc<"repositoryMigrationIdMaps">["sourceId"],
): Promise<boolean> {
  const mapping = await findRepositoryMigrationSourceMapping(ctx, sourceKind, sourceId);
  return mapping?.kind === "copied_document" && mapping.sourceKind === sourceKind;
}

export const verifyVaultMappings = defineSourceMappingVerification({
  source: "vaults",
  hasCopiedMapping: async (ctx, sourceId) => await hasCopiedMapping(ctx, "vaults", sourceId),
});
export const verifyVaultCloudflareWorkerMappings = defineSourceMappingVerification({
  source: "vaultCloudflareWorkers",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "vaultCloudflareWorkers", sourceId),
});
export const verifyVaultConvexProjectMappings = defineSourceMappingVerification({
  source: "vaultConvexProjects",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "vaultConvexProjects", sourceId),
});
export const verifyVaultBranchTreeMappings = defineSourceMappingVerification({
  source: "observations_vaultRepository_branchTrees",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "observations_vaultRepository_branchTrees", sourceId),
});
export const verifyVaultPullRequestFilterMappings = defineSourceMappingVerification({
  source: "ui_vaultPullRequests_filters",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "ui_vaultPullRequests_filters", sourceId),
});
export const verifyVaultResourceLinkSettingMappings = defineSourceMappingVerification({
  source: "ui_vaultResourceLinks_settings",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "ui_vaultResourceLinks_settings", sourceId),
});
export const verifyVaultFolderMappings = defineSourceMappingVerification({
  source: "ui_vaultFolders",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "ui_vaultFolders", sourceId),
});
export const verifyVaultFolderAssignmentMappings = defineSourceMappingVerification({
  source: "ui_vaultFolderAssignments",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "ui_vaultFolderAssignments", sourceId),
});
export const verifyVaultOrganizationTreeSettingMappings = defineSourceMappingVerification({
  source: "ui_vaultOrganizationTree_settings",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "ui_vaultOrganizationTree_settings", sourceId),
});
export const verifyVaultConvexSchemaSnapshotMappings = defineSourceMappingVerification({
  source: "observations_vaultConvexSchema_snapshots",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "observations_vaultConvexSchema_snapshots", sourceId),
});
export const verifyVaultConvexSchemaLayoutMappings = defineSourceMappingVerification({
  source: "ui_vaultConvexSchemaGraph_nodeLayouts",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "ui_vaultConvexSchemaGraph_nodeLayouts", sourceId),
});
export const verifyVaultDeletionRunMappings = defineSourceMappingVerification({
  source: "workflow_vaultDeletion_runs",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "workflow_vaultDeletion_runs", sourceId),
});
export const verifyVaultDeletionEventMappings = defineSourceMappingVerification({
  source: "workflow_vaultDeletion_events",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "workflow_vaultDeletion_events", sourceId),
});
export const verifyVaultProvisioningPlanMappings = defineSourceMappingVerification({
  source: "workflow_vaultProvisioning_plans",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "workflow_vaultProvisioning_plans", sourceId),
});
export const verifyVaultProvisioningWriteLockMappings = defineSourceMappingVerification({
  source: "workflow_vaultProvisioning_writeLocks",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "workflow_vaultProvisioning_writeLocks", sourceId),
});
export const verifyVaultProvisioningRunMappings = defineSourceMappingVerification({
  source: "workflow_vaultProvisioning_runs",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "workflow_vaultProvisioning_runs", sourceId),
});
export const verifyVaultProvisioningEventMappings = defineSourceMappingVerification({
  source: "workflow_vaultProvisioning_events",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "workflow_vaultProvisioning_events", sourceId),
});
export const verifyVaultStagedFileMappings = defineSourceMappingVerification({
  source: "vaultStagedFiles",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "vaultStagedFiles", sourceId),
});
export const verifyVaultFileBlobMappings = defineSourceMappingVerification({
  source: "observations_vaultFiles_blobs",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "observations_vaultFiles_blobs", sourceId),
});
export const verifyVaultFileTreeFolderExpansionMappings = defineSourceMappingVerification({
  source: "ui_vaultFileTree_folderExpansions",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "ui_vaultFileTree_folderExpansions", sourceId),
});
export const verifyVaultStagedFileUpdateMappings = defineSourceMappingVerification({
  source: "vaultStagedFileUpdates",
  hasCopiedMapping: async (ctx, sourceId) =>
    await hasCopiedMapping(ctx, "vaultStagedFileUpdates", sourceId),
});

export const verifyMappedDocuments = repositoryMigrations.define({
  table: "repositoryMigrationIdMaps",
  migrateOne: async (ctx, mapping) => {
    await requireFrozenRepositoryMigrationWrite(ctx);
    if (mapping.kind === "copied_document") {
      if ((await ctx.db.get(mapping.sourceId)) === null) {
        throw new Error(`Mapping ${mapping._id} points to a missing source document.`);
      }
      if ((await ctx.db.get(mapping.targetId)) === null) {
        throw new Error(`Mapping ${mapping._id} points to a missing target document.`);
      }
      return;
    }

    if ((await ctx.db.get(mapping.sourceId)) !== null) {
      throw new Error(`Deleted repository identity ${mapping._id} still has a vault document.`);
    }
    if ((await ctx.db.get(mapping.targetId)) !== null) {
      throw new Error(`Deleted repository identity ${mapping._id} still has a tombstone document.`);
    }
    const evidenceRun = await ctx.db.get(mapping.evidenceRunId);
    if (
      evidenceRun === null ||
      evidenceRun.state !== "succeeded" ||
      evidenceRun.vaultId !== mapping.sourceId
    ) {
      throw new Error(
        `Deleted repository identity ${mapping._id} has no retained succeeded deletion run.`,
      );
    }
  },
});

export const verifyNoRepositoryMigrationPlaceholders = repositoryMigrations.define({
  table: "repositories",
  migrateOne: async (ctx, repository) => {
    await requireFrozenRepositoryMigrationWrite(ctx);
    if (
      repository.state === "migration_placeholder" ||
      repository.state === "migration_tombstone"
    ) {
      throw new Error(`Repository ${repository._id} is still a migration-only document.`);
    }
  },
});

export const verifyNoDeletionRunMigrationPlaceholders = repositoryMigrations.define({
  table: "workflow_repositoryDeletion_runs",
  migrateOne: async (ctx, run) => {
    await requireFrozenRepositoryMigrationWrite(ctx);
    if (run.state === "migration_placeholder") {
      throw new Error(`Deletion run ${run._id} is still a migration placeholder.`);
    }
  },
});
