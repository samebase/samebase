export type WorkspaceLayoutV2Pane = "left" | "main" | "right";

export type WorkspaceLayoutV2Metrics = {
  leftWidthPx: number;
  rightWidthPx: number;
  viewportWidthPx: number;
};

const MOBILE_OPEN_COMMIT_RATIO = 0.28;
const MOBILE_CLOSE_COMMIT_RATIO = 0.22;
const MOBILE_COMMIT_MIN_PX = 56;
const MOBILE_COMMIT_MAX_PX = 136;
const MOBILE_VELOCITY_COMMIT_THRESHOLD_PX_PER_MS = 0.45;

function clampNumber(value: number, minValue: number, maxValue: number) {
  return Math.max(minValue, Math.min(value, maxValue));
}

function getCommitThresholdPx(distancePx: number, action: "open" | "close") {
  if (distancePx <= 0) {
    return 0;
  }

  const ratio =
    action === "open" ? MOBILE_OPEN_COMMIT_RATIO : MOBILE_CLOSE_COMMIT_RATIO;
  return clampNumber(
    Math.round(distancePx * ratio),
    Math.min(MOBILE_COMMIT_MIN_PX, distancePx),
    Math.min(MOBILE_COMMIT_MAX_PX, distancePx),
  );
}

export function getWorkspaceLayoutV2PaneWidthPx(
  pane: WorkspaceLayoutV2Pane,
  metrics: WorkspaceLayoutV2Metrics,
) {
  switch (pane) {
    case "left":
      return metrics.leftWidthPx;
    case "main":
      return metrics.viewportWidthPx;
    case "right":
      return metrics.rightWidthPx;
    default:
      return pane satisfies never;
  }
}

export function getWorkspaceLayoutV2PaneStartPx(
  pane: WorkspaceLayoutV2Pane,
  metrics: WorkspaceLayoutV2Metrics,
) {
  switch (pane) {
    case "left":
      return 0;
    case "main":
      return metrics.leftWidthPx;
    case "right":
      return metrics.leftWidthPx + metrics.viewportWidthPx;
    default:
      return pane satisfies never;
  }
}

export function getWorkspaceLayoutV2TrackWidthPx(
  metrics: WorkspaceLayoutV2Metrics,
) {
  return metrics.leftWidthPx + metrics.viewportWidthPx + metrics.rightWidthPx;
}

function getWorkspaceLayoutV2VisibleStartRange(
  pane: WorkspaceLayoutV2Pane,
  metrics: WorkspaceLayoutV2Metrics,
) {
  const mainStartPx = getWorkspaceLayoutV2PaneStartPx("main", metrics);
  const rightStartPx = getWorkspaceLayoutV2PaneStartPx("right", metrics);

  switch (pane) {
    case "left":
      return {
        maxVisibleStartPx: mainStartPx,
        minVisibleStartPx: 0,
      };
    case "main":
      return {
        maxVisibleStartPx: rightStartPx,
        minVisibleStartPx: 0,
      };
    case "right":
      return {
        maxVisibleStartPx: rightStartPx,
        minVisibleStartPx: mainStartPx,
      };
    default:
      return pane satisfies never;
  }
}

export function clampWorkspaceLayoutV2VisibleStartPx(args: {
  currentPane: WorkspaceLayoutV2Pane;
  metrics: WorkspaceLayoutV2Metrics;
  requestedVisibleStartPx: number;
}) {
  const range = getWorkspaceLayoutV2VisibleStartRange(
    args.currentPane,
    args.metrics,
  );
  return clampNumber(
    args.requestedVisibleStartPx,
    range.minVisibleStartPx,
    range.maxVisibleStartPx,
  );
}

export function getWorkspaceLayoutV2VisibleStartPx(args: {
  currentPane: WorkspaceLayoutV2Pane;
  dragOffsetPx: number;
  metrics: WorkspaceLayoutV2Metrics;
}) {
  const paneStartPx = getWorkspaceLayoutV2PaneStartPx(
    args.currentPane,
    args.metrics,
  );

  return clampWorkspaceLayoutV2VisibleStartPx({
    currentPane: args.currentPane,
    metrics: args.metrics,
    requestedVisibleStartPx: paneStartPx - args.dragOffsetPx,
  });
}

export function getWorkspaceLayoutV2ViewportBoundaryPx(args: {
  currentPane: WorkspaceLayoutV2Pane;
  metrics: WorkspaceLayoutV2Metrics;
  side: "left" | "right";
  visibleStartPx: number;
}) {
  const boundaryStartPx =
    args.side === "left"
      ? getWorkspaceLayoutV2PaneStartPx("main", args.metrics)
      : getWorkspaceLayoutV2PaneStartPx("right", args.metrics);

  return clampNumber(
    boundaryStartPx - args.visibleStartPx,
    0,
    args.metrics.viewportWidthPx,
  );
}

function getAdjacentPaneCandidate(args: {
  currentPane: WorkspaceLayoutV2Pane;
  dragOffsetPx: number;
}) {
  if (args.currentPane === "main") {
    if (args.dragOffsetPx > 0) {
      return "left" as const;
    }
    if (args.dragOffsetPx < 0) {
      return "right" as const;
    }
    return null;
  }

  if (args.currentPane === "left") {
    return args.dragOffsetPx < 0 ? ("main" as const) : null;
  }

  return args.dragOffsetPx > 0 ? ("main" as const) : null;
}

function getVelocityTowardCandidate(args: {
  candidatePane: WorkspaceLayoutV2Pane;
  currentPane: WorkspaceLayoutV2Pane;
  velocityPxPerMs: number;
}) {
  if (args.currentPane === "main") {
    return args.candidatePane === "left"
      ? args.velocityPxPerMs
      : -args.velocityPxPerMs;
  }

  return args.currentPane === "left"
    ? -args.velocityPxPerMs
    : args.velocityPxPerMs;
}

/**
 * Mobile settling is intentionally adjacent-only. A release can move at most
 * one step away from the current pane, which makes left <-> main <-> right the
 * only possible transition graph.
 */
export function getWorkspaceLayoutV2SettledPane(args: {
  currentPane: WorkspaceLayoutV2Pane;
  dragOffsetPx: number;
  metrics: WorkspaceLayoutV2Metrics;
  velocityPxPerMs: number;
}) {
  const candidatePane = getAdjacentPaneCandidate({
    currentPane: args.currentPane,
    dragOffsetPx: args.dragOffsetPx,
  });
  if (candidatePane === null) {
    return args.currentPane;
  }

  const distancePx = Math.abs(
    getWorkspaceLayoutV2PaneStartPx(candidatePane, args.metrics) -
      getWorkspaceLayoutV2PaneStartPx(args.currentPane, args.metrics),
  );
  const travelTowardCandidatePx = Math.abs(args.dragOffsetPx);
  const velocityTowardCandidatePxPerMs = getVelocityTowardCandidate({
    candidatePane,
    currentPane: args.currentPane,
    velocityPxPerMs: args.velocityPxPerMs,
  });
  const requiredTravelPx = getCommitThresholdPx(
    distancePx,
    args.currentPane === "main" ? "open" : "close",
  );

  return travelTowardCandidatePx >= requiredTravelPx ||
    velocityTowardCandidatePxPerMs >= MOBILE_VELOCITY_COMMIT_THRESHOLD_PX_PER_MS
    ? candidatePane
    : args.currentPane;
}
