"use node";

import { internalAction, type ActionCtx } from "./_generated/server";
import { Infer, v } from "convex/values";
import { guard } from "@samebase/dependent/main";
import { internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { action } from "./functions";
import { guessMime, withRetry } from "./gitOperationsActions";
import { isRecord, toErrorMessage } from "./jsonUtils";
import {
  parseCloudflarePreviewComment,
  type CloudflarePreviewCommentMetadata,
} from "./cloudflarePreviewComment";
import {
  getRepositoryMediaKind,
  type RepositoryMediaKind,
  isSvgRepositoryMediaPath,
} from "../shared/repositoryMedia";
import { isRepositoryMetadataStale, TREE_REFRESH_FAILURE_COOLDOWN_MS } from "../shared/treeRefresh";
import { readStagedFileKind } from "./stagingChanges";
import type { PullRequestLabel as StoredPullRequestLabel } from "./schema";

const {
  array,
  boolean,
  id,
  literal,
  null: nullValidator,
  number,
  object,
  optional,
  string,
  union,
} = v;

const githubRepositoryListItem = object({
  id: number(),
  name: string(),
  full_name: string(),
  html_url: string(),
  description: union(string(), nullValidator()),
  private: boolean(),
  fork: boolean(),
  created_at: string(),
  updated_at: string(),
  language: union(string(), nullValidator()),
  stargazers_count: number(),
  forks_count: number(),
});

type GitHubRepositoryListItem = Infer<typeof githubRepositoryListItem>;
type GitHubRepositoryList = GitHubRepositoryListItem[];
const githubRepositoryPreviewResult = object({
  repositories: array(githubRepositoryListItem),
  hasMore: boolean(),
});

type GitHubRepositoryPreviewResult = Infer<typeof githubRepositoryPreviewResult>;

type CachedRepositoryBlob = {
  size?: number | null;
  storageId?: string | null;
  text?: string | null;
  mime?: string | undefined;
};
type HeaderValue = string | number | readonly string[] | undefined;
type HeaderMap = Record<string, HeaderValue>;
type TreeRefreshFailureDescriptor = {
  kind: "failed" | "rate_limited";
  message: string;
  cooldownUntil: number;
};
const publicRefreshRepositoryIntent = union(literal("passive"), literal("manual"));
const refreshRepositoryIntent = union(publicRefreshRepositoryIntent, literal("source_setup"));
const refreshRepositoryTreeReason = union(
  literal("cooldown"),
  literal("recent_success"),
  literal("in_progress"),
  literal("branch_not_found"),
);
const refreshRepositoryTreeResult = object({
  refreshed: boolean(),
  reason: optional(refreshRepositoryTreeReason),
});
type RefreshRepositoryTreeResult = Infer<typeof refreshRepositoryTreeResult>;
type RefreshRepositoryIntent = Infer<typeof refreshRepositoryIntent>;
/**
 * Internal post-write refresh target.
 *
 * repository = refresh repository metadata, then refresh the vault's resolved
 * branch.
 *
 * branch = refresh one concrete branch. Empty branch strings fail instead of
 * becoming repository-scoped work.
 */
const updateRepositoryTreeTarget = union(
  object({
    scope: literal("repository"),
  }),
  object({
    scope: literal("branch"),
    branch: string(),
  }),
);

/**
 * Internal GitHub refresh input.
 *
 * repository = no branch was requested; the planner can reconcile repository
 * metadata and then refresh the default branch when policy wants it.
 *
 * branch = one route/operation requested one concrete branch. Empty branch
 * strings fail before the planner can silently fall back to default-branch work.
 *
 * The include* fields are internal execution policy knobs. They are required so
 * callers must state the cost they are asking for; they are not stored on
 * repositoryRefreshRequests.
 */
const refreshRepositoryTreeForUserInput = union(
  object({
    scope: literal("repository"),
    userId: id("users"),
    owner: string(),
    repo: string(),
    includeAheadBehind: boolean(),
    includePullRequestLinks: boolean(),
    includeCloudflarePreviewLinks: boolean(),
    cloudflarePreviewBranchNames: array(string()),
    intent: refreshRepositoryIntent,
  }),
  object({
    scope: literal("branch"),
    userId: id("users"),
    owner: string(),
    repo: string(),
    branch: string(),
    includeAheadBehind: boolean(),
    includePullRequestLinks: boolean(),
    includeCloudflarePreviewLinks: boolean(),
    cloudflarePreviewBranchNames: array(string()),
    intent: refreshRepositoryIntent,
  }),
);
type RefreshRepositoryTreeForUserArgs = Infer<typeof refreshRepositoryTreeForUserInput>;

const GITHUB_REPOSITORY_DISCOVERY_AFFILIATION = "owner,collaborator,organization_member";
const GITHUB_REPOSITORY_PREVIEW_PAGE_SIZE = 10;
const GITHUB_REPOSITORY_DISCOVERY_PAGE_SIZE = 100;
const MAX_GITHUB_REPOSITORY_PAGES = 100;
const GITHUB_RATE_LIMIT_FALLBACK_MS = 5 * 60 * 1000;
const MISSING_BRANCH_CONFIRMATION_DEBOUNCE_MS = 30 * 1000;
/**
 * Passive refreshes above this cached branch count keep PR lookup and branch
 * commit timestamps, but skip ahead/behind and preview-comment backfills.
 * Source setup is a one-time connect/create finish path, so it can hydrate
 * provider links without teaching React about branch batches.
 */
const MAX_AUTO_REFRESH_BRANCH_ENRICHMENT_BRANCHES = 40;

/**
 * Missing branch means "use the default branch"; an empty provided branch is a
 * caller bug and must not silently become default-branch work.
 */
function normalizeOptionalRepositoryBranch(branch: string | undefined): string | undefined {
  if (branch === undefined) {
    return undefined;
  }

  const trimmedBranch = branch.trim();
  if (trimmedBranch.length === 0) {
    throw new Error("Branch is required when provided.");
  }
  return trimmedBranch;
}

/**
 * Branch-scoped work already chose a branch before this point. Empty strings
 * fail here instead of falling back to another branch.
 */
function normalizeRequiredRepositoryBranch(branch: string): string {
  const trimmedBranch = branch.trim();
  if (trimmedBranch.length === 0) {
    throw new Error("Branch is required.");
  }
  return trimmedBranch;
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

function getErrorStatus(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }

  const status = error.status;
  return typeof status === "number" ? status : null;
}

function getErrorMessage(error: unknown): string | null {
  if (!isRecord(error)) {
    return null;
  }

  const message = error.message;
  return typeof message === "string" && message.length > 0 ? message : null;
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

function parsePositiveInteger(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isRateLimitError(
  status: number | null,
  headers: HeaderMap | null,
  message: string | null,
): boolean {
  if (status === 429) {
    return true;
  }
  if (status !== 403) {
    return false;
  }

  if (getHeaderValue(headers, "retry-after") !== null) {
    return true;
  }

  if (getHeaderValue(headers, "x-ratelimit-remaining") === "0") {
    return true;
  }

  return (message ?? "").toLowerCase().includes("rate limit");
}

export function describeRepositoryTreeRefreshFailure(
  error: unknown,
  now: number = Date.now(),
): TreeRefreshFailureDescriptor {
  const status = getErrorStatus(error);
  const headers = getErrorHeaders(error);
  const message = getErrorMessage(error);

  if (!isRateLimitError(status, headers, message)) {
    return {
      kind: "failed",
      message: "GitHub sync failed. Showing cached state.",
      cooldownUntil: now + TREE_REFRESH_FAILURE_COOLDOWN_MS,
    };
  }

  const retryAfterSeconds = parsePositiveInteger(getHeaderValue(headers, "retry-after"));
  const rateLimitRemaining = getHeaderValue(headers, "x-ratelimit-remaining");
  const resetAtSeconds = parsePositiveInteger(getHeaderValue(headers, "x-ratelimit-reset"));

  if (retryAfterSeconds !== null) {
    return {
      kind: "rate_limited",
      message: "GitHub API rate limited. Auto-refresh paused.",
      cooldownUntil: now + retryAfterSeconds * 1000,
    };
  }

  return {
    kind: "rate_limited",
    message: "GitHub API rate limited. Auto-refresh paused.",
    cooldownUntil:
      rateLimitRemaining === "0" && resetAtSeconds !== null
        ? resetAtSeconds * 1000
        : now + GITHUB_RATE_LIMIT_FALLBACK_MS,
  };
}

export function shouldBypassRecentSuccessDebounceForBranchRefresh(args: {
  requestedBranch?: string;
  defaultBranch?: string;
  branchNotFound: boolean;
  hasResolvedBranchTree: boolean;
  lastRepositoryMetadataRefreshAt?: number;
  now?: number;
}): boolean {
  if (args.requestedBranch === undefined) {
    return false;
  }

  if (args.branchNotFound) {
    // A recent repo-level confirmation that the branch is missing should fall
    // back to the normal debounce path so typoed URLs do not keep refetching
    // repo metadata on every retry.
    const now = args.now ?? Date.now();
    if (
      typeof args.lastRepositoryMetadataRefreshAt === "number" &&
      now - args.lastRepositoryMetadataRefreshAt < MISSING_BRANCH_CONFIRMATION_DEBOUNCE_MS
    ) {
      return false;
    }
    return true;
  }

  return !args.hasResolvedBranchTree && args.defaultBranch !== args.requestedBranch;
}

export function shouldRefreshRepositoryMetadata(args: {
  intent: RefreshRepositoryIntent;
  requestedBranch?: string;
  branchNotFound: boolean;
  lastRepositoryMetadataRefreshAt?: number;
  includeCloudflarePreviewLinks: boolean;
  now?: number;
}): boolean {
  if (args.intent === "manual") {
    return true;
  }

  // Source setup should reconcile the repo-level branch/PR catalog once, even
  // when cached metadata still falls inside the long stale window.
  if (args.intent === "source_setup" && args.requestedBranch === undefined) {
    return true;
  }

  if (args.branchNotFound) {
    return shouldBypassRecentSuccessDebounceForBranchRefresh({
      requestedBranch: args.requestedBranch,
      defaultBranch: undefined,
      branchNotFound: true,
      hasResolvedBranchTree: false,
      lastRepositoryMetadataRefreshAt: args.lastRepositoryMetadataRefreshAt,
      now: args.now,
    });
  }

  return (
    args.includeCloudflarePreviewLinks ||
    isRepositoryMetadataStale({
      lastRepositoryMetadataRefreshAt: args.lastRepositoryMetadataRefreshAt,
      now: args.now,
    })
  );
}

export function shouldRefreshBranchTree(args: {
  intent: RefreshRepositoryIntent;
  requestedBranch?: string;
  branchNotFound: boolean;
}): boolean {
  if (args.branchNotFound) {
    return false;
  }

  if (args.intent === "manual") {
    return true;
  }

  if (args.requestedBranch !== undefined) {
    return true;
  }

  return args.intent === "source_setup";
}

interface RepositoryRefreshPlan {
  shouldSyncMetadata: boolean;
  shouldRefreshTreeData: boolean;
}

interface RepositoryTreeMetadataSyncPlan {
  shouldSyncMetadata: boolean;
  includeAheadBehind: boolean;
  includePullRequestLinks: boolean;
  includeCloudflarePreviewLinks: boolean;
  includeLastCommitTimestamps: boolean;
}

function shouldLimitAutomaticRepositoryMetadataEnrichment(args: {
  intent: RefreshRepositoryIntent;
  remoteBranchCount?: number;
}): boolean {
  return (
    args.intent !== "manual" &&
    args.intent !== "source_setup" &&
    typeof args.remoteBranchCount === "number" &&
    args.remoteBranchCount > MAX_AUTO_REFRESH_BRANCH_ENRICHMENT_BRANCHES
  );
}

function shouldPreserveTargetedCloudflarePreviewHydration(args: {
  includeCloudflarePreviewLinks: boolean;
  cloudflarePreviewBranchNames: string[];
}): boolean {
  return (
    args.includeCloudflarePreviewLinks &&
    args.cloudflarePreviewBranchNames.some((branchName) => branchName.trim().length > 0)
  );
}

function normalizeCloudflarePreviewBranchNames(branchNames: string[]): string[] {
  const normalizedBranchNames: string[] = [];
  const seenBranchNames = new Set<string>();

  for (const branchName of branchNames) {
    const nextBranchName = branchName.trim();
    if (nextBranchName.length === 0 || seenBranchNames.has(nextBranchName)) {
      continue;
    }
    seenBranchNames.add(nextBranchName);
    normalizedBranchNames.push(nextBranchName);
  }

  return normalizedBranchNames;
}

export function applyRepositoryTreeMetadataSyncBudget(args: {
  shouldSyncMetadata: boolean;
  includeAheadBehind: boolean;
  includePullRequestLinks: boolean;
  includeCloudflarePreviewLinks: boolean;
  cloudflarePreviewBranchNames: string[];
  includeLastCommitTimestamps: boolean;
  intent: RefreshRepositoryIntent;
  remoteBranchCount?: number;
}): RepositoryTreeMetadataSyncPlan {
  if (!args.shouldSyncMetadata) {
    return {
      shouldSyncMetadata: false,
      includeAheadBehind: false,
      includePullRequestLinks: false,
      includeCloudflarePreviewLinks: false,
      includeLastCommitTimestamps: false,
    };
  }

  if (
    !shouldLimitAutomaticRepositoryMetadataEnrichment({
      intent: args.intent,
      remoteBranchCount: args.remoteBranchCount,
    })
  ) {
    return {
      shouldSyncMetadata: true,
      includeAheadBehind: args.includeAheadBehind,
      includePullRequestLinks: args.includePullRequestLinks,
      includeCloudflarePreviewLinks: args.includeCloudflarePreviewLinks,
      includeLastCommitTimestamps: args.includeLastCommitTimestamps,
    };
  }

  // Preserve the metadata the dashboard depends on for branch ordering and PR
  // visibility, while still dropping the noisiest repo-wide backfills that are
  // not needed for the main branch list. Targeted preview hydration stays on
  // because the caller already narrowed it to the specific branches still
  // missing a cached preview.
  return {
    shouldSyncMetadata: true,
    includeAheadBehind: false,
    includePullRequestLinks: args.includePullRequestLinks,
    includeCloudflarePreviewLinks: shouldPreserveTargetedCloudflarePreviewHydration(args),
    includeLastCommitTimestamps: args.includeLastCommitTimestamps,
  };
}

/**
 * Recompute the split refresh plan after each repo-level sync so branch views
 * can converge when metadata changes branch existence or default-branch state.
 */
export function computeRepositoryRefreshPlan(args: {
  intent: RefreshRepositoryIntent;
  requestedBranch?: string;
  branchNotFound: boolean;
  lastRepositoryMetadataRefreshAt?: number;
  includeCloudflarePreviewLinks: boolean;
  now?: number;
}): RepositoryRefreshPlan {
  return {
    shouldSyncMetadata: shouldRefreshRepositoryMetadata(args),
    shouldRefreshTreeData: shouldRefreshBranchTree({
      intent: args.intent,
      requestedBranch: args.requestedBranch,
      branchNotFound: args.branchNotFound,
    }),
  };
}

/**
 * Keep branch-scoped tree refreshes cheap unless the caller explicitly asked for
 * repo metadata enrichment.
 */
export function computeRepositoryTreeMetadataSyncPlan(args: {
  targetBranch?: string;
  includeAheadBehind: boolean;
  includePullRequestLinks: boolean;
  includeCloudflarePreviewLinks: boolean;
  cloudflarePreviewBranchNames: string[];
  intent: RefreshRepositoryIntent;
  remoteBranchCount?: number;
}): RepositoryTreeMetadataSyncPlan {
  const isRepoScoped = args.targetBranch === undefined;
  const includeAheadBehind = args.includeAheadBehind;
  const includePullRequestLinks =
    args.includePullRequestLinks || args.includeCloudflarePreviewLinks;
  const shouldSyncMetadata = isRepoScoped || includeAheadBehind || includePullRequestLinks;

  return applyRepositoryTreeMetadataSyncBudget({
    shouldSyncMetadata,
    includeAheadBehind,
    includePullRequestLinks,
    includeCloudflarePreviewLinks: args.includeCloudflarePreviewLinks,
    cloudflarePreviewBranchNames: args.cloudflarePreviewBranchNames,
    includeLastCommitTimestamps: shouldSyncMetadata,
    intent: args.intent,
    remoteBranchCount: args.remoteBranchCount,
  });
}

function buildGitHubRepositoryDiscoveryUrl(perPage: number): string {
  return `https://api.github.com/user/repos?sort=updated&per_page=${perPage}&affiliation=${GITHUB_REPOSITORY_DISCOVERY_AFFILIATION}`;
}

export function readGitHubNextPageUrl(linkHeader: string | null | undefined): string | null {
  if (typeof linkHeader !== "string" || linkHeader.trim().length === 0) {
    return null;
  }

  for (const match of linkHeader.matchAll(/<([^>]+)>\s*;\s*rel="([^"]+)"/g)) {
    const [, url, rel] = match;
    if (rel === "next") {
      return url;
    }
  }

  return null;
}

export function normalizeGitHubRepositoryListItem(value: unknown): GitHubRepositoryListItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const {
    id,
    name,
    full_name,
    html_url,
    description,
    private: isPrivate,
    fork,
    created_at,
    updated_at,
    language,
    stargazers_count,
    forks_count,
  } = value;

  if (
    typeof id !== "number" ||
    typeof name !== "string" ||
    typeof full_name !== "string" ||
    typeof html_url !== "string" ||
    (typeof description !== "string" && description !== null) ||
    typeof isPrivate !== "boolean" ||
    typeof fork !== "boolean" ||
    typeof created_at !== "string" ||
    typeof updated_at !== "string" ||
    (typeof language !== "string" && language !== null) ||
    typeof stargazers_count !== "number" ||
    typeof forks_count !== "number"
  ) {
    return null;
  }

  return {
    id,
    name,
    full_name,
    html_url,
    description,
    private: isPrivate,
    fork,
    created_at,
    updated_at,
    language,
    stargazers_count,
    forks_count,
  };
}

function normalizeGitHubRepositoryList(value: unknown): GitHubRepositoryList {
  if (!Array.isArray(value)) {
    throw new Error("Unexpected GitHub API response format");
  }

  const repositoriesById = new Map<number, GitHubRepositoryListItem>();
  for (const repository of value) {
    const normalized = normalizeGitHubRepositoryListItem(repository);
    if (normalized === null) {
      throw new Error("Unexpected GitHub repository payload");
    }
    repositoriesById.set(normalized.id, normalized);
  }

  return Array.from(repositoriesById.values());
}

async function fetchGitHubRepositoryPage(args: {
  accessToken: string;
  url: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  repositories: GitHubRepositoryList;
  nextPageUrl: string | null;
}> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const response = await fetchImpl(args.url, {
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "samebase-app",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return {
    repositories: normalizeGitHubRepositoryList(await response.json()),
    nextPageUrl: readGitHubNextPageUrl(response.headers.get("link")),
  };
}

/**
 * The add-vault screen renders the first page immediately, then follows up
 * with the full discovery scan in the background.
 */
export async function listGitHubRepositoryPreview(args: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<GitHubRepositoryPreviewResult> {
  const page = await fetchGitHubRepositoryPage({
    accessToken: args.accessToken,
    fetchImpl: args.fetchImpl,
    url: buildGitHubRepositoryDiscoveryUrl(GITHUB_REPOSITORY_PREVIEW_PAGE_SIZE),
  });

  return {
    repositories: page.repositories,
    hasMore: page.nextPageUrl !== null,
  };
}

export async function listGitHubRepositories(args: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<GitHubRepositoryList> {
  const repositoriesById = new Map<number, GitHubRepositoryListItem>();
  const seenPageUrls = new Set<string>();
  let nextPageUrl: string | null = buildGitHubRepositoryDiscoveryUrl(
    GITHUB_REPOSITORY_DISCOVERY_PAGE_SIZE,
  );

  while (nextPageUrl) {
    if (seenPageUrls.has(nextPageUrl)) {
      throw new Error("GitHub repository pagination loop detected");
    }
    if (seenPageUrls.size >= MAX_GITHUB_REPOSITORY_PAGES) {
      throw new Error(`GitHub repository pagination exceeded ${MAX_GITHUB_REPOSITORY_PAGES} pages`);
    }
    seenPageUrls.add(nextPageUrl);

    const page = await fetchGitHubRepositoryPage({
      accessToken: args.accessToken,
      fetchImpl: args.fetchImpl,
      url: nextPageUrl,
    });

    for (const repository of page.repositories) {
      repositoriesById.set(repository.id, repository);
    }

    nextPageUrl = page.nextPageUrl;
  }

  return Array.from(repositoriesById.values());
}

export const listRepositoriesPreview = action({
  access: "access_repo_connect",
  args: {},
  returns: githubRepositoryPreviewResult,
  handler: async (ctx): Promise<GitHubRepositoryPreviewResult> => {
    const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: ctx.viewer.userId,
      kind: "github",
    });
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const accessToken = githubConnection.auth.credential;
    return await listGitHubRepositoryPreview({ accessToken });
  },
});

// List the current user's GitHub repositories
export const listRepositories = action({
  access: "access_repo_connect",
  args: {},
  returns: array(githubRepositoryListItem),
  handler: async (ctx): Promise<GitHubRepositoryList> => {
    const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: ctx.viewer.userId,
      kind: "github",
    });
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const accessToken = githubConnection.auth.credential;
    return await listGitHubRepositories({ accessToken });
  },
});

const repositoryFileContentResult = union(
  object({ exists: literal(false) }),
  object({ exists: literal(true), content: string() }),
);

type RepositoryFileContent = Infer<typeof repositoryFileContentResult>;
const MAX_REPOSITORY_MEDIA_BYTES = 1_000_000;
const REPOSITORY_MEDIA_TOO_LARGE_MESSAGE = "Preview unavailable for files larger than 1 MB.";

const repositoryMediaAssetResult = union(
  object({
    found: literal(false),
    reason: literal("missing"),
  }),
  object({
    found: literal(false),
    reason: literal("unavailable"),
    message: string(),
  }),
  object({
    found: literal(true),
    kind: literal("image"),
    mimeType: string(),
    url: string(),
    fileName: string(),
  }),
  object({
    found: literal(true),
    kind: literal("vox"),
    mimeType: string(),
    url: string(),
    fileName: string(),
  }),
);

type RepositoryMediaAsset = Infer<typeof repositoryMediaAssetResult>;

type RepositoryMediaUnavailableAsset = Extract<
  RepositoryMediaAsset,
  { found: false; reason: "unavailable" }
>;
type StagedRepositoryMediaAssetCandidate = {
  fileDeleted: boolean;
  kind?: "text" | "binary";
  storageId?: string | null;
  stagedBlobSha?: string | null;
  mime?: string;
  size?: number;
  content: string;
};
const CLOUDFLARE_PREVIEW_COMMENT_CONCURRENCY = 5;
const CLOUDFLARE_PREVIEW_COMMENT_AUTHORS = new Set(["cloudflare-workers-and-pages[bot]"]);

/**
 * Mirror GitHub's preview size ceiling for cached blobs so storage-backed media
 * cannot bypass the same protection the live Contents API path already applies.
 */
export function isRepositoryMediaPreviewTooLarge(size: number | null | undefined): boolean {
  return typeof size === "number" && size > MAX_REPOSITORY_MEDIA_BYTES;
}

function getRepositoryMediaErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "";
  }

  return error.message;
}

