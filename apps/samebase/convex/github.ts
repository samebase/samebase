"use node";

import { internalAction, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { action } from "./functions";
import { guessMime, withRetry } from "./gitOperationsActions";
import { isRecord } from "./jsonUtils";
import {
  getRepositoryMediaKind,
  type RepositoryMediaKind,
  isSvgRepositoryMediaPath,
} from "../shared/repositoryMedia";
import { TREE_REFRESH_DEBOUNCE_MS, TREE_REFRESH_FAILURE_COOLDOWN_MS } from "../shared/treeRefresh";
import type { GithubTreeData } from "./vault/model";

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
const exactRepositoryBranchRefreshResult = union(
  object({
    kind: literal("ready"),
    refreshed: boolean(),
  }),
  object({
    kind: literal("not_found"),
  }),
  object({
    kind: literal("deferred"),
    reason: union(literal("cooldown"), literal("in_progress")),
  }),
  object({
    kind: literal("unavailable"),
  }),
  object({
    kind: literal("failed"),
  }),
);
type ExactRepositoryBranchRefreshResult = Infer<typeof exactRepositoryBranchRefreshResult>;

const GITHUB_REPOSITORY_DISCOVERY_AFFILIATION = "owner,collaborator,organization_member";
const GITHUB_REPOSITORY_PREVIEW_PAGE_SIZE = 10;
const GITHUB_REPOSITORY_DISCOVERY_PAGE_SIZE = 100;
const MAX_GITHUB_REPOSITORY_PAGES = 100;
const GITHUB_RATE_LIMIT_FALLBACK_MS = 5 * 60 * 1000;

/** An omitted branch means default; a provided branch always remains exact. */
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

type ExactRepositoryBranchRead =
  | {
      kind: "ready";
      commitSha: string;
      treeData: GithubTreeData;
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "unavailable";
      error: unknown;
    }
  | {
      kind: "failed";
      error: unknown;
    };

/**
 * Reads one branch generation without observing the repository branch list.
 * The branch response fixes the commit and tree identity before the immutable
 * tree is fetched, so a concurrent push cannot mix two generations.
 */
export async function readExactRepositoryBranch(args: {
  getBranch: () => Promise<{ commitSha: string; treeSha: string }>;
  getTree: (treeSha: string) => Promise<GithubTreeData>;
  confirmRepository: () => Promise<void>;
}): Promise<ExactRepositoryBranchRead> {
  let branch: { commitSha: string; treeSha: string };
  try {
    branch = await args.getBranch();
  } catch (error) {
    if (getErrorStatus(error) !== 404) {
      return { kind: "failed", error };
    }
    try {
      await args.confirmRepository();
      return { kind: "not_found" };
    } catch (repositoryError) {
      const repositoryStatus = getErrorStatus(repositoryError);
      return repositoryStatus === 401 || repositoryStatus === 403 || repositoryStatus === 404
        ? { kind: "unavailable", error: repositoryError }
        : { kind: "failed", error: repositoryError };
    }
  }

  try {
    const treeData = await args.getTree(branch.treeSha);
    if (treeData.truncated) {
      return {
        kind: "failed",
        error: new Error("GitHub returned an incomplete recursive repository tree."),
      };
    }

    return {
      kind: "ready",
      commitSha: branch.commitSha,
      treeData,
    };
  } catch (error) {
    return { kind: "failed", error };
  }
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
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.getOrganizationIdForUser,
      {
        userId: ctx.viewer.userId,
      },
    );
    const githubConnection = await ctx.runQuery(
      internal.providerConnections.loadCurrentConnectedForOrganization,
      { organizationId, kind: "github" },
    );
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
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.getOrganizationIdForUser,
      {
        userId: ctx.viewer.userId,
      },
    );
    const githubConnection = await ctx.runQuery(
      internal.providerConnections.loadCurrentConnectedForOrganization,
      { organizationId, kind: "github" },
    );
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
  kind: "text" | "binary";
  storageId?: string | null;
  stagedBlobSha?: string | null;
  mime?: string;
  size?: number;
  content: string;
};
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

  const stagedKind = args.stagedFile.kind;
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

    const githubConnection = await ctx.runQuery(
      internal.providerConnections.loadConnectedByIdForOrganization,
      {
        organizationId: vault.organizationId,
        providerConnectionId: vault.githubProviderConnectionId,
        kind: "github",
      },
    );
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
          stagedFile.kind === "binary"
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

    const githubConnection = await ctx.runQuery(
      internal.providerConnections.loadConnectedByIdForOrganization,
      {
        organizationId: vault.organizationId,
        providerConnectionId: vault.githubProviderConnectionId,
        kind: "github",
      },
    );
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

