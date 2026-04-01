import { useNow } from "@/hooks/useNow";
import {
  buildSearchString,
  setQueryParam,
  updateQueryParams,
} from "@/lib/queryParams";
import {
  codexThreadPathIsArchived,
  requestCodexAppServerJson,
  type CodexAppServerEventsResponse,
  type CodexAppServerLoadedThreadsResponse,
  type CodexAppServerRuntimeSnapshot,
  type CodexAppServerThread,
  type CodexAppServerThreadDetailResponse,
  type CodexAppServerThreadsResponse,
  CodexAppServerRequestError,
} from "@/lib/codexAppServerResearch";
import { dedupeMachineThreadsById } from "@/lib/machineThreadInventory";
import { MachinesWorkspaceView } from "@/components/MachinesWorkspaceView";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { resolveConnectedMachineStatus } from "../../shared/connectedMachinePresence";
import type { ConnectedMachineView } from "../../convex/connectedMachineModel";
import { api } from "../../convex/_generated/api";

const THREAD_LIST_LIMIT = 100;
const SELECTED_MACHINE_QUERY_PARAM = "machineId";
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

  return `/threads${buildSearchString(search)}`;
}

function readSelectedSearchValue(
  searchParams: URLSearchParams,
  name: string,
): string | null {
  const selectedValue = searchParams.get(name)?.trim();
  return selectedValue && selectedValue.length > 0 ? selectedValue : null;
}

function readMachineStatusReason(machine: ConnectedMachineView): string | null {
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

export function MachinesWorkspacePage() {
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
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(
    () => readSelectedSearchValue(searchParams, SELECTED_MACHINE_QUERY_PARAM),
  );
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() =>
    readSelectedSearchValue(searchParams, SELECTED_THREAD_QUERY_PARAM),
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

  const machines = useMemo(() => {
    if (connectedMachinesQuery === undefined) {
      return undefined;
    }

    return connectedMachinesQuery.map((machine) => ({
      ...machine,
      status: resolveConnectedMachineStatus({
        lastSeenAt: machine.lastSeenAt,
        now,
        status: machine.status,
      }),
    }));
  }, [connectedMachinesQuery, now]);

  const selectedMachine = useMemo(() => {
    if (machines === undefined) {
      return undefined;
    }

    if (machines.length === 0) {
      return null;
    }

    if (selectedMachineId === null) {
      return machines[0] ?? null;
    }

    return (
      machines.find((machine) => machine.machineId === selectedMachineId) ??
      null
    );
  }, [machines, selectedMachineId]);

  const selectedMachineStatusReason = selectedMachine
    ? readMachineStatusReason(selectedMachine)
    : null;
  const machineControlUrl =
    selectedMachine && selectedMachineStatusReason === null
      ? selectedMachine.controlUrl
      : null;

  const ensureMachineControlToken = useCallback(
    async (forceRefresh = false): Promise<string> => {
      if (!selectedMachineId) {
        throw new Error("Machines workspace is missing its selected machine.");
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

      const issuedToken = await issueMachineControlToken({
        machineId: selectedMachineId,
      });
      machineControlTokenRef.current = issuedToken;
      return issuedToken.token;
    },
    [issueMachineControlToken, selectedMachineId],
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

  const uniqueThreads = useMemo(
    () => dedupeMachineThreadsById(threads),
    [threads],
  );

  const selectedThreadSummary = useMemo(() => {
    if (!selectedThreadId) {
      return null;
    }

    return (
      uniqueThreads.find((thread) => thread.id === selectedThreadId) ?? null
    );
  }, [selectedThreadId, uniqueThreads]);

  const currentSearch = buildSearchString(searchParams);

  useEffect(() => {
    const nextSelectedMachineId = readSelectedSearchValue(
      searchParams,
      SELECTED_MACHINE_QUERY_PARAM,
    );
    setSelectedMachineId((current) =>
      current === nextSelectedMachineId ? current : nextSelectedMachineId,
    );
    const nextSelectedThreadId = readSelectedSearchValue(
      searchParams,
      SELECTED_THREAD_QUERY_PARAM,
    );
    setSelectedThreadId((current) =>
      current === nextSelectedThreadId ? current : nextSelectedThreadId,
    );
  }, [searchParams]);

  useEffect(() => {
    const nextSearchParams = updateQueryParams(searchParams, (nextParams) => {
      setQueryParam(
        nextParams,
        SELECTED_MACHINE_QUERY_PARAM,
        selectedMachineId,
      );
      setQueryParam(nextParams, SELECTED_THREAD_QUERY_PARAM, selectedThreadId);
    });
    const nextSearch = buildSearchString(nextSearchParams);
    if (nextSearch === currentSearch) {
      return;
    }

    setSearchParams(nextSearchParams, { replace: true });
  }, [
    currentSearch,
    searchParams,
    selectedMachineId,
    selectedThreadId,
    setSearchParams,
  ]);

  useEffect(() => {
    if (machines === undefined) {
      return;
    }

    const firstMachineId = machines[0]?.machineId ?? null;
    const hasSelectedMachine =
      selectedMachineId !== null &&
      machines.some((machine) => machine.machineId === selectedMachineId);

    if (machines.length === 0) {
      if (selectedMachineId !== null) {
        setSelectedMachineId(null);
      }
      return;
    }

    if (!hasSelectedMachine) {
      setSelectedMachineId(firstMachineId);
    }
  }, [machines, selectedMachineId]);

  useEffect(() => {
    nextEventCursorRef.current = 0;
    machineControlTokenRef.current = null;
    setThreads([]);
    setPinnedThreadIds([]);
    setLoadedThreadIds([]);
    setSelectedThreadDetail(null);
    setDetailState({ kind: "idle" });
    setHasLoadedThreadInventory(false);
    setError(null);
    setTurnDraft("");
  }, [selectedMachineId]);

  useEffect(() => {
    machineControlTokenRef.current = null;
  }, [machineControlUrl, selectedMachineId]);

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
            "Archived threads cannot be controlled from the machines workspace.",
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
    if (!selectedMachine || selectedMachineStatusReason !== null) {
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
            : "Failed to load machines workspace state.",
        );
      }
    };

    void hydrate();
  }, [
    refreshAll,
    refreshEvents,
    searchTerm,
    selectedMachine,
    selectedMachineStatusReason,
  ]);

  useEffect(() => {
    if (!selectedMachine || selectedMachineStatusReason !== null) {
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
    refreshSelectedThread,
    selectedMachine,
    selectedMachineStatusReason,
    selectedThreadDetail?.id,
    selectedThreadId,
    selectedThreadSummary,
  ]);

  useEffect(() => {
    if (!selectedMachine || selectedMachineStatusReason !== null) {
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
  }, [
    refreshAllRef,
    searchTerm,
    selectedMachine,
    selectedMachineStatusReason,
    selectedThreadId,
  ]);

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

  if (machines === undefined || selectedMachine === undefined) {
    return null;
  }

  return (
    <MachinesWorkspaceView
      machines={machines}
      selectedMachine={selectedMachine}
      selectedMachineStatusReason={selectedMachineStatusReason}
      threads={threads}
      pinnedThreadIds={pinnedThreadIds}
      loadedThreadIds={loadedThreadIds}
      selectedThreadId={selectedThreadId}
      selectedThread={selectedThreadDetail ?? selectedThreadSummary}
      detailState={detailState}
      searchTerm={searchTerm}
      turnDraft={turnDraft}
      errorMessage={error}
      isBusy={isBusy}
      relativeTimeReferenceMs={now}
      onMachineSelect={setSelectedMachineId}
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
  );
}
