import { useInfiniteQuery, useQueries } from "@tanstack/react-query";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import { useAction } from "convex/react";

import { api } from "../../convex/_generated/api";
import type {
  CloudflareBuildObservationResult,
  PullRequestHeadIdentity,
} from "../../convex/repositoryObservations";
import {
  normalizeVaultBranchFilters,
  type VaultBranchFilters,
} from "@/components/vault-dashboard/vaultDashboardBranchFilters";

const REPOSITORY_OBSERVATION_STALE_MS = 60_000;
const REPOSITORY_OBSERVATION_BACKGROUND_REFRESH_MS = 60_000;
const REPOSITORY_OBSERVATION_CACHE_MS = 5 * 60_000;
const REPOSITORY_PULL_REQUEST_PAGE_SIZE = 25;
const INITIAL_REPOSITORY_PULL_REQUEST_CURSOR: string | null = null;

type PullRequestPageResult = FunctionReturnType<
  typeof api.repositoryPullRequests.listOpenPullRequests
>;
export type CurrentPullRequestPage = Extract<PullRequestPageResult, { state: "current" }>;
type PullRequestPageProblem = Exclude<PullRequestPageResult, { state: "current" }>;
type PullRequestItem = CurrentPullRequestPage["pullRequests"][number];

type CloudflareBatchResult = FunctionReturnType<
  typeof api.repositoryCloudflareBuilds.observePullRequestHeads
>;
type ObservedCloudflareBatch = Extract<CloudflareBatchResult, { state: "observed" }>;
type CloudflareBatchProblem = Exclude<CloudflareBatchResult, { state: "observed" }>;

export type DisplayedCloudflareBuildObservation =
  | CloudflareBuildObservationResult
  | { state: "not_requested" }
  | { state: "loading" };

type RepositoryObservationRefresh =
  | { state: "idle" }
  | { state: "loading" }
  | PullRequestPageProblem;

type RepositoryPullRequestSettledObservation = {
  state: "current" | "stale";
  refresh: RepositoryObservationRefresh;
  observedAt: number;
  pages: CurrentPullRequestPage[];
  pullRequests: PullRequestItem[];
  duplicatePullRequestObserved: boolean;
  defaultBranch: CurrentPullRequestPage["defaultBranch"];
  providerOpenPullRequestCount: number;
  cloudflareByPullRequestNodeId: ReadonlyMap<string, DisplayedCloudflareBuildObservation>;
  hasMore: boolean;
  scanGuardrailReached: boolean;
  isLoadingMore: boolean;
  loadMoreProblem: PullRequestPageProblem | null;
  loadMore: () => void;
};

export type RepositoryPullRequestObservation =
  | { state: "not_requested" }
  | { state: "loading" }
  | PullRequestPageProblem
  | RepositoryPullRequestSettledObservation;

class PullRequestPageProblemError extends Error {
  constructor(readonly problem: PullRequestPageProblem) {
    super(`Repository pull request observation stopped: ${problem.state}.`);
    this.name = "PullRequestPageProblemError";
  }
}

class CloudflareBatchProblemError extends Error {
  constructor(readonly problem: CloudflareBatchProblem) {
    super(`Cloudflare build observation stopped: ${problem.state}.`);
    this.name = "CloudflareBatchProblemError";
  }
}

function pullRequestProblemFromError(error: unknown): PullRequestPageProblem {
  return error instanceof PullRequestPageProblemError
    ? error.problem
    : { state: "provider_failure", reason: "request_failed" };
}

function cloudflareProblemFromError(error: unknown): CloudflareBatchProblem {
  return error instanceof CloudflareBatchProblemError
    ? error.problem
    : { state: "provider_failure", reason: "request_failed" };
}

function cloudflareProblemForHead(args: {
  head: PullRequestHeadIdentity;
  problem: CloudflareBatchProblem;
}): CloudflareBuildObservationResult {
  switch (args.problem.state) {
    case "budget_deferred":
      return { ...args.problem, head: args.head };
    case "provider_unavailable":
      return { ...args.problem, head: args.head };
    case "provider_failure":
      return { ...args.problem, head: args.head };
    default:
      args.problem satisfies never;
      throw new Error("Cloudflare batch problem was not classified.");
  }
}

