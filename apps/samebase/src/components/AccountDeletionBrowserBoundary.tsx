import { useLocation, useRouter } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import {
  markAccountDeletionFinalizing,
  readAccountDeletionBrowserMarker,
} from "@/lib/accountDeletionBrowserState";
import { resetLocalAppData } from "@/lib/appBootRecovery";
import { resetSamebasePostHogClient } from "@/lib/posthogClient";
import { ACCOUNT_DELETION_ROUTE } from "@/lib/accountDeletionRoute";

export function AccountDeletionBrowserBoundary({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const pathname = useLocation({ select: (location) => location.pathname });
  const router = useRouter();
  const viewerAccess = useQuery(
    api.users.currentViewerAccess,
    isAuthenticated && !isLoading ? {} : "skip",
  );
  const status = useQuery(
    api.accountDeletion.index.status,
    isAuthenticated && !isLoading && viewerAccess?.role === "role_deleting" ? {} : "skip",
  );
  const completingRef = useRef(false);
  const marker = readAccountDeletionBrowserMarker();

  useEffect(() => {
    if (viewerAccess?.role !== "role_deleting" || pathname === ACCOUNT_DELETION_ROUTE) {
      return;
    }
    void router.navigate({ href: ACCOUNT_DELETION_ROUTE, replace: true });
  }, [pathname, router, viewerAccess?.role]);

  useEffect(() => {
    if (
      status === undefined ||
      status === null ||
      status.markerPhase !== "finalizing" ||
      marker === null ||
      marker.runId !== status.runId
    ) {
      return;
    }
    markAccountDeletionFinalizing(status.runId);
  }, [marker, status]);

  useEffect(() => {
    if (
      isLoading ||
      isAuthenticated ||
      marker === null ||
      !marker.observedFinalizing ||
      completingRef.current
    ) {
      return;
    }
    completingRef.current = true;
    void resetSamebasePostHogClient()
      .then(resetLocalAppData)
      .then(() => {
        window.location.replace("/");
      });
  }, [isAuthenticated, isLoading, marker]);

  if (
    (isAuthenticated && viewerAccess === undefined) ||
    (viewerAccess?.role === "role_deleting" && pathname !== ACCOUNT_DELETION_ROUTE)
  ) {
    return null;
  }

  return children;
}
