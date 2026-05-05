import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { Button } from "../ui/button";
import { PanelLeft, PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebar } from "@/hooks/use-sidebar";
import { isLandingDevModeEnabled } from "@/lib/landingDevMode";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import {
  WorkspaceLayoutV2PaneFrame,
  type WorkspaceLayoutV2PaneFrameProps,
} from "./WorkspaceLayoutV2PaneFrame";
import {
  type WorkspaceLayoutV2BottomPanelProps,
  WorkspaceLayoutV2MainViewportWithPanel,
} from "./WorkspaceLayoutV2BottomPanel";
import {
  DEFAULT_MOBILE_PANE_PEEK_WIDTH_PX,
  MOBILE_PANE_SETTLED_TOLERANCE_PX,
  WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
  clampNumber,
  getDesktopSidebarMaxWidthPx,
  getDesktopSidebarWidthPx,
  getMergedMobileMainWidthPx,
  getMobileMergeHandoffSide,
  getMobileMinResizeMergeWidthsPx,
  getMobilePaneFromScrollLeft,
  getMobilePanePeekWidthPx,
  getMobilePaneScrollLeftPx,
  getMobilePaneWidthPx,
  getMobileSidebarMaxWidthPx,
  getMobileSidebarMinWidthPx,
  getMobileSidebarWidthPx,
  isMobilePaneScrollSettled,
  shouldCommitMobileMergedSurface,
  type MobilePane,
  type WorkspaceLayoutV2ActiveResizeSide,
  type WorkspaceLayoutV2MobileMergedSide,
  type WorkspaceLayoutV2MobileMinResizeBehavior,
} from "./WorkspaceLayoutV2Geometry";
import { WorkspaceLayoutV2ResizeHandle } from "./WorkspaceLayoutV2ResizeHandle";

type WorkspaceLayoutV2Props = {
  dataTestId?: string;
  left?: ReactNode;
  main: ReactNode;
  right: ReactNode;
};

type WorkspaceLayoutV2JustPanesProps = WorkspaceLayoutV2Props & {
  mobileMinResizeBehavior?: WorkspaceLayoutV2MobileMinResizeBehavior;
  mobilePanePeekWidthPx?: number;
  panel?: WorkspaceLayoutV2BottomPanelProps;
  showMobileResizeGripDots?: boolean;
};

type WorkspaceLayoutV2ResolvedPaneContent = {
  leftContent: ReactNode;
  mainContent: ReactNode;
  rightContent: ReactNode;
};

type WorkspaceLayoutV2ResizeHandleConfig = {
  currentWidthPx: number;
  dataTestId: string;
  maxWidthPx: number;
  minWidthPx: number;
  onWidthChange: (nextWidthPx: number) => void;
  positionPx: number;
  side: "left" | "right";
};
type WorkspaceLayoutV2ElementSize = {
  heightPx: number;
  widthPx: number;
};
type WorkspaceLayoutV2MobileGripResizeStoreState = {
  mobileGripSlideOffsetPx: number;
  mobileMergedMainWidthPx: number | null;
  mobileMergedSide: WorkspaceLayoutV2MobileMergedSide | null;
};
type WorkspaceLayoutV2MobileCarouselStoreState = {
  isMobilePaneSettled: boolean;
};
type WorkspaceLayoutV2ShellStoreState = {
  activeResizeSide: WorkspaceLayoutV2ActiveResizeSide;
};
type WorkspaceLayoutV2LeftToggleVisibility = "all" | "desktop" | "hidden";
type WorkspaceLayoutV2RightToggleVisibility = "desktop" | "hidden";

const WORKSPACE_LAYOUT_V2_EMPTY_ELEMENT_SIZE: WorkspaceLayoutV2ElementSize = {
  heightPx: 0,
  widthPx: 0,
};
const WORKSPACE_LAYOUT_V2_MOBILE_GRIP_RESIZE_INITIAL_STATE: WorkspaceLayoutV2MobileGripResizeStoreState =
  {
    mobileGripSlideOffsetPx: 0,
    mobileMergedMainWidthPx: null,
    mobileMergedSide: null,
  };
const WORKSPACE_LAYOUT_V2_MOBILE_CAROUSEL_INITIAL_STATE: WorkspaceLayoutV2MobileCarouselStoreState =
  {
    isMobilePaneSettled: true,
  };
const WORKSPACE_LAYOUT_V2_SHELL_INITIAL_STATE: WorkspaceLayoutV2ShellStoreState =
  {
    activeResizeSide: null,
  };

const LEFT_TOGGLE_BUTTON_CLASS_NAMES = {
  all: "h-8 w-8 rounded-none",
  desktop: "hidden h-8 w-8 md:inline-flex",
} as const satisfies Record<
  Exclude<WorkspaceLayoutV2LeftToggleVisibility, "hidden">,
  string
>;

function shouldShowMobileResizeGripDotsByDefault() {
  if (typeof window === "undefined") {
    return false;
  }

  return isLandingDevModeEnabled(parseTanStackSearch(window.location.search));
}

