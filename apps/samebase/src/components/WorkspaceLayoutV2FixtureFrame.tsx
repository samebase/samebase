import { type ReactNode } from "react";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import type { WorkspaceLayoutV2MobileMinResizeBehavior } from "@samebase/workspace-layout/geometry";
import type { WorkspaceLayoutV2PaneFrameProps } from "@samebase/workspace-layout/pane-frame";
import { type WorkspacePaneSide } from "@samebase/workspace-layout/runtime";

type WorkspaceLayoutV2FixtureFrameProps = {
  children?: ReactNode;
  left?: WorkspaceLayoutV2PaneFrameProps;
  main: {
    content: ReactNode;
    headerAccessory?: ReactNode;
  };
  mobileMinResizeBehavior?: WorkspaceLayoutV2MobileMinResizeBehavior;
  right?: WorkspaceLayoutV2PaneFrameProps;
  shortcutPaneSide?: WorkspacePaneSide;
};

/**
 * Visual fixture modes use the same app workspace shell as production routes.
 */
export function WorkspaceLayoutV2FixtureFrame({
  children,
  left,
  main,
  mobileMinResizeBehavior,
  right,
  shortcutPaneSide,
}: WorkspaceLayoutV2FixtureFrameProps) {
  return (
    <AppWorkspaceRouteChrome
      headerAccessory={main.headerAccessory}
      left={left ?? null}
      mobileMinResizeBehavior={mobileMinResizeBehavior}
      right={right ?? null}
      shortcutPaneSide={shortcutPaneSide}
    >
      {main.content}
      {children}
    </AppWorkspaceRouteChrome>
  );
}
