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
  useWorkspaceLayoutV2Actions,
  useWorkspaceLayoutV2Selector,
  useWorkspacePaneActions,
  useWorkspacePaneState,
  type WorkspacePaneState,
} from "./WorkspacePaneRuntime.tsx";
import {
  WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_UNMERGED_MOBILE_SURFACE,
  getDesktopSidebarMaxWidthPx,
  getDesktopSidebarWidthPx,
  getMergedMobileMainWidthPx,
  getMobileSidebarMaxWidthPx,
  getMobileSidebarMinWidthPx,
  getMobileSidebarWidthPx,
  type WorkspaceLayoutV2MobileMinResizeBehavior,
} from "./WorkspaceLayoutV2Geometry.ts";
import { WorkspaceLayoutDisplayedMobileStateContext } from "./WorkspaceLayoutPresentation.ts";
import type { WorkspacePaneSide } from "./WorkspaceLayoutV2State.ts";
import { WorkspaceLayoutV2ResizeHandle } from "./WorkspaceLayoutV2ResizeHandle.tsx";
import { WorkspaceLayoutV2Viewport } from "./WorkspaceLayoutV2Viewports.tsx";
import {
  getWorkspaceLayoutV2DesktopResizeHandles,
  getWorkspaceLayoutV2MobileResizeHandles,
  type WorkspaceLayoutV2ResizeHandleConfig,
} from "./WorkspaceLayoutV2ResizeHandleConfigs.ts";
import { useWorkspaceLayoutV2MobileCarouselController } from "./useWorkspaceLayoutV2MobileCarousel.ts";
import { useWorkspaceLayoutV2MobileGripResizeController } from "./useWorkspaceLayoutV2MobileResize.ts";

export type WorkspaceLayoutV2ResizeHandleLabels = Record<WorkspacePaneSide, string>;

export type WorkspaceLayoutV2ResizeHandleValueTextFormatter = (args: {
  side: WorkspacePaneSide;
  widthPx: number;
}) => string;

export type WorkspaceLayoutV2Props = {
  addressChrome: ReactNode;
  formatResizeHandleValueText?: WorkspaceLayoutV2ResizeHandleValueTextFormatter;
  left?: ReactElement;
  main: ReactElement;
  mobileMinResizeBehavior?: WorkspaceLayoutV2MobileMinResizeBehavior;
  resizeHandleLabels: WorkspaceLayoutV2ResizeHandleLabels;
  right?: ReactElement;
};

type WorkspaceLayoutV2RootStyle = CSSProperties & {
  "--workspace-layout-v2-left-mobile-width": string;
  "--workspace-layout-v2-main-mobile-width": string;
  "--workspace-layout-v2-right-mobile-width": string;
};

function getAvailableMobilePane({
  hasLeftPane,
  hasRightPane,
  mobilePane,
}: {
  hasLeftPane: boolean;
  hasRightPane: boolean;
  mobilePane: WorkspacePaneState["mobilePane"];
}) {
  if (mobilePane === "left" && !hasLeftPane) {
    return "main";
  }

  if (mobilePane === "right" && !hasRightPane) {
    return "main";
  }

  return mobilePane;
}

