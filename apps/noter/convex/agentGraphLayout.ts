import { Infer, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { assertConnectedVault, isLiveConnectedVault } from "./vault/state";

const { id, array, object, string, number, null: vNull } = v;

const nodeLayoutValidator = object({
  nodeId: string(),
  width: number(),
  height: number(),
});

const getNodeLayoutsArgs = object({
  vaultId: id("vaults"),
});

const getNodeLayoutsReturns = array(nodeLayoutValidator);

const setNodeLayoutArgs = object({
  vaultId: id("vaults"),
  nodeId: string(),
  width: number(),
  height: number(),
});

const setNodeLayoutReturns = vNull();

type GetNodeLayoutsArgs = Infer<typeof getNodeLayoutsArgs>;
type SetNodeLayoutArgs = Infer<typeof setNodeLayoutArgs>;

export const getNodeLayouts = query({
  args: getNodeLayoutsArgs,
  returns: getNodeLayoutsReturns,
  handler: async (ctx, args: GetNodeLayoutsArgs) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== userId || !isLiveConnectedVault(vault)) {
      return [];
    }

    const layouts = await ctx.db
      .query("agentGraphNodeLayout")
      .withIndex("by_user_and_vault", (q) => q.eq("userId", userId).eq("vaultId", args.vaultId))
      .collect();

    return layouts.map((layout) => ({
      nodeId: layout.nodeId,
      width: layout.width,
      height: layout.height,
    }));
  },
});

export const setNodeLayout = mutation({
  args: setNodeLayoutArgs,
  returns: setNodeLayoutReturns,
  handler: async (ctx, args: SetNodeLayoutArgs) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }
    assertConnectedVault(vault);

    const existing = await ctx.db
      .query("agentGraphNodeLayout")
      .withIndex("by_user_vault_and_node", (q) =>
        q.eq("userId", userId).eq("vaultId", args.vaultId).eq("nodeId", args.nodeId),
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
