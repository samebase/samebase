import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type {
  RepositoryPullRequestPage,
  RepositoryPullRequestProblem,
} from "../../convex/repositoryPullRequests";
import type { PullRequestHeadIdentity } from "../../convex/repositoryPullRequestObservations";
import type { PullRequestResourceObservationBatch } from "../../convex/vault/pullRequestResourceObservations";
import type { VaultPullRequestFilters } from "@/components/vault-dashboard/vaultDashboardPullRequestFilters";
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useMemo } from "react";

const PULL_REQUEST_OBSERVATION_STALE_MS = 60_000;
const PULL_REQUEST_OBSERVATION_GC_MS = 5 * 60_000;
const PULL_REQUEST_OBSERVATION_PAGE_SIZE = 25;

type VaultPullRequestObservationTarget = {
  _id: Id<"vaults">;
  cloudflareWorkers: readonly { workerId: Id<"vaultCloudflareWorkers"> }[];
  convexProjects: readonly { convexProjectId: Id<"vaultConvexProjects"> }[];
};

type PullRequestResourceObservation = PullRequestResourceObservationBatch["observations"][number];

export type PullRequestResourceState =
  | { state: "loading" }
  | { state: "failed" }
  | {
      state: "current";
      observation: PullRequestResourceObservation;
    }
  | {
      state: "stale";
      observation: PullRequestResourceObservation;
    };

type SettledPullRequestObservation = {
  state: "current" | "stale";
  page: RepositoryPullRequestPage;
  pullRequests: RepositoryPullRequestPage["pullRequests"];
  refreshProblem: RepositoryPullRequestProblem | null;
  refreshing: boolean;
  resourceState: "current" | "loading" | "stale" | "failed";
  resourcesByPullRequestNodeId: ReadonlyMap<string, PullRequestResourceState>;
  hasMore: boolean;
  scanGuardrailReached: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  loadMoreProblem: RepositoryPullRequestProblem | null;
  reload: () => void;
  reloadResources: () => void;
  loadMore: () => void;
};

export type VaultPullRequestObservation =
  | { state: "not_requested" }
  | { state: "loading" }
  | {
      state: "problem";
      problem: RepositoryPullRequestProblem;
      reload: () => void;
    }
  | SettledPullRequestObservation;

class PullRequestObservationProblemError extends Error {
  constructor(readonly problem: RepositoryPullRequestProblem) {
    super("Pull request observation stopped: " + problem.state + ".");
    this.name = "PullRequestObservationProblemError";
  }
}

function problemFromError(error: unknown): RepositoryPullRequestProblem {
  return error instanceof PullRequestObservationProblemError
    ? error.problem
    : { state: "provider_failure", reason: "request_failed" };
}

function pageNeedsPolling(page: RepositoryPullRequestPage | undefined): boolean {
  return page?.pullRequests.some((pullRequest) => pullRequest.checks.state === "running") === true;
}

function resourcesNeedPolling(batch: PullRequestResourceObservationBatch | undefined): boolean {
  return (
    batch?.observations.some((observation) =>
      observation.workers.some(
        (worker) =>
          worker.state === "available" &&
          (worker.buildState === "queued" || worker.buildState === "running"),
      ),
    ) === true
  );
}

function pullRequestHeadKey(head: PullRequestHeadIdentity): string {
  return JSON.stringify([
    head.baseRepositoryNodeId,
    head.pullRequestNodeId,
    head.pullRequestNumber,
    head.pullRequestUrl,
    head.headRepositoryNodeId,
    head.headRefName,
    head.headCommitNodeId,
    head.headOid,
  ]);
}

function firstPageGeneration(page: RepositoryPullRequestPage | undefined): string | null {
  if (!page) {
    return null;
  }

  return JSON.stringify({
    repositoryNodeId: page.repositoryNodeId,
    repositoryDatabaseId: page.repositoryDatabaseId,
    pullRequests: page.pullRequests.map((pullRequest) => [
      pullRequest.nodeId,
      pullRequest.head.headRepositoryNodeId,
      pullRequest.head.headRefName,
      pullRequest.head.headCommitNodeId,
      pullRequest.head.headOid,
    ]),
    continuation: page.continuation,
  });
}

function uniquePullRequests(pages: readonly RepositoryPullRequestPage[]): {
  pullRequests: RepositoryPullRequestPage["pullRequests"];
  duplicateObserved: boolean;
} {
  const seenNodeIds = new Set<string>();
  const pullRequests: RepositoryPullRequestPage["pullRequests"] = [];
  let duplicateObserved = false;

  for (const page of pages) {
    for (const pullRequest of page.pullRequests) {
      if (seenNodeIds.has(pullRequest.nodeId)) {
        duplicateObserved = true;
        continue;
      }
      seenNodeIds.add(pullRequest.nodeId);
      pullRequests.push(pullRequest);
    }
  }

  return { pullRequests, duplicateObserved };
}

