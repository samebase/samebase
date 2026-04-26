import {
  Outlet,
  createRootRoute,
  lazyRouteComponent,
  retainSearchParams,
} from "@tanstack/react-router";
import { RouterGestureDebugOverlay } from "@/components/RouterGestureDebugOverlay";
import { validateRootRouteSearch } from "@/lib/rootRouteSearch";
import { useEffect } from "react";

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
  useDeferredPostHogInit();

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
    middlewares: [retainSearchParams(["dev", "devtools"])],
  },
  validateSearch: validateRootRouteSearch,
});
