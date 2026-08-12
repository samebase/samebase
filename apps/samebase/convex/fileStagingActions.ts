"use node";

import { createHash } from "node:crypto";
import { internalAction, type ActionCtx } from "./_generated/server";
import { v, type Infer } from "convex/values";
import { api, internal } from "./_generated/api";
import { Octokit, type RestEndpointMethodTypes } from "@octokit/rest";
import { createTwoFilesPatch, diffLines } from "diff";
import { notEmpty } from "@samebase/dependent/main";
import { action } from "./functions";
import type { Id } from "./_generated/dataModel";
import type { GithubTree } from "./vault/model";
import { guessMime, INLINE_TEXT_MAX, isTextBuffer, withRetry } from "./gitOperationsActions";
import { isRecord } from "./jsonUtils";
import { rebaseStagedContent } from "./stagingRebase";
import { selectRepositoryTreeForBranch } from "./fileStaging";
import {
  hasStagedFileChanges,
  hasStagedFileContentChange,
  readStagedFileKind,
  type StagedFileKind,
} from "./stagingChanges";
import { sanitizeSlug } from "./slugUtils";
import { describeRepositoryTreeRefreshFailure } from "./github";
import { resolveGitHubAppAccess } from "./githubAppAccess";
import { assertConnectedVault } from "./vault/state";
import { getRepositoryMediaKind } from "../shared/repositoryMedia";
import { isStaleBaseVersionError } from "../shared/stagingErrors";
import type { VaultActionOperation } from "./pendingUploads";

const { boolean, number, object, optional, string } = v;

type HeaderValue = string | number | readonly string[] | undefined;
type HeaderMap = Record<string, HeaderValue>;
type CreateTreeEntry = NonNullable<
  RestEndpointMethodTypes["git"]["createTree"]["parameters"]["tree"]
>[number];
type EditableFileState = {
  content: string;
  parentCommitSha: string | null;
  lastEditTime: number;
  branch: string;
  version: number;
};

const githubRateLimitResetByUser = new Map<string, number>();
const PULL_REQUEST_COMPARE_FILE_LIST_LIMIT = 3_000;

export function selectBatchReadRepositoryTree(args: {
  requestedBranch?: string;
  branchTree: GithubTree[] | null;
}): GithubTree[] {
  if (args.branchTree) {
    return args.branchTree;
  }
  if (!args.requestedBranch) {
    throw new Error("Default branch tree is not cached. Refresh and retry.");
  }
  return selectRepositoryTreeForBranch({
    requestedBranch: args.requestedBranch,
    branchTree: args.branchTree,
  });
}

export function listTouchedBranchesForRefresh(branches: string[]): string[] {
  return Array.from(new Set(branches));
}

export async function runPostCommitTreeRefresh<T>(args: {
  refreshBranchTree: () => Promise<void>;
  loadUpdatedVault: () => Promise<T | null>;
  onWarning: (error: unknown) => void;
}): Promise<T | null> {
  try {
    await args.refreshBranchTree();
    return await args.loadUpdatedVault();
  } catch (error) {
    args.onWarning(error);
    return null;
  }
}

async function getGitHubOctokit(
  ctx: ActionCtx,
  userId: Id<"users">,
  vaultId: Id<"vaults">,
): Promise<Octokit> {
  const access = await resolveGitHubAppAccess(ctx, {
    userId,
    target: { kind: "vault", vaultId },
  });
  return access.octokit;
}

async function withVaultActionLease<Result>(
  ctx: ActionCtx,
  args: {
    operation: VaultActionOperation;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
  run: () => Promise<Result>,
): Promise<Result> {
  const leaseId = await ctx.runMutation(internal.pendingUploads.acquireVaultActionLease, {
    operation: args.operation,
    userId: args.userId,
    vaultId: args.vaultId,
  });
  try {
    return await run();
  } finally {
    await ctx.runMutation(internal.pendingUploads.releaseVaultActionLease, { leaseId });
  }
}

function readDefaultBranch(repoData: unknown): string {
  if (!isRecord(repoData)) {
    return "main";
  }

  const defaultBranch = repoData["default_branch"];
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
  vaultId: Id<"vaults">,
  owner: string,
  repo: string,
): Promise<string> {
  const octokit = await getGitHubOctokit(ctx, userId, vaultId);
  return getRepositoryDefaultBranch({
    octokit,
    owner,
    repo,
  });
}

type OpenPullRequestCandidate = {
  number: number;
  html_url?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  base: {
    ref?: string | null;
  };
  head: {
    ref: string;
    repo?: {
      full_name?: string | null;
    } | null;
  };
};

function readPullRequestActivityAt(pullRequest: OpenPullRequestCandidate): number {
  const updatedAt = Date.parse(pullRequest.updated_at ?? "");
  if (!Number.isNaN(updatedAt)) {
    return updatedAt;
  }

  const createdAt = Date.parse(pullRequest.created_at ?? "");
  return Number.isNaN(createdAt) ? 0 : createdAt;
}

function readMatchingOpenPullRequestForBranch(args: {
  branch: string;
  repositoryFullName: string;
  pullRequests: OpenPullRequestCandidate[];
  baseBranch?: string;
}): { url: string; number: number; baseBranch: string } | null {
  const normalizedRepositoryFullName = args.repositoryFullName.toLowerCase();
  let latestMatch: {
    url: string;
    number: number;
    baseBranch: string;
    activityAt: number;
  } | null = null;

  for (const pullRequest of args.pullRequests) {
    const pullRequestRepositoryFullName = pullRequest.head.repo?.full_name;
    if (
      pullRequest.head.ref !== args.branch ||
      (typeof args.baseBranch === "string" && pullRequest.base.ref !== args.baseBranch) ||
      typeof pullRequestRepositoryFullName !== "string" ||
      pullRequestRepositoryFullName.toLowerCase() !== normalizedRepositoryFullName ||
      typeof pullRequest.base.ref !== "string" ||
      pullRequest.base.ref.length === 0 ||
      typeof pullRequest.html_url !== "string" ||
      pullRequest.html_url.length === 0
    ) {
      continue;
    }

    const activityAt = readPullRequestActivityAt(pullRequest);
    if (!latestMatch || activityAt >= latestMatch.activityAt) {
      latestMatch = {
        url: pullRequest.html_url,
        number: pullRequest.number,
        baseBranch: pullRequest.base.ref,
        activityAt,
      };
    }
  }

  return latestMatch
    ? {
        url: latestMatch.url,
        number: latestMatch.number,
        baseBranch: latestMatch.baseBranch,
      }
    : null;
}

function readEditableFileState(stagedFile: EditableFileState): EditableFileState {
  return {
    content: stagedFile.content,
    parentCommitSha: stagedFile.parentCommitSha,
    lastEditTime: stagedFile.lastEditTime,
    branch: stagedFile.branch,
    version: stagedFile.version,
  };
}

/**
 * Repository-backed binary files need to flow through the same staging path as
 * fresh uploads so previews, conflict handling, and commits all resolve one
 * binary source of truth.
 */
async function stageRepositoryBinaryBlobForEditing(args: {
  ctx: ActionCtx;
  vaultId: Id<"vaults">;
  originalFilePath: string;
  targetBranch: string;
  filePath: string;
  fileSha: string;
  userId: Id<"users">;
  storageId: Id<"_storage"> | null | undefined;
  mime: string | null | undefined;
  size: number;
  missingStorageError: string;
}): Promise<EditableFileState> {
  if (getRepositoryMediaKind(args.filePath) === null) {
    throw new Error("File content is stored in storage-backed binary form.");
  }
  if (typeof args.storageId !== "string") {
    throw new Error(args.missingStorageError);
  }

  const stagedFile = await args.ctx.runMutation(internal.fileStaging.saveBinaryUploadToStaging, {
    vaultId: args.vaultId,
    filePath: args.originalFilePath,
    branch: args.targetBranch,
    storageId: args.storageId,
    mime: args.mime ?? guessMime(args.filePath),
    size: args.size,
    stagedBlobSha: args.fileSha,
    replaceExisting: true,
    userId: args.userId,
  });

  return readEditableFileState(stagedFile);
}

export function readOpenPullRequestForBranch(args: {
  branch: string;
  baseBranch: string;
  repositoryFullName: string;
  pullRequests: OpenPullRequestCandidate[];
}): { url: string; number: number } | null {
  const latestMatch = readMatchingOpenPullRequestForBranch(args);
  if (!latestMatch) {
    return null;
  }

  return {
    url: latestMatch.url,
    number: latestMatch.number,
  };
}

export function readLatestOpenPullRequestForBranch(args: {
  branch: string;
  repositoryFullName: string;
  pullRequests: OpenPullRequestCandidate[];
}): { url: string; number: number; baseBranch: string } | null {
  return readMatchingOpenPullRequestForBranch(args);
}

async function getOpenPullRequestForBranch(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
  baseBranch: string;
}): Promise<{ url: string; number: number } | null> {
  const response = await args.octokit.rest.pulls.list({
    owner: args.owner,
    repo: args.repo,
    state: "open",
    head: `${args.owner}:${args.branch}`,
    per_page: 100,
  });

  return readOpenPullRequestForBranch({
    branch: args.branch,
    baseBranch: args.baseBranch,
    repositoryFullName: `${args.owner}/${args.repo}`,
    pullRequests: response.data,
  });
}

async function getLatestOpenPullRequestForBranch(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
}): Promise<{ url: string; number: number; baseBranch: string } | null> {
  const response = await args.octokit.rest.pulls.list({
    owner: args.owner,
    repo: args.repo,
    state: "open",
    head: `${args.owner}:${args.branch}`,
    per_page: 100,
  });

  return readLatestOpenPullRequestForBranch({
    branch: args.branch,
    repositoryFullName: `${args.owner}/${args.repo}`,
    pullRequests: response.data,
  });
}

export function buildDraftPullRequestTitle(args: {
  branch: string;
  commitMessage: string | null;
}): string {
  const commitSubject = args.commitMessage?.split("\n")[0]?.trim();
  if (typeof commitSubject === "string" && commitSubject.length > 0) {
    return commitSubject;
  }

  return `Update ${args.branch}`;
}

/**
 * Keep auto-created draft branches readable so the PR unit of work also gets a
 * readable branch name.
 */
export function buildDraftBranchName(args: {
  stagedFiles: Array<Pick<StagedFileForCommit, "filePath" | "initialFilePath">>;
  now: number;
}): string {
  const labels = Array.from(
    new Set(
      args.stagedFiles
        .flatMap((file) => [file.filePath, file.initialFilePath])
        .map((path) => path.split("/").at(-1) ?? path)
        .map((segment) => sanitizeSlug(segment, 18))
        .filter((segment) => segment.length > 0),
    ),
  );
  const stem = sanitizeSlug(labels.slice(0, 3).join("-"), 36);
  const suffix = args.now.toString(36);
  return `draft/${stem.length > 0 ? stem : "work"}-${suffix}`;
}

/**
 * Preserve the full staged-file snapshot when forking default-branch staging
 * into a draft branch. Only `_creationTime` is database-specific.
 */
export function stripCreationTimeFromStagingRecord<
  T extends {
    _creationTime: number;
  },
>(file: T): Omit<T, "_creationTime"> {
  const { _creationTime: _ignored, ...snapshot } = file;
  return snapshot;
}

async function getBranchHeadCommitMessage(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
}): Promise<string | null> {
  const branchRef = await args.octokit.rest.git.getRef({
    owner: args.owner,
    repo: args.repo,
    ref: `heads/${args.branch}`,
  });
  const commit = await args.octokit.rest.git.getCommit({
    owner: args.owner,
    repo: args.repo,
    commit_sha: branchRef.data.object.sha,
  });
  return commit.data.message;
}

/**
 * Read the current head SHA for a branch. Returning null lets callers avoid
 * destructive rollback when GitHub cannot confirm whether the ref advanced.
 */
async function getBranchHeadShaOrNull(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
}): Promise<string | null> {
  try {
    const refResponse = await args.octokit.rest.git.getRef({
      owner: args.owner,
      repo: args.repo,
      ref: `heads/${args.branch}`,
    });
    return refResponse.data.object.sha;
  } catch (error) {
    console.warn("Failed to inspect branch head after draft error:", error);
    return null;
  }
}

/**
 * Best-effort cleanup for a temporary draft branch that never advanced beyond
 * the default branch head.
 */
