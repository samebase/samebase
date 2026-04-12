import {
  type Dispatch,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { MobileSidebarGestureDebugOverlay } from "@/components/MobileSidebarGestureDebugOverlay";
import { WorkspaceLayoutV2ResizeHandle } from "@/components/workspace-layout-v2/WorkspaceLayoutV2ResizeHandle";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  buildMobileSidebarGestureDebugSnapshot,
  isMobileSidebarDebugEnabled,
  type MobileSidebarGestureDebugPoint,
  type MobileSidebarGestureDebugSnapshot,
} from "@/lib/mobileSidebarGestureDebug";
import {
  getWorkspaceLayoutV2PaneStartPx,
  getWorkspaceLayoutV2PaneWidthPx,
  getWorkspaceLayoutV2SettledPane,
  getWorkspaceLayoutV2TrackWidthPx,
  getWorkspaceLayoutV2VisibleStartPx,
  type WorkspaceLayoutV2Metrics,
  type WorkspaceLayoutV2Pane,
} from "./paneLayout";
import { cn, preventDefaultIfCancelable } from "@/lib/utils";
import {
  WorkspaceLayoutV2PaneFrame,
  WorkspaceLayoutV2PaneFrameProps,
} from "./WorkspaceLayoutV2PaneFrame";
import {
  type WorkspaceLayoutV2BottomPanelProps,
  WorkspaceLayoutV2MainViewportWithPanel,
} from "./WorkspaceLayoutV2BottomPanel";
import { Button } from "../ui/button";
import { PanelLeft, PanelRight } from "lucide-react";

const DESKTOP_SIDEBAR_MIN_WIDTH_PX = 160;
const DESKTOP_SIDEBAR_MAX_WIDTH_RATIO = 0.45;
const MOBILE_SIDEBAR_MIN_WIDTH_PX = 160;
// Leave roughly one pane header visible so phone users still have a reliable
// grab area after opening a sidebar fully.
const MOBILE_VISIBLE_MAIN_STRIP_PX = 32;
const MOBILE_DRAG_SLOP_PX = 12;

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

type TouchSample = {
  clientX: number;
  clientY: number;
  localX: number;
  localY: number;
  timeMs: number;
};

type ActiveMobileGesture = {
  phase: "pending" | "swiping";
  pathPoints: MobileSidebarGestureDebugPoint[];
  startPane: WorkspaceLayoutV2Pane;
  startTarget: EventTarget | null;
  startX: number;
  startY: number;
  touchIdentifier: number;
  touchSamples: TouchSample[];
};

