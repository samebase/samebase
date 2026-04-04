import {
  type Dispatch,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceLayoutV2ResizeHandle } from "@/components/workspace-layout-v2/WorkspaceLayoutV2ResizeHandle";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  getWorkspaceLayoutV2PaneStartPx,
  getWorkspaceLayoutV2PaneWidthPx,
  getWorkspaceLayoutV2SettledPane,
  getWorkspaceLayoutV2TrackWidthPx,
  getWorkspaceLayoutV2ViewportBoundaryPx,
  getWorkspaceLayoutV2VisibleStartPx,
  type WorkspaceLayoutV2Metrics,
  type WorkspaceLayoutV2Pane,
} from "@/lib/workspaceLayoutV2/paneLayout";
import { cn } from "@/lib/utils";

const DESKTOP_SIDEBAR_MIN_WIDTH_PX = 160;
const DESKTOP_SIDEBAR_MAX_WIDTH_RATIO = 0.45;
const MOBILE_SIDEBAR_MIN_WIDTH_PX = 160;
const MOBILE_DRAG_SLOP_PX = 12;

type WorkspaceLayoutV2Props = {
  dataTestId?: string;
  left: ReactNode;
  main: ReactNode;
  right: ReactNode;
};

type TouchSample = {
  clientX: number;
  timeMs: number;
};

