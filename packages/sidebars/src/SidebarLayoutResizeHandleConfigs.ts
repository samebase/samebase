import { clampNumber, type MobilePane } from "./SidebarLayoutGeometryInternal.ts";

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
  desktopMainMinWidthPx: number;
  desktopSidebarMinWidthPx: number;
  hasLeftPane: boolean;
  hasRightPane: boolean;
  leftDesktopOpen: boolean;
  rightDesktopOpen: boolean;
  setDesktopWidths: (widths: { leftWidthPx: number; rightWidthPx: number }) => void;
  viewportWidthPx: number;
}) {
  if (args.viewportWidthPx <= 0) {
    return [];
  }

  const availableWidthPx = Math.floor(args.viewportWidthPx) - args.desktopMainMinWidthPx;

  return (["left", "right"] as const).flatMap((side) => {
    const isOpen =
      side === "left"
        ? args.hasLeftPane && args.leftDesktopOpen
        : args.hasRightPane && args.rightDesktopOpen;
    if (!isOpen) return [];

    const oppositeOpen =
      side === "left"
        ? args.hasRightPane && args.rightDesktopOpen
        : args.hasLeftPane && args.leftDesktopOpen;
    const currentWidthPx = side === "left" ? args.desktopLeftWidthPx : args.desktopRightWidthPx;
    const oppositeWidthPx = side === "left" ? args.desktopRightWidthPx : args.desktopLeftWidthPx;
    const maxWidthPx = availableWidthPx - (oppositeOpen ? args.desktopSidebarMinWidthPx : 0);

    return [
      {
        currentWidthPx,
        maxWidthPx,
        minWidthPx: args.desktopSidebarMinWidthPx,
        onWidthChange: (nextWidthPx: number) => {
          const widthPx = clampNumber(
            Math.round(nextWidthPx),
            args.desktopSidebarMinWidthPx,
            maxWidthPx,
          );
          const nextOppositeWidthPx = Math.min(oppositeWidthPx, availableWidthPx - widthPx);

          args.setDesktopWidths({
            leftWidthPx: side === "left" ? widthPx : nextOppositeWidthPx,
            rightWidthPx: side === "right" ? widthPx : nextOppositeWidthPx,
          });
        },
        positionPx: side === "left" ? currentWidthPx : args.viewportWidthPx - currentWidthPx,
        side,
      },
    ];
  });
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
