import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import { PublicLandingAccountSection } from "@/components/PublicLandingAccountSection";
import { PublicLandingPasswordAuthControls } from "@/components/PublicLandingAuthControls";
import { type WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import { VaultDashboardSidebarContent } from "@/components/vault-dashboard/VaultDashboardChrome";

/**
 * Keep public route sidebar chrome together so public routes do not drift as
 * shared account, auth, and meta links change.
 */
export function usePublicRightSidebarPane(): WorkspaceLayoutV2PaneFrameProps {
  return {
    content: (
      <VaultDashboardSidebarContent>
        <PublicLandingAccountSection />
        <PublicLandingPasswordAuthControls />
        <div className="mt-auto">
          <AppSidebarMetaSection linkAlignment="left" />
        </div>
      </VaultDashboardSidebarContent>
    ),
  };
}
