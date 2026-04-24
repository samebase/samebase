import { ReactNode } from "react";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import { PublicLandingLogoLinkProvider } from "@/contexts/PublicLandingLogoLinkContext";
import { SidebarProvider } from "@/components/sidebar";
import {
  WorkspaceLayoutV2FullPage,
  WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX,
} from "@/components/workspace-layout-v2/WorkspaceLayoutV2";

const PUBLIC_LAYOUT_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX = 288;
const PUBLIC_LAYOUT_RIGHT_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX = 288;

export function PublicLayoutShell({ children }: { children: ReactNode }) {
  return (
    <PublicLandingLogoLinkProvider>
      <SidebarProvider
        defaultLeftDesktopWidthPx={
          WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX
        }
        defaultRightDesktopWidthPx={
          PUBLIC_LAYOUT_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX
        }
        defaultLeftMobileWidthPx={
          WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX
        }
        defaultRightMobileWidthPx={
          PUBLIC_LAYOUT_RIGHT_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX
        }
        defaultOpen={false}
        defaultRightOpen={true}
        shortcutSidebarSide="right"
      >
        <WorkspaceLayoutV2FullPage
          main={{
            content: (
              <div className="flex h-full min-h-0 flex-col">{children}</div>
            ),
          }}
          right={{
            footer: <AppSidebarMetaSection side="right" />,
          }}
          leftToggleVisibility="hidden"
          rightToggleVisibility="hidden"
        />
      </SidebarProvider>
    </PublicLandingLogoLinkProvider>
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
