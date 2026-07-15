// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../convex/_generated/dataModel";
import {
  loadRepositoryInventorySnapshot,
  useRepositoryInventorySnapshot,
} from "./useRepositoryInventorySnapshot";

const { convexClientMock, convexQueryMock } = vi.hoisted(() => {
  const query = vi.fn<(...args: unknown[]) => Promise<unknown>>();
  return { convexClientMock: { query }, convexQueryMock: query };
});

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useConvex: () => convexClientMock,
  };
});

type SnapshotLoadArgs = Parameters<typeof loadRepositoryInventorySnapshot>[0];
type ItemPageQuery = SnapshotLoadArgs["queryItemPage"];
type ItemPageResult = Awaited<ReturnType<ItemPageQuery>>;
type LabelPageQuery = SnapshotLoadArgs["queryLabelPage"];
type LabelPageResult = Awaited<ReturnType<LabelPageQuery>>;
type SnapshotHookArgs = Parameters<typeof useRepositoryInventorySnapshot>[0];
type SnapshotHookResult = ReturnType<typeof useRepositoryInventorySnapshot>;

function fakeVaultId(value = "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a"): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; the loader only passes this id through.
  return value;
}

function fakeSnapshotId(
  value = "ms7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a",
): Id<"vaultRepositoryInventorySnapshots"> {
  // @ts-expect-error Convex ids are strings at runtime; the loader only passes this id through.
  return value;
}

function queryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function loadSnapshot(args: Omit<SnapshotLoadArgs, "signal">) {
  return loadRepositoryInventorySnapshot({
    ...args,
    signal: new AbortController().signal,
  });
}

const checks = {
  state: "success" as const,
  totalCount: 0,
  checkRunCount: 0,
  statusContextCount: 0,
  successCount: 0,
  failureCount: 0,
  runningCount: 0,
  neutralCount: 0,
  unknownCount: 0,
};

function branch(rowKey: string, name: string) {
  return {
    kind: "branch" as const,
    rowKey,
    name,
    isDefault: name === "main",
    headCommit: { sha: `${name}-sha`, checks },
  };
}

function pullRequest(rowKey: string, labelCount: number) {
  return {
    kind: "pull_request" as const,
    rowKey,
    number: 42,
    url: "https://github.com/ada/inventory/pull/42",
    title: "Load every label before publishing",
    isDraft: false,
    baseRefName: "main",
    headRepositoryFullName: "ada/inventory",
    headRefName: "feature/labels",
    canOpenInSamebase: true,
    labelCount,
    headCommit: { sha: "feature-sha", checks },
  };
}

function readyInventoryState(snapshotId: Id<"vaultRepositoryInventorySnapshots">) {
  return {
    state: "ready" as const,
    activeSnapshotId: snapshotId,
    repositoryFullName: "ada/inventory",
    defaultBranch: "main",
    publishedAt: 1_000,
    checkedAt: 1_000,
  };
}

function branchPage(args: {
  prefix: string;
  start: number;
  count: number;
  expectedItemCount: number;
  isDone: boolean;
  continueCursor: string;
}): ItemPageResult {
  return {
    state: "ready",
    expectedItemCount: args.expectedItemCount,
    page: Array.from({ length: args.count }, (_, index) => {
      const itemIndex = args.start + index;
      return branch(`branch:${args.prefix}-${itemIndex}`, `${args.prefix}-${itemIndex}`);
    }),
    isDone: args.isDone,
    continueCursor: args.continueCursor,
  };
}

