import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useConvex, useQuery } from "convex/react";
import { compareValues } from "convex/values";
import { useEffect, useRef, useState } from "react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { RepositoryInventoryFilters } from "@/components/vault-dashboard/repositoryInventoryFilters";
import { repositoryInventoryFilterLabelKey } from "../../shared/repositoryInventoryFilters";

const REPOSITORY_INVENTORY_EXCLUDED_LABEL_PAGE_SIZE = 25;
const REPOSITORY_INVENTORY_FILTER_RETRY_MS = 5_000;

type RepositoryInventoryFilterRoot =
  (typeof api.repositoryInventory.getRepositoryInventoryFilter)["_returnType"];
type RepositoryInventoryExcludedLabelPageResult =
  (typeof api.repositoryInventory.listRepositoryInventoryExcludedLabelPage)["_returnType"];
type RepositoryInventoryExcludedLabelPageArgs =
  (typeof api.repositoryInventory.listRepositoryInventoryExcludedLabelPage)["_args"];
type RepositoryInventoryExcludedLabelPageQuery = (
  args: RepositoryInventoryExcludedLabelPageArgs,
) => Promise<RepositoryInventoryExcludedLabelPageResult>;

export type LoadedRepositoryInventoryFilter = RepositoryInventoryFilters & {
  revision: number;
};

type LoadedRepositoryInventoryFilterForVault = {
  vaultId: Id<"vaults">;
  excludedLabelCount: number;
  filter: LoadedRepositoryInventoryFilter;
};

function excludedLabelPageQueryKey(args: {
  vaultId: Id<"vaults">;
  revision: number;
  cursor: string | null;
}) {
  return [
    "repository-inventory-excluded-label-page",
    args.vaultId,
    args.revision,
    args.cursor,
  ] as const;
}

