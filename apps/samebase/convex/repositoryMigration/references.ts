import type { GenericMutationCtx } from "convex/server";

import type { DataModel, Id } from "../_generated/dataModel";

type MigrationMutationCtx = GenericMutationCtx<DataModel>;

export async function requireMappedRepositoryId(
  ctx: MigrationMutationCtx,
  vaultId: Id<"vaults">,
): Promise<Id<"repositories">> {
  const mapping = await ctx.db
    .query("repositoryMigrationIdMaps")
    .withIndex("by_source", (query) => query.eq("sourceKind", "vaults").eq("sourceId", vaultId))
    .unique();

  if (mapping === null || mapping.kind !== "copied_document" || mapping.sourceKind !== "vaults") {
    throw new Error(`Live vault ${vaultId} has no repository ID mapping.`);
  }
  return mapping.targetId;
}

export async function requireMappedDeletionHistoryRepositoryId(
  ctx: MigrationMutationCtx,
  vaultId: Id<"vaults">,
): Promise<Id<"repositories">> {
  const mapping = await ctx.db
    .query("repositoryMigrationIdMaps")
    .withIndex("by_source", (query) => query.eq("sourceKind", "vaults").eq("sourceId", vaultId))
    .unique();

  if (mapping === null || mapping.sourceKind !== "vaults") {
    throw new Error(`Deletion history for vault ${vaultId} has no repository ID mapping.`);
  }
  return mapping.targetId;
}

export async function requireMappedProvisioningRunId(
  ctx: MigrationMutationCtx,
  runId: Id<"workflow_vaultProvisioning_runs">,
): Promise<Id<"workflow_repositoryProvisioning_runs">> {
  const mapping = await ctx.db
    .query("repositoryMigrationIdMaps")
    .withIndex("by_source", (query) =>
      query.eq("sourceKind", "workflow_vaultProvisioning_runs").eq("sourceId", runId),
    )
    .unique();

  if (
    mapping === null ||
    mapping.kind !== "copied_document" ||
    mapping.sourceKind !== "workflow_vaultProvisioning_runs"
  ) {
    throw new Error(`Provisioning run ${runId} has no target ID mapping.`);
  }
  return mapping.targetId;
}

export async function requireMappedDeletionRunId(
  ctx: MigrationMutationCtx,
  runId: Id<"workflow_vaultDeletion_runs">,
): Promise<Id<"workflow_repositoryDeletion_runs">> {
  const mapping = await ctx.db
    .query("repositoryMigrationIdMaps")
    .withIndex("by_source", (query) =>
      query.eq("sourceKind", "workflow_vaultDeletion_runs").eq("sourceId", runId),
    )
    .unique();

  if (
    mapping === null ||
    mapping.kind !== "copied_document" ||
    mapping.sourceKind !== "workflow_vaultDeletion_runs"
  ) {
    throw new Error(`Deletion run ${runId} has no target ID mapping.`);
  }
  return mapping.targetId;
}

export async function requireMappedFolderId(
  ctx: MigrationMutationCtx,
  folderId: Id<"ui_vaultFolders">,
): Promise<Id<"ui_repositoryTree_folders">> {
  const mapping = await ctx.db
    .query("repositoryMigrationIdMaps")
    .withIndex("by_source", (query) =>
      query.eq("sourceKind", "ui_vaultFolders").eq("sourceId", folderId),
    )
    .unique();

  if (
    mapping === null ||
    mapping.kind !== "copied_document" ||
    mapping.sourceKind !== "ui_vaultFolders"
  ) {
    throw new Error(`Folder ${folderId} has no target ID mapping.`);
  }
  return mapping.targetId;
}

export async function requireMappedConvexProjectId(
  ctx: MigrationMutationCtx,
  convexProjectId: Id<"vaultConvexProjects">,
): Promise<Id<"repositoryConvexProjects">> {
  const mapping = await ctx.db
    .query("repositoryMigrationIdMaps")
    .withIndex("by_source", (query) =>
      query.eq("sourceKind", "vaultConvexProjects").eq("sourceId", convexProjectId),
    )
    .unique();

  if (
    mapping === null ||
    mapping.kind !== "copied_document" ||
    mapping.sourceKind !== "vaultConvexProjects"
  ) {
    throw new Error(`Convex project ${convexProjectId} has no target ID mapping.`);
  }
  return mapping.targetId;
}
