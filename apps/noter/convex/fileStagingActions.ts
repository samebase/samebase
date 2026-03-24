"use node";

import { createHash } from "node:crypto";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { v, type Infer } from "convex/values";
import { api, internal } from "./_generated/api";
import { Octokit, type RestEndpointMethodTypes } from "@octokit/rest";
import { createTwoFilesPatch, diffLines } from "diff";
import { getUserId } from "./common";
import type { Id } from "./_generated/dataModel";
import type { GithubTreeType } from "./schema";
import {
  guessMime,
  INLINE_TEXT_MAX,
  isTextBuffer,
  withRetry,
} from "./gitOperationsActions";
import { isObjectRecord as isRecord } from "./jsonUtils";
import { rebaseStagedContent } from "./stagingRebase";
import { selectRepositoryTreeForBranch } from "./fileStaging";
import { sanitizeSlug } from "./slugUtils";
import { isStaleBaseVersionError } from "../shared/stagingErrors";

const { boolean, number, object, optional, string } = v;

type HeaderValue = string | number | readonly string[] | undefined;
type HeaderMap = Record<string, HeaderValue>;
type CreateTreeEntry = NonNullable<
  RestEndpointMethodTypes["git"]["createTree"]["parameters"]["tree"]
>[number];

const githubRateLimitResetByUser = new Map<string, number>();
const RATE_LIMIT_COOLDOWN_FALLBACK_MS = 60_000;
const STORAGE_BACKED_FILE_ERROR_MESSAGE =
  "File is in storage, not implemented yet";

export function selectBatchReadRepositoryTree(args: {
  requestedBranch?: string;
  defaultBranch?: string;
  branchTree: GithubTreeType[] | null;
  legacyTree: GithubTreeType[];
}): GithubTreeType[] {
  if (!args.requestedBranch) {
    return args.legacyTree;
  }
  return selectRepositoryTreeForBranch({
    requestedBranch: args.requestedBranch,
    defaultBranch: args.defaultBranch,
    branchTree: args.branchTree,
    legacyTree: args.legacyTree,
  });
}

export function listTouchedBranchesForRefresh(branches: string[]): string[] {
  return Array.from(new Set(branches));
}

export async function runPostCommitTreeRefresh<T>(args: {
  refreshBranchTree: () => Promise<void>;
  refreshLegacyTree: () => Promise<void>;
  loadUpdatedVault: () => Promise<T | null>;
  onWarning: (error: unknown) => void;
}): Promise<T | null> {
  try {
    await args.refreshBranchTree();
    await args.refreshLegacyTree();
    return await args.loadUpdatedVault();
  } catch (error) {
    args.onWarning(error);
    return null;
  }
}

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

function readPullRequestActivityAt(
  pullRequest: OpenPullRequestCandidate,
): number {
  const updatedAt = Date.parse(pullRequest.updated_at ?? "");
  if (!Number.isNaN(updatedAt)) {
    return updatedAt;
  }

  const createdAt = Date.parse(pullRequest.created_at ?? "");
  return Number.isNaN(createdAt) ? 0 : createdAt;
}

export function readOpenPullRequestForBranch(args: {
  branch: string;
  baseBranch: string;
  repositoryFullName: string;
  pullRequests: OpenPullRequestCandidate[];
}): { url: string; number: number } | null {
  const normalizedRepositoryFullName = args.repositoryFullName.toLowerCase();
  let latestMatch: {
    url: string;
    number: number;
    activityAt: number;
  } | null = null;

  for (const pullRequest of args.pullRequests) {
    const pullRequestRepositoryFullName = pullRequest.head.repo?.full_name;
    if (
      pullRequest.head.ref !== args.branch ||
      pullRequest.base.ref !== args.baseBranch ||
      typeof pullRequestRepositoryFullName !== "string" ||
      pullRequestRepositoryFullName.toLowerCase() !==
        normalizedRepositoryFullName ||
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
        activityAt,
      };
    }
  }

  return latestMatch
    ? {
        url: latestMatch.url,
        number: latestMatch.number,
      }
    : null;
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
    console.warn(
      "Failed to remove temporary draft branch after draft PR error:",
      cleanupError,
    );
  }
}

