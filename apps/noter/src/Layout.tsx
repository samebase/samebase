import { useMemo, useRef, type ReactNode } from "react";
import { usePublicRightSidebarPane } from "@/components/PublicRightSidebar";
import { RouteUrlEditor } from "@/components/RouteUrlEditor";
import { PublicLandingLogoLinkProvider } from "@/contexts/PublicLandingLogoLinkContext";
import { WorkspaceLayoutV2FullPage } from "@/components/workspace-layout-v2/WorkspaceLayoutV2FullPage";
import { WorkspacePaneRuntimeProvider } from "@/components/workspace-layout-v2/WorkspacePaneRuntime";
import { type WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import { useLocalStorageWorkspaceSidebarState } from "@/hooks/useLocalStorageWorkspaceSidebarState";
import {
  PUBLIC_LAYOUT_SIDEBAR_STORAGE_KEY,
  isPublicLayoutSidebarResetRequested,
} from "@/lib/publicLayoutSidebarPreferences";
import { readRootRouteSearch } from "@/lib/rootRouteSearch";
import { useLocation } from "@tanstack/react-router";
import type {
  WorkspaceMobileSidebarPane,
  WorkspaceSidebarState,
} from "../convex/workspaceSidebarStateModel";

const PUBLIC_LAYOUT_LEFT_SIDEBAR_DEFAULT_WIDTH_PX = 240;
const PUBLIC_LAYOUT_LEFT_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX = 240;
const PUBLIC_LAYOUT_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX = 288;
const PUBLIC_LAYOUT_RIGHT_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX = 288;
const PUBLIC_LAYOUT_DATA_TEST_ID = "public-layout-workspace";

function PublicLayoutMainContent({ children }: { children?: ReactNode }) {
  return <div className="relative flex h-full min-h-0 flex-col">{children}</div>;
}

export type PublicLayoutShellProps = {
  children?: ReactNode;
  defaultMobilePane?: WorkspaceMobileSidebarPane;
  left?: WorkspaceLayoutV2PaneFrameProps;
  main?: WorkspaceLayoutV2PaneFrameProps;
};

export function PublicLayoutShell({
  children,
  defaultMobilePane,
  left,
  main,
}: PublicLayoutShellProps) {
  // Public routes always mount both side panes so the URL editor and suggestion
  // popup keep the same horizontal frame while moving through route paths.
  const leftPane = left ?? {};
  const routeHasLeftContent = left !== undefined;
  const resolvedDefaultMobilePane = defaultMobilePane ?? (routeHasLeftContent ? "left" : "main");
  const location = useLocation();
  const initialPathnameRef = useRef(location.pathname);
  const applyDefaultChanges = location.pathname === initialPathnameRef.current;
  const rootRouteSearch = readRootRouteSearch(location.searchStr);
  const sidebarResetRequested = isPublicLayoutSidebarResetRequested(rootRouteSearch);
  const defaultSidebarState = useMemo(
    () =>
      ({
        leftDesktopOpen: true,
        leftDesktopWidthPx: PUBLIC_LAYOUT_LEFT_SIDEBAR_DEFAULT_WIDTH_PX,
        leftMobileWidthPx: PUBLIC_LAYOUT_LEFT_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX,
        mobilePane: resolvedDefaultMobilePane,
        mobileSurface: { kind: "unmerged" },
        rightDesktopOpen: true,
        rightDesktopWidthPx: PUBLIC_LAYOUT_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX,
        rightMobileWidthPx: PUBLIC_LAYOUT_RIGHT_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX,
      }) satisfies WorkspaceSidebarState,
    [resolvedDefaultMobilePane],
  );
  const sidebarState = useLocalStorageWorkspaceSidebarState({
    applyDefaultChanges,
    defaults: defaultSidebarState,
    reset: sidebarResetRequested,
    storageKey: PUBLIC_LAYOUT_SIDEBAR_STORAGE_KEY,
  });
  const publicRightSidebarPane = usePublicRightSidebarPane();
  const rightPane = publicRightSidebarPane;
  // No main or header === undefined means the public shell owns the URL header
  // and body wrapper; an explicit header, even null, preserves caller chrome.
  const mainHeader = main?.header === undefined ? <RouteUrlEditor /> : main.header;
  const hasMainHeader = Boolean(mainHeader);
  const rightToggleVisibility = hasMainHeader ? "desktop" : "hidden";
  const mainContent = main === undefined ? children : main.content;
  const shouldWrapMainContent = main?.header === undefined || !hasMainHeader;
  const mainPane = {
    ...(main ?? {}),
    header: mainHeader,
    content: shouldWrapMainContent ? (
      <PublicLayoutMainContent>{mainContent}</PublicLayoutMainContent>
    ) : (
      mainContent
    ),
  } satisfies WorkspaceLayoutV2PaneFrameProps;

  return (
    <PublicLandingLogoLinkProvider>
      <WorkspacePaneRuntimeProvider controller={sidebarState} shortcutPaneSide="right">
        <WorkspaceLayoutV2FullPage
          dataTestId={PUBLIC_LAYOUT_DATA_TEST_ID}
          left={leftPane}
          main={mainPane}
          right={rightPane}
          leftToggleVisibility="desktop"
          rightToggleVisibility={rightToggleVisibility}
        />
      </WorkspacePaneRuntimeProvider>
    </PublicLandingLogoLinkProvider>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return <main className="flex min-h-svh w-full flex-col bg-background">{children}</main>;
}
