import { v } from "convex/values";
import { api, internal } from "./_generated/api.js";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host wrappers enforce access.
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import {
  committedStagedFile,
  stagedFile,
  stagedFileSnapshot,
  stagedFilesBranchSummary,
} from "../model.js";
import {
  hasStagedFileChanges,
  readStagedFileKind,
  summarizeStagedFilesByBranch,
} from "../stagingChanges.js";
import { deleteUnreferencedStorage } from "./storage.js";

const { array, boolean, id, literal, number, object, optional, string, union } = v;
const scope = { repositoryId: string(), branch: string() };
const localSnapshot = object({
  ...stagedFileSnapshot.fields,
  _id: id("stagedFiles"),
  storageId: optional(id("_storage")),
});
const BATCH_SIZE = 500;

function requireScope(file: Doc<"stagedFiles">, repositoryId: string, branch: string) {
  if (file.repositoryId !== repositoryId || file.branch !== branch) {
    throw new Error("Staged file belongs to a different repository or branch.");
  }
}

async function requireBranchTree(ctx: MutationCtx, repositoryId: string, branch: string) {
  const cached = await ctx.db
    .query("branchTrees")
    .withIndex("by_repository_and_branch", (q) =>
      q.eq("repositoryId", repositoryId).eq("branch", branch),
    )
    .first();
  if (!cached) {
    throw new Error(`Branch tree is not cached for "${branch}". Refresh branch and retry.`);
  }
  return cached.treeData.tree;
}

function matchesSnapshot(current: Doc<"stagedFiles">, snapshot: typeof localSnapshot.type) {
  return (
    current._id === snapshot._id &&
    current.repositoryId === snapshot.repositoryId &&
    current.fileDeleted === snapshot.fileDeleted &&
    current.kind === snapshot.kind &&
    current.filePath === snapshot.filePath &&
    current.initialFilePath === snapshot.initialFilePath &&
    current.content === snapshot.content &&
    current.initialContent === snapshot.initialContent &&
    current.storageId === snapshot.storageId &&
    current.mime === snapshot.mime &&
    current.size === snapshot.size &&
    current.stagedBlobSha === snapshot.stagedBlobSha &&
    current.parentCommitSha === snapshot.parentCommitSha &&
    current.lastEditTime === snapshot.lastEditTime &&
    current.lastEditUserId === snapshot.lastEditUserId &&
    current.branch === snapshot.branch &&
    current.version === snapshot.version
  );
}

async function scheduleFileCleanup(ctx: MutationCtx, file: Doc<"stagedFiles">, cutoff: number) {
  for (const filePath of new Set([file.filePath, file.initialFilePath])) {
    await ctx.scheduler.runAfter(0, internal.staging.deleteFileUpdates, {
      repositoryId: file.repositoryId,
      branch: file.branch,
      filePath,
      cutoffTimestamp: cutoff,
    });
  }
}

export const getByNewPath = query({
  args: { ...scope, newPath: string() },
  returns: union(stagedFile, v.null()),
  handler: async (ctx, args) =>
    await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.newPath),
      )
      .unique(),
});

export const getByOriginalPath = query({
  args: { ...scope, originalFilePath: string() },
  returns: union(stagedFile, v.null()),
  handler: async (ctx, args) =>
    await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch_and_initial_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("initialFilePath", args.originalFilePath),
      )
      .unique(),
});

export const listAllStagedFiles = query({
  args: {
    repositoryId: string(),
    branch: optional(string()),
    includeUnchanged: optional(boolean()),
  },
  returns: array(stagedFile),
  handler: async (ctx, args) => {
    const branch = args.branch;
    const files =
      branch === undefined
        ? await ctx.db
            .query("stagedFiles")
            .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
            .collect()
        : await ctx.db
            .query("stagedFiles")
            .withIndex("by_repository_and_branch", (q) =>
              q.eq("repositoryId", args.repositoryId).eq("branch", branch),
            )
            .collect();
    return args.includeUnchanged ? files : files.filter(hasStagedFileChanges);
  },
});

