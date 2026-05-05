import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";
import type { WorkspaceSidebarStateController } from "@/lib/workspaceSidebarStateController";

function sanitizePublicLayoutSidebarFields({
  defaultSidebarState,
  hasLeftPane,
  sidebarState,
}: {
  defaultSidebarState: WorkspaceSidebarState;
  hasLeftPane: boolean;
  sidebarState: WorkspaceSidebarState;
}): WorkspaceSidebarState {
  if (hasLeftPane) {
    return sidebarState;
  }

  return {
    ...sidebarState,
    leftDesktopOpen: false,
    leftDesktopWidthPx: defaultSidebarState.leftDesktopWidthPx,
    leftMobileWidthPx: defaultSidebarState.leftMobileWidthPx,
    mobilePane:
      sidebarState.mobilePane === "left"
        ? defaultSidebarState.mobilePane === "left"
          ? "main"
          : defaultSidebarState.mobilePane
        : sidebarState.mobilePane,
  };
}

function isWorkspaceSidebarStateController(
  value: WorkspaceSidebarState | WorkspaceSidebarStateController,
): value is WorkspaceSidebarStateController {
  return "state" in value;
}

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
}): WorkspaceSidebarStateController;
export function sanitizePublicLayoutSidebarState({
  defaultSidebarState,
  hasLeftPane,
  sidebarState,
}: {
  defaultSidebarState: WorkspaceSidebarState;
  hasLeftPane: boolean;
  sidebarState: WorkspaceSidebarState;
}): WorkspaceSidebarState;
export function sanitizePublicLayoutSidebarState({
  defaultSidebarState,
  hasLeftPane,
  sidebarState,
}: {
  defaultSidebarState: WorkspaceSidebarState;
  hasLeftPane: boolean;
  sidebarState: WorkspaceSidebarState | WorkspaceSidebarStateController;
}): WorkspaceSidebarState | WorkspaceSidebarStateController {
  if (isWorkspaceSidebarStateController(sidebarState)) {
    return {
      ...sidebarState,
      state: sanitizePublicLayoutSidebarFields({
        defaultSidebarState,
        hasLeftPane,
        sidebarState: sidebarState.state,
      }),
    };
  }

  return sanitizePublicLayoutSidebarFields({
    defaultSidebarState,
    hasLeftPane,
    sidebarState,
  });
}
