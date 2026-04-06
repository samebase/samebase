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

const workspaceSidebarStateFields = {
  leftDesktopOpen: boolean(),
  leftDesktopWidthPx: number(),
  leftMobileWidthPx: number(),
  mobilePane: workspaceMobileSidebarPaneValidator,
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
