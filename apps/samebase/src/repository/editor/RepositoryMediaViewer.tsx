import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RepositoryVoxPreview } from "@/repository/editor/RepositoryVoxPreview";
import { api } from "../../../convex/_generated/api";

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
    }
  | {
      found: true;
      kind: "vox";
      mimeType: string;
      url: string;
      fileName: string;
    };

type RepositoryMediaDisplayAsset = Extract<RepositoryMediaAsset, { found: true }>;

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
      {renderRepositoryMediaAsset(asset, fallbackLabel, testId)}
    </div>
  );
}

function renderRepositoryMediaAsset(
  asset: RepositoryMediaDisplayAsset,
  fallbackLabel: string,
  testId: string,
) {
  switch (asset.kind) {
    case "image":
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <img
            data-testid={`${testId}-image`}
            src={asset.url}
            alt={asset.fileName || fallbackLabel}
            className="max-h-full max-w-full border bg-background object-contain shadow-sm"
          />
        </div>
      );
    case "vox":
      return <RepositoryVoxPreview testId={testId} url={asset.url} />;
    default:
      asset satisfies never;
      return null;
  }
}

export function RepositoryMediaViewer({
  githubRepositoryFullName,
  filePath,
  branch,
  skipStaging = false,
}: {
  githubRepositoryFullName: string;
  filePath: string;
  branch: string;
  skipStaging?: boolean;
}) {
  const loadMediaAsset = useAction(api.github.getRepositoryMediaAsset);
  const queryClient = useQueryClient();
  const [showLoading, setShowLoading] = useState(false);

  const fallbackLabel = useMemo(() => {
    const fileName = filePath.split("/").pop();
    return fileName && fileName.length > 0 ? fileName : filePath;
  }, [filePath]);

  const queryEnabled = Boolean(githubRepositoryFullName && branch && filePath);
  const queryKey = useMemo(
    () =>
      ["repository-media-asset", githubRepositoryFullName, branch, filePath, skipStaging] as const,
    [branch, filePath, githubRepositoryFullName, skipStaging],
  );
  const queryIdentity = JSON.stringify(queryKey);
  const queryLifecycleRef = useRef<{
    canUseCachedResult: boolean;
    identity: string;
  } | null>(null);
  if (queryLifecycleRef.current?.identity !== queryIdentity) {
    const activeObserverCount =
      queryClient.getQueryCache().find({ exact: true, queryKey })?.getObserversCount() ?? 0;
    queryLifecycleRef.current = {
      canUseCachedResult: activeObserverCount > 0,
      identity: queryIdentity,
    };
  }
  const canUseCachedResult = queryLifecycleRef.current.canUseCachedResult;
  const mediaAssetQuery = useQuery({
    queryKey,
    queryFn: async () =>
      await loadMediaAsset({
        githubRepositoryFullName,
        filePath,
        branch,
        skipStaging,
      }),
    enabled: queryEnabled,
    gcTime: 0,
    refetchOnMount: canUseCachedResult ? false : "always",
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: canUseCachedResult ? Infinity : 0,
  });
  const canRenderQueryResult = canUseCachedResult || mediaAssetQuery.isFetchedAfterMount;
  const isWaitingForFreshResult =
    queryEnabled && !canRenderQueryResult && mediaAssetQuery.isFetching;

  useEffect(() => {
    setShowLoading(false);
    if (!isWaitingForFreshResult) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowLoading(true);
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isWaitingForFreshResult, queryIdentity]);

  const asset = canRenderQueryResult ? (mediaAssetQuery.data ?? null) : null;
  const error =
    canRenderQueryResult && mediaAssetQuery.isError
      ? mediaAssetQuery.error instanceof Error && mediaAssetQuery.error.message.length > 0
        ? mediaAssetQuery.error.message
        : "Preview unavailable."
      : null;

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
        <div className="corner-notch-1 border bg-background px-4 py-3 text-sm text-muted-foreground">
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
        <div className="corner-notch-1 border bg-background px-4 py-3 text-sm text-muted-foreground">
          {asset.message}
        </div>
      </div>
    );
  }

  if (!asset) {
    return <div className="h-full min-h-[400px]" />;
  }

  return <RepositoryMediaPreviewPanel asset={asset} fallbackLabel={fallbackLabel} />;
}
