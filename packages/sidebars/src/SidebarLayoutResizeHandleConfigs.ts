import {
  SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  clampNumber,
  type MobilePane,
} from "./SidebarLayoutGeometryInternal.ts";

export type SidebarLayoutResizeHandleConfig = {
  currentWidthPx: number;
  maxWidthPx: number;
  minWidthPx: number;
  onWidthChange: (nextWidthPx: number) => void;
  positionPx: number;
  side: "left" | "right";
};

export function getSidebarLayoutDesktopResizeHandles(args: {
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
          maxWidthPx: args.desktopSidebarMaxWidthPx,
          minWidthPx: SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
          onWidthChange: (nextWidthPx: number) => {
            args.setLeftDesktopWidthPx(
              clampNumber(
                Math.round(nextWidthPx),
                SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
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
          maxWidthPx: args.desktopSidebarMaxWidthPx,
          minWidthPx: SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
          onWidthChange: (nextWidthPx: number) => {
            args.setRightDesktopWidthPx(
              clampNumber(
                Math.round(nextWidthPx),
                SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
                args.desktopSidebarMaxWidthPx,
              ),
            );
          },
          positionPx: args.viewportWidthPx - args.desktopRightWidthPx,
          side: "right" as const,
        }
      : null,
  ].filter((resizeHandle) => resizeHandle !== null);
}

export function getSidebarLayoutMobileResizeHandles(args: {
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
  viewportWidthPx: number;
}) {
  if (args.viewportWidthPx <= 0 || !args.isMobilePaneSettled) {
    return [];
  }

  return [
    args.hasLeftPane && args.mobilePane === "left"
      ? {
          currentWidthPx: args.mobileLeftWidthPx,
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
  ].filter((resizeHandle) => resizeHandle !== null);
}
