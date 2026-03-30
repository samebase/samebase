import type { MobileSidebarPane } from "@/hooks/use-sidebar";

const MOBILE_OPPOSITE_SIDEBAR_COMMIT_PROGRESS_THRESHOLD = 0.9;

type MobilePaneAnchor = {
  pane: MobileSidebarPane;
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
  pane: MobileSidebarPane,
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
    anchors.find((candidateAnchor) => candidateAnchor.pane === pane)
      ?.scrollLeft ??
    anchors.find((candidateAnchor) => candidateAnchor.pane === "main")
      ?.scrollLeft ??
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
 * Keep the center pane easier to land on when a swipe starts from either
 * sidebar. Casual overshoots should land on `main`, but a swipe that travels
 * very deep into the far sidebar may still commit there directly.
 */
export function getSettledMobilePane(
  currentPane: MobileSidebarPane,
  scrollLeft: number,
  hasLeftSidebar: boolean,
  leftSidebarWidthPx: number,
  hasRightSidebar: boolean,
  rightSidebarWidthPx: number,
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

  return oppositeSidebarProgress >=
    MOBILE_OPPOSITE_SIDEBAR_COMMIT_PROGRESS_THRESHOLD
    ? nearestPane
    : "main";
}
