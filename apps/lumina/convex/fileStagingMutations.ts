import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
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
  returns: v.null(),
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
        return null;
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
      });
    }

    console.log("userId in mutation", userId);

    // Schedule auto-commit after 20 seconds with timestamp validation
    // await ctx.scheduler.runAfter(
    //   AUTO_COMMIT_DELAY_MS,
    //   internal.fileStaging.autoCommitStagedFile,
    //   {
    //     userId,
    //     vaultId: args.vaultId,
    //     filePath: args.filePath,
    //     lastEditTime: currentTimestamp,
    //   },
    // );

    return null;
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

// Commit staged file to GitHub
export const commitStaging = mutation({
  args: {
    vaultId: v.id("vaults"),
    filePath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    // Find the staging record
    const staging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("filePath", args.filePath),
      )
      .first();

    if (!staging) {
      throw new Error("No staged changes found for this file");
    }

    // Schedule the actual GitHub commit
    await ctx.scheduler.runAfter(0, internal.fileStaging.commitStagedFile, {
      userId,
      vaultId: args.vaultId,
      filePath: args.filePath,
    });

    return null;
  },
});

// Clear staging for a specific file (used after successful commit)
export const clearStaging = internalMutation({
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

    if (staging) {
      await ctx.db.delete(staging._id);
    }

    return null;
  },
});

// Get current file status - returns staging if exists, or indicates GitHub fetch needed
export const getFileStatus = query({
  args: {
    vaultId: v.id("vaults"),
    filePath: v.string(),
  },
  returns: v.union(
    v.object({
      hasStaging: v.literal(true),
      content: v.string(),
      parentCommitSha: v.string(),
      lastEditTime: v.number(),
      branch: v.string(),
    }),
    v.object({
      hasStaging: v.literal(false),
    }),
  ),
  handler: async (ctx, args) => {
    // Check if there's staged content for this file
    const staging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("filePath", args.filePath),
      )
      .first();

    if (staging) {
      // Return staged content
      return {
        hasStaging: true as const,
        content: staging.content,
        parentCommitSha: staging.parentCommitSha,
        lastEditTime: staging.lastEditTime,
        branch: staging.branch,
      };
    }

    // No staging - indicate GitHub fetch needed
    return {
      hasStaging: false as const,
    };
  },
});
