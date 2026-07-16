import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useConvex, useQuery, type PaginationStatus } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const REPOSITORY_SUMMARY_DIRECTORY_PAGE_SIZE = 25;
const REPOSITORY_SUMMARY_DIRECTORY_RETRY_MS = 5_000;

type RepositorySummaryDirectoryPageResult =
  (typeof api.repositorySummary.listRepositorySummaryDirectoryPage)["_returnType"];
type RepositorySummaryDirectoryPage = NonNullable<RepositorySummaryDirectoryPageResult>;
type RepositorySummaryDirectoryPageArgs =
  (typeof api.repositorySummary.listRepositorySummaryDirectoryPage)["_args"];
type RepositorySummaryDirectoryPageQuery = (
  args: RepositorySummaryDirectoryPageArgs,
) => Promise<RepositorySummaryDirectoryPageResult>;

export type RepositorySummaryDirectoryEntry = RepositorySummaryDirectoryPage["page"][number];

type LoadedRepositorySummaryDirectory = {
  ownerId: Id<"users">;
  revision: number;
  entries: RepositorySummaryDirectoryEntry[];
  continueCursor: string | null;
  seenCursors: string[];
  isDone: boolean;
};

function directoryPageQueryKey(args: {
  ownerId: Id<"users">;
  revision: number;
  cursor: string | null;
}) {
  return ["repository-summary-directory-page", args.ownerId, args.revision, args.cursor] as const;
}

