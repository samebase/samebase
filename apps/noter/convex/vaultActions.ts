"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { getUserId } from "./common";
import { createInfraProviders } from "./infraProviders";
import { toSafeRepoName } from "./repoName";

function isProviderNotFoundError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const status = Reflect.get(error, "status");
    if (typeof status === "number" && status === 404) {
      return true;
    }
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("(404)") || message.includes("not found");
}

export const connectRepository = action({
  args: {
    repositoryFullName: v.string(),
  },
  returns: v.object({
    vaultId: v.string(),
    filesDownloaded: v.optional(v.number()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ vaultId: string; filesDownloaded?: number }> => {
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

    const defaultBranch = repo.data.default_branch;
    const branchData = await octokit.rest.repos.getBranch({
      owner: ownerName,
      repo: repoName,
      branch: defaultBranch,
    });

    const tree = await octokit.rest.git.getTree({
      owner: ownerName,
      repo: repoName,
      tree_sha: defaultBranch,
      recursive: "1",
    });

    const vaultId = await ctx.runMutation(internal.vault.addVault, {
      ghRepoId: repo.data.id.toString(),
      ghRepoOwner: repo.data.owner.login,
      ghRepoName: repo.data.name,
      treeSHA: tree.data.sha,
      commitSHA: branchData.data.commit.sha,
      treeData: tree.data,
      state: "ready",
      isNoterManaged: false,
    });

    let filesDownloaded: number | undefined;

    // await ctx.scheduler.runAfter(
    //   0,
    //   internal.gitOperationsActions.downloadGitRepositoryAndMarkReady,
    //   {
    //     userId: currentUser._id,
    //     vaultId,
    //     repositoryUrl: repo.data.clone_url,
    //     branch: repo.data.default_branch,
    //   },
    // );

    return {
      vaultId,
      filesDownloaded,
    };
  },
});

export const createRepository = action({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    private: v.optional(v.boolean()),
  },
  returns: v.object({
    vaultId: v.string(),
  }),
  handler: async (ctx, args): Promise<{ vaultId: string }> => {
    const currentUser = await ctx.runQuery(internal.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
    }

    if (!currentUser.githubAccessToken) {
      throw new Error("GitHub access token not found");
    }

    const repoName = toSafeRepoName(args.name);
    if (!repoName) {
      throw new Error("Repository name is required");
    }

    const octokit = new Octokit({
      auth: currentUser.githubAccessToken,
    });

    const repo = await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      auto_init: true,
      private: args.private ?? true,
      description: args.description ?? undefined,
    });

    const ownerName = repo.data.owner.login;
    const repoFinalName = repo.data.name;
    const defaultBranch = repo.data.default_branch;

    const agentsMd = `# AGENTS.md

This file defines the behavior, tools, and workflows for your agent.

## Purpose
Describe what this agent does and who it's for.

## Behavior
- Tone and style
- Boundaries and safety notes

## Tools
- List available tools and APIs

## Workflows
- Common tasks and step-by-step flows
`;

    await octokit.rest.repos.createOrUpdateFileContents({
      owner: ownerName,
      repo: repoFinalName,
      path: "AGENTS.md",
      message: "chore: add AGENTS.md",
      content: Buffer.from(agentsMd, "utf8").toString("base64"),
      branch: defaultBranch,
    });

    const tree = await octokit.rest.git.getTree({
      owner: ownerName,
      repo: repoFinalName,
      tree_sha: defaultBranch,
      recursive: "1",
    });
    const branchData = await octokit.rest.repos.getBranch({
      owner: ownerName,
      repo: repoFinalName,
      branch: defaultBranch,
    });

    const vaultId = await ctx.runMutation(internal.vault.addVault, {
      ghRepoId: repo.data.id.toString(),
      ghRepoOwner: ownerName,
      ghRepoName: repoFinalName,
      treeSHA: tree.data.sha,
      commitSHA: branchData.data.commit.sha,
      treeData: tree.data,
      state: "ready",
      isNoterManaged: true,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.infraProvisioning.provisionVaultInfrastructure,
      {
        vaultId,
      },
    );

    return { vaultId };
  },
});

export const retryInfrastructureProvisioning = action({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });
    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }
    if (vault.isNoterManaged !== true) {
      throw new Error("Infrastructure retry is available only for Noter-managed vaults");
    }

    await ctx.scheduler.runAfter(
      0,
      internal.infraProvisioning.provisionVaultInfrastructure,
      {
        vaultId: args.vaultId,
        force: true,
      },
    );

    return null;
  },
});

export const deleteVault = action({
  args: {
    vaultId: v.id("vaults"),
    removeGithubRepo: v.optional(v.boolean()),
    removeConvexProvision: v.optional(v.boolean()),
    removeNetlifyProvision: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }

    const infrastructure = await ctx.runQuery(
      internal.vault.getInfrastructureByVaultId,
      {
        vaultId: args.vaultId,
      },
    );

    const shouldRemoveNetlifyProvision =
      args.removeNetlifyProvision === true &&
      vault.isNoterManaged === true &&
      typeof infrastructure?.netlifySiteId === "string";
    const shouldRemoveConvexProvision =
      args.removeConvexProvision === true &&
      vault.isNoterManaged === true &&
      (typeof infrastructure?.convexProjectId === "string" ||
        typeof infrastructure?.convexDeploymentName === "string");
    const shouldRemoveRepo =
      args.removeGithubRepo === true && vault.isNoterManaged === true;

    if (shouldRemoveNetlifyProvision || shouldRemoveConvexProvision) {
      const providers = createInfraProviders();

      if (shouldRemoveNetlifyProvision) {
        const netlifySiteId = infrastructure.netlifySiteId;
        if (typeof netlifySiteId === "string") {
          try {
            await providers.netlify.request(
              `/sites/${encodeURIComponent(netlifySiteId)}`,
              "DELETE",
            );
          } catch (error) {
            if (!isProviderNotFoundError(error)) {
              throw error;
            }
          }
        }
      }

      if (shouldRemoveConvexProvision) {
        const convexProjectId = infrastructure.convexProjectId;
        const convexDeploymentName = infrastructure.convexDeploymentName;
        try {
          if (typeof convexProjectId === "string") {
            await providers.convex.request(
              `/projects/${encodeURIComponent(convexProjectId)}/delete`,
              "POST",
            );
          } else if (typeof convexDeploymentName === "string") {
            await providers.convex.request(
              `/deployments/${encodeURIComponent(convexDeploymentName)}/delete`,
              "POST",
            );
          }
        } catch (error) {
          if (!isProviderNotFoundError(error)) {
            throw error;
          }
        }
      }
    }

    if (shouldRemoveRepo) {
      const user = await ctx.runQuery(internal.users.getById, {
        userId,
      });

      if (!user?.githubAccessToken) {
        throw new Error("GitHub access token not found");
      }

      const octokit = new Octokit({
        auth: user.githubAccessToken,
      });

      await octokit.rest.repos.delete({
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
      });
    }

    await ctx.runMutation(api.vault.removeVault, {
      vaultId: args.vaultId,
    });

    return null;
  },
});
