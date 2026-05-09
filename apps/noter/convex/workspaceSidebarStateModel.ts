import { Infer, v } from "convex/values";

const { boolean, id, literal, number, object, union } = v;

export const workspaceSidebarStateKeyValidator = union(
  literal("dashboard"),
  literal("machines"),
  literal("repository"),
);
export type WorkspaceSidebarStateKey = Infer<
  typeof workspaceSidebarStateKeyValidator
>;

export const workspaceMobileSidebarPaneValidator = union(
  literal("left"),
  literal("main"),
  literal("right"),
);
export type WorkspaceMobileSidebarPane = Infer<
  typeof workspaceMobileSidebarPaneValidator
>;

/**
 * unmerged = mobile carousel panes stay separate
 *
 * merged = the side pane and main pane share one mobile surface, and
 * mainWidthPx is the main pane's width inside that pair
 */
export const workspaceMobileSurfaceValidator = union(
  object({
    kind: literal("unmerged"),
  }),
  object({
    kind: literal("merged"),
    mainWidthPx: number(),
    side: union(literal("left"), literal("right")),
  }),
);
export type WorkspaceMobileSurface = Infer<
  typeof workspaceMobileSurfaceValidator
>;

const workspaceSidebarStateFields = {
  leftDesktopOpen: boolean(),
  leftDesktopWidthPx: number(),
  leftMobileWidthPx: number(),
  mobilePane: workspaceMobileSidebarPaneValidator,
  mobileSurface: workspaceMobileSurfaceValidator,
  rightDesktopOpen: boolean(),
  rightDesktopWidthPx: number(),
  rightMobileWidthPx: number(),
};

/**
 * Persist only shell-owned geometry and pane selection here. Route-owned
 * details such as tree expansion or scroll position should live in route-
 * specific records instead of one generic sidebar bucket.
 */
export const workspaceSidebarStateValidator = object(
  workspaceSidebarStateFields,
);
export type WorkspaceSidebarState = Infer<
  typeof workspaceSidebarStateValidator
>;

export const workspaceSidebarStateRowValidator = object({
  userId: id("users"),
  workspaceKey: workspaceSidebarStateKeyValidator,
  updatedAt: number(),
  ...workspaceSidebarStateFields,
});
export type WorkspaceSidebarStateRow = Infer<
  typeof workspaceSidebarStateRowValidator
>;
