"use node";
// This module uses Octokit and Buffer decoding in Convex actions, so Node runtime is required.

import { action, internalAction, type ActionCtx } from "./_generated/server";
import { v, type Infer } from "convex/values";
import { api, internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { createTwoFilesPatch, diffLines } from "diff";
import { getUserId } from "./common";
import type { Id } from "./_generated/dataModel";
import {
  guessMime,
  INLINE_TEXT_MAX,
  isTextBuffer,
  withRetry,
} from "./gitOperationsActions";
import { isObjectRecord as isRecord } from "./jsonUtils";
import { rebaseStagedContent } from "./stagingRebase";
import type { CommitConflictReason } from "../shared/commitConflicts";

type HeaderValue = string | number | readonly string[] | undefined;
type HeaderMap = Record<string, HeaderValue>;

const githubRateLimitResetByUser = new Map<string, number>();
const RATE_LIMIT_COOLDOWN_FALLBACK_MS = 60_000;
const STORAGE_BACKED_FILE_ERROR_MESSAGE =
  "File is in storage, not implemented yet";

async function getGithubAccessToken(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<string> {
  const connection = await ctx.runQuery(
    internal.providerConnections.getByUserAndKind,
    {
      userId,
      kind: "github",
    },
  );
  if (connection?.kind !== "github") {
    throw new Error("GitHub is not connected");
  }
  return connection.auth.credential;
}

function readDefaultBranch(repoData: unknown): string {
  if (!isRecord(repoData)) {
    return "main";
  }

  const defaultBranch = repoData.default_branch;
  if (typeof defaultBranch === "string" && defaultBranch.length > 0) {
    return defaultBranch;
  }

  return "main";
}

async function getRepositoryDefaultBranch(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
}): Promise<string> {
  const response = await args.octokit.rest.repos.get({
    owner: args.owner,
    repo: args.repo,
  });
  return readDefaultBranch(response.data);
}

async function getVaultDefaultBranch(
  ctx: ActionCtx,
  userId: Id<"users">,
  owner: string,
  repo: string,
): Promise<string> {
  const githubAccessToken = await getGithubAccessToken(ctx, userId);
  const octokit: Octokit = new Octokit({
    auth: githubAccessToken,
  });
  return getRepositoryDefaultBranch({
    octokit,
    owner,
    repo,
  });
}

function toHeaderMap(value: unknown): HeaderMap | null {
  if (!isRecord(value)) {
    return null;
  }

  const headers: HeaderMap = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (
      typeof headerValue === "string" ||
      typeof headerValue === "number" ||
      headerValue === undefined
    ) {
      headers[key] = headerValue;
      continue;
    }

    if (
      Array.isArray(headerValue) &&
      headerValue.every((item) => typeof item === "string")
    ) {
      headers[key] = headerValue;
    }
  }

  return headers;
}

function getHeaderValue(
  headers: HeaderMap | null,
  name: string,
): string | null {
  if (!headers) {
    return null;
  }

  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) {
      continue;
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.length > 0 ? value[0] : null;
    }
    return null;
  }

  return null;
}

function parsePositiveInteger(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getErrorHeaders(error: unknown): HeaderMap | null {
  if (!isRecord(error)) {
    return null;
  }

  const response = error.response;
  if (!isRecord(response)) {
    return null;
  }

  return toHeaderMap(response.headers);
}

function getErrorStatus(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }
  const status = error.status;
  return typeof status === "number" ? status : null;
}

function getErrorMessage(error: unknown): string {
  if (!isRecord(error)) {
    return "";
  }
  const message = error.message;
  return typeof message === "string" ? message : "";
}

function isStorageBackedFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === STORAGE_BACKED_FILE_ERROR_MESSAGE
  );
}

function isGitHubRateLimitError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 429) {
    return true;
  }
  if (status !== 403) {
    return false;
  }

  const headers = getErrorHeaders(error);
  const remaining = getHeaderValue(headers, "x-ratelimit-remaining");
  if (remaining === "0") {
    return true;
  }

  return getErrorMessage(error).toLowerCase().includes("rate limit");
}

function getRateLimitResetAtMsFromError(error: unknown): number | null {
  const headers = getErrorHeaders(error);
  const now = Date.now();

  const retryAfterSeconds = parsePositiveInteger(
    getHeaderValue(headers, "retry-after"),
  );
  const resetAtSeconds = parsePositiveInteger(
    getHeaderValue(headers, "x-ratelimit-reset"),
  );

  const candidates: number[] = [];
  if (retryAfterSeconds !== null) {
    candidates.push(now + retryAfterSeconds * 1000);
  }
  if (resetAtSeconds !== null) {
    candidates.push(resetAtSeconds * 1000);
  }

  if (candidates.length === 0) {
    return null;
  }

  const earliestResetAt = Math.min(...candidates);
  return earliestResetAt > now ? earliestResetAt : now;
}

function getKnownRateLimitResetAtMs(userId: string): number | null {
  const resetAtMs = githubRateLimitResetByUser.get(userId);
  if (typeof resetAtMs !== "number") {
    return null;
  }

  if (resetAtMs <= Date.now()) {
    githubRateLimitResetByUser.delete(userId);
    return null;
  }

  return resetAtMs;
}

function rememberRateLimitResetAtMs(userId: string, error: unknown): number {
  const resetAtMs =
    getRateLimitResetAtMsFromError(error) ??
    Date.now() + RATE_LIMIT_COOLDOWN_FALLBACK_MS;
  githubRateLimitResetByUser.set(userId, resetAtMs);
  return resetAtMs;
}

const commitPreviewFileStatus = v.union(
  v.literal("added"),
  v.literal("modified"),
  v.literal("deleted"),
  v.literal("renamed"),
);

const commitPreviewFile = v.object({
  status: commitPreviewFileStatus,
  path: v.string(),
  previousPath: v.optional(v.string()),
  additions: v.number(),
  deletions: v.number(),
  oldLineCount: v.number(),
  newLineCount: v.number(),
  isMarkdown: v.boolean(),
  richOldContent: v.optional(v.string()),
  richNewContent: v.optional(v.string()),
  richContentTruncated: v.optional(v.boolean()),
  patchTruncated: v.boolean(),
  patch: v.optional(v.string()),
});