export const listBranchSummaries = query({
  args: { repositoryId: string() },
  returns: array(stagedFilesBranchSummary),
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .collect();
    return summarizeStagedFilesByBranch(files);
  },
});

export const getRepositorySummary = query({
  args: { repositoryId: string() },
  returns: object({ fileCount: number(), lastEditTime: optional(number()) }),
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .collect();
    return {
      fileCount: files.filter(hasStagedFileChanges).length,
      lastEditTime:
        files.length > 0 ? Math.max(...files.map((file) => file.lastEditTime)) : undefined,
    };
  },
});

export const saveToStaging = mutation({
  args: {
    ...scope,
    initialFilePath: string(),
    content: string(),
    initialContent: string(),
    parentCommitSha: union(string(), v.null()),
    userId: string(),
  },
  returns: stagedFile,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch_and_initial_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("initialFilePath", args.initialFilePath),
      )
      .unique();
    // A second opener can finish its remote fetch after the first editor has changed this row.
    if (existing) {
      if (readStagedFileKind(existing.kind) === "binary")
        throw new Error("Cannot overwrite binary staged content as text.");
      return existing;
    }
    const existingPath = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.initialFilePath),
      )
      .unique();
    if (existingPath) throw new Error("A staged file already uses this path");
    const stagingId = await ctx.db.insert("stagedFiles", {
      repositoryId: args.repositoryId,
      filePath: args.initialFilePath,
      initialFilePath: args.initialFilePath,
      fileDeleted: false,
      kind: "text",
      content: args.content,
      initialContent: args.initialContent,
      parentCommitSha: args.parentCommitSha,
      lastEditTime: Date.now(),
      lastEditUserId: args.userId,
      branch: args.branch,
      version: 0,
    });
    const file = await ctx.db.get(stagingId);
    if (!file) throw new Error("Staged file disappeared after insert");
    return file;
  },
});

export const createFileInStaging = mutation({
  args: {
    ...scope,
    filePath: string(),
    content: string(),
    userId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tree = await requireBranchTree(ctx, args.repositoryId, args.branch);
    const byInitialPath = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch_and_initial_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("initialFilePath", args.filePath),
      )
      .unique();
    if (byInitialPath) throw new Error("File already exists in staging");
    const byPath = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath),
      )
      .unique();
    if (byPath) throw new Error("A staged file already uses this path");
    if (tree.some((entry) => entry.type === "blob" && entry.path === args.filePath))
      throw new Error("File already exists in repository");
    await ctx.db.insert("stagedFiles", {
      repositoryId: args.repositoryId,
      filePath: args.filePath,
      initialFilePath: args.filePath,
      fileDeleted: false,
      kind: "text",
      content: args.content,
      initialContent: "",
      parentCommitSha: null,
      lastEditTime: Date.now(),
      lastEditUserId: args.userId,
      branch: args.branch,
      version: 0,
    });
    return null;
  },
});

export const markFileForDeletion = mutation({
  args: {
    ...scope,
    filePath: string(),
    parentCommitSha: union(string(), v.null()),
    userId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        fileDeleted: true,
        lastEditTime: Date.now(),
        lastEditUserId: args.userId,
      });
    } else {
      const tree = await requireBranchTree(ctx, args.repositoryId, args.branch);
      const entry = tree.find((item) => item.type === "blob" && item.path === args.filePath);
      if (!entry) throw new Error("File not found in the cached branch tree.");
      // A newer cached tree must not hide an upstream edit since the user selected this base.
      if (entry.sha !== args.parentCommitSha)
        throw new Error("File changed since deletion was requested. Refresh and retry.");
      const blob = await ctx.db
        .query("fileBlobs")
        .withIndex("by_sha", (q) => q.eq("sha", entry.sha))
        .first();
      const binaryBlob = blob && typeof blob.text !== "string" ? blob : null;
      const initialContent = blob?.text ?? "";
      await ctx.db.insert("stagedFiles", {
        repositoryId: args.repositoryId,
        filePath: args.filePath,
        initialFilePath: args.filePath,
        fileDeleted: true,
        kind: binaryBlob ? "binary" : "text",
        content: initialContent,
        initialContent,
        mime: binaryBlob?.mime,
        size: binaryBlob?.size,
        stagedBlobSha: binaryBlob?.sha,
        parentCommitSha: entry.sha,
        lastEditTime: Date.now(),
        lastEditUserId: args.userId,
        branch: args.branch,
        version: 0,
      });
    }
    return null;
  },
});

