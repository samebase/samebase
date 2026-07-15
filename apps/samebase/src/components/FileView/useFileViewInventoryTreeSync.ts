import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useEffect, useRef } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const INVENTORY_TREE_REFRESH_RETRY_MS = 5_000;

type RefreshBranchTreeForFileView = (
  args: FunctionArgs<typeof api.github.refreshBranchTreeForFileView>,
) => Promise<FunctionReturnType<typeof api.github.refreshBranchTreeForFileView>>;

/**
 * Keeps the visible FileView tree on the commit already published by repository
 * inventory. The action still owns in-flight locking and failure cooldowns.
 */
export function useFileViewInventoryTreeSync({
  vaultId,
  branch,
  cachedTreeCommitSha,
  inventoryHeadCommitSha,
  treeRefreshCooldownUntil,
  refreshTree,
}: {
  vaultId: Id<"vaults"> | undefined;
  branch: string | undefined;
  cachedTreeCommitSha: string | undefined;
  inventoryHeadCommitSha: string | undefined;
  treeRefreshCooldownUntil: number | undefined;
  refreshTree: RefreshBranchTreeForFileView;
}): void {
  const settledInventoryMismatchRef = useRef<string | null>(null);
  const inventoryObservationRef = useRef<{ key: string | null; version: number }>({
    key: null,
    version: 0,
  });
  const inventoryObservationKey =
    vaultId === undefined || branch === undefined || inventoryHeadCommitSha === undefined
      ? null
      : `${vaultId}:${branch}:${inventoryHeadCommitSha}`;

  useEffect(() => {
    inventoryObservationRef.current = {
      key: inventoryObservationKey,
      version: inventoryObservationRef.current.version + 1,
    };
    settledInventoryMismatchRef.current = null;
  }, [inventoryObservationKey]);

  useEffect(() => {
    if (
      vaultId === undefined ||
      branch === undefined ||
      inventoryHeadCommitSha === undefined ||
      inventoryHeadCommitSha === cachedTreeCommitSha
    ) {
      return;
    }
    const inventoryMismatchKey = `${vaultId}:${branch}:${inventoryHeadCommitSha}`;
    const inventoryObservationVersion = inventoryObservationRef.current.version;
    if (settledInventoryMismatchRef.current === inventoryMismatchKey) {
      return;
    }
    const refreshArgs = {
      vaultId,
      branch,
      request: {
        kind: "inventory_mismatch",
        expectedHeadCommitSha: inventoryHeadCommitSha,
      },
    } satisfies FunctionArgs<typeof api.github.refreshBranchTreeForFileView>;

    let cancelled = false;
    let refreshInFlight = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearRetry = () => {
      if (retryTimeout === null) {
        return;
      }
      clearTimeout(retryTimeout);
      retryTimeout = null;
    };

    function scheduleRetry(delay: number) {
      if (cancelled || document.visibilityState !== "visible") {
        return;
      }
      retryTimeout = setTimeout(() => {
        void requestRefresh();
      }, delay);
    }

    const requestRefresh = async () => {
      retryTimeout = null;
      if (refreshInFlight || document.visibilityState !== "visible") {
        return;
      }

      refreshInFlight = true;
      let shouldRetry = true;
      try {
        const result = await refreshTree(refreshArgs);
        if (
          result.refreshed ||
          result.reason === "branch_not_found" ||
          result.reason === "recent_success"
        ) {
          if (
            inventoryObservationRef.current.key === inventoryMismatchKey &&
            inventoryObservationRef.current.version === inventoryObservationVersion
          ) {
            settledInventoryMismatchRef.current = inventoryMismatchKey;
          }
          shouldRetry = false;
        }
      } catch (error) {
        console.error("Failed to refresh repository tree for published inventory head:", error);
      } finally {
        refreshInFlight = false;
        if (shouldRetry) {
          const cooldownDelay = Math.max(
            INVENTORY_TREE_REFRESH_RETRY_MS,
            (treeRefreshCooldownUntil ?? 0) - Date.now(),
          );
          scheduleRetry(cooldownDelay);
        }
      }
    };

    const start = () => {
      if (refreshInFlight || retryTimeout !== null || document.visibilityState !== "visible") {
        return;
      }

      const cooldownDelay = Math.max(0, (treeRefreshCooldownUntil ?? 0) - Date.now());
      if (cooldownDelay > 0) {
        scheduleRetry(cooldownDelay);
        return;
      }
      void requestRefresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        start();
      } else {
        clearRetry();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    start();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearRetry();
    };
  }, [
    branch,
    cachedTreeCommitSha,
    inventoryHeadCommitSha,
    refreshTree,
    treeRefreshCooldownUntil,
    vaultId,
  ]);
}
