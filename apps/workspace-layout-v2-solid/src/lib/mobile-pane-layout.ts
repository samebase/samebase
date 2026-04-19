export type PaneQueueMetrics = {
  paneCount: number;
  paneWidthsPx: readonly number[];
  viewportWidthPx: number;
};

const MOBILE_COMMIT_RATIO = 0.25;
const MOBILE_COMMIT_MIN_PX = 56;
const MOBILE_COMMIT_MAX_PX = 136;
const MOBILE_VELOCITY_COMMIT_THRESHOLD_PX_PER_MS = 0.45;

function clampNumber(value: number, minValue: number, maxValue: number) {
  return Math.max(minValue, Math.min(value, maxValue));
}

function getCommitThresholdPx(distancePx: number) {
  if (distancePx <= 0) {
    return 0;
  }

  return clampNumber(
    Math.round(distancePx * MOBILE_COMMIT_RATIO),
    Math.min(MOBILE_COMMIT_MIN_PX, distancePx),
    Math.min(MOBILE_COMMIT_MAX_PX, distancePx),
  );
}

function getPaneSidePeekPx(args: {
  metrics: PaneQueueMetrics;
  paneIndex: number;
}) {
  const paneWidthPx = args.metrics.paneWidthsPx[args.paneIndex] ?? 0;
  const visibleStripPx = Math.max(
    0,
    args.metrics.viewportWidthPx - paneWidthPx,
  );

  if (args.metrics.paneCount <= 1) {
    return {
      leftPeekPx: 0,
      rightPeekPx: 0,
    };
  }

  if (args.paneIndex === 0) {
    return {
      leftPeekPx: 0,
      rightPeekPx: visibleStripPx,
    };
  }

  if (args.paneIndex === args.metrics.paneCount - 1) {
    return {
      leftPeekPx: visibleStripPx,
      rightPeekPx: 0,
    };
  }

  const leftPeekPx = Math.floor(visibleStripPx / 2);
  return {
    leftPeekPx,
    rightPeekPx: visibleStripPx - leftPeekPx,
  };
}

export function getPaneQueueTrackWidthPx(metrics: PaneQueueMetrics) {
  return metrics.paneWidthsPx.reduce(
    (sumWidthPx, paneWidthPx) => sumWidthPx + paneWidthPx,
    0,
  );
}

export function getPaneQueuePaneStartPx(
  paneIndex: number,
  metrics: PaneQueueMetrics,
) {
  return metrics.paneWidthsPx
    .slice(0, paneIndex)
    .reduce((sumWidthPx, paneWidthPx) => sumWidthPx + paneWidthPx, 0);
}

export function getPaneQueuePaneVisibleStartPx(
  paneIndex: number,
  metrics: PaneQueueMetrics,
) {
  const { leftPeekPx } = getPaneSidePeekPx({
    metrics,
    paneIndex,
  });

  return Math.max(0, getPaneQueuePaneStartPx(paneIndex, metrics) - leftPeekPx);
}

function getPaneQueueVisibleStartRange(args: {
  currentPaneIndex: number;
  metrics: PaneQueueMetrics;
}) {
  const minPaneIndex = Math.max(0, args.currentPaneIndex - 1);
  const maxPaneIndex = Math.min(
    args.metrics.paneCount - 1,
    args.currentPaneIndex + 1,
  );

  return {
    maxVisibleStartPx: getPaneQueuePaneVisibleStartPx(
      maxPaneIndex,
      args.metrics,
    ),
    minVisibleStartPx: getPaneQueuePaneVisibleStartPx(
      minPaneIndex,
      args.metrics,
    ),
  };
}

function clampPaneQueueVisibleStartPx(args: {
  currentPaneIndex: number;
  metrics: PaneQueueMetrics;
  requestedVisibleStartPx: number;
}) {
  const range = getPaneQueueVisibleStartRange({
    currentPaneIndex: args.currentPaneIndex,
    metrics: args.metrics,
  });
  return clampNumber(
    args.requestedVisibleStartPx,
    range.minVisibleStartPx,
    range.maxVisibleStartPx,
  );
}

export function getPaneQueueVisibleStartPx(args: {
  currentPaneIndex: number;
  dragOffsetPx: number;
  metrics: PaneQueueMetrics;
}) {
  const paneVisibleStartPx = getPaneQueuePaneVisibleStartPx(
    args.currentPaneIndex,
    args.metrics,
  );

  return clampPaneQueueVisibleStartPx({
    currentPaneIndex: args.currentPaneIndex,
    metrics: args.metrics,
    requestedVisibleStartPx: paneVisibleStartPx - args.dragOffsetPx,
  });
}

function getAdjacentPaneIndexCandidate(args: {
  currentPaneIndex: number;
  dragOffsetPx: number;
  paneCount: number;
}) {
  if (args.dragOffsetPx > 0 && args.currentPaneIndex > 0) {
    return args.currentPaneIndex - 1;
  }

  if (args.dragOffsetPx < 0 && args.currentPaneIndex < args.paneCount - 1) {
    return args.currentPaneIndex + 1;
  }

  return null;
}

function getVelocityTowardCandidate(args: {
  candidatePaneIndex: number;
  currentPaneIndex: number;
  velocityPxPerMs: number;
}) {
  return args.candidatePaneIndex < args.currentPaneIndex
    ? args.velocityPxPerMs
    : -args.velocityPxPerMs;
}

export function getPaneQueueSettledIndex(args: {
  currentPaneIndex: number;
  dragOffsetPx: number;
  metrics: PaneQueueMetrics;
  velocityPxPerMs: number;
}) {
  const candidatePaneIndex = getAdjacentPaneIndexCandidate({
    currentPaneIndex: args.currentPaneIndex,
    dragOffsetPx: args.dragOffsetPx,
    paneCount: args.metrics.paneCount,
  });
  if (candidatePaneIndex === null) {
    return args.currentPaneIndex;
  }

  const distancePx = Math.abs(
    getPaneQueuePaneVisibleStartPx(candidatePaneIndex, args.metrics) -
      getPaneQueuePaneVisibleStartPx(args.currentPaneIndex, args.metrics),
  );
  const travelTowardCandidatePx = Math.abs(args.dragOffsetPx);
  const velocityTowardCandidatePxPerMs = getVelocityTowardCandidate({
    candidatePaneIndex,
    currentPaneIndex: args.currentPaneIndex,
    velocityPxPerMs: args.velocityPxPerMs,
  });
  const requiredTravelPx = getCommitThresholdPx(distancePx);

  return travelTowardCandidatePx >= requiredTravelPx ||
    velocityTowardCandidatePxPerMs >= MOBILE_VELOCITY_COMMIT_THRESHOLD_PX_PER_MS
    ? candidatePaneIndex
    : args.currentPaneIndex;
}
