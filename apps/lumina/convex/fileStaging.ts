"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { getAuthUserId } from "@convex-dev/auth/server";
import { diffLines } from "diff";

// Helper function to create a commit with multiple files
async function createCommitWithMultipleFiles({
  octokit,
  owner,
  repo,
  stagedFiles,
  branch,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  stagedFiles: Array<{
    filePath: string;
    content: string;
    fileDeleted: boolean;
    initialFilePath: string;
    initialContent?: string;
  }>;
  branch: string;
}) {
  // Helper to compute modified (added) line ranges in the new content
  const computeModifiedLineRanges = (
    oldContent: string,
    newContent: string,
  ): Array<{ from: number; to: number }> => {
    const parts = diffLines(oldContent ?? "", newContent ?? "");
    const ranges: Array<{ from: number; to: number }> = [];
    let newLine = 1;
    for (const part of parts) {
      const value = part.value ?? "";
      const lineCount =
        typeof (part as any).count === "number"
          ? (part as any).count
          : value === ""
            ? 0
            : value.split("\n").length; // count lines even without trailing newline
      if (part.added) {
        if (lineCount > 0) {
          ranges.push({ from: newLine, to: newLine + lineCount - 1 });
        }
        newLine += lineCount;
      } else if (part.removed) {
        // Removed lines affect old content only; don't advance newLine
      } else {
        newLine += lineCount;
      }
    }
    return ranges;
  };

  // Summarize all changes to craft a commit message
  const changesInfo: Array<{
    deleted: boolean;
    modifiedLines: Array<{ from: number; to: number }>;
    filePath: string;
    initialFilePath: string;
    wasModified: boolean;
  }> = stagedFiles.map((file) => ({
    deleted: file.fileDeleted,
    filePath: file.filePath,
    initialFilePath: file.initialFilePath,
    modifiedLines: file.fileDeleted
      ? []
      : computeModifiedLineRanges(
          file.initialContent ?? "",
          file.content ?? "",
        ),
    wasModified:
      !file.fileDeleted && (file.initialContent ?? "") !== (file.content ?? ""),
  }));

  try {
    // 1. Get the current commit SHA
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const currentCommitSha = refData.object.sha;

    // 2. Get the current commit to get the tree SHA
    const { data: currentCommit } = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: currentCommitSha,
    });
    const currentTreeSha = currentCommit.tree.sha;

    // 3. Create blobs for modified/new files and handle deletions and renames
    const tree = [] as Array<{
      path: string;
      mode: "100644";
      type: "blob";
      sha: string | null;
    }>;
    for (const file of stagedFiles) {
      if (file.fileDeleted) {
        // For deletions, set sha to null to remove the file from the tree
        tree.push({
          path: file.filePath,
          mode: "100644" as const,
          type: "blob" as const,
          sha: null, // This removes the file
        });
      } else {
        // Check if this is a rename (filePath different from initialFilePath)
        const isRenamed = file.filePath !== file.initialFilePath;

        if (isRenamed) {
          // For renames, we need to:
          // 1. Remove the old file (set sha to null)
          tree.push({
            path: file.initialFilePath,
            mode: "100644" as const,
            type: "blob" as const,
            sha: null, // This removes the old file
          });

          // 2. Add the new file with the same content
          const { data: blob } = await octokit.rest.git.createBlob({
            owner,
            repo,
            content: Buffer.from(file.content, "utf8").toString("base64"),
            encoding: "base64",
          });

          tree.push({
            path: file.filePath,
            mode: "100644" as const,
            type: "blob" as const,
            sha: blob.sha,
          });
        } else {
          // For regular new/modified files, create a blob and add to tree
          const { data: blob } = await octokit.rest.git.createBlob({
            owner,
            repo,
            content: Buffer.from(file.content, "utf8").toString("base64"),
            encoding: "base64",
          });

          tree.push({
            path: file.filePath,
            mode: "100644" as const, // File mode for regular files
            type: "blob" as const,
            sha: blob.sha,
          });
        }
      }
    }

    // 4. Create a new tree
    const { data: newTree } = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: currentTreeSha,
      tree,
    });

    // 5. Create the commit - compact, single-line subject
    const basename = (p: string) => {
      const parts = p.split("/");
      return parts[parts.length - 1] || p;
    };
    const shortRanges = (
      ranges: Array<{ from: number; to: number }>,
      max = 2,
    ) => {
      const items = ranges
        .slice(0, max)
        .map((r) => (r.from === r.to ? `${r.from}` : `${r.from}-${r.to}`));
      return ranges.length > max ? `${items.join(",")},…` : items.join(",");
    };
    const subjectTokens: string[] = [];
    for (const info of changesInfo) {
      const renamed = info.initialFilePath !== info.filePath;
      if (info.deleted) {
        subjectTokens.push(`D ${basename(info.initialFilePath)}`);
      } else if (renamed && info.modifiedLines.length > 0) {
        subjectTokens.push(
          `${basename(info.initialFilePath)}->${basename(info.filePath)}[${shortRanges(info.modifiedLines)}]`,
        );
      } else if (renamed) {
        subjectTokens.push(
          `${basename(info.initialFilePath)}->${basename(info.filePath)}`,
        );
      } else if (info.modifiedLines.length > 0) {
        subjectTokens.push(
          `${basename(info.filePath)}[${shortRanges(info.modifiedLines)}]`,
        );
      } else if (info.wasModified) {
        // Modified but only deletions (no added ranges). Still include token.
        subjectTokens.push(`${basename(info.filePath)}[]`);
      }
    }
    const maxTokens = 4;
    const commitMessage =
      subjectTokens.length === 0
        ? "Update files"
        : subjectTokens.length > maxTokens
          ? `${subjectTokens.slice(0, maxTokens).join(", ")} …`
          : subjectTokens.join(", ");

    const { data: newCommit } = await octokit.rest.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: newTree.sha,
      parents: [currentCommitSha],
    });

    // 6. Update the reference
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    });

    return {
      sha: newCommit.sha,
      url: newCommit.html_url,
    };
  } catch (error) {
    console.error("Failed to create commit:", error);
    throw error;
  }
}

