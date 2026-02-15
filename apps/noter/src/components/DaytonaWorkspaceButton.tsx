import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  snapshotName?: string;
  disabled?: boolean;
  className?: string;
}

export function DaytonaWorkspaceButton({
  vaultId,
  branch,
  sandboxId,
  sandboxName,
  snapshotName,
  disabled,
  className,
}: DaytonaWorkspaceButtonProps) {
  const startDaytonaWorkspace = useAction(api.daytonaActions.startDaytonaWorkspace);
  const getDaytonaTerminalUrl = useAction(api.daytonaActions.getDaytonaTerminalUrl);
  const removeDaytonaSandbox = useAction(api.daytonaActions.removeDaytonaSandbox);
  const getDaytonaBootstrapLogs = useAction(api.daytonaActions.getDaytonaBootstrapLogs);
  const setDaytonaSnapshotName = useAction(api.daytonaActions.setDaytonaSnapshotName);
  const listDaytonaSnapshots = useAction(api.daytonaActions.listDaytonaSnapshots);
  const [isStarting, setIsStarting] = useState(false);
  const [isOpeningTerminal, setIsOpeningTerminal] = useState(false);
  const [isRemovingSandbox, setIsRemovingSandbox] = useState(false);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
  const [isListingSnapshots, setIsListingSnapshots] = useState(false);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [terminalUrl, setTerminalUrl] = useState<string | null>(null);
  const [bootstrapLogs, setBootstrapLogs] = useState<string | null>(null);
  const [snapshotInput, setSnapshotInput] = useState(snapshotName ?? "");
  const [snapshots, setSnapshots] = useState<
    Array<{
      name: string;
      imageName?: string;
      state?: string;
      createdAt?: string;
      lastUsedAt?: string;
    }> | null
  >(null);

  useEffect(() => {
    setSnapshotInput(snapshotName ?? "");
  }, [snapshotName]);

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

  const handleSaveSnapshot = async (nextName?: string) => {
    if (disabled || isSavingSnapshot) {
      return;
    }
    setIsSavingSnapshot(true);
    setMessage(null);
    setHasError(false);

    try {
      const trimmed = (nextName ?? snapshotInput).trim();
      const result = await setDaytonaSnapshotName({
        vaultId,
        snapshotName: trimmed.length > 0 ? trimmed : undefined,
      });
      if (!result.ok) {
        setHasError(true);
        setMessage(result.message ?? "Failed to save snapshot preference.");
        return;
      }
      setSnapshotInput(result.snapshotName ?? "");
      setMessage(result.message ?? "Snapshot preference saved.");
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to save snapshot preference.",
      );
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  const handleListSnapshots = async () => {
    if (disabled || isListingSnapshots) {
      return;
    }
    setIsListingSnapshots(true);
    setMessage(null);
    setHasError(false);

    try {
      const result = await listDaytonaSnapshots({ vaultId, limit: 20 });
      if (!result.ok) {
        setHasError(true);
        setMessage(result.message ?? "Failed to load snapshots.");
        return;
      }
      const items = result.snapshots ?? [];
      setSnapshots(items);
      if (items.length === 0) {
        setMessage("No snapshots returned from Daytona yet.");
      } else {
        setMessage(result.message ?? "Loaded snapshots.");
      }
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error ? error.message : "Failed to load snapshots.",
      );
    } finally {
      setIsListingSnapshots(false);
    }
  };

  const handleUseSnapshot = async (name: string) => {
    setSnapshotInput(name);
    await handleSaveSnapshot(name);
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
        <Input
          value={snapshotInput}
          onChange={(event) => setSnapshotInput(event.target.value)}
          placeholder="Prebuild snapshot name"
          className="h-7 w-64 text-xs"
          disabled={disabled || isSavingSnapshot}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void handleSaveSnapshot();
          }}
          disabled={disabled || isSavingSnapshot}
        >
          {isSavingSnapshot ? "Saving..." : "Save snapshot"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void handleListSnapshots();
          }}
          disabled={disabled || isListingSnapshots}
        >
          {isListingSnapshots ? "Loading..." : "Fetch snapshots"}
        </Button>
      </div>
      {snapshots && snapshots.length > 0 && (
        <div className="rounded-md border bg-muted/5 p-2 text-xs">
          <div className="mb-1 text-muted-foreground">
            Available snapshots
          </div>
          <div className="flex flex-col gap-1">
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.name}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono">{snapshot.name}</div>
                  {(snapshot.createdAt || snapshot.imageName) && (
                    <div className="text-muted-foreground">
                      {snapshot.createdAt ?? snapshot.imageName ?? ""}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleUseSnapshot(snapshot.name);
                  }}
                >
                  Use
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
      {sandboxId && sandboxName && (
        <div className="text-xs text-muted-foreground">
          Daytona: {sandboxName}
        </div>
      )}
      {snapshotName && (
        <div className="text-xs text-muted-foreground">
          Snapshot: {snapshotName}
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
