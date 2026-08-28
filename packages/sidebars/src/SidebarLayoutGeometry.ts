import type { MobilePane, MobileSurface, SidebarSide } from "./SidebarLayoutState.ts";

export type { MobilePane } from "./SidebarLayoutState.ts";

export const SIDEBAR_LAYOUT_DESKTOP_MIN_WIDTH_PX = 768;
export const SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX = 160;
export const SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MAX_WIDTH_RATIO = 0.45;
export const SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_PX = 175;
export const SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_RATIO = 1 / 3;
export const SIDEBAR_LAYOUT_MOBILE_MAIN_PEEK_WIDTH_PX = 40;
export const SIDEBAR_LAYOUT_MOBILE_MERGE_INTENT_WIDTH_PX = 10;
export const SIDEBAR_LAYOUT_MOBILE_MERGED_FIT_MIN_VIEWPORT_WIDTH_PX = 320;
export const SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX =
  SIDEBAR_LAYOUT_MOBILE_MERGED_FIT_MIN_VIEWPORT_WIDTH_PX -
  Math.floor(
    SIDEBAR_LAYOUT_MOBILE_MERGED_FIT_MIN_VIEWPORT_WIDTH_PX *
      SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_RATIO,
  );
export const MOBILE_PANE_SETTLED_TOLERANCE_PX = 1;

const MOBILE_PANE_ORDER = ["left", "main", "right"] as const;
const MOBILE_PANE_ORDER_WITHOUT_MAIN = ["left", "right"] as const;
const MOBILE_PANE_ORDER_WITHOUT_RIGHT = ["left", "main"] as const;
const MOBILE_PANE_ORDER_WITHOUT_LEFT = ["main", "right"] as const;
const MOBILE_PANE_ORDER_MAIN_ONLY = ["main"] as const;

export type SidebarLayoutMobileMinResizeBehavior = "min_resize_to_slide" | "min_resize_to_merge";
export type SidebarLayoutMobileMergedSide = SidebarSide;
export type SidebarLayoutActiveResizeSide = SidebarSide | null;
export type SidebarLayoutMobileSurface = MobileSurface;
export type SidebarLayoutMobileGrip =
  | { kind: "idle" }
  | {
      kind: "dragging";
      mergeTargetSide: SidebarLayoutMobileMergedSide | null;
      previewSurface: SidebarLayoutMobileSurface;
      shouldSettleMergedOnEnd: boolean;
      side: SidebarLayoutMobileMergedSide;
      slideOffsetPx: number;
      startSideWidthPx: number;
    };

export const SIDEBAR_LAYOUT_UNMERGED_MOBILE_SURFACE: SidebarLayoutMobileSurface = {
  kind: "unmerged",
};
export const SIDEBAR_LAYOUT_IDLE_MOBILE_GRIP: SidebarLayoutMobileGrip = {
  kind: "idle",
};

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getDesktopSidebarMaxWidthPx(viewportWidthPx: number) {
  return Math.max(
    SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
    Math.round(viewportWidthPx * SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MAX_WIDTH_RATIO),
  );
}

export function getMobileSidebarMaxWidthPx(viewportWidthPx: number) {
  return Math.max(1, Math.floor(viewportWidthPx - SIDEBAR_LAYOUT_MOBILE_MAIN_PEEK_WIDTH_PX));
}

export function getMobileSidebarMinWidthPx(args: {
  configuredMinWidthPx: number;
  maxWidthPx: number;
  viewportWidthPx: number;
}) {
  const pageRelativeMinWidthPx = Math.floor(
    args.viewportWidthPx * SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_RATIO,
  );

  return clampNumber(
    Math.min(Math.round(args.configuredMinWidthPx), pageRelativeMinWidthPx),
    1,
    args.maxWidthPx,
  );
}

export function getMergedMobileMainWidthPx(args: {
  mainMaxWidthPx: number;
  mainMinWidthPx: number;
  sideMinWidthPx: number;
  viewportWidthPx: number;
}) {
  if (args.viewportWidthPx < args.sideMinWidthPx + args.mainMinWidthPx) {
    return null;
  }

  return clampNumber(
    args.viewportWidthPx - args.sideMinWidthPx,
    args.mainMinWidthPx,
    args.mainMaxWidthPx,
  );
}

