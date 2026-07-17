import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  cloudflareCanRefetch,
  cloudflareRefetchDelay,
  mapCloudflarePageObservation,
  refreshRepositoryPullRequestFirstPage,
  repositoryPullRequestCanRefetch,
  repositoryPullRequestRefetchDelay,
  selectCurrentRepositoryMetadata,
  type CurrentPullRequestPage,
} from "./useRepositoryPullRequestObservations";
import type { PullRequestHeadIdentity } from "../../convex/repositoryObservations";

const head = {
  baseRepositoryNodeId: "R_base",
  pullRequestNodeId: "PR_1",
  headRepositoryNodeId: "R_base",
  headRefName: "feature",
  headCommitNodeId: "C_head",
  headOid: "head-sha",
} satisfies PullRequestHeadIdentity;

function repositoryPage(args: {
  continuation: CurrentPullRequestPage["continuation"];
  freshUntil: number;
  observedAt: number;
}): CurrentPullRequestPage {
  return {
    state: "current",
    observedAt: args.observedAt,
    freshUntil: args.freshUntil,
    repositoryNodeId: "R_base",
    repositoryDatabaseId: "42",
    repositoryFullName: "samebase/samebase",
    defaultBranch: { state: "absent" },
    providerOpenPullRequestCount: 0,
    scannedPullRequestCount: 0,
    providerSequenceDrifted: false,
    pullRequests: [],
    continuation: args.continuation,
    requestUsage: {
      requestCount: 1,
      cost: 1,
      limit: 5_000,
      remaining: 4_999,
      resetAt: 1_800_000_000_000,
    },
  };
}

describe("refreshRepositoryPullRequestFirstPage", () => {
  it("refreshes page one after a newer pagination request updated the cache timestamp", async () => {
    const queryClient = new QueryClient();
    const queryKey = ["repository-observation-test"] as const;
    const now = Date.now();
    const oldFirstPage = repositoryPage({
      observedAt: now - 60_001,
      freshUntil: now - 1,
      continuation: { kind: "next_page", cursor: "page-2" },
    });
    const recentSecondPage = repositoryPage({
      observedAt: now,
      freshUntil: now + 60_000,
      continuation: { kind: "complete" },
    });
    const refreshedFirstPage = repositoryPage({
      observedAt: now + 1,
      freshUntil: now + 60_001,
      continuation: { kind: "complete" },
    });
    queryClient.setQueryData(
      queryKey,
      {
        pages: [oldFirstPage, recentSecondPage],
        pageParams: [null, "page-2"],
      },
      { updatedAt: now },
    );
    const queryFn = vi.fn(async () => refreshedFirstPage);

    await refreshRepositoryPullRequestFirstPage({
      queryClient,
      queryKey,
      queryFn,
      getNextPageParam: (lastPage) =>
        lastPage.continuation.kind === "complete" ? undefined : lastPage.continuation.cursor,
    });

    expect(queryFn).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(queryKey)).toEqual({
      pages: [refreshedFirstPage],
      pageParams: [null],
    });
  });

  it("keeps stale browsing pages when the newest-page refresh fails", async () => {
    const queryClient = new QueryClient();
    const queryKey = ["repository-observation-failure-test"] as const;
    const now = Date.now();
    const staleData = {
      pages: [
        repositoryPage({
          observedAt: now - 60_001,
          freshUntil: now - 1,
          continuation: { kind: "next_page", cursor: "page-2" },
        }),
        repositoryPage({
          observedAt: now,
          freshUntil: now + 60_000,
          continuation: { kind: "complete" },
        }),
      ],
      pageParams: [null, "page-2"],
    };
    queryClient.setQueryData(queryKey, staleData, { updatedAt: now });

    await expect(
      refreshRepositoryPullRequestFirstPage({
        queryClient,
        queryKey,
        queryFn: async () => {
          throw new Error("provider failed");
        },
        getNextPageParam: (lastPage) =>
          lastPage.continuation.kind === "complete" ? undefined : lastPage.continuation.cursor,
      }),
    ).rejects.toThrow("provider failed");
    expect(queryClient.getQueryData(queryKey)).toEqual(staleData);
  });
});

describe("mapCloudflarePageObservation", () => {
  it("distinguishes a request that has not started from loading", () => {
    expect(
      mapCloudflarePageObservation({
        batch: undefined,
        error: null,
        fetchStatus: "idle",
        heads: [head],
        now: 1_700_000_000_000,
      }),
    ).toEqual([["PR_1", { state: "not_requested" }]]);
    expect(
      mapCloudflarePageObservation({
        batch: undefined,
        error: null,
        fetchStatus: "fetching",
        heads: [head],
        now: 1_700_000_000_000,
      }),
    ).toEqual([["PR_1", { state: "loading" }]]);
  });

  it("labels expired absence stale while its refresh is running", () => {
    expect(
      mapCloudflarePageObservation({
        batch: {
          state: "observed",
          observedAt: 1_700_000_000_000,
          observations: [
            {
              state: "fresh_absence",
              head,
              observedAt: 1_700_000_000_000,
            },
          ],
        },
        error: null,
        fetchStatus: "fetching",
        heads: [head],
        now: 1_700_000_060_001,
      }),
    ).toEqual([
      [
        "PR_1",
        {
          state: "stale",
          head,
          observedAt: 1_700_000_000_000,
          lastKnown: { state: "fresh_absence" },
          refresh: { state: "loading" },
        },
      ],
    ]);
  });

  it("does not invent a provider failure before an expired result is re-requested", () => {
    expect(
      mapCloudflarePageObservation({
        batch: {
          state: "observed",
          observedAt: 1_700_000_000_000,
          observations: [
            {
              state: "fresh_absence",
              head,
              observedAt: 1_700_000_000_000,
            },
          ],
        },
        error: null,
        fetchStatus: "idle",
        heads: [head],
        now: 1_700_000_060_001,
      }),
    ).toMatchObject([
      [
        "PR_1",
        {
          state: "stale",
          refresh: { state: "not_requested" },
        },
      ],
    ]);
  });
});

