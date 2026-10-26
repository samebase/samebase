import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  branchTreeFields,
  fileBlobFields,
  repositorySyncStateFields,
  stagedFileFields,
} from "../model.js";

const { id, number, optional, string } = v;

export default defineSchema({
  /** Exact Git tree cache for one repository branch at one observed commit. */
  branchTrees: defineTable(branchTreeFields).index("by_repository_and_branch", [
    "repositoryId",
    "branch",
  ]),
  /** Git blob contents observed by SHA and cached inline or in component storage. */
  fileBlobs: defineTable({ ...fileBlobFields, storageId: optional(id("_storage")) })
    .index("by_sha", ["sha"])
    .index("by_repository", ["repositoryId"])
    .index("by_storageId", ["storageId"]),
  repositorySyncState: defineTable(repositorySyncStateFields).index("by_repository", [
    "repositoryId",
  ]),
  stagedFiles: defineTable({ ...stagedFileFields, storageId: optional(id("_storage")) })
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