export function getMobileMinResizeMergeWidthsPx(args: {
  mainMaxWidthPx: number;
  mainMinWidthPx: number;
  rawSideWidthPx: number;
  sideMaxWidthPx: number;
  sideMinWidthPx: number;
  viewportWidthPx: number;
}) {
  const mergedMainWidthPx = getMergedMobileMainWidthPx(args);
  if (mergedMainWidthPx === null) {
    return null;
  }
  const sideWidthPx = clampNumber(
    Math.round(args.rawSideWidthPx),
    args.sideMinWidthPx,
    args.sideMaxWidthPx,
  );
  const commitSideWidthPx = args.sideMinWidthPx + SIDEBAR_LAYOUT_MOBILE_MERGE_INTENT_WIDTH_PX;
  const mergeProgress = clampNumber(
    (commitSideWidthPx - sideWidthPx) / SIDEBAR_LAYOUT_MOBILE_MERGE_INTENT_WIDTH_PX,
    0,
    1,
  );

  return {
    mainWidthPx: Math.round(
      args.mainMaxWidthPx - (args.mainMaxWidthPx - mergedMainWidthPx) * mergeProgress,
    ),
    sideWidthPx,
  };
}

export function shouldCommitMobileMergedSurface(args: {
  sideMinWidthPx: number;
  sideWidthPx: number;
}) {
  return (
    Math.round(args.sideWidthPx) <=
    Math.round(args.sideMinWidthPx) + SIDEBAR_LAYOUT_MOBILE_MERGE_INTENT_WIDTH_PX
  );
}

function getOppositeMobileMergedSide(side: SidebarLayoutMobileMergedSide) {
  return side === "left" ? "right" : "left";
}

export function getMobileMergeHandoffSide(args: {
  currentMergedSide: SidebarLayoutMobileMergedSide | null;
  hasLeftPane: boolean;
  hasRightPane: boolean;
  leftWidthPx: number;
  resizeSide: SidebarLayoutMobileMergedSide;
  rightWidthPx: number;
  shouldKeepCurrentMerge: boolean;
  sidebarMinWidthPx: number;
}) {
  if (args.shouldKeepCurrentMerge || args.currentMergedSide !== args.resizeSide) {
    return null;
  }

  const oppositeSide = getOppositeMobileMergedSide(args.resizeSide);
  const hasOppositePane =
    (oppositeSide === "left" && args.hasLeftPane) ||
    (oppositeSide === "right" && args.hasRightPane);
  if (!hasOppositePane) {
    return null;
  }

  const oppositeWidthPx = oppositeSide === "left" ? args.leftWidthPx : args.rightWidthPx;
  return Math.abs(oppositeWidthPx - args.sidebarMinWidthPx) <= MOBILE_PANE_SETTLED_TOLERANCE_PX
    ? oppositeSide
    : null;
}

export function getMobileSidebarWidthPx(args: {
  maxWidthPx: number;
  minWidthPx: number;
  storedWidthPx: number;
}) {
  return clampNumber(Math.round(args.storedWidthPx), args.minWidthPx, args.maxWidthPx);
}

export function getDesktopSidebarWidthPx(args: {
  isOpen: boolean;
  storedWidthPx: number;
  viewportWidthPx: number;
}) {
  if (!args.isOpen) {
    return 0;
  }

  if (args.viewportWidthPx <= 0) {
    return Math.max(SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX, Math.round(args.storedWidthPx));
  }

  return clampNumber(
    Math.round(args.storedWidthPx),
    SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
    getDesktopSidebarMaxWidthPx(args.viewportWidthPx),
  );
}

function getMobilePaneOrder({
  hasLeftPane,
  hasRightPane,
  mergedSurfaceSide,
}: {
  hasLeftPane: boolean;
  hasRightPane: boolean;
  mergedSurfaceSide: SidebarLayoutMobileMergedSide | null;
}): readonly MobilePane[] {
  if (mergedSurfaceSide === "left" && hasLeftPane) {
    return hasRightPane ? MOBILE_PANE_ORDER_WITHOUT_MAIN : ["left"];
  }

  if (mergedSurfaceSide === "right" && hasRightPane) {
    return hasLeftPane ? MOBILE_PANE_ORDER_WITHOUT_MAIN : ["right"];
  }

  if (hasLeftPane && hasRightPane) {
    return MOBILE_PANE_ORDER;
  }

  if (hasLeftPane) {
    return MOBILE_PANE_ORDER_WITHOUT_RIGHT;
  }

  if (hasRightPane) {
    return MOBILE_PANE_ORDER_WITHOUT_LEFT;
  }

  return MOBILE_PANE_ORDER_MAIN_ONLY;
}

