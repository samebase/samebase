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
    await getUserId(ctx);

    const currentUser = await ctx.runQuery(internal.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
    }

    console.log(currentUser);
    const accessToken = currentUser.githubAccessToken;

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

    console.log(repos);

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

    console.log(val);
    return val;
  },
});

const repositoryFileContentResult = v.union(
  v.object({ exists: v.literal(false) }),
  v.object({ exists: v.literal(true), content: v.string() }),
);

type RepositoryFileContent = { exists: false } | { exists: true; content: string };

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

    const octokit: Octokit = new Octokit({
      auth: currentUser.githubAccessToken,
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
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: `${args.owner}/${args.repo}`,
      userId,
    });
    if (!vault) return;

    // Atomically claim the refresh lock; skip if debounced or already running
    const { claimed } = await ctx.runMutation(internal.vault.claimTreeRefresh, {
      vaultId: vault._id,
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

    const vault = await ctx.runQuery(internal.vault.getByRepositoryFullName, {
      repositoryFullName: `${args.owner}/${args.repo}`,
      userId: args.userId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    const octokit: Octokit = new Octokit({
      auth: currentUser.githubAccessToken,
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
