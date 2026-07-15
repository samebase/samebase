import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useEffect } from "react";

const REPOSITORY_INVENTORY_POLL_INTERVAL_MS = 60_000;

/**
 * Keeps the one vault owned by the active route on the repository inventory cadence.
 * Convex coalesces overlapping demand and publishes only complete generations.
 */
export function useRepositoryInventoryDemand(vaultId: Id<"vaults"> | null): void {
  const requestRefresh = useMutation(api.repositoryInventory.requestRepositoryInventoryRefresh);

  useEffect(() => {
    if (vaultId === null) {
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const request = () => {
      void requestRefresh({ vaultId }).catch((error: unknown) => {
        console.error("Failed to request repository inventory:", error);
      });
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
      intervalId = setInterval(request, REPOSITORY_INVENTORY_POLL_INTERVAL_MS);
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
  }, [requestRefresh, vaultId]);
}
