import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";

export const APP_WORKSPACE_SIDEBAR_STORAGE_KEY = "samebase_app_workspace_sidebar_state";
export const APP_WORKSPACE_SIDEBAR_STORAGE_VERSION = 2;

export const APP_WORKSPACE_LEFT_SIDEBAR_DEFAULT_WIDTH_PX = 240;
export const APP_WORKSPACE_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX = 288;

export const APP_WORKSPACE_SIDEBAR_DEFAULT_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: APP_WORKSPACE_LEFT_SIDEBAR_DEFAULT_WIDTH_PX,
  leftMobileWidthPx: APP_WORKSPACE_LEFT_SIDEBAR_DEFAULT_WIDTH_PX,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: APP_WORKSPACE_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX,
  rightMobileWidthPx: APP_WORKSPACE_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX,
} satisfies WorkspaceSidebarState;
