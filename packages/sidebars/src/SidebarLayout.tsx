import {
  useId,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import "./structure.css";
import { useElementSize } from "./useElementSize.ts";
import { useAnyFineHoverPointer } from "./pointerCapabilities.ts";
import {
  useSidebarLayoutActions,
  useSidebarLayoutSelector,
  useSidebarRuntimeActions,
  useSidebarRuntimeState,
  type SidebarRuntimeState,
} from "./SidebarRuntimeInternal.tsx";
import {
  SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX,
  SIDEBAR_LAYOUT_DESKTOP_MAIN_MIN_WIDTH_PX,
  SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_LAYOUT_MOBILE_MAIN_PEEK_WIDTH_PX,
  SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_RATIO,
  SIDEBAR_LAYOUT_UNMERGED_MOBILE_SURFACE,
  getDesktopPaneWidths,
  getMergedMobileMainWidthPx,
  getMobileSidebarMaxWidthPx,
  getMobileSidebarMinWidthPx,
  getMobileSidebarWidthPx,
  type SidebarLayoutMobileMinResizeBehavior,
} from "./SidebarLayoutGeometryInternal.ts";
import { SidebarLayoutDisplayedMobileStateContext } from "./SidebarLayoutPresentation.ts";
import type { MobilePane, MobileSurface, SidebarSide } from "./SidebarLayoutState.ts";
import { SidebarLayoutResizeHandle } from "./SidebarLayoutResizeHandle.tsx";
import { SidebarLayoutViewport } from "./SidebarLayoutViewports.tsx";
import {
  getSidebarLayoutDesktopResizeHandles,
  getSidebarLayoutMobileResizeHandles,
  type SidebarLayoutResizeHandleConfig,
} from "./SidebarLayoutResizeHandleConfigs.ts";
import { useSidebarLayoutMobileCarouselController } from "./useSidebarLayoutMobileCarousel.ts";
import { useSidebarLayoutMobileGripResizeController } from "./useSidebarLayoutMobileResize.ts";

export type SidebarLayoutResizeHandleLabels = Record<SidebarSide, string>;

export type SidebarLayoutResizeHandleValueTextFormatter = (args: {
  side: SidebarSide;
  widthPx: number;
}) => string;

export type SidebarLayoutProps = {
  addressChrome: ReactNode;
  formatResizeHandleValueText?: SidebarLayoutResizeHandleValueTextFormatter;
  left?: ReactElement;
  main: ReactElement;
  mobileMinResizeBehavior?: SidebarLayoutMobileMinResizeBehavior;
  resizeHandleLabels: SidebarLayoutResizeHandleLabels;
  right?: ReactElement;
};

type SidebarLayoutRootStyle = CSSProperties & {
  "--sidebar-layout-left-mobile-width": string;
  "--sidebar-layout-main-mobile-width": string;
  "--sidebar-layout-right-mobile-width": string;
};

/**
A saved mobile sidebar width as CSS, clamped to the carousel width (`100%` in a pane's `width`) with
the rules of `getMobileSidebarWidthPx`: at least the smaller of the configured minimum and a third
of the carousel, at most the carousel without the main pane's peek.
*/
function getUnmeasuredMobileSidebarWidth(storedWidthPx: number) {
  const minWidth = `min(${SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_PX}px, round(down, 100% / ${1 / SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_RATIO}, 1px))`;

  return `clamp(${minWidth}, ${Math.round(storedWidthPx)}px, calc(100% - ${SIDEBAR_LAYOUT_MOBILE_MAIN_PEEK_WIDTH_PX}px))`;
}

/**
The mobile geometry of the server HTML and the hydration render, before React measures the viewport.
It comes from the saved state alone, so the first paint shows the saved mobile pane without a
script, and the measured render that follows has the same layout.

The carousel starts at scroll position 0 and CSS cannot scroll it. A saved left pane needs no
scroll. For the main pane, the left pane has no width until React measures and scrolls past it. For
the right pane, structure.css aligns the carousel content to its end until React measures. A saved
merged surface shows its side pane beside a main pane that fills the rest of the carousel.
*/
function getUnmeasuredMobileGeometry({
  hasLeftPane,
  hasRightPane,
  leftMobileWidthPx,
  mobileMinResizeBehavior,
  mobilePane,
  mobileSurface,
  rightMobileWidthPx,
}: {
  hasLeftPane: boolean;
  hasRightPane: boolean;
  leftMobileWidthPx: number;
  mobileMinResizeBehavior: SidebarLayoutMobileMinResizeBehavior;
  mobilePane: MobilePane;
  mobileSurface: MobileSurface;
  rightMobileWidthPx: number;
}) {
  const leftWidth = getUnmeasuredMobileSidebarWidth(leftMobileWidthPx);
  const rightWidth = getUnmeasuredMobileSidebarWidth(rightMobileWidthPx);
  const mergedSide =
    mobileMinResizeBehavior === "min_resize_to_merge" &&
    mobileSurface.kind === "merged" &&
    mobilePane !== "main" &&
    (mobileSurface.side === "left" ? hasLeftPane : hasRightPane)
      ? mobileSurface.side
      : null;
  const rootStyle: SidebarLayoutRootStyle = {
    "--sidebar-layout-left-mobile-width": hasLeftPane && mobilePane === "left" ? leftWidth : "0px",
    "--sidebar-layout-main-mobile-width":
      mergedSide === null
        ? "100%"
        : `calc(100% - ${mergedSide === "left" ? leftWidth : rightWidth})`,
    "--sidebar-layout-right-mobile-width": hasRightPane ? rightWidth : "0px",
  };

  return { mergedSide, rootStyle };
}

function getAvailableMobilePane({
  hasLeftPane,
  hasRightPane,
  mobilePane,
}: {
  hasLeftPane: boolean;
  hasRightPane: boolean;
  mobilePane: SidebarRuntimeState["mobilePane"];
}) {
  if (mobilePane === "left" && !hasLeftPane) {
    return "main";
  }

  if (mobilePane === "right" && !hasRightPane) {
    return "main";
  }

  return mobilePane;
}

export function SidebarLayout({
  addressChrome,
  formatResizeHandleValueText,
  left,
  main,
  mobileMinResizeBehavior = "min_resize_to_merge",
  resizeHandleLabels,
  right,
}: SidebarLayoutProps) {
  const paneIdPrefix = useId();
  const leftPaneId = `${paneIdPrefix}-pane-left`;
  const rightPaneId = `${paneIdPrefix}-pane-right`;
  const hasAnyFineHoverPointer = useAnyFineHoverPointer();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mobileCarouselRef = useRef<HTMLDivElement | null>(null);
  const activeResizeSide = useSidebarLayoutSelector((state) => state.activeResizeSide);
  const isMobilePaneSettled = useSidebarLayoutSelector((state) => state.mobile.isPaneSettled);
  const viewportSize = useSidebarLayoutSelector((state) => state.viewportSize);
  const { setActiveResizeSide, setViewportSize } = useSidebarLayoutActions();
  useElementSize(viewportRef, setViewportSize);
  const {
    isMobile,
    leftDesktopOpen,
    leftDesktopWidthPx,
    leftMobileWidthPx,
    mobilePane: storedMobilePane,
    mobileSurface,
    rightDesktopOpen,
    rightDesktopWidthPx,
    rightMobileWidthPx,
  } = useSidebarRuntimeState();
  const { setDesktopWidths, setLeftMobileWidthPx, setMobilePane, setRightMobileWidthPx } =
    useSidebarRuntimeActions();
  const hasLeftPane = left !== undefined;
  const hasRightPane = right !== undefined;
  const hasMeasuredViewport = viewportSize.widthPx > 0;
  const previousViewportWidthRef = useRef(0);
  const enableDesktopPaneTransitions =
    hasMeasuredViewport &&
    previousViewportWidthRef.current === viewportSize.widthPx &&
    activeResizeSide === null;
  useLayoutEffect(() => {
    previousViewportWidthRef.current = viewportSize.widthPx;
  }, [viewportSize.widthPx]);
  const mobilePane = getAvailableMobilePane({
    hasLeftPane,
    hasRightPane,
    mobilePane: storedMobilePane,
  });

  const desktopWidths = getDesktopPaneWidths({
    leftOpen: hasLeftPane && leftDesktopOpen,
    leftWidthPx: leftDesktopWidthPx,
    mainMinWidthPx: SIDEBAR_LAYOUT_DESKTOP_MAIN_MIN_WIDTH_PX,
    rightOpen: hasRightPane && rightDesktopOpen,
    rightWidthPx: rightDesktopWidthPx,
    sidebarMinWidthPx: SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
    viewportWidthPx: viewportSize.widthPx,
  });
  const mobileSidebarMaxWidthPx = getMobileSidebarMaxWidthPx(viewportSize.widthPx);
  const mobileSidebarMinWidthPx = getMobileSidebarMinWidthPx({
    configuredMinWidthPx: SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_PX,
    maxWidthPx: mobileSidebarMaxWidthPx,
    viewportWidthPx: viewportSize.widthPx,
  });
  const canDisplayMobileMerge =
    mobileMinResizeBehavior === "min_resize_to_merge" &&
    getMergedMobileMainWidthPx({
      mainMaxWidthPx: Math.max(1, viewportSize.widthPx),
      mainMinWidthPx: SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX,
      sideMinWidthPx: mobileSidebarMinWidthPx,
      viewportWidthPx: viewportSize.widthPx,
    }) !== null;
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
  const activeMobileGripResizeSideRef = useRef<"left" | "right" | null>(null);
  const mobileGripResize = useSidebarLayoutMobileGripResizeController({
    activeGripResizeSideRef: activeMobileGripResizeSideRef,
    carouselRef: mobileCarouselRef,
    hasLeftPane,
    hasRightPane,
    isMobile,
    leftWidthPx: mobileLeftWidthPx,
    mobileMinResizeBehavior,
    rightWidthPx: mobileRightWidthPx,
    viewportWidthPx: viewportSize.widthPx,
  });
  const activeMobileSurface =
    mobileGripResize.mobileSurface.kind === "merged" && mobilePane !== "main"
      ? mobileGripResize.mobileSurface
      : null;
  const activeMobileMergedSurfaceSide =
    activeMobileSurface !== null && mobileGripResize.isMobileMergedFit
      ? activeMobileSurface.side
      : null;
  const displayedMobileSurface =
    isMobile && activeMobileSurface !== null && activeMobileMergedSurfaceSide !== null
      ? activeMobileSurface
      : SIDEBAR_LAYOUT_UNMERGED_MOBILE_SURFACE;
  const mobileMainWidthPx = activeMobileSurface
    ? activeMobileSurface.mainWidthPx
    : mobileGripResize.mobileDefaultMainWidthPx;
  const unmeasuredMobileGeometry = hasMeasuredViewport
    ? null
    : getUnmeasuredMobileGeometry({
        hasLeftPane,
        hasRightPane,
        leftMobileWidthPx,
        mobileMinResizeBehavior,
        mobilePane,
        mobileSurface,
        rightMobileWidthPx,
      });
  const layoutRootStyle: SidebarLayoutRootStyle =
    unmeasuredMobileGeometry === null
      ? {
          "--sidebar-layout-left-mobile-width": `${mobileLeftWidthPx}px`,
          "--sidebar-layout-main-mobile-width": `${mobileMainWidthPx}px`,
          "--sidebar-layout-right-mobile-width": `${mobileRightWidthPx}px`,
        }
      : unmeasuredMobileGeometry.rootStyle;
  useSidebarLayoutMobileCarouselController({
    activeGripResizeSideRef: activeMobileGripResizeSideRef,
    carouselRef: mobileCarouselRef,
    hasLeftPane,
    hasRightPane,
    isMobile,
    leftWidthPx: mobileLeftWidthPx,
    mainWidthPx: mobileMainWidthPx,
    mergedSurfaceSide: activeMobileMergedSurfaceSide,
    mobilePane,
    rightWidthPx: mobileRightWidthPx,
    setMobilePane,
    viewportWidthPx: viewportSize.widthPx,
  });
  const desktopResizeHandles = getSidebarLayoutDesktopResizeHandles({
    desktopLeftWidthPx: desktopWidths.leftWidthPx,
    desktopRightWidthPx: desktopWidths.rightWidthPx,
    desktopMainMinWidthPx: desktopWidths.mainMinWidthPx,
    desktopSidebarMinWidthPx: desktopWidths.sidebarMinWidthPx,
    hasLeftPane,
    hasRightPane,
    leftDesktopOpen,
    rightDesktopOpen,
    setDesktopWidths: ({ leftWidthPx, rightWidthPx }) => {
      setDesktopWidths({
        leftWidthPx: hasLeftPane && leftDesktopOpen ? leftWidthPx : leftDesktopWidthPx,
        rightWidthPx: hasRightPane && rightDesktopOpen ? rightWidthPx : rightDesktopWidthPx,
      });
    },
    viewportWidthPx: viewportSize.widthPx,
  });
  const mobileResizeHandles = getSidebarLayoutMobileResizeHandles({
    hasLeftPane,
    hasRightPane,
    isMobilePaneSettled,
    mobileLeftWidthPx,
    mobilePane,
    mobileRightWidthPx,
    mobileSidebarMaxWidthPx,
    mobileSidebarMinWidthPx,
    setLeftMobileWidthPx,
    setRightMobileWidthPx,
    viewportWidthPx: viewportSize.widthPx,
  });
  const activeResizeSessionRef = useRef<{
    isMobile: boolean;
    side: SidebarSide;
  } | null>(null);

  function startResizeSession(resizeHandle: SidebarLayoutResizeHandleConfig) {
    const activeSession = activeResizeSessionRef.current;
    if (activeSession?.isMobile === isMobile && activeSession.side === resizeHandle.side) {
      return;
    }

    activeResizeSessionRef.current = {
      isMobile,
      side: resizeHandle.side,
    };
    if (isMobile) {
      mobileGripResize.startResize(resizeHandle);
    }
    setActiveResizeSide(resizeHandle.side);
  }

  function finishResizeSession(resizeHandle: SidebarLayoutResizeHandleConfig) {
    const activeSession = activeResizeSessionRef.current;
    if (activeSession?.isMobile !== isMobile || activeSession.side !== resizeHandle.side) {
      return;
    }

    activeResizeSessionRef.current = null;
    if (isMobile) {
      const { shouldSyncPaneFromScroll } = mobileGripResize.endResize(resizeHandle);
      if (shouldSyncPaneFromScroll) {
        mobileCarouselRef.current?.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
    } else {
      mobileCarouselRef.current?.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
    setActiveResizeSide(null);
  }

  function renderResizeHandle(
    resizeHandle: SidebarLayoutResizeHandleConfig,
    pointerTarget: "edge" | "grip",
  ) {
    const handlePositionPx = isMobile
      ? mobileGripResize.getGripPositionPx(resizeHandle)
      : resizeHandle.positionPx;

    return (
      <SidebarLayoutResizeHandle
        key={resizeHandle.side}
        ariaControls={resizeHandle.side === "left" ? leftPaneId : rightPaneId}
        ariaLabel={resizeHandleLabels[resizeHandle.side]}
        ariaValueText={formatResizeHandleValueText?.({
          side: resizeHandle.side,
          widthPx: Math.round(resizeHandle.currentWidthPx),
        })}
        currentSizePx={resizeHandle.currentWidthPx}
        minSizePx={resizeHandle.minWidthPx}
        maxSizePx={resizeHandle.maxWidthPx}
        pointerTarget={pointerTarget}
        positionPx={handlePositionPx}
        resizeFrom={resizeHandle.side}
        onResizeStart={() => {
          startResizeSession(resizeHandle);
        }}
        onResizeEnd={() => {
          finishResizeSession(resizeHandle);
        }}
        onRawSizeChange={
          isMobile
            ? (rawWidthPx: number) => mobileGripResize.changeRawSize(resizeHandle, rawWidthPx)
            : undefined
        }
        onSizeChange={resizeHandle.onWidthChange}
      />
    );
  }

  return (
    <SidebarLayoutDisplayedMobileStateContext.Provider
      value={{
        mobileMergeAvailableSides: {
          left: isMobile && hasLeftPane && canDisplayMobileMerge,
          right: isMobile && hasRightPane && canDisplayMobileMerge,
        },
        mobilePane,
        mobileSurface: displayedMobileSurface,
      }}
    >
      <div data-sidebar-layout-part="root">
        <div data-sidebar-layout-part="address-chrome">{addressChrome}</div>
        <div
          ref={viewportRef}
          data-mobile-pane={mobilePane}
          data-mobile-min-resize-behavior={mobileMinResizeBehavior}
          data-sidebar-layout-part="viewport"
          data-sidebar-layout-mobile-merged-side={
            unmeasuredMobileGeometry !== null
              ? (unmeasuredMobileGeometry.mergedSide ?? undefined)
              : isMobile && activeMobileMergedSurfaceSide !== null
                ? activeMobileMergedSurfaceSide
                : undefined
          }
          style={layoutRootStyle}
          suppressHydrationWarning
        >
          <SidebarLayoutViewport
            activeResizeSide={activeResizeSide}
            carouselRef={mobileCarouselRef}
            desktopLeftWidthPx={desktopWidths.leftWidthPx}
            desktopRightWidthPx={desktopWidths.rightWidthPx}
            enableDesktopPaneTransitions={enableDesktopPaneTransitions}
            hasMeasuredViewport={hasMeasuredViewport}
            inertClosedDesktopPanes={hasMeasuredViewport && !isMobile}
            leftContent={left}
            leftPaneId={leftPaneId}
            leftWidthPx={mobileLeftWidthPx}
            lockCarouselScroll={isMobile && mobileGripResize.lockCarouselScroll}
            mainContent={main}
            paneWidthPx={mobileMainWidthPx}
            rightContent={right}
            rightPaneId={rightPaneId}
            rightWidthPx={mobileRightWidthPx}
            showLeftPane={hasLeftPane}
            showRightPane={hasRightPane}
          />
          {isMobile
            ? mobileResizeHandles.map((resizeHandle) =>
                renderResizeHandle(resizeHandle, hasAnyFineHoverPointer ? "edge" : "grip"),
              )
            : desktopResizeHandles.map((resizeHandle) => renderResizeHandle(resizeHandle, "edge"))}
        </div>
      </div>
    </SidebarLayoutDisplayedMobileStateContext.Provider>
  );
}
