import { v } from "convex/values";
import { vResultValidator, type RunResult } from "@convex-dev/workpool";
import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "../../_generated/api";
import { internalMutation } from "../../_generated/server";
import { toErrorMessage } from "../../jsonUtils";
import type { VaultDeletionCleanupStep } from "./model";

const workflow = new WorkflowManager(components.workflow);
const { id, object, string } = v;

const idempotentProviderStepRetry = {
  maxAttempts: 3,
  initialBackoffMs: 1_000,
  base: 2,
} as const;

const workflowCompletionContext = object({
  runId: id("workflow_vaultDeletion_runs"),
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
  cleanup_runtime_state: "Cleaning vault runtime state.",
  cleanup_provisioning_history: "Cleaning setup history.",
} satisfies Record<VaultDeletionCleanupStep, string>;

export function resolveVaultDeletionWorkflowError(result: RunResult): string | null {
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

export const deleteVaultWorkflow = workflow.define({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultDeletion_runs"),
    userId: id("users"),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    await step.runMutation(internal.vault.deletion.runs.claimWorkflowRun, args, {
      name: "lock_vault",
    });
    await step.runAction(
      internal.vault.deletion.providerActions.deleteCloudflare,
      {
        runId: args.runId,
        userId: args.userId,
      },
      { name: "delete_cloudflare", retry: idempotentProviderStepRetry },
    );
    await step.runAction(
      internal.vault.deletion.providerActions.deleteConvex,
      {
        runId: args.runId,
        userId: args.userId,
      },
      { name: "delete_convex", retry: idempotentProviderStepRetry },
    );
    await step.runAction(
      internal.vault.deletion.providerActions.deleteGitHubRepository,
      {
        runId: args.runId,
        userId: args.userId,
      },
      { name: "delete_github_repo", retry: idempotentProviderStepRetry },
    );

    for (const cleanupStep of cleanupSteps) {
      await step.runMutation(
        internal.vault.deletion.runs.appendRunEvent,
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
        internal.vault.deletion.cleanup.cleanupVaultLocalDataStepBatch,
        {
          vaultId: args.vaultId,
          userId: args.userId,
          step: cleanupStep,
        },
        { name: `${cleanupStep}_batch_0` },
      );

      for (let batchNumber = 1; cleanupResult.state === "needs_more"; batchNumber += 1) {
        cleanupResult = await step.runMutation(
          internal.vault.deletion.cleanup.cleanupVaultLocalDataStepBatch,
          {
            vaultId: args.vaultId,
            userId: args.userId,
            step: cleanupStep,
          },
          { name: `${cleanupStep}_batch_${batchNumber}` },
        );
      }
    }

    await step.runMutation(
      internal.vault.deletion.runs.appendRunEvent,
      {
        runId: args.runId,
        step: "delete_vault",
        level: "info",
        message: "Removing vault.",
        state: "running",
      },
      { name: "delete_vault_event" },
    );
    await step.runMutation(
      internal.vault.deletion.cleanup.deleteVaultRow,
      {
        vaultId: args.vaultId,
        userId: args.userId,
      },
      { name: "delete_vault" },
    );
    await step.runMutation(
      internal.vault.deletion.runs.finishWorkflowRun,
      {
        runId: args.runId,
      },
      { name: "finish" },
    );

    return null;
  },
});

export const startVaultDeletion = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultDeletion_runs"),
    userId: id("users"),
  },
  returns: string(),
  handler: async (ctx, args): Promise<string> => {
    try {
      const workflowId: string = await workflow.start(
        ctx,
        internal.vault.deletion.workflow.deleteVaultWorkflow,
        args,
        {
          startAsync: true,
          onComplete: internal.vault.deletion.workflow.handleVaultDeletionWorkflowComplete,
          context: {
            runId: args.runId,
          },
        },
      );

      await ctx.runMutation(internal.vault.deletion.runs.markWorkflowStarted, {
        runId: args.runId,
        workflowId,
      });

      return workflowId;
    } catch (error) {
      await ctx.runMutation(internal.vault.deletion.runs.markWorkflowFailed, {
        runId: args.runId,
        message: toErrorMessage(error),
      });
      throw error;
    }
  },
});

export const handleVaultDeletionWorkflowComplete = internalMutation({
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

    const error = resolveVaultDeletionWorkflowError(args.result);
    if (!error) {
      await ctx.runMutation(internal.vault.deletion.runs.finishWorkflowRun, {
        runId: args.context.runId,
      });
      return null;
    }

    await ctx.runMutation(internal.vault.deletion.runs.markWorkflowFailed, {
      runId: args.context.runId,
      message: toErrorMessage(error),
    });

    return null;
  },
});
