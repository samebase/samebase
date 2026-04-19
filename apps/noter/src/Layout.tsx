import { ReactNode, useEffect } from "react";
import { AppPageFrame } from "@/components/AppPageFrame";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import { SidebarProvider } from "@/components/sidebar";
import { WorkspaceLayoutV2PaneFrame } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import {
  WorkspaceLayoutV2JustPanes,
  WorkspaceLayoutV2ViewportFrame,
} from "@/components/workspace-layout-v2/WorkspaceLayoutV2";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "@/lib/workspacePaneSizes";

export function PublicLayoutShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider
      defaultLeftDesktopWidthPx={DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX}
      defaultLeftMobileWidthPx={DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX}
      defaultOpen={true}
      defaultRightOpen={false}
      shortcutSidebarSide="left"
    >
      <WorkspaceLayoutV2ViewportFrame>
        <WorkspaceLayoutV2JustPanes
          left={
            <WorkspaceLayoutV2PaneFrame
              reserveHeaderSpace={false}
              content={
                <div className="mt-auto min-h-0 flex-1">
                  <AppSidebarMetaSection />
                </div>
              }
            />
          }
          main={
            <WorkspaceLayoutV2PaneFrame
              reserveHeaderSpace={false}
              content={children}
            />
          }
          right={<WorkspaceLayoutV2PaneFrame reserveHeaderSpace={false} />}
        />
      </WorkspaceLayoutV2ViewportFrame>
    </SidebarProvider>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  useEffect(() => {
    console.info("[noter] build metadata", {
      appCommit: __APP_COMMIT__,
      appCommitNumber: __APP_COMMIT_NUMBER__,
      appRepoUrl: __APP_REPO_URL__,
    });
  }, []);

  return <AppPageFrame>{children}</AppPageFrame>;
}
