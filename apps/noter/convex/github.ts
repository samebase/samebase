"use node";

import { action, internalAction } from "./_generated/server";
import { getUserId } from "./common";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";

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