function clampNumber(value: number, minValue: number, maxValue: number) {
  return Math.max(minValue, Math.min(value, maxValue));
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

function getLocalTouchPoint(
  node: HTMLElement,
  clientX: number,
  clientY: number,
) {
  const bounds = node.getBoundingClientRect();
  return {
    localX: clientX - bounds.left,
    localY: clientY - bounds.top,
  };
}

function buildTouchSample(
  viewportNode: HTMLElement,
  touch: Touch,
  timeMs: number,
): TouchSample {
  const { localX, localY } = getLocalTouchPoint(
    viewportNode,
    touch.clientX,
    touch.clientY,
  );
  return {
    clientX: touch.clientX,
    clientY: touch.clientY,
    localX,
    localY,
    timeMs,
  };
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
  // Keep a sliver of the main pane visible so an oversized mobile sidebar can
  // still be dragged or tapped back toward center.
  return Math.max(
    MOBILE_SIDEBAR_MIN_WIDTH_PX,
    Math.round(viewportWidthPx - MOBILE_VISIBLE_MAIN_STRIP_PX),
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

function getRecentVelocityPxPerMs(samples: readonly TouchSample[]) {
  if (samples.length < 2) {
    return 0;
  }

  const lastSample = samples[samples.length - 1];
  // Bias toward the last part of the gesture so a deliberate flick near
  // release can still commit even if the full drag started slowly.
  const windowStartTimeMs = lastSample.timeMs - 80;
  const referenceSample =
    [...samples]
      .reverse()
      .find((sample) => sample.timeMs <= windowStartTimeMs) ?? samples[0];
  const elapsedMs = Math.max(1, lastSample.timeMs - referenceSample.timeMs);

  return (lastSample.clientX - referenceSample.clientX) / elapsedMs;
}

function allowsShellHorizontalSwipe(
  viewportNode: HTMLElement,
  target: EventTarget | null,
) {
  let node = target instanceof Element ? target : null;

  while (node !== null && node !== viewportNode) {
    if (node.hasAttribute("data-workspace-layout-v2-resize-handle")) {
      return false;
    }
    if (node.getAttribute("data-workspace-layout-v2-drag-surface") === "true") {
      return true;
    }
    if (node instanceof HTMLElement) {
      const styles = window.getComputedStyle(node);
      const overflowX = styles.overflowX;
      // If a child owns horizontal scrolling, leave the gesture there. Editors
      // and other plain vertical surfaces opt back into shell swipes with the
      // explicit drag-surface attribute.
      const ownsHorizontalScroll =
        node.scrollWidth > node.clientWidth + 1 &&
        (overflowX === "auto" || overflowX === "scroll");
      if (ownsHorizontalScroll) {
        return false;
      }
    }
    node = node.parentElement;
  }

  return true;
}

function renderPaneContent(content: ReactNode) {
  return (
    // The shell contract always keeps all three panes mounted. A null slot is
    // still a real pane so width math and gestures stay consistent.
    content ?? (
      <div aria-hidden="true" className="min-h-0 flex-1 bg-background" />
    )
  );
}

type WorkspaceLayoutV2MobileViewportProps =
  WorkspaceLayoutV2ResolvedPaneContent & {
    activeResizeSide: "left" | "right" | "top" | null;
    isMobileDragging: boolean;
    leftResizeHandle: ReactNode;
    mobileMetrics: WorkspaceLayoutV2Metrics;
    mobileTrackWidthPx: number;
    mobileVisibleStartPx: number;
    rightResizeHandle: ReactNode;
  };

function WorkspaceLayoutV2MobileViewport({
  activeResizeSide,
  isMobileDragging,
  leftContent,
  leftResizeHandle,
  mainContent,
  mobileMetrics,
  mobileTrackWidthPx,
  mobileVisibleStartPx,
  rightContent,
  rightResizeHandle,
}: WorkspaceLayoutV2MobileViewportProps) {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      data-sidebar-shell="mobile"
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 will-change-transform",
          isMobileDragging || activeResizeSide !== null
            ? null
            : // Resizes move pane widths synchronously. Only idle pane changes
              // should animate the shared track.
              "transition-transform duration-75",
        )}
        style={{
          transform: `translate3d(${-mobileVisibleStartPx}px, 0, 0)`,
          width: `${mobileTrackWidthPx}px`,
        }}
      >
        <div
          data-testid="workspace-layout-v2-pane-left"
          className="absolute inset-y-0 left-0 z-10 min-h-0 overflow-visible"
          style={{
            width: `${getWorkspaceLayoutV2PaneWidthPx("left", mobileMetrics)}px`,
          }}
        >
          <div
            className={cn(
              "flex h-full min-h-0 flex-col overflow-hidden border-r",
              activeResizeSide === "left" ? "border-primary" : "border-border",
            )}
          >
            {leftContent}
          </div>
          {leftResizeHandle}
        </div>

        <div
          className="absolute inset-y-0 z-0 flex min-h-0 flex-col overflow-hidden bg-background"
          style={{
            left: `${getWorkspaceLayoutV2PaneStartPx("main", mobileMetrics)}px`,
            width: `${mobileMetrics.viewportWidthPx}px`,
          }}
        >
          {mainContent}
        </div>

        <div
          data-testid="workspace-layout-v2-pane-right"
          className="absolute inset-y-0 z-10 min-h-0 overflow-visible"
          style={{
            left: `${getWorkspaceLayoutV2PaneStartPx("right", mobileMetrics)}px`,
            width: `${getWorkspaceLayoutV2PaneWidthPx("right", mobileMetrics)}px`,
          }}
        >
          <div
            className={cn(
              "flex h-full min-h-0 flex-col overflow-hidden border-l",
              activeResizeSide === "right" ? "border-primary" : "border-border",
            )}
          >
            {rightContent}
          </div>
          {rightResizeHandle}
        </div>
      </div>
    </div>
  );
}

