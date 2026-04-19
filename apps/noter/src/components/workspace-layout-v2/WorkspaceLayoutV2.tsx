import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "../ui/button";
import { PanelLeft, PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  WorkspaceLayoutV2PaneFrame,
  type WorkspaceLayoutV2PaneFrameProps,
} from "./WorkspaceLayoutV2PaneFrame";
import {
  type WorkspaceLayoutV2BottomPanelProps,
  WorkspaceLayoutV2MainViewportWithPanel,
} from "./WorkspaceLayoutV2BottomPanel";
import { WorkspaceLayoutV2ResizeHandle } from "./WorkspaceLayoutV2ResizeHandle";

const DESKTOP_SIDEBAR_MIN_WIDTH_PX = 160;
const DESKTOP_SIDEBAR_MAX_WIDTH_RATIO = 0.45;
const MOBILE_SIDEBAR_MIN_WIDTH_PX = 160;
const MOBILE_PANE_PEEK_PX = 24;
const MOBILE_PANE_ORDER = ["left", "main", "right"] as const;
const MOBILE_PANE_ORDER_WITHOUT_RIGHT = ["left", "main"] as const;

type WorkspaceLayoutV2Props = {
  dataTestId?: string;
  left: ReactNode;
  main: ReactNode;
  right: ReactNode;
};

