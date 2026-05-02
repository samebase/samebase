import {
  Outlet,
  createRootRoute,
  lazyRouteComponent,
  useLocation,
  useNavigate,
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
import {
  ROOT_THEME_MODE_SEARCH_KEYS,
  readRootThemeMode,
  syncDocumentRootThemeMode,
} from "@/lib/rootThemeModeSearch";
import { setQueryParam } from "@/lib/queryParams";
import { useEffect, useLayoutEffect } from "react";

const posthogApiHost =
  import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
const POSTHOG_INIT_DELAY_MS = 10_000;
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

function retainDefinedRootSearchParams(keys: typeof RETAINED_ROOT_SEARCH_KEYS) {
  return ({ next, search }: RootSearchMiddlewareArgs): RootRouteSearch => {
    let nextSearch: RootRouteSearch = { ...next(search) };
    const hasThemeModeConflict = search.light === true && search.dark === true;

    for (const key of keys) {
      if (hasThemeModeConflict && (key === "light" || key === "dark")) {
        continue;
      }

      if (key in nextSearch || typeof search[key] === "undefined") {
        continue;
      }

      nextSearch = {
        ...nextSearch,
        [key]: search[key],
      };
    }

    if (nextSearch.light === true && nextSearch.dark === true) {
      nextSearch = {
        ...nextSearch,
        dark: undefined,
        light: undefined,
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

function hasConflictingRootThemeModeSearch(search: string): boolean {
  const searchParams = new URLSearchParams(search);
  const hasLightTheme =
    searchParams.get("light") === "" || searchParams.get("light") === "true";
  const hasDarkTheme =
    searchParams.get("dark") === "" || searchParams.get("dark") === "true";
  return hasLightTheme && hasDarkTheme;
}

function readClearedRootThemeModeSearch(
  search: string,
): Record<string, string | true> {
  const searchParams = new URLSearchParams(search);
  setQueryParam(searchParams, "dark", false);
  setQueryParam(searchParams, "light", false);

  const nextSearch: Record<string, string | true> = {};
  for (const [key, value] of searchParams.entries()) {
    nextSearch[key] = value.length === 0 ? true : value;
  }

  return nextSearch;
}

function AppRouterRoot() {
  const { base, dark, light, primary, secondary } = useRootRouteSearch();
  const navigate = useNavigate();
  const location = useLocation();
  const themeMode = readRootThemeMode({ dark, light });
  useDeferredPostHogInit();

  useLayoutEffect(() => {
    syncDocumentThemeColorSearch({ base, primary, secondary });
  }, [base, primary, secondary]);

  useLayoutEffect(() => {
    syncDocumentRootThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!hasConflictingRootThemeModeSearch(location.searchStr)) {
      return;
    }

    void navigate({
      hash: location.hash,
      replace: true,
      search: readClearedRootThemeModeSearch(location.searchStr),
      state: true,
      to: location.pathname,
    });
  }, [location.hash, location.pathname, location.searchStr, navigate]);

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
