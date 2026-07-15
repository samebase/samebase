// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFunctionName, type FunctionReference } from "convex/server";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../convex/_generated/dataModel";
import {
  loadRepositoryInventorySnapshot,
  useRepositoryInventorySnapshot,
} from "./useRepositoryInventorySnapshot";

const { convexClientMock, convexQueryMock } = vi.hoisted(() => {
  const query =
    vi.fn<
      (reference: FunctionReference<"query">, args: Record<string, unknown>) => Promise<unknown>
    >();
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
type BranchPageQuery = SnapshotLoadArgs["queryBranchPage"];
type BranchPageResult = Awaited<ReturnType<BranchPageQuery>>;
type ReadyBranchPage = Extract<BranchPageResult, { state: "ready" }>;
type BranchItem = ReadyBranchPage["page"][number];
type PullRequestPageQuery = SnapshotLoadArgs["queryPullRequestPage"];
type PullRequestPageResult = Awaited<ReturnType<PullRequestPageQuery>>;
type ReadyPullRequestPage = Extract<PullRequestPageResult, { state: "ready" }>;
type PullRequestItem = ReadyPullRequestPage["page"][number];
type LabelPageQuery = SnapshotLoadArgs["queryLabelPage"];
type LabelPageResult = Awaited<ReturnType<LabelPageQuery>>;
type ReadyLabelPage = Extract<LabelPageResult, { state: "ready" }>;
type LabelFacetPageQuery = SnapshotLoadArgs["queryLabelFacetPage"];
type LabelFacetPageResult = Awaited<ReturnType<LabelFacetPageQuery>>;
type ReadyLabelFacetPage = Extract<LabelFacetPageResult, { state: "ready" }>;
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

function fakeViewId(
  value = "nv7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a",
): Id<"vaultRepositoryInventoryFilterViews"> {
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

function branch(rowKey: string, name: string, isDefault = name === "main"): BranchItem {
  return {
    kind: "branch",
    rowKey,
    name,
    isDefault,
    headCommit: { sha: `${name}-sha`, checks },
  };
}

function pullRequest(rowKey: string, labelCount: number, number = 42): PullRequestItem {
  return {
    kind: "pull_request",
    rowKey,
    number,
    url: `https://github.com/ada/inventory/pull/${number}`,
    title: `Pull request ${number}`,
    isDraft: false,
    baseRefName: "main",
    headRepositoryFullName: "ada/inventory",
    headRefName: `feature/${number}`,
    canOpenInSamebase: true,
    labelCount,
    headCommit: { sha: `feature-${number}-sha`, checks },
  };
}

function readyInventoryState(
  snapshotId: Id<"vaultRepositoryInventorySnapshots">,
  viewId: Id<"vaultRepositoryInventoryFilterViews">,
  defaultBranch: string | null = "main",
) {
  return {
    state: "ready" as const,
    activeSnapshotId: snapshotId,
    activeFilterViewId: viewId,
    activeFilterRevision: 1,
    repositoryFullName: "ada/inventory",
    defaultBranch,
    publishedAt: 1_000,
    checkedAt: 1_000,
  };
}

function readyBranchPage(args: {
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  expectedBranchCount: number;
  page: BranchItem[];
  isDone: boolean;
  continueCursor?: string;
}): BranchPageResult {
  return {
    state: "ready",
    snapshotId: args.snapshotId,
    expectedBranchCount: args.expectedBranchCount,
    page: args.page,
    isDone: args.isDone,
    continueCursor: args.continueCursor ?? "",
  };
}

function readyPullRequestPage(args: {
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  viewId: Id<"vaultRepositoryInventoryFilterViews">;
  expectedVisiblePullRequestCount: number;
  totalPullRequestCount: number;
  page: PullRequestItem[];
  isDone: boolean;
  continueCursor?: string;
}): PullRequestPageResult {
  return {
    state: "ready",
    snapshotId: args.snapshotId,
    viewId: args.viewId,
    expectedVisiblePullRequestCount: args.expectedVisiblePullRequestCount,
    totalPullRequestCount: args.totalPullRequestCount,
    page: args.page,
    isDone: args.isDone,
    continueCursor: args.continueCursor ?? "",
  };
}

function readyLabelPage(args: {
  expectedLabelCount: number;
  expectedChunkCount: number;
  page: ReadyLabelPage["page"];
  isDone?: boolean;
  continueCursor?: string;
}): LabelPageResult {
  return {
    state: "ready",
    expectedLabelCount: args.expectedLabelCount,
    expectedChunkCount: args.expectedChunkCount,
    page: args.page,
    isDone: args.isDone ?? true,
    continueCursor: args.continueCursor ?? "",
  };
}

function emptyLabelPage(): LabelPageResult {
  return readyLabelPage({ expectedLabelCount: 0, expectedChunkCount: 0, page: [] });
}

function readyLabelFacetPage(args: {
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  expectedFacetCount: number;
  noLabelPullRequestCount: number;
  page: ReadyLabelFacetPage["page"];
  isDone: boolean;
  continueCursor?: string;
}): LabelFacetPageResult {
  return {
    state: "ready",
    snapshotId: args.snapshotId,
    expectedFacetCount: args.expectedFacetCount,
    noLabelPullRequestCount: args.noLabelPullRequestCount,
    page: args.page,
    isDone: args.isDone,
    continueCursor: args.continueCursor ?? "",
  };
}

function emptyLabelFacetPage(
  snapshotId: Id<"vaultRepositoryInventorySnapshots">,
): LabelFacetPageResult {
  return readyLabelFacetPage({
    snapshotId,
    expectedFacetCount: 0,
    noLabelPullRequestCount: 0,
    page: [],
    isDone: true,
  });
}

describe("loadRepositoryInventorySnapshot", () => {
  it("returns only after every visible PR label and complete-snapshot facet is loaded", async () => {
    const snapshotId = fakeSnapshotId();
    const viewId = fakeViewId();
    const rowKey = "pull-request:PR_42";
    const queryBranchPage: BranchPageQuery = async () =>
      readyBranchPage({
        snapshotId,
        expectedBranchCount: 1,
        page: [branch("branch:main", "main")],
        isDone: true,
      });
    const queryPullRequestPage: PullRequestPageQuery = async () =>
      readyPullRequestPage({
        snapshotId,
        viewId,
        expectedVisiblePullRequestCount: 1,
        totalPullRequestCount: 4,
        page: [pullRequest(rowKey, 3)],
        isDone: true,
      });
    let finishLabels: ((result: LabelPageResult) => void) | undefined;
    const labelResult = new Promise<LabelPageResult>((resolve) => {
      finishLabels = resolve;
    });
    const queryLabelPage: LabelPageQuery = async () => await labelResult;
    let finishFacets: ((result: LabelFacetPageResult) => void) | undefined;
    const finalFacetPage = new Promise<LabelFacetPageResult>((resolve) => {
      finishFacets = resolve;
    });
    const queryLabelFacetPage: LabelFacetPageQuery = async (args) =>
      args.paginationOpts.cursor === null
        ? readyLabelFacetPage({
            snapshotId,
            expectedFacetCount: 2,
            noLabelPullRequestCount: 2,
            page: [{ name: "bug", color: "ff0000", pullRequestCount: 2 }],
            isDone: false,
            continueCursor: "next-facet",
          })
        : await finalFacetPage;

    let resolved = false;
    const loading = loadSnapshot({
      queryClient: queryClient(),
      queryBranchPage,
      queryPullRequestPage,
      queryLabelPage,
      queryLabelFacetPage,
      vaultId: fakeVaultId(),
      snapshotId,
      viewId,
      expectedDefaultBranch: "main",
      requestedItemCount: 10,
    }).then((snapshot) => {
      resolved = true;
      return snapshot;
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    if (finishLabels === undefined) {
      throw new Error("Expected the visible pull request label query to start.");
    }
    finishLabels(
      readyLabelPage({
        expectedLabelCount: 3,
        expectedChunkCount: 2,
        page: [
          {
            chunkIndex: 0,
            labels: [{ name: "bug", color: "ff0000" }, { name: "priority" }],
          },
          { chunkIndex: 1, labels: [{ name: "ready", color: "00ff00" }] },
        ],
      }),
    );
    await Promise.resolve();
    expect(resolved).toBe(false);

    if (finishFacets === undefined) {
      throw new Error("Expected every label facet page to be requested.");
    }
    finishFacets(
      readyLabelFacetPage({
        snapshotId,
        expectedFacetCount: 2,
        noLabelPullRequestCount: 2,
        page: [{ name: "priority", pullRequestCount: 1 }],
        isDone: true,
      }),
    );

    await expect(loading).resolves.toEqual({
      snapshotId,
      viewId,
      expectedItemCount: 2,
      isDone: true,
      items: [
        branch("branch:main", "main"),
        {
          kind: "pull_request",
          rowKey,
          number: 42,
          url: "https://github.com/ada/inventory/pull/42",
          title: "Pull request 42",
          isDraft: false,
          baseRefName: "main",
          headRepositoryFullName: "ada/inventory",
          headRefName: "feature/42",
          canOpenInSamebase: true,
          headCommit: { sha: "feature-42-sha", checks },
          labels: [
            { name: "bug", color: "ff0000" },
            { name: "priority" },
            { name: "ready", color: "00ff00" },
          ],
        },
      ],
      filterSummary: {
        labelFacets: [
          { name: "bug", color: "ff0000", pullRequestCount: 2 },
          { name: "priority", pullRequestCount: 1 },
        ],
        noLabelPullRequestCount: 2,
        totalPullRequestCount: 4,
        visiblePullRequestCount: 1,
      },
      branchProgress: {
        items: [branch("branch:main", "main")],
        isDone: true,
        continueCursor: null,
      },
      pullRequestProgress: {
        items: [pullRequest(rowKey, 3)],
        isDone: true,
        continueCursor: null,
      },
    });
  });

  it("resumes retained pages and loads labels in bounded batches", async () => {
    const snapshotId = fakeSnapshotId();
    const viewId = fakeViewId();
    const client = queryClient();
    const pullRequests = Array.from({ length: 32 }, (_, index) =>
      pullRequest(`pull-request:${index + 1}`, 0, index + 1),
    );
    let pullRequestPageCount = 0;
    let labelPageCount = 0;
    let activeLabelPageCount = 0;
    let maximumActiveLabelPageCount = 0;
    let labelFacetPageCount = 0;
    const queryPullRequestPage: PullRequestPageQuery = async (args) => {
      pullRequestPageCount += 1;
      const startIndex =
        args.paginationOpts.cursor === null ? 0 : Number(args.paginationOpts.cursor);
      const page = pullRequests.slice(startIndex, startIndex + 10);
      const nextIndex = startIndex + page.length;
      return readyPullRequestPage({
        snapshotId,
        viewId,
        expectedVisiblePullRequestCount: pullRequests.length,
        totalPullRequestCount: pullRequests.length,
        page,
        isDone: nextIndex === pullRequests.length,
        continueCursor: String(nextIndex),
      });
    };
    const queryLabelPage: LabelPageQuery = async () => {
      labelPageCount += 1;
      activeLabelPageCount += 1;
      maximumActiveLabelPageCount = Math.max(maximumActiveLabelPageCount, activeLabelPageCount);
      await Promise.resolve();
      activeLabelPageCount -= 1;
      return emptyLabelPage();
    };
    const queryLabelFacetPage: LabelFacetPageQuery = async () => {
      labelFacetPageCount += 1;
      return emptyLabelFacetPage(snapshotId);
    };
    const baseArgs = {
      queryClient: client,
      queryBranchPage: async () =>
        readyBranchPage({
          snapshotId,
          expectedBranchCount: 1,
          page: [branch("branch:main", "main")],
          isDone: true,
        }),
      queryPullRequestPage,
      queryLabelPage,
      queryLabelFacetPage,
      vaultId: fakeVaultId(),
      snapshotId,
      viewId,
      expectedDefaultBranch: "main",
    } satisfies Omit<SnapshotLoadArgs, "requestedItemCount" | "signal" | "prior">;

    const first = await loadSnapshot({ ...baseArgs, requestedItemCount: 21 });
    expect(first.items).toHaveLength(21);
    expect(pullRequestPageCount).toBe(2);
    expect(labelPageCount).toBe(20);
    expect(maximumActiveLabelPageCount).toBe(8);
    expect(labelFacetPageCount).toBe(1);

    client.clear();
    const second = await loadSnapshot({
      ...baseArgs,
      requestedItemCount: 31,
      prior: first,
    });

    expect(second.items).toHaveLength(31);
    expect(pullRequestPageCount).toBe(4);
    expect(labelPageCount).toBe(30);
    expect(maximumActiveLabelPageCount).toBe(8);
    expect(labelFacetPageCount).toBe(1);
  });

  it("uses the filtered PR view directly while keeping every branch independent", async () => {
    const snapshotId = fakeSnapshotId();
    const viewId = fakeViewId();
    let pullRequestPageCount = 0;
    const queryPullRequestPage: PullRequestPageQuery = async () => {
      pullRequestPageCount += 1;
      return readyPullRequestPage({
        snapshotId,
        viewId,
        expectedVisiblePullRequestCount: 1,
        totalPullRequestCount: 101,
        page: [pullRequest("pull-request:visible", 0, 101)],
        isDone: true,
      });
    };

    await expect(
      loadSnapshot({
        queryClient: queryClient(),
        queryBranchPage: async () =>
          readyBranchPage({
            snapshotId,
            expectedBranchCount: 2,
            page: [branch("branch:main", "main"), branch("branch:feature", "feature")],
            isDone: true,
          }),
        queryPullRequestPage,
        queryLabelPage: async () => emptyLabelPage(),
        queryLabelFacetPage: async () =>
          readyLabelFacetPage({
            snapshotId,
            expectedFacetCount: 0,
            noLabelPullRequestCount: 50,
            page: [],
            isDone: true,
          }),
        vaultId: fakeVaultId(),
        snapshotId,
        viewId,
        expectedDefaultBranch: "main",
        requestedItemCount: 3,
      }),
    ).resolves.toMatchObject({
      expectedItemCount: 3,
      isDone: true,
      items: [
        { kind: "branch", rowKey: "branch:main" },
        { kind: "pull_request", rowKey: "pull-request:visible" },
        { kind: "branch", rowKey: "branch:feature" },
      ],
      filterSummary: {
        totalPullRequestCount: 101,
        visiblePullRequestCount: 1,
        noLabelPullRequestCount: 50,
      },
    });
    expect(pullRequestPageCount).toBe(1);
  });

  it("keeps an unavailable view distinct from a legitimately empty snapshot", async () => {
    const snapshotId = fakeSnapshotId();
    const viewId = fakeViewId();
    const queryBranchPage: BranchPageQuery = async () =>
      readyBranchPage({ snapshotId, expectedBranchCount: 0, page: [], isDone: true });
    const queryLabelFacetPage: LabelFacetPageQuery = async () => emptyLabelFacetPage(snapshotId);
    const queryLabelPage: LabelPageQuery = async () => ({ state: "unavailable" });

    await expect(
      loadSnapshot({
        queryClient: queryClient(),
        queryBranchPage,
        queryPullRequestPage: async () => ({ state: "unavailable" }),
        queryLabelPage,
        queryLabelFacetPage,
        vaultId: fakeVaultId(),
        snapshotId,
        viewId,
        expectedDefaultBranch: null,
        requestedItemCount: 10,
      }),
    ).rejects.toThrow("Repository inventory pull request view is no longer available.");

    await expect(
      loadSnapshot({
        queryClient: queryClient(),
        queryBranchPage,
        queryPullRequestPage: async () =>
          readyPullRequestPage({
            snapshotId,
            viewId,
            expectedVisiblePullRequestCount: 0,
            totalPullRequestCount: 0,
            page: [],
            isDone: true,
          }),
        queryLabelPage,
        queryLabelFacetPage,
        vaultId: fakeVaultId(),
        snapshotId,
        viewId,
        expectedDefaultBranch: null,
        requestedItemCount: 10,
      }),
    ).resolves.toMatchObject({ items: [], expectedItemCount: 0, isDone: true });
  });

  it("rejects a pull request page attributed to a different filter view", async () => {
    const snapshotId = fakeSnapshotId();
    const viewId = fakeViewId();

    await expect(
      loadSnapshot({
        queryClient: queryClient(),
        queryBranchPage: async () =>
          readyBranchPage({ snapshotId, expectedBranchCount: 0, page: [], isDone: true }),
        queryPullRequestPage: async () =>
          readyPullRequestPage({
            snapshotId,
            viewId: fakeViewId("stale-view"),
            expectedVisiblePullRequestCount: 0,
            totalPullRequestCount: 0,
            page: [],
            isDone: true,
          }),
        queryLabelPage: async () => ({ state: "unavailable" }),
        queryLabelFacetPage: async () => emptyLabelFacetPage(snapshotId),
        vaultId: fakeVaultId(),
        snapshotId,
        viewId,
        expectedDefaultBranch: null,
        requestedItemCount: 10,
      }),
    ).rejects.toThrow("Repository inventory pull request totals changed while loading.");
  });

  it("rejects duplicate branches across branch pages", async () => {
    const snapshotId = fakeSnapshotId();
    const viewId = fakeViewId();
    const queryBranchPage: BranchPageQuery = async (args) =>
      args.paginationOpts.cursor === null
        ? readyBranchPage({
            snapshotId,
            expectedBranchCount: 2,
            page: [branch("branch:main", "main")],
            isDone: false,
            continueCursor: "next",
          })
        : readyBranchPage({
            snapshotId,
            expectedBranchCount: 2,
            page: [branch("branch:main", "main")],
            isDone: true,
          });

    await expect(
      loadSnapshot({
        queryClient: queryClient(),
        queryBranchPage,
        queryPullRequestPage: async () =>
          readyPullRequestPage({
            snapshotId,
            viewId,
            expectedVisiblePullRequestCount: 0,
            totalPullRequestCount: 0,
            page: [],
            isDone: true,
          }),
        queryLabelPage: async () => ({ state: "unavailable" }),
        queryLabelFacetPage: async () => emptyLabelFacetPage(snapshotId),
        vaultId: fakeVaultId(),
        snapshotId,
        viewId,
        expectedDefaultBranch: "main",
        requestedItemCount: 2,
      }),
    ).rejects.toThrow("Repository inventory snapshot contains a duplicate branch.");
  });

  it("rejects duplicate pull requests across filtered view pages", async () => {
    const snapshotId = fakeSnapshotId();
    const viewId = fakeViewId();
    const duplicate = pullRequest("pull-request:duplicate", 0);
    const queryPullRequestPage: PullRequestPageQuery = async (args) =>
      args.paginationOpts.cursor === null
        ? readyPullRequestPage({
            snapshotId,
            viewId,
            expectedVisiblePullRequestCount: 2,
            totalPullRequestCount: 2,
            page: [duplicate],
            isDone: false,
            continueCursor: "next",
          })
        : readyPullRequestPage({
            snapshotId,
            viewId,
            expectedVisiblePullRequestCount: 2,
            totalPullRequestCount: 2,
            page: [duplicate],
            isDone: true,
          });

    await expect(
      loadSnapshot({
        queryClient: queryClient(),
        queryBranchPage: async () =>
          readyBranchPage({
            snapshotId,
            expectedBranchCount: 1,
            page: [branch("branch:main", "main")],
            isDone: true,
          }),
        queryPullRequestPage,
        queryLabelPage: async () => emptyLabelPage(),
        queryLabelFacetPage: async () => emptyLabelFacetPage(snapshotId),
        vaultId: fakeVaultId(),
        snapshotId,
        viewId,
        expectedDefaultBranch: "main",
        requestedItemCount: 3,
      }),
    ).rejects.toThrow("Repository inventory filter view contains a duplicate pull request.");
  });

  it("rejects an early terminal pull request page", async () => {
    const snapshotId = fakeSnapshotId();
    const viewId = fakeViewId();

    await expect(
      loadSnapshot({
        queryClient: queryClient(),
        queryBranchPage: async () =>
          readyBranchPage({
            snapshotId,
            expectedBranchCount: 1,
            page: [branch("branch:main", "main")],
            isDone: true,
          }),
        queryPullRequestPage: async () =>
          readyPullRequestPage({
            snapshotId,
            viewId,
            expectedVisiblePullRequestCount: 2,
            totalPullRequestCount: 2,
            page: [pullRequest("pull-request:first", 0)],
            isDone: true,
          }),
        queryLabelPage: async () => emptyLabelPage(),
        queryLabelFacetPage: async () => emptyLabelFacetPage(snapshotId),
        vaultId: fakeVaultId(),
        snapshotId,
        viewId,
        expectedDefaultBranch: "main",
        requestedItemCount: 3,
      }),
    ).rejects.toThrow("Repository inventory pull requests ended with an invalid total.");
  });

  it("rejects incomplete label chunks instead of showing missing labels", async () => {
    const snapshotId = fakeSnapshotId();
    const viewId = fakeViewId();

    await expect(
      loadSnapshot({
        queryClient: queryClient(),
        queryBranchPage: async () =>
          readyBranchPage({
            snapshotId,
            expectedBranchCount: 1,
            page: [branch("branch:main", "main")],
            isDone: true,
          }),
        queryPullRequestPage: async () =>
          readyPullRequestPage({
            snapshotId,
            viewId,
            expectedVisiblePullRequestCount: 1,
            totalPullRequestCount: 1,
            page: [pullRequest("pull-request:labels", 2)],
            isDone: true,
          }),
        queryLabelPage: async () =>
          readyLabelPage({
            expectedLabelCount: 2,
            expectedChunkCount: 2,
            page: [{ chunkIndex: 1, labels: [{ name: "second" }] }],
          }),
        queryLabelFacetPage: async () => emptyLabelFacetPage(snapshotId),
        vaultId: fakeVaultId(),
        snapshotId,
        viewId,
        expectedDefaultBranch: "main",
        requestedItemCount: 10,
      }),
    ).rejects.toThrow("Repository inventory label chunks are incomplete.");
  });

  it("rejects incomplete label facets instead of offering partial filter options", async () => {
    const snapshotId = fakeSnapshotId();
    const viewId = fakeViewId();

    await expect(
      loadSnapshot({
        queryClient: queryClient(),
        queryBranchPage: async () =>
          readyBranchPage({ snapshotId, expectedBranchCount: 0, page: [], isDone: true }),
        queryPullRequestPage: async () =>
          readyPullRequestPage({
            snapshotId,
            viewId,
            expectedVisiblePullRequestCount: 0,
            totalPullRequestCount: 1,
            page: [],
            isDone: true,
          }),
        queryLabelPage: async () => ({ state: "unavailable" }),
        queryLabelFacetPage: async () =>
          readyLabelFacetPage({
            snapshotId,
            expectedFacetCount: 2,
            noLabelPullRequestCount: 1,
            page: [{ name: "bug", pullRequestCount: 1 }],
            isDone: true,
          }),
        vaultId: fakeVaultId(),
        snapshotId,
        viewId,
        expectedDefaultBranch: null,
        requestedItemCount: 10,
      }),
    ).rejects.toThrow("Repository inventory label facets ended before every facet was loaded.");
  });

  it("loads only the requested leading branch slice of a large snapshot", async () => {
    const snapshotId = fakeSnapshotId();
    const viewId = fakeViewId();
    let branchPageCount = 0;
    const branches = [
      branch("branch:main", "main"),
      ...Array.from({ length: 9 }, (_, index) =>
        branch(`branch:branch-${index + 1}`, `branch-${index + 1}`),
      ),
    ];

    await expect(
      loadSnapshot({
        queryClient: queryClient(),
        queryBranchPage: async () => {
          branchPageCount += 1;
          return readyBranchPage({
            snapshotId,
            expectedBranchCount: 100,
            page: branches,
            isDone: false,
            continueCursor: "next",
          });
        },
        queryPullRequestPage: async () =>
          readyPullRequestPage({
            snapshotId,
            viewId,
            expectedVisiblePullRequestCount: 0,
            totalPullRequestCount: 0,
            page: [],
            isDone: true,
          }),
        queryLabelPage: async () => ({ state: "unavailable" }),
        queryLabelFacetPage: async () => emptyLabelFacetPage(snapshotId),
        vaultId: fakeVaultId(),
        snapshotId,
        viewId,
        expectedDefaultBranch: "main",
        requestedItemCount: 10,
      }),
    ).resolves.toMatchObject({ expectedItemCount: 100, isDone: false, items: branches });
    expect(branchPageCount).toBe(1);
  });

  it("stops before requesting another branch page after cancellation", async () => {
    const snapshotId = fakeSnapshotId();
    const viewId = fakeViewId();
    let branchPageCount = 0;
    let finishFirstPage: ((result: BranchPageResult) => void) | undefined;
    const firstPage = new Promise<BranchPageResult>((resolve) => {
      finishFirstPage = resolve;
    });
    const controller = new AbortController();
    const loading = loadRepositoryInventorySnapshot({
      queryClient: queryClient(),
      queryBranchPage: async () => {
        branchPageCount += 1;
        return await firstPage;
      },
      queryPullRequestPage: async () =>
        readyPullRequestPage({
          snapshotId,
          viewId,
          expectedVisiblePullRequestCount: 0,
          totalPullRequestCount: 0,
          page: [],
          isDone: true,
        }),
      queryLabelPage: async () => ({ state: "unavailable" }),
      queryLabelFacetPage: async () => emptyLabelFacetPage(snapshotId),
      vaultId: fakeVaultId(),
      snapshotId,
      viewId,
      expectedDefaultBranch: "main",
      requestedItemCount: 20,
      signal: controller.signal,
    });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    if (finishFirstPage === undefined) {
      throw new Error("Expected the first branch page query to start.");
    }
    finishFirstPage(
      readyBranchPage({
        snapshotId,
        expectedBranchCount: 20,
        page: [
          branch("branch:main", "main"),
          ...Array.from({ length: 9 }, (_, index) =>
            branch(`branch:branch-${index + 1}`, `branch-${index + 1}`),
          ),
        ],
        isDone: false,
        continueCursor: "next",
      }),
    );

    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(branchPageCount).toBe(1);
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

type HookQueryHandlers = {
  branch: (args: Record<string, unknown>) => Promise<BranchPageResult>;
  pullRequest: (args: Record<string, unknown>) => Promise<PullRequestPageResult>;
  label: (args: Record<string, unknown>) => Promise<LabelPageResult>;
  labelFacet: (args: Record<string, unknown>) => Promise<LabelFacetPageResult>;
};

describe("useRepositoryInventorySnapshot", () => {
  let client: QueryClient;
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;
  let latestResult: SnapshotHookResult | undefined;
  let hookQueries: HookQueryHandlers;

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
      for (let index = 0; index < 10; index += 1) {
        await Promise.resolve();
      }
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
    hookQueries = {
      branch: async () => ({ state: "unavailable" }),
      pullRequest: async () => ({ state: "unavailable" }),
      label: async () => ({ state: "unavailable" }),
      labelFacet: async () => ({ state: "unavailable" }),
    };
    convexQueryMock.mockReset();
    convexQueryMock.mockImplementation(async (reference, args) => {
      switch (getFunctionName(reference)) {
        case "repositoryInventory:listRepositoryInventoryBranchPage":
          return await hookQueries.branch(args);
        case "repositoryInventory:listRepositoryInventoryPullRequestPage":
          return await hookQueries.pullRequest(args);
        case "repositoryInventory:listRepositoryInventoryLabelPage":
          return await hookQueries.label(args);
        case "repositoryInventory:listRepositoryInventoryLabelFacetPage":
          return await hookQueries.labelFacet(args);
        default:
          throw new Error(`Unexpected Convex query: ${getFunctionName(reference)}`);
      }
    });
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

  it("keeps the old committed snapshot and view until the replacement pair is complete", async () => {
    const vaultId = fakeVaultId();
    const firstSnapshotId = fakeSnapshotId("first-snapshot");
    const firstViewId = fakeViewId("first-view");
    const secondSnapshotId = fakeSnapshotId("second-snapshot");
    const secondViewId = fakeViewId("second-view");
    const transitionBranches = [
      branch("branch:main", "main"),
      ...Array.from({ length: 11 }, (_, index) =>
        branch(`branch:transition-${index + 1}`, `transition-${index + 1}`),
      ),
    ];
    let finishSecondFacets: ((result: LabelFacetPageResult) => void) | undefined;
    const secondFacets = new Promise<LabelFacetPageResult>((resolve) => {
      finishSecondFacets = resolve;
    });
    hookQueries = {
      branch: async (args) => {
        const snapshotId = args.snapshotId === firstSnapshotId ? firstSnapshotId : secondSnapshotId;
        return readyBranchPage({
          snapshotId,
          expectedBranchCount: transitionBranches.length,
          page: transitionBranches,
          isDone: true,
        });
      },
      pullRequest: async (args) =>
        args.viewId === firstViewId
          ? readyPullRequestPage({
              snapshotId: firstSnapshotId,
              viewId: firstViewId,
              expectedVisiblePullRequestCount: 0,
              totalPullRequestCount: 0,
              page: [],
              isDone: true,
            })
          : readyPullRequestPage({
              snapshotId: secondSnapshotId,
              viewId: secondViewId,
              expectedVisiblePullRequestCount: 1,
              totalPullRequestCount: 4,
              page: [pullRequest("pull-request:new", 0, 99)],
              isDone: true,
            }),
      label: async () => emptyLabelPage(),
      labelFacet: async (args) =>
        args.snapshotId === firstSnapshotId
          ? emptyLabelFacetPage(firstSnapshotId)
          : await secondFacets,
    };

    renderHook({
      vaultId,
      snapshotId: firstSnapshotId,
      viewId: firstViewId,
      inventoryState: readyInventoryState(firstSnapshotId, firstViewId),
    });
    await flushHook();
    expect(currentResult().items).toHaveLength(10);
    expect(currentResult().inventoryState).toMatchObject({
      activeSnapshotId: firstSnapshotId,
      activeFilterViewId: firstViewId,
    });
    act(() => {
      currentResult().loadMore(20);
    });
    await flushHook();
    expect(currentResult().items).toHaveLength(transitionBranches.length);

    renderHook({
      vaultId,
      snapshotId: secondSnapshotId,
      viewId: secondViewId,
      inventoryState: readyInventoryState(secondSnapshotId, secondViewId),
    });
    await flushHook();
    expect(currentResult().items).toHaveLength(transitionBranches.length);
    expect(currentResult().inventoryState).toMatchObject({
      activeSnapshotId: firstSnapshotId,
      activeFilterViewId: firstViewId,
    });

    if (finishSecondFacets === undefined) {
      throw new Error("Expected the replacement snapshot facets to start loading.");
    }
    const resolveSecondFacets = finishSecondFacets;
    await act(async () => {
      resolveSecondFacets(
        readyLabelFacetPage({
          snapshotId: secondSnapshotId,
          expectedFacetCount: 1,
          noLabelPullRequestCount: 2,
          page: [{ name: "bug", pullRequestCount: 2 }],
          isDone: true,
        }),
      );
      await Promise.resolve();
    });
    await flushHook();

    expect(currentResult().items.map((item) => item.rowKey)).toEqual([
      "branch:main",
      "pull-request:new",
      ...transitionBranches.slice(1).map((item) => item.rowKey),
    ]);
    expect(currentResult().inventoryState).toMatchObject({
      activeSnapshotId: secondSnapshotId,
      activeFilterViewId: secondViewId,
    });
    expect(currentResult().filterSummary).toEqual({
      labelFacets: [{ name: "bug", pullRequestCount: 2 }],
      noLabelPullRequestCount: 2,
      totalPullRequestCount: 4,
      visiblePullRequestCount: 1,
    });
  });

  it("does not attribute an interrupted vault load to a previously committed vault", async () => {
    const firstVaultId = fakeVaultId("first-vault");
    const secondVaultId = fakeVaultId("second-vault");
    const firstSnapshotId = fakeSnapshotId("first-snapshot");
    const secondSnapshotId = fakeSnapshotId("second-snapshot");
    const firstViewId = fakeViewId("first-view");
    const secondViewId = fakeViewId("second-view");
    let finishSecondBranches: ((result: BranchPageResult) => void) | undefined;
    const secondBranches = new Promise<BranchPageResult>((resolve) => {
      finishSecondBranches = resolve;
    });
    hookQueries = {
      branch: async (args) =>
        args.vaultId === firstVaultId
          ? readyBranchPage({
              snapshotId: firstSnapshotId,
              expectedBranchCount: 1,
              page: [branch("branch:first", "main")],
              isDone: true,
            })
          : await secondBranches,
      pullRequest: async (args) =>
        args.vaultId === firstVaultId
          ? readyPullRequestPage({
              snapshotId: firstSnapshotId,
              viewId: firstViewId,
              expectedVisiblePullRequestCount: 0,
              totalPullRequestCount: 0,
              page: [],
              isDone: true,
            })
          : readyPullRequestPage({
              snapshotId: secondSnapshotId,
              viewId: secondViewId,
              expectedVisiblePullRequestCount: 0,
              totalPullRequestCount: 0,
              page: [],
              isDone: true,
            }),
      label: async () => ({ state: "unavailable" }),
      labelFacet: async (args) =>
        args.vaultId === firstVaultId
          ? emptyLabelFacetPage(firstSnapshotId)
          : emptyLabelFacetPage(secondSnapshotId),
    };

    renderHook({
      vaultId: firstVaultId,
      snapshotId: firstSnapshotId,
      viewId: firstViewId,
      inventoryState: readyInventoryState(firstSnapshotId, firstViewId),
    });
    await flushHook();
    expect(currentResult().items.map((item) => item.rowKey)).toEqual(["branch:first"]);

    renderHook({
      vaultId: secondVaultId,
      snapshotId: secondSnapshotId,
      viewId: secondViewId,
      inventoryState: readyInventoryState(secondSnapshotId, secondViewId),
    });
    expect(currentResult().items).toEqual([]);
    expect(currentResult().status).toBe("LoadingFirstPage");

    renderHook({
      vaultId: firstVaultId,
      snapshotId: firstSnapshotId,
      viewId: firstViewId,
      inventoryState: readyInventoryState(firstSnapshotId, firstViewId),
    });
    await flushHook();
    if (finishSecondBranches === undefined) {
      throw new Error("Expected the second vault branch query to start.");
    }
    finishSecondBranches(
      readyBranchPage({
        snapshotId: secondSnapshotId,
        expectedBranchCount: 1,
        page: [branch("branch:second", "main")],
        isDone: true,
      }),
    );
    await flushHook();

    expect(currentResult().items.map((item) => item.rowKey)).toEqual(["branch:first"]);
    expect(currentResult().inventoryState).toMatchObject({
      activeSnapshotId: firstSnapshotId,
      activeFilterViewId: firstViewId,
    });
  });

  it("retains the requested depth independently for each vault", async () => {
    const firstVaultId = fakeVaultId("first-vault");
    const secondVaultId = fakeVaultId("second-vault");
    const firstSnapshotId = fakeSnapshotId("first-snapshot");
    const secondSnapshotId = fakeSnapshotId("second-snapshot");
    const firstViewId = fakeViewId("first-view");
    const secondViewId = fakeViewId("second-view");
    const branchesByVaultId = new Map([
      [
        firstVaultId,
        Array.from({ length: 20 }, (_, index) =>
          branch(
            index === 0 ? "branch:first-main" : `branch:first-${index}`,
            index === 0 ? "main" : `first-${index}`,
          ),
        ),
      ],
      [
        secondVaultId,
        Array.from({ length: 20 }, (_, index) =>
          branch(
            index === 0 ? "branch:second-main" : `branch:second-${index}`,
            index === 0 ? "main" : `second-${index}`,
          ),
        ),
      ],
    ]);
    hookQueries = {
      branch: async (args) => {
        const vaultId = args.vaultId === firstVaultId ? firstVaultId : secondVaultId;
        const snapshotId = vaultId === firstVaultId ? firstSnapshotId : secondSnapshotId;
        const branches = branchesByVaultId.get(vaultId);
        if (branches === undefined) {
          throw new Error("Expected branches for the requested vault.");
        }
        return readyBranchPage({
          snapshotId,
          expectedBranchCount: branches.length,
          page: branches,
          isDone: true,
        });
      },
      pullRequest: async (args) => {
        const isFirstVault = args.vaultId === firstVaultId;
        return readyPullRequestPage({
          snapshotId: isFirstVault ? firstSnapshotId : secondSnapshotId,
          viewId: isFirstVault ? firstViewId : secondViewId,
          expectedVisiblePullRequestCount: 0,
          totalPullRequestCount: 0,
          page: [],
          isDone: true,
        });
      },
      label: async () => ({ state: "unavailable" }),
      labelFacet: async (args) =>
        emptyLabelFacetPage(args.vaultId === firstVaultId ? firstSnapshotId : secondSnapshotId),
    };

    renderHook({
      vaultId: firstVaultId,
      snapshotId: firstSnapshotId,
      viewId: firstViewId,
      inventoryState: readyInventoryState(firstSnapshotId, firstViewId),
    });
    await flushHook();
    expect(currentResult().items).toHaveLength(10);
    act(() => {
      currentResult().loadMore(10);
    });
    await flushHook();
    expect(currentResult().items).toHaveLength(20);

    renderHook({
      vaultId: secondVaultId,
      snapshotId: secondSnapshotId,
      viewId: secondViewId,
      inventoryState: readyInventoryState(secondSnapshotId, secondViewId),
    });
    await flushHook();
    expect(currentResult().items).toHaveLength(10);

    renderHook({
      vaultId: firstVaultId,
      snapshotId: firstSnapshotId,
      viewId: firstViewId,
      inventoryState: readyInventoryState(firstSnapshotId, firstViewId),
    });
    await flushHook();
    expect(currentResult().items).toHaveLength(20);
  });

  it("retries an unavailable branch with fresh split-query cache entries", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const vaultId = fakeVaultId();
    const snapshotId = fakeSnapshotId();
    const viewId = fakeViewId();
    let branchQueryCount = 0;
    hookQueries = {
      branch: async () => {
        branchQueryCount += 1;
        return branchQueryCount === 1
          ? { state: "unavailable" }
          : readyBranchPage({
              snapshotId,
              expectedBranchCount: 1,
              page: [branch("branch:main", "main")],
              isDone: true,
            });
      },
      pullRequest: async () =>
        readyPullRequestPage({
          snapshotId,
          viewId,
          expectedVisiblePullRequestCount: 0,
          totalPullRequestCount: 0,
          page: [],
          isDone: true,
        }),
      label: async () => ({ state: "unavailable" }),
      labelFacet: async () => emptyLabelFacetPage(snapshotId),
    };

    renderHook({
      vaultId,
      snapshotId,
      viewId,
      inventoryState: readyInventoryState(snapshotId, viewId),
    });
    await flushHook();
    expect(branchQueryCount).toBe(1);
    expect(
      client.getQueryState(["repository-inventory-branch-page", vaultId, snapshotId, null]),
    ).toBeUndefined();
    expect(
      client.getQueryState([
        "repository-inventory-pull-request-page",
        vaultId,
        snapshotId,
        viewId,
        null,
      ]),
    ).toBeUndefined();

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      for (let index = 0; index < 10; index += 1) {
        await Promise.resolve();
      }
    });
    await flushHook();

    expect(branchQueryCount).toBe(2);
    expect(currentResult().items.map((item) => item.rowKey)).toEqual(["branch:main"]);
    expect(currentResult().status).toBe("Exhausted");
  });

  it("removes committed rows when the active publication disappears", async () => {
    const vaultId = fakeVaultId();
    const snapshotId = fakeSnapshotId();
    const viewId = fakeViewId();
    hookQueries = {
      branch: async () =>
        readyBranchPage({
          snapshotId,
          expectedBranchCount: 1,
          page: [branch("branch:published", "main")],
          isDone: true,
        }),
      pullRequest: async () =>
        readyPullRequestPage({
          snapshotId,
          viewId,
          expectedVisiblePullRequestCount: 0,
          totalPullRequestCount: 0,
          page: [],
          isDone: true,
        }),
      label: async () => ({ state: "unavailable" }),
      labelFacet: async () => emptyLabelFacetPage(snapshotId),
    };

    renderHook({
      vaultId,
      snapshotId,
      viewId,
      inventoryState: readyInventoryState(snapshotId, viewId),
    });
    await flushHook();
    expect(currentResult().items.map((item) => item.rowKey)).toEqual(["branch:published"]);

    renderHook({
      vaultId,
      snapshotId: undefined,
      viewId: undefined,
      inventoryState: { state: "empty" },
    });
    await flushHook();

    expect(currentResult().items).toEqual([]);
    expect(currentResult().filterSummary).toBeNull();
    expect(currentResult().inventoryState).toEqual({ state: "empty" });
    expect(currentResult().status).toBe("Exhausted");
  });
});
