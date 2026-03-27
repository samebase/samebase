import * as React from "react";

const DEFAULT_DRAWER_WIDTH_PX = 18 * 16;
const DRAWER_VIEWPORT_GUTTER_PX = 32;
const DRAG_COMMIT_THRESHOLD = 0.5;
const DRAG_INTENT_THRESHOLD_PX = 12;
const DRAG_VELOCITY_THRESHOLD_PX_PER_MS = 0.45;
const MOBILE_SIDEBAR_EDGE_HANDLE_WIDTH_PX = 20;
const MOBILE_SIDEBAR_CLOSE_HANDLE_WIDTH_PX = 24;

type DragIntent = "pending" | "dragging";

type DragSession = {
  intent: DragIntent;
  lastTimeMs: number;
  lastX: number;
  pointerId: number;
  revealPx: number;
  startRevealPx: number;
  startX: number;
  startY: number;
  velocityPxPerMs: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Tracks a transient reveal amount for the mobile sidebar so the drawer can
 * follow the pointer before the boolean `openMobile` state commits.
 */
export function useMobileSidebarDrag({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sessionRef = React.useRef<DragSession | null>(null);
  const [drawerWidthPx, setDrawerWidthPx] = React.useState(
    DEFAULT_DRAWER_WIDTH_PX,
  );
  const [isDragging, setIsDragging] = React.useState(false);
  const [revealPx, setRevealPx] = React.useState(
    open ? DEFAULT_DRAWER_WIDTH_PX : 0,
  );

  React.useEffect(() => {
    const updateDrawerWidth = () => {
      setDrawerWidthPx(
        Math.max(
          0,
          Math.min(
            DEFAULT_DRAWER_WIDTH_PX,
            window.innerWidth - DRAWER_VIEWPORT_GUTTER_PX,
          ),
        ),
      );
    };

    updateDrawerWidth();
    window.addEventListener("resize", updateDrawerWidth);
    return () => window.removeEventListener("resize", updateDrawerWidth);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      return;
    }

    setRevealPx(open ? drawerWidthPx : 0);
  }, [drawerWidthPx, isDragging, open]);

  function releasePointerCapture(
    target: EventTarget | null,
    pointerId: number,
  ) {
    if (!(target instanceof Element)) {
      return;
    }
    if (!target.hasPointerCapture(pointerId)) {
      return;
    }
    target.releasePointerCapture(pointerId);
  }

  function completeDrag(
    target: EventTarget | null,
    pointerId: number,
    finalRevealPx?: number,
  ) {
    releasePointerCapture(target, pointerId);

    const session = sessionRef.current;
    sessionRef.current = null;
    setIsDragging(false);

    if (!session) {
      return;
    }

    const resolvedRevealPx = clamp(
      finalRevealPx ?? session.revealPx,
      0,
      drawerWidthPx,
    );
    const revealProgress =
      drawerWidthPx === 0 ? 0 : resolvedRevealPx / drawerWidthPx;
    const shouldOpen =
      session.velocityPxPerMs > DRAG_VELOCITY_THRESHOLD_PX_PER_MS
        ? true
        : session.velocityPxPerMs < -DRAG_VELOCITY_THRESHOLD_PX_PER_MS
          ? false
          : revealProgress >= DRAG_COMMIT_THRESHOLD;

    setRevealPx(shouldOpen ? drawerWidthPx : 0);
    onOpenChange(shouldOpen);
  }

  function beginDrag(
    event: React.PointerEvent<HTMLDivElement>,
    startRevealPx: number,
  ) {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    sessionRef.current = {
      intent: "pending",
      lastTimeMs: performance.now(),
      lastX: event.clientX,
      pointerId: event.pointerId,
      revealPx: startRevealPx,
      startRevealPx,
      startX: event.clientX,
      startY: event.clientY,
      velocityPxPerMs: 0,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;

    if (session.intent === "pending") {
      if (
        Math.abs(deltaX) < DRAG_INTENT_THRESHOLD_PX &&
        Math.abs(deltaY) < DRAG_INTENT_THRESHOLD_PX
      ) {
        return;
      }

      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        completeDrag(
          event.currentTarget,
          event.pointerId,
          session.startRevealPx,
        );
        return;
      }

      session.intent = "dragging";
      setIsDragging(true);
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    const nextRevealPx = clamp(
      session.startRevealPx + deltaX,
      0,
      drawerWidthPx,
    );
    const nowMs = performance.now();
    const elapsedMs = Math.max(nowMs - session.lastTimeMs, 1);

    session.velocityPxPerMs = (event.clientX - session.lastX) / elapsedMs;
    session.lastTimeMs = nowMs;
    session.lastX = event.clientX;
    session.revealPx = nextRevealPx;
    setRevealPx(nextRevealPx);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    completeDrag(event.currentTarget, event.pointerId);
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    completeDrag(
      event.currentTarget,
      event.pointerId,
      open ? drawerWidthPx : 0,
    );
  }

  const revealProgress = drawerWidthPx === 0 ? 0 : revealPx / drawerWidthPx;
  const drawerStyle = {
    transform: `translateX(${revealPx - drawerWidthPx}px)`,
    transition: isDragging ? "none" : "transform 200ms ease",
    width: `${drawerWidthPx}px`,
  } satisfies React.CSSProperties;

  return {
    closeHandleWidthPx: MOBILE_SIDEBAR_CLOSE_HANDLE_WIDTH_PX,
    drawerStyle,
    drawerWidthPx,
    edgeHandleWidthPx: MOBILE_SIDEBAR_EDGE_HANDLE_WIDTH_PX,
    isDragging,
    onCloseHandlePointerCancel: handlePointerCancel,
    onCloseHandlePointerDown: (event: React.PointerEvent<HTMLDivElement>) =>
      beginDrag(event, drawerWidthPx),
    onCloseHandlePointerMove: handlePointerMove,
    onCloseHandlePointerUp: handlePointerUp,
    onOpenHandlePointerCancel: handlePointerCancel,
    onOpenHandlePointerDown: (event: React.PointerEvent<HTMLDivElement>) =>
      beginDrag(event, 0),
    onOpenHandlePointerMove: handlePointerMove,
    onOpenHandlePointerUp: handlePointerUp,
    overlayOpacity: revealProgress * 0.8,
    revealProgress,
  };
}
