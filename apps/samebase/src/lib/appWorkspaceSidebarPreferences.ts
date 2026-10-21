export const APP_WORKSPACE_LEFT_SIDEBAR_DEFAULT_WIDTH_PX = 240;
export const APP_WORKSPACE_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX = 288;
/** TanStack Router stores this ID in session storage. Keep it stable across layout renames. */
export const APP_WORKSPACE_MAIN_SCROLL_RESTORATION_ID = "workspace-layout-v2-main";
/** The sidebar state of pages that render without a session (`lib/localWorkspaceSidebarState.ts`). */
export const APP_WORKSPACE_SIDEBAR_STORAGE_KEY = "samebase_app_workspace_sidebar_state";
export const APP_WORKSPACE_SIDEBAR_STORAGE_VERSION = 2;
/** The temporary stylesheet of the desktop prehydration, which the local controller removes. */
export const APP_WORKSPACE_SIDEBAR_PREHYDRATION_ARGS = {
  desktopStyleElementId: "samebase-app-workspace-sidebar-prehydration",
};
/**
The local storage key that visual tests write before a `/visual-fixture` page loads
(`e2e/visualFixtureTest.ts`). The fixture route reads it and never writes it.
*/
export const VISUAL_FIXTURE_WORKSPACE_SIDEBAR_STATE_KEY = "samebase_visual_fixture_sidebar_state";