const commitPreviewTotals = v.object({
  files: v.number(),
  added: v.number(),
  modified: v.number(),
  deleted: v.number(),
  renamed: v.number(),
  additions: v.number(),
  deletions: v.number(),
});

const commitPreviewResult = v.object({
  branch: v.string(),
  hasDestructiveChanges: v.boolean(),
  files: v.array(commitPreviewFile),
  totals: commitPreviewTotals,
  safety: v.object({
    destructiveFileCount: v.number(),
    truncatedPatchFileCount: v.number(),
    includesTruncatedPatches: v.boolean(),
  }),
});

type CommitPreviewFile = Infer<typeof commitPreviewFile>;
type CommitPreviewTotals = Infer<typeof commitPreviewTotals>;
type CommitPreviewResult = Infer<typeof commitPreviewResult>;

type StagedFileForCommit = {
  filePath: string;
  initialFilePath: string;
  content: string;
  initialContent: string;
  fileDeleted: boolean;
  parentCommitSha: string | null;
  branch: string;
};

const MAX_COMMIT_PREVIEW_PATCH_CHARS_PER_FILE = 25_000;
const MAX_COMMIT_PREVIEW_PATCH_CHARS_TOTAL = 150_000;
const MAX_COMMIT_PREVIEW_MARKDOWN_RICH_CHARS_PER_FIELD = 40_000;

function truncateMarkdownRichContent(content: string): {
  content: string;
  truncated: boolean;
} {
  if (content.length <= MAX_COMMIT_PREVIEW_MARKDOWN_RICH_CHARS_PER_FIELD) {
    return { content, truncated: false };
  }

  const suffix = "\n\n... [content truncated for rich preview]";
  const sliceLength = Math.max(
    0,
    MAX_COMMIT_PREVIEW_MARKDOWN_RICH_CHARS_PER_FIELD - suffix.length,
  );

  return {
    content: `${content.slice(0, sliceLength)}${suffix}`,
    truncated: true,
  };
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  return content.split("\n").length;
}

function computeLineStats(
  oldContent: string,
  newContent: string,
): {
  additions: number;
  deletions: number;
} {
  const parts = diffLines(oldContent, newContent);
  let additions = 0;
  let deletions = 0;

  for (const part of parts) {
    const value = part.value ?? "";
    const lineCount =
      typeof part.count === "number"
        ? part.count
        : value.length === 0
          ? 0
          : value.split("\n").length;

    if (part.added) additions += lineCount;
    if (part.removed) deletions += lineCount;
  }

  return { additions, deletions };
}

function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.endsWith(".md") ||
    lower.endsWith(".mdx") ||
    lower.endsWith(".markdown")
  );
}

export function buildCommitPreviewFromStagedFiles({
  stagedFiles,
  branch,
  includePatch,
}: {
  stagedFiles: StagedFileForCommit[];
  branch: string;
  includePatch: boolean;
}): CommitPreviewResult {
  const files: CommitPreviewFile[] = [];
  let totalPatchChars = 0;
  let truncatedPatchFileCount = 0;

  for (const file of stagedFiles) {
    const oldContent = file.initialContent ?? "";
    const newContent = file.fileDeleted ? "" : file.content ?? "";
    const renamed = file.filePath !== file.initialFilePath;
    const isMarkdown = isMarkdownPath(file.filePath);
    const status = file.fileDeleted
      ? ("deleted" as const)
      : file.parentCommitSha === null
        ? ("added" as const)
        : renamed
          ? ("renamed" as const)
          : ("modified" as const);
    const lineStats = computeLineStats(oldContent, newContent);

    let richOldContent: string | undefined;
    let richNewContent: string | undefined;
    let richContentTruncated: boolean | undefined;
    if (isMarkdown) {
      const truncatedOld = truncateMarkdownRichContent(oldContent);
      const truncatedNew = truncateMarkdownRichContent(newContent);
      richOldContent = truncatedOld.content;
      richNewContent = truncatedNew.content;
      richContentTruncated = truncatedOld.truncated || truncatedNew.truncated;
    }

    let patch: string | undefined;
    let patchTruncated = false;
    if (includePatch && !(status === "renamed" && oldContent === newContent)) {
      const fullPatch = createTwoFilesPatch(
        file.initialFilePath,
        file.filePath,
        oldContent,
        newContent,
        "",
        "",
        { context: 3 },
      );
      let boundedPatch = fullPatch;
      if (boundedPatch.length > MAX_COMMIT_PREVIEW_PATCH_CHARS_PER_FILE) {
        boundedPatch = `${boundedPatch.slice(0, MAX_COMMIT_PREVIEW_PATCH_CHARS_PER_FILE)}\n... [patch truncated]`;
        patchTruncated = true;
      }

      const remainingBudget = Math.max(
        0,
        MAX_COMMIT_PREVIEW_PATCH_CHARS_TOTAL - totalPatchChars,
      );
      if (boundedPatch.length > remainingBudget) {
        if (remainingBudget > 0) {
          boundedPatch = `${boundedPatch.slice(0, remainingBudget)}\n... [patch truncated]`;
        } else {
          boundedPatch = "... [patch truncated]";
        }
        patchTruncated = true;
      }

      patch = boundedPatch;
      totalPatchChars += patch.length;
    }

    if (patchTruncated) {
      truncatedPatchFileCount += 1;
    }

    files.push({
      status,
      path: file.filePath,
      previousPath: renamed ? file.initialFilePath : undefined,
      additions: lineStats.additions,
      deletions: lineStats.deletions,
      oldLineCount: countLines(oldContent),
      newLineCount: countLines(newContent),
      isMarkdown,
      richOldContent,
      richNewContent,
      richContentTruncated,
      patchTruncated,
      patch,
    });
  }

  const totals = files.reduce<CommitPreviewTotals>(
    (acc, file) => {
      acc.files += 1;
      acc.additions += file.additions;
      acc.deletions += file.deletions;

      if (file.status === "added") acc.added += 1;
      if (file.status === "modified") acc.modified += 1;
      if (file.status === "deleted") acc.deleted += 1;
      if (file.status === "renamed") acc.renamed += 1;

      return acc;
    },
    {
      files: 0,
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
      additions: 0,
      deletions: 0,
    },
  );

  return {
    branch,
    hasDestructiveChanges: totals.deleted > 0,
    files,
    totals,
    safety: {
      destructiveFileCount: totals.deleted,
      truncatedPatchFileCount,
      includesTruncatedPatches: truncatedPatchFileCount > 0,
    },
  };
}

