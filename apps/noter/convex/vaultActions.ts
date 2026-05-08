"use node";

import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { Octokit } from "@octokit/rest";
import { getUserId } from "./common";
import { createInfraProviders } from "./infraProviders";
import { deleteHostingResources } from "./hostingProviders";
import { toErrorMessage } from "./jsonUtils";
import { resolveCloudflareMcpServerUrl } from "./cloudflareMcp";
import { isConnectedVault, isNoterManagedVault } from "./vaultState";
import { toSafeRepoName } from "./repoName";

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

async function startVaultInfrastructureProvisioningOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    force: boolean;
  },
): Promise<void> {
  try {
    await ctx.runMutation(
      internal.appProvisioningWorkflow.startVaultInfrastructureProvisioning,
      args,
    );
  } catch (error) {
    const message = toErrorMessage(error);
    try {
      await ctx.runMutation(
        internal.infraProvisioning.markWorkflowStartupFailed,
        {
          runId: args.runId,
          message,
        },
      );
    } catch (markError) {
      console.error("vault:provisioning_start_failure_mark_failed", {
        vaultId: args.vaultId,
        runId: args.runId,
        message: toErrorMessage(markError),
      });
    }
    throw error;
  }
}

async function startCreateAppProvisioningOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    repositoryName: string;
    description: string | null;
    private: boolean;
  },
): Promise<void> {
  try {
    await ctx.runMutation(
      internal.appProvisioningWorkflow.startCreateAppProvisioning,
      args,
    );
  } catch (error) {
    const message = toErrorMessage(error);
    try {
      await ctx.runMutation(
        internal.infraProvisioning.markWorkflowStartupFailed,
        {
          runId: args.runId,
          message,
        },
      );
    } catch (markError) {
      console.error("vault:create:provisioning_start_failure_mark_failed", {
        runId: args.runId,
        message: toErrorMessage(markError),
      });
    }
    throw error;
  }
}

async function resolveGithubConnectionOwner(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    connection: Extract<Doc<"providerConnections">, { kind: "github" }>;
    userId: Id<"users">;
  },
): Promise<string> {
  if (args.connection.username) {
    return args.connection.username;
  }

  const octokit = new Octokit({
    auth: args.connection.auth.credential,
  });
  const { data } = await octokit.rest.users.getAuthenticated();
  const username = data.login;
  if (!username) {
    throw new Error("GitHub connection is missing an account login.");
  }

  await ctx.runMutation(internal.providerConnections.upsertGithub, {
    userId: args.userId,
    auth: args.connection.auth,
    username,
  });

  return username;
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
      defaultBranch,
      visibility: repo.data.private ? "private" : "public",
      treeSHA: tree.data.sha,
      commitSHA: branchData.data.commit.sha,
      treeData: tree.data,
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
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ vaultId: Id<"vaults">; runId: Id<"appProvisioningRuns"> }> => {
    const userId = await getUserId(ctx);
    const repoName = toSafeRepoName(args.name);
    if (!repoName) {
      throw new Error("Repository name is required.");
    }

    const githubConnection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId,
        kind: "github",
      },
    );
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub is not connected.");
    }
    const ghRepoOwner = await resolveGithubConnectionOwner(ctx, {
      connection: githubConnection,
      userId,
    });

    const visibility = args.private === false ? "public" : "private";
    const { vaultId, runId } = await ctx.runMutation(
      internal.vault.createInitializingNoterManagedVaultForUser,
      {
        userId,
        ghRepoOwner,
        ghRepoName: repoName,
        visibility,
      },
    );
    await startCreateAppProvisioningOrFail(ctx, {
      vaultId,
      runId,
      userId,
      repositoryName: repoName,
      description: args.description ?? null,
      private: args.private ?? true,
    });

    return { vaultId, runId };
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
    if (!isConnectedVault(vault) || !isNoterManagedVault(vault)) {
      throw new Error(
        "Infrastructure retry is available only for Noter-managed vaults",
      );
    }
    const runId = await ctx.runMutation(
      internal.appProvisioningRuns.createForVault,
      {
        userId,
        vaultId: args.vaultId,
        trigger: "retry",
      },
    );
    await startVaultInfrastructureProvisioningOrFail(ctx, {
      vaultId: args.vaultId,
      runId,
      force: true,
    });

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
    const connectedVault = isConnectedVault(vault) ? vault : null;
    const isNoterManaged = connectedVault
      ? isNoterManagedVault(connectedVault)
      : false;

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
      isNoterManaged &&
      typeof cloudflareProjectName === "string" &&
      typeof cloudflareAccountId === "string";
    const shouldRemoveConvexProvision =
      args.removeConvexProvision === true &&
      isNoterManaged &&
      (typeof infrastructure?.convexProjectId === "string" ||
        typeof infrastructure?.convexDeploymentName === "string");
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
        internal.codespaces.mutations.listConnectedCodespacesForVault,
        { vaultId: args.vaultId, userId },
      );

      if (codespaces.length > 0) {
        const octokit = await getOctokit();

        for (const codespace of codespaces) {
          await ctx.runMutation(
            internal.codespaces.mutations.updateCodespaceState,
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
                internal.codespaces.mutations.updateCodespaceState,
                {
                  codespaceId: codespace._id,
                  state: "failed",
                },
              );
              throw error;
            }
          }

          await ctx.runMutation(
            internal.codespaces.mutations.updateCodespaceState,
            {
              codespaceId: codespace._id,
              state: "deleted",
              deletedAt: Date.now(),
            },
          );
          await ctx.runMutation(
            internal.codespaces.mutations.clearActiveCodespace,
            {
              vaultId: args.vaultId,
              codespaceId: codespace._id,
            },
          );
        }
      }
    }

    if (
      args.removeGithubRepo &&
      connectedVault &&
      isNoterManagedVault(connectedVault)
    ) {
      const octokit = await getOctokit();

      await octokit.rest.repos.delete({
        owner: connectedVault.owner,
        repo: connectedVault.name,
      });
    }

    await ctx.runMutation(api.vault.removeVault, {
      vaultId: args.vaultId,
    });

    return null;
  },
});
