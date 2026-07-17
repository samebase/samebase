"use node";

import { RequestError } from "@octokit/request-error";
import { Octokit } from "@octokit/rest";
import { v } from "convex/values";
import { internalAction, type ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { requestConvexManagementApi } from "../../convexManagementApi/client";
import { isConvexManagementNotFoundError } from "../../convexManagementApi/errors";
import {
  deleteCloudflareResources,
  deleteCloudflareWorkerBuildTriggers,
  isCloudflareWorkerNotFoundError,
} from "../../cloudflareResources";
import { deleteConvexDeployKey, deleteConvexPreviewDeployKey } from "../../infraProvisioning";
import {
  renameGitHubRepositoryForDeletion,
  resolveGitHubRepositoryIdentity,
} from "../../githubRepositoryInventory";
import { resolveCloudflareApiTransport } from "../../cloudflareApi/client";
import { readRetainedSnapshot } from "./runs";
import {
  type VaultDeletionEventLevel,
  type VaultDeletionPlan,
  type VaultDeletionStep,
} from "./model";

const { id } = v;

const providerStepRetryMessage = {
  delete_codespaces: "Removing connected Codespaces.",
  delete_cloudflare: "Removing Cloudflare resources.",
  delete_convex: "Removing Convex resources.",
  delete_github_repo: "Removing GitHub repository.",
} satisfies Record<
  "delete_codespaces" | "delete_cloudflare" | "delete_convex" | "delete_github_repo",
  string
>;

async function getDeletionRun(
  ctx: Pick<ActionCtx, "runQuery">,
  runId: Id<"vaultDeletionRuns">,
): Promise<Doc<"vaultDeletionRuns">> {
  const run = await ctx.runQuery(internal.vault.deletion.runs.getById, {
    runId,
  });
  if (!run) {
    throw new Error("Deletion run not found.");
  }
  return run;
}

async function getDeletionPlan(
  ctx: Pick<ActionCtx, "runQuery">,
  runId: Id<"vaultDeletionRuns">,
): Promise<VaultDeletionPlan> {
  const run = await getDeletionRun(ctx, runId);
  return readRetainedSnapshot(run).plan;
}

async function appendRunEvent(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"vaultDeletionRuns">;
    step: VaultDeletionStep;
    level: VaultDeletionEventLevel;
    message: string;
  },
): Promise<void> {
  await ctx.runMutation(internal.vault.deletion.runs.appendRunEvent, {
    ...args,
    state: "running",
  });
}

async function resolveGitHubClient(
  ctx: Pick<ActionCtx, "runQuery">,
  userId: Id<"users">,
): Promise<{ credential: string; octokit: Octokit }> {
  const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
    userId,
    kind: "github",
  });
  if (githubConnection?.kind !== "github") {
    throw new Error("GitHub is not connected.");
  }

  return {
    credential: githubConnection.auth.credential,
    octokit: new Octokit({ auth: githubConnection.auth.credential }),
  };
}

export const deleteConnectedCodespaces = internalAction({
  args: {
    vaultId: id("vaults"),
    runId: id("vaultDeletionRuns"),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await getDeletionPlan(ctx, args.runId);
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "delete_codespaces",
      level: "info",
      message: providerStepRetryMessage.delete_codespaces,
    });
    if (plan.codespaces.action === "skip") {
      return null;
    }

    const codespaces = await ctx.runQuery(
      internal.codespaces.mutations.listConnectedCodespacesForVault,
      {
        vaultId: args.vaultId,
        userId: args.userId,
      },
    );
    if (codespaces.length === 0) {
      return null;
    }

    const { octokit } = await resolveGitHubClient(ctx, args.userId);
    for (const codespace of codespaces) {
      await ctx.runMutation(internal.codespaces.mutations.updateCodespaceState, {
        codespaceId: codespace._id,
        state: "deleting",
      });

      try {
        await octokit.rest.codespaces.deleteForAuthenticatedUser({
          codespace_name: codespace.ghCodespaceName,
        });
      } catch (error) {
        if (!(error instanceof RequestError && error.status === 404)) {
          await ctx.runMutation(internal.codespaces.mutations.updateCodespaceState, {
            codespaceId: codespace._id,
            state: "failed",
          });
          throw error;
        }
      }

      await ctx.runMutation(internal.codespaces.mutations.clearActiveCodespace, {
        vaultId: args.vaultId,
        codespaceId: codespace._id,
      });
      await ctx.runMutation(internal.codespaces.mutations.updateCodespaceState, {
        codespaceId: codespace._id,
        state: "deleted",
        deletedAt: Date.now(),
      });
    }

    return null;
  },
});

