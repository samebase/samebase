import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";
import type { WorkspaceSidebarStateController } from "#src/lib/workspaceSidebarStateController.ts";

/**
 * Public routes share one anonymous pane preference record even though their
 * available panes differ. For example, `/logo` can persist left-pane selection
 * and widths, while landing-style routes may render without a left pane. This
 * masks unavailable left-pane state for the current route without erasing it
 * from the shared public preference record.
 */
export function sanitizePublicLayoutSidebarState({
  defaultSidebarState,
  hasLeftPane,
  sidebarState,
}: {
  defaultSidebarState: WorkspaceSidebarState;
  hasLeftPane: boolean;
  sidebarState: WorkspaceSidebarStateController;
}): WorkspaceSidebarStateController {
  if (hasLeftPane) {
    return sidebarState;
  }

  const state = sidebarState.state;

  return {
    ...sidebarState,
    state: {
      ...state,
      leftDesktopOpen: false,
      leftDesktopWidthPx: defaultSidebarState.leftDesktopWidthPx,
      leftMobileWidthPx: defaultSidebarState.leftMobileWidthPx,
      mobilePane:
        state.mobilePane === "left"
          ? defaultSidebarState.mobilePane === "left"
            ? "main"
            : defaultSidebarState.mobilePane
          : state.mobilePane,
      mobileSurface:
        state.mobileSurface.kind === "merged" &&
        state.mobileSurface.side === "left"
          ? { kind: "unmerged" }
          : state.mobileSurface,
    },
  };
}
