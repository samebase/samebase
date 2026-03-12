import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
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
  DaytonaPtyTerminal,
  type DaytonaPtySession,
} from "@/components/DaytonaPtyTerminal";
import type { DaytonaSnapshotStatus } from "@/lib/daytonaSnapshot";
import { cn } from "@/lib/utils";

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
  mode?: "full" | "launch";
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

type WorkspaceTerminalKind = "shell" | "dev_server";
type OpenWorkspaceSessionResult =
  | OpenWorkspacePtySessionResult
  | OpenWorkspaceDevServerPtySessionResult;

const formatDuration = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

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
  `Startup ${formatDuration(metrics.totalMs)} (sandbox ${formatDuration(metrics.sandboxCreateMs)}, repo ${formatDuration(metrics.repoRefreshMs)} ${metrics.repoRefreshed ? "refreshed" : `skipped: ${formatRepoRefreshReason(metrics.repoRefreshReason)}`}, dev ${formatDuration(metrics.devServerStartMs)}).`;

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
  mode = "full",
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
  const [terminalSession, setTerminalSession] =
    useState<DaytonaPtySession | null>(null);
  const [activeTerminalKind, setActiveTerminalKind] =
    useState<WorkspaceTerminalKind | null>(null);
  const [bootstrapLogs, setBootstrapLogs] = useState<string | null>(null);
  const [startupMetrics, setStartupMetrics] = useState<StartupMetrics | null>(
    null,
  );
  const [timeToTerminalMs, setTimeToTerminalMs] = useState<number | null>(null);
  const [prebuildLogs, setPrebuildLogs] = useState<string | null>(null);
  const prebuildLogPollRef = useRef<number | null>(null);
  const isFetchingPrebuildLogsRef = useRef(false);
  const isPollingPrebuildLogsRef = useRef(false);
  const terminalSessionRef = useRef<DaytonaPtySession | null>(null);
  const workspaceContextRef = useRef({ vaultId, branch });
  const normalizedBranch = branch.trim().toLowerCase();
  const normalizedSnapshotStatus = snapshotStatus?.trim().toLowerCase() ?? "";
  const shouldPollPrebuildLogs =
    normalizedSnapshotStatus === "queued" ||
    normalizedSnapshotStatus === "building";
  const mainOnlyReason =
    normalizedBranch !== "main"
      ? "Daytona snapshots currently support main only."
      : null;
  const launchBlockedReason =
    mainOnlyReason ??
    (!commitSha
      ? "Latest main commit is not known yet. Refresh the repository first."
      : normalizedSnapshotStatus.length === 0
        ? "Snapshot status is unknown. Launch is blocked until a snapshot becomes active."
        : normalizedSnapshotStatus !== "active"
          ? normalizedSnapshotStatus === "failed"
            ? snapshotError && snapshotError.length > 0
              ? `Latest snapshot failed: ${snapshotError}`
              : "Latest snapshot failed. Launch is blocked while automatic retries continue."
            : `Latest snapshot is ${normalizedSnapshotStatus}. Launch is blocked until it becomes active.`
          : null);
  const buildBlockedReason =
    mainOnlyReason ??
    (!commitSha
      ? "Latest main commit is not known yet. Refresh the repository first."
      : null);

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
    terminalSessionRef.current = terminalSession;
  }, [terminalSession]);

  useEffect(() => {
    workspaceContextRef.current = { vaultId, branch };
  }, [branch, vaultId]);

  useEffect(() => {
    return () => {
      const activeSession = terminalSessionRef.current;
      if (!activeSession) {
        return;
      }
      terminalSessionRef.current = null;
      setTerminalSession(null);
      setActiveTerminalKind(null);
      void closeWorkspacePtySession({
        vaultId,
        branch,
        sandboxId: activeSession.sandboxId,
        sessionId: activeSession.sessionId,
      }).catch((error) => {
        console.warn("daytona:workspace:pty:close-failed", {
          vaultId,
          branch,
          sandboxId: activeSession.sandboxId,
          sessionId: activeSession.sessionId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
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

  const handleStart = async () => {
    if (disabled || isStarting || launchBlockedReason) {
      return;
    }
    setIsStarting(true);
    setMessage(null);
    setHasError(false);
    setStartupMetrics(null);
    setTimeToTerminalMs(null);
    const startClickedAt = performance.now();

    try {
      const result = await startDaytonaWorkspace({
        vaultId,
        branch,
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
        if (mode !== "launch") {
          const nextTerminalSession = await openTerminalSession(true);
          if (nextTerminalSession) {
            setTimeToTerminalMs(Math.round(performance.now() - startClickedAt));
          }
        } else {
          setTimeToTerminalMs(null);
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
      initialOutput:
        "initialOutput" in result ? result.initialOutput : undefined,
    };
  };

  const clearTerminalSessionState = () => {
    terminalSessionRef.current = null;
    setTerminalSession(null);
    setActiveTerminalKind(null);
  };

  const closeActiveTerminalSession = async (silent?: boolean) => {
    const activeSession = terminalSessionRef.current;
    if (!activeSession) {
      return true;
    }
    setIsClosingTerminal(true);
    const activeKind = activeTerminalKind;
    clearTerminalSessionState();

    try {
      const result = await closeWorkspacePtySession({
        vaultId,
        branch,
        sandboxId: activeSession.sandboxId,
        sessionId: activeSession.sessionId,
      });
      if (result.ok) {
        return true;
      }
      terminalSessionRef.current = activeSession;
      setTerminalSession(activeSession);
      setActiveTerminalKind(activeKind);
      if (!silent) {
        setHasError(true);
        setMessage(
          result.message ?? "Failed to close Daytona terminal session.",
        );
      }
      return false;
    } catch (error) {
      terminalSessionRef.current = activeSession;
      setTerminalSession(activeSession);
      setActiveTerminalKind(activeKind);
      if (!silent) {
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
    setIsOpeningTerminal(true);
    if (!isSilent) {
      setMessage(null);
      setHasError(false);
    }

    const closedExistingSession = await closeActiveTerminalSession(isSilent);
    if (!closedExistingSession) {
      setIsOpeningTerminal(false);
      return null;
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
      terminalSessionRef.current = nextSession;
      setTerminalSession(nextSession);
      setActiveTerminalKind(args.targetKind);
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

  const handleToggleShellTerminal = async () => {
    if (terminalSession && activeTerminalKind === "shell") {
      await closeActiveTerminalSession();
      return;
    }
    await openTerminalSession();
  };

  const handleToggleDevServerTerminal = async () => {
    if (terminalSession && activeTerminalKind === "dev_server") {
      await closeActiveTerminalSession();
      return;
    }
    await openDevServerTerminalSession();
  };

  const handleOpenTerminalTab = async () => {
    const url = await fetchTerminalUrl();
    if (!url) {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
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
      const closedTerminal = await closeActiveTerminalSession();
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

  const launchButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        void handleStart();
      }}
      disabled={disabled || isStarting || launchBlockedReason !== null}
    >
      {isStarting ? (
        <>
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          Creating sandbox...
        </>
      ) : (
        "Create sandbox"
      )}
    </Button>
  );

  const launchControls = (
    <div className="flex flex-wrap items-center gap-2">
      {launchButton}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          void handleOpenTerminalTab();
        }}
        disabled={disabled || isOpeningTerminal}
      >
        {isOpeningTerminal ? (
          <>
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            Opening...
          </>
        ) : (
          "Open Terminal"
        )}
      </Button>
    </div>
  );

  if (mode === "launch") {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        {launchControls}
        {startupMetrics && (
          <div className="text-xs text-muted-foreground">
            {formatStartupMetricsSummary(startupMetrics)}
          </div>
        )}
        {timeToTerminalMs !== null && (
          <div className="text-xs text-muted-foreground">
            Terminal link ready in {formatDuration(timeToTerminalMs)}.
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
        {!message && launchBlockedReason && (
          <div className="text-xs text-red-600">{launchBlockedReason}</div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {launchButton}
        <Button
          variant={
            terminalSession && activeTerminalKind === "shell"
              ? "secondary"
              : "outline"
          }
          size="sm"
          onClick={() => {
            void handleToggleShellTerminal();
          }}
          disabled={disabled || isOpeningTerminal || isClosingTerminal}
        >
          {isClosingTerminal ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              Closing...
            </>
          ) : isOpeningTerminal ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              Opening...
            </>
          ) : terminalSession && activeTerminalKind === "shell" ? (
            "Hide Shell"
          ) : (
            "Open Shell"
          )}
        </Button>
        <Button
          variant={
            terminalSession && activeTerminalKind === "dev_server"
              ? "secondary"
              : "outline"
          }
          size="sm"
          onClick={() => {
            void handleToggleDevServerTerminal();
          }}
          disabled={disabled || isOpeningTerminal || isClosingTerminal}
        >
          {isClosingTerminal ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              Closing...
            </>
          ) : isOpeningTerminal ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              Opening...
            </>
          ) : terminalSession && activeTerminalKind === "dev_server" ? (
            "Hide Dev Server"
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
            void handleOpenTerminalTab();
          }}
          disabled={disabled || isOpeningTerminal}
        >
          Open in tab
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
      {terminalSession && (
        <div className="mt-2 space-y-2">
          <DaytonaPtyTerminal
            session={terminalSession}
            title={activeTerminalKind === "dev_server" ? "Dev Server" : "Shell"}
            allowInput={activeTerminalKind !== "dev_server"}
            onResizeSession={(sessionId, cols, rows) => {
              void resizeWorkspacePtySession({
                vaultId,
                branch,
                sandboxId: terminalSession.sandboxId,
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
                    error instanceof Error ? error.message : String(error),
                });
              });
            }}
            onSessionError={(terminalMessage) => {
              setHasError(true);
              setMessage(terminalMessage);
            }}
            onSessionExit={(terminalMessage) => {
              clearTerminalSessionState();
              setHasError(false);
              setMessage(terminalMessage);
            }}
          />
          <div className="text-xs text-muted-foreground">
            {activeTerminalKind === "dev_server"
              ? "The dev server view is read-only and streams the tmux-backed dev server output."
              : "Use “Open in tab” if the embedded PTY hits a Daytona or browser edge case."}
          </div>
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
          Terminal link ready in {formatDuration(timeToTerminalMs)}.
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
      {!message && (launchBlockedReason || buildBlockedReason) && (
        <div className="text-xs text-red-600">
          {launchBlockedReason ?? buildBlockedReason}
        </div>
      )}
    </div>
  );
}
