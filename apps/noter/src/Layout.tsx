import { useMemo, type ReactNode } from "react";
import { usePublicRightSidebarPane } from "@/components/PublicRightSidebar";
import { PublicLandingLogoLinkProvider } from "@/contexts/PublicLandingLogoLinkContext";
import { SidebarProvider } from "@/components/sidebar";
import {
  WorkspaceLayoutV2FullPage,
  WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX,
} from "@/components/workspace-layout-v2/WorkspaceLayoutV2";
import { type WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import { useLocalStorageWorkspaceSidebarState } from "@/hooks/useLocalStorageWorkspaceSidebarState";
import type { MobileSidebarPane } from "@/hooks/use-sidebar";
import type { WorkspaceSidebarState } from "../convex/workspaceSidebarStateModel";

const PUBLIC_LAYOUT_SIDEBAR_STORAGE_KEY = "noter_public_layout_sidebar_state";
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
  const hasLeftPane = left !== undefined;
  const publicRightSidebarPane = usePublicRightSidebarPane();
  const defaultSidebarState = useMemo(
    () =>
      ({
        leftDesktopOpen: hasLeftPane && defaultLeftOpen,
        leftDesktopWidthPx: hasLeftPane
          ? PUBLIC_LAYOUT_LEFT_SIDEBAR_DEFAULT_WIDTH_PX
          : WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
        leftMobileWidthPx: hasLeftPane
          ? PUBLIC_LAYOUT_LEFT_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX
          : WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX,
        mobilePane: defaultMobilePane,
        rightDesktopOpen: true,
        rightDesktopWidthPx: PUBLIC_LAYOUT_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX,
        rightMobileWidthPx: PUBLIC_LAYOUT_RIGHT_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX,
      }) satisfies WorkspaceSidebarState,
    [defaultLeftOpen, defaultMobilePane, hasLeftPane],
  );
  const sidebarState = useLocalStorageWorkspaceSidebarState({
    defaults: defaultSidebarState,
    storageKey: PUBLIC_LAYOUT_SIDEBAR_STORAGE_KEY,
  });

  return (
    <PublicLandingLogoLinkProvider>
      <SidebarProvider
        leftOpen={sidebarState.leftDesktopOpen}
        onLeftOpenChange={sidebarState.setLeftDesktopOpen}
        rightOpen={sidebarState.rightDesktopOpen}
        onRightOpenChange={sidebarState.setRightDesktopOpen}
        leftDesktopWidthPx={sidebarState.leftDesktopWidthPx}
        onLeftDesktopWidthPxChange={sidebarState.setLeftDesktopWidthPx}
        rightDesktopWidthPx={sidebarState.rightDesktopWidthPx}
        onRightDesktopWidthPxChange={sidebarState.setRightDesktopWidthPx}
        leftMobileWidthPx={sidebarState.leftMobileWidthPx}
        onLeftMobileWidthPxChange={sidebarState.setLeftMobileWidthPx}
        rightMobileWidthPx={sidebarState.rightMobileWidthPx}
        onRightMobileWidthPxChange={sidebarState.setRightMobileWidthPx}
        mobilePane={sidebarState.mobilePane}
        onMobilePaneChange={sidebarState.setMobilePane}
        shortcutSidebarSide="right"
      >
        <WorkspaceLayoutV2FullPage
          left={left}
          main={{
            content: (
              <div className="flex h-full min-h-0 flex-col">{children}</div>
            ),
          }}
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
