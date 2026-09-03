import { v } from "convex/values";
import { vResultValidator, type RunResult } from "@convex-dev/workpool";
import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "../../_generated/api";
import { internalMutation } from "../../_generated/server";
import { toErrorMessage } from "../../jsonUtils";
import {
  requireActiveRepositoryDeletionContinuation,
  requireActiveRepositoryDeletionRun,
} from "../../repositoryWorkflowAuthority";
import type { RepositoryDeletionCleanupStep } from "./model";

const workflow = new WorkflowManager(components.workflow);
const { id, object, string } = v;

const idempotentProviderStepRetry = {
  maxAttempts: 3,
  initialBackoffMs: 1_000,
  base: 2,
} as const;

const workflowCompletionContext = object({
  runId: id("workflow_repositoryDeletion_runs"),
});

const cleanupSteps = [
  "cleanup_editor_state",
  "cleanup_source_caches",
  "cleanup_runtime_state",
  "cleanup_provisioning_history",
] as const;

const cleanupStepMessage = {
  cleanup_editor_state: "Cleaning staged edits and blobs.",
  cleanup_source_caches: "Cleaning branch and source caches.",
  cleanup_runtime_state: "Cleaning repository runtime state.",
  cleanup_provisioning_history: "Cleaning setup history.",
} satisfies Record<RepositoryDeletionCleanupStep, string>;

export function resolveRepositoryDeletionWorkflowError(result: RunResult): string | null {
  switch (result.kind) {
    case "success":
      return null;
    case "failed":
      return result.error;
    case "canceled":
      return "Deletion workflow was canceled.";
    default: {
      result satisfies never;
      return null;
    }
  }
}

export const deleteRepositoryWorkflow = workflow.define({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryDeletion_runs"),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    await step.runMutation(
      internal.repository.deletion.runs.claimWorkflowRun,
      {
        repositoryId: args.repositoryId,
        runId: args.runId,
        userId: args.userId,
      },
      {
        name: "lock_repository",
      },
    );
    await step.runAction(
      internal.repository.deletion.providerActions.deleteCloudflare,
      {
        runId: args.runId,
      },
      { name: "delete_cloudflare", retry: idempotentProviderStepRetry },
    );
    await step.runAction(
      internal.repository.deletion.providerActions.deleteConvex,
      {
        runId: args.runId,
      },
      { name: "delete_convex", retry: idempotentProviderStepRetry },
    );
    await step.runAction(
      internal.repository.deletion.providerActions.deleteGitHubRepository,
      {
        runId: args.runId,
      },
      { name: "delete_github_repository", retry: idempotentProviderStepRetry },
    );

    for (const cleanupStep of cleanupSteps) {
      await step.runMutation(
        internal.repository.deletion.runs.appendRunEvent,
        {
          runId: args.runId,
          step: cleanupStep,
          level: "info",
          message: cleanupStepMessage[cleanupStep],
          state: "running",
        },
        { name: `${cleanupStep}_event` },
      );

      let cleanupResult = await step.runMutation(
        internal.repository.deletion.cleanup.cleanupRepositoryLocalDataStepBatch,
        {
          repositoryId: args.repositoryId,
          runId: args.runId,
          step: cleanupStep,
        },
        { name: `${cleanupStep}_batch_0` },
      );

      for (let batchNumber = 1; cleanupResult.state === "needs_more"; batchNumber += 1) {
        cleanupResult = await step.runMutation(
          internal.repository.deletion.cleanup.cleanupRepositoryLocalDataStepBatch,
          {
            repositoryId: args.repositoryId,
            runId: args.runId,
            step: cleanupStep,
          },
          { name: `${cleanupStep}_batch_${batchNumber}` },
        );
      }
    }

    await step.runMutation(
      internal.repository.deletion.runs.appendRunEvent,
      {
        runId: args.runId,
        step: "remove_repository",
        level: "info",
        message: "Removing from Samebase.",
        state: "running",
      },
      { name: "remove_repository_event" },
    );
    await step.runMutation(
      internal.repository.deletion.cleanup.deleteRepositoryRow,
      {
        repositoryId: args.repositoryId,
        runId: args.runId,
      },
      { name: "remove_repository" },
    );
    await step.runMutation(
      internal.repository.deletion.runs.finishWorkflowRun,
      {
        runId: args.runId,
      },
      { name: "finish" },
    );

    return null;
  },
});

export const startRepositoryDeletion = internalMutation({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryDeletion_runs"),
    userId: id("users"),
  },
  returns: string(),
  handler: async (ctx, args): Promise<string> => {
    const authority = await requireActiveRepositoryDeletionContinuation(ctx, { runId: args.runId });
    if (authority.run.userId !== args.userId || authority.run.repositoryId !== args.repositoryId) {
      throw new Error("Deletion run does not match repository.");
    }
    try {
      const workflowId: string = await workflow.start(
        ctx,
        internal.repository.deletion.workflow.deleteRepositoryWorkflow,
        {
          repositoryId: args.repositoryId,
          runId: args.runId,
          userId: args.userId,
        },
        {
          startAsync: true,
          onComplete:
            internal.repository.deletion.workflow.handleRepositoryDeletionWorkflowComplete,
          context: {
            runId: args.runId,
          },
        },
      );

      await ctx.runMutation(internal.repository.deletion.runs.markWorkflowStarted, {
        runId: args.runId,
        workflowId,
      });

      return workflowId;
    } catch (error) {
      await ctx.runMutation(internal.repository.deletion.runs.markWorkflowFailed, {
        runId: args.runId,
        message: toErrorMessage(error),
      });
      throw error;
    }
  },
});

export const handleRepositoryDeletionWorkflowComplete = internalMutation({
  args: {
    workflowId: string(),
    context: workflowCompletionContext,
    result: vResultValidator,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const run = await ctx.db.get(args.context.runId);
    if (!run) {
      throw new Error("Deletion run not found.");
    }
    if (run.workflow.state === "started" && run.workflow.workflowId !== args.workflowId) {
      throw new Error("Workflow completion id does not match deletion run.");
    }
    if (run.state === "succeeded" || run.state === "failed") {
      return null;
    }
    await requireActiveRepositoryDeletionRun(ctx.db, { runId: run._id });
    const error = resolveRepositoryDeletionWorkflowError(args.result);
    if (!error) {
      await ctx.runMutation(internal.repository.deletion.runs.finishWorkflowRun, {
        runId: args.context.runId,
      });
      return null;
    }

    await ctx.runMutation(internal.repository.deletion.runs.markWorkflowFailed, {
      runId: args.context.runId,
      message: toErrorMessage(error),
    });

    return null;
  },
});
