import { requireRepositoryOperationStart } from "./maintenance";
import { repositoryMigrations } from "./migrations";

export const deleteVaultDeletionEvents = repositoryMigrations.define({
  table: "workflow_vaultDeletion_events",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultProvisioningEvents = repositoryMigrations.define({
  table: "workflow_vaultProvisioning_events",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultProvisioningPlans = repositoryMigrations.define({
  table: "workflow_vaultProvisioning_plans",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultProvisioningWriteLocks = repositoryMigrations.define({
  table: "workflow_vaultProvisioning_writeLocks",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultStagedFileUpdates = repositoryMigrations.define({
  table: "vaultStagedFileUpdates",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultStagedFiles = repositoryMigrations.define({
  table: "vaultStagedFiles",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultFileBlobs = repositoryMigrations.define({
  table: "observations_vaultFiles_blobs",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultFileTreeFolderExpansions = repositoryMigrations.define({
  table: "ui_vaultFileTree_folderExpansions",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultBranchTrees = repositoryMigrations.define({
  table: "observations_vaultRepository_branchTrees",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultPullRequestFilters = repositoryMigrations.define({
  table: "ui_vaultPullRequests_filters",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultResourceLinkSettings = repositoryMigrations.define({
  table: "ui_vaultResourceLinks_settings",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultFolderAssignments = repositoryMigrations.define({
  table: "ui_vaultFolderAssignments",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultOrganizationTreeSettings = repositoryMigrations.define({
  table: "ui_vaultOrganizationTree_settings",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultConvexSchemaSnapshots = repositoryMigrations.define({
  table: "observations_vaultConvexSchema_snapshots",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultConvexSchemaGraphNodeLayouts = repositoryMigrations.define({
  table: "ui_vaultConvexSchemaGraph_nodeLayouts",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultCloudflareWorkers = repositoryMigrations.define({
  table: "vaultCloudflareWorkers",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultConvexProjects = repositoryMigrations.define({
  table: "vaultConvexProjects",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultFolders = repositoryMigrations.define({
  table: "ui_vaultFolders",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultDeletionRuns = repositoryMigrations.define({
  table: "workflow_vaultDeletion_runs",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaultProvisioningRuns = repositoryMigrations.define({
  table: "workflow_vaultProvisioning_runs",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteVaults = repositoryMigrations.define({
  table: "vaults",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});

export const deleteRepositoryMigrationIdMaps = repositoryMigrations.define({
  table: "repositoryMigrationIdMaps",
  migrateOne: async (ctx, row) => {
    await requireRepositoryOperationStart(ctx);
    await ctx.db.delete(row._id);
  },
});