/**
 * Keeps viewport measurement in a local store so resize observer callbacks can
 * publish DOM geometry without adding React state to the layout shell.
 */
function useWorkspaceLayoutV2ElementSizeStore() {
  return useCreateStore(
    WORKSPACE_LAYOUT_V2_EMPTY_ELEMENT_SIZE,
    ({ setState }) => ({
      setSize: (nextSize: WorkspaceLayoutV2ElementSize) => {
        setState((currentSize) =>
          currentSize.heightPx === nextSize.heightPx &&
          currentSize.widthPx === nextSize.widthPx
            ? currentSize
            : nextSize,
        );
      },
    }),
  );
}

/**
 * The shell math is driven by the rendered viewport box, not viewport media
 * queries, so resizes and mobile browser chrome changes update pane geometry
 * from the actual DOM box we are drawing into.
 */
function useElementSize(measureRef: RefObject<HTMLElement | null>) {
  const store = useWorkspaceLayoutV2ElementSizeStore();
  const size = useSelector(store);
  const setSize = store.actions.setSize;
  const publishElementSize = useEffectEvent((node: HTMLElement) => {
    const bounds = node.getBoundingClientRect();
    setSize({
      heightPx: Math.max(0, Math.round(bounds.height)),
      widthPx: Math.max(0, Math.round(bounds.width)),
    });
  });

  /**
   * Subscribes to the measured element's rendered box so pane geometry follows
   * the actual workspace viewport instead of assuming browser viewport size.
   */
  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) {
      return;
    }

    const updateWidth = () => {
      publishElementSize(node);
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => {
        window.removeEventListener("resize", updateWidth);
      };
    }

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(node);
    window.addEventListener("resize", updateWidth);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [measureRef]);

  return size;
}

function renderPaneContent(content: ReactNode) {
  return (
    // A provided null slot is still a real pane so resize and carousel behavior
    // stay consistent, while an omitted optional pane does not render at all.
    content ?? (
      <div aria-hidden="true" className="min-h-0 flex-1 bg-background" />
    )
  );
}

