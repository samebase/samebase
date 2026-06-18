import {
  CodexThreadBrowserView,
  type CodexThreadBrowserDetailState,
  type CodexThreadBrowserGroup,
  type CodexThreadBrowserMode,
} from "@/components/CodexThreadBrowserView";
import {
  CODEX_APP_SERVER_RESEARCH_ROUTE,
  CODEX_APP_SERVER_THREAD_BROWSER_ROUTE,
  codexThreadPathIsArchived,
  requestCodexAppServerJson as requestJson,
  type CodexAppServerEventsResponse,
  type CodexAppServerLoadedThreadsResponse,
  type CodexAppServerRuntimeSnapshot,
  type CodexAppServerThread,
  type CodexAppServerThreadDetailResponse,
  type CodexAppServerThreadsResponse,
} from "@/lib/codexAppServerResearch";
import { buildCodexResearchRouteSearch } from "@/routeSearch/codexResearch";
import { dedupeCodexThreadsById } from "@/lib/codexThreadSidebar";
import { useCodexThreadSidebarViewModel } from "@/hooks/useCodexThreadSidebarViewModel";
import { getRouteApi, linkOptions, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const THREAD_LIST_LIMIT = 100;
const ACTIVE_THREAD_REFRESH_INTERVAL_MS = 1_500;
const codexThreadBrowserRouteApi = getRouteApi(CODEX_APP_SERVER_THREAD_BROWSER_ROUTE);

type ThreadActionResponse = {
  result?: unknown;
  runtime: CodexAppServerRuntimeSnapshot;
};

function buildThreadsPath(args: { mode: CodexThreadBrowserMode; searchTerm: string }): string {
  const searchParams = new URLSearchParams();
  const trimmedSearchTerm = args.searchTerm.trim();
  searchParams.set("archived", args.mode === "archived" ? "true" : "false");
  searchParams.set("limit", `${THREAD_LIST_LIMIT}`);
  searchParams.set("sortKey", "updated_at");
  if (trimmedSearchTerm.length > 0) {
    searchParams.set("searchTerm", trimmedSearchTerm);
  }
  return `/threads?${searchParams.toString()}`;
}

function buildCodexResearchLinkOptions(selectedThreadId: string | null) {
  return linkOptions({
    to: CODEX_APP_SERVER_RESEARCH_ROUTE,
    search: buildCodexResearchRouteSearch(selectedThreadId),
  });
}

export function CodexAppServerThreadBrowserResearchPage() {
  const router = useRouter();
  const navigate = codexThreadBrowserRouteApi.useNavigate();
  const routeSearch = codexThreadBrowserRouteApi.useSearch();
  const [browserMode, setBrowserMode] = useState<CodexThreadBrowserMode>("active");
  const [threads, setThreads] = useState<CodexAppServerThread[]>([]);
  const [pinnedThreadIds, setPinnedThreadIds] = useState<string[]>([]);
  const [loadedThreadIds, setLoadedThreadIds] = useState<string[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    () => routeSearch.threadId ?? null,
  );
  const [selectedThreadDetail, setSelectedThreadDetail] = useState<CodexAppServerThread | null>(
    null,
  );
  const [detailState, setDetailState] = useState<CodexThreadBrowserDetailState>({
    kind: "idle",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [turnDraft, setTurnDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [hasLoadedThreadInventory, setHasLoadedThreadInventory] = useState(false);
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

  const uniqueThreads = useMemo(() => dedupeCodexThreadsById(threads), [threads]);

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

    return uniqueThreads.find((thread) => thread.id === selectedThreadId) ?? null;
  }, [selectedThreadId, uniqueThreads]);

  const sidebarViewModel = useCodexThreadSidebarViewModel({
    loadedThreadIds,
    pinnedThreadIds,
    threads: visibleThreads,
  });
  const pinnedThreads = useMemo(
    () => sidebarViewModel.pinnedThreads,
    [sidebarViewModel.pinnedThreads],
  );
  const groups = useMemo<CodexThreadBrowserGroup[]>(
    () => sidebarViewModel.projects,
    [sidebarViewModel.projects],
  );

  useEffect(() => {
    const nextSelectedThreadId = routeSearch.threadId ?? null;
    setSelectedThreadId((current) =>
      current === nextSelectedThreadId ? current : nextSelectedThreadId,
    );
  }, [routeSearch.threadId]);

  useEffect(() => {
    const nextSearch = buildCodexResearchRouteSearch(selectedThreadId);
    if (nextSearch.threadId === routeSearch.threadId) {
      return;
    }

    void navigate({
      replace: true,
      search: nextSearch,
    });
  }, [navigate, routeSearch.threadId, selectedThreadId]);

  useEffect(() => {
    if (!hasLoadedThreadInventory) {
      return;
    }

    if (selectedThreadId && uniqueThreads.some((thread) => thread.id === selectedThreadId)) {
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
              nextError instanceof Error ? nextError.message : "Failed to load thread detail.",
          });
        }
        throw nextError;
      }
    },
    [selectedThreadSummary],
  );

  const refreshAll = useCallback(
    async (mode: CodexThreadBrowserMode = browserMode, term: string = searchTerm) => {
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
        await Promise.all([refreshAll(browserMode, searchTerm), refreshEvents()]);
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
      selectedThreadDetail?.id !== selectedThreadId || detailState.kind === "idle";
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

        const threadsResponse = await refreshAllRef.current(browserMode, searchTerm);
        const refreshedThread =
          selectedThreadId === null
            ? null
            : (threadsResponse.threads.find((thread) => thread.id === selectedThreadId) ??
              selectedThreadSummaryRef.current ??
              null);
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
      setError(nextError instanceof Error ? nextError.message : "Request failed.");
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
      labHref={router.buildLocation(buildCodexResearchLinkOptions(selectedThreadId)).href}
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
            threadsResponse.threads.find((thread) => thread.id === selectedThreadId) ?? null;
          await refreshSelectedThread(refreshedThread);
        });
      }}
      onRefresh={() => {
        void runAction(async () => {
          const threadsResponse = await refreshAll(browserMode);
          const refreshedThread =
            threadsResponse.threads.find((thread) => thread.id === selectedThreadId) ?? null;
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
            threadsResponse.threads.find((thread) => thread.id === selectedThreadId) ?? null;
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
            threadsResponse.threads.find((thread) => thread.id === selectedThreadId) ?? null;
          setSelectedThreadId(selectedThreadId);
          await refreshSelectedThread(refreshedThread);
        });
      }}
    />
  );
}
