import { useEffect, useEffectEvent, useRef, type RefObject } from "react";
import {
  MOBILE_PANE_SETTLED_TOLERANCE_PX,
  SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX,
  SIDEBAR_LAYOUT_IDLE_MOBILE_GRIP,
  SIDEBAR_LAYOUT_UNMERGED_MOBILE_SURFACE,
  clampNumber,
  getMergedMobileMainWidthPx,
  getMobileMergeHandoffSide,
  getMobileMinResizeMergeWidthsPx,
  getMobilePaneScrollLeftPx,
  shouldCommitMobileMergedSurface,
  type SidebarLayoutMobileGrip,
  type SidebarLayoutMobileMergedSide,
  type SidebarLayoutMobileMinResizeBehavior,
  type SidebarLayoutMobileSurface,
} from "./SidebarLayoutGeometryInternal.ts";
import {
  useSidebarLayoutActions,
  useSidebarLayoutSelector,
  useSidebarRuntimeActions,
  useSidebarRuntimeState,
} from "./SidebarRuntimeInternal.tsx";
import { type SidebarLayoutResizeHandleConfig } from "./SidebarLayoutResizeHandleConfigs.ts";

/**
 * Owns the transient mobile grip session that can resolve either to legacy
 * resize-to-slide or to paired side/main pane resizing.
 */