function isRepositoryMediaTooLargeError(error: unknown): boolean {
  if (getRepositoryMediaErrorStatus(error) !== 403) {
    return false;
  }

  const message = getRepositoryMediaErrorMessage(error).toLowerCase();
  return (
    message.includes("too large") ||
    message.includes("too_large") ||
    message.includes("blobs up to 1 mb")
  );
}

function getRepositoryMediaTooLargeAsset(): RepositoryMediaUnavailableAsset {
  return {
    found: false,
    reason: "unavailable",
    message: REPOSITORY_MEDIA_TOO_LARGE_MESSAGE,
  };
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

interface RemoteBranchSummary {
  name: string;
  headCommitSha: string;
  lastCommitAt?: number;
  aheadBy?: number;
  behindBy?: number;
  aheadBehindState: "resolved" | "unavailable" | "preserve";
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  pullRequestLabels?: PullRequestLabelSummary[];
  pullRequestTitle?: string;
  pullRequestIsDraft?: boolean;
  pullRequestState: "resolved" | "preserve";
  isDefault: boolean;
  isProtected: boolean;
}

type PullRequestLabelSummary = Extract<StoredPullRequestLabel, { name: string }>;

interface CachedBranchTreeSnapshot {
  treeSHA: string;
  commitSHA?: string;
}

interface RemoteBranchCloudflarePreviewSync {
  name: string;
  previewState: "resolved" | "clear" | "preserve";
  cloudflareBranchPreviewUrl?: string;
  cloudflarePreviewPullRequestNumber?: number;
  cloudflarePreviewUrl?: string;
  cloudflarePreviewCommitSha?: string;
  cloudflarePreviewStatus?: string;
  cloudflarePreviewLogsUrl?: string;
  cloudflarePreviewCommentCreatedAt?: number;
}

interface RepositoryTreeUpdatePlan {
  shouldUpdateBranchTree: boolean;
}

export function computeRepositoryTreeUpdatePlan(args: {
  resolvedBranch: string;
  fetchedTreeSHA: string;
  fetchedCommitSHA?: string;
  cachedBranchTree: CachedBranchTreeSnapshot | null;
}): RepositoryTreeUpdatePlan {
  const shouldUpdateBranchTree =
    !args.cachedBranchTree ||
    args.fetchedTreeSHA !== args.cachedBranchTree.treeSHA ||
    args.fetchedCommitSHA !== args.cachedBranchTree.commitSHA;

  return {
    shouldUpdateBranchTree,
  };
}

function parseGitTimestamp(value: string | undefined): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }
  return timestamp;
}

