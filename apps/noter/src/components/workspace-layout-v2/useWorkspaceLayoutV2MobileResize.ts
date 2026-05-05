import { useEffect, useEffectEvent, useRef, type RefObject } from "react";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import {
  MOBILE_PANE_SETTLED_TOLERANCE_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
  clampNumber,
  getMergedMobileMainWidthPx,
  getMobileMergeHandoffSide,
  getMobileMinResizeMergeWidthsPx,
  getMobilePaneScrollLeftPx,
  getMobilePaneWidthPx,
  shouldCommitMobileMergedSurface,
  type MobilePane,
  type WorkspaceLayoutV2MobileMergedSide,
  type WorkspaceLayoutV2MobileMinResizeBehavior,
} from "./WorkspaceLayoutV2Geometry";

export type WorkspaceLayoutV2ResizeHandleConfig = {
  currentWidthPx: number;
  dataTestId: string;
  maxWidthPx: number;
  minWidthPx: number;
  onWidthChange: (nextWidthPx: number) => void;
  positionPx: number;
  side: "left" | "right";
};

type WorkspaceLayoutV2MobileGripResizeStoreState = {
  mobileGripSlideOffsetPx: number;
  mobileMergedMainWidthPx: number | null;
  mobileMergedSide: WorkspaceLayoutV2MobileMergedSide | null;
};

const WORKSPACE_LAYOUT_V2_MOBILE_GRIP_RESIZE_INITIAL_STATE: WorkspaceLayoutV2MobileGripResizeStoreState =
  {
    mobileGripSlideOffsetPx: 0,
    mobileMergedMainWidthPx: null,
    mobileMergedSide: null,
  };

/**
 * Stores the render-visible portion of a mobile grip session. Imperative drag
 * bookkeeping stays in refs, while pane widths that must re-render live here.
 */
function useWorkspaceLayoutV2MobileGripResizeStore() {
  return useCreateStore(
    WORKSPACE_LAYOUT_V2_MOBILE_GRIP_RESIZE_INITIAL_STATE,
    ({ setState }) => ({
      clearMobileMergedSurface: () => {
        setState((state) => ({
          ...state,
          mobileMergedMainWidthPx: null,
          mobileMergedSide: null,
        }));
      },
      setMobileGripSlideOffsetPx: (mobileGripSlideOffsetPx: number) => {
        setState((state) =>
          state.mobileGripSlideOffsetPx === mobileGripSlideOffsetPx
            ? state
            : { ...state, mobileGripSlideOffsetPx },
        );
      },
      setMobileMergedSurface: (
        mobileMergedSide: WorkspaceLayoutV2MobileMergedSide,
        mobileMergedMainWidthPx: number,
      ) => {
        setState((state) => ({
          ...state,
          mobileMergedMainWidthPx,
          mobileMergedSide,
        }));
      },
    }),
  );
}

/**
 * Owns the transient mobile grip session that can resolve either to legacy
 * resize-to-slide or to paired side/main pane resizing.
 */
