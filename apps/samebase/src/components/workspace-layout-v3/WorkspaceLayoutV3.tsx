import { useRef, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { useElementSize } from "@/hooks/useElementSize";
import {
  useWorkspaceLayoutV3Actions,
  useWorkspaceLayoutV3Selector,
  useWorkspacePaneActions,
  useWorkspacePaneState,
  type WorkspacePaneState,
} from "./WorkspacePaneRuntime";
import {
  type WorkspaceLayoutV3BottomPanelProps,
  WorkspaceLayoutV3MainViewportWithPanel,
} from "./WorkspaceLayoutV3BottomPanel";
import {
  WORKSPACE_LAYOUT_V3_MOBILE_SIDEBAR_MIN_WIDTH_PX,
  getDesktopSidebarMaxWidthPx,
  getDesktopSidebarWidthPx,
  getMobileSidebarMaxWidthPx,
  getMobileSidebarMinWidthPx,
  getMobileSidebarWidthPx,
  type WorkspaceLayoutV3MobileMinResizeBehavior,
} from "./WorkspaceLayoutV3Geometry";
import { WorkspaceLayoutV3ResizeHandle } from "./WorkspaceLayoutV3ResizeHandle";
import { WorkspaceLayoutV3Viewport } from "./WorkspaceLayoutV3Viewports";
import {
  getWorkspaceLayoutV3DesktopResizeHandles,
  getWorkspaceLayoutV3MobileResizeHandles,
  type WorkspaceLayoutV3ResizeHandleConfig,
} from "./WorkspaceLayoutV3ResizeHandleConfigs";
import { useWorkspaceLayoutV3MobileCarouselController } from "./useWorkspaceLayoutV3MobileCarousel";
import { useWorkspaceLayoutV3MobileGripResizeController } from "./useWorkspaceLayoutV3MobileResize";

type WorkspaceLayoutV3Props = {
  addressChrome: ReactNode;
  left?: ReactElement;
  main: ReactElement;
  mobileMinResizeBehavior?: WorkspaceLayoutV3MobileMinResizeBehavior;
  panel?: WorkspaceLayoutV3BottomPanelProps;
  right?: ReactElement;

  dataTestId?: string;
};

type WorkspaceLayoutV3RootStyle = CSSProperties & {
  "--workspace-layout-v3-left-mobile-width": string;
  "--workspace-layout-v3-main-mobile-width": string;
  "--workspace-layout-v3-right-mobile-width": string;
};

/**
 * If durable state says "left" but this layout has no left pane, render
 * "main"; same for "right". Leave persistence untouched so routes that do have
 * that pane can keep using the saved selection.
 */
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

export function WorkspaceLayoutV3({
  addressChrome,
  left,
  main,
  mobileMinResizeBehavior = "min_resize_to_merge",
  panel,
  right,
  dataTestId,
}: WorkspaceLayoutV3Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mobileCarouselRef = useRef<HTMLDivElement | null>(null);
  const activeResizeSide = useWorkspaceLayoutV3Selector((state) => state.activeResizeSide);
  const isMobilePaneSettled = useWorkspaceLayoutV3Selector((state) => state.mobile.isPaneSettled);
  const viewportSize = useWorkspaceLayoutV3Selector((state) => state.viewportSize);
  const { setActiveResizeSide, setViewportSize } = useWorkspaceLayoutV3Actions();
  useElementSize(viewportRef, setViewportSize);
  const {
    isMobile,
    leftDesktopOpen,
    leftDesktopWidthPx,
    leftMobileWidthPx,
    mobilePane: rawMobilePane,
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
  const hasLeftPane = !!left;
  const hasRightPane = !!right;
  const hasMeasuredViewport = viewportSize.widthPx > 0;
  const mobilePane = getAvailableMobilePane({
    hasLeftPane,
    hasRightPane,
    mobilePane: rawMobilePane,
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
    configuredMinWidthPx: WORKSPACE_LAYOUT_V3_MOBILE_SIDEBAR_MIN_WIDTH_PX,
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
  const activeMobileGripResizeSideRef = useRef<"left" | "right" | null>(null);
  const mobileGripResize = useWorkspaceLayoutV3MobileGripResizeController({
    activeGripResizeSideRef: activeMobileGripResizeSideRef,
    carouselRef: mobileCarouselRef,
    hasLeftPane,
    hasRightPane,
    isMobile,
    leftWidthPx: mobileLeftWidthPx,
    mobileMinResizeBehavior,
    mobilePane,
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
  const layoutRootStyle: WorkspaceLayoutV3RootStyle | undefined = hasMeasuredViewport
    ? {
        "--workspace-layout-v3-left-mobile-width": `${mobileLeftWidthPx}px`,
        "--workspace-layout-v3-main-mobile-width": `${mobileMainWidthPx}px`,
        "--workspace-layout-v3-right-mobile-width": `${mobileRightWidthPx}px`,
      }
    : undefined;
  useWorkspaceLayoutV3MobileCarouselController({
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
  const desktopResizeHandles = getWorkspaceLayoutV3DesktopResizeHandles({
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
  const mobileResizeHandles = getWorkspaceLayoutV3MobileResizeHandles({
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
    resizeHandle: WorkspaceLayoutV3ResizeHandleConfig,
    pointerTarget: "edge" | "grip",
  ) {
    const gripSlidePositionPx =
      pointerTarget === "grip"
        ? mobileGripResize.getGripPositionPx(resizeHandle)
        : resizeHandle.positionPx;

    return (
      <WorkspaceLayoutV3ResizeHandle
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
          pointerTarget === "grip"
            ? (rawWidthPx: number) => mobileGripResize.changeRawSize(resizeHandle, rawWidthPx)
            : undefined
        }
        onSizeChange={resizeHandle.onWidthChange}
      />
    );
  }

  const mainViewportContent = (
    <WorkspaceLayoutV3MainViewportWithPanel
      activeResizeSide={activeResizeSide}
      isMobile={isMobile}
      mainContent={main}
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
      data-testid={dataTestId}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <div
        data-testid="workspace-layout-v3-address-chrome"
        className="shrink-0 border-b border-border bg-background"
      >
        {addressChrome}
      </div>
      <div
        ref={viewportRef}
        data-mobile-pane={mobilePane}
        data-workspace-layout-v3="responsive"
        data-workspace-layout-v3-mobile-merged-side={
          isMobile && activeMobileMergedSurfaceSide !== null
            ? activeMobileMergedSurfaceSide
            : undefined
        }
        className="relative flex min-h-0 flex-1 overflow-hidden bg-background"
        style={layoutRootStyle}
        suppressHydrationWarning
      >
        <WorkspaceLayoutV3Viewport
          activeResizeSide={activeResizeSide}
          carouselRef={mobileCarouselRef}
          desktopLeftWidthPx={desktopLeftWidthPx}
          desktopRightWidthPx={desktopRightWidthPx}
          hasMeasuredViewport={hasMeasuredViewport}
          leftContent={left}
          leftWidthPx={mobileLeftWidthPx}
          lockCarouselScroll={isMobile && mobileGripResize.lockCarouselScroll}
          mainContent={mainViewportContent}
          paneWidthPx={mobileMainWidthPx}
          rightContent={right}
          rightWidthPx={mobileRightWidthPx}
          showLeftPane={hasLeftPane}
          showRightPane={hasRightPane}
        />
        {isMobile
          ? mobileResizeHandles.map((resizeHandle) => renderResizeHandle(resizeHandle, "grip"))
          : desktopResizeHandles.map((resizeHandle) => renderResizeHandle(resizeHandle, "edge"))}
      </div>
    </div>
  );
}
