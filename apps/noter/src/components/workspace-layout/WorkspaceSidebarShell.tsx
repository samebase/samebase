import * as React from "react";
import { MobileSidebarGestureDebugOverlay } from "@/components/MobileSidebarGestureDebugOverlay";
import { WorkspaceSidebarResizeHandle } from "@/components/workspace-layout/WorkspaceSidebarResizeHandle";
import { WorkspaceMobilePaneDragProvider } from "@/components/workspace-layout/workspaceMobilePaneDrag";
import { type SidebarSide, useSidebar } from "@/hooks/use-sidebar";
import {
  buildMobileSidebarGestureDebugSnapshot,
  isMobileSidebarDebugEnabled,
  type MobileSidebarGestureDebugPoint,
  type MobileSidebarGestureDebugSnapshot,
} from "@/lib/mobileSidebarGestureDebug";
import {
  MOBILE_CROSS_SWIPE_TRAVEL_THRESHOLD_RATIO,
  MOBILE_CROSS_SWIPE_VELOCITY_THRESHOLD_PX_PER_MS,
  getMobilePaneScrollLeft,
  type MobilePaneReleaseGesture,
  getSettledMobilePane,
} from "@/lib/workspaceSidebar";
import {
  clampWorkspaceDesktopSidebarWidthPx,
  clampWorkspaceMobileSidebarWidthPx,
  getWorkspaceDesktopSidebarWidthRange,
  getWorkspaceMobileSidebarWidthRange,
  MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
  MIN_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
  MIN_WORKSPACE_MOBILE_SIDEBAR_WIDTH_PX,
  resolveWorkspaceDesktopSidebarWidths,
} from "@/lib/workspacePaneSizes";
import { cn } from "@/lib/utils";

const MOBILE_SCROLL_SETTLE_DELAY_MS = 140;
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
  clientY: number;
  localX: number;
  localY: number;
  timeMs: number;
};

type ActiveMobileTouchGesture = {
  lastClientX: number;
  lastClientY: number;
  pathPoints: MobileSidebarGestureDebugPoint[];
  recentSamples: MobileTouchSample[];
  startClientX: number;
  startScrollLeft: number;
  startPane: MobilePaneReleaseGesture["startPane"];
  touchIdentifier: number;
};

function getLocalTouchPoint(
  node: HTMLElement,
  clientX: number,
  clientY: number,
): Pick<MobileTouchSample, "localX" | "localY"> {
  const nodeBounds = node.getBoundingClientRect();
  return {
    localX: clientX - nodeBounds.left,
    localY: clientY - nodeBounds.top,
  };
}

function clampClientPointToViewport(clientX: number, clientY: number) {
  return {
    clientX: Math.min(Math.max(clientX, 0), window.innerWidth),
    clientY: Math.min(Math.max(clientY, 0), window.innerHeight),
  };
}

function isPointOutsideViewport(clientX: number, clientY: number) {
  return (
    clientX < 0 ||
    clientX > window.innerWidth ||
    clientY < 0 ||
    clientY > window.innerHeight
  );
}

function buildMobileTouchSample(
  node: HTMLElement,
  touch: Touch,
  timeMs: number,
): MobileTouchSample {
  const { clientX: clampedClientX, clientY: clampedClientY } =
    clampClientPointToViewport(touch.clientX, touch.clientY);
  const { localX, localY } = getLocalTouchPoint(
    node,
    clampedClientX,
    clampedClientY,
  );
  return {
    clientX: clampedClientX,
    clientY: clampedClientY,
    localX,
    localY,
    timeMs,
  };
}

