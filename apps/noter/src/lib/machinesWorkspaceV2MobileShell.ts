import type { MobileSidebarPane } from "@/hooks/use-sidebar";

export function readMachinesV2MobilePaneAnchorPx(args: {
  leftSidebarWidthPx: number;
  pane: MobileSidebarPane;
  rightSidebarWidthPx: number;
}) {
  if (args.pane === "left") {
    return 0;
  }

  if (args.pane === "right") {
    return args.leftSidebarWidthPx + args.rightSidebarWidthPx;
  }

  return args.leftSidebarWidthPx;
}

export function readMachinesV2MobileDragOffsetRange(args: {
  currentPane: MobileSidebarPane;
  leftSidebarWidthPx: number;
  rightSidebarWidthPx: number;
}) {
  if (args.currentPane === "left") {
    return {
      maxOffsetPx: 0,
      minOffsetPx: -args.leftSidebarWidthPx,
    };
  }

  if (args.currentPane === "right") {
    return {
      maxOffsetPx: args.rightSidebarWidthPx,
      minOffsetPx: 0,
    };
  }

  return {
    maxOffsetPx: args.leftSidebarWidthPx,
    minOffsetPx: -args.rightSidebarWidthPx,
  };
}

export function readMachinesV2SettledMobilePane(args: {
  currentPane: MobileSidebarPane;
  dragOffsetPx: number;
  leftSidebarWidthPx: number;
  rightSidebarWidthPx: number;
}) {
  if (
    args.currentPane === "main" &&
    args.dragOffsetPx >= args.leftSidebarWidthPx / 2
  ) {
    return "left";
  }

  if (
    args.currentPane === "main" &&
    args.dragOffsetPx <= -args.rightSidebarWidthPx / 2
  ) {
    return "right";
  }

  if (
    args.currentPane === "left" &&
    args.dragOffsetPx <= -args.leftSidebarWidthPx / 2
  ) {
    return "main";
  }

  if (
    args.currentPane === "right" &&
    args.dragOffsetPx >= args.rightSidebarWidthPx / 2
  ) {
    return "main";
  }

  return args.currentPane;
}