function uniqueHeadsByPage(
  pages: readonly RepositoryPullRequestPage[],
): PullRequestHeadIdentity[][] {
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

function pagesDrifted(pages: readonly RepositoryPullRequestPage[]): boolean {
  const firstPage = pages[0];
  return pages.some(
    (page) =>
      page.providerSequenceDrifted ||
      page.repositoryNodeId !== firstPage.repositoryNodeId ||
      page.repositoryDatabaseId !== firstPage.repositoryDatabaseId ||
      page.repositoryFullName.toLowerCase() !== firstPage.repositoryFullName.toLowerCase() ||
      page.providerOpenPullRequestCount !== firstPage.providerOpenPullRequestCount,
  );
}

function morePullRequestsCursor(page: RepositoryPullRequestPage | undefined): string | null {
  return page?.continuation.kind === "next_page" || page?.continuation.kind === "scan_guardrail"
    ? page.continuation.cursor
    : null;
}

export function useVaultPullRequestObservations(args: {
  vault: VaultPullRequestObservationTarget | null;
  filters: VaultPullRequestFilters;
  now: number;
}): VaultPullRequestObservation {
  const queryClient = useQueryClient();
  const listOpenPullRequests = useAction(api.repositoryPullRequests.listOpenPullRequests);
  const observeVisibleResources = useAction(
    api.vault.pullRequestResourceObservations.observeVisiblePullRequestResources,
  );
  const vaultId = args.vault?._id;
  const cloudflareWorkerIds = [...(args.vault?.cloudflareWorkers ?? [])]
    .map((worker) => worker.workerId)
    .sort((left, right) => left.localeCompare(right));
  const convexProjectIds = [...(args.vault?.convexProjects ?? [])]
    .map((project) => project.convexProjectId)
    .sort((left, right) => left.localeCompare(right));
  const filters = {
    hiddenLabels: [...args.filters.hiddenLabels],
    includeDrafts: args.filters.includeDrafts,
    includeNoLabel: args.filters.includeNoLabel,
  };
  const pageQueryKey = ["vault-pull-requests", vaultId, filters] as const;

  const pageQuery = useQuery({
    queryKey: pageQueryKey,
    queryFn: async () => {
      if (!vaultId) {
        throw new Error("Vault is required to observe pull requests.");
      }
      const result = await listOpenPullRequests({
        vaultId,
        cursor: null,
        pageSize: PULL_REQUEST_OBSERVATION_PAGE_SIZE,
        filters,
      });
      if (result.state !== "current") {
        throw new PullRequestObservationProblemError(result);
      }
      return result;
    },
    enabled: Boolean(vaultId),
    staleTime: PULL_REQUEST_OBSERVATION_STALE_MS,
    gcTime: PULL_REQUEST_OBSERVATION_GC_MS,
    retry: false,
    refetchInterval: (query) =>
      pageNeedsPolling(query.state.data) ? PULL_REQUEST_OBSERVATION_STALE_MS : false,
    refetchIntervalInBackground: false,
  });

  const continuationCursor = morePullRequestsCursor(pageQuery.data);
  const continuationGeneration = firstPageGeneration(pageQuery.data);
  const continuationQueryKey = [
    "vault-pull-request-continuations",
    vaultId,
    filters,
    continuationGeneration,
  ] as const;
  const continuationQuery = useInfiniteQuery({
    queryKey: continuationQueryKey,
    queryFn: async ({ pageParam }) => {
      if (!vaultId || pageParam === null) {
        throw new Error("Pull request continuation was requested without a cursor.");
      }
      const result = await listOpenPullRequests({
        vaultId,
        cursor: pageParam,
        pageSize: PULL_REQUEST_OBSERVATION_PAGE_SIZE,
        filters,
      });
      if (result.state !== "current") {
        throw new PullRequestObservationProblemError(result);
      }
      return result;
    },
    initialPageParam: continuationCursor,
    getNextPageParam: (lastPage) => morePullRequestsCursor(lastPage) ?? undefined,
    enabled: false,
    staleTime: PULL_REQUEST_OBSERVATION_STALE_MS,
    gcTime: PULL_REQUEST_OBSERVATION_GC_MS,
    retry: false,
  });

  const pages = pageQuery.data ? [pageQuery.data, ...(continuationQuery.data?.pages ?? [])] : [];
  const headsByPage = uniqueHeadsByPage(pages);
  const resourceQueries = useQueries({
    queries: headsByPage.map((heads, pageIndex) => ({
      queryKey: [
        "vault-pull-request-resources",
        vaultId,
        cloudflareWorkerIds,
        convexProjectIds,
        heads.map(pullRequestHeadKey),
      ],
      queryFn: async () => {
        if (!vaultId) {
          throw new Error("Vault is required to observe pull request resources.");
        }
        return await observeVisibleResources({ vaultId, heads });
      },
      enabled: Boolean(vaultId && heads.length > 0),
      staleTime: PULL_REQUEST_OBSERVATION_STALE_MS,
      gcTime: PULL_REQUEST_OBSERVATION_GC_MS,
      retry: false,
      refetchOnMount: pageIndex === 0,
      refetchOnWindowFocus: pageIndex === 0,
      refetchOnReconnect: pageIndex === 0,
      refetchInterval: (query: {
        state: { data: PullRequestResourceObservationBatch | undefined };
      }) =>
        pageIndex === 0 && resourcesNeedPolling(query.state.data)
          ? PULL_REQUEST_OBSERVATION_STALE_MS
          : false,
      refetchIntervalInBackground: false,
    })),
  });

  const resourcesByPullRequestNodeId = useMemo(() => {
    const resources = new Map<string, PullRequestResourceState>();

    for (const [pageIndex, heads] of headsByPage.entries()) {
      const query = resourceQueries[pageIndex];
      const batch = query.data;
      const observationsByPullRequestNodeId = new Map(
        (batch?.observations ?? []).map((observation) => [
          observation.head.pullRequestNodeId,
          observation,
        ]),
      );

      for (const head of heads) {
        const observation = observationsByPullRequestNodeId.get(head.pullRequestNodeId);
        if (!batch) {
          resources.set(head.pullRequestNodeId, {
            state: query.isError ? "failed" : "loading",
          });
          continue;
        }
        if (!observation) {
          resources.set(head.pullRequestNodeId, { state: "failed" });
          continue;
        }
        resources.set(head.pullRequestNodeId, {
          state:
            query.isError || args.now > batch.observedAt + PULL_REQUEST_OBSERVATION_STALE_MS
              ? "stale"
              : "current",
          observation,
        });
      }
    }

    return resources;
  }, [args.now, headsByPage, resourceQueries]);
  const resourceStates = [...resourcesByPullRequestNodeId.values()].map(
    (resource) => resource.state,
  );
  const resourceState = resourceStates.includes("failed")
    ? "failed"
    : resourceStates.includes("stale")
      ? "stale"
      : resourceStates.includes("loading")
        ? "loading"
        : "current";
  const reloadResources = () => {
    void Promise.all(resourceQueries.map((query) => query.refetch()));
  };
  const reload = () => {
    queryClient.removeQueries({ queryKey: continuationQueryKey, exact: true });
    void pageQuery.refetch();
  };

  if (!vaultId) {
    return { state: "not_requested" };
  }
  if (!pageQuery.data) {
    if (pageQuery.isError) {
      return {
        state: "problem",
        problem: problemFromError(pageQuery.error),
        reload,
      };
    }
    return { state: "loading" };
  }

  const { pullRequests, duplicateObserved } = uniquePullRequests(pages);
  const lastPage = pages.at(-1) ?? pageQuery.data;
  const loadMoreProblem = continuationQuery.isFetchNextPageError
    ? problemFromError(continuationQuery.error)
    : null;
  const hasMore = morePullRequestsCursor(lastPage) !== null;
  const canLoadMore =
    hasMore &&
    !continuationQuery.isFetchingNextPage &&
    !(loadMoreProblem?.state === "budget_deferred" && loadMoreProblem.retryAt > args.now);
  const expired = pages.some((page) => args.now > page.freshUntil);

  return {
    state:
      pageQuery.isError || expired || duplicateObserved || pagesDrifted(pages)
        ? "stale"
        : "current",
    page: pageQuery.data,
    pullRequests,
    refreshProblem: pageQuery.isError ? problemFromError(pageQuery.error) : null,
    refreshing:
      pageQuery.isFetching ||
      continuationQuery.isFetchingNextPage ||
      resourceQueries.some((query) => query.isFetching),
    resourceState,
    resourcesByPullRequestNodeId,
    hasMore,
    scanGuardrailReached: lastPage.continuation.kind === "scan_guardrail",
    isLoadingMore: continuationQuery.isFetchingNextPage,
    canLoadMore,
    loadMoreProblem,
    reload,
    reloadResources,
    loadMore: () => {
      if (!canLoadMore) {
        return;
      }
      void continuationQuery.fetchNextPage();
    },
  };
}
