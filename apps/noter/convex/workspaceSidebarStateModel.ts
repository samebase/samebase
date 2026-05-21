import { Infer, v } from "convex/values";

const { boolean, id, literal, number, object, union } = v;

export const vWorkspaceSidebarStateKey = union(
  literal("dashboard"),
  literal("machines"),
  literal("repository"),
);
export type WorkspaceSidebarStateKey = Infer<typeof vWorkspaceSidebarStateKey>;

export const vWorkspaceMobileSidebarPane = union(
  literal("left"),
  literal("main"),
  literal("right"),
);
export type WorkspaceMobileSidebarPane = Infer<typeof vWorkspaceMobileSidebarPane>;

/**
 * unmerged = mobile carousel panes stay separate
 *
 * merged = the side pane and main pane share one mobile surface, and
 * mainWidthPx is the main pane's width inside that pair
 */
export const vWorkspaceMobileSurface = union(
  object({
    kind: literal("unmerged"),
  }),
  object({
    kind: literal("merged"),
    mainWidthPx: number(),
    side: union(literal("left"), literal("right")),
  }),
);
export type WorkspaceMobileSurface = Infer<typeof vWorkspaceMobileSurface>;

const workspaceSidebarStateFields = {
  leftDesktopOpen: boolean(),
  leftDesktopWidthPx: number(),
  leftMobileWidthPx: number(),
  mobilePane: vWorkspaceMobileSidebarPane,
  mobileSurface: vWorkspaceMobileSurface,
  rightDesktopOpen: boolean(),
  rightDesktopWidthPx: number(),
  rightMobileWidthPx: number(),
};

/**
 * Persist only shell-owned geometry and pane selection here. Route-owned
 * details such as tree expansion or scroll position should live in route-
 * specific records instead of one generic sidebar bucket.
 */
export const vWorkspaceSidebarState = object(workspaceSidebarStateFields);
export type WorkspaceSidebarState = Infer<typeof vWorkspaceSidebarState>;

export const vWorkspaceSidebarStateRow = object({
  userId: id("users"),
  workspaceKey: vWorkspaceSidebarStateKey,
  updatedAt: number(),
  ...workspaceSidebarStateFields,
});
export type WorkspaceSidebarStateRow = Infer<typeof vWorkspaceSidebarStateRow>;
