"use node";

import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { Octokit } from "@octokit/rest";
import { getUserId } from "./common";
import { toErrorMessage } from "./jsonUtils";
import { isLiveConnectedVault, isNoterManagedVault } from "./vaultState";
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

async function markDeletionStartupFailed(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"vaultDeletionRuns">;
    logName: string;
    error: unknown;
    vaultId: Id<"vaults">;
  },
): Promise<void> {
  const message = toErrorMessage(args.error);
  try {
    await ctx.runMutation(internal.vaultDeletionRuns.markWorkflowFailed, {
      runId: args.runId,
      message,
    });
  } catch (markError) {
    console.error(args.logName, {
      runId: args.runId,
      vaultId: args.vaultId,
      message: toErrorMessage(markError),
    });
  }
}

async function startVaultDeletionOrFail(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"vaultDeletionRuns">;
    userId: Id<"users">;
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.vaultDeletionWorkflow.startVaultDeletion, {
      vaultId: args.vaultId,
      runId: args.runId,
      userId: args.userId,
    });
  } catch (error) {
    await markDeletionStartupFailed(ctx, {
      runId: args.runId,
      vaultId: args.vaultId,
      logName: "vault:delete:workflow_start_failure_mark_failed",
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
    if (!isLiveConnectedVault(vault) || !isNoterManagedVault(vault)) {
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
  returns: v.object({
    deletionRunId: v.id("vaultDeletionRuns"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ deletionRunId: Id<"vaultDeletionRuns"> }> => {
    const userId = await getUserId(ctx);
    const result: { deletionRunId: Id<"vaultDeletionRuns"> } =
      await ctx.runMutation(internal.vaultDeletionRuns.createInitialRun, {
        userId,
        vaultId: args.vaultId,
        options: {
          removeCodespaces: args.removeCodespaces ?? false,
          removeGithubRepo: args.removeGithubRepo ?? false,
          removeConvexProvision: args.removeConvexProvision ?? false,
          removeCloudflareProvision: args.removeCloudflareProvision ?? false,
        },
      });
    const { deletionRunId } = result;
    await startVaultDeletionOrFail(ctx, {
      vaultId: args.vaultId,
      runId: deletionRunId,
      userId,
    });

    return { deletionRunId };
  },
});

export const retryDeleteVault = action({
  args: {
    runId: v.id("vaultDeletionRuns"),
  },
  returns: v.object({
    deletionRunId: v.id("vaultDeletionRuns"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ deletionRunId: Id<"vaultDeletionRuns"> }> => {
    const userId = await getUserId(ctx);
    const result: { deletionRunId: Id<"vaultDeletionRuns"> } =
      await ctx.runMutation(internal.vaultDeletionRuns.createRetryRun, {
        userId,
        failedRunId: args.runId,
      });
    const { deletionRunId } = result;
    const retryRun = await ctx.runQuery(internal.vaultDeletionRuns.getById, {
      runId: deletionRunId,
    });
    if (!retryRun) {
      throw new Error("Deletion retry run not found.");
    }
    await startVaultDeletionOrFail(ctx, {
      vaultId: retryRun.vaultId,
      runId: deletionRunId,
      userId,
    });

    return { deletionRunId };
  },
});
