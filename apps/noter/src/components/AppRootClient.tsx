import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { Outlet } from "@tanstack/react-router";
import { useEffect, useLayoutEffect } from "react";
import "@xyflow/react/dist/style.css";
import { RouterGestureDebugOverlay } from "@/components/RouterGestureDebugOverlay";
import { syncDocumentThemeColorSearch } from "@/lib/appThemeColorSearch";
import { client } from "@/lib/convexClient";
import { QueryProvider } from "@/lib/providers/query-provider";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import {
  readRootThemeMode,
  syncDocumentRootThemeMode,
} from "@/lib/rootThemeModeSearch";
import { OptionalThemeProvider } from "@/lib/themeStorageFallback";

const posthogApiHost =
  import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
const POSTHOG_INIT_DELAY_MS = 10_000;

function useDeferredPostHogInit() {
  useEffect(() => {
    const posthogProjectToken = import.meta.env
      .VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
    if (!posthogProjectToken) {
      return;
    }

    // Keep analytics out of the first paint path; the landing page has no
    // product dependency on PostHog before the user can see and act on it.
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void import("posthog-js")
        .then((module) => {
          if (cancelled) {
            return;
          }

          module.default.init(posthogProjectToken, {
            api_host: posthogApiHost,
            capture_exceptions: true,
            defaults: "2026-01-30",
            // Keep localhost sessions visible while developing instead of
            // marking them as internal/test users under the defaults snapshot.
            internal_or_test_user_hostname: import.meta.env.DEV
              ? null
              : undefined,
          });
        })
        .catch(() => {});
    }, POSTHOG_INIT_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);
}

function AppRouterRoot() {
  const { background, border, dark, light, primary, secondary } =
    useRootRouteSearch();
  const themeMode = readRootThemeMode({ dark, light });
  useDeferredPostHogInit();

  useLayoutEffect(() => {
    syncDocumentThemeColorSearch({
      background,
      border,
      primary,
      secondary,
    });
    syncDocumentRootThemeMode(themeMode);
  }, [background, border, primary, secondary, themeMode]);

  return (
    <OptionalThemeProvider forcedTheme={themeMode}>
      <Outlet />
      <RouterGestureDebugOverlay />
    </OptionalThemeProvider>
  );
}

export function AppRootClient() {
  return (
    <ConvexAuthProvider client={client}>
      <QueryProvider>
        <AppRouterRoot />
      </QueryProvider>
    </ConvexAuthProvider>
  );
}
