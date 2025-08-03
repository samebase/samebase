"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

// Internal action to commit a staged file to GitHub
export const commitStagedFile = internalAction({
  args: {
    userId: v.id("users"),
    vaultId: v.id("vaults"),
    filePath: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log(
      `Starting commit for ${args.filePath} in vault ${args.vaultId}`,
    );

    try {
      // Get the staging record
      const staging = await ctx.runQuery(
        api.fileStagingMutations.getStagedFile,
        {
          vaultId: args.vaultId,
          filePath: args.filePath,
        },
      );

      if (!staging) {
        console.log(`No staging found for ${args.filePath}`);
        return null;
      }

      console.log(args);

      // Use the provided repository information
      const owner = args.repoOwner;
      const repo = args.repoName;
      if (!owner || !repo) {
        throw new Error("Invalid repository owner or name");
      }

      console.log("--here1", { owner, repo });

      // const user = await ctx.runQuery(api.users.getById, {
      //   userId: args.userId,
      // });

      // Update file content via GitHub API
      const result = await ctx.runAction(api.github.updateFileContent, {
        userId: args.userId,
        vaultId: args.vaultId,
        owner,
        repo,
        path: args.filePath,
        content: staging.content,
        message: `Update ${args.filePath}`,
        sha: staging.parentCommitSha,
        branch: staging.branch,
      });
      console.log("--here3", "after updateFileContent");

      console.log("result", result);

      if (result) {
        // Success - remove from staging
        await ctx.runMutation(internal.fileStagingMutations.clearStaging, {
          vaultId: args.vaultId,
          filePath: args.filePath,
        });

        console.log(`Auto-committed ${args.filePath} in vault ${args.vaultId}`);
      }
    } catch (error) {
      console.error(
        `Failed to auto-commit ${args.filePath} in vault ${args.vaultId}:`,
        error,
      );
      // Don't throw - let the system retry if needed
    }

    return null;
  },
});

// Auto-commit action with timestamp validation (prevents race conditions)
export const autoCommitStagedFile = internalAction({
  args: {
    userId: v.id("users"),
    vaultId: v.id("vaults"),
    filePath: v.string(),
    lastEditTime: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log(
      `Attempting auto-commit for ${args.filePath} in vault ${args.vaultId} (expected timestamp: ${args.lastEditTime})`,
    );

    try {
      // Get current staging record
      const staging = await ctx.runQuery(
        api.fileStagingMutations.getStagedFile,
        {
          vaultId: args.vaultId,
          filePath: args.filePath,
        },
      );

      if (!staging) {
        return null;
      }

      console.log(staging.lastEditTime, args.lastEditTime);

      if (staging.lastEditTime !== args.lastEditTime) {
        return null;
      }

      await ctx.runAction(internal.fileStaging.commitStagedFile, {
        userId: args.userId,
        vaultId: args.vaultId,
        filePath: args.filePath,
        repoOwner: args.repoOwner,
        repoName: args.repoName,
      });

      console.log(
        `Successfully auto-committed ${args.filePath} in vault ${args.vaultId}`,
      );
    } catch (error) {
      console.error(
        `Failed to auto-commit ${args.filePath} in vault ${args.vaultId}:`,
        error,
      );
      // Don't throw - let the system continue without failing the scheduled task
    }

    return null;
  },
});

// Manual commit action (for when users want to commit immediately)
export const manualCommit = internalAction({
  args: {
    userId: v.id("users"),
    vaultId: v.id("vaults"),
    filePath: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      // Just call the same commit logic
      await ctx.runAction(internal.fileStaging.commitStagedFile, {
        userId: args.userId,
        vaultId: args.vaultId,
        filePath: args.filePath,
        repoOwner: args.repoOwner,
        repoName: args.repoName,
      });

      console.log(
        `Manually committed ${args.filePath} in vault ${args.vaultId}`,
      );
    } catch (error) {
      console.error(
        `Failed to manually commit ${args.filePath} in vault ${args.vaultId}:`,
        error,
      );
      throw error;
    }

    return null;
  },
});