type WorkspaceLayoutV2DesktopViewportProps =
  WorkspaceLayoutV2ResolvedPaneContent & {
    activeResizeSide: "left" | "right" | "top" | null;
    desktopLeftWidthPx: number;
    desktopMainWidthPx: number;
    desktopRightWidthPx: number;
  };

function WorkspaceLayoutV2DesktopViewport({
  activeResizeSide,
  desktopLeftWidthPx,
  desktopMainWidthPx,
  desktopRightWidthPx,
  leftContent,
  mainContent,
  rightContent,
}: WorkspaceLayoutV2DesktopViewportProps) {
  return (
    <>
      <div
        className="absolute inset-y-0 left-0 z-10"
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
        className="absolute inset-y-0 z-0 flex min-h-0 flex-col overflow-hidden bg-background"
        style={{
          left: `${desktopLeftWidthPx}px`,
          width: `${desktopMainWidthPx}px`,
        }}
      >
        {mainContent}
      </div>
      <div
        className="absolute inset-y-0 right-0 z-10"
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
    </>
  );
}

type UseWorkspaceLayoutV2ResizeHandlesArgs = {
  desktopLeftWidthPx: number;
  desktopMainWidthPx: number;
  desktopRightWidthPx: number;
  isMobile: boolean;
  isMobileDragging: boolean;
  leftDesktopOpen: boolean;
  mobileMetrics: WorkspaceLayoutV2Metrics;
  mobilePane: WorkspaceLayoutV2Pane;
  rightDesktopOpen: boolean;
  setLeftDesktopWidthPx: Dispatch<SetStateAction<number>>;
  setLeftMobileWidthPx: Dispatch<SetStateAction<number>>;
  setRightDesktopWidthPx: Dispatch<SetStateAction<number>>;
  setRightMobileWidthPx: Dispatch<SetStateAction<number>>;
  viewportWidthPx: number;
};

/**
 * Collapse the mode-specific resize math into one place so the parent shell can
 * render handles from already-resolved geometry instead of branching on mobile
 * versus desktop at each callsite.
 */
