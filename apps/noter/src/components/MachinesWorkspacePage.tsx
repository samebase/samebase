import { useNow } from "@/hooks/useNow";
import {
  CodexAppServerRequestError,
  requestCodexAppServerJson,
  type CodexAppServerThread,
  type CodexAppServerThreadsResponse,
} from "@/lib/codexAppServerResearch";
import {
  buildSearchString,
  setQueryParam,
  updateQueryParams,
} from "@/lib/queryParams";
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
const THREAD_REFRESH_INTERVAL_MS = 1_500;
const MACHINE_CONTROL_TOKEN_REFRESH_BUFFER_MS = 30_000;

type MachineControlTokenState = {
  expiresAt: number;
  token: string;
};

function buildThreadsPath(): string {
  const search = updateQueryParams(undefined, (nextSearchParams) => {
    setQueryParam(nextSearchParams, "archived", "false");
    setQueryParam(nextSearchParams, "limit", `${THREAD_LIST_LIMIT}`);
    setQueryParam(nextSearchParams, "sortKey", "updated_at");
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
  const [hasLoadedThreadInventory, setHasLoadedThreadInventory] =
    useState(false);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(
    () => readSelectedSearchValue(searchParams, SELECTED_MACHINE_QUERY_PARAM),
  );
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() =>
    readSelectedSearchValue(searchParams, SELECTED_THREAD_QUERY_PARAM),
  );
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
      return null;
    }

    return (
      machines.find((machine) => machine.machineId === selectedMachineId) ??
      null
    );
  }, [machines, selectedMachineId]);

  const selectedMachineStatusReason = selectedMachine
    ? readMachineStatusReason(selectedMachine)
    : null;
  const selectedMachineControlId = selectedMachine?.machineId ?? null;
  const machineControlUrl =
    selectedMachine && selectedMachineStatusReason === null
      ? selectedMachine.controlUrl
      : null;
  const currentSearch = buildSearchString(searchParams);

  const ensureMachineControlToken = useCallback(
    async (forceRefresh = false): Promise<string> => {
      if (!selectedMachineControlId) {
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
        machineId: selectedMachineControlId,
      });
      machineControlTokenRef.current = issuedToken;
      return issuedToken.token;
    },
    [issueMachineControlToken, selectedMachineControlId],
  );

  const requestMachineControlJson = useCallback(
    async function requestMachineControlJsonInner<T>(path: string): Promise<T> {
      if (typeof machineControlUrl !== "string") {
        throw new Error("Machine live control URL is unavailable.");
      }

      const runRequest = async (forceRefresh: boolean) => {
        const token = await ensureMachineControlToken(forceRefresh);
        return requestCodexAppServerJson<T>({
          baseUrl: machineControlUrl,
          headers: {
            Authorization: `Bearer ${token}`,
          },
          method: "GET",
          path,
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

  const refreshThreads = useCallback(async () => {
    const response =
      await requestMachineControlJson<CodexAppServerThreadsResponse>(
        buildThreadsPath(),
      );
    setThreads(response.threads);
    setPinnedThreadIds(response.pinnedThreadIds);
    setHasLoadedThreadInventory(true);
    return response;
  }, [requestMachineControlJson]);

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
    machineControlTokenRef.current = null;
    setThreads([]);
    setPinnedThreadIds([]);
    setHasLoadedThreadInventory(false);
  }, [selectedMachineId]);

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
        await refreshThreads();
      } catch {
        setThreads([]);
        setPinnedThreadIds([]);
        setHasLoadedThreadInventory(true);
      } finally {
        inFlight = false;
      }
    };

    void hydrate();
    const intervalId = window.setInterval(() => {
      void hydrate();
    }, THREAD_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [refreshThreads, selectedMachine, selectedMachineStatusReason]);

  useEffect(() => {
    if (!hasLoadedThreadInventory) {
      return;
    }

    const nextSelectedThreadId =
      selectedThreadId &&
      threads.some((thread) => thread.id === selectedThreadId)
        ? selectedThreadId
        : threads[0]?.id ?? null;

    if (nextSelectedThreadId !== selectedThreadId) {
      setSelectedThreadId(nextSelectedThreadId);
    }
  }, [hasLoadedThreadInventory, selectedThreadId, threads]);

  if (machines === undefined || selectedMachine === undefined) {
    return null;
  }

  return (
    <MachinesWorkspaceView
      threads={threads}
      pinnedThreadIds={pinnedThreadIds}
      selectedThreadId={selectedThreadId}
      relativeTimeReferenceMs={now}
      onThreadSelect={setSelectedThreadId}
    />
  );
}
