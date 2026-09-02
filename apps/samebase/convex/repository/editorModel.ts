import { defineTable } from "convex/server";
import { v } from "convex/values";

const { boolean, id, literal, number, optional, string, union } = v;

export const repositoryEditorTables = {
  /** Current uncommitted file state for one repository branch. */
  repositoryStagedFiles: defineTable({
    repositoryId: id("repositories"),
    fileDeleted: boolean(),
    kind: optional(union(literal("text"), literal("binary"))),
    filePath: string(),
    initialFilePath: string(),
    content: string(),
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
    .index("by_repository_and_path", ["repositoryId", "filePath"])
    .index("by_repository_and_branch_and_path", ["repositoryId", "branch", "filePath"])
    .index("by_repository_and_initial_path", ["repositoryId", "initialFilePath"])
    .index("by_repository_and_branch", ["repositoryId", "branch"])
    .index("by_repository_and_branch_and_initial_path", [
      "repositoryId",
      "branch",
      "initialFilePath",
    ])
    .index("by_repository", ["repositoryId"])
    .index("by_repository_and_storageId", ["repositoryId", "storageId"])
    .index("by_storageId", ["storageId"]),

  /** Git blob contents observed by SHA and cached inline or in Convex storage. */
  observations_repositoryFiles_blobs: defineTable({
    repositoryId: id("repositories"),
    sha: string(),
    size: number(),
    text: optional(string()),
    storageId: optional(id("_storage")),
    mime: optional(string()),
    ext: optional(string()),
  })
    .index("by_sha", ["sha"])
    .index("by_repository", ["repositoryId"])
    .index("by_repository_and_storageId", ["repositoryId", "storageId"])
    .index("by_storageId", ["storageId"]),

  /** Expanded or collapsed file-tree folders for one user and repository. */
  ui_repositoryFileTree_folderExpansions: defineTable({
    userId: id("users"),
    repositoryId: id("repositories"),
    folderPath: string(),
    isExpanded: boolean(),
  })
    .index("by_repository", ["repositoryId"])
    .index("by_user_and_repository", ["userId", "repositoryId"])
    .index("by_user_repository_and_path", ["userId", "repositoryId", "folderPath"]),

  /** Versioned file edits that synchronize one staged repository document. */
  repositoryStagedFileUpdates: defineTable({
    repositoryId: id("repositories"),
    branch: optional(string()),
    filePath: string(),
    version: number(),
    clientId: string(),
    changes: string(),
    userId: id("users"),
    timestamp: number(),
  })
    .index("by_repository", ["repositoryId"])
    .index("by_repository_and_timestamp", ["repositoryId", "timestamp"])
    .index("by_file", ["repositoryId", "filePath"])
    .index("by_file_and_version", ["repositoryId", "filePath", "version"])
    .index("by_repositoryId_and_branch", ["repositoryId", "branch"])
    .index("by_repositoryId_and_branch_and_timestamp", ["repositoryId", "branch", "timestamp"])
    .index("by_repositoryId_and_branch_and_filePath", ["repositoryId", "branch", "filePath"])
    .index("by_repositoryId_and_branch_and_filePath_and_version", [
      "repositoryId",
      "branch",
      "filePath",
      "version",
    ])
    .index("by_repositoryId_and_branch_and_filePath_and_timestamp", [
      "repositoryId",
      "branch",
      "filePath",
      "timestamp",
    ]),
};
