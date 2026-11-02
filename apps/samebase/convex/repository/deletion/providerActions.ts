"use node";

import { RequestError } from "@octokit/request-error";
import { v } from "convex/values";
import { internalAction, type ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { resolveGitHubAppAccessForRepositoryDeletionRun } from "../../githubAppAccess";
import { readRetainedSnapshot } from "./runs";
import { type RepositoryDeletionEventLevel, type RepositoryDeletionStep } from "./model";

const { id } = v;

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

export const deleteGitHubRepository = internalAction({
  args: {
    runId: id("workflow_repositoryDeletion_runs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await getDeletionRun(ctx, args.runId);
    await requireDeletionContinuation(ctx, args.runId);
    const plan = readRetainedSnapshot(run).plan;
    if (plan.githubRepository.action !== "delete_repository") {
      return null;
    }
    await appendRunEvent(ctx, {
      runId: args.runId,
      step: "delete_github_repository",
      level: "info",
      message: "Deleting GitHub repository.",
    });

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