/** Reads and caches one exact branch for the file route or an app-owned repository write. */
async function refreshExactRepositoryBranchForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    organizationId: Id<"organizations">;
    githubProviderConnectionId: Id<"providerConnections">;
    owner: string;
    repo: string;
    branch: string;
    intent: "passive" | "manual";
  },
): Promise<ExactRepositoryBranchRefreshResult> {
  const branch = normalizeRequiredRepositoryBranch(args.branch);
  const cachedTree = await ctx.runQuery(internal.vault.branches.getVaultBranchTree, {
    vaultId: args.vaultId,
    branch,
  });
  if (
    args.intent === "passive" &&
    cachedTree &&
    Date.now() - cachedTree.lastTreeRefreshAt < TREE_REFRESH_DEBOUNCE_MS
  ) {
    return { kind: "ready", refreshed: false };
  }

  const githubConnection = await ctx.runQuery(
    internal.providerConnections.loadConnectedByIdForOrganization,
    {
      organizationId: args.organizationId,
      providerConnectionId: args.githubProviderConnectionId,
      kind: "github",
    },
  );
  if (githubConnection?.kind !== "github") {
    return { kind: "unavailable" };
  }

  const claim = await ctx.runMutation(internal.vault.branches.claimTreeRefresh, {
    vaultId: args.vaultId,
    userId: args.userId,
  });
  if (!claim.claimed) {
    switch (claim.reason) {
      case "cooldown":
      case "in_progress":
        return { kind: "deferred", reason: claim.reason };
      case "unavailable":
        return { kind: "failed" };
      default:
        claim.reason satisfies never;
        return { kind: "failed" };
    }
  }

  const octokit = new Octokit({
    auth: githubConnection.auth.credential,
  });
  const read = await readExactRepositoryBranch({
    getBranch: async () => {
      const response = await octokit.rest.repos.getBranch({
        owner: args.owner,
        repo: args.repo,
        branch,
      });
      return {
        commitSha: response.data.commit.sha,
        treeSha: response.data.commit.commit.tree.sha,
      };
    },
    getTree: async (treeSha) => {
      const response = await octokit.rest.git.getTree({
        owner: args.owner,
        repo: args.repo,
        tree_sha: treeSha,
        recursive: "1",
      });
      return response.data;
    },
    confirmRepository: async () => {
      await octokit.rest.repos.get({
        owner: args.owner,
        repo: args.repo,
      });
    },
  });

  if (read.kind === "ready") {
    const write = await ctx.runMutation(internal.vault.branches.upsertClaimedVaultBranchTree, {
      vaultId: args.vaultId,
      branch,
      startedAt: claim.startedAt,
      treeData: read.treeData,
      commitSHA: read.commitSha,
    });
    if (!write.written) {
      return { kind: "deferred", reason: "in_progress" };
    }
    const release = await ctx.runMutation(internal.vault.branches.releaseTreeRefresh, {
      vaultId: args.vaultId,
      startedAt: claim.startedAt,
      markRefreshed: true,
    });
    if (!release.released) {
      return { kind: "deferred", reason: "in_progress" };
    }
    return { kind: "ready", refreshed: true };
  }

  if (read.kind === "not_found") {
    const release = await ctx.runMutation(internal.vault.branches.releaseTreeRefresh, {
      vaultId: args.vaultId,
      startedAt: claim.startedAt,
      markRefreshed: true,
    });
    if (!release.released) {
      return { kind: "deferred", reason: "in_progress" };
    }
    return { kind: "not_found" };
  }

  const failure = describeRepositoryTreeRefreshFailure(read.error);
  const release = await ctx.runMutation(internal.vault.branches.releaseTreeRefresh, {
    vaultId: args.vaultId,
    startedAt: claim.startedAt,
    markRefreshed: false,
    failureKind: failure.kind,
    failureMessage: failure.message,
    cooldownUntil: failure.cooldownUntil,
  });
  if (!release.released) {
    return { kind: "deferred", reason: "in_progress" };
  }
  console.error("Failed to hydrate exact repository branch", {
    owner: args.owner,
    repo: args.repo,
    branch,
    providerStatus: getErrorStatus(read.error),
    result: read.kind,
  });
  if (failure.kind === "rate_limited") {
    return { kind: "deferred", reason: "cooldown" };
  }
  if (
    read.kind === "unavailable" ||
    getErrorStatus(read.error) === 401 ||
    getErrorStatus(read.error) === 403
  ) {
    return { kind: "unavailable" };
  }
  return { kind: "failed" };
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
  returns: exactRepositoryBranchRefreshResult,
  handler: async (ctx, args): Promise<ExactRepositoryBranchRefreshResult> => {
    const userId = ctx.viewer.userId;
    const vault = await ctx.runQuery(internal.vault.records.getByIdForUser, {
      userId,
      vaultId: args.vaultId,
    });
    if (!vault || vault.state !== "connected" || vault.deletion.state !== "not_deleting") {
      throw new Error("Vault not found.");
    }

    return await refreshExactRepositoryBranchForUser(ctx, {
      userId,
      vaultId: args.vaultId,
      organizationId: vault.organizationId,
      githubProviderConnectionId: vault.githubProviderConnectionId,
      owner: vault.owner,
      repo: vault.name,
      branch: args.branch,
      intent: args.intent,
    });
  },
});

/** Refreshes one exact branch after an app-owned repository write. */
export const updateRepositoryTree = internalAction({
  args: {
    userId: id("users"),
    owner: string(),
    repo: string(),
    branch: string(),
  },
  returns: nullValidator(),
  handler: async (ctx, args) => {
    const branch = normalizeRequiredRepositoryBranch(args.branch);
    const vault = await ctx.runQuery(internal.vault.records.getByRepositoryFullName, {
      repositoryFullName: `${args.owner}/${args.repo}`,
      userId: args.userId,
      branch,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }
    const refresh = await refreshExactRepositoryBranchForUser(ctx, {
      userId: args.userId,
      vaultId: vault._id,
      organizationId: vault.organizationId,
      githubProviderConnectionId: vault.githubProviderConnectionId,
      owner: args.owner,
      repo: args.repo,
      branch,
      intent: "manual",
    });
    if (refresh.kind !== "ready") {
      throw new Error(`Repository branch refresh did not complete: ${refresh.kind}.`);
    }
    return null;
  },
});
