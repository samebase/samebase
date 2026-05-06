import { v } from "convex/values";
import { vResultValidator, type RunResult } from "@convex-dev/workpool";
import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { toErrorMessage } from "./jsonUtils";

const workflow = new WorkflowManager(components.workflow);
const { boolean, id, object, string } = v;

const workflowCompletionContext = object({
  runId: id("appProvisioningRuns"),
  vaultId: id("vaults"),
});

export function resolveWorkflowCompletionError(
  result: RunResult,
): string | null {
  switch (result.kind) {
    case "success":
      return null;
    case "failed":
      return result.error;
    case "canceled":
      return "Provisioning workflow was canceled.";
    default: {
      result satisfies never;
      return null;
    }
  }
}

export const provisionVaultInfrastructure = workflow.define({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    force: boolean(),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    const { claimed } = await step.runMutation(
      internal.infraProvisioning.claimWorkflowProvisioning,
      args,
      { name: "claim_infra" },
    );
    if (!claimed) {
      return null;
    }

    await step.runAction(
      internal.infraProvisioning.validateProvisioningConnections,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      { name: "validate_connections", retry: false },
    );
    await step.runAction(
      internal.infraProvisioning.ensureConvexInfrastructure,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      { name: "ensure_convex", retry: false },
    );
    await step.runAction(
      internal.infraProvisioning.ensureConvexPreviewInfrastructure,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      { name: "ensure_convex_preview", retry: false },
    );
    await step.runAction(
      internal.infraProvisioning.ensureCloudflareInfrastructure,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      { name: "ensure_cloudflare", retry: false },
    );
    await step.runMutation(
      internal.infraProvisioning.finishWorkflowProvisioning,
      {
        vaultId: args.vaultId,
        runId: args.runId,
      },
      { name: "finish" },
    );

    return null;
  },
});

export const startVaultInfrastructureProvisioning = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    force: boolean(),
  },
  returns: string(),
  handler: async (ctx, args): Promise<string> => {
    const workflowId: string = await workflow.start(
      ctx,
      internal.appProvisioningWorkflow.provisionVaultInfrastructure,
      {
        vaultId: args.vaultId,
        runId: args.runId,
        force: args.force,
      },
      {
        startAsync: true,
        onComplete:
          internal.appProvisioningWorkflow.handleProvisioningWorkflowComplete,
        context: {
          runId: args.runId,
          vaultId: args.vaultId,
        },
      },
    );

    await ctx.db.patch(args.runId, {
      workflowId,
      updatedAt: Date.now(),
    });
    await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, {
      runId: args.runId,
      step: "claim_infra",
      level: "info",
      message: "Queued infrastructure provisioning.",
      state: "queued",
    });

    return workflowId;
  },
});

export const handleProvisioningWorkflowComplete = internalMutation({
  args: {
    workflowId: string(),
    context: workflowCompletionContext,
    result: vResultValidator,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const run = await ctx.db.get(args.context.runId);
    if (!run) {
      throw new Error("Provisioning run not found.");
    }
    if (run.workflowId && run.workflowId !== args.workflowId) {
      throw new Error("Workflow completion id does not match run.");
    }
    if (run.state === "succeeded" || run.state === "failed") {
      return null;
    }

    const error = resolveWorkflowCompletionError(args.result);
    if (!error) {
      if (run.state !== "canceled") {
        const now = Date.now();
        await ctx.db.patch(args.context.runId, {
          state: "succeeded",
          updatedAt: now,
          completedAt: now,
        });
      }
      return null;
    }

    await ctx.runMutation(
      internal.infraProvisioning.markWorkflowProvisioningFailed,
      {
        vaultId: args.context.vaultId,
        runId: args.context.runId,
        workflowId: args.workflowId,
        message: toErrorMessage(error),
      },
    );

    return null;
  },
});
