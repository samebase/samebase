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
import { useIsMobile } from "@/hooks/use-mobile";
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

export const WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX = 160;
const DESKTOP_SIDEBAR_MAX_WIDTH_RATIO = 0.45;
export const WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX = 160;
const MOBILE_PANE_PEEK_PX = 24;
const MOBILE_PANE_SETTLED_TOLERANCE_PX = 1;
const MOBILE_PANE_ORDER = ["left", "main", "right"] as const;
const MOBILE_PANE_ORDER_WITHOUT_RIGHT = ["left", "main"] as const;
type MobilePane = (typeof MOBILE_PANE_ORDER)[number];

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
    WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
    Math.round(viewportWidthPx * DESKTOP_SIDEBAR_MAX_WIDTH_RATIO),
  );
}

function getMobileSidebarMaxWidthPx(viewportWidthPx: number) {
  return Math.max(1, Math.floor(viewportWidthPx - MOBILE_PANE_PEEK_PX * 2));
}

function getMobileSidebarMinWidthPx(args: {
  maxWidthPx: number;
  viewportWidthPx: number;
}) {
  return clampNumber(
    Math.round(args.viewportWidthPx - args.maxWidthPx),
    1,
    args.maxWidthPx,
  );
}

function getMobileSidebarWidthPx(args: {
  maxWidthPx: number;
  minWidthPx: number;
  storedWidthPx: number;
}) {
  return clampNumber(
    Math.round(args.storedWidthPx),
    args.minWidthPx,
    args.maxWidthPx,
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
    WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
    getDesktopSidebarMaxWidthPx(args.viewportWidthPx),
  );
}

function getMobilePaneOrder(hasRightPane: boolean): readonly MobilePane[] {
  return hasRightPane ? MOBILE_PANE_ORDER : MOBILE_PANE_ORDER_WITHOUT_RIGHT;
}

function getMobilePaneScrollOffsets(args: {
  hasRightPane: boolean;
  leftWidthPx: number;
  mainWidthPx: number;
  rightWidthPx: number;
  viewportWidthPx: number;
}) {
  const paneOrder = getMobilePaneOrder(args.hasRightPane);

  return paneOrder.map((pane) => {
    if (pane === "left") {
      return {
        pane,
        scrollLeftPx: MOBILE_PANE_PEEK_PX,
      };
    }

    if (pane === "main") {
      return {
        pane,
        scrollLeftPx: args.leftWidthPx,
      };
    }

    return {
      pane,
      // The right sidebar is end-anchored so narrowing it exposes more of the
      // main pane instead of leaving blank track after the sidebar.
      scrollLeftPx: Math.max(
        0,
        args.leftWidthPx +
          args.mainWidthPx +
          args.rightWidthPx +
          MOBILE_PANE_PEEK_PX -
          args.viewportWidthPx,
      ),
    };
  });
}

function getMobilePaneScrollLeftPx(
  pane: MobilePane,
  args: Parameters<typeof getMobilePaneScrollOffsets>[0],
) {
  return (
    getMobilePaneScrollOffsets(args).find(
      (paneOffset) => paneOffset.pane === pane,
    )?.scrollLeftPx ?? 0
  );
}

function getMobilePaneFromScrollLeft(args: {
  hasRightPane: boolean;
  leftWidthPx: number;
  mainWidthPx: number;
  rightWidthPx: number;
  scrollLeftPx: number;
  viewportWidthPx: number;
}) {
  const paneOffsets = getMobilePaneScrollOffsets(args);
  if (paneOffsets.length === 0) {
    return "main" as const;
  }

  return paneOffsets.reduce((closestPane, candidatePane) =>
    Math.abs(candidatePane.scrollLeftPx - args.scrollLeftPx) <
    Math.abs(closestPane.scrollLeftPx - args.scrollLeftPx)
      ? candidatePane
      : closestPane,
  ).pane;
}

