import { useAction } from "convex/react";
import { useState } from "react";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DaytonaPreviewPanelProps {
  vaultId: Id<"vaults">;
  className?: string;
}

export function DaytonaPreviewPanel({
  vaultId,
  className,
}: DaytonaPreviewPanelProps) {
  const getDaytonaPreviewUrl = useAction(api.daytonaActions.getDaytonaPreviewUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

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

  return (
    <div className={cn("rounded-md border bg-muted/5 p-3", className)}>
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

      {previewUrl ? (
        <div className="mt-3 overflow-hidden rounded-md border bg-white">
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

      {message && (
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
