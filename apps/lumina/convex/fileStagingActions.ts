"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { diffLines } from "diff";
import { getUserId } from "./common";
import {
  guessMime,
  INLINE_TEXT_MAX,
  isTextBuffer,
  withRetry,
} from "./gitOperationsActions";

// MARK: Public

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
    await getUserId(ctx);

    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    // So that we guarantee that we have the file in staging
    await ctx.runAction(api.fileStagingActions.getFileForEditing, {
      repositoryFullName: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
      originalFilePath: args.originalPath,
    });

    // Update existing staging record with new path
    const updatedFile = await ctx.runMutation(internal.fileStaging.rename, {
      vaultId: args.vaultId,
      initialFilePath: args.originalPath,
      newPath: args.newPath,
    });

    const {
      content: _content,
      initialContent: _initialContent,
      ...rest
    } = updatedFile;

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
    parentCommitSha: string | null;
    lastEditTime: number;
    branch: string;
    version: number;
  }> => {
    const currentUser = await ctx.runQuery(internal.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
    }

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId: currentUser._id,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    // Check if there's staged content for this file
    const staging = await ctx.runQuery(internal.fileStaging.getByOriginalPath, {
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

    // console.log("vault.treeData", vault.treeData);
    console.log("args.originalFilePath", args.originalFilePath);

    // read from blobs table
    const fileSha = vault.treeData.tree.find(
      (t) => t.path === args.originalFilePath,
    )?.sha;

    if (!fileSha) {
      throw new Error("File not found in tree");
    }

    // Try getting it from blob sha
    try {
      const blobFile = await ctx.runQuery(internal.gitOperations.getBlobBySha, {
        sha: fileSha,
      });

      if (blobFile) {
        if (typeof blobFile.text !== "string") {
          throw new Error("File is in storage, not implemented yet");
        }

        // create new staging record
        const stagedFile = await ctx.runMutation(
          internal.fileStaging.saveToStaging,
          {
            // TODO: figure out branch
            branch: "main",
            vaultId: vault._id,
            initialFilePath: args.originalFilePath,
            content: blobFile.text,
            initialContent: blobFile.text,
            parentCommitSha: fileSha,
          },
        );

        return {
          content: stagedFile.content,
          parentCommitSha: stagedFile.parentCommitSha,
          lastEditTime: stagedFile.lastEditTime,
          branch: stagedFile.branch,
          version: stagedFile.version,
        };
      }

      // Otherwise get from github

      const octokit: Octokit = new Octokit({
        auth: currentUser.githubAccessToken,
      });

      try {
        const file = await octokit.rest.repos.getContent({
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          path: args.originalFilePath,
        });

        // Handle case where path is a directory (shouldn't happen in our use case)
        if (Array.isArray(file.data)) {
          throw new Error("Path is a directory");
        }

        if (file.data.type !== "file") {
          throw new Error("Path is not a file");
        }

        const filePath = file.data.path;
        const fileData = file.data;
        const buffer = Buffer.from(fileData.content, "base64");
        const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
        const isText = isTextBuffer(new Uint8Array(buffer));
        let mime = guessMime(filePath);
        if (mime === "application/octet-stream" && isText) {
          mime = "text/plain; charset=utf-8";
        }

        if (isText && fileData.size < INLINE_TEXT_MAX) {
          await ctx.runMutation(internal.gitOperations.saveFileBlob, {
            vaultId: vault._id,
            sha: fileSha,
            size: fileData.size,
            mime: fileData.type,
            text: buffer.toString("utf-8"),
            storageId: undefined,
            ext,
            debugFilePath: filePath,
          });
        } else {
          // store in storage
          const storageId = await withRetry(() =>
            ctx.storage.store(new Blob([buffer], { type: mime })),
          );

          await ctx.runMutation(internal.gitOperations.saveFileBlob, {
            vaultId: vault._id,
            sha: fileSha,
            size: fileData.size,
            mime: fileData.type,
            text: undefined,
            storageId,
            ext,
            debugFilePath: filePath,
          });
        }

        const blobFile = await ctx.runQuery(
          internal.gitOperations.getBlobBySha,
          {
            sha: fileSha,
          },
        );

        if (!blobFile) {
          throw new Error(
            "File not found in blobs table after literally saving it there?!?",
          );
        }

        if (typeof blobFile.text !== "string") {
          throw new Error("File is in storage, not implemented yet");
        }

        const stagedFile = await ctx.runMutation(
          internal.fileStaging.saveToStaging,
          {
            // TODO: figure out branch
            branch: "main",
            vaultId: vault._id,
            initialFilePath: args.originalFilePath,
            content: blobFile.text,
            initialContent: blobFile.text,
            parentCommitSha: fileSha,
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
    const userId = await getUserId(ctx);

    // Get the vault information while we have auth context
    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    // Schedule the actual GitHub commit
    await ctx.runAction(internal.fileStagingActions.commitAllStaged, {
      userId,
      vaultId: vault._id,
      repoOwner: vault.ghRepoOwner,
      repoName: vault.ghRepoName,
    });

    // Refresh the file view
    if (args.currentFilePath) {
      await ctx.runAction(api.fileStagingActions.getFileForEditing, {
        repositoryFullName: args.repositoryFullName,
        originalFilePath: args.currentFilePath,
      });
    }

    return null;
  },
});

// MARK: Internal

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

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: fullRepo,
      userId: args.userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    try {
      // Get the staging record
      const changedFiles = await ctx.runQuery(api.fileStaging.listStagedFiles, {
        vaultId: args.vaultId,
      });

      if (!changedFiles.length) {
        return null;
      }

      // const user = await ctx.runQuery(internal.users.getById, {
      //   userId: args.userId,
      // });
      const currentUser = await ctx.runQuery(internal.users.getById, {
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

      await ctx.runMutation(api.fileStaging.clearAllStaging, {
        vaultId: args.vaultId,
      });

      await ctx.runAction(internal.github.updateRepositoryTree, {
        userId: args.userId,
        owner: args.repoOwner,
        repo: args.repoName,
      });
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
