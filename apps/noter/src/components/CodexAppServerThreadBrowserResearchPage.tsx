import {
  CodexThreadBrowserView,
  type CodexThreadBrowserDetailState,
  type CodexThreadBrowserMode,
  type CodexThreadBrowserProject,
} from "@/components/CodexThreadBrowserView";
import {
  CODEX_APP_SERVER_RESEARCH_API_BASE,
  CODEX_APP_SERVER_RESEARCH_ROUTE,
  type CodexAppServerLoadedThreadsResponse,
  type CodexAppServerRuntimeSnapshot,
  type CodexAppServerThread,
  type CodexAppServerThreadDetailResponse,
  type CodexAppServerThreadsResponse,
} from "@/lib/codexAppServerResearch";
import {
  buildPathWithQuery,
  setQueryParam,
  updateQueryParams,
} from "@/lib/queryParams";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ALL_THREADS_PROJECT_ID = "__all__";
const THREAD_LIST_LIMIT = 100;

type ThreadActionResponse = {
  result?: unknown;
  runtime: CodexAppServerRuntimeSnapshot;
};

async function requestJson<T>(args: {
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch(
    `${CODEX_APP_SERVER_RESEARCH_API_BASE}${args.path}`,
    {
      method: args.method ?? "GET",
      headers:
        args.body !== undefined
          ? {
              "Content-Type": "application/json",
            }
          : undefined,
      body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : `Request failed: ${response.status}`,
    );
  }
  return payload;
}

function readPathLeaf(value: string): string {
  const normalized = value.split("\\").join("/");
  const segments = normalized
    .split("/")
    .filter((segment: string) => segment.length > 0);
  return segments[segments.length - 1] ?? value;
}

function threadIsArchived(thread: CodexAppServerThread): boolean {
  return thread.path?.includes("/archived_sessions/") ?? false;
}

/**
 * Group the provider inventory by cwd so the web view can browse threads using
 * the same project-oriented shape shown in Codex and T3 Code.
 */
function buildProjects(args: {
  threads: CodexAppServerThread[];
  loadedThreadIds: string[];
}): CodexThreadBrowserProject[] {
  const projectMap = new Map<
    string,
    {
      label: string;
      detail: string;
      count: number;
      loadedCount: number;
      latestUpdatedAt: number;
    }
  >();

  for (const thread of args.threads) {
    const current = projectMap.get(thread.cwd);
    const loadedCountDelta = args.loadedThreadIds.includes(thread.id) ? 1 : 0;
    if (current) {
      current.count += 1;
      current.loadedCount += loadedCountDelta;
      current.latestUpdatedAt = Math.max(
        current.latestUpdatedAt,
        thread.updatedAt,
      );
      continue;
    }

    projectMap.set(thread.cwd, {
      label: readPathLeaf(thread.cwd),
      detail: thread.cwd,
      count: 1,
      loadedCount: loadedCountDelta,
      latestUpdatedAt: thread.updatedAt,
    });
  }

  const projects = Array.from(projectMap.entries())
    .sort((left, right) => right[1].latestUpdatedAt - left[1].latestUpdatedAt)
    .map(([id, project]) => ({
      id,
      label: project.label,
      detail: project.detail,
      count: project.count,
      loadedCount: project.loadedCount,
    }));

  return [
    {
      id: ALL_THREADS_PROJECT_ID,
      label: "All threads",
      detail: "Every visible provider thread",
      count: args.threads.length,
      loadedCount: args.loadedThreadIds.length,
    },
    ...projects,
  ];
}

function buildThreadsPath(mode: CodexThreadBrowserMode): string {
  const search = updateQueryParams(undefined, (nextSearchParams) => {
    setQueryParam(
      nextSearchParams,
      "archived",
      mode === "archived" ? "true" : "false",
    );
    setQueryParam(nextSearchParams, "limit", `${THREAD_LIST_LIMIT}`);
    setQueryParam(nextSearchParams, "sortKey", "updated_at");
  });

  return buildPathWithQuery({
    pathname: "/threads",
    search,
  });
}

export function CodexAppServerThreadBrowserResearchPage() {
  const [browserMode, setBrowserMode] =
    useState<CodexThreadBrowserMode>("active");
  const [threads, setThreads] = useState<CodexAppServerThread[]>([]);
  const [loadedThreadIds, setLoadedThreadIds] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(
    ALL_THREADS_PROJECT_ID,
  );
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThreadDetail, setSelectedThreadDetail] =
    useState<CodexAppServerThread | null>(null);
  const [detailState, setDetailState] = useState<CodexThreadBrowserDetailState>(
    {
      kind: "idle",
    },
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const selectedThreadRequestRef = useRef(0);

  const refreshThreads = useCallback(
    async (mode: CodexThreadBrowserMode = browserMode) => {
      const response = await requestJson<CodexAppServerThreadsResponse>({
        path: buildThreadsPath(mode),
      });
      setThreads(response.threads);
      return response;
    },
    [browserMode],
  );

  const refreshLoadedThreadIds = useCallback(async () => {
    const response = await requestJson<CodexAppServerLoadedThreadsResponse>({
      path: "/threads/loaded?limit=200",
    });
    setLoadedThreadIds(response.threadIds);
    return response;
  }, []);

  const selectedThreadSummary = useMemo(() => {
    if (!selectedThreadId) {
      return null;
    }

    return threads.find((thread) => thread.id === selectedThreadId) ?? null;
  }, [selectedThreadId, threads]);

  const filteredThreads = useMemo(() => {
    const trimmedSearch = searchTerm.trim().toLowerCase();
    return threads.filter((thread) => {
      if (
        selectedProjectId !== ALL_THREADS_PROJECT_ID &&
        thread.cwd !== selectedProjectId
      ) {
        return false;
      }

      if (trimmedSearch.length === 0) {
        return true;
      }

      const haystack = `${thread.name ?? ""}\n${thread.preview}`.toLowerCase();
      return haystack.includes(trimmedSearch);
    });
  }, [searchTerm, selectedProjectId, threads]);

  const projects = useMemo(
    () => buildProjects({ threads, loadedThreadIds }),
    [loadedThreadIds, threads],
  );

  useEffect(() => {
    if (projects.some((project) => project.id === selectedProjectId)) {
      return;
    }

    setSelectedProjectId(ALL_THREADS_PROJECT_ID);
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (
      selectedThreadId &&
      filteredThreads.some((thread) => thread.id === selectedThreadId)
    ) {
      return;
    }

    setSelectedThreadId(filteredThreads[0]?.id ?? null);
  }, [filteredThreads, selectedThreadId]);

  const refreshSelectedThread = useCallback(
    async (thread: CodexAppServerThread | null = selectedThreadSummary) => {
      const requestId = selectedThreadRequestRef.current + 1;
      selectedThreadRequestRef.current = requestId;

      if (!thread) {
        setSelectedThreadDetail(null);
        setDetailState({ kind: "idle" });
        return null;
      }

      if (threadIsArchived(thread)) {
        setSelectedThreadDetail(thread);
        setDetailState({
          kind: "archived",
          message:
            "Archived threads are moved into the provider's cold-storage directory. Unarchive before reading or resuming the full turn history.",
        });
        return null;
      }

      setSelectedThreadDetail(thread);
      setDetailState({ kind: "loading" });
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
        if (selectedThreadRequestRef.current === requestId) {
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
    async (mode: CodexThreadBrowserMode = browserMode) => {
      const [threadsResponse] = await Promise.all([
        refreshThreads(mode),
        refreshLoadedThreadIds(),
      ]);
      return threadsResponse;
    },
    [browserMode, refreshLoadedThreadIds, refreshThreads],
  );

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        await refreshAll(browserMode);
        if (!cancelled) {
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Failed to load Codex thread browser state.",
          );
        }
      }
    };

    void hydrate();
    const intervalId = window.setInterval(() => {
      void hydrate();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [browserMode, refreshAll]);

  useEffect(() => {
    void refreshSelectedThread(selectedThreadSummary);
  }, [refreshSelectedThread, selectedThreadSummary]);

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
      projects={projects}
      selectedProjectId={selectedProjectId}
      searchTerm={searchTerm}
      threads={filteredThreads}
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
      onProjectSelect={setSelectedProjectId}
      onSearchTermChange={setSearchTerm}
      onThreadSelect={setSelectedThreadId}
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