export const revertDeletedFileInStaging = mutation({
  args: { ...scope, filePath: string(), userId: string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath),
      )
      .unique();
    if (!existing) throw new Error("Deleted staged file not found");
    if (!existing.fileDeleted) throw new Error("Staged file is not deleted");
    await ctx.db.patch(existing._id, {
      fileDeleted: false,
      lastEditTime: Date.now(),
      lastEditUserId: args.userId,
    });
    return null;
  },
});

export const rename = mutation({
  args: {
    ...scope,
    initialFilePath: string(),
    newPath: string(),
    userId: string(),
  },
  returns: stagedFile,
  handler: async (ctx, args) => {
    const tree = await requireBranchTree(ctx, args.repositoryId, args.branch);
    const file = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch_and_initial_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("initialFilePath", args.initialFilePath),
      )
      .unique();
    if (!file) throw new Error("File not found");
    if (file.filePath === args.newPath) return file;
    const existing = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.newPath),
      )
      .unique();
    if (existing && existing._id !== file._id)
      throw new Error("A staged file already uses this path");
    if (
      tree.some(
        (entry) =>
          entry.type === "blob" &&
          entry.path === args.newPath &&
          entry.path !== args.initialFilePath,
      )
    )
      throw new Error("A repository file already exists at this path");
    await ctx.db.patch(file._id, {
      filePath: args.newPath,
      lastEditTime: Date.now(),
      lastEditUserId: args.userId,
    });
    const updated = await ctx.db.get(file._id);
    if (!updated) throw new Error("File not found after rename");
    return updated;
  },
});

export const initializeBinaryFile = mutation({
  args: {
    ...scope,
    filePath: string(),
    storageId: id("_storage"),
    mime: string(),
    size: number(),
    blobSha: string(),
    userId: string(),
  },
  returns: stagedFile,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch_and_initial_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("initialFilePath", args.filePath),
      )
      .unique();
    // A remote read can finish after an upload, deletion, or rename changed this file.
    if (existing) {
      await deleteUnreferencedStorage(ctx, [args.storageId]);
      return existing;
    }
    const existingPath = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath),
      )
      .unique();
    if (existingPath) throw new Error("A staged file already uses this path");
    const stagingId = await ctx.db.insert("stagedFiles", {
      repositoryId: args.repositoryId,
      branch: args.branch,
      filePath: args.filePath,
      initialFilePath: args.filePath,
      fileDeleted: false,
      kind: "binary",
      content: "",
      initialContent: "",
      storageId: args.storageId,
      mime: args.mime,
      size: args.size,
      stagedBlobSha: args.blobSha,
      parentCommitSha: args.blobSha,
      lastEditTime: Date.now(),
      lastEditUserId: args.userId,
      version: 0,
    });
    const file = await ctx.db.get(stagingId);
    if (!file) throw new Error("Staged binary file disappeared after insert");
    return file;
  },
});

