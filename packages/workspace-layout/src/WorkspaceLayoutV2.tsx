import {
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
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
  getDesktopSidebarMaxWidthPx,
  getDesktopSidebarWidthPx,
  getMobileSidebarMaxWidthPx,
  getMobileSidebarMinWidthPx,
  getMobileSidebarWidthPx,
  type WorkspaceLayoutV2MobileMinResizeBehavior,
} from "./WorkspaceLayoutV2Geometry.ts";
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
  dataTestId?: string;
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
  dataTestId,
}: WorkspaceLayoutV2Props) {
  const hasAnyFineHoverPointer = useAnyFineHoverPointer();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mobileCarouselRef = useRef<HTMLDivElement | null>(null);
  const activeResizeSide = useWorkspaceLayoutV2Selector((state) => state.activeResizeSide);
  const isMobilePaneSettled = useWorkspaceLayoutV2Selector((state) => state.mobile.isPaneSettled);
  const mobilePaneNavigationRequest = useWorkspaceLayoutV2Selector(
    (state) => state.mobile.paneNavigationRequest,
  );
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
    mobilePaneNavigationRequest,
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
        ariaLabel={resizeHandleLabels[resizeHandle.side]}
        ariaValueText={formatResizeHandleValueText?.({
          side: resizeHandle.side,
          widthPx: Math.round(resizeHandle.currentWidthPx),
        })}
        currentSizePx={resizeHandle.currentWidthPx}
        dataTestId={resizeHandle.dataTestId}
        minSizePx={resizeHandle.minWidthPx}
        maxSizePx={resizeHandle.maxWidthPx}
        pointerTarget={pointerTarget}
        positionPx={handlePositionPx}
        resizeFrom={resizeHandle.side}
        onResizeStart={() => {
          if (isMobile) {
            mobileGripResize.startResize(resizeHandle);
          }
          setActiveResizeSide(resizeHandle.side);
        }}
        onResizeEnd={() => {
          if (isMobile) {
            const { shouldSyncPaneFromScroll } = mobileGripResize.endResize(resizeHandle);
            if (shouldSyncPaneFromScroll) {
              mobileCarouselRef.current?.dispatchEvent(new Event("scroll", { bubbles: true }));
            }
          } else {
            mobileCarouselRef.current?.dispatchEvent(new Event("scroll", { bubbles: true }));
          }
          setActiveResizeSide(null);
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
    <div
      data-testid={dataTestId}
      data-workspace-layout-part="root"
      data-workspace-layout-version="2"
    >
      <div
        data-testid="workspace-layout-v2-address-chrome"
        data-workspace-layout-part="address-chrome"
      >
        {addressChrome}
      </div>
      <div
        ref={viewportRef}
        data-mobile-pane={mobilePane}
        data-workspace-layout-part="viewport"
        data-workspace-layout-v2="responsive"
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
          leftWidthPx={mobileLeftWidthPx}
          lockCarouselScroll={isMobile && mobileGripResize.lockCarouselScroll}
          mainContent={main}
          paneWidthPx={mobileMainWidthPx}
          rightContent={right}
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
  );
}
