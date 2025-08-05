"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { getAuthUserId } from "@convex-dev/auth/server";

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
        await ctx.runMutation(api.fileStagingMutations.clearStaging, {
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

/**
 * Initial request to get the file.
 * Will call GitHub and populate the fileStaging table
 */
export const getFileForEditing = action({
  args: {
    repositoryFullName: v.string(),
    filePath: v.string(),
  },

  handler: async (
    ctx,
    args,
  ): Promise<{
    content: string;
    parentCommitSha: string;
    lastEditTime: number;
    branch: string;
    version: number;
  } | null> => {
    const currentUser = await ctx.runQuery(api.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
    }

    const vault = await ctx.runQuery(api.vault.getVaultByRepository, {
      repositoryFullName: args.repositoryFullName,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    console.log({
      args,
    });

    // Check if there's staged content for this file
    const staging = await ctx.runQuery(api.fileStagingMutations.getStagedFile, {
      vaultId: vault._id,
      filePath: args.filePath,
    });

    // TODO: Maybe also check the github, if it has updates
    if (staging) {
      console.log("found in staging", staging);
      // Return staged content
      return {
        content: staging.content,
        parentCommitSha: staging.parentCommitSha,
        lastEditTime: staging.lastEditTime,
        branch: staging.branch,
        version: staging.version,
      };
    }

    console.log("not found in staging");

    const octokit: Octokit = new Octokit({
      auth: currentUser.githubAccessToken,
    });

    try {
      const file = await octokit.rest.repos.getContent({
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        path: args.filePath,
        // ref: args.ref || "main",
      });

      console.log("file", file);

      // Handle case where path is a directory (shouldn't happen in our use case)
      if (Array.isArray(file.data)) {
        return null;
      }

      if (file.data.type !== "file") {
        return null;
      }

      const fileData = file.data;

      const utf8Content = Buffer.from(fileData.content, "base64").toString(
        "utf-8",
      );

      console.log({
        utf8Content,
        fileData,
      });

      // create new staging record
      const stagedFile = await ctx.runMutation(
        api.fileStagingMutations.saveToStaging,
        {
          // TODO: figure out branch
          branch: "main",
          vaultId: vault._id,
          filePath: args.filePath,
          content: utf8Content,
          parentCommitSha: fileData.sha,
        },
      );

      return {
        content: stagedFile.content,
        parentCommitSha: stagedFile.parentCommitSha,
        lastEditTime: stagedFile.lastEditTime,
        branch: stagedFile.branch,
        version: stagedFile.version,
      };
    } catch (error) {
      console.error("error", error);
      return null;
    }
  },
});

// Commit staged file to GitHub
export const commitStaging = action({
  args: {
    repositoryFullName: v.string(),
    filePath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    // Get the vault information while we have auth context
    const vault = await ctx.runQuery(api.vault.getVaultByRepository, {
      repositoryFullName: args.repositoryFullName,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    // Find the staging record
    const staging = await ctx.runQuery(api.fileStagingMutations.getStagedFile, {
      vaultId: vault._id,
      filePath: args.filePath,
    });

    if (!staging) {
      throw new Error("No staged changes found for this file");
    }

    // Schedule the actual GitHub commit
    await ctx.runAction(internal.fileStaging.commitStagedFile, {
      userId,
      vaultId: vault._id,
      filePath: args.filePath,
      repoOwner: vault.ghRepoOwner,
      repoName: vault.ghRepoName,
    });

    return null;
  },
});