export function WorkspaceLayoutV2({
  addressChrome,
  formatResizeHandleValueText,
  left,
  main,
  mobileMinResizeBehavior = "min_resize_to_merge",
  resizeHandleLabels,
  right,
}: WorkspaceLayoutV2Props) {
  const paneIdPrefix = useId();
  const leftPaneId = `${paneIdPrefix}-pane-left`;
  const rightPaneId = `${paneIdPrefix}-pane-right`;
  const hasAnyFineHoverPointer = useAnyFineHoverPointer();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mobileCarouselRef = useRef<HTMLDivElement | null>(null);
  const activeResizeSide = useWorkspaceLayoutV2Selector((state) => state.activeResizeSide);
  const isMobilePaneSettled = useWorkspaceLayoutV2Selector((state) => state.mobile.isPaneSettled);
  const viewportSize = useWorkspaceLayoutV2Selector((state) => state.viewportSize);
  const { setActiveResizeSide, setViewportSize } = useWorkspaceLayoutV2Actions();
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
  } = useWorkspacePaneState();
  const {
    setLeftDesktopWidthPx,
    setLeftMobileWidthPx,
    setMobilePane,
    setRightDesktopWidthPx,
    setRightMobileWidthPx,
  } = useWorkspacePaneActions();
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
    configuredMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
    maxWidthPx: mobileSidebarMaxWidthPx,
    viewportWidthPx: viewportSize.widthPx,
  });
  const canDisplayMobileMerge =
    mobileMinResizeBehavior === "min_resize_to_merge" &&
    getMergedMobileMainWidthPx({
      mainMaxWidthPx: Math.max(1, viewportSize.widthPx),
      mainMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
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
  const mobileGripResize = useWorkspaceLayoutV2MobileGripResizeController({
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
      : WORKSPACE_LAYOUT_V2_UNMERGED_MOBILE_SURFACE;
  const mobileMainWidthPx = activeMobileSurface
    ? activeMobileSurface.mainWidthPx
    : mobileGripResize.mobileDefaultMainWidthPx;
  const layoutRootStyle: WorkspaceLayoutV2RootStyle | undefined = hasMeasuredViewport
    ? {
        "--workspace-layout-v2-left-mobile-width": `${mobileLeftWidthPx}px`,
        "--workspace-layout-v2-main-mobile-width": `${mobileMainWidthPx}px`,
        "--workspace-layout-v2-right-mobile-width": `${mobileRightWidthPx}px`,
      }
    : undefined;
  useWorkspaceLayoutV2MobileCarouselController({
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
  const desktopResizeHandles = getWorkspaceLayoutV2DesktopResizeHandles({
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
  const mobileResizeHandles = getWorkspaceLayoutV2MobileResizeHandles({
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
    side: WorkspacePaneSide;
  } | null>(null);

  function startResizeSession(resizeHandle: WorkspaceLayoutV2ResizeHandleConfig) {
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

  function finishResizeSession(resizeHandle: WorkspaceLayoutV2ResizeHandleConfig) {
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
    resizeHandle: WorkspaceLayoutV2ResizeHandleConfig,
    pointerTarget: "edge" | "grip",
  ) {
    const handlePositionPx = isMobile
      ? mobileGripResize.getGripPositionPx(resizeHandle)
      : resizeHandle.positionPx;

    return (
      <WorkspaceLayoutV2ResizeHandle
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
    <WorkspaceLayoutDisplayedMobileStateContext.Provider
      value={{
        mobileMergeAvailableSides: {
          left: isMobile && hasLeftPane && canDisplayMobileMerge,
          right: isMobile && hasRightPane && canDisplayMobileMerge,
        },
        mobilePane,
        mobileSurface: displayedMobileSurface,
      }}
    >
      <div data-workspace-layout-part="root">
        <div data-workspace-layout-part="address-chrome">{addressChrome}</div>
        <div
          ref={viewportRef}
          data-mobile-pane={mobilePane}
          data-mobile-min-resize-behavior={mobileMinResizeBehavior}
          data-workspace-layout-part="viewport"
          data-workspace-layout-v2-mobile-merged-side={
            isMobile && activeMobileMergedSurfaceSide !== null
              ? activeMobileMergedSurfaceSide
              : undefined
          }
          style={layoutRootStyle}
          suppressHydrationWarning
        >
          <WorkspaceLayoutV2Viewport
            activeResizeSide={activeResizeSide}
            carouselRef={mobileCarouselRef}
            desktopLeftWidthPx={desktopLeftWidthPx}
            desktopRightWidthPx={desktopRightWidthPx}
            enableDesktopPaneTransitions={enableDesktopPaneTransitions}
            hasMeasuredViewport={hasMeasuredViewport}
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
    </WorkspaceLayoutDisplayedMobileStateContext.Provider>
  );
}
