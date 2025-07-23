"use node";

import { action } from "./_generated/server";
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

// Update file content in GitHub repository
export const updateFileContent = action({
  args: {
    userId: v.id("users"),

    owner: v.string(),
    repo: v.string(),
    path: v.string(),
    content: v.string(),
    message: v.string(),
    sha: v.string(),
    branch: v.optional(v.string()),
  },
  returns: v.object({
    sha: v.string(),
    url: v.string(),
  }),
  handler: async (ctx, args) => {
    const currentUser = await ctx.runQuery(api.users.getById, {
      userId: args.userId,
    });

    if (!currentUser) {
      throw new Error("User not found");
    }

    const octokit: Octokit = new Octokit({
      auth: currentUser.githubAccessToken,
    });

    try {
      // If no SHA is provided, get the current file's SHA
      let fileSha = args.sha;
      if (!fileSha) {
        try {
          const currentFile = await octokit.rest.repos.getContent({
            owner: args.owner,
            repo: args.repo,
            path: args.path,
            ref: args.branch || "main",
          });

          // Handle case where path is a directory (shouldn't happen in our use case)
          if (!Array.isArray(currentFile.data)) {
            fileSha = (currentFile.data as any).sha;
          }
        } catch (error: any) {
          // File doesn't exist yet, so we don't need a SHA
          if (error.status !== 404) {
            throw error;
          }
        }
      }

      const result = await octokit.rest.repos.createOrUpdateFileContents({
        owner: args.owner,
        repo: args.repo,
        path: args.path,
        message: args.message,
        content: Buffer.from(args.content, "utf8").toString("base64"),
        sha: fileSha, // Use the file SHA (either provided or fetched)
        branch: args.branch || "main",
      });

      // Clear staging after successful commit
      const repositoryFullName = `${args.owner}/${args.repo}`;
      await ctx.runMutation(internal.fileStagingMutations.clearStaging, {
        repositoryFullName,
        filePath: args.path,
      });

      return {
        sha: result.data.commit.sha || "",
        url: result.data.commit.html_url || "",
      };
    } catch (error) {
      console.error(
        `Failed to update file ${args.path} for ${args.owner}/${args.repo}:`,
        error,
      );
      throw error;
    }
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
    const currentUser: any = await ctx.runQuery(api.users.getAuthUser, {});

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

// Get file content from a GitHub repository
export const getFileContent = action({
  args: {
    owner: v.string(),
    repo: v.string(),
    path: v.string(),
    ref: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      content: v.string(),
      encoding: v.string(),
      name: v.string(),
      path: v.string(),
      type: v.string(),
      sha: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const currentUser: any = await ctx.runQuery(api.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
    }

    const octokit: Octokit = new Octokit({
      auth: currentUser.githubAccessToken,
    });

    try {
      const file = await octokit.rest.repos.getContent({
        owner: args.owner,
        repo: args.repo,
        path: args.path,
        ref: args.ref || "main",
      });

      // Handle case where path is a directory (shouldn't happen in our use case)
      if (Array.isArray(file.data)) {
        return null;
      }

      const fileData = file.data as any;

      return {
        content: fileData.content,
        encoding: fileData.encoding,
        name: fileData.name,
        path: fileData.path,
        type: fileData.type,
        sha: fileData.sha,
      };
    } catch (error) {
      console.error(
        `Failed to fetch file ${args.path} for ${args.owner}/${args.repo}:`,
        error,
      );
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
    const currentUser: any = await ctx.runQuery(api.users.getAuthUser, {});

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

// Delete a file from GitHub repository
export const deleteFile = action({
  args: {
    owner: v.string(),
    repo: v.string(),
    path: v.string(),
    message: v.string(),
    sha: v.string(),
    branch: v.optional(v.string()),
  },
  returns: v.object({
    sha: v.string(),
    url: v.string(),
  }),
  handler: async (ctx, args) => {
    const currentUser: any = await ctx.runQuery(api.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
    }

    const octokit: Octokit = new Octokit({
      auth: currentUser.githubAccessToken,
    });

    try {
      const result = await octokit.rest.repos.deleteFile({
        owner: args.owner,
        repo: args.repo,
        path: args.path,
        message: args.message,
        sha: args.sha,
        branch: args.branch || "main",
      });

      return {
        sha: result.data.commit.sha || "",
        url: result.data.commit.html_url || "",
      };
    } catch (error) {
      console.error(
        `Failed to delete file ${args.path} for ${args.owner}/${args.repo}:`,
        error,
      );
      throw error;
    }
  },
});

// Get repository tree structure
export const getRepositoryTree = action({
  args: {
    owner: v.string(),
    repo: v.string(),
  },
  returns: v.array(
    v.object({
      path: v.string(),
      mode: v.string(),
      type: v.string(),
      sha: v.string(),
      size: v.optional(v.number()),
      url: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const currentUser: any = await ctx.runQuery(api.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
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

      return tree.data.tree.map((item: any) => ({
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
