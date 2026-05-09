import { getAuthUserId } from "@convex-dev/auth/server";
import { Infer, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  workspaceSidebarStateKeyValidator,
  workspaceSidebarStateValidator,
  type WorkspaceSidebarState,
} from "./workspaceSidebarStateModel";

const { null: vNull, object, union } = v;

const getWorkspaceSidebarStateArgs = object({
  workspaceKey: workspaceSidebarStateKeyValidator,
});
const getWorkspaceSidebarStateReturns = union(
  vNull(),
  workspaceSidebarStateValidator,
);

const setWorkspaceSidebarStateArgs = object({
  state: workspaceSidebarStateValidator,
  workspaceKey: workspaceSidebarStateKeyValidator,
});
const setWorkspaceSidebarStateReturns = vNull();

type GetWorkspaceSidebarStateArgs = Infer<typeof getWorkspaceSidebarStateArgs>;
type SetWorkspaceSidebarStateArgs = Infer<typeof setWorkspaceSidebarStateArgs>;

function readWorkspaceSidebarState(
  storedState: WorkspaceSidebarState,
): WorkspaceSidebarState {
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
  args: getWorkspaceSidebarStateArgs,
  returns: getWorkspaceSidebarStateReturns,
  handler: async (
    ctx,
    args: GetWorkspaceSidebarStateArgs,
  ): Promise<WorkspaceSidebarState | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const existing = await ctx.db
      .query("workspaceSidebarState")
      .withIndex("by_user_and_workspace_key", (q) =>
        q.eq("userId", userId).eq("workspaceKey", args.workspaceKey),
      )
      .first();

    if (existing === null) {
      return null;
    }

    return readWorkspaceSidebarState(existing);
  },
});

export const setWorkspaceSidebarState = mutation({
  args: setWorkspaceSidebarStateArgs,
  returns: setWorkspaceSidebarStateReturns,
  handler: async (ctx, args: SetWorkspaceSidebarStateArgs) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const existing = await ctx.db
      .query("workspaceSidebarState")
      .withIndex("by_user_and_workspace_key", (q) =>
        q.eq("userId", userId).eq("workspaceKey", args.workspaceKey),
      )
      .first();
    const nextState = {
      ...args.state,
      updatedAt: Date.now(),
    };

    if (existing !== null) {
      await ctx.db.patch(existing._id, nextState);
      return null;
    }

    await ctx.db.insert("workspaceSidebarState", {
      userId,
      workspaceKey: args.workspaceKey,
      ...nextState,
    });
    return null;
  },
});
