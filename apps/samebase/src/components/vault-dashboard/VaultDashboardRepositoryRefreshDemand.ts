import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef } from "react";

const DASHBOARD_REFRESH_DEMAND_EVENT_GUARD_MS = 1000;

/**
 * Sends dashboard freshness demand to Convex.
 *
 * React only reports that the dashboard surface became active. Route load,
 * visibility resume, and window focus are the same demand here. Convex decides
 * which vaults exist, coalesces duplicate demand, and schedules Workpool jobs.
 * This hook does not accept the dashboard vault list, and manual clicks pass
 * only a vault id, because vault selection and ready/deleting validation are
 * backend policy.
 */
export function useDashboardRepositoryRefreshDemand() {
  const enqueueDashboardRepositoryRefreshMutation = useMutation(
    api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
  );
  const enqueueManualRepositoryRefreshMutation = useMutation(
    api.repositoryRefresh.enqueueManualRepositoryRefresh,
  );
  const initialDashboardDemandSentRef = useRef(false);
  const lastDashboardDemandAtRef = useRef(0);

  useEffect(() => {
    const enqueueDashboardDemand = () => {
      const now = Date.now();
      if (now - lastDashboardDemandAtRef.current < DASHBOARD_REFRESH_DEMAND_EVENT_GUARD_MS) {
        return;
      }
      lastDashboardDemandAtRef.current = now;

      // Surface-level signal only. Convex owns vault selection and continuation.
      void enqueueDashboardRepositoryRefreshMutation().catch((error: unknown) => {
        console.error("Failed to enqueue repository refresh demand from dashboard:", error);
      });
    };

    const enqueueInitialDashboardDemand = () => {
      if (initialDashboardDemandSentRef.current) {
        return;
      }
      initialDashboardDemandSentRef.current = true;
      enqueueDashboardDemand();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (!initialDashboardDemandSentRef.current) {
        enqueueInitialDashboardDemand();
        return;
      }

      enqueueDashboardDemand();
    };

    const handleFocus = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (!initialDashboardDemandSentRef.current) {
        enqueueInitialDashboardDemand();
        return;
      }

      enqueueDashboardDemand();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    if (document.visibilityState === "visible") {
      enqueueInitialDashboardDemand();
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [enqueueDashboardRepositoryRefreshMutation]);

  const enqueueManualRepositoryRefresh = useCallback(
    (vaultId: Id<"vaults">) => {
      void enqueueManualRepositoryRefreshMutation({
        vaultId,
      }).catch((error: unknown) => {
        console.error("Failed to enqueue manual repository refresh demand:", error);
      });
    },
    [enqueueManualRepositoryRefreshMutation],
  );

  return {
    enqueueManualRepositoryRefresh,
  };
}