export const saveBinaryUploadToStaging = mutation({
  args: {
    ...scope,
    filePath: string(),
    storageId: id("_storage"),
    mime: string(),
    size: number(),
    stagedBlobSha: string(),
    replaceExisting: boolean(),
    userId: string(),
  },
  returns: stagedFile,
  handler: async (ctx, args) => {
    const tree = await requireBranchTree(ctx, args.repositoryId, args.branch);
    const parentCommitSha =
      tree.find((entry) => entry.type === "blob" && entry.path === args.filePath)?.sha ?? null;
    const byPath = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath),
      )
      .unique();
    const byInitialPath = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch_and_initial_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("initialFilePath", args.filePath),
      )
      .unique();
    if (byInitialPath && byPath && byInitialPath._id !== byPath._id)
      throw new Error("An existing staged rename already owns this file path");
    const existing = byPath ?? byInitialPath;
    if (
      existing &&
      existing.filePath !== args.filePath &&
      existing.initialFilePath === args.filePath
    )
      throw new Error("An existing staged rename already owns this file path");
    if ((existing || parentCommitSha !== null) && !args.replaceExisting)
      throw new Error("A file already exists at this path");
    const fields = {
      repositoryId: args.repositoryId,
      fileDeleted: false,
      kind: "binary" as const,
      filePath: args.filePath,
      initialFilePath: existing?.initialFilePath ?? args.filePath,
      content: "",
      initialContent: existing?.initialContent ?? "",
      storageId: args.storageId,
      mime: args.mime,
      size: args.size,
      stagedBlobSha: args.stagedBlobSha,
      parentCommitSha: parentCommitSha ?? existing?.parentCommitSha ?? null,
      lastEditTime: Date.now(),
      lastEditUserId: args.userId,
      branch: args.branch,
      version: existing?.version ?? 0,
    };
    const releasedStorageIds =
      existing?.storageId && existing.storageId !== args.storageId ? [existing.storageId] : [];
    const stagingId = existing ? existing._id : await ctx.db.insert("stagedFiles", fields);
    if (existing) await ctx.db.patch(existing._id, fields);
    const file = await ctx.db.get(stagingId);
    if (!file) throw new Error("Staged binary upload disappeared while saving");
    await deleteUnreferencedStorage(ctx, releasedStorageIds);
    return file;
  },
});

export const updateStagedFileContent = mutation({
  args: {
    ...scope,
    stagingId: id("stagedFiles"),
    content: string(),
    expectedVersion: number(),
    userId: string(),
  },
  returns: stagedFile,
  handler: async (ctx, args): Promise<typeof stagedFile.type> => {
    const current = await ctx.db.get(args.stagingId);
    if (!current) throw new Error("Staged file not found");
    requireScope(current, args.repositoryId, args.branch);
    if (current.fileDeleted) throw new Error("Cannot update content for a deleted staged file.");
    if (readStagedFileKind(current.kind) === "binary")
      throw new Error("Cannot edit binary staged content as text.");
    if (current.content === args.content) return current;
    await ctx.runMutation(api.collaborative.pushContentUpdate, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      filePath: current.filePath,
      expectedVersion: args.expectedVersion,
      newContent: args.content,
      userId: args.userId,
    });
    const updated = await ctx.db.get(args.stagingId);
    if (!updated) throw new Error("Staged file disappeared while saving");
    return updated;
  },
});

export const duplicateBranchStaging = mutation({
  args: {
    repositoryId: string(),
    sourceBranch: string(),
    targetBranch: string(),
    stagedFiles: array(localSnapshot),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.sourceBranch === args.targetBranch)
      throw new Error("Source and target branches must differ.");
    const target = await ctx.db
      .query("stagedFiles")
      .withIndex("by_repository_and_branch", (q) =>
        q.eq("repositoryId", args.repositoryId).eq("branch", args.targetBranch),
      )
      .collect();
    if (target.some(hasStagedFileChanges))
      throw new Error("Target branch already has staged changes.");
    for (const file of args.stagedFiles) {
      if (file.repositoryId !== args.repositoryId || file.branch !== args.sourceBranch)
        throw new Error("Staging snapshot belongs to a different repository or branch.");
      if (!hasStagedFileChanges(file)) continue;
      const current = await ctx.db.get(file._id);
      if (current) requireScope(current, args.repositoryId, args.sourceBranch);
      await ctx.db.insert("stagedFiles", {
        repositoryId: file.repositoryId,
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
        branch: args.targetBranch,
        version: file.version,
      });
    }
    return null;
  },
});

