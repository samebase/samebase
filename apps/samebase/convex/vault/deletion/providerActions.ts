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
import { resolveCloudflareApiTransport } from "../../cloudflareApi/client";
import { readRetainedSnapshot } from "./runs";
import {
  type VaultDeletionEventLevel,
  type VaultDeletionPlan,
  type VaultDeletionStep,
} from "./model";

const { id } = v;

const providerStepRetryMessage = {
  delete_cloudflare: "Removing Cloudflare resources.",
  delete_convex: "Removing Convex resources.",
  delete_github_repo: "Removing GitHub repository.",
} satisfies Record<"delete_cloudflare" | "delete_convex" | "delete_github_repo", string>;

async function getDeletionRun(
  ctx: Pick<ActionCtx, "runQuery">,
  runId: Id<"workflow_vaultDeletion_runs">,
): Promise<Doc<"workflow_vaultDeletion_runs">> {
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
  runId: Id<"workflow_vaultDeletion_runs">,
): Promise<VaultDeletionPlan> {
  const run = await getDeletionRun(ctx, runId);
  return readRetainedSnapshot(run).plan;
}

async function appendRunEvent(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"workflow_vaultDeletion_runs">;
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
  args: {
    organizationId: Id<"organizations">;
    providerConnectionId: Id<"providerConnections">;
  },
): Promise<Octokit> {
  const githubConnection = await ctx.runQuery(
    internal.providerConnections.loadConnectedByIdForOrganization,
    {
      organizationId: args.organizationId,
      providerConnectionId: args.providerConnectionId,
      kind: "github",
    },
  );
  if (githubConnection?.kind !== "github") {
    throw new Error("GitHub is not connected.");
  }

  return new Octokit({
    auth: githubConnection.auth.credential,
  });
}

export const deleteCloudflare = internalAction({
  args: {
    runId: id("workflow_vaultDeletion_runs"),
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

    const context = await ctx.runQuery(internal.vault.deletion.runs.getProviderDeletionContext, {
      runId: args.runId,
    });
    if (!context) {
      throw new Error("Vault provider context is unavailable.");
    }

    const workers =
      plan.cloudflare.action === "delete_worker" ? [plan.cloudflare] : plan.cloudflare.workers;
    if (workers.length === 0) {
      throw new Error("Cloudflare deletion plan must include at least one Worker.");
    }
    for (const worker of workers) {
      const attachment = context.workers.find(
        (candidate) =>
          candidate.accountId === worker.accountId &&
          candidate.workerName === worker.workerName &&
          candidate.workerTag === worker.workerTag,
      );
      if (!attachment) {
        throw new Error("Cloudflare Worker attachment is unavailable.");
      }
      const cloudflareConnection = await ctx.runQuery(
        internal.providerConnections.loadConnectedByIdForOrganization,
        {
          organizationId: context.organizationId,
          providerConnectionId: attachment.providerConnectionId,
          kind: "cloudflare",
        },
      );
      if (cloudflareConnection?.kind !== "cloudflare") {
        throw new Error("Cloudflare connection is required to remove resources.");
      }
      try {
        await deleteCloudflareResources({
          accountId: worker.accountId,
          workerTag: worker.workerTag,
          cloudflareToken: cloudflareConnection.auth.credential,
          transport: resolveCloudflareApiTransport(cloudflareConnection.auth.method),
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
    runId: id("workflow_vaultDeletion_runs"),
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

    const context = await ctx.runQuery(internal.vault.deletion.runs.getProviderDeletionContext, {
      runId: args.runId,
    });
    if (!context) {
      throw new Error("Vault provider context is unavailable.");
    }

    try {
      const teamId = plan.convex.teamId;
      const projectIds =
        plan.convex.action === "delete_project" ? [plan.convex.projectId] : plan.convex.projectIds;
      for (const projectId of projectIds) {
        const attachment = context.projects.find(
          (candidate) => candidate.teamId === teamId && candidate.projectId === projectId,
        );
        if (!attachment) {
          throw new Error("Convex project attachment is unavailable.");
        }
        const convexConnection = await ctx.runQuery(
          internal.providerConnections.loadConnectedByIdForOrganization,
          {
            organizationId: context.organizationId,
            providerConnectionId: attachment.providerConnectionId,
            kind: "convex",
          },
        );
        if (convexConnection?.kind !== "convex" || convexConnection.teamId !== attachment.teamId) {
          throw new Error("Connect the Convex team that owns these projects before removing them.");
        }
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
    runId: id("workflow_vaultDeletion_runs"),
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

    const context = await ctx.runQuery(internal.vault.deletion.runs.getProviderDeletionContext, {
      runId: args.runId,
    });
    if (!context) {
      throw new Error("Vault provider context is unavailable.");
    }
    const octokit = await resolveGitHubOctokit(ctx, {
      organizationId: context.organizationId,
      providerConnectionId: context.githubProviderConnectionId,
    });
    try {
      const repository = await octokit.rest.repos.get({
        owner: plan.githubRepository.owner,
        repo: plan.githubRepository.name,
      });
      if (String(repository.data.id) !== plan.githubRepository.ghRepoId) {
        throw new Error("GitHub repository identity changed.");
      }

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
