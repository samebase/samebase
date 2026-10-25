import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { stagedFileFields } from "../model.js";

const { number, string } = v;

export default defineSchema({
  stagedFiles: defineTable(stagedFileFields)
    .index("by_repository_and_branch_and_path", ["repositoryId", "branch", "filePath"])
    .index("by_repository_and_branch", ["repositoryId", "branch"])
    .index("by_repository_and_branch_and_initial_path", [
      "repositoryId",
      "branch",
      "initialFilePath",
    ])
    .index("by_repository", ["repositoryId"])
    .index("by_storageId", ["storageId"]),
  fileUpdates: defineTable({
    repositoryId: string(),
    branch: string(),
    filePath: string(),
    version: number(),
    clientId: string(),
    changes: string(),
    userId: string(),
    timestamp: number(),
  })
    .index("by_repository", ["repositoryId"])
    .index("by_repository_and_timestamp", ["repositoryId", "timestamp"])
    .index("by_repository_and_branch_and_timestamp", ["repositoryId", "branch", "timestamp"])
    .index("by_file_and_version", ["repositoryId", "branch", "filePath", "version"])
    .index("by_file_and_timestamp", ["repositoryId", "branch", "filePath", "timestamp"]),
});
