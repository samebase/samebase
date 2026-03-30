import type { MobileSidebarPane } from "@/hooks/use-sidebar";
import { hasQueryParam } from "@/lib/queryParams";
import type { MobilePaneReleaseGesture } from "@/lib/workspaceSidebar";

export const MOBILE_SIDEBAR_DEBUG_QUERY_PARAM = "swipe-debug";

export type MobileSidebarGestureDebugPoint = {
  clientX: number;
  clientY: number;
  localX: number;
  localY: number;
  timeMs: number;
};

export type MobileSidebarGestureDebugSnapshot = {
  crossSwipeRequiredTravelPx: number | null;
  crossSwipeTravelTowardOppositePx: number | null;
  crossSwipeVelocityThresholdPxPerMs: number | null;
  crossSwipeVelocityTowardOppositePxPerMs: number | null;
  durationMs: number;
  isActive: boolean;
  nearestPaneAtSettle: MobileSidebarPane | null;
  pathPoints: MobileSidebarGestureDebugPoint[];
  peakFingerAccelerationXPxPerMs2: number;
  peakFingerVelocityXPxPerMs: number;
  releaseFingerVelocityXPxPerMs: number;
  releasePromotedToOpposite: boolean;
  sampleCount: number;
  settledPane: MobileSidebarPane | null;
  startPane: MobileSidebarPane;
  totalFingerDeltaXPx: number;
  totalFingerDeltaYPx: number;
};

export function isMobileSidebarDebugEnabled(
  search: string | URLSearchParams | undefined,
): boolean {
  return hasQueryParam(search, MOBILE_SIDEBAR_DEBUG_QUERY_PARAM);
}

export function buildMobileSidebarGestureDebugSnapshot(args: {
  crossSwipeRequiredTravelPx?: number | null;
  crossSwipeTravelTowardOppositePx?: number | null;
  crossSwipeVelocityThresholdPxPerMs?: number | null;
  crossSwipeVelocityTowardOppositePxPerMs?: number | null;
  isActive: boolean;
  nearestPaneAtSettle?: MobileSidebarPane | null;
  pathPoints: MobileSidebarGestureDebugPoint[];
  releaseGesture?: MobilePaneReleaseGesture | null;
  releasePromotedToOpposite?: boolean;
  settledPane?: MobileSidebarPane | null;
  startPane: MobileSidebarPane;
}): MobileSidebarGestureDebugSnapshot {
  if (args.pathPoints.length === 0) {
    return {
      crossSwipeRequiredTravelPx: args.crossSwipeRequiredTravelPx ?? null,
      crossSwipeTravelTowardOppositePx:
        args.crossSwipeTravelTowardOppositePx ?? null,
      crossSwipeVelocityThresholdPxPerMs:
        args.crossSwipeVelocityThresholdPxPerMs ?? null,
      crossSwipeVelocityTowardOppositePxPerMs:
        args.crossSwipeVelocityTowardOppositePxPerMs ?? null,
      durationMs: 0,
      isActive: args.isActive,
      nearestPaneAtSettle: args.nearestPaneAtSettle ?? null,
      pathPoints: args.pathPoints,
      peakFingerAccelerationXPxPerMs2: 0,
      peakFingerVelocityXPxPerMs: 0,
      releaseFingerVelocityXPxPerMs:
        args.releaseGesture?.releaseFingerVelocityXPxPerMs ?? 0,
      releasePromotedToOpposite: args.releasePromotedToOpposite ?? false,
      sampleCount: 0,
      settledPane: args.settledPane ?? null,
      startPane: args.startPane,
      totalFingerDeltaXPx: 0,
      totalFingerDeltaYPx: 0,
    };
  }

  const startPoint = args.pathPoints[0];
  const endPoint = args.pathPoints[args.pathPoints.length - 1] ?? startPoint;
  const durationMs = Math.max(0, endPoint.timeMs - startPoint.timeMs);
  const totalFingerDeltaXPx = endPoint.clientX - startPoint.clientX;
  const totalFingerDeltaYPx = endPoint.clientY - startPoint.clientY;

  let peakFingerVelocityXPxPerMs = 0;
  let peakFingerAccelerationXPxPerMs2 = 0;
  const velocitySamples: Array<{ timeMs: number; velocityXPxPerMs: number }> =
    [];

  for (let index = 1; index < args.pathPoints.length; index += 1) {
    const previousPoint = args.pathPoints[index - 1];
    const currentPoint = args.pathPoints[index];
    const elapsedMs = Math.max(1, currentPoint.timeMs - previousPoint.timeMs);
    const velocityXPxPerMs =
      (currentPoint.clientX - previousPoint.clientX) / elapsedMs;
    velocitySamples.push({ timeMs: currentPoint.timeMs, velocityXPxPerMs });
    peakFingerVelocityXPxPerMs = Math.max(
      peakFingerVelocityXPxPerMs,
      Math.abs(velocityXPxPerMs),
    );
  }

  for (let index = 1; index < velocitySamples.length; index += 1) {
    const previousVelocitySample = velocitySamples[index - 1];
    const currentVelocitySample = velocitySamples[index];
    const elapsedMs = Math.max(
      1,
      currentVelocitySample.timeMs - previousVelocitySample.timeMs,
    );
    const accelerationXPxPerMs2 =
      (currentVelocitySample.velocityXPxPerMs -
        previousVelocitySample.velocityXPxPerMs) /
      elapsedMs;
    peakFingerAccelerationXPxPerMs2 = Math.max(
      peakFingerAccelerationXPxPerMs2,
      Math.abs(accelerationXPxPerMs2),
    );
  }

  return {
    crossSwipeRequiredTravelPx: args.crossSwipeRequiredTravelPx ?? null,
    crossSwipeTravelTowardOppositePx:
      args.crossSwipeTravelTowardOppositePx ?? null,
    crossSwipeVelocityThresholdPxPerMs:
      args.crossSwipeVelocityThresholdPxPerMs ?? null,
    crossSwipeVelocityTowardOppositePxPerMs:
      args.crossSwipeVelocityTowardOppositePxPerMs ?? null,
    durationMs,
    isActive: args.isActive,
    nearestPaneAtSettle: args.nearestPaneAtSettle ?? null,
    pathPoints: args.pathPoints,
    peakFingerAccelerationXPxPerMs2,
    peakFingerVelocityXPxPerMs,
    releaseFingerVelocityXPxPerMs:
      args.releaseGesture?.releaseFingerVelocityXPxPerMs ?? 0,
    releasePromotedToOpposite: args.releasePromotedToOpposite ?? false,
    sampleCount: args.pathPoints.length,
    settledPane: args.settledPane ?? null,
    startPane: args.startPane,
    totalFingerDeltaXPx,
    totalFingerDeltaYPx,
  };
}
