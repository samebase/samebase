import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type {
  RepositoryPullRequest,
  RepositoryPullRequestPage,
  RepositoryStatusCheckRollup,
} from "../../convex/repositoryPullRequests";
import type { UserVaultResult } from "../../convex/vault/contracts/getUserVaults";
import type {
  PullRequestResourceRead,
  PullRequestResources,
} from "../../convex/vault/pullRequestResources";
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
    rootDirectory: string;
  }[];
  convexProjects: readonly {
    convexProjectId: Id<"vaultConvexProjects">;
    teamId: string;
    projectId: string;
    codeLocation: ConvexCodeLocation;
  }[];
};

type PullRequestResourceIdentity = readonly [pullRequestId: string, headRefOid: string];

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
  openPullRequestCount: number;
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

function resourcesNeedPolling(resources: PullRequestResourceRead[] | undefined): boolean {
  return (
    resources?.some(
      (pullRequest) =>
        pullRequest.state === "available" &&
        pullRequest.workers.some(
          (worker) =>
            worker.cloudflareBuild.state === "available" &&
            (worker.cloudflareBuild.buildState === "queued" ||
              worker.cloudflareBuild.buildState === "running"),
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
  pullRequestResourceIdentityPages: PullRequestResourceIdentity[][];
} {
  const seen = new Set<string>();
  const pullRequests: RepositoryPullRequest[] = [];
  const pullRequestResourceIdentityPages: PullRequestResourceIdentity[][] = [];
  for (const page of pages) {
    const pagePullRequestResourceIdentities: PullRequestResourceIdentity[] = [];
    for (const pullRequest of pullRequestsFromPage(page)) {
      if (seen.has(pullRequest.id)) {
        continue;
      }
      seen.add(pullRequest.id);
      pullRequests.push(pullRequest);
      pagePullRequestResourceIdentities.push([pullRequest.id, pullRequest.headRefOid]);
    }
    if (pagePullRequestResourceIdentities.length > 0) {
      pullRequestResourceIdentityPages.push(pagePullRequestResourceIdentities);
    }
  }
  return { pullRequests, pullRequestResourceIdentityPages };
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
      rootDirectory: worker.rootDirectory,
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
        throw new Error("Repository is required to load pull requests.");
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
    // TanStack keeps the retained pages and refetches them through their current
    // cursors, so refreshing does not collapse the list or move the scroll
    // position. Polling every minute also lets a settled repository discover a
    // newly opened pull request without requiring navigation.
    refetchInterval: PULL_REQUEST_STALE_MS,
    refetchIntervalInBackground: false,
  });

  const pages = useMemo(() => pullRequestQuery.data?.pages ?? [], [pullRequestQuery.data?.pages]);
  const uniquePages = useMemo(() => uniquePullRequestsByPage(pages), [pages]);
  const allPullRequests = useMemo(
    () => uniquePages.pullRequests.map(presentPullRequest),
    [uniquePages.pullRequests],
  );
  const defaultBranch = defaultBranchFromPage(pages.at(0));
  const openPullRequestCount = pages.at(0)?.repository?.pullRequests.totalCount;
  const pullRequestResourceIdentityPages = uniquePages.pullRequestResourceIdentityPages;

  const resourceQueries = useQueries({
    queries: pullRequestResourceIdentityPages.map(
      (pagePullRequestResourceIdentities, pageIndex) => ({
        queryKey: [
          ...vaultExternalDataQueryKey(vaultId),
          "pull-request-resources",
          workerAttachments,
          projectAttachments,
          pagePullRequestResourceIdentities,
        ],
        queryFn: async () => {
          if (!vaultId) {
            throw new Error("Repository is required to load pull request resources.");
          }
          return await getPullRequestResources({
            vaultId,
            pullRequestIds: pagePullRequestResourceIdentities.map(
              ([pullRequestId]) => pullRequestId,
            ),
          });
        },
        enabled: Boolean(vaultId),
        staleTime: PULL_REQUEST_STALE_MS,
        gcTime: PULL_REQUEST_GC_MS,
        retry: false,
        refetchInterval: (query: { state: { data: PullRequestResourceRead[] | undefined } }) =>
          pageIndex === 0 || resourcesNeedPolling(query.state.data) ? PULL_REQUEST_STALE_MS : false,
        refetchIntervalInBackground: false,
      }),
    ),
  });

  const resourcesByPullRequestId = useMemo(() => {
    const resources = new Map<string, PullRequestResourceState>();
    pullRequestResourceIdentityPages.forEach((pagePullRequestResourceIdentities, pageIndex) => {
      const resourceQuery = resourceQueries[pageIndex];
      const byPullRequestId = new Map(
        (resourceQuery.data ?? []).map((pullRequest) => [pullRequest.pullRequestId, pullRequest]),
      );
      for (const [pullRequestId] of pagePullRequestResourceIdentities) {
        const pullRequestResources = byPullRequestId.get(pullRequestId);
        if (!pullRequestResources) {
          resources.set(pullRequestId, { state: resourceQuery.isError ? "failed" : "loading" });
          continue;
        }
        if (pullRequestResources.state === "unavailable") {
          resources.set(pullRequestId, { state: "failed" });
          continue;
        }
        resources.set(pullRequestId, {
          state: resourceQuery.isRefetchError ? "stale" : "current",
          resources: {
            pullRequestId: pullRequestResources.pullRequestId,
            cloudflareBuilds: pullRequestResources.cloudflareBuilds,
            workers: pullRequestResources.workers,
            convexProjects: pullRequestResources.convexProjects,
            hostingPreviews: pullRequestResources.hostingPreviews,
          },
        });
      }
    });
    return resources;
  }, [pullRequestResourceIdentityPages, resourceQueries]);

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
  if (openPullRequestCount === undefined) {
    return { state: "problem", reload };
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
    openPullRequestCount,
    allPullRequests,
    refreshing: pullRequestQuery.isFetching || resourceQueries.some((query) => query.isFetching),
    resourcesStale: [...resourcesByPullRequestId.values()].some(
      (resource) => resource.state === "stale",
    ),
    resourcesByPullRequestId,
    loadMore: loadMoreState,
  };
}
