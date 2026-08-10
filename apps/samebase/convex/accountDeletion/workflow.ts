import { WorkflowManager } from "@convex-dev/workflow";
import { vResultValidator } from "@convex-dev/workpool";
import { v, type Infer } from "convex/values";

import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import {
  CONVEX_MANUAL_REVOCATION_NOTICE,
  vAccountDeletionEventLevel,
  vAccountDeletionOutcomeSummary,
  vAccountDeletionStep,
} from "./model";
import { readOwnedActiveRun } from "./stepContext";

const workflow = new WorkflowManager(components.workflow);
const { id, literal, object, string, union } = v;

const workflowOwnershipArgs = {
  runId: id("workflow_accountDeletion_runs"),
  workflowId: string(),
};

const workflowCompletionContext = object({ runId: id("workflow_accountDeletion_runs") });

const vClosedEmailOutcome = union(
  object({ state: literal("sent") }),
  object({ state: literal("delivery_failed"), safeError: string() }),
);

const vClaimedWorkflowRun = object({
  outcomes: vAccountDeletionOutcomeSummary,
});

const SAFE_WORKFLOW_ERROR = "Account deletion needs staff attention.";
const MAX_QUIESCE_CHECKS = 130;
const MAX_BATCH_STEPS = 96;

type AccountDeletionStep = Infer<typeof vAccountDeletionStep>;
const ACCOUNT_DELETION_STEP_RANK = {
  request_accepted: 0,
  revoke_access: 1,
  delete_samebase_data: 2,
  send_completion_email: 3,
  delete_identity: 4,
  finish: 5,
} satisfies Record<AccountDeletionStep, number>;

function latestAccountDeletionStep(
  current: AccountDeletionStep,
  candidate: AccountDeletionStep,
): AccountDeletionStep {
  return ACCOUNT_DELETION_STEP_RANK[candidate] > ACCOUNT_DELETION_STEP_RANK[current]
    ? candidate
    : current;
}

export async function startAccountDeletionWorkflow(
  ctx: MutationCtx,
  runId: Id<"workflow_accountDeletion_runs">,
): Promise<string> {
  const run = await ctx.db.get(runId);
  if (run === null || run.state === "succeeded") {
    throw new Error("Account deletion run is not active.");
  }

  return workflow.start(
    ctx,
    internal.accountDeletion.workflow.deleteAccountWorkflow,
    { runId },
    {
      startAsync: true,
      onComplete: internal.accountDeletion.workflow.handleWorkflowComplete,
      context: { runId },
    },
  );
}

export const claimWorkflowRun = internalMutation({
  args: workflowOwnershipArgs,
  returns: vClaimedWorkflowRun,
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    return { outcomes: run.outcomes };
  },
});

export const appendRunEvent = internalMutation({
  args: {
    ...workflowOwnershipArgs,
    step: vAccountDeletionStep,
    level: vAccountDeletionEventLevel,
    message: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const now = Date.now();

    await ctx.db.insert("workflow_accountDeletion_events", {
      runId: run._id,
      step: args.step,
      level: args.level,
      message: args.message,
      createdAt: now,
    });
    await ctx.db.patch(run._id, {
      currentStep: latestAccountDeletionStep(run.currentStep, args.step),
      updatedAt: now,
    });
    return null;
  },
});

