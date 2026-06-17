import { v } from "convex/values";
import { mutation, query } from "./functions";
import {
  vWorkspaceSidebarStateKey,
  vWorkspaceSidebarState,
  type WorkspaceSidebarState,
} from "./workspaceSidebarStateModel";

const { object, union } = v;

function readWorkspaceSidebarState(storedState: WorkspaceSidebarState): WorkspaceSidebarState {
  return {
    leftDesktopOpen: storedState.leftDesktopOpen,
    leftDesktopWidthPx: storedState.leftDesktopWidthPx,
    leftMobileWidthPx: storedState.leftMobileWidthPx,
    mobilePane: storedState.mobilePane,
    mobileSurface: storedState.mobileSurface,
    rightDesktopOpen: storedState.rightDesktopOpen,
    rightDesktopWidthPx: storedState.rightDesktopWidthPx,
    rightMobileWidthPx: storedState.rightMobileWidthPx,
  };
}

export const getWorkspaceSidebarState = query({
  access: "access_dashboard",
  args: object({
    workspaceKey: vWorkspaceSidebarStateKey,
  }),
  returns: union(v.null(), vWorkspaceSidebarState),
  handler: async (ctx, args): Promise<WorkspaceSidebarState | null> => {
    const existing = await ctx.db
      .query("workspaceSidebarState")
      .withIndex("by_user_and_workspace_key", (q) =>
        q.eq("userId", ctx.viewer.userId).eq("workspaceKey", args.workspaceKey),
      )
      .first();

    if (existing === null) {
      return null;
    }

    return readWorkspaceSidebarState(existing);
  },
});

export const setWorkspaceSidebarState = mutation({
  access: "access_dashboard",
  args: object({
    state: vWorkspaceSidebarState,
    workspaceKey: vWorkspaceSidebarStateKey,
  }),
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workspaceSidebarState")
      .withIndex("by_user_and_workspace_key", (q) =>
        q.eq("userId", ctx.viewer.userId).eq("workspaceKey", args.workspaceKey),
      )
      .first();
    const nextState = {
      ...args.state,
      updatedAt: Date.now(),
    };

    if (existing !== null) {
      await ctx.db.patch(existing._id, nextState);
      return;
    }

    await ctx.db.insert("workspaceSidebarState", {
      userId: ctx.viewer.userId,
      workspaceKey: args.workspaceKey,
      ...nextState,
    });
  },
});
