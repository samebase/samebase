import {
  useInfiniteQuery,
  type InfiniteData,
  type UndefinedInitialDataInfiniteOptions,
} from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { ConvexError } from "convex/values";
import { useMemo } from "react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type RepositoryInventoryChecksPage =
  (typeof api.repositoryInventoryChecks.listRepositoryInventoryChecksPage)["_returnType"];
export type RepositoryInventoryCheck = RepositoryInventoryChecksPage["items"][number];
type RepositoryInventoryChecksPageParam = {
  cursor: string | null;
  previousPageSignatures: string[];
};

function queuedChecksRetryAt(error: Error): number | undefined {
  if (!(error instanceof ConvexError)) {
    return undefined;
  }
  const data: unknown = error.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("code" in data) ||
    data.code !== "github_checks_temporarily_unavailable" ||
    !("reason" in data) ||
    data.reason !== "queue" ||
    !("retryAt" in data) ||
    typeof data.retryAt !== "number" ||
    !Number.isFinite(data.retryAt)
  ) {
    return undefined;
  }
  return data.retryAt;
}

function sameCheckTotals(
  left: RepositoryInventoryChecksPage["totals"],
  right: RepositoryInventoryChecksPage["totals"],
): boolean {
  return (
    left.state === right.state &&
    left.totalCount === right.totalCount &&
    left.checkRunCount === right.checkRunCount &&
    left.statusContextCount === right.statusContextCount &&
    left.successCount === right.successCount &&
    left.failureCount === right.failureCount &&
    left.runningCount === right.runningCount &&
    left.neutralCount === right.neutralCount &&
    left.unknownCount === right.unknownCount
  );
}

export function useRepositoryInventoryChecks(args: {
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  rowKey: string;
}) {
  const convex = useConvex();
  const initialPageParam: RepositoryInventoryChecksPageParam = {
    cursor: null,
    previousPageSignatures: [],
  };
  const queryKey = [
    "repository-inventory-checks",
    args.vaultId,
    args.snapshotId,
    args.rowKey,
  ] as const;
  const queryOptions: UndefinedInitialDataInfiniteOptions<
    RepositoryInventoryChecksPage,
    Error,
    InfiniteData<RepositoryInventoryChecksPage, RepositoryInventoryChecksPageParam>,
    typeof queryKey,
    RepositoryInventoryChecksPageParam
  > = {
    queryKey,
    queryFn: async ({ pageParam, signal }): Promise<RepositoryInventoryChecksPage> => {
      signal.throwIfAborted();
      const result = await convex.action(
        api.repositoryInventoryChecks.listRepositoryInventoryChecksPage,
        {
          vaultId: args.vaultId,
          snapshotId: args.snapshotId,
          rowKey: args.rowKey,
          cursor: pageParam.cursor,
          previousPageSignatures: pageParam.previousPageSignatures,
        },
      );
      signal.throwIfAborted();
      return result;
    },
    initialPageParam,
    getNextPageParam: (lastPage, pages) =>
      lastPage.nextCursor === null
        ? undefined
        : {
            cursor: lastPage.nextCursor,
            previousPageSignatures: pages.map((page) => page.pageSignature),
          },
    retry: (failureCount, error) => failureCount < 6 && queuedChecksRetryAt(error) !== undefined,
    retryDelay: (_failureCount, error) => {
      const retryAt = queuedChecksRetryAt(error);
      return retryAt === undefined ? 0 : Math.min(Math.max(retryAt - Date.now(), 0), 5_000);
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  };
  const query = useInfiniteQuery(queryOptions);

  const loaded = useMemo(() => {
    try {
      const pages = query.data?.pages ?? [];
      const firstPage = pages.at(0);
      const checks: RepositoryInventoryCheck[] = [];
      const sourceKeys = new Set<string>();
      for (const page of pages) {
        if (
          !firstPage ||
          page.githubChecksUrl !== firstPage.githubChecksUrl ||
          !sameCheckTotals(page.totals, firstPage.totals)
        ) {
          throw new Error("GitHub check totals changed while loading.");
        }
        for (const check of page.items) {
          const key = `${check.source}:${check.sourceKey}`;
          if (sourceKeys.has(key)) {
            throw new Error("GitHub returned a duplicate check while loading.");
          }
          sourceKeys.add(key);
          checks.push(check);
        }
      }
      if (firstPage && checks.length > firstPage.totals.totalCount) {
        throw new Error("GitHub returned too many checks.");
      }
      const lastPage = pages.at(-1);
      if (
        firstPage &&
        lastPage?.nextCursor === null &&
        checks.length !== firstPage.totals.totalCount
      ) {
        throw new Error("GitHub checks ended before every check was loaded.");
      }
      return {
        checks,
        githubChecksUrl: firstPage?.githubChecksUrl,
        totals: firstPage?.totals,
        validationError: null,
      };
    } catch (error) {
      return {
        checks: [],
        githubChecksUrl: undefined,
        totals: undefined,
        validationError:
          error instanceof Error ? error : new Error("GitHub checks could not be validated."),
      };
    }
  }, [query.data?.pages]);

  return {
    ...loaded,
    error: query.error ?? loaded.validationError,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
  };
}