// MARK: Public

// Rename a file in staging (updates the filePath while keeping initialFilePath)
export const renameFileInStaging = action({
  args: {
    vaultId: v.id("vaults"),
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
    await getUserId(ctx);

    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    // So that we guarantee that we have the file in staging
    await ctx.runAction(api.fileStagingActions.getFileForEditing, {
      repositoryFullName: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
      originalFilePath: args.originalPath,
      branch: args.branch,
    });

    // Update existing staging record with new path
    const updatedFile = await ctx.runMutation(internal.fileStaging.rename, {
      vaultId: args.vaultId,
      initialFilePath: args.originalPath,
      newPath: args.newPath,
    });

    const {
      content: _content,
      initialContent: _initialContent,
      ...rest
    } = updatedFile;

    return {
      content: updatedFile.content,
    };
  },
});

/**
 * Initial request to get the file.
 * Will call GitHub and populate the fileStaging table
 */
export const getFileForEditing = action({
  args: {
    repositoryFullName: v.string(),
    originalFilePath: v.string(),
    branch: v.optional(v.string()),
  },

  handler: async (
    ctx,
    args,
  ): Promise<{
    content: string;
    parentCommitSha: string | null;
    lastEditTime: number;
    branch: string;
    version: number;
  }> => {
    const userId = await getUserId(ctx);
    const githubAccessToken = await getGithubAccessToken(ctx, userId);

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    const octokit: Octokit = new Octokit({
      auth: githubAccessToken,
    });
    const targetBranch =
      args.branch ??
      (await getRepositoryDefaultBranch({
        octokit,
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
      }));

    // Check if there's staged content for this file
    const staging = await ctx.runQuery(internal.fileStaging.getByOriginalPath, {
      vaultId: vault._id,
      originalFilePath: args.originalFilePath,
    });

    // TODO: Maybe also check the github, if it has updates
    if (staging) {
      // Return staged content
      return {
        content: staging.content,
        parentCommitSha: staging.parentCommitSha,
        lastEditTime: staging.lastEditTime,
        branch: staging.branch,
        version: staging.version,
      };
    }

    // console.log("vault.treeData", vault.treeData);
    console.log("args.originalFilePath", args.originalFilePath);

    // read from blobs table
    const fileSha = vault.treeData.tree.find(
      (t: { path: string }) => t.path === args.originalFilePath,
    )?.sha;

    if (!fileSha) {
      throw new Error("File not found in tree");
    }

    // Try getting it from blob sha
    try {
      const blobFile = await ctx.runQuery(internal.gitOperations.getBlobBySha, {
        sha: fileSha,
      });

      if (blobFile) {
        if (typeof blobFile.text !== "string") {
          throw new Error(STORAGE_BACKED_FILE_ERROR_MESSAGE);
        }

        // create new staging record
        const stagedFile = await ctx.runMutation(
          internal.fileStaging.saveToStaging,
          {
            branch: targetBranch,
            vaultId: vault._id,
            initialFilePath: args.originalFilePath,
            content: blobFile.text,
            initialContent: blobFile.text,
            parentCommitSha: fileSha,
          },
        );

        return {
          content: stagedFile.content,
          parentCommitSha: stagedFile.parentCommitSha,
          lastEditTime: stagedFile.lastEditTime,
          branch: stagedFile.branch,
          version: stagedFile.version,
        };
      }

      // Otherwise get from github

      try {
        const file = await octokit.rest.repos.getContent({
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          path: args.originalFilePath,
          ref: targetBranch,
        });

        // Handle case where path is a directory (shouldn't happen in our use case)
        if (Array.isArray(file.data)) {
          throw new Error("Path is a directory");
        }

        if (file.data.type !== "file") {
          throw new Error("Path is not a file");
        }

        const filePath = file.data.path;
        const fileData = file.data;
        const buffer = Buffer.from(fileData.content, "base64");
        const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
        const isText = isTextBuffer(new Uint8Array(buffer));
        let mime = guessMime(filePath);
        if (mime === "application/octet-stream" && isText) {
          mime = "text/plain; charset=utf-8";
        }

        if (isText && fileData.size < INLINE_TEXT_MAX) {
          await ctx.runMutation(internal.gitOperations.saveFileBlob, {
            vaultId: vault._id,
            sha: fileSha,
            size: fileData.size,
            mime: fileData.type,
            text: buffer.toString("utf-8"),
            storageId: undefined,
            ext,
            debugFilePath: filePath,
          });
        } else {
          // store in storage
          const storageId = await withRetry(() =>
            ctx.storage.store(new Blob([buffer], { type: mime })),
          );

          await ctx.runMutation(internal.gitOperations.saveFileBlob, {
            vaultId: vault._id,
            sha: fileSha,
            size: fileData.size,
            mime: fileData.type,
            text: undefined,
            storageId,
            ext,
            debugFilePath: filePath,
          });
        }

        const blobFile = await ctx.runQuery(
          internal.gitOperations.getBlobBySha,
          {
            sha: fileSha,
          },
        );

        if (!blobFile) {
          throw new Error(
            "File not found in blobs table after literally saving it there?!?",
          );
        }

        if (typeof blobFile.text !== "string") {
          throw new Error(STORAGE_BACKED_FILE_ERROR_MESSAGE);
        }

        const stagedFile = await ctx.runMutation(
          internal.fileStaging.saveToStaging,
          {
            branch: targetBranch,
            vaultId: vault._id,
            initialFilePath: args.originalFilePath,
            content: blobFile.text,
            initialContent: blobFile.text,
            parentCommitSha: fileSha,
          },
        );

        return {
          content: stagedFile.content,
          parentCommitSha: stagedFile.parentCommitSha,
          lastEditTime: stagedFile.lastEditTime,
          branch: stagedFile.branch,
          version: stagedFile.version,
        };
      } catch (error) {
        if (!isStorageBackedFileError(error)) {
          console.error("error", error);
        }
        throw error;
      }
    } catch (error) {
      if (!isStorageBackedFileError(error)) {
        console.error("error", error);
      }
      throw error;
    }
  },
});

