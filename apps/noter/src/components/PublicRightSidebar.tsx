import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import { PublicLandingAccountSection } from "@/components/PublicLandingAccountSection";
import { type WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import { VaultDashboardSidebarContent } from "@/components/vault-dashboard/VaultDashboardChrome";
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
      <VaultDashboardSidebarContent>
        {isPublicLandingRoute ? <PublicLandingAccountSection /> : null}
        <div className="mt-auto">
          <AppSidebarMetaSection side="right" />
        </div>
      </VaultDashboardSidebarContent>
    ),
  };
}
