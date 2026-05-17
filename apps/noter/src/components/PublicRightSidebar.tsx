import { AppSidebarMetaSection } from "#src/components/AppSidebarMetaSection.tsx";
import { PublicLandingAuthControls } from "#src/components/PublicLandingAuthControls.tsx";
import { RouteUrlDisplay } from "#src/components/RouteUrlDisplay.tsx";
import { type WorkspaceLayoutV2PaneFrameProps } from "#src/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame.tsx";
import { isLandingDevModeEnabled } from "#src/lib/landingDevMode.ts";
import { useRootRouteSearch } from "#src/lib/rootRouteSearch.ts";
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
export function usePublicRightSidebarPane(): WorkspaceLayoutV2PaneFrameProps {
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
          <AppSidebarMetaSection side="right" />
        </div>
      </div>
    ),
  };
}
