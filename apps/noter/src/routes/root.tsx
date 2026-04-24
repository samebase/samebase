import {
  Outlet,
  createRootRoute,
  retainSearchParams,
} from "@tanstack/react-router";
import { NotFoundRoutePage } from "@/components/NotFoundRoutePage";
import { RouterGestureDebugOverlay } from "@/components/RouterGestureDebugOverlay";
import { validateRootRouteSearch } from "@/lib/rootRouteSearch";
import { PostHogProvider } from "posthog-js/react";

const posthogApiHost =
  import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

function AppRouterRoot() {
  return (
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN}
      options={{
        api_host: posthogApiHost,
        defaults: "2026-01-30",
        // Keep localhost sessions visible while developing instead of marking
        // them as internal/test users under the 2026 defaults snapshot.
        internal_or_test_user_hostname: import.meta.env.DEV ? null : undefined,
        capture_exceptions: true,
      }}
    >
      <Outlet />
      <RouterGestureDebugOverlay />
    </PostHogProvider>
  );
}

export const Route = createRootRoute({
  component: AppRouterRoot,
  notFoundComponent: NotFoundRoutePage,
  search: {
    middlewares: [retainSearchParams(["dev", "devtools"])],
  },
  validateSearch: validateRootRouteSearch,
});
