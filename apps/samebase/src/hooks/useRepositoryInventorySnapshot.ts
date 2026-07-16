import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useConvex, type PaginationStatus } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const REPOSITORY_INVENTORY_INITIAL_ITEM_COUNT = 10;
const REPOSITORY_INVENTORY_ITEM_PAGE_SIZE = 10;
const REPOSITORY_INVENTORY_LABEL_CHUNK_PAGE_SIZE = 5;
const REPOSITORY_INVENTORY_LABEL_FACET_PAGE_SIZE = 25;
const REPOSITORY_INVENTORY_LABEL_LOAD_CONCURRENCY = 8;
const REPOSITORY_INVENTORY_RETRY_MS = 5_000;

type RepositoryInventoryState =
  (typeof api.repositoryInventory.getRepositoryInventoryState)["_returnType"];
type RepositoryInventoryBranchPageResult =
  (typeof api.repositoryInventory.listRepositoryInventoryBranchPage)["_returnType"];
type RepositoryInventoryBranchPageArgs =
  (typeof api.repositoryInventory.listRepositoryInventoryBranchPage)["_args"];
type RepositoryInventoryBranchPage = Extract<
  RepositoryInventoryBranchPageResult,
  { state: "ready" }
>;
type RepositoryInventoryBranchItem = RepositoryInventoryBranchPage["page"][number];
type RepositoryInventoryPullRequestPageResult =
  (typeof api.repositoryInventory.listRepositoryInventoryPullRequestPage)["_returnType"];
type RepositoryInventoryPullRequestPageArgs =
  (typeof api.repositoryInventory.listRepositoryInventoryPullRequestPage)["_args"];
type RepositoryInventoryPullRequestPage = Extract<
  RepositoryInventoryPullRequestPageResult,
  { state: "ready" }
>;
type RepositoryInventoryPullRequestItem = RepositoryInventoryPullRequestPage["page"][number];
type RepositoryInventoryLabelPageResult =
  (typeof api.repositoryInventory.listRepositoryInventoryLabelPage)["_returnType"];
type RepositoryInventoryLabelPageArgs =
  (typeof api.repositoryInventory.listRepositoryInventoryLabelPage)["_args"];
type RepositoryInventoryLabelPage = Extract<RepositoryInventoryLabelPageResult, { state: "ready" }>;
type RepositoryInventoryLabel = RepositoryInventoryLabelPage["page"][number]["labels"][number];
type RepositoryInventoryLabelFacetPageResult =
  (typeof api.repositoryInventory.listRepositoryInventoryLabelFacetPage)["_returnType"];
type RepositoryInventoryLabelFacetPageArgs =
  (typeof api.repositoryInventory.listRepositoryInventoryLabelFacetPage)["_args"];
type RepositoryInventoryLabelFacetPage = Extract<
  RepositoryInventoryLabelFacetPageResult,
  { state: "ready" }
>;
type RepositoryInventoryLabelFacet = RepositoryInventoryLabelFacetPage["page"][number];
type RepositoryInventoryBranchPageQuery = (
  args: RepositoryInventoryBranchPageArgs,
) => Promise<RepositoryInventoryBranchPageResult>;
type RepositoryInventoryPullRequestPageQuery = (
  args: RepositoryInventoryPullRequestPageArgs,
) => Promise<RepositoryInventoryPullRequestPageResult>;
type RepositoryInventoryLabelPageQuery = (
  args: RepositoryInventoryLabelPageArgs,
) => Promise<RepositoryInventoryLabelPageResult>;
type RepositoryInventoryLabelFacetPageQuery = (
  args: RepositoryInventoryLabelFacetPageArgs,
) => Promise<RepositoryInventoryLabelFacetPageResult>;

export type LoadedRepositoryInventoryItem =
  | RepositoryInventoryBranchItem
  | (Omit<RepositoryInventoryPullRequestItem, "labelCount"> & {
      labels: RepositoryInventoryLabel[];
    });

type LoadedRepositoryInventoryPullRequest = Extract<
  LoadedRepositoryInventoryItem,
  { kind: "pull_request" }
>;

type RepositoryInventoryPageProgress<Item> = {
  items: Item[];
  isDone: boolean;
  continueCursor: string | null;
  seenCursors: string[];
};

