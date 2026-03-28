import * as React from "react";

const DEFAULT_DRAWER_WIDTH_PX = 18 * 16;
const DRAWER_VIEWPORT_GUTTER_PX = 32;
const DRAG_COMMIT_THRESHOLD = 0.5;
const DRAG_INTENT_THRESHOLD_PX = 12;
const DRAG_VELOCITY_THRESHOLD_PX_PER_MS = 0.45;
const MOBILE_SIDEBAR_CLOSE_HANDLE_WIDTH_PX = 24;
const MOBILE_SIDEBAR_DRAG_START_MAX_X_PX = 160;
const DEFAULT_VIEWPORT_WIDTH_PX =
  DEFAULT_DRAWER_WIDTH_PX + DRAWER_VIEWPORT_GUTTER_PX;

type DragIntent = "pending" | "dragging";
type DragInput = "pointer" | "touch";

type DragSession = {
  captureTarget: EventTarget | null;
  input: DragInput;
  intent: DragIntent;
  lastTimeMs: number;
  lastX: number;
  sessionId: number;
  revealPx: number;
  startRevealPx: number;
  startX: number;
  startY: number;
  velocityPxPerMs: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getViewportWidthPx() {
  if (typeof window === "undefined") {
    return DEFAULT_VIEWPORT_WIDTH_PX;
  }

  return window.innerWidth;
}

function releasePointerCapture(
  target: EventTarget | null,
  pointerId: number | null,
) {
  if (pointerId === null) {
    return;
  }
  if (!(target instanceof Element)) {
    return;
  }
  if (!target.hasPointerCapture(pointerId)) {
    return;
  }
  target.releasePointerCapture(pointerId);
}

/**
 * Tracks a transient reveal amount for the mobile sidebar so the drawer can
 * follow the pointer before the boolean `openMobile` state commits.
 */
export function useMobileSidebarDrag({
  enabled = true,
  open,
  onOpenChange,
}: {
  enabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sessionRef = React.useRef<DragSession | null>(null);
  const [drawerWidthPx, setDrawerWidthPx] = React.useState(
    DEFAULT_DRAWER_WIDTH_PX,
  );
  const [viewportWidthPx, setViewportWidthPx] =
    React.useState(getViewportWidthPx);
  const [isDragging, setIsDragging] = React.useState(false);
  const [revealPx, setRevealPx] = React.useState(
    enabled && open ? DEFAULT_DRAWER_WIDTH_PX : 0,
  );

  React.useEffect(() => {
    const updateDrawerWidth = () => {
      const nextViewportWidthPx = getViewportWidthPx();
      setViewportWidthPx(nextViewportWidthPx);
      setDrawerWidthPx(
        Math.max(
          0,
          Math.min(
            DEFAULT_DRAWER_WIDTH_PX,
            nextViewportWidthPx - DRAWER_VIEWPORT_GUTTER_PX,
          ),
        ),
      );
    };

    updateDrawerWidth();
    window.addEventListener("resize", updateDrawerWidth);
    return () => window.removeEventListener("resize", updateDrawerWidth);
  }, []);

  React.useEffect(() => {
    if (!enabled) {
      sessionRef.current = null;
      setIsDragging(false);
      setRevealPx(0);
      return;
    }
    if (isDragging) {
      return;
    }

    setRevealPx(open ? drawerWidthPx : 0);
  }, [drawerWidthPx, enabled, isDragging, open]);

  const completeDrag = React.useCallback(
    (
      target: EventTarget | null,
      pointerId: number | null,
      finalRevealPx?: number,
    ) => {
      const session = sessionRef.current;
      sessionRef.current = null;
      setIsDragging(false);

      if (!session) {
        return;
      }

      const releaseTarget = target ?? session.captureTarget;
      const releasePointerId =
        pointerId ?? (session.input === "pointer" ? session.sessionId : null);

      releasePointerCapture(releaseTarget, releasePointerId);

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
    },
    [drawerWidthPx, onOpenChange],
  );

  const beginDragSession = React.useCallback(
    ({
      captureTarget,
      input,
      sessionId,
      startRevealPx,
      startX,
      startY,
    }: {
      input: DragInput;
      sessionId: number;
      startRevealPx: number;
      captureTarget: EventTarget | null;
      startX: number;
      startY: number;
    }) => {
      if (sessionRef.current) {
        return;
      }
      sessionRef.current = {
        captureTarget,
        input,
        intent: "pending",
        lastTimeMs: performance.now(),
        lastX: startX,
        sessionId,
        revealPx: startRevealPx,
        startRevealPx,
        startX,
        startY,
        velocityPxPerMs: 0,
      };
    },
    [],
  );

  const updateDrag = React.useCallback(
    (
      {
        currentX,
        currentY,
        target,
        pointerId,
      }: {
        currentX: number;
        currentY: number;
        target: EventTarget | null;
        pointerId: number | null;
      },
      preventDefault?: () => void,
    ) => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }

      const deltaX = currentX - session.startX;
      const deltaY = currentY - session.startY;

      if (session.intent === "pending") {
        if (
          Math.abs(deltaX) < DRAG_INTENT_THRESHOLD_PX &&
          Math.abs(deltaY) < DRAG_INTENT_THRESHOLD_PX
        ) {
          return;
        }

        if (Math.abs(deltaY) > Math.abs(deltaX)) {
          completeDrag(target, pointerId, session.startRevealPx);
          return;
        }

        session.intent = "dragging";
        setIsDragging(true);
      }

      preventDefault?.();

      const nextRevealPx = clamp(
        session.startRevealPx + deltaX,
        0,
        drawerWidthPx,
      );
      const nowMs = performance.now();
      const elapsedMs = Math.max(nowMs - session.lastTimeMs, 1);

      session.velocityPxPerMs = (currentX - session.lastX) / elapsedMs;
      session.lastTimeMs = nowMs;
      session.lastX = currentX;
      session.revealPx = nextRevealPx;
      setRevealPx(nextRevealPx);
    },
    [completeDrag, drawerWidthPx],
  );

  function beginDrag(
    event: React.PointerEvent<HTMLDivElement>,
    startRevealPx: number,
  ) {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    beginDragSession({
      input: "pointer",
      sessionId: event.pointerId,
      startRevealPx,
      captureTarget: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const session = sessionRef.current;
    if (
      !session ||
      session.input !== "pointer" ||
      session.sessionId !== event.pointerId
    ) {
      return;
    }

    updateDrag(
      {
        currentX: event.clientX,
        currentY: event.clientY,
        target: event.currentTarget,
        pointerId: event.pointerId,
      },
      () => {
        if (event.cancelable) {
          event.preventDefault();
        }
      },
    );
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const session = sessionRef.current;
    if (
      !session ||
      session.input !== "pointer" ||
      session.sessionId !== event.pointerId
    ) {
      return;
    }

    completeDrag(event.currentTarget, event.pointerId);
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    const session = sessionRef.current;
    if (
      !session ||
      session.input !== "pointer" ||
      session.sessionId !== event.pointerId
    ) {
      return;
    }

    completeDrag(
      event.currentTarget,
      event.pointerId,
      open ? drawerWidthPx : 0,
    );
  }

  React.useEffect(() => {
    if (!enabled || open) {
      return;
    }

    const dragStartMaxXPx = Math.min(
      MOBILE_SIDEBAR_DRAG_START_MAX_X_PX,
      drawerWidthPx / 2,
    );

    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (
        sessionRef.current ||
        !event.isPrimary ||
        event.button !== 0 ||
        event.clientX > dragStartMaxXPx
      ) {
        return;
      }

      if (event.target instanceof Element) {
        event.target.setPointerCapture(event.pointerId);
      }
      if (event.cancelable) {
        event.preventDefault();
      }

      beginDragSession({
        input: "pointer",
        sessionId: event.pointerId,
        startRevealPx: 0,
        captureTarget: event.target,
        startX: event.clientX,
        startY: event.clientY,
      });
    };

    const handleDocumentPointerMove = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (
        !session ||
        session.input !== "pointer" ||
        session.sessionId !== event.pointerId
      ) {
        return;
      }

      updateDrag(
        {
          currentX: event.clientX,
          currentY: event.clientY,
          target: null,
          pointerId: null,
        },
        () => {
          if (event.cancelable) {
            event.preventDefault();
          }
        },
      );
    };

    const handleDocumentPointerUp = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (
        !session ||
        session.input !== "pointer" ||
        session.sessionId !== event.pointerId
      ) {
        return;
      }

      completeDrag(null, null);
    };

    const handleDocumentPointerCancel = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (
        !session ||
        session.input !== "pointer" ||
        session.sessionId !== event.pointerId
      ) {
        return;
      }

      completeDrag(null, null, 0);
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("pointermove", handleDocumentPointerMove, {
      capture: true,
      passive: false,
    });
    document.addEventListener("pointerup", handleDocumentPointerUp, true);
    document.addEventListener(
      "pointercancel",
      handleDocumentPointerCancel,
      true,
    );

    const findTrackedTouch = (touchList: TouchList) => {
      const session = sessionRef.current;
      if (!session || session.input !== "touch") {
        return null;
      }

      for (const touch of Array.from(touchList)) {
        if (touch.identifier === session.sessionId) {
          return touch;
        }
      }

      return null;
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (sessionRef.current || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      if (touch.clientX > dragStartMaxXPx) {
        return;
      }

      beginDragSession({
        input: "touch",
        sessionId: touch.identifier,
        startRevealPx: 0,
        captureTarget: null,
        startX: touch.clientX,
        startY: touch.clientY,
      });
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = findTrackedTouch(event.touches);
      if (!touch) {
        return;
      }

      updateDrag(
        {
          currentX: touch.clientX,
          currentY: touch.clientY,
          target: null,
          pointerId: null,
        },
        () => {
          if (event.cancelable) {
            event.preventDefault();
          }
        },
      );
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }

      if (session.input === "pointer") {
        if (event.changedTouches.length === 0) {
          return;
        }
        completeDrag(null, null);
        return;
      }

      const touch = findTrackedTouch(event.changedTouches);
      if (!touch) {
        return;
      }

      completeDrag(null, null);
    };

    const handleTouchCancel = (event: TouchEvent) => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }

      if (session.input === "pointer") {
        if (event.changedTouches.length === 0) {
          return;
        }
        completeDrag(null, null, 0);
        return;
      }

      const touch = findTrackedTouch(event.changedTouches);
      if (!touch) {
        return;
      }

      completeDrag(null, null, 0);
    };

    document.addEventListener("touchstart", handleTouchStart, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchmove", handleTouchMove, {
      capture: true,
      passive: false,
    });
    document.addEventListener("touchend", handleTouchEnd, true);
    document.addEventListener("touchcancel", handleTouchCancel, true);

    return () => {
      document.removeEventListener(
        "pointerdown",
        handleDocumentPointerDown,
        true,
      );
      document.removeEventListener(
        "pointermove",
        handleDocumentPointerMove,
        true,
      );
      document.removeEventListener("pointerup", handleDocumentPointerUp, true);
      document.removeEventListener(
        "pointercancel",
        handleDocumentPointerCancel,
        true,
      );
      document.removeEventListener("touchstart", handleTouchStart, true);
      document.removeEventListener("touchmove", handleTouchMove, true);
      document.removeEventListener("touchend", handleTouchEnd, true);
      document.removeEventListener("touchcancel", handleTouchCancel, true);
    };
  }, [
    beginDragSession,
    completeDrag,
    drawerWidthPx,
    enabled,
    open,
    updateDrag,
  ]);

  const revealProgress = drawerWidthPx === 0 ? 0 : revealPx / drawerWidthPx;
  const trackStyle = {
    transform: `translateX(${revealPx - drawerWidthPx}px)`,
    transition: isDragging ? "none" : "transform 200ms ease",
  } satisfies React.CSSProperties;

  return {
    closeHandleWidthPx: MOBILE_SIDEBAR_CLOSE_HANDLE_WIDTH_PX,
    drawerWidthPx,
    onCloseHandlePointerCancel: handlePointerCancel,
    onCloseHandlePointerDown: (event: React.PointerEvent<HTMLDivElement>) =>
      beginDrag(event, drawerWidthPx),
    onCloseHandlePointerMove: handlePointerMove,
    onCloseHandlePointerUp: handlePointerUp,
    revealProgress,
    trackStyle,
    viewportWidthPx,
  };
}
