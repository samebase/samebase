"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

// Internal action to commit a staged file to GitHub
export const commitStagedFile = internalAction({
  args: {
    repositoryFullName: v.string(),
    filePath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log(
      `Starting commit for ${args.filePath} in ${args.repositoryFullName}`,
    );

    try {
      // Get the staging record
      const staging = await ctx.runQuery(
        api.fileStagingMutations.getStagedFile,
        {
          repositoryFullName: args.repositoryFullName,
          filePath: args.filePath,
        },
      );

      if (!staging) {
        console.log(`No staging found for ${args.filePath}`);
        return null;
      }

      // Parse owner and repo from repositoryFullName
      const [owner, repo] = args.repositoryFullName.split("/");
      if (!owner || !repo) {
        throw new Error("Invalid repository full name format");
      }

      // Get current user (for GitHub API)
      const user = await ctx.runQuery(api.users.getAuthUser, {});
      if (!user) {
        throw new Error("User not found");
      }

      // Update file content via GitHub API
      const result = await ctx.runAction(api.github.updateFileContent, {
        owner,
        repo,
        path: args.filePath,
        content: staging.content,
        message: `Update ${args.filePath}`,
        sha: staging.parentCommitSha,
        branch: staging.branch,
      });

      if (result) {
        // Success - remove from staging
        await ctx.runMutation(internal.fileStagingMutations.clearStaging, {
          repositoryFullName: args.repositoryFullName,
          filePath: args.filePath,
        });

        console.log(
          `Auto-committed ${args.filePath} in ${args.repositoryFullName}`,
        );
      }
    } catch (error) {
      console.error(
        `Failed to auto-commit ${args.filePath} in ${args.repositoryFullName}:`,
        error,
      );
      // Don't throw - let the system retry if needed
    }

    return null;
  },
});

// Manual commit action (for when users want to commit immediately)
export const manualCommit = internalAction({
  args: {
    repositoryFullName: v.string(),
    filePath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      // Just call the same commit logic
      await ctx.runAction(internal.fileStaging.commitStagedFile, {
        repositoryFullName: args.repositoryFullName,
        filePath: args.filePath,
      });

      console.log(
        `Manually committed ${args.filePath} in ${args.repositoryFullName}`,
      );
    } catch (error) {
      console.error(
        `Failed to manually commit ${args.filePath} in ${args.repositoryFullName}:`,
        error,
      );
      throw error;
    }

    return null;
  },
});