export const startProviderRevocation = internalMutation({
  args: workflowOwnershipArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    if (run.outcomes.providerRevocation.state === "not_started") {
      await ctx.db.patch(run._id, {
        outcomes: {
          ...run.outcomes,
          providerRevocation: {
            state: "in_progress",
            convexManualRevocationRequired: false,
          },
        },
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const recordProviderBatch = internalMutation({
  args: {
    ...workflowOwnershipArgs,
    convexManualRevocationRequired: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const current = run.outcomes.providerRevocation;
    if (current.state === "completed") {
      return null;
    }
    if (current.state !== "in_progress") {
      throw new Error("Provider revocation was not started.");
    }

    await ctx.db.patch(run._id, {
      outcomes: {
        ...run.outcomes,
        providerRevocation: {
          state: "in_progress",
          convexManualRevocationRequired:
            current.convexManualRevocationRequired || args.convexManualRevocationRequired,
        },
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const finishProviderRevocation = internalMutation({
  args: workflowOwnershipArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const current = run.outcomes.providerRevocation;
    if (current.state === "completed") {
      return null;
    }
    if (current.state !== "in_progress") {
      throw new Error("Provider revocation was not started.");
    }

    await ctx.db.patch(run._id, {
      outcomes: {
        ...run.outcomes,
        providerRevocation: {
          state: "completed",
          githubUserAuthorization: { state: "cleared" },
          cloudflareConnections: { state: "cleared" },
          convexConnections: current.convexManualRevocationRequired
            ? {
                state: "manual_revocation_required",
                safeNotice: CONVEX_MANUAL_REVOCATION_NOTICE,
              }
            : { state: "cleared" },
        },
      },
      currentStep: latestAccountDeletionStep(run.currentStep, "revoke_access"),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const recordCompletionEmailOutcome = internalMutation({
  args: {
    ...workflowOwnershipArgs,
    outcome: vClosedEmailOutcome,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    await ctx.db.patch(run._id, {
      outcomes: { ...run.outcomes, completionEmail: args.outcome },
      currentStep: latestAccountDeletionStep(run.currentStep, "send_completion_email"),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const recordIdentityDeletionStart = internalMutation({
  args: workflowOwnershipArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    await ctx.db.patch(run._id, {
      currentStep: latestAccountDeletionStep(run.currentStep, "delete_identity"),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const deleteAccountWorkflow = workflow.define({
  args: {
    runId: id("workflow_accountDeletion_runs"),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    const ownedArgs = { runId: args.runId, workflowId: step.workflowId };
    const claimed = await step.runMutation(
      internal.accountDeletion.workflow.claimWorkflowRun,
      ownedArgs,
      { name: "claim_workflow" },
    );

    for (let batch = 0; batch < MAX_BATCH_STEPS; batch += 1) {
      const done = await step.runMutation(
        internal.accountDeletion.authCleanup.deleteOtherSessionBatch,
        ownedArgs,
        { name: `delete_other_sessions_${batch}` },
      );
      if (done) {
        break;
      }
      if (batch === MAX_BATCH_STEPS - 1) {
        throw new Error(SAFE_WORKFLOW_ERROR);
      }
    }

    await step.runMutation(
      internal.accountDeletion.workflow.appendRunEvent,
      {
        ...ownedArgs,
        step: "request_accepted",
        level: "info",
        message: "Waiting for active Samebase work to stop.",
      },
      { name: "start_quiescence" },
    );
    for (let check = 0; check < MAX_QUIESCE_CHECKS; check += 1) {
      const result = await step.runMutation(
        internal.accountDeletion.cleanup.inspectQuiescence,
        ownedArgs,
        { name: `inspect_quiescence_${check}` },
      );
      if (result.state === "done") {
        break;
      }
      if (check === MAX_QUIESCE_CHECKS - 1) {
        throw new Error(SAFE_WORKFLOW_ERROR);
      }

      await step.sleep(1_000, { name: `wait_for_active_work_${check}` });
    }

    if (claimed.outcomes.providerRevocation.state !== "completed") {
      await step.runMutation(
        internal.accountDeletion.workflow.appendRunEvent,
        {
          ...ownedArgs,
          step: "revoke_access",
          level: "info",
          message: "Removing user-authorized provider access.",
        },
        { name: "start_provider_revocation_event" },
      );
      await step.runMutation(internal.accountDeletion.workflow.startProviderRevocation, ownedArgs, {
        name: "start_provider_revocation",
      });
      await step.runAction(internal.githubUserAuthorizations.revokeForAccountDeletion, ownedArgs, {
        name: "revoke_github_user_authorization",
        retry: false,
      });

      for (let batch = 0; batch < MAX_BATCH_STEPS; batch += 1) {
        const result = await step.runAction(
          internal.accountDeletion.providerActions.revokeConnectionBatch,
          ownedArgs,
          { name: `revoke_provider_connections_${batch}`, retry: false },
        );
        await step.runMutation(
          internal.accountDeletion.workflow.recordProviderBatch,
          {
            ...ownedArgs,
            convexManualRevocationRequired: result.convexManualRevocationRequired,
          },
          { name: `record_provider_connections_${batch}` },
        );
        if (result.done) {
          break;
        }
        if (batch === MAX_BATCH_STEPS - 1) {
          throw new Error(SAFE_WORKFLOW_ERROR);
        }
      }

      await step.runMutation(
        internal.accountDeletion.workflow.finishProviderRevocation,
        ownedArgs,
        { name: "finish_provider_revocation" },
      );
    }

    await step.runMutation(
      internal.accountDeletion.workflow.appendRunEvent,
      {
        ...ownedArgs,
        step: "delete_samebase_data",
        level: "info",
        message: "Deleting personal Samebase account data.",
      },
      { name: "start_account_data_cleanup" },
    );
    for (let batch = 0; batch < MAX_BATCH_STEPS; batch += 1) {
      const done = await step.runMutation(
        internal.accountDeletion.cleanup.cleanupAccountDataBatch,
        ownedArgs,
        { name: `delete_account_data_${batch}` },
      );
      if (done) {
        break;
      }
      if (batch === MAX_BATCH_STEPS - 1) {
        throw new Error(SAFE_WORKFLOW_ERROR);
      }
    }

    if (claimed.outcomes.completionEmail.state === "not_started") {
      await step.runMutation(
        internal.accountDeletion.workflow.appendRunEvent,
        {
          ...ownedArgs,
          step: "send_completion_email",
          level: "info",
          message: "Sending account deletion confirmation.",
        },
        { name: "start_completion_email" },
      );
      const email = await step.runAction(
        internal.accountDeletion.completionEmail.sendForAccountDeletion,
        ownedArgs,
        { name: "send_completion_email", retry: false },
      );
      await step.runMutation(
        internal.accountDeletion.workflow.recordCompletionEmailOutcome,
        { ...ownedArgs, outcome: email },
        { name: "record_completion_email_outcome" },
      );
    }

    for (let batch = 0; batch < MAX_BATCH_STEPS; batch += 1) {
      const done = await step.runMutation(
        internal.accountDeletion.authCleanup.deleteAuthAccountBatch,
        ownedArgs,
        { name: `delete_auth_accounts_${batch}` },
      );
      if (done) {
        break;
      }
      if (batch === MAX_BATCH_STEPS - 1) {
        throw new Error(SAFE_WORKFLOW_ERROR);
      }
    }
    await step.runMutation(
      internal.accountDeletion.authCleanup.deleteIdentityRateLimit,
      ownedArgs,
      { name: "delete_identity_rate_limit" },
    );

    for (let batch = 0; batch < MAX_BATCH_STEPS; batch += 1) {
      const done = await step.runMutation(
        internal.accountDeletion.authCleanup.deleteInitiatingSessionBatch,
        ownedArgs,
        { name: `delete_initiating_session_children_${batch}` },
      );
      if (done) {
        break;
      }
      if (batch === MAX_BATCH_STEPS - 1) {
        throw new Error(SAFE_WORKFLOW_ERROR);
      }
    }

    for (let batch = 0; batch < MAX_BATCH_STEPS; batch += 1) {
      const done = await step.runMutation(
        internal.accountDeletion.authCleanup.deleteEventBatch,
        ownedArgs,
        { name: `delete_account_deletion_events_${batch}` },
      );
      if (done) {
        break;
      }
      if (batch === MAX_BATCH_STEPS - 1) {
        throw new Error(SAFE_WORKFLOW_ERROR);
      }
    }

    await step.runMutation(
      internal.accountDeletion.workflow.recordIdentityDeletionStart,
      ownedArgs,
      { name: "record_identity_deletion_start" },
    );
    await step.runMutation(internal.accountDeletion.authCleanup.finishIdentityDeletion, ownedArgs, {
      name: "finish_identity_deletion",
    });
    return null;
  },
});

export const handleWorkflowComplete = internalMutation({
  args: {
    workflowId: string(),
    context: workflowCompletionContext,
    result: vResultValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.context.runId);
    if (run === null || run.identity.state === "scrubbed") {
      return null;
    }
    if (run.state !== "running" || run.workflow.workflowId !== args.workflowId) {
      return null;
    }

    const now = Date.now();
    await ctx.db.replace(run._id, {
      identity: run.identity,
      completionCapability: run.completionCapability,
      state: "needs_attention",
      workflow: run.workflow,
      currentStep: run.currentStep,
      requestedAt: run.requestedAt,
      initiatingSessionId: run.initiatingSessionId,
      retryCount: run.retryCount,
      outcomes: run.outcomes,
      latestSafeError: SAFE_WORKFLOW_ERROR,
      updatedAt: now,
    });
    await ctx.db.insert("workflow_accountDeletion_events", {
      runId: run._id,
      step: run.currentStep,
      level: "error",
      message: SAFE_WORKFLOW_ERROR,
      createdAt: now,
    });
    return null;
  },
});
