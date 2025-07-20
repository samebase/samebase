import { v } from "convex/values";
import {
  mutation,
  query,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const AUTO_COMMIT_DELAY_MS = 20000; // 20 seconds

// Save file content to staging (real-time)
export const saveToStaging = mutation({
  args: {
    repositoryId: v.string(),
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

    const now = Date.now();

    // Check if staging entry already exists
    const existing = await ctx.db
      .query("fileStaging")
      .filter((q) =>
        q.and(
          q.eq(q.field("repositoryId"), args.repositoryId),
          q.eq(q.field("filePath"), args.filePath),
        ),
      )
      .first();

    let stagingId;

    if (existing) {
      // Update existing staging entry
      await ctx.db.patch(existing._id, {
        content: args.content,
        lastEditTime: now,
        lastEditUserId: userId,
        parentCommitSha: args.parentCommitSha,
      });
      stagingId = existing._id;
    } else {
      // Create new staging entry
      stagingId = await ctx.db.insert("fileStaging", {
        repositoryId: args.repositoryId,
        filePath: args.filePath,
        content: args.content,
        parentCommitSha: args.parentCommitSha,
        lastEditTime: now,
        lastEditUserId: userId,
        branch: args.branch,
      });
    }

    // Schedule auto-commit with user ID
    await ctx.scheduler.runAfter(
      AUTO_COMMIT_DELAY_MS,
      internal.fileStaging.autoCommit,
      {
        repositoryId: args.repositoryId,
        filePath: args.filePath,
        stagingId: stagingId as Id<"fileStaging">,
        scheduledTime: now,
        userId,
      },
    );

    return null;
  },
});

// Get user by ID (internal helper)
export const getUserById = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

// Get staged content for a file (with real-time updates)
export const getStagedFile = query({
  args: {
    repositoryId: v.string(),
    filePath: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const staging = await ctx.db
      .query("fileStaging")
      .filter((q) =>
        q.and(
          q.eq(q.field("repositoryId"), args.repositoryId),
          q.eq(q.field("filePath"), args.filePath),
        ),
      )
      .first();

    return staging;
  },
});

// Get staging by ID (internal helper)
export const getStagingById = internalQuery({
  args: {
    stagingId: v.id("fileStaging"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.stagingId);
  },
});

// Get all staged files for a repository
export const getAllStagedFiles = query({
  args: {
    repositoryId: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fileStaging")
      .filter((q) => q.eq(q.field("repositoryId"), args.repositoryId))
      .collect();
  },
});

// Clear staging after successful commit
export const clearStaging = internalMutation({
  args: {
    repositoryId: v.string(),
    filePath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staging = await ctx.db
      .query("fileStaging")
      .filter((q) =>
        q.and(
          q.eq(q.field("repositoryId"), args.repositoryId),
          q.eq(q.field("filePath"), args.filePath),
        ),
      )
      .first();

    if (staging) {
      await ctx.db.delete(staging._id);
    }

    return null;
  },
});

// Manual commit from client (cancels auto-commit)
export const commitStaging = mutation({
  args: {
    repositoryId: v.string(),
    filePath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    // Get staging entry
    const staging = await ctx.db
      .query("fileStaging")
      .filter((q) =>
        q.and(
          q.eq(q.field("repositoryId"), args.repositoryId),
          q.eq(q.field("filePath"), args.filePath),
        ),
      )
      .first();

    if (!staging) {
      throw new Error("No staged changes to commit");
    }

    // Parse repository info
    const [owner, repo] = args.repositoryId.split("/");
    if (!owner || !repo) {
      throw new Error("Invalid repository ID format");
    }

    // Commit immediately with user ID
    await ctx.scheduler.runAfter(0, internal.fileStaging.manualCommit, {
      repositoryId: args.repositoryId,
      filePath: args.filePath,
      owner,
      repo,
      content: staging.content,
      message: `Update ${args.filePath}`,
      sha: staging.parentCommitSha,
      branch: staging.branch,
      userId,
    });

    return null;
  },
});

// Clean up old staging entries (for maintenance)
export const cleanupOldStaging = internalMutation({
  args: {
    olderThanMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.olderThanMs;

    const oldEntries = await ctx.db
      .query("fileStaging")
      .filter((q) => q.lt(q.field("lastEditTime"), cutoff))
      .collect();

    for (const entry of oldEntries) {
      await ctx.db.delete(entry._id);
    }

    return null;
  },
});

// Get current file status - returns staging if exists, or indicates GitHub fetch needed
export const getFileStatus = query({
  args: {
    repositoryId: v.string(),
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
      .filter((q) =>
        q.and(
          q.eq(q.field("repositoryId"), args.repositoryId),
          q.eq(q.field("filePath"), args.filePath),
        ),
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
