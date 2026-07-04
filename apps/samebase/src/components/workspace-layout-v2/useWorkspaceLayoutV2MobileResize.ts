import { useEffect, useEffectEvent, useRef, type RefObject } from "react";
import { clampNumber } from "@/lib/clampNumber";
import {
  MOBILE_PANE_SETTLED_TOLERANCE_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_IDLE_MOBILE_GRIP,
  WORKSPACE_LAYOUT_V2_UNMERGED_MOBILE_SURFACE,
  getMergedMobileMainWidthPx,
  getMobileMergeDebugGeometry,
  getMobileMergeHandoffSide,
  getMobileMinResizeMergeWidthsPx,
  getMobilePaneScrollLeftPx,
  shouldCommitMobileMergedSurface,
  type MobilePane,
  type WorkspaceLayoutV2MobileMergeDebugGeometry,
  type WorkspaceLayoutV2MobileGrip,
  type WorkspaceLayoutV2MobileMergedSide,
  type WorkspaceLayoutV2MobileMinResizeBehavior,
  type WorkspaceLayoutV2MobileSurface,
} from "./WorkspaceLayoutV2Geometry";
import {
  useWorkspaceLayoutV2Actions,
  useWorkspaceLayoutV2Selector,
  useWorkspacePaneActions,
  useWorkspacePaneState,
} from "./WorkspacePaneRuntime";
import { type WorkspaceLayoutV2ResizeHandleConfig } from "./WorkspaceLayoutV2ResizeHandleConfigs";

/**
 * Owns the transient mobile grip session that can resolve either to legacy
 * resize-to-slide or to paired side/main pane resizing.
 */
