import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Get folder expansion states for a specific vault and user
 */
export const getFolderExpansionStates = query({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: v.array(
    v.object({
      folderPath: v.string(),
      isExpanded: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const expansionStates = await ctx.db
      .query("folderExpansionState")
      .withIndex("by_user_and_vault", (q) => q.eq("userId", userId).eq("vaultId", args.vaultId))
      .collect();

    return expansionStates.map((state) => ({
      folderPath: state.folderPath,
      isExpanded: state.isExpanded,
    }));
  },
});

/**
 * Set folder expansion state for a specific folder
 */
export const setFolderExpansionState = mutation({
  args: {
    vaultId: v.id("vaults"),
    folderPath: v.string(),
    isExpanded: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    // Check if state already exists
    const existingState = await ctx.db
      .query("folderExpansionState")
      .withIndex("by_user_vault_and_path", (q) =>
        q.eq("userId", userId).eq("vaultId", args.vaultId).eq("folderPath", args.folderPath),
      )
      .first();

    if (existingState) {
      // Update existing state
      await ctx.db.patch(existingState._id, {
        isExpanded: args.isExpanded,
      });
    } else {
      // Create new state
      await ctx.db.insert("folderExpansionState", {
        userId,
        vaultId: args.vaultId,
        folderPath: args.folderPath,
        isExpanded: args.isExpanded,
      });
    }

    return null;
  },
});

/**
 * Clear all folder expansion states for a vault (useful for reset)
 */
export const clearFolderExpansionStates = mutation({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const expansionStates = await ctx.db
      .query("folderExpansionState")
      .withIndex("by_user_and_vault", (q) => q.eq("userId", userId).eq("vaultId", args.vaultId))
      .collect();

    // Delete all states for this user and vault
    for (const state of expansionStates) {
      await ctx.db.delete(state._id);
    }

    return null;
  },
});
