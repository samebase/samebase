"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Auto-commit staged changes (server-side)
export const autoCommit = internalAction({
  args: {
    repositoryId: v.string(),
    filePath: v.string(),
    stagingId: v.id("fileStaging"),
    scheduledTime: v.number(),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get the current staging entry to check if it's still the same one we scheduled for
    const staging = await ctx.runQuery(
      internal.fileStagingMutations.getStagingById,
      {
        stagingId: args.stagingId,
      },
    );

    if (!staging) {
      // Staging entry was already committed or deleted
      return null;
    }

    // Only commit if this is still the latest edit (no newer edits have happened)
    if (staging.lastEditTime > args.scheduledTime) {
      // A newer edit has happened, so this scheduled commit is obsolete
      return null;
    }

    // Get user's GitHub access token
    const user = await ctx.runQuery(internal.fileStagingMutations.getUserById, {
      userId: args.userId,
    });

    if (!user || !user.githubAccessToken) {
      console.error("GitHub access token not found for user");
      return null;
    }

    // Parse repository info
    const [owner, repo] = args.repositoryId.split("/");
    if (!owner || !repo) {
      console.error("Invalid repository ID format");
      return null;
    }

    try {
      // Commit the changes to GitHub using Octokit directly
      const { Octokit } = await import("@octokit/rest");

      const octokit = new Octokit({
        auth: user.githubAccessToken,
      });

      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: args.filePath,
        message: `Auto-commit: Update ${args.filePath}`,
        content: Buffer.from(staging.content, "utf8").toString("base64"),
        sha: staging.parentCommitSha,
        branch: staging.branch,
      });

      // Clear staging after successful commit
      await ctx.runMutation(internal.fileStagingMutations.clearStaging, {
        repositoryId: args.repositoryId,
        filePath: args.filePath,
      });

      console.log(`Auto-committed ${args.filePath} in ${args.repositoryId}`);
    } catch (error) {
      console.error(
        `Failed to auto-commit ${args.filePath} in ${args.repositoryId}:`,
        error,
      );
      // Don't clear staging on error so user can try again
    }

    return null;
  },
});

// Manual commit action (server-side)
export const manualCommit = internalAction({
  args: {
    repositoryId: v.string(),
    filePath: v.string(),
    owner: v.string(),
    repo: v.string(),
    content: v.string(),
    message: v.string(),
    sha: v.string(),
    branch: v.string(),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get user's GitHub access token
    const user = await ctx.runQuery(internal.fileStagingMutations.getUserById, {
      userId: args.userId,
    });

    if (!user || !user.githubAccessToken) {
      throw new Error("GitHub access token not found for user");
    }

    try {
      // Commit the changes to GitHub using Octokit directly
      const { Octokit } = await import("@octokit/rest");

      const octokit = new Octokit({
        auth: user.githubAccessToken,
      });

      await octokit.rest.repos.createOrUpdateFileContents({
        owner: args.owner,
        repo: args.repo,
        path: args.filePath,
        message: args.message,
        content: Buffer.from(args.content, "utf8").toString("base64"),
        sha: args.sha,
        branch: args.branch,
      });

      // Clear staging after successful commit
      await ctx.runMutation(internal.fileStagingMutations.clearStaging, {
        repositoryId: args.repositoryId,
        filePath: args.filePath,
      });

      console.log(
        `Manually committed ${args.filePath} in ${args.repositoryId}`,
      );
    } catch (error) {
      console.error(
        `Failed to manually commit ${args.filePath} in ${args.repositoryId}:`,
        error,
      );
      throw error;
    }

    return null;
  },
});
