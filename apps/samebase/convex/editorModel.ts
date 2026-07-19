import { defineTable } from "convex/server";
import { v } from "convex/values";

const { boolean, id, literal, number, optional, string, union } = v;

export const vaultEditorTables = {
  /**
   * The current uncommitted state of each changed file on a vault branch,
   * including edits, renames, deletions, and binary uploads.
   */
  vaultStagedFiles: defineTable({
    ownerId: id("users"),
    vaultId: id("vaults"),
    fileDeleted: boolean(),
    kind: optional(union(literal("text"), literal("binary"))),
    filePath: string(),
    initialFilePath: string(),
    content: string(),
    // TODO: Maybe remove and rely on the observed blob cache instead?
    initialContent: string(),
    storageId: optional(id("_storage")),
    mime: optional(string()),
    size: optional(number()),
    stagedBlobSha: optional(string()),
    parentCommitSha: union(string(), v.null()),
    lastEditTime: number(),
    lastEditUserId: id("users"),
    branch: string(),
    version: number(),
  })
    .index("by_vault_and_path", ["vaultId", "filePath"])
    .index("by_vault_and_branch_and_path", ["vaultId", "branch", "filePath"])
    .index("by_vault_and_initial_path", ["vaultId", "initialFilePath"])
    .index("by_vault_and_branch", ["vaultId", "branch"])
    .index("by_vault_and_branch_and_initial_path", ["vaultId", "branch", "initialFilePath"])
    .index("by_vault", ["vaultId"])
    .index("by_vault_and_storageId", ["vaultId", "storageId"])
    .index("by_storageId", ["storageId"])
    .index("by_user", ["lastEditUserId"]),

  /** Git blob contents observed by SHA and cached inline or in Convex storage. */
  observations_vaultFiles_blobs: defineTable({
    vaultId: id("vaults"),
    sha: string(),
    size: number(),
    text: optional(string()),
    storageId: optional(id("_storage")),
    mime: optional(string()),
    ext: optional(string()),
  })
    .index("by_sha", ["sha"])
    .index("by_vault", ["vaultId"])
    .index("by_vault_and_storageId", ["vaultId", "storageId"])
    .index("by_storageId", ["storageId"]),

  /** Expanded or collapsed file-tree folders for one user and vault. */
  ui_vaultFileTree_folderExpansions: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    folderPath: string(),
    isExpanded: boolean(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user_and_vault", ["userId", "vaultId"])
    .index("by_user_vault_and_path", ["userId", "vaultId", "folderPath"]),

  /** Versioned file edits that other clients pull to synchronize one staged document. */
  vaultStagedFileUpdates: defineTable({
    vaultId: id("vaults"),
    branch: optional(string()),
    filePath: string(),
    version: number(),
    clientId: string(),
    changes: string(),
    userId: id("users"),
    timestamp: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_vault_and_timestamp", ["vaultId", "timestamp"])
    .index("by_file", ["vaultId", "filePath"])
    .index("by_file_and_version", ["vaultId", "filePath", "version"])
    .index("by_vaultId_and_branch", ["vaultId", "branch"])
    .index("by_vaultId_and_branch_and_timestamp", ["vaultId", "branch", "timestamp"])
    .index("by_vaultId_and_branch_and_filePath", ["vaultId", "branch", "filePath"])
    .index("by_vaultId_and_branch_and_filePath_and_version", [
      "vaultId",
      "branch",
      "filePath",
      "version",
    ])
    .index("by_vaultId_and_branch_and_filePath_and_timestamp", [
      "vaultId",
      "branch",
      "filePath",
      "timestamp",
    ]),
};
