import { useNow } from "@/hooks/useNow";
import { PersistedSidebarProvider } from "@/components/PersistedSidebarProvider";
import { SidebarHomeAccountHeader } from "@/components/SidebarHomeAccountHeader";
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
import {
  startedDraftConversationThreadMatches,
  type MachinesWorkspaceProjectConversationSelection,
} from "@/lib/machinesWorkspaceConversation";
import {
  MACHINES_WORKSPACE_LEFT_SIDEBAR_MOBILE_WIDTH_PX,
  MACHINES_WORKSPACE_LEFT_SIDEBAR_WIDTH_PX,
  MachinesWorkspaceView,
} from "@/components/MachinesWorkspaceView";
import type { MachinesWorkspaceSidebarInventory } from "@/lib/machinesWorkspaceSidebar";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "@/lib/workspacePaneSizes";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";
import { resolveConnectedMachineStatus } from "../../shared/connectedMachinePresence";
import type { ConnectedMachineView } from "../../convex/connectedMachineModel";
import { api } from "../../convex/_generated/api";

const THREAD_LIST_LIMIT = 100;
const SELECTED_MACHINE_QUERY_PARAM = "machineId";
const SELECTED_THREAD_QUERY_PARAM = "threadId";
const THREAD_REFRESH_INTERVAL_MS = 1_500;
const MACHINE_CONTROL_TOKEN_REFRESH_BUFFER_MS = 30_000;
const MACHINES_WORKSPACE_SIDEBAR_DEFAULT_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: MACHINES_WORKSPACE_LEFT_SIDEBAR_WIDTH_PX,
  leftMobileWidthPx: MACHINES_WORKSPACE_LEFT_SIDEBAR_MOBILE_WIDTH_PX,
  mobilePane: "main",
  rightDesktopOpen: false,
  rightDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  rightMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
} satisfies WorkspaceSidebarState;

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

type WorktreeCreateResponse = {
  worktree: {
    branch: string;
    cwd: string;
  };
};

type MachineThreadInventoryState = {
  hasLoadedThreadInventory: boolean;
  pinnedThreadIds: string[];
  threads: CodexAppServerThread[];
};

type PendingStartedThreadSelection = {
  machineId: string;
  threadId: string;
};