// Internal action to commit all staged files to GitHub
export const commitAllStaged = internalAction({
  args: {
    userId: v.id("users"),
    vaultId: v.id("vaults"),
    repoOwner: v.string(),
    repoName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fullRepo = `${args.repoOwner}/${args.repoName}`;
    console.log(`Starting commit for all staged files in vault ${fullRepo}`);

    const vault = await ctx.runQuery(api.vault.getVaultByRepository, {
      repositoryFullName: fullRepo,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    try {
      // Get the staging record
      const changedFiles = await ctx.runQuery(
        api.fileStagingMutations.listStagedFiles,
        {
          vaultId: args.vaultId,
        },
      );

      if (!changedFiles.length) {
        console.log(`No staging found for ${fullRepo}`);
        return null;
      }

      console.log("--here1", { stagedFiles: changedFiles });

      // const user = await ctx.runQuery(api.users.getById, {
      //   userId: args.userId,
      // });
      const currentUser = await ctx.runQuery(api.users.getById, {
        userId: args.userId,
      });

      if (!currentUser) {
        throw new Error("User not found");
      }

      const octokit: Octokit = new Octokit({
        auth: currentUser.githubAccessToken,
      });

      // Create a commit with all staged files
      const result = await createCommitWithMultipleFiles({
        octokit,
        owner: args.repoOwner,
        repo: args.repoName,
        stagedFiles: changedFiles,
        branch: "main", // branch
      });

      console.log("--here3", "after createCommitWithMultipleFiles");

      console.log("result", result);

      await ctx.runMutation(api.fileStagingMutations.clearAllStaging, {
        vaultId: args.vaultId,
      });

      console.log(
        `Auto-committed ${changedFiles.length} files in vault ${args.vaultId}`,
      );
    } catch (error) {
      console.error(
        `Failed to auto-commit staged files in vault ${args.vaultId}:`,
        error,
      );
      // Don't throw - let the system retry if needed
    }

    return null;
  },
});

// Rename a file in staging (updates the filePath while keeping initialFilePath)
export const renameFileInStaging = action({
  args: {
    vaultId: v.id("vaults"),
    originalPath: v.string(),
    newPath: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    content: string;
  }> => {
    console.log("renameFileInStaging", args);
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    // So that we guarantee that we have the file in staging
    await ctx.runAction(api.fileStaging.getFileForEditing, {
      repositoryFullName: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
      originalFilePath: args.originalPath,
    });

    console.log("after getFileForEditing");

    // Update existing staging record with new path
    const updatedFile = await ctx.runMutation(
      internal.fileStagingMutations.rename,
      {
        vaultId: args.vaultId,
        initialFilePath: args.originalPath,
        newPath: args.newPath,
      },
    );

    const {
      content: _content,
      initialContent: _initialContent,
      ...rest
    } = updatedFile;

    console.log("after rename", rest);

    return {
      content: updatedFile.content,
    };
  },
});
/**
 * Initial request to get the file.
 * Will call GitHub and populate the fileStaging table
 */
export const getFileForEditing = action({
  args: {
    repositoryFullName: v.string(),
    originalFilePath: v.string(),
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
  }> => {
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
      originalFilePath: args.originalFilePath,
    });

    // TODO: Maybe also check the github, if it has updates
    if (staging) {
      // Return staged content
      return {
        content: staging.content,
        parentCommitSha: staging.parentCommitSha,
        lastEditTime: staging.lastEditTime,
        branch: staging.branch,
        version: staging.version,
      };
    }

    const octokit: Octokit = new Octokit({
      auth: currentUser.githubAccessToken,
    });

    try {
      const file = await octokit.rest.repos.getContent({
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        path: args.originalFilePath,
      });

      console.log("----------file", file);

      // Handle case where path is a directory (shouldn't happen in our use case)
      if (Array.isArray(file.data)) {
        throw new Error("Path is a directory");
      }

      if (file.data.type !== "file") {
        throw new Error("Path is not a file");
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
        internal.fileStagingMutations.saveToStaging,
        {
          // TODO: figure out branch
          branch: "main",
          vaultId: vault._id,
          initialFilePath: args.originalFilePath,
          content: utf8Content,
          initialContent: utf8Content,
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
      throw error;
    }
  },
});

// Commit staged file to GitHub
export const commitStaging = action({
  args: {
    repositoryFullName: v.string(),

    // Used to instantly populate the file view. Probably temporary fix.
    currentFilePath: v.string(),
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

    // Schedule the actual GitHub commit
    await ctx.runAction(internal.fileStaging.commitAllStaged, {
      userId,
      vaultId: vault._id,
      repoOwner: vault.ghRepoOwner,
      repoName: vault.ghRepoName,
    });

    // Refresh the file view
    if (args.currentFilePath) {
      await ctx.runAction(api.fileStaging.getFileForEditing, {
        repositoryFullName: args.repositoryFullName,
        originalFilePath: args.currentFilePath,
      });
    }

    return null;
  },
});
