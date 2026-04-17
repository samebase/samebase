export type WorkspaceLayoutV2Pane = "left" | "main" | "right";

export type WorkspaceLayoutV2Metrics = {
  leftWidthPx: number;
  mainWidthPx: number;
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

  // Opening should take a clearer gesture than closing back to main.
  const ratio =
    action === "open" ? MOBILE_OPEN_COMMIT_RATIO : MOBILE_CLOSE_COMMIT_RATIO;
  return clampNumber(
    Math.round(distancePx * ratio),
    Math.min(MOBILE_COMMIT_MIN_PX, distancePx),
    Math.min(MOBILE_COMMIT_MAX_PX, distancePx),
  );
}

export function getWorkspaceLayoutV2PaneVisibleStartPx(
  pane: WorkspaceLayoutV2Pane,
  metrics: WorkspaceLayoutV2Metrics,
) {
  const mainSidePeekPx = Math.max(
    0,
    Math.round((metrics.viewportWidthPx - metrics.mainWidthPx) / 2),
  );

  switch (pane) {
    case "left":
      return 0;
    case "main":
      return Math.max(0, metrics.leftWidthPx - mainSidePeekPx);
    case "right":
      return (
        getWorkspaceLayoutV2TrackWidthPx(metrics) - metrics.viewportWidthPx
      );
    default:
      return pane satisfies never;
  }
}

export function getWorkspaceLayoutV2TrackWidthPx(
  metrics: WorkspaceLayoutV2Metrics,
) {
  return metrics.leftWidthPx + metrics.mainWidthPx + metrics.rightWidthPx;
}

function getWorkspaceLayoutV2VisibleStartRange(
  pane: WorkspaceLayoutV2Pane,
  metrics: WorkspaceLayoutV2Metrics,
) {
  const mainVisibleStartPx = getWorkspaceLayoutV2PaneVisibleStartPx(
    "main",
    metrics,
  );
  const rightVisibleStartPx = getWorkspaceLayoutV2PaneVisibleStartPx(
    "right",
    metrics,
  );

  switch (pane) {
    case "left":
      return {
        maxVisibleStartPx: mainVisibleStartPx,
        minVisibleStartPx: 0,
      };
    case "main":
      return {
        maxVisibleStartPx: rightVisibleStartPx,
        minVisibleStartPx: 0,
      };
    case "right":
      return {
        maxVisibleStartPx: rightVisibleStartPx,
        minVisibleStartPx: mainVisibleStartPx,
      };
    default:
      return pane satisfies never;
  }
}

function clampWorkspaceLayoutV2VisibleStartPx(args: {
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
  const paneVisibleStartPx = getWorkspaceLayoutV2PaneVisibleStartPx(
    args.currentPane,
    args.metrics,
  );

  return clampWorkspaceLayoutV2VisibleStartPx({
    currentPane: args.currentPane,
    metrics: args.metrics,
    requestedVisibleStartPx: paneVisibleStartPx - args.dragOffsetPx,
  });
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
    getWorkspaceLayoutV2PaneVisibleStartPx(candidatePane, args.metrics) -
      getWorkspaceLayoutV2PaneVisibleStartPx(args.currentPane, args.metrics),
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
