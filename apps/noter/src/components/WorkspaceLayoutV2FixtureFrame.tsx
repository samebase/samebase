import { type ComponentProps } from "react";
import { type MobileSidebarPane, type SidebarSide } from "@/hooks/use-sidebar";
import { Layout } from "@/Layout";
import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";
import { WorkspaceLayoutV2FullPage } from "@/components/workspace-layout-v2/WorkspaceLayoutV2FullPage";
import { WorkspaceLayoutV2MemorySidebarProvider } from "@/components/workspace-layout-v2/WorkspaceLayoutV2MemorySidebarProvider";

const WORKSPACE_LAYOUT_V2_FIXTURE_SIDEBAR_WIDTH_PX = 320;

type WorkspaceLayoutV2FixtureFrameProps = ComponentProps<
  typeof WorkspaceLayoutV2FullPage
> & {
  dataTestId: string;
  defaultOpen?: boolean;
  defaultRightOpen?: boolean;
  desktopSidebarWidthPx?: number;
  mobilePane?: MobileSidebarPane;
  rightMobileWidthPx?: number;
  shortcutSidebarSide?: SidebarSide;
};

/**
 * Keep visual fixtures on one shared v2 shell so route-specific tests stop
 * re-implementing wrapper chrome, sidebar sizing, and page containment.
 */
export function WorkspaceLayoutV2FixtureFrame({
  dataTestId,
  defaultOpen = true,
  defaultRightOpen = true,
  desktopSidebarWidthPx = WORKSPACE_LAYOUT_V2_FIXTURE_SIDEBAR_WIDTH_PX,
  mobilePane,
  rightMobileWidthPx,
  shortcutSidebarSide,
  left,
  main,
  mobileMinResizeBehavior,
  panel,
  right,
  showMobileResizeGripDots,
}: WorkspaceLayoutV2FixtureFrameProps) {
  const initialSidebarState = {
    leftDesktopOpen: defaultOpen,
    leftDesktopWidthPx: desktopSidebarWidthPx,
    leftMobileWidthPx: WORKSPACE_LAYOUT_V2_FIXTURE_SIDEBAR_WIDTH_PX,
    mobilePane: mobilePane ?? "main",
    rightDesktopOpen: defaultRightOpen,
    rightDesktopWidthPx: desktopSidebarWidthPx,
    rightMobileWidthPx:
      rightMobileWidthPx ?? WORKSPACE_LAYOUT_V2_FIXTURE_SIDEBAR_WIDTH_PX,
  } satisfies WorkspaceSidebarState;

  return (
    <Layout>
      <WorkspaceLayoutV2MemorySidebarProvider
        initialState={initialSidebarState}
        shortcutSidebarSide={shortcutSidebarSide}
      >
        <WorkspaceLayoutV2FullPage
          dataTestId={dataTestId}
          left={left}
          main={main}
          mobileMinResizeBehavior={mobileMinResizeBehavior}
          panel={panel}
          right={right}
          showMobileResizeGripDots={showMobileResizeGripDots}
        />
      </WorkspaceLayoutV2MemorySidebarProvider>
    </Layout>
  );
}
