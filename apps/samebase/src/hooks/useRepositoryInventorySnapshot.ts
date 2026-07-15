import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useConvex, type PaginationStatus } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const REPOSITORY_INVENTORY_INITIAL_ITEM_COUNT = 10;
const REPOSITORY_INVENTORY_ITEM_PAGE_SIZE = 10;
const REPOSITORY_INVENTORY_LABEL_CHUNK_PAGE_SIZE = 5;
const REPOSITORY_INVENTORY_RETRY_MS = 5_000;

type RepositoryInventoryState =
  (typeof api.repositoryInventory.getRepositoryInventoryState)["_returnType"];
type RepositoryInventoryPageResult =
  (typeof api.repositoryInventory.listRepositoryInventoryPage)["_returnType"];
type RepositoryInventoryPageArgs =
  (typeof api.repositoryInventory.listRepositoryInventoryPage)["_args"];
type RepositoryInventoryPage = Extract<RepositoryInventoryPageResult, { state: "ready" }>;
type RepositoryInventoryPageItem = RepositoryInventoryPage["page"][number];
type RepositoryInventoryBranchItem = Extract<RepositoryInventoryPageItem, { kind: "branch" }>;
type RepositoryInventoryPullRequestItem = Extract<
  RepositoryInventoryPageItem,
  { kind: "pull_request" }
>;
type RepositoryInventoryLabelPageResult =
  (typeof api.repositoryInventory.listRepositoryInventoryLabelPage)["_returnType"];
type RepositoryInventoryLabelPageArgs =
  (typeof api.repositoryInventory.listRepositoryInventoryLabelPage)["_args"];
type RepositoryInventoryLabelPage = Extract<RepositoryInventoryLabelPageResult, { state: "ready" }>;
type RepositoryInventoryLabel = RepositoryInventoryLabelPage["page"][number]["labels"][number];
type RepositoryInventoryPageQuery = (
  args: RepositoryInventoryPageArgs,
) => Promise<RepositoryInventoryPageResult>;
type RepositoryInventoryLabelPageQuery = (
  args: RepositoryInventoryLabelPageArgs,
) => Promise<RepositoryInventoryLabelPageResult>;

export type LoadedRepositoryInventoryItem =
  | RepositoryInventoryBranchItem
  | (Omit<RepositoryInventoryPullRequestItem, "labelCount"> & {
      labels: RepositoryInventoryLabel[];
    });

type LoadedRepositoryInventorySnapshot = {
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  inventoryState: Exclude<RepositoryInventoryState, { state: "empty" }>;
  items: LoadedRepositoryInventoryItem[];
  expectedItemCount: number;
  isDone: boolean;
};

type RepositoryInventorySnapshotKey = {
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
};

type RepositoryInventoryRequestedDepth = RepositoryInventorySnapshotKey & {
  itemCount: number;
};

type RepositoryInventorySnapshotLoad = Omit<
  LoadedRepositoryInventorySnapshot,
  "inventoryState" | "vaultId"
>;

function itemPageQueryKey(args: {
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  cursor: string | null;
}) {
  return ["repository-inventory-item-page", args.vaultId, args.snapshotId, args.cursor] as const;
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

async function loadPullRequestLabels(args: {
  queryLabelPage: RepositoryInventoryLabelPageQuery;
  queryClient: QueryClient;
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  item: RepositoryInventoryPullRequestItem;
  signal: AbortSignal;
}): Promise<LoadedRepositoryInventoryItem> {
  const chunks: RepositoryInventoryLabelPage["page"] = [];
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
      cursor = page.continueCursor;
    }
  } while (!isDone);

  const labels = chunks.flatMap((chunk) => chunk.labels);
  if (chunks.length !== expectedChunkCount || labels.length !== args.item.labelCount) {
    throw new Error("Repository inventory labels ended before every label was loaded.");
  }
  const { labelCount: _labelCount, ...pullRequest } = args.item;
  return { ...pullRequest, labels };
}

