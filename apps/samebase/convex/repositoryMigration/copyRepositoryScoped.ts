import {
  defineCopiedDocumentMigration,
  findRepositoryMigrationSourceMapping,
} from "./copyDocument";
import { requireMappedRepositoryId } from "./references";

const repositoryBranchTreesMigration = defineCopiedDocumentMigration({
  source: "observations_vaultRepository_branchTrees",
  transform: async (ctx, tree) => ({
    repositoryId: await requireMappedRepositoryId(ctx, tree.vaultId),
    branch: tree.branch,
    commitSHA: tree.commitSHA,
    treeData: tree.treeData,
    lastTreeRefreshAt: tree.lastTreeRefreshAt,
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "observations_vaultRepository_branchTrees",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" &&
        mapping.sourceKind === "observations_vaultRepository_branchTrees")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`Branch tree ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) =>
    await ctx.db.insert("observations_repository_branchTrees", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "observations_vaultRepository_branchTrees",
      sourceId,
      targetKind: "observations_repository_branchTrees",
      targetId,
    });
  },
});
export const copyRepositoryBranchTrees = repositoryBranchTreesMigration.copy;
export const verifyRepositoryBranchTrees = repositoryBranchTreesMigration.verify;

const repositoryPullRequestFiltersMigration = defineCopiedDocumentMigration({
  source: "ui_vaultPullRequests_filters",
  transform: async (ctx, filter) => ({
    userId: filter.userId,
    repositoryId: await requireMappedRepositoryId(ctx, filter.vaultId),
    hiddenLabels: filter.hiddenLabels,
    includeDrafts: filter.includeDrafts,
    includeNoLabel: filter.includeNoLabel,
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "ui_vaultPullRequests_filters",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" && mapping.sourceKind === "ui_vaultPullRequests_filters")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`Pull request filter ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) =>
    await ctx.db.insert("ui_repositoryPullRequests_filters", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "ui_vaultPullRequests_filters",
      sourceId,
      targetKind: "ui_repositoryPullRequests_filters",
      targetId,
    });
  },
});
export const copyRepositoryPullRequestFilters = repositoryPullRequestFiltersMigration.copy;
export const verifyRepositoryPullRequestFilters = repositoryPullRequestFiltersMigration.verify;

const repositoryResourceLinkSettingsMigration = defineCopiedDocumentMigration({
  source: "ui_vaultResourceLinks_settings",
  transform: async (ctx, setting) => ({
    userId: setting.userId,
    updatedAt: setting.updatedAt,
    resourceLinksOpen: setting.resourceLinksOpen,
    repositoryId: await requireMappedRepositoryId(ctx, setting.vaultId),
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "ui_vaultResourceLinks_settings",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" &&
        mapping.sourceKind === "ui_vaultResourceLinks_settings")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`Resource link setting ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) =>
    await ctx.db.insert("ui_repositoryResourceLinks_settings", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "ui_vaultResourceLinks_settings",
      sourceId,
      targetKind: "ui_repositoryResourceLinks_settings",
      targetId,
    });
  },
});
export const copyRepositoryResourceLinkSettings = repositoryResourceLinkSettingsMigration.copy;
export const verifyRepositoryResourceLinkSettings = repositoryResourceLinkSettingsMigration.verify;

const repositoryOrganizationTreeSettingsMigration = defineCopiedDocumentMigration({
  source: "ui_vaultOrganizationTree_settings",
  transform: async (_ctx, setting) => ({
    userId: setting.userId,
    organizationId: setting.organizationId,
    collapsed: setting.collapsed,
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "ui_vaultOrganizationTree_settings",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" &&
        mapping.sourceKind === "ui_vaultOrganizationTree_settings")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`Organization tree setting ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) =>
    await ctx.db.insert("ui_repositoryTree_organizationSettings", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "ui_vaultOrganizationTree_settings",
      sourceId,
      targetKind: "ui_repositoryTree_organizationSettings",
      targetId,
    });
  },
});
export const copyRepositoryOrganizationTreeSettings =
  repositoryOrganizationTreeSettingsMigration.copy;
export const verifyRepositoryOrganizationTreeSettings =
  repositoryOrganizationTreeSettingsMigration.verify;

