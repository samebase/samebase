"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Octokit } from "@octokit/rest";
import { getUserId } from "./common";
import { createInfraProviders } from "./infraProviders";
import { deleteHostingResources } from "./hostingProviders";
import { toErrorMessage } from "./jsonUtils";
import { toSafeRepoName } from "./repoName";
import { isAdminUser } from "./users";
import { resolveCloudflareMcpServerUrl } from "./cloudflareMcp";
import {
  createStarterSeedGitClient,
  seedRepositoryWithStarter,
} from "./starterSeed";

const { optional } = v;

function isProviderNotFoundError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const status = Reflect.get(error, "status");
    if (typeof status === "number" && status === 404) {
      return true;
    }
    const response = Reflect.get(error, "response");
    if (typeof response === "object" && response !== null) {
      const responseStatus = Reflect.get(response, "status");
      if (typeof responseStatus === "number" && responseStatus === 404) {
        return true;
      }
    }
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("(404)") ||
    message.includes("not found") ||
    message.includes("404")
  );
}

function readDefaultBranch(repoData: unknown): string {
  if (typeof repoData !== "object" || repoData === null) {
    return "main";
  }
  const value = Reflect.get(repoData, "default_branch");
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return "main";
}

export const connectRepository = action({
  args: {
    repositoryFullName: v.string(),
  },
  returns: v.object({
    vaultId: v.string(),
    repositoryFullName: v.string(),
    defaultBranch: v.string(),
    filesDownloaded: v.optional(v.number()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    vaultId: string;
    repositoryFullName: string;
    defaultBranch: string;
    filesDownloaded?: number;
  }> => {
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

    const octokit = new Octokit({
      auth: githubConnection.auth.credential,
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
      repositoryFullName: `${repo.data.owner.login}/${repo.data.name}`,
      defaultBranch,
    };
  },
});

export const createRepository = action({
  args: {
    name: v.string(),
    description: optional(v.string()),
    private: optional(v.boolean()),
  },
  returns: v.object({
    vaultId: v.string(),
  }),
  handler: async (ctx, args): Promise<{ vaultId: string }> => {
    const userId = await getUserId(ctx);

    const [
      currentUser,
      githubConnection,
      convexConnection,
      cloudflareConnection,
    ] = await Promise.all([
      ctx.runQuery(internal.users.getById, { userId }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId,
        kind: "github",
      }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId,
        kind: "convex",
      }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId,
        kind: "cloudflare",
      }),
    ]);

    if (!currentUser) {
      throw new Error("User not found.");
    }

    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected");
    }
    if (convexConnection?.kind !== "convex") {
      throw new Error("Convex connection is required to create a project.");
    }
    if (cloudflareConnection?.kind !== "cloudflare") {
      throw new Error(
        "Cloudflare connection is required to create a Cloudflare-hosted project.",
      );
    }

    const isAdmin = isAdminUser(githubConnection.username, currentUser.email);
    if (!isAdmin) {
      const plan = currentUser.billingPlan ?? "free";
      const status = currentUser.billingStatus ?? "inactive";
      if (!(plan === "pro" && status === "active")) {
        throw new Error("Upgrade to Pro to create a Noter-managed project.");
      }
    }

    const repoName = toSafeRepoName(args.name);
    if (!repoName) {
      throw new Error("Repository name is required");
    }

    const octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });

    const repo = await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      auto_init: false,
      private: args.private ?? true,
      description: args.description ?? undefined,
    });

    const ownerName = repo.data.owner.login;
    const repoFinalName = repo.data.name;
    const defaultBranch = readDefaultBranch(repo.data);

    try {
      await seedRepositoryWithStarter({
        client: createStarterSeedGitClient(octokit),
        owner: ownerName,
        repo: repoFinalName,
        defaultBranch,
      });
    } catch (error) {
      const seedErrorMessage = toErrorMessage(error);
      let cleanupErrorMessage: string | undefined;

      console.error("seed:failed", {
        repo: `${ownerName}/${repoFinalName}`,
        message: seedErrorMessage,
      });

      try {
        await octokit.rest.repos.delete({
          owner: ownerName,
          repo: repoFinalName,
        });
      } catch (cleanupError) {
        cleanupErrorMessage = toErrorMessage(cleanupError);
        console.error("seed:cleanup_failed", {
          repo: `${ownerName}/${repoFinalName}`,
          message: cleanupErrorMessage,
        });
      }

      if (cleanupErrorMessage) {
        throw new Error(
          `Failed to seed starter repository: ${seedErrorMessage}. Cleanup also failed: ${cleanupErrorMessage}`,
        );
      }

      throw new Error(`Failed to seed starter repository: ${seedErrorMessage}`);
    }

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
      hostingProvider: "cloudflare",
    });
    const repositoryFullName = `${ownerName}/${repoFinalName}`;
    const runId = await ctx.runMutation(
      internal.appProvisioningRuns.createForVault,
      {
        userId,
        vaultId,
        repositoryFullName,
        trigger: "create",
      },
    );
    try {
      await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
        runId,
        step: "create_github_repo",
        level: "info",
        message: `Created GitHub repository ${repositoryFullName}.`,
        state: "unchanged",
      });
      await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
        runId,
        step: "seed_starter",
        level: "info",
        message: "Seeded the starter app.",
        state: "unchanged",
      });
      await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
        runId,
        step: "create_vault",
        level: "info",
        message: "Created the Noter vault.",
        state: "unchanged",
      });
    } catch {
      console.warn("vault:create:provisioning_event_append_failed", {
        vaultId,
        repositoryFullName,
      });
    }

    await ctx.runMutation(
      internal.appProvisioningWorkflow.startVaultInfrastructureProvisioning,
      {
        vaultId,
        runId,
        force: false,
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
      throw new Error(
        "Infrastructure retry is available only for Noter-managed vaults",
      );
    }
    const runId = await ctx.runMutation(
      internal.appProvisioningRuns.createForVault,
      {
        userId,
        vaultId: args.vaultId,
        repositoryFullName: `${vault.ghRepoOwner}/${vault.ghRepoName}`,
        trigger: "retry",
      },
    );
    await ctx.runMutation(
      internal.appProvisioningWorkflow.startVaultInfrastructureProvisioning,
      {
        vaultId: args.vaultId,
        runId,
        force: true,
      },
    );

    return null;
  },
});

