import { defineTable } from "convex/server";
import { v } from "convex/values";

const { boolean, id, number, optional, string } = v;

export const repositoryEditorTables = {
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
};