// Commit staged file to GitHub
export const commitStaging = action({
  args: {
    repositoryFullName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    // Get the vault information while we have auth context
    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    // Commit all staged files to GitHub
    // commitAllStaged handles: commit → update tree → save blobs → clear staging
    await ctx.runAction(internal.fileStagingActions.commitAllStaged, {
      userId,
      vaultId: vault._id,
      repoOwner: vault.ghRepoOwner,
      repoName: vault.ghRepoName,
    });

    return null;
  },
});

// Pull the latest tree from GitHub and reconcile with staged files.
// Staged files with real edits are rebased onto GitHub; conflicts get markers.
// Unchanged staging records are cleaned up.
export const pullFromGitHub = action({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    // Atomically claim the refresh lock; force because user explicitly requested pull
    const { claimed } = await ctx.runMutation(internal.vault.claimTreeRefresh, {
      vaultId: vault._id,
      force: true,
    });
    if (!claimed) return null;

    try {
      await ctx.runAction(internal.fileStagingActions.pullFromGitHubInternal, {
        userId,
        vaultId: args.vaultId,
      });
    } finally {
      await ctx.runMutation(internal.vault.releaseTreeRefresh, {
        vaultId: vault._id,
      });
    }

    return null;
  },
});

// Internal action that performs the actual pull logic
export const pullFromGitHubInternal = internalAction({
  args: {
    userId: v.id("users"),
    vaultId: v.id("vaults"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const githubAccessToken = await getGithubAccessToken(ctx, args.userId);

    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    const octokit = new Octokit({
      auth: githubAccessToken,
    });

    // 1. Fetch fresh tree from GitHub
    const tree = await octokit.rest.git.getTree({
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
      tree_sha: "HEAD",
      recursive: "1",
    });

    const newTree = tree.data;

    // Build a map of path → sha for quick lookups
    const treeMap = new Map<string, string>();
    for (const item of newTree.tree) {
      if (item.path && item.sha) {
        treeMap.set(item.path, item.sha);
      }
    }

    // 2. Read all staging records for this vault (including unchanged)
    const allStaged = await ctx.runQuery(api.fileStaging.listStagedFiles, {
      vaultId: args.vaultId,
      includeUnchanged: true,
    });

    // 3. Build reconciliation instructions
    type Instruction =
      | { action: "delete"; stagingId: (typeof allStaged)[0]["_id"] }
      | {
          action: "update";
          stagingId: (typeof allStaged)[0]["_id"];
          parentCommitSha: string | null;
          initialContent?: string;
        };

    const instructions: Instruction[] = [];
    const blobFetchQueue: Array<{
      stagingId: (typeof allStaged)[0]["_id"];
      sha: string;
      filePath: string;
      stagedContent: string;
      initialContent: string;
      fileDeleted: boolean;
    }> = [];

    for (const staged of allStaged) {
      const isEdited =
        staged.content !== staged.initialContent ||
        staged.fileDeleted ||
        staged.filePath !== staged.initialFilePath;
      const isNewFile = staged.parentCommitSha === null;

      // Rule 6: New file in staging → always keep
      if (isNewFile) {
        continue;
      }

      const pathInTree = staged.initialFilePath;
      const newSha = treeMap.get(pathInTree);
      const fileExistsOnGitHub = newSha !== undefined;

      if (!isEdited) {
        // Content === initialContent (unchanged edit)
        // Rule 3 & 4: drop the staging record regardless of GitHub state
        instructions.push({ action: "delete", stagingId: staged._id });
        continue;
      }

      // File has real edits (noter wins)
      if (!fileExistsOnGitHub) {
        // Rule 2: Deleted on GitHub but edited in noter → treat as new file
        instructions.push({
          action: "update",
          stagingId: staged._id,
          parentCommitSha: null,
        });
      } else if (newSha !== staged.parentCommitSha) {
        // File exists on GitHub with a new SHA → need to fetch new content
        // for initialContent update, but preserve user's content
        blobFetchQueue.push({
          stagingId: staged._id,
          sha: newSha,
          filePath: staged.filePath,
          stagedContent: staged.content,
          initialContent: staged.initialContent,
          fileDeleted: staged.fileDeleted,
        });
      }
      // else: same SHA → no change needed (Rule 5)
    }

    // 4. Fetch blobs for files that changed on GitHub (need new initialContent)
    for (const item of blobFetchQueue) {
      try {
        const blob = await octokit.rest.git.getBlob({
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          file_sha: item.sha,
        });
        const buffer = Buffer.from(blob.data.content, "base64");
        const newContent = buffer.toString("utf-8");
        if (!item.fileDeleted) {
          const rebaseResult = rebaseStagedContent({
            baseContent: item.initialContent,
            stagedContent: item.stagedContent,
            upstreamContent: newContent,
          });

          if (rebaseResult.content !== item.stagedContent) {
            await ctx.runMutation(internal.collaborative.pushContentUpdate, {
              vaultId: args.vaultId,
              filePath: item.filePath,
              newContent: rebaseResult.content,
              userId: args.userId,
            });
          }
        }

        instructions.push({
          action: "update",
          stagingId: item.stagingId,
          parentCommitSha: item.sha,
          initialContent: newContent,
        });
      } catch (error) {
        console.error(`Failed to fetch blob ${item.sha}:`, error);
        // Still update the parentCommitSha even if we can't get content
        instructions.push({
          action: "update",
          stagingId: item.stagingId,
          parentCommitSha: item.sha,
        });
      }
    }

    // 5. Apply reconciliation instructions
    if (instructions.length > 0) {
      await ctx.runMutation(internal.fileStaging.reconcileStagingWithTree, {
        vaultId: args.vaultId,
        instructions,
      });
    }

    // 6. Update the vault tree
    await ctx.runMutation(internal.vault.updateVaultTree, {
      vaultId: args.vaultId,
      treeData: newTree,
    });

    return null;
  },
});

// Batch-fetch file contents (read-only, no staging records).
// Used by the Monaco editor to load project files for TypeScript import resolution.
export const batchReadFiles = action({
  args: {
    vaultId: v.id("vaults"),
    filePaths: v.array(v.string()),
  },
  returns: v.array(v.object({ path: v.string(), content: v.string() })),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const githubAccessToken = await getGithubAccessToken(ctx, userId);

    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    // Build a map of path → tree entry for fast lookups
    const treeMap = new Map<string, { sha: string; size?: number }>();
    for (const item of vault.treeData.tree) {
      if (item.type === "blob" && item.sha) {
        treeMap.set(item.path, { sha: item.sha, size: item.size });
      }
    }

    const uniqueFilePaths = Array.from(new Set(args.filePaths));
    const MAX_FILE_SIZE = 100_000; // 100KB – skip large generated files
    const results: Array<{ path: string; content: string }> = [];
    const misses: Array<{ path: string; sha: string }> = [];

    for (const filePath of uniqueFilePaths) {
      const entry = treeMap.get(filePath);
      if (!entry) continue; // file not in tree, skip

      // Skip files that are too large
      if (entry.size !== undefined && entry.size > MAX_FILE_SIZE) continue;

      // 1. Try blob cache
      const cached = await ctx.runQuery(internal.gitOperations.getBlobBySha, {
        sha: entry.sha,
      });

      if (cached && typeof cached.text === "string") {
        results.push({ path: filePath, content: cached.text });
        continue;
      }

      misses.push({ path: filePath, sha: entry.sha });
    }

    // Lazily create Octokit only if we need to hit GitHub
    let octokit: Octokit | null = null;
    const getOctokit = () => {
      if (!octokit) {
        octokit = new Octokit({ auth: githubAccessToken });
      }
      return octokit;
    };

    for (const miss of misses) {
      const knownResetAtMs = getKnownRateLimitResetAtMs(userId);
      if (knownResetAtMs !== null) {
        console.warn(
          "batchReadFiles: skipping uncached GitHub reads due to active rate-limit cooldown",
          {
            userId,
            resetAtMs: knownResetAtMs,
          },
        );
        break;
      }

      // 2. Fetch from GitHub (blob API by SHA – lightweight)
      try {
        const blob = await getOctokit().rest.git.getBlob({
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          file_sha: miss.sha,
        });

        const buffer = Buffer.from(blob.data.content, "base64");

        // Skip binary files
        if (!isTextBuffer(new Uint8Array(buffer))) continue;

        const text = buffer.toString("utf-8");

        // Cache in blob store for future reads
        if (buffer.byteLength <= INLINE_TEXT_MAX) {
          const ext = miss.path.split(".").pop()?.toLowerCase() ?? "";
          await ctx.runMutation(internal.gitOperations.saveFileBlob, {
            vaultId: vault._id,
            sha: miss.sha,
            size: buffer.byteLength,
            text,
            storageId: undefined,
            ext,
            mime: "text/plain; charset=utf-8",
            debugFilePath: miss.path,
          });
        }

        results.push({ path: miss.path, content: text });
      } catch (error) {
        if (isGitHubRateLimitError(error)) {
          const resetAtMs = rememberRateLimitResetAtMs(userId, error);
          console.warn(
            "batchReadFiles: hit GitHub rate limit, stopping uncached reads for now",
            {
              userId,
              resetAtMs,
              failedPath: miss.path,
            },
          );
          break;
        }

        // Skip files that fail to fetch (permissions, deleted, etc.)
        console.warn(`batchReadFiles: failed to fetch ${miss.path}:`, error);
      }
    }

    return results;
  },
});

