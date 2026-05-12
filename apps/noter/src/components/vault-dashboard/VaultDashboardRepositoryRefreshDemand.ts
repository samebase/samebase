import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef } from "react";

type DashboardRepositoryRefreshTrigger =
  (typeof api.repositoryRefresh.enqueueDashboardRepositoryRefresh)["_args"]["trigger"];

/**
 * Sends dashboard freshness demand to Convex.
 *
 * React only reports that the dashboard loaded, became visible, or that the
 * user clicked one vault's refresh status. Convex decides which vaults exist,
 * coalesces duplicate demand, and schedules Workpool jobs. This hook does not
 * accept the dashboard vault list, and manual clicks pass only a vault id,
 * because vault selection and ready/deleting validation are backend policy.
 */
export function useDashboardRepositoryRefreshDemand() {
  const enqueueDashboardRepositoryRefreshMutation = useMutation(
    api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
  );
  const enqueueManualRepositoryRefreshMutation = useMutation(
    api.repositoryRefresh.enqueueManualRepositoryRefresh,
  );
  const initialDashboardPageLoadSentRef = useRef(false);

  useEffect(() => {
    const enqueueDashboardDemand = (
      trigger: DashboardRepositoryRefreshTrigger,
    ) => {
      // Route-level signal only. Convex owns vault selection and continuation.
      void enqueueDashboardRepositoryRefreshMutation({
        trigger,
      }).catch((error: unknown) => {
        console.error(
          "Failed to enqueue repository refresh demand from dashboard:",
          error,
        );
      });
    };

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
  }, [enqueueDashboardRepositoryRefreshMutation]);

  const enqueueManualRepositoryRefresh = useCallback(
    (vaultId: Id<"vaults">) => {
      void enqueueManualRepositoryRefreshMutation({
        vaultId,
      }).catch((error: unknown) => {
        console.error(
          "Failed to enqueue manual repository refresh demand:",
          error,
        );
      });
    },
    [enqueueManualRepositoryRefreshMutation],
  );

  return {
    enqueueManualRepositoryRefresh,
  };
}
