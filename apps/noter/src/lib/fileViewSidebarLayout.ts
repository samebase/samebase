import type { WorkspaceMobileSidebarPane } from "../../convex/workspaceSidebarStateModel";

type WorkspaceSidebarSide = Exclude<WorkspaceMobileSidebarPane, "main">;

// Keep the file tree's semantic sidebar side in one place so desktop placement,
// mobile pane order, and toggle wiring stay in sync when we swap sides.
export const FILE_VIEW_TREE_SIDEBAR_SIDE: WorkspaceSidebarSide = "right";
