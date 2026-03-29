import * as React from "react";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  getMobilePaneScrollLeft,
  getSettledMobilePane,
} from "@/lib/workspaceSidebar";
import { cn } from "@/lib/utils";

const MOBILE_SCROLL_SETTLE_DELAY_MS = 140;
const MOBILE_MAIN_SCRIM_MAX_OPACITY = 0.16;
const MOBILE_MAIN_SCRIM_INTERACTION_THRESHOLD = 0.01;

type WorkspaceSidebarShellProps = {
  bodyClassName?: string;
  bodyStyle?: React.CSSProperties;
  bodyTestId?: string;
  children: React.ReactNode;
  dataTestId?: string;
  headerContent: React.ReactNode;
  headerTestId?: string;
  leftSidebarContent?: React.ReactNode;
  leftSidebarContentTestId?: string;
  leftSidebarHeader?: React.ReactNode;
  leftSidebarHeaderTestId?: string;
  rightSidebarContent?: React.ReactNode;
  rightSidebarContentTestId?: string;
  rightSidebarHeader?: React.ReactNode;
  rightSidebarHeaderTestId?: string;
};

/**
 * Derive a normalized scrim opacity from the mobile carousel position. The
 * center pane owns the main content, so the scrim simply reflects how far the
 * current scroll position is from that center anchor.
 */
function getMobileMainScrimProgress(
  scrollLeft: number,
  hasLeftSidebar: boolean,
  leftSidebarWidthPx: number,
  hasRightSidebar: boolean,
  rightSidebarWidthPx: number,
) {
  const mainPaneScrollLeft = hasLeftSidebar ? leftSidebarWidthPx : 0;

  if (scrollLeft <= mainPaneScrollLeft) {
    if (!hasLeftSidebar || leftSidebarWidthPx <= 0) {
      return 0;
    }
    return Math.min(
      1,
      Math.max(0, (mainPaneScrollLeft - scrollLeft) / leftSidebarWidthPx),
    );
  }

  if (!hasRightSidebar || rightSidebarWidthPx <= 0) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(0, (scrollLeft - mainPaneScrollLeft) / rightSidebarWidthPx),
  );
}

/**
 * Measure one mobile sidebar lane so the shared carousel can snap to concrete
 * pane widths even when the rendered sidebar content changes size.
 */
function useSidebarWidth(
  isMobile: boolean,
  hasSidebar: boolean,
  measureRef: React.RefObject<HTMLDivElement | null>,
) {
  const [widthPx, setWidthPx] = React.useState(0);

  React.useLayoutEffect(() => {
    if (!isMobile || !hasSidebar) {
      setWidthPx(0);
      return;
    }

    const measuredNode = measureRef.current;
    if (!measuredNode) {
      return;
    }

    const updateSidebarWidth = () => {
      setWidthPx(
        Math.max(0, Math.round(measuredNode.getBoundingClientRect().width)),
      );
    };

    updateSidebarWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSidebarWidth);
      return () => window.removeEventListener("resize", updateSidebarWidth);
    }

    const resizeObserver = new ResizeObserver(updateSidebarWidth);
    resizeObserver.observe(measuredNode);
    window.addEventListener("resize", updateSidebarWidth);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateSidebarWidth);
    };
  }, [hasSidebar, isMobile, measureRef]);

  return widthPx;
}

/**
 * Renders one shared workspace shell for desktop and mobile. Desktop reserves
 * up to three columns, while mobile treats the same structure as a horizontal
 * carousel with left, main, and right panes.
 */
