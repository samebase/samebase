import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useReducer, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DaytonaPtyConnectionState,
  DaytonaPtyTerminal,
  type DaytonaPtySession,
} from "@/components/DaytonaPtyTerminal";
import type { DaytonaSnapshotStatus } from "@/lib/daytonaSnapshot";
import {
  createWorkspaceTerminalState,
  getWorkspaceTerminalHelperText,
  getWorkspaceTerminalTitle,
  listOpenWorkspaceTerminalKinds,
  reduceWorkspaceTerminalState,
  type WorkspaceTerminalKind,
} from "@/lib/daytonaWorkspaceTerminalTabs";
import { cn } from "@/lib/utils";
import type { DaytonaProvisioningMode as WorkspaceProvisioningMode } from "../../convex/daytona/provisioning";

interface DaytonaWorkspaceButtonProps {
  vaultId: Id<"vaults">;
  branch: string;
  sandboxId?: string;
  sandboxName?: string;
  commitSha?: string | null;
  snapshotStatus?: DaytonaSnapshotStatus | null;
  snapshotName?: string | null;
  snapshotError?: string | null;
  disabled?: boolean;
  className?: string;
}

type StartDaytonaWorkspaceResult = FunctionReturnType<
  typeof api.daytona.actions.startDaytonaWorkspace
>;
type StartupMetrics = NonNullable<
  StartDaytonaWorkspaceResult["startupMetrics"]
>;
type OpenWorkspacePtySessionResult = FunctionReturnType<
  typeof api.daytona.terminal.openWorkspacePtySession
>;
type OpenWorkspaceDevServerPtySessionResult = FunctionReturnType<
  typeof api.daytona.terminal.openWorkspaceDevServerPtySession
>;
type OpenWorkspaceSessionResult =
  | OpenWorkspacePtySessionResult
  | OpenWorkspaceDevServerPtySessionResult;

const formatDuration = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const formatProvisioningMode = (mode: WorkspaceProvisioningMode) =>
  mode === "live_debug" ? "Debug" : "Snapshot-backed";

const formatRepoRefreshReason = (reason: string) => {
  if (reason === "mode_always") return "forced by config";
  if (reason === "mode_never") return "disabled by config";
  if (reason === "commit_pinned") return "commit pinned";
  if (reason === "repo_missing") return "repo was missing";
  if (reason === "remote_changed") return "remote changed";
  if (reason === "remote_unknown") return "remote tip unknown";
  if (reason === "up_to_date") return "already up to date";
  if (reason === "failed") return "refresh failed";
  return "unknown";
};

const formatStartupMetricsSummary = (metrics: StartupMetrics) =>
  `${formatProvisioningMode(metrics.provisioningMode)} startup ${formatDuration(metrics.totalMs)} (sandbox ${formatDuration(metrics.sandboxCreateMs)}, repo ${formatDuration(metrics.repoRefreshMs)} ${metrics.repoRefreshed ? "refreshed" : `skipped: ${formatRepoRefreshReason(metrics.repoRefreshReason)}`}, dev ${formatDuration(metrics.devServerStartMs)}).`;

