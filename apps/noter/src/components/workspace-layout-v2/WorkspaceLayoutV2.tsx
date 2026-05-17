import { useRef, type ReactElement } from "react";
import { useElementSize } from "#src/hooks/useElementSize.ts";
import {
  useWorkspaceLayoutV2Actions,
  useWorkspaceLayoutV2Selector,
  useWorkspacePaneActions,
  useWorkspacePaneState,
  type WorkspacePaneState,
} from "./WorkspacePaneRuntime";
import { isLandingDevModeEnabled } from "#src/lib/landingDevMode.ts";
import { parseTanStackSearch } from "#src/lib/tanstackSearchParams.ts";
import {
  type WorkspaceLayoutV2BottomPanelProps,
  WorkspaceLayoutV2MainViewportWithPanel,
} from "./WorkspaceLayoutV2BottomPanel";
import {
  DEFAULT_MOBILE_PANE_PEEK_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
  getDesktopSidebarMaxWidthPx,
  getDesktopSidebarWidthPx,
  getMobilePanePeekWidthPx,
  getMobileSidebarMaxWidthPx,
  getMobileSidebarMinWidthPx,
  getMobileSidebarWidthPx,
  type WorkspaceLayoutV2MobileMinResizeBehavior,
} from "./WorkspaceLayoutV2Geometry";
import { WorkspaceLayoutV2ResizeHandle } from "./WorkspaceLayoutV2ResizeHandle";
import {
  WorkspaceLayoutV2DesktopViewport,
  WorkspaceLayoutV2MobileViewport,
} from "./WorkspaceLayoutV2Viewports";
import {
  getWorkspaceLayoutV2DesktopResizeHandles,
  getWorkspaceLayoutV2MobileResizeHandles,
  type WorkspaceLayoutV2ResizeHandleConfig,
} from "./WorkspaceLayoutV2ResizeHandleConfigs";
import { useWorkspaceLayoutV2MobileCarouselController } from "./useWorkspaceLayoutV2MobileCarousel";
import { useWorkspaceLayoutV2MobileGripResizeController } from "./useWorkspaceLayoutV2MobileResize";

type WorkspaceLayoutV2Props = {
  left?: ReactElement;
  main: ReactElement;
  mobileMinResizeBehavior?: WorkspaceLayoutV2MobileMinResizeBehavior;
  mobilePanePeekWidthPx?: number;
  panel?: WorkspaceLayoutV2BottomPanelProps;
  right?: ReactElement;
  showMobileResizeGripDots?: boolean;

  dataTestId?: string;
};

/**
 * Keeps mobile resize grips visible on landing-page dev routes so layout work
 * can be tested without opting every fixture into debug chrome. Shipped routes
 * default to hidden grips unless the caller explicitly asks for them.
 */
function shouldShowMobileResizeGripDotsByDefault() {
  if (typeof window === "undefined") {
    return false;
  }

  return isLandingDevModeEnabled(parseTanStackSearch(window.location.search));
}

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

export function WorkspaceLayoutV2({
  left,
  main,
  mobileMinResizeBehavior = "min_resize_to_merge",
  mobilePanePeekWidthPx:
    configuredMobilePanePeekWidthPx = DEFAULT_MOBILE_PANE_PEEK_WIDTH_PX,
  panel,
  right,
  showMobileResizeGripDots,
  dataTestId,
}: WorkspaceLayoutV2Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mobileCarouselRef = useRef<HTMLDivElement | null>(null);
  const activeResizeSide = useWorkspaceLayoutV2Selector(
    (state) => state.activeResizeSide,
  );
  const isMobilePaneSettled = useWorkspaceLayoutV2Selector(
    (state) => state.mobile.isPaneSettled,
  );
  const viewportSize = useWorkspaceLayoutV2Selector(
    (state) => state.viewportSize,
  );
  const { setActiveResizeSide, setViewportSize } =
    useWorkspaceLayoutV2Actions();
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
  const shouldShowMobileResizeGripDots =
    showMobileResizeGripDots ?? shouldShowMobileResizeGripDotsByDefault();
  const mobilePanePeekWidthPx = getMobilePanePeekWidthPx(
    configuredMobilePanePeekWidthPx,
  );
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
    peekWidthPx: mobilePanePeekWidthPx,
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
    shouldShowMobileResizeGripDots,
    viewportWidthPx: viewportSize.widthPx,
  });

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
        ref={viewportRef}
        data-mobile-pane={isMobile ? mobilePane : undefined}
        data-workspace-layout-v2={isMobile ? "mobile" : "desktop"}
        className="relative flex min-h-0 flex-1 overflow-hidden bg-background"
      >
        {isMobile ? (
          <>
            <WorkspaceLayoutV2MobileViewport
              carouselRef={mobileCarouselRef}
              leftContent={left}
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
              rightContent={right}
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
              leftContent={left}
              mainContent={mainViewportContent}
              rightContent={right}
              showLeftPane={hasLeftPane}
              showRightPane={hasRightPane}
            />
            {desktopResizeHandles.map((resizeHandle) =>
              renderResizeHandle(resizeHandle, "edge"),
            )}
          </>
        )}
      </div>
    </div>
  );
}
