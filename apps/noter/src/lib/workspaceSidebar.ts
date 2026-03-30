import type { MobileSidebarPane } from "@/hooks/use-sidebar";

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
 * sidebar. Mobile settles one screen at a time, so a swipe that starts from
 * either sidebar must land on `main` before the far sidebar can become the next
 * committed pane.
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

  return isOppositeSidebarTransition ? "main" : nearestPane;
}
