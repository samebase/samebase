import type { MobileSidebarPane } from "@/hooks/use-sidebar";
import type { MobileSidebarGestureDebugSnapshot } from "@/lib/mobileSidebarGestureDebug";

function formatSignedNumber(value: number, fractionDigits: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(fractionDigits)}`;
}

export function MobileSidebarGestureDebugOverlay({
  currentPane,
  isMobile,
  snapshot,
}: {
  currentPane: MobileSidebarPane;
  isMobile: boolean;
  snapshot: MobileSidebarGestureDebugSnapshot | null;
}) {
  const path = (snapshot?.pathPoints ?? [])
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.localX.toFixed(1)} ${point.localY.toFixed(1)}`,
    )
    .join(" ");
  const startPoint = snapshot?.pathPoints[0] ?? null;
  const endPoint = snapshot?.pathPoints.at(-1) ?? null;
  const statusLabel = !isMobile
    ? "waiting for mobile layout"
    : snapshot === null
      ? "armed, waiting for swipe"
      : snapshot.isActive
        ? "capturing"
        : "captured";

  return (
    <div
      aria-hidden="true"
      data-testid="workspace-sidebar-debug-overlay"
      data-debug-active={snapshot?.isActive ? "true" : "false"}
      data-debug-settled-pane={snapshot?.settledPane ?? "pending"}
      data-debug-start-pane={snapshot?.startPane ?? currentPane}
      className="pointer-events-none absolute inset-0 z-30"
    >
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {path.length > 0 ? (
          <path
            d={path}
            fill="none"
            stroke="rgb(249 115 22)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.95}
            strokeWidth={3}
          />
        ) : null}
        {(snapshot?.pathPoints ?? []).map((point, index) => (
          <circle
            key={`${point.timeMs}-${index}`}
            cx={point.localX}
            cy={point.localY}
            fill="rgb(253 186 116 / 0.55)"
            r={2}
          />
        ))}
        {startPoint !== null ? (
          <circle
            cx={startPoint.localX}
            cy={startPoint.localY}
            fill="rgb(34 197 94)"
            r={6}
          />
        ) : null}
        {endPoint !== null ? (
          <circle
            cx={endPoint.localX}
            cy={endPoint.localY}
            fill="rgb(239 68 68)"
            r={6}
          />
        ) : null}
      </svg>

      <div className="absolute left-2 top-2 max-w-[16rem] border border-black/70 bg-black/80 px-2 py-2 font-mono text-[10px] leading-4 text-white shadow-lg">
        <div>debug: on</div>
        <div>layout: {isMobile ? "mobile" : "desktop"}</div>
        <div>pane: {currentPane}</div>
        <div>state: {statusLabel}</div>
        {snapshot !== null ? <div>start: {snapshot.startPane}</div> : null}
        {snapshot !== null ? (
          <div>nearest: {snapshot.nearestPaneAtSettle ?? "pending"}</div>
        ) : null}
        {snapshot !== null ? (
          <div>settled: {snapshot.settledPane ?? "pending"}</div>
        ) : null}
        {snapshot !== null ? (
          <div>
            promoted: {snapshot.releasePromotedToOpposite ? "yes" : "no"}
          </div>
        ) : null}
        {snapshot !== null ? (
          <div>duration: {snapshot.durationMs.toFixed(0)}ms</div>
        ) : null}
        {snapshot !== null ? <div>samples: {snapshot.sampleCount}</div> : null}
        {snapshot !== null ? (
          <div>dx: {formatSignedNumber(snapshot.totalFingerDeltaXPx, 1)}px</div>
        ) : null}
        {snapshot !== null ? (
          <div>dy: {formatSignedNumber(snapshot.totalFingerDeltaYPx, 1)}px</div>
        ) : null}
        {snapshot?.crossSwipeRequiredTravelPx !== null && snapshot !== null ? (
          <div>
            far dx:{" "}
            {formatSignedNumber(
              snapshot.crossSwipeTravelTowardOppositePx ?? 0,
              1,
            )}
            /{snapshot.crossSwipeRequiredTravelPx.toFixed(1)}px
          </div>
        ) : null}
        {snapshot !== null ? (
          <div>
            release vx:{" "}
            {formatSignedNumber(snapshot.releaseFingerVelocityXPxPerMs, 3)}
            px/ms
          </div>
        ) : null}
        {snapshot?.crossSwipeVelocityThresholdPxPerMs !== null &&
        snapshot !== null ? (
          <div>
            far vx:{" "}
            {formatSignedNumber(
              snapshot.crossSwipeVelocityTowardOppositePxPerMs ?? 0,
              3,
            )}
            /{snapshot.crossSwipeVelocityThresholdPxPerMs.toFixed(3)} px/ms
          </div>
        ) : null}
        {snapshot !== null ? (
          <div>
            peak vx:{" "}
            {formatSignedNumber(snapshot.peakFingerVelocityXPxPerMs, 3)}
            px/ms
          </div>
        ) : null}
        {snapshot !== null ? (
          <div>
            peak ax:{" "}
            {formatSignedNumber(snapshot.peakFingerAccelerationXPxPerMs2, 4)}
            px/ms²
          </div>
        ) : null}
        {snapshot === null ? (
          <div>
            {isMobile
              ? "drag horizontally to capture telemetry"
              : "resize to mobile to capture telemetry"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
