"use node";

import { action, internalAction } from "./_generated/server";
import { getUserId } from "./common";
import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { guessMime, withRetry } from "./gitOperationsActions";
import {
  getRepositoryMediaKind,
  isSvgRepositoryMediaPath,
} from "../shared/repositoryMedia";

// List the current user's GitHub repositories
export const listRepositories = action({
  args: {},
  returns: v.array(
    v.object({
      id: v.number(),
      name: v.string(),
      full_name: v.string(),
      html_url: v.string(),
      description: v.union(v.string(), v.null()),
      private: v.boolean(),
      fork: v.boolean(),
      created_at: v.string(),
      updated_at: v.string(),
      language: v.union(v.string(), v.null()),
      stargazers_count: v.number(),
      forks_count: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const githubConnection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId,
        kind: "github",
      },
    );
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const accessToken = githubConnection.auth.credential;

    // Fetch repositories from GitHub API
    const response = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=100",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "noter-App",
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`,
      );
    }

    const repos: any[] = await response.json();

    const val = repos.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      html_url: repo.html_url,
      description: repo.description,
      private: repo.private,
      fork: repo.fork,
      created_at: repo.created_at,
      updated_at: repo.updated_at,
      language: repo.language,
      stargazers_count: repo.stargazers_count,
      forks_count: repo.forks_count,
    }));
    return val;
  },
});

const repositoryFileContentResult = v.union(
  v.object({ exists: v.literal(false) }),
  v.object({ exists: v.literal(true), content: v.string() }),
);

type RepositoryFileContent =
  | { exists: false }
  | { exists: true; content: string };
const PAGE_LOAD_REFRESH_DEBOUNCE_MS = 10 * 1000;

const repositoryMediaAssetResult = v.union(
  v.object({
    found: v.literal(false),
    reason: v.literal("missing"),
  }),
  v.object({
    found: v.literal(false),
    reason: v.literal("unavailable"),
    message: v.string(),
  }),
  v.object({
    found: v.literal(true),
    kind: v.literal("image"),
    mimeType: v.string(),
    url: v.string(),
    fileName: v.string(),
  }),
);

type RepositoryMediaAsset = Infer<typeof repositoryMediaAssetResult>;

function buildDataUrl(mimeType: string, content: Buffer): string {
  return `data:${mimeType};base64,${content.toString("base64")}`;
}

function readStoredMimeType(
  filePath: string,
  blobMime: string | undefined,
): string {
  if (typeof blobMime === "string" && blobMime.includes("/")) {
    return blobMime;
  }
  return guessMime(filePath);
}

function getRepositoryMediaFileName(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

function getRepositoryMediaExtension(filePath: string): string {
  const fileName = getRepositoryMediaFileName(filePath);
  const extensionStart = fileName.lastIndexOf(".");
  if (extensionStart === -1 || extensionStart === fileName.length - 1) {
    return "";
  }
  return fileName.slice(extensionStart + 1).toLowerCase();
}

function getRepositoryMediaErrorStatus(error: unknown): number | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return null;
}

function getRepositoryMediaErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Preview unavailable.";
}

function isRepositoryMediaTooLargeError(error: unknown): boolean {
  if (getRepositoryMediaErrorStatus(error) !== 403) {
    return false;
  }

  const message = getRepositoryMediaErrorMessage(error).toLowerCase();
  return (
    message.includes("too large") ||
    message.includes("too_large") ||
    message.includes("blobs up to 1 mb")
  );
}

export const getRepositoryFileContent = action({
  args: {
    repositoryFullName: v.string(),
    filePath: v.string(),
    branch: v.optional(v.string()),
  },
  returns: repositoryFileContentResult,
  handler: async (ctx, args): Promise<RepositoryFileContent> => {
    const userId = await getUserId(ctx);

    const currentUser = await ctx.runQuery(internal.users.getById, {
      userId,
    });

    if (!currentUser) {
      throw new Error("User not found");
    }

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    const targetFile = vault.treeData.tree.find(
      (item: { path: string; type: string; sha?: string }) =>
        item.path === args.filePath && item.type === "blob",
    );

    if (!targetFile?.sha) {
      return { exists: false };
    }

    const blobFile = await ctx.runQuery(internal.gitOperations.getBlobBySha, {
      sha: targetFile.sha,
    });

    if (blobFile && typeof blobFile.text === "string") {
      return {
        exists: true,
        content: blobFile.text,
      };
    }

    const githubConnection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId,
        kind: "github",
      },
    );
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const octokit: Octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });

    try {
      const file = await octokit.rest.repos.getContent({
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        path: args.filePath,
        ref: args.branch,
      });

      if (Array.isArray(file.data) || file.data.type !== "file") {
        return { exists: false };
      }

      const contentBuffer = Buffer.from(file.data.content, "base64");
      return {
        exists: true,
        content: contentBuffer.toString("utf-8"),
      };
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof error.status === "number" &&
        error.status === 404
      ) {
        return { exists: false };
      }

      throw error;
    }
  },
});

export const getRepositoryMediaAsset = action({
  args: {
    repositoryFullName: v.string(),
    filePath: v.string(),
    branch: v.optional(v.string()),
  },
  returns: repositoryMediaAssetResult,
  handler: async (ctx, args): Promise<RepositoryMediaAsset> => {
    const mediaKind = getRepositoryMediaKind(args.filePath);
    if (mediaKind === null) {
      return { found: false, reason: "missing" };
    }

    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: args.repositoryFullName,
      userId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    const requestedBranch = args.branch?.trim();
    const fileName = getRepositoryMediaFileName(args.filePath);

    if (!requestedBranch) {
      const targetFile = vault.treeData.tree.find(
        (item: { path: string; type: string; sha?: string }) =>
          item.path === args.filePath && item.type === "blob",
      );

      if (!targetFile?.sha) {
        return { found: false, reason: "missing" };
      }

      const cachedBlob = await ctx.runQuery(
        internal.gitOperations.getBlobBySha,
        {
          sha: targetFile.sha,
        },
      );

      if (cachedBlob?.storageId) {
        const url = await ctx.storage.getUrl(cachedBlob.storageId);
        if (typeof url === "string" && url.length > 0) {
          return {
            found: true,
            kind: mediaKind,
            mimeType: readStoredMimeType(args.filePath, cachedBlob.mime),
            url,
            fileName,
          };
        }
      }

      if (
        typeof cachedBlob?.text === "string" &&
        isSvgRepositoryMediaPath(args.filePath)
      ) {
        return {
          found: true,
          kind: mediaKind,
          mimeType: "image/svg+xml",
          url: buildDataUrl(
            "image/svg+xml",
            Buffer.from(cachedBlob.text, "utf-8"),
          ),
          fileName,
        };
      }
    }

    const githubConnection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId,
        kind: "github",
      },
    );
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const octokit: Octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });

    try {
      const file = await octokit.rest.repos.getContent({
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        path: args.filePath,
        ref: requestedBranch,
      });

      if (Array.isArray(file.data) || file.data.type !== "file") {
        return { found: false, reason: "missing" };
      }

      if (typeof file.data.sha === "string") {
        const cachedBlob = await ctx.runQuery(
          internal.gitOperations.getBlobBySha,
          {
            sha: file.data.sha,
          },
        );

        if (cachedBlob?.storageId) {
          const url = await ctx.storage.getUrl(cachedBlob.storageId);
          if (typeof url === "string" && url.length > 0) {
            return {
              found: true,
              kind: mediaKind,
              mimeType: readStoredMimeType(args.filePath, cachedBlob.mime),
              url,
              fileName,
            };
          }
        }

        if (
          typeof cachedBlob?.text === "string" &&
          isSvgRepositoryMediaPath(args.filePath)
        ) {
          return {
            found: true,
            kind: mediaKind,
            mimeType: "image/svg+xml",
            url: buildDataUrl(
              "image/svg+xml",
              Buffer.from(cachedBlob.text, "utf-8"),
            ),
            fileName,
          };
        }
      }

      if (
        typeof file.data.content !== "string" ||
        file.data.content.length === 0
      ) {
        return {
          found: false,
          reason: "unavailable",
          message: "Preview unavailable for this file.",
        };
      }

      const mimeType = guessMime(args.filePath);
      const content = file.data.content.replace(/\n/g, "");
      const buffer = Buffer.from(content, "base64");
      const storageId = await withRetry(() =>
        ctx.storage.store(new Blob([buffer], { type: mimeType })),
      );

      if (typeof file.data.sha === "string") {
        await ctx.runMutation(internal.gitOperations.saveFileBlob, {
          vaultId: vault._id,
          sha: file.data.sha,
          size: buffer.byteLength,
          mime: mimeType,
          text: undefined,
          storageId,
          ext: getRepositoryMediaExtension(args.filePath),
          debugFilePath: args.filePath,
        });
      }

      const url = await ctx.storage.getUrl(storageId);
      if (typeof url !== "string" || url.length === 0) {
        throw new Error("Failed to create media preview URL");
      }

      return {
        found: true,
        kind: mediaKind,
        mimeType,
        url,
        fileName,
      };
    } catch (error: unknown) {
      if (getRepositoryMediaErrorStatus(error) === 404) {
        return { found: false, reason: "missing" };
      }

      if (isRepositoryMediaTooLargeError(error)) {
        return {
          found: false,
          reason: "unavailable",
          message: "Preview unavailable for files larger than 1 MB.",
        };
      }

      throw error;
    }
  },
});

// Public action to refresh repository tree (called from frontend on vault open)
export const refreshRepositoryTree = action({
  args: {
    owner: v.string(),
    repo: v.string(),
    trigger: v.optional(v.union(v.literal("focus"), v.literal("page_load"))),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: `${args.owner}/${args.repo}`,
      userId,
    });
    if (!vault) return;

    const debounceMs =
      args.trigger === "page_load" ? PAGE_LOAD_REFRESH_DEBOUNCE_MS : undefined;

    // Atomically claim the refresh lock; skip if debounced or already running
    const { claimed } = await ctx.runMutation(internal.vault.claimTreeRefresh, {
      vaultId: vault._id,
      debounceMs,
    });
    if (!claimed) return;

    try {
      await ctx.runAction(internal.github.updateRepositoryTree, {
        userId,
        owner: args.owner,
        repo: args.repo,
      });
    } finally {
      await ctx.runMutation(internal.vault.releaseTreeRefresh, {
        vaultId: vault._id,
      });
    }
  },
});

// Get repository tree structure
export const updateRepositoryTree = internalAction({
  args: {
    userId: v.id("users"),
    owner: v.string(),
    repo: v.string(),
  },
  handler: async (ctx, args) => {
    console.log("updateRepositoryTree", args);
    const currentUser = await ctx.runQuery(internal.users.getById, {
      userId: args.userId,
    });

    if (!currentUser) {
      throw new Error("User not found");
    }
    const githubConnection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId: args.userId,
        kind: "github",
      },
    );
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: `${args.owner}/${args.repo}`,
      userId: args.userId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    const octokit: Octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });

    const tree = await octokit.rest.git.getTree({
      owner: args.owner,
      repo: args.repo,
      tree_sha: "HEAD",
      recursive: "1",
    });
    const latestCommits = await octokit.rest.repos.listCommits({
      owner: args.owner,
      repo: args.repo,
      per_page: 1,
    });
    const latestCommitSha = latestCommits.data[0]?.sha;

    const shouldUpdateTree = tree.data.sha !== vault.treeData.sha;
    const shouldUpdateCommit =
      typeof latestCommitSha === "string" &&
      latestCommitSha !== vault.commitSHA;

    if (!shouldUpdateTree && !shouldUpdateCommit) {
      return;
    }

    await ctx.runMutation(internal.vault.updateVaultTree, {
      vaultId: vault._id,
      treeData: tree.data,
      commitSHA: latestCommitSha,
    });
  },
});
