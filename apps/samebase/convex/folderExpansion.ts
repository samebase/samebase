import { v } from "convex/values";
import { mutation, query } from "./functions";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { findRepositoryForUser } from "./organizationAccess";
import { requireRepositoryOperationStart } from "./repositoryMigration/maintenance";

const { boolean, id, object, string } = v;

type FolderExpansionAccessCtx = Pick<QueryCtx | MutationCtx, "db">;

async function canAccessFolderExpansionRepository(
  ctx: FolderExpansionAccessCtx,
  args: {
    repositoryId: Id<"repositories">;
    userId: Id<"users">;
  },
) {
  return (await findRepositoryForUser(ctx.db, args)) !== null;
}

// MARK: Public

export const getFolderExpansionStates = query({
  access: "access_files_read",
  args: {
    repositoryId: id("repositories"),
  },
  returns: v.array(
    object({
      folderPath: string(),
      isExpanded: boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    if (
      !(await canAccessFolderExpansionRepository(ctx, {
        repositoryId: args.repositoryId,
        userId: ctx.viewer.userId,
      }))
    ) {
      return [];
    }

    const expansionStates = await ctx.db
      .query("ui_repositoryFileTree_folderExpansions")
      .withIndex("by_user_and_repository", (q) =>
        q.eq("userId", ctx.viewer.userId).eq("repositoryId", args.repositoryId),
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
    repositoryId: id("repositories"),
    folderPath: string(),
    isExpanded: boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRepositoryOperationStart(ctx);
    if (
      !(await canAccessFolderExpansionRepository(ctx, {
        repositoryId: args.repositoryId,
        userId: ctx.viewer.userId,
      }))
    ) {
      throw new Error("Unauthorized");
    }

    const existingState = await ctx.db
      .query("ui_repositoryFileTree_folderExpansions")
      .withIndex("by_user_repository_and_path", (q) =>
        q
          .eq("userId", ctx.viewer.userId)
          .eq("repositoryId", args.repositoryId)
          .eq("folderPath", args.folderPath),
      )
      .first();

    if (existingState) {
      await ctx.db.patch(existingState._id, {
        isExpanded: args.isExpanded,
      });
    } else {
      await ctx.db.insert("ui_repositoryFileTree_folderExpansions", {
        userId: ctx.viewer.userId,
        repositoryId: args.repositoryId,
        folderPath: args.folderPath,
        isExpanded: args.isExpanded,
      });
    }
  },
});

export const clearFolderExpansionStates = mutation({
  access: "access_files_read",
  args: {
    repositoryId: id("repositories"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRepositoryOperationStart(ctx);
    if (
      !(await canAccessFolderExpansionRepository(ctx, {
        repositoryId: args.repositoryId,
        userId: ctx.viewer.userId,
      }))
    ) {
      throw new Error("Unauthorized");
    }

    const expansionStates = await ctx.db
      .query("ui_repositoryFileTree_folderExpansions")
      .withIndex("by_user_and_repository", (q) =>
        q.eq("userId", ctx.viewer.userId).eq("repositoryId", args.repositoryId),
      )
      .collect();

    for (const state of expansionStates) {
      await ctx.db.delete(state._id);
    }
  },
});
