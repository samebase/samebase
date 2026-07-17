import {
  useInfiniteQuery,
  type InfiniteData,
  type UndefinedInitialDataInfiniteOptions,
} from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { useMemo } from "react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const REPOSITORY_INVENTORY_BUILD_PAGE_SIZE = 25;

type RepositoryInventoryUnattributedCloudflareBuildPageResult =
  (typeof api.repositoryInventory.listRepositoryInventoryUnattributedCloudflareBuildPage)["_returnType"];
type RepositoryInventoryUnattributedCloudflareBuildPage = Extract<
  RepositoryInventoryUnattributedCloudflareBuildPageResult,
  { state: "ready" }
>;
export type RepositoryInventoryUnattributedCloudflareBuild =
  RepositoryInventoryUnattributedCloudflareBuildPage["page"][number];

export function useRepositoryInventoryUnattributedCloudflareBuilds(args: {
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
}) {
  const convex = useConvex();
  const initialPageParam: string | null = null;
  const queryKey = [
    "repository-inventory-unattributed-cloudflare-builds",
    args.vaultId,
    args.snapshotId,
  ] as const;
  const queryOptions: UndefinedInitialDataInfiniteOptions<
    RepositoryInventoryUnattributedCloudflareBuildPage,
    Error,
    InfiniteData<RepositoryInventoryUnattributedCloudflareBuildPage, string | null>,
    typeof queryKey,
    string | null
  > = {
    queryKey,
    queryFn: async ({
      pageParam,
      signal,
    }): Promise<RepositoryInventoryUnattributedCloudflareBuildPage> => {
      signal.throwIfAborted();
      const result = await convex.query(
        api.repositoryInventory.listRepositoryInventoryUnattributedCloudflareBuildPage,
        {
          vaultId: args.vaultId,
          snapshotId: args.snapshotId,
          paginationOpts: {
            cursor: pageParam,
            numItems: REPOSITORY_INVENTORY_BUILD_PAGE_SIZE,
          },
        },
      );
      signal.throwIfAborted();
      if (result.state === "unavailable") {
        throw new Error("Repository inventory unattributed builds are no longer available.");
      }
      return result;
    },
    initialPageParam,
    getNextPageParam: (lastPage) => (lastPage.isDone ? undefined : lastPage.continueCursor),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  };
  const query = useInfiniteQuery(queryOptions);

  const loaded = useMemo(() => {
    try {
      const pages = query.data?.pages ?? [];
      const expectedBuildCount = pages.at(0)?.expectedBuildCount;
      const sourceKeys = new Set<string>();
      const builds: RepositoryInventoryUnattributedCloudflareBuild[] = [];
      for (const page of pages) {
        if (page.expectedBuildCount !== expectedBuildCount) {
          throw new Error("Repository inventory unattributed build totals changed while loading.");
        }
        for (const item of page.page) {
          if (sourceKeys.has(item.build.sourceKey)) {
            throw new Error("Repository inventory returned a duplicate unattributed build.");
          }
          sourceKeys.add(item.build.sourceKey);
          builds.push(item);
        }
      }
      if (expectedBuildCount !== undefined && builds.length > expectedBuildCount) {
        throw new Error("Repository inventory returned too many unattributed builds.");
      }
      const lastPage = pages.at(-1);
      if (
        lastPage?.isDone === true &&
        expectedBuildCount !== undefined &&
        builds.length !== expectedBuildCount
      ) {
        throw new Error(
          "Repository inventory unattributed builds ended before every build loaded.",
        );
      }
      return { builds, validationError: null };
    } catch (error) {
      return {
        builds: [],
        validationError:
          error instanceof Error
            ? error
            : new Error("Repository inventory unattributed builds could not be validated."),
      };
    }
  }, [query.data?.pages]);

  return {
    builds: loaded.builds,
    error: query.error ?? loaded.validationError,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
  };
}
