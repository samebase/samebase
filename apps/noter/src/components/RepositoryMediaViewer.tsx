import { useEffect, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../convex/_generated/api";

export type RepositoryMediaAsset =
  | {
      found: false;
      reason: "missing";
    }
  | {
      found: false;
      reason: "unavailable";
      message: string;
    }
  | {
      found: true;
      kind: "image";
      mimeType: string;
      url: string;
      fileName: string;
    };

type RepositoryMediaDisplayAsset = Extract<
  RepositoryMediaAsset,
  { found: true }
>;

export function RepositoryMediaPreviewPanel({
  asset,
  fallbackLabel,
  testId = "repository-media-viewer",
}: {
  asset: RepositoryMediaDisplayAsset;
  fallbackLabel: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex h-full min-h-[400px] flex-col overflow-auto bg-muted/10"
    >
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 text-xs text-muted-foreground">
        <span className="truncate font-mono text-foreground">
          {asset.fileName || fallbackLabel}
        </span>
        <span className="shrink-0">{asset.mimeType}</span>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <img
          data-testid={`${testId}-image`}
          src={asset.url}
          alt={asset.fileName || fallbackLabel}
          className="max-h-full max-w-full rounded-lg border bg-background object-contain shadow-sm"
        />
      </div>
    </div>
  );
}

export function RepositoryMediaViewer({
  repositoryFullName,
  filePath,
  branch,
}: {
  repositoryFullName: string;
  filePath: string;
  branch: string;
}) {
  const loadMediaAsset = useAction(api.github.getRepositoryMediaAsset);
  const [asset, setAsset] = useState<RepositoryMediaAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLoading, setShowLoading] = useState(false);

  const fallbackLabel = useMemo(() => {
    const fileName = filePath.split("/").pop();
    return fileName && fileName.length > 0 ? fileName : filePath;
  }, [filePath]);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        setShowLoading(true);
      }
    }, 500);

    setAsset(null);
    setError(null);
    setShowLoading(false);

    void loadMediaAsset({
      repositoryFullName,
      filePath,
      branch,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setAsset(result);
      })
      .catch((loadError: unknown) => {
        if (cancelled) {
          return;
        }
        const message =
          loadError instanceof Error && loadError.message.length > 0
            ? loadError.message
            : "Preview unavailable.";
        setError(message);
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (!cancelled) {
          setShowLoading(false);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [branch, filePath, loadMediaAsset, repositoryFullName]);

  if (showLoading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center p-6">
        <div className="rounded-lg border bg-background px-4 py-3 text-sm text-muted-foreground">
          {error}
        </div>
      </div>
    );
  }

  if (asset?.found === false) {
    if (asset.reason === "missing") {
      return null;
    }

    return (
      <div className="flex h-full min-h-[400px] items-center justify-center p-6">
        <div className="rounded-lg border bg-background px-4 py-3 text-sm text-muted-foreground">
          {asset.message}
        </div>
      </div>
    );
  }

  if (!asset) {
    return <div className="h-full min-h-[400px]" />;
  }

  return (
    <RepositoryMediaPreviewPanel asset={asset} fallbackLabel={fallbackLabel} />
  );
}
