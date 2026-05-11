import type { api } from "../../../convex/_generated/api";
import { useCallback, useEffect, useRef } from "react";

type EnqueueDashboardRepositoryRefreshArgs =
  (typeof api.repositoryRefresh.enqueueDashboardRepositoryRefresh)["_args"];
type DashboardRepositoryRefreshTrigger =
  EnqueueDashboardRepositoryRefreshArgs["trigger"];
type EnqueueDashboardRepositoryRefresh = (
  args: EnqueueDashboardRepositoryRefreshArgs,
) => Promise<
  (typeof api.repositoryRefresh.enqueueDashboardRepositoryRefresh)["_returnType"]
>;
type EnqueueManualRepositoryRefresh = (
  args: (typeof api.repositoryRefresh.enqueueManualRepositoryRefresh)["_args"],
) => Promise<
  (typeof api.repositoryRefresh.enqueueManualRepositoryRefresh)["_returnType"]
>;

export type VaultDashboardVault = NonNullable<
  (typeof api.vault.getUserVaults)["_returnType"]
>[number];
export type DashboardManualRefreshVault = Pick<
  VaultDashboardVault,
  "_id" | "repositoryFullName" | "state"
>;

/**
 * Sends dashboard freshness demand to Convex.
 *
 * React only reports that the dashboard loaded, became visible, or the user
 * clicked refresh. Convex selects vaults, coalesces rows, and schedules Workpool
 * jobs so multiple browser tabs cannot create their own refresh loops.
 */
export function useDashboardRepositoryTreeRefresh({
  enqueueDashboardRepositoryRefresh,
  enqueueManualRepositoryRefresh,
  vaults,
}: {
  enqueueDashboardRepositoryRefresh: EnqueueDashboardRepositoryRefresh;
  enqueueManualRepositoryRefresh: EnqueueManualRepositoryRefresh;
  vaults: VaultDashboardVault[] | undefined;
}) {
  const hasVaults = Boolean(vaults?.length);
  const enqueueDashboardDemand = useCallback(
    (trigger: DashboardRepositoryRefreshTrigger) => {
      if (!hasVaults) {
        return;
      }

      // React emits one signal. Convex owns vault fan-out and continuation.
      void enqueueDashboardRepositoryRefresh({
        trigger,
      }).catch((error: unknown) => {
        console.error(
          "Failed to enqueue repository refresh demand from dashboard:",
          error,
        );
      });
    },
    [enqueueDashboardRepositoryRefresh, hasVaults],
  );

  useVisibleDashboardRepositoryTreeRefresh({
    enqueueDashboardDemand,
    hasVaults,
  });

  const refreshVaultTreeFromStatusClick = useCallback(
    (vault: DashboardManualRefreshVault) => {
      if (vault.state !== "ready") {
        return;
      }

      void enqueueManualRepositoryRefresh({
        vaultId: vault._id,
      }).catch((error: unknown) => {
        console.error(
          "Failed to enqueue manual repository refresh demand:",
          error,
        );
      });
    },
    [enqueueManualRepositoryRefresh],
  );

  return {
    refreshVaultTreeFromStatusClick,
  };
}

/**
 * Emits one backend demand signal for visible page load and tab resume.
 */
function useVisibleDashboardRepositoryTreeRefresh({
  enqueueDashboardDemand,
  hasVaults,
}: {
  enqueueDashboardDemand: (trigger: DashboardRepositoryRefreshTrigger) => void;
  hasVaults: boolean;
}) {
  const initialDashboardPageLoadSentRef = useRef(false);

  useEffect(() => {
    if (!hasVaults) {
      return;
    }

    const triggerInitialPageLoad = () => {
      if (initialDashboardPageLoadSentRef.current) {
        return;
      }
      initialDashboardPageLoadSentRef.current = true;
      enqueueDashboardDemand("page_load");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (!initialDashboardPageLoadSentRef.current) {
        triggerInitialPageLoad();
        return;
      }

      enqueueDashboardDemand("visibility");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (document.visibilityState === "visible") {
      triggerInitialPageLoad();
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enqueueDashboardDemand, hasVaults]);
}
