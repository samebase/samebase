import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import { PublicLandingAuthControls } from "@/components/PublicLandingAuthControls";
import { type WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import { useLocation } from "@tanstack/react-router";

/**
 * Keep public route sidebar chrome together so landing and logo routes do not
 * drift as shared links and auth controls change.
 */
export function usePublicRightSidebarPane(): WorkspaceLayoutV2PaneFrameProps {
  const location = useLocation();
  const isPublicLandingRoute = location.pathname === "/";

  return {
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
