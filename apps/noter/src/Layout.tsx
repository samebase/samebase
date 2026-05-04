import { useMemo, type ComponentProps, type ReactNode } from "react";
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
import {
  PUBLIC_LAYOUT_SIDEBAR_STORAGE_KEY,
  isPublicLayoutSidebarResetRequested,
} from "@/lib/publicLayoutSidebarPreferences";
import { readRootRouteSearch } from "@/lib/rootRouteSearch";
import { useLocation } from "@tanstack/react-router";
import type { WorkspaceSidebarState } from "../convex/workspaceSidebarStateModel";

const PUBLIC_LAYOUT_LEFT_SIDEBAR_DEFAULT_WIDTH_PX = 240;
const PUBLIC_LAYOUT_LEFT_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX = 240;
const PUBLIC_LAYOUT_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX = 288;
const PUBLIC_LAYOUT_RIGHT_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX = 288;

type WorkspaceLayoutV2FullPageProps = ComponentProps<
  typeof WorkspaceLayoutV2FullPage
>;

export function PublicLayoutShell({
  children,
  dataTestId,
  defaultLeftOpen = false,
  defaultMobilePane = "main",
  left,
  leftToggleVisibility = "hidden",
  main,
  rightToggleVisibility = "hidden",
}: {
  children?: ReactNode;
  dataTestId?: WorkspaceLayoutV2FullPageProps["dataTestId"];
  defaultLeftOpen?: boolean;
  defaultMobilePane?: MobileSidebarPane;
  left?: WorkspaceLayoutV2PaneFrameProps;
  leftToggleVisibility?: WorkspaceLayoutV2FullPageProps["leftToggleVisibility"];
  main?: WorkspaceLayoutV2PaneFrameProps;
  rightToggleVisibility?: WorkspaceLayoutV2FullPageProps["rightToggleVisibility"];
}) {
  const hasLeftPane = left !== undefined;
  const location = useLocation();
  const rootRouteSearch = readRootRouteSearch(location.searchStr);
  const sidebarResetRequested =
    isPublicLayoutSidebarResetRequested(rootRouteSearch);
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
    reset: sidebarResetRequested,
    storageKey: PUBLIC_LAYOUT_SIDEBAR_STORAGE_KEY,
  });
  const publicRightSidebarPane = usePublicRightSidebarPane();
  const mainPane =
    main ??
    ({
      content: <div className="flex h-full min-h-0 flex-col">{children}</div>,
    } satisfies WorkspaceLayoutV2PaneFrameProps);

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
          dataTestId={dataTestId}
          left={left}
          main={mainPane}
          right={publicRightSidebarPane}
          leftToggleVisibility={leftToggleVisibility}
          rightToggleVisibility={rightToggleVisibility}
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