async function queryDirectoryPage(args: {
  query: RepositorySummaryDirectoryPageQuery;
  queryClient: QueryClient;
  ownerId: Id<"users">;
  revision: number;
  cursor: string | null;
  signal: AbortSignal;
}): Promise<RepositorySummaryDirectoryPageResult> {
  return await args.queryClient.fetchQuery({
    queryKey: directoryPageQueryKey(args),
    queryFn: async ({ signal }) => {
      signal.throwIfAborted();
      const page = await args.query({
        directoryRevision: args.revision,
        paginationOpts: {
          cursor: args.cursor,
          maximumRowsRead: REPOSITORY_SUMMARY_DIRECTORY_PAGE_SIZE,
          numItems: REPOSITORY_SUMMARY_DIRECTORY_PAGE_SIZE,
        },
      });
      signal.throwIfAborted();
      return page;
    },
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

async function loadRepositorySummaryDirectory(args: {
  query: RepositorySummaryDirectoryPageQuery;
  queryClient: QueryClient;
  ownerId: Id<"users">;
  revision: number;
  requestedItemCount: number;
  prior?: LoadedRepositorySummaryDirectory;
  signal: AbortSignal;
}): Promise<LoadedRepositorySummaryDirectory | null> {
  const entries = args.prior?.entries.slice() ?? [];
  let continueCursor = args.prior?.continueCursor ?? null;
  let isDone = args.prior?.isDone ?? false;
  const seenCursors = new Set(args.prior?.seenCursors);

  while (!isDone && entries.length < args.requestedItemCount) {
    args.signal.throwIfAborted();
    const page = await queryDirectoryPage({
      query: args.query,
      queryClient: args.queryClient,
      ownerId: args.ownerId,
      revision: args.revision,
      cursor: continueCursor,
      signal: args.signal,
    });
    if (page === null) {
      return null;
    }
    if (page.page.length > REPOSITORY_SUMMARY_DIRECTORY_PAGE_SIZE) {
      throw new Error("Repository summary directory page exceeded its read bound.");
    }
    if (
      !page.isDone &&
      (page.continueCursor.length === 0 || seenCursors.has(page.continueCursor))
    ) {
      throw new Error("Repository summary directory pagination did not advance.");
    }
    entries.push(...page.page);
    continueCursor = page.continueCursor;
    isDone = page.isDone;
    if (!isDone) {
      seenCursors.add(continueCursor);
    }
  }

  const vaultIds = new Set(entries.map((entry) => entry.vaultId));
  if (vaultIds.size !== entries.length) {
    throw new Error("Repository summary directory contains duplicate vaults.");
  }

  return {
    ownerId: args.ownerId,
    revision: args.revision,
    entries,
    continueCursor,
    seenCursors: [...seenCursors],
    isDone,
  };
}

/**
 * Keeps one reactive directory revision and reads each bounded page as a
 * point-in-time query. A new revision replaces all requested pages together,
 * so the UI never mixes repository rows from different directory generations.
 */
export function useRepositorySummaryDirectory(): {
  entries: RepositorySummaryDirectoryEntry[];
  error: string | null;
  status: PaginationStatus;
  loadMore: () => void;
} {
  const convex = useConvex();
  const queryClient = useQueryClient();
  const directoryState = useQuery(api.repositorySummary.getRepositorySummaryDirectoryState);
  const currentGenerationRef = useRef(directoryState);
  currentGenerationRef.current = directoryState;
  const [committed, setCommitted] = useState<LoadedRepositorySummaryDirectory | null>(null);
  const [requestedItemCount, setRequestedItemCount] = useState(
    REPOSITORY_SUMMARY_DIRECTORY_PAGE_SIZE,
  );
  const [activeRevision, setActiveRevision] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const revision = directoryState?.revision;
    const ownerId = directoryState?.ownerId;
    if (revision === undefined || ownerId === undefined) {
      setActiveRevision(null);
      return;
    }
    if (
      committed?.ownerId === ownerId &&
      committed.revision === revision &&
      (committed.isDone || committed.entries.length >= requestedItemCount)
    ) {
      setActiveRevision(null);
      return;
    }

    const controller = new AbortController();
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const prior =
      committed?.ownerId === ownerId && committed.revision === revision ? committed : undefined;
    const requestedLoadItemCount = Math.max(requestedItemCount, prior?.entries.length ?? 0);
    setActiveRevision(revision);
    void loadRepositorySummaryDirectory({
      query: (queryArgs) =>
        convex.query(api.repositorySummary.listRepositorySummaryDirectoryPage, queryArgs),
      queryClient,
      ownerId,
      revision,
      requestedItemCount: requestedLoadItemCount,
      prior,
      signal: controller.signal,
    })
      .then((directory) => {
        if (controller.signal.aborted) {
          return;
        }
        if (directory === null) {
          queryClient.removeQueries({
            queryKey: ["repository-summary-directory-page", ownerId, revision],
          });
          setError(null);
          setActiveRevision((current) => (current === revision ? null : current));
          retryTimeoutId = setTimeout(() => {
            if (!controller.signal.aborted) {
              setRetry((value) => value + 1);
            }
          }, REPOSITORY_SUMMARY_DIRECTORY_RETRY_MS);
          return;
        }
        const currentGeneration = currentGenerationRef.current;
        if (
          currentGeneration?.ownerId !== directory.ownerId ||
          currentGeneration.revision !== directory.revision
        ) {
          return;
        }
        setCommitted(directory);
        setError(null);
        setActiveRevision((current) => (current === directory.revision ? null : current));
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        console.error("Failed to load the repository summary directory:", loadError);
        queryClient.removeQueries({
          queryKey: ["repository-summary-directory-page", ownerId, revision],
        });
        setError(loadError instanceof Error ? loadError.message : "Could not load vaults.");
        setActiveRevision((current) => (current === revision ? null : current));
        retryTimeoutId = setTimeout(() => {
          if (!controller.signal.aborted) {
            setRetry((value) => value + 1);
          }
        }, REPOSITORY_SUMMARY_DIRECTORY_RETRY_MS);
      });

    return () => {
      controller.abort();
      if (retryTimeoutId !== null) {
        clearTimeout(retryTimeoutId);
      }
    };
  }, [
    committed,
    convex,
    directoryState?.ownerId,
    directoryState?.revision,
    queryClient,
    requestedItemCount,
    retry,
  ]);

  const loadMore = useCallback(() => {
    setRequestedItemCount((count) => count + REPOSITORY_SUMMARY_DIRECTORY_PAGE_SIZE);
  }, []);
  const currentRevision = directoryState?.revision;
  const currentOwnerId = directoryState?.ownerId;
  const committedMatchesCurrentOwner =
    currentOwnerId !== undefined && committed?.ownerId === currentOwnerId;
  const committedMatchesCurrentGeneration =
    committedMatchesCurrentOwner && committed.revision === currentRevision;
  const status: PaginationStatus = (() => {
    if (!committedMatchesCurrentOwner) {
      return "LoadingFirstPage";
    }
    if (activeRevision === currentRevision) {
      return "LoadingMore";
    }
    if (!committedMatchesCurrentGeneration) {
      return "LoadingMore";
    }
    return committed.isDone ? "Exhausted" : "CanLoadMore";
  })();

  return {
    entries: committedMatchesCurrentOwner ? committed.entries : [],
    error,
    status,
    loadMore,
  };
}