function getCrossSwipeDebugMetrics(args: {
  hasLeftSidebar: boolean;
  hasRightSidebar: boolean;
  leftSidebarWidthPx: number;
  releaseGesture: MobilePaneReleaseGesture;
  rightSidebarWidthPx: number;
}) {
  if (
    args.releaseGesture.startPane === "main" ||
    !args.hasLeftSidebar ||
    !args.hasRightSidebar
  ) {
    return {
      crossSwipeRequiredTravelPx: null,
      crossSwipeTravelTowardOppositePx: null,
      crossSwipeVelocityThresholdPxPerMs: null,
      crossSwipeVelocityTowardOppositePxPerMs: null,
    };
  }

  const crossSwipeRequiredTravelPx =
    (args.releaseGesture.startPane === "left"
      ? args.rightSidebarWidthPx
      : args.leftSidebarWidthPx) * MOBILE_CROSS_SWIPE_TRAVEL_THRESHOLD_RATIO;
  const crossSwipeTravelTowardOppositePx =
    args.releaseGesture.startPane === "left"
      ? -args.releaseGesture.totalFingerDeltaXPx
      : args.releaseGesture.totalFingerDeltaXPx;
  const crossSwipeVelocityTowardOppositePxPerMs =
    args.releaseGesture.startPane === "left"
      ? -args.releaseGesture.releaseFingerVelocityXPxPerMs
      : args.releaseGesture.releaseFingerVelocityXPxPerMs;

  return {
    crossSwipeRequiredTravelPx,
    crossSwipeTravelTowardOppositePx,
    crossSwipeVelocityThresholdPxPerMs:
      MOBILE_CROSS_SWIPE_VELOCITY_THRESHOLD_PX_PER_MS,
    crossSwipeVelocityTowardOppositePxPerMs,
  };
}

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

function getEventTimeMs(event: Event): number {
  return typeof event.timeStamp === "number"
    ? event.timeStamp
    : performance.now();
}

function getReleaseVelocityReferenceSample(
  samples: readonly MobileTouchSample[],
  resolvedSample: MobileTouchSample,
) {
  const releaseWindowStartTimeMs =
    resolvedSample.timeMs - MOBILE_RELEASE_VELOCITY_WINDOW_MS;
  const releaseWindowSamples = samples.filter(
    (recentSample) => recentSample.timeMs >= releaseWindowStartTimeMs,
  );
  const hasMeaningfulMovement = (candidateSample: MobileTouchSample) =>
    Math.abs(resolvedSample.clientX - candidateSample.clientX) > 0.5 ||
    Math.abs(resolvedSample.clientY - candidateSample.clientY) > 0.5;

  return (
    releaseWindowSamples.find(hasMeaningfulMovement) ??
    [...samples].reverse().find(hasMeaningfulMovement) ??
    samples[0]
  );
}

