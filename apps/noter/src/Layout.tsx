import { ReactNode } from "react";
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
          footer: <AppSidebarMetaSection />,
        }}
        main={{
          content: (
            <div className="flex h-full min-h-0 flex-col">{children}</div>
          ),
        }}
      />
    </SidebarProvider>
  );
}

export function Layout({
  children,
  dataTestId,
}: {
  children: ReactNode;
  dataTestId?: string;
}) {
  return (
    <main
      data-testid={dataTestId}
      className="flex min-h-svh w-full flex-col bg-background"
    >
      {children}
    </main>
  );
}