export function DaytonaWorkspaceButton({
  vaultId,
  branch,
  sandboxId,
  sandboxName,
  commitSha,
  snapshotStatus,
  snapshotName,
  snapshotError,
  disabled,
  className,
}: DaytonaWorkspaceButtonProps) {
  const startDaytonaWorkspace = useAction(
    api.daytona.actions.startDaytonaWorkspace,
  );
  const getDaytonaTerminalUrl = useAction(
    api.daytona.actions.getDaytonaTerminalUrl,
  );
  const openWorkspacePtySession = useAction(
    api.daytona.terminal.openWorkspacePtySession,
  );
  const openWorkspaceDevServerPtySession = useAction(
    api.daytona.terminal.openWorkspaceDevServerPtySession,
  );
  const resizeWorkspacePtySession = useAction(
    api.daytona.terminal.resizeWorkspacePtySession,
  );
  const closeWorkspacePtySession = useAction(
    api.daytona.terminal.closeWorkspacePtySession,
  );
  const getDaytonaPreviewUrl = useAction(
    api.daytona.actions.getDaytonaPreviewUrl,
  );
  const removeDaytonaSandbox = useAction(
    api.daytona.actions.removeDaytonaSandbox,
  );
  const getDaytonaBootstrapLogs = useAction(
    api.daytona.actions.getDaytonaBootstrapLogs,
  );
  const prebuildDaytonaSnapshot = useAction(
    api.daytona.actions.prebuildDaytonaSnapshot,
  );
  const getDaytonaPrebuildLogs = useAction(
    api.daytona.actions.getDaytonaPrebuildLogs,
  );
  const ensureDaytonaRegistryForVault = useAction(
    api.daytona.actions.ensureDaytonaRegistryForVault,
  );
  const [isStarting, setIsStarting] = useState(false);
  const [isOpeningTerminal, setIsOpeningTerminal] = useState(false);
  const [isClosingTerminal, setIsClosingTerminal] = useState(false);
  const [isOpeningPreview, setIsOpeningPreview] = useState(false);
  const [isRemovingSandbox, setIsRemovingSandbox] = useState(false);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [isFetchingPrebuildLogs, setIsFetchingPrebuildLogs] = useState(false);
  const [isPrebuilding, setIsPrebuilding] = useState(false);
  const [isEnsuringRegistry, setIsEnsuringRegistry] = useState(false);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [startingProvisioningMode, setStartingProvisioningMode] =
    useState<WorkspaceProvisioningMode | null>(null);
  const [terminalState, dispatchTerminalState] = useReducer(
    reduceWorkspaceTerminalState<DaytonaPtySession>,
    undefined,
    createWorkspaceTerminalState<DaytonaPtySession>,
  );
  const [bootstrapLogs, setBootstrapLogs] = useState<string | null>(null);
  const [startupMetrics, setStartupMetrics] = useState<StartupMetrics | null>(
    null,
  );
  const [terminalConnectionStates, setTerminalConnectionStates] = useState<
    Partial<
      Record<
        WorkspaceTerminalKind,
        {
          state: DaytonaPtyConnectionState;
          message: string;
        }
      >
    >
  >({});
  const [timeToTerminalMs, setTimeToTerminalMs] = useState<number | null>(null);
  const [prebuildLogs, setPrebuildLogs] = useState<string | null>(null);
  const prebuildLogPollRef = useRef<number | null>(null);
  const isFetchingPrebuildLogsRef = useRef(false);
  const isPollingPrebuildLogsRef = useRef(false);
  const terminalStateRef = useRef(terminalState);
  const workspaceContextRef = useRef({ vaultId, branch });
  const openTerminalKinds = listOpenWorkspaceTerminalKinds(
    terminalState.sessions,
  );
  const shellSession = terminalState.sessions.shell ?? null;
  const devServerSession = terminalState.sessions.dev_server ?? null;
  const normalizedBranch = branch.trim().toLowerCase();
  const normalizedSnapshotStatus = snapshotStatus?.trim().toLowerCase() ?? "";
  const shouldPollPrebuildLogs =
    normalizedSnapshotStatus === "queued" ||
    normalizedSnapshotStatus === "building";
  const commitUnavailableReason = !commitSha
    ? normalizedBranch === "main"
      ? "Latest main commit is not known yet. Refresh the repository first."
      : `Latest ${branch} commit is not known yet. Refresh the repository first.`
    : null;
  const mainOnlyReason =
    normalizedBranch !== "main"
      ? "Snapshot-backed Daytona sandboxes currently support main only."
      : null;
  const snapshotLaunchBlockedReason =
    mainOnlyReason ??
    (commitUnavailableReason
      ? commitUnavailableReason
      : normalizedSnapshotStatus.length === 0
        ? "Snapshot status is unknown. Launch is blocked until a snapshot becomes active."
        : normalizedSnapshotStatus !== "active"
          ? normalizedSnapshotStatus === "failed"
            ? snapshotError && snapshotError.length > 0
              ? `Latest snapshot failed: ${snapshotError}`
              : "Latest snapshot failed. Launch is blocked while automatic retries continue."
            : `Latest snapshot is ${normalizedSnapshotStatus}. Launch is blocked until it becomes active.`
          : null);
  const debugLaunchBlockedReason = commitUnavailableReason;
  const launchBlockedMessage =
    snapshotLaunchBlockedReason && debugLaunchBlockedReason
      ? snapshotLaunchBlockedReason === debugLaunchBlockedReason
        ? snapshotLaunchBlockedReason
        : `Snapshot-backed: ${snapshotLaunchBlockedReason} Live/debug: ${debugLaunchBlockedReason}`
      : snapshotLaunchBlockedReason
        ? `Snapshot-backed: ${snapshotLaunchBlockedReason}`
        : debugLaunchBlockedReason
          ? `Live/debug: ${debugLaunchBlockedReason}`
          : null;
  const buildBlockedReason =
    mainOnlyReason ??
    (commitUnavailableReason ? commitUnavailableReason : null);

  const stopPrebuildLogPolling = () => {
    if (prebuildLogPollRef.current === null) {
      return;
    }
    window.clearInterval(prebuildLogPollRef.current);
    prebuildLogPollRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (prebuildLogPollRef.current !== null) {
        window.clearInterval(prebuildLogPollRef.current);
        prebuildLogPollRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    terminalStateRef.current = terminalState;
  }, [terminalState]);

  useEffect(() => {
    const previousWorkspace = workspaceContextRef.current;
    if (
      previousWorkspace.vaultId === vaultId &&
      previousWorkspace.branch === branch
    ) {
      return;
    }

    workspaceContextRef.current = { vaultId, branch };
    const sessions = terminalStateRef.current.sessions;
    const kinds = listOpenWorkspaceTerminalKinds(sessions);
    if (kinds.length === 0) {
      setHasError(false);
      setMessage(null);
      setBootstrapLogs(null);
      setStartupMetrics(null);
      setTimeToTerminalMs(null);
      setPrebuildLogs(null);
      setTerminalConnectionStates({});
      return;
    }

    terminalStateRef.current =
      createWorkspaceTerminalState<DaytonaPtySession>();
    dispatchTerminalState({ type: "reset" });
    setTerminalConnectionStates({});
    setHasError(false);
    setMessage(null);
    setBootstrapLogs(null);
    setStartupMetrics(null);
    setTimeToTerminalMs(null);
    setPrebuildLogs(null);
    for (const kind of kinds) {
      const session = sessions[kind];
      if (!session) {
        continue;
      }
      void closeWorkspacePtySession({
        vaultId: previousWorkspace.vaultId,
        branch: previousWorkspace.branch,
        sandboxId: session.sandboxId,
        sessionId: session.sessionId,
      }).catch((error) => {
        console.warn("daytona:workspace:pty:close-failed", {
          vaultId: previousWorkspace.vaultId,
          branch: previousWorkspace.branch,
          kind,
          sandboxId: session.sandboxId,
          sessionId: session.sessionId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }, [branch, closeWorkspacePtySession, vaultId]);

  useEffect(() => {
    return () => {
      const sessions = terminalStateRef.current.sessions;
      const kinds = listOpenWorkspaceTerminalKinds(sessions);
      if (kinds.length === 0) {
        return;
      }
      const currentWorkspace = workspaceContextRef.current;
      for (const kind of kinds) {
        const session = sessions[kind];
        if (!session) {
          continue;
        }
        void closeWorkspacePtySession({
          vaultId: currentWorkspace.vaultId,
          branch: currentWorkspace.branch,
          sandboxId: session.sandboxId,
          sessionId: session.sessionId,
        }).catch((error) => {
          console.warn("daytona:workspace:pty:close-failed", {
            vaultId: currentWorkspace.vaultId,
            branch: currentWorkspace.branch,
            kind,
            sandboxId: session.sandboxId,
            sessionId: session.sessionId,
            message: error instanceof Error ? error.message : String(error),
          });
        });
      }
    };
  }, [branch, closeWorkspacePtySession, vaultId]);

  useEffect(() => {
    if (disabled || !shouldPollPrebuildLogs) {
      stopPrebuildLogPolling();
      return;
    }

    const pollLogs = () => {
      if (
        isFetchingPrebuildLogsRef.current ||
        isPollingPrebuildLogsRef.current
      ) {
        return;
      }
      isPollingPrebuildLogsRef.current = true;

      void getDaytonaPrebuildLogs({ vaultId, branch })
        .then((result) => {
          if (!result.ok) {
            return;
          }
          setPrebuildLogs(result.logs ?? "");
        })
        .finally(() => {
          isPollingPrebuildLogsRef.current = false;
        });
    };

    pollLogs();
    prebuildLogPollRef.current = window.setInterval(pollLogs, 2_000);

    return () => {
      stopPrebuildLogPolling();
    };
  }, [
    branch,
    disabled,
    getDaytonaPrebuildLogs,
    shouldPollPrebuildLogs,
    vaultId,
  ]);

  const handleStart = async (provisioningMode: WorkspaceProvisioningMode) => {
    const blockedReason =
      provisioningMode === "live_debug"
        ? debugLaunchBlockedReason
        : snapshotLaunchBlockedReason;
    if (disabled || isStarting || blockedReason) {
      return;
    }
    setIsStarting(true);
    setStartingProvisioningMode(provisioningMode);
    setMessage(null);
    setHasError(false);
    setBootstrapLogs(null);
    setStartupMetrics(null);
    setTimeToTerminalMs(null);
    const startClickedAt = performance.now();

    try {
      const result = await startDaytonaWorkspace({
        vaultId,
        branch,
        provisioningMode,
      });

      if (!result.ok) {
        setHasError(true);
        setMessage(result.message ?? "Daytona is not configured.");
      } else {
        const label = result.sandboxName ?? result.sandboxId ?? "sandbox";
        setStartupMetrics(result.startupMetrics ?? null);
        setHasError(false);
        setMessage(result.message ?? `Daytona sandbox ${label} is ready.`);
        setBootstrapLogs(null);
        const shellTerminalSession = await openTerminalSession(true);
        const devServerTerminalSession =
          await openDevServerTerminalSession(true);
        if (shellTerminalSession && devServerTerminalSession) {
          setTimeToTerminalMs(Math.round(performance.now() - startClickedAt));
        } else {
          const missingTabs: string[] = [];
          if (!shellTerminalSession) {
            missingTabs.push("Shell");
          }
          if (!devServerTerminalSession) {
            missingTabs.push("Dev Server");
          }
          console.warn("daytona:workspace:auto-open-partial", {
            vaultId,
            branch,
            provisioningMode,
            missingTabs,
          });
          setMessage((current) => {
            const base =
              current ?? result.message ?? `Daytona sandbox ${label} is ready.`;
            const missingLabel =
              missingTabs.length > 1
                ? `${missingTabs.slice(0, -1).join(", ")} and ${missingTabs.at(-1)}`
                : missingTabs[0];
            return `${base} ${missingLabel} did not auto-open; open ${missingLabel} manually.`;
          });
        }
      }
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to create Daytona sandbox",
      );
    } finally {
      setIsStarting(false);
      setStartingProvisioningMode(null);
    }
  };

  const fetchTerminalUrl = async (silent?: boolean): Promise<string | null> => {
    const isSilent = silent === true;
    if (disabled || isOpeningTerminal) {
      return null;
    }
    setIsOpeningTerminal(true);
    if (!isSilent) {
      setMessage(null);
      setHasError(false);
    }

    try {
      const result = await getDaytonaTerminalUrl({ vaultId, branch });
      if (!result.ok || !result.url) {
        setHasError(true);
        setMessage(result.message ?? "Failed to open Daytona terminal.");
        return null;
      }
      if (!isSilent) {
        setMessage(result.message ?? "Terminal link ready.");
      }
      return result.url;
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to open Daytona terminal.",
      );
      return null;
    } finally {
      setIsOpeningTerminal(false);
    }
  };

  const toTerminalSession = (
    result:
      | OpenWorkspacePtySessionResult
      | OpenWorkspaceDevServerPtySessionResult,
  ): DaytonaPtySession | null => {
    if (
      !result.ok ||
      !result.sessionId ||
      !result.webSocketUrl ||
      !result.previewToken
    ) {
      return null;
    }

    return {
      sessionId: result.sessionId,
      webSocketUrl: result.webSocketUrl,
      previewToken: result.previewToken,
      sandboxId: result.sandboxId,
      initialInput: "initialInput" in result ? result.initialInput : undefined,
      initialOutput:
        "initialOutput" in result ? result.initialOutput : undefined,
    };
  };

  const closeTerminalSession = async (args: {
    kind: WorkspaceTerminalKind;
    silent?: boolean;
  }) => {
    const activeSession = terminalStateRef.current.sessions[args.kind];
    if (!activeSession) {
      return true;
    }
    setIsClosingTerminal(true);

    try {
      const result = await closeWorkspacePtySession({
        vaultId,
        branch,
        sandboxId: activeSession.sandboxId,
        sessionId: activeSession.sessionId,
      });
      if (result.ok) {
        dispatchTerminalState({
          type: "closed",
          kind: args.kind,
        });
        setTerminalConnectionStates((current) => {
          const next = { ...current };
          delete next[args.kind];
          return next;
        });
        return true;
      }
      if (!args.silent) {
        setHasError(true);
        setMessage(
          result.message ?? "Failed to close Daytona terminal session.",
        );
      }
      return false;
    } catch (error) {
      if (!args.silent) {
        setHasError(true);
        setMessage(
          error instanceof Error
            ? error.message
            : "Failed to close Daytona terminal session.",
        );
      }
      return false;
    } finally {
      setIsClosingTerminal(false);
    }
  };

  const closeAllTerminalSessions = async (silent?: boolean) => {
    const kinds = listOpenWorkspaceTerminalKinds(
      terminalStateRef.current.sessions,
    );
    for (const kind of kinds) {
      const closed = await closeTerminalSession({
        kind,
        silent: true,
      });
      if (!closed) {
        if (!silent) {
          setHasError(true);
          setMessage("Failed to close Daytona terminal session.");
        }
        return false;
      }
    }
    return true;
  };

  const closeStaleTerminalSession = (
    session: DaytonaPtySession,
    requestedVaultId: Id<"vaults">,
    requestedBranch: string,
  ) => {
    void closeWorkspacePtySession({
      vaultId: requestedVaultId,
      branch: requestedBranch,
      sandboxId: session.sandboxId,
      sessionId: session.sessionId,
    }).catch((error) => {
      console.warn("daytona:workspace:pty:stale-close-failed", {
        vaultId: requestedVaultId,
        branch: requestedBranch,
        sandboxId: session.sandboxId,
        sessionId: session.sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  };

  const openPtySession = async (args: {
    silent?: boolean;
    targetKind: WorkspaceTerminalKind;
    openSession: (args: {
      vaultId: Id<"vaults">;
      branch: string;
    }) => Promise<OpenWorkspaceSessionResult>;
    successMessage: string;
    failureMessage: string;
  }): Promise<DaytonaPtySession | null> => {
    const isSilent = args.silent === true;
    const requestedVaultId = vaultId;
    const requestedBranch = branch;
    if (disabled || isOpeningTerminal || isClosingTerminal) {
      return null;
    }
    const existingSession = terminalStateRef.current.sessions[args.targetKind];
    if (existingSession) {
      dispatchTerminalState({
        type: "activated",
        kind: args.targetKind,
      });
      return existingSession;
    }
    setIsOpeningTerminal(true);
    if (!isSilent) {
      setMessage(null);
      setHasError(false);
    }

    try {
      const result = await args.openSession({
        vaultId: requestedVaultId,
        branch: requestedBranch,
      });
      const nextSession = toTerminalSession(result);
      if (!nextSession) {
        if (!isSilent) {
          setHasError(true);
          setMessage(result.message ?? args.failureMessage);
        }
        return null;
      }
      if (
        workspaceContextRef.current.vaultId !== requestedVaultId ||
        workspaceContextRef.current.branch !== requestedBranch
      ) {
        closeStaleTerminalSession(
          nextSession,
          requestedVaultId,
          requestedBranch,
        );
        return null;
      }
      dispatchTerminalState({
        type: "opened",
        kind: args.targetKind,
        session: nextSession,
      });
      setTerminalConnectionStates((current) => ({
        ...current,
        [args.targetKind]: {
          state: "connecting",
          message: "Connecting to Daytona…",
        },
      }));
      if (!isSilent) {
        setHasError(false);
        setMessage(result.message ?? args.successMessage);
      }
      return nextSession;
    } catch (error) {
      if (!isSilent) {
        setHasError(true);
        setMessage(
          error instanceof Error ? error.message : args.failureMessage,
        );
      }
      return null;
    } finally {
      setIsOpeningTerminal(false);
    }
  };

  const openTerminalSession = async (
    silent?: boolean,
  ): Promise<DaytonaPtySession | null> => {
    return await openPtySession({
      silent,
      targetKind: "shell",
      openSession: openWorkspacePtySession,
      successMessage: "Terminal session ready.",
      failureMessage: "Failed to open Daytona terminal.",
    });
  };

  const openDevServerTerminalSession = async (
    silent?: boolean,
  ): Promise<DaytonaPtySession | null> => {
    return await openPtySession({
      silent,
      targetKind: "dev_server",
      openSession: openWorkspaceDevServerPtySession,
      successMessage: "Dev server terminal session ready.",
      failureMessage: "Failed to open Daytona dev server terminal.",
    });
  };

  const handleOpenShellTerminal = async () => {
    await openTerminalSession();
  };

  const handleOpenDevServerTerminal = async () => {
    await openDevServerTerminalSession();
  };

  const handleOpenExternalTerminal = async () => {
    const url = await fetchTerminalUrl();
    if (!url) {
      return;
    }
    const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (openedWindow) {
      return;
    }
    let copiedToClipboard = false;
    try {
      await navigator.clipboard.writeText(url);
      copiedToClipboard = true;
    } catch (error) {
      console.warn("daytona:workspace:external-terminal-copy-failed", {
        vaultId,
        branch,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    setHasError(true);
    setMessage(
      copiedToClipboard
        ? "External terminal was blocked by the browser. The URL was copied to your clipboard."
        : `External terminal was blocked by the browser. Allow popups and retry: ${url}`,
    );
  };

  const handleOpenPreview = async () => {
    if (disabled || isOpeningPreview) {
      return;
    }
    setIsOpeningPreview(true);
    setMessage(null);
    setHasError(false);

    try {
      const result = await getDaytonaPreviewUrl({ vaultId, branch });
      if (!result.ok || !result.url) {
        setHasError(true);
        setMessage(result.message ?? "Failed to open preview.");
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
      setMessage(result.message ?? "Preview link ready.");
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error ? error.message : "Failed to open preview.",
      );
    } finally {
      setIsOpeningPreview(false);
    }
  };

  const handleRemoveSandbox = async () => {
    if (
      disabled ||
      isRemovingSandbox ||
      isOpeningTerminal ||
      isClosingTerminal
    ) {
      return;
    }
    setIsRemovingSandbox(true);
    setMessage(null);
    setHasError(false);

    try {
      const closedTerminal = await closeAllTerminalSessions();
      if (!closedTerminal) {
        return;
      }
      const result = await removeDaytonaSandbox({ vaultId });
      if (!result.ok) {
        setHasError(true);
        setMessage(result.message ?? "Failed to remove Daytona sandbox.");
        return;
      }
      setBootstrapLogs(null);
      setMessage(result.message ?? "Daytona sandbox removed.");
      setIsRemoveDialogOpen(false);
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to remove Daytona sandbox.",
      );
    } finally {
      setIsRemovingSandbox(false);
    }
  };

  const handleFetchLogs = async () => {
    if (disabled || isFetchingLogs) {
      return;
    }
    setIsFetchingLogs(true);
    setMessage(null);
    setHasError(false);

    try {
      const result = await getDaytonaBootstrapLogs({ vaultId });
      if (!result.ok) {
        setHasError(true);
        setMessage(result.message ?? "Failed to fetch bootstrap logs.");
        return;
      }
      setBootstrapLogs(result.logs ?? "");
      setMessage(result.message ?? "Fetched bootstrap logs.");
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to fetch bootstrap logs.",
      );
    } finally {
      setIsFetchingLogs(false);
    }
  };

  const handlePrebuildSnapshot = async () => {
    if (disabled || isPrebuilding || buildBlockedReason) {
      return;
    }
    setIsPrebuilding(true);
    setMessage(null);
    setHasError(false);
    setPrebuildLogs("");

    try {
      const result = await prebuildDaytonaSnapshot({ vaultId, branch });
      if (!result.ok) {
        setHasError(true);
        setMessage(result.message ?? "Failed to build snapshot.");
        return;
      }
      setMessage(
        result.message ??
          (result.snapshotName
            ? `Snapshot ${result.snapshotName} created.`
            : "Snapshot created."),
      );
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error ? error.message : "Failed to build snapshot.",
      );
    } finally {
      setIsPrebuilding(false);
      void fetchPrebuildLogs(true);
    }
  };

  const fetchPrebuildLogs = async (silent: boolean) => {
    if (disabled || isFetchingPrebuildLogsRef.current) {
      return;
    }
    isFetchingPrebuildLogsRef.current = true;
    setIsFetchingPrebuildLogs(true);
    if (!silent) {
      setMessage(null);
      setHasError(false);
    }

    try {
      const result = await getDaytonaPrebuildLogs({ vaultId, branch });
      if (!result.ok) {
        if (!silent) {
          setHasError(true);
          setMessage(result.message ?? "Failed to fetch snapshot logs.");
        }
        return;
      }
      setPrebuildLogs(result.logs ?? "");
      if (!silent) {
        setMessage(result.message ?? "Fetched snapshot logs.");
      }
    } catch (error) {
      if (!silent) {
        setHasError(true);
        setMessage(
          error instanceof Error
            ? error.message
            : "Failed to fetch snapshot logs.",
        );
      }
    } finally {
      isFetchingPrebuildLogsRef.current = false;
      setIsFetchingPrebuildLogs(false);
    }
  };

  const handleEnsureRegistry = async () => {
    if (disabled || isEnsuringRegistry) {
      return;
    }
    setIsEnsuringRegistry(true);
    setMessage(null);
    setHasError(false);

    try {
      const result = await ensureDaytonaRegistryForVault({ vaultId });
      if (!result.ok) {
        setHasError(true);
        setMessage(result.message ?? "Failed to configure Daytona registry.");
        return;
      }
      setMessage(result.message ?? "Daytona registry configured.");
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to configure Daytona registry.",
      );
    } finally {
      setIsEnsuringRegistry(false);
    }
  };

  const isStartingSnapshot = startingProvisioningMode === "snapshot_backed";
  const isStartingDebug = startingProvisioningMode === "live_debug";
  const launchButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        void handleStart("snapshot_backed");
      }}
      disabled={disabled || isStarting || snapshotLaunchBlockedReason !== null}
    >
      {isStartingSnapshot ? (
        <>
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          Creating sandbox...
        </>
      ) : (
        "Create sandbox"
      )}
    </Button>
  );

  const debugLaunchButton = (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        void handleStart("live_debug");
      }}
      disabled={disabled || isStarting || debugLaunchBlockedReason !== null}
    >
      {isStartingDebug ? (
        <>
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          Creating debug sandbox...
        </>
      ) : (
        "Create debug sandbox"
      )}
    </Button>
  );

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {launchButton}
        {debugLaunchButton}
        <Button
          variant={
            terminalState.activeKind === "shell" ? "secondary" : "outline"
          }
          size="sm"
          onClick={() => {
            void handleOpenShellTerminal();
          }}
          disabled={disabled || isOpeningTerminal || isClosingTerminal}
        >
          {isOpeningTerminal ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              Opening...
            </>
          ) : shellSession ? (
            "Show Shell"
          ) : (
            "Open Shell"
          )}
        </Button>
        <Button
          variant={
            terminalState.activeKind === "dev_server" ? "secondary" : "outline"
          }
          size="sm"
          onClick={() => {
            void handleOpenDevServerTerminal();
          }}
          disabled={disabled || isOpeningTerminal || isClosingTerminal}
        >
          {isOpeningTerminal ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              Opening...
            </>
          ) : devServerSession ? (
            "Show Dev Server"
          ) : (
            "Open Dev Server"
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void handleOpenPreview();
          }}
          disabled={disabled || isOpeningPreview}
        >
          {isOpeningPreview ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              Opening preview...
            </>
          ) : (
            "Open Preview"
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void handleOpenExternalTerminal();
          }}
          disabled={disabled || isOpeningTerminal}
        >
          Open External Terminal
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void handleFetchLogs();
          }}
          disabled={disabled || isFetchingLogs}
        >
          {isFetchingLogs ? "Fetching logs..." : "View install log"}
        </Button>
        {(sandboxId || sandboxName) && (
          <Dialog
            open={isRemoveDialogOpen}
            onOpenChange={(open) => {
              if (isRemovingSandbox) {
                return;
              }
              setIsRemoveDialogOpen(open);
            }}
          >
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={disabled || isOpeningTerminal || isClosingTerminal}
              >
                Remove sandbox
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remove Daytona sandbox</DialogTitle>
                <DialogDescription>
                  This deletes the sandbox but keeps any snapshots intact.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsRemoveDialogOpen(false)}
                  disabled={
                    isRemovingSandbox || isOpeningTerminal || isClosingTerminal
                  }
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    void handleRemoveSandbox();
                  }}
                  disabled={
                    isRemovingSandbox || isOpeningTerminal || isClosingTerminal
                  }
                >
                  {isRemovingSandbox ? "Removing..." : "Remove sandbox"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void handlePrebuildSnapshot();
          }}
          disabled={disabled || isPrebuilding || buildBlockedReason !== null}
        >
          {isPrebuilding ? "Building snapshot..." : "Build snapshot"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void handleEnsureRegistry();
          }}
          disabled={disabled || isEnsuringRegistry}
        >
          {isEnsuringRegistry ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              Setting registry...
            </>
          ) : (
            "Set registry access"
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void fetchPrebuildLogs(false);
          }}
          disabled={disabled || isFetchingPrebuildLogs}
        >
          {isFetchingPrebuildLogs ? "Fetching logs..." : "View snapshot logs"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {snapshotName
            ? `Latest snapshot: ${snapshotName}`
            : "Snapshots are pinned to exact main commits."}
        </span>
      </div>
      {sandboxId && sandboxName && (
        <div className="text-xs text-muted-foreground">
          Daytona: {sandboxName}
        </div>
      )}
      {openTerminalKinds.length > 0 && (
        <div className="mt-2 space-y-2">
          <div
            className={cn(
              "overflow-hidden rounded-md border border-slate-800 bg-slate-950 text-slate-100 shadow-sm",
              "max-sm:relative max-sm:left-1/2 max-sm:w-screen max-sm:-translate-x-1/2 max-sm:rounded-none max-sm:border-x-0",
            )}
          >
            <div
              role="tablist"
              aria-label="Sandbox terminals"
              className="flex items-center gap-2 overflow-x-auto border-b border-slate-800 bg-slate-900/90 px-2 py-2"
            >
              {openTerminalKinds.map((kind) => {
                const isActive = terminalState.activeKind === kind;
                const title = getWorkspaceTerminalTitle(kind);
                const terminalStatus = terminalConnectionStates[kind];
                const statusTone =
                  terminalStatus?.state === "connected"
                    ? "bg-emerald-400"
                    : terminalStatus?.state === "error"
                      ? "bg-rose-400"
                      : terminalStatus?.state === "closed"
                        ? "bg-slate-500"
                        : "bg-amber-400";

                return (
                  <div
                    key={kind}
                    className={cn(
                      "flex shrink-0 items-center rounded-md border text-xs",
                      isActive
                        ? "border-slate-600 bg-slate-800 text-slate-50"
                        : "border-slate-800 bg-slate-950/70 text-slate-300",
                    )}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className="flex items-center gap-2 px-3 py-1.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                      onClick={() => {
                        dispatchTerminalState({
                          type: "activated",
                          kind,
                        });
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className={cn("h-2 w-2 rounded-ui", statusTone)}
                      />
                      {title}
                    </button>
                    <button
                      type="button"
                      aria-label={`Close ${title} tab`}
                      className="mr-1 rounded p-1 text-slate-400 transition hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950"
                      onClick={() => {
                        void closeTerminalSession({ kind });
                      }}
                      disabled={isClosingTerminal}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="px-0 py-2 sm:p-2">
              {openTerminalKinds.map((kind) => {
                const session = terminalState.sessions[kind];
                if (!session) {
                  return null;
                }

                return (
                  <div
                    key={kind}
                    className={cn(
                      terminalState.activeKind === kind ? "block" : "hidden",
                    )}
                  >
                    <DaytonaPtyTerminal
                      session={session}
                      title={getWorkspaceTerminalTitle(kind)}
                      showHeader={false}
                      allowInput={kind === "shell"}
                      onResizeSession={(sessionId, cols, rows) => {
                        void resizeWorkspacePtySession({
                          vaultId,
                          branch,
                          sandboxId: session.sandboxId,
                          sessionId,
                          cols,
                          rows,
                        }).catch((error) => {
                          console.warn("daytona:workspace:pty:resize-failed", {
                            vaultId,
                            branch,
                            sessionId,
                            cols,
                            rows,
                            message:
                              error instanceof Error
                                ? error.message
                                : String(error),
                          });
                        });
                      }}
                      onSessionError={(terminalMessage) => {
                        setHasError(true);
                        setMessage(terminalMessage);
                      }}
                      onConnectionStateChange={(state, statusMessage) => {
                        setTerminalConnectionStates((current) => ({
                          ...current,
                          [kind]: {
                            state,
                            message: statusMessage,
                          },
                        }));
                      }}
                      onSessionExit={(terminalMessage) => {
                        dispatchTerminalState({
                          type: "closed",
                          kind,
                        });
                        setTerminalConnectionStates((current) => {
                          const next = { ...current };
                          delete next[kind];
                          return next;
                        });
                        setHasError(false);
                        setMessage(terminalMessage);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          {terminalState.activeKind && (
            <div className="text-xs text-muted-foreground">
              {getWorkspaceTerminalHelperText(terminalState.activeKind)}
            </div>
          )}
        </div>
      )}
      {bootstrapLogs !== null && (
        <div className="mt-2 rounded-md border bg-muted/5 p-2 text-xs">
          <div className="mb-1 text-muted-foreground">Install log</div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap">
            {bootstrapLogs || "No output yet."}
          </pre>
        </div>
      )}
      {prebuildLogs !== null && (
        <div className="mt-2 rounded-md border bg-muted/5 p-2 text-xs">
          <div className="mb-1 text-muted-foreground">Snapshot log</div>
          <textarea
            readOnly
            rows={10}
            className="max-h-64 min-h-[160px] w-full resize-y overflow-auto whitespace-pre-wrap rounded border bg-background/70 p-2 text-xs"
            value={prebuildLogs || "No output yet."}
          />
        </div>
      )}
      {startupMetrics && (
        <div className="text-xs text-muted-foreground">
          {formatStartupMetricsSummary(startupMetrics)}
        </div>
      )}
      {timeToTerminalMs !== null && (
        <div className="text-xs text-muted-foreground">
          Terminal tabs ready in {formatDuration(timeToTerminalMs)}.
        </div>
      )}
      {message && (
        <div
          className={cn(
            "text-xs",
            hasError ? "text-red-600" : "text-muted-foreground",
          )}
        >
          {message}
        </div>
      )}
      {!message && (launchBlockedMessage || buildBlockedReason) && (
        <div className="text-xs text-red-600">
          {launchBlockedMessage ?? buildBlockedReason}
        </div>
      )}
    </div>
  );
}
