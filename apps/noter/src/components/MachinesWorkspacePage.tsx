import { useNow } from "@/hooks/useNow";
import {
  CodexAppServerRequestError,
  requestCodexAppServerJson,
  type CodexAppServerPinnedThreadsResponse,
  type CodexAppServerRuntimeSnapshot,
  type CodexAppServerThread,
  type CodexAppServerThreadDetailResponse,
  type CodexAppServerThreadsResponse,
} from "@/lib/codexAppServerResearch";
import {
  buildSearchString,
  setQueryParam,
  updateQueryParams,
} from "@/lib/queryParams";
import { MachinesWorkspaceView } from "@/components/MachinesWorkspaceView";
import { MachinesWorkspaceV2View } from "@/components/MachinesWorkspaceV2View";
import type { MachinesWorkspaceSidebarInventory } from "@/lib/machinesWorkspaceSidebar";
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

type MachineControlRequestArgs = {
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
};

type ThreadActionResponse = {
  result?: unknown;
  runtime: CodexAppServerRuntimeSnapshot;
};

type MachineThreadInventoryState = {
  hasLoadedThreadInventory: boolean;
  pinnedThreadIds: string[];
  threads: CodexAppServerThread[];
};

const EMPTY_MACHINE_THREAD_INVENTORY_STATE: MachineThreadInventoryState = {
  hasLoadedThreadInventory: false,
  pinnedThreadIds: [],
  threads: [],
};

/** Keep the thread list request aligned with the existing Codex sidebar sort order. */
function buildThreadsPath(): string {
  const search = updateQueryParams(undefined, (nextSearchParams) => {
    setQueryParam(nextSearchParams, "archived", "false");
    setQueryParam(nextSearchParams, "limit", `${THREAD_LIST_LIMIT}`);
    setQueryParam(nextSearchParams, "sortKey", "updated_at");
  });

  return `/threads${buildSearchString(search)}`;
}

/** Treat blank query params as unset so URL edits do not create phantom selections. */
function readSelectedSearchValue(
  searchParams: URLSearchParams,
  name: string,
): string | null {
  const selectedValue = searchParams.get(name)?.trim();
  return selectedValue && selectedValue.length > 0 ? selectedValue : null;
}

/** Explain why a connected machine still cannot be used as an interactive Codex host. */
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

/** Default the route to the first interactive machine, then fall back to any machine. */
function readPreferredMachineId(
  machines: ConnectedMachineView[],
): string | null {
  const readyMachine = machines.find(
    (machine) => readMachineStatusReason(machine) === null,
  );
  if (readyMachine) {
    return readyMachine.machineId;
  }

  if (machines.length === 0) {
    return null;
  }

  return machines[0].machineId;
}

function buildMachineThreadKey(machineId: string, threadId: string): string {
  return `${machineId}\u0000${threadId}`;
}