function useWorkspaceLayoutV2ResizeHandles({
  desktopLeftWidthPx,
  desktopMainWidthPx,
  desktopRightWidthPx,
  isMobile,
  isMobileDragging,
  leftDesktopOpen,
  mobileMetrics,
  mobilePane,
  rightDesktopOpen,
  setLeftDesktopWidthPx,
  setLeftMobileWidthPx,
  setRightDesktopWidthPx,
  setRightMobileWidthPx,
  viewportWidthPx,
}: UseWorkspaceLayoutV2ResizeHandlesArgs) {
  const desktopResizeHandleMaxWidthPx =
    getDesktopSidebarMaxWidthPx(viewportWidthPx);
  const mobileResizeHandleMaxWidthPx =
    getMobileSidebarMaxWidthPx(viewportWidthPx);

  const handleLeftWidthChange = useCallback(
    (nextWidthPx: number) => {
      if (isMobile) {
        setLeftMobileWidthPx(
          clampNumber(
            Math.round(nextWidthPx),
            MOBILE_SIDEBAR_MIN_WIDTH_PX,
            mobileResizeHandleMaxWidthPx,
          ),
        );
        return;
      }

      setLeftDesktopWidthPx(
        clampNumber(
          Math.round(nextWidthPx),
          DESKTOP_SIDEBAR_MIN_WIDTH_PX,
          desktopResizeHandleMaxWidthPx,
        ),
      );
    },
    [
      desktopResizeHandleMaxWidthPx,
      isMobile,
      mobileResizeHandleMaxWidthPx,
      setLeftDesktopWidthPx,
      setLeftMobileWidthPx,
    ],
  );

  const handleRightWidthChange = useCallback(
    (nextWidthPx: number) => {
      if (isMobile) {
        setRightMobileWidthPx(
          clampNumber(
            Math.round(nextWidthPx),
            MOBILE_SIDEBAR_MIN_WIDTH_PX,
            mobileResizeHandleMaxWidthPx,
          ),
        );
        return;
      }

      setRightDesktopWidthPx(
        clampNumber(
          Math.round(nextWidthPx),
          DESKTOP_SIDEBAR_MIN_WIDTH_PX,
          desktopResizeHandleMaxWidthPx,
        ),
      );
    },
    [
      desktopResizeHandleMaxWidthPx,
      isMobile,
      mobileResizeHandleMaxWidthPx,
      setRightDesktopWidthPx,
      setRightMobileWidthPx,
    ],
  );

  return useMemo<WorkspaceLayoutV2ResizeHandleConfig[]>(() => {
    if (viewportWidthPx <= 0) {
      return [];
    }

    if (isMobile) {
      const mobileHandles: WorkspaceLayoutV2ResizeHandleConfig[] = [];
      if (!isMobileDragging && mobilePane === "left") {
        mobileHandles.push({
          currentWidthPx: mobileMetrics.leftWidthPx,
          dataTestId: "workspace-layout-v2-left-resize",
          maxWidthPx: mobileResizeHandleMaxWidthPx,
          minWidthPx: MOBILE_SIDEBAR_MIN_WIDTH_PX,
          onWidthChange: handleLeftWidthChange,
          // Mobile handles render inside the live sidebar panes, so their
          // position is local to the pane edge rather than the viewport.
          positionPx: mobileMetrics.leftWidthPx,
          side: "left",
        });
      }
      if (!isMobileDragging && mobilePane === "right") {
        mobileHandles.push({
          currentWidthPx: mobileMetrics.rightWidthPx,
          dataTestId: "workspace-layout-v2-right-resize",
          maxWidthPx: mobileResizeHandleMaxWidthPx,
          minWidthPx: MOBILE_SIDEBAR_MIN_WIDTH_PX,
          onWidthChange: handleRightWidthChange,
          positionPx: 0,
          side: "right",
        });
      }
      return mobileHandles;
    }

    const desktopHandles: WorkspaceLayoutV2ResizeHandleConfig[] = [];
    if (leftDesktopOpen) {
      desktopHandles.push({
        currentWidthPx: desktopLeftWidthPx,
        dataTestId: "workspace-layout-v2-left-resize",
        maxWidthPx: desktopResizeHandleMaxWidthPx,
        minWidthPx: DESKTOP_SIDEBAR_MIN_WIDTH_PX,
        onWidthChange: handleLeftWidthChange,
        positionPx: desktopLeftWidthPx,
        side: "left",
      });
    }
    if (rightDesktopOpen) {
      desktopHandles.push({
        currentWidthPx: desktopRightWidthPx,
        dataTestId: "workspace-layout-v2-right-resize",
        maxWidthPx: desktopResizeHandleMaxWidthPx,
        minWidthPx: DESKTOP_SIDEBAR_MIN_WIDTH_PX,
        onWidthChange: handleRightWidthChange,
        positionPx: desktopLeftWidthPx + desktopMainWidthPx,
        side: "right",
      });
    }
    return desktopHandles;
  }, [
    desktopLeftWidthPx,
    desktopMainWidthPx,
    desktopResizeHandleMaxWidthPx,
    desktopRightWidthPx,
    handleLeftWidthChange,
    handleRightWidthChange,
    isMobile,
    isMobileDragging,
    leftDesktopOpen,
    mobileMetrics,
    mobilePane,
    mobileResizeHandleMaxWidthPx,
    rightDesktopOpen,
    viewportWidthPx,
  ]);
}

