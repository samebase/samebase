import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { useLocation, useRouter } from "@tanstack/react-router";
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
import { AppAuthPresentationProvider } from "@/lib/AppAuthPresentationProvider";
import { captureSamebasePostHogPageview, identifySamebasePostHogUser } from "@/lib/posthogClient";
import { AccountDeletionBrowserBoundary } from "@/components/AccountDeletionBrowserBoundary";

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

function usePostHogViewerIdentity() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated && !isLoading ? {} : "skip");
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
    if (viewer === undefined || viewer === null) {
      return;
    }
    if (identifiedUserIdRef.current === viewer._id) {
      return;
    }
    identifiedUserIdRef.current = viewer._id;
    void identifySamebasePostHogUser(viewer._id);
  }, [viewer]);
}

function AppRouterRoot() {
  const { background, border, dark, light, primary, secondary } = useRootRouteSearch();
  const themeMode = readRootThemeMode({ dark, light });
  usePostHogPageviews();
  usePostHogViewerIdentity();

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
      <AppWorkspaceShell>
        <AccountDeletionBrowserBoundary>
          <RouteAvailabilityOutlet>
            <RouteAccessOutlet />
          </RouteAvailabilityOutlet>
        </AccountDeletionBrowserBoundary>
      </AppWorkspaceShell>
      <RouterGestureDebugOverlay />
    </OptionalThemeProvider>
  );
}

export function AppRootClient() {
  const router = useRouter();
  const convexClient = router.options.context.convexQueryClient.convexClient;

  return (
    <ConvexAuthProvider client={convexClient}>
      <AppAuthPresentationProvider storageNamespace={convexClient.url}>
        <AppRouterRoot />
        <QueryDevtools />
      </AppAuthPresentationProvider>
    </ConvexAuthProvider>
  );
}