export type LoadedRepositoryInventoryFilterSummary = {
  labelFacets: RepositoryInventoryLabelFacet[];
  noLabelPullRequestCount: number;
  totalPullRequestCount: number;
  visiblePullRequestCount: number;
};

type LoadedRepositoryInventorySnapshot = {
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  viewId: Id<"vaultRepositoryInventoryFilterViews">;
  inventoryState: Exclude<RepositoryInventoryState, { state: "empty" }>;
  items: LoadedRepositoryInventoryItem[];
  filterSummary: LoadedRepositoryInventoryFilterSummary;
  branchProgress: RepositoryInventoryPageProgress<RepositoryInventoryBranchItem>;
  pullRequestProgress: RepositoryInventoryPageProgress<RepositoryInventoryPullRequestItem>;
  expectedItemCount: number;
  isDone: boolean;
};

type RepositoryInventorySnapshotKey = {
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  viewId: Id<"vaultRepositoryInventoryFilterViews">;
};

type RepositoryInventorySnapshotLoad = Omit<
  LoadedRepositoryInventorySnapshot,
  "inventoryState" | "vaultId"
>;

function nextRepositoryInventoryCursor(args: {
  kind: "branches" | "pull requests" | "labels" | "label facets";
  currentCursor: string | null;
  nextCursor: string;
  seenCursors: Set<string>;
}): string {
  if (
    args.nextCursor.length === 0 ||
    args.nextCursor === args.currentCursor ||
    args.seenCursors.has(args.nextCursor)
  ) {
    throw new Error(`Repository inventory ${args.kind} returned a nonadvancing cursor.`);
  }
  args.seenCursors.add(args.nextCursor);
  return args.nextCursor;
}

function branchPageQueryKey(args: {
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  cursor: string | null;
}) {
  return ["repository-inventory-branch-page", args.vaultId, args.snapshotId, args.cursor] as const;
}

function pullRequestPageQueryKey(args: {
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  viewId: Id<"vaultRepositoryInventoryFilterViews">;
  cursor: string | null;
}) {
  return [
    "repository-inventory-pull-request-page",
    args.vaultId,
    args.snapshotId,
    args.viewId,
    args.cursor,
  ] as const;
}

function labelPageQueryKey(args: {
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  rowKey: string;
  cursor: string | null;
}) {
  return [
    "repository-inventory-label-page",
    args.vaultId,
    args.snapshotId,
    args.rowKey,
    args.cursor,
  ] as const;
}

function labelFacetPageQueryKey(args: {
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  cursor: string | null;
}) {
  return [
    "repository-inventory-label-facet-page",
    args.vaultId,
    args.snapshotId,
    args.cursor,
  ] as const;
}

