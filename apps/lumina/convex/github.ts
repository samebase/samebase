"use node";

import { action, internalAction } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
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
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

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
          "User-Agent": "Lumina-App",
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

// Calls the github api to get a repository
export const getRepository = action({
  args: {
    repositoryFullName: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const currentUser = await ctx.runQuery(internal.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
    }

    const octokit = new Octokit({
      auth: currentUser.githubAccessToken,
    });

    const repo = await octokit.rest.repos.get({
      owner: args.repositoryFullName.split("/")[0],
      repo: args.repositoryFullName.split("/")[1],
    });

    console.log(repo);

    return repo;
  },
});

// Get README content from a GitHub repository
export const getReadme = action({
  args: {
    owner: v.string(),
    repo: v.string(),
  },
  returns: v.union(
    v.object({
      content: v.string(),
      encoding: v.string(),
      name: v.string(),
    }),
    v.null(),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<{ content: string; encoding: string; name: string } | null> => {
    const currentUser: any = await ctx.runQuery(internal.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
    }

    const octokit: Octokit = new Octokit({
      auth: currentUser.githubAccessToken,
    });

    try {
      const readme: any = await octokit.rest.repos.getReadme({
        owner: args.owner,
        repo: args.repo,
      });

      return {
        content: readme.data.content,
        encoding: readme.data.encoding,
        name: readme.data.name,
      };
    } catch (error) {
      // README might not exist
      console.log(`README not found for ${args.owner}/${args.repo}:`, error);
      return null;
    }
  },
});

// Create a new file in GitHub repository
export const createFile = action({
  args: {
    owner: v.string(),
    repo: v.string(),
    path: v.string(),
    content: v.string(),
    message: v.string(),
    branch: v.optional(v.string()),
  },
  returns: v.object({
    sha: v.string(),
    url: v.string(),
  }),
  handler: async (ctx, args) => {
    const currentUser: any = await ctx.runQuery(internal.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
    }

    const octokit: Octokit = new Octokit({
      auth: currentUser.githubAccessToken,
    });

    try {
      const result = await octokit.rest.repos.createOrUpdateFileContents({
        owner: args.owner,
        repo: args.repo,
        path: args.path,
        message: args.message,
        content: Buffer.from(args.content, "utf8").toString("base64"),
        branch: args.branch || "main",
      });

      return {
        sha: result.data.commit.sha || "",
        url: result.data.commit.html_url || "",
      };
    } catch (error) {
      console.error(
        `Failed to create file ${args.path} for ${args.owner}/${args.repo}:`,
        error,
      );
      throw error;
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
    const currentUser = await ctx.runQuery(internal.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
    }

    const vault = await ctx.runQuery(api.vault.getVaultByRepository, {
      repositoryFullName: `${args.owner}/${args.repo}`,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    const octokit: Octokit = new Octokit({
      auth: currentUser.githubAccessToken,
    });

    try {
      const tree = await octokit.rest.git.getTree({
        owner: args.owner,
        repo: args.repo,
        tree_sha: "HEAD",
        recursive: "1",
      });

      if (tree.data.sha === vault.treeData.sha) {
        return {
          status: "up-to-date",
        };
      }

      const treeData = tree.data;

      console.log("treeData", treeData);

      const result = await ctx.runMutation(internal.vault.updateVaultTree, {
        vaultId: vault._id,
        treeData: treeData,
      });
      console.log("result", result);

      return tree.data.tree.map((item) => ({
        path: item.path,
        mode: item.mode,
        type: item.type,
        sha: item.sha,
        size: item.size,
        url: item.url,
      }));
    } catch (error) {
      console.error(
        `Failed to fetch tree for ${args.owner}/${args.repo}:`,
        error,
      );
      return [];
    }
  },
});