function staleCloudflareObservation(args: {
  observation: CloudflareBuildObservationResult;
  refresh: Extract<CloudflareBuildObservationResult, { state: "stale" }>["refresh"];
}): CloudflareBuildObservationResult {
  switch (args.observation.state) {
    case "ready":
      return {
        state: "stale",
        head: args.observation.head,
        observedAt: args.observation.observedAt,
        lastKnown: { state: "ready", builds: args.observation.builds },
        refresh: args.refresh,
      };
    case "fresh_absence":
      return {
        state: "stale",
        head: args.observation.head,
        observedAt: args.observation.observedAt,
        lastKnown: { state: "fresh_absence" },
        refresh: args.refresh,
      };
    case "stale":
      return { ...args.observation, refresh: args.refresh };
    case "budget_deferred":
    case "provider_unavailable":
    case "provider_failure":
      return args.observation;
    default:
      args.observation satisfies never;
      throw new Error("Cloudflare observation was not classified.");
  }
}

function uniquePullRequests(pages: readonly CurrentPullRequestPage[]): {
  pullRequests: PullRequestItem[];
  duplicatePullRequestObserved: boolean;
} {
  const seenNodeIds = new Set<string>();
  const pullRequests: PullRequestItem[] = [];
  let duplicatePullRequestObserved = false;
  for (const page of pages) {
    for (const pullRequest of page.pullRequests) {
      if (seenNodeIds.has(pullRequest.nodeId)) {
        duplicatePullRequestObserved = true;
        continue;
      }
      seenNodeIds.add(pullRequest.nodeId);
      pullRequests.push(pullRequest);
    }
  }
  return { pullRequests, duplicatePullRequestObserved };
}

function uniqueHeadsByPage(pages: readonly CurrentPullRequestPage[]): PullRequestHeadIdentity[][] {
  const seenPullRequestNodeIds = new Set<string>();
  return pages.map((page) =>
    page.pullRequests.flatMap((pullRequest) => {
      if (seenPullRequestNodeIds.has(pullRequest.nodeId)) {
        return [];
      }
      seenPullRequestNodeIds.add(pullRequest.nodeId);
      return [pullRequest.head];
    }),
  );
}

function cloudflareObservationKey(head: PullRequestHeadIdentity): string {
  return [
    head.baseRepositoryNodeId,
    head.pullRequestNodeId,
    head.headRepositoryNodeId,
    head.headRefName,
    head.headCommitNodeId,
    head.headOid,
  ].join(":");
}

export function mapCloudflarePageObservation(args: {
  batch: ObservedCloudflareBatch | undefined;
  error: unknown;
  fetchStatus: "fetching" | "idle" | "paused";
  heads: readonly PullRequestHeadIdentity[];
  now: number;
}): Array<[string, DisplayedCloudflareBuildObservation]> {
  if (args.batch === undefined) {
    if (args.error !== null) {
      const problem = cloudflareProblemFromError(args.error);
      return args.heads.map((head) => [
        head.pullRequestNodeId,
        cloudflareProblemForHead({ head, problem }),
      ]);
    }
    const state = args.fetchStatus === "idle" ? "not_requested" : "loading";
    return args.heads.map((head) => [head.pullRequestNodeId, { state }]);
  }

  const observationsByPullRequestNodeId = new Map(
    args.batch.observations.map((observation) => [observation.head.pullRequestNodeId, observation]),
  );
  const problem = args.error === null ? null : cloudflareProblemFromError(args.error);
  const isExpired = args.now > args.batch.observedAt + REPOSITORY_OBSERVATION_STALE_MS;

  return args.heads.map((head) => {
    const observation = observationsByPullRequestNodeId.get(head.pullRequestNodeId);
    if (observation === undefined) {
      return [
        head.pullRequestNodeId,
        {
          state: "provider_failure",
          head,
          reason: "incomplete_response",
        },
      ];
    }
    if (!isExpired && problem === null) {
      return [head.pullRequestNodeId, observation];
    }
    const refresh =
      problem ??
      (args.fetchStatus === "fetching"
        ? { state: "loading" as const }
        : { state: "not_requested" as const });
    return [head.pullRequestNodeId, staleCloudflareObservation({ observation, refresh })];
  });
}