/**
 * Keep only stable human-visible label metadata from GitHub's PR payload so
 * the cached branch metadata stays small and display-ready.
 */
export function readPullRequestLabels(labels: unknown): PullRequestLabelSummary[] {
  if (!Array.isArray(labels)) {
    return [];
  }

  const labelNames: PullRequestLabelSummary[] = [];
  const seenNames = new Set<string>();
  for (const label of labels) {
    const name = (() => {
      if (typeof label === "string") {
        return label;
      }
      if (isRecord(label) && typeof label.name === "string") {
        return label.name;
      }
      return undefined;
    })();
    if (typeof name !== "string" || name.length === 0 || seenNames.has(name)) {
      continue;
    }
    seenNames.add(name);
    labelNames.push({
      name,
      color:
        isRecord(label) && typeof label.color === "string" && label.color.length > 0
          ? label.color
          : undefined,
    });
  }

  return labelNames;
}

const isAllowedCloudflarePreviewCommentAuthor = guard<unknown, string>((login) =>
  typeof login === "string" && CLOUDFLARE_PREVIEW_COMMENT_AUTHORS.has(login.toLowerCase())
    ? login
    : null,
);

async function getLatestPullRequestCloudflarePreviewComment(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  pullRequestNumber: number;
}): Promise<
  | {
      state: "resolved";
      preview?:
        | (CloudflarePreviewCommentMetadata & {
            cloudflarePreviewCommentCreatedAt?: number;
          })
        | undefined;
    }
  | {
      state: "preserve";
    }
