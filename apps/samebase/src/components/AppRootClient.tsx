import { useLocation } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import "@xyflow/react/dist/style.css";
import { AppWorkspaceShell } from "@/components/AppWorkspaceShell";
import { RouteAccessOutlet } from "@/components/RouteAccessOutlet";
import { RouteAvailabilityOutlet } from "@/components/RouteAvailabilityOutlet";
import { RouterGestureDebugOverlay } from "@/components/RouterGestureDebugOverlay";
import { api } from "../../convex/_generated/api";
import { syncDocumentThemeColorSearch } from "@/lib/appThemeColorSearch";
import { QueryDevtools } from "@/lib/providers/query-devtools";
import { useRootRouteSearch } from "@/routeSearch/root";
import { readRootThemeMode, syncDocumentRootThemeMode } from "@/lib/rootThemeModeSearch";
import { OptionalThemeProvider } from "@/lib/themeStorageFallback";
import {
  captureSamebasePostHogPageview,
  identifySamebasePostHogUser,
  setSamebasePostHogSessionRecording,
} from "@/lib/posthogClient";
import { AccountDeletionBrowserBoundary } from "@/account/AccountDeletionBrowserBoundary";

function usePostHogPageviews() {
  const href = useLocation({
    select: (location) => location.href,
  });
  const capturedHrefRef = useRef<string | null>(null);

  useEffect(() => {
    if (capturedHrefRef.current === href) {
      return;
    }

    capturedHrefRef.current = href;
    void captureSamebasePostHogPageview(href);
  }, [href]);
}

function usePostHogAuthenticatedRuntime() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated && !isLoading ? {} : "skip");
  const viewerAccess = useQuery(
    api.users.currentViewerAccess,
    isAuthenticated && !isLoading ? {} : "skip",
  );
  const hasDashboardAccess = viewerAccess?.accessKeys.includes("access_dashboard") ?? false;
  const sessionRecordingConsent = useQuery(
    api.users.getSessionRecordingConsent,
    hasDashboardAccess ? {} : "skip",
  );
  const identifiedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      identifiedUserIdRef.current = null;
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    // Wait for the server-resolved viewer instead of reading JWT/localStorage
    // fields. `api.users.viewer` is the same user document backend attribution
    // code will use, and the ref prevents re-identifying on unrelated re-renders.
    if (viewer === undefined || viewer === null || !hasDashboardAccess) {
      return;
    }
    if (identifiedUserIdRef.current === viewer._id) {
      return;
    }
    identifiedUserIdRef.current = viewer._id;
    void identifySamebasePostHogUser(viewer._id);
  }, [hasDashboardAccess, viewer]);

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !hasDashboardAccess)) {
      void setSamebasePostHogSessionRecording(false);
      return;
    }
    if (sessionRecordingConsent === undefined) {
      return;
    }

    void setSamebasePostHogSessionRecording(sessionRecordingConsent.state === "granted");
  }, [hasDashboardAccess, isAuthenticated, isLoading, sessionRecordingConsent]);
}

function AppAccountRuntime() {
  usePostHogAuthenticatedRuntime();

  return (
    <AppWorkspaceShell>
      <RouteAvailabilityOutlet>
        <RouteAccessOutlet />
      </RouteAvailabilityOutlet>
    </AppWorkspaceShell>
  );
}

function AppRouterRoot() {
  const { background, border, dark, light, primary, secondary } = useRootRouteSearch();
  const themeMode = readRootThemeMode({ dark, light });
  usePostHogPageviews();

  useLayoutEffect(() => {
    syncDocumentRootThemeMode(themeMode);
    syncDocumentThemeColorSearch({
      background,
      border,
      primary,
      secondary,
    });
  }, [background, border, primary, secondary, themeMode]);

  return (
    <OptionalThemeProvider forcedTheme={themeMode}>
      <AccountDeletionBrowserBoundary>
        <AppAccountRuntime />
      </AccountDeletionBrowserBoundary>
      <RouterGestureDebugOverlay />
    </OptionalThemeProvider>
  );
}

export function AppRootClient() {
  return (
    <>
      <AppRouterRoot />
      <QueryDevtools />
    </>
  );
}
