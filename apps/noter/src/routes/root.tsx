import {
  Outlet,
  createRootRoute,
  retainSearchParams,
} from "@tanstack/react-router";
import { NotFoundRoutePage } from "@/components/NotFoundRoutePage";
import { RouterGestureDebugOverlay } from "@/components/RouterGestureDebugOverlay";
import { validateRootRouteSearch } from "@/lib/rootRouteSearch";
import { PostHogProvider } from "posthog-js/react";

const DEFAULT_POSTHOG_API_HOST = "https://eu.i.posthog.com";
const configuredPostHogApiHost =
  import.meta.env.VITE_PUBLIC_POSTHOG_HOST || DEFAULT_POSTHOG_API_HOST;

function derivePostHogUiHost(apiHost: string): string {
  try {
    const url = new URL(apiHost);
    url.hostname = url.hostname.replace(".i.", ".");
    return url.origin;
  } catch {
    return "https://eu.posthog.com";
  }
}

function AppRouterRoot() {
  return (
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN}
      options={{
        // The Vite proxy only exists in local dev. Production builds need the
        // real ingest host so events still reach PostHog after deployment.
        api_host: import.meta.env.DEV ? "/ingest" : configuredPostHogApiHost,
        ui_host: derivePostHogUiHost(configuredPostHogApiHost),
        defaults: "2026-01-30",
        // PostHog's 2026 defaults treat localhost as internal/test traffic.
        // Disable that in local dev so setup verification uses real events.
        internal_or_test_user_hostname: import.meta.env.DEV ? null : undefined,
        capture_exceptions: true,
        debug: import.meta.env.DEV,
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
    middlewares: [retainSearchParams(["devtools"])],
  },
  validateSearch: validateRootRouteSearch,
});