> {
  const perPage = 100;
  const maxPages = 20;
  let hitPageLimit = false;

  for (let page = 1; page <= maxPages; page += 1) {
    const pageResponse = await args.octokit.rest.issues.listComments({
      owner: args.owner,
      repo: args.repo,
      issue_number: args.pullRequestNumber,
      per_page: perPage,
      page,
      sort: "updated",
      direction: "desc",
    });

    if (pageResponse.data.length === 0) {
      break;
    }

    for (const comment of pageResponse.data) {
      if (typeof comment.body !== "string") {
        continue;
      }
      if (!isAllowedCloudflarePreviewCommentAuthor(comment.user?.login)) {
        continue;
      }

      const parsed = parseCloudflarePreviewComment(comment.body);
      if (!parsed) {
        continue;
      }

      return {
        state: "resolved",
        preview: {
          ...parsed,
          cloudflarePreviewCommentCreatedAt: parseGitTimestamp(comment.created_at),
        },
      };
    }

    if (pageResponse.data.length < perPage) {
      break;
    }
    if (page === maxPages) {
      hitPageLimit = true;
    }
  }

  if (hitPageLimit) {
    console.warn(
      "listPullRequestCloudflarePreviewComment reached page limit",
      JSON.stringify({
        owner: args.owner,
        repo: args.repo,
        pullRequestNumber: args.pullRequestNumber,
        maxPages,
        perPage,
      }),
    );
    return {
      state: "preserve",
    };
  }
  return {
    state: "resolved",
  };
}

async function getCloudflarePreviewLinksByBranch(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branches: RemoteBranchSummary[];
}): Promise<RemoteBranchCloudflarePreviewSync[]> {
  const updates: RemoteBranchCloudflarePreviewSync[] = [];

  for (
    let index = 0;
    index < args.branches.length;
    index += CLOUDFLARE_PREVIEW_COMMENT_CONCURRENCY
  ) {
    const batch = args.branches.slice(index, index + CLOUDFLARE_PREVIEW_COMMENT_CONCURRENCY);
    const batchUpdates = await Promise.all(
      batch.map(async (branch): Promise<RemoteBranchCloudflarePreviewSync> => {
        if (branch.pullRequestState !== "resolved") {
          return {
            name: branch.name,
            previewState: "preserve",
          };
        }

        if (typeof branch.pullRequestNumber !== "number") {
          return {
            name: branch.name,
            previewState: "clear",
          };
        }

        try {
          const previewResult = await getLatestPullRequestCloudflarePreviewComment({
            octokit: args.octokit,
            owner: args.owner,
            repo: args.repo,
            pullRequestNumber: branch.pullRequestNumber,
          });
          if (previewResult.state === "preserve") {
            return {
              name: branch.name,
              previewState: "preserve",
            };
          }

          const preview = previewResult.preview;
          if (!preview) {
            return {
              name: branch.name,
              previewState: "clear",
            };
          }

          return {
            name: branch.name,
            previewState: "resolved",
            cloudflareBranchPreviewUrl: preview.branchPreviewUrl,
            cloudflarePreviewPullRequestNumber: branch.pullRequestNumber,
            cloudflarePreviewUrl: preview.previewUrl,
            cloudflarePreviewCommitSha: preview.previewCommitSha,
            cloudflarePreviewStatus: preview.previewStatus,
            cloudflarePreviewLogsUrl: preview.previewLogsUrl,
            cloudflarePreviewCommentCreatedAt: preview.cloudflarePreviewCommentCreatedAt,
          };
        } catch (error: unknown) {
          console.warn(
            "listPullRequestCloudflarePreviewComment failed",
            JSON.stringify({
              owner: args.owner,
              repo: args.repo,
              branchName: branch.name,
              pullRequestNumber: branch.pullRequestNumber,
              error: error instanceof Error ? error.message : toErrorMessage(error, "unknown"),
            }),
          );
          return {
            name: branch.name,
            previewState: "preserve",
          };
        }
      }),
    );
    updates.push(...batchUpdates);
  }

  return updates;
}

export function shouldSyncCloudflarePreviewLinks(args: {
  includeCloudflarePreviewLinks: boolean;
  includePullRequestLinks: boolean;
  branches: Array<{ pullRequestState: "resolved" | "preserve" }>;
}): boolean {
  return (
    args.branches.length > 0 &&
    args.includeCloudflarePreviewLinks &&
    args.includePullRequestLinks &&
    args.branches.every((branch) => branch.pullRequestState === "resolved")
  );
}

function readPullRequestHeadRepositoryFullName(pullRequest: unknown): string | undefined {
  if (!isRecord(pullRequest)) {
    return undefined;
  }
  const head = pullRequest.head;
  if (!isRecord(head)) {
    return undefined;
  }
  const repo = head.repo;
  if (!isRecord(repo)) {
    return undefined;
  }
  const fullName = repo.full_name;
  if (typeof fullName !== "string" || fullName.length === 0) {
    return undefined;
  }
  return fullName;
}

export function resolveAheadBehindBaseBranch(args: {
  branchNames: string[];
  defaultBranch: string;
}): string | undefined {
  return args.branchNames.some((branchName) => branchName === args.defaultBranch)
    ? args.defaultBranch
    : undefined;
}

async function getAheadBehindByBranch(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  baseBranch: string | undefined;
  branchNames: string[];
}): Promise<
  Map<
    string,
    {
      state: "resolved" | "unavailable" | "preserve";
      aheadBy?: number;
      behindBy?: number;
    }
  >
> {
  const countsByBranch = new Map<
    string,
    {
      state: "resolved" | "unavailable" | "preserve";
      aheadBy?: number;
      behindBy?: number;
    }
  >();

  if (!args.baseBranch) {
    for (const branchName of args.branchNames) {
      countsByBranch.set(branchName, { state: "unavailable" });
    }
    return countsByBranch;
  }

  for (const branchName of args.branchNames) {
    if (branchName === args.baseBranch) {
      countsByBranch.set(branchName, {
        state: "resolved",
        aheadBy: 0,
        behindBy: 0,
      });
    }
  }

  const branchNamesToCompare = args.branchNames.filter(
    (branchName) => branchName !== args.baseBranch,
  );
  const chunkSize = 10;
  for (let startIndex = 0; startIndex < branchNamesToCompare.length; startIndex += chunkSize) {
    const chunk = branchNamesToCompare.slice(startIndex, startIndex + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (branchName) => {
        try {
          const response = await args.octokit.rest.repos.compareCommitsWithBasehead({
            owner: args.owner,
            repo: args.repo,
            basehead: `${args.baseBranch}...${branchName}`,
          });
          const aheadBy = response.data.ahead_by;
          const behindBy = response.data.behind_by;
          if (typeof aheadBy !== "number" || typeof behindBy !== "number") {
            return {
              branchName,
              state: "preserve" as const,
              aheadBy: undefined,
              behindBy: undefined,
            };
          }
          return {
            branchName,
            state: "resolved" as const,
            aheadBy,
            behindBy,
          };
        } catch (error: unknown) {
          console.warn(
            "compareCommitsWithBasehead failed",
            JSON.stringify({
              owner: args.owner,
              repo: args.repo,
              baseBranch: args.baseBranch,
              branchName,
              error: error instanceof Error ? error.message : toErrorMessage(error, "unknown"),
            }),
          );
          return {
            branchName,
            state: "preserve" as const,
            aheadBy: undefined,
            behindBy: undefined,
          };
        }
      }),
    );

    for (const chunkResult of chunkResults) {
      countsByBranch.set(chunkResult.branchName, {
        state: chunkResult.state,
        aheadBy: chunkResult.aheadBy,
        behindBy: chunkResult.behindBy,
      });
    }
  }

  return countsByBranch;
}
async function getHeadCommitTimestamps(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  shas: string[];
}): Promise<Map<string, number | undefined>> {
  const uniqueShas = Array.from(new Set(args.shas));
  const timestampsBySha = new Map<string, number | undefined>();
  const chunkSize = 20;

  for (let start = 0; start < uniqueShas.length; start += chunkSize) {
    const chunk = uniqueShas.slice(start, start + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (sha) => {
        try {
          const response = await args.octokit.rest.git.getCommit({
            owner: args.owner,
            repo: args.repo,
            commit_sha: sha,
          });
          const lastCommitAt =
            parseGitTimestamp(response.data.committer.date) ??
            parseGitTimestamp(response.data.author.date);
          return { sha, lastCommitAt };
        } catch {
          return { sha, lastCommitAt: undefined };
        }
      }),
    );

    for (const result of chunkResults) {
      timestampsBySha.set(result.sha, result.lastCommitAt);
    }
  }

  return timestampsBySha;
}

type OpenPullRequestCandidate = {
  head: {
    ref?: string;
    repo?: {
      full_name?: string | null;
    } | null;
  };
  base?: {
    ref?: string;
  };
  html_url?: string | null;
  number?: number;
  title?: string | null;
  draft?: boolean | null;
  labels?: unknown;
  updated_at?: string;
  created_at?: string;
};

export function collectLatestOpenPullRequestsByBranch(args: {
  branchNames: string[];
  repositoryFullName: string;
  pullRequests: OpenPullRequestCandidate[];
}): Map<
  string,
  {
    url: string;
    number: number;
    labels: PullRequestLabelSummary[];
    title?: string;
    isDraft: boolean;
  }
