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
  SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_LAYOUT_UNMERGED_MOBILE_SURFACE,
  getDesktopSidebarMaxWidthPx,
  getDesktopSidebarWidthPx,
  getMergedMobileMainWidthPx,
  getMobileSidebarMaxWidthPx,
  getMobileSidebarMinWidthPx,
  getMobileSidebarWidthPx,
  type SidebarLayoutMobileMinResizeBehavior,
} from "./SidebarLayoutGeometryInternal.ts";
import { SidebarLayoutDisplayedMobileStateContext } from "./SidebarLayoutPresentation.ts";
import type { SidebarSide } from "./SidebarLayoutState.ts";
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
    rightDesktopOpen,
    rightDesktopWidthPx,
    rightMobileWidthPx,
  } = useSidebarRuntimeState();
  const {
    setLeftDesktopWidthPx,
    setLeftMobileWidthPx,
    setMobilePane,
    setRightDesktopWidthPx,
    setRightMobileWidthPx,
  } = useSidebarRuntimeActions();
  const hasLeftPane = left !== undefined;
  const hasRightPane = right !== undefined;
  const hasMeasuredViewport = viewportSize.widthPx > 0;
  const hasCompletedViewportMeasurementRef = useRef(false);
  const enableDesktopPaneTransitions =
    hasMeasuredViewport && hasCompletedViewportMeasurementRef.current;
  useLayoutEffect(() => {
    hasCompletedViewportMeasurementRef.current = hasMeasuredViewport;
  }, [hasMeasuredViewport]);
  const mobilePane = getAvailableMobilePane({
    hasLeftPane,
    hasRightPane,
    mobilePane: storedMobilePane,
  });

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
  const desktopSidebarMaxWidthPx = getDesktopSidebarMaxWidthPx(viewportSize.widthPx);
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
  const layoutRootStyle: SidebarLayoutRootStyle | undefined = hasMeasuredViewport
    ? {
        "--sidebar-layout-left-mobile-width": `${mobileLeftWidthPx}px`,
        "--sidebar-layout-main-mobile-width": `${mobileMainWidthPx}px`,
        "--sidebar-layout-right-mobile-width": `${mobileRightWidthPx}px`,
      }
    : undefined;
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
    desktopLeftWidthPx,
    desktopRightWidthPx,
    desktopSidebarMaxWidthPx,
    hasLeftPane,
    hasRightPane,
    leftDesktopOpen,
    rightDesktopOpen,
    setLeftDesktopWidthPx,
    setRightDesktopWidthPx,
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
            isMobile && activeMobileMergedSurfaceSide !== null
              ? activeMobileMergedSurfaceSide
              : undefined
          }
          style={layoutRootStyle}
          suppressHydrationWarning
        >
          <SidebarLayoutViewport
            activeResizeSide={activeResizeSide}
            carouselRef={mobileCarouselRef}
            desktopLeftWidthPx={desktopLeftWidthPx}
            desktopRightWidthPx={desktopRightWidthPx}
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