export function useWorkspaceLayoutV2MobileGripResizeController({
  activeGripResizeSideRef,
  carouselRef,
  hasLeftPane,
  hasRightPane,
  isMobile,
  leftWidthPx,
  mobileMinResizeBehavior,
  mobilePane,
  peekWidthPx,
  rightWidthPx,
  viewportWidthPx,
}: {
  activeGripResizeSideRef: RefObject<"left" | "right" | null>;
  carouselRef: RefObject<HTMLDivElement | null>;
  hasLeftPane: boolean;
  hasRightPane: boolean;
  isMobile: boolean;
  leftWidthPx: number;
  mobileMinResizeBehavior: WorkspaceLayoutV2MobileMinResizeBehavior;
  mobilePane: MobilePane;
  peekWidthPx: number;
  rightWidthPx: number;
  viewportWidthPx: number;
}) {
  const resizeSessionRef = useRef<{
    mergeTargetSide: WorkspaceLayoutV2MobileMergedSide | null;
    shouldSettleMergedOnEnd: boolean;
    startMainWidthPx: number;
    startSideWidthPx: number;
  } | null>(null);
  const store = useWorkspaceLayoutV2MobileGripResizeStore();
  const { mobileGripSlideOffsetPx, mobileMergedMainWidthPx, mobileMergedSide } =
    useSelector(store);
  const clearMobileMergedSurfaceState = store.actions.clearMobileMergedSurface;
  const setMobileGripSlideOffsetPx = store.actions.setMobileGripSlideOffsetPx;
  const setMobileMergedSurfaceState = store.actions.setMobileMergedSurface;
  const mobileMergedMainWidthPxRef = useRef<number | null>(null);
  const mobileMergedSideRef = useRef<WorkspaceLayoutV2MobileMergedSide | null>(
    null,
  );
  const mobileDefaultPaneWidthPx = getMobilePaneWidthPx({
    peekWidthPx,
    viewportWidthPx,
  });
  const mobileMergedSideWidthPx =
    mobileMergedSide === "left"
      ? leftWidthPx
      : mobileMergedSide === "right"
        ? rightWidthPx
        : 0;
  const isMobileMergedFit =
    mobileMergedMainWidthPx !== null &&
    mobileMergedSide !== null &&
    mobileMergedSideWidthPx + mobileMergedMainWidthPx <=
      viewportWidthPx + MOBILE_PANE_SETTLED_TOLERANCE_PX;
  const hasOppositePaneForMergedSide =
    (mobileMergedSide === "left" && hasRightPane) ||
    (mobileMergedSide === "right" && hasLeftPane);
  const lockCarouselScroll =
    mobileMinResizeBehavior === "min_resize_to_merge" &&
    isMobileMergedFit &&
    !hasOppositePaneForMergedSide;

  function clearMobileMergedSurface() {
    mobileMergedMainWidthPxRef.current = null;
    mobileMergedSideRef.current = null;
    clearMobileMergedSurfaceState();
  }

  function setMobileMergedSurface(
    side: WorkspaceLayoutV2MobileMergedSide,
    mainWidthPx: number,
  ) {
    mobileMergedMainWidthPxRef.current = mainWidthPx;
    mobileMergedSideRef.current = side;
    setMobileMergedSurfaceState(side, mainWidthPx);
  }

  const clearMobileMergedSurfaceEffect = useEffectEvent(() => {
    clearMobileMergedSurface();
  });
  const resetMobileGripResizeEffect = useEffectEvent(() => {
    activeGripResizeSideRef.current = null;
    resizeSessionRef.current = null;
    setMobileGripSlideOffsetPx(0);
    clearMobileMergedSurface();
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
   * Drops merged pane geometry when viewport constraints or resize behavior
   * change the meaning of that transient fit.
   */
  useEffect(() => {
    clearMobileMergedSurfaceEffect();
  }, [
    hasLeftPane,
    hasRightPane,
    isMobile,
    mobileDefaultPaneWidthPx,
    mobileMinResizeBehavior,
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

    clearMobileMergedSurfaceEffect();
  }, [mobilePane]);

  function getGripPositionPx(
    resizeHandle: WorkspaceLayoutV2ResizeHandleConfig,
  ) {
    if (activeGripResizeSideRef.current !== resizeHandle.side) {
      return resizeHandle.positionPx;
    }

    if (resizeHandle.side === "left") {
      return clampNumber(
        resizeHandle.positionPx - mobileGripSlideOffsetPx,
        peekWidthPx,
        resizeHandle.positionPx,
      );
    }

    return clampNumber(
      resizeHandle.positionPx + mobileGripSlideOffsetPx,
      resizeHandle.positionPx,
      Math.max(peekWidthPx, viewportWidthPx) - peekWidthPx,
    );
  }

  function startResize(resizeHandle: WorkspaceLayoutV2ResizeHandleConfig) {
    const currentMergedSide = mobileMergedSideRef.current;
    const mergeTargetSide =
      mobileMinResizeBehavior === "min_resize_to_merge" &&
      (currentMergedSide === null || currentMergedSide === resizeHandle.side)
        ? resizeHandle.side
        : null;

    activeGripResizeSideRef.current = resizeHandle.side;
    resizeSessionRef.current = {
      mergeTargetSide,
      shouldSettleMergedOnEnd: false,
      startMainWidthPx:
        mobileMergedMainWidthPxRef.current ?? mobileDefaultPaneWidthPx,
      startSideWidthPx: resizeHandle.currentWidthPx,
    };
    setMobileGripSlideOffsetPx(0);
    carouselRef.current?.style.setProperty("scroll-snap-type", "none");
  }

  function endResize(resizeHandle: WorkspaceLayoutV2ResizeHandleConfig) {
    const carouselNode = carouselRef.current;
    let didSettleMergedMainPane = false;
    const mergedMainWidthPx = mobileMergedMainWidthPxRef.current;
    const resizeSession = resizeSessionRef.current;
    activeGripResizeSideRef.current = null;
    resizeSessionRef.current = null;
    setMobileGripSlideOffsetPx(0);

    if (
      mobileMinResizeBehavior === "min_resize_to_merge" &&
      mergedMainWidthPx !== null &&
      resizeSession?.mergeTargetSide === resizeHandle.side
    ) {
      const settledMainWidthPx = getMergedMobileMainWidthPx({
        mainMaxWidthPx: mobileDefaultPaneWidthPx,
        mainMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
        sideMinWidthPx: resizeHandle.minWidthPx,
        viewportWidthPx,
      });

      if (settledMainWidthPx !== null && carouselNode !== null) {
        if (resizeSession.shouldSettleMergedOnEnd) {
          resizeHandle.onWidthChange(resizeHandle.minWidthPx);
          setMobileMergedSurface(resizeHandle.side, settledMainWidthPx);
          carouselNode.scrollLeft = getMobilePaneScrollLeftPx(
            resizeHandle.side,
            {
              hasLeftPane,
              hasRightPane,
              leftWidthPx:
                resizeHandle.side === "left"
                  ? resizeHandle.minWidthPx
                  : leftWidthPx,
              mainWidthPx: settledMainWidthPx,
              peekWidthPx,
              rightWidthPx:
                resizeHandle.side === "right"
                  ? resizeHandle.minWidthPx
                  : rightWidthPx,
              viewportWidthPx,
              mergedSurfaceSide: resizeHandle.side,
            },
          );
          didSettleMergedMainPane = true;
        } else {
          clearMobileMergedSurface();
        }
      } else {
        clearMobileMergedSurface();
      }
    }

    carouselNode?.style.removeProperty("scroll-snap-type");

    return {
      shouldSyncPaneFromScroll: !didSettleMergedMainPane,
    };
  }

  function changeRawSize(
    resizeHandle: WorkspaceLayoutV2ResizeHandleConfig,
    rawWidthPx: number,
  ) {
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
    const resizeSession = resizeSessionRef.current;
    const currentMergedSide = mobileMergedSideRef.current;

    if (
      mobileMinResizeBehavior === "min_resize_to_merge" &&
      resizeSession?.mergeTargetSide === resizeHandle.side
    ) {
      const mergeResizeWidths = getMobileMinResizeMergeWidthsPx({
        mainMaxWidthPx: mobileDefaultPaneWidthPx,
        mainMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
        rawSideWidthPx: rawWidthPx,
        sideMaxWidthPx: resizeHandle.maxWidthPx,
        sideMinWidthPx: resizeHandle.minWidthPx,
        startMainWidthPx: resizeSession.startMainWidthPx,
        startSideWidthPx: resizeSession.startSideWidthPx,
        viewportWidthPx,
      });

      if (mergeResizeWidths !== null) {
        const shouldSettleMergedOnEnd = shouldCommitMobileMergedSurface({
          mainDefaultWidthPx: mobileDefaultPaneWidthPx,
          mainWidthPx: mergeResizeWidths.mainWidthPx,
          settledMainWidthPx: mergeResizeWidths.settledMainWidthPx,
        });
        resizeSession.shouldSettleMergedOnEnd = shouldSettleMergedOnEnd;
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
          leftWidthPx:
            resizeHandle.side === "left"
              ? mergeResizeWidths.sideWidthPx
              : leftWidthPx,
          mainWidthPx: mergeResizeWidths.mainWidthPx,
          mergedSurfaceSide: resizeHandle.side,
          peekWidthPx,
          rightWidthPx:
            resizeHandle.side === "right"
              ? mergeResizeWidths.sideWidthPx
              : rightWidthPx,
          viewportWidthPx,
        };

        if (handoffSide !== null) {
          const handoffSideWidthPx =
            handoffSide === "left" ? leftWidthPx : rightWidthPx;
          const handoffMainWidthPx = getMergedMobileMainWidthPx({
            mainMaxWidthPx: mobileDefaultPaneWidthPx,
            mainMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
            sideMinWidthPx: handoffSideWidthPx,
            viewportWidthPx,
          });

          if (handoffMainWidthPx !== null) {
            resizeSession.mergeTargetSide = null;
            resizeSession.shouldSettleMergedOnEnd = false;
            resizeHandle.onWidthChange(mergeResizeWidths.sideWidthPx);
            setMobileMergedSurface(handoffSide, handoffMainWidthPx);
            carouselNode.scrollLeft = getMobilePaneScrollLeftPx(
              resizeHandle.side,
              {
                ...scrollOffsetArgs,
                mainWidthPx: handoffMainWidthPx,
                mergedSurfaceSide: handoffSide,
              },
            );
            setMobileGripSlideOffsetPx(0);
            return;
          }
        }

        resizeHandle.onWidthChange(mergeResizeWidths.sideWidthPx);
        if (mergeResizeWidths.mainWidthPx >= mobileDefaultPaneWidthPx) {
          clearMobileMergedSurface();
        } else {
          setMobileMergedSurface(
            resizeHandle.side,
            mergeResizeWidths.mainWidthPx,
          );
        }
        carouselNode.scrollLeft = getMobilePaneScrollLeftPx(
          resizeHandle.side,
          scrollOffsetArgs,
        );
        setMobileGripSlideOffsetPx(0);
        return;
      }
    }

    if (
      mobileMinResizeBehavior === "min_resize_to_merge" &&
      resizeSession?.mergeTargetSide === null &&
      currentMergedSide !== null &&
      currentMergedSide !== resizeHandle.side &&
      mobileMergedMainWidthPxRef.current !== null
    ) {
      const nextSideWidthPx = clampedRawWidthPx;
      const nextLeftWidthPx =
        resizeHandle.side === "left" ? nextSideWidthPx : leftWidthPx;
      const nextRightWidthPx =
        resizeHandle.side === "right" ? nextSideWidthPx : rightWidthPx;
      resizeHandle.onWidthChange(nextSideWidthPx);
      carouselNode.scrollLeft = getMobilePaneScrollLeftPx(resizeHandle.side, {
        hasLeftPane,
        hasRightPane,
        leftWidthPx: nextLeftWidthPx,
        mainWidthPx: mobileMergedMainWidthPxRef.current,
        mergedSurfaceSide: currentMergedSide,
        peekWidthPx,
        rightWidthPx: nextRightWidthPx,
        viewportWidthPx,
      });
      setMobileGripSlideOffsetPx(0);
      return;
    }

    clearMobileMergedSurface();
    const scrollOffsetArgs = {
      hasLeftPane,
      hasRightPane,
      leftWidthPx:
        resizeHandle.side === "left" ? clampedRawWidthPx : leftWidthPx,
      mainWidthPx: mobileDefaultPaneWidthPx,
      mergedSurfaceSide: null,
      peekWidthPx,
      rightWidthPx:
        resizeHandle.side === "right" ? clampedRawWidthPx : rightWidthPx,
      viewportWidthPx,
    };
    const sidebarScrollLeftPx = getMobilePaneScrollLeftPx(
      resizeHandle.side,
      scrollOffsetArgs,
    );
    const mainScrollLeftPx = getMobilePaneScrollLeftPx(
      "main",
      scrollOffsetArgs,
    );
    const nextScrollLeftPx =
      resizeHandle.side === "left"
        ? Math.min(mainScrollLeftPx, sidebarScrollLeftPx + pastMinimumPx)
        : Math.max(mainScrollLeftPx, sidebarScrollLeftPx - pastMinimumPx);

    carouselNode.scrollLeft = nextScrollLeftPx;
    setMobileGripSlideOffsetPx(
      Math.abs(nextScrollLeftPx - sidebarScrollLeftPx),
    );
  }

  return {
    changeRawSize,
    endResize,
    getGripPositionPx,
    isMobileMergedFit,
    lockCarouselScroll,
    mobileDefaultMainWidthPx: mobileDefaultPaneWidthPx,
    mobileMergedMainWidthPx,
    mobileMergedSide,
    startResize,
  };
}
