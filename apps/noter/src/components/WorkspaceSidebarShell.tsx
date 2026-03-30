import * as React from "react";
import { WorkspaceMobilePaneDragProvider } from "@/components/workspaceMobilePaneDrag";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  getMobilePaneScrollLeft,
  type MobilePaneReleaseGesture,
  getSettledMobilePane,
} from "@/lib/workspaceSidebar";
import { cn } from "@/lib/utils";

const MOBILE_SCROLL_SETTLE_DELAY_MS = 140;
const MOBILE_MAIN_SCRIM_MAX_OPACITY = 0.16;
const MOBILE_MAIN_SCRIM_INTERACTION_THRESHOLD = 0.01;
type SidebarSlot = Exclude<React.ReactNode, undefined>;
const MOBILE_RELEASE_VELOCITY_WINDOW_MS = 80;
const MOBILE_RELEASE_VELOCITY_SAMPLE_RETENTION_MS = 160;

type WorkspaceSidebarShellProps = {
  bodyClassName?: string;
  bodyStyle?: React.CSSProperties;
  bodyTestId?: string;
  children: React.ReactNode;
  dataTestId?: string;
  headerContent: React.ReactNode;
  headerTestId?: string;
  // Callers must always pass explicit slot values so shell layout is driven by
  // deliberate nullability instead of omitted props.
  leftSidebarContent: SidebarSlot;
  leftSidebarContentTestId?: string;
  leftSidebarHeader: SidebarSlot;
  leftSidebarHeaderTestId?: string;
  rightSidebarContent: SidebarSlot;
  rightSidebarContentTestId?: string;
  rightSidebarHeader: SidebarSlot;
  rightSidebarHeaderTestId?: string;
};

type MobileTouchSample = {
  clientX: number;
  timeMs: number;
};

type ActiveMobileTouchGesture = {
  lastClientX: number;
  recentSamples: MobileTouchSample[];
  startClientX: number;
  startPane: MobilePaneReleaseGesture["startPane"];
  touchIdentifier: number;
};

