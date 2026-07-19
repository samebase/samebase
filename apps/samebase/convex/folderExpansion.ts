import { v } from "convex/values";
import { mutation, query } from "./functions";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const { boolean, id, object, string } = v;

type FolderExpansionAccessCtx = Pick<QueryCtx | MutationCtx, "db">;

async function canAccessFolderExpansionVault(
  ctx: FolderExpansionAccessCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
  },
) {
  const vault = await ctx.db.get(args.vaultId);
  return vault?.userId === args.userId;
}

// MARK: Public

export const getFolderExpansionStates = query({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
  },
  returns: v.array(
    object({
      folderPath: string(),
      isExpanded: boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    if (
      !(await canAccessFolderExpansionVault(ctx, {
        vaultId: args.vaultId,
        userId: ctx.viewer.userId,
      }))
    ) {
      return [];
    }

    const expansionStates = await ctx.db
      .query("ui_vaultFileTree_folderExpansions")
      .withIndex("by_user_and_vault", (q) =>
        q.eq("userId", ctx.viewer.userId).eq("vaultId", args.vaultId),
      )
      .collect();

    return expansionStates.map((state) => ({
      folderPath: state.folderPath,
      isExpanded: state.isExpanded,
    }));
  },
});

export const setFolderExpansionState = mutation({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
    folderPath: string(),
    isExpanded: boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      !(await canAccessFolderExpansionVault(ctx, {
        vaultId: args.vaultId,
        userId: ctx.viewer.userId,
      }))
    ) {
      throw new Error("Unauthorized");
    }

    const existingState = await ctx.db
      .query("ui_vaultFileTree_folderExpansions")
      .withIndex("by_user_vault_and_path", (q) =>
        q
          .eq("userId", ctx.viewer.userId)
          .eq("vaultId", args.vaultId)
          .eq("folderPath", args.folderPath),
      )
      .first();

    if (existingState) {
      await ctx.db.patch(existingState._id, {
        isExpanded: args.isExpanded,
      });
    } else {
      await ctx.db.insert("ui_vaultFileTree_folderExpansions", {
        userId: ctx.viewer.userId,
        vaultId: args.vaultId,
        folderPath: args.folderPath,
        isExpanded: args.isExpanded,
      });
    }
  },
});

export const clearFolderExpansionStates = mutation({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      !(await canAccessFolderExpansionVault(ctx, {
        vaultId: args.vaultId,
        userId: ctx.viewer.userId,
      }))
    ) {
      throw new Error("Unauthorized");
    }

    const expansionStates = await ctx.db
      .query("ui_vaultFileTree_folderExpansions")
      .withIndex("by_user_and_vault", (q) =>
        q.eq("userId", ctx.viewer.userId).eq("vaultId", args.vaultId),
      )
      .collect();

    for (const state of expansionStates) {
      await ctx.db.delete(state._id);
    }
  },
});
