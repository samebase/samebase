import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type {
  RepositoryPullRequest,
  RepositoryPullRequestPage,
} from "../../convex/repositoryPullRequests";
import type { PullRequestResources } from "../../convex/vault/pullRequestResources";
import {
  filterVaultPullRequests,
  type VaultPullRequestFilters,
} from "@/components/vault-dashboard/vaultDashboardPullRequestFilters";
import { summarizePullRequestChecks, type PullRequestCheckSummary } from "@/lib/pullRequestChecks";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useMemo } from "react";

const PULL_REQUEST_STALE_MS = 60_000;
const PULL_REQUEST_GC_MS = 5 * 60_000;
const PULL_REQUEST_PAGE_SIZE = 25;
const INITIAL_PULL_REQUEST_CURSOR: string | null = null;

type ObservedPullRequestPage = {
  observedAt: number;
  page: RepositoryPullRequestPage;
};

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

export function useVaultPullRequests(args: {
  vault: VaultPullRequestTarget | null;
  filters: VaultPullRequestFilters;
  now: number;
}): VaultPullRequestsState {
  const listOpenPullRequests = useAction(api.repositoryPullRequests.listOpenPullRequests);
  const getPullRequestResources = useAction(api.vault.pullRequestResources.getPullRequestResources);
  const vaultId = args.vault?._id;
  const workerIds = [...(args.vault?.cloudflareWorkers ?? [])]
    .map((worker) => worker.workerId)
    .sort((left, right) => left.localeCompare(right));
  const projectIds = [...(args.vault?.convexProjects ?? [])]
    .map((project) => project.convexProjectId)
    .sort((left, right) => left.localeCompare(right));
  const pullRequestQuery = useInfiniteQuery({
    queryKey: ["vault-pull-requests", vaultId],
    queryFn: async ({ pageParam }) => {
      if (!vaultId) {
        throw new Error("Vault is required to load pull requests.");
      }
      const page = await listOpenPullRequests({
        vaultId,
        first: PULL_REQUEST_PAGE_SIZE,
        after: pageParam,
      });
      if (page.repository === null) {
        throw new Error("GitHub repository unavailable.");
      }
      return { observedAt: Date.now(), page };
    },
    initialPageParam: INITIAL_PULL_REQUEST_CURSOR,
    getNextPageParam: (lastPage: ObservedPullRequestPage) => nextCursor(lastPage.page) ?? undefined,
    enabled: Boolean(vaultId),
    staleTime: PULL_REQUEST_STALE_MS,
    gcTime: PULL_REQUEST_GC_MS,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.pages.some((observedPage) => pageNeedsPolling(observedPage.page)) === true
        ? PULL_REQUEST_STALE_MS
        : false,
    refetchIntervalInBackground: false,
  });
  const observedPages = pullRequestQuery.data?.pages;
  const pages = useMemo(
    () => observedPages?.map((observedPage) => observedPage.page) ?? [],
    [observedPages],
  );
  const allPullRequests = useMemo(() => uniquePullRequests(pages).map(presentPullRequest), [pages]);
  const pullRequests = useMemo(
    () => filterVaultPullRequests(allPullRequests, args.filters),
    [allPullRequests, args.filters],
  );
  const pullRequestIds = useMemo(
    () => allPullRequests.map((pullRequest) => pullRequest.id),
    [allPullRequests],
  );
  const resourceQuery = useQuery({
    queryKey: ["vault-pull-request-resources", vaultId, workerIds, projectIds, pullRequestIds],
    queryFn: async () => {
      if (!vaultId) {
        throw new Error("Vault is required to load pull request resources.");
      }
      return await getPullRequestResources({ vaultId, pullRequestIds });
    },
    enabled: Boolean(vaultId && pullRequestIds.length > 0),
    staleTime: PULL_REQUEST_STALE_MS,
    gcTime: PULL_REQUEST_GC_MS,
    retry: false,
    refetchInterval: (query: { state: { data: PullRequestResources[] | undefined } }) =>
      resourcesNeedPolling(query.state.data) ? PULL_REQUEST_STALE_MS : false,
    refetchIntervalInBackground: false,
  });

  const resourcesByPullRequestId = useMemo(() => {
    const resources = new Map<string, PullRequestResourceState>();
    const byPullRequestId = new Map(
      (resourceQuery.data ?? []).map((pullRequest) => [pullRequest.pullRequestId, pullRequest]),
    );
    for (const pullRequestId of pullRequestIds) {
      const pullRequestResources = byPullRequestId.get(pullRequestId);
      if (!pullRequestResources) {
        resources.set(pullRequestId, { state: resourceQuery.isError ? "failed" : "loading" });
        continue;
      }
      resources.set(pullRequestId, {
        state:
          resourceQuery.isRefetchError ||
          args.now > resourceQuery.dataUpdatedAt + PULL_REQUEST_STALE_MS
            ? "stale"
            : "current",
        resources: pullRequestResources,
      });
    }
    return resources;
  }, [args.now, pullRequestIds, resourceQuery]);

  const resourceStates = [...resourcesByPullRequestId.values()].map((resource) => resource.state);
  const resourceState = resourceStates.includes("failed")
    ? "failed"
    : resourceStates.includes("stale")
      ? "stale"
      : resourceStates.includes("loading")
        ? "loading"
        : "current";
  const reloadResources = () => {
    void resourceQuery.refetch();
  };
  const reload = () => {
    void pullRequestQuery.refetch();
  };

  if (!vaultId) {
    return { state: "not_requested" };
  }
  if (!pullRequestQuery.data) {
    return pullRequestQuery.isError ? { state: "problem", reload } : { state: "loading" };
  }

  const lastPage = pages.at(-1);
  if (!lastPage) {
    throw new Error("Pull request query returned no provider pages.");
  }
  const hasMore = nextCursor(lastPage) !== null;
  const canLoadMore = hasMore && !pullRequestQuery.isFetchingNextPage;
  const firstPageObservedAt = observedPages?.at(0)?.observedAt;
  if (firstPageObservedAt === undefined) {
    throw new Error("Pull request query returned an unobserved provider page.");
  }
  return {
    state:
      (pullRequestQuery.isRefetchError && !pullRequestQuery.isFetchNextPageError) ||
      args.now > firstPageObservedAt + PULL_REQUEST_STALE_MS
        ? "stale"
        : "current",
    pullRequests,
    allPullRequests,
    refreshing: pullRequestQuery.isFetching || resourceQuery.isFetching,
    resourceState,
    resourcesByPullRequestId,
    hasMore,
    isLoadingMore: pullRequestQuery.isFetchingNextPage,
    canLoadMore,
    loadMoreFailed: pullRequestQuery.isFetchNextPageError,
    reload,
    reloadResources,
    loadMore: () => {
      if (canLoadMore) {
        void pullRequestQuery.fetchNextPage();
      }
    },
  };
}
