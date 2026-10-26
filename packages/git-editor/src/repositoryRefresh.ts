import type { Octokit } from "@octokit/rest";
import type { FunctionReference, GenericActionCtx, GenericDataModel } from "convex/server";
import { v, type Infer } from "convex/values";
import type { ComponentApi } from "./component/_generated/component.js";
import type { GitHubTreeData } from "./model.js";
import { getGitHubErrorStatus } from "./github.js";
import { TREE_REFRESH_DEBOUNCE_MS, TREE_REFRESH_FAILURE_COOLDOWN_MS } from "./treeRefresh.js";

const { boolean, literal, object, union } = v;
const GITHUB_RATE_LIMIT_FALLBACK_MS = 5 * 60 * 1000;
type HeaderValue = string | number | readonly string[] | undefined;
type HeaderMap = Record<string, HeaderValue>;
type TreeRefreshFailureDescriptor = {
  kind: "failed" | "rate_limited";
  message: string;
  cooldownUntil: number;
};
export const vExactRepositoryBranchRefreshResult = union(
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
export type ExactRepositoryBranchRefreshResult = Infer<typeof vExactRepositoryBranchRefreshResult>;
type ExactRepositoryBranchRead =
  | {
      kind: "ready";
      commitSha: string;
      treeData: GitHubTreeData;
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
  getTree: (treeSha: string) => Promise<GitHubTreeData>;
  confirmRepository: () => Promise<void>;
}): Promise<ExactRepositoryBranchRead> {
  let branch: { commitSha: string; treeSha: string };
  try {
    branch = await args.getBranch();
  } catch (error) {
    if (getGitHubErrorStatus(error) !== 404) {
      return { kind: "failed", error };
    }
    try {
      await args.confirmRepository();
      return { kind: "not_found" };
    } catch (repositoryError) {
      const repositoryStatus = getGitHubErrorStatus(repositoryError);
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
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const headers: HeaderMap = {};
  const entries: Array<[string, unknown]> = Object.entries(value);
  for (const [key, headerValue] of entries) {
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

function getErrorMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("message" in error)) return null;

  const message = error.message;
  return typeof message === "string" && message.length > 0 ? message : null;
}

function getErrorHeaders(error: unknown): HeaderMap | null {
  if (typeof error !== "object" || error === null || !("response" in error)) return null;

  const response = error.response;
  if (typeof response !== "object" || response === null || !("headers" in response)) return null;
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
  const status = getGitHubErrorStatus(error);
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

export async function refreshRepositoryBranch(
  ctx: Pick<GenericActionCtx<GenericDataModel>, "runQuery" | "runMutation">,
  component: ComponentApi,
  args: {
    repositoryId: string;
    repo: string;
    branch: string;
    intent: "passive" | "manual";
    resolveGitHubAccess: () => Promise<{ octokit: Octokit; owner: string }>;
    mutations: {
      claimRefresh: FunctionReference<
        "mutation",
        "internal",
        { repositoryId: string },
        | { claimed: true; startedAt: number }
        | { claimed: false; reason: "cooldown" | "in_progress" | "unavailable" }
      >;
      publishBranchTree: FunctionReference<
        "mutation",
        "internal",
        {
          repositoryId: string;
          branch: string;
          startedAt: number;
          treeData: GitHubTreeData;
          commitSHA: string;
        },
        { written: boolean }
      >;
      releaseRefresh: FunctionReference<
        "mutation",
        "internal",
        {
          repositoryId: string;
          startedAt: number;
          markRefreshed: boolean;
          failureKind?: "failed" | "rate_limited";
          failureMessage?: string;
          cooldownUntil?: number;
        },
        { released: boolean }
      >;
    };
  },
): Promise<ExactRepositoryBranchRefreshResult> {
  const branch = normalizeRequiredRepositoryBranch(args.branch);
  const cachedTree = await ctx.runQuery(component.branches.get, {
    repositoryId: args.repositoryId,
    branch,
  });
  if (
    args.intent === "passive" &&
    cachedTree &&
    Date.now() - cachedTree.lastTreeRefreshAt < TREE_REFRESH_DEBOUNCE_MS
  ) {
    return { kind: "ready", refreshed: false };
  }

  const claim:
    | { claimed: true; startedAt: number }
    | { claimed: false; reason: "cooldown" | "in_progress" | "unavailable" } =
    await ctx.runMutation(args.mutations.claimRefresh, {
      repositoryId: args.repositoryId,
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

  let octokit: Octokit;
  let owner: string;
  try {
    ({ octokit, owner } = await args.resolveGitHubAccess());
  } catch {
    await ctx.runMutation(args.mutations.releaseRefresh, {
      repositoryId: args.repositoryId,
      startedAt: claim.startedAt,
      markRefreshed: false,
      failureKind: "failed",
      failureMessage: "GitHub access is unavailable.",
    });
    return { kind: "unavailable" };
  }

  const read = await readExactRepositoryBranch({
    getBranch: async () => {
      const response = await octokit.rest.repos.getBranch({
        owner,
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
        owner,
        repo: args.repo,
        tree_sha: treeSha,
        recursive: "1",
      });
      return response.data;
    },
    confirmRepository: async () => {
      await octokit.rest.repos.get({
        owner,
        repo: args.repo,
      });
    },
  });

  if (read.kind === "ready") {
    const write = await ctx.runMutation(args.mutations.publishBranchTree, {
      repositoryId: args.repositoryId,
      branch,
      startedAt: claim.startedAt,
      treeData: read.treeData,
      commitSHA: read.commitSha,
    });
    if (!write.written) {
      return { kind: "deferred", reason: "in_progress" };
    }
    const release = await ctx.runMutation(args.mutations.releaseRefresh, {
      repositoryId: args.repositoryId,
      startedAt: claim.startedAt,
      markRefreshed: true,
    });
    if (!release.released) {
      return { kind: "deferred", reason: "in_progress" };
    }
    return { kind: "ready", refreshed: true };
  }

  if (read.kind === "not_found") {
    const release = await ctx.runMutation(args.mutations.releaseRefresh, {
      repositoryId: args.repositoryId,
      startedAt: claim.startedAt,
      markRefreshed: true,
    });
    if (!release.released) {
      return { kind: "deferred", reason: "in_progress" };
    }
    return { kind: "not_found" };
  }

  const failure = describeRepositoryTreeRefreshFailure(read.error);
  const release = await ctx.runMutation(args.mutations.releaseRefresh, {
    repositoryId: args.repositoryId,
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
    owner,
    repo: args.repo,
    branch,
    providerStatus: getGitHubErrorStatus(read.error),
    result: read.kind,
  });
  if (failure.kind === "rate_limited") {
    return { kind: "deferred", reason: "cooldown" };
  }
  if (
    read.kind === "unavailable" ||
    getGitHubErrorStatus(read.error) === 401 ||
    getGitHubErrorStatus(read.error) === 403
  ) {
    return { kind: "unavailable" };
  }
  return { kind: "failed" };
}