export const deleteCloudflare = internalAction({
  args: {
    runId: id("vaultDeletionRuns"),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await getDeletionPlan(ctx, args.runId);
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "delete_cloudflare",
      level: "info",
      message: providerStepRetryMessage.delete_cloudflare,
    });
    if (plan.cloudflare.action === "skip" && plan.cloudflareBuildTriggers.action === "skip") {
      return null;
    }

    const cloudflareConnection = await ctx.runAction(
      internal.cloudflareOAuth.resolveConnectionForUser,
      {
        userId: args.userId,
      },
    );
    if (!cloudflareConnection) {
      throw new Error("Cloudflare connection is required to remove resources.");
    }
    const cloudflareTransport = resolveCloudflareApiTransport(cloudflareConnection.auth.method);

    if (plan.cloudflareBuildTriggers.action === "detach") {
      for (const worker of plan.cloudflareBuildTriggers.workers) {
        await deleteCloudflareWorkerBuildTriggers({
          accountId: worker.accountId,
          workerTag: worker.workerTag,
          cloudflareToken: cloudflareConnection.auth.credential,
          transport: cloudflareTransport,
        });
      }
    }

    if (plan.cloudflare.action === "skip") {
      return null;
    }

    const workers =
      plan.cloudflare.action === "delete_worker" ? [plan.cloudflare] : plan.cloudflare.workers;
    if (workers.length === 0) {
      throw new Error("Cloudflare deletion plan must include at least one Worker.");
    }
    for (const worker of workers) {
      try {
        await deleteCloudflareResources({
          accountId: worker.accountId,
          workerName: worker.workerName,
          workerTag: worker.workerTag,
          cloudflareToken: cloudflareConnection.auth.credential,
          transport: cloudflareTransport,
        });
      } catch (error) {
        if (!isCloudflareWorkerNotFoundError(error)) {
          throw error;
        }
      }
    }

    return null;
  },
});

export const deleteConvex = internalAction({
  args: {
    runId: id("vaultDeletionRuns"),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await getDeletionPlan(ctx, args.runId);
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "delete_convex",
      level: "info",
      message: providerStepRetryMessage.delete_convex,
    });
    if (plan.convex.action === "skip" && plan.convexDependencyDeployKeys.action === "skip") {
      return null;
    }

    const convexConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: args.userId,
      kind: "convex",
    });
    if (convexConnection?.kind !== "convex") {
      throw new Error("Convex connection is required to remove resources.");
    }

    if (plan.convexDependencyDeployKeys.action === "revoke") {
      for (const dependency of plan.convexDependencyDeployKeys.dependencies) {
        if (dependency.deployKeys.production.state === "created") {
          try {
            await deleteConvexDeployKey({
              convexToken: convexConnection.auth.credential,
              deploymentName: dependency.deployKeys.production.deploymentName,
              convexDeployKeyName: dependency.deployKeys.production.name,
            });
          } catch (error) {
            if (!isConvexManagementNotFoundError(error)) {
              throw error;
            }
          }
        }
        if (dependency.deployKeys.preview.state === "created") {
          try {
            await deleteConvexPreviewDeployKey({
              convexToken: convexConnection.auth.credential,
              projectId: dependency.deployKeys.preview.projectId,
              convexDeployKeyName: dependency.deployKeys.preview.name,
            });
          } catch (error) {
            if (!isConvexManagementNotFoundError(error)) {
              throw error;
            }
          }
        }
      }
    }

    if (plan.convex.action === "skip") {
      return null;
    }

    try {
      switch (plan.convex.action) {
        case "delete_project": {
          await requestConvexManagementApi(
            convexConnection.auth.credential,
            "POST",
            "/projects/{project_id}/delete",
            { params: { path: { project_id: plan.convex.projectId } } },
          );
          break;
        }
        case "delete_projects": {
          for (const projectId of plan.convex.projectIds) {
            try {
              await requestConvexManagementApi(
                convexConnection.auth.credential,
                "POST",
                "/projects/{project_id}/delete",
                { params: { path: { project_id: projectId } } },
              );
            } catch (error) {
              if (!isConvexManagementNotFoundError(error)) {
                throw error;
              }
            }
          }
          break;
        }
        case "delete_deployment": {
          await requestConvexManagementApi(
            convexConnection.auth.credential,
            "POST",
            "/deployments/{deployment_name}/delete",
            { params: { path: { deployment_name: plan.convex.deploymentName } } },
          );
          break;
        }
        default: {
          plan.convex satisfies never;
          throw new Error("Unsupported Convex deletion action.");
        }
      }
    } catch (error) {
      if (!isConvexManagementNotFoundError(error)) {
        throw error;
      }
    }

    return null;
  },
});

export const deleteGitHubRepository = internalAction({
  args: {
    runId: id("vaultDeletionRuns"),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await getDeletionPlan(ctx, args.runId);
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "delete_github_repo",
      level: "info",
      message: providerStepRetryMessage.delete_github_repo,
    });
    if (
      plan.target.kind !== "samebase_managed_repository" ||
      plan.githubRepository.action !== "delete_repository"
    ) {
      return null;
    }

    const { credential, octokit } = await resolveGitHubClient(ctx, args.userId);
    await renameGitHubRepositoryForDeletion({
      credential,
      repositoryNodeId: plan.target.ghRepoNodeId,
      expectedRepositoryDatabaseId: plan.target.ghRepoId,
      deletionRepositoryName: plan.githubRepository.deletionRepositoryName,
    });
    const repositoryIdentity = await resolveGitHubRepositoryIdentity({
      credential,
      repositoryNodeId: plan.target.ghRepoNodeId,
      expectedRepositoryDatabaseId: plan.target.ghRepoId,
    });
    if (repositoryIdentity.name !== plan.githubRepository.deletionRepositoryName) {
      throw new Error("GitHub repository deletion tombstone changed before deletion.");
    }
    const currentRepository = await octokit.rest.repos.get({
      owner: repositoryIdentity.owner,
      repo: repositoryIdentity.name,
    });
    if (String(currentRepository.data.id) !== plan.target.ghRepoId) {
      throw new Error("GitHub returned another repository immediately before deletion.");
    }
    await octokit.rest.repos.delete({
      owner: repositoryIdentity.owner,
      repo: repositoryIdentity.name,
    });

    return null;
  },
});