async function cleanupTemporaryDraftBranch(args: {
  ctx: ActionCtx;
  octokit: Octokit;
  vaultId: Id<"vaults">;
  owner: string;
  repo: string;
  branch: string;
}) {
  try {
    await args.ctx.runMutation(api.fileStaging.clearAllStaging, {
      vaultId: args.vaultId,
      branch: args.branch,
      skipTreeUpdate: true,
    });
  } catch (cleanupError) {
    console.warn(
      "Failed to clear temporary draft-branch staging after draft PR error:",
      cleanupError,
    );
  }

  try {
    await args.octokit.rest.git.deleteRef({
      owner: args.owner,
      repo: args.repo,
      ref: `heads/${args.branch}`,
    });
  } catch (cleanupError) {
    console.warn("Failed to remove temporary draft branch after draft PR error:", cleanupError);
  }
}

export function getDraftPullRequestCreateErrorMessage(error: unknown): string | null {
  const message = getErrorMessage(error);
  if (message.includes("No commits between")) {
    return "This branch has no changes to open as a pull request.";
  }
  if (message.includes("A pull request already exists")) {
    return "A pull request already exists for this branch.";
  }
  return null;
}

function toGitTreeRef(branch: string): string {
  if (/^[0-9a-f]{40}$/i.test(branch)) {
    return branch;
  }

  if (branch.startsWith("refs/heads/")) {
    return branch.slice("refs/".length);
  }

  if (branch.startsWith("heads/")) {
    return branch;
  }

  return `heads/${branch}`;
}

async function getTreeMapForRef(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  ref: string;
}): Promise<Map<string, string>> {
  const treeResponse = await args.octokit.rest.git.getTree({
    owner: args.owner,
    repo: args.repo,
    tree_sha: toGitTreeRef(args.ref),
    recursive: "1",
  });

  if (treeResponse.data.truncated) {
    throw new Error("Upstream tree is too large to validate staged changes safely.");
  }

  const shaByPath = new Map<string, string>();
  for (const item of treeResponse.data.tree) {
    if (item.type === "blob" && typeof item.path === "string" && typeof item.sha === "string") {
      shaByPath.set(item.path, item.sha);
    }
  }

  return shaByPath;
}

async function getBranchTreeMap(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
}): Promise<Map<string, string>> {
  return getTreeMapForRef({
    octokit: args.octokit,
    owner: args.owner,
    repo: args.repo,
    ref: args.branch,
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

    if (Array.isArray(headerValue) && headerValue.every((item) => typeof item === "string")) {
      headers[key] = headerValue;
    }
  }

  return headers;
}

function getHeaderValue(headers: HeaderMap | null, name: string): string | null {
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

function getErrorHeaders(error: unknown): HeaderMap | null {
  if (!isRecord(error)) {
    return null;
  }

  const response = error["response"];
  if (!isRecord(response)) {
    return null;
  }

  return toHeaderMap(response["headers"]);
}

function getErrorStatus(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }
  const status = error["status"];
  return typeof status === "number" ? status : null;
}

function getErrorMessage(error: unknown): string {
  if (!isRecord(error)) {
    return "";
  }
  const message = error["message"];
  return typeof message === "string" ? message : "";
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
  if (getHeaderValue(headers, "retry-after") !== null) {
    return true;
  }

  const remaining = getHeaderValue(headers, "x-ratelimit-remaining");
  if (remaining === "0") {
    return true;
  }

  return getErrorMessage(error).toLowerCase().includes("rate limit");
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

function rememberRateLimitResetAtMs(userId: string, resetAtMs: number): number {
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
  isBinary: v.boolean(),
  mimeType: v.optional(v.string()),
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

const commitPreviewSafety = v.object({
  destructiveFileCount: v.number(),
  truncatedPatchFileCount: v.number(),
  includesTruncatedPatches: v.boolean(),
});

const commitPreviewResult = v.object({
  branch: v.string(),
  hasDestructiveChanges: v.boolean(),
  files: v.array(commitPreviewFile),
  totals: commitPreviewTotals,
  safety: commitPreviewSafety,
});

const branchComparePreviewResult = v.object({
  branch: v.string(),
  baseBranch: v.string(),
  source: v.union(v.literal("pull_request"), v.literal("branch_compare")),
  pullRequestNumber: v.optional(v.number()),
  pullRequestUrl: v.optional(v.string()),
  sourceFileListTruncated: v.boolean(),
  hasDestructiveChanges: v.boolean(),
  files: v.array(commitPreviewFile),
  totals: commitPreviewTotals,
  safety: commitPreviewSafety,
});

const draftPullRequestResult = object({
  url: string(),
  number: number(),
  existing: boolean(),
});
const stagedMediaUploadResult = object({
  filePath: string(),
  branch: string(),
  parentCommitSha: optional(string()),
  replacedExisting: boolean(),
});
const defaultBranchDraftPullRequestResult = object({
  branch: string(),
  url: string(),
  number: number(),
});

const rebaseConflictPreviewFile = v.object({
  path: v.string(),
  previousPath: v.optional(v.string()),
  upstreamPath: v.optional(v.string()),
  isBinary: v.boolean(),
  mimeType: v.optional(v.string()),
  isMarkdown: v.boolean(),
  baseBlobSha: v.optional(v.string()),
  upstreamBlobSha: v.string(),
  baseToStagedPatchTruncated: v.boolean(),
  baseToStagedPatch: v.optional(v.string()),
  baseToUpstreamPatchTruncated: v.boolean(),
  baseToUpstreamPatch: v.optional(v.string()),
});

const rebaseConflictPreviewResult = v.object({
  branch: v.string(),
  files: v.array(rebaseConflictPreviewFile),
});

type CommitPreviewFile = Infer<typeof commitPreviewFile>;
type CommitPreviewTotals = Infer<typeof commitPreviewTotals>;
type CommitPreviewSafety = Infer<typeof commitPreviewSafety>;
type CommitPreviewResult = Infer<typeof commitPreviewResult>;
type BranchComparePreviewResult = Infer<typeof branchComparePreviewResult>;
type DraftPullRequestResult = Infer<typeof draftPullRequestResult>;
type StagedMediaUploadResult = Infer<typeof stagedMediaUploadResult>;
type DefaultBranchDraftPullRequestResult = Infer<typeof defaultBranchDraftPullRequestResult>;
type RebaseConflictPreviewFile = Infer<typeof rebaseConflictPreviewFile>;
type RebaseConflictPreviewResult = Infer<typeof rebaseConflictPreviewResult>;

type StagedFileForCommit = {
  kind?: StagedFileKind;
  filePath: string;
  initialFilePath: string;
  content: string;
  initialContent: string;
  fileDeleted: boolean;
  storageId?: Id<"_storage">;
  mime?: string;
  size?: number;
  stagedBlobSha?: string;
  parentCommitSha: string | null;
  branch?: string;
};
type DraftSourceStagingSnapshot = Omit<StagedFileForCommit, "branch"> & {
  branch: string;
  _id: Id<"vaultStagedFiles">;
  vaultId: Id<"vaults">;
  lastEditTime: number;
  lastEditUserId: Id<"users">;
  version: number;
};
type DraftSourceStagingRecord = DraftSourceStagingSnapshot & {
  _creationTime: number;
};

type StagedFileRebaseConflict = StagedFileForCommit & {
  upstreamContent?: string;
  upstreamSha: string;
  upstreamPath?: string;
};

type GitHubCompareFileCandidate = {
  filename?: string | null;
  previous_filename?: string | null;
  status?: string | null;
  additions?: number | null;
  deletions?: number | null;
  patch?: string | null;
};

function isBinaryStagedFile(file: Pick<StagedFileForCommit, "kind">): boolean {
  return readStagedFileKind(file.kind) === "binary";
}

export function shouldAdvanceBinaryPullParentCommit(args: {
  stagedBlobSha?: string | null;
  fileDeleted?: boolean;
  upstreamSha: string;
}): boolean {
  return args.fileDeleted !== true && args.stagedBlobSha === args.upstreamSha;
}

function computeGitBlobShaFromBuffer(buffer: Uint8Array): string {
  const headerBuffer = Buffer.from(`blob ${buffer.byteLength}\0`, "utf-8");
  return createHash("sha1").update(headerBuffer).update(buffer).digest("hex");
}

function computeGitBlobShaFromText(content: string): string {
  return computeGitBlobShaFromBuffer(Buffer.from(content, "utf-8"));
}
function formatUpstreamConflictError(paths: string[]): string {
  const uniquePaths = Array.from(new Set(paths)).sort();
  return `Commit conflicts with upstream changes. Resolve and retry: ${uniquePaths.join(", ")}`;
}

export async function inspectStagedFilesAgainstLatestHead(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
  stagedFiles: StagedFileForCommit[];
}): Promise<{
  rebasedFiles: StagedFileForCommit[];
  conflicts: StagedFileRebaseConflict[];
}> {
  if (args.stagedFiles.length === 0) {
    return { rebasedFiles: [], conflicts: [] };
  }

  const initialContentMatchesUpstreamCache = new Map<
    StagedFileForCommit,
    { upstreamSha: string; matches: boolean }
  >();
  const initialContentMatchesUpstream = (
    file: StagedFileForCommit,
    upstreamSha: string,
  ): boolean => {
    if (isBinaryStagedFile(file)) {
      return upstreamSha === file.parentCommitSha;
    }
    const cached = initialContentMatchesUpstreamCache.get(file);
    if (cached && cached.upstreamSha === upstreamSha) {
      return cached.matches;
    }
    const matches = computeGitBlobShaFromText(file.initialContent) === upstreamSha;
    initialContentMatchesUpstreamCache.set(file, {
      upstreamSha,
      matches,
    });
    return matches;
  };
  const shouldSkipFastPathRebase = (file: StagedFileForCommit, upstreamSha: string): boolean =>
    upstreamSha === file.parentCommitSha && initialContentMatchesUpstream(file, upstreamSha);

  const shaByPath = await getBranchTreeMap({
    octokit: args.octokit,
    owner: args.owner,
    repo: args.repo,
    branch: args.branch,
  });

  const blobTextBySha = new Map<string, Promise<string>>();
  const getBlobText = (sha: string): Promise<string> => {
    const existing = blobTextBySha.get(sha);
    if (existing) {
      return existing;
    }

    const loaded = args.octokit.rest.git
      .getBlob({
        owner: args.owner,
        repo: args.repo,
        file_sha: sha,
      })
      .then((response) => {
        const base64 = response.data.content.replace(/\n/g, "");
        return Buffer.from(base64, "base64").toString("utf-8");
      })
      .catch((error) => {
        blobTextBySha.delete(sha);
        throw error;
      });

    blobTextBySha.set(sha, loaded);
    return loaded;
  };

  const resolveUpstreamLocationForFile = (
    file: StagedFileForCommit,
  ): { path: string; sha: string } | null => {
    const preferredUpstreamPath =
      file.filePath === file.initialFilePath ? file.filePath : file.initialFilePath;
    const fallbackUpstreamPath = file.filePath;
    const upstreamPath = shaByPath.has(preferredUpstreamPath)
      ? preferredUpstreamPath
      : shaByPath.has(fallbackUpstreamPath)
        ? fallbackUpstreamPath
        : null;
    if (!upstreamPath) {
      return null;
    }
    const upstreamSha = shaByPath.get(upstreamPath);
    if (!upstreamSha) {
      return null;
    }
    return {
      path: upstreamPath,
      sha: upstreamSha,
    };
  };

  const upstreamShasToPrefetch = new Set<string>();
  for (const file of args.stagedFiles) {
    const upstreamLocation = resolveUpstreamLocationForFile(file);
    if (!upstreamLocation) {
      continue;
    }
    const upstreamSha = upstreamLocation.sha;
    if (isBinaryStagedFile(file)) {
      continue;
    }
    if (file.fileDeleted) {
      if (file.parentCommitSha !== null && !shouldSkipFastPathRebase(file, upstreamSha)) {
        upstreamShasToPrefetch.add(upstreamSha);
      }
      continue;
    }
    if (file.parentCommitSha === null) {
      upstreamShasToPrefetch.add(upstreamSha);
      continue;
    }
    if (shouldSkipFastPathRebase(file, upstreamSha)) {
      continue;
    }
    upstreamShasToPrefetch.add(upstreamSha);
  }

  await Promise.all(Array.from(upstreamShasToPrefetch).map((sha) => getBlobText(sha)));

  const conflicts: StagedFileRebaseConflict[] = [];
  const rebasedFiles: StagedFileForCommit[] = [];

  for (const file of args.stagedFiles) {
    const upstreamLocation = resolveUpstreamLocationForFile(file);
    const upstreamSha = upstreamLocation?.sha ?? null;
    if (isBinaryStagedFile(file)) {
      if (file.fileDeleted) {
        if (file.parentCommitSha === null || !upstreamSha || upstreamSha === file.parentCommitSha) {
          rebasedFiles.push(file);
          continue;
        }

        conflicts.push({
          ...file,
          upstreamPath: upstreamLocation?.path,
          upstreamSha,
        });
        rebasedFiles.push(file);
        continue;
      }

      if (file.parentCommitSha === null) {
        if (!upstreamSha) {
          rebasedFiles.push(file);
          continue;
        }

        if (file.stagedBlobSha === upstreamSha) {
          rebasedFiles.push({
            ...file,
            parentCommitSha: upstreamSha,
          });
          continue;
        }

        conflicts.push({
          ...file,
          upstreamPath: upstreamLocation?.path,
          upstreamSha,
        });
        rebasedFiles.push(file);
        continue;
      }

      if (!upstreamSha || upstreamSha === file.parentCommitSha) {
        rebasedFiles.push(file);
        continue;
      }

      if (file.stagedBlobSha === upstreamSha) {
        rebasedFiles.push({
          ...file,
          parentCommitSha: upstreamSha,
        });
        continue;
      }

      conflicts.push({
        ...file,
        upstreamPath: upstreamLocation?.path,
        upstreamSha,
      });
      rebasedFiles.push(file);
      continue;
    }

    if (file.fileDeleted) {
      if (
        file.parentCommitSha === null ||
        !upstreamSha ||
        shouldSkipFastPathRebase(file, upstreamSha)
      ) {
        rebasedFiles.push(file);
        continue;
      }

      const upstreamContent = await getBlobText(upstreamSha);
      conflicts.push({
        ...file,
        upstreamContent,
        upstreamPath: upstreamLocation?.path,
        upstreamSha,
      });
      rebasedFiles.push(file);
      continue;
    }

    if (file.parentCommitSha === null) {
      if (!upstreamSha) {
        rebasedFiles.push(file);
        continue;
      }

      const upstreamContent = await getBlobText(upstreamSha);
      if (upstreamContent === file.content) {
        rebasedFiles.push({
          ...file,
          initialFilePath: file.filePath,
          initialContent: upstreamContent,
          parentCommitSha: upstreamSha,
        });
        continue;
      }

      conflicts.push({
        ...file,
        upstreamContent,
        upstreamPath: upstreamLocation?.path,
        upstreamSha,
      });
      rebasedFiles.push(file);
      continue;
    }

    if (!upstreamSha || shouldSkipFastPathRebase(file, upstreamSha)) {
      rebasedFiles.push(file);
      continue;
    }

    const upstreamContent = await getBlobText(upstreamSha);
    const rebased = rebaseStagedContent({
      baseContent: file.initialContent,
      stagedContent: file.content,
      upstreamContent,
    });
    if (rebased.hasConflict) {
      conflicts.push({
        ...file,
        upstreamContent,
        upstreamPath: upstreamLocation?.path,
        upstreamSha,
      });
      rebasedFiles.push(file);
      continue;
    }

    rebasedFiles.push({
      ...file,
      content: rebased.content,
      initialContent: upstreamContent,
      parentCommitSha: upstreamSha,
    });
  }

  return {
    rebasedFiles,
    conflicts,
  };
}

export async function rebaseStagedFilesOnLatestHead(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
  stagedFiles: StagedFileForCommit[];
}): Promise<StagedFileForCommit[]> {
  const inspection = await inspectStagedFilesAgainstLatestHead(args);
  if (inspection.conflicts.length > 0) {
    throw new Error(formatUpstreamConflictError(inspection.conflicts.map((file) => file.filePath)));
  }

  return inspection.rebasedFiles;
}

const MAX_COMMIT_PREVIEW_PATCH_CHARS_PER_FILE = 25_000;
const MAX_COMMIT_PREVIEW_PATCH_CHARS_TOTAL = 150_000;
const MAX_COMMIT_PREVIEW_MARKDOWN_RICH_CHARS_PER_FIELD = 40_000;
const MAX_CONFLICT_PREVIEW_PATCH_CHARS_PER_PATCH = 25_000;

function buildBoundedPatch(args: {
  oldPath: string;
  newPath: string;
  oldContent: string;
  newContent: string;
  maxChars: number;
}): {
  patch: string;
  truncated: boolean;
} {
  const fullPatch = createTwoFilesPatch(
    args.oldPath,
    args.newPath,
    args.oldContent,
    args.newContent,
    "",
    "",
    { context: 3 },
  );

  if (fullPatch.length <= args.maxChars) {
    return {
      patch: fullPatch,
      truncated: false,
    };
  }

  return {
    patch: `${fullPatch.slice(0, args.maxChars)}\n... [patch truncated]`,
    truncated: true,
  };
}

function buildConflictPatchPair(file: StagedFileRebaseConflict): {
  baseToStagedPatch: {
    patch: string;
    truncated: boolean;
  };
  baseToUpstreamPatch: {
    patch: string;
    truncated: boolean;
  };
} {
  if (file.upstreamContent === undefined) {
    throw new Error("Cannot build text patches for a binary conflict.");
  }

  return {
    baseToStagedPatch: buildBoundedPatch({
      oldPath: file.initialFilePath,
      newPath: file.filePath,
      oldContent: file.initialContent,
      newContent: file.content,
      maxChars: MAX_CONFLICT_PREVIEW_PATCH_CHARS_PER_PATCH,
    }),
    baseToUpstreamPatch: buildBoundedPatch({
      oldPath: file.initialFilePath,
      newPath: file.upstreamPath ?? file.initialFilePath,
      oldContent: file.initialContent,
      newContent: file.upstreamContent,
      maxChars: MAX_CONFLICT_PREVIEW_PATCH_CHARS_PER_PATCH,
    }),
  };
}

export function buildRebaseConflictPreviewFromStagedFiles(args: {
  conflicts: StagedFileRebaseConflict[];
  branch: string;
}): RebaseConflictPreviewResult {
  const files: RebaseConflictPreviewFile[] = args.conflicts.map((file) => {
    const isBinary = isBinaryStagedFile(file);
    const patchPair = isBinary ? null : buildConflictPatchPair(file);
    const renamed = file.filePath !== file.initialFilePath;

    return {
      path: file.filePath,
      previousPath: renamed ? file.initialFilePath : undefined,
      upstreamPath:
        file.upstreamPath !== undefined && file.upstreamPath !== file.filePath
          ? file.upstreamPath
          : undefined,
      isBinary,
      mimeType: isBinary ? file.mime : undefined,
      isMarkdown: !isBinary && isMarkdownPath(file.filePath),
      baseBlobSha: file.parentCommitSha ?? undefined,
      upstreamBlobSha: file.upstreamSha,
      baseToStagedPatchTruncated: patchPair?.baseToStagedPatch.truncated ?? false,
      baseToStagedPatch: patchPair?.baseToStagedPatch.patch,
      baseToUpstreamPatchTruncated: patchPair?.baseToUpstreamPatch.truncated ?? false,
      baseToUpstreamPatch: patchPair?.baseToUpstreamPatch.patch,
    };
  });

  return {
    branch: args.branch,
    files,
  };
}

function buildRebaseConflictBundleMarkdown(args: {
  repositoryFullName: string;
  branch: string;
  conflicts: StagedFileRebaseConflict[];
}): string {
  const sections = args.conflicts.flatMap((file) => {
    if (isBinaryStagedFile(file)) {
      const fileLines = [
        `## ${file.filePath}`,
        ...(file.filePath !== file.initialFilePath
          ? [`- Previous path: ${file.initialFilePath}`]
          : []),
        ...(file.parentCommitSha ? [`- Base blob SHA: ${file.parentCommitSha}`] : []),
        `- Upstream blob SHA: ${file.upstreamSha}`,
        `- Binary media conflict${file.mime ? ` (${file.mime})` : ""}`,
      ];

      return [
        fileLines.join("\n"),
        "### Resolution",
        "Binary conflict requires a replace or retry after reloading.",
      ];
    }

    const { baseToStagedPatch, baseToUpstreamPatch } = buildConflictPatchPair(file);
    const fileLines = [
      `## ${file.filePath}`,
      ...(file.filePath !== file.initialFilePath
        ? [`- Previous path: ${file.initialFilePath}`]
        : []),
      ...(file.parentCommitSha ? [`- Base blob SHA: ${file.parentCommitSha}`] : []),
      `- Upstream blob SHA: ${file.upstreamSha}`,
    ];

    return [
      fileLines.join("\n"),
      "### Base",
      "````text",
      file.initialContent,
      "````",
      "### Ours",
      "````text",
      file.content,
      "````",
      "### Upstream",
      "````text",
      file.upstreamContent,
      "````",
      "### Base -> Ours patch",
      "````diff",
      baseToStagedPatch.patch,
      "````",
      "### Base -> Upstream patch",
      "````diff",
      baseToUpstreamPatch.patch,
      "````",
    ];
  });

  return [
    "# Samebase rebase conflict bundle",
    `- Repository: ${args.repositoryFullName}`,
    `- Branch: ${args.branch}`,
    "",
    ...sections,
  ].join("\n");
}

function truncateInlineDiffContent(content: string): {
  content: string;
  truncated: boolean;
} {
  if (content.length <= MAX_COMMIT_PREVIEW_MARKDOWN_RICH_CHARS_PER_FIELD) {
    return { content, truncated: false };
  }

  const suffix = "\n\n... [content truncated for rich preview]";
  const sliceLength = Math.max(0, MAX_COMMIT_PREVIEW_MARKDOWN_RICH_CHARS_PER_FIELD - suffix.length);

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
    const value = part.value;
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
  return lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".markdown");
}

