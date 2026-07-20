import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalQuery } from "./_generated/server";
import { action } from "./functions";
import { GitHubGraphqlBudgetError, GitHubGraphqlRateLimitError } from "./githubGraphql";
import {
  fetchGitHubPullRequestPage,
  GitHubRepositoryUnavailableError,
  type GitHubPullRequestPage,
} from "./githubPullRequests";
import {
  summarizeChecks,
  vCheckSummary,
  vPullRequestHeadIdentity,
} from "./repositoryPullRequestObservations";
import { isLiveConnectedVault } from "./vault/state";

const { array, boolean, id, literal, null: vNull, number, object, string, union } = v;

const REPOSITORY_OBSERVATION_FRESH_MS = 60_000;
const REPOSITORY_OBSERVATION_BUDGET_RETRY_MS = 30_000;

const vRepositoryObservationContext = union(
  object({ state: literal("repository_unavailable") }),
  object({
    state: literal("ready"),
    owner: string(),
    name: string(),
    repositoryDatabaseId: string(),
  }),
);
export type RepositoryObservationContext = Infer<typeof vRepositoryObservationContext>;

const vRepositoryPullRequestLabel = object({
  name: string(),
  color: string(),
});

const vRepositoryPullRequestHeadRepository = union(
  object({ state: literal("unavailable") }),
  object({
    state: literal("available"),
    nodeId: string(),
    nameWithOwner: string(),
    owner: string(),
  }),
);

const vRepositoryPullRequestItem = object({
  nodeId: string(),
  number: number(),
  title: string(),
  url: string(),
  isDraft: boolean(),
  isCrossRepository: boolean(),
  additions: number(),
  deletions: number(),
  changedFiles: number(),
  updatedAt: number(),
  baseRefName: string(),
  headRefName: string(),
  headRepository: vRepositoryPullRequestHeadRepository,
  labels: array(vRepositoryPullRequestLabel),
  head: vPullRequestHeadIdentity,
  checks: vCheckSummary,
});

const vRepositoryDefaultBranch = union(
  object({ state: literal("absent") }),
  object({
    state: literal("ready"),
    name: string(),
    headCommitNodeId: string(),
    headOid: string(),
    checks: vCheckSummary,
  }),
);

const vRepositoryPullRequestContinuation = union(
  object({ kind: literal("complete") }),
  object({ kind: literal("next_page"), cursor: string() }),
  object({
    kind: literal("scan_guardrail"),
    cursor: string(),
    scannedProviderPages: number(),
  }),
);

const vRepositoryPullRequestPage = object({
  state: literal("current"),
  observedAt: number(),
  freshUntil: number(),
  repositoryNodeId: string(),
  repositoryDatabaseId: string(),
  repositoryFullName: string(),
  defaultBranch: vRepositoryDefaultBranch,
  providerOpenPullRequestCount: number(),
  scannedPullRequestCount: number(),
  providerSequenceDrifted: boolean(),
  pullRequests: array(vRepositoryPullRequestItem),
  continuation: vRepositoryPullRequestContinuation,
  requestUsage: object({
    requestCount: number(),
    cost: number(),
    limit: number(),
    remaining: number(),
    resetAt: number(),
  }),
});
export type RepositoryPullRequestPage = Infer<typeof vRepositoryPullRequestPage>;

const vRepositoryPullRequestProblem = union(
  object({
    state: literal("budget_deferred"),
    reason: union(literal("rate_limit"), literal("request_budget")),
    retryAt: number(),
  }),
  object({
    state: literal("provider_unavailable"),
    reason: union(literal("github_connection_unavailable"), literal("repository_unavailable")),
  }),
  object({
    state: literal("provider_failure"),
    reason: union(literal("request_failed"), literal("invalid_response")),
  }),
);
export type RepositoryPullRequestProblem = Infer<typeof vRepositoryPullRequestProblem>;

export const vRepositoryPullRequestPageResult = union(
  vRepositoryPullRequestPage,
  vRepositoryPullRequestProblem,
);
export type RepositoryPullRequestPageResult = Infer<typeof vRepositoryPullRequestPageResult>;

export const readRepositoryObservationContext = internalQuery({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
  },
  returns: vRepositoryObservationContext,
  handler: async (ctx, args): Promise<RepositoryObservationContext> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== args.userId) {
      throw new Error("Vault not found");
    }
    if (!isLiveConnectedVault(vault)) {
      return { state: "repository_unavailable" };
    }

    return {
      state: "ready",
      owner: vault.owner,
      name: vault.name,
      repositoryDatabaseId: vault.ghRepoId,
    };
  },
});

function observedTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error("GitHub returned an invalid pull request timestamp.");
  }
  return timestamp;
}

