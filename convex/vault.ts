import { v } from "convex/values";
import { action, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { Octokit } from "@octokit/rest";

export const connectRepository = action({
  args: {
    // repositoryOwner: v.string(),
    repositoryFullName: v.string(),
  },
  handler: async (ctx, args) => {
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

    await ctx.runMutation(api.vault.addVault, {
      ghRepoId: repo.data.id.toString(),
      ghRepoOwner: repo.data.owner.login,
      ghRepoName: repo.data.name,
    });
  },
});

// mutation to add new vault
export const addVault = mutation({
  args: {
    ghRepoId: v.string(),
    ghRepoOwner: v.string(),
    ghRepoName: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    const currentUser = await ctx.runQuery(api.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
    }

    return await ctx.db.insert("vaults", {
      userId: currentUser._id,
      ghRepoId: args.ghRepoId,
      ghRepoOwner: args.ghRepoOwner,
      ghRepoName: args.ghRepoName,
    });
  },
});
