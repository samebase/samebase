"use node";

import { action } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
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

    const currentUser = await ctx.runQuery(api.users.getAuthUser, {});

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
    const currentUser = await ctx.runQuery(api.users.getAuthUser, {});

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

// Example function to create a repository for the authenticated user
export const createRepository = action({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    private: v.optional(v.boolean()),
  },
  returns: v.object({
    id: v.number(),
    name: v.string(),
    full_name: v.string(),
    html_url: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    // Get the user's GitHub account
    const account = await ctx.runQuery(api.users.getGitHubAccount, {});

    if (!account) {
      throw new Error("GitHub account not found");
    }

    if (!account.secret) {
      throw new Error("GitHub access token not found");
    }

    const accessToken: string = account.secret;

    const response = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: args.name,
        description: args.description,
        private: args.private ?? false,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`,
      );
    }

    const repo = await response.json();
    return {
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      html_url: repo.html_url,
    };
  },
});

// Example function to create a commit in a repository
export const createCommit = action({
  args: {
    owner: v.string(),
    repo: v.string(),
    message: v.string(),
    content: v.string(),
    path: v.string(),
  },
  returns: v.object({
    sha: v.string(),
    html_url: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    // Get the user's GitHub account
    const account = await ctx.runQuery(api.users.getGitHubAccount, {});

    if (!account) {
      throw new Error("GitHub account not found");
    }

    if (!account.secret) {
      throw new Error("GitHub access token not found");
    }

    const accessToken: string = account.secret;

    // Create or update a file in the repository
    const response = await fetch(
      `https://api.github.com/repos/${args.owner}/${args.repo}/contents/${args.path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: args.message,
          content: Buffer.from(args.content).toString("base64"),
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`,
      );
    }

    const result = await response.json();
    return {
      sha: result.commit.sha,
      html_url: result.commit.html_url,
    };
  },
});
