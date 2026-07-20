import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type {
  RepositoryPullRequest,
  RepositoryPullRequestPage,
} from "../../convex/repositoryPullRequests";
import type {
  PullRequestResourceHead,
  PullRequestResources,
} from "../../convex/vault/pullRequestResources";
import {
  filterVaultPullRequests,
  type VaultPullRequestFilters,
} from "@/components/vault-dashboard/vaultDashboardPullRequestFilters";
import { summarizePullRequestChecks, type PullRequestCheckSummary } from "@/lib/pullRequestChecks";
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useMemo } from "react";

const PULL_REQUEST_STALE_MS = 60_000;
const PULL_REQUEST_GC_MS = 5 * 60_000;
const PULL_REQUEST_PAGE_SIZE = 25;

type VaultPullRequestTarget = {
  _id: Id<"vaults">;
  cloudflareWorkers: readonly { workerId: Id<"vaultCloudflareWorkers"> }[];
  convexProjects: readonly { convexProjectId: Id<"vaultConvexProjects"> }[];
};

export type VaultPullRequest = Omit<RepositoryPullRequest, "labels"> & {
  labels: RepositoryPullRequest["labels"]["nodes"];
  checks: PullRequestCheckSummary;
};

export type PullRequestResourceState =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "current"; resources: PullRequestResources }
  | { state: "stale"; resources: PullRequestResources };

type SettledPullRequests = {
  state: "current" | "stale";
  pullRequests: VaultPullRequest[];
  allPullRequests: VaultPullRequest[];
  refreshing: boolean;
  resourceState: "current" | "loading" | "stale" | "failed";
  resourcesByPullRequestId: ReadonlyMap<string, PullRequestResourceState>;
  hasMore: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  loadMoreFailed: boolean;
  reload: () => void;
  reloadResources: () => void;
  loadMore: () => void;
};

export type VaultPullRequestsState =
  | { state: "not_requested" }
  | { state: "loading" }
  | { state: "problem"; reload: () => void }
  | SettledPullRequests;

function pullRequestsFromPage(
  page: RepositoryPullRequestPage | undefined,
): RepositoryPullRequest[] {
  return page?.repository?.pullRequests.nodes ?? [];
}

function nextCursor(page: RepositoryPullRequestPage | undefined): string | null {
  const pageInfo = page?.repository?.pullRequests.pageInfo;
  return pageInfo?.hasNextPage ? pageInfo.endCursor : null;
}

function pageNeedsPolling(page: RepositoryPullRequestPage | undefined): boolean {
  return pullRequestsFromPage(page).some(
    (pullRequest) => summarizePullRequestChecks(pullRequest.statusCheckRollup).state === "running",
  );
}

function resourcesNeedPolling(resources: PullRequestResources[] | undefined): boolean {
  return (
    resources?.some((pullRequest) =>
      pullRequest.workers.some(
        (worker) =>
          worker.state === "available" &&
          (worker.buildState === "queued" || worker.buildState === "running"),
      ),
    ) === true
  );
}

function resourceHead(
  pullRequest: Pick<
    RepositoryPullRequest,
    "id" | "url" | "isCrossRepository" | "headRepository" | "headRefName" | "headRefOid"
  >,
): PullRequestResourceHead {
  return {
    id: pullRequest.id,
    url: pullRequest.url,
    isCrossRepository: pullRequest.isCrossRepository,
    headRepositoryId: pullRequest.headRepository?.id ?? null,
    headRefName: pullRequest.headRefName,
    headRefOid: pullRequest.headRefOid,
  };
}

function resourceHeadKey(head: PullRequestResourceHead): string {
  return JSON.stringify([
    head.id,
    head.url,
    head.isCrossRepository,
    head.headRepositoryId,
    head.headRefName,
    head.headRefOid,
  ]);
}

function presentPullRequest(pullRequest: RepositoryPullRequest): VaultPullRequest {
  return {
    ...pullRequest,
    labels: pullRequest.labels.nodes,
    checks: summarizePullRequestChecks(pullRequest.statusCheckRollup),
  };
}

