"use node";
import { internalAction, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal, components } from "./_generated/api";
import { action } from "./functions";
import type { Id } from "./_generated/dataModel";
import { resolveGitHubAppAccess } from "./githubAppAccess";
import { assertConnectedRepository } from "./repository/state";
import * as workspaceOperations from "@samebase/git-editor/operations";
import type { EditableFileState } from "@samebase/git-editor/operations";
import type { GitEditor } from "@samebase/git-editor/operationsContext";
import {
  commitPreviewResult,
  branchComparePreviewResult,
  draftPullRequestResult,
  stagedMediaUploadResult,
  defaultBranchDraftPullRequestResult,
  rebaseConflictPreviewResult,
  type CommitPreviewResult,
  type BranchComparePreviewResult,
  type DraftPullRequestResult,
  type StagedMediaUploadResult,
  type DefaultBranchDraftPullRequestResult,
  type RebaseConflictPreviewResult,
} from "@samebase/git-editor/previews";
const { boolean, optional, string } = v;
async function getWorkspace(
  ctx: ActionCtx,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
): Promise<GitEditor<Id<"repositories">, Id<"users">>> {
  const repository = await ctx.runQuery(internal.repository.records.getByIdForUser, {
    repositoryId: args.repositoryId,
    userId: args.userId,
  });
  if (!repository) throw new Error("Repository not found");
  const connected = assertConnectedRepository(repository);
  const access = await resolveGitHubAppAccess(ctx, {
    userId: args.userId,
    target: { kind: "repository", repositoryId: args.repositoryId },
  });
  return {
    ctx,
    component: components.gitEditor,
    octokit: access.octokit,
    userId: args.userId,
    repository: {
      repositoryId: args.repositoryId,
      githubOwnerLogin: access.githubOwnerLogin,
      githubRepositoryName: connected.githubRepositoryName,
      defaultBranch: connected.defaultBranch,
    },
    host: {
      initializeBinaryFile: internal.fileStaging.initializeBinaryFile,
      saveToStaging: internal.fileStaging.saveToStaging,
      saveBinaryUploadToStaging: internal.fileStaging.saveBinaryUploadToStaging,
      duplicateBranchStaging: internal.fileStaging.duplicateBranchStaging,
      clearMatchingStagingSnapshot: internal.fileStaging.clearMatchingStagingSnapshot,
      clearCommittedStaging: internal.fileStaging.clearCommittedStaging,
      clearAllStagingForOperation: internal.fileStaging.clearAllStagingForOperation,
      reconcileStagingWithTree: internal.fileStaging.reconcileStagingWithTree,
      createFileInStagingForOperation: internal.fileStaging.createFileInStagingForOperation,
      rename: internal.fileStaging.rename,
      pushContentUpdate: internal.collaborative.pushContentUpdate,
      saveFileBlob: internal.gitOperations.saveFileBlob,
      assertWriteAccess: internal.fileStaging.assertWriteAccess,
    },
    refreshBranch: async (branch) => {
      await ctx.runAction(internal.github.updateRepositoryTree, {
        userId: args.userId,
        repositoryId: args.repositoryId,
        branch,
      });
      const refreshed = await ctx.runQuery(internal.repository.records.getByRepositoryFullName, {
        githubRepositoryFullName: access.githubOwnerLogin + "/" + connected.githubRepositoryName,
        userId: args.userId,
        branch,
      });
      return refreshed !== null;
    },
  };
}
// MARK: Public