function canHydrateInlineDiffText(path: string, buffer: Uint8Array): boolean {
  const mime = guessMime(path);
  const hasKnownTextMime = mime.includes("charset=utf-8") || mime === "image/svg+xml";

  if (!hasKnownTextMime && mime !== "application/octet-stream") {
    return false;
  }

  return buffer.byteLength <= INLINE_TEXT_MAX && isTextBuffer(buffer);
}

function buildCommitPreviewFileFromContents(args: {
  status: CommitPreviewFile["status"];
  path: string;
  previousPath?: string;
  isBinary?: boolean;
  mimeType?: string;
  oldContent: string;
  newContent: string;
  includePatch: boolean;
  hydrateRichContent?: boolean;
}): CommitPreviewFile {
  const isBinary = args.isBinary ?? false;
  const isMarkdown = !isBinary && isMarkdownPath(args.path);
  const lineStats = isBinary
    ? { additions: 0, deletions: 0 }
    : computeLineStats(args.oldContent, args.newContent);

  let richOldContent: string | undefined;
  let richNewContent: string | undefined;
  let richContentTruncated: boolean | undefined;
  if (!isBinary && (args.hydrateRichContent ?? isMarkdown)) {
    const truncatedOld = truncateInlineDiffContent(args.oldContent);
    const truncatedNew = truncateInlineDiffContent(args.newContent);
    richOldContent = truncatedOld.content;
    richNewContent = truncatedNew.content;
    richContentTruncated = truncatedOld.truncated || truncatedNew.truncated;
  }

  let patch: string | undefined;
  if (
    !isBinary &&
    args.includePatch &&
    !(args.status === "renamed" && args.oldContent === args.newContent)
  ) {
    patch = createTwoFilesPatch(
      args.previousPath ?? args.path,
      args.path,
      args.oldContent,
      args.newContent,
      "",
      "",
      { context: 3 },
    );
  }

  return {
    status: args.status,
    path: args.path,
    previousPath: args.previousPath,
    isBinary,
    mimeType: isBinary ? args.mimeType : undefined,
    additions: lineStats.additions,
    deletions: lineStats.deletions,
    oldLineCount: isBinary ? 0 : countLines(args.oldContent),
    newLineCount: isBinary ? 0 : countLines(args.newContent),
    isMarkdown,
    richOldContent,
    richNewContent,
    richContentTruncated,
    patchTruncated: false,
    patch,
  };
}

function clampCommitPreviewPatches(files: CommitPreviewFile[]): CommitPreviewFile[] {
  let totalPatchChars = 0;

  return files.map((file) => {
    if (typeof file.patch !== "string") {
      return file;
    }

    let boundedPatch = file.patch;
    let patchTruncated = file.patchTruncated;

    if (boundedPatch.length > MAX_COMMIT_PREVIEW_PATCH_CHARS_PER_FILE) {
      boundedPatch = `${boundedPatch.slice(0, MAX_COMMIT_PREVIEW_PATCH_CHARS_PER_FILE)}\n... [patch truncated]`;
      patchTruncated = true;
    }

    const remainingBudget = Math.max(0, MAX_COMMIT_PREVIEW_PATCH_CHARS_TOTAL - totalPatchChars);
    if (boundedPatch.length > remainingBudget) {
      if (remainingBudget > 0) {
        boundedPatch = `${boundedPatch.slice(0, remainingBudget)}\n... [patch truncated]`;
      } else {
        boundedPatch = "... [patch truncated]";
      }
      patchTruncated = true;
    }

    totalPatchChars += boundedPatch.length;

    return {
      ...file,
      patch: boundedPatch,
      patchTruncated,
    };
  });
}

