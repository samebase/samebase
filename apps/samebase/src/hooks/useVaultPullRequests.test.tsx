// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { RepositoryPullRequestPage } from "../../convex/repositoryPullRequests";
import { useVaultPullRequests, type VaultPullRequestsState } from "./useVaultPullRequests";

const actionState = vi.hoisted(() => ({
  handlersByFunctionName: new Map<string, (args: unknown) => Promise<unknown>>(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: (action: Parameters<typeof actual.useAction>[0]) => {
      const handler = actionState.handlersByFunctionName.get(getFunctionName(action));
      if (!handler) {
        throw new Error(`Missing action handler for ${getFunctionName(action)}.`);
      }
      return handler;
    },
  };
});

function fakeVaultId(): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs stable identity.
  return "vault:test";
}

function fakeCloudflareWorkerId(): Id<"vaultCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs stable identity.
  return "worker:test";
}

function fakeConvexProjectId(): Id<"vaultConvexProjects"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs stable identity.
  return "project:test";
}

function page(args: {
  number: number;
  endCursor: string | null;
  labels?: Array<{ name: string; color: string }>;
}): RepositoryPullRequestPage {
  const headRefOid = args.number.toString(16).padStart(40, "0");
  return {
    repository: {
      id: "repository:samebase",
      databaseId: 919458151,
      nameWithOwner: "samebase/samebase",
      defaultBranch: {
        name: "main",
        headCommitOid: "81145b7d2a32186823452c7515b2d5ba2d79b350",
        headCommitTitle: "Keep the workspace model explicit",
        headCommitCommittedAt: "2026-07-20T11:45:00Z",
        headCommitUrl:
          "https://github.com/samebase/samebase/commit/81145b7d2a32186823452c7515b2d5ba2d79b350",
        statusCheckRollup: {
          state: "SUCCESS",
          contexts: {
            totalCount: 1,
            checkRunCount: 1,
            statusContextCount: 0,
            checkRunCountsByState: [{ state: "SUCCESS", count: 1 }],
            statusContextCountsByState: [],
            nodes: [
              {
                kind: "check_run",
                name: "checks (24.x)",
                status: "COMPLETED",
                conclusion: "SUCCESS",
                detailsUrl: "https://github.com/samebase/samebase/actions/runs/1/job/1",
                title: null,
              },
            ],
          },
        },
      },
      pullRequests: {
        totalCount: 2,
        pageInfo: {
          hasNextPage: args.endCursor !== null,
          endCursor: args.endCursor,
        },
        nodes: [
          {
            id: `pull-request:${args.number}`,
            number: args.number,
            title: `Pull request ${args.number}`,
            url: `https://github.com/samebase/samebase/pull/${args.number}`,
            isDraft: false,
            isCrossRepository: false,
            additions: 1,
            deletions: 0,
            changedFiles: 1,
            updatedAt: "2026-07-20T12:00:00Z",
            baseRefName: "main",
            headRefName: `codex/pr-${args.number}`,
            headRefOid,
            headRepository: {
              id: "repository:samebase",
              nameWithOwner: "samebase/samebase",
              owner: { login: "samebase" },
            },
            labels: { nodes: args.labels ?? [] },
            statusCheckRollup: null,
          },
        ],
      },
    },
  };
}

let rootElement: HTMLDivElement | null = null;
let root: Root | null = null;
let queryClient: QueryClient;
let latestState: VaultPullRequestsState | null = null;
let currentFilters = {
  hiddenLabels: ["hidden"],
  includeDrafts: false,
  includeNoLabel: true,
};
let currentCloudflareWorkers: Array<{
  workerId: Id<"vaultCloudflareWorkers">;
  accountId: string;
  workerName: string;
  workerTag: string;
}> = [];
let currentConvexProjects: Array<{
  convexProjectId: Id<"vaultConvexProjects">;
  teamId: string;
  projectId: string;
  codeLocation: { kind: "config"; convexConfigPath: string };
}> = [];

function Harness() {
  latestState = useVaultPullRequests({
    vault: {
      _id: fakeVaultId(),
      cloudflareWorkers: currentCloudflareWorkers,
      convexProjects: currentConvexProjects,
    },
    filters: currentFilters,
    now: Date.now(),
  });
  return null;
}

function settledState() {
  if (latestState?.state !== "current" && latestState?.state !== "stale") {
    throw new Error(`Pull requests are not settled: ${latestState?.state ?? "missing"}.`);
  }
  return latestState;
}

async function waitFor(predicate: (state: VaultPullRequestsState) => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (latestState && predicate(latestState)) {
      return;
    }
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    });
  }
  throw new Error("Timed out waiting for pull requests.");
}

function installResourceHandler() {
  const handler = vi.fn(async (value: unknown) => {
    if (
      !value ||
      typeof value !== "object" ||
      !("pullRequestIds" in value) ||
      !Array.isArray(value.pullRequestIds)
    ) {
      throw new Error("Pull request ids are required.");
    }
    return value.pullRequestIds.map((pullRequestId) => {
      if (typeof pullRequestId !== "string") {
        throw new Error("Pull request id is required.");
      }
      return { pullRequestId, workers: [] };
    });
  });
  actionState.handlersByFunctionName.set(
    getFunctionName(api.vault.pullRequestResources.getPullRequestResources),
    handler,
  );
  return handler;
}

