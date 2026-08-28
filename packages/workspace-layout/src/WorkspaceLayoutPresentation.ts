import {
  WORKSPACE_LAYOUT_V2_MOBILE_MERGE_INTENT_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
  clampNumber,
  getMobileSidebarMaxWidthPx,
  getMobileSidebarMinWidthPx,
} from "./WorkspaceLayoutV2Geometry.ts";
import type {
  WorkspaceLayoutV2LocalStoreState,
  WorkspacePaneState,
} from "./WorkspacePaneRuntime.tsx";
import type { WorkspaceMobilePane, WorkspacePaneSide } from "./WorkspaceLayoutV2State.ts";

export type WorkspaceLayoutMobileMergeProgress = {
  progress: number;
  side: WorkspacePaneSide;
};

export type WorkspaceLayoutPresentation = {
  isMobile: boolean;
  mobileMergeProgress: WorkspaceLayoutMobileMergeProgress | null;
  mobilePane: WorkspaceMobilePane;
  mobilePaneScrollProgress: number;
};

function getMobileMergeProgress({
  localState,
  paneState,
}: {
  localState: WorkspaceLayoutV2LocalStoreState;
  paneState: WorkspacePaneState;
}): WorkspaceLayoutMobileMergeProgress | null {
  if (!paneState.isMobile) {
    return null;
  }

  const mobileGrip = localState.mobile.grip;
  if (mobileGrip.kind === "dragging") {
    const currentSideWidthPx =
      mobileGrip.side === "left" ? paneState.leftMobileWidthPx : paneState.rightMobileWidthPx;
    const maxWidthPx = getMobileSidebarMaxWidthPx(localState.viewportSize.widthPx);
    const mergeCommitWidthPx =
      getMobileSidebarMinWidthPx({
        configuredMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
        maxWidthPx,
        viewportWidthPx: localState.viewportSize.widthPx,
      }) + WORKSPACE_LAYOUT_V2_MOBILE_MERGE_INTENT_WIDTH_PX;

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

  return paneState.mobileSurface.kind === "merged"
    ? { progress: 1, side: paneState.mobileSurface.side }
    : null;
}

export function getWorkspaceLayoutPresentation({
  localState,
  paneState,
}: {
  localState: WorkspaceLayoutV2LocalStoreState;
  paneState: WorkspacePaneState;
}): WorkspaceLayoutPresentation {
  return {
    isMobile: paneState.isMobile,
    mobileMergeProgress: getMobileMergeProgress({ localState, paneState }),
    mobilePane: paneState.mobilePane,
    mobilePaneScrollProgress: localState.mobile.paneScrollProgress,
  };
}
