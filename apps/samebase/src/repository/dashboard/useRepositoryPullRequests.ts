import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  RepositoryPullRequest as RepositoryPullRequestPayload,
  RepositoryPullRequestPage,
  RepositoryStatusCheckRollup,
} from "../../../convex/repository/pullRequestModel";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import type {
  PullRequestResourceRead,
  PullRequestResources,
} from "../../../convex/repository/pullRequestModel";
import {
  summarizeRepositoryChecks,
  type RepositoryCheckSummary,
} from "../../../shared/repositoryChecks";
import { repositoryExternalDataQueryKey } from "@/repository/dashboard/repositoryExternalDataQueryKey";
import { useInfiniteQuery, useQueries } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useCallback, useMemo } from "react";
import type { ConvexCodeLocation } from "../../../shared/convexCodeLocation";

const PULL_REQUEST_STALE_MS = 60_000;
const PULL_REQUEST_GC_MS = 5 * 60_000;
const PULL_REQUEST_PAGE_SIZE = 6;
const INITIAL_PULL_REQUEST_CURSOR: string | null = null;

type RepositoryPullRequestTarget = Pick<UserRepositoryResult, "repositoryId" | "sourceSetup"> & {
  cloudflareWorkers: readonly {
    workerId: Id<"repositoryCloudflareWorkers">;
    accountId: string;
    workerName: string;
    workerTag: string;
    rootDirectory: string;
  }[];
  convexProjects: readonly {
    convexProjectId: Id<"repositoryConvexProjects">;
    teamId: string;
    projectId: string;
    codeLocation: ConvexCodeLocation;
  }[];
};

type PullRequestResourceIdentity = readonly [pullRequestId: string, headRefOid: string];

export type RepositoryPullRequest = Omit<RepositoryPullRequestPayload, "labels"> & {
  labels: RepositoryPullRequestPayload["labels"]["nodes"];
  checks: RepositoryCheckSummary;
};

export type RepositoryDefaultBranchObservation = {
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

export type RepositoryPullRequestLoadMoreState =
  | { state: "available"; load: () => void }
  | { state: "loading" }
  | { state: "failed" }
  | { state: "exhausted" };

type SettledPullRequests = {
  state: "current" | "stale";
  defaultBranch: RepositoryDefaultBranchObservation | null;
  openPullRequestCount: number;
  allPullRequests: RepositoryPullRequest[];
  refreshing: boolean;
  resourcesStale: boolean;
  resourcesByPullRequestId: ReadonlyMap<string, PullRequestResourceState>;
  loadMore: RepositoryPullRequestLoadMoreState;
};

export type RepositoryPullRequestsState =
  | { state: "not_requested" }
  | { state: "loading" }
  | { state: "problem"; reload: () => void }
  | SettledPullRequests;

function pullRequestsFromPage(
  page: RepositoryPullRequestPage | undefined,
): RepositoryPullRequestPayload[] {
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

function presentPullRequest(pullRequest: RepositoryPullRequestPayload): RepositoryPullRequest {
  return {
    ...pullRequest,
    labels: pullRequest.labels.nodes,
    checks: summarizeRepositoryChecks(pullRequest.statusCheckRollup),
  };
}

function defaultBranchFromPage(
  page: RepositoryPullRequestPage | undefined,
): RepositoryDefaultBranchObservation | null {
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
  pullRequests: RepositoryPullRequestPayload[];
  pullRequestResourceIdentityPages: PullRequestResourceIdentity[][];
} {
  const seen = new Set<string>();
  const pullRequests: RepositoryPullRequestPayload[] = [];
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

export function useRepositoryPullRequests(args: {
  repository: RepositoryPullRequestTarget | null;
}): RepositoryPullRequestsState {
  const listOpenPullRequests = useAction(api.repositoryPullRequests.listOpenPullRequests);
  const getPullRequestResources = useAction(
    api.repository.pullRequestResources.getPullRequestResources,
  );

  const repositoryId = args.repository?.repositoryId;
  const sourceSetupStatus = args.repository?.sourceSetup.status;

  const workerAttachments = [...(args.repository?.cloudflareWorkers ?? [])]
    .map((worker) => ({
      workerId: worker.workerId,
      accountId: worker.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
      rootDirectory: worker.rootDirectory,
    }))
    .sort((left, right) => left.workerId.localeCompare(right.workerId));
  const projectAttachments = [...(args.repository?.convexProjects ?? [])]
    .map((project) => ({
      convexProjectId: project.convexProjectId,
      teamId: project.teamId,
      projectId: project.projectId,
      codeLocation: project.codeLocation,
    }))
    .sort((left, right) => left.convexProjectId.localeCompare(right.convexProjectId));

  const pullRequestQuery = useInfiniteQuery({
    queryKey: ["repository-pull-requests", repositoryId, sourceSetupStatus],
    queryFn: async ({ pageParam }) => {
      if (!repositoryId) {
        throw new Error("Repository is required to load pull requests.");
      }
      const page = await listOpenPullRequests({
        repositoryId,
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
    enabled: Boolean(repositoryId),
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
          ...repositoryExternalDataQueryKey(repositoryId),
          "pull-request-resources",
          workerAttachments,
          projectAttachments,
          pagePullRequestResourceIdentities,
        ],
        queryFn: async () => {
          if (!repositoryId) {
            throw new Error("Repository is required to load pull request resources.");
          }
          return await getPullRequestResources({
            repositoryId,
            pullRequestIds: pagePullRequestResourceIdentities.map(
              ([pullRequestId]) => pullRequestId,
            ),
          });
        },
        enabled: Boolean(repositoryId),
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

  if (!repositoryId) {
    return { state: "not_requested" };
  }
  if (!pullRequestQuery.data) {
    return pullRequestQuery.isError ? { state: "problem", reload } : { state: "loading" };
  }
  if (openPullRequestCount === undefined) {
    return { state: "problem", reload };
  }

  const loadMoreState: RepositoryPullRequestLoadMoreState = pullRequestQuery.isFetchingNextPage
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
