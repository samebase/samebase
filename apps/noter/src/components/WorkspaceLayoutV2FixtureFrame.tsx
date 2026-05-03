import { type ComponentProps } from "react";
import { type MobileSidebarPane, type SidebarSide } from "@/hooks/use-sidebar";
import { Layout } from "@/Layout";
import { SidebarProvider } from "@/components/sidebar";
import { WorkspaceLayoutV2FullPage } from "@/components/workspace-layout-v2/WorkspaceLayoutV2";

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
  return (
    <Layout>
      <SidebarProvider
        defaultOpen={defaultOpen}
        defaultLeftDesktopWidthPx={desktopSidebarWidthPx}
        defaultLeftMobileWidthPx={WORKSPACE_LAYOUT_V2_FIXTURE_SIDEBAR_WIDTH_PX}
        defaultRightOpen={defaultRightOpen}
        defaultRightDesktopWidthPx={desktopSidebarWidthPx}
        defaultRightMobileWidthPx={WORKSPACE_LAYOUT_V2_FIXTURE_SIDEBAR_WIDTH_PX}
        mobilePane={mobilePane}
        rightMobileWidthPx={rightMobileWidthPx}
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
      </SidebarProvider>
    </Layout>
  );
}
