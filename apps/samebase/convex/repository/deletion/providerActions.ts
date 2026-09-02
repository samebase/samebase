"use node";

import { RequestError } from "@octokit/request-error";
import { v } from "convex/values";
import { internalAction, type ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { requestConvexManagementApiOrThrow } from "../../convexManagementApi/client";
import { isConvexManagementNotFoundError } from "../../convexManagementApi/errors";
import {
  deleteCloudflareResources,
  isCloudflareWorkerNotFoundError,
} from "../../cloudflareResources";
import { resolveCloudflareApiTransport } from "../../cloudflareApi/client";
import { resolveGitHubAppAccessForRepositoryDeletionRun } from "../../githubAppAccess";
import { readRetainedSnapshot } from "./runs";
import { type RepositoryDeletionEventLevel, type RepositoryDeletionStep } from "./model";

const { id } = v;

const providerStepRetryMessage = {
  delete_cloudflare: "Removing Cloudflare resources.",
  delete_convex: "Removing Convex resources.",
  delete_github_repository: "Removing GitHub repository.",
} satisfies Record<"delete_cloudflare" | "delete_convex" | "delete_github_repository", string>;

async function getDeletionRun(
  ctx: Pick<ActionCtx, "runQuery">,
  runId: Id<"workflow_repositoryDeletion_runs">,
): Promise<Doc<"workflow_repositoryDeletion_runs">> {
  const run = await ctx.runQuery(internal.repository.deletion.runs.getById, {
    runId,
  });
  if (!run) {
    throw new Error("Deletion run not found.");
  }
  return run;
}

async function requireDeletionContinuation(
  ctx: Pick<ActionCtx, "runMutation">,
  runId: Id<"workflow_repositoryDeletion_runs">,
): Promise<void> {
  await ctx.runMutation(
    internal.repositoryWorkflowAuthority.assertRepositoryProviderWorkflowContinuation,
    {
      authority: { kind: "deletion", runId },
    },
  );
}

async function appendRunEvent(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    runId: Id<"workflow_repositoryDeletion_runs">;
    step: RepositoryDeletionStep;
    level: RepositoryDeletionEventLevel;
    message: string;
  },
): Promise<void> {
  await ctx.runMutation(internal.repository.deletion.runs.appendRunEvent, {
    runId: args.runId,
    step: args.step,
    level: args.level,
    message: args.message,
    state: "running",
  });
}

export const deleteCloudflare = internalAction({
  args: {
    runId: id("workflow_repositoryDeletion_runs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await getDeletionRun(ctx, args.runId);
    await requireDeletionContinuation(ctx, args.runId);
    const plan = readRetainedSnapshot(run).plan;
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "delete_cloudflare",
      level: "info",
      message: providerStepRetryMessage.delete_cloudflare,
    });
    if (plan.cloudflare.action === "skip") {
      return null;
    }

    const workers = plan.cloudflare.workers;
    const firstWorker = workers.at(0);
    if (firstWorker === undefined) {
      throw new Error("Cloudflare deletion plan must include at least one Worker.");
    }
    if (workers.some((worker) => worker.accountId !== firstWorker.accountId)) {
      throw new Error("Cloudflare connection is required to remove resources.");
    }
    const connection = await ctx.runAction(
      internal.cloudflareOAuth.resolveConnectionForRepositoryWorkflow,
      {
        authority: { kind: "deletion", runId: args.runId },
      },
    );
    if (!connection || connection.account.accountId !== firstWorker.accountId) {
      throw new Error("Cloudflare connection is required to remove resources.");
    }
    for (const worker of workers) {
      try {
        await deleteCloudflareResources({
          accountId: worker.accountId,
          workerTag: worker.workerTag,
          cloudflareToken: connection.auth.credential,
          transport: resolveCloudflareApiTransport(connection.auth.method),
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
    runId: id("workflow_repositoryDeletion_runs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await getDeletionRun(ctx, args.runId);
    await requireDeletionContinuation(ctx, args.runId);
    const plan = readRetainedSnapshot(run).plan;
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "delete_convex",
      level: "info",
      message: providerStepRetryMessage.delete_convex,
    });
    if (plan.convex.action === "skip") {
      return null;
    }

    if (plan.convex.projects.length === 0) {
      throw new Error("Convex deletion plan must include at least one project.");
    }
    const provider = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForRepositoryProviderWorkflow,
      { authority: { kind: "deletion", runId: args.runId } },
    );
    for (const project of plan.convex.projects) {
      const credential = provider.configuration.convexCredential;
      if (
        provider.configuration.convexTeam?.teamId !== project.teamId ||
        credential === undefined
      ) {
        throw new Error("Convex connection is required to remove resources.");
      }
      try {
        await requestConvexManagementApiOrThrow(
          credential.auth.credential,
          "POST",
          "/projects/{project_id}/delete",
          { params: { path: { project_id: project.projectId } } },
        );
      } catch (error) {
        if (!isConvexManagementNotFoundError(error)) {
          throw error;
        }
      }
    }

    return null;
  },
});

export const deleteGitHubRepository = internalAction({
  args: {
    runId: id("workflow_repositoryDeletion_runs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await getDeletionRun(ctx, args.runId);
    await requireDeletionContinuation(ctx, args.runId);
    const plan = readRetainedSnapshot(run).plan;
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "delete_github_repository",
      level: "info",
      message: providerStepRetryMessage.delete_github_repository,
    });
    if (plan.githubRepository.action !== "delete_repository") {
      return null;
    }

    const githubAccess = await resolveGitHubAppAccessForRepositoryDeletionRun(ctx, {
      runId: args.runId,
    });
    try {
      const repository = await githubAccess.octokit.rest.repos.get({
        owner: plan.githubRepository.githubOwnerLogin,
        repo: plan.githubRepository.githubRepositoryName,
      });
      if (String(repository.data.id) !== plan.githubRepository.githubRepositoryDatabaseId) {
        throw new Error("GitHub repository identity changed.");
      }

      await githubAccess.octokit.rest.repos.delete({
        owner: plan.githubRepository.githubOwnerLogin,
        repo: plan.githubRepository.githubRepositoryName,
      });
    } catch (error) {
      if (!(error instanceof RequestError && error.status === 404)) {
        throw error;
      }
    }

    return null;
  },
});
