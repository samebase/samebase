import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { getAuthUserId } from "@convex-dev/auth/server";
import { GithubTreeData } from "./schema";

export const connectRepository = action({
  args: {
    // repositoryOwner: v.string(),
    repositoryFullName: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await ctx.runQuery(internal.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
    }

    const octokit = new Octokit({
      auth: currentUser.githubAccessToken,
    });

    const ownerName = args.repositoryFullName.split("/")[0];
    const repoName = args.repositoryFullName.split("/")[1];

    if (!ownerName || !repoName) {
      throw new Error("Invalid repository full name");
    }

    const repo = await octokit.rest.repos.get({
      owner: ownerName,
      repo: repoName,
    });

    const tree = await octokit.rest.git.getTree({
      owner: ownerName,
      repo: repoName,
      tree_sha: "HEAD",
      recursive: "1",
    });

    await ctx.runMutation(internal.vault.addVault, {
      ghRepoId: repo.data.id.toString(),
      ghRepoOwner: repo.data.owner.login,
      ghRepoName: repo.data.name,
      treeSHA: tree.data.sha,
      treeData: tree.data,
    });
  },
});

// mutation to add new vault
export const addVault = internalMutation({
  args: {
    ghRepoId: v.string(),
    ghRepoOwner: v.string(),
    ghRepoName: v.string(),
    treeSHA: v.string(),
    treeData: GithubTreeData,
  },
  handler: async (ctx, args): Promise<string> => {
    const currentUser = await ctx.runQuery(internal.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
    }

    // Check if vault already exists for this user and repository
    const existingVault = await ctx.db
      .query("vaults")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), currentUser._id),
          q.eq(q.field("ghRepoId"), args.ghRepoId),
        ),
      )
      .first();

    if (existingVault) {
      return existingVault._id;
    }

    return await ctx.db.insert("vaults", {
      userId: currentUser._id,
      ghRepoId: args.ghRepoId,
      ghRepoOwner: args.ghRepoOwner,
      ghRepoName: args.ghRepoName,
      treeSHA: args.treeSHA,
      treeData: args.treeData,
    });
  },
});

// Get user's vaults with optional file staging stats
export const getUserVaults = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("vaults"),
      _creationTime: v.number(),
      ghRepoOwner: v.string(),
      ghRepoName: v.string(),
      repositoryFullName: v.string(),
      fileCount: v.number(),
      lastEditTime: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, _args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    // Get user's vaults
    const vaults = await ctx.db
      .query("vaults")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();

    // Get staging stats for each vault
    const vaultResults = await Promise.all(
      vaults.map(async (vault) => {
        const stagingData = await ctx.db
          .query("fileStaging")
          .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
          .collect();

        const fileCount = stagingData.length;
        const lastEditTime =
          stagingData.length > 0
            ? Math.max(...stagingData.map((s) => s.lastEditTime))
            : undefined;

        const repositoryFullName = `${vault.ghRepoOwner}/${vault.ghRepoName}`;

        return {
          _id: vault._id,
          _creationTime: vault._creationTime,
          ghRepoOwner: vault.ghRepoOwner,
          ghRepoName: vault.ghRepoName,
          repositoryFullName,
          fileCount,
          lastEditTime,
        };
      }),
    );

    // Sort by last edit time if available, otherwise by creation time
    return vaultResults.sort((a, b) => {
      const aTime = a.lastEditTime ?? a._creationTime;
      const bTime = b.lastEditTime ?? b._creationTime;
      return bTime - aTime;
    });
  },
});

export const getById = internalQuery({
  args: {
    id: v.id("vaults"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get a specific vault by repository full name for a user
export const getVaultByRepository = query({
  args: {
    repositoryFullName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const [owner, name] = args.repositoryFullName.split("/");
    if (!owner || !name) {
      throw new Error("Invalid repository full name");
    }

    const vault = await ctx.db
      .query("vaults")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.eq(q.field("ghRepoOwner"), owner),
          q.eq(q.field("ghRepoName"), name),
        ),
      )
      .first();

    if (!vault) {
      return null;
    }

    return {
      _id: vault._id,
      _creationTime: vault._creationTime,
      ghRepoOwner: vault.ghRepoOwner,
      ghRepoName: vault.ghRepoName,
      repositoryFullName: args.repositoryFullName,
      treeSHA: vault.treeSHA,
      treeData: vault.treeData,
    };
  },
});

// Update vault tree internal mutation
export const updateVaultTree = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    treeData: GithubTreeData,
  },
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);

    if (!vault) {
      throw new Error("Vault not found");
    }

    return await ctx.db.patch(args.vaultId, {
      treeSHA: args.treeData.sha,
      treeData: args.treeData,
    });
  },
});