function buildCommitPreviewTotals(files: CommitPreviewFile[]): CommitPreviewTotals {
  return files.reduce<CommitPreviewTotals>(
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
}

function buildCommitPreviewSafety(files: CommitPreviewFile[]): CommitPreviewSafety {
  const destructiveFileCount = files.filter((file) => file.status === "deleted").length;
  const truncatedPatchFileCount = files.filter((file) => file.patchTruncated).length;

  return {
    destructiveFileCount,
    truncatedPatchFileCount,
    includesTruncatedPatches: truncatedPatchFileCount > 0,
  };
}

function finalizeCommitPreviewFiles(files: CommitPreviewFile[]): CommitPreviewFile[] {
  const sortedFiles = [...files].sort((left, right) => left.path.localeCompare(right.path));
  return clampCommitPreviewPatches(sortedFiles);
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
  const files = finalizeCommitPreviewFiles(
    stagedFiles.map((file) => {
      const isBinary = isBinaryStagedFile(file);
      const renamed = file.filePath !== file.initialFilePath;
      const status = file.fileDeleted
        ? ("deleted" as const)
        : file.parentCommitSha === null
          ? ("added" as const)
          : renamed
            ? ("renamed" as const)
            : ("modified" as const);

      return buildCommitPreviewFileFromContents({
        status,
        path: file.filePath,
        previousPath: renamed ? file.initialFilePath : undefined,
        isBinary,
        mimeType: isBinary ? file.mime : undefined,
        oldContent: isBinary ? "" : file.initialContent,
        newContent: file.fileDeleted || isBinary ? "" : file.content,
        includePatch,
        hydrateRichContent: true,
      });
    }),
  );
  const totals = buildCommitPreviewTotals(files);
  const safety = buildCommitPreviewSafety(files);

  return {
    branch,
    hasDestructiveChanges: totals.deleted > 0,
    files,
    totals,
    safety,
  };
}

function readCommitPreviewFileStatus(
  status: string | null | undefined,
): CommitPreviewFile["status"] {
  if (status === "added") {
    return "added";
  }
  if (status === "removed") {
    return "deleted";
  }
  if (status === "renamed") {
    return "renamed";
  }
  return "modified";
}

function buildRemoteComparePreviewFileFromMetadata(
  file: GitHubCompareFileCandidate,
): CommitPreviewFile | null {
  if (typeof file.filename !== "string" || file.filename.length === 0) {
    return null;
  }

  return {
    status: readCommitPreviewFileStatus(file.status),
    path: file.filename,
    previousPath:
      typeof file.previous_filename === "string" && file.previous_filename.length > 0
        ? file.previous_filename
        : undefined,
    isBinary: false,
    mimeType: undefined,
    additions: typeof file.additions === "number" ? file.additions : 0,
    deletions: typeof file.deletions === "number" ? file.deletions : 0,
    oldLineCount: 0,
    newLineCount: 0,
    isMarkdown: isMarkdownPath(file.filename),
    patchTruncated: false,
    patch: typeof file.patch === "string" && file.patch.length > 0 ? file.patch : undefined,
  };
}

/**
 * GitHub compare metadata only includes patch text, but compare mode needs full
 * old/new text content whenever we want to reuse the inline merge view instead
 * of falling back to a raw patch.
 */
export async function buildRemoteComparePreviewFile(args: {
  file: GitHubCompareFileCandidate;
  baseShaByPath: Map<string, string>;
  headShaByPath: Map<string, string>;
  getBlobBufferBySha: (sha: string) => Promise<Uint8Array>;
  includePatch: boolean;
}): Promise<CommitPreviewFile | null> {
  const metadataFile = buildRemoteComparePreviewFileFromMetadata(args.file);
  if (!metadataFile) {
    return null;
  }
  const metadataFileWithoutPatch = args.includePatch
    ? metadataFile
    : {
        ...metadataFile,
        patch: undefined,
      };

  const basePath =
    metadataFile.status === "renamed" && typeof metadataFile.previousPath === "string"
      ? metadataFile.previousPath
      : metadataFile.path;
  const oldSha =
    metadataFile.status === "added" ? null : (args.baseShaByPath.get(basePath) ?? null);
  const newSha =
    metadataFile.status === "deleted" ? null : (args.headShaByPath.get(metadataFile.path) ?? null);

  if (
    (metadataFile.status !== "added" && !oldSha) ||
    (metadataFile.status !== "deleted" && !newSha)
  ) {
    return metadataFileWithoutPatch;
  }

  const oldBuffer = oldSha ? await args.getBlobBufferBySha(oldSha) : null;
  const newBuffer = newSha ? await args.getBlobBufferBySha(newSha) : null;
  const oldContent =
    oldBuffer && canHydrateInlineDiffText(metadataFile.path, oldBuffer)
      ? new TextDecoder("utf-8", { fatal: false }).decode(oldBuffer)
      : null;
  const newContent =
    newBuffer && canHydrateInlineDiffText(metadataFile.path, newBuffer)
      ? new TextDecoder("utf-8", { fatal: false }).decode(newBuffer)
      : null;

  if (
    (metadataFile.status !== "added" && oldContent === null) ||
    (metadataFile.status !== "deleted" && newContent === null)
  ) {
    return metadataFileWithoutPatch;
  }

  return buildCommitPreviewFileFromContents({
    status: metadataFile.status,
    path: metadataFile.path,
    previousPath: metadataFile.previousPath,
    oldContent: oldContent ?? "",
    newContent: newContent ?? "",
    includePatch: args.includePatch,
    hydrateRichContent: true,
  });
}

function findMatchingRemoteCompareFile(args: {
  stagedFile: StagedFileForCommit;
  remoteFilesByPath: Map<string, CommitPreviewFile>;
  remoteFilesByPreviousPath: Map<string, CommitPreviewFile>;
}): CommitPreviewFile | null {
  const candidates = [
    args.remoteFilesByPath.get(args.stagedFile.initialFilePath),
    args.remoteFilesByPath.get(args.stagedFile.filePath),
    args.remoteFilesByPreviousPath.get(args.stagedFile.initialFilePath),
    args.remoteFilesByPreviousPath.get(args.stagedFile.filePath),
  ];

  for (const candidate of candidates) {
    if (candidate && args.remoteFilesByPath.has(candidate.path)) {
      return candidate;
    }
  }

  return null;
}

function resolveComparedStagedFileBasePath(args: {
  stagedFile: StagedFileForCommit;
  matchedRemoteFile: Pick<CommitPreviewFile, "status" | "path" | "previousPath"> | null;
  baseTreePaths: Set<string>;
}): string | null {
  if (args.matchedRemoteFile) {
    if (args.matchedRemoteFile.status === "added") {
      return null;
    }

    if (
      args.matchedRemoteFile.status === "renamed" &&
      typeof args.matchedRemoteFile.previousPath === "string"
    ) {
      return args.matchedRemoteFile.previousPath;
    }

    return args.matchedRemoteFile.path;
  }

  if (args.baseTreePaths.has(args.stagedFile.initialFilePath)) {
    return args.stagedFile.initialFilePath;
  }

  if (args.baseTreePaths.has(args.stagedFile.filePath)) {
    return args.stagedFile.filePath;
  }

  return null;
}

/**
 * Compare mode needs to reinterpret staged rows against the PR/base side rather
 * than against the current branch head, otherwise remote PR changes and local
 * staged edits produce incorrect statuses like added->renamed or deleted->added.
 * These rows are editor-backed text files, so they should keep the same rich
 * merge surface for code/text diffs that markdown already uses.
 */
export function buildComparedCommitPreviewFileFromStagedFile(args: {
  stagedFile: StagedFileForCommit;
  matchedRemoteFile: Pick<CommitPreviewFile, "status" | "path" | "previousPath"> | null;
  basePath: string | null;
  baseContent: string;
  includePatch: boolean;
}): CommitPreviewFile | null {
  if (args.stagedFile.fileDeleted) {
    if (args.basePath === null) {
      return null;
    }

    return buildCommitPreviewFileFromContents({
      status: "deleted",
      path: args.basePath,
      oldContent: args.baseContent,
      newContent: "",
      includePatch: args.includePatch,
      hydrateRichContent: true,
    });
  }

  if (args.basePath === null) {
    return buildCommitPreviewFileFromContents({
      status: "added",
      path: args.stagedFile.filePath,
      oldContent: "",
      newContent: args.stagedFile.content,
      includePatch: args.includePatch,
      hydrateRichContent: true,
    });
  }

  const previousPath =
    args.matchedRemoteFile?.status === "renamed" &&
    typeof args.matchedRemoteFile.previousPath === "string"
      ? args.matchedRemoteFile.previousPath
      : args.basePath !== args.stagedFile.filePath
        ? args.basePath
        : undefined;

  if (!previousPath && args.stagedFile.content === args.baseContent) {
    return null;
  }

  return buildCommitPreviewFileFromContents({
    status: previousPath ? "renamed" : "modified",
    path: args.stagedFile.filePath,
    previousPath,
    oldContent: args.baseContent,
    newContent: args.stagedFile.content,
    includePatch: args.includePatch,
    hydrateRichContent: true,
  });
}

async function buildBranchComparePreviewFiles(args: {
  remoteFiles: CommitPreviewFile[];
  stagedFiles: StagedFileForCommit[];
  baseShaByPath: Map<string, string>;
  getBlobTextBySha: (sha: string) => Promise<string>;
  includePatch: boolean;
}): Promise<CommitPreviewFile[]> {
  const remoteFilesByPath = new Map(args.remoteFiles.map((file) => [file.path, file]));
  const remoteFilesByPreviousPath = new Map(
    args.remoteFiles.flatMap((file) =>
      typeof file.previousPath === "string" ? ([[file.previousPath, file]] as const) : [],
    ),
  );
  const baseTreePaths = new Set(args.baseShaByPath.keys());
  const overlayFiles: CommitPreviewFile[] = [];

  for (const stagedFile of args.stagedFiles) {
    const matchedRemoteFile = findMatchingRemoteCompareFile({
      stagedFile,
      remoteFilesByPath,
      remoteFilesByPreviousPath,
    });
    if (matchedRemoteFile) {
      remoteFilesByPath.delete(matchedRemoteFile.path);
      if (typeof matchedRemoteFile.previousPath === "string") {
        remoteFilesByPreviousPath.delete(matchedRemoteFile.previousPath);
      }
    }

    const basePath = resolveComparedStagedFileBasePath({
      stagedFile,
      matchedRemoteFile,
      baseTreePaths,
    });
    const baseSha = typeof basePath === "string" ? args.baseShaByPath.get(basePath) : undefined;
    const baseContent = typeof baseSha === "string" ? await args.getBlobTextBySha(baseSha) : "";

    const overlayFile = buildComparedCommitPreviewFileFromStagedFile({
      stagedFile,
      matchedRemoteFile,
      basePath,
      baseContent,
      includePatch: args.includePatch,
    });
    if (overlayFile) {
      overlayFiles.push(overlayFile);
    }
  }

  return finalizeCommitPreviewFiles([...remoteFilesByPath.values(), ...overlayFiles]);
}

async function getPullRequestCompareFiles(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  pullRequestNumber: number;
}): Promise<GitHubCompareFileCandidate[]> {
  const files: GitHubCompareFileCandidate[] = [];

  for (let page = 1; page <= 50; page += 1) {
    const response = await args.octokit.rest.pulls.listFiles({
      owner: args.owner,
      repo: args.repo,
      pull_number: args.pullRequestNumber,
      per_page: 100,
      page,
    });
    files.push(...response.data);

    if (response.data.length < 100) {
      break;
    }
  }

  return files;
}

// MARK: Public

// Rename a file in staging (updates the filePath while keeping initialFilePath)
export const renameFileInStaging = action({
  access: "access_files_write",
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
    const userId = ctx.viewer.userId;
    const branch =
      args.branch ??
      (() => {
        throw new Error("Branch is required to rename a staged file");
      })();

    const vault = await ctx.runQuery(internal.vault.records.getByIdForUser, {
      vaultId: args.vaultId,
      userId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }
    return await withVaultActionLease(
      ctx,
      { operation: "rename_staged_file", userId, vaultId: vault._id },
      async () => {
        const connectedVault = assertConnectedVault(vault);
        const githubAccess = await resolveGitHubAppAccess(ctx, {
          userId,
          target: { kind: "vault", vaultId: args.vaultId },
        });

        // So that we guarantee that we have the file in staging
        await ctx.runAction(api.fileStagingActions.getFileForEditing, {
          repositoryFullName: `${githubAccess.githubOwnerLogin}/${connectedVault.name}`,
          originalFilePath: args.originalPath,
          branch,
        });

        // Update existing staging record with new path
        const updatedFile = await ctx.runMutation(internal.fileStaging.rename, {
          vaultId: args.vaultId,
          initialFilePath: args.originalPath,
          branch,
          newPath: args.newPath,
          userId,
        });

        return {
          content: updatedFile.content,
        };
      },
    );
  },
});

