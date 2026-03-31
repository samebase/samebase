import { CodexThreadBrowserView } from "@/components/CodexThreadBrowserView";
import { AppPageScrollShell } from "@/components/AppPageScrollShell";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/useNow";
import {
  CodexAppServerRequestError,
  codexThreadPathIsArchived,
  requestCodexAppServerJson,
  type CodexAppServerEventsResponse,
  type CodexAppServerLoadedThreadsResponse,
  type CodexAppServerRuntimeSnapshot,
  type CodexAppServerThread,
  type CodexAppServerThreadDetailResponse,
  type CodexAppServerThreadsResponse,
} from "@/lib/codexAppServerResearch";
import { MACHINE_CONNECT_ROUTE } from "@/lib/noterSync";
import {
  buildPathWithQuery,
  buildSearchString,
  setQueryParam,
  updateQueryParams,
} from "@/lib/queryParams";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { resolveConnectedMachineStatus } from "../../shared/connectedMachinePresence";
import type { ConnectedMachineView } from "../../convex/connectedMachineModel";
import { api } from "../../convex/_generated/api";

const THREAD_LIST_LIMIT = 100;
const SELECTED_THREAD_QUERY_PARAM = "threadId";
const ACTIVE_THREAD_REFRESH_INTERVAL_MS = 1_500;
const MACHINE_CONTROL_TOKEN_REFRESH_BUFFER_MS = 30_000;

type ThreadActionResponse = {
  result?: unknown;
  runtime: CodexAppServerRuntimeSnapshot;
};

type MachineControlTokenState = {
  expiresAt: number;
  token: string;
};

type MachineControlRequestArgs = {
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
};

type MachineThreadGroup = {
  id: string;
  label: string;
  detail: string;
  count: number;
  loadedCount: number;
  latestUpdatedAt: number;
  threads: CodexAppServerThread[];
};

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

function buildThreadGroups(args: {
  threads: CodexAppServerThread[];
  loadedThreadIds: string[];
}) {
  const groupMap = new Map<string, MachineThreadGroup>();

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
      id: thread.project.id,
      label: thread.project.label,
      detail: thread.project.rootCwd,
      count: 1,
      loadedCount: loadedCountDelta,
      latestUpdatedAt: thread.updatedAt,
      threads: [thread],
    });
  }

  return Array.from(groupMap.values())
    .sort((left, right) => right.latestUpdatedAt - left.latestUpdatedAt)
    .map((group) => ({
      count: group.count,
      detail: group.detail,
      id: group.id,
      label: group.label,
      loadedCount: group.loadedCount,
      threads: group.threads.sort(
        (left, right) => right.updatedAt - left.updatedAt,
      ),
    }));
}