export const getCommitPreview = action({
  args: {
    repositoryFullName: v.string(),
    includePatch: v.optional(v.boolean()),
  },
  returns: commitPreviewResult,
  handler: async (ctx, args): Promise<CommitPreviewResult> => {
    const userId = await getUserId(ctx);
    const includePatch = args.includePatch ?? true;

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    const stagedFiles: StagedFileForCommit[] = await ctx.runQuery(
      api.fileStaging.listStagedFiles,
      {
        vaultId: vault._id,
      },
    );

    const stagedBranches: string[] = Array.from(
      new Set(
        stagedFiles
          .map((file: StagedFileForCommit) => file.branch)
          .filter((branch): branch is string => typeof branch === "string"),
      ),
    );
    if (stagedBranches.length > 1) {
      throw new Error(
        `Cannot preview staged files across multiple branches: ${stagedBranches.join(", ")}`,
      );
    }
    const branch =
      stagedBranches[0] ??
      (await getVaultDefaultBranch(
        ctx,
        userId,
        vault.ghRepoOwner,
        vault.ghRepoName,
      ));

    return buildCommitPreviewFromStagedFiles({
      stagedFiles,
      branch,
      includePatch,
    });
  },
});

// MARK: Internal

type CommitConflict = {
  path: string;
  reason: CommitConflictReason;
};

type CommitAttemptTelemetry = {
  owner: string;
  repo: string;
  branch: string;
  attempt: number;
  durationMs: number;
  retries: number;
};

const COMMIT_RETRY_BACKOFF_MS = [250, 750] as const;

function formatCommitConflictMessage(conflicts: CommitConflict[]): string {
  const paths = conflicts.map((conflict) => conflict.path).sort();
  return `Commit conflicts with upstream changes. Resolve and retry: ${paths.join(", ")}`;
}

class CommitConflictError extends Error {
  conflicts: CommitConflict[];

  constructor(conflicts: CommitConflict[]) {
    super(formatCommitConflictMessage(conflicts));
    this.name = "CommitConflictError";
    this.conflicts = conflicts;
  }
}