/**
 * Initial request to get the file.
 * Will call GitHub and populate the vaultStagedFiles table.
 */
export const getFileForEditing = action({
  access: "access_files_read",
  args: {
    repositoryFullName: v.string(),
    originalFilePath: v.string(),
    branch: v.optional(v.string()),
  },

  handler: async (ctx, args): Promise<EditableFileState> => {
    const userId = ctx.viewer.userId;
    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    return await withVaultActionLease(
      ctx,
      { operation: "stage_repository_file", userId, vaultId: vault._id },
      async () => {
        const octokit = await getGitHubOctokit(ctx, userId, vault._id);
        const targetBranch =
          args.branch ??
          (await getRepositoryDefaultBranch({
            octokit,
            owner: vault.owner,
            repo: vault.name,
          }));

        // Check if there's staged content for this file
        const staging = await ctx.runQuery(internal.fileStaging.getByOriginalPath, {
          vaultId: vault._id,
          originalFilePath: args.originalFilePath,
          branch: targetBranch,
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

        try {
          const file = await octokit.rest.repos.getContent({
            owner: vault.owner,
            repo: vault.name,
            path: args.originalFilePath,
            ref: targetBranch,
          });

          if (Array.isArray(file.data)) {
            throw new Error("Path is a directory");
          }

          if (file.data.type !== "file") {
            throw new Error("Path is not a file");
          }

          const filePath = file.data.path;
          const fileSha = file.data.sha;
          if (typeof fileSha !== "string" || fileSha.length === 0) {
            throw new Error("File SHA is missing");
          }

          const cachedBlob = await ctx.runQuery(internal.gitOperations.getBlobBySha, {
            sha: fileSha,
          });

          if (cachedBlob) {
            if (typeof cachedBlob.text !== "string") {
              return stageRepositoryBinaryBlobForEditing({
                ctx,
                vaultId: vault._id,
                originalFilePath: args.originalFilePath,
                targetBranch,
                filePath,
                fileSha,
                userId,
                storageId: cachedBlob.storageId,
                mime: cachedBlob.mime,
                size: file.data.size,
                missingStorageError: "Cached binary blob is missing storage data.",
              });
            }

            const stagedFile = await ctx.runMutation(internal.fileStaging.saveToStaging, {
              branch: targetBranch,
              vaultId: vault._id,
              initialFilePath: args.originalFilePath,
              content: cachedBlob.text,
              initialContent: cachedBlob.text,
              parentCommitSha: fileSha,
              userId,
            });

            return readEditableFileState(stagedFile);
          }

          const blobResponse = await octokit.rest.git.getBlob({
            owner: vault.owner,
            repo: vault.name,
            file_sha: fileSha,
          });
          const buffer = Buffer.from(blobResponse.data.content, "base64");
          const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
          const isText = isTextBuffer(new Uint8Array(buffer));
          let mime = guessMime(filePath);
          if (mime === "application/octet-stream" && isText) {
            mime = "text/plain; charset=utf-8";
          }

          if (isText && file.data.size < INLINE_TEXT_MAX) {
            await ctx.runMutation(internal.gitOperations.saveFileBlob, {
              vaultId: vault._id,
              sha: fileSha,
              size: file.data.size,
              mime,
              text: buffer.toString("utf-8"),
              storageId: undefined,
              ext,
              debugFilePath: filePath,
            });
          } else {
            const storageReservation = await ctx.runMutation(
              internal.pendingUploads.reserveActionBlob,
              {
                vaultId: vault._id,
                userId,
                contentType: mime,
              },
            );
            const storageId = await withRetry(() =>
              ctx.storage.store(
                new Blob([buffer], { type: storageReservation.storageContentType }),
              ),
            );

            const savedBlobId = await ctx.runMutation(internal.gitOperations.saveFileBlob, {
              vaultId: vault._id,
              sha: fileSha,
              size: file.data.size,
              mime,
              text: undefined,
              storageId,
              storageIdIsDisposable: true,
              ext,
              debugFilePath: filePath,
            });
            await ctx.runMutation(internal.pendingUploads.releaseActionBlob, {
              uploadId: storageReservation.uploadId,
              storageId,
            });
            if (savedBlobId === null) {
              throw new Error("Organization is not available.");
            }
          }

          const savedBlob = await ctx.runQuery(internal.gitOperations.getBlobBySha, {
            sha: fileSha,
          });

          if (!savedBlob) {
            throw new Error(
              "File not found in observations_vaultFiles_blobs table after literally saving it there?!?",
            );
          }

          if (typeof savedBlob.text !== "string") {
            return stageRepositoryBinaryBlobForEditing({
              ctx,
              vaultId: vault._id,
              originalFilePath: args.originalFilePath,
              targetBranch,
              filePath,
              fileSha,
              userId,
              storageId: savedBlob.storageId,
              mime,
              size: file.data.size,
              missingStorageError: "Saved binary blob is missing storage data.",
            });
          }

          const stagedFile = await ctx.runMutation(internal.fileStaging.saveToStaging, {
            branch: targetBranch,
            vaultId: vault._id,
            initialFilePath: args.originalFilePath,
            content: savedBlob.text,
            initialContent: savedBlob.text,
            parentCommitSha: fileSha,
            userId,
          });

          return readEditableFileState(stagedFile);
        } catch (error) {
          console.error("error", error);
          throw error;
        }
      },
    );
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
    repositoryFullName: string(),
    filePath: string(),
    uploadId: optional(v.id("vaultPendingUploads")),
    storageId: v.id("_storage"),
    branch: optional(string()),
    replaceExisting: boolean(),
  },
  returns: stagedMediaUploadResult,
  handler: async (ctx, args): Promise<StagedMediaUploadResult> => {
    const userId = ctx.viewer.userId;
    let claim;
    if (args.uploadId === undefined) {
      const legacyClaim = await ctx.runMutation(internal.fileStaging.claimLegacyUploadedBlob, {
        repositoryFullName: args.repositoryFullName,
        storageId: args.storageId,
        userId,
      });
      if (legacyClaim.state === "unavailable") {
        throw new Error("Organization is not available.");
      }
      claim = legacyClaim;
    } else {
      const reservedClaim = await ctx.runMutation(internal.pendingUploads.claimUploadedBlob, {
        uploadId: args.uploadId,
        storageId: args.storageId,
        userId,
      });
      if (reservedClaim.state === "unavailable") {
        throw new Error("Organization is not available.");
      }
      claim = { ...reservedClaim, uploadId: args.uploadId };
    }

    try {
      if (getRepositoryMediaKind(args.filePath) !== "image") {
        throw new Error("Only image uploads are supported right now.");
      }
      const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
        repositoryFullName: args.repositoryFullName,
        userId,
      });
      if (!vault || vault._id !== claim.vaultId) {
        throw new Error("Vault not found");
      }

      const octokit = await getGitHubOctokit(ctx, userId, vault._id);
      const targetBranch =
        args.branch ??
        (await getRepositoryDefaultBranch({
          octokit,
          owner: vault.owner,
          repo: vault.name,
        }));

      const uploadedBlob = await ctx.storage.get(args.storageId);
      if (!uploadedBlob) {
        throw new Error("Uploaded media is no longer available.");
      }

      const uploadedBuffer = Buffer.from(await uploadedBlob.arrayBuffer());
      const stagedBlobSha = computeGitBlobShaFromBuffer(uploadedBuffer);
      const stagedFile = await ctx.runMutation(internal.fileStaging.saveBinaryUploadToStaging, {
        uploadId: claim.uploadId,
        vaultId: vault._id,
        filePath: args.filePath,
        branch: targetBranch,
        storageId: args.storageId,
        mime: claim.contentType || guessMime(args.filePath),
        size: uploadedBlob.size,
        stagedBlobSha,
        replaceExisting: args.replaceExisting,
        userId,
      });

      return {
        filePath: stagedFile.filePath,
        branch: stagedFile.branch,
        parentCommitSha: stagedFile.parentCommitSha ?? undefined,
        replacedExisting: stagedFile.parentCommitSha !== null,
      };
    } catch (error) {
      await ctx.runMutation(internal.pendingUploads.discardUploadedBlob, {
        uploadId: claim.uploadId,
        storageId: args.storageId,
        userId,
      });
      throw error;
    }
  },
});

// Commit staged file to GitHub
export const commitStaging = action({
  access: "access_files_write",
  args: {
    repositoryFullName: v.string(),
    branch: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = ctx.viewer.userId;

    // Get the vault information while we have auth context
    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    return await withVaultActionLease(
      ctx,
      { operation: "commit_staged_files", userId, vaultId: vault._id },
      async () => {
        // commitAllStaged handles the GitHub commit, tree refresh, blob save, and staging clear.
        await ctx.runAction(internal.fileStagingActions.commitAllStaged, {
          userId,
          vaultId: vault._id,
          branch: args.branch,
        });
        return null;
      },
    );
  },
});

export const createDraftPullRequest = action({
  access: "access_files_write",
  args: {
    repositoryFullName: string(),
    branch: optional(string()),
  },
  returns: draftPullRequestResult,
  handler: async (ctx, args): Promise<DraftPullRequestResult> => {
    const userId = ctx.viewer.userId;
    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    return await withVaultActionLease(
      ctx,
      { operation: "create_draft_pull_request", userId, vaultId: vault._id },
      async () => {
        const octokit = await getGitHubOctokit(ctx, userId, vault._id);
        const defaultBranch = await getRepositoryDefaultBranch({
          octokit,
          owner: vault.owner,
          repo: vault.name,
        });
        const branch = args.branch?.trim() || defaultBranch;

        if (branch === defaultBranch) {
          throw new Error("Create the draft PR from a non-default branch.");
        }

        const stagedFiles: StagedFileForCommit[] = await ctx.runQuery(
          internal.fileStaging.listAllStagedFiles,
          {
            vaultId: vault._id,
            branch,
          },
        );
        if (stagedFiles.length > 0) {
          await ctx.runAction(internal.fileStagingActions.commitAllStaged, {
            userId,
            vaultId: vault._id,
            branch,
          });
        }

        const existingPullRequest = await getOpenPullRequestForBranch({
          octokit,
          owner: vault.owner,
          repo: vault.name,
          branch,
          baseBranch: defaultBranch,
        });
        if (existingPullRequest) {
          return {
            ...existingPullRequest,
            existing: true,
          };
        }

        const comparison = await octokit.rest.repos.compareCommitsWithBasehead({
          owner: vault.owner,
          repo: vault.name,
          basehead: `${defaultBranch}...${branch}`,
        });
        if (comparison.data.ahead_by === 0) {
          throw new Error("This branch has no changes to open as a pull request.");
        }

        try {
          const response = await octokit.rest.pulls.create({
            owner: vault.owner,
            repo: vault.name,
            title: buildDraftPullRequestTitle({
              branch,
              commitMessage: await getBranchHeadCommitMessage({
                octokit,
                owner: vault.owner,
                repo: vault.name,
                branch,
              }),
            }),
            head: branch,
            base: defaultBranch,
            draft: true,
          });

          return {
            url: response.data.html_url,
            number: response.data.number,
            existing: false,
          };
        } catch (error) {
          const currentPullRequest = await getOpenPullRequestForBranch({
            octokit,
            owner: vault.owner,
            repo: vault.name,
            branch,
            baseBranch: defaultBranch,
          });
          if (currentPullRequest) {
            return {
              ...currentPullRequest,
              existing: true,
            };
          }

          const friendlyMessage = getDraftPullRequestCreateErrorMessage(error);
          if (friendlyMessage) {
            throw new Error(friendlyMessage);
          }
          throw error;
        }
      },
    );
  },
});

