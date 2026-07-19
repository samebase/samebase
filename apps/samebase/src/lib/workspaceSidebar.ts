import type { WorkspaceMobileSidebarPane } from "../../convex/userPreferenceModel";

export const MOBILE_CROSS_SWIPE_TRAVEL_THRESHOLD_RATIO = 0.85;
export const MOBILE_CROSS_SWIPE_VELOCITY_THRESHOLD_PX_PER_MS = 1.25;
export const MOBILE_SIDEBAR_RETURN_TRAVEL_THRESHOLD_RATIO = 0.38;

type MobilePaneAnchor = {
  pane: WorkspaceMobileSidebarPane;
  scrollLeft: number;
};

function getSidebarWidths(
  hasLeftSidebar: boolean,
  leftSidebarWidthPx: number,
  hasRightSidebar: boolean,
  rightSidebarWidthPx: number,
) {
  return {
    left: hasLeftSidebar ? leftSidebarWidthPx : 0,
    right: hasRightSidebar ? rightSidebarWidthPx : 0,
  };
}
export type MobilePaneReleaseGesture = {
  releaseFingerVelocityXPxPerMs: number;
  startPane: WorkspaceMobileSidebarPane;
  totalFingerDeltaXPx: number;
};
function getMobilePaneAnchors(
  hasLeftSidebar: boolean,
  leftSidebarWidthPx: number,
  hasRightSidebar: boolean,
  rightSidebarWidthPx: number,
) {
  const sidebarWidths = getSidebarWidths(
    hasLeftSidebar,
    leftSidebarWidthPx,
    hasRightSidebar,
    rightSidebarWidthPx,
  );
  let scrollLeft = 0;
  const anchors: MobilePaneAnchor[] = [];

  if (sidebarWidths.left > 0) {
    anchors.push({ pane: "left", scrollLeft });
    scrollLeft += sidebarWidths.left;
  }

  anchors.push({ pane: "main", scrollLeft });

  if (sidebarWidths.right > 0) {
    anchors.push({
      pane: "right",
      scrollLeft: scrollLeft + sidebarWidths.right,
    });
  }

  return anchors;
}

export function getMobilePaneScrollLeft(
  pane: WorkspaceMobileSidebarPane,
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

  return (
    anchors.find((candidateAnchor) => candidateAnchor.pane === pane)?.scrollLeft ??
    anchors.find((candidateAnchor) => candidateAnchor.pane === "main")?.scrollLeft ??
    0
  );
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
 * Let the shell settle to whichever pane anchor the browser actually finished
 * closest to after the swipe, while still honoring a deliberate fast
 * cross-sidebar fling that started from one sidebar and clearly continued past
 * the center pane.
 */
export function getSettledMobilePane(
  currentPane: WorkspaceMobileSidebarPane,
  scrollLeft: number,
  hasLeftSidebar: boolean,
  leftSidebarWidthPx: number,
  hasRightSidebar: boolean,
  rightSidebarWidthPx: number,
  releaseGesture?: MobilePaneReleaseGesture | null,
) {
  const nearestPane = getNearestMobilePane(
    scrollLeft,
    hasLeftSidebar,
    leftSidebarWidthPx,
    hasRightSidebar,
    rightSidebarWidthPx,
  );

  if (currentPane === "main") {
    return nearestPane;
  }

  const currentPaneWidthPx = currentPane === "left" ? leftSidebarWidthPx : rightSidebarWidthPx;
  const currentPaneScrollLeft = getMobilePaneScrollLeft(
    currentPane,
    hasLeftSidebar,
    leftSidebarWidthPx,
    hasRightSidebar,
    rightSidebarWidthPx,
  );
  const returnRequiredTravelPx = currentPaneWidthPx * MOBILE_SIDEBAR_RETURN_TRAVEL_THRESHOLD_RATIO;
  const returnTravelPx = Math.abs(scrollLeft - currentPaneScrollLeft);

  // Returning from a sidebar should feel lighter than crossing all the way to
  // the opposite sidebar, especially when only a narrow main-pane slice is
  // visible. Settle back to main once the drag is clearly intentional.
  if (
    currentPaneWidthPx > 0 &&
    nearestPane === currentPane &&
    returnTravelPx >= returnRequiredTravelPx
  ) {
    return "main";
  }

  if (!hasLeftSidebar || !hasRightSidebar) {
    return nearestPane;
  }

  const oppositePane = currentPane === "left" ? "right" : "left";
  if (nearestPane === oppositePane || nearestPane === currentPane) {
    return nearestPane;
  }

  if (nearestPane !== "main" || releaseGesture?.startPane !== currentPane) {
    return nearestPane;
  }

  const requiredTravelPx =
    (currentPane === "left" ? rightSidebarWidthPx : leftSidebarWidthPx) *
    MOBILE_CROSS_SWIPE_TRAVEL_THRESHOLD_RATIO;
  const travelTowardOppositePx =
    currentPane === "left"
      ? -releaseGesture.totalFingerDeltaXPx
      : releaseGesture.totalFingerDeltaXPx;
  const releaseTowardOppositeVelocityPxPerMs =
    currentPane === "left"
      ? -releaseGesture.releaseFingerVelocityXPxPerMs
      : releaseGesture.releaseFingerVelocityXPxPerMs;

  return travelTowardOppositePx >= requiredTravelPx &&
    releaseTowardOppositeVelocityPxPerMs >= MOBILE_CROSS_SWIPE_VELOCITY_THRESHOLD_PX_PER_MS
    ? oppositePane
    : nearestPane;
}