type UseWorkspaceLayoutV2MobileGestureArgs = {
  activeResizeSide: "left" | "right" | "top" | null;
  isMobile: boolean;
  mobileSidebarDebugEnabled: boolean;
  mobileMetrics: WorkspaceLayoutV2Metrics;
  mobilePane: WorkspaceLayoutV2Pane;
  setMobilePane: Dispatch<SetStateAction<WorkspaceLayoutV2Pane>>;
  viewportRef: RefObject<HTMLDivElement | null>;
};

/**
 * Register the mobile shell's native touch listeners and translate horizontal
 * drags into transient pane motion. The hook decides when the shell, rather
 * than a child surface, owns the gesture and settles the drag back to a real
 * left/main/right pane on release.
 */
function useWorkspaceLayoutV2MobileGesture({
  activeResizeSide,
  isMobile,
  mobileSidebarDebugEnabled,
  mobileMetrics,
  mobilePane,
  setMobilePane,
  viewportRef,
}: UseWorkspaceLayoutV2MobileGestureArgs) {
  const activeGestureRef = useRef<ActiveMobileGesture | null>(null);
  const [isMobileDragging, setIsMobileDragging] = useState(false);
  const [mobileDragOffsetPx, setMobileDragOffsetPx] = useState(0);
  const pendingGestureDebugRef =
    useRef<MobileSidebarGestureDebugSnapshot | null>(null);
  const [mobileGestureDebugSnapshot, setMobileGestureDebugSnapshot] =
    useState<MobileSidebarGestureDebugSnapshot | null>(null);

  const handleTouchStart = useEffectEvent(
    (event: TouchEvent, viewportNode: HTMLDivElement) => {
      if (activeResizeSide !== null || event.touches.length !== 1) {
        if (mobileSidebarDebugEnabled) {
          pendingGestureDebugRef.current = null;
          setMobileGestureDebugSnapshot(null);
        }
        return;
      }

      const touch = event.touches.item(0);
      if (touch === null) {
        return;
      }
      const initialSample = buildTouchSample(
        viewportNode,
        touch,
        event.timeStamp,
      );

      activeGestureRef.current = {
        phase: "pending",
        pathPoints: [initialSample],
        startPane: mobilePane,
        startTarget: event.target,
        startX: initialSample.clientX,
        startY: initialSample.clientY,
        touchIdentifier: touch.identifier,
        touchSamples: [initialSample],
      };

      if (!mobileSidebarDebugEnabled) {
        return;
      }

      const activeSnapshot = buildMobileSidebarGestureDebugSnapshot({
        isActive: true,
        pathPoints: [initialSample],
        startPane: mobilePane,
      });
      pendingGestureDebugRef.current = activeSnapshot;
      setMobileGestureDebugSnapshot(activeSnapshot);
    },
  );

  const handleTouchMove = useEffectEvent(
    (event: TouchEvent, viewportNode: HTMLDivElement) => {
      const activeGesture = activeGestureRef.current;
      if (activeGesture === null) {
        return;
      }

      const touch =
        findTouchByIdentifier(
          event.changedTouches,
          activeGesture.touchIdentifier,
        ) ??
        findTouchByIdentifier(event.touches, activeGesture.touchIdentifier);
      if (touch === null) {
        return;
      }
      const sample = buildTouchSample(viewportNode, touch, event.timeStamp);

      const dragOffsetPx = sample.clientX - activeGesture.startX;
      const dragOffsetYPx = sample.clientY - activeGesture.startY;
      if (activeGesture.phase === "pending") {
        if (
          Math.abs(dragOffsetPx) < MOBILE_DRAG_SLOP_PX &&
          Math.abs(dragOffsetYPx) < MOBILE_DRAG_SLOP_PX
        ) {
          return;
        }

        if (Math.abs(dragOffsetPx) <= Math.abs(dragOffsetYPx)) {
          activeGestureRef.current = null;
          pendingGestureDebugRef.current = null;
          setMobileGestureDebugSnapshot(null);
          return;
        }

        if (
          !allowsShellHorizontalSwipe(viewportNode, activeGesture.startTarget)
        ) {
          activeGestureRef.current = null;
          pendingGestureDebugRef.current = null;
          setMobileGestureDebugSnapshot(null);
          return;
        }

        // Once we cross slop and own horizontal intent, the shell takes over
        // the gesture until release.
        activeGesture.phase = "swiping";
        setIsMobileDragging(true);
      }

      activeGesture.touchSamples = [
        ...activeGesture.touchSamples,
        sample,
      ].slice(-6);
      if (mobileSidebarDebugEnabled) {
        activeGesture.pathPoints = [...activeGesture.pathPoints, sample];
        const activeSnapshot = buildMobileSidebarGestureDebugSnapshot({
          isActive: true,
          pathPoints: activeGesture.pathPoints,
          startPane: activeGesture.startPane,
        });
        pendingGestureDebugRef.current = activeSnapshot;
        setMobileGestureDebugSnapshot(activeSnapshot);
      }
      setMobileDragOffsetPx(dragOffsetPx);
      preventDefaultIfCancelable(event);
    },
  );

  const finishGesture = useEffectEvent((event: TouchEvent) => {
    const activeGesture = activeGestureRef.current;
    activeGestureRef.current = null;
    if (activeGesture === null || activeGesture.phase !== "swiping") {
      return;
    }

    const touch =
      findTouchByIdentifier(
        event.changedTouches,
        activeGesture.touchIdentifier,
      ) ?? findTouchByIdentifier(event.touches, activeGesture.touchIdentifier);
    const lastRecordedSample =
      activeGesture.touchSamples[activeGesture.touchSamples.length - 1];
    const finalSample =
      touch === null
        ? {
            ...lastRecordedSample,
            timeMs: performance.now(),
          }
        : buildTouchSample(
            viewportRef.current ?? document.body,
            touch,
            event.timeStamp,
          );
    const finalClientX = finalSample.clientX;
    const finalTimeMs = touch !== null ? event.timeStamp : performance.now();
    const touchSamples = [
      ...activeGesture.touchSamples,
      {
        ...finalSample,
        timeMs: finalTimeMs,
      },
    ];
    // Always settle relative to the pane where the gesture started so mobile
    // transitions remain adjacent-only even if widths changed mid-drag.
    const nextPane = getWorkspaceLayoutV2SettledPane({
      currentPane: activeGesture.startPane,
      dragOffsetPx: finalClientX - activeGesture.startX,
      metrics: mobileMetrics,
      velocityPxPerMs: getRecentVelocityPxPerMs(touchSamples),
    });

    setIsMobileDragging(false);
    setMobileDragOffsetPx(0);
    if (mobileSidebarDebugEnabled) {
      const pathPoints =
        activeGesture.pathPoints.at(-1)?.timeMs === finalTimeMs &&
        activeGesture.pathPoints.at(-1)?.clientX === finalSample.clientX &&
        activeGesture.pathPoints.at(-1)?.clientY === finalSample.clientY
          ? activeGesture.pathPoints
          : [
              ...activeGesture.pathPoints,
              {
                ...finalSample,
                timeMs: finalTimeMs,
              },
            ];
      const completedSnapshot = buildMobileSidebarGestureDebugSnapshot({
        isActive: false,
        pathPoints,
        releaseGesture: {
          releaseFingerVelocityXPxPerMs: getRecentVelocityPxPerMs(touchSamples),
          startPane: activeGesture.startPane,
          totalFingerDeltaXPx: finalClientX - activeGesture.startX,
        },
        settledPane: nextPane,
        nearestPaneAtSettle: nextPane,
        startPane: activeGesture.startPane,
      });
      pendingGestureDebugRef.current = completedSnapshot;
      setMobileGestureDebugSnapshot(completedSnapshot);
    }
    setMobilePane(nextPane);
  });

  useEffect(() => {
    if (mobileSidebarDebugEnabled) {
      return;
    }

    pendingGestureDebugRef.current = null;
    setMobileGestureDebugSnapshot(null);
  }, [mobileSidebarDebugEnabled]);

  useEffect(() => {
    if (!isMobile) {
      // Crossing the mobile breakpoint should not leave a stale drag transform
      // behind on desktop.
      setIsMobileDragging(false);
      setMobileDragOffsetPx(0);
      activeGestureRef.current = null;
      pendingGestureDebugRef.current = null;
      setMobileGestureDebugSnapshot(null);
    }
  }, [isMobile]);

  useEffect(() => {
    const viewportNode = viewportRef.current;
    if (!viewportNode || !isMobile) {
      return;
    }

    const handleViewportTouchStart = (event: TouchEvent) => {
      handleTouchStart(event, viewportNode);
    };

    const handleViewportTouchMove = (event: TouchEvent) => {
      handleTouchMove(event, viewportNode);
    };

    viewportNode.addEventListener("touchstart", handleViewportTouchStart, {
      capture: true,
      passive: true,
    });
    viewportNode.addEventListener("touchmove", handleViewportTouchMove, {
      capture: true,
      passive: false,
    });
    viewportNode.addEventListener("touchend", finishGesture, {
      capture: true,
      passive: true,
    });
    viewportNode.addEventListener("touchcancel", finishGesture, {
      capture: true,
      passive: true,
    });

    return () => {
      viewportNode.removeEventListener(
        "touchstart",
        handleViewportTouchStart,
        true,
      );
      viewportNode.removeEventListener(
        "touchmove",
        handleViewportTouchMove,
        true,
      );
      viewportNode.removeEventListener("touchend", finishGesture, true);
      viewportNode.removeEventListener("touchcancel", finishGesture, true);
    };
  }, [isMobile, viewportRef]);

  return {
    isMobileDragging,
    mobileGestureDebugSnapshot,
    mobileDragOffsetPx,
  };
}