describe("repository observation refetch policy", () => {
  it("retries initial provider failures without hiding the visible failure state", () => {
    expect(
      repositoryPullRequestRefetchDelay({
        loadedPageCount: 0,
        now: 10_000,
        problem: { state: "provider_failure", reason: "request_failed" },
      }),
    ).toBe(60_000);
    expect(
      repositoryPullRequestCanRefetch({
        failureObservedAt: 5_000,
        now: 65_000,
        problem: { state: "provider_failure", reason: "request_failed" },
      }),
    ).toBe(true);
  });

  it("respects provider retry times for initial and per-head budget deferrals", () => {
    expect(
      repositoryPullRequestRefetchDelay({
        loadedPageCount: 0,
        now: 10_000,
        problem: { state: "budget_deferred", reason: "rate_limit", retryAt: 42_000 },
      }),
    ).toBe(32_000);
    expect(
      repositoryPullRequestCanRefetch({
        failureObservedAt: null,
        now: 10_000,
        problem: { state: "budget_deferred", reason: "rate_limit", retryAt: 42_000 },
      }),
    ).toBe(false);

    const batch = {
      state: "observed" as const,
      observedAt: 9_000,
      observations: [
        {
          state: "budget_deferred" as const,
          head,
          reason: "request_budget" as const,
          retryAt: 35_000,
        },
      ],
    };
    expect(
      cloudflareRefetchDelay({
        batch,
        loadedPageCount: 1,
        now: 10_000,
        problem: null,
      }),
    ).toBe(25_000);
    expect(
      cloudflareCanRefetch({
        batch,
        failureObservedAt: null,
        now: 10_000,
        problem: null,
      }),
    ).toBe(false);
  });

  it("stops multi-page polling while keeping first-page refresh available", () => {
    expect(
      repositoryPullRequestRefetchDelay({ loadedPageCount: 2, now: 10_000, problem: null }),
    ).toBe(false);
    expect(
      repositoryPullRequestCanRefetch({
        failureObservedAt: null,
        now: 10_000,
        problem: null,
      }),
    ).toBe(true);
    expect(
      cloudflareRefetchDelay({
        batch: undefined,
        loadedPageCount: 2,
        now: 10_000,
        problem: null,
      }),
    ).toBe(false);
    expect(
      cloudflareCanRefetch({
        batch: undefined,
        failureObservedAt: null,
        now: 10_000,
        problem: null,
      }),
    ).toBe(true);
  });

  it("allows unavailable providers to recover on focus or reconnect without polling", () => {
    const problem = {
      state: "provider_unavailable",
      reason: "github_connection_unavailable",
    } as const;

    expect(
      repositoryPullRequestRefetchDelay({
        loadedPageCount: 0,
        now: 10_000,
        problem,
      }),
    ).toBe(false);
    expect(
      repositoryPullRequestCanRefetch({
        failureObservedAt: null,
        now: 10_000,
        problem,
      }),
    ).toBe(true);
  });
});

describe("selectCurrentRepositoryMetadata", () => {
  const noChecks = {
    state: "none",
    totalCount: 0,
    checkRunCount: 0,
    statusContextCount: 0,
    successCount: 0,
    failureCount: 0,
    runningCount: 0,
    neutralCount: 0,
    unknownCount: 0,
  } as const;

  it("uses the newest loaded page metadata and reports cross-page drift", () => {
    const firstPage = {
      observedAt: 10_000,
      repositoryNodeId: "R_repo",
      repositoryDatabaseId: "42",
      repositoryFullName: "samebase/samebase",
      providerOpenPullRequestCount: 2,
      defaultBranch: {
        state: "ready",
        name: "main",
        headCommitNodeId: "C_old",
        headOid: "old-sha",
        checks: noChecks,
      },
    } as const;
    const newestPage = {
      ...firstPage,
      observedAt: 20_000,
      providerOpenPullRequestCount: 3,
      defaultBranch: {
        ...firstPage.defaultBranch,
        headCommitNodeId: "C_new",
        headOid: "new-sha",
      },
    } as const;

    expect(selectCurrentRepositoryMetadata(firstPage, [newestPage])).toEqual({
      defaultBranch: newestPage.defaultBranch,
      drifted: true,
      providerOpenPullRequestCount: 3,
    });
  });
});
