import { useAction } from "convex/react";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
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
  const [isStarting, setIsStarting] = useState(false);
  const [isOpeningTerminal, setIsOpeningTerminal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [terminalUrl, setTerminalUrl] = useState<string | null>(null);

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
