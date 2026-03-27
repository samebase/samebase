import {
  CodexThreadBrowserView,
  type CodexThreadBrowserDetailState,
  type CodexThreadBrowserGroup,
  type CodexThreadBrowserMode,
} from "@/components/CodexThreadBrowserView";
import {
  CODEX_APP_SERVER_RESEARCH_ROUTE,
  codexThreadPathIsArchived,
  requestCodexAppServerJson as requestJson,
  type CodexAppServerEventsResponse,
  type CodexAppServerLoadedThreadsResponse,
  type CodexAppServerRuntimeSnapshot,
  type CodexAppServerThread,
  type CodexAppServerThreadDetailResponse,
  type CodexAppServerThreadsResponse,
} from "@/lib/codexAppServerResearch";
import {
  buildPathWithQuery,
  buildSearchString,
  setQueryParam,
  updateQueryParams,
} from "@/lib/queryParams";
import { useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const THREAD_LIST_LIMIT = 100;
const SELECTED_THREAD_QUERY_PARAM = "threadId";
const ACTIVE_THREAD_REFRESH_INTERVAL_MS = 1_500;

type ThreadActionResponse = {
  result?: unknown;
  runtime: CodexAppServerRuntimeSnapshot;
};

/**
 * The provider inventory can contain many similar prompts across multiple
 * worktrees. Dedupe by thread id so the browser never renders the same thread
 * multiple times even if the upstream inventory surface changes shape.
 */
function dedupeThreadsById(
  threads: CodexAppServerThread[],
): CodexAppServerThread[] {
  const threadsById = new Map<string, CodexAppServerThread>();

  for (const thread of threads) {
    const current = threadsById.get(thread.id);
    if (!current || thread.updatedAt > current.updatedAt) {
      threadsById.set(thread.id, thread);
    }
  }

  return Array.from(threadsById.values()).sort(
    (left, right) => right.updatedAt - left.updatedAt,
  );
}

/**
 * Group by canonical project root, not raw cwd. That keeps sibling worktrees
 * for the same repo under one project entry, while each thread still carries
 * its own worktree label.
 */
function buildThreadGroups(args: {
  threads: CodexAppServerThread[];
  loadedThreadIds: string[];
}): CodexThreadBrowserGroup[] {
  const groupMap = new Map<
    string,
    {
      label: string;
      detail: string;
      count: number;
      loadedCount: number;
      latestUpdatedAt: number;
      threads: CodexAppServerThread[];
    }
  >();

  for (const thread of args.threads) {
    const current = groupMap.get(thread.project.id);
    const loadedCountDelta = args.loadedThreadIds.includes(thread.id) ? 1 : 0;
    if (current) {
      current.count += 1;
      current.loadedCount += loadedCountDelta;
      current.latestUpdatedAt = Math.max(
        current.latestUpdatedAt,
        thread.updatedAt,
      );
      current.threads.push(thread);
      continue;
    }

    groupMap.set(thread.project.id, {
      label: thread.project.label,
      detail: thread.project.rootCwd,
      count: 1,
      loadedCount: loadedCountDelta,
      latestUpdatedAt: thread.updatedAt,
      threads: [thread],
    });
  }

  return Array.from(groupMap.entries())
    .sort((left, right) => right[1].latestUpdatedAt - left[1].latestUpdatedAt)
    .map(([id, group]) => ({
      id,
      label: group.label,
      detail: group.detail,
      count: group.count,
      loadedCount: group.loadedCount,
      threads: group.threads.sort(
        (left, right) => right.updatedAt - left.updatedAt,
      ),
    }));
}

function buildThreadsPath(args: {
  mode: CodexThreadBrowserMode;
  searchTerm: string;
}): string {
  const search = updateQueryParams(undefined, (nextSearchParams) => {
    setQueryParam(
      nextSearchParams,
      "archived",
      args.mode === "archived" ? "true" : "false",
    );
    setQueryParam(nextSearchParams, "limit", `${THREAD_LIST_LIMIT}`);
    setQueryParam(nextSearchParams, "sortKey", "updated_at");
    setQueryParam(
      nextSearchParams,
      "searchTerm",
      args.searchTerm.trim().length > 0 ? args.searchTerm.trim() : null,
    );
  });

  return buildPathWithQuery({
    pathname: "/threads",
    search,
  });
}

function readSelectedThreadId(searchParams: URLSearchParams): string | null {
  const selectedThreadId = searchParams
    .get(SELECTED_THREAD_QUERY_PARAM)
    ?.trim();
  return selectedThreadId && selectedThreadId.length > 0
    ? selectedThreadId
    : null;
}

export function CodexAppServerThreadBrowserResearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [browserMode, setBrowserMode] =
    useState<CodexThreadBrowserMode>("active");
  const [threads, setThreads] = useState<CodexAppServerThread[]>([]);
  const [pinnedThreadIds, setPinnedThreadIds] = useState<string[]>([]);
  const [loadedThreadIds, setLoadedThreadIds] = useState<string[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() =>
    readSelectedThreadId(searchParams),
  );
  const [selectedThreadDetail, setSelectedThreadDetail] =
    useState<CodexAppServerThread | null>(null);
  const [detailState, setDetailState] = useState<CodexThreadBrowserDetailState>(
    {
      kind: "idle",
    },
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [turnDraft, setTurnDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [hasLoadedThreadInventory, setHasLoadedThreadInventory] =
    useState(false);
  const selectedThreadRequestRef = useRef(0);
  const nextEventCursorRef = useRef(0);

  const refreshThreads = useCallback(
    async (mode: CodexThreadBrowserMode = browserMode, term = searchTerm) => {
      const response = await requestJson<CodexAppServerThreadsResponse>({
        path: buildThreadsPath({ mode, searchTerm: term }),
      });
      setThreads(response.threads);
      setPinnedThreadIds(response.pinnedThreadIds);
      setHasLoadedThreadInventory(true);
      return response;
    },
    [browserMode, searchTerm],
  );

  const refreshLoadedThreadIds = useCallback(async () => {
    const response = await requestJson<CodexAppServerLoadedThreadsResponse>({
      path: "/threads/loaded?limit=200",
    });
    setLoadedThreadIds(Array.from(new Set(response.threadIds)));
    return response;
  }, []);

  const refreshEvents = useCallback(async () => {
    const response = await requestJson<CodexAppServerEventsResponse>({
      path: `/events?since=${nextEventCursorRef.current}`,
    });
    nextEventCursorRef.current = response.nextCursor;
    return response;
  }, []);

  const uniqueThreads = useMemo(() => dedupeThreadsById(threads), [threads]);

  const visibleThreads = useMemo(() => {
    const trimmedSearch = searchTerm.trim().toLowerCase();
    return uniqueThreads.filter((thread) => {
      if (trimmedSearch.length === 0) {
        return true;
      }

      const haystack = [
        thread.id,
        thread.name ?? "",
        thread.preview,
        thread.cwd,
        thread.path ?? "",
        thread.project.rootCwd,
        thread.workspace.label ?? "",
        thread.gitInfo?.branch ?? "",
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(trimmedSearch);
    });
  }, [searchTerm, uniqueThreads]);

  const selectedThreadSummary = useMemo(() => {
    if (!selectedThreadId) {
      return null;
    }

    return (
      uniqueThreads.find((thread) => thread.id === selectedThreadId) ?? null
    );
  }, [selectedThreadId, uniqueThreads]);

  /**
   * Codex stores pinned thread ids in explicit sidebar order. Preserve that
   * local desktop order instead of re-sorting by updated time.
   */
  const pinnedThreads = useMemo(() => {
    const visibleThreadById = new Map(
      visibleThreads.map((thread) => [thread.id, thread]),
    );

    return pinnedThreadIds
      .map((threadId) => visibleThreadById.get(threadId) ?? null)
      .filter((thread): thread is CodexAppServerThread => thread !== null);
  }, [pinnedThreadIds, visibleThreads]);

  /**
   * Pinned threads render in their own section above projects, so keep the
   * grouped project inventory strictly to the remaining unpinned threads.
   */
  const unpinnedVisibleThreads = useMemo(() => {
    const pinnedThreadIdSet = new Set(pinnedThreadIds);
    return visibleThreads.filter((thread) => !pinnedThreadIdSet.has(thread.id));
  }, [pinnedThreadIds, visibleThreads]);

  const groups = useMemo(
    () =>
      buildThreadGroups({ threads: unpinnedVisibleThreads, loadedThreadIds }),
    [loadedThreadIds, unpinnedVisibleThreads],
  );
  const currentSearch = buildSearchString(searchParams);

  useEffect(() => {
    const nextSelectedThreadId = readSelectedThreadId(searchParams);
    setSelectedThreadId((current) =>
      current === nextSelectedThreadId ? current : nextSelectedThreadId,
    );
  }, [searchParams]);

  useEffect(() => {
    const nextSearchParams = updateQueryParams(searchParams, (nextParams) => {
      setQueryParam(
        nextParams,
        SELECTED_THREAD_QUERY_PARAM,
        selectedThreadId ?? null,
      );
    });
    const nextSearch = buildSearchString(nextSearchParams);
    if (nextSearch === currentSearch) {
      return;
    }

    setSearchParams(nextSearchParams, { replace: true });
  }, [currentSearch, searchParams, selectedThreadId, setSearchParams]);

  useEffect(() => {
    if (!hasLoadedThreadInventory) {
      return;
    }

    if (
      selectedThreadId &&
      uniqueThreads.some((thread) => thread.id === selectedThreadId)
    ) {
      return;
    }

    if (selectedThreadId !== null) {
      setSelectedThreadId(null);
      return;
    }

    setSelectedThreadId(uniqueThreads[0]?.id ?? null);
  }, [hasLoadedThreadInventory, selectedThreadId, uniqueThreads]);

  useEffect(() => {
    setTurnDraft("");
  }, [selectedThreadId]);

  const refreshSelectedThread = useCallback(
    async (
      thread: CodexAppServerThread | null = selectedThreadSummary,
      options?: {
        silent?: boolean;
      },
    ) => {
      const requestId = selectedThreadRequestRef.current + 1;
      selectedThreadRequestRef.current = requestId;
      const isSilent = options?.silent === true;

      if (!thread) {
        setSelectedThreadDetail(null);
        setDetailState({ kind: "idle" });
        return null;
      }

      if (codexThreadPathIsArchived(thread.path)) {
        setSelectedThreadDetail(thread);
        setDetailState({
          kind: "archived",
          message:
            "Archived threads are moved into the provider's cold-storage directory. Unarchive before reading or resuming the full turn history.",
        });
        return null;
      }

      if (!isSilent) {
        setSelectedThreadDetail(thread);
        setDetailState({ kind: "loading" });
      }
      try {
        const response = await requestJson<CodexAppServerThreadDetailResponse>({
          path: `/threads/${encodeURIComponent(thread.id)}`,
        });

        if (selectedThreadRequestRef.current === requestId) {
          setSelectedThreadDetail(response.thread);
          setDetailState({ kind: "ready" });
        }

        return response;
      } catch (nextError) {
        if (selectedThreadRequestRef.current === requestId && !isSilent) {
          setDetailState({
            kind: "error",
            message:
              nextError instanceof Error
                ? nextError.message
                : "Failed to load thread detail.",
          });
        }
        throw nextError;
      }
    },
    [selectedThreadSummary],
  );

  const refreshAll = useCallback(
    async (
      mode: CodexThreadBrowserMode = browserMode,
      term: string = searchTerm,
    ) => {
      const [threadsResponse] = await Promise.all([
        refreshThreads(mode, term),
        refreshLoadedThreadIds(),
      ]);
      return threadsResponse;
    },
    [browserMode, refreshLoadedThreadIds, refreshThreads, searchTerm],
  );

  const refreshSelectedThreadRef = useRef(refreshSelectedThread);
  const refreshAllRef = useRef(refreshAll);
  const refreshEventsRef = useRef(refreshEvents);
  const selectedThreadSummaryRef = useRef(selectedThreadSummary);

  refreshSelectedThreadRef.current = refreshSelectedThread;
  refreshAllRef.current = refreshAll;
  refreshEventsRef.current = refreshEvents;
  selectedThreadSummaryRef.current = selectedThreadSummary;

  useEffect(() => {
    const hydrate = async () => {
      try {
        await Promise.all([
          refreshAll(browserMode, searchTerm),
          refreshEvents(),
        ]);
        setError(null);
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Failed to load Codex thread browser state.",
        );
      }
    };

    void hydrate();
  }, [browserMode, refreshAll, refreshEvents, searchTerm]);

  useEffect(() => {
    if (selectedThreadId === null) {
      void refreshSelectedThread(null);
      return;
    }

    // Background event refreshes should keep the hydrated detail pane stable.
    // Only show the explicit loading state when the operator changes selection
    // or when the page has not loaded the selected thread yet.
    const needsVisibleHydration =
      selectedThreadDetail?.id !== selectedThreadId ||
      detailState.kind === "idle";
    if (!needsVisibleHydration) {
      return;
    }

    void refreshSelectedThread(selectedThreadSummary);
  }, [
    detailState.kind,
    refreshSelectedThread,
    selectedThreadDetail?.id,
    selectedThreadId,
    selectedThreadSummary,
  ]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const hydrate = async () => {
      if (cancelled || inFlight) {
        return;
      }

      inFlight = true;
      try {
        const eventsResponse = await refreshEventsRef.current();
        if (eventsResponse.events.length === 0) {
          return;
        }

        const threadsResponse = await refreshAllRef.current(
          browserMode,
          searchTerm,
        );
        const refreshedThread =
          selectedThreadId === null
            ? null
            : threadsResponse.threads.find(
                (thread) => thread.id === selectedThreadId,
              ) ??
              selectedThreadSummaryRef.current ??
              null;
        await refreshSelectedThreadRef.current(refreshedThread, {
          silent: true,
        });
      } catch {
        // Keep the last rendered state and let the existing page error surface
        // handle action failures instead of replacing the detail pane on poll.
      } finally {
        inFlight = false;
      }
    };

    void hydrate();
    const intervalId = window.setInterval(() => {
      void hydrate();
    }, ACTIVE_THREAD_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [browserMode, searchTerm, selectedThreadId]);

  const runAction = useCallback(async (action: () => Promise<void>) => {
    setIsBusy(true);
    try {
      await action();
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Request failed.",
      );
    } finally {
      setIsBusy(false);
    }
  }, []);

  return (
    <CodexThreadBrowserView
      browserMode={browserMode}
      pinnedThreads={pinnedThreads}
      groups={groups}
      searchTerm={searchTerm}
      loadedThreadIds={loadedThreadIds}
      selectedThreadId={selectedThreadId}
      selectedThread={selectedThreadDetail ?? selectedThreadSummary}
      detailState={detailState}
      errorMessage={error}
      isBusy={isBusy}
      labHref={CODEX_APP_SERVER_RESEARCH_ROUTE}
      onBrowserModeChange={(nextMode) => {
        setBrowserMode(nextMode);
        setSelectedThreadId(null);
        setSelectedThreadDetail(null);
        setDetailState({ kind: "idle" });
      }}
      onSearchTermChange={setSearchTerm}
      onThreadSelect={setSelectedThreadId}
      turnDraft={turnDraft}
      onTurnDraftChange={setTurnDraft}
      onTurnSubmit={() => {
        if (!selectedThreadId || turnDraft.trim().length === 0) {
          return;
        }

        void runAction(async () => {
          // Reuse the existing app-server turn entrypoint so browser sends follow the same thread lifecycle.
          await requestJson<ThreadActionResponse>({
            path: "/turn/start",
            method: "POST",
            body: {
              threadId: selectedThreadId,
              text: turnDraft.trim(),
            },
          });
          setTurnDraft("");
          const threadsResponse = await refreshAll(browserMode);
          const refreshedThread =
            threadsResponse.threads.find(
              (thread) => thread.id === selectedThreadId,
            ) ?? null;
          await refreshSelectedThread(refreshedThread);
        });
      }}
      onRefresh={() => {
        void runAction(async () => {
          const threadsResponse = await refreshAll(browserMode);
          const refreshedThread =
            threadsResponse.threads.find(
              (thread) => thread.id === selectedThreadId,
            ) ?? null;
          await refreshSelectedThread(refreshedThread);
        });
      }}
      onResumeSelected={() => {
        if (!selectedThreadId) {
          return;
        }

        void runAction(async () => {
          await requestJson<ThreadActionResponse>({
            path: "/thread/resume",
            method: "POST",
            body: {
              threadId: selectedThreadId,
            },
          });
          const threadsResponse = await refreshAll("active");
          const refreshedThread =
            threadsResponse.threads.find(
              (thread) => thread.id === selectedThreadId,
            ) ?? null;
          await refreshSelectedThread(refreshedThread);
        });
      }}
      onArchiveSelected={() => {
        if (!selectedThreadId) {
          return;
        }

        void runAction(async () => {
          await requestJson<ThreadActionResponse>({
            path: "/thread/archive",
            method: "POST",
            body: {
              threadId: selectedThreadId,
            },
          });
          setBrowserMode("archived");
          await refreshAll("archived");
          setSelectedThreadId(selectedThreadId);
        });
      }}
      onUnarchiveSelected={() => {
        if (!selectedThreadId) {
          return;
        }

        void runAction(async () => {
          await requestJson<ThreadActionResponse>({
            path: "/thread/unarchive",
            method: "POST",
            body: {
              threadId: selectedThreadId,
            },
          });
          setBrowserMode("active");
          const threadsResponse = await refreshAll("active");
          const refreshedThread =
            threadsResponse.threads.find(
              (thread) => thread.id === selectedThreadId,
            ) ?? null;
          setSelectedThreadId(selectedThreadId);
          await refreshSelectedThread(refreshedThread);
        });
      }}
    />
  );
}