> {
  const branchNameSet = new Set(args.branchNames);
  const normalizedRepositoryFullName = args.repositoryFullName.toLowerCase();
  const latestByBranch = new Map<
    string,
    {
      url: string;
      number: number;
      labels: PullRequestLabelSummary[];
      title?: string;
      isDraft: boolean;
      updatedAt: number;
    }
  >();

  for (const pullRequest of args.pullRequests) {
    const branchName = pullRequest.head.ref;
    if (
      typeof branchName !== "string" ||
      !branchNameSet.has(branchName) ||
      typeof pullRequest.html_url !== "string" ||
      pullRequest.html_url.length === 0 ||
      typeof pullRequest.number !== "number"
    ) {
      continue;
    }

    const pullRequestHeadRepo = readPullRequestHeadRepositoryFullName(pullRequest);
    if (
      typeof pullRequestHeadRepo !== "string" ||
      pullRequestHeadRepo.toLowerCase() !== normalizedRepositoryFullName
    ) {
      continue;
    }

    const updatedAtRaw =
      typeof pullRequest.updated_at === "string" ? pullRequest.updated_at : pullRequest.created_at;
    const updatedAtParsed = Date.parse(updatedAtRaw ?? "");
    const updatedAt = Number.isNaN(updatedAtParsed) ? 0 : updatedAtParsed;
    const existing = latestByBranch.get(branchName);
    if (!existing || updatedAt >= existing.updatedAt) {
      latestByBranch.set(branchName, {
        url: pullRequest.html_url,
        number: pullRequest.number,
        labels: readPullRequestLabels(pullRequest.labels),
        title:
          typeof pullRequest.title === "string" && pullRequest.title.length > 0
            ? pullRequest.title
            : undefined,
        isDraft: pullRequest.draft === true,
        updatedAt,
      });
    }
  }

  return new Map(
    Array.from(latestByBranch.entries()).map(([branchName, pullRequest]) => [
      branchName,
      {
        url: pullRequest.url,
        number: pullRequest.number,
        labels: pullRequest.labels,
        title: pullRequest.title,
        isDraft: pullRequest.isDraft,
      },
    ]),
  );
}

async function getOpenPullRequestsByBranch(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branchNames: string[];
}): Promise<{
  state: "resolved" | "preserve";
  pullRequestsByBranch: Map<
    string,
    | {
        url?: string;
        number?: number;
        labels: PullRequestLabelSummary[];
        title?: string;
        isDraft?: boolean;
      }
    | undefined
  >;
}> {
  try {
    const repositoryFullName = `${args.owner}/${args.repo}`.toLowerCase();
    const openPullRequests: OpenPullRequestCandidate[] = [];
    const perPage = 100;
    const maxPages = 50;
    let hitPageLimit = false;

    for (let page = 1; page <= maxPages; page += 1) {
      const pageResponse = await args.octokit.rest.pulls.list({
        owner: args.owner,
        repo: args.repo,
        state: "open",
        per_page: perPage,
        page,
      });
      if (pageResponse.data.length === 0) {
        break;
      }

      openPullRequests.push(...pageResponse.data);

      if (pageResponse.data.length < perPage) {
        break;
      }
      if (page === maxPages) {
        hitPageLimit = true;
      }
    }

    if (hitPageLimit) {
      console.warn(
        "listOpenPullRequests reached page limit",
        JSON.stringify({
          owner: args.owner,
          repo: args.repo,
          maxPages,
          perPage,
        }),
      );
    }

    const pullRequestsByBranch = new Map<
      string,
      | {
          url?: string;
          number?: number;
          labels: PullRequestLabelSummary[];
          title?: string;
          isDraft?: boolean;
        }
      | undefined
    >();
    const latestByBranch = collectLatestOpenPullRequestsByBranch({
      branchNames: args.branchNames,
      repositoryFullName,
      pullRequests: openPullRequests,
    });
    for (const branchName of args.branchNames) {
      const pullRequest = latestByBranch.get(branchName);
      pullRequestsByBranch.set(
        branchName,
        pullRequest
          ? {
              url: pullRequest.url,
              number: pullRequest.number,
              labels: pullRequest.labels,
              title: pullRequest.title,
              isDraft: pullRequest.isDraft,
            }
          : undefined,
      );
    }

    return {
      state: "resolved",
      pullRequestsByBranch,
    };
  } catch (error: unknown) {
    console.warn(
      "listOpenPullRequests failed",
      JSON.stringify({
        owner: args.owner,
        repo: args.repo,
        error: toErrorMessage(error, "unknown"),
      }),
    );
    return {
      state: "preserve",
      pullRequestsByBranch: new Map(),
    };
  }
}
async function listRemoteBranches(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  includeAheadBehind: boolean;
  includePullRequestLinks: boolean;
  includeLastCommitTimestamps: boolean;
  intent: RefreshRepositoryIntent;
}): Promise<RemoteBranchSummary[]> {
  const repoResponse = await args.octokit.rest.repos.get({
    owner: args.owner,
    repo: args.repo,
  });
  const defaultBranch =
    typeof repoResponse.data.default_branch === "string"
      ? repoResponse.data.default_branch
      : "main";

  const branches: RemoteBranchSummary[] = [];
  const perPage = 100;
  for (let page = 1; ; page += 1) {
    const pageResponse = await args.octokit.rest.repos.listBranches({
      owner: args.owner,
      repo: args.repo,
      per_page: perPage,
      page,
    });
    if (pageResponse.data.length === 0) {
      break;
    }

    for (const branch of pageResponse.data) {
      if (typeof branch.name !== "string") {
        continue;
      }
      const headCommitSha = typeof branch.commit.sha === "string" ? branch.commit.sha : "";
      if (headCommitSha.length === 0) {
        continue;
      }

      branches.push({
        name: branch.name,
        headCommitSha,
        aheadBehindState: "preserve",
        pullRequestState: "preserve",
        isDefault: branch.name === defaultBranch,
        isProtected: branch.protected === true,
      });
    }

    if (pageResponse.data.length < perPage) {
      break;
    }
  }

  const branchNames = branches.map((branch) => branch.name);
  const effectiveSyncPlan = applyRepositoryTreeMetadataSyncBudget({
    shouldSyncMetadata: true,
    includeAheadBehind: args.includeAheadBehind,
    includePullRequestLinks: args.includePullRequestLinks,
    includeCloudflarePreviewLinks: false,
    cloudflarePreviewBranchNames: [],
    includeLastCommitTimestamps: args.includeLastCommitTimestamps,
    intent: args.intent,
    remoteBranchCount: branches.length,
  });
  const baseBranch = resolveAheadBehindBaseBranch({
    branchNames,
    defaultBranch,
  });
  const aheadBehindByBranchPromise = effectiveSyncPlan.includeAheadBehind
    ? getAheadBehindByBranch({
        octokit: args.octokit,
        owner: args.owner,
        repo: args.repo,
        baseBranch,
        branchNames,
      })
    : Promise.resolve(
        new Map(branchNames.map((branchName) => [branchName, { state: "preserve" as const }])),
      );
  const pullRequestsByBranchPromise = effectiveSyncPlan.includePullRequestLinks
    ? getOpenPullRequestsByBranch({
        octokit: args.octokit,
        owner: args.owner,
        repo: args.repo,
        branchNames,
      })
    : Promise.resolve({
        state: "preserve" as const,
        pullRequestsByBranch: new Map<
          string,
          | {
              url?: string;
              number?: number;
              labels: PullRequestLabelSummary[];
              title?: string;
              isDraft?: boolean;
            }
          | undefined
        >(),
      });

  const [timestampsBySha, aheadBehindByBranch, pullRequestsByBranch] = await Promise.all([
    effectiveSyncPlan.includeLastCommitTimestamps
      ? getHeadCommitTimestamps({
          octokit: args.octokit,
          owner: args.owner,
          repo: args.repo,
          shas: branches.map((branch) => branch.headCommitSha),
        })
      : Promise.resolve(new Map<string, number | undefined>()),
    aheadBehindByBranchPromise,
    pullRequestsByBranchPromise,
  ]);

  return branches.map((branch) => {
    const aheadBehind = aheadBehindByBranch.get(branch.name) ?? {
      state: "preserve" as const,
    };
    const pullRequest =
      pullRequestsByBranch.state === "resolved"
        ? pullRequestsByBranch.pullRequestsByBranch.get(branch.name)
        : undefined;

    return {
      ...branch,
      lastCommitAt: timestampsBySha.get(branch.headCommitSha),
      aheadBy: aheadBehind.state === "resolved" ? aheadBehind.aheadBy : undefined,
      behindBy: aheadBehind.state === "resolved" ? aheadBehind.behindBy : undefined,
      aheadBehindState: aheadBehind.state,
      pullRequestUrl: pullRequest?.url,
      pullRequestNumber: pullRequest?.number,
      pullRequestLabels: pullRequest?.labels,
      pullRequestTitle: pullRequest?.title,
      pullRequestIsDraft: pullRequest?.isDraft,
      pullRequestState: pullRequestsByBranch.state,
    };
  });
}

function buildDataUrl(mimeType: string, content: Buffer): string {
  return `data:${mimeType};base64,${content.toString("base64")}`;
}

