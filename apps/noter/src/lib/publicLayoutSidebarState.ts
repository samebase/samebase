import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";
import type { WorkspaceSidebarStateController } from "@/lib/workspaceSidebarStateController";

/**
 * Public routes share one anonymous right-sidebar preference record. Routes
 * without a left pane ignore left-only fields while keeping right-side widths
 * shared across the public shell.
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
    },
  };
}