const repositoryStagedFilesMigration = defineCopiedDocumentMigration({
  source: "vaultStagedFiles",
  transform: async (ctx, file) => ({
    repositoryId: await requireMappedRepositoryId(ctx, file.vaultId),
    fileDeleted: file.fileDeleted,
    kind: file.kind,
    filePath: file.filePath,
    initialFilePath: file.initialFilePath,
    content: file.content,
    initialContent: file.initialContent,
    storageId: file.storageId,
    mime: file.mime,
    size: file.size,
    stagedBlobSha: file.stagedBlobSha,
    parentCommitSha: file.parentCommitSha,
    lastEditTime: file.lastEditTime,
    lastEditUserId: file.lastEditUserId,
    branch: file.branch,
    version: file.version,
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(ctx, "vaultStagedFiles", sourceId);
    if (
      mapping === null ||
      (mapping.kind === "copied_document" && mapping.sourceKind === "vaultStagedFiles")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`Staged file ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) => await ctx.db.insert("repositoryStagedFiles", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "vaultStagedFiles",
      sourceId,
      targetKind: "repositoryStagedFiles",
      targetId,
    });
  },
});
export const copyRepositoryStagedFiles = repositoryStagedFilesMigration.copy;
export const verifyRepositoryStagedFiles = repositoryStagedFilesMigration.verify;

const repositoryFileBlobsMigration = defineCopiedDocumentMigration({
  source: "observations_vaultFiles_blobs",
  transform: async (ctx, blob) => ({
    repositoryId: await requireMappedRepositoryId(ctx, blob.vaultId),
    sha: blob.sha,
    size: blob.size,
    text: blob.text,
    storageId: blob.storageId,
    mime: blob.mime,
    ext: blob.ext,
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "observations_vaultFiles_blobs",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" && mapping.sourceKind === "observations_vaultFiles_blobs")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`File blob ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) =>
    await ctx.db.insert("observations_repositoryFiles_blobs", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "observations_vaultFiles_blobs",
      sourceId,
      targetKind: "observations_repositoryFiles_blobs",
      targetId,
    });
  },
});
export const copyRepositoryFileBlobs = repositoryFileBlobsMigration.copy;
export const verifyRepositoryFileBlobs = repositoryFileBlobsMigration.verify;

const repositoryFileTreeFolderExpansionsMigration = defineCopiedDocumentMigration({
  source: "ui_vaultFileTree_folderExpansions",
  transform: async (ctx, expansion) => ({
    userId: expansion.userId,
    repositoryId: await requireMappedRepositoryId(ctx, expansion.vaultId),
    folderPath: expansion.folderPath,
    isExpanded: expansion.isExpanded,
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "ui_vaultFileTree_folderExpansions",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" &&
        mapping.sourceKind === "ui_vaultFileTree_folderExpansions")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`File-tree expansion ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) =>
    await ctx.db.insert("ui_repositoryFileTree_folderExpansions", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "ui_vaultFileTree_folderExpansions",
      sourceId,
      targetKind: "ui_repositoryFileTree_folderExpansions",
      targetId,
    });
  },
});
export const copyRepositoryFileTreeFolderExpansions =
  repositoryFileTreeFolderExpansionsMigration.copy;
export const verifyRepositoryFileTreeFolderExpansions =
  repositoryFileTreeFolderExpansionsMigration.verify;

const repositoryStagedFileUpdatesMigration = defineCopiedDocumentMigration({
  source: "vaultStagedFileUpdates",
  transform: async (ctx, update) => ({
    repositoryId: await requireMappedRepositoryId(ctx, update.vaultId),
    branch: update.branch,
    filePath: update.filePath,
    version: update.version,
    clientId: update.clientId,
    changes: update.changes,
    userId: update.userId,
    timestamp: update.timestamp,
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "vaultStagedFileUpdates",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" && mapping.sourceKind === "vaultStagedFileUpdates")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`Staged file update ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) => await ctx.db.insert("repositoryStagedFileUpdates", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "vaultStagedFileUpdates",
      sourceId,
      targetKind: "repositoryStagedFileUpdates",
      targetId,
    });
  },
});
export const copyRepositoryStagedFileUpdates = repositoryStagedFileUpdatesMigration.copy;
export const verifyRepositoryStagedFileUpdates = repositoryStagedFileUpdatesMigration.verify;
