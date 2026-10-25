import { v } from "convex/values";
import {
  committedStagedFile,
  reconcileInstruction,
  stagedFile,
  stagedFileSnapshot,
  stagedFilesBranchSummary,
} from "@samebase/git-workspace/model";
import { readStagedFileKind } from "@samebase/git-workspace/stagingChanges";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./functions";
import { findRepositoryForUser } from "./organizationAccess";
import type { GitHubTree } from "./repository/model";
import { assertConnectedRepository, isLiveConnectedRepository } from "./repository/state";
import { readActiveUser } from "./identity/lifecycle";
import { deleteReleasedStagingStorage } from "./gitOperations";

const { array, boolean, id, number, object, optional, string, union } = v;
const scope = { repositoryId: id("repositories"), branch: string() };
const fileOrNull = union(stagedFile, v.null());
const snapshots = array(stagedFileSnapshot);
const createFileArgs = { ...scope, filePath: string(), content: string() };

export const normalizeStorageId = internalQuery({
  args: { storageId: string() },
  returns: id("_storage"),
  handler: async (ctx, args) => {
    const storageId = ctx.db.system.normalizeId("_storage", args.storageId);
    if (!storageId) throw new Error("Invalid host storage ID.");
    return storageId;
  },
});

async function assertRepositoryForStagingAccess(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
) {
  const repository = await findRepositoryForUser(ctx.db, args);
  if (!repository) throw new Error("Unauthorized");
  return repository;
}

async function assertConnectedRepositoryForStagingWrite(
  ctx: Pick<MutationCtx, "db">,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
) {
  const repository = await assertRepositoryForStagingAccess(ctx, args);
  const user = await ctx.db.get(args.userId);
  if (!user || readActiveUser(user) === null) throw new Error("Account deletion is in progress.");
  return assertConnectedRepository(repository);
}

export function selectRepositoryTreeForBranch(args: {
  requestedBranch: string;
  branchTree: GitHubTree[] | null;
}): GitHubTree[] {
  if (args.branchTree) return args.branchTree;
  throw new Error(
    `Branch tree is not cached for "${args.requestedBranch}". Refresh branch and retry.`,
  );
}

async function resolveRepositoryTreeForRepository(
  ctx: MutationCtx,
  repositoryId: Id<"repositories">,
  branch: string,
): Promise<GitHubTree[]> {
  const tree = await ctx.runQuery(internal.repository.branches.getRepositoryBranchTree, {
    repositoryId,
    branch,
  });
  return selectRepositoryTreeForBranch({
    requestedBranch: branch,
    branchTree: tree?.treeData.tree ?? null,
  });
}

export function buildDeletionSnapshotSeed(args: {
  parentCommitSha: string | null;
  blob: { text?: string; mime?: string; size?: number } | null;
}): {
  initialContent: string;
  kind: "text" | "binary";
  mime?: string;
  size?: number;
  stagedBlobSha?: string;
} {
  if (!args.parentCommitSha || !args.blob) return { initialContent: "", kind: "text" };
  if (typeof args.blob.text === "string") return { initialContent: args.blob.text, kind: "text" };
  return {
    initialContent: "",
    kind: "binary",
    mime: args.blob.mime,
    size: args.blob.size,
    stagedBlobSha: args.parentCommitSha,
  };
}

