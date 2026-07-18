import { clampNumber } from "@/lib/clampNumber";
import { MIN_WORKSPACE_MOBILE_MAIN_PEEK_WIDTH_PX } from "@/lib/workspacePaneSizes";
import type { WorkspaceMobileSurface } from "../../../convex/userPreferenceModel";

export const WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX = 160;
const DESKTOP_SIDEBAR_MAX_WIDTH_RATIO = 0.45;
export const WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX = 160;
export const WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX = 96;
export const WORKSPACE_LAYOUT_V2_MOBILE_MERGE_INTENT_WIDTH_PX = 10;
export const WORKSPACE_LAYOUT_V2_MOBILE_MERGED_FIT_MIN_VIEWPORT_WIDTH_PX = 320;
// Keep default merged fit valid at 320px: side min + main min must fit exactly.
export const WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX =
  WORKSPACE_LAYOUT_V2_MOBILE_MERGED_FIT_MIN_VIEWPORT_WIDTH_PX -
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX;
export const MOBILE_PANE_SETTLED_TOLERANCE_PX = 1;

const MOBILE_PANE_ORDER = ["left", "main", "right"] as const;
const MOBILE_PANE_ORDER_WITHOUT_MAIN = ["left", "right"] as const;
const MOBILE_PANE_ORDER_WITHOUT_RIGHT = ["left", "main"] as const;
const MOBILE_PANE_ORDER_WITHOUT_LEFT = ["main", "right"] as const;
const MOBILE_PANE_ORDER_MAIN_ONLY = ["main"] as const;

export type MobilePane = (typeof MOBILE_PANE_ORDER)[number];
export type WorkspaceLayoutV2MobileMinResizeBehavior =
  | "min_resize_to_slide"
  | "min_resize_to_merge";
export type WorkspaceLayoutV2MobileMergedSide = "left" | "right";
export type WorkspaceLayoutV2ActiveResizeSide = "left" | "right" | "top" | null;
export type WorkspaceLayoutV2MobileSurface = WorkspaceMobileSurface;
export type WorkspaceLayoutV2MobileGrip =
  | { kind: "idle" }
  | {
      kind: "dragging";
      mergeTargetSide: WorkspaceLayoutV2MobileMergedSide | null;
      previewSurface: WorkspaceLayoutV2MobileSurface;
      shouldSettleMergedOnEnd: boolean;
      side: WorkspaceLayoutV2MobileMergedSide;
      slideOffsetPx: number;
      startSideWidthPx: number;
    };

export const WORKSPACE_LAYOUT_V2_UNMERGED_MOBILE_SURFACE: WorkspaceLayoutV2MobileSurface = {
  kind: "unmerged",
};
export const WORKSPACE_LAYOUT_V2_IDLE_MOBILE_GRIP: WorkspaceLayoutV2MobileGrip = {
  kind: "idle",
};

export function getDesktopSidebarMaxWidthPx(viewportWidthPx: number) {
  return Math.max(
    WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
    Math.round(viewportWidthPx * DESKTOP_SIDEBAR_MAX_WIDTH_RATIO),
  );
}

export function getMobileSidebarMaxWidthPx(viewportWidthPx: number) {
  // The active sidebar cannot cover the whole viewport because the resize grip
  // must stay visible and reachable.
  return Math.max(1, Math.floor(viewportWidthPx - MIN_WORKSPACE_MOBILE_MAIN_PEEK_WIDTH_PX));
}

export function getMobileSidebarMinWidthPx(args: {
  configuredMinWidthPx: number;
  maxWidthPx: number;
}) {
  return clampNumber(Math.round(args.configuredMinWidthPx), 1, args.maxWidthPx);
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
  const commitSideWidthPx = args.sideMinWidthPx + WORKSPACE_LAYOUT_V2_MOBILE_MERGE_INTENT_WIDTH_PX;
  const mergeProgress = clampNumber(
    (commitSideWidthPx - sideWidthPx) / WORKSPACE_LAYOUT_V2_MOBILE_MERGE_INTENT_WIDTH_PX,
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

/**
 * Chooses whether a released paired resize should become a merged carousel
 * surface or return to the ordinary separate-pane carousel.
 */
export function shouldCommitMobileMergedSurface(args: {
  sideMinWidthPx: number;
  sideWidthPx: number;
}) {
  return (
    Math.round(args.sideWidthPx) <=
    Math.round(args.sideMinWidthPx) + WORKSPACE_LAYOUT_V2_MOBILE_MERGE_INTENT_WIDTH_PX
  );
}

function getOppositeMobileMergedSide(side: WorkspaceLayoutV2MobileMergedSide) {
  return side === "left" ? "right" : "left";
}

/**
 * Keeps main owned by exactly one merged surface. If the current owner releases
 * main while the opposite sidebar is already minimum-sized, ownership transfers
 * across instead of briefly returning to the three-pane model.
 */
export function getMobileMergeHandoffSide(args: {
  currentMergedSide: WorkspaceLayoutV2MobileMergedSide | null;
  hasLeftPane: boolean;
  hasRightPane: boolean;
  leftWidthPx: number;
  resizeSide: WorkspaceLayoutV2MobileMergedSide;
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
    return Math.max(
      WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
      Math.round(args.storedWidthPx),
    );
  }

  return clampNumber(
    Math.round(args.storedWidthPx),
    WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
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
  mergedSurfaceSide: WorkspaceLayoutV2MobileMergedSide | null;
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
  mergedSurfaceSide: WorkspaceLayoutV2MobileMergedSide | null;
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
      return {
        pane,
        scrollLeftPx: 0,
      };
    }

    if (pane === "main") {
      return {
        pane,
        scrollLeftPx: args.hasLeftPane ? args.leftWidthPx : 0,
      };
    }

    return {
      pane,
      // The right sidebar is end-anchored so narrowing it exposes more of the
      // main pane instead of leaving blank track after the sidebar.
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

export function getMobilePaneFromScrollLeft(args: {
  hasLeftPane: boolean;
  hasRightPane: boolean;
  leftWidthPx: number;
  mainWidthPx: number;
  mergedSurfaceSide: WorkspaceLayoutV2MobileMergedSide | null;
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
          hasRightPane: args.hasRightPane,
          hasLeftPane: args.hasLeftPane,
          leftWidthPx: args.leftWidthPx,
          mainWidthPx: args.mainWidthPx,
          mergedSurfaceSide: args.mergedSurfaceSide,
          rightWidthPx: args.rightWidthPx,
          viewportWidthPx: args.viewportWidthPx,
        }),
    ) <= MOBILE_PANE_SETTLED_TOLERANCE_PX
  );
}