function getMobilePaneSeparatorClass(pane: MobilePane, activePane: MobilePane) {
  if (pane === activePane) {
    return "";
  }

  // Mobile pane ownership can change mid-gesture, but pane geometry must stay
  // exact. A 1px content-box delta can rewrap landing copy and editor text.
  return "workspace-mobile-pane-separators";
}

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
function useWorkspaceLayoutV2MobileGripResizeController({
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

/**
 * Keeps carousel settled state in the same local-store style as the grip
 * session, while the browser scroll position itself remains DOM-owned.
 */
function useWorkspaceLayoutV2MobileCarouselStore() {
  return useCreateStore(
    WORKSPACE_LAYOUT_V2_MOBILE_CAROUSEL_INITIAL_STATE,
    ({ setState }) => ({
      setIsMobilePaneSettled: (isMobilePaneSettled: boolean) => {
        setState((state) =>
          state.isMobilePaneSettled === isMobilePaneSettled
            ? state
            : { ...state, isMobilePaneSettled },
        );
      },
    }),
  );
}

/**
 * Owns the browser scroll lifecycle for the mobile pane carousel.
 *
 * Pane geometry can change while the carousel node and scroll subscription stay
 * the same. `useEffectEvent` lets the scroll handler read the latest geometry
 * without resubscribing the browser listener on every width update.
 */
function useWorkspaceLayoutV2MobileCarouselController({
  activeGripResizeSideRef,
  carouselRef,
  hasLeftPane,
  hasRightPane,
  isMobile,
  leftWidthPx,
  mainWidthPx,
  mergedSurfaceSide,
  mobilePane,
  peekWidthPx,
  rightWidthPx,
  setMobilePane,
  viewportWidthPx,
}: {
  activeGripResizeSideRef: RefObject<"left" | "right" | null>;
  carouselRef: RefObject<HTMLDivElement | null>;
  hasLeftPane: boolean;
  hasRightPane: boolean;
  isMobile: boolean;
  leftWidthPx: number;
  mainWidthPx: number;
  mergedSurfaceSide: WorkspaceLayoutV2MobileMergedSide | null;
  mobilePane: MobilePane;
  peekWidthPx: number;
  rightWidthPx: number;
  setMobilePane: Dispatch<SetStateAction<MobilePane>>;
  viewportWidthPx: number;
}) {
  const hasAlignedInitialMobilePaneRef = useRef(false);
  const scrollDerivedMobilePaneRef = useRef<MobilePane | null>(null);
  const store = useWorkspaceLayoutV2MobileCarouselStore();
  const isMobilePaneSettled = useSelector(
    store,
    (state) => state.isMobilePaneSettled,
  );
  const setIsMobilePaneSettled = store.actions.setIsMobilePaneSettled;
  const setIsMobilePaneSettledEffect = useEffectEvent((isSettled: boolean) => {
    setIsMobilePaneSettled(isSettled);
  });
  const canSyncScroll = isMobile && viewportWidthPx > 0 && mainWidthPx > 0;
  const syncPaneFromScroll = useEffectEvent((carouselNode: HTMLDivElement) => {
    if (activeGripResizeSideRef.current !== null) {
      return;
    }

    const nextPane = getMobilePaneFromScrollLeft({
      hasLeftPane,
      hasRightPane,
      leftWidthPx,
      mainWidthPx,
      mergedSurfaceSide,
      peekWidthPx,
      rightWidthPx,
      scrollLeftPx: carouselNode.scrollLeft,
      viewportWidthPx,
    });
    const isScrollSettled = isMobilePaneScrollSettled({
      hasRightPane,
      hasLeftPane,
      leftWidthPx,
      mainWidthPx,
      mergedSurfaceSide,
      pane: nextPane,
      peekWidthPx,
      rightWidthPx,
      scrollLeftPx: carouselNode.scrollLeft,
      viewportWidthPx,
    });
    setIsMobilePaneSettled(isScrollSettled);
    if (mergedSurfaceSide !== null && !isScrollSettled) {
      return;
    }
    setMobilePane((currentPane) => {
      if (currentPane === nextPane) {
        return currentPane;
      }

      scrollDerivedMobilePaneRef.current =
        mergedSurfaceSide !== null && currentPane === mergedSurfaceSide
          ? null
          : nextPane;
      return nextPane;
    });
  });

  /**
   * Resets mobile carousel bookkeeping when leaving mobile mode so the next
   * mobile mount performs a fresh first-paint alignment.
   */
  useEffect(() => {
    if (isMobile) {
      return;
    }

    hasAlignedInitialMobilePaneRef.current = false;
    scrollDerivedMobilePaneRef.current = null;
    setIsMobilePaneSettledEffect(true);
  }, [isMobile]);

  /**
   * Aligns the native carousel scroll position to the selected mobile pane
   * before paint, while ignoring scroll positions produced by active grip drags.
   */
  useLayoutEffect(() => {
    const carouselNode = carouselRef.current;
    if (!isMobile || carouselNode === null || mainWidthPx <= 0) {
      return;
    }
    if (!hasLeftPane && scrollDerivedMobilePaneRef.current === "left") {
      scrollDerivedMobilePaneRef.current = null;
    }
    if (!hasRightPane && scrollDerivedMobilePaneRef.current === "right") {
      scrollDerivedMobilePaneRef.current = null;
    }
    if (activeGripResizeSideRef.current !== null) {
      return;
    }

    const nextScrollLeftPx = getMobilePaneScrollLeftPx(mobilePane, {
      hasLeftPane,
      hasRightPane,
      leftWidthPx,
      mainWidthPx,
      mergedSurfaceSide,
      peekWidthPx,
      rightWidthPx,
      viewportWidthPx,
    });

    if (!hasAlignedInitialMobilePaneRef.current) {
      // Align the first mobile paint to the current sidebar state so refreshes
      // keep the intended pane instead of booting at scrollLeft=0 and
      // immediately persisting "left".
      carouselNode.scrollLeft = nextScrollLeftPx;
      setIsMobilePaneSettledEffect(true);
      hasAlignedInitialMobilePaneRef.current = true;
      return;
    }

    if (scrollDerivedMobilePaneRef.current === mobilePane) {
      scrollDerivedMobilePaneRef.current = null;
      return;
    }

    // Keep programmatic pane changes, such as file selection recentering, in
    // lockstep with the native carousel position after the initial boot.
    carouselNode.scrollLeft = nextScrollLeftPx;
    setIsMobilePaneSettledEffect(true);
  }, [
    activeGripResizeSideRef,
    carouselRef,
    hasRightPane,
    hasLeftPane,
    isMobile,
    leftWidthPx,
    mobilePane,
    mainWidthPx,
    mergedSurfaceSide,
    peekWidthPx,
    rightWidthPx,
    viewportWidthPx,
  ]);

  /**
   * Owns the browser scroll listener while the carousel is active and converts
   * native scroll movement into selected-pane and settled-state updates.
   */
  useEffect(() => {
    if (!canSyncScroll) {
      return;
    }

    const carouselNode = carouselRef.current;
    if (carouselNode === null) {
      return;
    }

    let settleTimeoutId: number | null = null;
    const syncCurrentPaneFromScroll = () => {
      syncPaneFromScroll(carouselNode);
    };
    const handleScroll = () => {
      syncCurrentPaneFromScroll();
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
      settleTimeoutId = window.setTimeout(syncCurrentPaneFromScroll, 80);
    };

    carouselNode.addEventListener("scroll", handleScroll, {
      passive: true,
    });
    syncCurrentPaneFromScroll();

    return () => {
      carouselNode.removeEventListener("scroll", handleScroll);
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
    };
  }, [canSyncScroll, carouselRef]);

  /**
   * Re-evaluates the current scroll position after pane geometry changes that
   * do not require rebuilding the underlying browser scroll listener.
   */
  useEffect(() => {
    const carouselNode = carouselRef.current;
    if (!canSyncScroll || carouselNode === null) {
      return;
    }

    syncPaneFromScroll(carouselNode);
  }, [
    canSyncScroll,
    carouselRef,
    hasRightPane,
    hasLeftPane,
    leftWidthPx,
    mainWidthPx,
    mergedSurfaceSide,
    peekWidthPx,
    rightWidthPx,
    viewportWidthPx,
  ]);

  return {
    isMobilePaneSettled,
  };
}

type WorkspaceLayoutV2DesktopViewportProps =
  WorkspaceLayoutV2ResolvedPaneContent & {
    activeResizeSide: WorkspaceLayoutV2ActiveResizeSide;
    desktopLeftWidthPx: number;
    desktopRightWidthPx: number;
    showLeftPane: boolean;
  };

function WorkspaceLayoutV2DesktopViewport({
  activeResizeSide,
  desktopLeftWidthPx,
  desktopRightWidthPx,
  leftContent,
  mainContent,
  rightContent,
  showLeftPane,
}: WorkspaceLayoutV2DesktopViewportProps) {
  return (
    <div className="absolute inset-0 flex min-h-0 overflow-hidden bg-background">
      {showLeftPane ? (
        <div
          className="h-full min-h-0 shrink-0"
          style={{ width: `${desktopLeftWidthPx}px` }}
        >
          <div
            data-testid="workspace-layout-v2-pane-left"
            className={cn(
              "flex h-full min-h-0 flex-col overflow-hidden",
              desktopLeftWidthPx > 0
                ? activeResizeSide === "left"
                  ? "border-r border-primary"
                  : "border-r border-border"
                : "border-r-0",
            )}
            style={{ width: `${desktopLeftWidthPx}px` }}
          >
            {leftContent}
          </div>
        </div>
      ) : null}

      <div
        data-testid="workspace-layout-v2-pane-main"
        className="h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
      >
        {mainContent}
      </div>

      <div
        className="h-full min-h-0 shrink-0"
        style={{ width: `${desktopRightWidthPx}px` }}
      >
        <div
          data-testid="workspace-layout-v2-pane-right"
          className={cn(
            "flex h-full min-h-0 flex-col overflow-hidden",
            desktopRightWidthPx > 0
              ? activeResizeSide === "right"
                ? "border-l border-primary"
                : "border-l border-border"
              : "border-l-0",
          )}
          style={{ width: `${desktopRightWidthPx}px` }}
        >
          {rightContent}
        </div>
      </div>
    </div>
  );
}

type WorkspaceLayoutV2MobileViewportProps =
  WorkspaceLayoutV2ResolvedPaneContent & {
    carouselRef: RefObject<HTMLDivElement | null>;
    leftWidthPx: number;
    lockCarouselScroll: boolean;
    mergedSurfaceSide: WorkspaceLayoutV2MobileMergedSide | null;
    mobilePane: MobilePane;
    paneWidthPx: number;
    peekWidthPx: number;
    rightWidthPx: number;
    showLeftPane: boolean;
    showRightPane: boolean;
  };

function WorkspaceLayoutV2MobileViewport({
  carouselRef,
  leftContent,
  leftWidthPx,
  lockCarouselScroll,
  mainContent,
  mergedSurfaceSide,
  mobilePane,
  paneWidthPx,
  peekWidthPx,
  rightContent,
  rightWidthPx,
  showLeftPane,
  showRightPane,
}: WorkspaceLayoutV2MobileViewportProps) {
  function renderLeftPane(shouldSnap: boolean) {
    if (!showLeftPane) {
      return null;
    }

    return (
      <div
        data-testid="workspace-layout-v2-pane-left"
        className={cn(
          "relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-background",
          shouldSnap && "snap-start snap-always",
          getMobilePaneSeparatorClass("left", mobilePane),
        )}
        style={{
          width: `${leftWidthPx}px`,
        }}
      >
        {leftContent}
      </div>
    );
  }

  function renderMainPane(shouldSnap: boolean) {
    return (
      <div
        data-workspace-layout-v2-mobile-main-pane
        className={cn(
          "h-full min-h-0 shrink-0",
          shouldSnap ? "snap-center snap-always" : "snap-none",
        )}
        style={{ width: `${paneWidthPx}px` }}
      >
        <div
          className={cn(
            "box-border h-full min-h-0 overflow-hidden bg-background",
            getMobilePaneSeparatorClass("main", mobilePane),
          )}
        >
          {mainContent}
        </div>
      </div>
    );
  }

  function renderRightPane(shouldSnap: boolean) {
    if (!showRightPane) {
      return null;
    }

    return (
      <div
        data-testid="workspace-layout-v2-pane-right"
        className={cn(
          "relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-background",
          shouldSnap && "snap-end snap-always",
          getMobilePaneSeparatorClass("right", mobilePane),
        )}
        style={{
          width: `${rightWidthPx}px`,
        }}
      >
        {rightContent}
      </div>
    );
  }

  const mainPane = renderMainPane(mergedSurfaceSide === null);

  return (
    <div
      ref={carouselRef}
      data-testid="workspace-layout-v2-pane-main"
      className={cn(
        "absolute inset-0 flex min-h-0 snap-x snap-mandatory overflow-y-hidden overscroll-x-contain bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        lockCarouselScroll ? "overflow-x-hidden" : "overflow-x-auto",
      )}
      style={{
        paddingLeft: `${peekWidthPx}px`,
        paddingRight: `${peekWidthPx}px`,
      }}
    >
      {mergedSurfaceSide === "left" && showLeftPane ? (
        <div
          data-workspace-layout-v2-mobile-merged-pane="left"
          className={cn(
            "flex h-full min-h-0 shrink-0 snap-start snap-always overflow-hidden bg-background",
          )}
          style={{
            width: `${leftWidthPx + paneWidthPx}px`,
          }}
        >
          {renderLeftPane(false)}
          {mainPane}
        </div>
      ) : (
        renderLeftPane(true)
      )}

      {mergedSurfaceSide === null ? mainPane : null}

      {mergedSurfaceSide === "right" && showRightPane ? (
        <div
          data-workspace-layout-v2-mobile-merged-pane="right"
          className={cn(
            "flex h-full min-h-0 shrink-0 snap-end snap-always overflow-hidden bg-background",
          )}
          style={{
            width: `${paneWidthPx + rightWidthPx}px`,
          }}
        >
          {mainPane}
          {renderRightPane(false)}
        </div>
      ) : (
        renderRightPane(true)
      )}
    </div>
  );
}

function WorkspaceLayoutV2MainPaneHeader({
  children,
  leftToggleVisibility = "desktop",
  rightToggleVisibility = "desktop",
}: {
  children: ReactNode;
  leftToggleVisibility?: WorkspaceLayoutV2LeftToggleVisibility;
  rightToggleVisibility?: WorkspaceLayoutV2RightToggleVisibility;
}) {
  const { toggleLeftSidebar, toggleRightSidebar } = useSidebar();
  const leftToggleButtonClassName =
    leftToggleVisibility === "hidden"
      ? null
      : LEFT_TOGGLE_BUTTON_CLASS_NAMES[leftToggleVisibility];

  return (
    <div className="flex h-full items-center gap-2">
      {leftToggleButtonClassName !== null ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={
            leftToggleVisibility === "desktop"
              ? "Toggle Left Sidebar"
              : "Toggle sidebar"
          }
          className={leftToggleButtonClassName}
          onClick={toggleLeftSidebar}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      ) : null}

      {/* Keep route-level header actions visible on mobile; only the sidebar
          toggles stay desktop-only in the v2 main pane shell. */}
      <div className="min-w-0 flex-1">{children}</div>

      {rightToggleVisibility === "desktop" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Toggle Right Sidebar"
          className="hidden h-8 w-8 md:inline-flex"
          onClick={toggleRightSidebar}
        >
          <PanelRight className="h-4 w-4 rotate-180" />
        </Button>
      ) : null}
    </div>
  );
}

