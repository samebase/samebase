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
  typeof api.daytonaActions.startDaytonaWorkspace
>;
type StartupMetrics = NonNullable<
  StartDaytonaWorkspaceResult["startupMetrics"]
>;

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
    api.daytonaActions.startDaytonaWorkspace,
  );
  const getDaytonaTerminalUrl = useAction(
    api.daytonaActions.getDaytonaTerminalUrl,
  );
  const getDaytonaPreviewUrl = useAction(
    api.daytonaActions.getDaytonaPreviewUrl,
  );
  const removeDaytonaSandbox = useAction(
    api.daytonaActions.removeDaytonaSandbox,
  );
  const getDaytonaBootstrapLogs = useAction(
    api.daytonaActions.getDaytonaBootstrapLogs,
  );
  const prebuildDaytonaSnapshot = useAction(
    api.daytonaActions.prebuildDaytonaSnapshot,
  );
  const getDaytonaPrebuildLogs = useAction(
    api.daytonaActions.getDaytonaPrebuildLogs,
  );
  const ensureDaytonaRegistryForVault = useAction(
    api.daytonaActions.ensureDaytonaRegistryForVault,
  );
  const [isStarting, setIsStarting] = useState(false);
  const [isOpeningTerminal, setIsOpeningTerminal] = useState(false);
  const [isOpeningPreview, setIsOpeningPreview] = useState(false);
  const [isRemovingSandbox, setIsRemovingSandbox] = useState(false);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [isFetchingPrebuildLogs, setIsFetchingPrebuildLogs] = useState(false);
  const [isPrebuilding, setIsPrebuilding] = useState(false);
  const [isEnsuringRegistry, setIsEnsuringRegistry] = useState(false);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [terminalUrl, setTerminalUrl] = useState<string | null>(null);
  const [bootstrapLogs, setBootstrapLogs] = useState<string | null>(null);
  const [startupMetrics, setStartupMetrics] = useState<StartupMetrics | null>(
    null,
  );
  const [timeToTerminalMs, setTimeToTerminalMs] = useState<number | null>(null);
  const [prebuildLogs, setPrebuildLogs] = useState<string | null>(null);
  const prebuildLogPollRef = useRef<number | null>(null);
  const normalizedBranch = branch.trim().toLowerCase();
  const normalizedSnapshotStatus = snapshotStatus?.trim().toLowerCase() ?? "";
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

  const startPrebuildLogPolling = () => {
    if (prebuildLogPollRef.current !== null) {
      return;
    }
    prebuildLogPollRef.current = window.setInterval(() => {
      void fetchPrebuildLogs(true);
    }, 2_000);
  };

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

  const handleStart = async (openInTab: boolean) => {
    if (disabled || isStarting || launchBlockedReason) {
      return;
    }
    const launchTab = openInTab
      ? window.open("about:blank", "_blank", "noopener,noreferrer")
      : null;
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
        if (launchTab && !launchTab.closed) {
          launchTab.close();
        }
        setHasError(true);
        setMessage(result.message ?? "Daytona is not configured.");
      } else {
        const label = result.sandboxName ?? result.sandboxId ?? "sandbox";
        setStartupMetrics(result.startupMetrics ?? null);
        setHasError(false);
        setMessage(
          result.message ?? `Daytona ${label} created. Check Daytona UI.`,
        );
        setBootstrapLogs(null);
        const terminalLink = await fetchTerminalUrl(true);
        if (terminalLink && launchTab && !launchTab.closed) {
          launchTab.location.href = terminalLink;
        } else if (!terminalLink && launchTab && !launchTab.closed) {
          launchTab.close();
        } else if (terminalLink && openInTab && !launchTab) {
          setMessage((previous) =>
            previous
              ? `${previous} Popup blocked; use Open in tab.`
              : "Terminal link ready. Popup blocked; use Open in tab.",
          );
        }
        if (terminalLink) {
          setTimeToTerminalMs(Math.round(performance.now() - startClickedAt));
        }
      }
    } catch (error) {
      if (launchTab && !launchTab.closed) {
        launchTab.close();
      }
      setHasError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to start Daytona workspace",
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

      setTerminalUrl(result.url);
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

  const handleToggleTerminal = async () => {
    if (terminalUrl) {
      setTerminalUrl(null);
      return;
    }
    await fetchTerminalUrl();
  };

  const handleRefreshTerminal = async () => {
    await fetchTerminalUrl();
  };

  const handleOpenTerminalTab = async () => {
    const url = terminalUrl ?? (await fetchTerminalUrl());
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
    if (disabled || isRemovingSandbox) {
      return;
    }
    setIsRemovingSandbox(true);
    setMessage(null);
    setHasError(false);

    try {
      const result = await removeDaytonaSandbox({ vaultId });
      if (!result.ok) {
        setHasError(true);
        setMessage(result.message ?? "Failed to remove Daytona sandbox.");
        return;
      }
      setTerminalUrl(null);
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
    startPrebuildLogPolling();

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
      stopPrebuildLogPolling();
      void fetchPrebuildLogs(true);
    }
  };

  const fetchPrebuildLogs = async (silent: boolean) => {
    if (disabled || isFetchingPrebuildLogs) {
      return;
    }
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
        void handleStart(true);
      }}
      disabled={disabled || isStarting || launchBlockedReason !== null}
    >
      {isStarting ? (
        <>
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          Launching Daytona...
        </>
      ) : (
        "Launch Daytona"
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
          variant={terminalUrl ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            void handleToggleTerminal();
          }}
          disabled={disabled || isOpeningTerminal}
        >
          {isOpeningTerminal ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              Opening...
            </>
          ) : terminalUrl ? (
            "Hide Terminal"
          ) : (
            "Open Terminal"
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
                disabled={disabled}
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
                  disabled={isRemovingSandbox}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    void handleRemoveSandbox();
                  }}
                  disabled={isRemovingSandbox}
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
      {terminalUrl && (
        <div className="mt-2 overflow-hidden rounded-md border bg-muted/10">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-2 py-1 text-xs text-muted-foreground">
            <span>Daytona Terminal (iframe)</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void handleRefreshTerminal();
              }}
              disabled={disabled || isOpeningTerminal}
            >
              Refresh link
            </Button>
          </div>
          <iframe
            title="Daytona Terminal"
            src={terminalUrl}
            className="h-[360px] w-full bg-white"
            allow="clipboard-read; clipboard-write"
            referrerPolicy="no-referrer"
          />
          <div className="px-2 py-1 text-xs text-muted-foreground">
            If the terminal does not render, Daytona may block embedding. Use
            “Open in tab”.
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