type PendingDraftConversation =
  MachinesWorkspaceProjectConversationSelection & {
    preparedWorktreeBranch: string | null;
    preparedWorktreeCwd: string | null;
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
export function MachinesWorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const now = useNow();
  const user = useQuery(api.users.viewer);
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
  const [pendingStartedThreadSelection, setPendingStartedThreadSelection] =
    useState<PendingStartedThreadSelection | null>(null);
  const [pendingDraftConversation, setPendingDraftConversation] =
    useState<PendingDraftConversation | null>(null);
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
  const userDisplayName =
    user?.name ??
    user?.email ??
    user?.githubUsername ??
    (user ? "Account" : null);
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
  const selectedThreadIsPendingStart =
    pendingStartedThreadSelection?.machineId === selectedMachineId &&
    pendingStartedThreadSelection.threadId === selectedThreadId;
  const selectedPendingConversation =
    pendingDraftConversation?.machineId === selectedMachineId &&
    selectedThreadId === null
      ? pendingDraftConversation
      : null;
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
    if (pendingStartedThreadSelection === null) {
      return;
    }

    if (
      selectedMachineId !== pendingStartedThreadSelection.machineId ||
      selectedThreadId !== pendingStartedThreadSelection.threadId
    ) {
      setPendingStartedThreadSelection(null);
      return;
    }

    if (selectedThreadDetail?.id === pendingStartedThreadSelection.threadId) {
      setPendingStartedThreadSelection(null);
    }
  }, [
    pendingStartedThreadSelection,
    selectedMachineId,
    selectedThreadDetail?.id,
    selectedThreadId,
  ]);

  useEffect(() => {
    if (pendingDraftConversation === null) {
      return;
    }

    if (
      selectedMachineId !== pendingDraftConversation.machineId ||
      selectedThreadId !== null
    ) {
      setPendingDraftConversation(null);
    }
  }, [pendingDraftConversation, selectedMachineId, selectedThreadId]);

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

    if (selectedThreadIsPendingStart) {
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
    selectedThreadIsPendingStart,
  ]);

  useEffect(() => {
    if (!selectedMachineInventory.hasLoadedThreadInventory) {
      return;
    }

    const nextSelectedThreadId =
      selectedThreadId &&
      (selectedThreadIsPendingStart ||
        selectedMachineInventory.threads.some(
          (thread) => thread.id === selectedThreadId,
        ))
        ? selectedThreadId
        : selectedPendingConversation !== null
          ? null
          : selectedMachineInventory.threads[0]?.id ?? null;

    if (nextSelectedThreadId !== selectedThreadId) {
      setSelectedThreadId(nextSelectedThreadId);
    }
  }, [
    selectedPendingConversation,
    selectedMachineInventory,
    selectedThreadId,
    selectedThreadIsPendingStart,
  ]);

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
    const draftConversation =
      pendingDraftConversation?.machineId === selectedMachineId &&
      selectedThreadId === null
        ? pendingDraftConversation
        : null;
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
        let targetThreadId = selectedThreadId;
        let newlyStartedThreadId: string | null = null;
        if (draftConversation !== null) {
          let targetCwd = draftConversation.projectRootCwd;
          let preparedWorktreeBranch = draftConversation.preparedWorktreeBranch;
          let preparedWorktreeCwd = draftConversation.preparedWorktreeCwd;

          if (
            draftConversation.envMode === "worktree" &&
            preparedWorktreeCwd === null
          ) {
            const worktreeResponse =
              await requestMachineControlJson<WorktreeCreateResponse>(
                submitMachine,
                {
                  body: {
                    cwd: draftConversation.projectRootCwd,
                  },
                  method: "POST",
                  path: "/worktree/create",
                },
              );
            preparedWorktreeBranch = worktreeResponse.worktree.branch;
            preparedWorktreeCwd = worktreeResponse.worktree.cwd;
            targetCwd = preparedWorktreeCwd;

            if (submissionIsStale()) {
              return;
            }

            setPendingDraftConversation((current) => {
              if (
                current === null ||
                current.machineId !== draftConversation.machineId ||
                current.projectId !== draftConversation.projectId ||
                current.envMode !== draftConversation.envMode
              ) {
                return current;
              }

              return {
                ...current,
                preparedWorktreeBranch,
                preparedWorktreeCwd,
              };
            });
          } else if (preparedWorktreeCwd !== null) {
            targetCwd = preparedWorktreeCwd;
          }

          const threadStartResponse =
            await requestMachineControlJson<ThreadActionResponse>(
              submitMachine,
              {
                body: {
                  cwd: targetCwd,
                },
                method: "POST",
                path: "/thread/start",
              },
            );
          const startedThreadId = threadStartResponse.runtime.currentThreadId;
          if (!startedThreadId) {
            throw new Error("Machine did not return a new thread id.");
          }

          if (submissionIsStale()) {
            return;
          }

          setPendingDraftConversation(null);
          newlyStartedThreadId = startedThreadId;
          setPendingStartedThreadSelection({
            machineId: submitMachine.machineId,
            threadId: startedThreadId,
          });
          setSelectedThreadId(startedThreadId);
          setSelectedThreadDetail(null);
          setIsSelectedThreadLoading(false);
          targetThreadId = startedThreadId;
        }

        if (targetThreadId === null) {
          throw new Error(
            "Select a thread or use a project's plus button to start a new conversation.",
          );
        }

        await requestMachineControlJson<ThreadActionResponse>(submitMachine, {
          body: {
            text: prompt,
            threadId: targetThreadId,
          },
          method: "POST",
          path: "/turn/start",
        });
        const nextThreadId = targetThreadId;
        if (submissionIsStale()) {
          return;
        }

        if (nextThreadId) {
          setSelectedThreadId(nextThreadId);
        }
        // Clear the pending-start guard as soon as the first prompt is accepted
        // so normal selected-thread polling can recover from transient reads.
        if (
          startedDraftConversationThreadMatches({
            nextThreadId,
            startedThreadId: newlyStartedThreadId,
          })
        ) {
          setPendingStartedThreadSelection(null);
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
    pendingDraftConversation,
    refreshSelectedThread,
    refreshThreads,
    requestMachineControlJson,
    selectedMachine,
    selectedMachineControlId,
    selectedMachineInteractionBlockedReason,
    selectedMachineId,
    selectedThreadId,
    turnDraft,
  ]);

  const handleProjectStartConversation = useCallback(
    ({
      envMode,
      machineId,
      projectId,
      projectLabel,
      projectRootCwd,
    }: MachinesWorkspaceProjectConversationSelection) => {
      if (isSubmittingTurn) {
        return;
      }

      const startMachine =
        machines?.find((machine) => machine.machineId === machineId) ?? null;
      if (
        startMachine === null ||
        readMachineStatusReason(startMachine) !== null
      ) {
        return;
      }

      setPendingStartedThreadSelection(null);
      setPendingDraftConversation({
        envMode,
        machineId,
        preparedWorktreeBranch: null,
        preparedWorktreeCwd: null,
        projectId,
        projectLabel,
        projectRootCwd,
      });
      setSelectedMachineId(machineId);
      setSelectedThreadId(null);
      setSelectedThreadDetail(null);
      setIsSelectedThreadLoading(false);
      setSelectedThreadError(null);
      setTurnDraft("");
    },
    [isSubmittingTurn, machines],
  );

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

  return (
    <PersistedSidebarProvider
      className="h-full min-h-0"
      defaultState={MACHINES_WORKSPACE_SIDEBAR_DEFAULT_STATE}
      workspaceKey="machines"
    >
      <MachinesWorkspaceView
        hasPendingStartedThread={selectedThreadIsPendingStart}
        machineInventories={machineInventories}
        isSubmittingTurn={isSubmittingTurn}
        leftSidebarHeader={
          userDisplayName !== null ? (
            <SidebarHomeAccountHeader
              compact
              userDisplayName={userDisplayName}
            />
          ) : null
        }
        pendingPinThreadKey={pendingPinThreadKey}
        pendingConversation={
          selectedPendingConversation === null
            ? null
            : {
                envMode: selectedPendingConversation.envMode,
                machineId: selectedPendingConversation.machineId,
                projectId: selectedPendingConversation.projectId,
                projectLabel: selectedPendingConversation.projectLabel,
                projectRootCwd: selectedPendingConversation.projectRootCwd,
              }
        }
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
        onProjectStartConversation={handleProjectStartConversation}
        onTurnDraftChange={setTurnDraft}
        onTurnSubmit={handleTurnSubmit}
        onThreadPinChange={handleThreadPinChange}
        onThreadSelect={({ machineId, threadId }) => {
          if (isSubmittingTurn) {
            return;
          }

          setPendingDraftConversation(null);
          setSelectedMachineId(machineId);
          setSelectedThreadId(threadId);
        }}
      />
    </PersistedSidebarProvider>
  );
}