export function WorkspaceLayoutV2FullPage({
  dataTestId,
  left,
  main,
  mobileMinResizeBehavior = "min_resize_to_merge",
  mobilePanePeekWidthPx = DEFAULT_MOBILE_PANE_PEEK_WIDTH_PX,
  panel,
  right,
  leftToggleVisibility = "desktop",
  rightToggleVisibility = "desktop",
  showMobileResizeGripDots,
}: {
  dataTestId?: string;
  left?: WorkspaceLayoutV2PaneFrameProps;
  main: WorkspaceLayoutV2PaneFrameProps;
  mobileMinResizeBehavior?: WorkspaceLayoutV2MobileMinResizeBehavior;
  mobilePanePeekWidthPx?: number;
  panel?: WorkspaceLayoutV2BottomPanelProps;
  right?: WorkspaceLayoutV2PaneFrameProps;
  leftToggleVisibility?: WorkspaceLayoutV2LeftToggleVisibility;
  rightToggleVisibility?: WorkspaceLayoutV2RightToggleVisibility;
  showMobileResizeGripDots?: boolean;
}) {
  const hasLeftPane = left !== undefined;
  const hasRightPane = right !== undefined;
  const isMobile = useIsMobile();
  // A mobile left toggle is always also a desktop toggle. Routes opt into
  // `all` only when their main pane can swallow the drag-to-reopen gesture.
  const hasMainHeaderContent =
    main.header !== undefined && main.header !== null;
  const hasDesktopHeaderToggle =
    (hasLeftPane && leftToggleVisibility !== "hidden") ||
    (hasRightPane && rightToggleVisibility !== "hidden");
  const hasMobileHeaderToggle = hasLeftPane && leftToggleVisibility === "all";
  const shouldHideMainHeader = isMobile
    ? !hasMainHeaderContent && !hasMobileHeaderToggle
    : !hasMainHeaderContent && !hasDesktopHeaderToggle;

  return (
    <WorkspaceLayoutV2ViewportFrame dataTestId={dataTestId}>
      <WorkspaceLayoutV2JustPanes
        left={
          hasLeftPane ? <WorkspaceLayoutV2PaneFrame {...left} /> : undefined
        }
        main={
          <WorkspaceLayoutV2PaneFrame
            {...main}
            header={
              shouldHideMainHeader ? undefined : (
                <WorkspaceLayoutV2MainPaneHeader
                  leftToggleVisibility={
                    hasLeftPane ? leftToggleVisibility : "hidden"
                  }
                  rightToggleVisibility={
                    hasRightPane ? rightToggleVisibility : "hidden"
                  }
                >
                  {main.header}
                </WorkspaceLayoutV2MainPaneHeader>
              )
            }
          />
        }
        mobileMinResizeBehavior={mobileMinResizeBehavior}
        mobilePanePeekWidthPx={mobilePanePeekWidthPx}
        panel={panel}
        right={hasRightPane ? <WorkspaceLayoutV2PaneFrame {...right} /> : null}
        showMobileResizeGripDots={showMobileResizeGripDots}
      />
    </WorkspaceLayoutV2ViewportFrame>
  );
}

