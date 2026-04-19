import { ReactNode, useEffect } from "react";
import { useConvexAuth } from "convex/react";
import { AppPageFrame } from "@/components/AppPageFrame";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import { SidebarProvider } from "@/components/sidebar";
import {
  WorkspaceLayoutV2JustPanes,
  WorkspaceLayoutV2ViewportFrame,
} from "@/components/workspace-layout-v2/WorkspaceLayoutV2";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "@/lib/workspacePaneSizes";

function PublicLayoutPane({
  children,
  contentClassName,
}: {
  children?: ReactNode;
  contentClassName?: string;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <div className={contentClassName ?? "flex min-h-0 flex-1 flex-col"}>
          {children}
        </div>
      </div>
    </section>
  );
}

function PublicLayoutShell({ children }: { children: ReactNode }) {
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
            <PublicLayoutPane contentClassName="flex min-h-0 flex-1 flex-col justify-end">
              <AppSidebarMetaSection />
            </PublicLayoutPane>
          }
          main={<PublicLayoutPane>{children}</PublicLayoutPane>}
          right={<PublicLayoutPane />}
        />
      </WorkspaceLayoutV2ViewportFrame>
    </SidebarProvider>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();

  useEffect(() => {
    console.info("[noter] build metadata", {
      appCommit: __APP_COMMIT__,
      appCommitNumber: __APP_COMMIT_NUMBER__,
      appRepoUrl: __APP_REPO_URL__,
    });
  }, []);

  return (
    <AppPageFrame>
      {!isAuthenticated ? (
        <PublicLayoutShell>{children}</PublicLayoutShell>
      ) : (
        children
      )}
    </AppPageFrame>
  );
}
