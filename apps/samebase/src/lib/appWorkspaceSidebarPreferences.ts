export const APP_WORKSPACE_SIDEBAR_STORAGE_KEY = "samebase_app_workspace_sidebar_state";
/**
The landing and docs pages are their own workspace surface: their pane state
never mixes with the app surface, so closing a sidebar there can never leak
into the sign-in page or the dashboard.
*/
export const LANDING_WORKSPACE_SIDEBAR_STORAGE_KEY = "samebase_landing_workspace_sidebar_state";
export const APP_WORKSPACE_SIDEBAR_STORAGE_VERSION = 2;