beforeEach(() => {
  actionState.handlersByFunctionName.clear();
  latestState = null;
  currentFilters = {
    hiddenLabels: ["hidden"],
    includeDrafts: false,
    includeNoLabel: true,
  };
  currentCloudflareWorkers = [];
  currentConvexProjects = [];
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  queryClient.clear();
  rootElement?.remove();
  root = null;
  rootElement = null;
  vi.restoreAllMocks();
});

async function renderHarness(): Promise<void> {
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });
}

describe("useVaultPullRequests", () => {
  it("loads one provider page at a time and filters only in the browser", async () => {
    const listHandler = vi.fn(async (value: unknown) => {
      if (!value || typeof value !== "object" || !("after" in value)) {
        throw new Error("Provider cursor is required.");
      }
      return value.after === null
        ? page({
            number: 1260,
            endCursor: "cursor:2",
            labels: [{ name: "hidden", color: "0969da" }],
          })
        : page({ number: 1259, endCursor: null });
    });
    actionState.handlersByFunctionName.set(
      getFunctionName(api.repositoryPullRequests.listOpenPullRequests),
      listHandler,
    );
    installResourceHandler();

    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 1,
    );

    expect(listHandler).toHaveBeenCalledTimes(1);
    expect(listHandler.mock.calls[0]?.[0]).toEqual({
      vaultId: fakeVaultId(),
      first: 6,
      after: null,
    });
    expect(settledState().pullRequests).toEqual([]);
    expect(settledState().defaultBranch).toMatchObject({
      headCommitOid: "81145b7d2a32186823452c7515b2d5ba2d79b350",
      headCommitTitle: "Keep the workspace model explicit",
      checks: { state: "success", totalCount: 1, successCount: 1 },
    });
    expect(settledState().hasMore).toBe(true);

    act(() => settledState().loadMore());
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 2,
    );

    expect(listHandler).toHaveBeenCalledTimes(2);
    expect(listHandler.mock.calls[1]?.[0]).toMatchObject({ after: "cursor:2" });
    expect(settledState().pullRequests.map((pullRequest) => pullRequest.number)).toEqual([1259]);
  });

  it("stops automatic pagination after a later provider page fails", async () => {
    const listHandler = vi.fn(async (value: unknown) => {
      if (!value || typeof value !== "object" || !("after" in value)) {
        throw new Error("Provider cursor is required.");
      }
      if (value.after === null) {
        return page({ number: 1260, endCursor: "cursor:2" });
      }
      throw new Error("GitHub unavailable");
    });
    actionState.handlersByFunctionName.set(
      getFunctionName(api.repositoryPullRequests.listOpenPullRequests),
      listHandler,
    );
    installResourceHandler();

    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 1,
    );

    act(() => settledState().loadMore());
    await waitFor(
      (state) => (state.state === "current" || state.state === "stale") && state.loadMoreFailed,
    );
    expect(settledState().canLoadMore).toBe(false);

    act(() => settledState().loadMore());
    expect(listHandler).toHaveBeenCalledTimes(2);
  });

  it("reapplies browser filters without requesting another provider page", async () => {
    const listHandler = vi.fn(async () =>
      page({
        number: 1260,
        endCursor: null,
        labels: [{ name: "hidden", color: "0969da" }],
      }),
    );
    actionState.handlersByFunctionName.set(
      getFunctionName(api.repositoryPullRequests.listOpenPullRequests),
      listHandler,
    );
    const resourceHandler = installResourceHandler();

    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 1 &&
        state.resourceState === "current",
    );
    expect(settledState().pullRequests).toEqual([]);
    expect(resourceHandler).toHaveBeenCalledWith({
      vaultId: fakeVaultId(),
      pullRequestIds: ["pull-request:1260"],
    });

    currentFilters = {
      ...currentFilters,
      hiddenLabels: [],
    };
    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") && state.pullRequests.length === 1,
    );

    expect(listHandler).toHaveBeenCalledTimes(1);
    expect(resourceHandler).toHaveBeenCalledTimes(1);
  });

  it("caches resource enrichment by provider page and exact attachment coordinates", async () => {
    const listHandler = vi.fn(async (value: unknown) => {
      if (!value || typeof value !== "object" || !("after" in value)) {
        throw new Error("Provider cursor is required.");
      }
      return value.after === null
        ? page({ number: 1260, endCursor: "cursor:2" })
        : page({ number: 1259, endCursor: null });
    });
    actionState.handlersByFunctionName.set(
      getFunctionName(api.repositoryPullRequests.listOpenPullRequests),
      listHandler,
    );
    const resourceHandler = installResourceHandler();

    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") && state.resourceState === "current",
    );
    act(() => settledState().loadMore());
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 2 &&
        state.resourceState === "current",
    );

    expect(resourceHandler.mock.calls.map((call) => call[0])).toEqual([
      { vaultId: fakeVaultId(), pullRequestIds: ["pull-request:1260"] },
      { vaultId: fakeVaultId(), pullRequestIds: ["pull-request:1259"] },
    ]);

    currentCloudflareWorkers = [
      {
        workerId: fakeCloudflareWorkerId(),
        accountId: "account:test",
        workerName: "samebase-worker",
        workerTag: "worker-tag:test",
      },
    ];
    currentConvexProjects = [
      {
        convexProjectId: fakeConvexProjectId(),
        teamId: "team:test",
        projectId: "project:test",
        codeLocation: { kind: "config", convexConfigPath: "apps/samebase/convex.json" },
      },
    ];
    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        resourceHandler.mock.calls.length === 4 &&
        state.resourceState === "current",
    );

    expect(resourceHandler.mock.calls.slice(2).map((call) => call[0])).toEqual([
      { vaultId: fakeVaultId(), pullRequestIds: ["pull-request:1260"] },
      { vaultId: fakeVaultId(), pullRequestIds: ["pull-request:1259"] },
    ]);
    expect(listHandler).toHaveBeenCalledTimes(2);
  });

  it("retains every loaded provider page as stale when a reload fails", async () => {
    let requestCount = 0;
    const listHandler = vi.fn(async (value: unknown) => {
      if (!value || typeof value !== "object" || !("after" in value)) {
        throw new Error("Provider cursor is required.");
      }
      requestCount += 1;
      if (requestCount === 1) {
        return page({ number: 1260, endCursor: "cursor:2" });
      }
      if (requestCount === 2 && value.after === "cursor:2") {
        return page({ number: 1259, endCursor: null });
      }
      if (requestCount === 3 && value.after === null) {
        return page({ number: 1261, endCursor: "cursor:refreshed" });
      }
      throw new Error("GitHub unavailable");
    });
    actionState.handlersByFunctionName.set(
      getFunctionName(api.repositoryPullRequests.listOpenPullRequests),
      listHandler,
    );
    installResourceHandler();

    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 1,
    );

    act(() => settledState().loadMore());
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 2,
    );
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: ["vault-pull-requests", fakeVaultId()],
      });
    });
    await waitFor(
      (state) =>
        state.state === "stale" &&
        !state.refreshing &&
        state.allPullRequests.map((pullRequest) => pullRequest.number).join(",") === "1260,1259",
    );

    expect(listHandler.mock.calls.map((call) => call[0])).toEqual([
      expect.objectContaining({ after: null }),
      expect.objectContaining({ after: "cursor:2" }),
      expect.objectContaining({ after: null }),
      expect.objectContaining({ after: "cursor:refreshed" }),
    ]);
  });

  it("reloads every loaded provider page through the latest cursors", async () => {
    let generation = 0;
    const listHandler = vi.fn(async (value: unknown) => {
      if (!value || typeof value !== "object" || !("after" in value)) {
        throw new Error("Provider cursor is required.");
      }
      if (value.after === null) {
        generation += 1;
        return page({
          number: generation === 1 ? 1260 : 1261,
          endCursor: generation === 1 ? "cursor:2" : "cursor:refreshed",
        });
      }
      if (generation === 1 && value.after === "cursor:2") {
        return page({ number: 1259, endCursor: null });
      }
      if (generation === 2 && value.after === "cursor:refreshed") {
        return page({ number: 1258, endCursor: null });
      }
      throw new Error("Unexpected provider cursor.");
    });
    actionState.handlersByFunctionName.set(
      getFunctionName(api.repositoryPullRequests.listOpenPullRequests),
      listHandler,
    );
    installResourceHandler();

    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 1,
    );
    act(() => settledState().loadMore());
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 2,
    );

    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: ["vault-pull-requests", fakeVaultId()],
      });
    });
    await waitFor(
      (state) =>
        state.state === "current" &&
        !state.refreshing &&
        state.allPullRequests.map((pullRequest) => pullRequest.number).join(",") === "1261,1258",
    );

    expect(listHandler.mock.calls.map((call) => call[0])).toEqual([
      expect.objectContaining({ after: null }),
      expect.objectContaining({ after: "cursor:2" }),
      expect.objectContaining({ after: null }),
      expect.objectContaining({ after: "cursor:refreshed" }),
    ]);
  });

  it("does not renew first-page freshness when a later page loads", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const listHandler = vi.fn(async (value: unknown) => {
      if (!value || typeof value !== "object" || !("after" in value)) {
        throw new Error("Provider cursor is required.");
      }
      return value.after === null
        ? page({ number: 1260, endCursor: "cursor:2" })
        : page({ number: 1259, endCursor: null });
    });
    actionState.handlersByFunctionName.set(
      getFunctionName(api.repositoryPullRequests.listOpenPullRequests),
      listHandler,
    );
    installResourceHandler();

    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 1,
    );

    now = 60_000;
    act(() => settledState().loadMore());
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 2,
    );

    now = 61_001;
    await renderHarness();

    expect(settledState().state).toBe("stale");
  });
});
