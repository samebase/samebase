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

function Harness() {
  latestState = useVaultPullRequests({
    vault: {
      _id: fakeVaultId(),
      cloudflareWorkers: [],
      convexProjects: [],
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
    if (!value || typeof value !== "object" || !("heads" in value) || !Array.isArray(value.heads)) {
      throw new Error("Resource heads are required.");
    }
    return value.heads.map((head) => {
      if (!head || typeof head !== "object" || !("id" in head) || typeof head.id !== "string") {
        throw new Error("Resource head id is required.");
      }
      return { pullRequestId: head.id, workers: [] };
    });
  });
  actionState.handlersByFunctionName.set(
    getFunctionName(api.vault.pullRequestResources.getVisiblePullRequestResources),
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
      first: 25,
      after: null,
    });
    expect(settledState().pullRequests).toEqual([]);
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
    installResourceHandler();

    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 1,
    );
    expect(settledState().pullRequests).toEqual([]);

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
  });

  it("retains the provider page as stale when a background reload fails", async () => {
    let requestCount = 0;
    const listHandler = vi.fn(async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return page({ number: 1260, endCursor: null });
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
        (state.state === "current" || state.state === "stale") && state.pullRequests.length === 1,
    );

    act(() => settledState().reload());
    await waitFor(
      (state) =>
        state.state === "stale" &&
        !state.refreshing &&
        state.pullRequests.some((pullRequest) => pullRequest.number === 1260),
    );

    expect(listHandler).toHaveBeenCalledTimes(2);
  });
});