function buildThreadsPath(searchTerm: string): string {
  const search = updateQueryParams(undefined, (nextSearchParams) => {
    setQueryParam(nextSearchParams, "archived", "false");
    setQueryParam(nextSearchParams, "limit", `${THREAD_LIST_LIMIT}`);
    setQueryParam(nextSearchParams, "sortKey", "updated_at");
    setQueryParam(
      nextSearchParams,
      "searchTerm",
      searchTerm.trim().length > 0 ? searchTerm.trim() : null,
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

function readMachineStatusReason(
  machine: ConnectedMachineView | null,
): string | null {
  if (!machine) {
    return "This connected machine is no longer available on your account.";
  }

  if (machine.status !== "online") {
    return "This machine is offline. Start `noter-sync run` on the machine first.";
  }

  if (machine.controlStatus === "starting") {
    return (
      machine.controlStatusDetail ??
      "Live control is still starting on this machine."
    );
  }

  if (machine.controlStatus === "unavailable") {
    return (
      machine.controlStatusDetail ??
      "Live control is unavailable for this machine right now."
    );
  }

  if (
    machine.controlStatus !== "ready" ||
    typeof machine.controlUrl !== "string" ||
    !machine.capabilities.includes("liveControl")
  ) {
    return "This machine is only publishing presence right now.";
  }

  return null;
}

function MachineLiveControlUnavailable(props: {
  description: string;
  machine: ConnectedMachineView | null;
}) {
  return (
    <div className="container my-auto max-w-3xl py-10">
      <section className="corner-notch-1 grid gap-4 border border-border bg-background p-6">
        <div className="grid gap-2">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Connected machine
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Live control unavailable
          </h1>
          <p className="text-sm text-muted-foreground">{props.description}</p>
        </div>
        {props.machine ? (
          <div className="grid gap-1 text-sm text-muted-foreground">
            <p>{props.machine.displayName}</p>
            <p>{props.machine.hostname}</p>
            <p>Connector {props.machine.connectorVersion}</p>
          </div>
        ) : null}
        <div>
          <Button asChild variant="outline">
            <Link to={MACHINE_CONNECT_ROUTE}>Back to machines</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

export function MachineLiveControlPage() {
  const params = useParams();
  const machineId = params.machineId?.trim() ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const now = useNow();
  const connectedMachinesQuery = useQuery(
    api.connectedMachines.listConnectedMachines,
    {},
  );
  const issueMachineControlToken = useMutation(
    api.connectedMachineControl.issueMachineControlToken,
  );
  const [threads, setThreads] = useState<CodexAppServerThread[]>([]);
  const [pinnedThreadIds, setPinnedThreadIds] = useState<string[]>([]);
  const [loadedThreadIds, setLoadedThreadIds] = useState<string[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() =>
    readSelectedThreadId(searchParams),
  );
  const [selectedThreadDetail, setSelectedThreadDetail] =
    useState<CodexAppServerThread | null>(null);
  const [detailState, setDetailState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "archived"; message: string }
    | { kind: "error"; message: string }
    | { kind: "ready" }
  >({
    kind: "idle",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [turnDraft, setTurnDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [hasLoadedThreadInventory, setHasLoadedThreadInventory] =
    useState(false);
  const selectedThreadRequestRef = useRef(0);
  const nextEventCursorRef = useRef(0);
  const machineControlTokenRef = useRef<MachineControlTokenState | null>(null);

  const machine = useMemo(() => {
    if (!machineId || connectedMachinesQuery === undefined) {
      return undefined;
    }

    const rawMachine =
      connectedMachinesQuery.find((item) => item.machineId === machineId) ??
      null;
    if (!rawMachine) {
      return null;
    }

    return {
      ...rawMachine,
      status: resolveConnectedMachineStatus({
        lastSeenAt: rawMachine.lastSeenAt,
        now,
        status: rawMachine.status,
      }),
    };
  }, [connectedMachinesQuery, machineId, now]);

  const machineStatusReason =
    machine === undefined ? null : readMachineStatusReason(machine);
  const machineControlUrl =
    machine && machineStatusReason === null ? machine.controlUrl : null;

  const ensureMachineControlToken = useCallback(
    async (forceRefresh = false): Promise<string> => {
      if (!machineId) {
        throw new Error(
          "Machine live control route is missing its machine id.",
        );
      }

      const nowMs = Date.now();
      const cachedToken = machineControlTokenRef.current;
      if (
        !forceRefresh &&
        cachedToken &&
        cachedToken.expiresAt - nowMs > MACHINE_CONTROL_TOKEN_REFRESH_BUFFER_MS
      ) {
        return cachedToken.token;
      }

      const issuedToken = await issueMachineControlToken({ machineId });
      machineControlTokenRef.current = issuedToken;
      return issuedToken.token;
    },
    [issueMachineControlToken, machineId],
  );

  const requestMachineControlJson = useCallback(
    async function requestMachineControlJsonInner<T>(
      args: MachineControlRequestArgs,
    ): Promise<T> {
      if (typeof machineControlUrl !== "string") {
        throw new Error("Machine live control URL is unavailable.");
      }

      const runRequest = async (forceRefresh: boolean) => {
        const token = await ensureMachineControlToken(forceRefresh);
        return requestCodexAppServerJson<T>({
          baseUrl: machineControlUrl,
          body: args.body,
          headers: {
            Authorization: `Bearer ${token}`,
          },
          method: args.method,
          path: args.path,
        });
      };

      try {
        return await runRequest(false);
      } catch (requestError) {
        if (
          requestError instanceof CodexAppServerRequestError &&
          requestError.status === 401
        ) {
          machineControlTokenRef.current = null;
          return runRequest(true);
        }

        throw requestError;
      }
    },
    [ensureMachineControlToken, machineControlUrl],
  );

  const refreshThreads = useCallback(
    async (term = searchTerm) => {
      const response =
        await requestMachineControlJson<CodexAppServerThreadsResponse>({
          path: buildThreadsPath(term),
        });
      setThreads(response.threads);
      setPinnedThreadIds(response.pinnedThreadIds);
      setHasLoadedThreadInventory(true);
      return response;
    },
    [requestMachineControlJson, searchTerm],
  );

  const refreshLoadedThreadIds = useCallback(async () => {
    const response =
      await requestMachineControlJson<CodexAppServerLoadedThreadsResponse>({
        path: "/threads/loaded?limit=200",
      });
    setLoadedThreadIds(Array.from(new Set(response.threadIds)));
    return response;
  }, [requestMachineControlJson]);

  const refreshEvents = useCallback(async () => {
    const response =
      await requestMachineControlJson<CodexAppServerEventsResponse>({
        path: `/events?since=${nextEventCursorRef.current}`,
      });
    nextEventCursorRef.current = response.nextCursor;
    return response;
  }, [requestMachineControlJson]);

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

  const pinnedThreads = useMemo(() => {
    const visibleThreadById = new Map(
      visibleThreads.map((thread) => [thread.id, thread]),
    );

    return pinnedThreadIds
      .map((threadId) => visibleThreadById.get(threadId) ?? null)
      .filter((thread): thread is CodexAppServerThread => thread !== null);
  }, [pinnedThreadIds, visibleThreads]);

  const unpinnedVisibleThreads = useMemo(() => {
    const pinnedThreadIdSet = new Set(pinnedThreadIds);
    return visibleThreads.filter((thread) => !pinnedThreadIdSet.has(thread.id));
  }, [pinnedThreadIds, visibleThreads]);

  const groups = useMemo(
    () =>
      buildThreadGroups({
        loadedThreadIds,
        threads: unpinnedVisibleThreads,
      }),
    [loadedThreadIds, unpinnedVisibleThreads],
  );

  const currentSearch = buildSearchString(searchParams);

  useEffect(() => {
    machineControlTokenRef.current = null;
  }, [machineControlUrl, machineId]);

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
            "Archived threads cannot be controlled from the machine live-control surface.",
        });
        return null;
      }

      if (!isSilent) {
        setSelectedThreadDetail(thread);
        setDetailState({ kind: "loading" });
      }

      try {
        const response =
          await requestMachineControlJson<CodexAppServerThreadDetailResponse>({
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
    [requestMachineControlJson, selectedThreadSummary],
  );

  const refreshAll = useCallback(
    async (term = searchTerm) => {
      const [threadsResponse] = await Promise.all([
        refreshThreads(term),
        refreshLoadedThreadIds(),
      ]);
      return threadsResponse;
    },
    [refreshLoadedThreadIds, refreshThreads, searchTerm],
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
    if (machineStatusReason !== null) {
      return;
    }

    const hydrate = async () => {
      try {
        await Promise.all([refreshAll(searchTerm), refreshEvents()]);
        setError(null);
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Failed to load machine live-control state.",
        );
      }
    };

    void hydrate();
  }, [machineStatusReason, refreshAll, refreshEvents, searchTerm]);

  useEffect(() => {
    if (machineStatusReason !== null) {
      return;
    }

    if (selectedThreadId === null) {
      void refreshSelectedThread(null);
      return;
    }

    const needsVisibleHydration =
      selectedThreadDetail?.id !== selectedThreadId ||
      detailState.kind === "idle";
    if (!needsVisibleHydration) {
      return;
    }

    void refreshSelectedThread(selectedThreadSummary);
  }, [
    detailState.kind,
    machineStatusReason,
    refreshSelectedThread,
    selectedThreadDetail?.id,
    selectedThreadId,
    selectedThreadSummary,
  ]);

  useEffect(() => {
    if (machineStatusReason !== null) {
      return;
    }

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

        const threadsResponse = await refreshAllRef.current(searchTerm);
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
        // Keep the last rendered browser state and let explicit actions surface
        // their own errors instead of replacing the current thread view on poll.
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
  }, [machineStatusReason, searchTerm, selectedThreadId]);

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

  if (!machineId) {
    return (
      <AppPageScrollShell>
        <MachineLiveControlUnavailable
          description="This route is missing the connected machine id."
          machine={null}
        />
      </AppPageScrollShell>
    );
  }

  if (machine === undefined) {
    return null;
  }

  if (machine === null) {
    return (
      <AppPageScrollShell>
        <MachineLiveControlUnavailable
          description="This connected machine is no longer available on your account."
          machine={null}
        />
      </AppPageScrollShell>
    );
  }

  if (machineStatusReason !== null) {
    return (
      <AppPageScrollShell>
        <MachineLiveControlUnavailable
          description={machineStatusReason}
          machine={machine}
        />
      </AppPageScrollShell>
    );
  }

  const readyMachine = machine;

  return (
    <AppPageScrollShell>
      <CodexThreadBrowserView
        allowArchivedMode={false}
        browserMode="active"
        detailState={detailState}
        errorMessage={error}
        fillViewport={false}
        groups={groups}
        headingDescription={`${readyMachine.hostname} · live control ready`}
        headingEyebrow="Connected machine"
        headingTitle={readyMachine.displayName}
        isBusy={isBusy}
        loadedThreadIds={loadedThreadIds}
        pinnedThreads={pinnedThreads}
        relativeTimeReferenceMs={now}
        searchTerm={searchTerm}
        selectedThread={selectedThreadDetail ?? selectedThreadSummary}
        selectedThreadId={selectedThreadId}
        turnDraft={turnDraft}
        onRefresh={() => {
          void runAction(async () => {
            const threadsResponse = await refreshAll(searchTerm);
            const refreshedThread =
              threadsResponse.threads.find(
                (thread) => thread.id === selectedThreadId,
              ) ?? null;
            await refreshSelectedThread(refreshedThread);
          });
        }}
        onSearchTermChange={setSearchTerm}
        onThreadSelect={setSelectedThreadId}
        onTurnDraftChange={setTurnDraft}
        onTurnSubmit={() => {
          if (!selectedThreadId || turnDraft.trim().length === 0) {
            return;
          }

          void runAction(async () => {
            await requestMachineControlJson<ThreadActionResponse>({
              body: {
                text: turnDraft.trim(),
                threadId: selectedThreadId,
              },
              method: "POST",
              path: "/turn/start",
            });
            setTurnDraft("");
            const threadsResponse = await refreshAll(searchTerm);
            const refreshedThread =
              threadsResponse.threads.find(
                (thread) => thread.id === selectedThreadId,
              ) ?? null;
            await refreshSelectedThread(refreshedThread);
          });
        }}
      />
    </AppPageScrollShell>
  );
}
