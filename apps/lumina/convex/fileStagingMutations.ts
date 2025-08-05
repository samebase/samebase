import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

export const AUTO_COMMIT_DELAY_MS = 2 * 1000;

// Save file content to staging for real-time editing
export const saveToStaging = mutation({
  args: {
    vaultId: v.id("vaults"),
    filePath: v.string(),
    content: v.string(),
    parentCommitSha: v.string(),
    branch: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    // Check if there's already a staging record for this file
    const existingStaging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("filePath", args.filePath),
      )
      .first();

    // console.log("saveToStaging", { args, existingStaging });

    const currentTimestamp = Date.now();

    if (existingStaging) {
      // Codemirror gives lots of updates
      if (existingStaging.content === args.content) {
        return existingStaging;
      }

      console.log({
        old: existingStaging.content,
        new: args.content,
      });

      // Update existing staging
      await ctx.db.patch(existingStaging._id, {
        content: args.content,
        lastEditTime: currentTimestamp,
        lastEditUserId: userId,
        branch: args.branch,
      });
    } else {
      // Create new staging record
      await ctx.db.insert("fileStaging", {
        ownerId: userId,
        vaultId: args.vaultId,
        filePath: args.filePath,
        content: args.content,
        parentCommitSha: args.parentCommitSha,
        lastEditTime: currentTimestamp,
        lastEditUserId: userId,
        branch: args.branch,
        version: 0,
      });
    }

    const staging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("filePath", args.filePath),
      )
      .first();

    if (!staging) {
      throw new Error("Should not happen. Staging not found after saving?!?");
    }

    return staging;
  },
});

// Get staged content for a file (with real-time updates)
export const getStagedFile = query({
  args: {
    vaultId: v.id("vaults"),
    filePath: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const staging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("filePath", args.filePath),
      )
      .first();

    return staging;
  },
});

// List all files currently in staging for a vault
export const listStagedFiles = query({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();

    return files;
  },
});

// Clear staging for a specific file (used after successful commit)
export const clearStaging = mutation({
  args: {
    vaultId: v.id("vaults"),
    filePath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("filePath", args.filePath),
      )
      .first();

    // delete all updates for this file
    const updates = await ctx.db
      .query("collaborativeUpdates")
      .withIndex("by_file", (q) =>
        q.eq("vaultId", args.vaultId).eq("filePath", args.filePath),
      )
      .collect();

    for (const update of updates) {
      await ctx.db.delete(update._id);
    }

    if (staging) {
      await ctx.db.delete(staging._id);
    }

    return null;
  },
});