function findTouchByIdentifier(
  touchList: TouchList,
  identifier: number,
): Touch | null {
  for (let index = 0; index < touchList.length; index += 1) {
    const touch = touchList.item(index);
    if (touch?.identifier === identifier) {
      return touch;
    }
  }

  return null;
}

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
  const hasLeftSidebarHeader = leftSidebarHeader !== null;
  const hasLeftSidebarContent = leftSidebarContent !== null;
  const hasLeftSidebar = hasLeftSidebarHeader || hasLeftSidebarContent;
  const hasRightSidebarHeader = rightSidebarHeader !== null;
  const hasRightSidebarContent = rightSidebarContent !== null;
  const hasRightSidebar = hasRightSidebarHeader || hasRightSidebarContent;
  const hasAnySidebar = hasLeftSidebar || hasRightSidebar;
  const mobileScrollRef = React.useRef<HTMLDivElement | null>(null);
  const mobileTrackRef = React.useRef<HTMLDivElement | null>(null);
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
  const isDelegatedMobileDragActiveRef = React.useRef(false);
  const pendingMobileDragFrameRef = React.useRef<number | null>(null);
  const pendingMobileDragScrollLeftRef = React.useRef<number | null>(null);
  const pendingMobileDragSnapRestoreFrameRef = React.useRef<number | null>(
    null,
  );
  const activeMobileTouchGestureRef =
    React.useRef<ActiveMobileTouchGesture | null>(null);
  const pendingMobileReleaseGestureRef =
    React.useRef<MobilePaneReleaseGesture | null>(null);

  const isMobileLayoutMeasured =
    !isMobile ||
    ((!hasLeftSidebar || leftSidebarWidthPx > 0) &&
      (!hasRightSidebar || rightSidebarWidthPx > 0));

  const setDelegatedMobileDragSnapDisabled = React.useCallback(
    (isDisabled: boolean) => {
      if (isDelegatedMobileDragActiveRef.current === isDisabled) {
        return;
      }

      // Apply the snap override immediately from the gesture handler. Waiting
      // for a React re-render lets Chromium snap the shell back to the current
      // pane before the next touchmove arrives.
      const snapType = isDisabled ? "none" : "";
      isDelegatedMobileDragActiveRef.current = isDisabled;
      if (mobileScrollRef.current !== null) {
        mobileScrollRef.current.style.scrollSnapType = snapType;
      }
      if (mobileTrackRef.current !== null) {
        mobileTrackRef.current.style.scrollSnapType = snapType;
      }
    },
    [],
  );

  const clearPendingMobileDragSnapRestore = React.useCallback(() => {
    if (pendingMobileDragSnapRestoreFrameRef.current === null) {
      return;
    }
    window.cancelAnimationFrame(pendingMobileDragSnapRestoreFrameRef.current);
    pendingMobileDragSnapRestoreFrameRef.current = null;
  }, []);

  const scheduleDelegatedMobileDragSnapRestore = React.useCallback(() => {
    clearPendingMobileDragSnapRestore();
    if (!isDelegatedMobileDragActiveRef.current) {
      return;
    }
    pendingMobileDragSnapRestoreFrameRef.current = window.requestAnimationFrame(
      () => {
        pendingMobileDragSnapRestoreFrameRef.current = null;
        setDelegatedMobileDragSnapDisabled(false);
      },
    );
  }, [clearPendingMobileDragSnapRestore, setDelegatedMobileDragSnapDisabled]);

  const appendMobileTouchSample = React.useCallback((clientX: number) => {
    const activeGesture = activeMobileTouchGestureRef.current;
    if (activeGesture === null) {
      return;
    }

    const timeMs = performance.now();
    activeGesture.lastClientX = clientX;
    activeGesture.recentSamples = [
      ...activeGesture.recentSamples,
      { clientX, timeMs },
    ].filter(
      (sample) =>
        timeMs - sample.timeMs <= MOBILE_RELEASE_VELOCITY_SAMPLE_RETENTION_MS,
    );
  }, []);

  const finalizeMobileTouchGesture = React.useCallback((clientX?: number) => {
    const activeGesture = activeMobileTouchGestureRef.current;
    if (activeGesture === null) {
      return;
    }

    const resolvedClientX = clientX ?? activeGesture.lastClientX;
    const timeMs = performance.now();
    const samples = [
      ...activeGesture.recentSamples,
      { clientX: resolvedClientX, timeMs },
    ].filter(
      (sample) =>
        timeMs - sample.timeMs <= MOBILE_RELEASE_VELOCITY_SAMPLE_RETENTION_MS,
    );
    const velocityWindowStartTimeMs =
      timeMs - MOBILE_RELEASE_VELOCITY_WINDOW_MS;
    const oldestVelocitySample =
      samples.find((sample) => sample.timeMs >= velocityWindowStartTimeMs) ??
      samples[0];
    const elapsedMs = Math.max(1, timeMs - oldestVelocitySample.timeMs);

    pendingMobileReleaseGestureRef.current = {
      releaseFingerVelocityXPxPerMs:
        (resolvedClientX - oldestVelocitySample.clientX) / elapsedMs,
      startPane: activeGesture.startPane,
      totalFingerDeltaXPx: resolvedClientX - activeGesture.startClientX,
    };
    activeMobileTouchGestureRef.current = null;
  }, []);

  /**
   * Keep pane settling owned by the shell so descendant surfaces can reuse the
   * current left/main/right anchor model instead of reproducing it locally.
   */
  const settleMobileShell = React.useCallback(() => {
    if (!isMobile || !hasAnySidebar || !isMobileLayoutMeasured) {
      scheduleDelegatedMobileDragSnapRestore();
      return;
    }

    const scrollNode = mobileScrollRef.current;
    if (!scrollNode) {
      scheduleDelegatedMobileDragSnapRestore();
      return;
    }

    const releaseGesture = pendingMobileReleaseGestureRef.current;
    pendingMobileReleaseGestureRef.current = null;
    const nextMobilePane = getSettledMobilePane(
      mobilePane,
      scrollNode.scrollLeft,
      hasLeftSidebar,
      leftSidebarWidthPx,
      hasRightSidebar,
      rightSidebarWidthPx,
      releaseGesture,
    );
    const targetScrollLeft = getMobilePaneScrollLeft(
      nextMobilePane,
      hasLeftSidebar,
      leftSidebarWidthPx,
      hasRightSidebar,
      rightSidebarWidthPx,
    );

    if (nextMobilePane !== mobilePane) {
      skipNextMobileScrollSyncRef.current = true;
      setMobilePane(nextMobilePane);
    }

    if (Math.abs(scrollNode.scrollLeft - targetScrollLeft) <= 1) {
      scheduleDelegatedMobileDragSnapRestore();
      return;
    }

    scrollNode.scrollTo({
      left: targetScrollLeft,
      behavior: "smooth",
    });
    scheduleDelegatedMobileDragSnapRestore();
  }, [
    hasAnySidebar,
    hasLeftSidebar,
    hasRightSidebar,
    isMobile,
    isMobileLayoutMeasured,
    leftSidebarWidthPx,
    mobilePane,
    rightSidebarWidthPx,
    scheduleDelegatedMobileDragSnapRestore,
    setMobilePane,
  ]);

  const dragMobileShellBy = React.useCallback(
    (pointerDeltaX: number) => {
      if (!isMobile || !hasAnySidebar || !isMobileLayoutMeasured) {
        return false;
      }

      const scrollNode = mobileScrollRef.current;
      if (!scrollNode) {
        return false;
      }

      const maxScrollLeft = getMobilePaneScrollLeft(
        hasRightSidebar ? "right" : "main",
        hasLeftSidebar,
        leftSidebarWidthPx,
        hasRightSidebar,
        rightSidebarWidthPx,
      );
      const nextScrollLeft = Math.min(
        maxScrollLeft,
        Math.max(0, scrollNode.scrollLeft - pointerDeltaX),
      );

      if (Math.abs(nextScrollLeft - scrollNode.scrollLeft) <= 0.5) {
        return false;
      }

      clearPendingMobileDragSnapRestore();
      setDelegatedMobileDragSnapDisabled(true);
      if (pendingMobileDragFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingMobileDragFrameRef.current);
        pendingMobileDragFrameRef.current = null;
      }

      pendingMobileDragScrollLeftRef.current = nextScrollLeft;
      scrollNode.scrollLeft = nextScrollLeft;

      if (Math.abs(scrollNode.scrollLeft - nextScrollLeft) > 0.5) {
        pendingMobileDragFrameRef.current = window.requestAnimationFrame(() => {
          pendingMobileDragFrameRef.current = null;
          const pendingScrollLeft = pendingMobileDragScrollLeftRef.current;
          pendingMobileDragScrollLeftRef.current = null;
          if (pendingScrollLeft === null) {
            return;
          }

          const pendingScrollNode = mobileScrollRef.current;
          if (!pendingScrollNode) {
            return;
          }

          pendingScrollNode.scrollLeft = pendingScrollLeft;
          setMobileMainScrimProgress(
            getMobileMainScrimProgress(
              pendingScrollLeft,
              hasLeftSidebar,
              leftSidebarWidthPx,
              hasRightSidebar,
              rightSidebarWidthPx,
            ),
          );
        });
        return true;
      }

      pendingMobileDragScrollLeftRef.current = null;
      setMobileMainScrimProgress(
        getMobileMainScrimProgress(
          nextScrollLeft,
          hasLeftSidebar,
          leftSidebarWidthPx,
          hasRightSidebar,
          rightSidebarWidthPx,
        ),
      );
      return true;
    },
    [
      hasAnySidebar,
      hasLeftSidebar,
      hasRightSidebar,
      isMobile,
      isMobileLayoutMeasured,
      clearPendingMobileDragSnapRestore,
      leftSidebarWidthPx,
      rightSidebarWidthPx,
      setDelegatedMobileDragSnapDisabled,
    ],
  );

  const mobilePaneDragContextValue = React.useMemo(
    () => ({
      dragMobileShellBy,
      isAvailable: isMobile && hasAnySidebar && isMobileLayoutMeasured,
      isMainPaneActive: mobilePane === "main",
      settleMobileShell,
    }),
    [
      dragMobileShellBy,
      hasAnySidebar,
      isMobile,
      isMobileLayoutMeasured,
      mobilePane,
      settleMobileShell,
    ],
  );

  React.useEffect(() => {
    return () => {
      if (pendingMobileDragFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingMobileDragFrameRef.current);
        pendingMobileDragFrameRef.current = null;
      }
      if (pendingMobileDragSnapRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(
          pendingMobileDragSnapRestoreFrameRef.current,
        );
        pendingMobileDragSnapRestoreFrameRef.current = null;
      }
      pendingMobileDragScrollLeftRef.current = null;
      activeMobileTouchGestureRef.current = null;
      pendingMobileReleaseGestureRef.current = null;
      setDelegatedMobileDragSnapDisabled(false);
    };
  }, [setDelegatedMobileDragSnapDisabled]);

  React.useEffect(() => {
    if (!isMobile || !hasAnySidebar || !isMobileLayoutMeasured) {
      hasInitializedMobileScrollRef.current = false;
      skipNextMobileScrollSyncRef.current = false;
      activeMobileTouchGestureRef.current = null;
      pendingMobileReleaseGestureRef.current = null;
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

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        activeMobileTouchGestureRef.current = null;
        return;
      }

      const touch = event.touches.item(0);
      if (touch === null) {
        return;
      }

      const timeMs = performance.now();
      activeMobileTouchGestureRef.current = {
        lastClientX: touch.clientX,
        recentSamples: [{ clientX: touch.clientX, timeMs }],
        startClientX: touch.clientX,
        startPane: mobilePane,
        touchIdentifier: touch.identifier,
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      const activeGesture = activeMobileTouchGestureRef.current;
      if (activeGesture === null) {
        return;
      }

      const touch = findTouchByIdentifier(
        event.touches,
        activeGesture.touchIdentifier,
      );
      if (touch === null) {
        return;
      }

      appendMobileTouchSample(touch.clientX);
    };

    const finishTouchGesture = (event: TouchEvent) => {
      const activeGesture = activeMobileTouchGestureRef.current;
      if (activeGesture === null) {
        return;
      }

      const touch =
        findTouchByIdentifier(
          event.changedTouches,
          activeGesture.touchIdentifier,
        ) ??
        findTouchByIdentifier(event.touches, activeGesture.touchIdentifier);
      finalizeMobileTouchGesture(touch?.clientX);
    };

    scrollNode.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    scrollNode.addEventListener("touchmove", handleTouchMove, {
      passive: true,
    });
    scrollNode.addEventListener("touchend", finishTouchGesture, {
      passive: true,
    });
    scrollNode.addEventListener("touchcancel", finishTouchGesture, {
      passive: true,
    });
    return () => {
      scrollNode.removeEventListener("touchstart", handleTouchStart);
      scrollNode.removeEventListener("touchmove", handleTouchMove);
      scrollNode.removeEventListener("touchend", finishTouchGesture);
      scrollNode.removeEventListener("touchcancel", finishTouchGesture);
    };
  }, [
    appendMobileTouchSample,
    finalizeMobileTouchGesture,
    hasAnySidebar,
    isMobile,
    isMobileLayoutMeasured,
    mobilePane,
  ]);

  React.useEffect(() => {
    if (!isMobile || !hasAnySidebar || !isMobileLayoutMeasured) {
      return;
    }

    const scrollNode = mobileScrollRef.current;
    if (!scrollNode) {
      return;
    }

    // Browsers that already emit `scrollend` should own the native swipe
    // finish signal. The timeout fallback exists only for older engines that
    // never dispatch that event.
    const supportsScrollEnd = "onscrollend" in scrollNode;
    let settleTimeoutId: number | null = null;
    const handleScroll = () => {
      setMobileMainScrimProgress(
        getMobileMainScrimProgress(
          scrollNode.scrollLeft,
          hasLeftSidebar,
          leftSidebarWidthPx,
          hasRightSidebar,
          rightSidebarWidthPx,
        ),
      );

      if (!supportsScrollEnd) {
        if (settleTimeoutId !== null) {
          window.clearTimeout(settleTimeoutId);
        }

        settleTimeoutId = window.setTimeout(
          settleMobileShell,
          MOBILE_SCROLL_SETTLE_DELAY_MS,
        );
      }
    };

    scrollNode.addEventListener("scroll", handleScroll, { passive: true });
    if (supportsScrollEnd) {
      scrollNode.addEventListener("scrollend", settleMobileShell);
    }
    return () => {
      scrollNode.removeEventListener("scroll", handleScroll);
      if (supportsScrollEnd) {
        scrollNode.removeEventListener("scrollend", settleMobileShell);
      }
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
    rightSidebarWidthPx,
    settleMobileShell,
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
  // Reserve a real sidebar header row even when a route leaves that zone empty
  // so the shell keeps one aligned header/content grid across all three columns.
  const emptySidebarHeaderClassName =
    "h-full min-h-0 border-b border-border/50 bg-background";
  /**
   * Keep each mobile pane as a hard snap stop so the shell's `snap-x
   * snap-mandatory` track still settles through one full pane at a time.
   */
  const mobileSnapCellClassName = isMobile ? "snap-start snap-always" : "";

  return (
    <WorkspaceMobilePaneDragProvider value={mobilePaneDragContextValue}>
      <div
        ref={isMobile ? mobileScrollRef : undefined}
        data-testid={dataTestId}
        data-mobile-pane={isMobile ? mobilePane : undefined}
        data-sidebar-shell={isMobile ? "mobile" : "desktop"}
        className={cn(
          "h-full w-full min-h-0",
          isMobile
            ? "overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "overflow-hidden",
        )}
      >
        <div
          ref={mobileTrackRef}
          data-sidebar-track={isMobile ? "pannable" : "static"}
          className={cn(
            "grid h-full min-h-0",
            isMobile
              ? "snap-x snap-mandatory"
              : "transition-[grid-template-columns] duration-200 ease-linear",
          )}
          style={shellStyle}
        >
          {hasLeftSidebar ? (
            <div
              data-testid={leftSidebarHeaderTestId}
              {...hiddenLeftDesktopSidebarProps}
              className={cn(leftSidebarCellClassName, mobileSnapCellClassName)}
            >
              <div
                ref={
                  !hasLeftSidebarContent
                    ? mobileLeftSidebarMeasureRef
                    : undefined
                }
                className="h-full min-h-0 min-w-0 overflow-hidden"
                style={{ width: "var(--workspace-left-sidebar-width)" }}
              >
                {hasLeftSidebarHeader ? (
                  leftSidebarHeader
                ) : (
                  <div
                    aria-hidden="true"
                    className={emptySidebarHeaderClassName}
                  />
                )}
              </div>
            </div>
          ) : null}

          {hasLeftSidebarContent ? (
            <div
              data-testid={leftSidebarContentTestId}
              {...hiddenLeftDesktopSidebarProps}
              className={cn(
                leftSidebarCellClassName,
                "row-start-2 min-h-0",
                mobileSnapCellClassName,
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
              mobileSnapCellClassName,
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
              mobileSnapCellClassName,
            )}
            style={bodyStyle}
          >
            {children}
          </div>

          {hasRightSidebar ? (
            <div
              data-testid={rightSidebarHeaderTestId}
              {...hiddenRightDesktopSidebarProps}
              className={cn(
                "col-start-3",
                rightSidebarCellClassName,
                mobileSnapCellClassName,
              )}
            >
              <div
                ref={
                  !hasRightSidebarContent
                    ? mobileRightSidebarMeasureRef
                    : undefined
                }
                className="h-full min-h-0 min-w-0 overflow-hidden"
                style={{ width: "var(--workspace-right-sidebar-width)" }}
              >
                {hasRightSidebarHeader ? (
                  rightSidebarHeader
                ) : (
                  <div
                    aria-hidden="true"
                    className={emptySidebarHeaderClassName}
                  />
                )}
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
                "row-start-2 min-h-0",
                mobileSnapCellClassName,
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
    </WorkspaceMobilePaneDragProvider>
  );
}
