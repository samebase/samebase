import { defineTable } from "convex/server";
import { v } from "convex/values";

const { id, literal, object, union } = v;

const vRepositoryMigrationIdMapping = union(
  object({
    kind: literal("copied_document"),
    sourceKind: literal("vaults"),
    sourceId: id("vaults"),
    targetKind: literal("repositories"),
    targetId: id("repositories"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("vaultCloudflareWorkers"),
    sourceId: id("vaultCloudflareWorkers"),
    targetKind: literal("repositoryCloudflareWorkers"),
    targetId: id("repositoryCloudflareWorkers"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("vaultConvexProjects"),
    sourceId: id("vaultConvexProjects"),
    targetKind: literal("repositoryConvexProjects"),
    targetId: id("repositoryConvexProjects"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("observations_vaultRepository_branchTrees"),
    sourceId: id("observations_vaultRepository_branchTrees"),
    targetKind: literal("observations_repository_branchTrees"),
    targetId: id("observations_repository_branchTrees"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("ui_vaultPullRequests_filters"),
    sourceId: id("ui_vaultPullRequests_filters"),
    targetKind: literal("ui_repositoryPullRequests_filters"),
    targetId: id("ui_repositoryPullRequests_filters"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("ui_vaultResourceLinks_settings"),
    sourceId: id("ui_vaultResourceLinks_settings"),
    targetKind: literal("ui_repositoryResourceLinks_settings"),
    targetId: id("ui_repositoryResourceLinks_settings"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("ui_vaultFolders"),
    sourceId: id("ui_vaultFolders"),
    targetKind: literal("ui_repositoryTree_folders"),
    targetId: id("ui_repositoryTree_folders"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("ui_vaultFolderAssignments"),
    sourceId: id("ui_vaultFolderAssignments"),
    targetKind: literal("ui_repositoryTree_folderAssignments"),
    targetId: id("ui_repositoryTree_folderAssignments"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("ui_vaultOrganizationTree_settings"),
    sourceId: id("ui_vaultOrganizationTree_settings"),
    targetKind: literal("ui_repositoryTree_organizationSettings"),
    targetId: id("ui_repositoryTree_organizationSettings"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("observations_vaultConvexSchema_snapshots"),
    sourceId: id("observations_vaultConvexSchema_snapshots"),
    targetKind: literal("observations_repositoryConvexSchema_snapshots"),
    targetId: id("observations_repositoryConvexSchema_snapshots"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("ui_vaultConvexSchemaGraph_nodeLayouts"),
    sourceId: id("ui_vaultConvexSchemaGraph_nodeLayouts"),
    targetKind: literal("ui_repositoryConvexSchemaGraph_nodeLayouts"),
    targetId: id("ui_repositoryConvexSchemaGraph_nodeLayouts"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("workflow_vaultDeletion_runs"),
    sourceId: id("workflow_vaultDeletion_runs"),
    targetKind: literal("workflow_repositoryDeletion_runs"),
    targetId: id("workflow_repositoryDeletion_runs"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("workflow_vaultDeletion_events"),
    sourceId: id("workflow_vaultDeletion_events"),
    targetKind: literal("workflow_repositoryDeletion_events"),
    targetId: id("workflow_repositoryDeletion_events"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("workflow_vaultProvisioning_plans"),
    sourceId: id("workflow_vaultProvisioning_plans"),
    targetKind: literal("workflow_repositoryProvisioning_plans"),
    targetId: id("workflow_repositoryProvisioning_plans"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("workflow_vaultProvisioning_writeLocks"),
    sourceId: id("workflow_vaultProvisioning_writeLocks"),
    targetKind: literal("workflow_repositoryProvisioning_writeLocks"),
    targetId: id("workflow_repositoryProvisioning_writeLocks"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("workflow_vaultProvisioning_runs"),
    sourceId: id("workflow_vaultProvisioning_runs"),
    targetKind: literal("workflow_repositoryProvisioning_runs"),
    targetId: id("workflow_repositoryProvisioning_runs"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("workflow_vaultProvisioning_events"),
    sourceId: id("workflow_vaultProvisioning_events"),
    targetKind: literal("workflow_repositoryProvisioning_events"),
    targetId: id("workflow_repositoryProvisioning_events"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("vaultStagedFiles"),
    sourceId: id("vaultStagedFiles"),
    targetKind: literal("repositoryStagedFiles"),
    targetId: id("repositoryStagedFiles"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("observations_vaultFiles_blobs"),
    sourceId: id("observations_vaultFiles_blobs"),
    targetKind: literal("observations_repositoryFiles_blobs"),
    targetId: id("observations_repositoryFiles_blobs"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("ui_vaultFileTree_folderExpansions"),
    sourceId: id("ui_vaultFileTree_folderExpansions"),
    targetKind: literal("ui_repositoryFileTree_folderExpansions"),
    targetId: id("ui_repositoryFileTree_folderExpansions"),
  }),
  object({
    kind: literal("copied_document"),
    sourceKind: literal("vaultStagedFileUpdates"),
    sourceId: id("vaultStagedFileUpdates"),
    targetKind: literal("repositoryStagedFileUpdates"),
    targetId: id("repositoryStagedFileUpdates"),
  }),
  object({
    kind: literal("deleted_repository_identity"),
    sourceKind: literal("vaults"),
    sourceId: id("vaults"),
    targetKind: literal("repositories"),
    targetId: id("repositories"),
    evidenceRunId: id("workflow_vaultDeletion_runs"),
  }),
);

export const repositoryMigrationTables = {
  repositoryMigrationIdMaps: defineTable(vRepositoryMigrationIdMapping)
    .index("by_source", ["sourceKind", "sourceId"])
    .index("by_target", ["targetKind", "targetId"]),
};