export async function loadRepositoryInventorySnapshot(args: {
  queryItemPage: RepositoryInventoryPageQuery;
  queryLabelPage: RepositoryInventoryLabelPageQuery;
  queryClient: QueryClient;
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  requestedItemCount: number;
  signal: AbortSignal;
}): Promise<RepositoryInventorySnapshotLoad> {
  if (!Number.isInteger(args.requestedItemCount) || args.requestedItemCount < 1) {
    throw new Error("Repository inventory requested depth must be a positive integer.");
  }
  const items: LoadedRepositoryInventoryItem[] = [];
  const rowKeys = new Set<string>();
  let cursor: string | null = null;
  let expectedItemCount: number | null = null;
  let isDone = false;

  do {
    args.signal.throwIfAborted();
    const page: RepositoryInventoryPage = await args.queryClient.fetchQuery({
      queryKey: itemPageQueryKey({
        vaultId: args.vaultId,
        snapshotId: args.snapshotId,
        cursor,
      }),
      queryFn: async ({ signal }) => {
        signal.throwIfAborted();
        const result = await args.queryItemPage({
          vaultId: args.vaultId,
          snapshotId: args.snapshotId,
          paginationOpts: {
            cursor,
            numItems: REPOSITORY_INVENTORY_ITEM_PAGE_SIZE,
          },
        });
        signal.throwIfAborted();
        if (result.state === "unavailable") {
          throw new Error("Repository inventory snapshot is no longer available.");
        }
        return result;
      },
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    });
    args.signal.throwIfAborted();
    if (expectedItemCount !== null && expectedItemCount !== page.expectedItemCount) {
      throw new Error("Repository inventory item total changed while loading.");
    }
    expectedItemCount = page.expectedItemCount;
    const loadedPage = await Promise.all(
      page.page.map(async (item: RepositoryInventoryPageItem) => {
        if (item.kind === "branch") {
          return item;
        }
        return await loadPullRequestLabels({
          queryLabelPage: args.queryLabelPage,
          queryClient: args.queryClient,
          vaultId: args.vaultId,
          snapshotId: args.snapshotId,
          item,
          signal: args.signal,
        });
      }),
    );
    args.signal.throwIfAborted();
    for (const item of loadedPage) {
      if (rowKeys.has(item.rowKey)) {
        throw new Error("Repository inventory snapshot contains a duplicate row.");
      }
      rowKeys.add(item.rowKey);
      items.push(item);
    }
    isDone = page.isDone;
    if (isDone) {
      cursor = null;
      break;
    }
    cursor = page.continueCursor;
  } while (items.length < args.requestedItemCount);

  if (items.length > expectedItemCount || (isDone && items.length !== expectedItemCount)) {
    throw new Error("Repository inventory snapshot ended with an invalid item total.");
  }
  if (!isDone && items.length < args.requestedItemCount) {
    throw new Error("Repository inventory snapshot ended before the requested depth.");
  }
  return {
    snapshotId: args.snapshotId,
    items,
    expectedItemCount,
    isDone,
  };
}