function isCommitConflictError(error: unknown): error is CommitConflictError {
  return error instanceof CommitConflictError;
}

type CreateTreeRequest = NonNullable<
  Parameters<Octokit["rest"]["git"]["createTree"]>[0]
>;
type CreateTreeEntry = NonNullable<CreateTreeRequest["tree"]>[number];

function logCommitAttempt(
  stage: "start" | "retry" | "success" | "failure" | "conflict",
  details: CommitAttemptTelemetry & {
    status?: number | null;
    message?: string;
    retryDelayMs?: number;
    conflicts?: CommitConflict[];
    baseHeadSha?: string;
  },
): void {
  const payload = {
    stage,
    ...details,
  };

  if (stage === "failure") {
    console.error("commit_engine", payload);
    return;
  }

  if (stage === "retry" || stage === "conflict") {
    console.warn("commit_engine", payload);
    return;
  }

  console.info("commit_engine", payload);
}

// Helper function to create a commit with multiple files
export async function createCommitWithMultipleFiles({
  octokit,
  owner,
  repo,
  stagedFiles,
  branch,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  stagedFiles: Array<{
    filePath: string;
    content: string;
    fileDeleted: boolean;
    initialFilePath: string;
    initialContent?: string;
    parentCommitSha: string | null;
  }>;
  branch: string;
}) {
  // Helper to compute modified (added) line ranges in the new content
  const computeModifiedLineRanges = (
    oldContent: string,
    newContent: string,
  ): Array<{ from: number; to: number }> => {
    const parts = diffLines(oldContent ?? "", newContent ?? "");
    const ranges: Array<{ from: number; to: number }> = [];
    let newLine = 1;
    for (const part of parts) {
      const value = part.value ?? "";
      const lineCount =
        typeof part.count === "number"
          ? part.count
          : value === ""
            ? 0
            : value.split("\n").length; // count lines even without trailing newline
      if (part.added) {
        if (lineCount > 0) {
          ranges.push({ from: newLine, to: newLine + lineCount - 1 });
        }
        newLine += lineCount;
      } else if (part.removed) {
        // Removed lines affect old content only; don't advance newLine
      } else {
        newLine += lineCount;
      }
    }
    return ranges;
  };

  // Summarize all changes to craft a commit message
  const changesInfo: Array<{
    deleted: boolean;
    modifiedLines: Array<{ from: number; to: number }>;
    filePath: string;
    initialFilePath: string;
    wasModified: boolean;
  }> = stagedFiles.map((file) => ({
    deleted: file.fileDeleted,
    filePath: file.filePath,
    initialFilePath: file.initialFilePath,
    modifiedLines: file.fileDeleted
      ? []
      : computeModifiedLineRanges(
          file.initialContent ?? "",
          file.content ?? "",
        ),
    wasModified:
      !file.fileDeleted && (file.initialContent ?? "") !== (file.content ?? ""),
  }));

  // 1. Build commit message from staged intent
  const basename = (p: string) => {
    const parts = p.split("/");
    return parts[parts.length - 1] || p;
  };
  const shortRanges = (
    ranges: Array<{ from: number; to: number }>,
    max = 2,
  ) => {
    const items = ranges
      .slice(0, max)
      .map((r) => (r.from === r.to ? `${r.from}` : `${r.from}-${r.to}`));
    return ranges.length > max ? `${items.join(",")},…` : items.join(",");
  };
  const subjectTokens: string[] = [];
  for (const info of changesInfo) {
    const renamed = info.initialFilePath !== info.filePath;
    if (info.deleted) {
      subjectTokens.push(`D ${basename(info.initialFilePath)}`);
    } else if (renamed && info.modifiedLines.length > 0) {
      subjectTokens.push(
        `${basename(info.initialFilePath)}->${basename(info.filePath)}[${shortRanges(info.modifiedLines)}]`,
      );
    } else if (renamed) {
      subjectTokens.push(
        `${basename(info.initialFilePath)}->${basename(info.filePath)}`,
      );
    } else if (info.modifiedLines.length > 0) {
      subjectTokens.push(
        `${basename(info.filePath)}[${shortRanges(info.modifiedLines)}]`,
      );
    } else if (info.wasModified) {
      subjectTokens.push(`${basename(info.filePath)}[]`);
    }
  }
  const maxTokens = 4;
  const commitMessage =
    subjectTokens.length === 0
      ? "Update files"
      : subjectTokens.length > maxTokens
        ? `${subjectTokens.slice(0, maxTokens).join(", ")} …`
        : subjectTokens.join(", ");

  const blobTextBySha = new Map<string, Promise<string>>();

  const getBlobText = (sha: string): Promise<string> => {
    const existing = blobTextBySha.get(sha);
    if (existing) {
      return existing;
    }

    const loaded = octokit.rest.git
      .getBlob({
        owner,
        repo,
        file_sha: sha,
      })
      .then((response) => {
        const base64 = response.data.content.replace(/\n/g, "");
        return Buffer.from(base64, "base64").toString("utf-8");
      })
      .catch((error) => {
        // Failed loads must be retriable on subsequent attempts.
        blobTextBySha.delete(sha);
        throw error;
      });

    blobTextBySha.set(sha, loaded);
    return loaded;
  };

  const buildTreeEntriesForHead = async (
    currentTreeSha: string,
  ): Promise<{
    entries: CreateTreeEntry[];
    conflicts: CommitConflict[];
  }> => {
    const { data: currentTree } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: currentTreeSha,
      recursive: "1",
    });
    if (currentTree.truncated) {
      throw new Error(
        "Upstream tree is too large to resolve fully; cannot verify conflict-free commit.",
      );
    }

    const shaByPath = new Map<string, string>();
    for (const entry of currentTree.tree) {
      if (
        entry.type === "blob" &&
        typeof entry.path === "string" &&
        typeof entry.sha === "string"
      ) {
        shaByPath.set(entry.path, entry.sha);
      }
    }

    const pathsToDelete = new Set<string>();
    const filesToAdd: Array<{ filePath: string; content: string }> = [];
    const conflictsByPath = new Map<string, CommitConflictReason>();
    const addConflict = (path: string, reason: CommitConflictReason) => {
      if (!conflictsByPath.has(path)) {
        conflictsByPath.set(path, reason);
      }
    };

    for (const file of stagedFiles) {
      const isRenamed = file.filePath !== file.initialFilePath;

      if (file.fileDeleted) {
        const deletionPath = shaByPath.has(file.filePath)
          ? file.filePath
          : shaByPath.has(file.initialFilePath)
            ? file.initialFilePath
            : null;
        if (deletionPath) {
          pathsToDelete.add(deletionPath);
        }
        continue;
      }

      if (file.parentCommitSha === null) {
        const upstreamSha = shaByPath.get(file.filePath);
        if (!upstreamSha) {
          filesToAdd.push({
            filePath: file.filePath,
            content: file.content,
          });
          continue;
        }

        const upstreamContent = await getBlobText(upstreamSha);
        if (upstreamContent !== file.content) {
          addConflict(file.filePath, "new_file_path_taken");
          continue;
        }

        filesToAdd.push({
          filePath: file.filePath,
          content: file.content,
        });
        continue;
      }

      const preferredUpstreamPath = isRenamed
        ? file.initialFilePath
        : file.filePath;
      const fallbackUpstreamPath = file.filePath;
      const upstreamPath = shaByPath.has(preferredUpstreamPath)
        ? preferredUpstreamPath
        : shaByPath.has(fallbackUpstreamPath)
          ? fallbackUpstreamPath
          : null;

      if (!upstreamPath) {
        addConflict(preferredUpstreamPath, "missing_upstream_path");
        continue;
      }

      const upstreamSha = shaByPath.get(upstreamPath);
      if (!upstreamSha) {
        addConflict(upstreamPath, "missing_upstream_path");
        continue;
      }

      const upstreamContent = await getBlobText(upstreamSha);
      const rebased = rebaseStagedContent({
        baseContent: file.initialContent ?? "",
        stagedContent: file.content,
        upstreamContent,
      });

      if (rebased.hasConflict) {
        addConflict(file.filePath, "content_conflict");
        continue;
      }

      if (isRenamed && upstreamPath !== file.filePath) {
        const renameTargetSha = shaByPath.get(file.filePath);
        if (renameTargetSha) {
          const renameTargetContent = await getBlobText(renameTargetSha);
          if (renameTargetContent !== rebased.content) {
            addConflict(file.filePath, "rename_target_exists");
            continue;
          }
        }
      }

      if (isRenamed && upstreamPath !== file.filePath) {
        pathsToDelete.add(upstreamPath);
      }

      filesToAdd.push({
        filePath: file.filePath,
        content: rebased.content,
      });
    }

    const entries: CreateTreeEntry[] = [];

    for (const path of pathsToDelete) {
      entries.push({
        path,
        mode: "100644",
        type: "blob",
        sha: null,
      });
    }

    for (const file of filesToAdd) {
      entries.push({
        path: file.filePath,
        mode: "100644",
        type: "blob",
        content: file.content,
      });
    }

    return {
      entries,
      conflicts: [...conflictsByPath.entries()]
        .map(([path, reason]) => ({
          path,
          reason,
        }))
        .sort((left, right) => left.path.localeCompare(right.path)),
    };
  };

  // 2. Retry loop for ref-dependent operations (getRef → getCommit → createTree → createCommit → updateRef).
  //    Retries are bounded and deterministic to avoid ambiguous behavior under races.
  const startedAtMs = Date.now();
  let retries = 0;
  const maxAttempts = COMMIT_RETRY_BACKOFF_MS.length + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      const currentCommitSha = refData.object.sha;

      logCommitAttempt("start", {
        owner,
        repo,
        branch,
        attempt: attempt + 1,
        durationMs: Date.now() - startedAtMs,
        retries,
        baseHeadSha: currentCommitSha,
      });

      const { data: currentCommit } = await octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: currentCommitSha,
      });
      const currentTreeSha = currentCommit.tree.sha;
      const { entries: newTreeEntries, conflicts } =
        await buildTreeEntriesForHead(currentTreeSha);

      if (conflicts.length > 0) {
        throw new CommitConflictError(conflicts);
      }

      const { data: newTree } = await octokit.rest.git.createTree({
        owner,
        repo,
        base_tree: currentTreeSha,
        tree: newTreeEntries,
      });

      const { data: newCommit } = await octokit.rest.git.createCommit({
        owner,
        repo,
        message: commitMessage,
        tree: newTree.sha,
        parents: [currentCommitSha],
      });

      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommit.sha,
        force: false,
      });

      logCommitAttempt("success", {
        owner,
        repo,
        branch,
        attempt: attempt + 1,
        durationMs: Date.now() - startedAtMs,
        retries,
        baseHeadSha: currentCommitSha,
      });

      return {
        sha: newCommit.sha,
        url: newCommit.html_url,
      };
    } catch (error) {
      if (isCommitConflictError(error)) {
        logCommitAttempt("conflict", {
          owner,
          repo,
          branch,
          attempt: attempt + 1,
          durationMs: Date.now() - startedAtMs,
          retries,
          conflicts: error.conflicts,
          message: error.message,
        });
        throw error;
      }

      const status = getErrorStatus(error);
      const message =
        error instanceof Error && error.message.length > 0
          ? error.message
          : getErrorMessage(error);
      const isRetryable = status === 422 || status === 409;
      if (!isRetryable || attempt === maxAttempts - 1) {
        logCommitAttempt("failure", {
          owner,
          repo,
          branch,
          attempt: attempt + 1,
          durationMs: Date.now() - startedAtMs,
          retries,
          status,
          message,
        });
        throw error;
      }

      retries += 1;
      const retryDelayMs =
        COMMIT_RETRY_BACKOFF_MS[attempt] ??
        COMMIT_RETRY_BACKOFF_MS[COMMIT_RETRY_BACKOFF_MS.length - 1] ??
        500;
      logCommitAttempt("retry", {
        owner,
        repo,
        branch,
        attempt: attempt + 1,
        durationMs: Date.now() - startedAtMs,
        retries,
        status,
        message,
        retryDelayMs,
      });

      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  // Unreachable — the loop always returns or throws — but satisfies TypeScript
  throw new Error("Exhausted commit retry attempts");
}