function readStoredMimeType(filePath: string, blobMime: string | undefined): string {
  if (typeof blobMime === "string" && blobMime.includes("/")) {
    return blobMime;
  }
  return guessMime(filePath);
}

async function resolveCachedRepositoryMediaAsset(
  ctx: {
    storage: {
      getUrl(storageId: string): Promise<string | null>;
    };
  },
  cachedBlob: CachedRepositoryBlob | null,
  filePath: string,
  mediaKind: RepositoryMediaKind,
  fileName: string,
): Promise<RepositoryMediaAsset | null> {
  if (isRepositoryMediaPreviewTooLarge(cachedBlob?.size)) {
    return getRepositoryMediaTooLargeAsset();
  }

  if (typeof cachedBlob?.storageId === "string") {
    const url = await ctx.storage.getUrl(cachedBlob.storageId);
    if (typeof url === "string" && url.length > 0) {
      return {
        found: true,
        kind: mediaKind,
        mimeType: readStoredMimeType(filePath, cachedBlob.mime),
        url,
        fileName,
      };
    }
  }

  if (typeof cachedBlob?.text === "string" && isSvgRepositoryMediaPath(filePath)) {
    return {
      found: true,
      kind: mediaKind,
      mimeType: "image/svg+xml",
      url: buildDataUrl("image/svg+xml", Buffer.from(cachedBlob.text, "utf-8")),
      fileName,
    };
  }

  return null;
}

async function getRepositoryBlobShaForBranchPath(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
}): Promise<string | null> {
  const tree = await args.octokit.rest.git.getTree({
    owner: args.owner,
    repo: args.repo,
    tree_sha: toGitTreeRef(args.branch),
    recursive: "1",
  });
  const targetFile = tree.data.tree.find(
    (item) =>
      item.type === "blob" &&
      item.path === args.filePath &&
      typeof item.sha === "string" &&
      item.sha.length > 0,
  );

  return targetFile?.sha ?? null;
}

export async function resolveStagedRepositoryMediaAsset(args: {
  storage: {
    getUrl(storageId: string): Promise<string | null>;
  };
  loadCachedBlobBySha: (sha: string) => Promise<CachedRepositoryBlob | null>;
  stagedFile: StagedRepositoryMediaAssetCandidate;
  filePath: string;
  mediaKind: RepositoryMediaKind;
  fileName: string;
}): Promise<RepositoryMediaAsset> {
  if (args.stagedFile.fileDeleted) {
    return { found: false, reason: "missing" };
  }

  const stagedKind = readStagedFileKind(args.stagedFile.kind);
  const directAsset = await resolveCachedRepositoryMediaAsset(
    { storage: args.storage },
    {
      storageId: args.stagedFile.storageId,
      text: args.stagedFile.content,
      mime: args.stagedFile.mime,
      size: args.stagedFile.size,
    },
    args.filePath,
    args.mediaKind,
    args.fileName,
  );
  if (directAsset) {
    return directAsset;
  }

  if (
    stagedKind === "binary" &&
    typeof args.stagedFile.stagedBlobSha === "string" &&
    args.stagedFile.stagedBlobSha.length > 0
  ) {
    const cachedBlob = await args.loadCachedBlobBySha(args.stagedFile.stagedBlobSha);
    const resolvedCachedAsset = await resolveCachedRepositoryMediaAsset(
      { storage: args.storage },
      cachedBlob,
      args.filePath,
      args.mediaKind,
      args.fileName,
    );
    if (resolvedCachedAsset) {
      return resolvedCachedAsset;
    }
  }

  if (stagedKind === "binary") {
    return {
      found: false,
      reason: "unavailable",
      message: "Staged upload is missing storage reference.",
    };
  }

  if (isSvgRepositoryMediaPath(args.filePath)) {
    return {
      found: true,
      kind: args.mediaKind,
      mimeType: "image/svg+xml",
      url: buildDataUrl("image/svg+xml", Buffer.from(args.stagedFile.content, "utf-8")),
      fileName: args.fileName,
    };
  }

  return {
    found: false,
    reason: "unavailable",
    message: "Preview unavailable for this staged file.",
  };
}

function getRepositoryMediaFileName(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

function getRepositoryMediaExtension(filePath: string): string {
  const fileName = getRepositoryMediaFileName(filePath);
  const extensionStart = fileName.lastIndexOf(".");
  if (extensionStart === -1 || extensionStart === fileName.length - 1) {
    return "";
  }
  return fileName.slice(extensionStart + 1).toLowerCase();
}

function getRepositoryMediaErrorStatus(error: unknown): number | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return null;
}

export const getRepositoryFileContent = action({
  access: "access_files_read",
  args: {
    repositoryFullName: string(),
    filePath: string(),
    branch: optional(string()),
  },
  returns: repositoryFileContentResult,
  handler: async (ctx, args): Promise<RepositoryFileContent> => {
    const requestedBranch = normalizeOptionalRepositoryBranch(args.branch);
    const userId = ctx.viewer.userId;

    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    if (!requestedBranch) {
      const targetFile = vault.treeData?.tree.find(
        (item: { path: string; type: string; sha?: string }) =>
          item.path === args.filePath && item.type === "blob",
      );

      if (!targetFile?.sha) {
        return { exists: false };
      }

      const blobFile = await ctx.runQuery(internal.gitOperations.getBlobBySha, {
        sha: targetFile.sha,
      });

      if (blobFile && typeof blobFile.text === "string") {
        return {
          exists: true,
          content: blobFile.text,
        };
      }
    }

    const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId,
      kind: "github",
    });
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const octokit: Octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });

    try {
      const file = await octokit.rest.repos.getContent({
        owner: vault.owner,
        repo: vault.name,
        path: args.filePath,
        ref: requestedBranch,
      });

      if (Array.isArray(file.data) || file.data.type !== "file") {
        return { exists: false };
      }

      const contentBuffer = Buffer.from(file.data.content, "base64");
      return {
        exists: true,
        content: contentBuffer.toString("utf-8"),
      };
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof error.status === "number" &&
        error.status === 404
      ) {
        return { exists: false };
      }

      throw error;
    }
  },
});

export const getRepositoryMediaAsset = action({
  access: "access_files_read",
  args: {
    repositoryFullName: string(),
    filePath: string(),
    branch: optional(string()),
    skipStaging: optional(boolean()),
  },
  returns: repositoryMediaAssetResult,
  handler: async (ctx, args): Promise<RepositoryMediaAsset> => {
    const mediaKind = getRepositoryMediaKind(args.filePath);
    if (mediaKind === null) {
      return { found: false, reason: "missing" };
    }

    const requestedBranch = normalizeOptionalRepositoryBranch(args.branch);
    const userId = ctx.viewer.userId;
    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
      branch: requestedBranch,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    const fileName = getRepositoryMediaFileName(args.filePath);
    const shouldSkipStaging = args.skipStaging === true;

    if (requestedBranch && !shouldSkipStaging) {
      const stagedFile = await ctx.runQuery(internal.fileStaging.getByNewPathInternal, {
        vaultId: vault._id,
        branch: requestedBranch,
        newPath: args.filePath,
      });
      if (stagedFile) {
        const stagedAsset = await resolveStagedRepositoryMediaAsset({
          storage: ctx.storage,
          loadCachedBlobBySha: (sha) => ctx.runQuery(internal.gitOperations.getBlobBySha, { sha }),
          stagedFile,
          filePath: args.filePath,
          mediaKind,
          fileName,
        });
        if (
          !stagedAsset.found &&
          stagedAsset.reason === "unavailable" &&
          readStagedFileKind(stagedFile.kind) === "binary"
        ) {
          console.warn("Staged binary media preview is missing storage data", {
            vaultId: vault._id,
            branch: requestedBranch,
            filePath: args.filePath,
            stagingId: stagedFile._id,
          });
        }
        return stagedAsset;
      }
    }

    let targetFileSha: string | null = null;
    if (!requestedBranch) {
      const targetFile = vault.treeData?.tree.find(
        (item: { path: string; type: string; sha?: string }) =>
          item.path === args.filePath && item.type === "blob",
      );

      if (!targetFile?.sha) {
        return { found: false, reason: "missing" };
      }

      targetFileSha = targetFile.sha;
      const cachedBlob = await ctx.runQuery(internal.gitOperations.getBlobBySha, {
        sha: targetFileSha,
      });
      const resolvedCachedAsset = await resolveCachedRepositoryMediaAsset(
        ctx,
        cachedBlob,
        args.filePath,
        mediaKind,
        fileName,
      );
      if (resolvedCachedAsset) {
        return resolvedCachedAsset;
      }
    }

    const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId,
      kind: "github",
    });
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const octokit: Octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });

    try {
      if (requestedBranch) {
        targetFileSha = await getRepositoryBlobShaForBranchPath({
          octokit,
          owner: vault.owner,
          repo: vault.name,
          branch: requestedBranch,
          filePath: args.filePath,
        });
        if (targetFileSha === null) {
          return { found: false, reason: "missing" };
        }
        const cachedBlob = await ctx.runQuery(internal.gitOperations.getBlobBySha, {
          sha: targetFileSha,
        });
        const resolvedCachedAsset = await resolveCachedRepositoryMediaAsset(
          ctx,
          cachedBlob,
          args.filePath,
          mediaKind,
          fileName,
        );
        if (resolvedCachedAsset) {
          return resolvedCachedAsset;
        }
      }

      if (targetFileSha === null) {
        return { found: false, reason: "missing" };
      }

      const blob = await octokit.rest.git.getBlob({
        owner: vault.owner,
        repo: vault.name,
        file_sha: targetFileSha,
      });
      if (typeof blob.data.content !== "string" || blob.data.content.length === 0) {
        return {
          found: false,
          reason: "unavailable",
          message: "Preview unavailable for this file.",
        };
      }

      const mimeType = guessMime(args.filePath);
      const content = blob.data.content.replace(/\n/g, "");
      const buffer = Buffer.from(content, "base64");
      const storageId = await withRetry(() =>
        ctx.storage.store(new Blob([buffer], { type: mimeType })),
      );

      await ctx.runMutation(internal.gitOperations.saveFileBlob, {
        vaultId: vault._id,
        sha: targetFileSha,
        size: buffer.byteLength,
        mime: mimeType,
        text: undefined,
        storageId,
        ext: getRepositoryMediaExtension(args.filePath),
        debugFilePath: args.filePath,
      });

      const url = await ctx.storage.getUrl(storageId);
      if (typeof url !== "string" || url.length === 0) {
        throw new Error("Failed to create media preview URL");
      }

      return {
        found: true,
        kind: mediaKind,
        mimeType,
        url,
        fileName,
      };
    } catch (error: unknown) {
      if (getRepositoryMediaErrorStatus(error) === 404) {
        return { found: false, reason: "missing" };
      }

      if (isRepositoryMediaTooLargeError(error)) {
        return getRepositoryMediaTooLargeAsset();
      }
      throw error;
    }
  },
});