export const createDraftPullRequestFromDefaultBranch = action({
  access: "access_files_write",
  args: {
    repositoryFullName: string(),
    branch: optional(string()),
  },
  returns: defaultBranchDraftPullRequestResult,
  handler: async (ctx, args): Promise<DefaultBranchDraftPullRequestResult> => {
    const userId = ctx.viewer.userId;
    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    return await withVaultActionLease(
      ctx,
      { operation: "create_draft_pull_request", userId, vaultId: vault._id },
      async () => {
        const octokit = await getGitHubOctokit(ctx, userId, vault._id);
        const defaultBranch = await getRepositoryDefaultBranch({
          octokit,
          owner: vault.owner,
          repo: vault.name,
        });
        const sourceBranch = args.branch?.trim() || defaultBranch;
        if (sourceBranch !== defaultBranch) {
          throw new Error("Create a new draft branch from the default branch.");
        }

        const stagedFilesResult: DraftSourceStagingRecord[] = await ctx.runQuery(
          internal.fileStaging.listAllStagedFiles,
          {
            vaultId: vault._id,
            branch: defaultBranch,
          },
        );
        const stagedFiles: DraftSourceStagingSnapshot[] = stagedFilesResult.map(
          stripCreationTimeFromStagingRecord,
        );
        if (stagedFiles.length === 0) {
          throw new Error("Stage changes on the default branch before drafting.");
        }

        const targetBranch = buildDraftBranchName({
          stagedFiles,
          now: Date.now(),
        });
        const defaultRef = await octokit.rest.git.getRef({
          owner: vault.owner,
          repo: vault.name,
          ref: `heads/${defaultBranch}`,
        });

        await octokit.rest.git.createRef({
          owner: vault.owner,
          repo: vault.name,
          ref: `refs/heads/${targetBranch}`,
          sha: defaultRef.data.object.sha,
        });

        const initialTargetBranchSha = defaultRef.data.object.sha;
        try {
          await ctx.runMutation(internal.fileStaging.duplicateBranchStaging, {
            vaultId: vault._id,
            sourceBranch: defaultBranch,
            targetBranch,
            stagedFiles,
            userId,
          });
        } catch (error) {
          await cleanupTemporaryDraftBranch({
            ctx,
            octokit,
            vaultId: vault._id,
            owner: vault.owner,
            repo: vault.name,
            branch: targetBranch,
          });

          if (error instanceof Error && error.message.length > 0) {
            throw error;
          }
          throw new Error("Failed to create draft pull request");
        }

        try {
          await ctx.runAction(internal.fileStagingActions.commitAllStaged, {
            userId,
            vaultId: vault._id,
            branch: targetBranch,
          });
        } catch (error) {
          // commitAllStaged can fail after GitHub advances the branch ref, so
          // re-check the head before rolling back the newly created branch.
          const currentTargetBranchSha = await getBranchHeadShaOrNull({
            octokit,
            owner: vault.owner,
            repo: vault.name,
            branch: targetBranch,
          });
          if (currentTargetBranchSha === initialTargetBranchSha) {
            await cleanupTemporaryDraftBranch({
              ctx,
              octokit,
              vaultId: vault._id,
              owner: vault.owner,
              repo: vault.name,
              branch: targetBranch,
            });
          }

          if (error instanceof Error && error.message.length > 0) {
            throw error;
          }
          throw new Error("Failed to create draft pull request");
        }

        try {
          let url: string;
          let number: number;
          try {
            const response = await octokit.rest.pulls.create({
              owner: vault.owner,
              repo: vault.name,
              title: buildDraftPullRequestTitle({
                branch: targetBranch,
                commitMessage: await getBranchHeadCommitMessage({
                  octokit,
                  owner: vault.owner,
                  repo: vault.name,
                  branch: targetBranch,
                }),
              }),
              head: targetBranch,
              base: defaultBranch,
              draft: true,
            });
            url = response.data.html_url;
            number = response.data.number;
          } catch (error) {
            const currentPullRequest = await getOpenPullRequestForBranch({
              octokit,
              owner: vault.owner,
              repo: vault.name,
              branch: targetBranch,
              baseBranch: defaultBranch,
            });
            if (!currentPullRequest) {
              // If GitHub never confirmed a PR, keep the default-branch staging
              // intact so the user can retry from the same source state.
              await cleanupTemporaryDraftBranch({
                ctx,
                octokit,
                vaultId: vault._id,
                owner: vault.owner,
                repo: vault.name,
                branch: targetBranch,
              });

              if (error instanceof Error && error.message.length > 0) {
                throw error;
              }
              throw new Error("Failed to create draft pull request");
            }
            url = currentPullRequest.url;
            number = currentPullRequest.number;
          }

          // Once GitHub confirms the draft PR, clear only the unchanged source
          // snapshot so newer default-branch edits survive while retries do not
          // re-draft the same work.
          await ctx.runMutation(internal.fileStaging.clearMatchingStagingSnapshot, {
            vaultId: vault._id,
            branch: defaultBranch,
            stagedFiles,
          });

          return {
            branch: targetBranch,
            url,
            number,
          };
        } catch (error) {
          if (error instanceof Error && error.message.length > 0) {
            throw error;
          }
          throw new Error("Failed to create draft pull request");
        }
      },
    );
  },
});

