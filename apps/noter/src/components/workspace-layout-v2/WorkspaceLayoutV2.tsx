import {
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { Button } from "../ui/button";
import { PanelLeft, PanelRight } from "lucide-react";
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
  WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
  clampNumber,
  getDesktopSidebarMaxWidthPx,
  getDesktopSidebarWidthPx,
  getMobilePanePeekWidthPx,
  getMobileSidebarMaxWidthPx,
  getMobileSidebarMinWidthPx,
  getMobileSidebarWidthPx,
  type WorkspaceLayoutV2ActiveResizeSide,
  type WorkspaceLayoutV2MobileMinResizeBehavior,
} from "./WorkspaceLayoutV2Geometry";
import { WorkspaceLayoutV2ResizeHandle } from "./WorkspaceLayoutV2ResizeHandle";
import {
  WorkspaceLayoutV2DesktopViewport,
  WorkspaceLayoutV2MobileViewport,
} from "./WorkspaceLayoutV2Viewports";
import { useWorkspaceLayoutV2MobileCarouselController } from "./useWorkspaceLayoutV2MobileCarousel";
import {
  useWorkspaceLayoutV2MobileGripResizeController,
  type WorkspaceLayoutV2ResizeHandleConfig,
} from "./useWorkspaceLayoutV2MobileResize";

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

type WorkspaceLayoutV2ElementSize = {
  heightPx: number;
  widthPx: number;
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
