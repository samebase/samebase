import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type {
  RepositoryPullRequest,
  RepositoryPullRequestPage,
  RepositoryStatusCheckRollup,
} from "../../convex/repositoryPullRequests";
import type { UserVaultResult } from "../../convex/vault/contracts/getUserVaults";
import type { PullRequestResources } from "../../convex/vault/pullRequestResources";
import { summarizeRepositoryChecks, type RepositoryCheckSummary } from "@/lib/repositoryChecks";
import { useInfiniteQuery, useQueries } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useCallback, useMemo } from "react";
import type { ConvexCodeLocation } from "../../shared/convexCodeLocation";

const PULL_REQUEST_STALE_MS = 60_000;
const PULL_REQUEST_GC_MS = 5 * 60_000;
const PULL_REQUEST_PAGE_SIZE = 6;
const INITIAL_PULL_REQUEST_CURSOR: string | null = null;

type VaultPullRequestTarget = Pick<UserVaultResult, "_id" | "sourceSetup"> & {
  cloudflareWorkers: readonly {
    workerId: Id<"vaultCloudflareWorkers">;
    accountId: string;
    workerName: string;
    workerTag: string;
  }[];
  convexProjects: readonly {
    convexProjectId: Id<"vaultConvexProjects">;
    teamId: string;
    projectId: string;
    codeLocation: ConvexCodeLocation;
  }[];
};

export type VaultPullRequest = Omit<RepositoryPullRequest, "labels"> & {
  labels: RepositoryPullRequest["labels"]["nodes"];
  checks: RepositoryCheckSummary;
};

export type VaultDefaultBranchObservation = {
  headCommitOid: string;
  headCommitTitle: string;
  headCommitCommittedAt: string;
  headCommitUrl: string;
  statusCheckRollup: RepositoryStatusCheckRollup;
  checks: RepositoryCheckSummary;
};

export type PullRequestResourceState =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "current"; resources: PullRequestResources }
  | { state: "stale"; resources: PullRequestResources };

type SettledPullRequests = {
  state: "current" | "stale";
  defaultBranch: VaultDefaultBranchObservation | null;
  allPullRequests: VaultPullRequest[];
  refreshing: boolean;
  resourceState: "current" | "loading" | "stale" | "failed";
  resourcesByPullRequestId: ReadonlyMap<string, PullRequestResourceState>;
  hasMore: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  loadMoreFailed: boolean;
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
  return (
    summarizeRepositoryChecks(page?.repository?.defaultBranch?.statusCheckRollup ?? null).state ===
      "running" ||
    pullRequestsFromPage(page).some(
      (pullRequest) => summarizeRepositoryChecks(pullRequest.statusCheckRollup).state === "running",
    )
  );
}

function resourcesNeedPolling(resources: PullRequestResources[] | undefined): boolean {
  return (
    resources?.some((pullRequest) =>
      pullRequest.workers.some(
        (worker) =>
          worker.state === "available" &&
          (worker.cloudflareBuild.state === "queued" || worker.cloudflareBuild.state === "running"),
      ),
    ) === true
  );
}

function presentPullRequest(pullRequest: RepositoryPullRequest): VaultPullRequest {
  return {
    ...pullRequest,
    labels: pullRequest.labels.nodes,
    checks: summarizeRepositoryChecks(pullRequest.statusCheckRollup),
  };
}

