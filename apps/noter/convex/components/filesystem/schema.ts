import { v } from "convex/values";

/**
 * File system component schemas and types
 */

export const FileOperationArgs = v.object({
  vaultId: v.id("vaults"),
  filePath: v.string(),
  userId: v.id("users"),
});

export const FileReadArgs = v.object({
  ...FileOperationArgs.fields,
});

export const FileWriteArgs = v.object({
  ...FileOperationArgs.fields,
  content: v.string(),
  branch: v.optional(v.string()),
});

export const FileCreateArgs = v.object({
  ...FileOperationArgs.fields,
  content: v.string(),
  branch: v.optional(v.string()),
});

export const FileDeleteArgs = v.object({
  ...FileOperationArgs.fields,
  branch: v.optional(v.string()),
});

export const DirectoryListArgs = v.object({
  vaultId: v.id("vaults"),
  directoryPath: v.optional(v.string()),
  userId: v.id("users"),
});

export const FileStagingResult = v.object({
  filePath: v.string(),
  content: v.string(),
  isModified: v.boolean(),
  lastEditTime: v.number(),
  lastEditUserId: v.id("users"),
});

export const FileTreeNode = v.object({
  path: v.string(),
  type: v.union(v.literal("file"), v.literal("directory")),
  size: v.optional(v.number()),
  children: v.optional(v.array(v.any())), // Recursive type
});

export const CommitProposal = v.object({
  vaultId: v.id("vaults"),
  message: v.string(),
  files: v.array(v.object({
    path: v.string(),
    content: v.string(),
    operation: v.union(v.literal("create"), v.literal("update"), v.literal("delete")),
  })),
  branch: v.string(),
  userId: v.id("users"),
});