import type { MobileSidebarPane } from "@/hooks/use-sidebar";

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
 * Let the shell settle to whichever pane anchor the browser actually finished
 * closest to after the swipe.
 */
export function getSettledMobilePane(
  scrollLeft: number,
  hasLeftSidebar: boolean,
  leftSidebarWidthPx: number,
  hasRightSidebar: boolean,
  rightSidebarWidthPx: number,
) {
  return getNearestMobilePane(
    scrollLeft,
    hasLeftSidebar,
    leftSidebarWidthPx,
    hasRightSidebar,
    rightSidebarWidthPx,
  );
}
