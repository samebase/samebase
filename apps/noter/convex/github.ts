"use node";

import { action, internalAction } from "./_generated/server";
import { getUserId } from "./common";
import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { guessMime, withRetry } from "./gitOperationsActions";
import { isRecord } from "./jsonUtils";
import {
  parseCloudflarePreviewComment,
  type CloudflarePreviewCommentMetadata,
} from "./cloudflarePreviewComment";
import {
  getRepositoryMediaKind,
  isSvgRepositoryMediaPath,
} from "../shared/repositoryMedia";
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

type CachedRepositoryBlob = {
  storageId?: string | null;
  text?: string | null;
  mime?: string | undefined;
};

const GITHUB_REPOSITORY_DISCOVERY_URL =
  "https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member";
const MAX_GITHUB_REPOSITORY_PAGES = 100;

export function readGitHubNextPageUrl(
  linkHeader: string | null | undefined,
): string | null {
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

export function normalizeGitHubRepositoryListItem(
  value: unknown,
): GitHubRepositoryListItem | null {
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

export async function listGitHubRepositories(args: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<GitHubRepositoryList> {
  const repositoriesById = new Map<number, GitHubRepositoryListItem>();
  const seenPageUrls = new Set<string>();
  const fetchImpl = args.fetchImpl ?? fetch;
  let nextPageUrl: string | null = GITHUB_REPOSITORY_DISCOVERY_URL;

  while (nextPageUrl) {
    if (seenPageUrls.has(nextPageUrl)) {
      throw new Error("GitHub repository pagination loop detected");
    }
    if (seenPageUrls.size >= MAX_GITHUB_REPOSITORY_PAGES) {
      throw new Error(
        `GitHub repository pagination exceeded ${MAX_GITHUB_REPOSITORY_PAGES} pages`,
      );
    }
    seenPageUrls.add(nextPageUrl);

    const response = await fetchImpl(nextPageUrl, {
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "noter-App",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`,
      );
    }

    const reposRaw: unknown = await response.json();
    if (!Array.isArray(reposRaw)) {
      throw new Error("Unexpected GitHub API response format");
    }

    for (const repo of reposRaw) {
      const normalized = normalizeGitHubRepositoryListItem(repo);
      if (normalized === null) {
        throw new Error("Unexpected GitHub repository payload");
      }
      repositoriesById.set(normalized.id, normalized);
    }

    nextPageUrl = readGitHubNextPageUrl(response.headers.get("link"));
  }

  return Array.from(repositoriesById.values());
}

// List the current user's GitHub repositories
export const listRepositories = action({
  args: {},
  returns: array(githubRepositoryListItem),
  handler: async (ctx): Promise<GitHubRepositoryList> => {
    const userId = await getUserId(ctx);
    const githubConnection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId,
        kind: "github",
      },
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
const PAGE_LOAD_REFRESH_DEBOUNCE_MS = 10 * 1000;

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
);

type RepositoryMediaAsset = Infer<typeof repositoryMediaAssetResult>;
const CLOUDFLARE_PREVIEW_COMMENT_CONCURRENCY = 5;
const CLOUDFLARE_PREVIEW_COMMENT_AUTHORS = new Set([
  "cloudflare-workers-and-pages[bot]",
]);

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
  pullRequestState: "resolved" | "preserve";
  isDefault: boolean;
  isProtected: boolean;
}

type PullRequestLabelSummary = Extract<
  StoredPullRequestLabel,
  { name: string }
>;

interface CachedBranchTreeSnapshot {
  treeSHA: string;
  commitSHA?: string;
}

interface RemoteBranchCloudflarePreviewSync {
  name: string;
  previewState: "resolved" | "clear" | "preserve";
  cloudflareBranchPreviewUrl?: string;
  cloudflarePreviewUrl?: string;
  cloudflarePreviewCommitSha?: string;
  cloudflarePreviewStatus?: string;
  cloudflarePreviewLogsUrl?: string;
  cloudflarePreviewCommentCreatedAt?: number;
}

interface RepositoryTreeUpdatePlan {
  shouldUpdateBranchTree: boolean;
  shouldUpdateLegacyTree: boolean;
  shouldUpdateLegacyCommit: boolean;
}

export function computeRepositoryTreeUpdatePlan(args: {
  resolvedBranch: string;
  defaultBranch?: string;
  fetchedTreeSHA: string;
  fetchedCommitSHA?: string;
  cachedBranchTree: CachedBranchTreeSnapshot | null;
  legacyTreeSHA: string;
  legacyCommitSHA?: string;
}): RepositoryTreeUpdatePlan {
  const shouldUpdateBranchTree =
    !args.cachedBranchTree ||
    args.fetchedTreeSHA !== args.cachedBranchTree.treeSHA ||
    args.fetchedCommitSHA !== args.cachedBranchTree.commitSHA;
  const isDefaultBranch =
    typeof args.defaultBranch === "string" &&
    args.resolvedBranch === args.defaultBranch;
  const shouldUpdateLegacyTree =
    isDefaultBranch && args.fetchedTreeSHA !== args.legacyTreeSHA;
  const shouldUpdateLegacyCommit =
    isDefaultBranch &&
    typeof args.fetchedCommitSHA === "string" &&
    args.fetchedCommitSHA !== args.legacyCommitSHA;

  return {
    shouldUpdateBranchTree,
    shouldUpdateLegacyTree,
    shouldUpdateLegacyCommit,
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
export function readPullRequestLabels(
  labels: unknown,
): PullRequestLabelSummary[] {
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
        isRecord(label) &&
        typeof label.color === "string" &&
        label.color.length > 0
          ? label.color
          : undefined,
    });
  }

  return labelNames;
}

function isAllowedCloudflarePreviewCommentAuthor(
  login: unknown,
): login is string {
  return (
    typeof login === "string" &&
    CLOUDFLARE_PREVIEW_COMMENT_AUTHORS.has(login.toLowerCase())
  );
}

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
          cloudflarePreviewCommentCreatedAt: parseGitTimestamp(
            comment.created_at,
          ),
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
    const batch = args.branches.slice(
      index,
      index + CLOUDFLARE_PREVIEW_COMMENT_CONCURRENCY,
    );
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
          const previewResult =
            await getLatestPullRequestCloudflarePreviewComment({
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
            cloudflarePreviewUrl: preview.previewUrl,
            cloudflarePreviewCommitSha: preview.previewCommitSha,
            cloudflarePreviewStatus: preview.previewStatus,
            cloudflarePreviewLogsUrl: preview.previewLogsUrl,
            cloudflarePreviewCommentCreatedAt:
              preview.cloudflarePreviewCommentCreatedAt,
          };
        } catch (error: unknown) {
          console.warn(
            "listPullRequestCloudflarePreviewComment failed",
            JSON.stringify({
              owner: args.owner,
              repo: args.repo,
              branchName: branch.name,
              pullRequestNumber: branch.pullRequestNumber,
              error:
                error instanceof Error
                  ? error.message
                  : String(error ?? "unknown"),
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
    args.includeCloudflarePreviewLinks &&
    args.includePullRequestLinks &&
    args.branches.every((branch) => branch.pullRequestState === "resolved")
  );
}

function readPullRequestHeadRepositoryFullName(
  pullRequest: unknown,
): string | undefined {
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
  return args.branchNames.some(
    (branchName) => branchName === args.defaultBranch,
  )
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
  for (
    let startIndex = 0;
    startIndex < branchNamesToCompare.length;
    startIndex += chunkSize
  ) {
    const chunk = branchNamesToCompare.slice(
      startIndex,
      startIndex + chunkSize,
    );
    const chunkResults = await Promise.all(
      chunk.map(async (branchName) => {
        try {
          const response =
            await args.octokit.rest.repos.compareCommitsWithBasehead({
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
              error:
                error instanceof Error
                  ? error.message
                  : String(error ?? "unknown"),
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

    const pullRequestHeadRepo =
      readPullRequestHeadRepositoryFullName(pullRequest);
    if (
      typeof pullRequestHeadRepo !== "string" ||
      pullRequestHeadRepo.toLowerCase() !== normalizedRepositoryFullName
    ) {
      continue;
    }

    const updatedAtRaw =
      typeof pullRequest.updated_at === "string"
        ? pullRequest.updated_at
        : pullRequest.created_at;
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
        error:
          error instanceof Error ? error.message : String(error ?? "unknown"),
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
      const headCommitSha =
        typeof branch.commit.sha === "string" ? branch.commit.sha : "";
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
  const baseBranch = resolveAheadBehindBaseBranch({
    branchNames,
    defaultBranch,
  });
  const aheadBehindByBranchPromise = args.includeAheadBehind
    ? getAheadBehindByBranch({
        octokit: args.octokit,
        owner: args.owner,
        repo: args.repo,
        baseBranch,
        branchNames,
      })
    : Promise.resolve(
        new Map(
          branchNames.map((branchName) => [
            branchName,
            { state: "preserve" as const },
          ]),
        ),
      );
  const pullRequestsByBranchPromise = args.includePullRequestLinks
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
            }
          | undefined
        >(),
      });

  const [timestampsBySha, aheadBehindByBranch, pullRequestsByBranch] =
    await Promise.all([
      getHeadCommitTimestamps({
        octokit: args.octokit,
        owner: args.owner,
        repo: args.repo,
        shas: branches.map((branch) => branch.headCommitSha),
      }),
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
      aheadBy:
        aheadBehind.state === "resolved" ? aheadBehind.aheadBy : undefined,
      behindBy:
        aheadBehind.state === "resolved" ? aheadBehind.behindBy : undefined,
      aheadBehindState: aheadBehind.state,
      pullRequestUrl: pullRequest?.url,
      pullRequestNumber: pullRequest?.number,
      pullRequestLabels: pullRequest?.labels,
      pullRequestTitle: pullRequest?.title,
      pullRequestState: pullRequestsByBranch.state,
    };
  });
}

function buildDataUrl(mimeType: string, content: Buffer): string {
  return `data:${mimeType};base64,${content.toString("base64")}`;
}

function readStoredMimeType(
  filePath: string,
  blobMime: string | undefined,
): string {
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
  mediaKind: "image",
  fileName: string,
): Promise<RepositoryMediaAsset | null> {
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

  if (
    typeof cachedBlob?.text === "string" &&
    isSvgRepositoryMediaPath(filePath)
  ) {
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

function getRepositoryMediaErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Preview unavailable.";
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

export const getRepositoryFileContent = action({
  args: {
    repositoryFullName: string(),
    filePath: string(),
    branch: optional(string()),
  },
  returns: repositoryFileContentResult,
  handler: async (ctx, args): Promise<RepositoryFileContent> => {
    const requestedBranch = args.branch?.trim() || undefined;
    const userId = await getUserId(ctx);

    const currentUser = await ctx.runQuery(internal.users.getById, {
      userId,
    });

    if (!currentUser) {
      throw new Error("User not found");
    }

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    if (!requestedBranch) {
      const targetFile = vault.treeData.tree.find(
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
      internal.providerConnections.getByUserAndKind,
      {
        userId,
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
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
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
  args: {
    repositoryFullName: string(),
    filePath: string(),
    branch: optional(string()),
  },
  returns: repositoryMediaAssetResult,
  handler: async (ctx, args): Promise<RepositoryMediaAsset> => {
    const mediaKind = getRepositoryMediaKind(args.filePath);
    if (mediaKind === null) {
      return { found: false, reason: "missing" };
    }

    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    const requestedBranch = args.branch?.trim() || undefined;
    const fileName = getRepositoryMediaFileName(args.filePath);

    if (!requestedBranch) {
      const targetFile = vault.treeData.tree.find(
        (item: { path: string; type: string; sha?: string }) =>
          item.path === args.filePath && item.type === "blob",
      );

      if (!targetFile?.sha) {
        return { found: false, reason: "missing" };
      }

      const cachedBlob = await ctx.runQuery(
        internal.gitOperations.getBlobBySha,
        {
          sha: targetFile.sha,
        },
      );
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
      internal.providerConnections.getByUserAndKind,
      {
        userId,
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
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        path: args.filePath,
        ref: requestedBranch,
      });

      if (Array.isArray(file.data) || file.data.type !== "file") {
        return { found: false, reason: "missing" };
      }

      if (typeof file.data.sha === "string") {
        const cachedBlob = await ctx.runQuery(
          internal.gitOperations.getBlobBySha,
          {
            sha: file.data.sha,
          },
        );
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

      if (
        typeof file.data.content !== "string" ||
        file.data.content.length === 0
      ) {
        return {
          found: false,
          reason: "unavailable",
          message: "Preview unavailable for this file.",
        };
      }

      const mimeType = guessMime(args.filePath);
      const content = file.data.content.replace(/\n/g, "");
      const buffer = Buffer.from(content, "base64");
      const storageId = await withRetry(() =>
        ctx.storage.store(new Blob([buffer], { type: mimeType })),
      );

      if (typeof file.data.sha === "string") {
        await ctx.runMutation(internal.gitOperations.saveFileBlob, {
          vaultId: vault._id,
          sha: file.data.sha,
          size: buffer.byteLength,
          mime: mimeType,
          text: undefined,
          storageId,
          ext: getRepositoryMediaExtension(args.filePath),
          debugFilePath: args.filePath,
        });
      }

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
        return {
          found: false,
          reason: "unavailable",
          message: "Preview unavailable for files larger than 1 MB.",
        };
      }

      throw error;
    }
  },
});

// Public action to refresh repository tree (called from frontend on vault open)
export const refreshRepositoryTree = action({
  args: {
    owner: string(),
    repo: string(),
    branch: optional(string()),
    includeAheadBehind: optional(boolean()),
    includePullRequestLinks: optional(boolean()),
    includeCloudflarePreviewLinks: optional(boolean()),
    trigger: optional(union(literal("focus"), literal("page_load"))),
  },
  returns: nullValidator(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const requestedBranch =
      typeof args.branch === "string" && args.branch.trim().length > 0
        ? args.branch.trim()
        : undefined;

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: `${args.owner}/${args.repo}`,
      userId,
    });
    if (!vault) return null;

    if (requestedBranch) {
      await ctx.runAction(internal.github.updateRepositoryTree, {
        userId,
        owner: args.owner,
        repo: args.repo,
        branch: requestedBranch,
        includeAheadBehind: args.includeAheadBehind === true,
        includePullRequestLinks: args.includePullRequestLinks === true,
        includeCloudflarePreviewLinks: false,
      });
      return null;
    }

    const debounceMs =
      args.trigger === "page_load" ? PAGE_LOAD_REFRESH_DEBOUNCE_MS : undefined;

    // Atomically claim the refresh lock; skip if debounced or already running
    const { claimed } = await ctx.runMutation(internal.vault.claimTreeRefresh, {
      vaultId: vault._id,
      debounceMs,
    });
    if (!claimed) return null;

    let markRefreshed = false;
    try {
      await ctx.runAction(internal.github.updateRepositoryTree, {
        userId,
        owner: args.owner,
        repo: args.repo,
        includeAheadBehind: true,
        includePullRequestLinks: true,
        includeCloudflarePreviewLinks:
          args.includeCloudflarePreviewLinks === true,
      });
      markRefreshed = true;
    } finally {
      await ctx.runMutation(internal.vault.releaseTreeRefresh, {
        vaultId: vault._id,
        markRefreshed,
      });
    }

    return null;
  },
});

// Get repository tree structure
export const updateRepositoryTree = internalAction({
  args: {
    userId: id("users"),
    owner: string(),
    repo: string(),
    branch: optional(string()),
    includeAheadBehind: optional(boolean()),
    includePullRequestLinks: optional(boolean()),
    includeCloudflarePreviewLinks: optional(boolean()),
  },
  returns: nullValidator(),
  handler: async (ctx, args) => {
    console.log("updateRepositoryTree", args);
    const currentUser = await ctx.runQuery(internal.users.getById, {
      userId: args.userId,
    });

    if (!currentUser) {
      throw new Error("User not found");
    }
    const githubConnection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId: args.userId,
        kind: "github",
      },
    );
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: `${args.owner}/${args.repo}`,
      userId: args.userId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    const octokit: Octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });

    const targetBranch =
      typeof args.branch === "string" && args.branch.trim().length > 0
        ? args.branch.trim()
        : undefined;

    const remoteBranches = await listRemoteBranches({
      octokit,
      owner: args.owner,
      repo: args.repo,
      includeAheadBehind: args.includeAheadBehind === true,
      includePullRequestLinks: args.includePullRequestLinks === true,
    });
    await ctx.runMutation(internal.vault.syncVaultRemoteBranches, {
      vaultId: vault._id,
      syncedAt: Date.now(),
      branches: remoteBranches,
    });
    if (
      shouldSyncCloudflarePreviewLinks({
        includeCloudflarePreviewLinks:
          args.includeCloudflarePreviewLinks === true,
        includePullRequestLinks: args.includePullRequestLinks === true,
        branches: remoteBranches,
      })
    ) {
      const cloudflarePreviews = await getCloudflarePreviewLinksByBranch({
        octokit,
        owner: args.owner,
        repo: args.repo,
        branches: remoteBranches,
      });
      await ctx.runMutation(
        internal.vault.syncVaultRemoteBranchCloudflarePreviews,
        {
          vaultId: vault._id,
          branches: cloudflarePreviews,
        },
      );
    }
    const defaultBranch = remoteBranches.find(
      (branch) => branch.isDefault,
    )?.name;
    const resolvedBranch = targetBranch ?? defaultBranch ?? "main";

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

    const cachedBranchTree = await ctx.runQuery(
      internal.vault.getVaultBranchTree,
      {
        vaultId: vault._id,
        branch: resolvedBranch,
      },
    );
    const {
      shouldUpdateBranchTree,
      shouldUpdateLegacyTree,
      shouldUpdateLegacyCommit,
    } = computeRepositoryTreeUpdatePlan({
      resolvedBranch,
      defaultBranch,
      fetchedTreeSHA: tree.data.sha,
      fetchedCommitSHA: latestCommitSha,
      cachedBranchTree,
      legacyTreeSHA: vault.treeData.sha,
      legacyCommitSHA: vault.commitSHA,
    });

    if (
      !shouldUpdateBranchTree &&
      !shouldUpdateLegacyTree &&
      !shouldUpdateLegacyCommit
    ) {
      return null;
    }

    if (shouldUpdateBranchTree) {
      await ctx.runMutation(internal.vault.upsertVaultBranchTree, {
        vaultId: vault._id,
        branch: resolvedBranch,
        treeData: tree.data,
        commitSHA: latestCommitSha,
      });
    }

    if (shouldUpdateLegacyTree || shouldUpdateLegacyCommit) {
      await ctx.runMutation(internal.vault.updateVaultTree, {
        vaultId: vault._id,
        treeData: tree.data,
        commitSHA: latestCommitSha,
      });
    }

    return null;
  },
});
