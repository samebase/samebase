import { ReactNode, useEffect } from "react";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import { SidebarProvider } from "@/components/sidebar";
import { WorkspaceLayoutV2FullPage } from "@/components/workspace-layout-v2/WorkspaceLayoutV2";
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
      <WorkspaceLayoutV2FullPage
        left={{
          reserveHeaderSpace: false,
          content: (
            <div className="flex h-full min-h-0 flex-col">
              <div className="mt-auto">
                <AppSidebarMetaSection />
              </div>
            </div>
          ),
        }}
        main={{
          content: (
            <div className="flex h-full min-h-0 flex-col">{children}</div>
          ),
        }}
        right={{ reserveHeaderSpace: false }}
      />
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

  return (
    <main className="flex min-h-svh w-full flex-col bg-background">
      {children}
    </main>
  );
}