export function buildRepositoryPullRequestPage(args: {
  observedAt: number;
  page: GitHubPullRequestPage;
}): RepositoryPullRequestPage {
  return {
    state: "current",
    observedAt: args.observedAt,
    freshUntil: args.observedAt + REPOSITORY_OBSERVATION_FRESH_MS,
    repositoryNodeId: args.page.repositoryNodeId,
    repositoryDatabaseId: args.page.repositoryDatabaseId,
    repositoryFullName: args.page.repositoryFullName,
    defaultBranch:
      args.page.defaultBranch === null
        ? { state: "absent" }
        : {
            state: "ready",
            name: args.page.defaultBranch.name,
            headCommitNodeId: args.page.defaultBranch.headCommit.nodeId,
            headOid: args.page.defaultBranch.headCommit.sha,
            checks: summarizeChecks(args.page.defaultBranch.headCommit.checks),
          },
    providerOpenPullRequestCount: args.page.providerOpenPullRequestCount,
    scannedPullRequestCount: args.page.scannedPullRequestCount,
    providerSequenceDrifted: args.page.providerSequenceDrifted,
    pullRequests: args.page.pullRequests.map((pullRequest) => ({
      nodeId: pullRequest.nodeId,
      number: pullRequest.number,
      title: pullRequest.title,
      url: pullRequest.url,
      isDraft: pullRequest.isDraft,
      isCrossRepository: pullRequest.isCrossRepository,
      additions: pullRequest.additions,
      deletions: pullRequest.deletions,
      changedFiles: pullRequest.changedFiles,
      updatedAt: observedTimestamp(pullRequest.updatedAt),
      baseRefName: pullRequest.baseRefName,
      headRefName: pullRequest.headRefName,
      headRepository:
        pullRequest.headRepository === null
          ? { state: "unavailable" }
          : {
              state: "available",
              nodeId: pullRequest.headRepository.nodeId,
              nameWithOwner: pullRequest.headRepository.nameWithOwner,
              owner: pullRequest.headRepository.owner,
            },
      labels: pullRequest.labels,
      head: {
        baseRepositoryNodeId: args.page.repositoryNodeId,
        pullRequestNodeId: pullRequest.nodeId,
        pullRequestNumber: pullRequest.number,
        pullRequestUrl: pullRequest.url,
        headRepositoryNodeId: pullRequest.headRepository?.nodeId ?? null,
        headRefName: pullRequest.headRefName,
        headCommitNodeId: pullRequest.headCommit.nodeId,
        headOid: pullRequest.headCommit.sha,
      },
      checks: summarizeChecks(pullRequest.headCommit.checks),
    })),
    continuation: args.page.continuation,
    requestUsage: {
      requestCount: args.page.requestCount,
      cost: args.page.rateUsage.cost,
      limit: args.page.rateUsage.limit,
      remaining: args.page.rateUsage.remaining,
      resetAt: args.page.rateUsage.resetAt,
    },
  };
}

function classifyRepositoryPullRequestProblem(error: unknown): RepositoryPullRequestProblem {
  if (error instanceof GitHubGraphqlRateLimitError) {
    return {
      state: "budget_deferred",
      reason: "rate_limit",
      retryAt: error.retryAt,
    };
  }
  if (error instanceof GitHubGraphqlBudgetError) {
    return {
      state: "budget_deferred",
      reason: "request_budget",
      retryAt: Date.now() + REPOSITORY_OBSERVATION_BUDGET_RETRY_MS,
    };
  }
  if (error instanceof GitHubRepositoryUnavailableError) {
    return {
      state: "provider_unavailable",
      reason: "repository_unavailable",
    };
  }
  return {
    state: "provider_failure",
    reason: "request_failed",
  };
}

export const listOpenPullRequests = action({
  access: "access_dashboard",
  args: {
    vaultId: id("vaults"),
    cursor: union(string(), vNull()),
    pageSize: number(),
    filters: object({
      hiddenLabels: array(string()),
      includeDrafts: boolean(),
      includeNoLabel: boolean(),
    }),
  },
  returns: vRepositoryPullRequestPageResult,
  handler: async (ctx, args): Promise<RepositoryPullRequestPageResult> => {
    const observationContext = await ctx.runQuery(
      internal.repositoryPullRequests.readRepositoryObservationContext,
      {
        userId: ctx.viewer.userId,
        vaultId: args.vaultId,
      },
    );
    if (observationContext.state === "repository_unavailable") {
      return {
        state: "provider_unavailable",
        reason: "repository_unavailable",
      };
    }

    const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: ctx.viewer.userId,
      kind: "github",
    });
    if (githubConnection?.kind !== "github") {
      return {
        state: "provider_unavailable",
        reason: "github_connection_unavailable",
      };
    }

    try {
      const page = await fetchGitHubPullRequestPage({
        credential: githubConnection.auth.credential,
        owner: observationContext.owner,
        name: observationContext.name,
        expectedRepositoryDatabaseId: observationContext.repositoryDatabaseId,
        cursor: args.cursor,
        pageSize: args.pageSize,
        filters: args.filters,
      });
      return buildRepositoryPullRequestPage({
        observedAt: Date.now(),
        page,
      });
    } catch (error) {
      return classifyRepositoryPullRequestProblem(error);
    }
  },
});
