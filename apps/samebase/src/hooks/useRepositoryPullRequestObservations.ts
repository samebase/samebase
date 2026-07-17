import {
  focusManager,
  infiniteQueryOptions,
  onlineManager,
  useInfiniteQuery,
  useQueries,
  useQueryClient,
  type GetNextPageParamFunction,
  type InfiniteData,
  type Query,
  type QueryClient,
  type QueryFunction,
  type QueryKey,
} from "@tanstack/react-query";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import { useAction, useQuery as useConvexQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

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
const REPOSITORY_OBSERVATION_MINIMUM_RETRY_MS = 1_000;
const REPOSITORY_PULL_REQUEST_PAGE_SIZE = 25;
const INITIAL_REPOSITORY_PULL_REQUEST_CURSOR: string | null = null;

type PullRequestPageResult = FunctionReturnType<
  typeof api.repositoryPullRequests.listOpenPullRequests
>;
export type CurrentPullRequestPage = Extract<PullRequestPageResult, { state: "current" }>;
type PullRequestPageProblem = Exclude<PullRequestPageResult, { state: "current" }>;
type PullRequestItem = CurrentPullRequestPage["pullRequests"][number];
type RepositoryMetadataPage = Pick<
  CurrentPullRequestPage,
  | "defaultBranch"
  | "observedAt"
  | "providerOpenPullRequestCount"
  | "repositoryDatabaseId"
  | "repositoryFullName"
  | "repositoryNodeId"
>;

type CloudflareBatchResult = FunctionReturnType<
  typeof api.repositoryCloudflareBuilds.observePullRequestHeads
>;
type ObservedCloudflareBatch = Extract<CloudflareBatchResult, { state: "observed" }>;
type CloudflareBatchProblem = Exclude<CloudflareBatchResult, { state: "observed" }>;
type CloudflareObservationQuery = Query<ObservedCloudflareBatch, Error, ObservedCloudflareBatch>;
type RepositoryPullRequestInfiniteData = InfiniteData<CurrentPullRequestPage, string | null>;

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
  providerSequenceDrifted: boolean;
  defaultBranch: CurrentPullRequestPage["defaultBranch"];
  providerOpenPullRequestCount: number;
  cloudflareByPullRequestNodeId: ReadonlyMap<string, DisplayedCloudflareBuildObservation>;
  hasMore: boolean;
  scanGuardrailReached: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
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

function problemRefetchDelay(
  problem: PullRequestPageProblem | CloudflareBatchProblem,
  now: number,
): number | false {
  switch (problem.state) {
    case "budget_deferred":
      return Math.max(REPOSITORY_OBSERVATION_MINIMUM_RETRY_MS, problem.retryAt - now);
    case "provider_failure":
      return REPOSITORY_OBSERVATION_BACKGROUND_REFRESH_MS;
    case "provider_unavailable":
      return false;
    default:
      problem satisfies never;
      return false;
  }
}

function earliestCloudflareBudgetRetryAt(
  batch: ObservedCloudflareBatch | undefined,
): number | null {
  if (batch === undefined) {
    return null;
  }

  let retryAt: number | null = null;
  for (const observation of batch.observations) {
    if (
      observation.state === "budget_deferred" &&
      (retryAt === null || observation.retryAt < retryAt)
    ) {
      retryAt = observation.retryAt;
    }
  }
  return retryAt;
}

export function repositoryPullRequestRefetchDelay(args: {
  loadedPageCount: number;
  now: number;
  problem: PullRequestPageProblem | null;
}): number | false {
  if (args.loadedPageCount > 1) {
    return false;
  }
  if (args.problem !== null) {
    return problemRefetchDelay(args.problem, args.now);
  }
  return args.loadedPageCount === 1 ? REPOSITORY_OBSERVATION_BACKGROUND_REFRESH_MS : false;
}

export function repositoryPullRequestCanRefetch(args: {
  failureObservedAt: number | null;
  now: number;
  problem: PullRequestPageProblem | null;
}): boolean {
  switch (args.problem?.state) {
    case undefined:
      return true;
    case "budget_deferred":
      return args.problem.retryAt <= args.now;
    case "provider_failure":
      return (
        args.failureObservedAt !== null &&
        args.failureObservedAt + REPOSITORY_OBSERVATION_BACKGROUND_REFRESH_MS <= args.now
      );
    case "provider_unavailable":
      return true;
    default:
      args.problem satisfies never;
      return false;
  }
}

export async function refreshRepositoryPullRequestFirstPage<TQueryKey extends QueryKey>(args: {
  queryClient: QueryClient;
  queryKey: TQueryKey;
  queryFn: QueryFunction<CurrentPullRequestPage, TQueryKey, string | null>;
  getNextPageParam: GetNextPageParamFunction<string | null, CurrentPullRequestPage>;
}): Promise<void> {
  await args.queryClient.cancelQueries({ queryKey: args.queryKey, exact: true });
  await args.queryClient.fetchInfiniteQuery({
    queryKey: args.queryKey,
    queryFn: args.queryFn,
    initialPageParam: INITIAL_REPOSITORY_PULL_REQUEST_CURSOR,
    getNextPageParam: args.getNextPageParam,
    // The caller already proved that provider freshness expired or the query
    // was invalidated. A positive staleTime would let a recent page-2 fetch
    // suppress this page-1 refresh through the shared cache timestamp.
    staleTime: 0,
    gcTime: REPOSITORY_OBSERVATION_CACHE_MS,
    retry: false,
    pages: 1,
  });
}

export function cloudflareRefetchDelay(args: {
  batch: ObservedCloudflareBatch | undefined;
  loadedPageCount: number;
  now: number;
  problem: CloudflareBatchProblem | null;
}): number | false {
  if (args.loadedPageCount > 1) {
    return false;
  }
  if (args.problem !== null) {
    return problemRefetchDelay(args.problem, args.now);
  }

  const retryAt = earliestCloudflareBudgetRetryAt(args.batch);
  if (retryAt !== null) {
    return Math.max(REPOSITORY_OBSERVATION_MINIMUM_RETRY_MS, retryAt - args.now);
  }
  if (
    args.batch === undefined ||
    args.batch.observations.every((observation) => observation.state === "provider_unavailable")
  ) {
    return false;
  }
  return REPOSITORY_OBSERVATION_BACKGROUND_REFRESH_MS;
}

export function cloudflareCanRefetch(args: {
  batch: ObservedCloudflareBatch | undefined;
  failureObservedAt: number | null;
  now: number;
  problem: CloudflareBatchProblem | null;
}): boolean {
  switch (args.problem?.state) {
    case "budget_deferred":
      return args.problem.retryAt <= args.now;
    case "provider_failure":
      return (
        args.failureObservedAt !== null &&
        args.failureObservedAt + REPOSITORY_OBSERVATION_BACKGROUND_REFRESH_MS <= args.now
      );
    case "provider_unavailable":
      return true;
    case undefined:
      break;
    default:
      args.problem satisfies never;
      return false;
  }
  const retryAt = earliestCloudflareBudgetRetryAt(args.batch);
  if (retryAt !== null) {
    return retryAt <= args.now;
  }
  return !args.batch?.observations.every(
    (observation) => observation.state === "provider_unavailable",
  );
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

export function selectCurrentRepositoryMetadata(
  firstPage: RepositoryMetadataPage,
  remainingPages: readonly RepositoryMetadataPage[],
): {
  defaultBranch: CurrentPullRequestPage["defaultBranch"];
  drifted: boolean;
  providerOpenPullRequestCount: number;
} {
  let latestPage = firstPage;
  let drifted = false;
  for (const page of remainingPages) {
    if (
      page.repositoryNodeId !== firstPage.repositoryNodeId ||
      page.repositoryDatabaseId !== firstPage.repositoryDatabaseId ||
      page.repositoryFullName.toLowerCase() !== firstPage.repositoryFullName.toLowerCase() ||
      page.providerOpenPullRequestCount !== firstPage.providerOpenPullRequestCount ||
      JSON.stringify(page.defaultBranch) !== JSON.stringify(firstPage.defaultBranch)
    ) {
      drifted = true;
    }
    if (page.observedAt >= latestPage.observedAt) {
      latestPage = page;
    }
  }

  return {
    defaultBranch: latestPage.defaultBranch,
    drifted,
    providerOpenPullRequestCount: latestPage.providerOpenPullRequestCount,
  };
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
  const queryClient = useQueryClient();
  const githubConnection = useConvexQuery(api.users.getGithubConnectionStatus);
  const listOpenPullRequests = useAction(api.repositoryPullRequests.listOpenPullRequests);
  const observePullRequestHeads = useAction(api.repositoryCloudflareBuilds.observePullRequestHeads);
  const filters = useMemo(() => normalizeVaultBranchFilters(args.filters), [args.filters]);
  const githubConnectionReady = githubConnection !== undefined;
  const githubConnectionRevision = githubConnection?.revision ?? null;
  const fetchPullRequestPage = useCallback<
    QueryFunction<CurrentPullRequestPage, QueryKey, string | null>
  >(
    async ({ pageParam }) => {
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
    [args.vaultId, filters, listOpenPullRequests],
  );
  const pullRequestQueryOptions = useMemo(
    () =>
      infiniteQueryOptions({
        queryKey: [
          "repository-pull-request-observations",
          args.vaultId,
          githubConnectionRevision,
          filters,
        ],
        queryFn: fetchPullRequestPage,
        initialPageParam: INITIAL_REPOSITORY_PULL_REQUEST_CURSOR,
        getNextPageParam: (lastPage) =>
          lastPage.continuation.kind === "complete" ? undefined : lastPage.continuation.cursor,
        enabled: args.vaultId !== null && githubConnectionReady,
        staleTime: REPOSITORY_OBSERVATION_STALE_MS,
        gcTime: REPOSITORY_OBSERVATION_CACHE_MS,
        retry: false,
        retryOnMount: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchInterval: (query) =>
          repositoryPullRequestRefetchDelay({
            loadedPageCount: query.state.data?.pages.length ?? 0,
            now: Date.now(),
            problem:
              query.state.error === null ? null : pullRequestProblemFromError(query.state.error),
          }),
        refetchIntervalInBackground: false,
      }),
    [args.vaultId, fetchPullRequestPage, filters, githubConnectionReady, githubConnectionRevision],
  );
  const pullRequestQuery = useInfiniteQuery(pullRequestQueryOptions);
  const activeFirstPageRefresh = useRef<{ queryHash: string } | null>(null);
  const refreshFirstPageIfStale = useCallback(() => {
    const query = queryClient
      .getQueryCache()
      .find<CurrentPullRequestPage, Error, RepositoryPullRequestInfiniteData>({
        queryKey: pullRequestQueryOptions.queryKey,
        exact: true,
      });
    const data = query?.state.data;
    const firstPage = data?.pages[0];
    const now = Date.now();
    if (
      query === undefined ||
      data === undefined ||
      firstPage === undefined ||
      (now <= firstPage.freshUntil && !query.isStaleByTime(REPOSITORY_OBSERVATION_STALE_MS))
    ) {
      return;
    }
    if (
      !repositoryPullRequestCanRefetch({
        failureObservedAt: query.state.error === null ? null : query.state.errorUpdatedAt,
        now,
        problem: query.state.error === null ? null : pullRequestProblemFromError(query.state.error),
      }) ||
      activeFirstPageRefresh.current?.queryHash === query.queryHash ||
      (data.pages.length === 1 && query.state.fetchStatus !== "idle")
    ) {
      return;
    }

    const marker = { queryHash: query.queryHash };
    activeFirstPageRefresh.current = marker;
    void refreshRepositoryPullRequestFirstPage({
      queryClient,
      queryKey: pullRequestQueryOptions.queryKey,
      queryFn: fetchPullRequestPage,
      getNextPageParam: pullRequestQueryOptions.getNextPageParam,
    })
      .catch(() => undefined)
      .finally(() => {
        if (activeFirstPageRefresh.current === marker) {
          activeFirstPageRefresh.current = null;
        }
      });
  }, [fetchPullRequestPage, pullRequestQueryOptions, queryClient]);

  useEffect(() => {
    // Native infinite-query refetch replays every loaded page. This lifecycle
    // refresh keeps provider work bounded to the newest page.
    refreshFirstPageIfStale();
    const unsubscribeFocus = focusManager.subscribe((focused) => {
      if (focused) {
        refreshFirstPageIfStale();
      }
    });
    const unsubscribeOnline = onlineManager.subscribe((online) => {
      if (online) {
        refreshFirstPageIfStale();
      }
    });
    return () => {
      unsubscribeFocus();
      unsubscribeOnline();
    };
  }, [refreshFirstPageIfStale]);

  const pages = pullRequestQuery.data?.pages ?? [];
  const headsByPage = uniqueHeadsByPage(pages);
  const cloudflareQueries = useQueries({
    queries: headsByPage.map((heads, pageIndex) => {
      const lifecycleCanRefetch = (query: CloudflareObservationQuery): boolean =>
        cloudflareCanRefetch({
          batch: query.state.data,
          failureObservedAt: query.state.error === null ? null : query.state.errorUpdatedAt,
          now: Date.now(),
          problem:
            query.state.error === null ? null : cloudflareProblemFromError(query.state.error),
        });
      return {
        queryKey: [
          "repository-cloudflare-build-observations",
          args.vaultId,
          githubConnection?.revision ?? null,
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
        enabled: args.vaultId !== null && githubConnection !== undefined && heads.length > 0,
        staleTime: REPOSITORY_OBSERVATION_STALE_MS,
        gcTime: REPOSITORY_OBSERVATION_CACHE_MS,
        retry: false,
        retryOnMount: false,
        refetchOnMount: pageIndex === 0 ? lifecycleCanRefetch : false,
        refetchOnWindowFocus: pageIndex === 0 ? lifecycleCanRefetch : false,
        refetchOnReconnect: pageIndex === 0 ? lifecycleCanRefetch : false,
        refetchInterval: (query: CloudflareObservationQuery) =>
          cloudflareRefetchDelay({
            batch: query.state.data,
            loadedPageCount: headsByPage.length,
            now: Date.now(),
            problem:
              query.state.error === null ? null : cloudflareProblemFromError(query.state.error),
          }),
        refetchIntervalInBackground: false,
      };
    }),
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
  const repositoryMetadata = selectCurrentRepositoryMetadata(firstPage, pages.slice(1));
  const providerSequenceDrifted =
    repositoryMetadata.drifted || pages.some((page) => page.providerSequenceDrifted);
  const freshUntil = Math.min(...pages.map((page) => page.freshUntil));
  const loadMoreProblem = pullRequestQuery.isFetchNextPageError
    ? pullRequestProblemFromError(pullRequestQuery.error)
    : null;
  const canLoadMore =
    !pullRequestQuery.isFetchingNextPage &&
    !(loadMoreProblem?.state === "budget_deferred" && loadMoreProblem.retryAt > args.now);
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
      providerSequenceDrifted ||
      (pullRequestQuery.error !== null && !pullRequestQuery.isFetchNextPageError)
        ? "stale"
        : "current",
    refresh,
    observedAt: Math.min(...pages.map((page) => page.observedAt)),
    pages,
    pullRequests,
    duplicatePullRequestObserved,
    providerSequenceDrifted,
    defaultBranch: repositoryMetadata.defaultBranch,
    providerOpenPullRequestCount: repositoryMetadata.providerOpenPullRequestCount,
    cloudflareByPullRequestNodeId,
    hasMore: lastPage.continuation.kind !== "complete",
    scanGuardrailReached: lastPage.continuation.kind === "scan_guardrail",
    isLoadingMore: pullRequestQuery.isFetchingNextPage,
    canLoadMore,
    loadMoreProblem,
    loadMore: () => {
      if (
        pullRequestQuery.isFetchingNextPage ||
        (loadMoreProblem?.state === "budget_deferred" && loadMoreProblem.retryAt > Date.now())
      ) {
        return;
      }
      void pullRequestQuery.fetchNextPage();
    },
  };
}