export function useRepositoryInventorySnapshot(args: {
  vaultId: Id<"vaults"> | null;
  snapshotId: Id<"vaultRepositoryInventorySnapshots"> | undefined;
  inventoryState: RepositoryInventoryState | undefined;
}): {
  inventoryState: RepositoryInventoryState | undefined;
  items: LoadedRepositoryInventoryItem[];
  status: PaginationStatus;
  loadMore: (numItems: number) => void;
} {
  const convex = useConvex();
  const queryClient = useQueryClient();
  const argsRef = useRef(args);
  argsRef.current = args;
  const [committed, setCommitted] = useState<LoadedRepositoryInventorySnapshot | null>(null);
  const [requestedDepth, setRequestedDepth] = useState<RepositoryInventoryRequestedDepth | null>(
    null,
  );
  const [activeLoad, setActiveLoad] = useState<RepositoryInventorySnapshotKey | null>(null);
  const [retry, setRetry] = useState(0);
  const requestedItemCount =
    requestedDepth?.vaultId === args.vaultId && requestedDepth.snapshotId === args.snapshotId
      ? requestedDepth.itemCount
      : REPOSITORY_INVENTORY_INITIAL_ITEM_COUNT;

  useEffect(() => {
    if (
      args.vaultId === null ||
      args.snapshotId === undefined ||
      args.inventoryState === undefined ||
      args.inventoryState.state === "empty"
    ) {
      setActiveLoad(null);
      return;
    }
    const vaultId = args.vaultId;
    const snapshotId = args.snapshotId;
    if (
      committed?.vaultId === vaultId &&
      committed.snapshotId === snapshotId &&
      (committed.isDone || committed.items.length >= requestedItemCount)
    ) {
      setActiveLoad(null);
      return;
    }

    const requestedDepth = Math.max(
      requestedItemCount,
      committed?.vaultId === vaultId && committed.snapshotId === snapshotId
        ? committed.items.length
        : 0,
    );
    const controller = new AbortController();
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
    setActiveLoad({ vaultId, snapshotId });
    void loadRepositoryInventorySnapshot({
      queryItemPage: (queryArgs) =>
        convex.query(api.repositoryInventory.listRepositoryInventoryPage, queryArgs),
      queryLabelPage: (queryArgs) =>
        convex.query(api.repositoryInventory.listRepositoryInventoryLabelPage, queryArgs),
      queryClient,
      vaultId,
      snapshotId,
      requestedItemCount: requestedDepth,
      signal: controller.signal,
    })
      .then((snapshot) => {
        const currentArgs = argsRef.current;
        const inventoryState = currentArgs.inventoryState;
        if (
          controller.signal.aborted ||
          currentArgs.vaultId !== vaultId ||
          currentArgs.snapshotId !== snapshot.snapshotId ||
          inventoryState === undefined ||
          inventoryState.state === "empty" ||
          inventoryState.activeSnapshotId !== snapshot.snapshotId
        ) {
          return;
        }
        setCommitted({
          ...snapshot,
          vaultId,
          inventoryState,
        });
        setActiveLoad((current) =>
          current?.vaultId === vaultId && current.snapshotId === snapshotId ? null : current,
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        console.error("Failed to load the complete repository inventory snapshot:", error);
        queryClient.removeQueries({
          queryKey: ["repository-inventory-item-page", vaultId, snapshotId],
        });
        queryClient.removeQueries({
          queryKey: ["repository-inventory-label-page", vaultId, snapshotId],
        });
        setActiveLoad((current) =>
          current?.vaultId === vaultId && current.snapshotId === snapshotId ? null : current,
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
    committed,
    convex,
    queryClient,
    requestedItemCount,
    retry,
  ]);

  const loadMore = useCallback(
    (numItems: number) => {
      if (args.vaultId === null || args.snapshotId === undefined) {
        return;
      }
      const vaultId = args.vaultId;
      const snapshotId = args.snapshotId;
      setRequestedDepth((current) => ({
        vaultId,
        snapshotId,
        itemCount:
          (current?.vaultId === vaultId && current.snapshotId === snapshotId
            ? current.itemCount
            : REPOSITORY_INVENTORY_INITIAL_ITEM_COUNT) + numItems,
      }));
    },
    [args.snapshotId, args.vaultId],
  );
  const hasActivePublication =
    args.snapshotId !== undefined &&
    args.inventoryState !== undefined &&
    args.inventoryState.state !== "empty" &&
    args.inventoryState.activeSnapshotId === args.snapshotId;
  const committedForVault =
    hasActivePublication && committed?.vaultId === args.vaultId ? committed : null;
  const currentInventoryState =
    committedForVault !== null && args.snapshotId === committedForVault.snapshotId
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
      activeLoad?.vaultId === args.vaultId &&
      activeLoad.snapshotId === committedForVault.snapshotId
    ) {
      return "LoadingMore";
    }
    return committedForVault.isDone ? "Exhausted" : "CanLoadMore";
  })();

  return {
    inventoryState: currentInventoryState ?? args.inventoryState,
    items: committedForVault?.items ?? [],
    status,
    loadMore,
  };
}