export const generateUploadUrl = mutation({
  access: "access_files_write",
  args: { repositoryId: id("repositories") },
  returns: object({ uploadUrl: string() }),
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    return { uploadUrl: await ctx.storage.generateUploadUrl() };
  },
});
export const deletePendingUploadBlob = mutation({
  access: "access_files_write",
  args: { repositoryId: id("repositories"), storageId: id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    const staged = await ctx.runQuery(components.gitWorkspace.staging.hasStorageReference, {
      storageId: args.storageId,
    });
    const cached = await ctx.db
      .query("observations_repositoryFiles_blobs")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();
    if (staged || cached)
      throw new Error("Cannot delete a blob that is already attached to staging.");
    await ctx.storage.delete(args.storageId);
    return null;
  },
});
export const getByNewPath = query({
  access: "access_files_read",
  args: { ...scope, newPath: string() },
  returns: fileOrNull,
  handler: async (ctx, args) => {
    const repository = await findRepositoryForUser(ctx.db, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    if (!repository) return null;
    return await ctx.runQuery(components.gitWorkspace.staging.getByNewPath, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      newPath: args.newPath,
    });
  },
});
export const getByNewPathInternal = internalQuery({
  args: { ...scope, newPath: string() },
  returns: fileOrNull,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.gitWorkspace.staging.getByNewPath, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      newPath: args.newPath,
    }),
});
export const getByOriginalPath = internalQuery({
  args: { ...scope, originalFilePath: string() },
  returns: fileOrNull,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.gitWorkspace.staging.getByOriginalPath, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      originalFilePath: args.originalFilePath,
    }),
});
export const listStagedFiles = query({
  access: "access_files_read",
  args: { ...scope, includeUnchanged: optional(boolean()) },
  returns: array(stagedFile),
  handler: async (ctx, args) => {
    const repository = await findRepositoryForUser(ctx.db, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    if (!repository) return [];
    return await ctx.runQuery(components.gitWorkspace.staging.listAllStagedFiles, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      includeUnchanged: args.includeUnchanged,
    });
  },
});
export const listAllStagedFiles = internalQuery({
  args: {
    repositoryId: id("repositories"),
    branch: optional(string()),
    includeUnchanged: optional(boolean()),
  },
  returns: array(stagedFile),
  handler: async (ctx, args) =>
    await ctx.runQuery(components.gitWorkspace.staging.listAllStagedFiles, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      includeUnchanged: args.includeUnchanged,
    }),
});
export const listStagedFilesBranchSummaries = query({
  access: "access_files_read",
  args: { repositoryId: id("repositories") },
  returns: array(stagedFilesBranchSummary),
  handler: async (ctx, args) => {
    const repository = await findRepositoryForUser(ctx.db, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    if (!repository) return [];
    return await ctx.runQuery(components.gitWorkspace.staging.listBranchSummaries, {
      repositoryId: args.repositoryId,
    });
  },
});
export const listStagedFilesBranchSummariesByRepository = query({
  access: "access_files_read",
  args: { repositoryIds: array(id("repositories")) },
  returns: array(
    object({ repositoryId: id("repositories"), branchSummaries: array(stagedFilesBranchSummary) }),
  ),
  handler: async (ctx, args) => {
    const summaries = [];
    for (const repositoryId of new Set(args.repositoryIds)) {
      const repository = await findRepositoryForUser(ctx.db, {
        repositoryId,
        userId: ctx.viewer.userId,
      });
      if (!repository) continue;
      const branchSummaries = await ctx.runQuery(
        components.gitWorkspace.staging.listBranchSummaries,
        {
          repositoryId,
        },
      );
      summaries.push({ repositoryId, branchSummaries });
    }
    return summaries;
  },
});
export const duplicateBranchStaging = internalMutation({
  args: {
    repositoryId: id("repositories"),
    sourceBranch: string(),
    targetBranch: string(),
    stagedFiles: snapshots,
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });
    return await ctx.runMutation(components.gitWorkspace.staging.duplicateBranchStaging, {
      repositoryId: args.repositoryId,
      sourceBranch: args.sourceBranch,
      targetBranch: args.targetBranch,
      stagedFiles: args.stagedFiles,
    });
  },
});
export const clearMatchingStagingSnapshot = internalMutation({
  args: { ...scope, stagedFiles: snapshots },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.runMutation(
      components.gitWorkspace.staging.clearMatchingStagingSnapshot,
      { repositoryId: args.repositoryId, branch: args.branch, stagedFiles: args.stagedFiles },
    );
    await deleteReleasedStagingStorage(ctx, result.releasedStorageIds);
    return null;
  },
});
export const clearCommittedStaging = internalMutation({
  args: { ...scope, committedFiles: array(committedStagedFile) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.runMutation(components.gitWorkspace.staging.clearCommittedStaging, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      committedFiles: args.committedFiles,
    });
    await deleteReleasedStagingStorage(ctx, result.releasedStorageIds);
    return null;
  },
});
async function clearStaging(
  ctx: MutationCtx,
  args: {
    repositoryId: Id<"repositories">;
    userId: Id<"users">;
    branch?: string;
    skipTreeUpdate?: boolean;
  },
) {
  const repository = await ctx.db.get(args.repositoryId);
  const result = await ctx.runMutation(components.gitWorkspace.staging.clearAllStaging, {
    repositoryId: args.repositoryId,
    branch: args.branch,
  });
  await deleteReleasedStagingStorage(ctx, result.releasedStorageIds);
  if (isLiveConnectedRepository(repository) && !args.skipTreeUpdate) {
    await ctx.scheduler.runAfter(0, internal.github.updateRepositoryTree, {
      userId: args.userId,
      repositoryId: args.repositoryId,
      branch: args.branch ?? repository.defaultBranch,
    });
  }
  return null;
}
export const clearAllStaging = mutation({
  access: "access_files_write",
  args: {
    repositoryId: id("repositories"),
    branch: optional(string()),
    skipTreeUpdate: optional(boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertRepositoryForStagingAccess(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    return await clearStaging(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
      branch: args.branch,
      skipTreeUpdate: args.skipTreeUpdate,
    });
  },
});
export const clearAllStagingForOperation = internalMutation({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
    branch: optional(string()),
    skipTreeUpdate: optional(boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });
    return await clearStaging(ctx, args);
  },
});
export const markFileForDeletion = mutation({
  access: "access_files_write",
  args: { ...scope, filePath: string(), parentCommitSha: union(string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    const blob = args.parentCommitSha
      ? await ctx.runQuery(internal.gitOperations.getBlobBySha, { sha: args.parentCommitSha })
      : null;
    const seed = buildDeletionSnapshotSeed({ parentCommitSha: args.parentCommitSha, blob });
    return await ctx.runMutation(components.gitWorkspace.staging.markFileForDeletion, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      filePath: args.filePath,
      parentCommitSha: args.parentCommitSha,
      userId: ctx.viewer.userId,
      seed: {
        initialContent: seed.initialContent,
        kind: seed.kind,
        mime: seed.mime,
        size: seed.size,
        stagedBlobSha: seed.stagedBlobSha,
      },
    });
  },
});
async function createStagedFile(
  ctx: MutationCtx,
  args: {
    repositoryId: Id<"repositories">;
    filePath: string;
    content: string;
    branch: string;
    userId: Id<"users">;
  },
): Promise<null> {
  await assertConnectedRepositoryForStagingWrite(ctx, {
    repositoryId: args.repositoryId,
    userId: args.userId,
  });
  const tree = await resolveRepositoryTreeForRepository(ctx, args.repositoryId, args.branch);
  return await ctx.runMutation(components.gitWorkspace.staging.createFileInStaging, {
    repositoryId: args.repositoryId,
    branch: args.branch,
    filePath: args.filePath,
    content: args.content,
    userId: args.userId,
    existsInRepository: tree.some((entry) => entry.type === "blob" && entry.path === args.filePath),
  });
}
export const createFileInStaging = mutation({
  access: "access_files_write",
  args: createFileArgs,
  returns: v.null(),
  handler: async (ctx, args) =>
    await createStagedFile(ctx, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      filePath: args.filePath,
      content: args.content,
      userId: ctx.viewer.userId,
    }),
});
export const createFileInStagingForOperation = internalMutation({
  args: { ...createFileArgs, userId: id("users") },
  returns: v.null(),
  handler: createStagedFile,
});
export const revertDeletedFileInStaging = mutation({
  access: "access_files_write",
  args: { ...scope, filePath: string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    return await ctx.runMutation(components.gitWorkspace.staging.revertDeletedFileInStaging, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      filePath: args.filePath,
      userId: ctx.viewer.userId,
    });
  },
});
export const updateStagedFileContent = mutation({
  access: "access_files_write",
  args: { ...scope, stagingId: string(), content: string(), expectedVersion: number() },
  returns: stagedFile,
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    const current = await ctx.runQuery(components.gitWorkspace.staging.getById, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      stagingId: args.stagingId,
    });
    if (!current) throw new Error("Staged file not found");
    if (current.fileDeleted) throw new Error("Cannot update content for a deleted staged file.");
    if (readStagedFileKind(current.kind) === "binary")
      throw new Error("Cannot edit binary staged content as text.");
    if (current.content === args.content) return current;
    await ctx.runMutation(components.gitWorkspace.collaborative.pushContentUpdate, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      filePath: current.filePath,
      expectedVersion: args.expectedVersion,
      newContent: args.content,
      userId: ctx.viewer.userId,
    });
    const updated = await ctx.runQuery(components.gitWorkspace.staging.getById, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      stagingId: args.stagingId,
    });
    if (!updated) throw new Error("Staged file disappeared while saving");
    return updated;
  },
});
export const saveToStaging = internalMutation({
  args: {
    ...scope,
    initialFilePath: string(),
    content: string(),
    initialContent: string(),
    parentCommitSha: union(string(), v.null()),
    userId: id("users"),
  },
  returns: stagedFile,
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });
    return await ctx.runMutation(components.gitWorkspace.staging.saveToStaging, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      initialFilePath: args.initialFilePath,
      content: args.content,
      initialContent: args.initialContent,
      parentCommitSha: args.parentCommitSha,
      userId: args.userId,
    });
  },
});
export const saveBinaryUploadToStaging = internalMutation({
  args: {
    ...scope,
    filePath: string(),
    storageId: id("_storage"),
    mime: string(),
    size: number(),
    stagedBlobSha: string(),
    replaceExisting: boolean(),
    userId: id("users"),
  },
  returns: stagedFile,
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });
    const tree = await resolveRepositoryTreeForRepository(ctx, args.repositoryId, args.branch);
    const parentCommitSha =
      tree.find((entry) => entry.type === "blob" && entry.path === args.filePath)?.sha ?? null;
    const result = await ctx.runMutation(
      components.gitWorkspace.staging.saveBinaryUploadToStaging,
      {
        repositoryId: args.repositoryId,
        branch: args.branch,
        filePath: args.filePath,
        storageId: args.storageId,
        mime: args.mime,
        size: args.size,
        stagedBlobSha: args.stagedBlobSha,
        replaceExisting: args.replaceExisting,
        userId: args.userId,
        parentCommitSha,
      },
    );
    await deleteReleasedStagingStorage(ctx, result.releasedStorageIds);
    return result.file;
  },
});
export const assertMediaUploadAccess = internalMutation({
  args: { repositoryId: id("repositories"), userId: id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, args);
    return null;
  },
});
export const rename = internalMutation({
  args: { ...scope, initialFilePath: string(), newPath: string(), userId: id("users") },
  returns: stagedFile,
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });
    const tree = await resolveRepositoryTreeForRepository(ctx, args.repositoryId, args.branch);
    return await ctx.runMutation(components.gitWorkspace.staging.rename, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      initialFilePath: args.initialFilePath,
      newPath: args.newPath,
      userId: args.userId,
      existsInRepository: tree.some(
        (entry) =>
          entry.type === "blob" &&
          entry.path === args.newPath &&
          entry.path !== args.initialFilePath,
      ),
    });
  },
});
export const reconcileStagingWithTree = internalMutation({
  args: {
    repositoryId: id("repositories"),
    instructions: array(reconcileInstruction),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });
    const result = await ctx.runMutation(components.gitWorkspace.staging.reconcileStagingWithTree, {
      repositoryId: args.repositoryId,
      instructions: args.instructions,
    });
    await deleteReleasedStagingStorage(ctx, result.releasedStorageIds);
    return null;
  },
});