/**
 * V2 owns one contained workspace viewport inside the normal page shell rather
 * than asking the app-level frame to lock the whole document.
 */
export function WorkspaceLayoutV2ViewportFrame({
  children,
  dataTestId,
}: {
  children: ReactNode;
  dataTestId?: string;
}) {
  return (
    <div
      data-testid={dataTestId}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      {children}
    </div>
  );
}

/**
 * Owns the resize highlight state for the rendered shell. The resize mechanics
 * remain event-driven, while the active edge highlight is plain local UI state.
 */
function useWorkspaceLayoutV2ShellStore() {
  return useCreateStore(
    WORKSPACE_LAYOUT_V2_SHELL_INITIAL_STATE,
    ({ setState }) => ({
      setActiveResizeSide: (
        activeResizeSide: WorkspaceLayoutV2ActiveResizeSide,
      ) => {
        setState((state) =>
          state.activeResizeSide === activeResizeSide
            ? state
            : { ...state, activeResizeSide },
        );
      },
    }),
  );
}

export function WorkspaceLayoutV2JustPanes({
  dataTestId,
  left,
  main,
  mobileMinResizeBehavior = "min_resize_to_merge",
  mobilePanePeekWidthPx:
    configuredMobilePanePeekWidthPx = DEFAULT_MOBILE_PANE_PEEK_WIDTH_PX,
  panel,
  right,
  showMobileResizeGripDots,
}: WorkspaceLayoutV2JustPanesProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mobileCarouselRef = useRef<HTMLDivElement | null>(null);
  const viewportSize = useElementSize(viewportRef);
  const shellStore = useWorkspaceLayoutV2ShellStore();
  const activeResizeSide = useSelector(
    shellStore,
    (state) => state.activeResizeSide,
  );
  const setActiveResizeSide = shellStore.actions.setActiveResizeSide;
  const {
    isMobile,
    leftDesktopOpen,
    leftDesktopWidthPx,
    leftMobileWidthPx,
    mobilePane: rawMobilePane,
    rightDesktopOpen,
    rightDesktopWidthPx,
    rightMobileWidthPx,
    setLeftDesktopWidthPx,
    setLeftMobileWidthPx,
    setMobilePane,
    setRightDesktopWidthPx,
    setRightMobileWidthPx,
  } = useSidebar();
  const hasLeftPane = left !== undefined;
  const hasRightPane = right !== null && right !== undefined;
  const shouldShowMobileResizeGripDots =
    showMobileResizeGripDots ?? shouldShowMobileResizeGripDotsByDefault();
  const mobilePanePeekWidthPx = getMobilePanePeekWidthPx(
    configuredMobilePanePeekWidthPx,
  );
  const mobilePane =
    (!hasLeftPane && rawMobilePane === "left") ||
    (!hasRightPane && rawMobilePane === "right")
      ? "main"
      : rawMobilePane;

  const desktopLeftWidthPx = hasLeftPane
    ? getDesktopSidebarWidthPx({
        isOpen: leftDesktopOpen,
        storedWidthPx: leftDesktopWidthPx,
        viewportWidthPx: viewportSize.widthPx,
      })
    : 0;
  const desktopRightWidthPx = hasRightPane
    ? getDesktopSidebarWidthPx({
        isOpen: rightDesktopOpen,
        storedWidthPx: rightDesktopWidthPx,
        viewportWidthPx: viewportSize.widthPx,
      })
    : 0;
  const desktopSidebarMaxWidthPx = getDesktopSidebarMaxWidthPx(
    viewportSize.widthPx,
  );
  const mobileSidebarMaxWidthPx = getMobileSidebarMaxWidthPx({
    peekWidthPx: mobilePanePeekWidthPx,
    viewportWidthPx: viewportSize.widthPx,
  });
  const mobileSidebarMinWidthPx = getMobileSidebarMinWidthPx({
    configuredMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
    maxWidthPx: mobileSidebarMaxWidthPx,
  });
  const mobileLeftWidthPx = hasLeftPane
    ? getMobileSidebarWidthPx({
        maxWidthPx: mobileSidebarMaxWidthPx,
        minWidthPx: mobileSidebarMinWidthPx,
        storedWidthPx: leftMobileWidthPx,
      })
    : 0;
  const mobileRightWidthPx = hasRightPane
    ? getMobileSidebarWidthPx({
        maxWidthPx: mobileSidebarMaxWidthPx,
        minWidthPx: mobileSidebarMinWidthPx,
        storedWidthPx: rightMobileWidthPx,
      })
    : 0;
  const resolvedLeftContent = renderPaneContent(left);
  const resolvedMainContent = renderPaneContent(main);
  const resolvedRightContent = renderPaneContent(right);
  const activeMobileGripResizeSideRef = useRef<"left" | "right" | null>(null);
  const mobileGripResize = useWorkspaceLayoutV2MobileGripResizeController({
    activeGripResizeSideRef: activeMobileGripResizeSideRef,
    carouselRef: mobileCarouselRef,
    hasLeftPane,
    hasRightPane,
    isMobile,
    leftWidthPx: mobileLeftWidthPx,
    mobileMinResizeBehavior,
    mobilePane,
    peekWidthPx: mobilePanePeekWidthPx,
    rightWidthPx: mobileRightWidthPx,
    viewportWidthPx: viewportSize.widthPx,
  });
  const mobileMergedSide = mobileGripResize.mobileMergedSide;
  const isMobileMergedWidthActive =
    mobileGripResize.mobileMergedMainWidthPx !== null && mobilePane !== "main";
  const activeMobileMergedSurfaceSide =
    isMobileMergedWidthActive && mobileGripResize.isMobileMergedFit
      ? mobileMergedSide
      : null;
  const mobileMainWidthPx = isMobileMergedWidthActive
    ? (mobileGripResize.mobileMergedMainWidthPx ??
      mobileGripResize.mobileDefaultMainWidthPx)
    : mobileGripResize.mobileDefaultMainWidthPx;
  const { isMobilePaneSettled } = useWorkspaceLayoutV2MobileCarouselController({
    activeGripResizeSideRef: activeMobileGripResizeSideRef,
    carouselRef: mobileCarouselRef,
    hasLeftPane,
    hasRightPane,
    isMobile,
    leftWidthPx: mobileLeftWidthPx,
    mainWidthPx: mobileMainWidthPx,
    mergedSurfaceSide: activeMobileMergedSurfaceSide,
    mobilePane,
    peekWidthPx: mobilePanePeekWidthPx,
    rightWidthPx: mobileRightWidthPx,
    setMobilePane,
    viewportWidthPx: viewportSize.widthPx,
  });
  const desktopResizeHandles: WorkspaceLayoutV2ResizeHandleConfig[] =
    viewportSize.widthPx <= 0
      ? []
      : [
          hasLeftPane && leftDesktopOpen
            ? {
                currentWidthPx: desktopLeftWidthPx,
                dataTestId: "workspace-layout-v2-left-resize",
                maxWidthPx: desktopSidebarMaxWidthPx,
                minWidthPx: WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
                onWidthChange: (nextWidthPx: number) => {
                  setLeftDesktopWidthPx(
                    clampNumber(
                      Math.round(nextWidthPx),
                      WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
                      desktopSidebarMaxWidthPx,
                    ),
                  );
                },
                positionPx: desktopLeftWidthPx,
                side: "left",
              }
            : null,
          hasRightPane && rightDesktopOpen
            ? {
                currentWidthPx: desktopRightWidthPx,
                dataTestId: "workspace-layout-v2-right-resize",
                maxWidthPx: desktopSidebarMaxWidthPx,
                minWidthPx: WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
                onWidthChange: (nextWidthPx: number) => {
                  setRightDesktopWidthPx(
                    clampNumber(
                      Math.round(nextWidthPx),
                      WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
                      desktopSidebarMaxWidthPx,
                    ),
                  );
                },
                positionPx: viewportSize.widthPx - desktopRightWidthPx,
                side: "right",
              }
            : null,
        ].filter(
          (resizeHandle): resizeHandle is WorkspaceLayoutV2ResizeHandleConfig =>
            resizeHandle !== null,
        );
  // A hidden mobile grip must not leave an invisible touch target over pane
  // content, so prod omits the grip handles entirely.
  const mobileResizeHandles: WorkspaceLayoutV2ResizeHandleConfig[] =
    viewportSize.widthPx <= 0 ||
    !isMobilePaneSettled ||
    !shouldShowMobileResizeGripDots
      ? []
      : [
          hasLeftPane && mobilePane === "left"
            ? {
                currentWidthPx: mobileLeftWidthPx,
                dataTestId: "workspace-layout-v2-left-resize",
                maxWidthPx: mobileSidebarMaxWidthPx,
                minWidthPx: mobileSidebarMinWidthPx,
                onWidthChange: (nextWidthPx: number) => {
                  setLeftMobileWidthPx(
                    clampNumber(
                      Math.round(nextWidthPx),
                      mobileSidebarMinWidthPx,
                      mobileSidebarMaxWidthPx,
                    ),
                  );
                },
                positionPx: mobileLeftWidthPx,
                side: "left",
              }
            : null,
          hasRightPane && mobilePane === "right"
            ? {
                currentWidthPx: mobileRightWidthPx,
                dataTestId: "workspace-layout-v2-right-resize",
                maxWidthPx: mobileSidebarMaxWidthPx,
                minWidthPx: mobileSidebarMinWidthPx,
                onWidthChange: (nextWidthPx: number) => {
                  setRightMobileWidthPx(
                    clampNumber(
                      Math.round(nextWidthPx),
                      mobileSidebarMinWidthPx,
                      mobileSidebarMaxWidthPx,
                    ),
                  );
                },
                positionPx: viewportSize.widthPx - mobileRightWidthPx,
                side: "right",
              }
            : null,
        ].filter(
          (resizeHandle): resizeHandle is WorkspaceLayoutV2ResizeHandleConfig =>
            resizeHandle !== null,
        );

  function renderResizeHandle(
    resizeHandle: WorkspaceLayoutV2ResizeHandleConfig,
    pointerTarget: "edge" | "grip",
  ) {
    const gripSlidePositionPx =
      pointerTarget === "grip"
        ? mobileGripResize.getGripPositionPx(resizeHandle)
        : resizeHandle.positionPx;

    return (
      <WorkspaceLayoutV2ResizeHandle
        key={resizeHandle.side}
        currentSizePx={resizeHandle.currentWidthPx}
        dataTestId={resizeHandle.dataTestId}
        minSizePx={resizeHandle.minWidthPx}
        maxSizePx={resizeHandle.maxWidthPx}
        pointerTarget={pointerTarget}
        positionPx={gripSlidePositionPx}
        resizeFrom={resizeHandle.side}
        onResizeStart={() => {
          if (pointerTarget === "grip") {
            mobileGripResize.startResize(resizeHandle);
          }
          setActiveResizeSide(resizeHandle.side);
        }}
        onResizeEnd={() => {
          if (pointerTarget === "grip") {
            const { shouldSyncPaneFromScroll } =
              mobileGripResize.endResize(resizeHandle);
            if (shouldSyncPaneFromScroll) {
              mobileCarouselRef.current?.dispatchEvent(
                new Event("scroll", { bubbles: true }),
              );
            }
          } else {
            mobileCarouselRef.current?.dispatchEvent(
              new Event("scroll", { bubbles: true }),
            );
          }
          setActiveResizeSide(null);
        }}
        onRawSizeChange={
          pointerTarget === "grip"
            ? (rawWidthPx: number) =>
                mobileGripResize.changeRawSize(resizeHandle, rawWidthPx)
            : undefined
        }
        onSizeChange={resizeHandle.onWidthChange}
      />
    );
  }

  const mainViewportContent = (
    <WorkspaceLayoutV2MainViewportWithPanel
      activeResizeSide={activeResizeSide}
      isMobile={isMobile}
      mainContent={resolvedMainContent}
      onPanelResizeEnd={() => {
        setActiveResizeSide(null);
      }}
      onPanelResizeStart={() => {
        setActiveResizeSide("top");
      }}
      panel={panel}
      viewportHeightPx={viewportSize.heightPx}
    />
  );

  return (
    <div
      ref={viewportRef}
      data-testid={dataTestId}
      data-mobile-pane={isMobile ? mobilePane : undefined}
      data-workspace-layout-v2={isMobile ? "mobile" : "desktop"}
      className="relative flex min-h-0 flex-1 overflow-hidden bg-background"
    >
      {isMobile ? (
        <>
          <WorkspaceLayoutV2MobileViewport
            carouselRef={mobileCarouselRef}
            leftContent={resolvedLeftContent}
            leftWidthPx={mobileLeftWidthPx}
            lockCarouselScroll={
              activeMobileMergedSurfaceSide !== null &&
              mobileGripResize.lockCarouselScroll
            }
            mainContent={mainViewportContent}
            mergedSurfaceSide={activeMobileMergedSurfaceSide}
            mobilePane={mobilePane}
            paneWidthPx={mobileMainWidthPx}
            peekWidthPx={mobilePanePeekWidthPx}
            rightContent={resolvedRightContent}
            rightWidthPx={mobileRightWidthPx}
            showLeftPane={hasLeftPane}
            showRightPane={hasRightPane}
          />
          {mobileResizeHandles.map((resizeHandle) =>
            renderResizeHandle(resizeHandle, "grip"),
          )}
        </>
      ) : (
        <>
          <WorkspaceLayoutV2DesktopViewport
            activeResizeSide={activeResizeSide}
            desktopLeftWidthPx={desktopLeftWidthPx}
            desktopRightWidthPx={desktopRightWidthPx}
            leftContent={resolvedLeftContent}
            mainContent={mainViewportContent}
            rightContent={resolvedRightContent}
            showLeftPane={hasLeftPane}
          />
          {desktopResizeHandles.map((resizeHandle) =>
            renderResizeHandle(resizeHandle, "edge"),
          )}
        </>
      )}
    </div>
  );
}