/** Keep layout math tied to the rendered shell width on both desktop and mobile. */
function useElementWidth(measureRef: React.RefObject<HTMLElement | null>) {
  const [widthPx, setWidthPx] = React.useState(0);

  React.useLayoutEffect(() => {
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
  }, [measureRef]);

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
    leftDesktopWidthPx,
    leftMobileWidthPx,
    mobilePane,
    rightDesktopOpen,
    rightDesktopWidthPx,
    rightMobileWidthPx,
    setLeftDesktopWidthPx,
    setLeftMobileWidthPx,
    setMobilePane,
    setRightDesktopWidthPx,
    setRightMobileWidthPx,
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
  const shellViewportWidthPx = useElementWidth(mobileScrollRef);
  const [activeResizeHandleSide, setActiveResizeHandleSide] =
    React.useState<SidebarSide | null>(null);
  const resolvedDesktopSidebarWidths =
    shellViewportWidthPx > 0
      ? resolveWorkspaceDesktopSidebarWidths({
          containerWidthPx: shellViewportWidthPx,
          leftOpen: hasLeftSidebar && leftDesktopOpen,
          leftWidthPx: leftDesktopWidthPx,
          rightOpen: hasRightSidebar && rightDesktopOpen,
          rightWidthPx: rightDesktopWidthPx,
        })
      : {
          leftWidthPx:
            hasLeftSidebar && leftDesktopOpen ? leftDesktopWidthPx : 0,
          rightWidthPx:
            hasRightSidebar && rightDesktopOpen ? rightDesktopWidthPx : 0,
        };
  const resolvedLeftMobileSidebarWidthPx =
    hasLeftSidebar && shellViewportWidthPx > 0
      ? clampWorkspaceMobileSidebarWidthPx(
          leftMobileWidthPx,
          shellViewportWidthPx,
        )
      : hasLeftSidebar
        ? leftMobileWidthPx
        : 0;
  const resolvedRightMobileSidebarWidthPx =
    hasRightSidebar && shellViewportWidthPx > 0
      ? clampWorkspaceMobileSidebarWidthPx(
          rightMobileWidthPx,
          shellViewportWidthPx,
        )
      : hasRightSidebar
        ? rightMobileWidthPx
        : 0;
  const leftSidebarWidthPx = isMobile
    ? resolvedLeftMobileSidebarWidthPx
    : resolvedDesktopSidebarWidths.leftWidthPx;
  const rightSidebarWidthPx = isMobile
    ? resolvedRightMobileSidebarWidthPx
    : resolvedDesktopSidebarWidths.rightWidthPx;
  const leftSidebarResizeRange = isMobile
    ? shellViewportWidthPx > 0
      ? getWorkspaceMobileSidebarWidthRange(shellViewportWidthPx)
      : {
          maxWidthPx: MIN_WORKSPACE_MOBILE_SIDEBAR_WIDTH_PX,
          minWidthPx: MIN_WORKSPACE_MOBILE_SIDEBAR_WIDTH_PX,
        }
    : shellViewportWidthPx > 0
      ? getWorkspaceDesktopSidebarWidthRange(
          shellViewportWidthPx,
          hasRightSidebar && rightDesktopOpen
            ? resolvedDesktopSidebarWidths.rightWidthPx
            : 0,
        )
      : {
          maxWidthPx: MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
          minWidthPx: MIN_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
        };
  const rightSidebarResizeRange = isMobile
    ? shellViewportWidthPx > 0
      ? getWorkspaceMobileSidebarWidthRange(shellViewportWidthPx)
      : {
          maxWidthPx: MIN_WORKSPACE_MOBILE_SIDEBAR_WIDTH_PX,
          minWidthPx: MIN_WORKSPACE_MOBILE_SIDEBAR_WIDTH_PX,
        }
    : shellViewportWidthPx > 0
      ? getWorkspaceDesktopSidebarWidthRange(
          shellViewportWidthPx,
          hasLeftSidebar && leftDesktopOpen
            ? resolvedDesktopSidebarWidths.leftWidthPx
            : 0,
        )
      : {
          maxWidthPx: MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
          minWidthPx: MIN_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
        };
  const desktopMainPaneWidthPx =
    shellViewportWidthPx > 0
      ? Math.max(
          0,
          shellViewportWidthPx - leftSidebarWidthPx - rightSidebarWidthPx,
        )
      : 0;
  const mainPaneWidthPx = isMobile
    ? shellViewportWidthPx
    : desktopMainPaneWidthPx;
  const leftResizeHandlePositionPx = leftSidebarWidthPx;
  const rightResizeHandlePositionPx = leftSidebarWidthPx + mainPaneWidthPx;
  const isSidebarResizeActive = activeResizeHandleSide !== null;
  const showLeftResizeHandle =
    shellViewportWidthPx > 0 &&
    hasLeftSidebar &&
    (isMobile ? mobilePane === "left" : leftDesktopOpen);
  const showRightResizeHandle =
    shellViewportWidthPx > 0 &&
    hasRightSidebar &&
    (isMobile ? mobilePane === "right" : rightDesktopOpen);
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
  const pendingMobileGestureDebugRef =
    React.useRef<MobileSidebarGestureDebugSnapshot | null>(null);
  const [mobileGestureDebugSnapshot, setMobileGestureDebugSnapshot] =
    React.useState<MobileSidebarGestureDebugSnapshot | null>(null);
  const mobileSidebarDebugEnabled =
    typeof window !== "undefined" &&
    isMobileSidebarDebugEnabled(window.location.search) &&
    (import.meta.env.DEV ||
      window.location.pathname === "/visual-fixture.html");

  const isMobileLayoutMeasured = !isMobile || shellViewportWidthPx > 0;

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

  const handleSidebarResizeStart = React.useCallback(
    (side: SidebarSide) => {
      setActiveResizeHandleSide(side);
      if (!isMobile) {
        return;
      }

      clearPendingMobileDragSnapRestore();
      setDelegatedMobileDragSnapDisabled(true);
    },
    [
      clearPendingMobileDragSnapRestore,
      isMobile,
      setDelegatedMobileDragSnapDisabled,
    ],
  );

  const handleSidebarResizeEnd = React.useCallback(() => {
    setActiveResizeHandleSide(null);
    if (!isMobile) {
      return;
    }

    scheduleDelegatedMobileDragSnapRestore();
  }, [isMobile, scheduleDelegatedMobileDragSnapRestore]);

  const handleLeftSidebarWidthChange = React.useCallback(
    (nextWidthPx: number) => {
      if (isMobile) {
        const clampedWidthPx =
          shellViewportWidthPx > 0
            ? clampWorkspaceMobileSidebarWidthPx(
                nextWidthPx,
                shellViewportWidthPx,
              )
            : Math.max(0, Math.round(nextWidthPx));
        setLeftMobileWidthPx(clampedWidthPx);
        return;
      }

      const clampedWidthPx =
        shellViewportWidthPx > 0
          ? clampWorkspaceDesktopSidebarWidthPx(
              nextWidthPx,
              shellViewportWidthPx,
              hasRightSidebar && rightDesktopOpen
                ? resolvedDesktopSidebarWidths.rightWidthPx
                : 0,
            )
          : Math.max(0, Math.round(nextWidthPx));
      setLeftDesktopWidthPx(clampedWidthPx);
    },
    [
      hasRightSidebar,
      isMobile,
      resolvedDesktopSidebarWidths.rightWidthPx,
      rightDesktopOpen,
      setLeftDesktopWidthPx,
      setLeftMobileWidthPx,
      shellViewportWidthPx,
    ],
  );

  const handleRightSidebarWidthChange = React.useCallback(
    (nextWidthPx: number) => {
      if (isMobile) {
        const clampedWidthPx =
          shellViewportWidthPx > 0
            ? clampWorkspaceMobileSidebarWidthPx(
                nextWidthPx,
                shellViewportWidthPx,
              )
            : Math.max(0, Math.round(nextWidthPx));
        setRightMobileWidthPx(clampedWidthPx);
        return;
      }

      const clampedWidthPx =
        shellViewportWidthPx > 0
          ? clampWorkspaceDesktopSidebarWidthPx(
              nextWidthPx,
              shellViewportWidthPx,
              hasLeftSidebar && leftDesktopOpen
                ? resolvedDesktopSidebarWidths.leftWidthPx
                : 0,
            )
          : Math.max(0, Math.round(nextWidthPx));
      setRightDesktopWidthPx(clampedWidthPx);
    },
    [
      hasLeftSidebar,
      isMobile,
      leftDesktopOpen,
      resolvedDesktopSidebarWidths.leftWidthPx,
      setRightDesktopWidthPx,
      setRightMobileWidthPx,
      shellViewportWidthPx,
    ],
  );

  const appendMobileTouchSample = React.useCallback(
    (sample: MobileTouchSample) => {
      const activeGesture = activeMobileTouchGestureRef.current;
      if (activeGesture === null) {
        return;
      }

      activeGesture.lastClientX = sample.clientX;
      activeGesture.lastClientY = sample.clientY;
      activeGesture.recentSamples = [
        ...activeGesture.recentSamples,
        sample,
      ].filter(
        (recentSample) =>
          sample.timeMs - recentSample.timeMs <=
          MOBILE_RELEASE_VELOCITY_SAMPLE_RETENTION_MS,
      );

      if (!mobileSidebarDebugEnabled) {
        return;
      }

      activeGesture.pathPoints = [...activeGesture.pathPoints, sample];
      const activeSnapshot = buildMobileSidebarGestureDebugSnapshot({
        isActive: true,
        pathPoints: activeGesture.pathPoints,
        startPane: activeGesture.startPane,
      });
      pendingMobileGestureDebugRef.current = activeSnapshot;
      setMobileGestureDebugSnapshot(activeSnapshot);
    },
    [mobileSidebarDebugEnabled],
  );

  const finalizeMobileTouchGesture = React.useCallback(
    (sample?: MobileTouchSample) => {
      const activeGesture = activeMobileTouchGestureRef.current;
      if (activeGesture === null) {
        return;
      }

      const resolvedSample = sample ?? {
        clientX: activeGesture.lastClientX,
        clientY: activeGesture.lastClientY,
        localX: activeGesture.pathPoints.at(-1)?.localX ?? 0,
        localY: activeGesture.pathPoints.at(-1)?.localY ?? 0,
        timeMs: performance.now(),
      };
      const samples = [...activeGesture.recentSamples, resolvedSample].filter(
        (recentSample) =>
          resolvedSample.timeMs - recentSample.timeMs <=
          MOBILE_RELEASE_VELOCITY_SAMPLE_RETENTION_MS,
      );
      const oldestVelocitySample = getReleaseVelocityReferenceSample(
        samples,
        resolvedSample,
      );
      const elapsedMs = Math.max(
        1,
        resolvedSample.timeMs - oldestVelocitySample.timeMs,
      );

      const releaseGesture: MobilePaneReleaseGesture = {
        releaseFingerVelocityXPxPerMs:
          (resolvedSample.clientX - oldestVelocitySample.clientX) / elapsedMs,
        startPane: activeGesture.startPane,
        totalFingerDeltaXPx:
          resolvedSample.clientX - activeGesture.startClientX,
      };
      const crossSwipeDebugMetrics = getCrossSwipeDebugMetrics({
        hasLeftSidebar,
        hasRightSidebar,
        leftSidebarWidthPx,
        releaseGesture,
        rightSidebarWidthPx,
      });

      pendingMobileReleaseGestureRef.current = releaseGesture;
      if (mobileSidebarDebugEnabled) {
        const pathPoints =
          activeGesture.pathPoints.at(-1)?.timeMs === resolvedSample.timeMs &&
          activeGesture.pathPoints.at(-1)?.localX === resolvedSample.localX &&
          activeGesture.pathPoints.at(-1)?.localY === resolvedSample.localY
            ? activeGesture.pathPoints
            : [...activeGesture.pathPoints, resolvedSample];
        const completedSnapshot = buildMobileSidebarGestureDebugSnapshot({
          ...crossSwipeDebugMetrics,
          isActive: false,
          pathPoints,
          releaseGesture,
          startPane: activeGesture.startPane,
        });
        pendingMobileGestureDebugRef.current = completedSnapshot;
        setMobileGestureDebugSnapshot(completedSnapshot);
      }

      activeMobileTouchGestureRef.current = null;
    },
    [
      hasLeftSidebar,
      hasRightSidebar,
      leftSidebarWidthPx,
      mobileSidebarDebugEnabled,
      rightSidebarWidthPx,
    ],
  );

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
    const nearestPaneAtSettle = getSettledMobilePane(
      "main",
      scrollNode.scrollLeft,
      hasLeftSidebar,
      leftSidebarWidthPx,
      hasRightSidebar,
      rightSidebarWidthPx,
    );
    const debugSnapshot = pendingMobileGestureDebugRef.current;
    if (debugSnapshot !== null) {
      const releasePromotedToOpposite =
        nearestPaneAtSettle !== nextMobilePane && nextMobilePane !== "main";
      const settledSnapshot = {
        ...debugSnapshot,
        nearestPaneAtSettle,
        releasePromotedToOpposite,
        settledPane: nextMobilePane,
      };
      pendingMobileGestureDebugRef.current = settledSnapshot;
      setMobileGestureDebugSnapshot(settledSnapshot);
    }
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
        });
        return true;
      }

      pendingMobileDragScrollLeftRef.current = null;
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
      settleMobileShell,
    }),
    [
      dragMobileShellBy,
      hasAnySidebar,
      isMobile,
      isMobileLayoutMeasured,
      settleMobileShell,
    ],
  );

  React.useLayoutEffect(() => {
    if (
      !isMobile ||
      !isSidebarResizeActive ||
      !hasAnySidebar ||
      !isMobileLayoutMeasured
    ) {
      return;
    }

    const scrollNode = mobileScrollRef.current;
    if (scrollNode === null) {
      return;
    }

    scrollNode.scrollLeft = getMobilePaneScrollLeft(
      mobilePane,
      hasLeftSidebar,
      leftSidebarWidthPx,
      hasRightSidebar,
      rightSidebarWidthPx,
    );
  }, [
    hasAnySidebar,
    hasLeftSidebar,
    hasRightSidebar,
    isMobile,
    isMobileLayoutMeasured,
    isSidebarResizeActive,
    leftSidebarWidthPx,
    mobilePane,
    rightSidebarWidthPx,
  ]);

  React.useEffect(() => {
    if (mobileSidebarDebugEnabled) {
      return;
    }

    pendingMobileGestureDebugRef.current = null;
    setMobileGestureDebugSnapshot(null);
  }, [mobileSidebarDebugEnabled]);

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
      pendingMobileGestureDebugRef.current = null;
      setDelegatedMobileDragSnapDisabled(false);
    };
  }, [setDelegatedMobileDragSnapDisabled]);

  React.useEffect(() => {
    if (!isMobile || !hasAnySidebar || !isMobileLayoutMeasured) {
      hasInitializedMobileScrollRef.current = false;
      skipNextMobileScrollSyncRef.current = false;
      activeMobileTouchGestureRef.current = null;
      pendingMobileReleaseGestureRef.current = null;
      pendingMobileGestureDebugRef.current = null;
      setMobileGestureDebugSnapshot(null);
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
      hasInitializedMobileScrollRef.current = true;
      return;
    }

    if (skipNextMobileScrollSyncRef.current) {
      skipNextMobileScrollSyncRef.current = false;
      return;
    }

    if (Math.abs(scrollNode.scrollLeft - targetScrollLeft) <= 1) {
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
      if (
        event.target instanceof Element &&
        event.target.closest("[data-sidebar-resize-handle]") !== null
      ) {
        activeMobileTouchGestureRef.current = null;
        scheduleDelegatedMobileDragSnapRestore();
        return;
      }

      if (event.touches.length !== 1) {
        activeMobileTouchGestureRef.current = null;
        scheduleDelegatedMobileDragSnapRestore();
        return;
      }

      const touch = event.touches.item(0);
      if (touch === null) {
        return;
      }

      const timeMs = getEventTimeMs(event);
      const initialSample = buildMobileTouchSample(scrollNode, touch, timeMs);
      activeMobileTouchGestureRef.current = {
        lastClientX: initialSample.clientX,
        lastClientY: initialSample.clientY,
        pathPoints: [initialSample],
        recentSamples: [initialSample],
        startClientX: initialSample.clientX,
        startScrollLeft: scrollNode.scrollLeft,
        startPane: mobilePane,
        touchIdentifier: touch.identifier,
      };
      pendingMobileReleaseGestureRef.current = null;
      // Keep snap disabled for the whole touch lifetime so native shell
      // scrolling does not bounce back toward the current pane between samples.
      clearPendingMobileDragSnapRestore();
      setDelegatedMobileDragSnapDisabled(true);

      if (!mobileSidebarDebugEnabled) {
        return;
      }

      const activeSnapshot = buildMobileSidebarGestureDebugSnapshot({
        isActive: true,
        pathPoints: [initialSample],
        startPane: mobilePane,
      });
      pendingMobileGestureDebugRef.current = activeSnapshot;
      setMobileGestureDebugSnapshot(activeSnapshot);
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

      if (isPointOutsideViewport(touch.clientX, touch.clientY)) {
        if (
          Math.abs(scrollNode.scrollLeft - activeGesture.startScrollLeft) <= 1
        ) {
          activeMobileTouchGestureRef.current = null;
          pendingMobileReleaseGestureRef.current = null;
          pendingMobileGestureDebugRef.current = null;
          setMobileGestureDebugSnapshot(null);
          scheduleDelegatedMobileDragSnapRestore();
          return;
        }

        finalizeMobileTouchGesture(
          buildMobileTouchSample(scrollNode, touch, getEventTimeMs(event)),
        );
        return;
      }

      appendMobileTouchSample(
        buildMobileTouchSample(scrollNode, touch, getEventTimeMs(event)),
      );
    };

    const finishTouchGesture = (event: TouchEvent) => {
      const activeGesture = activeMobileTouchGestureRef.current;
      if (activeGesture === null) {
        return;
      }

      if (
        Math.abs(scrollNode.scrollLeft - activeGesture.startScrollLeft) <= 1
      ) {
        activeMobileTouchGestureRef.current = null;
        pendingMobileReleaseGestureRef.current = null;
        pendingMobileGestureDebugRef.current = null;
        setMobileGestureDebugSnapshot(null);
        scheduleDelegatedMobileDragSnapRestore();
        return;
      }

      const touch =
        findTouchByIdentifier(
          event.changedTouches,
          activeGesture.touchIdentifier,
        ) ??
        findTouchByIdentifier(event.touches, activeGesture.touchIdentifier);
      finalizeMobileTouchGesture(
        touch === null
          ? {
              clientX: activeGesture.lastClientX,
              clientY: activeGesture.lastClientY,
              localX: activeGesture.pathPoints.at(-1)?.localX ?? 0,
              localY: activeGesture.pathPoints.at(-1)?.localY ?? 0,
              timeMs: getEventTimeMs(event),
            }
          : buildMobileTouchSample(scrollNode, touch, getEventTimeMs(event)),
      );
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
    mobileSidebarDebugEnabled,
    mobilePane,
    clearPendingMobileDragSnapRestore,
    scheduleDelegatedMobileDragSnapRestore,
    setDelegatedMobileDragSnapDisabled,
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

  /**
   * Let the visible main-pane slice keep receiving taps when a mobile sidebar
   * is open. Capturing the click here still recenters the shell, but we avoid
   * a separate scrim layer that would block the content underneath.
   */
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
      ? `${leftSidebarWidthPx}px`
      : "0px",
    "--workspace-right-sidebar-width": hasRightSidebar
      ? `${rightSidebarWidthPx}px`
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
        ref={mobileScrollRef}
        data-testid={dataTestId}
        data-mobile-pane={isMobile ? mobilePane : undefined}
        data-sidebar-shell={isMobile ? "mobile" : "desktop"}
        className={cn(
          "relative h-full w-full min-h-0",
          isMobile
            ? "overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "overflow-hidden",
        )}
      >
        <div
          ref={mobileTrackRef}
          data-sidebar-track={isMobile ? "pannable" : "static"}
          className={cn(
            "relative grid h-full min-h-0",
            isMobile
              ? "snap-x snap-mandatory"
              : isSidebarResizeActive
                ? ""
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
                className="flex h-full min-h-0 flex-col overflow-hidden"
                style={{ width: "var(--workspace-right-sidebar-width)" }}
              >
                {rightSidebarContent}
              </div>
            </div>
          ) : null}

          {showLeftResizeHandle ? (
            <WorkspaceSidebarResizeHandle
              currentWidthPx={leftSidebarWidthPx}
              dataTestId="workspace-sidebar-left-resize-handle"
              maxWidthPx={leftSidebarResizeRange.maxWidthPx}
              minWidthPx={leftSidebarResizeRange.minWidthPx}
              onResizeEnd={handleSidebarResizeEnd}
              onResizeStart={() => handleSidebarResizeStart("left")}
              onWidthChange={handleLeftSidebarWidthChange}
              positionPx={leftResizeHandlePositionPx}
              side="left"
            />
          ) : null}

          {showRightResizeHandle ? (
            <WorkspaceSidebarResizeHandle
              currentWidthPx={rightSidebarWidthPx}
              dataTestId="workspace-sidebar-right-resize-handle"
              maxWidthPx={rightSidebarResizeRange.maxWidthPx}
              minWidthPx={rightSidebarResizeRange.minWidthPx}
              onResizeEnd={handleSidebarResizeEnd}
              onResizeStart={() => handleSidebarResizeStart("right")}
              onWidthChange={handleRightSidebarWidthChange}
              positionPx={rightResizeHandlePositionPx}
              side="right"
            />
          ) : null}
        </div>
        {hasAnySidebar && mobileSidebarDebugEnabled ? (
          <MobileSidebarGestureDebugOverlay
            currentPane={mobilePane}
            isMobile={isMobile}
            snapshot={mobileGestureDebugSnapshot}
          />
        ) : null}
      </div>
    </WorkspaceMobilePaneDragProvider>
  );
}