// Rename a file in staging (updates the filePath while keeping initialFilePath)
export const renameFileInStaging = action({
  access: "access_files_write",
  args: {
    repositoryId: v.id("repositories"),
    originalPath: v.string(),
    newPath: v.string(),
    branch: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    content: string;
  }> => {
    const workspace = await getWorkspace(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    if (args.branch === undefined) throw new Error("Branch is required to rename a staged file");
    return await workspaceOperations.renameFile(workspace, {
      originalPath: args.originalPath,
      newPath: args.newPath,
      branch: args.branch,
    });
  },
});

/**
 * Initial request to get the file.
 * Calls GitHub and saves the file in the Git editor component.
 */
export const getFileForEditing = action({
  access: "access_files_read",
  args: {
    githubRepositoryFullName: v.string(),
    originalFilePath: v.string(),
    branch: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<EditableFileState> => {
    return await ctx.runAction(internal.fileStagingActions.getFileForEditingInternal, {
      githubRepositoryFullName: args.githubRepositoryFullName,
      originalFilePath: args.originalFilePath,
      branch: args.branch,
      userId: ctx.viewer.userId,
    });
  },
});

export const getFileForEditingInternal = internalAction({
  args: {
    githubRepositoryFullName: v.string(),
    originalFilePath: v.string(),
    branch: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<EditableFileState> => {
    const userId = args.userId;
    const repository = await ctx.runQuery(internal.repository.records.getByRepositoryFullName, {
      githubRepositoryFullName: args.githubRepositoryFullName,
      userId,
    });
    if (!repository) throw new Error("Repository not found");
    const workspace = await getWorkspace(ctx, { repositoryId: repository.repositoryId, userId });
    return await workspaceOperations.openFile(workspace, {
      originalFilePath: args.originalFilePath,
      branch: args.branch,
    });
  },
});

/**
 * Stages a newly uploaded image by computing the same Git blob SHA GitHub will
 * use later, then persisting the upload through binary staging so previews and
 * commit generation stay deterministic. `replaceExisting` only applies to an
 * existing target path, and an omitted branch falls back to the repo default.
 */
export const stageUploadedMedia = action({
  access: "access_files_write",
  args: {
    githubRepositoryFullName: string(),
    repositoryId: v.id("repositories"),
    filePath: string(),
    storageId: string(),
    branch: optional(string()),
    replaceExisting: boolean(),
  },
  returns: stagedMediaUploadResult,
  handler: async (ctx, args): Promise<StagedMediaUploadResult> => {
    const userId = ctx.viewer.userId;
    const repository = await ctx.runQuery(internal.repository.records.getByRepositoryFullName, {
      githubRepositoryFullName: args.githubRepositoryFullName,
      userId,
    });
    if (!repository) throw new Error("Repository not found");
    const workspace = await getWorkspace(ctx, { repositoryId: repository.repositoryId, userId });
    if (repository.repositoryId !== args.repositoryId) throw new Error("Repository not found");
    await ctx.runMutation(internal.fileStaging.assertWriteAccess, {
      repositoryId: args.repositoryId,
      userId,
    });
    return await workspaceOperations.stageUploadedMedia(workspace, {
      filePath: args.filePath,
      storageId: args.storageId,
      branch: args.branch,
      replaceExisting: args.replaceExisting,
    });
  },
});

// Commit staged file to GitHub
export const commitStaging = action({
  access: "access_files_write",
  args: {
    githubRepositoryFullName: v.string(),
    branch: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;

    // Get the repository information while we have auth context
    const repository = await ctx.runQuery(internal.repository.records.getByRepositoryFullName, {
      githubRepositoryFullName: args.githubRepositoryFullName,
      userId,
    });
    if (!repository) {
      throw new Error("Repository not found");
    }

    // Commit all staged files to GitHub
    // commitAllStaged handles: commit → update tree → save blobs → clear staging
    await ctx.runAction(internal.fileStagingActions.commitAllStaged, {
      userId,
      repositoryId: repository.repositoryId,
      branch: args.branch,
    });

    return null;
  },
});

export const createDraftPullRequest = action({
  access: "access_files_write",
  args: {
    githubRepositoryFullName: string(),
    branch: optional(string()),
  },
  returns: draftPullRequestResult,
  handler: async (ctx, args): Promise<DraftPullRequestResult> => {
    const userId = ctx.viewer.userId;
    const repository = await ctx.runQuery(internal.repository.records.getByRepositoryFullName, {
      githubRepositoryFullName: args.githubRepositoryFullName,
      userId,
    });
    if (!repository) throw new Error("Repository not found");
    const workspace = await getWorkspace(ctx, { repositoryId: repository.repositoryId, userId });
    return await workspaceOperations.createDraftPullRequest(workspace, { branch: args.branch });
  },
});

export const createDraftPullRequestFromDefaultBranch = action({
  access: "access_files_write",
  args: {
    githubRepositoryFullName: string(),
    branch: optional(string()),
  },
  returns: defaultBranchDraftPullRequestResult,
  handler: async (ctx, args): Promise<DefaultBranchDraftPullRequestResult> => {
    const userId = ctx.viewer.userId;
    const repository = await ctx.runQuery(internal.repository.records.getByRepositoryFullName, {
      githubRepositoryFullName: args.githubRepositoryFullName,
      userId,
    });
    if (!repository) throw new Error("Repository not found");
    const workspace = await getWorkspace(ctx, { repositoryId: repository.repositoryId, userId });
    return await workspaceOperations.createDraftPullRequestFromDefaultBranch(workspace, {
      branch: args.branch,
    });
  },
});

// Pull the latest tree from GitHub and reconcile with staged files.
// Staged files with real edits are rebased onto GitHub; conflicts get markers.
// Unchanged staging records are cleaned up.
export const pullFromGitHub = action({
  access: "access_files_write",
  args: {
    repositoryId: v.id("repositories"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;

    await ctx.runAction(internal.fileStagingActions.pullFromGitHubInternal, {
      userId,
      repositoryId: args.repositoryId,
    });

    return null;
  },
});

// Internal action that performs the actual pull logic
export const pullFromGitHubInternal = internalAction({
  args: {
    userId: v.id("users"),
    repositoryId: v.id("repositories"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const workspace = await getWorkspace(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });
    return await workspaceOperations.pullFromGitHub(workspace);
  },
});

// Batch-fetch file contents (read-only, no staging records).
// Used by the Monaco editor to load project files for TypeScript import resolution.
export const batchReadFiles = action({
  access: "access_files_read",
  args: {
    repositoryId: v.id("repositories"),
    branch: v.optional(v.string()),
    filePaths: v.array(v.string()),
  },
  returns: v.array(v.object({ path: v.string(), content: v.string() })),
  handler: async (ctx, args) => {
    const workspace = await getWorkspace(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    return await workspaceOperations.batchReadFiles(workspace, {
      branch: args.branch,
      filePaths: args.filePaths,
    });
  },
});

export const getCommitPreview = action({
  access: "access_files_read",
  args: {
    githubRepositoryFullName: v.string(),
    branch: v.optional(v.string()),
    includePatch: v.optional(v.boolean()),
  },
  returns: commitPreviewResult,
  handler: async (ctx, args): Promise<CommitPreviewResult> => {
    const userId = ctx.viewer.userId;
    const repository = await ctx.runQuery(internal.repository.records.getByRepositoryFullName, {
      githubRepositoryFullName: args.githubRepositoryFullName,
      userId,
    });
    if (!repository) throw new Error("Repository not found");
    const workspace = await getWorkspace(ctx, { repositoryId: repository.repositoryId, userId });
    return await workspaceOperations.getCommitPreview(workspace, {
      branch: args.branch,
      includePatch: args.includePatch,
    });
  },
});

export const getBranchComparePreview = action({
  access: "access_files_read",
  args: {
    githubRepositoryFullName: v.string(),
    branch: v.optional(v.string()),
    includePatch: v.optional(v.boolean()),
  },
  returns: branchComparePreviewResult,
  handler: async (ctx, args): Promise<BranchComparePreviewResult> => {
    const userId = ctx.viewer.userId;
    const repository = await ctx.runQuery(internal.repository.records.getByRepositoryFullName, {
      githubRepositoryFullName: args.githubRepositoryFullName,
      userId,
    });
    if (!repository) throw new Error("Repository not found");
    const workspace = await getWorkspace(ctx, { repositoryId: repository.repositoryId, userId });
    return await workspaceOperations.getBranchComparePreview(workspace, {
      branch: args.branch,
      includePatch: args.includePatch,
    });
  },
});

export const restoreComparedDeletedFileToStaging = action({
  access: "access_files_write",
  args: {
    githubRepositoryFullName: v.string(),
    branch: v.optional(v.string()),
    filePath: v.string(),
    previousPath: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = ctx.viewer.userId;
    const repository = await ctx.runQuery(internal.repository.records.getByRepositoryFullName, {
      githubRepositoryFullName: args.githubRepositoryFullName,
      userId,
    });
    if (!repository) throw new Error("Repository not found");
    const workspace = await getWorkspace(ctx, { repositoryId: repository.repositoryId, userId });
    return await workspaceOperations.restoreComparedDeletedFileToStaging(workspace, {
      branch: args.branch,
      filePath: args.filePath,
      previousPath: args.previousPath,
    });
  },
});

export const getRebaseConflictPreview = action({
  access: "access_files_read",
  args: {
    githubRepositoryFullName: v.string(),
    branch: v.optional(v.string()),
  },
  returns: rebaseConflictPreviewResult,
  handler: async (ctx, args): Promise<RebaseConflictPreviewResult> => {
    const userId = ctx.viewer.userId;
    const repository = await ctx.runQuery(internal.repository.records.getByRepositoryFullName, {
      githubRepositoryFullName: args.githubRepositoryFullName,
      userId,
    });
    if (!repository) throw new Error("Repository not found");
    const workspace = await getWorkspace(ctx, { repositoryId: repository.repositoryId, userId });
    return await workspaceOperations.getRebaseConflictPreview(workspace, { branch: args.branch });
  },
});

export const getRebaseConflictBundle = action({
  access: "access_files_read",
  args: {
    githubRepositoryFullName: v.string(),
    branch: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const userId = ctx.viewer.userId;
    const repository = await ctx.runQuery(internal.repository.records.getByRepositoryFullName, {
      githubRepositoryFullName: args.githubRepositoryFullName,
      userId,
    });
    if (!repository) throw new Error("Repository not found");
    const workspace = await getWorkspace(ctx, { repositoryId: repository.repositoryId, userId });
    return await workspaceOperations.getRebaseConflictBundle(workspace, { branch: args.branch });
  },
});

// MARK: Internal

// Internal action to commit all staged files to GitHub
export const commitAllStaged = internalAction({
  args: {
    userId: v.id("users"),
    repositoryId: v.id("repositories"),
    branch: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const workspace = await getWorkspace(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });
    return await workspaceOperations.commitAllStaged(workspace, { branch: args.branch });
  },
});
