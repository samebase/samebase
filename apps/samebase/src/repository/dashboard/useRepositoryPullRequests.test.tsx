// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import type { RepositoryPullRequestPage } from "../../../convex/repository/pullRequestModel";
import {
  useRepositoryPullRequests,
  type RepositoryPullRequestsState,
} from "./useRepositoryPullRequests";
import type { RepositoryAlchemyState } from "./useRepositoryAlchemyState";
import { observedSamebaseStackReply } from "../../../convex/repository/fixtures/observedSamebaseAlchemyState";

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

function fakeRepositoryId(): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs stable identity.
  return "repository:test";
}

function fakeRepositoryProvisioningRunId(): Id<"workflow_repositoryProvisioning_runs"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs stable identity.
  return "provisioning-run:test";
}

function page(args: {
  number: number;
  endCursor: string | null;
  headRefOid?: string;
  isDraft?: boolean;
  labels?: Array<{ name: string; color: string }>;
}): RepositoryPullRequestPage {
  const headRefOid = args.headRefOid ?? args.number.toString(16).padStart(40, "0");
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
            isDraft: args.isDraft ?? false,
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
let latestState: RepositoryPullRequestsState | null = null;
let currentSourceSetupRunning = false;
let currentProviderSetup: UserRepositoryResult["providerSetup"] = { status: "ready" };
let currentAlchemyState: RepositoryAlchemyState;

function Harness() {
  latestState = useRepositoryPullRequests({
    alchemyState: currentAlchemyState,
    repository: {
      repositoryId: fakeRepositoryId(),
      providerSetup: currentProviderSetup,
      sourceSetup: currentSourceSetupRunning
        ? {
            status: "running",
            runId: fakeRepositoryProvisioningRunId(),
            step: "sync_tree",
            updatedAt: 1,
          }
        : { status: "ready" },
    },
  });
  return null;
}

function settledState() {
  if (latestState?.state !== "current" && latestState?.state !== "stale") {
    throw new Error(`Pull requests are not settled: ${latestState?.state ?? "missing"}.`);
  }
  return latestState;
}

function loadMore() {
  const state = settledState().loadMore;
  if (state.state !== "available") {
    throw new Error(`More pull requests cannot be loaded: ${state.state}.`);
  }
  state.load();
}

async function waitFor(predicate: (state: RepositoryPullRequestsState) => boolean): Promise<void> {
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

beforeEach(() => {
  actionState.handlersByFunctionName.clear();
  latestState = null;
  currentSourceSetupRunning = false;
  currentProviderSetup = { status: "ready" };
  currentAlchemyState = {
    state: "loaded",
    observation: { store: "missing" },
    refreshFailed: false,
    reload: () => {},
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

describe("useRepositoryPullRequests", () => {
  it("builds the stack cards of a pull request from the store alone", async () => {
    const headRefOid = "a".repeat(40);
    actionState.handlersByFunctionName.set(
      getFunctionName(api.repositoryPullRequests.listOpenPullRequests),
      async () => page({ number: 24, endCursor: null, headRefOid }),
    );
    const [, stage] = observedSamebaseStackReply.value.stages;
    const observation = {
      store: "found" as const,
      liveDeployments: [],
      stacks: [
        {
          name: "samebase/base-alchemy",
          stages: [
            {
              name: "pr-24",
              resources: stage.resources,
              output: JSON.stringify({ url: "https://first-preview.example.com" }),
              record: {
                version: 1 as const,
                repository: "samebase/base-alchemy",
                stackFile: "alchemy.run.ts",
                branch: "codex/pr-24",
                pullRequest: 24,
                headCommit: headRefOid,
                runUrl: null,
                source: "laptop" as const,
                recordedAt: "2026-10-21T19:58:06.882Z",
              },
              deployedHeadCommit: headRefOid,
            },
          ],
        },
      ],
    };
    currentAlchemyState = {
      state: "loaded",
      observation,
      refreshFailed: false,
      reload: () => {},
    };
    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.resourcesByPullRequestId.size > 0,
    );
    await vi.waitFor(() => {
      expect([...settledState().resourcesByPullRequestId.values()]).toMatchObject([
        {
          state: "loaded",
          stackCards: [
            {
              stack: "samebase/base-alchemy",
              // The stage deployed the head of the pull request.
              run: null,
              address: { href: "https://aware-bobcat-542.convex.site" },
            },
          ],
        },
      ]);
    });
    observation.stacks[0].stages[0].deployedHeadCommit = "b".repeat(40);
    currentAlchemyState = { ...currentAlchemyState, observation: { ...observation } };
    await renderHarness();
    expect([...settledState().resourcesByPullRequestId.values()]).toMatchObject([
      {
        state: "loaded",
        stackCards: [{ run: { deployedHeadCommit: "b".repeat(40) } }],
      },
    ]);
  });

  it("gives a pull request row the state of the store read", async () => {
    actionState.handlersByFunctionName.set(
      getFunctionName(api.repositoryPullRequests.listOpenPullRequests),
      async () => page({ number: 1260, endCursor: null }),
    );

    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 1,
    );
    expect(settledState().resourcesByPullRequestId.get("pull-request:1260")).toEqual({
      state: "loaded",
      stackCards: [],
    });

    currentAlchemyState = { state: "loading" };
    await renderHarness();
    expect(settledState().resourcesByPullRequestId.get("pull-request:1260")).toEqual({
      state: "loading",
    });

    currentAlchemyState = { state: "failed", error: new Error("read failed"), reload: () => {} };
    await renderHarness();
    expect(settledState().resourcesByPullRequestId.get("pull-request:1260")).toEqual({
      state: "failed",
    });
  });

  it("loads one provider page at a time", async () => {
    const listHandler = vi.fn(async (value: unknown) => {
      if (!value || typeof value !== "object" || !("after" in value)) {
        throw new Error("Provider cursor is required.");
      }
      return value.after === null
        ? page({
            number: 1260,
            endCursor: "cursor:2",
            isDraft: true,
            labels: [{ name: "hidden", color: "0969da" }],
          })
        : page({ number: 1259, endCursor: null });
    });
    actionState.handlersByFunctionName.set(
      getFunctionName(api.repositoryPullRequests.listOpenPullRequests),
      listHandler,
    );

    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 1,
    );

    expect(listHandler).toHaveBeenCalledTimes(1);
    expect(listHandler.mock.calls[0]?.[0]).toEqual({
      repositoryId: fakeRepositoryId(),
      first: 6,
      after: null,
    });
    expect(settledState().allPullRequests.map((pullRequest) => pullRequest.number)).toEqual([1260]);
    expect(settledState().openPullRequestCount).toBe(2);
    expect(settledState().allPullRequests[0]?.isDraft).toBe(true);
    expect(settledState().defaultBranch).toMatchObject({
      headCommitOid: "81145b7d2a32186823452c7515b2d5ba2d79b350",
      headCommitTitle: "Keep the workspace model explicit",
      checks: { state: "success", totalCount: 1, successCount: 1 },
    });
    expect(settledState().loadMore.state).toBe("available");

    act(() => loadMore());
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 2,
    );

    expect(listHandler).toHaveBeenCalledTimes(2);
    expect(listHandler.mock.calls[1]?.[0]).toMatchObject({ after: "cursor:2" });
    expect(settledState().allPullRequests.map((pullRequest) => pullRequest.number)).toEqual([
      1260, 1259,
    ]);
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

    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 1,
    );

    act(() => loadMore());
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") && state.loadMore.state === "failed",
    );
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

    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 1,
    );

    act(() => loadMore());
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 2,
    );
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: ["repository-pull-requests", fakeRepositoryId()],
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

    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 1,
    );
    act(() => loadMore());
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests.length === 2,
    );

    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: ["repository-pull-requests", fakeRepositoryId()],
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

  it("refreshes immediately when source setup becomes ready", async () => {
    let requestCount = 0;
    const listHandler = vi.fn(async () => {
      requestCount += 1;
      return page({ number: requestCount === 1 ? 1260 : 1261, endCursor: null });
    });
    actionState.handlersByFunctionName.set(
      getFunctionName(api.repositoryPullRequests.listOpenPullRequests),
      listHandler,
    );

    currentSourceSetupRunning = true;
    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests[0]?.number === 1260,
    );

    currentSourceSetupRunning = false;
    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests[0]?.number === 1261,
    );

    expect(listHandler).toHaveBeenCalledTimes(2);
  });

  it("refreshes immediately when a retry moves past a failed seed", async () => {
    let requestCount = 0;
    const listHandler = vi.fn(async () => {
      requestCount += 1;
      return page({ number: requestCount === 1 ? 1260 : 1261, endCursor: null });
    });
    actionState.handlersByFunctionName.set(
      getFunctionName(api.repositoryPullRequests.listOpenPullRequests),
      listHandler,
    );

    currentProviderSetup = {
      status: "failed",
      provider: "github",
      runId: fakeRepositoryProvisioningRunId(),
      step: "seed_starter",
      message: "Could not push the starter.",
      updatedAt: 1,
    };
    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests[0]?.number === 1260,
    );

    currentProviderSetup = {
      status: "running",
      provider: "github",
      runId: fakeRepositoryProvisioningRunId(),
      step: "sync_tree",
      updatedAt: 2,
    };
    await renderHarness();
    await waitFor(
      (state) =>
        (state.state === "current" || state.state === "stale") &&
        state.allPullRequests[0]?.number === 1261,
    );

    expect(listHandler).toHaveBeenCalledTimes(2);
  });
});