function uniquePullRequests(pages: readonly RepositoryPullRequestPage[]): RepositoryPullRequest[] {
  const seen = new Set<string>();
  return pages.flatMap((page) =>
    pullRequestsFromPage(page).filter((pullRequest) => {
      if (seen.has(pullRequest.id)) {
        return false;
      }
      seen.add(pullRequest.id);
      return true;
    }),
  );
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function useVaultPullRequests(args: {
  vault: VaultPullRequestTarget | null;
  filters: VaultPullRequestFilters;
  now: number;
}): VaultPullRequestsState {
  const queryClient = useQueryClient();
  const listOpenPullRequests = useAction(api.repositoryPullRequests.listOpenPullRequests);
  const getVisibleResources = useAction(
    api.vault.pullRequestResources.getVisiblePullRequestResources,
  );
  const vaultId = args.vault?._id;
  const workerIds = [...(args.vault?.cloudflareWorkers ?? [])]
    .map((worker) => worker.workerId)
    .sort((left, right) => left.localeCompare(right));
  const projectIds = [...(args.vault?.convexProjects ?? [])]
    .map((project) => project.convexProjectId)
    .sort((left, right) => left.localeCompare(right));
  const firstPageKey = ["vault-pull-requests", vaultId] as const;
  const firstPageQuery = useQuery({
    queryKey: firstPageKey,
    queryFn: async () => {
      if (!vaultId) {
        throw new Error("Vault is required to load pull requests.");
      }
      const page = await listOpenPullRequests({
        vaultId,
        first: PULL_REQUEST_PAGE_SIZE,
        after: null,
      });
      if (page.repository === null) {
        throw new Error("GitHub repository unavailable.");
      }
      return page;
    },
    enabled: Boolean(vaultId),
    staleTime: PULL_REQUEST_STALE_MS,
    gcTime: PULL_REQUEST_GC_MS,
    retry: false,
    refetchInterval: (query) =>
      pageNeedsPolling(query.state.data) ? PULL_REQUEST_STALE_MS : false,
    refetchIntervalInBackground: false,
  });

  const firstContinuationCursor = nextCursor(firstPageQuery.data);
  const continuationKey = ["vault-pull-request-pages", vaultId, firstContinuationCursor] as const;
  const continuationQuery = useInfiniteQuery({
    queryKey: continuationKey,
    queryFn: async ({ pageParam }) => {
      if (!vaultId || pageParam === null) {
        throw new Error("Pull request continuation requires a cursor.");
      }
      const page = await listOpenPullRequests({
        vaultId,
        first: PULL_REQUEST_PAGE_SIZE,
        after: pageParam,
      });
      if (page.repository === null) {
        throw new Error("GitHub repository unavailable.");
      }
      return page;
    },
    initialPageParam: firstContinuationCursor,
    getNextPageParam: (lastPage) => nextCursor(lastPage) ?? undefined,
    enabled: false,
    staleTime: PULL_REQUEST_STALE_MS,
    gcTime: PULL_REQUEST_GC_MS,
    retry: false,
  });

  const pages = useMemo(
    () =>
      firstPageQuery.data ? [firstPageQuery.data, ...(continuationQuery.data?.pages ?? [])] : [],
    [firstPageQuery.data, continuationQuery.data?.pages],
  );
  const allPullRequests = useMemo(() => uniquePullRequests(pages).map(presentPullRequest), [pages]);
  const pullRequests = useMemo(
    () => filterVaultPullRequests(allPullRequests, args.filters),
    [allPullRequests, args.filters],
  );
  const heads = useMemo(() => pullRequests.map(resourceHead), [pullRequests]);
  const headChunks = useMemo(() => chunks(heads, PULL_REQUEST_PAGE_SIZE), [heads]);
  const resourceQueries = useQueries({
    queries: headChunks.map((chunk, chunkIndex) => ({
      queryKey: [
        "vault-pull-request-resources",
        vaultId,
        workerIds,
        projectIds,
        chunk.map(resourceHeadKey),
      ],
      queryFn: async () => {
        if (!vaultId) {
          throw new Error("Vault is required to load pull request resources.");
        }
        return await getVisibleResources({ vaultId, heads: chunk });
      },
      enabled: Boolean(vaultId && chunk.length > 0),
      staleTime: PULL_REQUEST_STALE_MS,
      gcTime: PULL_REQUEST_GC_MS,
      retry: false,
      refetchOnMount: chunkIndex === 0,
      refetchOnWindowFocus: chunkIndex === 0,
      refetchOnReconnect: chunkIndex === 0,
      refetchInterval: (query: { state: { data: PullRequestResources[] | undefined } }) =>
        chunkIndex === 0 && resourcesNeedPolling(query.state.data) ? PULL_REQUEST_STALE_MS : false,
      refetchIntervalInBackground: false,
    })),
  });

  const resourcesByPullRequestId = useMemo(() => {
    const resources = new Map<string, PullRequestResourceState>();
    for (const [chunkIndex, chunk] of headChunks.entries()) {
      const query = resourceQueries[chunkIndex];
      const byPullRequestId = new Map(
        (query.data ?? []).map((pullRequest) => [pullRequest.pullRequestId, pullRequest]),
      );
      for (const head of chunk) {
        const pullRequestResources = byPullRequestId.get(head.id);
        if (!pullRequestResources) {
          resources.set(head.id, { state: query.isError ? "failed" : "loading" });
          continue;
        }
        resources.set(head.id, {
          state:
            query.isRefetchError || args.now > query.dataUpdatedAt + PULL_REQUEST_STALE_MS
              ? "stale"
              : "current",
          resources: pullRequestResources,
        });
      }
    }
    return resources;
  }, [args.now, headChunks, resourceQueries]);

  const resourceStates = [...resourcesByPullRequestId.values()].map((resource) => resource.state);
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
    queryClient.removeQueries({ queryKey: continuationKey, exact: true });
    void firstPageQuery.refetch();
  };

  if (!vaultId) {
    return { state: "not_requested" };
  }
  if (!firstPageQuery.data) {
    return firstPageQuery.isError ? { state: "problem", reload } : { state: "loading" };
  }

  const lastPage = pages.at(-1) ?? firstPageQuery.data;
  const hasMore = nextCursor(lastPage) !== null;
  const canLoadMore = hasMore && !continuationQuery.isFetchingNextPage;
  return {
    state:
      firstPageQuery.isRefetchError ||
      args.now > firstPageQuery.dataUpdatedAt + PULL_REQUEST_STALE_MS
        ? "stale"
        : "current",
    pullRequests,
    allPullRequests,
    refreshing:
      firstPageQuery.isFetching ||
      continuationQuery.isFetchingNextPage ||
      resourceQueries.some((query) => query.isFetching),
    resourceState,
    resourcesByPullRequestId,
    hasMore,
    isLoadingMore: continuationQuery.isFetchingNextPage,
    canLoadMore,
    loadMoreFailed: continuationQuery.isFetchNextPageError,
    reload,
    reloadResources,
    loadMore: () => {
      if (canLoadMore) {
        void continuationQuery.fetchNextPage();
      }
    },
  };
}
