import { ReactNode } from "react";
import { usePublicRightSidebarPane } from "@/components/PublicRightSidebar";
import { PublicLandingLogoLinkProvider } from "@/contexts/PublicLandingLogoLinkContext";
import { SidebarProvider } from "@/components/sidebar";
import {
  WorkspaceLayoutV2FullPage,
  WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX,
} from "@/components/workspace-layout-v2/WorkspaceLayoutV2";
import { type WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import type { MobileSidebarPane } from "@/hooks/use-sidebar";

const PUBLIC_LAYOUT_LEFT_SIDEBAR_DEFAULT_WIDTH_PX = 240;
const PUBLIC_LAYOUT_LEFT_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX = 240;
const PUBLIC_LAYOUT_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX = 288;
const PUBLIC_LAYOUT_RIGHT_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX = 288;

export function PublicLayoutShell({
  children,
  defaultLeftOpen = false,
  defaultMobilePane = "main",
  left,
}: {
  children: ReactNode;
  defaultLeftOpen?: boolean;
  defaultMobilePane?: MobileSidebarPane;
  left?: WorkspaceLayoutV2PaneFrameProps;
}) {
  const publicRightSidebarPane = usePublicRightSidebarPane();

  return (
    <PublicLandingLogoLinkProvider>
      <SidebarProvider
        defaultLeftDesktopWidthPx={
          left === undefined
            ? WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX
            : PUBLIC_LAYOUT_LEFT_SIDEBAR_DEFAULT_WIDTH_PX
        }
        defaultRightDesktopWidthPx={
          PUBLIC_LAYOUT_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX
        }
        defaultLeftMobileWidthPx={
          left === undefined
            ? WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX
            : PUBLIC_LAYOUT_LEFT_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX
        }
        defaultRightMobileWidthPx={
          PUBLIC_LAYOUT_RIGHT_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX
        }
        defaultMobilePane={defaultMobilePane}
        defaultOpen={left !== undefined && defaultLeftOpen}
        defaultRightOpen={true}
        shortcutSidebarSide="right"
      >
        <WorkspaceLayoutV2FullPage
          left={left}
          main={{
            content: (
              <div className="flex h-full min-h-0 flex-col">{children}</div>
            ),
          }}
          mobileMinResizeBehavior="min_resize_to_merge"
          right={publicRightSidebarPane}
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
