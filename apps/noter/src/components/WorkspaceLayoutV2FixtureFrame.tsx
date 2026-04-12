import { type ComponentProps } from "react";
import { type SidebarSide } from "@/hooks/use-sidebar";
import { AppPageFrame } from "@/components/AppPageFrame";
import { SidebarProvider } from "@/components/sidebar";
import { WorkspaceLayoutV2FullPage } from "@/components/workspace-layout-v2/WorkspaceLayoutV2";

const WORKSPACE_LAYOUT_V2_FIXTURE_SIDEBAR_WIDTH_PX = 320;

type WorkspaceLayoutV2FixtureFrameProps = ComponentProps<
  typeof WorkspaceLayoutV2FullPage
> & {
  dataTestId: string;
  defaultOpen?: boolean;
  defaultRightOpen?: boolean;
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
  shortcutSidebarSide,
  left,
  main,
  panel,
  right,
}: WorkspaceLayoutV2FixtureFrameProps) {
  return (
    <AppPageFrame dataTestId={dataTestId}>
      <SidebarProvider
        className="flex-1 h-full min-h-0"
        defaultOpen={defaultOpen}
        defaultLeftDesktopWidthPx={WORKSPACE_LAYOUT_V2_FIXTURE_SIDEBAR_WIDTH_PX}
        defaultLeftMobileWidthPx={WORKSPACE_LAYOUT_V2_FIXTURE_SIDEBAR_WIDTH_PX}
        defaultRightOpen={defaultRightOpen}
        defaultRightDesktopWidthPx={
          WORKSPACE_LAYOUT_V2_FIXTURE_SIDEBAR_WIDTH_PX
        }
        defaultRightMobileWidthPx={WORKSPACE_LAYOUT_V2_FIXTURE_SIDEBAR_WIDTH_PX}
        shortcutSidebarSide={shortcutSidebarSide}
      >
        <WorkspaceLayoutV2FullPage
          left={left}
          main={main}
          panel={panel}
          right={right}
        />
      </SidebarProvider>
    </AppPageFrame>
  );
}
