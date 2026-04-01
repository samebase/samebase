const REM_PX = 16;

export const DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX = 16 * REM_PX;
// Desktop sidebars should feel VS Code-like: roomy enough for inspectors and
// trees, but never so wide that a single pane takes over the whole workbench.
export const MIN_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX = 80;
export const MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX = 1000;
export const MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_RATIO = 0.7;
export const MIN_WORKSPACE_DESKTOP_MAIN_PANE_WIDTH_PX = 20 * REM_PX;
// Mobile keeps a tiny visible slice of the main pane so the layout still reads
// as a pane stack instead of a full-screen drawer.
export const MIN_WORKSPACE_MOBILE_SIDEBAR_WIDTH_PX = 40;
export const MIN_WORKSPACE_MOBILE_MAIN_PEEK_WIDTH_PX = 40;

export type WorkspaceSidebarWidthRange = {
  maxWidthPx: number;
  minWidthPx: number;
};

export type ResolvedWorkspaceDesktopSidebarWidths = {
  leftWidthPx: number;
  rightWidthPx: number;
};

function clampNumber(value: number, minValue: number, maxValue: number) {
  return Math.max(minValue, Math.min(value, maxValue));
}

export function getWorkspaceDesktopSidebarWidthRange(
  containerWidthPx: number,
  oppositeSidebarWidthPx: number,
): WorkspaceSidebarWidthRange {
  const maxWidthPx = Math.max(
    0,
    Math.min(
      MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
      containerWidthPx * MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_RATIO,
      containerWidthPx -
        oppositeSidebarWidthPx -
        MIN_WORKSPACE_DESKTOP_MAIN_PANE_WIDTH_PX,
    ),
  );
  const minWidthPx = Math.min(
    MIN_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
    maxWidthPx,
  );

  return {
    maxWidthPx,
    minWidthPx,
  };
}

export function clampWorkspaceDesktopSidebarWidthPx(
  desiredWidthPx: number,
  containerWidthPx: number,
  oppositeSidebarWidthPx: number,
) {
  const { minWidthPx, maxWidthPx } = getWorkspaceDesktopSidebarWidthRange(
    containerWidthPx,
    oppositeSidebarWidthPx,
  );

  return clampNumber(desiredWidthPx, minWidthPx, maxWidthPx);
}

export function getWorkspaceMobileSidebarWidthRange(
  viewportWidthPx: number,
): WorkspaceSidebarWidthRange {
  const maxWidthPx = Math.max(
    0,
    viewportWidthPx - MIN_WORKSPACE_MOBILE_MAIN_PEEK_WIDTH_PX,
  );
  const minWidthPx = Math.min(
    MIN_WORKSPACE_MOBILE_SIDEBAR_WIDTH_PX,
    maxWidthPx,
  );

  return {
    maxWidthPx,
    minWidthPx,
  };
}

export function clampWorkspaceMobileSidebarWidthPx(
  desiredWidthPx: number,
  viewportWidthPx: number,
) {
  const { minWidthPx, maxWidthPx } =
    getWorkspaceMobileSidebarWidthRange(viewportWidthPx);

  return clampNumber(desiredWidthPx, minWidthPx, maxWidthPx);
}

function roundResolvedDesktopWidths(
  leftWidthPx: number,
  rightWidthPx: number,
  maxCombinedWidthPx: number,
) {
  let roundedLeftWidthPx = Math.max(0, Math.round(leftWidthPx));
  let roundedRightWidthPx = Math.max(0, Math.round(rightWidthPx));
  const roundedOverflowPx =
    roundedLeftWidthPx + roundedRightWidthPx - maxCombinedWidthPx;

  if (roundedOverflowPx > 0) {
    if (roundedLeftWidthPx >= roundedRightWidthPx) {
      roundedLeftWidthPx = Math.max(0, roundedLeftWidthPx - roundedOverflowPx);
    } else {
      roundedRightWidthPx = Math.max(
        0,
        roundedRightWidthPx - roundedOverflowPx,
      );
    }
  }

  return {
    leftWidthPx: roundedLeftWidthPx,
    rightWidthPx: roundedRightWidthPx,
  };
}

/**
 * Fit the desktop left/right sidebars into the available shell width while
 * preserving the minimum main-pane space.
 */
