import { useAction } from "convex/react";
import { useState } from "react";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/button";
import { DaytonaPreviewErrorState } from "@/components/DaytonaPreviewErrorState";
import { cn } from "@/lib/utils";

interface DaytonaPreviewPanelProps {
  vaultId: Id<"vaults">;
  className?: string;
  onResetToGitHub?: () => void;
  isResettingToGitHub?: boolean;
  resetToGitHubDisabled?: boolean;
}

export function DaytonaPreviewPanel({
  vaultId,
  className,
  onResetToGitHub,
  isResettingToGitHub = false,
  resetToGitHubDisabled = false,
}: DaytonaPreviewPanelProps) {
  const getDaytonaPreviewUrl = useAction(
    api.daytona.actions.getDaytonaPreviewUrl,
  );
  const startDaytonaDevServerSafe = useAction(
    api.daytona.actions.startDaytonaDevServerSafe,
  );
  const startDaytonaDevServerFast = useAction(
    api.daytona.actions.startDaytonaDevServerFast,
  );
  const getDaytonaDevServerStatus = useAction(
    api.daytona.actions.getDaytonaDevServerStatus,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isStartingDevSafe, setIsStartingDevSafe] = useState(false);
  const [isStartingDevFast, setIsStartingDevFast] = useState(false);
  const [isFetchingDevStatus, setIsFetchingDevStatus] = useState(false);
  const [devStatus, setDevStatus] = useState<{
    running?: boolean;
    pid?: number;
    port: number;
    logTail?: string;
  } | null>(null);

  const fetchPreviewUrl = async (): Promise<string | null> => {
    if (isLoading) {
      return previewUrl;
    }
    setIsLoading(true);
    setMessage(null);
    setHasError(false);

    try {
      const result = await getDaytonaPreviewUrl({ vaultId });
      if (!result.ok || !result.url) {
        setHasError(true);
        setMessage(result.message ?? "Failed to load preview.");
        return null;
      }
      setMessage(result.message ?? "Preview link ready.");
      return result.url;
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error ? error.message : "Failed to load preview.",
      );
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const handleShowPreview = async () => {
    const url = await fetchPreviewUrl();
    if (url) {
      setPreviewUrl(url);
    }
  };

  const handleOpenInTab = async () => {
    const url = previewUrl ?? (await fetchPreviewUrl());
    if (!url) {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleRefreshLink = async () => {
    const url = await fetchPreviewUrl();
    if (url) {
      setPreviewUrl(url);
    }
  };

  const fetchDevStatus = async (silent: boolean) => {
    if (isFetchingDevStatus) {
      return;
    }
    setIsFetchingDevStatus(true);
    if (!silent) {
      setMessage(null);
      setHasError(false);
    }

    try {
      const result = await getDaytonaDevServerStatus({ vaultId });
      if (!result.ok) {
        if (!silent) {
          setHasError(true);
          setMessage(result.message ?? "Failed to load dev server status.");
        }
        return;
      }
      setDevStatus({
        running: result.running ?? undefined,
        pid: result.pid ?? undefined,
        port: result.port,
        logTail: result.logTail ?? undefined,
      });
      if (!silent) {
        setMessage(result.message ?? "Dev server status updated.");
      }
    } catch (error) {
      if (!silent) {
        setHasError(true);
        setMessage(
          error instanceof Error
            ? error.message
            : "Failed to load dev server status.",
        );
      }
    } finally {
      setIsFetchingDevStatus(false);
    }
  };

  const handleStartDevSafe = async () => {
    if (isStartingDevSafe) {
      return;
    }
    setIsStartingDevSafe(true);
    setMessage(null);
    setHasError(false);

    try {
      const result = await startDaytonaDevServerSafe({ vaultId });
      if (!result.ok) {
        setHasError(true);
        setMessage(result.message ?? "Failed to start dev server.");
        return;
      }
      setMessage(result.message ?? "Dev server start requested.");
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error ? error.message : "Failed to start dev server.",
      );
    } finally {
      setIsStartingDevSafe(false);
      void fetchDevStatus(true);
    }
  };

  const handleStartDevFast = async () => {
    if (isStartingDevFast) {
      return;
    }
    setIsStartingDevFast(true);
    setMessage(null);
    setHasError(false);

    try {
      const result = await startDaytonaDevServerFast({ vaultId });
      if (!result.ok) {
        setHasError(true);
        setMessage(result.message ?? "Failed to start dev server.");
        return;
      }
      setMessage(result.message ?? "Fast dev start requested.");
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error ? error.message : "Failed to start dev server.",
      );
    } finally {
      setIsStartingDevFast(false);
      void fetchDevStatus(true);
    }
  };

  const handleRefreshDevStatus = async () => {
    await fetchDevStatus(false);
  };

  const hasPreviewErrorState = hasError && message !== null && !previewUrl;

  return (
    <div className={cn("corner-notch-1 border bg-muted/5 p-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">Daytona Preview</div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleShowPreview()}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Loading...
              </>
            ) : (
              "Show Preview"
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void handleRefreshLink()}
            disabled={isLoading}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Refresh link
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void handleOpenInTab()}
            disabled={isLoading}
          >
            <ExternalLink className="mr-1 h-3.5 w-3.5" />
            Open in tab
          </Button>
        </div>
      </div>

      <div className="mt-3 corner-notch-1 border bg-muted/5 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">Dev Server</div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleStartDevSafe()}
              disabled={isStartingDevSafe}
            >
              {isStartingDevSafe ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Starting...
                </>
              ) : (
                "Start Dev (Safe)"
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleStartDevFast()}
              disabled={isStartingDevFast}
            >
              {isStartingDevFast ? "Starting fast..." : "Start Dev (Fast)"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleRefreshDevStatus()}
              disabled={isFetchingDevStatus}
            >
              {isFetchingDevStatus ? "Refreshing..." : "Refresh status"}
            </Button>
          </div>
        </div>
        {devStatus && (
          <div className="mt-2 text-xs text-muted-foreground">
            Dev server{" "}
            {devStatus.running === true
              ? "running"
              : devStatus.running === false
                ? "not running"
                : "status unknown"}{" "}
            on :{devStatus.port}
            {devStatus.pid ? ` (pid ${devStatus.pid})` : ""}
          </div>
        )}
        {devStatus && (
          <div className="mt-2 corner-notch-1 border bg-background/70 p-2 text-xs">
            <div className="mb-1 text-muted-foreground">Dev log</div>
            <textarea
              readOnly
              rows={8}
              className="max-h-56 min-h-[120px] w-full resize-y overflow-auto whitespace-pre-wrap corner-notch-1 border bg-background/70 p-2 text-xs"
              value={devStatus.logTail ?? "No output yet."}
            />
          </div>
        )}
      </div>

      {hasPreviewErrorState ? (
        <DaytonaPreviewErrorState
          message={message}
          isLoading={isLoading}
          onShowPreview={() => {
            void handleShowPreview();
          }}
          onResetToGitHub={onResetToGitHub}
          isResettingToGitHub={isResettingToGitHub}
          resetToGitHubDisabled={resetToGitHubDisabled}
        />
      ) : previewUrl ? (
        <div className="mt-3 overflow-hidden corner-notch-1 border bg-white">
          <iframe
            title="Daytona Preview"
            src={previewUrl}
            className="h-[360px] w-full"
            allow="clipboard-read; clipboard-write"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <div className="mt-3 text-xs text-muted-foreground">
          Preview hidden until launched.
        </div>
      )}

      <div className="mt-2 text-xs text-muted-foreground">
        If the preview does not render, Daytona may block embedding. Open in a
        tab to confirm access.
      </div>

      {message && !hasPreviewErrorState && (
        <div
          className={cn(
            "mt-2 text-xs",
            hasError ? "text-red-600" : "text-muted-foreground",
          )}
        >
          {message}
        </div>
      )}
    </div>
  );
}
