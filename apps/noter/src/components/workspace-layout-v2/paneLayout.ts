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

  // Opening a sidebar should require a clearer gesture than closing back to
  // main, but both thresholds stay capped so very wide panes do not feel heavy.
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
      return metrics.mainWidthPx;
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
      return metrics.leftWidthPx + metrics.mainWidthPx;
    default:
      return pane satisfies never;
  }
}

function getWorkspaceLayoutV2PaneSidePeekPx(
  pane: WorkspaceLayoutV2Pane,
  metrics: WorkspaceLayoutV2Metrics,
) {
  const visibleStripPx = Math.max(
    0,
    metrics.viewportWidthPx - getWorkspaceLayoutV2PaneWidthPx(pane, metrics),
  );

  switch (pane) {
    case "left":
      return {
        leftPeekPx: 0,
        rightPeekPx: visibleStripPx,
      };
    case "main": {
      const leftPeekPx = Math.floor(visibleStripPx / 2);
      return {
        leftPeekPx,
        rightPeekPx: visibleStripPx - leftPeekPx,
      };
    }
    case "right":
      return {
        leftPeekPx: visibleStripPx,
        rightPeekPx: 0,
      };
    default:
      return pane satisfies never;
  }
}

export function getWorkspaceLayoutV2PaneVisibleStartPx(
  pane: WorkspaceLayoutV2Pane,
  metrics: WorkspaceLayoutV2Metrics,
) {
  const { leftPeekPx } = getWorkspaceLayoutV2PaneSidePeekPx(pane, metrics);

  return Math.max(
    0,
    getWorkspaceLayoutV2PaneStartPx(pane, metrics) - leftPeekPx,
  );
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
      // An open left sidebar may only drag back toward main.
      return {
        maxVisibleStartPx: mainVisibleStartPx,
        minVisibleStartPx: 0,
      };
    case "main":
      // Main is the only pane that can travel in both directions.
      return {
        maxVisibleStartPx: rightVisibleStartPx,
        minVisibleStartPx: 0,
      };
    case "right":
      // An open right sidebar may only drag back toward main.
      return {
        maxVisibleStartPx: rightVisibleStartPx,
        minVisibleStartPx: mainVisibleStartPx,
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
  const paneVisibleStartPx = getWorkspaceLayoutV2PaneVisibleStartPx(
    args.currentPane,
    args.metrics,
  );

  // Finger movement and track movement are inverted: dragging right reveals
  // earlier track content, so the visible start moves left.
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
  // The transition graph is intentionally linear: left <-> main <-> right.
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
  // Normalize velocity so positive means "moving toward the candidate pane"
  // regardless of which pane the gesture started from.
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
    getWorkspaceLayoutV2PaneVisibleStartPx(candidatePane, args.metrics) -
      getWorkspaceLayoutV2PaneVisibleStartPx(args.currentPane, args.metrics),
  );
  const travelTowardCandidatePx = Math.abs(args.dragOffsetPx);
  const velocityTowardCandidatePxPerMs = getVelocityTowardCandidate({
    candidatePane,
    currentPane: args.currentPane,
    velocityPxPerMs: args.velocityPxPerMs,
  });
  // Returning from a sidebar is intentionally cheaper than opening a sidebar,
  // which makes the shell feel easier to dismiss than to invoke accidentally.
  const requiredTravelPx = getCommitThresholdPx(
    distancePx,
    args.currentPane === "main" ? "open" : "close",
  );

  return travelTowardCandidatePx >= requiredTravelPx ||
    velocityTowardCandidatePxPerMs >= MOBILE_VELOCITY_COMMIT_THRESHOLD_PX_PER_MS
    ? candidatePane
    : args.currentPane;
}