export function useSidebarLayoutMobileGripResizeController({
  activeGripResizeSideRef,
  carouselRef,
  hasLeftPane,
  hasRightPane,
  isMobile,
  leftWidthPx,
  mobileMinResizeBehavior,
  rightWidthPx,
  viewportWidthPx,
}: {
  activeGripResizeSideRef: RefObject<"left" | "right" | null>;
  carouselRef: RefObject<HTMLDivElement | null>;
  hasLeftPane: boolean;
  hasRightPane: boolean;
  isMobile: boolean;
  leftWidthPx: number;
  mobileMinResizeBehavior: SidebarLayoutMobileMinResizeBehavior;
  rightWidthPx: number;
  viewportWidthPx: number;
}) {
  const mobileGrip = useSidebarLayoutSelector((state) => state.mobile.grip);
  const { mobileSurface } = useSidebarRuntimeState();
  const { setMobileGrip } = useSidebarLayoutActions();
  const { setMobileSurface, settleMobileMergedSurface } = useSidebarRuntimeActions();
  const mobileDefaultPaneWidthPx = Math.max(1, viewportWidthPx);
  // Account state is shared across routes and devices, but a stored merged
  // main width was measured in one viewport. Resolve it locally so a different
  // route or viewport never repairs shared state by clearing another client's merge.
  const durableMobileMergedSide = mobileSurface.kind === "merged" ? mobileSurface.side : null;
  const durableMobileMergedSideWidthPx =
    durableMobileMergedSide === "left"
      ? leftWidthPx
      : durableMobileMergedSide === "right"
        ? rightWidthPx
        : 0;
  const hasDurableMobileMergedPane =
    (durableMobileMergedSide === "left" && hasLeftPane) ||
    (durableMobileMergedSide === "right" && hasRightPane);
  const durableMobileMergedMainWidthPx =
    mobileMinResizeBehavior === "min_resize_to_merge" && hasDurableMobileMergedPane
      ? getMergedMobileMainWidthPx({
          mainMaxWidthPx: mobileDefaultPaneWidthPx,
          mainMinWidthPx: SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX,
          sideMinWidthPx: durableMobileMergedSideWidthPx,
          viewportWidthPx,
        })
      : null;
  const resolvedDurableMobileSurface =
    mobileSurface.kind === "merged" && durableMobileMergedMainWidthPx !== null
      ? {
          ...mobileSurface,
          mainWidthPx: durableMobileMergedMainWidthPx,
        }
      : SIDEBAR_LAYOUT_UNMERGED_MOBILE_SURFACE;
  const mobileGripRef = useRef<SidebarLayoutMobileGrip>(mobileGrip);
  const activeMobileSurface =
    mobileGrip.kind === "dragging" ? mobileGrip.previewSurface : resolvedDurableMobileSurface;
  const mobileSurfaceRef = useRef<SidebarLayoutMobileSurface>(activeMobileSurface);
  mobileGripRef.current = mobileGrip;
  mobileSurfaceRef.current = activeMobileSurface;
  const mobileMergedSide = activeMobileSurface.kind === "merged" ? activeMobileSurface.side : null;
  const mobileMergedMainWidthPx =
    activeMobileSurface.kind === "merged" ? activeMobileSurface.mainWidthPx : null;
  const mobileGripSlideOffsetPx = mobileGrip.kind === "dragging" ? mobileGrip.slideOffsetPx : 0;
  const mobileMergedSideWidthPx =
    mobileMergedSide === "left" ? leftWidthPx : mobileMergedSide === "right" ? rightWidthPx : 0;
  const hasMobileMergedPane =
    (mobileMergedSide === "left" && hasLeftPane) || (mobileMergedSide === "right" && hasRightPane);
  const isMobileMergedFit =
    hasMobileMergedPane &&
    mobileMergedMainWidthPx !== null &&
    mobileMergedMainWidthPx >= SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX &&
    mobileMergedSideWidthPx + mobileMergedMainWidthPx <=
      viewportWidthPx + MOBILE_PANE_SETTLED_TOLERANCE_PX;
  const hasOppositePaneForMergedSide =
    (mobileMergedSide === "left" && hasRightPane) || (mobileMergedSide === "right" && hasLeftPane);
  const lockCarouselScroll =
    mobileMinResizeBehavior === "min_resize_to_merge" &&
    isMobileMergedFit &&
    !hasOppositePaneForMergedSide;

  function setMobileGripState(nextMobileGrip: SidebarLayoutMobileGrip) {
    mobileGripRef.current = nextMobileGrip;
    setMobileGrip(nextMobileGrip);
  }

  function setPreviewMobileSurface(surface: SidebarLayoutMobileSurface) {
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
    setPreviewMobileSurface(SIDEBAR_LAYOUT_UNMERGED_MOBILE_SURFACE);
  }

  function setPreviewMobileMergedSurface(side: SidebarLayoutMobileMergedSide, mainWidthPx: number) {
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

  const resetMobileGripResizeEffect = useEffectEvent(() => {
    activeGripResizeSideRef.current = null;
    setMobileGripState(SIDEBAR_LAYOUT_IDLE_MOBILE_GRIP);
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

  function getGripPositionPx(resizeHandle: SidebarLayoutResizeHandleConfig) {
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

  function startResize(resizeHandle: SidebarLayoutResizeHandleConfig) {
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
      startSideWidthPx: resizeHandle.currentWidthPx,
    });
    carouselRef.current?.style.setProperty("scroll-snap-type", "none");
  }

  function endResize(resizeHandle: SidebarLayoutResizeHandleConfig) {
    const carouselNode = carouselRef.current;
    let didSettleMergedMainPane = false;
    const currentSurface = mobileSurfaceRef.current;
    const currentMobileGrip = mobileGripRef.current;
    const mergedMainWidthPx = currentSurface.kind === "merged" ? currentSurface.mainWidthPx : null;
    activeGripResizeSideRef.current = null;
    setMobileGripState(SIDEBAR_LAYOUT_IDLE_MOBILE_GRIP);

    if (
      mobileMinResizeBehavior === "min_resize_to_merge" &&
      currentMobileGrip.kind === "dragging" &&
      currentMobileGrip.mergeTargetSide === resizeHandle.side
    ) {
      const settledMainWidthPx = getMergedMobileMainWidthPx({
        mainMaxWidthPx: mobileDefaultPaneWidthPx,
        mainMinWidthPx: SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX,
        sideMinWidthPx: resizeHandle.minWidthPx,
        viewportWidthPx,
      });

      if (
        mergedMainWidthPx !== null &&
        settledMainWidthPx !== null &&
        currentMobileGrip.shouldSettleMergedOnEnd
      ) {
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
        setMobileSurface(SIDEBAR_LAYOUT_UNMERGED_MOBILE_SURFACE);
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

  function changeRawSize(resizeHandle: SidebarLayoutResizeHandleConfig, rawWidthPx: number) {
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
        mainMinWidthPx: SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX,
        rawSideWidthPx: rawWidthPx,
        sideMaxWidthPx: resizeHandle.maxWidthPx,
        sideMinWidthPx: resizeHandle.minWidthPx,
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
            mainMinWidthPx: SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX,
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
    mobileSurface: activeMobileSurface,
    startResize,
  };
}