export function useRepositoryPullRequestObservations(args: {
  vaultId: Id<"vaults"> | null;
  filters: VaultBranchFilters;
  now: number;
}): RepositoryPullRequestObservation {
  const listOpenPullRequests = useAction(api.repositoryPullRequests.listOpenPullRequests);
  const observePullRequestHeads = useAction(api.repositoryCloudflareBuilds.observePullRequestHeads);
  const filters = normalizeVaultBranchFilters(args.filters);
  const pullRequestQuery = useInfiniteQuery({
    queryKey: ["repository-pull-request-observations", args.vaultId, filters],
    queryFn: async ({ pageParam }): Promise<CurrentPullRequestPage> => {
      if (args.vaultId === null) {
        throw new Error("Repository observation was requested without a vault.");
      }
      const result = await listOpenPullRequests({
        vaultId: args.vaultId,
        cursor: pageParam,
        pageSize: REPOSITORY_PULL_REQUEST_PAGE_SIZE,
        filters,
      });
      if (result.state !== "current") {
        throw new PullRequestPageProblemError(result);
      }
      return result;
    },
    initialPageParam: INITIAL_REPOSITORY_PULL_REQUEST_CURSOR,
    getNextPageParam: (lastPage) =>
      lastPage.continuation.kind === "complete" ? undefined : lastPage.continuation.cursor,
    enabled: args.vaultId !== null,
    staleTime: REPOSITORY_OBSERVATION_STALE_MS,
    gcTime: REPOSITORY_OBSERVATION_CACHE_MS,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.pages.length === 1 ? REPOSITORY_OBSERVATION_BACKGROUND_REFRESH_MS : false,
    refetchIntervalInBackground: false,
  });

  const pages = pullRequestQuery.data?.pages ?? [];
  const headsByPage = uniqueHeadsByPage(pages);
  const cloudflareQueries = useQueries({
    queries: headsByPage.map((heads, pageIndex) => ({
      queryKey: [
        "repository-cloudflare-build-observations",
        args.vaultId,
        heads.map(cloudflareObservationKey),
      ],
      queryFn: async (): Promise<ObservedCloudflareBatch> => {
        if (args.vaultId === null) {
          throw new Error("Cloudflare observation was requested without a vault.");
        }
        const result = await observePullRequestHeads({
          vaultId: args.vaultId,
          heads,
        });
        if (result.state !== "observed") {
          throw new CloudflareBatchProblemError(result);
        }
        return result;
      },
      enabled: args.vaultId !== null && heads.length > 0,
      staleTime: REPOSITORY_OBSERVATION_STALE_MS,
      gcTime: REPOSITORY_OBSERVATION_CACHE_MS,
      retry: false,
      refetchOnWindowFocus: true,
      refetchInterval: pageIndex === 0 ? REPOSITORY_OBSERVATION_BACKGROUND_REFRESH_MS : false,
      refetchIntervalInBackground: false,
    })),
  });

  if (args.vaultId === null) {
    return { state: "not_requested" };
  }
  if (pages.length === 0) {
    if (pullRequestQuery.error !== null) {
      return pullRequestProblemFromError(pullRequestQuery.error);
    }
    return { state: "loading" };
  }

  const { pullRequests, duplicatePullRequestObserved } = uniquePullRequests(pages);
  const cloudflareByPullRequestNodeId = new Map<string, DisplayedCloudflareBuildObservation>();
  for (const [pageIndex, heads] of headsByPage.entries()) {
    const query = cloudflareQueries[pageIndex];
    for (const [pullRequestNodeId, observation] of mapCloudflarePageObservation({
      batch: query.data,
      error: query.error,
      fetchStatus: query.fetchStatus,
      heads,
      now: args.now,
    })) {
      cloudflareByPullRequestNodeId.set(pullRequestNodeId, observation);
    }
  }

  const firstPage = pages[0];
  const lastPage = pages[pages.length - 1];
  const freshUntil = Math.min(...pages.map((page) => page.freshUntil));
  const loadMoreProblem = pullRequestQuery.isFetchNextPageError
    ? pullRequestProblemFromError(pullRequestQuery.error)
    : null;
  const refresh =
    pullRequestQuery.error !== null && !pullRequestQuery.isFetchNextPageError
      ? pullRequestProblemFromError(pullRequestQuery.error)
      : pullRequestQuery.isFetching && !pullRequestQuery.isFetchingNextPage
        ? { state: "loading" as const }
        : { state: "idle" as const };

  return {
    state:
      args.now > freshUntil ||
      duplicatePullRequestObserved ||
      (pullRequestQuery.error !== null && !pullRequestQuery.isFetchNextPageError)
        ? "stale"
        : "current",
    refresh,
    observedAt: Math.min(...pages.map((page) => page.observedAt)),
    pages,
    pullRequests,
    duplicatePullRequestObserved,
    defaultBranch: firstPage.defaultBranch,
    providerOpenPullRequestCount: firstPage.providerOpenPullRequestCount,
    cloudflareByPullRequestNodeId,
    hasMore: lastPage.continuation.kind !== "complete",
    scanGuardrailReached: lastPage.continuation.kind === "scan_guardrail",
    isLoadingMore: pullRequestQuery.isFetchingNextPage,
    loadMoreProblem,
    loadMore: () => {
      void pullRequestQuery.fetchNextPage();
    },
  };
}
