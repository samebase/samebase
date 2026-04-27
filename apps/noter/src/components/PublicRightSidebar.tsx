import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import { PublicLandingAuthControls } from "@/components/PublicLandingAuthControls";
import { RouteUrlDisplay } from "@/components/RouteUrlDisplay";
import { type WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import { isLandingDevModeEnabled } from "@/lib/landingDevMode";
import { useLocation } from "@tanstack/react-router";

export const PUBLIC_RIGHT_SIDEBAR_ROUTE_URL_HEADER_TEST_ID =
  "public-layout-sidebar-route-url-header";

/**
 * Keep public route sidebar chrome together so landing and logo dev routes do
 * not drift as small URL/debug affordances are added.
 */
export function usePublicRightSidebarPane(): WorkspaceLayoutV2PaneFrameProps {
  const location = useLocation();
  const landingDevEnabled = isLandingDevModeEnabled(
    new URLSearchParams(location.searchStr),
  );
  const isPublicLandingRoute = location.pathname === "/";

  return {
    header: landingDevEnabled ? (
      <div className="flex h-full min-w-0 items-center px-2">
        <RouteUrlDisplay />
      </div>
    ) : undefined,
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