// Pull the latest tree from GitHub and reconcile with staged files.
// Staged files with real edits are rebased onto GitHub; conflicts get markers.
// Unchanged staging records are cleaned up.
export const pullFromGitHub = action({
  access: "access_files_write",
  args: {
    vaultId: v.id("vaults"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = ctx.viewer.userId;
    const vault = await ctx.runQuery(internal.vault.records.getByIdForUser, {
      userId,
      vaultId: args.vaultId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    return await withVaultActionLease(
      ctx,
      { operation: "pull_from_github", userId, vaultId: vault._id },
      async () => {
        await ctx.runAction(internal.fileStagingActions.pullFromGitHubInternal, {
          userId,
          vaultId: vault._id,
        });
        return null;
      },
    );
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
    const vault = await ctx.runQuery(internal.vault.records.getByIdForUser, {
      vaultId: args.vaultId,
      userId: args.userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }
    const connectedVault = assertConnectedVault(vault);
    const githubAccess = await resolveGitHubAppAccess(ctx, {
      userId: args.userId,
      target: { kind: "vault", vaultId: args.vaultId },
    });
    const octokit = githubAccess.octokit;

    // 1. Read all staging records for this vault (including unchanged)
    const allStaged = await ctx.runQuery(internal.fileStaging.listAllStagedFiles, {
      vaultId: args.vaultId,
      includeUnchanged: true,
    });

    const treeMapByBranch = new Map<string, Promise<Map<string, string>>>();
    const getTreeMapForBranch = (branch: string): Promise<Map<string, string>> => {
      const existing = treeMapByBranch.get(branch);
      if (existing) {
        return existing;
      }

      const loaded = getBranchTreeMap({
        octokit,
        owner: githubAccess.githubOwnerLogin,
        repo: connectedVault.name,
        branch,
      });
      treeMapByBranch.set(branch, loaded);
      return loaded;
    };

    // 2. Build reconciliation instructions
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
      branch: string;
      initialFilePath: string;
      filePath: string;
      version: number;
      stagedContent: string;
      initialContent: string;
      fileDeleted: boolean;
    }> = [];

    for (const staged of allStaged) {
      const branchTreeMap = await getTreeMapForBranch(staged.branch);
      const isEdited = hasStagedFileChanges(staged);
      const isNewFile = staged.parentCommitSha === null;

      if (isNewFile) {
        continue;
      }

      const pathInTree = staged.initialFilePath;
      const newSha = branchTreeMap.get(pathInTree);
      const fileExistsOnGitHub = newSha !== undefined;

      if (!isEdited) {
        instructions.push({ action: "delete", stagingId: staged._id });
        continue;
      }

      if (!fileExistsOnGitHub) {
        instructions.push({
          action: "update",
          stagingId: staged._id,
          parentCommitSha: null,
        });
      } else if (newSha !== staged.parentCommitSha) {
        if (readStagedFileKind(staged.kind) === "binary") {
          if (
            shouldAdvanceBinaryPullParentCommit({
              stagedBlobSha: staged.stagedBlobSha,
              fileDeleted: staged.fileDeleted,
              upstreamSha: newSha,
            })
          ) {
            instructions.push({
              action: "update",
              stagingId: staged._id,
              parentCommitSha: newSha,
            });
          }
          continue;
        }
        blobFetchQueue.push({
          stagingId: staged._id,
          sha: newSha,
          branch: staged.branch,
          initialFilePath: staged.initialFilePath,
          filePath: staged.filePath,
          version: staged.version,
          stagedContent: staged.content,
          initialContent: staged.initialContent,
          fileDeleted: staged.fileDeleted,
        });
      }
    }

    // 3. Fetch blobs for files that changed on GitHub (need new initialContent)
    for (const item of blobFetchQueue) {
      try {
        const blob = await octokit.rest.git.getBlob({
          owner: githubAccess.githubOwnerLogin,
          repo: connectedVault.name,
          file_sha: item.sha,
        });
        const buffer = Buffer.from(blob.data.content, "base64");
        const newContent = buffer.toString("utf-8");
        let shouldAdvanceParentCommit = true;
        if (!item.fileDeleted) {
          const rebaseResult = rebaseStagedContent({
            baseContent: item.initialContent,
            stagedContent: item.stagedContent,
            upstreamContent: newContent,
          });

          if (rebaseResult.content !== item.stagedContent) {
            try {
              await ctx.runMutation(internal.collaborative.pushContentUpdate, {
                vaultId: args.vaultId,
                filePath: item.filePath,
                branch: item.branch,
                expectedVersion: item.version,
                newContent: rebaseResult.content,
                userId: args.userId,
              });
            } catch (error) {
              if (!isStaleBaseVersionError(error)) {
                throw error;
              }

              const latestStaging = await ctx.runQuery(internal.fileStaging.getByOriginalPath, {
                vaultId: args.vaultId,
                originalFilePath: item.initialFilePath,
                branch: item.branch,
              });

              if (!latestStaging) {
                shouldAdvanceParentCommit = false;
              } else if (!latestStaging.fileDeleted) {
                const retriedRebase = rebaseStagedContent({
                  baseContent: latestStaging.initialContent,
                  stagedContent: latestStaging.content,
                  upstreamContent: newContent,
                });

                if (retriedRebase.content !== latestStaging.content) {
                  await ctx.runMutation(internal.collaborative.pushContentUpdate, {
                    vaultId: args.vaultId,
                    filePath: latestStaging.filePath,
                    branch: item.branch,
                    expectedVersion: latestStaging.version,
                    newContent: retriedRebase.content,
                    userId: args.userId,
                  });
                }
              }
            }
          }
        }

        if (shouldAdvanceParentCommit) {
          instructions.push({
            action: "update",
            stagingId: item.stagingId,
            parentCommitSha: item.sha,
            initialContent: newContent,
          });
        }
      } catch (error) {
        if (isStaleBaseVersionError(error)) {
          console.warn(`Skipping stale staging rebase for ${item.branch}:${item.filePath}`);
          continue;
        }
        console.error(`Failed to fetch blob ${item.sha}:`, error);
        // Still update the parentCommitSha even if we can't get content
        instructions.push({
          action: "update",
          stagingId: item.stagingId,
          parentCommitSha: item.sha,
        });
      }
    }

    // 4. Apply reconciliation instructions
    if (instructions.length > 0) {
      await ctx.runMutation(internal.fileStaging.reconcileStagingWithTree, {
        vaultId: args.vaultId,
        instructions,
        userId: args.userId,
      });
    }

    // 5. Refresh touched branch caches after reconciliation
    const touchedBranches = listTouchedBranchesForRefresh([
      ...allStaged.map((item) => item.branch),
      connectedVault.defaultBranch,
    ]);
    for (const branch of touchedBranches) {
      await ctx.runAction(internal.github.updateRepositoryTree, {
        userId: args.userId,
        vaultId: args.vaultId,
        branch,
      });
    }

    return null;
  },
});

// Batch-fetch file contents (read-only, no staging records).
// Used by the Monaco editor to load project files for TypeScript import resolution.
export const batchReadFiles = action({
  access: "access_files_read",
  args: {
    vaultId: v.id("vaults"),
    branch: v.optional(v.string()),
    filePaths: v.array(v.string()),
  },
  returns: v.array(v.object({ path: v.string(), content: v.string() })),
  handler: async (ctx, args): Promise<Array<{ path: string; content: string }>> => {
    const userId = ctx.viewer.userId;
    const vault = await ctx.runQuery(internal.vault.records.getByIdForUser, {
      vaultId: args.vaultId,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }
    return await withVaultActionLease(
      ctx,
      { operation: "cache_repository_files", userId, vaultId: vault._id },
      async () => {
        const connectedVault = assertConnectedVault(vault);
        const githubAccess = await resolveGitHubAppAccess(ctx, {
          userId,
          target: { kind: "vault", vaultId: args.vaultId },
        });
        const octokit = githubAccess.octokit;

        const requestedBranch =
          typeof args.branch === "string" && args.branch.trim().length > 0
            ? args.branch.trim()
            : undefined;
        let branchTreeData: GithubTree[] | null = null;
        const defaultBranch = connectedVault.defaultBranch;
        const branchToLoad = requestedBranch ?? defaultBranch;
        if (branchToLoad) {
          let branchTree = await ctx.runQuery(internal.vault.branches.getVaultBranchTree, {
            vaultId: args.vaultId,
            branch: branchToLoad,
          });

          if (!branchTree) {
            await ctx.runAction(internal.github.updateRepositoryTree, {
              userId,
              vaultId: args.vaultId,
              branch: branchToLoad,
            });
            branchTree = await ctx.runQuery(internal.vault.branches.getVaultBranchTree, {
              vaultId: args.vaultId,
              branch: branchToLoad,
            });
          }

          if (branchTree) {
            branchTreeData = branchTree.treeData.tree;
          }
        }
        const repositoryTree = selectBatchReadRepositoryTree({
          requestedBranch,
          branchTree: branchTreeData,
        });

        // Build a map of path → tree entry for fast lookups
        const treeMap = new Map<string, { sha: string; size?: number }>();
        for (const item of repositoryTree) {
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

        const getOctokit = () => octokit;

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
              owner: githubAccess.githubOwnerLogin,
              repo: connectedVault.name,
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
              const failure = describeRepositoryTreeRefreshFailure(error);
              const resetAtMs = rememberRateLimitResetAtMs(userId, failure.cooldownUntil);
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
    );
  },
});

export const getCommitPreview = action({
  access: "access_files_read",
  args: {
    repositoryFullName: v.string(),
    branch: v.optional(v.string()),
    includePatch: v.optional(v.boolean()),
  },
  returns: commitPreviewResult,
  handler: async (ctx, args): Promise<CommitPreviewResult> => {
    const userId = ctx.viewer.userId;
    const includePatch = args.includePatch ?? true;

    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    const stagedFiles: StagedFileForCommit[] = await ctx.runQuery(
      internal.fileStaging.listAllStagedFiles,
      {
        vaultId: vault._id,
        branch: args.branch,
      },
    );

    const stagedBranches: string[] = Array.from(
      new Set(stagedFiles.map((file: StagedFileForCommit) => file.branch).filter(notEmpty)),
    );
    if (stagedBranches.length > 1) {
      throw new Error(
        `Cannot preview staged files across multiple branches: ${stagedBranches.join(", ")}`,
      );
    }
    const branch =
      args.branch ??
      stagedBranches.at(0) ??
      (await getVaultDefaultBranch(ctx, userId, vault._id, vault.owner, vault.name));

    const octokit = await getGitHubOctokit(ctx, userId, vault._id);
    const rebasedStagedFiles = await rebaseStagedFilesOnLatestHead({
      octokit,
      owner: vault.owner,
      repo: vault.name,
      branch,
      stagedFiles,
    });

    return buildCommitPreviewFromStagedFiles({
      stagedFiles: rebasedStagedFiles,
      branch,
      includePatch,
    });
  },
});

export const getBranchComparePreview = action({
  access: "access_files_read",
  args: {
    repositoryFullName: v.string(),
    branch: v.optional(v.string()),
    includePatch: v.optional(v.boolean()),
  },
  returns: branchComparePreviewResult,
  handler: async (ctx, args): Promise<BranchComparePreviewResult> => {
    const userId = ctx.viewer.userId;
    const includePatch = args.includePatch ?? true;

    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    const stagedFiles: StagedFileForCommit[] = await ctx.runQuery(
      internal.fileStaging.listAllStagedFiles,
      {
        vaultId: vault._id,
        branch: args.branch,
      },
    );
    const stagedBranches = Array.from(
      new Set(stagedFiles.map((file) => file.branch).filter(notEmpty)),
    );
    if (stagedBranches.length > 1) {
      throw new Error(
        `Cannot compare staged files across multiple branches: ${stagedBranches.join(", ")}`,
      );
    }

    const octokit = await getGitHubOctokit(ctx, userId, vault._id);
    const defaultBranch = await getRepositoryDefaultBranch({
      octokit,
      owner: vault.owner,
      repo: vault.name,
    });
    const branch = args.branch?.trim() || stagedBranches.at(0) || defaultBranch;
    const currentPullRequest = await getLatestOpenPullRequestForBranch({
      octokit,
      owner: vault.owner,
      repo: vault.name,
      branch,
    });
    const baseBranch = currentPullRequest?.baseBranch ?? defaultBranch;
    const compareResponse = await octokit.rest.repos.compareCommitsWithBasehead({
      owner: vault.owner,
      repo: vault.name,
      basehead: `${baseBranch}...${branch}`,
    });
    const mergeBaseCommitSha = compareResponse.data.merge_base_commit.sha;
    const baseCommitSha = compareResponse.data.base_commit.sha;
    const mergeBaseSha =
      mergeBaseCommitSha.length > 0
        ? mergeBaseCommitSha
        : baseCommitSha.length > 0
          ? baseCommitSha
          : baseBranch;

    const baseShaByPath = await getTreeMapForRef({
      octokit,
      owner: vault.owner,
      repo: vault.name,
      ref: mergeBaseSha,
    });
    const headShaByPath = await getTreeMapForRef({
      octokit,
      owner: vault.owner,
      repo: vault.name,
      ref: branch,
    });
    const blobBufferBySha = new Map<string, Promise<Uint8Array>>();
    const getBlobBufferBySha = (sha: string): Promise<Uint8Array> => {
      const existing = blobBufferBySha.get(sha);
      if (existing) {
        return existing;
      }

      const loaded = octokit.rest.git
        .getBlob({
          owner: vault.owner,
          repo: vault.name,
          file_sha: sha,
        })
        .then((response) => {
          const content = response.data.content.replace(/\n/g, "");
          return new Uint8Array(Buffer.from(content, "base64"));
        })
        .catch((error) => {
          blobBufferBySha.delete(sha);
          throw error;
        });

      blobBufferBySha.set(sha, loaded);
      return loaded;
    };
    const getBlobTextBySha = async (sha: string): Promise<string> => {
      const buffer = await getBlobBufferBySha(sha);
      return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    };
    const remoteFileCandidates = currentPullRequest
      ? await getPullRequestCompareFiles({
          octokit,
          owner: vault.owner,
          repo: vault.name,
          pullRequestNumber: currentPullRequest.number,
        })
      : (compareResponse.data.files ?? []);
    const remoteFiles = (
      await Promise.all(
        remoteFileCandidates.map((file) =>
          buildRemoteComparePreviewFile({
            file,
            baseShaByPath,
            headShaByPath,
            getBlobBufferBySha,
            includePatch,
          }),
        ),
      )
    ).filter(notEmpty);
    const files =
      stagedFiles.length > 0
        ? await buildBranchComparePreviewFiles({
            remoteFiles,
            stagedFiles,
            baseShaByPath,
            getBlobTextBySha,
            includePatch,
          })
        : finalizeCommitPreviewFiles(remoteFiles);
    const totals = buildCommitPreviewTotals(files);
    const safety = buildCommitPreviewSafety(files);

    return {
      branch,
      baseBranch,
      source: currentPullRequest ? "pull_request" : "branch_compare",
      pullRequestNumber: currentPullRequest?.number,
      pullRequestUrl: currentPullRequest?.url,
      sourceFileListTruncated:
        currentPullRequest != null
          ? remoteFileCandidates.length >= PULL_REQUEST_COMPARE_FILE_LIST_LIMIT
          : remoteFileCandidates.length >= 300,
      hasDestructiveChanges: totals.deleted > 0,
      files,
      totals,
      safety,
    };
  },
});

export const restoreComparedDeletedFileToStaging = action({
  access: "access_files_write",
  args: {
    repositoryFullName: v.string(),
    branch: v.optional(v.string()),
    filePath: v.string(),
    previousPath: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = ctx.viewer.userId;
    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    return await withVaultActionLease(
      ctx,
      { operation: "restore_compare_file", userId, vaultId: vault._id },
      async () => {
        const octokit = await getGitHubOctokit(ctx, userId, vault._id);
        const defaultBranch = await getRepositoryDefaultBranch({
          octokit,
          owner: vault.owner,
          repo: vault.name,
        });
        const branch = args.branch?.trim() || defaultBranch;
        const currentPullRequest = await getLatestOpenPullRequestForBranch({
          octokit,
          owner: vault.owner,
          repo: vault.name,
          branch,
        });
        const baseBranch = currentPullRequest?.baseBranch ?? defaultBranch;
        const compareResponse = await octokit.rest.repos.compareCommitsWithBasehead({
          owner: vault.owner,
          repo: vault.name,
          basehead: `${baseBranch}...${branch}`,
        });
        const mergeBaseCommitSha = compareResponse.data.merge_base_commit.sha;
        const baseCommitSha = compareResponse.data.base_commit.sha;
        const mergeBaseSha =
          mergeBaseCommitSha.length > 0
            ? mergeBaseCommitSha
            : baseCommitSha.length > 0
              ? baseCommitSha
              : baseBranch;
        const baseShaByPath = await getTreeMapForRef({
          octokit,
          owner: vault.owner,
          repo: vault.name,
          ref: mergeBaseSha,
        });
        const basePath =
          typeof args.previousPath === "string" && baseShaByPath.has(args.previousPath)
            ? args.previousPath
            : args.filePath;
        const baseSha = baseShaByPath.get(basePath);
        if (typeof baseSha !== "string") {
          throw new Error("Deleted compare file is not available from the PR base.");
        }

        const blobResponse = await octokit.rest.git.getBlob({
          owner: vault.owner,
          repo: vault.name,
          file_sha: baseSha,
        });
        const buffer = new Uint8Array(
          Buffer.from(blobResponse.data.content.replace(/\n/g, ""), "base64"),
        );
        if (!canHydrateInlineDiffText(basePath, buffer)) {
          throw new Error("Only text compare files can be restored into staging right now.");
        }
        const content = Buffer.from(
          blobResponse.data.content.replace(/\n/g, ""),
          "base64",
        ).toString("utf-8");

        await ctx.runMutation(api.fileStaging.createFileInStaging, {
          vaultId: vault._id,
          filePath: args.filePath,
          content,
          branch,
        });

        return null;
      },
    );
  },
});

export const getRebaseConflictPreview = action({
  access: "access_files_read",
  args: {
    repositoryFullName: v.string(),
    branch: v.optional(v.string()),
  },
  returns: rebaseConflictPreviewResult,
  handler: async (ctx, args): Promise<RebaseConflictPreviewResult> => {
    const userId = ctx.viewer.userId;

    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    const stagedFiles: StagedFileForCommit[] = await ctx.runQuery(
      internal.fileStaging.listAllStagedFiles,
      {
        vaultId: vault._id,
        branch: args.branch,
      },
    );

    const stagedBranches: string[] = Array.from(
      new Set(stagedFiles.map((file: StagedFileForCommit) => file.branch).filter(notEmpty)),
    );
    if (stagedBranches.length > 1) {
      throw new Error(
        `Cannot inspect staged conflicts across multiple branches: ${stagedBranches.join(", ")}`,
      );
    }

    const branch =
      args.branch ??
      stagedBranches.at(0) ??
      (await getVaultDefaultBranch(ctx, userId, vault._id, vault.owner, vault.name));

    const octokit = await getGitHubOctokit(ctx, userId, vault._id);
    const inspection = await inspectStagedFilesAgainstLatestHead({
      octokit,
      owner: vault.owner,
      repo: vault.name,
      branch,
      stagedFiles,
    });

    return buildRebaseConflictPreviewFromStagedFiles({
      branch,
      conflicts: inspection.conflicts,
    });
  },
});

export const getRebaseConflictBundle = action({
  access: "access_files_read",
  args: {
    repositoryFullName: v.string(),
    branch: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const userId = ctx.viewer.userId;

    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    const stagedFiles: StagedFileForCommit[] = await ctx.runQuery(
      internal.fileStaging.listAllStagedFiles,
      {
        vaultId: vault._id,
        branch: args.branch,
      },
    );

    const stagedBranches: string[] = Array.from(
      new Set(stagedFiles.map((file: StagedFileForCommit) => file.branch).filter(notEmpty)),
    );
    if (stagedBranches.length > 1) {
      throw new Error(
        `Cannot inspect staged conflicts across multiple branches: ${stagedBranches.join(", ")}`,
      );
    }

    const branch =
      args.branch ??
      stagedBranches.at(0) ??
      (await getVaultDefaultBranch(ctx, userId, vault._id, vault.owner, vault.name));

    const octokit = await getGitHubOctokit(ctx, userId, vault._id);
    const inspection = await inspectStagedFilesAgainstLatestHead({
      octokit,
      owner: vault.owner,
      repo: vault.name,
      branch,
      stagedFiles,
    });

    if (inspection.conflicts.length === 0) {
      throw new Error("No current rebase conflicts found");
    }

    return buildRebaseConflictBundleMarkdown({
      repositoryFullName: args.repositoryFullName,
      branch,
      conflicts: inspection.conflicts,
    });
  },
});

// MARK: Internal

// Helper function to create a commit with multiple files
export async function createCommitWithMultipleFiles({
  octokit,
  owner,
  repo,
  stagedFiles,
  branch,
  loadStorageBlob,
  skipRebase = false,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  stagedFiles: StagedFileForCommit[];
  branch: string;
  loadStorageBlob?: (storageId: Id<"_storage">) => Promise<Blob | null>;
  skipRebase?: boolean;
}) {
  // Helper to compute modified (added) line ranges in the new content
  const computeModifiedLineRanges = (
    oldContent: string,
    newContent: string,
  ): Array<{ from: number; to: number }> => {
    const parts = diffLines(oldContent, newContent);
    const ranges: Array<{ from: number; to: number }> = [];
    let newLine = 1;
    for (const part of parts) {
      const value = part.value;
      const lineCount =
        typeof part.count === "number" ? part.count : value === "" ? 0 : value.split("\n").length; // count lines even without trailing newline
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

  const normalizedStagedFiles: StagedFileForCommit[] = stagedFiles.map((file) => ({
    ...file,
    initialContent: file.initialContent,
    branch,
  }));

  const resolvedStagedFiles = skipRebase
    ? normalizedStagedFiles
    : await rebaseStagedFilesOnLatestHead({
        octokit,
        owner,
        repo,
        branch,
        stagedFiles: normalizedStagedFiles,
      });
  const changedResolvedStagedFiles = resolvedStagedFiles.filter(hasStagedFileChanges);

  // Summarize all changes to craft a commit message
  const changesInfo: Array<{
    deleted: boolean;
    isBinary: boolean;
    modifiedLines: Array<{ from: number; to: number }>;
    filePath: string;
    initialFilePath: string;
    wasModified: boolean;
  }> = changedResolvedStagedFiles.map((file) => ({
    deleted: file.fileDeleted,
    isBinary: isBinaryStagedFile(file),
    filePath: file.filePath,
    initialFilePath: file.initialFilePath,
    modifiedLines:
      file.fileDeleted || isBinaryStagedFile(file)
        ? []
        : computeModifiedLineRanges(file.initialContent, file.content),
    wasModified: !file.fileDeleted && hasStagedFileContentChange(file),
  }));

  // 1. Prepare file lists
  const pathsToDelete = new Set<string>();
  const filesToAdd: Array<
    | {
        kind: "text";
        filePath: string;
        content: string;
      }
    | {
        kind: "binary";
        filePath: string;
        parentCommitSha: string | null;
        storageId?: Id<"_storage">;
        stagedBlobSha?: string;
      }
  > = [];

  for (const file of changedResolvedStagedFiles) {
    if (file.fileDeleted) {
      // Only delete paths that actually exist in the repo
      if (file.parentCommitSha !== null) {
        pathsToDelete.add(file.filePath);
      }
    } else {
      const isRenamed = file.filePath !== file.initialFilePath;
      if (isRenamed && file.parentCommitSha !== null) {
        pathsToDelete.add(file.initialFilePath);
      }
      if (isBinaryStagedFile(file)) {
        filesToAdd.push({
          kind: "binary",
          filePath: file.filePath,
          parentCommitSha: file.parentCommitSha,
          storageId: file.storageId,
          stagedBlobSha: file.stagedBlobSha,
        });
      } else {
        filesToAdd.push({
          kind: "text",
          filePath: file.filePath,
          content: file.content,
        });
      }
    }
  }

  // 2. Prepare tree deletions up front. File additions are rebuilt per retry so
  //    binary blob creation can stay deterministic across attempts.
  const baseTreeEntries: CreateTreeEntry[] = [];

  for (const path of pathsToDelete) {
    baseTreeEntries.push({
      path,
      mode: "100644",
      type: "blob",
      sha: null,
    });
  }

  // 3. Build commit message
  const basename = (p: string) => {
    const parts = p.split("/");
    return parts[parts.length - 1] || p;
  };
  const shortRanges = (ranges: Array<{ from: number; to: number }>, max = 2) => {
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
    } else if (info.isBinary && renamed) {
      subjectTokens.push(`${basename(info.initialFilePath)}->${basename(info.filePath)}`);
    } else if (info.isBinary) {
      subjectTokens.push(`${basename(info.filePath)}`);
    } else if (renamed && info.modifiedLines.length > 0) {
      subjectTokens.push(
        `${basename(info.initialFilePath)}->${basename(info.filePath)}[${shortRanges(info.modifiedLines)}]`,
      );
    } else if (renamed) {
      subjectTokens.push(`${basename(info.initialFilePath)}->${basename(info.filePath)}`);
    } else if (info.modifiedLines.length > 0) {
      subjectTokens.push(`${basename(info.filePath)}[${shortRanges(info.modifiedLines)}]`);
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

  // 4. Retry loop for ref-dependent operations (getRef → getCommit → createTree → createCommit → updateRef)
  //    Retries handle transient GitHub 422 (GitRPC::BadObjectState) and 409 (conflict) errors.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      const currentCommitSha = refData.object.sha;

      const { data: currentCommit } = await octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: currentCommitSha,
      });

      if (baseTreeEntries.length === 0 && filesToAdd.length === 0) {
        return {
          sha: currentCommitSha,
          url: currentCommit.html_url,
        };
      }

      const currentTreeSha = currentCommit.tree.sha;
      const createdBlobShaBySourceSha = new Map<string, string>();
      const treeEntries: CreateTreeEntry[] = [...baseTreeEntries];

      for (const file of filesToAdd) {
        if (file.kind === "text") {
          treeEntries.push({
            path: file.filePath,
            mode: "100644",
            type: "blob",
            content: file.content,
          });
          continue;
        }

        const existingBlobSha =
          file.parentCommitSha !== null && file.stagedBlobSha === file.parentCommitSha
            ? file.parentCommitSha
            : null;
        if (existingBlobSha) {
          treeEntries.push({
            path: file.filePath,
            mode: "100644",
            type: "blob",
            sha: existingBlobSha,
          });
          continue;
        }

        if (!file.storageId) {
          throw new Error(`Binary file ${file.filePath} is missing staged storage data.`);
        }

        const cacheKey = file.stagedBlobSha ?? file.storageId;
        const cachedCreatedSha = createdBlobShaBySourceSha.get(cacheKey);
        if (cachedCreatedSha) {
          treeEntries.push({
            path: file.filePath,
            mode: "100644",
            type: "blob",
            sha: cachedCreatedSha,
          });
          continue;
        }

        if (!loadStorageBlob) {
          throw new Error("Binary commit loading is not configured.");
        }

        const storedBlob = await loadStorageBlob(file.storageId);
        if (!storedBlob) {
          throw new Error(`Binary file ${file.filePath} is no longer available in staged storage.`);
        }

        const storedBuffer = Buffer.from(await storedBlob.arrayBuffer());
        const { data: createdBlob } = await octokit.rest.git.createBlob({
          owner,
          repo,
          content: storedBuffer.toString("base64"),
          encoding: "base64",
        });
        const expectedSha = file.stagedBlobSha ?? computeGitBlobShaFromBuffer(storedBuffer);
        if (createdBlob.sha !== expectedSha) {
          throw new Error(`Binary file ${file.filePath} blob SHA mismatch during commit.`);
        }

        createdBlobShaBySourceSha.set(cacheKey, createdBlob.sha);
        treeEntries.push({
          path: file.filePath,
          mode: "100644",
          type: "blob",
          sha: createdBlob.sha,
        });
      }

      const { data: newTree } = await octokit.rest.git.createTree({
        owner,
        repo,
        base_tree: currentTreeSha,
        tree: treeEntries,
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

      return {
        sha: newCommit.sha,
        url: newCommit.html_url,
      };
    } catch (error) {
      const status = getErrorStatus(error);
      const isRetryable = status === 422 || status === 409;
      if (!isRetryable || attempt === MAX_ATTEMPTS - 1) {
        console.error("Failed to create commit:", error);
        throw error;
      }
      console.warn(`Commit attempt ${attempt + 1} failed (status ${status}), retrying...`);
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  // Unreachable: the loop always returns or throws, but satisfies TypeScript.
  throw new Error("Exhausted commit retry attempts");
}

// Internal action to commit all staged files to GitHub
export const commitAllStaged = internalAction({
  args: {
    userId: v.id("users"),
    vaultId: v.id("vaults"),
    branch: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const vault = await ctx.runQuery(internal.vault.records.getByIdForUser, {
      vaultId: args.vaultId,
      userId: args.userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }
    const connectedVault = assertConnectedVault(vault);
    const githubAccess = await resolveGitHubAppAccess(ctx, {
      userId: args.userId,
      target: { kind: "vault", vaultId: args.vaultId },
    });
    const repoOwner = githubAccess.githubOwnerLogin;
    const repoName = connectedVault.name;
    const fullRepo = `${repoOwner}/${repoName}`;

    // Get the staging record
    const changedFiles: StagedFileForCommit[] = await ctx.runQuery(
      internal.fileStaging.listAllStagedFiles,
      {
        vaultId: args.vaultId,
        branch: args.branch,
      },
    );

    if (!changedFiles.length) {
      return null;
    }

    const stagedBranches: string[] = Array.from(
      new Set(changedFiles.map((file: StagedFileForCommit) => file.branch).filter(notEmpty)),
    );
    if (stagedBranches.length > 1) {
      throw new Error(
        `Cannot commit staged files across multiple branches: ${stagedBranches.join(", ")}`,
      );
    }

    const octokit = githubAccess.octokit;
    const commitBranch: string =
      args.branch ??
      stagedBranches.at(0) ??
      (await getRepositoryDefaultBranch({
        octokit,
        owner: repoOwner,
        repo: repoName,
      }));
    const resolvedChangedFiles = await rebaseStagedFilesOnLatestHead({
      octokit,
      owner: repoOwner,
      repo: repoName,
      branch: commitBranch,
      stagedFiles: changedFiles,
    });

    // Create a commit with all staged files
    await createCommitWithMultipleFiles({
      octokit,
      owner: repoOwner,
      repo: repoName,
      stagedFiles: resolvedChangedFiles,
      branch: commitBranch,
      loadStorageBlob: async (storageId) => await ctx.storage.get(storageId),
      skipRebase: true,
    });

    // 1. Refresh branch/default tree caches and re-read the updated vault.
    //    This is best-effort: upstream commit already succeeded.
    const updatedVault = await runPostCommitTreeRefresh({
      refreshBranchTree: async () => {
        await ctx.runAction(internal.github.updateRepositoryTree, {
          userId: args.userId,
          vaultId: args.vaultId,
          branch: commitBranch,
        });
      },
      loadUpdatedVault: async () =>
        await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
          repositoryFullName: fullRepo,
          userId: args.userId,
          branch: commitBranch,
        }),
      onWarning: (error) => {
        console.error("Post-commit tree refresh failed; continuing with cleanup:", error);
      },
    });

    // 3. Save committed file contents into the blob cache under their new SHAs
    //    so that when the client re-fetches after staging is cleared, it gets
    //    the correct content immediately without hitting GitHub API
    if (updatedVault) {
      try {
        for (const file of resolvedChangedFiles.filter(hasStagedFileChanges)) {
          if (file.fileDeleted) continue;

          const newSha = updatedVault.treeData?.tree.find(
            (t: { path?: string }) => t.path === file.filePath,
          )?.sha;

          if (!newSha) {
            continue;
          }

          if (isBinaryStagedFile(file)) {
            if (!file.storageId) {
              continue;
            }

            await ctx.runMutation(internal.gitOperations.saveFileBlob, {
              vaultId: args.vaultId,
              sha: newSha,
              size: file.size ?? 0,
              text: undefined,
              storageId: file.storageId,
              ext: file.filePath.split(".").pop()?.toLowerCase() ?? "",
              mime: file.mime ?? guessMime(file.filePath),
              debugFilePath: file.filePath,
            });
            continue;
          }

          if (typeof file.content === "string") {
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
      } catch (error) {
        console.error("Failed to warm blob cache after commit; continuing cleanup:", error);
      }
    }

    // 4. NOW clear staging. Client will refetch with correct tree + blobs.
    await ctx.runMutation(api.fileStaging.clearAllStaging, {
      vaultId: args.vaultId,
      branch: commitBranch,
      skipTreeUpdate: true,
    });

    return null;
  },
});