export function getDraftPullRequestCreateErrorMessage(
  error: unknown,
): string | null {
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
  if (branch.startsWith("refs/heads/")) {
    return branch.slice("refs/".length);
  }

  if (branch.startsWith("heads/")) {
    return branch;
  }

  return `heads/${branch}`;
}

async function getBranchTreeMap(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
}): Promise<Map<string, string>> {
  const treeResponse = await args.octokit.rest.git.getTree({
    owner: args.owner,
    repo: args.repo,
    tree_sha: toGitTreeRef(args.branch),
    recursive: "1",
  });

  if (treeResponse.data.truncated) {
    throw new Error(
      "Upstream tree is too large to validate staged changes safely.",
    );
  }

  const shaByPath = new Map<string, string>();
  for (const item of treeResponse.data.tree) {
    if (
      item.type === "blob" &&
      typeof item.path === "string" &&
      typeof item.sha === "string"
    ) {
      shaByPath.set(item.path, item.sha);
    }
  }

  return shaByPath;
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

const draftPullRequestResult = object({
  url: string(),
  number: number(),
  existing: boolean(),
});
const defaultBranchDraftPullRequestResult = object({
  branch: string(),
  url: string(),
  number: number(),
});

const rebaseConflictPreviewFile = v.object({
  path: v.string(),
  previousPath: v.optional(v.string()),
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
type CommitPreviewResult = Infer<typeof commitPreviewResult>;
type DraftPullRequestResult = Infer<typeof draftPullRequestResult>;
type DefaultBranchDraftPullRequestResult = Infer<
  typeof defaultBranchDraftPullRequestResult
>;
type RebaseConflictPreviewFile = Infer<typeof rebaseConflictPreviewFile>;
type RebaseConflictPreviewResult = Infer<typeof rebaseConflictPreviewResult>;

type StagedFileForCommit = {
  filePath: string;
  initialFilePath: string;
  content: string;
  initialContent: string;
  fileDeleted: boolean;
  parentCommitSha: string | null;
  branch: string;
};
type DraftSourceStagingSnapshot = StagedFileForCommit & {
  _id: Id<"fileStaging">;
  ownerId: Id<"users">;
  vaultId: Id<"vaults">;
  lastEditTime: number;
  lastEditUserId: Id<"users">;
  version: number;
};
type DraftSourceStagingRecord = DraftSourceStagingSnapshot & {
  _creationTime: number;
};

type StagedFileRebaseConflict = StagedFileForCommit & {
  upstreamContent: string;
  upstreamSha: string;
};

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

  const contentMatchesSha = (content: string, sha: string): boolean => {
    const contentBuffer = Buffer.from(content, "utf-8");
    const headerBuffer = Buffer.from(`blob ${contentBuffer.length}\0`, "utf-8");
    const computedSha = createHash("sha1")
      .update(headerBuffer)
      .update(contentBuffer)
      .digest("hex");
    return computedSha === sha;
  };
  const initialContentMatchesUpstreamCache = new Map<
    StagedFileForCommit,
    { upstreamSha: string; matches: boolean }
  >();
  const initialContentMatchesUpstream = (
    file: StagedFileForCommit,
    upstreamSha: string,
  ): boolean => {
    const cached = initialContentMatchesUpstreamCache.get(file);
    if (cached && cached.upstreamSha === upstreamSha) {
      return cached.matches;
    }
    const matches = contentMatchesSha(file.initialContent, upstreamSha);
    initialContentMatchesUpstreamCache.set(file, {
      upstreamSha,
      matches,
    });
    return matches;
  };
  const shouldSkipFastPathRebase = (
    file: StagedFileForCommit,
    upstreamSha: string,
  ): boolean =>
    upstreamSha === file.parentCommitSha &&
    initialContentMatchesUpstream(file, upstreamSha);

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

  const resolveUpstreamShaForFile = (
    file: StagedFileForCommit,
  ): string | null => {
    const preferredUpstreamPath =
      file.filePath === file.initialFilePath
        ? file.filePath
        : file.initialFilePath;
    const fallbackUpstreamPath = file.filePath;
    const upstreamPath = shaByPath.has(preferredUpstreamPath)
      ? preferredUpstreamPath
      : shaByPath.has(fallbackUpstreamPath)
        ? fallbackUpstreamPath
        : null;
    if (!upstreamPath) {
      return null;
    }
    return shaByPath.get(upstreamPath) ?? null;
  };

  const upstreamShasToPrefetch = new Set<string>();
  for (const file of args.stagedFiles) {
    const upstreamSha = resolveUpstreamShaForFile(file);
    if (!upstreamSha) {
      continue;
    }
    if (file.fileDeleted) {
      if (
        file.parentCommitSha !== null &&
        !shouldSkipFastPathRebase(file, upstreamSha)
      ) {
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

  await Promise.all(
    Array.from(upstreamShasToPrefetch).map((sha) => getBlobText(sha)),
  );

  const conflicts: StagedFileRebaseConflict[] = [];
  const rebasedFiles: StagedFileForCommit[] = [];

  for (const file of args.stagedFiles) {
    const upstreamSha = resolveUpstreamShaForFile(file);
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
    throw new Error(
      formatUpstreamConflictError(
        inspection.conflicts.map((file) => file.filePath),
      ),
    );
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
      newPath: file.initialFilePath,
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
    const { baseToStagedPatch, baseToUpstreamPatch } =
      buildConflictPatchPair(file);
    const renamed = file.filePath !== file.initialFilePath;

    return {
      path: file.filePath,
      previousPath: renamed ? file.initialFilePath : undefined,
      isMarkdown: isMarkdownPath(file.filePath),
      baseBlobSha: file.parentCommitSha ?? undefined,
      upstreamBlobSha: file.upstreamSha,
      baseToStagedPatchTruncated: baseToStagedPatch.truncated,
      baseToStagedPatch: baseToStagedPatch.patch,
      baseToUpstreamPatchTruncated: baseToUpstreamPatch.truncated,
      baseToUpstreamPatch: baseToUpstreamPatch.patch,
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
    const { baseToStagedPatch, baseToUpstreamPatch } =
      buildConflictPatchPair(file);
    const fileLines = [
      `## ${file.filePath}`,
      ...(file.filePath !== file.initialFilePath
        ? [`- Previous path: ${file.initialFilePath}`]
        : []),
      ...(file.parentCommitSha
        ? [`- Base blob SHA: ${file.parentCommitSha}`]
        : []),
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
    "# Noter rebase conflict bundle",
    `- Repository: ${args.repositoryFullName}`,
    `- Branch: ${args.branch}`,
    "",
    ...sections,
  ].join("\n");
}

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
    const oldContent = file.initialContent;
    const newContent = file.fileDeleted ? "" : file.content;
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
    const branch =
      args.branch ??
      (() => {
        throw new Error("Branch is required to rename a staged file");
      })();

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
      branch,
    });

    // Update existing staging record with new path
    const updatedFile = await ctx.runMutation(internal.fileStaging.rename, {
      vaultId: args.vaultId,
      initialFilePath: args.originalPath,
      branch,
      newPath: args.newPath,
    });

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
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
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

      const cachedBlob = await ctx.runQuery(
        internal.gitOperations.getBlobBySha,
        {
          sha: fileSha,
        },
      );

      if (cachedBlob) {
        if (typeof cachedBlob.text !== "string") {
          throw new Error(STORAGE_BACKED_FILE_ERROR_MESSAGE);
        }

        const stagedFile = await ctx.runMutation(
          internal.fileStaging.saveToStaging,
          {
            branch: targetBranch,
            vaultId: vault._id,
            initialFilePath: args.originalFilePath,
            content: cachedBlob.text,
            initialContent: cachedBlob.text,
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

      const blobResponse = await octokit.rest.git.getBlob({
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
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
        const storageId = await withRetry(() =>
          ctx.storage.store(new Blob([buffer], { type: mime })),
        );

        await ctx.runMutation(internal.gitOperations.saveFileBlob, {
          vaultId: vault._id,
          sha: fileSha,
          size: file.data.size,
          mime,
          text: undefined,
          storageId,
          ext,
          debugFilePath: filePath,
        });
      }

      const savedBlob = await ctx.runQuery(
        internal.gitOperations.getBlobBySha,
        {
          sha: fileSha,
        },
      );

      if (!savedBlob) {
        throw new Error(
          "File not found in blobs table after literally saving it there?!?",
        );
      }

      if (typeof savedBlob.text !== "string") {
        throw new Error(STORAGE_BACKED_FILE_ERROR_MESSAGE);
      }

      const stagedFile = await ctx.runMutation(
        internal.fileStaging.saveToStaging,
        {
          branch: targetBranch,
          vaultId: vault._id,
          initialFilePath: args.originalFilePath,
          content: savedBlob.text,
          initialContent: savedBlob.text,
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
  },
});

// Commit staged file to GitHub
export const commitStaging = action({
  args: {
    repositoryFullName: v.string(),
    branch: v.optional(v.string()),
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
      branch: args.branch,
    });

    return null;
  },
});

export const createDraftPullRequest = action({
  args: {
    repositoryFullName: string(),
    branch: optional(string()),
  },
  returns: draftPullRequestResult,
  handler: async (ctx, args): Promise<DraftPullRequestResult> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    const githubAccessToken = await getGithubAccessToken(ctx, userId);
    const octokit: Octokit = new Octokit({
      auth: githubAccessToken,
    });
    const defaultBranch = await getRepositoryDefaultBranch({
      octokit,
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
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
        repoOwner: vault.ghRepoOwner,
        repoName: vault.ghRepoName,
        branch,
      });
    }

    const existingPullRequest = await getOpenPullRequestForBranch({
      octokit,
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
      branch,
      baseBranch: defaultBranch,
    });
    if (existingPullRequest) {
      try {
        await ctx.runAction(internal.github.updateRepositoryTree, {
          userId,
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          includeAheadBehind: true,
          includePullRequestLinks: true,
        });
      } catch (error) {
        console.warn(
          "Failed to refresh remote branch metadata after opening existing PR:",
          error,
        );
      }

      return {
        ...existingPullRequest,
        existing: true,
      };
    }

    const comparison = await octokit.rest.repos.compareCommitsWithBasehead({
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
      basehead: `${defaultBranch}...${branch}`,
    });
    if (comparison.data.ahead_by === 0) {
      throw new Error("This branch has no changes to open as a pull request.");
    }

    try {
      const response = await octokit.rest.pulls.create({
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        title: buildDraftPullRequestTitle({
          branch,
          commitMessage: await getBranchHeadCommitMessage({
            octokit,
            owner: vault.ghRepoOwner,
            repo: vault.ghRepoName,
            branch,
          }),
        }),
        head: branch,
        base: defaultBranch,
        draft: true,
      });

      try {
        await ctx.runAction(internal.github.updateRepositoryTree, {
          userId,
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          includeAheadBehind: true,
          includePullRequestLinks: true,
        });
      } catch (error) {
        console.warn(
          "Failed to refresh remote branch metadata after creating draft PR:",
          error,
        );
      }

      return {
        url: response.data.html_url,
        number: response.data.number,
        existing: false,
      };
    } catch (error) {
      const currentPullRequest = await getOpenPullRequestForBranch({
        octokit,
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        branch,
        baseBranch: defaultBranch,
      });
      if (currentPullRequest) {
        try {
          await ctx.runAction(internal.github.updateRepositoryTree, {
            userId,
            owner: vault.ghRepoOwner,
            repo: vault.ghRepoName,
            includeAheadBehind: true,
            includePullRequestLinks: true,
          });
        } catch (refreshError) {
          console.warn(
            "Failed to refresh remote branch metadata after discovering existing PR:",
            refreshError,
          );
        }
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
});

export const createDraftPullRequestFromDefaultBranch = action({
  args: {
    repositoryFullName: string(),
    branch: optional(string()),
  },
  returns: defaultBranchDraftPullRequestResult,
  handler: async (ctx, args): Promise<DefaultBranchDraftPullRequestResult> => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    const githubAccessToken = await getGithubAccessToken(ctx, userId);
    const octokit: Octokit = new Octokit({
      auth: githubAccessToken,
    });
    const defaultBranch = await getRepositoryDefaultBranch({
      octokit,
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
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
    const stagedFiles = stagedFilesResult.map(
      (file): DraftSourceStagingSnapshot => ({
        _id: file._id,
        ownerId: file.ownerId,
        vaultId: file.vaultId,
        fileDeleted: file.fileDeleted,
        filePath: file.filePath,
        initialFilePath: file.initialFilePath,
        content: file.content,
        initialContent: file.initialContent,
        parentCommitSha: file.parentCommitSha,
        branch: file.branch,
        lastEditTime: file.lastEditTime,
        lastEditUserId: file.lastEditUserId,
        version: file.version,
      }),
    );
    if (stagedFiles.length === 0) {
      throw new Error("Stage changes on the default branch before drafting.");
    }

    const targetBranch = buildDraftBranchName({
      stagedFiles,
      now: Date.now(),
    });
    const defaultRef = await octokit.rest.git.getRef({
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
      ref: `heads/${defaultBranch}`,
    });

    await octokit.rest.git.createRef({
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
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
      });
    } catch (error) {
      await cleanupTemporaryDraftBranch({
        ctx,
        octokit,
        vaultId: vault._id,
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
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
        repoOwner: vault.ghRepoOwner,
        repoName: vault.ghRepoName,
        branch: targetBranch,
      });
    } catch (error) {
      // commitAllStaged can fail after GitHub advances the branch ref, so
      // re-check the head before rolling back the newly created branch.
      const currentTargetBranchSha = await getBranchHeadShaOrNull({
        octokit,
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        branch: targetBranch,
      });
      if (currentTargetBranchSha === initialTargetBranchSha) {
        await cleanupTemporaryDraftBranch({
          ctx,
          octokit,
          vaultId: vault._id,
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          branch: targetBranch,
        });
      }

      if (error instanceof Error && error.message.length > 0) {
        throw error;
      }
      throw new Error("Failed to create draft pull request");
    }

    try {
      // Committing the captured snapshot moves that unit of work onto the draft
      // branch. Clear only the unchanged source snapshot so newer default-branch
      // edits survive while retries do not re-draft the same work.
      await ctx.runMutation(internal.fileStaging.clearMatchingStagingSnapshot, {
        vaultId: vault._id,
        branch: defaultBranch,
        stagedFiles,
      });

      let url: string;
      let number: number;
      try {
        const response = await octokit.rest.pulls.create({
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          title: buildDraftPullRequestTitle({
            branch: targetBranch,
            commitMessage: await getBranchHeadCommitMessage({
              octokit,
              owner: vault.ghRepoOwner,
              repo: vault.ghRepoName,
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
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          branch: targetBranch,
          baseBranch: defaultBranch,
        });
        if (!currentPullRequest) {
          throw new Error(
            `Draft branch ${targetBranch} was created, but the pull request could not be opened.`,
          );
        }
        url = currentPullRequest.url;
        number = currentPullRequest.number;
      }

      try {
        await ctx.runAction(internal.github.updateRepositoryTree, {
          userId,
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          includeAheadBehind: true,
          includePullRequestLinks: true,
        });
      } catch (error) {
        console.warn(
          "Failed to refresh remote branch metadata after creating default-branch draft PR:",
          error,
        );
      }

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

    // 1. Read all staging records for this vault (including unchanged)
    const allStaged = await ctx.runQuery(
      internal.fileStaging.listAllStagedFiles,
      {
        vaultId: args.vaultId,
        includeUnchanged: true,
      },
    );

    const treeMapByBranch = new Map<string, Promise<Map<string, string>>>();
    const getTreeMapForBranch = (
      branch: string,
    ): Promise<Map<string, string>> => {
      const existing = treeMapByBranch.get(branch);
      if (existing) {
        return existing;
      }

      const loaded = getBranchTreeMap({
        octokit,
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
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
      const isEdited =
        staged.content !== staged.initialContent ||
        staged.fileDeleted ||
        staged.filePath !== staged.initialFilePath;
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
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
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

              const latestStaging = await ctx.runQuery(
                internal.fileStaging.getByOriginalPath,
                {
                  vaultId: args.vaultId,
                  originalFilePath: item.initialFilePath,
                  branch: item.branch,
                },
              );

              if (!latestStaging) {
                shouldAdvanceParentCommit = false;
              } else if (!latestStaging.fileDeleted) {
                const retriedRebase = rebaseStagedContent({
                  baseContent: latestStaging.initialContent,
                  stagedContent: latestStaging.content,
                  upstreamContent: newContent,
                });

                if (retriedRebase.content !== latestStaging.content) {
                  await ctx.runMutation(
                    internal.collaborative.pushContentUpdate,
                    {
                      vaultId: args.vaultId,
                      filePath: latestStaging.filePath,
                      branch: item.branch,
                      expectedVersion: latestStaging.version,
                      newContent: retriedRebase.content,
                      userId: args.userId,
                    },
                  );
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
          console.warn(
            `Skipping stale staging rebase for ${item.branch}:${item.filePath}`,
          );
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
      });
    }

    // 5. Refresh touched branch caches after reconciliation
    const touchedBranches = listTouchedBranchesForRefresh(
      allStaged.map((item) => item.branch),
    );
    for (const branch of touchedBranches) {
      await ctx.runAction(internal.github.updateRepositoryTree, {
        userId: args.userId,
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        branch,
      });
    }

    // Keep legacy default-branch cache current as well.
    await ctx.runAction(internal.github.updateRepositoryTree, {
      userId: args.userId,
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
    });

    return null;
  },
});

// Batch-fetch file contents (read-only, no staging records).
// Used by the Monaco editor to load project files for TypeScript import resolution.
export const batchReadFiles = action({
  args: {
    vaultId: v.id("vaults"),
    branch: v.optional(v.string()),
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

    const requestedBranch =
      typeof args.branch === "string" && args.branch.trim().length > 0
        ? args.branch.trim()
        : undefined;
    let branchTreeData: GithubTreeType[] | null = null;
    let defaultBranch: string | undefined;
    if (requestedBranch) {
      let branchTree = await ctx.runQuery(internal.vault.getVaultBranchTree, {
        vaultId: args.vaultId,
        branch: requestedBranch,
      });

      if (!branchTree) {
        await ctx.runAction(internal.github.updateRepositoryTree, {
          userId,
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          branch: requestedBranch,
        });
        branchTree = await ctx.runQuery(internal.vault.getVaultBranchTree, {
          vaultId: args.vaultId,
          branch: requestedBranch,
        });
      }

      if (branchTree) {
        branchTreeData = branchTree.treeData.tree;
      } else {
        const repositoryFullName = `${vault.ghRepoOwner}/${vault.ghRepoName}`;
        const resolvedVault = await ctx.runQuery(
          internal.vault.getByRepositoryFullName,
          {
            userId,
            repositoryFullName,
          },
        );
        defaultBranch = resolvedVault?.defaultBranch;
      }
    }
    const repositoryTree = selectBatchReadRepositoryTree({
      requestedBranch,
      defaultBranch,
      branchTree: branchTreeData,
      legacyTree: vault.treeData.tree,
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
    branch: v.optional(v.string()),
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
      internal.fileStaging.listAllStagedFiles,
      {
        vaultId: vault._id,
        branch: args.branch,
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
      args.branch ??
      stagedBranches.at(0) ??
      (await getVaultDefaultBranch(
        ctx,
        userId,
        vault.ghRepoOwner,
        vault.ghRepoName,
      ));

    const githubAccessToken = await getGithubAccessToken(ctx, userId);
    const octokit: Octokit = new Octokit({
      auth: githubAccessToken,
    });
    const rebasedStagedFiles = await rebaseStagedFilesOnLatestHead({
      octokit,
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
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

export const getRebaseConflictPreview = action({
  args: {
    repositoryFullName: v.string(),
    branch: v.optional(v.string()),
  },
  returns: rebaseConflictPreviewResult,
  handler: async (ctx, args): Promise<RebaseConflictPreviewResult> => {
    const userId = await getUserId(ctx);

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
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
      new Set(
        stagedFiles
          .map((file: StagedFileForCommit) => file.branch)
          .filter((branch): branch is string => typeof branch === "string"),
      ),
    );
    if (stagedBranches.length > 1) {
      throw new Error(
        `Cannot inspect staged conflicts across multiple branches: ${stagedBranches.join(", ")}`,
      );
    }

    const branch =
      args.branch ??
      stagedBranches.at(0) ??
      (await getVaultDefaultBranch(
        ctx,
        userId,
        vault.ghRepoOwner,
        vault.ghRepoName,
      ));

    const githubAccessToken = await getGithubAccessToken(ctx, userId);
    const octokit: Octokit = new Octokit({
      auth: githubAccessToken,
    });
    const inspection = await inspectStagedFilesAgainstLatestHead({
      octokit,
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
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
  args: {
    repositoryFullName: v.string(),
    branch: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const userId = await getUserId(ctx);

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
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
      new Set(
        stagedFiles
          .map((file: StagedFileForCommit) => file.branch)
          .filter((branch): branch is string => typeof branch === "string"),
      ),
    );
    if (stagedBranches.length > 1) {
      throw new Error(
        `Cannot inspect staged conflicts across multiple branches: ${stagedBranches.join(", ")}`,
      );
    }

    const branch =
      args.branch ??
      stagedBranches.at(0) ??
      (await getVaultDefaultBranch(
        ctx,
        userId,
        vault.ghRepoOwner,
        vault.ghRepoName,
      ));

    const githubAccessToken = await getGithubAccessToken(ctx, userId);
    const octokit: Octokit = new Octokit({
      auth: githubAccessToken,
    });
    const inspection = await inspectStagedFilesAgainstLatestHead({
      octokit,
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
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
  skipRebase = false,
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

  const normalizedStagedFiles: StagedFileForCommit[] = stagedFiles.map(
    (file) => ({
      filePath: file.filePath,
      initialFilePath: file.initialFilePath,
      content: file.content,
      initialContent: file.initialContent ?? "",
      fileDeleted: file.fileDeleted,
      parentCommitSha: file.parentCommitSha,
      branch,
    }),
  );

  const resolvedStagedFiles = skipRebase
    ? normalizedStagedFiles
    : await rebaseStagedFilesOnLatestHead({
        octokit,
        owner,
        repo,
        branch,
        stagedFiles: normalizedStagedFiles,
      });

  // Summarize all changes to craft a commit message
  const changesInfo: Array<{
    deleted: boolean;
    modifiedLines: Array<{ from: number; to: number }>;
    filePath: string;
    initialFilePath: string;
    wasModified: boolean;
  }> = resolvedStagedFiles.map((file) => ({
    deleted: file.fileDeleted,
    filePath: file.filePath,
    initialFilePath: file.initialFilePath,
    modifiedLines: file.fileDeleted
      ? []
      : computeModifiedLineRanges(file.initialContent, file.content),
    wasModified: !file.fileDeleted && file.initialContent !== file.content,
  }));

  // 1. Prepare file lists
  const pathsToDelete = new Set<string>();
  const filesToAdd: Array<{
    filePath: string;
    content: string;
  }> = [];

  for (const file of resolvedStagedFiles) {
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
      filesToAdd.push({
        filePath: file.filePath,
        content: file.content,
      });
    }
  }

  // 2. Build tree entries with inline content (no separate createBlob needed)
  //    GitHub creates blobs atomically as part of createTree, avoiding propagation races.
  const newTreeEntries: CreateTreeEntry[] = [];

  for (const path of pathsToDelete) {
    newTreeEntries.push({
      path,
      mode: "100644",
      type: "blob",
      sha: null,
    });
  }

  for (const file of filesToAdd) {
    newTreeEntries.push({
      path: file.filePath,
      mode: "100644",
      type: "blob",
      content: file.content,
    });
  }

  // 3. Build commit message
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

      if (newTreeEntries.length === 0) {
        return {
          sha: currentCommitSha,
          url: currentCommit.html_url,
        };
      }

      const currentTreeSha = currentCommit.tree.sha;

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
      console.warn(
        `Commit attempt ${attempt + 1} failed (status ${status}), retrying...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
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
    branch: v.optional(v.string()),
    commitProposalMessageId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fullRepo = `${args.repoOwner}/${args.repoName}`;

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
        },
      );
    };

    try {
      // Get the staging record
      const changedFiles: StagedFileForCommit[] = await ctx.runQuery(
        internal.fileStaging.listAllStagedFiles,
        {
          vaultId: args.vaultId,
          branch: args.branch,
        },
      );

      if (!changedFiles.length) {
        await updateCommitProposalStatus(true);
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
        args.branch ??
        stagedBranches.at(0) ??
        (await getRepositoryDefaultBranch({
          octokit,
          owner: args.repoOwner,
          repo: args.repoName,
        }));
      const resolvedChangedFiles = await rebaseStagedFilesOnLatestHead({
        octokit,
        owner: args.repoOwner,
        repo: args.repoName,
        branch: commitBranch,
        stagedFiles: changedFiles,
      });

      // Create a commit with all staged files
      await createCommitWithMultipleFiles({
        octokit,
        owner: args.repoOwner,
        repo: args.repoName,
        stagedFiles: resolvedChangedFiles,
        branch: commitBranch,
        skipRebase: true,
      });

      // 1. Refresh branch/default tree caches and re-read the updated vault.
      //    This is best-effort: upstream commit already succeeded.
      const updatedVault = await runPostCommitTreeRefresh({
        refreshBranchTree: async () => {
          await ctx.runAction(internal.github.updateRepositoryTree, {
            userId: args.userId,
            owner: args.repoOwner,
            repo: args.repoName,
            branch: commitBranch,
          });
        },
        refreshLegacyTree: async () => {
          await ctx.runAction(internal.github.updateRepositoryTree, {
            userId: args.userId,
            owner: args.repoOwner,
            repo: args.repoName,
          });
        },
        loadUpdatedVault: async () =>
          await ctx.runQuery(internal.vault.getByRepositoryFullName, {
            repositoryFullName: fullRepo,
            userId: args.userId,
            branch: commitBranch,
          }),
        onWarning: (error) => {
          console.error(
            "Post-commit tree refresh failed; continuing with cleanup:",
            error,
          );
        },
      });

      // 3. Save committed file contents into the blob cache under their new SHAs
      //    so that when the client re-fetches after staging is cleared, it gets
      //    the correct content immediately without hitting GitHub API
      if (updatedVault) {
        try {
          for (const file of resolvedChangedFiles) {
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
        } catch (error) {
          console.error(
            "Failed to warm blob cache after commit; continuing cleanup:",
            error,
          );
        }
      }

      // 4. NOW clear staging — client will refetch with correct tree + blobs
      await ctx.runMutation(api.fileStaging.clearAllStaging, {
        vaultId: args.vaultId,
        branch: commitBranch,
        skipTreeUpdate: true,
      });

      await updateCommitProposalStatus(true);
    } catch (error) {
      const commitError =
        error instanceof Error && error.message.length > 0
          ? error.message
          : "Commit failed";

      try {
        await updateCommitProposalStatus(false, commitError);
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