/**
 * Shared refresh planner for the direct file-view action and Workpool runner.
 *
 * It claims the existing vault refresh lock once, applies metadata budget rules,
 * runs the selected metadata/tree work, then always releases or records failure
 * on that same claim. The queue runner calls it with repository scope; the file
 * route still calls it directly with branch scope.
 */
async function refreshRepositoryTreeForUserHelper(
  ctx: ActionCtx,
  args: RefreshRepositoryTreeForUserArgs,
): Promise<RefreshRepositoryTreeResult> {
  const intent = args.intent;
  const requestedBranch =
    args.scope === "branch" ? normalizeRequiredRepositoryBranch(args.branch) : undefined;
  const requestedCloudflarePreviewBranchNames = normalizeCloudflarePreviewBranchNames(
    args.cloudflarePreviewBranchNames,
  );
  const includeCloudflarePreviewLinks = args.includeCloudflarePreviewLinks;

  const repositoryFullName = `${args.owner}/${args.repo}`;
  const readVault = async (branch: string | undefined) =>
    ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName,
      userId: args.userId,
      branch,
    });

  let vault = await readVault(requestedBranch);
  if (!vault) {
    return { refreshed: false };
  }

  let refreshPlan = computeRepositoryRefreshPlan({
    intent,
    requestedBranch,
    branchNotFound: vault.branchNotFound,
    lastRepositoryMetadataRefreshAt: vault.lastRepositoryMetadataRefreshAt,
    includeCloudflarePreviewLinks,
  });

  if (!refreshPlan.shouldSyncMetadata && !refreshPlan.shouldRefreshTreeData) {
    return vault.branchNotFound
      ? {
          refreshed: false,
          reason: "branch_not_found",
        }
      : { refreshed: false };
  }

  const debounceMs = vault.branchNotFound ? MISSING_BRANCH_CONFIRMATION_DEBOUNCE_MS : undefined;
  const skipRecentSuccessDebounce =
    refreshPlan.shouldSyncMetadata ||
    shouldBypassRecentSuccessDebounceForBranchRefresh({
      requestedBranch,
      defaultBranch: vault.defaultBranch,
      branchNotFound: vault.branchNotFound,
      hasResolvedBranchTree: vault.hasResolvedBranchTree,
      lastRepositoryMetadataRefreshAt: vault.lastRepositoryMetadataRefreshAt,
    });

  // Atomically claim the refresh lock; skip if debounced or already running
  const claim = await ctx.runMutation(internal.vault.branches.claimTreeRefresh, {
    vaultId: vault._id,
    debounceMs,
    // Missing or stale branch metadata still needs a refresh even when the
    // repo itself synced recently.
    skipRecentSuccessDebounce,
  });
  if (!claim.claimed) {
    return {
      refreshed: false,
      reason: claim.reason,
    };
  }
  if (typeof claim.startedAt !== "number") {
    throw new Error("Tree refresh claim missing start timestamp");
  }

  let refreshError: unknown = null;
  let refreshFailure: TreeRefreshFailureDescriptor | null = null;
  let didSyncMetadata = false;
  let didRefreshTreeData = false;
  const metadataSyncPlan = computeRepositoryTreeMetadataSyncPlan({
    targetBranch: requestedBranch,
    includeAheadBehind: args.includeAheadBehind,
    includePullRequestLinks: args.includePullRequestLinks,
    includeCloudflarePreviewLinks,
    cloudflarePreviewBranchNames: requestedCloudflarePreviewBranchNames,
    intent,
    remoteBranchCount: vault.remoteBranchCount,
  });
  try {
    if (refreshPlan.shouldSyncMetadata) {
      didSyncMetadata = true;
      await ctx.runAction(internal.github.syncRepositoryMetadata, {
        userId: args.userId,
        owner: args.owner,
        repo: args.repo,
        includeAheadBehind: metadataSyncPlan.includeAheadBehind,
        includePullRequestLinks: metadataSyncPlan.includePullRequestLinks,
        includeCloudflarePreviewLinks: metadataSyncPlan.includeCloudflarePreviewLinks,
        cloudflarePreviewBranchNames: requestedCloudflarePreviewBranchNames,
        includeLastCommitTimestamps: metadataSyncPlan.includeLastCommitTimestamps,
        intent,
      });

      const refreshedVault = await readVault(requestedBranch);
      if (!refreshedVault) {
        throw new Error("Vault not found");
      }
      vault = refreshedVault;
      refreshPlan = computeRepositoryRefreshPlan({
        intent,
        requestedBranch,
        branchNotFound: vault.branchNotFound,
        lastRepositoryMetadataRefreshAt: vault.lastRepositoryMetadataRefreshAt,
        includeCloudflarePreviewLinks,
      });
    }

    if (vault.branchNotFound) {
      await ctx.runMutation(internal.vault.branches.releaseTreeRefresh, {
        vaultId: vault._id,
        startedAt: claim.startedAt,
        markRefreshed: true,
        updateLastTreeRefreshAt: false,
      });
      return {
        refreshed: false,
        reason: "branch_not_found",
      };
    }

    if (refreshPlan.shouldRefreshTreeData) {
      didRefreshTreeData = true;
      await ctx.runAction(internal.github.refreshBranchTree, {
        userId: args.userId,
        owner: args.owner,
        repo: args.repo,
        branch: vault.resolvedBranch,
      });
    }
  } catch (error) {
    refreshError = error;
    refreshFailure = describeRepositoryTreeRefreshFailure(error);
    console.error("Failed to refresh repository tree", {
      owner: args.owner,
      repo: args.repo,
      branch: requestedBranch,
      intent,
      didSyncMetadata,
      didRefreshTreeData,
      kind: refreshFailure.kind,
      message: refreshFailure.message,
      error,
    });
  }

  if (refreshFailure) {
    try {
      const releaseResult = await ctx.runMutation(internal.vault.branches.releaseTreeRefresh, {
        vaultId: vault._id,
        startedAt: claim.startedAt,
        markRefreshed: false,
        failureKind: refreshFailure.kind,
        failureMessage: refreshFailure.message,
        cooldownUntil: refreshFailure.cooldownUntil,
      });
      if (!releaseResult.released) {
        await ctx.runMutation(internal.vault.branches.recordTreeRefreshFailure, {
          vaultId: vault._id,
          startedAt: claim.startedAt,
          failureKind: refreshFailure.kind,
          failureMessage: refreshFailure.message,
          cooldownUntil: refreshFailure.cooldownUntil,
        });
      }
    } catch (releaseError) {
      console.error("Failed to persist repository tree refresh failure", {
        owner: args.owner,
        repo: args.repo,
        branch: requestedBranch,
        releaseError,
        refreshError,
      });
    }
    throw refreshError;
  }

  await ctx.runMutation(internal.vault.branches.releaseTreeRefresh, {
    vaultId: vault._id,
    startedAt: claim.startedAt,
    markRefreshed: true,
    updateLastTreeRefreshAt: didRefreshTreeData,
  });
  return { refreshed: true };
}

/**
 * Public branch refresh used by the file route.
 *
 * The browser identifies the vault, branch, and user-visible intent. The
 * action checks `userId + vaultId`, derives owner/repo from the vault, then
 * applies the current file-view branch refresh policy. URL owner/repo strings
 * and GitHub metadata-depth choices are not trusted from React.
 */