function defaultBranchFromPage(
  page: RepositoryPullRequestPage | undefined,
): VaultDefaultBranchObservation | null {
  const defaultBranch = page?.repository?.defaultBranch;
  if (!defaultBranch) {
    return null;
  }
  return {
    headCommitOid: defaultBranch.headCommitOid,
    headCommitTitle: defaultBranch.headCommitTitle,
    headCommitCommittedAt: defaultBranch.headCommitCommittedAt,
    headCommitUrl: defaultBranch.headCommitUrl,
    statusCheckRollup: defaultBranch.statusCheckRollup,
    checks: summarizeRepositoryChecks(defaultBranch.statusCheckRollup),
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

function uniquePullRequestIdPages(pages: readonly RepositoryPullRequestPage[]): string[][] {
  const seen = new Set<string>();
  return pages.flatMap((page) => {
    const pullRequestIds = pullRequestsFromPage(page).flatMap((pullRequest) => {
      if (seen.has(pullRequest.id)) {
        return [];
      }
      seen.add(pullRequest.id);
      return [pullRequest.id];
    });
    return pullRequestIds.length > 0 ? [pullRequestIds] : [];
  });
}

export function useVaultPullRequests(args: {
  vault: VaultPullRequestTarget | null;
}): VaultPullRequestsState {
  const listOpenPullRequests = useAction(api.repositoryPullRequests.listOpenPullRequests);
  const getPullRequestResources = useAction(api.vault.pullRequestResources.getPullRequestResources);
  const vaultId = args.vault?._id;
  const sourceSetupStatus = args.vault?.sourceSetup.status;
  const workerAttachments = [...(args.vault?.cloudflareWorkers ?? [])]
    .map((worker) => ({
      workerId: worker.workerId,
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
    }))
    .sort((left, right) => left.workerId.localeCompare(right.workerId));
  const projectAttachments = [...(args.vault?.convexProjects ?? [])]
    .map((project) => ({
      convexProjectId: project.convexProjectId,
      teamId: project.teamId,
      projectId: project.projectId,
      codeLocation: project.codeLocation,
    }))
    .sort((left, right) => left.convexProjectId.localeCompare(right.convexProjectId));
  const pullRequestQuery = useInfiniteQuery({
    queryKey: ["vault-pull-requests", vaultId, sourceSetupStatus],
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
      return page;
    },
    initialPageParam: INITIAL_PULL_REQUEST_CURSOR,
    getNextPageParam: (lastPage) => nextCursor(lastPage) ?? undefined,
    enabled: Boolean(vaultId),
    staleTime: PULL_REQUEST_STALE_MS,
    gcTime: PULL_REQUEST_GC_MS,
    retry: false,
    refetchInterval: (query) => {
      const pages = query.state.data?.pages;
      if (!pages) {
        return false;
      }
      // Refreshing every retained infinite-query page would make provider traffic
      // grow with scroll depth. Keep the visible first page current, while running
      // checks on any loaded page still justify refreshing the full query.
      return pages.length === 1 || pages.some(pageNeedsPolling) ? PULL_REQUEST_STALE_MS : false;
    },
    refetchIntervalInBackground: false,
  });
  const pages = useMemo(() => pullRequestQuery.data?.pages ?? [], [pullRequestQuery.data?.pages]);
  const allPullRequests = useMemo(() => uniquePullRequests(pages).map(presentPullRequest), [pages]);
  const defaultBranch = defaultBranchFromPage(pages.at(0));
  const pullRequestIdPages = useMemo(() => uniquePullRequestIdPages(pages), [pages]);
  const resourceQueries = useQueries({
    queries: pullRequestIdPages.map((pagePullRequestIds, pageIndex) => ({
      queryKey: [
        "vault-provider-observations",
        vaultId,
        "pull-request-resources",
        workerAttachments,
        projectAttachments,
        pagePullRequestIds,
      ],
      queryFn: async () => {
        if (!vaultId) {
          throw new Error("Vault is required to load pull request resources.");
        }
        return await getPullRequestResources({ vaultId, pullRequestIds: pagePullRequestIds });
      },
      enabled: Boolean(vaultId),
      staleTime: PULL_REQUEST_STALE_MS,
      gcTime: PULL_REQUEST_GC_MS,
      retry: false,
      refetchInterval: (query: { state: { data: PullRequestResources[] | undefined } }) =>
        pageIndex === 0 || resourcesNeedPolling(query.state.data) ? PULL_REQUEST_STALE_MS : false,
      refetchIntervalInBackground: false,
    })),
  });

  const resourcesByPullRequestId = useMemo(() => {
    const resources = new Map<string, PullRequestResourceState>();
    pullRequestIdPages.forEach((pagePullRequestIds, pageIndex) => {
      const resourceQuery = resourceQueries[pageIndex];
      const byPullRequestId = new Map(
        (resourceQuery.data ?? []).map((pullRequest) => [pullRequest.pullRequestId, pullRequest]),
      );
      for (const pullRequestId of pagePullRequestIds) {
        const pullRequestResources = byPullRequestId.get(pullRequestId);
        if (!pullRequestResources) {
          resources.set(pullRequestId, { state: resourceQuery.isError ? "failed" : "loading" });
          continue;
        }
        resources.set(pullRequestId, {
          state: resourceQuery.isRefetchError ? "stale" : "current",
          resources: pullRequestResources,
        });
      }
    });
    return resources;
  }, [pullRequestIdPages, resourceQueries]);

  const resourceStates = [...resourcesByPullRequestId.values()].map((resource) => resource.state);
  const resourceState = resourceStates.includes("failed")
    ? "failed"
    : resourceStates.includes("stale")
      ? "stale"
      : resourceStates.includes("loading")
        ? "loading"
        : "current";
  const fetchNextPage = pullRequestQuery.fetchNextPage;
  const refetchPullRequests = pullRequestQuery.refetch;
  const hasNextPage = pullRequestQuery.hasNextPage;
  const isFetchNextPageError = pullRequestQuery.isFetchNextPageError;
  const isFetchingNextPage = pullRequestQuery.isFetchingNextPage;
  const loadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage || isFetchNextPageError) {
      return;
    }
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchNextPageError, isFetchingNextPage]);
  const reload = useCallback(() => {
    void refetchPullRequests();
  }, [refetchPullRequests]);
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
  const canLoadMore = hasMore && !isFetchingNextPage && !isFetchNextPageError;
  return {
    state:
      pullRequestQuery.isRefetchError && !pullRequestQuery.isFetchNextPageError
        ? "stale"
        : "current",
    defaultBranch,
    allPullRequests,
    refreshing: pullRequestQuery.isFetching || resourceQueries.some((query) => query.isFetching),
    resourceState,
    resourcesByPullRequestId,
    hasMore,
    isLoadingMore: isFetchingNextPage,
    canLoadMore,
    loadMoreFailed: isFetchNextPageError,
    loadMore,
  };
}