export const deleteVault = action({
  args: {
    vaultId: v.id("vaults"),
    removeCodespaces: v.optional(v.boolean()),
    removeGithubRepo: v.optional(v.boolean()),
    removeConvexProvision: v.optional(v.boolean()),
    removeHostingProvision: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const [githubConnection, convexConnection, cloudflareConnection] =
      await Promise.all([
        ctx.runQuery(internal.providerConnections.getByUserAndKind, {
          userId,
          kind: "github",
        }),
        ctx.runQuery(internal.providerConnections.getByUserAndKind, {
          userId,
          kind: "convex",
        }),
        ctx.runQuery(internal.providerConnections.getByUserAndKind, {
          userId,
          kind: "cloudflare",
        }),
      ]);
    let octokit: Octokit | null = null;
    const getOctokit = async (): Promise<Octokit> => {
      if (octokit) {
        return octokit;
      }

      if (githubConnection?.kind !== "github") {
        throw new Error("GitHub is not connected");
      }

      octokit = new Octokit({
        auth: githubConnection.auth.credential,
      });
      return octokit;
    };

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

    const cloudflareProjectName =
      infrastructure?.hosting?.provider === "cloudflare"
        ? infrastructure.hosting.projectName
        : undefined;
    const cloudflareAccountId =
      infrastructure?.hosting?.provider === "cloudflare"
        ? infrastructure.hosting.accountId
        : undefined;
    const shouldRemoveHostingProvision =
      args.removeHostingProvision === true &&
      vault.isNoterManaged === true &&
      typeof cloudflareProjectName === "string" &&
      typeof cloudflareAccountId === "string";
    const shouldRemoveConvexProvision =
      args.removeConvexProvision === true &&
      vault.isNoterManaged === true &&
      (typeof infrastructure?.convexProjectId === "string" ||
        typeof infrastructure?.convexDeploymentName === "string");
    const shouldRemoveRepo =
      args.removeGithubRepo === true && vault.isNoterManaged === true;
    const shouldRemoveCodespaces = args.removeCodespaces === true;

    if (shouldRemoveHostingProvision || shouldRemoveConvexProvision) {
      const convexToken = shouldRemoveConvexProvision
        ? convexConnection?.kind === "convex"
          ? convexConnection.auth.credential
          : undefined
        : undefined;
      if (shouldRemoveConvexProvision && !convexToken) {
        throw new Error("Convex connection is required to remove resources.");
      }
      const cloudflareToken = shouldRemoveHostingProvision
        ? cloudflareConnection?.kind === "cloudflare"
          ? cloudflareConnection.auth.credential
          : undefined
        : undefined;
      if (shouldRemoveHostingProvision && !cloudflareToken) {
        throw new Error(
          "Cloudflare connection is required to remove resources.",
        );
      }
      const cloudflareServerUrl =
        shouldRemoveHostingProvision &&
        cloudflareConnection?.kind === "cloudflare"
          ? resolveCloudflareMcpServerUrl(cloudflareConnection)
          : resolveCloudflareMcpServerUrl(null);

      const providers = createInfraProviders({
        convexToken,
      });

      if (shouldRemoveHostingProvision) {
        if (
          typeof cloudflareProjectName === "string" &&
          typeof cloudflareAccountId === "string" &&
          cloudflareToken
        ) {
          try {
            await deleteHostingResources({
              provider: "cloudflare",
              accountId: cloudflareAccountId,
              projectName: cloudflareProjectName,
              cloudflareToken,
              cloudflareServerUrl,
            });
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

    if (shouldRemoveCodespaces) {
      const codespaces = await ctx.runQuery(
        internal.codespacesMutations.listConnectedCodespacesForVault,
        { vaultId: args.vaultId, userId },
      );

      if (codespaces.length > 0) {
        const octokit = await getOctokit();

        for (const codespace of codespaces) {
          await ctx.runMutation(
            internal.codespacesMutations.updateCodespaceState,
            {
              codespaceId: codespace._id,
              state: "deleting",
            },
          );

          try {
            await octokit.rest.codespaces.deleteForAuthenticatedUser({
              codespace_name: codespace.ghCodespaceName,
            });
          } catch (error) {
            if (!isProviderNotFoundError(error)) {
              await ctx.runMutation(
                internal.codespacesMutations.updateCodespaceState,
                {
                  codespaceId: codespace._id,
                  state: "failed",
                },
              );
              throw error;
            }
          }

          await ctx.runMutation(
            internal.codespacesMutations.updateCodespaceState,
            {
              codespaceId: codespace._id,
              state: "deleted",
              deletedAt: Date.now(),
            },
          );
          await ctx.runMutation(
            internal.codespacesMutations.clearActiveCodespace,
            {
              vaultId: args.vaultId,
              codespaceId: codespace._id,
            },
          );
        }
      }
    }

    if (shouldRemoveRepo) {
      const octokit = await getOctokit();

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
