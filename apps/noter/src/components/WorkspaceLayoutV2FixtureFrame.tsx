import { type ReactNode } from "react";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { type WorkspacePaneSide } from "@/components/workspace-layout-v2/WorkspacePaneRuntime";
import type { WorkspaceLayoutV2BottomPanelProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2BottomPanel";
import type { WorkspaceLayoutV2MobileMinResizeBehavior } from "@/components/workspace-layout-v2/WorkspaceLayoutV2Geometry";
import type { WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";

type WorkspaceLayoutV2FixtureFrameProps = {
  children?: ReactNode;
  dataTestId: string;
  left?: WorkspaceLayoutV2PaneFrameProps;
  main: {
    content: ReactNode;
    headerAccessory?: ReactNode;
  };
  mobileMinResizeBehavior?: WorkspaceLayoutV2MobileMinResizeBehavior;
  panel?: WorkspaceLayoutV2BottomPanelProps;
  right?: WorkspaceLayoutV2PaneFrameProps;
  shortcutPaneSide?: WorkspacePaneSide;
};

/**
 * Visual fixture modes use the same app workspace shell as production routes.
 */
export function WorkspaceLayoutV2FixtureFrame({
  children,
  dataTestId,
  left,
  main,
  mobileMinResizeBehavior,
  panel,
  right,
  shortcutPaneSide,
}: WorkspaceLayoutV2FixtureFrameProps) {
  return (
    <AppWorkspaceRouteChrome
      dataTestId={dataTestId}
      headerAccessory={main.headerAccessory}
      left={left ?? null}
      mobileMinResizeBehavior={mobileMinResizeBehavior}
      panel={panel}
      right={right ?? null}
      shortcutPaneSide={shortcutPaneSide}
    >
      {main.content}
      {children}
    </AppWorkspaceRouteChrome>
  );
}