function getMobilePaneScrollOffsets(args: {
  hasLeftPane: boolean;
  hasRightPane: boolean;
  leftWidthPx: number;
  mainWidthPx: number;
  mergedSurfaceSide: SidebarLayoutMobileMergedSide | null;
  rightWidthPx: number;
  viewportWidthPx: number;
}) {
  const paneOrder = getMobilePaneOrder({
    hasLeftPane: args.hasLeftPane,
    hasRightPane: args.hasRightPane,
    mergedSurfaceSide: args.mergedSurfaceSide,
  });

  return paneOrder.map((pane) => {
    if (pane === "left") {
      return { pane, scrollLeftPx: 0 };
    }

    if (pane === "main") {
      return { pane, scrollLeftPx: args.hasLeftPane ? args.leftWidthPx : 0 };
    }

    return {
      pane,
      scrollLeftPx: Math.max(
        0,
        (args.hasLeftPane ? args.leftWidthPx : 0) +
          args.mainWidthPx +
          args.rightWidthPx -
          args.viewportWidthPx,
      ),
    };
  });
}

export function getMobilePaneScrollLeftPx(
  pane: MobilePane,
  args: Parameters<typeof getMobilePaneScrollOffsets>[0],
) {
  return (
    getMobilePaneScrollOffsets(args).find((paneOffset) => paneOffset.pane === pane)?.scrollLeftPx ??
    0
  );
}

export function getMobilePaneScrollProgress(
  args: Parameters<typeof getMobilePaneScrollOffsets>[0] & {
    scrollLeftPx: number;
  },
) {
  if (args.mergedSurfaceSide !== null) {
    return 0;
  }

  const mainScrollLeftPx = getMobilePaneScrollLeftPx("main", args);
  if (args.scrollLeftPx < mainScrollLeftPx && args.hasLeftPane) {
    const leftScrollLeftPx = getMobilePaneScrollLeftPx("left", args);
    const distanceToLeftPx = mainScrollLeftPx - leftScrollLeftPx;
    return distanceToLeftPx <= 0
      ? 0
      : -clampNumber((mainScrollLeftPx - args.scrollLeftPx) / distanceToLeftPx, 0, 1);
  }

  if (args.scrollLeftPx > mainScrollLeftPx && args.hasRightPane) {
    const rightScrollLeftPx = getMobilePaneScrollLeftPx("right", args);
    const distanceToRightPx = rightScrollLeftPx - mainScrollLeftPx;
    return distanceToRightPx <= 0
      ? 0
      : clampNumber((args.scrollLeftPx - mainScrollLeftPx) / distanceToRightPx, 0, 1);
  }

  return 0;
}

export function getMobilePaneFromScrollLeft(args: {
  hasLeftPane: boolean;
  hasRightPane: boolean;
  leftWidthPx: number;
  mainWidthPx: number;
  mergedSurfaceSide: SidebarLayoutMobileMergedSide | null;
  rightWidthPx: number;
  scrollLeftPx: number;
  viewportWidthPx: number;
}) {
  const paneOffsets = getMobilePaneScrollOffsets(args);
  if (paneOffsets.length === 0) {
    return "main" as const;
  }

  return paneOffsets.reduce((closestPane, candidatePane) =>
    Math.abs(candidatePane.scrollLeftPx - args.scrollLeftPx) <
    Math.abs(closestPane.scrollLeftPx - args.scrollLeftPx)
      ? candidatePane
      : closestPane,
  ).pane;
}

export function isMobilePaneScrollSettled(
  args: Parameters<typeof getMobilePaneScrollOffsets>[0] & {
    pane: MobilePane;
    scrollLeftPx: number;
  },
) {
  return (
    Math.abs(
      args.scrollLeftPx -
        getMobilePaneScrollLeftPx(args.pane, {
          hasLeftPane: args.hasLeftPane,
          hasRightPane: args.hasRightPane,
          leftWidthPx: args.leftWidthPx,
          mainWidthPx: args.mainWidthPx,
          mergedSurfaceSide: args.mergedSurfaceSide,
          rightWidthPx: args.rightWidthPx,
          viewportWidthPx: args.viewportWidthPx,
        }),
    ) <= MOBILE_PANE_SETTLED_TOLERANCE_PX
  );
}
