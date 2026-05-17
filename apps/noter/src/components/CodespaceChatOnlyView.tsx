import { Link, useLocation } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, RefreshCcw } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { CodespaceIframe } from "./CodespaceIframe";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { useCacheQuery as useVaultQuery } from "#src/lib/convexQueryCache.ts";
import { parseVaultPathContext } from "#src/lib/vaultRoutes.ts";

const CODESPACE_STATES_REQUIRING_ENSURE = new Set([
  "stopped",
  "failed",
  "deleted",
]);

function formatCodespaceState(state: string): string {
  return `${state.charAt(0).toUpperCase()}${state.slice(1)}`;
}

export function CodespaceChatOnlyView() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const { owner, repoName, branch } = useMemo(
    () => parseVaultPathContext(pathname),
    [pathname],
  );
  const targetBranch = branch;
  const repositoryFullName = useMemo(() => {
    if (!owner || !repoName) {
      return null;
    }
    return `${owner}/${repoName}`;
  }, [owner, repoName]);

  const vault = useVaultQuery(
    api.vault.records.getVaultByRepository,
    repositoryFullName
      ? {
          repositoryFullName,
          branch: targetBranch,
        }
      : "skip",
  );
  const vaultId = vault?._id;
  const codespace = useQuery(
    api.codespaces.mutations.getActiveCodespace,
    vaultId ? { vaultId } : "skip",
  );
  const ensureCodespaceReady = useAction(
    api.codespaces.vaultIntegration.ensureCodespaceReady,
  );
  const [isEnsuringCodespace, setIsEnsuringCodespace] = useState(false);
  const [ensureError, setEnsureError] = useState<string | null>(null);
  const [autoEnsureDoneForVaultId, setAutoEnsureDoneForVaultId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!vaultId) {
      setAutoEnsureDoneForVaultId(null);
      return;
    }
    setAutoEnsureDoneForVaultId(null);
    setEnsureError(null);
  }, [vaultId]);

  const handleEnsureCodespace = useCallback(async () => {
    if (!vaultId || isEnsuringCodespace) {
      return;
    }

    setIsEnsuringCodespace(true);
    setEnsureError(null);
    try {
      await ensureCodespaceReady({ vaultId });
    } catch (error) {
      setEnsureError(
        error instanceof Error
          ? error.message
          : "Failed to start embedded Codespace view",
      );
    } finally {
      setIsEnsuringCodespace(false);
    }
  }, [vaultId, isEnsuringCodespace, ensureCodespaceReady]);

  useEffect(() => {
    if (!vaultId || isEnsuringCodespace) {
      return;
    }
    if (codespace === undefined) {
      return;
    }
    const shouldAutoEnsure =
      codespace === null ||
      CODESPACE_STATES_REQUIRING_ENSURE.has(codespace.state);
    if (!shouldAutoEnsure) {
      return;
    }
    if (autoEnsureDoneForVaultId === vaultId) {
      return;
    }
    setAutoEnsureDoneForVaultId(vaultId);
    void handleEnsureCodespace();
  }, [
    vaultId,
    codespace,
    autoEnsureDoneForVaultId,
    isEnsuringCodespace,
    handleEnsureCodespace,
  ]);

  if (!owner || !repoName) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">Invalid vault route.</p>
          <Button asChild variant="outline">
            <Link to="/">Back to Vaults</Link>
          </Button>
        </div>
      </div>
    );
  }

  const resolvedBranch = targetBranch ?? vault?.resolvedBranch;
  const fileViewPath = resolvedBranch
    ? `/vault/${owner}/${repoName}/${encodeURIComponent(resolvedBranch)}`
    : `/vault/${owner}/${repoName}`;

  if (vault === undefined) {
    return null;
  }

  if (vault === null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">
            This repository is not connected to your account.
          </p>
          <Button asChild variant="outline">
            <Link to="/">Back to Vaults</Link>
          </Button>
        </div>
      </div>
    );
  }

  const resolvedVaultId = vault._id;
  const state = codespace?.state ?? "creating";
  const isStateRunning = state === "running";
  const stateBadgeVariant = isStateRunning ? "default" : "outline";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to={fileViewPath}>Back</Link>
          </Button>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              Codespace Chat View
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {repositoryFullName}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={stateBadgeVariant}>
            {formatCodespaceState(state)}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void handleEnsureCodespace();
            }}
            disabled={isEnsuringCodespace}
          >
            {isEnsuringCodespace ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 h-3.5 w-3.5" />
            )}
            {isEnsuringCodespace ? "Starting..." : "Reconnect"}
          </Button>
          {codespace?.webUrl && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={codespace.webUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Tab
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>
      </div>
      {ensureError && (
        <div className="border-b bg-red-50 px-3 py-2 text-sm text-red-700">
          {ensureError}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <CodespaceIframe
          vaultId={resolvedVaultId}
          className="h-full"
          kioskMode
        />
      </div>
    </div>
  );
}
