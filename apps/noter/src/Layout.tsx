import { useEffect, useMemo, type ComponentProps, type ReactNode } from "react";
import { usePublicRightSidebarPane } from "@/components/PublicRightSidebar";
import { Button } from "@/components/ui/button";
import { PublicLandingLogoLinkProvider } from "@/contexts/PublicLandingLogoLinkContext";
import { WorkspaceLayoutV2FullPage } from "@/components/workspace-layout-v2/WorkspaceLayoutV2FullPage";
import {
  useWorkspacePaneActions,
  WorkspacePaneRuntimeProvider,
} from "@/components/workspace-layout-v2/WorkspacePaneRuntime";
import {
  WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX,
} from "@/components/workspace-layout-v2/WorkspaceLayoutV2Geometry";
import { type WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import { useLocalStorageWorkspaceSidebarState } from "@/hooks/useLocalStorageWorkspaceSidebarState";
import {
  PUBLIC_LAYOUT_SIDEBAR_STORAGE_KEY,
  isPublicLayoutSidebarResetRequested,
} from "@/lib/publicLayoutSidebarPreferences";
import { sanitizePublicLayoutSidebarState } from "@/lib/publicLayoutSidebarState";
import { readRootRouteSearch } from "@/lib/rootRouteSearch";
import { useLocation } from "@tanstack/react-router";
import { PanelRight } from "lucide-react";
import type {
  WorkspaceMobileSidebarPane,
  WorkspaceSidebarState,
} from "../convex/workspaceSidebarStateModel";

const PUBLIC_LAYOUT_LEFT_SIDEBAR_DEFAULT_WIDTH_PX = 240;
const PUBLIC_LAYOUT_LEFT_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX = 240;
const PUBLIC_LAYOUT_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX = 288;
const PUBLIC_LAYOUT_RIGHT_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX = 288;

type WorkspaceLayoutV2FullPageProps = ComponentProps<
  typeof WorkspaceLayoutV2FullPage
>;
type PublicLayoutRightToggleVisibility = NonNullable<
  WorkspaceLayoutV2FullPageProps["rightToggleVisibility"]
>;
type VisiblePublicLayoutRightToggleVisibility = Exclude<
  PublicLayoutRightToggleVisibility,
  "hidden"
>;

const PUBLIC_LAYOUT_RIGHT_TOGGLE_BUTTON_CLASS_NAMES = {
  all: "absolute right-0 top-0 z-20 h-8 w-8 rounded-none",
  desktop:
    "absolute right-0 top-0 z-20 hidden h-8 w-8 rounded-none md:inline-flex",
} as const satisfies Record<VisiblePublicLayoutRightToggleVisibility, string>;

function PublicLayoutRightSidebarOverlayToggle({
  visibility,
}: {
  visibility: VisiblePublicLayoutRightToggleVisibility;
}) {
  const { toggleRightPane } = useWorkspacePaneActions();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Toggle Right Sidebar"
      className={PUBLIC_LAYOUT_RIGHT_TOGGLE_BUTTON_CLASS_NAMES[visibility]}
      onClick={toggleRightPane}
    >
      <PanelRight className="h-4 w-4 rotate-180" />
    </Button>
  );
}

function PublicLayoutMainContent({
  children,
  rightToggleVisibility,
}: {
  children?: ReactNode;
  rightToggleVisibility: PublicLayoutRightToggleVisibility;
}) {
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {rightToggleVisibility === "hidden" ? null : (
        <PublicLayoutRightSidebarOverlayToggle
          visibility={rightToggleVisibility}
        />
      )}
      {children}
    </div>
  );
}

export function PublicLayoutShell({
  children,
  dataTestId,
  defaultLeftOpen = false,
  defaultMobilePane = "main",
  left,
  leftToggleVisibility = "hidden",
  main,
  rightToggleVisibility = "desktop",
}: {
  children?: ReactNode;
  dataTestId?: WorkspaceLayoutV2FullPageProps["dataTestId"];
  defaultLeftOpen?: boolean;
  defaultMobilePane?: WorkspaceMobileSidebarPane;
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
        mobileSurface: { kind: "unmerged" },
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
  const setSidebarState = sidebarState.setState;
  const storedMobileSurface = sidebarState.state.mobileSurface;
  // If a public route has no left pane, a stored left merge cannot be rendered
  // later as a surprise when another public route does have a left pane.
  useEffect(() => {
    if (
      hasLeftPane ||
      storedMobileSurface.kind !== "merged" ||
      storedMobileSurface.side !== "left"
    ) {
      return;
    }

    setSidebarState(
      (state) =>
        state.mobileSurface.kind === "merged" &&
        state.mobileSurface.side === "left"
          ? { ...state, mobileSurface: { kind: "unmerged" } }
          : state,
      "immediate",
    );
  }, [hasLeftPane, setSidebarState, storedMobileSurface]);
  const layoutSidebarStateController = sanitizePublicLayoutSidebarState({
    defaultSidebarState,
    hasLeftPane,
    sidebarState,
  });
  const publicRightSidebarPane = usePublicRightSidebarPane();
  const hasMainHeader = Boolean(main?.header);
  const layoutRightToggleVisibility = hasMainHeader
    ? rightToggleVisibility
    : "hidden";
  const mainPane =
    main === undefined
      ? ({
          content: (
            <PublicLayoutMainContent
              rightToggleVisibility={rightToggleVisibility}
            >
              {children}
            </PublicLayoutMainContent>
          ),
        } satisfies WorkspaceLayoutV2PaneFrameProps)
      : hasMainHeader
        ? main
        : ({
            ...main,
            content: (
              <PublicLayoutMainContent
                rightToggleVisibility={rightToggleVisibility}
              >
                {main.content}
              </PublicLayoutMainContent>
            ),
          } satisfies WorkspaceLayoutV2PaneFrameProps);

  return (
    <PublicLandingLogoLinkProvider>
      <WorkspacePaneRuntimeProvider
        controller={layoutSidebarStateController}
        shortcutPaneSide="right"
      >
        <WorkspaceLayoutV2FullPage
          dataTestId={dataTestId}
          left={left}
          main={mainPane}
          right={publicRightSidebarPane}
          leftToggleVisibility={leftToggleVisibility}
          rightToggleVisibility={layoutRightToggleVisibility}
        />
      </WorkspacePaneRuntimeProvider>
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
