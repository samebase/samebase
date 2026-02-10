// @ts-nocheck
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

    // Commit all staged files to GitHub
    // commitAllStaged handles: commit → update tree → save blobs → clear staging
    await ctx.runAction(internal.fileStagingActions.commitAllStaged, {
      userId,
      vaultId: vault._id,
      repoOwner: vault.ghRepoOwner,
      repoName: vault.ghRepoName,
    });

    return null;
  },
});

// Pull the latest tree from GitHub and reconcile with staged files.
// Staged files with real edits are preserved (noter wins).
// Unchanged staging records are cleaned up.
export const pullFromGitHub = action({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    // Atomically claim the refresh lock; force because user explicitly requested pull
    const { claimed } = await ctx.runMutation(internal.vault.claimTreeRefresh, {
      vaultId: vault._id,
      force: true,
    });
    if (!claimed) return null;

    try {
      await ctx.runAction(internal.fileStagingActions.pullFromGitHubInternal, {
        userId,
        vaultId: args.vaultId,
      });
    } finally {
      await ctx.runMutation(internal.vault.releaseTreeRefresh, {
        vaultId: vault._id,
      });
    }

    return null;
  },
});

// Internal action that performs the actual pull logic
export const pullFromGitHubInternal = internalAction({
  args: {
    userId: v.id("users"),
    vaultId: v.id("vaults"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await ctx.runQuery(internal.users.getById, {
      userId: args.userId,
    });
    if (!currentUser) {
      throw new Error("User not found");
    }

    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    const octokit = new Octokit({
      auth: currentUser.githubAccessToken,
    });

    // 1. Fetch fresh tree from GitHub
    const tree = await octokit.rest.git.getTree({
      owner: vault.ghRepoOwner,
      repo: vault.ghRepoName,
      tree_sha: "HEAD",
      recursive: "1",
    });

    const newTree = tree.data;

    // Build a map of path → sha for quick lookups
    const treeMap = new Map<string, string>();
    for (const item of newTree.tree) {
      if (item.path && item.sha) {
        treeMap.set(item.path, item.sha);
      }
    }

    // 2. Read all staging records for this vault (including unchanged)
    const allStaged = await ctx.runQuery(api.fileStaging.listStagedFiles, {
      vaultId: args.vaultId,
      includeUnchanged: true,
    });

    // 3. Build reconciliation instructions
    type Instruction =
      | { action: "delete"; stagingId: (typeof allStaged)[0]["_id"] }
      | {
          action: "update";
          stagingId: (typeof allStaged)[0]["_id"];
          parentCommitSha: string | null;
          initialContent?: string;
        };

    const instructions: Instruction[] = [];
    const blobFetchQueue: Array<{
      stagingId: (typeof allStaged)[0]["_id"];
      sha: string;
    }> = [];

    for (const staged of allStaged) {
      const isEdited =
        staged.content !== staged.initialContent ||
        staged.fileDeleted ||
        staged.filePath !== staged.initialFilePath;
      const isNewFile = staged.parentCommitSha === null;

      // Rule 6: New file in staging → always keep
      if (isNewFile) {
        continue;
      }

      const pathInTree = staged.initialFilePath;
      const newSha = treeMap.get(pathInTree);
      const fileExistsOnGitHub = newSha !== undefined;

      if (!isEdited) {
        // Content === initialContent (unchanged edit)
        // Rule 3 & 4: drop the staging record regardless of GitHub state
        instructions.push({ action: "delete", stagingId: staged._id });
        continue;
      }

      // File has real edits (noter wins)
      if (!fileExistsOnGitHub) {
        // Rule 2: Deleted on GitHub but edited in noter → treat as new file
        instructions.push({
          action: "update",
          stagingId: staged._id,
          parentCommitSha: null,
        });
      } else if (newSha !== staged.parentCommitSha) {
        // File exists on GitHub with a new SHA → need to fetch new content
        // for initialContent update, but preserve user's content
        blobFetchQueue.push({ stagingId: staged._id, sha: newSha });
      }
      // else: same SHA → no change needed (Rule 5)
    }

    // 4. Fetch blobs for files that changed on GitHub (need new initialContent)
    for (const item of blobFetchQueue) {
      try {
        const blob = await octokit.rest.git.getBlob({
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          file_sha: item.sha,
        });
        const buffer = Buffer.from(blob.data.content, "base64");
        const newContent = buffer.toString("utf-8");
        instructions.push({
          action: "update",
          stagingId: item.stagingId,
          parentCommitSha: item.sha,
          initialContent: newContent,
        });
      } catch (error) {
        console.error(`Failed to fetch blob ${item.sha}:`, error);
        // Still update the parentCommitSha even if we can't get content
        instructions.push({
          action: "update",
          stagingId: item.stagingId,
          parentCommitSha: item.sha,
        });
      }
    }

    // 5. Apply reconciliation instructions
    if (instructions.length > 0) {
      await ctx.runMutation(internal.fileStaging.reconcileStagingWithTree, {
        vaultId: args.vaultId,
        instructions,
      });
    }

    // 6. Update the vault tree
    await ctx.runMutation(internal.vault.updateVaultTree, {
      vaultId: args.vaultId,
      treeData: newTree,
    });

    return null;
  },
});

// Batch-fetch file contents (read-only, no staging records).
// Used by the Monaco editor to load project files for TypeScript import resolution.
export const batchReadFiles = action({
  args: {
    vaultId: v.id("vaults"),
    filePaths: v.array(v.string()),
  },
  returns: v.array(v.object({ path: v.string(), content: v.string() })),
  handler: async (ctx, args) => {
    const currentUser = await ctx.runQuery(internal.users.getAuthUser, {});
    if (!currentUser) {
      throw new Error("User not found");
    }

    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    // Build a map of path → tree entry for fast lookups
    const treeMap = new Map<string, { sha: string; size?: number }>();
    for (const item of vault.treeData.tree) {
      if (item.type === "blob" && item.sha) {
        treeMap.set(item.path, { sha: item.sha, size: item.size });
      }
    }

    const MAX_FILE_SIZE = 100_000; // 100KB – skip large generated files
    const results: Array<{ path: string; content: string }> = [];

    // Lazily create Octokit only if we need to hit GitHub
    let octokit: Octokit | null = null;
    const getOctokit = () => {
      if (!octokit) {
        octokit = new Octokit({ auth: currentUser.githubAccessToken });
      }
      return octokit;
    };

    for (const filePath of args.filePaths) {
      const entry = treeMap.get(filePath);
      if (!entry) continue; // file not in tree, skip

      // Skip files that are too large
      if (entry.size !== undefined && entry.size > MAX_FILE_SIZE) continue;

      // 1. Try blob cache
      const cached = await ctx.runQuery(internal.gitOperations.getBlobBySha, {
        sha: entry.sha,
      });

      if (cached && typeof cached.text === "string") {
        results.push({ path: filePath, content: cached.text });
        continue;
      }

      // 2. Fetch from GitHub (blob API by SHA – lightweight)
      try {
        const blob = await getOctokit().rest.git.getBlob({
          owner: vault.ghRepoOwner,
          repo: vault.ghRepoName,
          file_sha: entry.sha,
        });

        const buffer = Buffer.from(blob.data.content, "base64");

        // Skip binary files
        if (!isTextBuffer(new Uint8Array(buffer))) continue;

        const text = buffer.toString("utf-8");

        // Cache in blob store for future reads
        if (buffer.byteLength <= INLINE_TEXT_MAX) {
          const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
          await ctx.runMutation(internal.gitOperations.saveFileBlob, {
            vaultId: vault._id,
            sha: entry.sha,
            size: buffer.byteLength,
            text,
            storageId: undefined,
            ext,
            mime: "text/plain; charset=utf-8",
            debugFilePath: filePath,
          });
        }

        results.push({ path: filePath, content: text });
      } catch (error) {
        // Skip files that fail to fetch (permissions, deleted, etc.)
        console.warn(`batchReadFiles: failed to fetch ${filePath}:`, error);
      }
    }

    return results;
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
    parentCommitSha: string | null;
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

  // 1. Prepare file lists
  const pathsToDelete = new Set<string>();
  const filesToAdd: Array<{
    filePath: string;
    content: string;
  }> = [];

  for (const file of stagedFiles) {
    if (file.fileDeleted) {
      // Only delete paths that actually exist in the repo
      if (file.parentCommitSha !== null) {
        pathsToDelete.add(file.filePath);
      }
    } else {
      const isRenamed = file.filePath !== file.initialFilePath;
      if (isRenamed && file.parentCommitSha !== null) {
        pathsToDelete.add(file.initialFilePath);
      }
      filesToAdd.push({
        filePath: file.filePath,
        content: file.content,
      });
    }
  }

  // 2. Build tree entries with inline content (no separate createBlob needed)
  //    GitHub creates blobs atomically as part of createTree, avoiding propagation races.
  const newTreeEntries: Array<
    | { path: string; mode: "100644"; type: "blob"; sha: null }
    | { path: string; mode: "100644"; type: "blob"; content: string }
  > = [];

  for (const path of pathsToDelete) {
    newTreeEntries.push({
      path,
      mode: "100644",
      type: "blob",
      sha: null,
    });
  }

  for (const file of filesToAdd) {
    newTreeEntries.push({
      path: file.filePath,
      mode: "100644",
      type: "blob",
      content: file.content,
    });
  }

  // 3. Build commit message
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

  // 4. Retry loop for ref-dependent operations (getRef → getCommit → createTree → createCommit → updateRef)
  //    Retries handle transient GitHub 422 (GitRPC::BadObjectState) and 409 (conflict) errors.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      const currentCommitSha = refData.object.sha;

      const { data: currentCommit } = await octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: currentCommitSha,
      });
      const currentTreeSha = currentCommit.tree.sha;

      const { data: newTree } = await octokit.rest.git.createTree({
        owner,
        repo,
        base_tree: currentTreeSha,
        tree: newTreeEntries as any,
      });

      const { data: newCommit } = await octokit.rest.git.createCommit({
        owner,
        repo,
        message: commitMessage,
        tree: newTree.sha,
        parents: [currentCommitSha],
      });

      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommit.sha,
        force: true,
      });

      return {
        sha: newCommit.sha,
        url: newCommit.html_url,
      };
    } catch (error) {
      const status = (error as { status?: number }).status;
      const isRetryable = status === 422 || status === 409;
      if (!isRetryable || attempt === MAX_ATTEMPTS - 1) {
        console.error("Failed to create commit:", error);
        throw error;
      }
      console.warn(
        `Commit attempt ${attempt + 1} failed (status ${status}), retrying...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  // Unreachable — the loop always returns or throws — but satisfies TypeScript
  throw new Error("Exhausted commit retry attempts");
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

      // 1. Update the vault tree FIRST so new SHAs are available
      await ctx.runAction(internal.github.updateRepositoryTree, {
        userId: args.userId,
        owner: args.repoOwner,
        repo: args.repoName,
      });

      // 2. Re-read the vault to get the updated tree with new SHAs
      const updatedVault = await ctx.runQuery(
        internal.vault.getByRepositoryFullName,
        {
          repositoryFullName: fullRepo,
          userId: args.userId,
        },
      );

      // 3. Save committed file contents into the blob cache under their new SHAs
      //    so that when the client re-fetches after staging is cleared, it gets
      //    the correct content immediately without hitting GitHub API
      if (updatedVault) {
        for (const file of changedFiles) {
          if (file.fileDeleted) continue;

          const newSha = updatedVault.treeData.tree.find(
            (t: { path?: string }) => t.path === file.filePath,
          )?.sha;

          if (newSha && typeof file.content === "string") {
            await ctx.runMutation(internal.gitOperations.saveFileBlob, {
              vaultId: args.vaultId,
              sha: newSha,
              size: Buffer.byteLength(file.content, "utf-8"),
              text: file.content,
              storageId: undefined,
              ext: file.filePath.split(".").pop()?.toLowerCase() ?? "",
              mime: "text/plain; charset=utf-8",
              debugFilePath: file.filePath,
            });
          }
        }
      }

      // 4. NOW clear staging — client will refetch with correct tree + blobs
      await ctx.runMutation(api.fileStaging.clearAllStaging, {
        vaultId: args.vaultId,
        skipTreeUpdate: true,
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
