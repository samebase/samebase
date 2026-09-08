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

export function getMobileMainPaneWidthPx(args: {
  index: number;
  mainPaneCount: number;
  mainWidthPx: number;
  mergedSurfaceSide: SidebarLayoutMobileMergedSide | null;
  viewportWidthPx: number;
}) {
  const resizedIndex = args.mergedSurfaceSide === "right" ? args.mainPaneCount - 1 : 0;
  return args.index === resizedIndex ? args.mainWidthPx : args.viewportWidthPx;
}

function getMobilePaneScrollOffsets(args: {
  activeMainPaneIndex?: number;
  hasLeftPane: boolean;
  hasRightPane: boolean;
  leftWidthPx: number;
  mainWidthPx: number;
  mainPaneCount?: number;
  mergedSurfaceSide: SidebarLayoutMobileMergedSide | null;
  rightWidthPx: number;
  viewportWidthPx: number;
}) {
  const mainPaneCount = args.mainPaneCount ?? 1;
  const offsets: Array<
    ({ pane: SidebarSide } | { pane: "main"; mainPaneIndex: number }) & { scrollLeftPx: number }
  > = [];
  if (args.hasLeftPane) offsets.push({ pane: "left", scrollLeftPx: 0 });
  let positionPx = args.hasLeftPane ? args.leftWidthPx : 0;
  for (let index = 0; index < mainPaneCount; index++) {
    const isMerged =
      (args.mergedSurfaceSide === "left" && args.hasLeftPane && index === 0) ||
      (args.mergedSurfaceSide === "right" && args.hasRightPane && index === mainPaneCount - 1);
    if (!isMerged) offsets.push({ pane: "main", mainPaneIndex: index, scrollLeftPx: positionPx });
    positionPx += getMobileMainPaneWidthPx({ ...args, index, mainPaneCount });
  }
  if (args.hasRightPane) {
    offsets.push({
      pane: "right",
      scrollLeftPx: Math.max(0, positionPx + args.rightWidthPx - args.viewportWidthPx),
    });
  }
  return offsets;
}

export function getMobilePaneScrollLeftPx(
  pane: MobilePane,
  args: Parameters<typeof getMobilePaneScrollOffsets>[0],
) {
  return (
    getMobilePaneScrollOffsets(args).find(
      (paneOffset) =>
        paneOffset.pane === pane &&
        (paneOffset.pane !== "main" ||
          paneOffset.mainPaneIndex === (args.activeMainPaneIndex ?? 0)),
    )?.scrollLeftPx ?? 0
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

  const mainScrollLeftPx = getMobilePaneScrollLeftPx("main", { ...args, activeMainPaneIndex: 0 });
  const lastMainScrollLeftPx = getMobilePaneScrollLeftPx("main", {
    ...args,
    activeMainPaneIndex: (args.mainPaneCount ?? 1) - 1,
  });
  if (args.scrollLeftPx < mainScrollLeftPx && args.hasLeftPane) {
    const leftScrollLeftPx = getMobilePaneScrollLeftPx("left", args);
    const distanceToLeftPx = mainScrollLeftPx - leftScrollLeftPx;
    return distanceToLeftPx <= 0
      ? 0
      : -clampNumber((mainScrollLeftPx - args.scrollLeftPx) / distanceToLeftPx, 0, 1);
  }

  if (args.scrollLeftPx > lastMainScrollLeftPx && args.hasRightPane) {
    const rightScrollLeftPx = getMobilePaneScrollLeftPx("right", args);
    const distanceToRightPx = rightScrollLeftPx - lastMainScrollLeftPx;
    return distanceToRightPx <= 0
      ? 0
      : clampNumber((args.scrollLeftPx - lastMainScrollLeftPx) / distanceToRightPx, 0, 1);
  }

  return 0;
}

export function getMobilePaneFromScrollLeft(
  args: Parameters<typeof getMobilePaneScrollOffsets>[0] & {
    scrollLeftPx: number;
  },
) {
  const paneOffsets = getMobilePaneScrollOffsets(args);
  if (paneOffsets.length === 0) {
    return { pane: "main", mainPaneIndex: 0, scrollLeftPx: 0 } as const;
  }

  return paneOffsets.reduce((closestPane, candidatePane) =>
    Math.abs(candidatePane.scrollLeftPx - args.scrollLeftPx) <
    Math.abs(closestPane.scrollLeftPx - args.scrollLeftPx)
      ? candidatePane
      : closestPane,
  );
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
          activeMainPaneIndex: args.activeMainPaneIndex,
          mainPaneCount: args.mainPaneCount,
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