export const refreshRepositoryTree = action({
  access: "access_app_refresh",
  args: {
    vaultId: id("vaults"),
    branch: string(),
    intent: publicRefreshRepositoryIntent,
  },
  returns: refreshRepositoryTreeResult,
  handler: async (ctx, args): Promise<RefreshRepositoryTreeResult> => {
    const userId = ctx.viewer.userId;
    const vault = await ctx.runQuery(internal.vault.records.getByIdForUser, {
      userId,
      vaultId: args.vaultId,
    });
    if (!vault || vault.state !== "connected" || vault.deletion.state !== "not_deleting") {
      throw new Error("Vault not found.");
    }

    return await refreshRepositoryTreeForUserHelper(ctx, {
      scope: "branch",
      userId,
      owner: vault.owner,
      repo: vault.name,
      branch: args.branch,
      includeAheadBehind: true,
      includePullRequestLinks: true,
      includeCloudflarePreviewLinks: false,
      cloudflarePreviewBranchNames: [],
      intent: args.intent,
    });
  },
});

/**
 * Internal refresh entry point for backend-owned scheduling.
 *
 * The caller supplies the already-authorized user id. Queue rows store demand
 * only; the runner translates demand into these execution flags.
 */
export const refreshRepositoryTreeForUser = internalAction({
  args: {
    input: refreshRepositoryTreeForUserInput,
  },
  returns: refreshRepositoryTreeResult,
  handler: async (ctx, args): Promise<RefreshRepositoryTreeResult> => {
    return await refreshRepositoryTreeForUserHelper(ctx, args.input);
  },
});

/**
 * Syncs repository-level GitHub metadata into vault branch rows.
 *
 * Every enrichment flag is required on purpose. The caller must choose whether
 * this pass pays for ahead/behind counts, pull request metadata, preview-link
 * parsing, and commit timestamps instead of inheriting hidden defaults.
 */
export const syncRepositoryMetadata = internalAction({
  args: {
    userId: id("users"),
    owner: string(),
    repo: string(),
    includeAheadBehind: boolean(),
    includePullRequestLinks: boolean(),
    includeCloudflarePreviewLinks: boolean(),
    cloudflarePreviewBranchNames: array(string()),
    includeLastCommitTimestamps: boolean(),
    intent: refreshRepositoryIntent,
  },
  returns: nullValidator(),
  handler: async (ctx, args) => {
    const currentUser = await ctx.runQuery(internal.users.getById, {
      userId: args.userId,
    });

    if (!currentUser) {
      throw new Error("User not found");
    }
    const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: args.userId,
      kind: "github",
    });
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: `${args.owner}/${args.repo}`,
      userId: args.userId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    const octokit: Octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });
    const requestedCloudflarePreviewBranchNames = normalizeCloudflarePreviewBranchNames(
      args.cloudflarePreviewBranchNames,
    );

    const remoteBranches = await listRemoteBranches({
      octokit,
      owner: args.owner,
      repo: args.repo,
      includeAheadBehind: args.includeAheadBehind,
      includePullRequestLinks: args.includePullRequestLinks,
      includeLastCommitTimestamps: args.includeLastCommitTimestamps,
      intent: args.intent,
    });
    const effectiveSyncPlan = applyRepositoryTreeMetadataSyncBudget({
      shouldSyncMetadata: true,
      includeAheadBehind: args.includeAheadBehind,
      includePullRequestLinks: args.includePullRequestLinks,
      includeCloudflarePreviewLinks: args.includeCloudflarePreviewLinks,
      cloudflarePreviewBranchNames: requestedCloudflarePreviewBranchNames,
      includeLastCommitTimestamps: args.includeLastCommitTimestamps,
      intent: args.intent,
      remoteBranchCount: remoteBranches.length,
    });
    await ctx.runMutation(internal.vault.branches.syncVaultRemoteBranches, {
      vaultId: vault._id,
      syncedAt: Date.now(),
      branches: remoteBranches,
    });
    const cloudflarePreviewTargetBranches =
      requestedCloudflarePreviewBranchNames.length === 0
        ? remoteBranches
        : remoteBranches.filter((branch) =>
            requestedCloudflarePreviewBranchNames.includes(branch.name),
          );
    if (
      shouldSyncCloudflarePreviewLinks({
        includeCloudflarePreviewLinks: effectiveSyncPlan.includeCloudflarePreviewLinks,
        includePullRequestLinks: effectiveSyncPlan.includePullRequestLinks,
        branches: cloudflarePreviewTargetBranches,
      })
    ) {
      const cloudflarePreviews = await getCloudflarePreviewLinksByBranch({
        octokit,
        owner: args.owner,
        repo: args.repo,
        branches: cloudflarePreviewTargetBranches,
      });
      await ctx.runMutation(internal.vault.branches.syncVaultRemoteBranchCloudflarePreviews, {
        vaultId: vault._id,
        branches: cloudflarePreviews,
      });
    }

    return null;
  },
});

/**
 * Refreshes the cached tree for one concrete branch.
 *
 * No default-branch fallback lives here. Callers that mean "default branch"
 * must resolve that branch before calling so empty or missing branch state fails
 * at the boundary closest to the caller.
 */
export const refreshBranchTree = internalAction({
  args: {
    userId: id("users"),
    owner: string(),
    repo: string(),
    branch: string(),
  },
  returns: nullValidator(),
  handler: async (ctx, args) => {
    const currentUser = await ctx.runQuery(internal.users.getById, {
      userId: args.userId,
    });

    if (!currentUser) {
      throw new Error("User not found");
    }
    const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: args.userId,
      kind: "github",
    });
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const targetBranch = normalizeRequiredRepositoryBranch(args.branch);
    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: `${args.owner}/${args.repo}`,
      userId: args.userId,
      branch: targetBranch,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    const octokit: Octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });
    const resolvedBranch = targetBranch;

    const tree = await octokit.rest.git.getTree({
      owner: args.owner,
      repo: args.repo,
      tree_sha: toGitTreeRef(resolvedBranch),
      recursive: "1",
    });
    const latestCommits = await octokit.rest.repos.listCommits({
      owner: args.owner,
      repo: args.repo,
      sha: resolvedBranch,
      per_page: 1,
    });
    const latestCommitSha = latestCommits.data[0]?.sha;

    const cachedBranchTree = await ctx.runQuery(internal.vault.branches.getVaultBranchTree, {
      vaultId: vault._id,
      branch: resolvedBranch,
    });
    const { shouldUpdateBranchTree } = computeRepositoryTreeUpdatePlan({
      resolvedBranch,
      fetchedTreeSHA: tree.data.sha,
      fetchedCommitSHA: latestCommitSha,
      cachedBranchTree,
    });

    if (!shouldUpdateBranchTree) {
      return null;
    }

    await ctx.runMutation(internal.vault.branches.upsertVaultBranchTree, {
      vaultId: vault._id,
      branch: resolvedBranch,
      treeData: tree.data,
      commitSHA: latestCommitSha,
    });

    return null;
  },
});

/**
 * Internal follow-up after a repository write such as commit, pull, or PR open.
 *
 * `target` makes the scope explicit: repository-scoped callers refresh metadata
 * plus the vault's resolved branch; branch-scoped callers refresh one branch.
 */
export const updateRepositoryTree = internalAction({
  args: {
    userId: id("users"),
    owner: string(),
    repo: string(),
    target: updateRepositoryTreeTarget,
    includeAheadBehind: boolean(),
    includePullRequestLinks: boolean(),
    includeCloudflarePreviewLinks: boolean(),
    cloudflarePreviewBranchNames: array(string()),
  },
  returns: nullValidator(),
  handler: async (ctx, args) => {
    const targetBranch =
      args.target.scope === "branch"
        ? normalizeRequiredRepositoryBranch(args.target.branch)
        : undefined;
    const requestedCloudflarePreviewBranchNames = normalizeCloudflarePreviewBranchNames(
      args.cloudflarePreviewBranchNames,
    );
    // This path runs after app-owned repository writes. Use manual debounce
    // semantics while explicit caller flags choose metadata depth.
    const metadataSyncPlan = computeRepositoryTreeMetadataSyncPlan({
      targetBranch,
      includeAheadBehind: args.includeAheadBehind,
      includePullRequestLinks: args.includePullRequestLinks,
      includeCloudflarePreviewLinks: args.includeCloudflarePreviewLinks,
      cloudflarePreviewBranchNames: requestedCloudflarePreviewBranchNames,
      intent: "manual",
    });

    if (metadataSyncPlan.shouldSyncMetadata) {
      await ctx.runAction(internal.github.syncRepositoryMetadata, {
        userId: args.userId,
        owner: args.owner,
        repo: args.repo,
        includeAheadBehind: metadataSyncPlan.includeAheadBehind,
        includePullRequestLinks: metadataSyncPlan.includePullRequestLinks,
        includeCloudflarePreviewLinks: metadataSyncPlan.includeCloudflarePreviewLinks,
        cloudflarePreviewBranchNames: requestedCloudflarePreviewBranchNames,
        includeLastCommitTimestamps: metadataSyncPlan.includeLastCommitTimestamps,
        intent: "manual",
      });
    }
    let branchToRefresh = targetBranch;
    if (!branchToRefresh) {
      const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
        repositoryFullName: `${args.owner}/${args.repo}`,
        userId: args.userId,
      });
      if (!vault) {
        throw new Error("Vault not found");
      }
      branchToRefresh = normalizeRequiredRepositoryBranch(vault.resolvedBranch);
    }
    await ctx.runAction(internal.github.refreshBranchTree, {
      userId: args.userId,
      owner: args.owner,
      repo: args.repo,
      branch: branchToRefresh,
    });
    return null;
  },
});
