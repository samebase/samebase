"use node";

import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { Octokit } from "@octokit/rest";
import { getUserId } from "./common";
import { createInfraProviders } from "./infraProviders";
import { deleteCloudflareResources } from "./cloudflareResources";
import { toErrorMessage } from "./jsonUtils";
import { resolveCloudflareMcpServerUrl } from "./cloudflareMcp";
import { isConnectedVault, isNoterManagedVault } from "./vaultState";
import { toSafeRepoName } from "./repoName";

const { array, literal, object, optional, string, union } = v;
const githubRepositoryOwnerKind = union(
  literal("user"),
  literal("organization"),
);
const githubRepositoryOwnerOption = object({
  login: string(),
  kind: githubRepositoryOwnerKind,
});

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

async function markProvisioningStartupFailed(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"appProvisioningRuns">;
    logName: string;
    error: unknown;
    vaultId: Id<"vaults">;
  },
): Promise<void> {
  const message = toErrorMessage(args.error);
  try {
    await ctx.runMutation(
      internal.infraProvisioning.markWorkflowStartupFailed,
      {
        runId: args.runId,
        message,
      },
    );
  } catch (markError) {
    console.error(args.logName, {
      runId: args.runId,
      vaultId: args.vaultId,
      message: toErrorMessage(markError),
    });
  }
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
    await markProvisioningStartupFailed(ctx, {
      runId: args.runId,
      vaultId: args.vaultId,
      logName: "vault:provisioning_start_failure_mark_failed",
      error,
    });
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
    repositoryOwner: string;
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
    await markProvisioningStartupFailed(ctx, {
      runId: args.runId,
      vaultId: args.vaultId,
      logName: "vault:create:provisioning_start_failure_mark_failed",
      error,
    });
    throw error;
  }
}

async function startConnectExistingRepositoryProvisioningOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    repositoryName: string;
    repositoryOwner: string;
  },
): Promise<void> {
  try {
    await ctx.runMutation(
      internal.appProvisioningWorkflow
        .startConnectExistingRepositoryProvisioning,
      args,
    );
  } catch (error) {
    await markProvisioningStartupFailed(ctx, {
      runId: args.runId,
      vaultId: args.vaultId,
      logName: "vault:connect:provisioning_start_failure_mark_failed",
      error,
    });
    throw error;
  }
}

function parseRepositoryFullName(repositoryFullName: string): {
  owner: string;
  name: string;
} {
  const parts = repositoryFullName.split("/");
  if (parts.length !== 2) {
    throw new Error("Invalid repository full name");
  }
  const trimmedOwner = parts[0].trim();
  const trimmedName = parts[1].trim();
  if (!trimmedOwner || !trimmedName) {
    throw new Error("Invalid repository full name");
  }
  return { owner: trimmedOwner, name: trimmedName };
}

async function resolveGithubConnectionUsername(
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

export const listRepositoryOwners = action({
  args: {},
  returns: array(githubRepositoryOwnerOption),
  handler: async (
    ctx,
  ): Promise<Array<{ login: string; kind: "user" | "organization" }>> => {
    const userId = await getUserId(ctx);
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

    const username = await resolveGithubConnectionUsername(ctx, {
      connection: githubConnection,
      userId,
    });
    const octokit = new Octokit({
      auth: githubConnection.auth.credential,
    });
    const organizations = await octokit.rest.orgs.listForAuthenticatedUser({
      per_page: 100,
    });
    const organizationOwners = organizations.data
      .map((organization) => organization.login)
      .filter((login) => login.length > 0)
      .sort((left, right) => left.localeCompare(right))
      .map((login) => ({
        login,
        kind: "organization" as const,
      }));

    return [{ login: username, kind: "user" }, ...organizationOwners];
  },
});

export const connectRepository = action({
  args: {
    repositoryFullName: v.string(),
  },
  returns: v.object({
    vaultId: v.id("vaults"),
    runId: v.id("appProvisioningRuns"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
  }> => {
    const userId = await getUserId(ctx);
    const { owner, name } = parseRepositoryFullName(args.repositoryFullName);
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

    const { vaultId, runId } = await ctx.runMutation(
      internal.vault.createInitializingExistingRepositoryVaultForUser,
      {
        userId,
        ghRepoOwner: owner,
        ghRepoName: name,
      },
    );
    await startConnectExistingRepositoryProvisioningOrFail(ctx, {
      vaultId,
      runId,
      userId,
      repositoryOwner: owner,
      repositoryName: name,
    });

    return { vaultId, runId };
  },
});

export const createRepository = action({
  args: {
    name: v.string(),
    owner: string(),
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
    const ghRepoOwner = args.owner.trim();
    if (!ghRepoOwner) {
      throw new Error("GitHub owner is required.");
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
      repositoryOwner: ghRepoOwner,
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
    removeCloudflareProvision: v.optional(v.boolean()),
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

    const cloudflare = infrastructure?.cloudflare;
    const shouldRemoveCloudflareProvision =
      args.removeCloudflareProvision && isNoterManaged;
    const shouldRemoveConvexProvision =
      args.removeConvexProvision &&
      isNoterManaged &&
      (typeof infrastructure?.convexProjectId === "string" ||
        typeof infrastructure?.convexDeploymentName === "string");
    const shouldRemoveCodespaces = args.removeCodespaces;

    if (shouldRemoveCloudflareProvision || shouldRemoveConvexProvision) {
      const convexToken = shouldRemoveConvexProvision
        ? convexConnection?.kind === "convex"
          ? convexConnection.auth.credential
          : undefined
        : undefined;
      if (shouldRemoveConvexProvision && !convexToken) {
        throw new Error("Convex connection is required to remove resources.");
      }
      const cloudflareToken = shouldRemoveCloudflareProvision
        ? cloudflareConnection?.kind === "cloudflare"
          ? cloudflareConnection.auth.credential
          : undefined
        : undefined;
      const cloudflareServerUrl =
        shouldRemoveCloudflareProvision &&
        cloudflareConnection?.kind === "cloudflare"
          ? resolveCloudflareMcpServerUrl(cloudflareConnection)
          : resolveCloudflareMcpServerUrl(null);

      const providers = createInfraProviders({
        convexToken,
      });

      if (shouldRemoveCloudflareProvision) {
        if (!cloudflare) {
          throw new Error("Cloudflare resources are not recorded for vault.");
        }
        if (!cloudflareToken) {
          throw new Error(
            "Cloudflare connection is required to remove resources.",
          );
        }
        try {
          await deleteCloudflareResources({
            accountId: cloudflare.accountId,
            projectName: cloudflare.projectName,
            cloudflareToken,
            cloudflareServerUrl,
          });
        } catch (error) {
          if (!isProviderNotFoundError(error)) {
            throw error;
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
