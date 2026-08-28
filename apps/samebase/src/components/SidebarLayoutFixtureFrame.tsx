import { type ReactNode } from "react";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import type { SidebarLayoutMobileMinResizeBehavior } from "@samebase/sidebars/geometry";
import type { PaneFrameProps } from "@samebase/sidebars/pane-frame";
import { type SidebarSide } from "@samebase/sidebars/runtime";

type SidebarLayoutFixtureFrameProps = {
  children?: ReactNode;
  left?: PaneFrameProps;
  main: {
    content: ReactNode;
    headerAccessory?: ReactNode;
  };
  mobileMinResizeBehavior?: SidebarLayoutMobileMinResizeBehavior;
  right?: PaneFrameProps;
  shortcutPaneSide?: SidebarSide;
};

/**
 * Visual fixture modes use the same app workspace shell as production routes.
 */
export function SidebarLayoutFixtureFrame({
  children,
  left,
  main,
  mobileMinResizeBehavior,
  right,
  shortcutPaneSide,
}: SidebarLayoutFixtureFrameProps) {
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