type WorkspaceLayoutV2JustPanesProps = WorkspaceLayoutV2Props & {
  panel?: WorkspaceLayoutV2BottomPanelProps;
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

function clampNumber(value: number, minValue: number, maxValue: number) {
  return Math.max(minValue, Math.min(value, maxValue));
}

/**
 * The shell math is driven by the rendered viewport box, not viewport media
 * queries, so resizes and mobile browser chrome changes update pane geometry
 * from the actual DOM box we are drawing into.
 */
function useElementSize(measureRef: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ heightPx: 0, widthPx: 0 });

  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) {
      return;
    }

    const updateWidth = () => {
      const bounds = node.getBoundingClientRect();
      setSize({
        heightPx: Math.max(0, Math.round(bounds.height)),
        widthPx: Math.max(0, Math.round(bounds.width)),
      });
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

function getDesktopSidebarMaxWidthPx(viewportWidthPx: number) {
  return Math.max(
    DESKTOP_SIDEBAR_MIN_WIDTH_PX,
    Math.round(viewportWidthPx * DESKTOP_SIDEBAR_MAX_WIDTH_RATIO),
  );
}

function getMobileSidebarMaxWidthPx(viewportWidthPx: number) {
  return Math.max(
    MOBILE_SIDEBAR_MIN_WIDTH_PX,
    Math.max(0, Math.floor(viewportWidthPx)),
  );
}

function getDesktopSidebarWidthPx(args: {
  isOpen: boolean;
  storedWidthPx: number;
  viewportWidthPx: number;
}) {
  if (!args.isOpen) {
    return 0;
  }

  return clampNumber(
    Math.round(args.storedWidthPx),
    DESKTOP_SIDEBAR_MIN_WIDTH_PX,
    getDesktopSidebarMaxWidthPx(args.viewportWidthPx),
  );
}

function getMobilePaneIndex(pane: (typeof MOBILE_PANE_ORDER)[number]) {
  return MOBILE_PANE_ORDER.indexOf(pane);
}

function getMobilePaneOrder(hasRightPane: boolean) {
  return hasRightPane ? MOBILE_PANE_ORDER : MOBILE_PANE_ORDER_WITHOUT_RIGHT;
}

function getMobilePaneScrollLeft(args: {
  hasRightPane: boolean;
  pane: (typeof MOBILE_PANE_ORDER)[number];
  viewportWidthPx: number;
}) {
  const paneOrder = getMobilePaneOrder(args.hasRightPane);
  const paneIndex = paneOrder.indexOf(
    args.hasRightPane || args.pane !== "right" ? args.pane : "main",
  );

  return (
    Math.max(0, paneIndex) *
    Math.max(1, args.viewportWidthPx - MOBILE_PANE_PEEK_PX * 2)
  );
}

function getMobilePaneFromScrollLeft(args: {
  hasRightPane: boolean;
  scrollLeftPx: number;
  viewportWidthPx: number;
}) {
  if (args.viewportWidthPx <= 0) {
    return "main" as const;
  }

  const paneOrder = getMobilePaneOrder(args.hasRightPane);

  const paneIndex = clampNumber(
    Math.round(
      args.scrollLeftPx /
        Math.max(1, args.viewportWidthPx - MOBILE_PANE_PEEK_PX * 2),
    ),
    0,
    paneOrder.length - 1,
  );
  return paneOrder[paneIndex];
}

function renderPaneContent(content: ReactNode) {
  return (
    // The shell contract always keeps all three panes mounted. A null slot is
    // still a real pane so resize and carousel behavior stay consistent.
    content ?? (
      <div aria-hidden="true" className="min-h-0 flex-1 bg-background" />
    )
  );
}

type WorkspaceLayoutV2DesktopViewportProps =
  WorkspaceLayoutV2ResolvedPaneContent & {
    activeResizeSide: "left" | "right" | "top" | null;
    desktopLeftWidthPx: number;
    desktopRightWidthPx: number;
  };

function WorkspaceLayoutV2DesktopViewport({
  activeResizeSide,
  desktopLeftWidthPx,
  desktopRightWidthPx,
  leftContent,
  mainContent,
  rightContent,
}: WorkspaceLayoutV2DesktopViewportProps) {
  return (
    <div className="absolute inset-0 flex min-h-0 overflow-hidden bg-background">
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
    activeResizeSide: "left" | "right" | "top" | null;
    carouselRef: RefObject<HTMLDivElement | null>;
    sidebarMaxWidthPx: number;
    paneWidthPx: number;
    showRightPane: boolean;
  };

function WorkspaceLayoutV2MobileViewport({
  activeResizeSide,
  carouselRef,
  leftContent,
  mainContent,
  paneWidthPx,
  sidebarMaxWidthPx,
  rightContent,
  showRightPane,
}: WorkspaceLayoutV2MobileViewportProps) {
  return (
    <div
      ref={carouselRef}
      data-testid="workspace-layout-v2-pane-main"
      className="absolute inset-0 flex min-h-0 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{
        paddingLeft: `${MOBILE_PANE_PEEK_PX}px`,
        paddingRight: `${MOBILE_PANE_PEEK_PX}px`,
      }}
    >
      <div
        className="relative h-full min-h-0 shrink-0 snap-center [scroll-snap-stop:always]"
        style={{ width: `${paneWidthPx}px` }}
      >
        <div className="flex h-full min-h-0 justify-end">
          <div
            data-testid="workspace-layout-v2-pane-left"
            className={cn(
              "flex h-full min-h-0 flex-col overflow-hidden border-r bg-background",
              activeResizeSide === "left" ? "border-primary" : "border-border",
            )}
            style={{
              maxWidth: `${sidebarMaxWidthPx}px`,
              minWidth: `${MOBILE_SIDEBAR_MIN_WIDTH_PX}px`,
              width: "fit-content",
            }}
          >
            {leftContent}
          </div>
        </div>
      </div>

      <div
        className="h-full min-h-0 shrink-0 snap-center [scroll-snap-stop:always]"
        style={{ width: `${paneWidthPx}px` }}
      >
        <div className="h-full min-h-0 overflow-hidden bg-background">
          {mainContent}
        </div>
      </div>

      {showRightPane ? (
        <div
          className="relative h-full min-h-0 shrink-0 snap-center [scroll-snap-stop:always]"
          style={{ width: `${paneWidthPx}px` }}
        >
          <div className="flex h-full min-h-0 justify-start">
            <div
              data-testid="workspace-layout-v2-pane-right"
              className={cn(
                "flex h-full min-h-0 flex-col overflow-hidden border-l bg-background",
                activeResizeSide === "right"
                  ? "border-primary"
                  : "border-border",
              )}
              style={{
                width: `${paneWidthPx}px`,
              }}
            >
              {rightContent}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceLayoutV2MainPaneHeader({
  children,
  showRightToggle = true,
}: {
  children: ReactNode;
  showRightToggle?: boolean;
}) {
  const { toggleLeftSidebar, toggleRightSidebar } = useSidebar();

  return (
    <div className="flex h-full items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Toggle Left Sidebar"
        className="hidden h-8 w-8 md:inline-flex"
        onClick={toggleLeftSidebar}
      >
        <PanelLeft className="h-4 w-4" />
      </Button>

      {/* Keep route-level header actions visible on mobile; only the sidebar
          toggles stay desktop-only in the v2 main pane shell. */}
      <div className="min-w-0 flex-1">{children}</div>

      {showRightToggle ? (
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
  panel,
  right,
}: {
  dataTestId?: string;
  left: WorkspaceLayoutV2PaneFrameProps;
  main: WorkspaceLayoutV2PaneFrameProps;
  panel?: WorkspaceLayoutV2BottomPanelProps;
  right?: WorkspaceLayoutV2PaneFrameProps;
}) {
  const hasRightPane = right !== undefined;

  return (
    <WorkspaceLayoutV2ViewportFrame dataTestId={dataTestId}>
      <WorkspaceLayoutV2JustPanes
        left={<WorkspaceLayoutV2PaneFrame {...left} />}
        main={
          <WorkspaceLayoutV2PaneFrame
            {...main}
            header={
              <WorkspaceLayoutV2MainPaneHeader showRightToggle={hasRightPane}>
                {main.header}
              </WorkspaceLayoutV2MainPaneHeader>
            }
          />
        }
        panel={panel}
        right={hasRightPane ? <WorkspaceLayoutV2PaneFrame {...right} /> : null}
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

export function WorkspaceLayoutV2JustPanes({
  dataTestId,
  left,
  main,
  panel,
  right,
}: WorkspaceLayoutV2JustPanesProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mobileCarouselRef = useRef<HTMLDivElement | null>(null);
  const mobileCarouselReadyRef = useRef(false);
  const previousMobileViewportWidthRef = useRef(0);
  const viewportSize = useElementSize(viewportRef);
  const [activeResizeSide, setActiveResizeSide] = useState<
    "left" | "right" | "top" | null
  >(null);
  const {
    isMobile,
    leftDesktopOpen,
    leftDesktopWidthPx,
    mobilePane: rawMobilePane,
    rightDesktopOpen,
    rightDesktopWidthPx,
    setLeftDesktopWidthPx,
    setMobilePane,
    setRightDesktopWidthPx,
  } = useSidebar();
  const hasRightPane = right !== null && right !== undefined;
  const mobilePane = hasRightPane ? rawMobilePane : "main";

  const desktopLeftWidthPx = getDesktopSidebarWidthPx({
    isOpen: leftDesktopOpen,
    storedWidthPx: leftDesktopWidthPx,
    viewportWidthPx: viewportSize.widthPx,
  });
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
  const mobileSidebarMaxWidthPx = getMobileSidebarMaxWidthPx(
    viewportSize.widthPx,
  );
  const mobilePaneWidthPx = Math.max(
    1,
    viewportSize.widthPx - MOBILE_PANE_PEEK_PX * 2,
  );
  const mobileSidebarWidthCapPx = Math.min(
    mobileSidebarMaxWidthPx,
    mobilePaneWidthPx,
  );

  const resolvedLeftContent = renderPaneContent(left);
  const resolvedMainContent = renderPaneContent(main);
  const resolvedRightContent = renderPaneContent(right);

  useLayoutEffect(() => {
    if (!isMobile) {
      mobileCarouselReadyRef.current = false;
      previousMobileViewportWidthRef.current = 0;
      return;
    }

    const carouselNode = mobileCarouselRef.current;
    if (!carouselNode || viewportSize.widthPx <= 0) {
      return;
    }

    const nextScrollLeftPx = getMobilePaneScrollLeft({
      hasRightPane,
      pane: mobilePane,
      viewportWidthPx: viewportSize.widthPx,
    });
    const viewportWidthChanged =
      previousMobileViewportWidthRef.current > 0 &&
      previousMobileViewportWidthRef.current !== viewportSize.widthPx;
    const shouldAnimate =
      mobileCarouselReadyRef.current && !viewportWidthChanged;

    if (Math.abs(carouselNode.scrollLeft - nextScrollLeftPx) > 1) {
      if (shouldAnimate) {
        carouselNode.scrollTo({
          left: nextScrollLeftPx,
          behavior: "smooth",
        });
      } else {
        carouselNode.scrollLeft = nextScrollLeftPx;
      }
    }

    mobileCarouselReadyRef.current = true;
    previousMobileViewportWidthRef.current = viewportSize.widthPx;
  }, [hasRightPane, isMobile, mobilePane, viewportSize.widthPx]);

  useEffect(() => {
    const carouselNode = mobileCarouselRef.current;
    if (!isMobile || !carouselNode || viewportSize.widthPx <= 0) {
      return;
    }

    let settleTimeoutId: number | null = null;
    const syncPaneFromScroll = () => {
      const nextPane = getMobilePaneFromScrollLeft({
        hasRightPane,
        scrollLeftPx: carouselNode.scrollLeft,
        viewportWidthPx: viewportSize.widthPx,
      });
      setMobilePane((currentPane) =>
        currentPane === nextPane ? currentPane : nextPane,
      );
    };

    const handleScroll = () => {
      syncPaneFromScroll();
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
      settleTimeoutId = window.setTimeout(syncPaneFromScroll, 80);
    };

    carouselNode.addEventListener("scroll", handleScroll, {
      passive: true,
    });
    syncPaneFromScroll();

    return () => {
      carouselNode.removeEventListener("scroll", handleScroll);
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
    };
  }, [hasRightPane, isMobile, setMobilePane, viewportSize.widthPx]);

  const desktopResizeHandles: WorkspaceLayoutV2ResizeHandleConfig[] =
    viewportSize.widthPx <= 0
      ? []
      : [
          leftDesktopOpen
            ? {
                currentWidthPx: desktopLeftWidthPx,
                dataTestId: "workspace-layout-v2-left-resize",
                maxWidthPx: desktopSidebarMaxWidthPx,
                minWidthPx: DESKTOP_SIDEBAR_MIN_WIDTH_PX,
                onWidthChange: (nextWidthPx: number) => {
                  setLeftDesktopWidthPx(
                    clampNumber(
                      Math.round(nextWidthPx),
                      DESKTOP_SIDEBAR_MIN_WIDTH_PX,
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
                minWidthPx: DESKTOP_SIDEBAR_MIN_WIDTH_PX,
                onWidthChange: (nextWidthPx: number) => {
                  setRightDesktopWidthPx(
                    clampNumber(
                      Math.round(nextWidthPx),
                      DESKTOP_SIDEBAR_MIN_WIDTH_PX,
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

  function renderResizeHandle(
    resizeHandle: WorkspaceLayoutV2ResizeHandleConfig,
    pointerTarget: "edge" | "grip",
  ) {
    return (
      <WorkspaceLayoutV2ResizeHandle
        key={resizeHandle.side}
        currentSizePx={resizeHandle.currentWidthPx}
        dataTestId={resizeHandle.dataTestId}
        minSizePx={resizeHandle.minWidthPx}
        maxSizePx={resizeHandle.maxWidthPx}
        pointerTarget={pointerTarget}
        positionPx={resizeHandle.positionPx}
        resizeFrom={resizeHandle.side}
        onResizeStart={() => {
          setActiveResizeSide(resizeHandle.side);
        }}
        onResizeEnd={() => {
          setActiveResizeSide(null);
        }}
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
        <WorkspaceLayoutV2MobileViewport
          activeResizeSide={activeResizeSide}
          carouselRef={mobileCarouselRef}
          leftContent={resolvedLeftContent}
          mainContent={mainViewportContent}
          paneWidthPx={mobilePaneWidthPx}
          sidebarMaxWidthPx={mobileSidebarWidthCapPx}
          rightContent={resolvedRightContent}
          showRightPane={hasRightPane}
        />
      ) : (
        <>
          <WorkspaceLayoutV2DesktopViewport
            activeResizeSide={activeResizeSide}
            desktopLeftWidthPx={desktopLeftWidthPx}
            desktopRightWidthPx={desktopRightWidthPx}
            leftContent={resolvedLeftContent}
            mainContent={mainViewportContent}
            rightContent={resolvedRightContent}
          />
          {desktopResizeHandles.map((resizeHandle) =>
            renderResizeHandle(resizeHandle, "edge"),
          )}
        </>
      )}
    </div>
  );
}
