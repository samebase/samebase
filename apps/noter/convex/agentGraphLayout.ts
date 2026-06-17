import { v } from "convex/values";

import { mutation, query } from "./functions";
import { assertConnectedVault, isLiveConnectedVault } from "./vault/state";

const { array, id, number, object, string } = v;

const nodeLayoutValidator = object({
  nodeId: string(),
  width: number(),
  height: number(),
});

export const getNodeLayouts = query({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
  },
  returns: array(nodeLayoutValidator),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== ctx.viewer.userId || !isLiveConnectedVault(vault)) {
      return [];
    }

    const layouts = await ctx.db
      .query("agentGraphNodeLayout")
      .withIndex("by_user_and_vault", (q) =>
        q.eq("userId", ctx.viewer.userId).eq("vaultId", args.vaultId),
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
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
    nodeId: string(),
    width: number(),
    height: number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== ctx.viewer.userId) {
      throw new Error("Vault not found");
    }
    assertConnectedVault(vault);

    const existing = await ctx.db
      .query("agentGraphNodeLayout")
      .withIndex("by_user_vault_and_node", (q) =>
        q.eq("userId", ctx.viewer.userId).eq("vaultId", args.vaultId).eq("nodeId", args.nodeId),
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
        userId: ctx.viewer.userId,
        vaultId: args.vaultId,
        nodeId: args.nodeId,
        width: args.width,
        height: args.height,
        updatedAt: Date.now(),
      });
    }
  },
});