export function useWorkspaceLayoutV2MobileGripResizeController({
  activeGripResizeSideRef,
  carouselRef,
  debugMobileMergeResize,
  hasLeftPane,
  hasRightPane,
  isMobile,
  leftWidthPx,
  mobileMinResizeBehavior,
  mobileSidebarMinWidthPx,
  mobilePane,
  rightWidthPx,
  viewportWidthPx,
}: {
  activeGripResizeSideRef: RefObject<"left" | "right" | null>;
  carouselRef: RefObject<HTMLDivElement | null>;
  debugMobileMergeResize: boolean;
  hasLeftPane: boolean;
  hasRightPane: boolean;
  isMobile: boolean;
  leftWidthPx: number;
  mobileMinResizeBehavior: WorkspaceLayoutV2MobileMinResizeBehavior;
  mobileSidebarMinWidthPx: number;
  mobilePane: MobilePane;
  rightWidthPx: number;
  viewportWidthPx: number;
}) {
  const mobileGrip = useWorkspaceLayoutV2Selector((state) => state.mobile.grip);
  const { mobileSurface } = useWorkspacePaneState();
  const { setMobileGrip } = useWorkspaceLayoutV2Actions();
  const { setMobileSurface, settleMobileMergedSurface } = useWorkspacePaneActions();
  const mobileGripRef = useRef<WorkspaceLayoutV2MobileGrip>(mobileGrip);
  const activeMobileSurface =
    mobileGrip.kind === "dragging" ? mobileGrip.previewSurface : mobileSurface;
  const mobileSurfaceRef = useRef<WorkspaceLayoutV2MobileSurface>(activeMobileSurface);
  mobileGripRef.current = mobileGrip;
  mobileSurfaceRef.current = activeMobileSurface;
  const mobileDefaultPaneWidthPx = Math.max(1, viewportWidthPx);
  const mobileMergedSide = activeMobileSurface.kind === "merged" ? activeMobileSurface.side : null;
  const mobileMergedMainWidthPx =
    activeMobileSurface.kind === "merged" ? activeMobileSurface.mainWidthPx : null;
  const durableMobileMergedSide = mobileSurface.kind === "merged" ? mobileSurface.side : null;
  const durableMobileMergedMainWidthPx =
    mobileSurface.kind === "merged" ? mobileSurface.mainWidthPx : null;
  const mobileGripSlideOffsetPx = mobileGrip.kind === "dragging" ? mobileGrip.slideOffsetPx : 0;
  const mobileMergedSideWidthPx =
    mobileMergedSide === "left" ? leftWidthPx : mobileMergedSide === "right" ? rightWidthPx : 0;
  const hasMobileMergedPane =
    (mobileMergedSide === "left" && hasLeftPane) || (mobileMergedSide === "right" && hasRightPane);
  const isMobileMergedFit =
    hasMobileMergedPane &&
    mobileMergedMainWidthPx !== null &&
    mobileMergedMainWidthPx >= WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX &&
    mobileMergedSideWidthPx + mobileMergedMainWidthPx <=
      viewportWidthPx + MOBILE_PANE_SETTLED_TOLERANCE_PX;
  const durableMobileMergedSideWidthPx =
    durableMobileMergedSide === "left"
      ? leftWidthPx
      : durableMobileMergedSide === "right"
        ? rightWidthPx
        : 0;
  const isDurableMobileMergedFit =
    durableMobileMergedMainWidthPx !== null &&
    durableMobileMergedSide !== null &&
    durableMobileMergedMainWidthPx >= WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX &&
    durableMobileMergedSideWidthPx + durableMobileMergedMainWidthPx <=
      viewportWidthPx + MOBILE_PANE_SETTLED_TOLERANCE_PX;
  const hasOppositePaneForMergedSide =
    (mobileMergedSide === "left" && hasRightPane) || (mobileMergedSide === "right" && hasLeftPane);
  const lockCarouselScroll =
    mobileMinResizeBehavior === "min_resize_to_merge" &&
    isMobileMergedFit &&
    !hasOppositePaneForMergedSide;
  function getCurrentMobileMergeDebugGeometry(): WorkspaceLayoutV2MobileMergeDebugGeometry | null {
    if (
      !debugMobileMergeResize ||
      mobileMinResizeBehavior !== "min_resize_to_merge" ||
      mobileGrip.kind !== "dragging" ||
      mobileGrip.mergeTargetSide === null
    ) {
      return null;
    }

    const settledMainWidthPx = getMergedMobileMainWidthPx({
      mainMaxWidthPx: mobileDefaultPaneWidthPx,
      mainMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
      sideMinWidthPx: mobileSidebarMinWidthPx,
      viewportWidthPx,
    });
    if (settledMainWidthPx === null) {
      return null;
    }

    return getMobileMergeDebugGeometry({
      side: mobileGrip.mergeTargetSide,
      sideMinWidthPx: mobileSidebarMinWidthPx,
      startSideWidthPx: mobileGrip.startSideWidthPx,
      viewportWidthPx,
    });
  }

  const mobileMergeDebugGeometry = getCurrentMobileMergeDebugGeometry();

  function setMobileGripState(nextMobileGrip: WorkspaceLayoutV2MobileGrip) {
    mobileGripRef.current = nextMobileGrip;
    setMobileGrip(nextMobileGrip);
  }

  function setPreviewMobileSurface(surface: WorkspaceLayoutV2MobileSurface) {
    mobileSurfaceRef.current = surface;
    const currentMobileGrip = mobileGripRef.current;
    if (currentMobileGrip.kind !== "dragging") {
      return;
    }

    setMobileGripState({
      ...currentMobileGrip,
      previewSurface: surface,
    });
  }

  function clearPreviewMobileSurface() {
    setPreviewMobileSurface(WORKSPACE_LAYOUT_V2_UNMERGED_MOBILE_SURFACE);
  }

  function setPreviewMobileMergedSurface(
    side: WorkspaceLayoutV2MobileMergedSide,
    mainWidthPx: number,
  ) {
    setPreviewMobileSurface({
      kind: "merged",
      mainWidthPx,
      side,
    });
  }

  function setMobileGripSlideOffsetPx(slideOffsetPx: number) {
    const currentMobileGrip = mobileGripRef.current;
    if (currentMobileGrip.kind !== "dragging") {
      return;
    }

    setMobileGripState({
      ...currentMobileGrip,
      slideOffsetPx,
    });
  }

  const clearMobileMergedSurfaceEffect = useEffectEvent(() => {
    setMobileSurface(WORKSPACE_LAYOUT_V2_UNMERGED_MOBILE_SURFACE);
  });
  const resetMobileGripResizeEffect = useEffectEvent(() => {
    activeGripResizeSideRef.current = null;
    setMobileGripState(WORKSPACE_LAYOUT_V2_IDLE_MOBILE_GRIP);
  });

  /**
   * Clears active mobile grip drag state when the desktop layout takes over, so
   * transient mobile widths and snap overrides cannot leak across breakpoints.
   */
  useEffect(() => {
    if (isMobile) {
      return;
    }

    resetMobileGripResizeEffect();
  }, [isMobile]);

  /**
   * Clears impossible durable merge state for the current mobile route and
   * viewport. Width alone never creates a merge, but an existing merge must
   * still fit the panes currently on screen.
   */
  useEffect(() => {
    if (!isMobile || viewportWidthPx <= 0 || mobileSurface.kind !== "merged") {
      return;
    }

    const hasMergedPane =
      (durableMobileMergedSide === "left" && hasLeftPane) ||
      (durableMobileMergedSide === "right" && hasRightPane);
    if (
      mobileMinResizeBehavior === "min_resize_to_merge" &&
      hasMergedPane &&
      isDurableMobileMergedFit
    ) {
      return;
    }

    clearMobileMergedSurfaceEffect();
  }, [
    hasLeftPane,
    hasRightPane,
    isDurableMobileMergedFit,
    isMobile,
    mobileMinResizeBehavior,
    durableMobileMergedSide,
    mobileSurface.kind,
    viewportWidthPx,
  ]);

  /**
   * Treats an explicit main-pane selection as leaving the merged surface model.
   * Native scroll cannot derive `"main"` while a merged surface is active, so
   * this is reserved for programmatic recentering and toggle actions.
   */
  useEffect(() => {
    if (mobilePane !== "main") {
      return;
    }

    if (mobileSurface.kind === "unmerged") {
      return;
    }

    clearMobileMergedSurfaceEffect();
  }, [mobilePane, mobileSurface.kind]);

  function getGripPositionPx(resizeHandle: WorkspaceLayoutV2ResizeHandleConfig) {
    if (activeGripResizeSideRef.current !== resizeHandle.side) {
      return resizeHandle.positionPx;
    }

    if (resizeHandle.side === "left") {
      return clampNumber(
        resizeHandle.positionPx - mobileGripSlideOffsetPx,
        0,
        resizeHandle.positionPx,
      );
    }

    return clampNumber(
      resizeHandle.positionPx + mobileGripSlideOffsetPx,
      resizeHandle.positionPx,
      viewportWidthPx,
    );
  }

  function startResize(resizeHandle: WorkspaceLayoutV2ResizeHandleConfig) {
    const currentSurface = mobileSurfaceRef.current;
    const currentMergedSide = currentSurface.kind === "merged" ? currentSurface.side : null;
    const mergeTargetSide =
      mobileMinResizeBehavior === "min_resize_to_merge" &&
      (currentMergedSide === null || currentMergedSide === resizeHandle.side)
        ? resizeHandle.side
        : null;

    activeGripResizeSideRef.current = resizeHandle.side;
    setMobileGripState({
      kind: "dragging",
      mergeTargetSide,
      previewSurface: currentSurface,
      shouldSettleMergedOnEnd: false,
      side: resizeHandle.side,
      slideOffsetPx: 0,
      startMainWidthPx:
        currentSurface.kind === "merged" ? currentSurface.mainWidthPx : mobileDefaultPaneWidthPx,
      startSideWidthPx: resizeHandle.currentWidthPx,
    });
    carouselRef.current?.style.setProperty("scroll-snap-type", "none");
  }

  function endResize(resizeHandle: WorkspaceLayoutV2ResizeHandleConfig) {
    const carouselNode = carouselRef.current;
    let didSettleMergedMainPane = false;
    const currentSurface = mobileSurfaceRef.current;
    const currentMobileGrip = mobileGripRef.current;
    const mergedMainWidthPx = currentSurface.kind === "merged" ? currentSurface.mainWidthPx : null;
    activeGripResizeSideRef.current = null;
    setMobileGripState(WORKSPACE_LAYOUT_V2_IDLE_MOBILE_GRIP);

    if (
      mobileMinResizeBehavior === "min_resize_to_merge" &&
      mergedMainWidthPx !== null &&
      currentMobileGrip.kind === "dragging" &&
      currentMobileGrip.mergeTargetSide === resizeHandle.side
    ) {
      const settledMainWidthPx = getMergedMobileMainWidthPx({
        mainMaxWidthPx: mobileDefaultPaneWidthPx,
        mainMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
        sideMinWidthPx: resizeHandle.minWidthPx,
        viewportWidthPx,
      });

      if (settledMainWidthPx !== null && currentMobileGrip.shouldSettleMergedOnEnd) {
        settleMobileMergedSurface({
          mainWidthPx: settledMainWidthPx,
          side: resizeHandle.side,
          sideWidthPx: resizeHandle.minWidthPx,
        });
        if (carouselNode !== null) {
          carouselNode.scrollLeft = getMobilePaneScrollLeftPx(resizeHandle.side, {
            hasLeftPane,
            hasRightPane,
            leftWidthPx: resizeHandle.side === "left" ? resizeHandle.minWidthPx : leftWidthPx,
            mainWidthPx: settledMainWidthPx,
            rightWidthPx: resizeHandle.side === "right" ? resizeHandle.minWidthPx : rightWidthPx,
            viewportWidthPx,
            mergedSurfaceSide: resizeHandle.side,
          });
        }
        didSettleMergedMainPane = true;
      } else {
        setMobileSurface(WORKSPACE_LAYOUT_V2_UNMERGED_MOBILE_SURFACE);
      }
    }
    if (
      mobileMinResizeBehavior === "min_resize_to_merge" &&
      currentMobileGrip.kind === "dragging" &&
      currentMobileGrip.mergeTargetSide === null &&
      currentSurface.kind === "merged" &&
      currentSurface.side !== resizeHandle.side
    ) {
      setMobileSurface(currentSurface);
    }

    carouselNode?.style.removeProperty("scroll-snap-type");

    return {
      shouldSyncPaneFromScroll: !didSettleMergedMainPane,
    };
  }

  function changeRawSize(resizeHandle: WorkspaceLayoutV2ResizeHandleConfig, rawWidthPx: number) {
    const carouselNode = carouselRef.current;
    if (carouselNode === null) {
      return;
    }

    const clampedRawWidthPx = clampNumber(
      Math.round(rawWidthPx),
      resizeHandle.minWidthPx,
      resizeHandle.maxWidthPx,
    );
    const pastMinimumPx = Math.max(0, resizeHandle.minWidthPx - rawWidthPx);
    const currentMobileGrip = mobileGripRef.current;
    const currentSurface = mobileSurfaceRef.current;
    const currentMergedSide = currentSurface.kind === "merged" ? currentSurface.side : null;
    const currentMergedMainWidthPx =
      currentSurface.kind === "merged" ? currentSurface.mainWidthPx : null;

    if (
      mobileMinResizeBehavior === "min_resize_to_merge" &&
      currentMobileGrip.kind === "dragging" &&
      currentMobileGrip.mergeTargetSide === resizeHandle.side
    ) {
      const mergeResizeWidths = getMobileMinResizeMergeWidthsPx({
        mainMaxWidthPx: mobileDefaultPaneWidthPx,
        mainMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
        rawSideWidthPx: rawWidthPx,
        sideMaxWidthPx: resizeHandle.maxWidthPx,
        sideMinWidthPx: resizeHandle.minWidthPx,
        startMainWidthPx: currentMobileGrip.startMainWidthPx,
        startSideWidthPx: currentMobileGrip.startSideWidthPx,
        viewportWidthPx,
      });

      if (mergeResizeWidths !== null) {
        const shouldSettleMergedOnEnd = shouldCommitMobileMergedSurface({
          sideMinWidthPx: resizeHandle.minWidthPx,
          sideWidthPx: mergeResizeWidths.sideWidthPx,
        });
        setMobileGripState({
          ...currentMobileGrip,
          shouldSettleMergedOnEnd,
          slideOffsetPx: 0,
        });
        const handoffSide = getMobileMergeHandoffSide({
          currentMergedSide,
          hasLeftPane,
          hasRightPane,
          leftWidthPx,
          resizeSide: resizeHandle.side,
          rightWidthPx,
          shouldKeepCurrentMerge: shouldSettleMergedOnEnd,
          sidebarMinWidthPx: resizeHandle.minWidthPx,
        });
        const scrollOffsetArgs = {
          hasLeftPane,
          hasRightPane,
          leftWidthPx: resizeHandle.side === "left" ? mergeResizeWidths.sideWidthPx : leftWidthPx,
          mainWidthPx: mergeResizeWidths.mainWidthPx,
          mergedSurfaceSide: resizeHandle.side,
          rightWidthPx:
            resizeHandle.side === "right" ? mergeResizeWidths.sideWidthPx : rightWidthPx,
          viewportWidthPx,
        };

        if (handoffSide !== null) {
          const handoffSideWidthPx = handoffSide === "left" ? leftWidthPx : rightWidthPx;
          const handoffMainWidthPx = getMergedMobileMainWidthPx({
            mainMaxWidthPx: mobileDefaultPaneWidthPx,
            mainMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
            sideMinWidthPx: handoffSideWidthPx,
            viewportWidthPx,
          });

          if (handoffMainWidthPx !== null) {
            setMobileGripState({
              ...currentMobileGrip,
              mergeTargetSide: null,
              shouldSettleMergedOnEnd: false,
              slideOffsetPx: 0,
            });
            resizeHandle.onWidthChange(mergeResizeWidths.sideWidthPx);
            setPreviewMobileMergedSurface(handoffSide, handoffMainWidthPx);
            carouselNode.scrollLeft = getMobilePaneScrollLeftPx(resizeHandle.side, {
              ...scrollOffsetArgs,
              mainWidthPx: handoffMainWidthPx,
              mergedSurfaceSide: handoffSide,
            });
            return;
          }
        }

        resizeHandle.onWidthChange(mergeResizeWidths.sideWidthPx);
        if (mergeResizeWidths.mainWidthPx >= mobileDefaultPaneWidthPx) {
          clearPreviewMobileSurface();
        } else {
          setPreviewMobileMergedSurface(resizeHandle.side, mergeResizeWidths.mainWidthPx);
        }
        carouselNode.scrollLeft = getMobilePaneScrollLeftPx(resizeHandle.side, scrollOffsetArgs);
        return;
      }
    }

    if (
      mobileMinResizeBehavior === "min_resize_to_merge" &&
      currentMobileGrip.kind === "dragging" &&
      currentMobileGrip.mergeTargetSide === null &&
      currentMergedSide !== null &&
      currentMergedSide !== resizeHandle.side &&
      currentMergedMainWidthPx !== null
    ) {
      const nextSideWidthPx = clampedRawWidthPx;
      const nextLeftWidthPx = resizeHandle.side === "left" ? nextSideWidthPx : leftWidthPx;
      const nextRightWidthPx = resizeHandle.side === "right" ? nextSideWidthPx : rightWidthPx;
      resizeHandle.onWidthChange(nextSideWidthPx);
      carouselNode.scrollLeft = getMobilePaneScrollLeftPx(resizeHandle.side, {
        hasLeftPane,
        hasRightPane,
        leftWidthPx: nextLeftWidthPx,
        mainWidthPx: currentMergedMainWidthPx,
        mergedSurfaceSide: currentMergedSide,
        rightWidthPx: nextRightWidthPx,
        viewportWidthPx,
      });
      setMobileGripSlideOffsetPx(0);
      return;
    }

    clearPreviewMobileSurface();
    const scrollOffsetArgs = {
      hasLeftPane,
      hasRightPane,
      leftWidthPx: resizeHandle.side === "left" ? clampedRawWidthPx : leftWidthPx,
      mainWidthPx: mobileDefaultPaneWidthPx,
      mergedSurfaceSide: null,
      rightWidthPx: resizeHandle.side === "right" ? clampedRawWidthPx : rightWidthPx,
      viewportWidthPx,
    };
    const sidebarScrollLeftPx = getMobilePaneScrollLeftPx(resizeHandle.side, scrollOffsetArgs);
    const mainScrollLeftPx = getMobilePaneScrollLeftPx("main", scrollOffsetArgs);
    const nextScrollLeftPx =
      resizeHandle.side === "left"
        ? Math.min(mainScrollLeftPx, sidebarScrollLeftPx + pastMinimumPx)
        : Math.max(mainScrollLeftPx, sidebarScrollLeftPx - pastMinimumPx);

    carouselNode.scrollLeft = nextScrollLeftPx;
    setMobileGripSlideOffsetPx(Math.abs(nextScrollLeftPx - sidebarScrollLeftPx));
  }

  return {
    changeRawSize,
    endResize,
    getGripPositionPx,
    isMobileMergedFit,
    lockCarouselScroll,
    mobileDefaultMainWidthPx: mobileDefaultPaneWidthPx,
    mobileMergeDebugGeometry,
    mobileSurface: activeMobileSurface,
    startResize,
  };
}
