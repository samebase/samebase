import { defineTable } from "convex/server";
import { v } from "convex/values";

const { boolean, id, string } = v;

export const repositoryEditorTables = {
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