describe("loadRepositoryInventorySnapshot", () => {
  it("returns a snapshot only after every item and label chunk is complete", async () => {
    const rowKey = "pull-request:PR_42";
    const queryItemPage: ItemPageQuery = async () => ({
      state: "ready",
      expectedItemCount: 2,
      page: [branch("branch:main", "main"), pullRequest(rowKey, 3)],
      isDone: true,
      continueCursor: "",
    });
    let finishLabels: ((result: LabelPageResult) => void) | undefined;
    const labelResult = new Promise<LabelPageResult>((resolve) => {
      finishLabels = resolve;
    });
    const queryLabelPage: LabelPageQuery = async () => await labelResult;

    let resolved = false;
    const loading = loadSnapshot({
      queryClient: queryClient(),
      queryItemPage,
      queryLabelPage,
      vaultId: fakeVaultId(),
      snapshotId: fakeSnapshotId(),
      requestedItemCount: 10,
    }).then((snapshot) => {
      resolved = true;
      return snapshot;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);
    if (finishLabels === undefined) {
      throw new Error("Expected the label query to start.");
    }
    finishLabels({
      state: "ready",
      expectedLabelCount: 3,
      expectedChunkCount: 2,
      page: [
        {
          chunkIndex: 0,
          labels: [{ name: "bug", color: "ff0000" }, { name: "priority" }],
        },
        { chunkIndex: 1, labels: [{ name: "ready", color: "00ff00" }] },
      ],
      isDone: true,
      continueCursor: "",
    });

    await expect(loading).resolves.toEqual({
      snapshotId: fakeSnapshotId(),
      expectedItemCount: 2,
      isDone: true,
      items: [
        branch("branch:main", "main"),
        {
          kind: "pull_request",
          rowKey,
          number: 42,
          url: "https://github.com/ada/inventory/pull/42",
          title: "Load every label before publishing",
          isDraft: false,
          baseRefName: "main",
          headRepositoryFullName: "ada/inventory",
          headRefName: "feature/labels",
          canOpenInSamebase: true,
          headCommit: { sha: "feature-sha", checks },
          labels: [
            { name: "bug", color: "ff0000" },
            { name: "priority" },
            { name: "ready", color: "00ff00" },
          ],
        },
      ],
    });
  });

  it("keeps unavailable distinct from a legitimately empty snapshot", async () => {
    const client = queryClient();
    let queryCount = 0;
    const queryLabelPage: LabelPageQuery = async () => ({ state: "unavailable" });
    const unavailableThenEmpty: ItemPageQuery = async () => {
      queryCount += 1;
      return queryCount === 1
        ? { state: "unavailable" }
        : {
            state: "ready",
            expectedItemCount: 0,
            page: [],
            isDone: true,
            continueCursor: "",
          };
    };
    await expect(
      loadSnapshot({
        queryClient: client,
        queryItemPage: unavailableThenEmpty,
        queryLabelPage,
        vaultId: fakeVaultId(),
        snapshotId: fakeSnapshotId(),
        requestedItemCount: 10,
      }),
    ).rejects.toThrow("Repository inventory snapshot is no longer available.");

    await expect(
      loadSnapshot({
        queryClient: client,
        queryItemPage: unavailableThenEmpty,
        queryLabelPage,
        vaultId: fakeVaultId(),
        snapshotId: fakeSnapshotId(),
        requestedItemCount: 10,
      }),
    ).resolves.toMatchObject({ items: [], expectedItemCount: 0, isDone: true });
    expect(queryCount).toBe(2);
  });

  it("rejects duplicate rows across item pages", async () => {
    const queryItemPage: ItemPageQuery = async (args) =>
      args.paginationOpts.cursor === null
        ? {
            state: "ready",
            expectedItemCount: 2,
            page: [branch("branch:main", "main")],
            isDone: false,
            continueCursor: "next",
          }
        : {
            state: "ready",
            expectedItemCount: 2,
            page: [branch("branch:main", "main")],
            isDone: true,
            continueCursor: "",
          };
    const queryLabelPage: LabelPageQuery = async () => ({ state: "unavailable" });

    await expect(
      loadSnapshot({
        queryClient: queryClient(),
        queryItemPage,
        queryLabelPage,
        vaultId: fakeVaultId(),
        snapshotId: fakeSnapshotId(),
        requestedItemCount: 2,
      }),
    ).rejects.toThrow("Repository inventory snapshot contains a duplicate row.");
  });

  it("rejects an early terminal page instead of publishing partial data", async () => {
    const queryItemPage: ItemPageQuery = async () => ({
      state: "ready",
      expectedItemCount: 2,
      page: [branch("branch:main", "main")],
      isDone: true,
      continueCursor: "",
    });
    const queryLabelPage: LabelPageQuery = async () => ({ state: "unavailable" });

    await expect(
      loadSnapshot({
        queryClient: queryClient(),
        queryItemPage,
        queryLabelPage,
        vaultId: fakeVaultId(),
        snapshotId: fakeSnapshotId(),
        requestedItemCount: 10,
      }),
    ).rejects.toThrow("Repository inventory snapshot ended with an invalid item total.");
  });

  it("rejects incomplete label chunks instead of showing missing labels", async () => {
    const rowKey = "pull-request:PR_42";
    const queryItemPage: ItemPageQuery = async () => ({
      state: "ready",
      expectedItemCount: 1,
      page: [pullRequest(rowKey, 2)],
      isDone: true,
      continueCursor: "",
    });
    const queryLabelPage: LabelPageQuery = async () => ({
      state: "ready",
      expectedLabelCount: 2,
      expectedChunkCount: 2,
      page: [{ chunkIndex: 1, labels: [{ name: "second" }] }],
      isDone: true,
      continueCursor: "",
    });

    await expect(
      loadSnapshot({
        queryClient: queryClient(),
        queryItemPage,
        queryLabelPage,
        vaultId: fakeVaultId(),
        snapshotId: fakeSnapshotId(),
        requestedItemCount: 10,
      }),
    ).rejects.toThrow("Repository inventory label chunks are incomplete.");
  });

  it("loads only the requested leading slice of a large snapshot", async () => {
    let queryCount = 0;
    const queryItemPage: ItemPageQuery = async () => {
      queryCount += 1;
      return {
        state: "ready",
        expectedItemCount: 100,
        page: Array.from({ length: 10 }, (_, index) =>
          branch(`branch:branch-${index}`, `branch-${index}`),
        ),
        isDone: false,
        continueCursor: "next",
      };
    };
    const queryLabelPage: LabelPageQuery = async () => ({ state: "unavailable" });

    await expect(
      loadSnapshot({
        queryClient: queryClient(),
        queryItemPage,
        queryLabelPage,
        vaultId: fakeVaultId(),
        snapshotId: fakeSnapshotId(),
        requestedItemCount: 10,
      }),
    ).resolves.toMatchObject({ expectedItemCount: 100, isDone: false });
    expect(queryCount).toBe(1);
  });

  it("stops before requesting another page after cancellation", async () => {
    let queryCount = 0;
    let finishFirstPage: ((result: ItemPageResult) => void) | undefined;
    const firstPage = new Promise<ItemPageResult>((resolve) => {
      finishFirstPage = resolve;
    });
    const queryItemPage: ItemPageQuery = async () => {
      queryCount += 1;
      return await firstPage;
    };
    const queryLabelPage: LabelPageQuery = async () => ({ state: "unavailable" });
    const controller = new AbortController();

    const loading = loadRepositoryInventorySnapshot({
      queryClient: queryClient(),
      queryItemPage,
      queryLabelPage,
      vaultId: fakeVaultId(),
      snapshotId: fakeSnapshotId(),
      requestedItemCount: 20,
      signal: controller.signal,
    });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    if (finishFirstPage === undefined) {
      throw new Error("Expected the first item page query to start.");
    }
    finishFirstPage({
      state: "ready",
      expectedItemCount: 20,
      page: Array.from({ length: 10 }, (_, index) =>
        branch(`branch:branch-${index}`, `branch-${index}`),
      ),
      isDone: false,
      continueCursor: "next",
    });

    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(queryCount).toBe(1);
  });
});

function RepositoryInventorySnapshotProbe({
  args,
  onRender,
}: {
  args: SnapshotHookArgs;
  onRender: (result: SnapshotHookResult) => void;
}) {
  onRender(useRepositoryInventorySnapshot(args));
  return null;
}

describe("useRepositoryInventorySnapshot", () => {
  let client: QueryClient;
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;
  let latestResult: SnapshotHookResult | undefined;

  function renderHook(args: SnapshotHookArgs) {
    if (root === null) {
      throw new Error("Expected the hook root to be mounted.");
    }
    const mountedRoot = root;
    act(() => {
      mountedRoot.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(RepositoryInventorySnapshotProbe, {
            args,
            onRender: (result) => {
              latestResult = result;
            },
          }),
        ),
      );
    });
  }

  async function flushHook() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  function currentResult() {
    if (latestResult === undefined) {
      throw new Error("Expected the hook to render a result.");
    }
    return latestResult;
  }

  beforeEach(() => {
    client = queryClient();
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    latestResult = undefined;
    convexQueryMock.mockReset();
  });

  afterEach(() => {
    if (root !== null) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    rootElement?.remove();
    rootElement = null;
    client.clear();
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("does not attribute an interrupted vault load to a previously committed vault", async () => {
    const firstVaultId = fakeVaultId("first-vault");
    const secondVaultId = fakeVaultId("second-vault");
    const firstSnapshotId = fakeSnapshotId("first-snapshot");
    const secondSnapshotId = fakeSnapshotId("second-snapshot");
    let finishSecondPage: ((result: ItemPageResult) => void) | undefined;
    const secondPage = new Promise<ItemPageResult>((resolve) => {
      finishSecondPage = resolve;
    });
    convexQueryMock
      .mockResolvedValueOnce(
        branchPage({
          prefix: "first",
          start: 0,
          count: 1,
          expectedItemCount: 1,
          isDone: true,
          continueCursor: "",
        }),
      )
      .mockImplementationOnce(async () => await secondPage);

    renderHook({
      vaultId: firstVaultId,
      snapshotId: firstSnapshotId,
      inventoryState: readyInventoryState(firstSnapshotId),
    });
    await flushHook();
    expect(currentResult().items.map((item) => item.rowKey)).toEqual(["branch:first-0"]);
    expect(currentResult().status).toBe("Exhausted");

    renderHook({
      vaultId: secondVaultId,
      snapshotId: secondSnapshotId,
      inventoryState: readyInventoryState(secondSnapshotId),
    });
    expect(currentResult().items).toEqual([]);
    expect(currentResult().status).toBe("LoadingFirstPage");

    renderHook({
      vaultId: firstVaultId,
      snapshotId: firstSnapshotId,
      inventoryState: readyInventoryState(firstSnapshotId),
    });
    await flushHook();
    expect(currentResult().items.map((item) => item.rowKey)).toEqual(["branch:first-0"]);
    expect(currentResult().status).toBe("Exhausted");

    if (finishSecondPage === undefined) {
      throw new Error("Expected the second vault page query to start.");
    }
    finishSecondPage(
      branchPage({
        prefix: "second",
        start: 0,
        count: 1,
        expectedItemCount: 1,
        isDone: true,
        continueCursor: "",
      }),
    );
    await flushHook();
    expect(currentResult().items.map((item) => item.rowKey)).toEqual(["branch:first-0"]);
    expect(currentResult().status).toBe("Exhausted");
  });

  it("starts a replacement snapshot at the initial leading depth", async () => {
    const vaultId = fakeVaultId();
    const firstSnapshotId = fakeSnapshotId("first-snapshot");
    const secondSnapshotId = fakeSnapshotId("second-snapshot");
    convexQueryMock
      .mockResolvedValueOnce(
        branchPage({
          prefix: "first",
          start: 0,
          count: 10,
          expectedItemCount: 20,
          isDone: false,
          continueCursor: "first-next",
        }),
      )
      .mockResolvedValueOnce(
        branchPage({
          prefix: "first",
          start: 10,
          count: 10,
          expectedItemCount: 20,
          isDone: true,
          continueCursor: "",
        }),
      )
      .mockResolvedValueOnce(
        branchPage({
          prefix: "second",
          start: 0,
          count: 10,
          expectedItemCount: 100,
          isDone: false,
          continueCursor: "second-next",
        }),
      );

    renderHook({
      vaultId,
      snapshotId: firstSnapshotId,
      inventoryState: readyInventoryState(firstSnapshotId),
    });
    await flushHook();
    expect(currentResult().items).toHaveLength(10);
    expect(currentResult().status).toBe("CanLoadMore");

    act(() => {
      currentResult().loadMore(10);
    });
    await flushHook();
    expect(currentResult().items).toHaveLength(20);
    expect(currentResult().status).toBe("Exhausted");

    renderHook({
      vaultId,
      snapshotId: secondSnapshotId,
      inventoryState: readyInventoryState(secondSnapshotId),
    });
    await flushHook();
    expect(currentResult().items.map((item) => item.rowKey)).toEqual(
      Array.from({ length: 10 }, (_, index) => `branch:second-${index}`),
    );
    expect(currentResult().status).toBe("CanLoadMore");
    expect(convexQueryMock).toHaveBeenCalledTimes(3);
  });

  it("retries an unavailable page with a fresh cache entry", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const vaultId = fakeVaultId();
    const snapshotId = fakeSnapshotId();
    convexQueryMock.mockResolvedValueOnce({ state: "unavailable" }).mockResolvedValueOnce(
      branchPage({
        prefix: "recovered",
        start: 0,
        count: 1,
        expectedItemCount: 1,
        isDone: true,
        continueCursor: "",
      }),
    );

    renderHook({
      vaultId,
      snapshotId,
      inventoryState: readyInventoryState(snapshotId),
    });
    await flushHook();
    expect(convexQueryMock).toHaveBeenCalledTimes(1);
    expect(
      client.getQueryState(["repository-inventory-item-page", vaultId, snapshotId, null]),
    ).toBeUndefined();

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushHook();
    expect(convexQueryMock).toHaveBeenCalledTimes(2);
    expect(currentResult().items.map((item) => item.rowKey)).toEqual(["branch:recovered-0"]);
    expect(currentResult().status).toBe("Exhausted");
  });

  it("removes committed rows when the active publication disappears", async () => {
    const vaultId = fakeVaultId();
    const snapshotId = fakeSnapshotId();
    convexQueryMock.mockResolvedValueOnce(
      branchPage({
        prefix: "published",
        start: 0,
        count: 1,
        expectedItemCount: 1,
        isDone: true,
        continueCursor: "",
      }),
    );

    renderHook({
      vaultId,
      snapshotId,
      inventoryState: readyInventoryState(snapshotId),
    });
    await flushHook();
    expect(currentResult().items.map((item) => item.rowKey)).toEqual(["branch:published-0"]);

    renderHook({
      vaultId,
      snapshotId: undefined,
      inventoryState: { state: "empty" },
    });
    await flushHook();
    expect(currentResult().items).toEqual([]);
    expect(currentResult().inventoryState).toEqual({ state: "empty" });
    expect(currentResult().status).toBe("Exhausted");
  });
});
