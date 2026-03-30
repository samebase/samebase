import * as React from "react";

type GestureTracePoint = {
  clientX: number;
  clientY: number;
  timeMs: number;
};

type GestureTraceInputType = "mouse" | "touch";

type GestureTraceSnapshot = {
  durationMs: number;
  inputType: GestureTraceInputType;
  isActive: boolean;
  pathPoints: GestureTracePoint[];
  peakAccelerationPxPerMs2: number;
  peakVelocityPxPerMs: number;
  releaseVelocityXPxPerMs: number;
  releaseVelocityYPxPerMs: number;
  totalDeltaXPx: number;
  totalDeltaYPx: number;
};

type ActiveGestureTrace = {
  inputType: GestureTraceInputType;
  lastPoint: GestureTracePoint;
  pathPoints: GestureTracePoint[];
  touchIdentifier?: number;
};

const RELEASE_VELOCITY_WINDOW_MS = 80;

function formatSignedNumber(value: number, fractionDigits: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(fractionDigits)}`;
}

function getEventTimeMs(event: Event): number {
  return typeof event.timeStamp === "number"
    ? event.timeStamp
    : performance.now();
}

function formatDurationMs(value: number): string {
  return `${Math.round(value / 5) * 5}ms`;
}

function clampPointToViewport(clientX: number, clientY: number) {
  const clampedClientX = Math.min(Math.max(clientX, 0), window.innerWidth);
  const clampedClientY = Math.min(Math.max(clientY, 0), window.innerHeight);
  return {
    clientX: clampedClientX,
    clientY: clampedClientY,
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

function getReleaseVelocityReferencePoint(
  pathPoints: readonly GestureTracePoint[],
  endPoint: GestureTracePoint,
) {
  const releaseWindowStartTimeMs = endPoint.timeMs - RELEASE_VELOCITY_WINDOW_MS;
  const releaseWindowPoints = pathPoints.filter(
    (point) => point.timeMs >= releaseWindowStartTimeMs,
  );
  const hasMeaningfulMovement = (candidatePoint: GestureTracePoint) =>
    Math.abs(endPoint.clientX - candidatePoint.clientX) > 0.5 ||
    Math.abs(endPoint.clientY - candidatePoint.clientY) > 0.5;

  return (
    releaseWindowPoints.find(hasMeaningfulMovement) ??
    [...pathPoints].reverse().find(hasMeaningfulMovement) ??
    pathPoints[0]
  );
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

function buildGestureTraceSnapshot(args: {
  inputType: GestureTraceInputType;
  isActive: boolean;
  pathPoints: GestureTracePoint[];
}): GestureTraceSnapshot {
  if (args.pathPoints.length === 0) {
    return {
      durationMs: 0,
      inputType: args.inputType,
      isActive: args.isActive,
      pathPoints: args.pathPoints,
      peakAccelerationPxPerMs2: 0,
      peakVelocityPxPerMs: 0,
      releaseVelocityXPxPerMs: 0,
      releaseVelocityYPxPerMs: 0,
      totalDeltaXPx: 0,
      totalDeltaYPx: 0,
    };
  }

  const startPoint = args.pathPoints[0];
  const endPoint = args.pathPoints[args.pathPoints.length - 1] ?? startPoint;
  const durationMs = Math.max(0, endPoint.timeMs - startPoint.timeMs);
  const totalDeltaXPx = endPoint.clientX - startPoint.clientX;
  const totalDeltaYPx = endPoint.clientY - startPoint.clientY;

  let peakVelocityPxPerMs = 0;
  let peakAccelerationPxPerMs2 = 0;
  const velocitySamples: Array<{
    timeMs: number;
    velocityXPxPerMs: number;
    velocityYPxPerMs: number;
  }> = [];

  for (let index = 1; index < args.pathPoints.length; index += 1) {
    const previousPoint = args.pathPoints[index - 1];
    const currentPoint = args.pathPoints[index];
    const elapsedMs = Math.max(1, currentPoint.timeMs - previousPoint.timeMs);
    const velocityXPxPerMs =
      (currentPoint.clientX - previousPoint.clientX) / elapsedMs;
    const velocityYPxPerMs =
      (currentPoint.clientY - previousPoint.clientY) / elapsedMs;
    const velocityPxPerMs = Math.hypot(velocityXPxPerMs, velocityYPxPerMs);

    velocitySamples.push({
      timeMs: currentPoint.timeMs,
      velocityXPxPerMs,
      velocityYPxPerMs,
    });
    peakVelocityPxPerMs = Math.max(peakVelocityPxPerMs, velocityPxPerMs);
  }

  const releaseWindowStartPoint = getReleaseVelocityReferencePoint(
    args.pathPoints,
    endPoint,
  );
  const releaseElapsedMs = Math.max(
    1,
    endPoint.timeMs - releaseWindowStartPoint.timeMs,
  );
  const releaseVelocityXPxPerMs =
    (endPoint.clientX - releaseWindowStartPoint.clientX) / releaseElapsedMs;
  const releaseVelocityYPxPerMs =
    (endPoint.clientY - releaseWindowStartPoint.clientY) / releaseElapsedMs;

  for (let index = 1; index < velocitySamples.length; index += 1) {
    const previousSample = velocitySamples[index - 1];
    const currentSample = velocitySamples[index];
    const elapsedMs = Math.max(1, currentSample.timeMs - previousSample.timeMs);
    const accelerationPxPerMs2 =
      Math.hypot(
        currentSample.velocityXPxPerMs - previousSample.velocityXPxPerMs,
        currentSample.velocityYPxPerMs - previousSample.velocityYPxPerMs,
      ) / elapsedMs;
    peakAccelerationPxPerMs2 = Math.max(
      peakAccelerationPxPerMs2,
      accelerationPxPerMs2,
    );
  }

  return {
    durationMs,
    inputType: args.inputType,
    isActive: args.isActive,
    pathPoints: args.pathPoints,
    peakAccelerationPxPerMs2,
    peakVelocityPxPerMs,
    releaseVelocityXPxPerMs,
    releaseVelocityYPxPerMs,
    totalDeltaXPx,
    totalDeltaYPx,
  };
}

export function GlobalGestureDebugOverlay() {
  const activeGestureRef = React.useRef<ActiveGestureTrace | null>(null);
  const [snapshot, setSnapshot] = React.useState<GestureTraceSnapshot | null>(
    null,
  );
  const [isSuppressedByWorkspaceSidebar, setIsSuppressedByWorkspaceSidebar] =
    React.useState(false);

  React.useEffect(() => {
    const updateSuppressionState = () => {
      setIsSuppressedByWorkspaceSidebar(
        document.querySelector(
          '[data-testid="workspace-sidebar-debug-overlay"]',
        ) !== null,
      );
    };

    updateSuppressionState();
    const observer = new MutationObserver(updateSuppressionState);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
    };
  }, []);

  const updateActiveSnapshot = React.useCallback(
    (pathPoints: GestureTracePoint[], inputType: GestureTraceInputType) => {
      setSnapshot(
        buildGestureTraceSnapshot({
          inputType,
          isActive: true,
          pathPoints,
        }),
      );
    },
    [],
  );

  const finalizeGesture = React.useCallback((point?: GestureTracePoint) => {
    const activeGesture = activeGestureRef.current;
    if (activeGesture === null) {
      return;
    }

    const finalPoint = point ?? activeGesture.lastPoint;
    const pathPoints =
      activeGesture.pathPoints.at(-1)?.timeMs === finalPoint.timeMs
        ? activeGesture.pathPoints
        : [...activeGesture.pathPoints, finalPoint];

    setSnapshot(
      buildGestureTraceSnapshot({
        inputType: activeGesture.inputType,
        isActive: false,
        pathPoints,
      }),
    );
    activeGestureRef.current = null;
  }, []);

  React.useEffect(() => {
    if (isSuppressedByWorkspaceSidebar) {
      activeGestureRef.current = null;
      setSnapshot(null);
      return;
    }

    const createPoint = (
      clientX: number,
      clientY: number,
      timeMs: number,
    ): GestureTracePoint => {
      const clampedPoint = clampPointToViewport(clientX, clientY);
      return {
        clientX: clampedPoint.clientX,
        clientY: clampedPoint.clientY,
        timeMs,
      };
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        finalizeGesture();
        return;
      }

      const touch = event.touches.item(0);
      if (touch === null) {
        return;
      }

      const point = createPoint(
        touch.clientX,
        touch.clientY,
        getEventTimeMs(event),
      );
      activeGestureRef.current = {
        inputType: "touch",
        lastPoint: point,
        pathPoints: [point],
        touchIdentifier: touch.identifier,
      };
      updateActiveSnapshot([point], "touch");
    };

    const handleTouchMove = (event: TouchEvent) => {
      const activeGesture = activeGestureRef.current;
      if (activeGesture === null || activeGesture.inputType !== "touch") {
        return;
      }

      const touch = findTouchByIdentifier(
        event.touches,
        activeGesture.touchIdentifier ?? -1,
      );
      if (touch === null) {
        return;
      }

      if (isPointOutsideViewport(touch.clientX, touch.clientY)) {
        finalizeGesture(
          createPoint(touch.clientX, touch.clientY, getEventTimeMs(event)),
        );
        return;
      }

      const point = createPoint(
        touch.clientX,
        touch.clientY,
        getEventTimeMs(event),
      );
      const pathPoints = [...activeGesture.pathPoints, point];
      activeGesture.lastPoint = point;
      activeGesture.pathPoints = pathPoints;
      updateActiveSnapshot(pathPoints, "touch");
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const activeGesture = activeGestureRef.current;
      if (activeGesture === null || activeGesture.inputType !== "touch") {
        return;
      }

      const touch =
        findTouchByIdentifier(
          event.changedTouches,
          activeGesture.touchIdentifier ?? -1,
        ) ??
        findTouchByIdentifier(
          event.touches,
          activeGesture.touchIdentifier ?? -1,
        );
      finalizeGesture(
        touch === null
          ? undefined
          : createPoint(touch.clientX, touch.clientY, getEventTimeMs(event)),
      );
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      const point = createPoint(
        event.clientX,
        event.clientY,
        getEventTimeMs(event),
      );
      activeGestureRef.current = {
        inputType: "mouse",
        lastPoint: point,
        pathPoints: [point],
      };
      updateActiveSnapshot([point], "mouse");
    };

    const handleMouseMove = (event: MouseEvent) => {
      const activeGesture = activeGestureRef.current;
      if (activeGesture === null || activeGesture.inputType !== "mouse") {
        return;
      }

      if (isPointOutsideViewport(event.clientX, event.clientY)) {
        finalizeGesture(
          createPoint(event.clientX, event.clientY, getEventTimeMs(event)),
        );
        return;
      }

      const point = createPoint(
        event.clientX,
        event.clientY,
        getEventTimeMs(event),
      );
      const pathPoints = [...activeGesture.pathPoints, point];
      activeGesture.lastPoint = point;
      activeGesture.pathPoints = pathPoints;
      updateActiveSnapshot(pathPoints, "mouse");
    };

    const handleMouseUp = (event: MouseEvent) => {
      const activeGesture = activeGestureRef.current;
      if (activeGesture === null || activeGesture.inputType !== "mouse") {
        return;
      }

      finalizeGesture(
        createPoint(event.clientX, event.clientY, getEventTimeMs(event)),
      );
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    window.addEventListener("mousedown", handleMouseDown, { passive: true });
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseup", handleMouseUp, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [finalizeGesture, isSuppressedByWorkspaceSidebar, updateActiveSnapshot]);

  const path = (snapshot?.pathPoints ?? [])
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.clientX.toFixed(1)} ${point.clientY.toFixed(1)}`,
    )
    .join(" ");
  const startPoint = snapshot?.pathPoints[0] ?? null;
  const endPoint = snapshot?.pathPoints.at(-1) ?? null;
  const statusLabel =
    snapshot === null
      ? "armed, waiting for gesture"
      : snapshot.isActive
        ? "capturing"
        : "captured";

  if (isSuppressedByWorkspaceSidebar) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      data-testid="global-gesture-debug-overlay"
      data-debug-active={snapshot?.isActive ? "true" : "false"}
      className="pointer-events-none fixed inset-0 z-[10001]"
    >
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {path.length > 0 ? (
          <path
            d={path}
            fill="none"
            stroke="rgb(59 130 246)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.95}
            strokeWidth={4}
          />
        ) : null}
        {(snapshot?.pathPoints ?? []).map((point, index) => (
          <circle
            key={`${point.timeMs}-${index}`}
            cx={point.clientX}
            cy={point.clientY}
            fill="rgb(147 197 253 / 0.5)"
            r={2.5}
          />
        ))}
        {startPoint !== null ? (
          <circle
            cx={startPoint.clientX}
            cy={startPoint.clientY}
            fill="rgb(34 197 94)"
            r={7}
          />
        ) : null}
        {endPoint !== null ? (
          <circle
            cx={endPoint.clientX}
            cy={endPoint.clientY}
            fill="rgb(239 68 68)"
            r={7}
          />
        ) : null}
      </svg>
      <div className="absolute right-2 top-2 max-w-[18rem] border border-black/70 bg-black/85 px-2 py-2 font-mono text-[10px] leading-4 text-white shadow-lg">
        <div>debug: on</div>
        <div>scope: viewport trace</div>
        <div>state: {statusLabel}</div>
        <div>input: {snapshot?.inputType ?? "none"}</div>
        {snapshot !== null ? (
          <div>duration: {formatDurationMs(snapshot.durationMs)}</div>
        ) : null}
        {snapshot !== null ? (
          <div>samples: {snapshot.pathPoints.length}</div>
        ) : null}
        {snapshot !== null ? (
          <div>dx: {formatSignedNumber(snapshot.totalDeltaXPx, 1)}px</div>
        ) : null}
        {snapshot !== null ? (
          <div>dy: {formatSignedNumber(snapshot.totalDeltaYPx, 1)}px</div>
        ) : null}
        {snapshot !== null ? (
          <div>
            release vx:{" "}
            {formatSignedNumber(snapshot.releaseVelocityXPxPerMs, 2)}
            px/ms
          </div>
        ) : null}
        {snapshot !== null ? (
          <div>
            release vy:{" "}
            {formatSignedNumber(snapshot.releaseVelocityYPxPerMs, 2)}
            px/ms
          </div>
        ) : null}
        {snapshot !== null ? (
          <div>
            peak v: {formatSignedNumber(snapshot.peakVelocityPxPerMs, 2)} px/ms
          </div>
        ) : null}
        {snapshot !== null ? (
          <div>
            peak a: {formatSignedNumber(snapshot.peakAccelerationPxPerMs2, 2)}{" "}
            px/ms²
          </div>
        ) : null}
        {snapshot === null ? (
          <div>drag anywhere on the screen to leave a trace</div>
        ) : null}
      </div>
    </div>
  );
}
