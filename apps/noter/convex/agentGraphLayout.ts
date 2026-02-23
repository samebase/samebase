import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getNodeLayouts = query({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: v.array(
    v.object({
      nodeId: v.string(),
      width: v.number(),
      height: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const layouts = await ctx.db
      .query("agentGraphNodeLayout")
      .withIndex("by_user_and_vault", (q) =>
        q.eq("userId", userId).eq("vaultId", args.vaultId),
      )
      .collect();

    return layouts.map((layout) => ({
      nodeId: layout.nodeId,
      width: layout.width,
      height: layout.height,
    }));
  },
});

export const setNodeLayout = mutation({
  args: {
    vaultId: v.id("vaults"),
    nodeId: v.string(),
    width: v.number(),
    height: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const existing = await ctx.db
      .query("agentGraphNodeLayout")
      .withIndex("by_user_vault_and_node", (q) =>
        q
          .eq("userId", userId)
          .eq("vaultId", args.vaultId)
          .eq("nodeId", args.nodeId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        width: args.width,
        height: args.height,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("agentGraphNodeLayout", {
        userId,
        vaultId: args.vaultId,
        nodeId: args.nodeId,
        width: args.width,
        height: args.height,
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});