function isMobilePaneScrollSettled(
  args: Parameters<typeof getMobilePaneScrollOffsets>[0] & {
    pane: MobilePane;
    scrollLeftPx: number;
  },
) {
  return (
    Math.abs(
      args.scrollLeftPx -
        getMobilePaneScrollLeftPx(args.pane, {
          hasRightPane: args.hasRightPane,
          leftWidthPx: args.leftWidthPx,
          mainWidthPx: args.mainWidthPx,
          rightWidthPx: args.rightWidthPx,
          viewportWidthPx: args.viewportWidthPx,
        }),
    ) <= MOBILE_PANE_SETTLED_TOLERANCE_PX
  );
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

function getMobilePaneBorderClass(pane: MobilePane, activePane: MobilePane) {
  return pane === activePane ? "border-x-0" : "border-x border-border";
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
    carouselRef: RefObject<HTMLDivElement | null>;
    leftWidthPx: number;
    mobilePane: MobilePane;
    paneWidthPx: number;
    rightWidthPx: number;
    showRightPane: boolean;
  };

function WorkspaceLayoutV2MobileViewport({
  carouselRef,
  leftContent,
  leftWidthPx,
  mainContent,
  mobilePane,
  paneWidthPx,
  rightContent,
  rightWidthPx,
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
        data-testid="workspace-layout-v2-pane-left"
        className={cn(
          "relative flex h-full min-h-0 shrink-0 snap-start snap-always flex-col overflow-hidden bg-background",
          getMobilePaneBorderClass("left", mobilePane),
        )}
        style={{
          width: `${leftWidthPx}px`,
        }}
      >
        {leftContent}
      </div>

      <div
        className="h-full min-h-0 shrink-0 snap-center snap-always"
        style={{ width: `${paneWidthPx}px` }}
      >
        <div
          className={cn(
            "box-border h-full min-h-0 overflow-hidden bg-background",
            // The active mobile pane stays borderless so no visible content
            // loses a pixel to its own separator.
            getMobilePaneBorderClass("main", mobilePane),
          )}
        >
          {mainContent}
        </div>
      </div>

      {showRightPane ? (
        <div
          data-testid="workspace-layout-v2-pane-right"
          className={cn(
            "relative flex h-full min-h-0 shrink-0 snap-end snap-always flex-col overflow-hidden bg-background",
            getMobilePaneBorderClass("right", mobilePane),
          )}
          style={{
            width: `${rightWidthPx}px`,
          }}
        >
          {rightContent}
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceLayoutV2MainPaneHeader({
  children,
  showLeftToggle = true,
  showRightToggle = true,
}: {
  children: ReactNode;
  showLeftToggle?: boolean;
  showRightToggle?: boolean;
}) {
  const { toggleLeftSidebar, toggleRightSidebar } = useSidebar();

  return (
    <div className="flex h-full items-center gap-2">
      {showLeftToggle ? (
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
      ) : null}

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
  showLeftToggle = true,
}: {
  dataTestId?: string;
  left: WorkspaceLayoutV2PaneFrameProps;
  main: WorkspaceLayoutV2PaneFrameProps;
  panel?: WorkspaceLayoutV2BottomPanelProps;
  right?: WorkspaceLayoutV2PaneFrameProps;
  showLeftToggle?: boolean;
}) {
  const hasRightPane = right !== undefined;
  const isMobile = useIsMobile();
  // Desktop keeps the shared shell for sidebar toggles; only mobile routes
  // with no main-header content collapse the row entirely.
  const hasMainHeaderContent =
    main.header !== undefined && main.header !== null;
  const hasDesktopHeaderToggle = showLeftToggle || hasRightPane;
  const shouldHideMainHeader =
    !hasMainHeaderContent && (isMobile || !hasDesktopHeaderToggle);

  return (
    <WorkspaceLayoutV2ViewportFrame dataTestId={dataTestId}>
      <WorkspaceLayoutV2JustPanes
        left={<WorkspaceLayoutV2PaneFrame {...left} />}
        main={
          <WorkspaceLayoutV2PaneFrame
            {...main}
            header={
              shouldHideMainHeader ? undefined : (
                <WorkspaceLayoutV2MainPaneHeader
                  showLeftToggle={showLeftToggle}
                  showRightToggle={hasRightPane}
                >
                  {main.header}
                </WorkspaceLayoutV2MainPaneHeader>
              )
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
  const viewportSize = useElementSize(viewportRef);
  const [activeResizeSide, setActiveResizeSide] = useState<
    "left" | "right" | "top" | null
  >(null);
  const [isMobilePaneSettled, setIsMobilePaneSettled] = useState(true);
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
  const hasRightPane = right !== null && right !== undefined;
  const mobilePane =
    !hasRightPane && rawMobilePane === "right" ? "main" : rawMobilePane;
  const setMobilePaneRef = useRef(setMobilePane);

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
  const mobileSidebarMinWidthPx = getMobileSidebarMinWidthPx({
    maxWidthPx: mobileSidebarMaxWidthPx,
    viewportWidthPx: viewportSize.widthPx,
  });
  const mobilePaneWidthPx = Math.max(
    1,
    viewportSize.widthPx - MOBILE_PANE_PEEK_PX * 2,
  );
  const mobileLeftWidthPx = getMobileSidebarWidthPx({
    maxWidthPx: mobileSidebarMaxWidthPx,
    minWidthPx: mobileSidebarMinWidthPx,
    storedWidthPx: leftMobileWidthPx,
  });
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
  const hasAlignedInitialMobilePaneRef = useRef(false);
  const scrollDerivedMobilePaneRef = useRef<MobilePane | null>(null);

  useEffect(() => {
    if (isMobile) {
      return;
    }

    hasAlignedInitialMobilePaneRef.current = false;
    scrollDerivedMobilePaneRef.current = null;
    setIsMobilePaneSettled(true);
  }, [isMobile]);

  useEffect(() => {
    setMobilePaneRef.current = setMobilePane;
  }, [setMobilePane]);

  useLayoutEffect(() => {
    const carouselNode = mobileCarouselRef.current;
    if (!isMobile || carouselNode === null || mobilePaneWidthPx <= 0) {
      return;
    }

    const nextScrollLeftPx = getMobilePaneScrollLeftPx(mobilePane, {
      hasRightPane,
      leftWidthPx: mobileLeftWidthPx,
      mainWidthPx: mobilePaneWidthPx,
      rightWidthPx: mobileRightWidthPx,
      viewportWidthPx: viewportSize.widthPx,
    });

    if (!hasAlignedInitialMobilePaneRef.current) {
      // Align the first mobile paint to the current sidebar state so refreshes
      // keep the intended pane instead of booting at scrollLeft=0 and
      // immediately persisting "left".
      carouselNode.scrollLeft = nextScrollLeftPx;
      setIsMobilePaneSettled(true);
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
    setIsMobilePaneSettled(true);
  }, [
    hasRightPane,
    isMobile,
    mobileLeftWidthPx,
    mobilePane,
    mobilePaneWidthPx,
    mobileRightWidthPx,
    viewportSize.widthPx,
  ]);

  useEffect(() => {
    const carouselNode = mobileCarouselRef.current;
    if (!isMobile || !carouselNode || mobilePaneWidthPx <= 0) {
      return;
    }

    let settleTimeoutId: number | null = null;
    const syncPaneFromScroll = () => {
      const nextPane = getMobilePaneFromScrollLeft({
        hasRightPane,
        leftWidthPx: mobileLeftWidthPx,
        mainWidthPx: mobilePaneWidthPx,
        rightWidthPx: mobileRightWidthPx,
        scrollLeftPx: carouselNode.scrollLeft,
        viewportWidthPx: viewportSize.widthPx,
      });
      setIsMobilePaneSettled(
        isMobilePaneScrollSettled({
          hasRightPane,
          leftWidthPx: mobileLeftWidthPx,
          mainWidthPx: mobilePaneWidthPx,
          pane: nextPane,
          rightWidthPx: mobileRightWidthPx,
          scrollLeftPx: carouselNode.scrollLeft,
          viewportWidthPx: viewportSize.widthPx,
        }),
      );
      setMobilePaneRef.current((currentPane) => {
        if (currentPane === nextPane) {
          return currentPane;
        }

        scrollDerivedMobilePaneRef.current = nextPane;
        return nextPane;
      });
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
  }, [
    hasRightPane,
    isMobile,
    mobileLeftWidthPx,
    mobilePaneWidthPx,
    mobileRightWidthPx,
    viewportSize.widthPx,
  ]);

  const desktopResizeHandles: WorkspaceLayoutV2ResizeHandleConfig[] =
    viewportSize.widthPx <= 0
      ? []
      : [
          leftDesktopOpen
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
  const mobileResizeHandles: WorkspaceLayoutV2ResizeHandleConfig[] =
    viewportSize.widthPx <= 0 || !isMobilePaneSettled
      ? []
      : [
          mobilePane === "left"
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
        <>
          <WorkspaceLayoutV2MobileViewport
            carouselRef={mobileCarouselRef}
            leftContent={resolvedLeftContent}
            leftWidthPx={mobileLeftWidthPx}
            mainContent={mainViewportContent}
            mobilePane={mobilePane}
            paneWidthPx={mobilePaneWidthPx}
            rightContent={resolvedRightContent}
            rightWidthPx={mobileRightWidthPx}
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
          />
          {desktopResizeHandles.map((resizeHandle) =>
            renderResizeHandle(resizeHandle, "edge"),
          )}
        </>
      )}
    </div>
  );
}
