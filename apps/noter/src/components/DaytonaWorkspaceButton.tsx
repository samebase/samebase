import { useAction } from "convex/react";
import { useState } from "react";
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
import { cn } from "@/lib/utils";

interface DaytonaWorkspaceButtonProps {
  vaultId: Id<"vaults">;
  branch: string;
  sandboxId?: string;
  sandboxName?: string;
  disabled?: boolean;
  className?: string;
}

export function DaytonaWorkspaceButton({
  vaultId,
  branch,
  sandboxId,
  sandboxName,
  disabled,
  className,
}: DaytonaWorkspaceButtonProps) {
  const startDaytonaWorkspace = useAction(api.daytonaActions.startDaytonaWorkspace);
  const getDaytonaTerminalUrl = useAction(api.daytonaActions.getDaytonaTerminalUrl);
  const removeDaytonaSandbox = useAction(api.daytonaActions.removeDaytonaSandbox);
  const getDaytonaBootstrapLogs = useAction(api.daytonaActions.getDaytonaBootstrapLogs);
  const prebuildDaytonaSnapshot = useAction(api.daytonaActions.prebuildDaytonaSnapshot);
  const getDaytonaPrebuildStatus = useAction(api.daytonaActions.getDaytonaPrebuildStatus);
  const [isStarting, setIsStarting] = useState(false);
  const [isOpeningTerminal, setIsOpeningTerminal] = useState(false);
  const [isRemovingSandbox, setIsRemovingSandbox] = useState(false);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [isPrebuilding, setIsPrebuilding] = useState(false);
  const [isCheckingPrebuild, setIsCheckingPrebuild] = useState(false);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [terminalUrl, setTerminalUrl] = useState<string | null>(null);
  const [bootstrapLogs, setBootstrapLogs] = useState<string | null>(null);
  const [prebuildSnapshotName, setPrebuildSnapshotName] = useState<string | null>(
    null,
  );
  const [prebuildState, setPrebuildState] = useState<string | null>(null);
  const [prebuildError, setPrebuildError] = useState<string | null>(null);

  const handleStart = async () => {
    if (disabled || isStarting) {
      return;
    }
    setIsStarting(true);
    setMessage(null);
    setHasError(false);

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
        setHasError(false);
        setMessage(
          result.message ?? `Daytona ${label} created. Check Daytona UI.`,
        );
        setBootstrapLogs(null);
        await fetchTerminalUrl();
      }
    } catch (error) {
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

  const fetchTerminalUrl = async (): Promise<string | null> => {
    if (disabled || isOpeningTerminal) {
      return null;
    }
    setIsOpeningTerminal(true);
    setMessage(null);
    setHasError(false);

    try {
      const result = await getDaytonaTerminalUrl({ vaultId });
      if (!result.ok || !result.url) {
        setHasError(true);
        setMessage(result.message ?? "Failed to open Daytona terminal.");
        return null;
      }

      setTerminalUrl(result.url);
      setMessage(result.message ?? "Terminal link ready.");
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
    if (disabled || isPrebuilding) {
      return;
    }
    setIsPrebuilding(true);
    setMessage(null);
    setHasError(false);

    try {
      const result = await prebuildDaytonaSnapshot({ vaultId, branch });
      if (!result.ok) {
        setHasError(true);
        setMessage(result.message ?? "Failed to build prebuild snapshot.");
        return;
      }
      setMessage(
        result.message ??
          (result.snapshotName
            ? `Prebuild snapshot ${result.snapshotName} created.`
            : "Prebuild snapshot created."),
      );
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to build prebuild snapshot.",
      );
    } finally {
      setIsPrebuilding(false);
    }
  };

  const handleCheckPrebuild = async () => {
    if (disabled || isCheckingPrebuild) {
      return;
    }
    setIsCheckingPrebuild(true);
    setMessage(null);
    setHasError(false);

    try {
      const result = await getDaytonaPrebuildStatus({ vaultId, branch });
      if (!result.ok) {
        setHasError(true);
        setMessage(result.message ?? "Failed to fetch prebuild status.");
        return;
      }
      setPrebuildSnapshotName(result.snapshotName ?? null);
      setPrebuildState(result.state ?? null);
      setPrebuildError(result.errorReason ?? null);
      if (result.state === "ERROR" || result.state === "BUILD_FAILED") {
        setHasError(true);
      }
      setMessage(result.message ?? "Fetched prebuild status.");
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to fetch prebuild status.",
      );
    } finally {
      setIsCheckingPrebuild(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void handleStart();
          }}
          disabled={disabled || isStarting}
        >
          {isStarting ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              Starting Daytona...
            </>
          ) : (
            "Start Daytona"
          )}
        </Button>
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
          disabled={disabled || isPrebuilding}
        >
          {isPrebuilding ? "Building prebuild..." : "Build prebuild"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void handleCheckPrebuild();
          }}
          disabled={disabled || isCheckingPrebuild}
        >
          {isCheckingPrebuild ? "Checking..." : "Check prebuild"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Snapshot name is inferred from vault + branch.
        </span>
      </div>
      {prebuildState && (
        <div
          className={cn(
            "text-xs",
            prebuildState === "ERROR" || prebuildState === "BUILD_FAILED"
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          Prebuild {prebuildSnapshotName ? `${prebuildSnapshotName}: ` : ""}
          {prebuildState}
          {prebuildError ? ` (${prebuildError})` : ""}
        </div>
      )}
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
    </div>
  );
}
