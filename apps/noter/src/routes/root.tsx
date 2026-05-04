import {
  Outlet,
  createRootRoute,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import { pick } from "@noter-md/dependent/object";
import { RouterGestureDebugOverlay } from "@/components/RouterGestureDebugOverlay";
import {
  APP_THEME_COLOR_SEARCH_KEYS,
  syncDocumentThemeColorSearch,
} from "@/lib/appThemeColorSearch";
import { applySearchPatch } from "@/lib/routeSearchFlags";
import {
  type RootRouteSearch,
  useRootRouteSearch,
  validateRootRouteSearch,
} from "@/lib/rootRouteSearch";
import {
  ROOT_THEME_MODE_SEARCH_KEYS,
  readRootThemeMode,
  syncDocumentRootThemeMode,
} from "@/lib/rootThemeModeSearch";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import { useEffect, useLayoutEffect } from "react";

const posthogApiHost =
  import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
const POSTHOG_INIT_DELAY_MS = 10_000;

/**
 * Root-level preview/debug/theme controls should follow public-route
 * navigation until a caller clears the key with a route-search patch tombstone.
 */
const RETAINED_ROOT_SEARCH_KEYS = [
  "dev",
  "devtools",
  ...ROOT_THEME_MODE_SEARCH_KEYS,
  ...APP_THEME_COLOR_SEARCH_KEYS,
] as const satisfies readonly (keyof RootRouteSearch)[];

type RootSearchMiddlewareArgs = {
  next: (search: RootRouteSearch) => RootRouteSearch;
  search: RootRouteSearch;
};

function retainRootSearchParams({
  next,
  search,
}: RootSearchMiddlewareArgs): RootRouteSearch {
  let nextSearch: RootRouteSearch = {
    ...pick(search, RETAINED_ROOT_SEARCH_KEYS),
    ...next(search),
  };

  if (nextSearch.light && nextSearch.dark) {
    nextSearch = applySearchPatch(nextSearch, {
      dark: null,
      light: null,
    });
  }

  return nextSearch;
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
  const { base, border, dark, light, primary, secondary } =
    useRootRouteSearch();
  const themeMode = readRootThemeMode({ dark, light });
  useDeferredPostHogInit();

  useLayoutEffect(() => {
    syncDocumentThemeColorSearch({
      base,
      border,
      primary,
      secondary,
    });
    syncDocumentRootThemeMode(themeMode);
  }, [base, border, primary, secondary, themeMode]);

  return (
    <>
      <Outlet />
      <RouterGestureDebugOverlay />
    </>
  );
}

export const Route = createRootRoute({
  beforeLoad: ({ location, search }) => {
    if (search.reset) {
      throw redirect({
        href: buildPathWithTanStackSearch({
          pathname: location.pathname,
          hash: location.hash,
        }),
        replace: true,
      });
    }

    if (search.light && search.dark) {
      throw redirect({
        href: buildPathWithTanStackSearch({
          pathname: location.pathname,
          search: {
            ...search,
            dark: null,
            light: null,
          },
          hash: location.hash,
        }),
        replace: true,
      });
    }
  },
  component: AppRouterRoot,
  notFoundComponent: lazyRouteComponent(
    () => import("@/components/NotFoundRoutePage"),
    "NotFoundRoutePage",
  ),
  search: {
    middlewares: [retainRootSearchParams],
  },
  validateSearch: validateRootRouteSearch,
});