export function resolveWorkspaceDesktopSidebarWidths(args: {
  containerWidthPx: number;
  leftOpen: boolean;
  leftWidthPx: number;
  rightOpen: boolean;
  rightWidthPx: number;
}): ResolvedWorkspaceDesktopSidebarWidths {
  const maxCombinedWidthPx = Math.max(
    0,
    args.containerWidthPx - MIN_WORKSPACE_DESKTOP_MAIN_PANE_WIDTH_PX,
  );
  const leftDesiredWidthPx = args.leftOpen
    ? clampNumber(
        args.leftWidthPx,
        MIN_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
        Math.min(
          MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
          args.containerWidthPx * MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_RATIO,
        ),
      )
    : 0;
  const rightDesiredWidthPx = args.rightOpen
    ? clampNumber(
        args.rightWidthPx,
        MIN_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
        Math.min(
          MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
          args.containerWidthPx * MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_RATIO,
        ),
      )
    : 0;

  if (!args.leftOpen && !args.rightOpen) {
    return {
      leftWidthPx: 0,
      rightWidthPx: 0,
    };
  }

  if (args.leftOpen && !args.rightOpen) {
    return {
      leftWidthPx: clampWorkspaceDesktopSidebarWidthPx(
        leftDesiredWidthPx,
        args.containerWidthPx,
        0,
      ),
      rightWidthPx: 0,
    };
  }

  if (!args.leftOpen && args.rightOpen) {
    return {
      leftWidthPx: 0,
      rightWidthPx: clampWorkspaceDesktopSidebarWidthPx(
        rightDesiredWidthPx,
        args.containerWidthPx,
        0,
      ),
    };
  }

  if (maxCombinedWidthPx < MIN_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX * 2) {
    const totalDesiredWidthPx = Math.max(
      1,
      leftDesiredWidthPx + rightDesiredWidthPx,
    );
    const weightedLeftWidthPx =
      (maxCombinedWidthPx * leftDesiredWidthPx) / totalDesiredWidthPx;
    return roundResolvedDesktopWidths(
      weightedLeftWidthPx,
      maxCombinedWidthPx - weightedLeftWidthPx,
      maxCombinedWidthPx,
    );
  }

  let resolvedLeftWidthPx = leftDesiredWidthPx;
  let resolvedRightWidthPx = rightDesiredWidthPx;
  let overflowPx =
    resolvedLeftWidthPx + resolvedRightWidthPx - maxCombinedWidthPx;

  if (overflowPx <= 0) {
    return {
      leftWidthPx: resolvedLeftWidthPx,
      rightWidthPx: resolvedRightWidthPx,
    };
  }

  const leftFlexibleWidthPx =
    resolvedLeftWidthPx - MIN_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX;
  const rightFlexibleWidthPx =
    resolvedRightWidthPx - MIN_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX;
  const totalFlexibleWidthPx = leftFlexibleWidthPx + rightFlexibleWidthPx;

  if (totalFlexibleWidthPx > 0) {
    const leftReductionPx =
      (overflowPx * leftFlexibleWidthPx) / totalFlexibleWidthPx;
    const clampedLeftReductionPx = Math.min(
      leftFlexibleWidthPx,
      leftReductionPx,
    );
    const clampedRightReductionPx = Math.min(
      rightFlexibleWidthPx,
      overflowPx - clampedLeftReductionPx,
    );
    resolvedLeftWidthPx -= clampedLeftReductionPx;
    resolvedRightWidthPx -= clampedRightReductionPx;
    overflowPx =
      resolvedLeftWidthPx + resolvedRightWidthPx - maxCombinedWidthPx;
  }

  if (
    overflowPx > 0 &&
    resolvedLeftWidthPx > MIN_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX
  ) {
    const leftOverflowReductionPx = Math.min(
      resolvedLeftWidthPx - MIN_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
      overflowPx,
    );
    resolvedLeftWidthPx -= leftOverflowReductionPx;
    overflowPx -= leftOverflowReductionPx;
  }

  if (
    overflowPx > 0 &&
    resolvedRightWidthPx > MIN_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX
  ) {
    resolvedRightWidthPx -= Math.min(
      resolvedRightWidthPx - MIN_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
      overflowPx,
    );
  }

  return roundResolvedDesktopWidths(
    resolvedLeftWidthPx,
    resolvedRightWidthPx,
    maxCombinedWidthPx,
  );
}
