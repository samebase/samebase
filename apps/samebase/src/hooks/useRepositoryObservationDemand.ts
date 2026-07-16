import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const REPOSITORY_OBSERVATION_POLL_INTERVAL_MS = 60_000;
const REPOSITORY_SUMMARY_VISIBLE_VAULT_LIMIT = 25;

function buildSummaryPriorityVaultIds(args: {
  selectedVaultId: Id<"vaults"> | null;
  visibleVaultIds: readonly Id<"vaults">[];
}): Id<"vaults">[] {
  const vaultIds: Id<"vaults">[] = [];
  const seen = new Set<Id<"vaults">>();
  for (const vaultId of [
    ...(args.selectedVaultId === null ? [] : [args.selectedVaultId]),
    ...args.visibleVaultIds,
  ]) {
    if (seen.has(vaultId)) {
      continue;
    }
    seen.add(vaultId);
    vaultIds.push(vaultId);
    if (vaultIds.length === REPOSITORY_SUMMARY_VISIBLE_VAULT_LIMIT) {
      break;
    }
  }
  return vaultIds;
}

/**
 * Expresses demand for both repository observation products while a vault
 * surface is visible. The backend owns freshness, coalescing, rate limits,
 * and fair scheduling across vaults.
 */
export function useRepositoryObservationDemand(args: {
  enabled: boolean;
  selectedInventoryVaultId: Id<"vaults"> | null;
  selectedSummaryVaultId: Id<"vaults"> | null;
  visibleSummaryVaultIds: readonly Id<"vaults">[];
}): void {
  const requestInventoryRefresh = useMutation(
    api.repositoryInventory.requestRepositoryInventoryRefresh,
  );
  const requestSummaryRefresh = useMutation(api.repositorySummary.requestRepositorySummaryRefresh);
  const nextPriorityVaultIds = buildSummaryPriorityVaultIds({
    selectedVaultId: args.selectedSummaryVaultId,
    visibleVaultIds: args.visibleSummaryVaultIds,
  });
  const priorityVaultIdsRef = useRef(nextPriorityVaultIds);
  if (
    priorityVaultIdsRef.current.length !== nextPriorityVaultIds.length ||
    priorityVaultIdsRef.current.some((vaultId, index) => vaultId !== nextPriorityVaultIds[index])
  ) {
    priorityVaultIdsRef.current = nextPriorityVaultIds;
  }
  const priorityVaultIds = priorityVaultIdsRef.current;

  useEffect(() => {
    if (!args.enabled) {
      return;
    }
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const request = () => {
      void (async () => {
        if (args.selectedInventoryVaultId !== null) {
          try {
            await requestInventoryRefresh({ vaultId: args.selectedInventoryVaultId });
          } catch (error) {
            console.error("Failed to request repository inventory:", error);
          }
        }
        try {
          await requestSummaryRefresh({ visibleVaultIds: priorityVaultIds });
        } catch (error) {
          console.error("Failed to request repository summaries:", error);
        }
      })();
    };
    const stopPolling = () => {
      if (intervalId === null) {
        return;
      }
      clearInterval(intervalId);
      intervalId = null;
    };
    const startPolling = () => {
      stopPolling();
      request();
      intervalId = setInterval(request, REPOSITORY_OBSERVATION_POLL_INTERVAL_MS);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startPolling();
      } else {
        stopPolling();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (document.visibilityState === "visible") {
      startPolling();
    }
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopPolling();
    };
  }, [
    args.enabled,
    args.selectedInventoryVaultId,
    priorityVaultIds,
    requestInventoryRefresh,
    requestSummaryRefresh,
  ]);
}
