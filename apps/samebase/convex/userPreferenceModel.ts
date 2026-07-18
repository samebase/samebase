import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

const { boolean, id, literal, number, object, optional, union } = v;

export const vWorkspaceSidebarStateKey = union(
  literal("app"),
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

export const userPreferenceTables = {
  ui_dashboardSettings: defineTable({
    userId: id("users"),
    accountPanelOpen: optional(boolean()),
    providersPanelOpen: boolean(),
    // TODO: remove this
    pricingBillingCycle: optional(union(literal("monthly"), literal("annual"))),
    editorChatOpen: optional(boolean()),
    globalChatOpen: optional(boolean()),
  }).index("by_user", ["userId"]),

  /** Shell-owned geometry and pane selection for one workspace. */
  ui_workspaceSidebarState: defineTable({
    userId: id("users"),
    workspaceKey: vWorkspaceSidebarStateKey,
    updatedAt: number(),
    leftDesktopOpen: boolean(),
    leftDesktopWidthPx: number(),
    leftMobileWidthPx: number(),
    mobilePane: vWorkspaceMobileSidebarPane,
    mobileSurface: vWorkspaceMobileSurface,
    rightDesktopOpen: boolean(),
    rightDesktopWidthPx: number(),
    rightMobileWidthPx: number(),
  }).index("by_user_and_workspace_key", ["userId", "workspaceKey"]),
};

const workspaceSidebarStateRow = userPreferenceTables.ui_workspaceSidebarState.validator.fields;

/**
 * Persist only shell-owned geometry and pane selection here. Route-owned
 * details such as tree expansion or scroll position should live in route-
 * specific records instead of one generic sidebar bucket.
 */
export const vWorkspaceSidebarState = object({
  leftDesktopOpen: workspaceSidebarStateRow.leftDesktopOpen,
  leftDesktopWidthPx: workspaceSidebarStateRow.leftDesktopWidthPx,
  leftMobileWidthPx: workspaceSidebarStateRow.leftMobileWidthPx,
  mobilePane: workspaceSidebarStateRow.mobilePane,
  mobileSurface: workspaceSidebarStateRow.mobileSurface,
  rightDesktopOpen: workspaceSidebarStateRow.rightDesktopOpen,
  rightDesktopWidthPx: workspaceSidebarStateRow.rightDesktopWidthPx,
  rightMobileWidthPx: workspaceSidebarStateRow.rightMobileWidthPx,
});
export type WorkspaceSidebarState = Infer<typeof vWorkspaceSidebarState>;