async function queryBranchPage(args: {
  query: RepositoryInventoryBranchPageQuery;
  queryClient: QueryClient;
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  cursor: string | null;
  signal: AbortSignal;
}): Promise<RepositoryInventoryBranchPage> {
  return await args.queryClient.fetchQuery({
    queryKey: branchPageQueryKey(args),
    queryFn: async ({ signal }) => {
      signal.throwIfAborted();
      const result = await args.query({
        vaultId: args.vaultId,
        snapshotId: args.snapshotId,
        paginationOpts: {
          cursor: args.cursor,
          numItems: REPOSITORY_INVENTORY_ITEM_PAGE_SIZE,
        },
      });
      signal.throwIfAborted();
      if (result.state === "unavailable") {
        throw new Error("Repository inventory branch snapshot is no longer available.");
      }
      return result;
    },
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

async function queryPullRequestPage(args: {
  query: RepositoryInventoryPullRequestPageQuery;
  queryClient: QueryClient;
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  viewId: Id<"vaultRepositoryInventoryFilterViews">;
  cursor: string | null;
  signal: AbortSignal;
}): Promise<RepositoryInventoryPullRequestPage> {
  return await args.queryClient.fetchQuery({
    queryKey: pullRequestPageQueryKey(args),
    queryFn: async ({ signal }) => {
      signal.throwIfAborted();
      const result = await args.query({
        vaultId: args.vaultId,
        snapshotId: args.snapshotId,
        viewId: args.viewId,
        paginationOpts: {
          cursor: args.cursor,
          numItems: REPOSITORY_INVENTORY_ITEM_PAGE_SIZE,
        },
      });
      signal.throwIfAborted();
      if (result.state === "unavailable") {
        throw new Error("Repository inventory pull request view is no longer available.");
      }
      return result;
    },
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

async function loadPullRequestLabels(args: {
  queryLabelPage: RepositoryInventoryLabelPageQuery;
  queryClient: QueryClient;
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  item: RepositoryInventoryPullRequestItem;
  signal: AbortSignal;
}): Promise<LoadedRepositoryInventoryItem> {
  if (args.item.labelCount === 0) {
    const { labelCount: _labelCount, ...pullRequest } = args.item;
    return { ...pullRequest, labels: [] };
  }

  const chunks: RepositoryInventoryLabelPage["page"] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let expectedChunkCount: number | null = null;
  let isDone = false;

  do {
    args.signal.throwIfAborted();
    const page: RepositoryInventoryLabelPage = await args.queryClient.fetchQuery({
      queryKey: labelPageQueryKey({
        vaultId: args.vaultId,
        snapshotId: args.snapshotId,
        rowKey: args.item.rowKey,
        cursor,
      }),
      queryFn: async ({ signal }) => {
        signal.throwIfAborted();
        const result = await args.queryLabelPage({
          vaultId: args.vaultId,
          snapshotId: args.snapshotId,
          rowKey: args.item.rowKey,
          paginationOpts: {
            cursor,
            numItems: REPOSITORY_INVENTORY_LABEL_CHUNK_PAGE_SIZE,
          },
        });
        signal.throwIfAborted();
        if (result.state === "unavailable") {
          throw new Error("Repository inventory labels are no longer available.");
        }
        return result;
      },
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    });
    args.signal.throwIfAborted();
    if (
      (expectedChunkCount !== null && expectedChunkCount !== page.expectedChunkCount) ||
      page.expectedLabelCount !== args.item.labelCount
    ) {
      throw new Error("Repository inventory label totals changed while loading.");
    }
    expectedChunkCount = page.expectedChunkCount;
    for (const chunk of page.page) {
      if (chunk.chunkIndex !== chunks.length) {
        throw new Error("Repository inventory label chunks are incomplete.");
      }
      chunks.push(chunk);
    }
    isDone = page.isDone;
    if (!isDone) {
      cursor = nextRepositoryInventoryCursor({
        kind: "labels",
        currentCursor: cursor,
        nextCursor: page.continueCursor,
        seenCursors,
      });
    }
  } while (!isDone);

  const labels = chunks.flatMap((chunk) => chunk.labels);
  if (chunks.length !== expectedChunkCount || labels.length !== args.item.labelCount) {
    throw new Error("Repository inventory labels ended before every label was loaded.");
  }
  const { labelCount: _labelCount, ...pullRequest } = args.item;
  return { ...pullRequest, labels };
}

async function loadLabelFacets(args: {
  queryLabelFacetPage: RepositoryInventoryLabelFacetPageQuery;
  queryClient: QueryClient;
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  signal: AbortSignal;
}): Promise<{
  labelFacets: RepositoryInventoryLabelFacet[];
  noLabelPullRequestCount: number;
}> {
  const labelFacets: RepositoryInventoryLabelFacet[] = [];
  const labelKeys = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let expectedFacetCount = -1;
  let noLabelPullRequestCount = -1;
  let isDone = false;

  do {
    args.signal.throwIfAborted();
    const page: RepositoryInventoryLabelFacetPage = await args.queryClient.fetchQuery({
      queryKey: labelFacetPageQueryKey({
        vaultId: args.vaultId,
        snapshotId: args.snapshotId,
        cursor,
      }),
      queryFn: async ({ signal }) => {
        signal.throwIfAborted();
        const result = await args.queryLabelFacetPage({
          vaultId: args.vaultId,
          snapshotId: args.snapshotId,
          paginationOpts: {
            cursor,
            numItems: REPOSITORY_INVENTORY_LABEL_FACET_PAGE_SIZE,
          },
        });
        signal.throwIfAborted();
        if (result.state === "unavailable") {
          throw new Error("Repository inventory label facets are no longer available.");
        }
        return result;
      },
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    });
    args.signal.throwIfAborted();
    if (
      (expectedFacetCount >= 0 && expectedFacetCount !== page.expectedFacetCount) ||
      (noLabelPullRequestCount >= 0 && noLabelPullRequestCount !== page.noLabelPullRequestCount)
    ) {
      throw new Error("Repository inventory label facet totals changed while loading.");
    }
    expectedFacetCount = page.expectedFacetCount;
    noLabelPullRequestCount = page.noLabelPullRequestCount;
    for (const facet of page.page) {
      const labelKey = facet.name.trim().toLowerCase();
      if (labelKey.length === 0 || labelKeys.has(labelKey)) {
        throw new Error("Repository inventory label facets contain a duplicate label.");
      }
      labelKeys.add(labelKey);
      labelFacets.push(facet);
    }
    isDone = page.isDone;
    if (!isDone) {
      cursor = nextRepositoryInventoryCursor({
        kind: "label facets",
        currentCursor: cursor,
        nextCursor: page.continueCursor,
        seenCursors,
      });
    }
  } while (!isDone);

  if (labelFacets.length !== expectedFacetCount || noLabelPullRequestCount < 0) {
    throw new Error("Repository inventory label facets ended before every facet was loaded.");
  }
  return { labelFacets, noLabelPullRequestCount };
}

async function loadBranchPrefix(args: {
  firstPage: RepositoryInventoryBranchPage;
  queryBranchPage: RepositoryInventoryBranchPageQuery;
  queryClient: QueryClient;
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  requestedBranchCount: number;
  signal: AbortSignal;
  prior?: RepositoryInventoryPageProgress<RepositoryInventoryBranchItem>;
}): Promise<RepositoryInventoryPageProgress<RepositoryInventoryBranchItem>> {
  const branches = [...(args.prior?.items ?? [])];
  const rowKeys = new Set(branches.map((branch) => branch.rowKey));
  if (rowKeys.size !== branches.length) {
    throw new Error("Repository inventory snapshot contains a duplicate branch.");
  }
  let page: RepositoryInventoryBranchPage | null = args.prior === undefined ? args.firstPage : null;
  let isDone = args.prior?.isDone ?? false;
  let continueCursor = args.prior?.continueCursor ?? null;
  const seenCursors = new Set(args.prior?.seenCursors ?? []);

  for (;;) {
    if (page !== null) {
      if (
        page.snapshotId !== args.snapshotId ||
        page.expectedBranchCount !== args.firstPage.expectedBranchCount
      ) {
        throw new Error("Repository inventory branch totals changed while loading.");
      }
      for (const branch of page.page) {
        if (rowKeys.has(branch.rowKey)) {
          throw new Error("Repository inventory snapshot contains a duplicate branch.");
        }
        rowKeys.add(branch.rowKey);
        branches.push(branch);
      }
      isDone = page.isDone;
      continueCursor = isDone
        ? null
        : nextRepositoryInventoryCursor({
            kind: "branches",
            currentCursor: continueCursor,
            nextCursor: page.continueCursor,
            seenCursors,
          });
    }
    if (
      branches.length > args.firstPage.expectedBranchCount ||
      (isDone && branches.length !== args.firstPage.expectedBranchCount)
    ) {
      throw new Error("Repository inventory branches ended with an invalid total.");
    }
    if (isDone || branches.length >= args.requestedBranchCount) {
      return { items: branches, isDone, continueCursor, seenCursors: [...seenCursors] };
    }
    if (continueCursor === null) {
      throw new Error("Repository inventory branches ended before every branch was loaded.");
    }
    args.signal.throwIfAborted();
    page = await queryBranchPage({
      query: args.queryBranchPage,
      queryClient: args.queryClient,
      vaultId: args.vaultId,
      snapshotId: args.snapshotId,
      cursor: continueCursor,
      signal: args.signal,
    });
  }
}

async function loadPullRequestPrefix(args: {
  firstPage: RepositoryInventoryPullRequestPage;
  queryPullRequestPage: RepositoryInventoryPullRequestPageQuery;
  queryClient: QueryClient;
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  viewId: Id<"vaultRepositoryInventoryFilterViews">;
  requestedPullRequestCount: number;
  signal: AbortSignal;
  prior?: RepositoryInventoryPageProgress<RepositoryInventoryPullRequestItem>;
}): Promise<RepositoryInventoryPageProgress<RepositoryInventoryPullRequestItem>> {
  const pullRequests = [...(args.prior?.items ?? [])];
  const rowKeys = new Set(pullRequests.map((pullRequest) => pullRequest.rowKey));
  if (rowKeys.size !== pullRequests.length) {
    throw new Error("Repository inventory filter view contains a duplicate pull request.");
  }
  let page: RepositoryInventoryPullRequestPage | null =
    args.prior === undefined ? args.firstPage : null;
  let isDone = args.prior?.isDone ?? false;
  let continueCursor = args.prior?.continueCursor ?? null;
  const seenCursors = new Set(args.prior?.seenCursors ?? []);

  for (;;) {
    if (page !== null) {
      if (
        page.snapshotId !== args.snapshotId ||
        page.viewId !== args.viewId ||
        page.expectedVisiblePullRequestCount !== args.firstPage.expectedVisiblePullRequestCount ||
        page.totalPullRequestCount !== args.firstPage.totalPullRequestCount
      ) {
        throw new Error("Repository inventory pull request totals changed while loading.");
      }
      for (const pullRequest of page.page) {
        if (rowKeys.has(pullRequest.rowKey)) {
          throw new Error("Repository inventory filter view contains a duplicate pull request.");
        }
        rowKeys.add(pullRequest.rowKey);
        pullRequests.push(pullRequest);
      }
      isDone = page.isDone;
      continueCursor = isDone
        ? null
        : nextRepositoryInventoryCursor({
            kind: "pull requests",
            currentCursor: continueCursor,
            nextCursor: page.continueCursor,
            seenCursors,
          });
    }
    if (
      pullRequests.length > args.firstPage.expectedVisiblePullRequestCount ||
      (isDone && pullRequests.length !== args.firstPage.expectedVisiblePullRequestCount)
    ) {
      throw new Error("Repository inventory pull requests ended with an invalid total.");
    }
    if (isDone || pullRequests.length >= args.requestedPullRequestCount) {
      return { items: pullRequests, isDone, continueCursor, seenCursors: [...seenCursors] };
    }
    if (continueCursor === null) {
      throw new Error("Repository inventory pull requests ended before every pull request loaded.");
    }
    args.signal.throwIfAborted();
    page = await queryPullRequestPage({
      query: args.queryPullRequestPage,
      queryClient: args.queryClient,
      vaultId: args.vaultId,
      snapshotId: args.snapshotId,
      viewId: args.viewId,
      cursor: continueCursor,
      signal: args.signal,
    });
  }
}

export async function loadRepositoryInventorySnapshot(args: {
  queryBranchPage: RepositoryInventoryBranchPageQuery;
  queryPullRequestPage: RepositoryInventoryPullRequestPageQuery;
  queryLabelPage: RepositoryInventoryLabelPageQuery;
  queryLabelFacetPage: RepositoryInventoryLabelFacetPageQuery;
  queryClient: QueryClient;
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  viewId: Id<"vaultRepositoryInventoryFilterViews">;
  expectedDefaultBranch: string | null;
  requestedItemCount: number;
  signal: AbortSignal;
  prior?: Pick<
    LoadedRepositoryInventorySnapshot,
    "snapshotId" | "viewId" | "items" | "filterSummary" | "branchProgress" | "pullRequestProgress"
  >;
}): Promise<RepositoryInventorySnapshotLoad> {
  if (!Number.isInteger(args.requestedItemCount) || args.requestedItemCount < 1) {
    throw new Error("Repository inventory requested depth must be a positive integer.");
  }
  const prior = args.prior?.snapshotId === args.snapshotId ? args.prior : undefined;
  const [firstBranchPage, firstPullRequestPage, facets] = await Promise.all([
    queryBranchPage({
      query: args.queryBranchPage,
      queryClient: args.queryClient,
      vaultId: args.vaultId,
      snapshotId: args.snapshotId,
      cursor: null,
      signal: args.signal,
    }),
    queryPullRequestPage({
      query: args.queryPullRequestPage,
      queryClient: args.queryClient,
      vaultId: args.vaultId,
      snapshotId: args.snapshotId,
      viewId: args.viewId,
      cursor: null,
      signal: args.signal,
    }),
    prior === undefined
      ? loadLabelFacets({
          queryLabelFacetPage: args.queryLabelFacetPage,
          queryClient: args.queryClient,
          vaultId: args.vaultId,
          snapshotId: args.snapshotId,
          signal: args.signal,
        })
      : Promise.resolve({
          labelFacets: prior.filterSummary.labelFacets,
          noLabelPullRequestCount: prior.filterSummary.noLabelPullRequestCount,
        }),
  ]);
  args.signal.throwIfAborted();

  const firstBranch = firstBranchPage.page.at(0);
  const defaultBranch = firstBranch?.isDefault === true ? firstBranch : null;
  if (
    (args.expectedDefaultBranch === null && defaultBranch !== null) ||
    (args.expectedDefaultBranch !== null && defaultBranch?.name !== args.expectedDefaultBranch)
  ) {
    throw new Error("Repository inventory default branch does not match its publication.");
  }
  const defaultBranchCount = defaultBranch === null ? 0 : 1;
  const expectedItemCount =
    firstBranchPage.expectedBranchCount + firstPullRequestPage.expectedVisiblePullRequestCount;
  const requestedItemCount = Math.min(args.requestedItemCount, expectedItemCount);
  const requestedPullRequestCount = Math.min(
    firstPullRequestPage.expectedVisiblePullRequestCount,
    Math.max(0, requestedItemCount - defaultBranchCount),
  );
  const requestedRemainingBranchCount = Math.max(
    0,
    requestedItemCount - defaultBranchCount - requestedPullRequestCount,
  );
  const requestedBranchCount = defaultBranchCount + requestedRemainingBranchCount;
  const [branchProgress, pullRequestProgress] = await Promise.all([
    loadBranchPrefix({
      firstPage: firstBranchPage,
      queryBranchPage: args.queryBranchPage,
      queryClient: args.queryClient,
      vaultId: args.vaultId,
      snapshotId: args.snapshotId,
      requestedBranchCount,
      signal: args.signal,
      prior: prior?.branchProgress,
    }),
    loadPullRequestPrefix({
      firstPage: firstPullRequestPage,
      queryPullRequestPage: args.queryPullRequestPage,
      queryClient: args.queryClient,
      vaultId: args.vaultId,
      snapshotId: args.snapshotId,
      viewId: args.viewId,
      requestedPullRequestCount,
      signal: args.signal,
      prior: prior?.viewId === args.viewId ? prior.pullRequestProgress : undefined,
    }),
  ]);
  args.signal.throwIfAborted();

  const pullRequests = pullRequestProgress.items.slice(0, requestedPullRequestCount);
  const loadedPullRequestsByRowKey = new Map<string, LoadedRepositoryInventoryPullRequest>();
  for (const item of prior?.items ?? []) {
    if (item.kind === "pull_request") {
      loadedPullRequestsByRowKey.set(item.rowKey, item);
    }
  }
  const pullRequestsMissingLabels = pullRequests.filter(
    (item) => !loadedPullRequestsByRowKey.has(item.rowKey),
  );
  for (
    let startIndex = 0;
    startIndex < pullRequestsMissingLabels.length;
    startIndex += REPOSITORY_INVENTORY_LABEL_LOAD_CONCURRENCY
  ) {
    const loadedBatch = await Promise.all(
      pullRequestsMissingLabels
        .slice(startIndex, startIndex + REPOSITORY_INVENTORY_LABEL_LOAD_CONCURRENCY)
        .map(
          async (item) =>
            await loadPullRequestLabels({
              queryLabelPage: args.queryLabelPage,
              queryClient: args.queryClient,
              vaultId: args.vaultId,
              snapshotId: args.snapshotId,
              item,
              signal: args.signal,
            }),
        ),
    );
    for (const item of loadedBatch) {
      if (item.kind === "pull_request") {
        loadedPullRequestsByRowKey.set(item.rowKey, item);
      }
    }
  }
  const loadedPullRequests = pullRequests.map((item) => {
    const loaded = loadedPullRequestsByRowKey.get(item.rowKey);
    if (loaded === undefined || loaded.labels.length !== item.labelCount) {
      throw new Error("Repository inventory pull request labels are incomplete.");
    }
    return loaded;
  });
  args.signal.throwIfAborted();
  const remainingBranches = branchProgress.items.slice(
    defaultBranchCount,
    defaultBranchCount + requestedRemainingBranchCount,
  );
  const items: LoadedRepositoryInventoryItem[] = [
    ...(defaultBranch === null ? [] : [defaultBranch]),
    ...loadedPullRequests,
    ...remainingBranches,
  ];
  const rowKeys = new Set(items.map((item) => item.rowKey));
  if (rowKeys.size !== items.length || items.length !== requestedItemCount) {
    throw new Error("Repository inventory composed an invalid visible item slice.");
  }

  return {
    snapshotId: args.snapshotId,
    viewId: args.viewId,
    items,
    filterSummary: {
      ...facets,
      totalPullRequestCount: firstPullRequestPage.totalPullRequestCount,
      visiblePullRequestCount: firstPullRequestPage.expectedVisiblePullRequestCount,
    },
    branchProgress,
    pullRequestProgress,
    expectedItemCount,
    isDone: items.length === expectedItemCount,
  };
}

export function useRepositoryInventorySnapshot(args: {
  vaultId: Id<"vaults"> | null;
  snapshotId: Id<"vaultRepositoryInventorySnapshots"> | undefined;
  viewId: Id<"vaultRepositoryInventoryFilterViews"> | undefined;
  inventoryState: RepositoryInventoryState | undefined;
}): {
  inventoryState: RepositoryInventoryState | undefined;
  items: LoadedRepositoryInventoryItem[];
  filterSummary: LoadedRepositoryInventoryFilterSummary | null;
  status: PaginationStatus;
  loadMore: (numItems: number) => void;
} {
  const convex = useConvex();
  const queryClient = useQueryClient();
  const argsRef = useRef(args);
  argsRef.current = args;
  const [committed, setCommitted] = useState<LoadedRepositoryInventorySnapshot | null>(null);
  const [requestedDepthByVaultId, setRequestedDepthByVaultId] = useState<
    ReadonlyMap<Id<"vaults">, number>
  >(() => new Map());
  const [activeLoad, setActiveLoad] = useState<RepositoryInventorySnapshotKey | null>(null);
  const [retry, setRetry] = useState(0);
  const requestedItemCount =
    args.vaultId === null
      ? REPOSITORY_INVENTORY_INITIAL_ITEM_COUNT
      : (requestedDepthByVaultId.get(args.vaultId) ?? REPOSITORY_INVENTORY_INITIAL_ITEM_COUNT);

  useEffect(() => {
    if (
      args.vaultId === null ||
      args.snapshotId === undefined ||
      args.viewId === undefined ||
      args.inventoryState === undefined ||
      args.inventoryState.state === "empty" ||
      args.inventoryState.activeSnapshotId !== args.snapshotId ||
      args.inventoryState.activeFilterViewId !== args.viewId
    ) {
      setActiveLoad(null);
      return;
    }
    const vaultId = args.vaultId;
    const snapshotId = args.snapshotId;
    const viewId = args.viewId;
    if (
      committed?.vaultId === vaultId &&
      committed.snapshotId === snapshotId &&
      committed.viewId === viewId &&
      (committed.isDone || committed.items.length >= requestedItemCount)
    ) {
      setActiveLoad(null);
      return;
    }

    const requestedLoadItemCount = Math.max(
      requestedItemCount,
      committed?.vaultId === vaultId ? committed.items.length : 0,
    );
    const controller = new AbortController();
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
    setActiveLoad({ vaultId, snapshotId, viewId });
    void loadRepositoryInventorySnapshot({
      queryBranchPage: (queryArgs) =>
        convex.query(api.repositoryInventory.listRepositoryInventoryBranchPage, queryArgs),
      queryPullRequestPage: (queryArgs) =>
        convex.query(api.repositoryInventory.listRepositoryInventoryPullRequestPage, queryArgs),
      queryLabelPage: (queryArgs) =>
        convex.query(api.repositoryInventory.listRepositoryInventoryLabelPage, queryArgs),
      queryLabelFacetPage: (queryArgs) =>
        convex.query(api.repositoryInventory.listRepositoryInventoryLabelFacetPage, queryArgs),
      queryClient,
      vaultId,
      snapshotId,
      viewId,
      expectedDefaultBranch: args.inventoryState.defaultBranch ?? null,
      requestedItemCount: requestedLoadItemCount,
      signal: controller.signal,
      prior:
        committed?.vaultId === vaultId && committed.snapshotId === snapshotId
          ? committed
          : undefined,
    })
      .then((snapshot) => {
        const currentArgs = argsRef.current;
        const inventoryState = currentArgs.inventoryState;
        if (
          controller.signal.aborted ||
          currentArgs.vaultId !== vaultId ||
          currentArgs.snapshotId !== snapshot.snapshotId ||
          currentArgs.viewId !== snapshot.viewId ||
          inventoryState === undefined ||
          inventoryState.state === "empty" ||
          inventoryState.activeSnapshotId !== snapshot.snapshotId ||
          inventoryState.activeFilterViewId !== snapshot.viewId
        ) {
          return;
        }
        setCommitted({
          ...snapshot,
          vaultId,
          inventoryState,
        });
        setActiveLoad((current) =>
          current?.vaultId === vaultId &&
          current.snapshotId === snapshotId &&
          current.viewId === viewId
            ? null
            : current,
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        console.error("Failed to load the repository inventory snapshot view:", error);
        queryClient.removeQueries({
          queryKey: ["repository-inventory-branch-page", vaultId, snapshotId],
        });
        queryClient.removeQueries({
          queryKey: ["repository-inventory-pull-request-page", vaultId, snapshotId, viewId],
        });
        queryClient.removeQueries({
          queryKey: ["repository-inventory-label-page", vaultId, snapshotId],
        });
        queryClient.removeQueries({
          queryKey: ["repository-inventory-label-facet-page", vaultId, snapshotId],
        });
        setActiveLoad((current) =>
          current?.vaultId === vaultId &&
          current.snapshotId === snapshotId &&
          current.viewId === viewId
            ? null
            : current,
        );
        retryTimeoutId = setTimeout(() => {
          if (!controller.signal.aborted) {
            setRetry((value) => value + 1);
          }
        }, REPOSITORY_INVENTORY_RETRY_MS);
      });
    return () => {
      controller.abort();
      if (retryTimeoutId !== null) {
        clearTimeout(retryTimeoutId);
      }
    };
  }, [
    args.inventoryState,
    args.snapshotId,
    args.vaultId,
    args.viewId,
    committed,
    convex,
    queryClient,
    requestedItemCount,
    retry,
  ]);

  const loadMore = useCallback(
    (numItems: number) => {
      if (args.vaultId === null || args.snapshotId === undefined || args.viewId === undefined) {
        return;
      }
      const vaultId = args.vaultId;
      setRequestedDepthByVaultId((current) => {
        const next = new Map(current);
        next.set(
          vaultId,
          (current.get(vaultId) ?? REPOSITORY_INVENTORY_INITIAL_ITEM_COUNT) + numItems,
        );
        return next;
      });
    },
    [args.snapshotId, args.vaultId, args.viewId],
  );
  const hasActivePublication =
    args.snapshotId !== undefined &&
    args.viewId !== undefined &&
    args.inventoryState !== undefined &&
    args.inventoryState.state !== "empty" &&
    args.inventoryState.activeSnapshotId === args.snapshotId &&
    args.inventoryState.activeFilterViewId === args.viewId;
  const committedForVault =
    hasActivePublication && committed?.vaultId === args.vaultId ? committed : null;
  const committedMatchesActivePublication =
    committedForVault !== null &&
    committedForVault.snapshotId === args.snapshotId &&
    committedForVault.viewId === args.viewId;
  const currentInventoryState = committedMatchesActivePublication
    ? args.inventoryState
    : committedForVault?.inventoryState;
  const status: PaginationStatus = (() => {
    if (!hasActivePublication) {
      return "Exhausted";
    }
    if (committedForVault === null) {
      return "LoadingFirstPage";
    }
    if (
      committedMatchesActivePublication &&
      activeLoad?.vaultId === args.vaultId &&
      activeLoad.snapshotId === args.snapshotId &&
      activeLoad.viewId === args.viewId
    ) {
      return "LoadingMore";
    }
    return committedForVault.isDone ? "Exhausted" : "CanLoadMore";
  })();

  return {
    inventoryState: currentInventoryState ?? args.inventoryState,
    items: committedForVault?.items ?? [],
    filterSummary: committedForVault?.filterSummary ?? null,
    status,
    loadMore,
  };
}