export const clearMatchingStagingSnapshot = mutation({
  args: { ...scope, stagedFiles: array(localSnapshot) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const releasedStorageIds: Id<"_storage">[] = [];
    for (const snapshot of args.stagedFiles) {
      if (snapshot.repositoryId !== args.repositoryId || snapshot.branch !== args.branch)
        throw new Error("Staging snapshot belongs to a different repository or branch.");
      const current = await ctx.db.get(snapshot._id);
      if (!current) continue;
      requireScope(current, args.repositoryId, args.branch);
      if (!matchesSnapshot(current, snapshot)) continue;
      await ctx.db.delete(current._id);
      if (current.storageId) releasedStorageIds.push(current.storageId);
      await scheduleFileCleanup(ctx, current, snapshot.lastEditTime + 1);
    }
    await deleteUnreferencedStorage(ctx, releasedStorageIds);
    return null;
  },
});

export const clearCommittedStaging = mutation({
  args: {
    ...scope,
    committedFiles: array(
      object({
        ...committedStagedFile.fields,
        snapshot: localSnapshot,
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const releasedStorageIds: Id<"_storage">[] = [];
    for (const { snapshot, committedContent, committedBlobSha } of args.committedFiles) {
      if (snapshot.repositoryId !== args.repositoryId || snapshot.branch !== args.branch)
        throw new Error("Staging snapshot belongs to a different repository or branch.");
      const current = await ctx.db.get(snapshot._id);
      if (!current) continue;
      requireScope(current, args.repositoryId, args.branch);
      if (
        matchesSnapshot(current, snapshot) ||
        (current.fileDeleted === snapshot.fileDeleted &&
          current.kind === snapshot.kind &&
          current.filePath === snapshot.filePath &&
          current.storageId === snapshot.storageId &&
          current.stagedBlobSha === snapshot.stagedBlobSha &&
          (current.fileDeleted || current.content === committedContent))
      ) {
        await ctx.db.delete(current._id);
        if (current.storageId) releasedStorageIds.push(current.storageId);
        await scheduleFileCleanup(ctx, current, current.lastEditTime + 1);
      } else {
        await ctx.db.patch(
          current._id,
          committedBlobSha === null
            ? { initialFilePath: current.filePath, initialContent: "", parentCommitSha: null }
            : {
                initialFilePath: snapshot.filePath,
                initialContent: snapshot.content,
                parentCommitSha: committedBlobSha,
              },
        );
      }
    }
    await deleteUnreferencedStorage(ctx, releasedStorageIds);
    return null;
  },
});

export const clearAllStaging = mutation({
  args: { repositoryId: string(), branch: optional(string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const branch = args.branch;
    const files =
      branch === undefined
        ? await ctx.db
            .query("stagedFiles")
            .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
            .collect()
        : await ctx.db
            .query("stagedFiles")
            .withIndex("by_repository_and_branch", (q) =>
              q.eq("repositoryId", args.repositoryId).eq("branch", branch),
            )
            .collect();
    const releasedStorageIds: Id<"_storage">[] = [];
    for (const file of files) {
      await ctx.db.delete(file._id);
      if (file.storageId) releasedStorageIds.push(file.storageId);
    }
    await ctx.scheduler.runAfter(0, internal.staging.deleteUpdates, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      cutoffTimestamp: Date.now() + 1,
    });
    await deleteUnreferencedStorage(ctx, releasedStorageIds);
    return null;
  },
});

export const reconcileStagingWithTree = mutation({
  args: {
    repositoryId: string(),
    instructions: array(
      union(
        object({ action: literal("delete"), stagingId: id("stagedFiles"), branch: string() }),
        object({
          action: literal("update"),
          stagingId: id("stagedFiles"),
          branch: string(),
          parentCommitSha: union(string(), v.null()),
          initialContent: optional(string()),
        }),
      ),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const releasedStorageIds: Id<"_storage">[] = [];
    const cutoff = Date.now() + 1;
    for (const instruction of args.instructions) {
      const file = await ctx.db.get(instruction.stagingId);
      if (!file) continue;
      requireScope(file, args.repositoryId, instruction.branch);
      if (instruction.action === "delete") {
        if (hasStagedFileChanges(file)) continue;
        await ctx.db.delete(file._id);
        if (file.storageId) releasedStorageIds.push(file.storageId);
        await scheduleFileCleanup(ctx, file, cutoff);
      } else {
        if (file.fileDeleted && instruction.parentCommitSha !== null) continue;
        await ctx.db.patch(
          file._id,
          instruction.initialContent === undefined
            ? { parentCommitSha: instruction.parentCommitSha }
            : {
                parentCommitSha: instruction.parentCommitSha,
                initialContent: instruction.initialContent,
              },
        );
      }
    }
    await deleteUnreferencedStorage(ctx, releasedStorageIds);
    return null;
  },
});

export const deleteUpdates = internalMutation({
  args: { repositoryId: string(), branch: optional(string()), cutoffTimestamp: number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const branch = args.branch;
    const updates =
      branch === undefined
        ? await ctx.db
            .query("fileUpdates")
            .withIndex("by_repository_and_timestamp", (q) =>
              q.eq("repositoryId", args.repositoryId).lt("timestamp", args.cutoffTimestamp),
            )
            .take(BATCH_SIZE)
        : await ctx.db
            .query("fileUpdates")
            .withIndex("by_repository_and_branch_and_timestamp", (q) =>
              q
                .eq("repositoryId", args.repositoryId)
                .eq("branch", branch)
                .lt("timestamp", args.cutoffTimestamp),
            )
            .take(BATCH_SIZE);
    for (const update of updates) await ctx.db.delete(update._id);
    if (updates.length === BATCH_SIZE)
      await ctx.scheduler.runAfter(0, internal.staging.deleteUpdates, {
        repositoryId: args.repositoryId,
        branch: args.branch,
        cutoffTimestamp: args.cutoffTimestamp,
      });
    return null;
  },
});

export const deleteFileUpdates = internalMutation({
  args: { ...scope, filePath: string(), cutoffTimestamp: number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const updates = await ctx.db
      .query("fileUpdates")
      .withIndex("by_file_and_timestamp", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath)
          .lt("timestamp", args.cutoffTimestamp),
      )
      .take(BATCH_SIZE);
    for (const update of updates) await ctx.db.delete(update._id);
    if (updates.length === BATCH_SIZE)
      await ctx.scheduler.runAfter(0, internal.staging.deleteFileUpdates, {
        repositoryId: args.repositoryId,
        branch: args.branch,
        filePath: args.filePath,
        cutoffTimestamp: args.cutoffTimestamp,
      });
    return null;
  },
});

export const deleteRepositoryBatch = mutation({
  args: { repositoryId: string(), table: union(literal("stagedFiles"), literal("fileUpdates")) },
  returns: number(),
  handler: async (ctx, args) => {
    const releasedStorageIds: Id<"_storage">[] = [];
    if (args.table === "stagedFiles") {
      const rows = await ctx.db
        .query("stagedFiles")
        .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
        .take(50);
      for (const row of rows) {
        await ctx.db.delete(row._id);
        if (row.storageId) releasedStorageIds.push(row.storageId);
      }
      await deleteUnreferencedStorage(ctx, releasedStorageIds);
      return rows.length;
    }
    const rows = await ctx.db
      .query("fileUpdates")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .take(50);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