async function queryExcludedLabelPage(args: {
  query: RepositoryInventoryExcludedLabelPageQuery;
  queryClient: QueryClient;
  vaultId: Id<"vaults">;
  revision: number;
  cursor: string | null;
  signal: AbortSignal;
}): Promise<RepositoryInventoryExcludedLabelPageResult> {
  return await args.queryClient.fetchQuery({
    queryKey: excludedLabelPageQueryKey(args),
    queryFn: async ({ signal }) => {
      signal.throwIfAborted();
      const page = await args.query({
        vaultId: args.vaultId,
        filterRevision: args.revision,
        paginationOpts: {
          cursor: args.cursor,
          maximumRowsRead: REPOSITORY_INVENTORY_EXCLUDED_LABEL_PAGE_SIZE,
          numItems: REPOSITORY_INVENTORY_EXCLUDED_LABEL_PAGE_SIZE,
        },
      });
      signal.throwIfAborted();
      return page;
    },
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export async function loadRepositoryInventoryFilter(args: {
  query: RepositoryInventoryExcludedLabelPageQuery;
  queryClient: QueryClient;
  vaultId: Id<"vaults">;
  root: RepositoryInventoryFilterRoot;
  signal: AbortSignal;
}): Promise<LoadedRepositoryInventoryFilterForVault | null> {
  if (
    !Number.isInteger(args.root.revision) ||
    args.root.revision < 0 ||
    !Number.isInteger(args.root.excludedLabelCount) ||
    args.root.excludedLabelCount < 0
  ) {
    throw new Error("Repository inventory filter has invalid persisted totals.");
  }

  const hiddenLabels: string[] = [];
  const labelKeys = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let priorLabelKey: string | null = null;

  for (;;) {
    args.signal.throwIfAborted();
    const page = await queryExcludedLabelPage({
      query: args.query,
      queryClient: args.queryClient,
      vaultId: args.vaultId,
      revision: args.root.revision,
      cursor,
      signal: args.signal,
    });
    args.signal.throwIfAborted();
    if (page === null) {
      return null;
    }
    if (
      page.filterRevision !== args.root.revision ||
      page.expectedExcludedLabelCount !== args.root.excludedLabelCount
    ) {
      throw new Error("Repository inventory filter changed while loading excluded labels.");
    }
    if (page.page.length > REPOSITORY_INVENTORY_EXCLUDED_LABEL_PAGE_SIZE) {
      throw new Error("Repository inventory excluded-label page exceeded its read bound.");
    }
    for (const label of page.page) {
      const name = label.name.trim();
      const labelKey = repositoryInventoryFilterLabelKey(name);
      if (
        name.length === 0 ||
        name !== label.name ||
        labelKey !== label.labelKey ||
        labelKeys.has(labelKey)
      ) {
        throw new Error("Repository inventory excluded labels contain an invalid identity.");
      }
      if (priorLabelKey !== null && compareValues(priorLabelKey, labelKey) >= 0) {
        throw new Error("Repository inventory excluded labels have an invalid order.");
      }
      priorLabelKey = labelKey;
      labelKeys.add(labelKey);
      hiddenLabels.push(name);
    }
    if (hiddenLabels.length > args.root.excludedLabelCount) {
      throw new Error("Repository inventory excluded labels exceed their persisted total.");
    }
    if (page.isDone) {
      break;
    }
    if (page.continueCursor.length === 0 || cursors.has(page.continueCursor)) {
      throw new Error("Repository inventory excluded-label pagination did not advance.");
    }
    cursors.add(page.continueCursor);
    cursor = page.continueCursor;
  }

  if (hiddenLabels.length !== args.root.excludedLabelCount) {
    throw new Error("Repository inventory excluded labels ended before their persisted total.");
  }
  return {
    vaultId: args.vaultId,
    excludedLabelCount: args.root.excludedLabelCount,
    filter: {
      hiddenLabels,
      includeDrafts: args.root.includeDrafts,
      includeNoLabel: args.root.includeNoLabel,
      revision: args.root.revision,
    },
  };
}

/**
 * Keeps the fixed-size saved filter root reactive while loading its normalized
 * excluded labels through bounded point-in-time pages. A revision is exposed
 * only after every label and the persisted total have been verified together.
 */
export function useRepositoryInventoryFilter(
  vaultId: Id<"vaults"> | null,
): LoadedRepositoryInventoryFilter | null {
  const convex = useConvex();
  const queryClient = useQueryClient();
  const root = useQuery(
    api.repositoryInventory.getRepositoryInventoryFilter,
    vaultId === null ? "skip" : { vaultId },
  );
  const currentRef = useRef({ root, vaultId });
  currentRef.current = { root, vaultId };
  const [committed, setCommitted] = useState<LoadedRepositoryInventoryFilterForVault | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (vaultId === null || root === undefined) {
      return;
    }
    if (
      committed?.vaultId === vaultId &&
      committed.filter.revision === root.revision &&
      committed.excludedLabelCount === root.excludedLabelCount
    ) {
      return;
    }

    const controller = new AbortController();
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
    void loadRepositoryInventoryFilter({
      query: (queryArgs) =>
        convex.query(api.repositoryInventory.listRepositoryInventoryExcludedLabelPage, queryArgs),
      queryClient,
      vaultId,
      root,
      signal: controller.signal,
    })
      .then((loaded) => {
        if (controller.signal.aborted) {
          return;
        }
        if (loaded === null) {
          queryClient.removeQueries({
            queryKey: ["repository-inventory-excluded-label-page", vaultId, root.revision],
          });
          retryTimeoutId = setTimeout(() => {
            if (!controller.signal.aborted) {
              setRetry((value) => value + 1);
            }
          }, REPOSITORY_INVENTORY_FILTER_RETRY_MS);
          return;
        }
        const current = currentRef.current;
        if (
          current.vaultId !== loaded.vaultId ||
          current.root?.revision !== loaded.filter.revision ||
          current.root.excludedLabelCount !== loaded.excludedLabelCount
        ) {
          return;
        }
        setCommitted(loaded);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        console.error("Failed to load repository inventory filters:", loadError);
        queryClient.removeQueries({
          queryKey: ["repository-inventory-excluded-label-page", vaultId, root.revision],
        });
        retryTimeoutId = setTimeout(() => {
          if (!controller.signal.aborted) {
            setRetry((value) => value + 1);
          }
        }, REPOSITORY_INVENTORY_FILTER_RETRY_MS);
      });

    return () => {
      controller.abort();
      if (retryTimeoutId !== null) {
        clearTimeout(retryTimeoutId);
      }
    };
  }, [committed, convex, queryClient, retry, root, vaultId]);

  return committed?.vaultId === vaultId ? committed.filter : null;
}
