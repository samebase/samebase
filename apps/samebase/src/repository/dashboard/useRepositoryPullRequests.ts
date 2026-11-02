import { api } from "../../../convex/_generated/api";
import type {
  RepositoryPullRequest as RepositoryPullRequestPayload,
  RepositoryPullRequestPage,
  RepositoryStatusCheckRollup,
} from "../../../convex/repository/pullRequestModel";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import {
  summarizeRepositoryChecks,
  type RepositoryCheckSummary,
} from "../../../shared/repositoryChecks";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useCallback, useMemo } from "react";
import { buildAlchemyStackCards, type RepositoryStackCard } from "./repositoryEnvironmentRoots";
import type { RepositoryAlchemyState } from "./useRepositoryAlchemyState";

const PULL_REQUEST_STALE_MS = 60_000;
const PULL_REQUEST_GC_MS = 5 * 60_000;
const PULL_REQUEST_PAGE_SIZE = 6;
const INITIAL_PULL_REQUEST_CURSOR: string | null = null;

type RepositoryPullRequestTarget = Pick<
  UserRepositoryResult,
  "providerSetup" | "repositoryId" | "sourceSetup"
>;

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

/**
The read of the team store for a pull request row. `stackCards` are the cards of the stacks with the
stage of the pull request, `pr-<number>`, which the browser builds from its store subscription.
*/
export type PullRequestResourceState =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "loaded"; stackCards: readonly RepositoryStackCard[] };

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

function uniquePullRequests(
  pages: readonly RepositoryPullRequestPage[],
): RepositoryPullRequestPayload[] {
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

export function useRepositoryPullRequests(args: {
  repository: RepositoryPullRequestTarget | null;
  alchemyState: RepositoryAlchemyState;
}): RepositoryPullRequestsState {
  const listOpenPullRequests = useAction(api.repositoryPullRequests.listOpenPullRequests);

  const repositoryId = args.repository?.repositoryId;
  const sourceSetupStatus = args.repository?.sourceSetup.status;
  const providerSetupStatus = args.repository?.providerSetup.status;
  const { alchemyState } = args;

  const pullRequestQuery = useInfiniteQuery({
    // A setup step that pushes the first commit moves one of these statuses, so a read after it
    // does not reuse the answer of the empty repository.
    queryKey: ["repository-pull-requests", repositoryId, sourceSetupStatus, providerSetupStatus],
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
  const allPullRequests = useMemo(() => uniquePullRequests(pages).map(presentPullRequest), [pages]);
  const defaultBranch = defaultBranchFromPage(pages.at(0));
  const openPullRequestCount = pages.at(0)?.repository?.pullRequests.totalCount;

  const resourcesByPullRequestId = useMemo(
    () =>
      new Map(
        allPullRequests.map((pullRequest): [string, PullRequestResourceState] => [
          pullRequest.id,
          alchemyState.state === "loaded"
            ? {
                state: "loaded",
                stackCards:
                  alchemyState.observation.store === "found"
                    ? buildAlchemyStackCards({
                        stacks: alchemyState.observation,
                        stage: {
                          name: `pr-${pullRequest.number}`,
                          headCommit: pullRequest.headRefOid,
                        },
                      })
                    : [],
              }
            : { state: alchemyState.state },
        ]),
      ),
    [allPullRequests, alchemyState],
  );

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
    refreshing: pullRequestQuery.isFetching,
    resourcesByPullRequestId,
    loadMore: loadMoreState,
  };
}