// Internal action to commit all staged files to GitHub
export const commitAllStaged = internalAction({
  args: {
    userId: v.id("users"),
    vaultId: v.id("vaults"),
    repoOwner: v.string(),
    repoName: v.string(),
    commitProposalMessageId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fullRepo = `${args.repoOwner}/${args.repoName}`;
    const commitStartedAtMs = Date.now();

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: fullRepo,
      userId: args.userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    const updateCommitProposalStatus = async (
      committed: boolean,
      error?: string,
      conflicts?: CommitConflict[],
    ) => {
      if (!args.commitProposalMessageId) {
        return;
      }

      await ctx.runMutation(
        internal.chat.index.updateCommitProposalMessageCommittedInternal,
        {
          messageId: args.commitProposalMessageId,
          committed,
          committing: false,
          error,
          conflicts: conflicts ?? [],
        },
      );
    };

    try {
      // Get the staging record
      const changedFiles: StagedFileForCommit[] = await ctx.runQuery(
        api.fileStaging.listStagedFiles,
        {
          vaultId: args.vaultId,
        },
      );

      if (!changedFiles.length) {
        console.info("commit_all_staged", {
          stage: "no_staged_changes",
          vaultId: args.vaultId,
          repository: fullRepo,
          durationMs: Date.now() - commitStartedAtMs,
        });
        await updateCommitProposalStatus(true, undefined, []);
        return null;
      }

      const stagedBranches: string[] = Array.from(
        new Set(
          changedFiles
            .map((file: StagedFileForCommit) => file.branch)
            .filter((branch): branch is string => typeof branch === "string"),
        ),
      );
      if (stagedBranches.length > 1) {
        throw new Error(
          `Cannot commit staged files across multiple branches: ${stagedBranches.join(", ")}`,
        );
      }

      const githubAccessToken = await getGithubAccessToken(ctx, args.userId);

      const octokit: Octokit = new Octokit({
        auth: githubAccessToken,
      });
      const commitBranch: string =
        stagedBranches[0] ??
        (await getRepositoryDefaultBranch({
          octokit,
          owner: args.repoOwner,
          repo: args.repoName,
        }));

      // Create a commit with all staged files
      const commitResult = await createCommitWithMultipleFiles({
        octokit,
        owner: args.repoOwner,
        repo: args.repoName,
        stagedFiles: changedFiles,
        branch: commitBranch,
      });

      // 1. Update the vault tree FIRST so new SHAs are available
      await ctx.runAction(internal.github.updateRepositoryTree, {
        userId: args.userId,
        owner: args.repoOwner,
        repo: args.repoName,
      });

      // 2. Re-read the vault to get the updated tree with new SHAs
      const updatedVault = await ctx.runQuery(
        internal.vault.getByRepositoryFullName,
        {
          repositoryFullName: fullRepo,
          userId: args.userId,
        },
      );

      // 3. Save committed file contents into the blob cache under their new SHAs
      //    so that when the client re-fetches after staging is cleared, it gets
      //    the correct content immediately without hitting GitHub API
      if (updatedVault) {
        for (const file of changedFiles) {
          if (file.fileDeleted) continue;

          const newSha = updatedVault.treeData.tree.find(
            (t: { path?: string }) => t.path === file.filePath,
          )?.sha;

          if (newSha && typeof file.content === "string") {
            await ctx.runMutation(internal.gitOperations.saveFileBlob, {
              vaultId: args.vaultId,
              sha: newSha,
              size: Buffer.byteLength(file.content, "utf-8"),
              text: file.content,
              storageId: undefined,
              ext: file.filePath.split(".").pop()?.toLowerCase() ?? "",
              mime: "text/plain; charset=utf-8",
              debugFilePath: file.filePath,
            });
          }
        }
      }

      // 4. NOW clear staging — client will refetch with correct tree + blobs
      await ctx.runMutation(api.fileStaging.clearAllStaging, {
        vaultId: args.vaultId,
        skipTreeUpdate: true,
      });

      await updateCommitProposalStatus(true, undefined, []);
      console.info("commit_all_staged", {
        stage: "success",
        vaultId: args.vaultId,
        repository: fullRepo,
        branch: commitBranch,
        changedFileCount: changedFiles.length,
        commitSha: commitResult.sha,
        durationMs: Date.now() - commitStartedAtMs,
      });
    } catch (error) {
      const commitError =
        error instanceof Error && error.message.length > 0
          ? error.message
          : "Commit failed";

      if (isCommitConflictError(error)) {
        const initialReasonCounts: Record<CommitConflictReason, number> = {
          missing_upstream_path: 0,
          new_file_path_taken: 0,
          content_conflict: 0,
          rename_target_exists: 0,
        };
        const reasonCounts = error.conflicts.reduce(
          (counts, conflict) => ({
            ...counts,
            [conflict.reason]: (counts[conflict.reason] ?? 0) + 1,
          }),
          initialReasonCounts,
        );
        console.warn("commit_all_staged", {
          stage: "conflict",
          vaultId: args.vaultId,
          repository: fullRepo,
          conflictCount: error.conflicts.length,
          conflicts: error.conflicts,
          reasonCounts,
          durationMs: Date.now() - commitStartedAtMs,
        });
      } else {
        console.error("commit_all_staged", {
          stage: "failure",
          vaultId: args.vaultId,
          repository: fullRepo,
          error: commitError,
          durationMs: Date.now() - commitStartedAtMs,
        });
      }

      try {
        await updateCommitProposalStatus(
          false,
          commitError,
          isCommitConflictError(error) ? error.conflicts : [],
        );
      } catch (statusError) {
        console.error("Failed updating commit proposal status:", statusError);
      }

      console.error(
        `Failed to commit staged files in vault ${args.vaultId}:`,
        error,
      );
      throw error;
    }

    return null;
  },
});
