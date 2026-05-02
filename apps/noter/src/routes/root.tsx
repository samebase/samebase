import {
  Outlet,
  createRootRoute,
  lazyRouteComponent,
} from "@tanstack/react-router";
import { RouterGestureDebugOverlay } from "@/components/RouterGestureDebugOverlay";
import {
  APP_THEME_COLOR_SEARCH_KEYS,
  syncDocumentThemeColorSearch,
} from "@/lib/appThemeColorSearch";
import {
  type RootRouteSearch,
  useRootRouteSearch,
  validateRootRouteSearch,
} from "@/lib/rootRouteSearch";
import { useEffect, useLayoutEffect } from "react";

const posthogApiHost =
  import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
const POSTHOG_INIT_DELAY_MS = 10_000;
const RETAINED_ROOT_SEARCH_KEYS = [
  "dev",
  "devtools",
  ...APP_THEME_COLOR_SEARCH_KEYS,
] as const satisfies readonly (keyof RootRouteSearch)[];

type RootSearchMiddlewareArgs = {
  next: (search: RootRouteSearch) => RootRouteSearch;
  search: RootRouteSearch;
};

function retainDefinedRootSearchParams(keys: typeof RETAINED_ROOT_SEARCH_KEYS) {
  return ({ next, search }: RootSearchMiddlewareArgs): RootRouteSearch => {
    let nextSearch: RootRouteSearch = { ...next(search) };

    for (const key of keys) {
      if (key in nextSearch || typeof search[key] === "undefined") {
        continue;
      }

      nextSearch = {
        ...nextSearch,
        [key]: search[key],
      };
    }

    return nextSearch;
  };
}

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
  const { base, primary, secondary } = useRootRouteSearch();
  useDeferredPostHogInit();

  useLayoutEffect(() => {
    syncDocumentThemeColorSearch({ base, primary, secondary });
  }, [base, primary, secondary]);

  return (
    <>
      <Outlet />
      <RouterGestureDebugOverlay />
    </>
  );
}

export const Route = createRootRoute({
  component: AppRouterRoot,
  notFoundComponent: lazyRouteComponent(
    () => import("@/components/NotFoundRoutePage"),
    "NotFoundRoutePage",
  ),
  search: {
    middlewares: [retainDefinedRootSearchParams(RETAINED_ROOT_SEARCH_KEYS)],
  },
  validateSearch: validateRootRouteSearch,
});
