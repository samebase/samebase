import { createContext, useContext } from "react";
import {
  SIDEBAR_LAYOUT_MOBILE_MERGE_INTENT_WIDTH_PX,
  SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_PX,
  clampNumber,
  getMobileSidebarMaxWidthPx,
  getMobileSidebarMinWidthPx,
} from "./SidebarLayoutGeometryInternal.ts";
import type {
  SidebarLayoutLocalStoreState,
  SidebarRuntimeState,
} from "./SidebarRuntimeInternal.tsx";
import type { MobilePane, MobileSurface, SidebarSide } from "./SidebarLayoutState.ts";

export type SidebarLayoutMobileMergeProgress = {
  progress: number;
  side: SidebarSide;
};

export type SidebarLayoutPresentation = {
  isMobile: boolean;
  leftDesktopOpen: boolean;
  mobileMergeProgress: SidebarLayoutMobileMergeProgress | null;
  mobilePane: MobilePane;
  mobilePaneScrollProgress: number;
  rightDesktopOpen: boolean;
};

export type SidebarLayoutDisplayedMobileState = {
  mobileMergeAvailableSides: Record<SidebarSide, boolean>;
  mobilePane: MobilePane;
  mobileSurface: MobileSurface;
};

export const SidebarLayoutDisplayedMobileStateContext =
  createContext<SidebarLayoutDisplayedMobileState | null>(null);

export function useSidebarLayoutDisplayedMobileState() {
  const displayedMobileState = useContext(SidebarLayoutDisplayedMobileStateContext);
  if (displayedMobileState === null) {
    throw new Error("Sidebar layout presentation context is missing.");
  }

  return displayedMobileState;
}

function getMobileMergeProgress({
  displayedMobileState,
  localState,
  paneState,
}: {
  displayedMobileState: SidebarLayoutDisplayedMobileState;
  localState: SidebarLayoutLocalStoreState;
  paneState: SidebarRuntimeState;
}): SidebarLayoutMobileMergeProgress | null {
  if (!paneState.isMobile) {
    return null;
  }

  const mobileGrip = localState.mobile.grip;
  if (mobileGrip.kind === "dragging") {
    if (
      mobileGrip.mergeTargetSide !== mobileGrip.side ||
      !displayedMobileState.mobileMergeAvailableSides[mobileGrip.side]
    ) {
      return null;
    }

    const currentSideWidthPx =
      mobileGrip.side === "left" ? paneState.leftMobileWidthPx : paneState.rightMobileWidthPx;
    const maxWidthPx = getMobileSidebarMaxWidthPx(localState.viewportSize.widthPx);
    const mergeCommitWidthPx =
      getMobileSidebarMinWidthPx({
        configuredMinWidthPx: SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_PX,
        maxWidthPx,
        viewportWidthPx: localState.viewportSize.widthPx,
      }) + SIDEBAR_LAYOUT_MOBILE_MERGE_INTENT_WIDTH_PX;

    if (mobileGrip.startSideWidthPx > mergeCommitWidthPx) {
      return {
        progress: clampNumber(
          (mobileGrip.startSideWidthPx - currentSideWidthPx) /
            (mobileGrip.startSideWidthPx - mergeCommitWidthPx),
          0,
          1,
        ),
        side: mobileGrip.side,
      };
    }

    return currentSideWidthPx <= mergeCommitWidthPx ? { progress: 1, side: mobileGrip.side } : null;
  }

  return displayedMobileState.mobileSurface.kind === "merged"
    ? { progress: 1, side: displayedMobileState.mobileSurface.side }
    : null;
}

export function getSidebarLayoutPresentation({
  displayedMobileState,
  localState,
  paneState,
}: {
  displayedMobileState: SidebarLayoutDisplayedMobileState;
  localState: SidebarLayoutLocalStoreState;
  paneState: SidebarRuntimeState;
}): SidebarLayoutPresentation {
  return {
    isMobile: paneState.isMobile,
    leftDesktopOpen: paneState.leftDesktopOpen,
    mobileMergeProgress: getMobileMergeProgress({ displayedMobileState, localState, paneState }),
    mobilePane: displayedMobileState.mobilePane,
    mobilePaneScrollProgress: localState.mobile.paneScrollProgress,
    rightDesktopOpen: paneState.rightDesktopOpen,
  };
}
