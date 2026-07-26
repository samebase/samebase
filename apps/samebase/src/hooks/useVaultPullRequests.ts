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
import { vaultExternalDataQueryKey } from "@/lib/vaultExternalDataQueryKey";
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

export type VaultPullRequestLoadMoreState =
  | { state: "available"; load: () => void }
  | { state: "loading" }
  | { state: "failed" }
  | { state: "exhausted" };

type SettledPullRequests = {
  state: "current" | "stale";
  defaultBranch: VaultDefaultBranchObservation | null;
  allPullRequests: VaultPullRequest[];
  refreshing: boolean;
  resourcesStale: boolean;
  resourcesByPullRequestId: ReadonlyMap<string, PullRequestResourceState>;
  loadMore: VaultPullRequestLoadMoreState;
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

function uniquePullRequestsByPage(pages: readonly RepositoryPullRequestPage[]): {
  pullRequests: RepositoryPullRequest[];
  pullRequestIdPages: string[][];
} {
  const seen = new Set<string>();
  const pullRequests: RepositoryPullRequest[] = [];
  const pullRequestIdPages: string[][] = [];
  for (const page of pages) {
    const pagePullRequestIds: string[] = [];
    for (const pullRequest of pullRequestsFromPage(page)) {
      if (seen.has(pullRequest.id)) {
        continue;
      }
      seen.add(pullRequest.id);
      pullRequests.push(pullRequest);
      pagePullRequestIds.push(pullRequest.id);
    }
    if (pagePullRequestIds.length > 0) {
      pullRequestIdPages.push(pagePullRequestIds);
    }
  }
  return { pullRequests, pullRequestIdPages };
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
  const uniquePages = useMemo(() => uniquePullRequestsByPage(pages), [pages]);
  const allPullRequests = useMemo(
    () => uniquePages.pullRequests.map(presentPullRequest),
    [uniquePages.pullRequests],
  );
  const defaultBranch = defaultBranchFromPage(pages.at(0));
  const pullRequestIdPages = uniquePages.pullRequestIdPages;

  const resourceQueries = useQueries({
    queries: pullRequestIdPages.map((pagePullRequestIds, pageIndex) => ({
      queryKey: [
        ...vaultExternalDataQueryKey(vaultId),
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

  const { fetchNextPage, refetch } = pullRequestQuery;
  const loadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);
  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  if (!vaultId) {
    return { state: "not_requested" };
  }
  if (!pullRequestQuery.data) {
    return pullRequestQuery.isError ? { state: "problem", reload } : { state: "loading" };
  }

  const loadMoreState: VaultPullRequestLoadMoreState = pullRequestQuery.isFetchingNextPage
    ? { state: "loading" }
    : pullRequestQuery.isFetchNextPageError
      ? { state: "failed" }
      : pullRequestQuery.hasNextPage
        ? { state: "available", load: loadMore }
        : { state: "exhausted" };

  return {
    state:
      pullRequestQuery.isRefetchError && !pullRequestQuery.isFetchNextPageError
        ? "stale"
        : "current",
    defaultBranch,
    allPullRequests,
    refreshing: pullRequestQuery.isFetching || resourceQueries.some((query) => query.isFetching),
    resourcesStale: [...resourcesByPullRequestId.values()].some(
      (resource) => resource.state === "stale",
    ),
    resourcesByPullRequestId,
    loadMore: loadMoreState,
  };
}
