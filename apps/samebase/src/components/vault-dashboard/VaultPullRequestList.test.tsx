import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { VaultPullRequestList } from "@/components/vault-dashboard/VaultPullRequestList";
import type { VaultPullRequest, VaultPullRequestsState } from "@/hooks/useVaultPullRequests";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import type { Id } from "../../../convex/_generated/dataModel";

function fakeWorkerId(value: string): Id<"vaultCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; this rendering test needs stable identity.
  return value;
}

function pullRequest(args: { number?: number; fork?: boolean } = {}): VaultPullRequest {
  const number = args.number ?? 1243;
  return {
    id: `pull-request:${number}`,
    number,
    title: "Use live provider truth",
    url: `https://github.com/samebase/samebase/pull/${number}`,
    isDraft: false,
    isCrossRepository: args.fork === true,
    additions: 120,
    deletions: 34,
    changedFiles: 9,
    updatedAt: "2026-07-20T12:00:00Z",
    baseRefName: "main",
    headRefName: "codex/live-provider-truth",
    headRefOid: number.toString(16).padStart(40, "0"),
    headRepository: {
      id: args.fork ? "repository:contributor/fork" : "repository:samebase",
      nameWithOwner: args.fork ? "contributor/samebase" : "samebase/samebase",
      owner: { login: args.fork ? "contributor" : "samebase" },
    },
    labels: [{ name: "product", color: "0969da" }],
    statusCheckRollup: null,
    checks: {
      state: "success",
      totalCount: 4,
      successCount: 4,
      failureCount: 0,
      runningCount: 0,
      neutralCount: 0,
      unknownCount: 0,
    },
  };
}

function settledState(
  args: {
    pullRequests?: VaultPullRequest[];
    state?: "current" | "stale";
    resourceState?: "current" | "stale" | "failed";
    hasMore?: boolean;
  } = {},
): Extract<VaultPullRequestsState, { state: "current" | "stale" }> {
  const pullRequests = args.pullRequests ?? [pullRequest()];
  const resourcesByPullRequestId = new Map(
    pullRequests.map((item) => [
      item.id,
      {
        pullRequestId: item.id,
        workers: [
          {
            state: "available" as const,
            workerId: fakeWorkerId("worker:app"),
            rootDirectory: "apps/samebase",
            workerName: "samebase-worker",
            buildState: "success" as const,
            convexPreview: {
              state: "available" as const,
              deploymentName: "precise-otter-1243",
              dashboardUrl: "https://dashboard.convex.dev/t/samebase/samebase/precise-otter-1243",
            },
          },
        ],
      },
    ]),
  );
  return {
    state: args.state ?? "current",
    refreshing: false,
    pullRequests,
    allPullRequests: pullRequests,
    resourceState: args.resourceState ?? "current",
    resourcesByPullRequestId: new Map(
      Array.from(resourcesByPullRequestId, ([pullRequestId, resources]) => [
        pullRequestId,
        args.resourceState === "failed"
          ? { state: "failed" as const }
          : { state: args.resourceState ?? ("current" as const), resources },
      ]),
    ),
    hasMore: args.hasMore ?? false,
    isLoadingMore: false,
    canLoadMore: args.hasMore ?? false,
    loadMoreFailed: false,
    reload: () => {},
    reloadResources: () => {},
    loadMore: () => {},
  };
}

function renderList(pullRequests: VaultPullRequestsState): string {
  return renderToStaticMarkup(
    <TestRouterProvider initialEntries={["/vault/samebase/samebase"]}>
      <VaultPullRequestList
        buildSamebaseUrl={(branchName) => `/vault/samebase/samebase/fs/${branchName}?compare`}
        pullRequests={pullRequests}
        repositoryFullName="samebase/samebase"
      />
    </TestRouterProvider>,
  );
}

describe("VaultPullRequestList", () => {
  it("renders provider pull requests and exact resource links", () => {
    const markup = renderList(settledState());
    expect(markup).toContain("PR #1243 Use live provider truth");
    expect(markup).toContain("4 passed");
    expect(markup).toContain("samebase-worker");
    expect(markup).toContain("precise-otter-1243");
    expect(markup).toContain("View changes");
  });

  it("does not offer a Samebase route for a fork head", () => {
    const markup = renderList(settledState({ pullRequests: [pullRequest({ fork: true })] }));
    expect(markup).toContain("fork");
    expect(markup).toContain("contributor/samebase:codex/live-provider-truth");
    expect(markup).not.toContain("View changes");
  });

  it("keeps provider pagination available when the loaded page has no filter matches", () => {
    expect(renderList({ state: "loading" })).toContain("Loading pull requests");
    expect(renderList({ state: "problem", reload: () => {} })).toContain(
      "Could not load pull requests",
    );
    expect(renderList(settledState({ state: "stale" }))).toContain(
      "Pull requests may be out of date",
    );
    const markup = renderList(settledState({ pullRequests: [], hasMore: true }));
    expect(markup).toContain("No matching pull requests loaded");
    expect(markup).toContain("Load more");
    expect(markup).toContain('href="https://github.com/samebase/samebase/pulls"');
  });
});