export function WorkspaceSidebarShell({
  bodyClassName,
  bodyStyle,
  bodyTestId,
  children,
  dataTestId,
  headerContent,
  headerTestId,
  leftSidebarContent,
  leftSidebarContentTestId,
  leftSidebarHeader,
  leftSidebarHeaderTestId,
  rightSidebarContent,
  rightSidebarContentTestId,
  rightSidebarHeader,
  rightSidebarHeaderTestId,
}: WorkspaceSidebarShellProps) {
  const {
    isMobile,
    leftDesktopOpen,
    mobilePane,
    rightDesktopOpen,
    setMobilePane,
  } = useSidebar();
  const hasLeftSidebarHeader =
    leftSidebarHeader !== undefined && leftSidebarHeader !== null;
  const hasLeftSidebarContent =
    leftSidebarContent !== undefined && leftSidebarContent !== null;
  const hasLeftSidebar = hasLeftSidebarHeader || hasLeftSidebarContent;
  const hasRightSidebarHeader =
    rightSidebarHeader !== undefined && rightSidebarHeader !== null;
  const hasRightSidebarContent =
    rightSidebarContent !== undefined && rightSidebarContent !== null;
  const hasRightSidebar = hasRightSidebarHeader || hasRightSidebarContent;
  const hasAnySidebar = hasLeftSidebar || hasRightSidebar;
  const mobileScrollRef = React.useRef<HTMLDivElement | null>(null);
  const mobileLeftSidebarMeasureRef = React.useRef<HTMLDivElement | null>(null);
  const mobileRightSidebarMeasureRef = React.useRef<HTMLDivElement | null>(
    null,
  );
  const leftSidebarWidthPx = useSidebarWidth(
    isMobile,
    hasLeftSidebar,
    mobileLeftSidebarMeasureRef,
  );
  const rightSidebarWidthPx = useSidebarWidth(
    isMobile,
    hasRightSidebar,
    mobileRightSidebarMeasureRef,
  );
  const [mobileMainScrimProgress, setMobileMainScrimProgress] =
    React.useState(0);
  const hasInitializedMobileScrollRef = React.useRef(false);
  const skipNextMobileScrollSyncRef = React.useRef(false);
  const mobileScrollVelocityRef = React.useRef({
    lastScrollLeft: 0,
    lastTimestampMs: 0,
    peakSwipeVelocityPxPerMs: 0,
  });

  const isMobileLayoutMeasured =
    !isMobile ||
    ((!hasLeftSidebar || leftSidebarWidthPx > 0) &&
      (!hasRightSidebar || rightSidebarWidthPx > 0));

  React.useEffect(() => {
    if (!isMobile || !hasAnySidebar || !isMobileLayoutMeasured) {
      hasInitializedMobileScrollRef.current = false;
      skipNextMobileScrollSyncRef.current = false;
      setMobileMainScrimProgress(0);
      return;
    }

    const scrollNode = mobileScrollRef.current;
    if (!scrollNode) {
      return;
    }

    const targetScrollLeft = getMobilePaneScrollLeft(
      mobilePane,
      hasLeftSidebar,
      leftSidebarWidthPx,
      hasRightSidebar,
      rightSidebarWidthPx,
    );

    if (!hasInitializedMobileScrollRef.current) {
      scrollNode.scrollLeft = targetScrollLeft;
      setMobileMainScrimProgress(
        getMobileMainScrimProgress(
          targetScrollLeft,
          hasLeftSidebar,
          leftSidebarWidthPx,
          hasRightSidebar,
          rightSidebarWidthPx,
        ),
      );
      hasInitializedMobileScrollRef.current = true;
      return;
    }

    if (skipNextMobileScrollSyncRef.current) {
      skipNextMobileScrollSyncRef.current = false;
      return;
    }

    if (Math.abs(scrollNode.scrollLeft - targetScrollLeft) <= 1) {
      setMobileMainScrimProgress(
        getMobileMainScrimProgress(
          scrollNode.scrollLeft,
          hasLeftSidebar,
          leftSidebarWidthPx,
          hasRightSidebar,
          rightSidebarWidthPx,
        ),
      );
      return;
    }

    scrollNode.scrollTo({
      left: targetScrollLeft,
      behavior: "smooth",
    });
  }, [
    hasAnySidebar,
    hasLeftSidebar,
    hasRightSidebar,
    isMobile,
    isMobileLayoutMeasured,
    leftSidebarWidthPx,
    mobilePane,
    rightSidebarWidthPx,
  ]);

  React.useEffect(() => {
    if (!isMobile || !hasAnySidebar || !isMobileLayoutMeasured) {
      return;
    }

    const scrollNode = mobileScrollRef.current;
    if (!scrollNode) {
      return;
    }
    const mobileScrollVelocityState = mobileScrollVelocityRef.current;

    const settleScrollPosition = () => {
      const { peakSwipeVelocityPxPerMs } = mobileScrollVelocityState;
      const nextMobilePane = getSettledMobilePane(
        mobilePane,
        scrollNode.scrollLeft,
        hasLeftSidebar,
        leftSidebarWidthPx,
        hasRightSidebar,
        rightSidebarWidthPx,
        peakSwipeVelocityPxPerMs,
      );

      mobileScrollVelocityState.peakSwipeVelocityPxPerMs = 0;
      mobileScrollVelocityState.lastScrollLeft = scrollNode.scrollLeft;
      mobileScrollVelocityState.lastTimestampMs = 0;
      if (nextMobilePane !== mobilePane) {
        skipNextMobileScrollSyncRef.current = true;
        setMobilePane(nextMobilePane);
      }
    };

    let settleTimeoutId: number | null = null;
    const handleScroll = () => {
      const timestampMs = performance.now();
      const previousScrollSample = mobileScrollVelocityState;
      if (previousScrollSample.lastTimestampMs === 0) {
        mobileScrollVelocityState.lastScrollLeft = scrollNode.scrollLeft;
        mobileScrollVelocityState.lastTimestampMs = timestampMs;
      }
      const elapsedMs = timestampMs - previousScrollSample.lastTimestampMs;

      if (previousScrollSample.lastTimestampMs !== 0 && elapsedMs > 0) {
        const velocityPxPerMs =
          Math.abs(
            scrollNode.scrollLeft - previousScrollSample.lastScrollLeft,
          ) / elapsedMs;
        mobileScrollVelocityState.peakSwipeVelocityPxPerMs = Math.max(
          previousScrollSample.peakSwipeVelocityPxPerMs,
          velocityPxPerMs,
        );
      }

      mobileScrollVelocityState.lastScrollLeft = scrollNode.scrollLeft;
      mobileScrollVelocityState.lastTimestampMs = timestampMs;

      setMobileMainScrimProgress(
        getMobileMainScrimProgress(
          scrollNode.scrollLeft,
          hasLeftSidebar,
          leftSidebarWidthPx,
          hasRightSidebar,
          rightSidebarWidthPx,
        ),
      );

      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }

      settleTimeoutId = window.setTimeout(
        settleScrollPosition,
        MOBILE_SCROLL_SETTLE_DELAY_MS,
      );
    };

    scrollNode.addEventListener("scroll", handleScroll, { passive: true });
    scrollNode.addEventListener("scrollend", settleScrollPosition);
    return () => {
      mobileScrollVelocityState.peakSwipeVelocityPxPerMs = 0;
      mobileScrollVelocityState.lastTimestampMs = 0;
      scrollNode.removeEventListener("scroll", handleScroll);
      scrollNode.removeEventListener("scrollend", settleScrollPosition);
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
    };
  }, [
    hasAnySidebar,
    hasLeftSidebar,
    hasRightSidebar,
    isMobile,
    isMobileLayoutMeasured,
    leftSidebarWidthPx,
    mobilePane,
    rightSidebarWidthPx,
    setMobilePane,
  ]);

  const handleMainViewClickCapture = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!isMobile || mobilePane === "main") {
        return;
      }

      if (
        event.target instanceof Element &&
        event.target.closest('[data-sidebar="trigger"]') !== null
      ) {
        return;
      }

      setMobilePane("main");
    },
    [isMobile, mobilePane, setMobilePane],
  );

  const hiddenLeftDesktopSidebarProps =
    !isMobile && !leftDesktopOpen
      ? {
          "aria-hidden": true as const,
          hidden: true,
        }
      : {};
  const hiddenRightDesktopSidebarProps =
    !isMobile && !rightDesktopOpen
      ? {
          "aria-hidden": true as const,
          hidden: true,
        }
      : {};
  const mobileMainScrimOpacity =
    mobileMainScrimProgress * MOBILE_MAIN_SCRIM_MAX_OPACITY;
  const mobileMainScrimIsInteractive =
    isMobile &&
    hasAnySidebar &&
    mobileMainScrimProgress > MOBILE_MAIN_SCRIM_INTERACTION_THRESHOLD;

  const shellStyle: React.CSSProperties & {
    "--workspace-left-sidebar-width"?: string;
    "--workspace-right-sidebar-width"?: string;
  } = {
    // Keep one shared shell tree everywhere. Mobile pans across the full
    // three-pane track; desktop pins the track and collapses side columns
    // independently.
    gridTemplateColumns: isMobile
      ? "var(--workspace-left-sidebar-width) minmax(0, 1fr) var(--workspace-right-sidebar-width)"
      : `${hasLeftSidebar && leftDesktopOpen ? "var(--workspace-left-sidebar-width)" : "0px"} minmax(0, 1fr) ${hasRightSidebar && rightDesktopOpen ? "var(--workspace-right-sidebar-width)" : "0px"}`,
    gridTemplateRows: "auto minmax(0, 1fr)",
    width:
      isMobile && hasAnySidebar
        ? "calc(100% + var(--workspace-left-sidebar-width) + var(--workspace-right-sidebar-width))"
        : "100%",
    "--workspace-left-sidebar-width": hasLeftSidebar
      ? "var(--sidebar-width)"
      : "0px",
    "--workspace-right-sidebar-width": hasRightSidebar
      ? "var(--sidebar-width)"
      : "0px",
  };

  const leftSidebarCellClassName = cn(
    "min-w-0 overflow-hidden transition-[border-color] duration-200 ease-linear",
    isMobile || leftDesktopOpen
      ? "border-r border-border/50"
      : "pointer-events-none border-r border-transparent",
  );
  const rightSidebarCellClassName = cn(
    "min-w-0 overflow-hidden transition-[border-color] duration-200 ease-linear",
    isMobile || rightDesktopOpen
      ? "border-l border-border/50"
      : "pointer-events-none border-l border-transparent",
  );

  return (
    <div
      ref={isMobile ? mobileScrollRef : undefined}
      data-testid={dataTestId}
      data-sidebar-shell={isMobile ? "mobile" : "desktop"}
      className={cn(
        "h-full w-full min-h-0",
        isMobile
          ? "overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "overflow-hidden",
      )}
    >
      <div
        data-sidebar-track={isMobile ? "pannable" : "static"}
        className={cn(
          "grid h-full min-h-0",
          isMobile
            ? "snap-x snap-mandatory"
            : "transition-[grid-template-columns] duration-200 ease-linear",
        )}
        style={shellStyle}
      >
        {hasLeftSidebarHeader ? (
          <div
            data-testid={leftSidebarHeaderTestId}
            {...hiddenLeftDesktopSidebarProps}
            className={cn(
              leftSidebarCellClassName,
              isMobile ? "snap-start" : "",
            )}
          >
            <div
              ref={
                !hasLeftSidebarContent ? mobileLeftSidebarMeasureRef : undefined
              }
              className="min-w-0 overflow-hidden"
              style={{ width: "var(--workspace-left-sidebar-width)" }}
            >
              {leftSidebarHeader}
            </div>
          </div>
        ) : null}

        {hasLeftSidebarContent ? (
          <div
            data-testid={leftSidebarContentTestId}
            {...hiddenLeftDesktopSidebarProps}
            className={cn(
              leftSidebarCellClassName,
              hasLeftSidebarHeader
                ? "row-start-2 min-h-0"
                : "row-span-2 min-h-0",
              isMobile ? "snap-start" : "",
            )}
          >
            <div
              ref={mobileLeftSidebarMeasureRef}
              className="flex h-full min-h-0 flex-col overflow-hidden"
              style={{ width: "var(--workspace-left-sidebar-width)" }}
            >
              {leftSidebarContent}
            </div>
          </div>
        ) : null}

        <div
          data-testid={headerTestId}
          onClickCapture={handleMainViewClickCapture}
          className={cn(
            "col-start-2 row-start-1 min-w-0 border-b border-border/50",
            isMobile ? "snap-start" : "",
          )}
        >
          {headerContent}
        </div>

        <div
          data-testid={bodyTestId}
          onClickCapture={handleMainViewClickCapture}
          className={cn(
            "col-start-2 row-start-2 min-h-0 min-w-0",
            bodyClassName,
            isMobile ? "snap-start" : "",
          )}
          style={bodyStyle}
        >
          {children}
        </div>

        {hasRightSidebarHeader ? (
          <div
            data-testid={rightSidebarHeaderTestId}
            {...hiddenRightDesktopSidebarProps}
            className={cn(
              "col-start-3",
              rightSidebarCellClassName,
              isMobile ? "snap-start" : "",
            )}
          >
            <div
              ref={
                !hasRightSidebarContent
                  ? mobileRightSidebarMeasureRef
                  : undefined
              }
              className="min-w-0 overflow-hidden"
              style={{ width: "var(--workspace-right-sidebar-width)" }}
            >
              {rightSidebarHeader}
            </div>
          </div>
        ) : null}

        {hasRightSidebarContent ? (
          <div
            data-testid={rightSidebarContentTestId}
            {...hiddenRightDesktopSidebarProps}
            className={cn(
              "col-start-3",
              rightSidebarCellClassName,
              hasRightSidebarHeader
                ? "row-start-2 min-h-0"
                : "row-span-2 min-h-0",
              isMobile ? "snap-start" : "",
            )}
          >
            <div
              ref={mobileRightSidebarMeasureRef}
              className="flex h-full min-h-0 flex-col overflow-hidden"
              style={{ width: "var(--workspace-right-sidebar-width)" }}
            >
              {rightSidebarContent}
            </div>
          </div>
        ) : null}

        {isMobile && hasAnySidebar ? (
          <div
            aria-hidden="true"
            data-testid="workspace-sidebar-main-scrim"
            className={cn(
              "pointer-events-none col-start-2 row-start-1 row-span-2 min-h-0 min-w-0",
              mobileMainScrimIsInteractive ? "z-10" : "",
            )}
          >
            {/* Restrict scrim gestures to horizontal pans so tall main panes like
                FileView do not rubber-band vertically while a sidebar is open. */}
            <div
              className={cn(
                "h-full w-full bg-black transition-opacity duration-200 ease-linear",
                mobileMainScrimIsInteractive
                  ? "pointer-events-auto touch-pan-x"
                  : "pointer-events-none",
              )}
              style={{ opacity: mobileMainScrimOpacity }}
              onClick={() => setMobilePane("main")}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
