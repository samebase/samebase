import { clampNumber } from "@/lib/clampNumber";
import {
  WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  type MobilePane,
} from "./WorkspaceLayoutV2Geometry";

export type WorkspaceLayoutV2ResizeHandleConfig = {
  currentWidthPx: number;
  dataTestId: string;
  maxWidthPx: number;
  minWidthPx: number;
  onWidthChange: (nextWidthPx: number) => void;
  positionPx: number;
  side: "left" | "right";
};

function isWorkspaceLayoutV2ResizeHandleConfig(
  resizeHandle: WorkspaceLayoutV2ResizeHandleConfig | null,
): resizeHandle is WorkspaceLayoutV2ResizeHandleConfig {
  return resizeHandle !== null;
}

export function getWorkspaceLayoutV2DesktopResizeHandles(args: {
  desktopLeftWidthPx: number;
  desktopRightWidthPx: number;
  desktopSidebarMaxWidthPx: number;
  hasLeftPane: boolean;
  hasRightPane: boolean;
  leftDesktopOpen: boolean;
  rightDesktopOpen: boolean;
  setLeftDesktopWidthPx: (nextWidthPx: number) => void;
  setRightDesktopWidthPx: (nextWidthPx: number) => void;
  viewportWidthPx: number;
}) {
  if (args.viewportWidthPx <= 0) {
    return [];
  }

  return [
    args.hasLeftPane && args.leftDesktopOpen
      ? {
          currentWidthPx: args.desktopLeftWidthPx,
          dataTestId: "workspace-layout-v2-left-resize",
          maxWidthPx: args.desktopSidebarMaxWidthPx,
          minWidthPx: WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
          onWidthChange: (nextWidthPx: number) => {
            args.setLeftDesktopWidthPx(
              clampNumber(
                Math.round(nextWidthPx),
                WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
                args.desktopSidebarMaxWidthPx,
              ),
            );
          },
          positionPx: args.desktopLeftWidthPx,
          side: "left" as const,
        }
      : null,
    args.hasRightPane && args.rightDesktopOpen
      ? {
          currentWidthPx: args.desktopRightWidthPx,
          dataTestId: "workspace-layout-v2-right-resize",
          maxWidthPx: args.desktopSidebarMaxWidthPx,
          minWidthPx: WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
          onWidthChange: (nextWidthPx: number) => {
            args.setRightDesktopWidthPx(
              clampNumber(
                Math.round(nextWidthPx),
                WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
                args.desktopSidebarMaxWidthPx,
              ),
            );
          },
          positionPx: args.viewportWidthPx - args.desktopRightWidthPx,
          side: "right" as const,
        }
      : null,
  ].filter(isWorkspaceLayoutV2ResizeHandleConfig);
}

/**
 * Builds visible mobile grip handles only when the selected pane is settled;
 * otherwise an invisible grip could steal touch input from the pane content.
 */
export function getWorkspaceLayoutV2MobileResizeHandles(args: {
  hasLeftPane: boolean;
  hasRightPane: boolean;
  isMobilePaneSettled: boolean;
  mobileLeftWidthPx: number;
  mobilePane: MobilePane;
  mobileRightWidthPx: number;
  mobileSidebarMaxWidthPx: number;
  mobileSidebarMinWidthPx: number;
  setLeftMobileWidthPx: (nextWidthPx: number) => void;
  setRightMobileWidthPx: (nextWidthPx: number) => void;
  shouldShowMobileResizeGripDots: boolean;
  viewportWidthPx: number;
}) {
  if (
    args.viewportWidthPx <= 0 ||
    !args.isMobilePaneSettled ||
    !args.shouldShowMobileResizeGripDots
  ) {
    return [];
  }

  return [
    args.hasLeftPane && args.mobilePane === "left"
      ? {
          currentWidthPx: args.mobileLeftWidthPx,
          dataTestId: "workspace-layout-v2-left-resize",
          maxWidthPx: args.mobileSidebarMaxWidthPx,
          minWidthPx: args.mobileSidebarMinWidthPx,
          onWidthChange: (nextWidthPx: number) => {
            args.setLeftMobileWidthPx(
              clampNumber(
                Math.round(nextWidthPx),
                args.mobileSidebarMinWidthPx,
                args.mobileSidebarMaxWidthPx,
              ),
            );
          },
          positionPx: args.mobileLeftWidthPx,
          side: "left" as const,
        }
      : null,
    args.hasRightPane && args.mobilePane === "right"
      ? {
          currentWidthPx: args.mobileRightWidthPx,
          dataTestId: "workspace-layout-v2-right-resize",
          maxWidthPx: args.mobileSidebarMaxWidthPx,
          minWidthPx: args.mobileSidebarMinWidthPx,
          onWidthChange: (nextWidthPx: number) => {
            args.setRightMobileWidthPx(
              clampNumber(
                Math.round(nextWidthPx),
                args.mobileSidebarMinWidthPx,
                args.mobileSidebarMaxWidthPx,
              ),
            );
          },
          positionPx: args.viewportWidthPx - args.mobileRightWidthPx,
          side: "right" as const,
        }
      : null,
  ].filter(isWorkspaceLayoutV2ResizeHandleConfig);
}