type ActiveMobileGesture = {
  phase: "pending" | "swiping";
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

/**
 * The shell math is driven by the rendered viewport width, not viewport media
 * queries, so resizes and mobile browser chrome changes update pane geometry
 * from the actual DOM box we are drawing into.
 */
function useElementWidth(measureRef: RefObject<HTMLElement | null>) {
  const [widthPx, setWidthPx] = useState(0);

  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) {
      return;
    }

    const updateWidth = () => {
      setWidthPx(Math.max(0, Math.round(node.getBoundingClientRect().width)));
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

  return widthPx;
}

function getDesktopSidebarMaxWidthPx(viewportWidthPx: number) {
  return Math.max(
    DESKTOP_SIDEBAR_MIN_WIDTH_PX,
    Math.round(viewportWidthPx * DESKTOP_SIDEBAR_MAX_WIDTH_RATIO),
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

type UseWorkspaceLayoutV2MobileGestureArgs = {
  activeResizeSide: "left" | "right" | null;
  isMobile: boolean;
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
  mobileMetrics,
  mobilePane,
  setMobilePane,
  viewportRef,
}: UseWorkspaceLayoutV2MobileGestureArgs) {
  const activeGestureRef = useRef<ActiveMobileGesture | null>(null);
  const activeResizeSideRef = useRef<"left" | "right" | null>(null);
  const [isMobileDragging, setIsMobileDragging] = useState(false);
  const [mobileDragOffsetPx, setMobileDragOffsetPx] = useState(0);

  useEffect(() => {
    // The native touch listeners below are registered once per pane state, so
    // they read the current resize side through a ref instead of reopening the
    // gesture during an in-flight handle drag.
    activeResizeSideRef.current = activeResizeSide;
  }, [activeResizeSide]);

  useEffect(() => {
    if (!isMobile) {
      // Crossing the mobile breakpoint should not leave a stale drag transform
      // behind on desktop.
      setIsMobileDragging(false);
      setMobileDragOffsetPx(0);
      activeGestureRef.current = null;
    }
  }, [isMobile]);

  useEffect(() => {
    const viewportNode = viewportRef.current;
    if (!viewportNode || !isMobile) {
      return;
    }

    // Keep the mobile gesture path explicit and local to the viewport instead
    // of relying on scroll containers. This is the core of the v2 shell model:
    // pane state plus a transient drag offset.
    const handleTouchStart = (event: TouchEvent) => {
      if (activeResizeSideRef.current !== null || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches.item(0);
      if (touch === null) {
        return;
      }

      activeGestureRef.current = {
        phase: "pending",
        startPane: mobilePane,
        startTarget: event.target,
        startX: touch.clientX,
        startY: touch.clientY,
        touchIdentifier: touch.identifier,
        touchSamples: [
          {
            clientX: touch.clientX,
            timeMs: event.timeStamp,
          },
        ],
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
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

      const dragOffsetPx = touch.clientX - activeGesture.startX;
      const dragOffsetYPx = touch.clientY - activeGesture.startY;
      if (activeGesture.phase === "pending") {
        if (
          Math.abs(dragOffsetPx) < MOBILE_DRAG_SLOP_PX &&
          Math.abs(dragOffsetYPx) < MOBILE_DRAG_SLOP_PX
        ) {
          return;
        }

        if (Math.abs(dragOffsetPx) <= Math.abs(dragOffsetYPx)) {
          activeGestureRef.current = null;
          return;
        }

        if (
          !allowsShellHorizontalSwipe(viewportNode, activeGesture.startTarget)
        ) {
          activeGestureRef.current = null;
          return;
        }

        // Once we cross slop and own horizontal intent, the shell takes over
        // the gesture until release.
        activeGesture.phase = "swiping";
        setIsMobileDragging(true);
      }

      activeGesture.touchSamples = [
        ...activeGesture.touchSamples,
        {
          clientX: touch.clientX,
          timeMs: event.timeStamp,
        },
      ].slice(-6);
      setMobileDragOffsetPx(dragOffsetPx);
      event.preventDefault();
    };

    const finishGesture = (event: TouchEvent) => {
      const activeGesture = activeGestureRef.current;
      activeGestureRef.current = null;
      if (activeGesture === null || activeGesture.phase !== "swiping") {
        return;
      }

      const touch =
        findTouchByIdentifier(
          event.changedTouches,
          activeGesture.touchIdentifier,
        ) ??
        findTouchByIdentifier(event.touches, activeGesture.touchIdentifier);
      const lastRecordedClientX =
        activeGesture.touchSamples[activeGesture.touchSamples.length - 1]
          .clientX;
      const finalClientX = touch?.clientX ?? lastRecordedClientX;
      const finalTimeMs = touch !== null ? event.timeStamp : performance.now();
      const touchSamples = [
        ...activeGesture.touchSamples,
        {
          clientX: finalClientX,
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
      setMobilePane(nextPane);
    };

    viewportNode.addEventListener("touchstart", handleTouchStart, {
      capture: true,
      passive: true,
    });
    viewportNode.addEventListener("touchmove", handleTouchMove, {
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
      viewportNode.removeEventListener("touchstart", handleTouchStart, true);
      viewportNode.removeEventListener("touchmove", handleTouchMove, true);
      viewportNode.removeEventListener("touchend", finishGesture, true);
      viewportNode.removeEventListener("touchcancel", finishGesture, true);
    };
  }, [isMobile, mobileMetrics, mobilePane, setMobilePane, viewportRef]);

  return {
    isMobileDragging,
    mobileDragOffsetPx,
  };
}

export function WorkspaceLayoutV2({
  dataTestId,
  left,
  main,
  right,
}: WorkspaceLayoutV2Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const viewportWidthPx = useElementWidth(viewportRef);
  const [activeResizeSide, setActiveResizeSide] = useState<
    "left" | "right" | null
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
    toggleLeftSidebar,
    toggleRightSidebar,
  } = useSidebar();

  const desktopLeftWidthPx = getDesktopSidebarWidthPx({
    isOpen: leftDesktopOpen,
    storedWidthPx: leftDesktopWidthPx,
    viewportWidthPx,
  });
  const desktopRightWidthPx = getDesktopSidebarWidthPx({
    isOpen: rightDesktopOpen,
    storedWidthPx: rightDesktopWidthPx,
    viewportWidthPx,
  });
  const desktopMainWidthPx = Math.max(
    0,
    viewportWidthPx - desktopLeftWidthPx - desktopRightWidthPx,
  );
  const mobileMetrics = useMemo<WorkspaceLayoutV2Metrics>(
    () => ({
      leftWidthPx: Math.max(MOBILE_SIDEBAR_MIN_WIDTH_PX, leftMobileWidthPx),
      rightWidthPx: Math.max(MOBILE_SIDEBAR_MIN_WIDTH_PX, rightMobileWidthPx),
      viewportWidthPx,
    }),
    [leftMobileWidthPx, rightMobileWidthPx, viewportWidthPx],
  );
  const { isMobileDragging, mobileDragOffsetPx } =
    useWorkspaceLayoutV2MobileGesture({
      activeResizeSide,
      isMobile,
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
  const showLeftResizeHandle = isMobile
    ? !isMobileDragging && mobilePane === "left"
    : leftDesktopOpen;
  const showRightResizeHandle = isMobile
    ? !isMobileDragging && mobilePane === "right"
    : rightDesktopOpen;
  const leftResizePositionPx = isMobile
    ? getWorkspaceLayoutV2ViewportBoundaryPx({
        currentPane: mobilePane,
        metrics: mobileMetrics,
        side: "left",
        visibleStartPx: mobileVisibleStartPx,
      })
    : desktopLeftWidthPx;
  const rightResizePositionPx = isMobile
    ? getWorkspaceLayoutV2ViewportBoundaryPx({
        currentPane: mobilePane,
        metrics: mobileMetrics,
        side: "right",
        visibleStartPx: mobileVisibleStartPx,
      })
    : desktopLeftWidthPx + desktopMainWidthPx;

  const handleLeftWidthChange = useCallback(
    (nextWidthPx: number) => {
      if (isMobile) {
        setLeftMobileWidthPx(
          Math.max(MOBILE_SIDEBAR_MIN_WIDTH_PX, Math.round(nextWidthPx)),
        );
        return;
      }

      setLeftDesktopWidthPx(
        clampNumber(
          Math.round(nextWidthPx),
          DESKTOP_SIDEBAR_MIN_WIDTH_PX,
          getDesktopSidebarMaxWidthPx(viewportWidthPx),
        ),
      );
    },
    [isMobile, setLeftDesktopWidthPx, setLeftMobileWidthPx, viewportWidthPx],
  );

  const handleRightWidthChange = useCallback(
    (nextWidthPx: number) => {
      if (isMobile) {
        setRightMobileWidthPx(
          Math.max(MOBILE_SIDEBAR_MIN_WIDTH_PX, Math.round(nextWidthPx)),
        );
        return;
      }

      setRightDesktopWidthPx(
        clampNumber(
          Math.round(nextWidthPx),
          DESKTOP_SIDEBAR_MIN_WIDTH_PX,
          getDesktopSidebarMaxWidthPx(viewportWidthPx),
        ),
      );
    },
    [isMobile, setRightDesktopWidthPx, setRightMobileWidthPx, viewportWidthPx],
  );

  const handleMobileMainPanePointerUpCapture = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (
        !isMobile ||
        isMobileDragging ||
        activeResizeSide !== null ||
        mobilePane === "main"
      ) {
        return;
      }

      // When a sidebar is open, the exposed strip of main is a direct escape
      // hatch back to center. This keeps mobile dismiss behavior local to the
      // real pane instead of adding an overlay/scrim layer.
      event.preventDefault();
      event.stopPropagation();
      setMobilePane("main");
    },
    [activeResizeSide, isMobile, isMobileDragging, mobilePane, setMobilePane],
  );

  const resolvedLeftContent = renderPaneContent(left);
  const resolvedMainContent = renderPaneContent(main);
  const resolvedRightContent = renderPaneContent(right);

  return (
    <div
      ref={viewportRef}
      data-testid={dataTestId}
      data-mobile-pane={isMobile ? mobilePane : undefined}
      data-workspace-layout-v2={isMobile ? "mobile" : "desktop"}
      className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-background"
    >
      {isMobile ? (
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
                  "transition-transform duration-200 ease-out",
            )}
            style={{
              transform: `translate3d(${-mobileVisibleStartPx}px, 0, 0)`,
              width: `${mobileTrackWidthPx}px`,
            }}
          >
            <div
              data-workspace-layout-v2-pane="left"
              data-testid="workspace-layout-v2-pane-left"
              className="absolute inset-y-0 left-0 flex min-h-0 flex-col overflow-hidden border-r bg-muted/10"
              style={{
                width: `${getWorkspaceLayoutV2PaneWidthPx(
                  "left",
                  mobileMetrics,
                )}px`,
              }}
            >
              {resolvedLeftContent}
            </div>
            <div
              data-workspace-layout-v2-pane="main"
              data-testid="workspace-layout-v2-pane-main"
              className="absolute inset-y-0 flex min-h-0 flex-col overflow-hidden bg-background"
              onPointerUpCapture={handleMobileMainPanePointerUpCapture}
              style={{
                left: `${getWorkspaceLayoutV2PaneStartPx(
                  "main",
                  mobileMetrics,
                )}px`,
                width: `${mobileMetrics.viewportWidthPx}px`,
              }}
            >
              {resolvedMainContent}
            </div>
            <div
              data-workspace-layout-v2-pane="right"
              data-testid="workspace-layout-v2-pane-right"
              className="absolute inset-y-0 flex min-h-0 flex-col overflow-hidden border-l bg-muted/10"
              style={{
                left: `${getWorkspaceLayoutV2PaneStartPx(
                  "right",
                  mobileMetrics,
                )}px`,
                width: `${getWorkspaceLayoutV2PaneWidthPx(
                  "right",
                  mobileMetrics,
                )}px`,
              }}
            >
              {resolvedRightContent}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            className="absolute inset-y-0 left-0 z-10"
            style={{ width: `${desktopLeftWidthPx}px` }}
          >
            <div
              data-workspace-layout-v2-pane="left"
              data-testid="workspace-layout-v2-pane-left"
              className={cn(
                "flex h-full min-h-0 flex-col overflow-hidden border-r bg-muted/10",
                leftDesktopOpen ? "opacity-100" : "opacity-0",
              )}
              style={{ width: `${desktopLeftWidthPx}px` }}
            >
              {resolvedLeftContent}
            </div>
          </div>
          <div
            data-workspace-layout-v2-pane="main"
            data-testid="workspace-layout-v2-pane-main"
            className="absolute inset-y-0 z-0 flex min-h-0 flex-col overflow-hidden bg-background"
            style={{
              left: `${desktopLeftWidthPx}px`,
              width: `${desktopMainWidthPx}px`,
            }}
          >
            {resolvedMainContent}
          </div>
          <div
            className="absolute inset-y-0 right-0 z-10"
            style={{ width: `${desktopRightWidthPx}px` }}
          >
            <div
              data-workspace-layout-v2-pane="right"
              data-testid="workspace-layout-v2-pane-right"
              className={cn(
                "flex h-full min-h-0 flex-col overflow-hidden border-l bg-muted/10",
                rightDesktopOpen ? "opacity-100" : "opacity-0",
              )}
              style={{ width: `${desktopRightWidthPx}px` }}
            >
              {resolvedRightContent}
            </div>
          </div>
        </>
      )}

      {isMobile ? null : (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
          <div className="pointer-events-auto flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Toggle Left Sidebar"
              className="h-9 w-9 bg-background/90 backdrop-blur"
              onClick={() => {
                toggleLeftSidebar();
              }}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="pointer-events-auto flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Toggle Right Sidebar"
              className="h-9 w-9 bg-background/90 backdrop-blur"
              onClick={() => {
                toggleRightSidebar();
              }}
            >
              <PanelLeft className="h-4 w-4 rotate-180" />
            </Button>
          </div>
        </div>
      )}

      {showLeftResizeHandle && viewportWidthPx > 0 ? (
        <WorkspaceLayoutV2ResizeHandle
          currentWidthPx={
            isMobile ? mobileMetrics.leftWidthPx : desktopLeftWidthPx
          }
          dataTestId="workspace-layout-v2-left-resize"
          minWidthPx={
            isMobile
              ? MOBILE_SIDEBAR_MIN_WIDTH_PX
              : DESKTOP_SIDEBAR_MIN_WIDTH_PX
          }
          maxWidthPx={
            isMobile ? 2_048 : getDesktopSidebarMaxWidthPx(viewportWidthPx)
          }
          positionPx={leftResizePositionPx}
          side="left"
          onResizeStart={() => {
            setActiveResizeSide("left");
          }}
          onResizeEnd={() => {
            setActiveResizeSide(null);
          }}
          onWidthChange={handleLeftWidthChange}
        />
      ) : null}
      {showRightResizeHandle && viewportWidthPx > 0 ? (
        <WorkspaceLayoutV2ResizeHandle
          currentWidthPx={
            isMobile ? mobileMetrics.rightWidthPx : desktopRightWidthPx
          }
          dataTestId="workspace-layout-v2-right-resize"
          minWidthPx={
            isMobile
              ? MOBILE_SIDEBAR_MIN_WIDTH_PX
              : DESKTOP_SIDEBAR_MIN_WIDTH_PX
          }
          maxWidthPx={
            isMobile ? 2_048 : getDesktopSidebarMaxWidthPx(viewportWidthPx)
          }
          positionPx={rightResizePositionPx}
          side="right"
          onResizeStart={() => {
            setActiveResizeSide("right");
          }}
          onResizeEnd={() => {
            setActiveResizeSide(null);
          }}
          onWidthChange={handleRightWidthChange}
        />
      ) : null}
    </div>
  );
}