/** Coordinate machine-scoped inventory polling with the selected-thread detail pane. */
function MachinesWorkspacePageContent(props: {
  layoutVersion: "legacy" | "v2";
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const now = useNow();
  const connectedMachinesQuery = useQuery(
    api.connectedMachines.listConnectedMachines,
    {},
  );
  const issueMachineControlToken = useMutation(
    api.connectedMachineControl.issueMachineControlToken,
  );
  const [machineThreadInventories, setMachineThreadInventories] = useState<
    Record<string, MachineThreadInventoryState>
  >({});
  const [selectedThreadDetail, setSelectedThreadDetail] =
    useState<CodexAppServerThread | null>(null);
  const [selectedThreadError, setSelectedThreadError] = useState<string | null>(
    null,
  );
  const [isSelectedThreadLoading, setIsSelectedThreadLoading] = useState(false);
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [pendingPinThreadKey, setPendingPinThreadKey] = useState<string | null>(
    null,
  );
  const [turnDraft, setTurnDraft] = useState("");
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(
    () => readSelectedSearchValue(searchParams, SELECTED_MACHINE_QUERY_PARAM),
  );
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() =>
    readSelectedSearchValue(searchParams, SELECTED_THREAD_QUERY_PARAM),
  );
  const machineControlTokensRef = useRef<
    Partial<Record<string, MachineControlTokenState>>
  >({});
  const activePinRequestIdRef = useRef(0);
  const activeTurnSubmissionIdRef = useRef(0);
  const latestSelectedMachineControlIdRef = useRef<string | null>(null);

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
  const selectedMachineInteractionBlockedReason =
    selectedMachineStatusReason ??
    (selectedMachine === null
      ? "Connect a machine to start or continue a Codex thread."
      : null);
  const currentSearch = buildSearchString(searchParams);
  const selectedMachineInventory =
    selectedMachineId === null
      ? EMPTY_MACHINE_THREAD_INVENTORY_STATE
      : machineThreadInventories[selectedMachineId] ??
        EMPTY_MACHINE_THREAD_INVENTORY_STATE;
  const selectedThreadSummary = useMemo(
    () =>
      selectedThreadId
        ? selectedMachineInventory.threads.find(
            (thread) => thread.id === selectedThreadId,
          ) ?? null
        : null,
    [selectedMachineInventory.threads, selectedThreadId],
  );
  const selectedThread =
    selectedThreadDetail?.id === selectedThreadId
      ? selectedThreadDetail
      : selectedThreadSummary;

  const ensureMachineControlToken = useCallback(
    async (machineId: string, forceRefresh = false): Promise<string> => {
      const nowMs = Date.now();
      const cachedToken = machineControlTokensRef.current[machineId];
      if (
        !forceRefresh &&
        cachedToken &&
        cachedToken.expiresAt - nowMs > MACHINE_CONTROL_TOKEN_REFRESH_BUFFER_MS
      ) {
        return cachedToken.token;
      }

      const issuedToken = await issueMachineControlToken({
        machineId,
      });
      machineControlTokensRef.current[machineId] = issuedToken;
      return issuedToken.token;
    },
    [issueMachineControlToken],
  );

  const requestMachineControlJson = useCallback(
    /** Retry once with a fresh token because machine-control tokens are short-lived. */
    async function requestMachineControlJsonInner<T>(
      machine: ConnectedMachineView,
      args: MachineControlRequestArgs,
    ): Promise<T> {
      if (typeof machine.controlUrl !== "string") {
        throw new Error("Machine live control URL is unavailable.");
      }

      const runRequest = async (forceRefresh: boolean) => {
        const token = await ensureMachineControlToken(
          machine.machineId,
          forceRefresh,
        );
        return requestCodexAppServerJson<T>({
          baseUrl: machine.controlUrl,
          body: args.body,
          headers: {
            Authorization: `Bearer ${token}`,
          },
          method: args.method ?? "GET",
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
          delete machineControlTokensRef.current[machine.machineId];
          return runRequest(true);
        }

        throw requestError;
      }
    },
    [ensureMachineControlToken],
  );

  /**
   * Keep the network request separate from state writes so the polling effect
   * can ignore slow responses after the selected machine changes.
   */
  const refreshThreads = useCallback(
    (machine: ConnectedMachineView) =>
      requestMachineControlJson<CodexAppServerThreadsResponse>(machine, {
        path: buildThreadsPath(),
      }),
    [requestMachineControlJson],
  );
  const refreshSelectedThread = useCallback(
    (machine: ConnectedMachineView, threadId: string) =>
      requestMachineControlJson<CodexAppServerThreadDetailResponse>(machine, {
        path: `/threads/${encodeURIComponent(threadId)}`,
      }),
    [requestMachineControlJson],
  );
  const applyThreadInventory = useCallback(
    (machineId: string, response: CodexAppServerThreadsResponse) => {
      setMachineThreadInventories((current) => ({
        ...current,
        [machineId]: {
          hasLoadedThreadInventory: true,
          pinnedThreadIds: response.pinnedThreadIds,
          threads: response.threads,
        },
      }));
    },
    [],
  );

  useEffect(() => {
    latestSelectedMachineControlIdRef.current = selectedMachineControlId;
  }, [selectedMachineControlId]);

  useEffect(() => {
    if (machines === undefined) {
      return;
    }

    const validMachineIds = new Set(
      machines.map((machine) => machine.machineId),
    );
    setMachineThreadInventories((current) => {
      const nextEntries = Object.entries(current).filter(([machineId]) =>
        validMachineIds.has(machineId),
      );
      if (nextEntries.length === Object.keys(current).length) {
        return current;
      }

      return Object.fromEntries(nextEntries);
    });

    for (const machineId of Object.keys(machineControlTokensRef.current)) {
      if (!validMachineIds.has(machineId)) {
        delete machineControlTokensRef.current[machineId];
      }
    }
  }, [machines]);

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
      setSelectedMachineId(readPreferredMachineId(machines));
    }
  }, [machines, selectedMachineId]);

  useEffect(() => {
    activePinRequestIdRef.current += 1;
    activeTurnSubmissionIdRef.current += 1;
    setSelectedThreadDetail(null);
    setSelectedThreadError(null);
    setIsSelectedThreadLoading(false);
    setIsSubmittingTurn(false);
    setPendingPinThreadKey(null);
    setTurnDraft("");
  }, [selectedMachineId]);

  useEffect(() => {
    if (machines === undefined) {
      return;
    }

    const inventoryMachines = machines.filter(
      (machine) => readMachineStatusReason(machine) === null,
    );
    if (inventoryMachines.length === 0) {
      return;
    }

    let didCancel = () => false;
    const inFlightMachineIds = new Set<string>();

    const hydrateMachine = async (machine: ConnectedMachineView) => {
      if (didCancel() || inFlightMachineIds.has(machine.machineId)) {
        return;
      }

      inFlightMachineIds.add(machine.machineId);
      try {
        const response = await refreshThreads(machine);
        if (didCancel()) {
          return;
        }

        applyThreadInventory(machine.machineId, response);
      } catch {
        if (didCancel()) {
          return;
        }

        /**
         * Polling can race tunnel hiccups, so keep the last successful sidebar
         * inventory instead of flashing the thread rail empty between retries.
         */
        setMachineThreadInventories((current) => {
          const existing =
            current[machine.machineId] ?? EMPTY_MACHINE_THREAD_INVENTORY_STATE;
          if (existing.hasLoadedThreadInventory) {
            return current;
          }

          return {
            ...current,
            [machine.machineId]: {
              ...existing,
              hasLoadedThreadInventory: true,
            },
          };
        });
      } finally {
        inFlightMachineIds.delete(machine.machineId);
      }
    };

    const hydrate = () =>
      Promise.all(inventoryMachines.map((machine) => hydrateMachine(machine)));

    void hydrate();
    const intervalId = window.setInterval(() => {
      void hydrate();
    }, THREAD_REFRESH_INTERVAL_MS);

    return () => {
      didCancel = () => true;
      window.clearInterval(intervalId);
    };
  }, [applyThreadInventory, machines, refreshThreads]);

  useEffect(() => {
    if (
      selectedMachine === undefined ||
      selectedMachine === null ||
      selectedMachineStatusReason !== null ||
      selectedThreadId === null
    ) {
      setSelectedThreadDetail(null);
      setSelectedThreadError(null);
      setIsSelectedThreadLoading(false);
      return;
    }

    let didCancel = () => false;
    let inFlight = false;

    const hydrate = async () => {
      if (didCancel() || inFlight) {
        return;
      }

      inFlight = true;
      setIsSelectedThreadLoading(true);
      try {
        const response = await refreshSelectedThread(
          selectedMachine,
          selectedThreadId,
        );
        if (didCancel()) {
          return;
        }

        setSelectedThreadDetail(response.thread);
        setSelectedThreadError(null);
      } catch (error) {
        if (didCancel()) {
          return;
        }

        setSelectedThreadError(
          error instanceof Error
            ? error.message
            : "Failed to load the selected thread.",
        );
      } finally {
        if (!didCancel()) {
          setIsSelectedThreadLoading(false);
        }
        inFlight = false;
      }
    };

    void hydrate();
    const intervalId = window.setInterval(() => {
      void hydrate();
    }, THREAD_REFRESH_INTERVAL_MS);

    return () => {
      didCancel = () => true;
      window.clearInterval(intervalId);
    };
  }, [
    refreshSelectedThread,
    selectedMachine,
    selectedMachineStatusReason,
    selectedThreadId,
  ]);

  useEffect(() => {
    if (!selectedMachineInventory.hasLoadedThreadInventory) {
      return;
    }

    const nextSelectedThreadId =
      selectedThreadId &&
      selectedMachineInventory.threads.some(
        (thread) => thread.id === selectedThreadId,
      )
        ? selectedThreadId
        : selectedMachineInventory.threads[0]?.id ?? null;

    if (nextSelectedThreadId !== selectedThreadId) {
      setSelectedThreadId(nextSelectedThreadId);
    }
  }, [selectedMachineInventory, selectedThreadId]);

  useEffect(() => {
    setTurnDraft("");
  }, [selectedThreadId]);

  const handleThreadPinChange = useCallback(
    ({
      machineId,
      nextPinned,
      threadId,
    }: {
      machineId: string;
      nextPinned: boolean;
      threadId: string;
    }) => {
      const pinMachine =
        machines?.find((machine) => machine.machineId === machineId) ?? null;
      if (pinMachine === null || readMachineStatusReason(pinMachine) !== null) {
        return;
      }

      activePinRequestIdRef.current += 1;
      const pinRequestId = activePinRequestIdRef.current;
      const pinThreadKey = buildMachineThreadKey(machineId, threadId);
      setPendingPinThreadKey(pinThreadKey);
      setSelectedThreadError(null);

      void (async () => {
        const pinRequestIsStale = () =>
          activePinRequestIdRef.current !== pinRequestId;

        try {
          const response =
            await requestMachineControlJson<CodexAppServerPinnedThreadsResponse>(
              pinMachine,
              {
                body: {
                  threadId,
                },
                method: "POST",
                path: nextPinned ? "/thread/pin" : "/thread/unpin",
              },
            );
          if (pinRequestIsStale()) {
            return;
          }

          setMachineThreadInventories((current) => {
            const existing =
              current[machineId] ?? EMPTY_MACHINE_THREAD_INVENTORY_STATE;
            return {
              ...current,
              [machineId]: {
                ...existing,
                hasLoadedThreadInventory: true,
                pinnedThreadIds: response.pinnedThreadIds,
              },
            };
          });

          try {
            const threadsResponse = await refreshThreads(pinMachine);
            if (!pinRequestIsStale()) {
              applyThreadInventory(machineId, threadsResponse);
            }
          } catch {
            if (!pinRequestIsStale()) {
              setSelectedThreadError(
                `Thread ${nextPinned ? "pinned" : "unpinned"}, but the thread list did not refresh. It should settle on the next poll.`,
              );
            }
          }
        } catch (error) {
          if (!pinRequestIsStale()) {
            setSelectedThreadError(
              error instanceof Error
                ? error.message
                : `Failed to ${nextPinned ? "pin" : "unpin"} the selected thread.`,
            );
          }
        } finally {
          if (!pinRequestIsStale()) {
            setPendingPinThreadKey((current) =>
              current === pinThreadKey ? null : current,
            );
          }
        }
      })();
    },
    [applyThreadInventory, machines, refreshThreads, requestMachineControlJson],
  );

  const handleTurnSubmit = useCallback(() => {
    const prompt = turnDraft.trim();
    const submitMachine = selectedMachine;
    if (
      prompt.length === 0 ||
      isSubmittingTurn ||
      submitMachine === undefined ||
      submitMachine === null ||
      selectedMachineControlId === null ||
      selectedMachineInteractionBlockedReason !== null
    ) {
      return;
    }

    activeTurnSubmissionIdRef.current += 1;
    const submissionId = activeTurnSubmissionIdRef.current;
    const submitMachineControlId = selectedMachineControlId;
    setIsSubmittingTurn(true);
    setSelectedThreadError(null);
    setTurnDraft("");

    void (async () => {
      const submissionIsStale = () =>
        activeTurnSubmissionIdRef.current !== submissionId ||
        latestSelectedMachineControlIdRef.current !== submitMachineControlId;

      try {
        const targetThreadId = selectedThreadId;
        const response = await requestMachineControlJson<ThreadActionResponse>(
          submitMachine,
          {
            body: {
              text: prompt,
              threadId: targetThreadId ?? undefined,
            },
            method: "POST",
            path: "/turn/start",
          },
        );
        const nextThreadId = targetThreadId ?? response.runtime.currentThreadId;
        if (submissionIsStale()) {
          return;
        }

        if (nextThreadId) {
          setSelectedThreadId(nextThreadId);
        }

        try {
          const threadsResponse = await refreshThreads(submitMachine);
          if (submissionIsStale()) {
            return;
          }

          applyThreadInventory(submitMachine.machineId, threadsResponse);
        } catch {
          if (!submissionIsStale()) {
            setSelectedThreadError(
              "Prompt sent, but the thread list did not refresh. It should appear after the next poll.",
            );
          }
        }

        if (nextThreadId) {
          try {
            const detailResponse = await refreshSelectedThread(
              submitMachine,
              nextThreadId,
            );
            if (submissionIsStale()) {
              return;
            }

            setSelectedThreadDetail(detailResponse.thread);
            setSelectedThreadError(null);
          } catch {
            if (!submissionIsStale()) {
              setSelectedThreadError(
                "Prompt sent, but the selected thread did not refresh. It should appear after the next poll.",
              );
            }
          }
        }
      } catch (error) {
        if (submissionIsStale()) {
          return;
        }

        setTurnDraft(prompt);
        setSelectedThreadError(
          error instanceof Error
            ? error.message
            : "Failed to send the prompt to the selected machine.",
        );
      } finally {
        if (!submissionIsStale()) {
          setIsSubmittingTurn(false);
        }
      }
    })();
  }, [
    applyThreadInventory,
    isSubmittingTurn,
    refreshSelectedThread,
    refreshThreads,
    requestMachineControlJson,
    selectedMachine,
    selectedMachineControlId,
    selectedMachineInteractionBlockedReason,
    selectedThreadId,
    turnDraft,
  ]);

  if (machines === undefined || selectedMachine === undefined) {
    return null;
  }

  const machineInventories: MachinesWorkspaceSidebarInventory[] = machines.map(
    (machine) => {
      const inventory =
        machineThreadInventories[machine.machineId] ??
        EMPTY_MACHINE_THREAD_INVENTORY_STATE;
      return {
        hasLoadedThreadInventory: inventory.hasLoadedThreadInventory,
        machineDisplayName: machine.displayName,
        machineHostname: machine.hostname,
        machineId: machine.machineId,
        machineStatus: machine.status,
        machineStatusReason: readMachineStatusReason(machine),
        pinnedThreadIds: inventory.pinnedThreadIds,
        threads: inventory.threads,
      };
    },
  );

  const ViewComponent =
    props.layoutVersion === "v2"
      ? MachinesWorkspaceV2View
      : MachinesWorkspaceView;

  return (
    <ViewComponent
      machineInventories={machineInventories}
      isSubmittingTurn={isSubmittingTurn}
      pendingPinThreadKey={pendingPinThreadKey}
      selectedMachineId={selectedMachineId}
      selectedMachineDisplayName={selectedMachine?.displayName ?? null}
      selectedMachineHostname={selectedMachine?.hostname ?? null}
      selectedMachineStatusReason={selectedMachineInteractionBlockedReason}
      selectedThread={selectedThread}
      selectedThreadError={selectedThreadError}
      selectedThreadLoading={isSelectedThreadLoading}
      selectedThreadId={selectedThreadId}
      relativeTimeReferenceMs={now}
      turnDraft={turnDraft}
      onTurnDraftChange={setTurnDraft}
      onTurnSubmit={handleTurnSubmit}
      onThreadPinChange={handleThreadPinChange}
      onThreadSelect={({ machineId, threadId }) => {
        setSelectedMachineId(machineId);
        setSelectedThreadId(threadId);
      }}
    />
  );
}

export function MachinesWorkspacePage() {
  return <MachinesWorkspacePageContent layoutVersion="legacy" />;
}

export function MachinesWorkspaceV2Page() {
  return <MachinesWorkspacePageContent layoutVersion="v2" />;
}
