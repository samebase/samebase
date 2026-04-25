import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import { PublicLandingAuthControls } from "@/components/PublicLandingAuthControls";
import { RouteUrlDisplay } from "@/components/RouteUrlDisplay";
import { type WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import { isLandingDevModeEnabled } from "@/lib/landingDevMode";
import type { PublicLayoutSidebarPreferenceSource } from "@/lib/publicLayoutSidebarPreferences";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import { useLocation } from "@tanstack/react-router";

export const PUBLIC_RIGHT_SIDEBAR_ROUTE_URL_HEADER_TEST_ID =
  "public-layout-sidebar-route-url-header";

function renderPublicRouteUrlHeader(visible: boolean) {
  const visibilityClassName = visible
    ? "visible opacity-100"
    : "invisible pointer-events-none opacity-0";

  // Reserve the dev URL row so toggling `?dev` does not move sidebar auth.
  return (
    <div
      aria-hidden={visible ? undefined : true}
      className={`flex h-full min-w-0 items-center px-2 transition-[opacity,visibility] duration-150 ease-out motion-reduce:transition-none ${visibilityClassName}`}
    >
      <RouteUrlDisplay />
    </div>
  );
}

/**
 * Keep public route sidebar chrome together so landing and logo dev routes do
 * not drift as small URL/debug affordances are added.
 */
export function usePublicRightSidebarPane({
  publicSidebarPreferenceSource,
}: {
  publicSidebarPreferenceSource?: PublicLayoutSidebarPreferenceSource;
} = {}): WorkspaceLayoutV2PaneFrameProps {
  const location = useLocation();
  const rootRouteSearch = useRootRouteSearch();
  const landingDevEnabled = isLandingDevModeEnabled(rootRouteSearch);
  const isPublicLandingRoute = location.pathname === "/";

  return {
    header: renderPublicRouteUrlHeader(landingDevEnabled),
    headerTestId: PUBLIC_RIGHT_SIDEBAR_ROUTE_URL_HEADER_TEST_ID,
    content: (
      <div className="flex min-h-full flex-col">
        {isPublicLandingRoute ? (
          <div className="p-2">
            <PublicLandingAuthControls />
          </div>
        ) : null}
        <div className="mt-auto">
          <AppSidebarMetaSection
            publicSidebarPreferenceSource={publicSidebarPreferenceSource}
            side="right"
          />
        </div>
      </div>
    ),
  };
}