function WorkspaceLayoutV2MainPaneHeader({
  children,
}: {
  children: ReactNode;
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
    </div>
  );
}

export function WorkspaceLayoutV2FullPage({
  left,
  main,
  panel,
  right,
}: {
  left: WorkspaceLayoutV2PaneFrameProps;

  main: WorkspaceLayoutV2PaneFrameProps;

  panel?: WorkspaceLayoutV2BottomPanelProps;

  right: WorkspaceLayoutV2PaneFrameProps;
}) {
  return (
    <WorkspaceLayoutV2ViewportFrame>
      <WorkspaceLayoutV2JustPanes
        left={<WorkspaceLayoutV2PaneFrame {...left} />}
        main={
          <WorkspaceLayoutV2PaneFrame
            {...main}
            header={
              <WorkspaceLayoutV2MainPaneHeader>
                {main.header}
              </WorkspaceLayoutV2MainPaneHeader>
            }
          />
        }
        panel={panel}
        right={<WorkspaceLayoutV2PaneFrame {...right} />}
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
  const viewportSize = useElementSize(viewportRef);
  const [activeResizeSide, setActiveResizeSide] = useState<
    "left" | "right" | "top" | null
  >(null);
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

  const desktopLeftWidthPx = getDesktopSidebarWidthPx({
    isOpen: leftDesktopOpen,
    storedWidthPx: leftDesktopWidthPx,
    viewportWidthPx: viewportSize.widthPx,
  });
  const desktopRightWidthPx = getDesktopSidebarWidthPx({
    isOpen: rightDesktopOpen,
    storedWidthPx: rightDesktopWidthPx,
    viewportWidthPx: viewportSize.widthPx,
  });
  const desktopMainWidthPx = Math.max(
    0,
    viewportSize.widthPx - desktopLeftWidthPx - desktopRightWidthPx,
  );
  const mobileSidebarMaxWidthPx = getMobileSidebarMaxWidthPx(
    viewportSize.widthPx,
  );
  const mobileSidebarDebugEnabled =
    typeof window !== "undefined" &&
    isMobileSidebarDebugEnabled(window.location.search) &&
    (import.meta.env.DEV ||
      window.location.pathname === "/visual-fixture.html");

  const mobileMetrics = useMemo<WorkspaceLayoutV2Metrics>(
    () => ({
      leftWidthPx: clampNumber(
        leftMobileWidthPx,
        MOBILE_SIDEBAR_MIN_WIDTH_PX,
        mobileSidebarMaxWidthPx,
      ),
      rightWidthPx: clampNumber(
        rightMobileWidthPx,
        MOBILE_SIDEBAR_MIN_WIDTH_PX,
        mobileSidebarMaxWidthPx,
      ),
      viewportWidthPx: viewportSize.widthPx,
    }),
    [
      leftMobileWidthPx,
      mobileSidebarMaxWidthPx,
      rightMobileWidthPx,
      viewportSize.widthPx,
    ],
  );

  const { isMobileDragging, mobileDragOffsetPx, mobileGestureDebugSnapshot } =
    useWorkspaceLayoutV2MobileGesture({
      activeResizeSide,
      isMobile,
      mobileSidebarDebugEnabled,
      mobileMetrics,
      mobilePane,
      setMobilePane,
      viewportRef,
    });

  const mobileVisibleStartPx = getWorkspaceLayoutV2VisibleStartPx({
    currentPane: mobilePane,
    dragOffsetPx: isMobileDragging ? mobileDragOffsetPx : 0,
    metrics: mobileMetrics,
  });
  const mobileTrackWidthPx = getWorkspaceLayoutV2TrackWidthPx(mobileMetrics);
  const resizeHandles = useWorkspaceLayoutV2ResizeHandles({
    desktopLeftWidthPx,
    desktopMainWidthPx,
    desktopRightWidthPx,
    isMobile,
    isMobileDragging,
    leftDesktopOpen,
    mobileMetrics,
    mobilePane,
    rightDesktopOpen,
    setLeftDesktopWidthPx,
    setLeftMobileWidthPx,
    setRightDesktopWidthPx,
    setRightMobileWidthPx,
    viewportWidthPx: viewportSize.widthPx,
  });

  const resolvedLeftContent = renderPaneContent(left);
  const resolvedMainContent = renderPaneContent(main);
  const resolvedRightContent = renderPaneContent(right);
  const leftResizeHandle = resizeHandles.find(
    (resizeHandle) => resizeHandle.side === "left",
  );
  const rightResizeHandle = resizeHandles.find(
    (resizeHandle) => resizeHandle.side === "right",
  );

  function renderResizeHandle(
    resizeHandle: WorkspaceLayoutV2ResizeHandleConfig,
  ) {
    return (
      <WorkspaceLayoutV2ResizeHandle
        key={resizeHandle.side}
        currentSizePx={resizeHandle.currentWidthPx}
        dataTestId={resizeHandle.dataTestId}
        minSizePx={resizeHandle.minWidthPx}
        maxSizePx={resizeHandle.maxWidthPx}
        pointerTarget={isMobile ? "grip" : "edge"}
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
          isMobileDragging={isMobileDragging}
          leftContent={resolvedLeftContent}
          leftResizeHandle={
            leftResizeHandle === undefined
              ? null
              : renderResizeHandle(leftResizeHandle)
          }
          mainContent={mainViewportContent}
          mobileMetrics={mobileMetrics}
          mobileTrackWidthPx={mobileTrackWidthPx}
          mobileVisibleStartPx={mobileVisibleStartPx}
          rightContent={resolvedRightContent}
          rightResizeHandle={
            rightResizeHandle === undefined
              ? null
              : renderResizeHandle(rightResizeHandle)
          }
        />
      ) : (
        <WorkspaceLayoutV2DesktopViewport
          activeResizeSide={activeResizeSide}
          desktopLeftWidthPx={desktopLeftWidthPx}
          desktopMainWidthPx={desktopMainWidthPx}
          desktopRightWidthPx={desktopRightWidthPx}
          leftContent={resolvedLeftContent}
          mainContent={mainViewportContent}
          rightContent={resolvedRightContent}
        />
      )}

      {isMobile ? null : resizeHandles.map(renderResizeHandle)}

      {mobileSidebarDebugEnabled ? (
        <MobileSidebarGestureDebugOverlay
          currentPane={mobilePane}
          isMobile={isMobile}
          snapshot={mobileGestureDebugSnapshot}
        />
      ) : null}
    </div>
  );
}
