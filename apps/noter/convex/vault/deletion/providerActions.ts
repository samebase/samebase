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
  isCloudflareWorkerNotFoundError,
} from "../../cloudflareResources";
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

async function resolveGitHubOctokit(
  ctx: Pick<ActionCtx, "runQuery">,
  userId: Id<"users">,
): Promise<Octokit> {
  const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
    userId,
    kind: "github",
  });
  if (githubConnection?.kind !== "github") {
    throw new Error("GitHub is not connected.");
  }

  return new Octokit({
    auth: githubConnection.auth.credential,
  });
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

    const octokit = await resolveGitHubOctokit(ctx, args.userId);
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
    if (plan.cloudflare.action === "skip") {
      return null;
    }

    const cloudflareConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: args.userId,
      kind: "cloudflare",
    });
    if (cloudflareConnection?.kind !== "cloudflare") {
      throw new Error("Cloudflare connection is required to remove resources.");
    }

    const workers =
      plan.cloudflare.action === "delete_worker" ? [plan.cloudflare] : plan.cloudflare.workers;
    for (const worker of workers) {
      try {
        await deleteCloudflareResources({
          accountId: worker.accountId,
          workerName: worker.workerName,
          workerTag: worker.workerTag,
          cloudflareToken: cloudflareConnection.auth.credential,
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
    if (plan.convex.action === "skip") {
      return null;
    }

    const convexConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: args.userId,
      kind: "convex",
    });
    if (convexConnection?.kind !== "convex") {
      throw new Error("Convex connection is required to remove resources.");
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
    if (plan.githubRepository.action !== "delete_repository") {
      return null;
    }

    const octokit = await resolveGitHubOctokit(ctx, args.userId);
    try {
      await octokit.rest.repos.delete({
        owner: plan.githubRepository.owner,
        repo: plan.githubRepository.name,
      });
    } catch (error) {
      if (!(error instanceof RequestError && error.status === 404)) {
        throw error;
      }
    }

    return null;
  },
});
