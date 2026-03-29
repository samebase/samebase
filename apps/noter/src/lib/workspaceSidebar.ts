import type { MobileSidebarPane } from "@/hooks/use-sidebar";

const MOBILE_OPPOSITE_SIDEBAR_SNAP_PROGRESS_THRESHOLD = 0.9;
const MOBILE_OPPOSITE_SIDEBAR_FLING_PROGRESS_THRESHOLD = 0.58;
const MOBILE_OPPOSITE_SIDEBAR_FLING_VELOCITY_THRESHOLD_PX_PER_MS = 1.35;

type MobilePaneAnchor = {
  pane: MobileSidebarPane;
  scrollLeft: number;
};

function getMobilePaneAnchors(
  hasLeftSidebar: boolean,
  leftSidebarWidthPx: number,
  hasRightSidebar: boolean,
  rightSidebarWidthPx: number,
) {
  const mainPaneScrollLeft = hasLeftSidebar ? leftSidebarWidthPx : 0;
  const anchors: MobilePaneAnchor[] = [];

  if (hasLeftSidebar) {
    anchors.push({ pane: "left", scrollLeft: 0 });
  }

  anchors.push({ pane: "main", scrollLeft: mainPaneScrollLeft });

  if (hasRightSidebar) {
    anchors.push({
      pane: "right",
      scrollLeft: mainPaneScrollLeft + rightSidebarWidthPx,
    });
  }

  return anchors;
}

export function getMobilePaneScrollLeft(
  pane: MobileSidebarPane,
  hasLeftSidebar: boolean,
  leftSidebarWidthPx: number,
  hasRightSidebar: boolean,
  rightSidebarWidthPx: number,
) {
  const anchor = getMobilePaneAnchors(
    hasLeftSidebar,
    leftSidebarWidthPx,
    hasRightSidebar,
    rightSidebarWidthPx,
  ).find((candidateAnchor) => candidateAnchor.pane === pane);

  return anchor?.scrollLeft ?? (hasLeftSidebar ? leftSidebarWidthPx : 0);
}

function getNearestMobilePane(
  scrollLeft: number,
  hasLeftSidebar: boolean,
  leftSidebarWidthPx: number,
  hasRightSidebar: boolean,
  rightSidebarWidthPx: number,
) {
  const anchors = getMobilePaneAnchors(
    hasLeftSidebar,
    leftSidebarWidthPx,
    hasRightSidebar,
    rightSidebarWidthPx,
  );

  let nearestAnchor = anchors[0];
  let nearestDistance = Math.abs(scrollLeft - nearestAnchor.scrollLeft);

  for (const anchor of anchors.slice(1)) {
    const distance = Math.abs(scrollLeft - anchor.scrollLeft);
    if (distance < nearestDistance) {
      nearestAnchor = anchor;
      nearestDistance = distance;
    }
  }

  return nearestAnchor.pane;
}

/**
 * Keep the center pane easier to land on when a swipe starts from either
 * sidebar. Light overshoots settle to `main`, while direct cross-sidebar jumps
 * still work for deep swipes or a clearly deliberate fast fling.
 */
export function getSettledMobilePane(
  currentPane: MobileSidebarPane,
  scrollLeft: number,
  hasLeftSidebar: boolean,
  leftSidebarWidthPx: number,
  hasRightSidebar: boolean,
  rightSidebarWidthPx: number,
  peakSwipeVelocityPxPerMs = 0,
) {
  const nearestPane = getNearestMobilePane(
    scrollLeft,
    hasLeftSidebar,
    leftSidebarWidthPx,
    hasRightSidebar,
    rightSidebarWidthPx,
  );

  if (currentPane === "main" || !hasLeftSidebar || !hasRightSidebar) {
    return nearestPane;
  }

  const isOppositeSidebarTransition =
    (currentPane === "left" && nearestPane === "right") ||
    (currentPane === "right" && nearestPane === "left");

  if (!isOppositeSidebarTransition) {
    return nearestPane;
  }

  const mainPaneScrollLeft = leftSidebarWidthPx;
  const oppositeSidebarWidthPx =
    currentPane === "left" ? rightSidebarWidthPx : leftSidebarWidthPx;
  if (!Number.isFinite(oppositeSidebarWidthPx) || oppositeSidebarWidthPx <= 0) {
    return "main";
  }
  const distanceIntoOppositeSidebarPx =
    currentPane === "left"
      ? scrollLeft - mainPaneScrollLeft
      : mainPaneScrollLeft - scrollLeft;
  const oppositeSidebarProgress = Math.min(
    1,
    Math.max(0, distanceIntoOppositeSidebarPx / oppositeSidebarWidthPx),
  );
  const swipeIsFastEnough =
    peakSwipeVelocityPxPerMs >=
    MOBILE_OPPOSITE_SIDEBAR_FLING_VELOCITY_THRESHOLD_PX_PER_MS;

  if (
    oppositeSidebarProgress >= MOBILE_OPPOSITE_SIDEBAR_SNAP_PROGRESS_THRESHOLD
  ) {
    return nearestPane;
  }

  if (
    oppositeSidebarProgress >= MOBILE_OPPOSITE_SIDEBAR_FLING_PROGRESS_THRESHOLD
  ) {
    return swipeIsFastEnough ? nearestPane : "main";
  }

  return "main";
}
