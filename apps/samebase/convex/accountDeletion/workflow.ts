import { WorkflowManager } from "@convex-dev/workflow";
import { vResultValidator } from "@convex-dev/workpool";
import { v, type Infer } from "convex/values";

import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { assertIdentityDeletionReady } from "./authCleanup";
import {
  vAccountDeletionEventLevel,
  vAccountDeletionOutcomeSummary,
  vAccountDeletionStep,
  vCompletedAccountDeletionProviderRevocationOutcome,
} from "./model";
import { type RevokeProviderAccessResult } from "./providerActions";
import { readOwnedActiveRun } from "./stepContext";

const workflow = new WorkflowManager(components.workflow);
const { id, literal, object, string, union } = v;

const workflowOwnershipArgs = {
  runId: id("accountDeletionRuns"),
  workflowId: string(),
};

const workflowCompletionContext = object({ runId: id("accountDeletionRuns") });

const vClosedBillingOutcome = union(
  object({ state: literal("not_applicable") }),
  object({ state: literal("succeeded") }),
  object({ state: literal("failed"), safeError: string() }),
);

const vClosedEmailOutcome = union(
  object({ state: literal("sent") }),
  object({ state: literal("delivery_failed"), safeError: string() }),
);
const SAFE_WORKFLOW_ERROR = "Account deletion needs staff attention.";
const MAX_QUIESCE_CHECKS = 130;
const MAX_BATCH_STEPS = 96;

type AccountDeletionStep = Infer<typeof vAccountDeletionStep>;
const ACCOUNT_DELETION_STEP_RANK = {
  request_accepted: 0,
  cancel_billing: 1,
  revoke_access: 2,
  delete_samebase_data: 3,
  send_completion_email: 4,
  delete_identity: 5,
  finish: 6,
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
  runId: Id<"accountDeletionRuns">,
): Promise<string> {
  const run = await ctx.db.get(runId);

  if (run === null || run.state === "succeeded") {
    throw new Error("Account deletion run is not active.");
  }

  return workflow.start(
    ctx,
    internal.accountDeletion.workflow.deleteAccountWorkflow,
    run.dataDeletion === undefined ? { runId } : { runId, dataDeletionProgress: true },
    {
      startAsync: true,
      onComplete: internal.accountDeletion.workflow.handleWorkflowComplete,
      context: { runId },
    },
  );
}

function mergeProviderResult<ProviderResult extends { state: string }>(
  previous: ProviderResult,
  current: ProviderResult,
): ProviderResult {
  return previous.state === "unconfirmed" ? current : previous;
}

function hasUnconfirmedProvider(result: RevokeProviderAccessResult): boolean {
  return [result.github, result.cloudflare, result.convex].some(
    ({ state }) => state === "unconfirmed",
  );
}

export const claimWorkflowRun = internalMutation({
  args: workflowOwnershipArgs,
  returns: vAccountDeletionOutcomeSummary,
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);

    return run.outcomes;
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

    await ctx.db.insert("accountDeletionEvents", {
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

export const recordBillingOutcome = internalMutation({
  args: {
    ...workflowOwnershipArgs,
    outcome: vClosedBillingOutcome,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);

    await ctx.db.patch(run._id, {
      outcomes: { ...run.outcomes, billing: args.outcome },
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const recordProviderOutcome = internalMutation({
  args: {
    ...workflowOwnershipArgs,
    outcome: vCompletedAccountDeletionProviderRevocationOutcome,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);

    await ctx.db.patch(run._id, {
      outcomes: { ...run.outcomes, providerRevocation: args.outcome },
      currentStep: latestAccountDeletionStep(run.currentStep, "revoke_access"),
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const deleteProviderConnections = internalMutation({
  args: workflowOwnershipArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);

    const connections = await ctx.db
      .query("providerConnections")
      .withIndex("by_user", (query) => query.eq("userId", run.identity.userId))
      .take(25);

    for (const connection of connections) {
      await ctx.db.delete(connection._id);
    }

    return connections.length < 25;
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

export const markFinalizing = internalMutation({
  args: workflowOwnershipArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const user = await ctx.db.get(run.identity.userId);

    if (
      user === null ||
      user.accountDeletion?.runId !== run._id ||
      user.accountDeletion.state !== "deleting"
    ) {
      throw new Error("Account deletion marker is inconsistent.");
    }

    await assertIdentityDeletionReady(ctx, run);

    const now = Date.now();

    await ctx.db.patch(user._id, {
      accountDeletion: {
        state: "finalizing",
        runId: run._id,
        requestedAt: run.requestedAt,
      },
    });

    await ctx.db.patch(run._id, {
      currentStep: latestAccountDeletionStep(run.currentStep, "delete_identity"),
      updatedAt: now,
    });

    return null;
  },
});

export const deleteAccountWorkflow = workflow.define({
  args: {
    runId: id("accountDeletionRuns"),
    // Persisted workflow input selects the journal shape without inserting a
    // compatibility-breaking discovery step into older runs.
    dataDeletionProgress: v.optional(literal(true)),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    const ownedArgs = { runId: args.runId, workflowId: step.workflowId };
    const initialOutcomes = await step.runMutation(
      internal.accountDeletion.workflow.claimWorkflowRun,
      ownedArgs,
      {
        name: "claim_workflow",
      },
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

      const waitMs =
        result.blocker === "active_agent_action"
          ? Math.max(1, Math.min(result.retryAfterMs, 5_000))
          : 1_000;
      await step.sleep(waitMs, { name: `wait_for_active_work_${check}` });
    }

    for (let check = 0; check < MAX_QUIESCE_CHECKS; check += 1) {
      const result = await step.runMutation(
        internal.repositoryRefresh.quiesceForAccountDeletion,
        ownedArgs,
        { name: `quiesce_repository_refresh_${check}` },
      );

      if (result.state === "done") {
        break;
      }

      if (check === MAX_QUIESCE_CHECKS - 1) {
        throw new Error(SAFE_WORKFLOW_ERROR);
      }

      await step.sleep(1_000, { name: `wait_for_repository_refresh_${check}` });
    }

    if (
      initialOutcomes.billing.state === "not_started" ||
      initialOutcomes.billing.state === "failed"
    ) {
      await step.runMutation(
        internal.accountDeletion.workflow.appendRunEvent,
        {
          ...ownedArgs,
          step: "cancel_billing",
          level: "info",
          message: "Canceling Samebase billing.",
        },
        { name: "start_billing_cancellation" },
      );

      const billing = await step.runAction(
        internal.accountDeletion.billingActions.cancelForAccountDeletion,
        ownedArgs,
        { name: "cancel_billing", retry: false },
      );

      await step.runMutation(
        internal.accountDeletion.workflow.recordBillingOutcome,
        { ...ownedArgs, outcome: billing },
        { name: "record_billing_outcome" },
      );

      if (billing.state === "failed") {
        throw new Error(SAFE_WORKFLOW_ERROR);
      }
    }

    if (initialOutcomes.providerRevocation.state === "not_started") {
      await step.runMutation(
        internal.accountDeletion.workflow.appendRunEvent,
        {
          ...ownedArgs,
          step: "revoke_access",
          level: "info",
          message: "Revoking Samebase provider access.",
        },
        { name: "start_provider_revocation" },
      );

      let providerResult: RevokeProviderAccessResult = await step.runAction(
        internal.accountDeletion.providerActions.revokeForAccountDeletion,
        ownedArgs,
        { name: "revoke_provider_access_1", retry: false },
      );

      for (let attempt = 2; hasUnconfirmedProvider(providerResult) && attempt <= 3; attempt += 1) {
        await step.sleep(5_000, { name: `wait_for_provider_revocation_${attempt}` });

        const current = await step.runAction(
          internal.accountDeletion.providerActions.revokeForAccountDeletion,
          ownedArgs,
          { name: `revoke_provider_access_${attempt}`, retry: false },
        );

        providerResult = {
          github: mergeProviderResult(providerResult.github, current.github),
          cloudflare: mergeProviderResult(providerResult.cloudflare, current.cloudflare),
          convex: mergeProviderResult(providerResult.convex, current.convex),
        };
      }

      await step.runMutation(
        internal.accountDeletion.workflow.recordProviderOutcome,
        { ...ownedArgs, outcome: { state: "completed", ...providerResult } },
        { name: "record_provider_outcome" },
      );
    }

    for (let batch = 0; batch < MAX_BATCH_STEPS; batch += 1) {
      const done = await step.runMutation(
        internal.accountDeletion.workflow.deleteProviderConnections,
        ownedArgs,
        { name: `delete_provider_connections_${batch}` },
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
        step: "delete_samebase_data",
        level: "info",
        message: "Deleting Samebase account data.",
      },
      { name: "start_samebase_data_cleanup" },
    );
    await step.runMutation(internal.accountDeletion.cleanup.cleanupAgentComponentData, ownedArgs, {
      name: "delete_agent_component_data",
    });

    for (let check = 0; check < MAX_QUIESCE_CHECKS; check += 1) {
      const hasData = await step.runQuery(
        internal.accountDeletion.cleanup.hasAgentComponentData,
        ownedArgs,
        { name: `inspect_agent_component_data_${check}` },
      );

      if (!hasData) {
        break;
      }

      if (check === MAX_QUIESCE_CHECKS - 1) {
        throw new Error(SAFE_WORKFLOW_ERROR);
      }

      await step.sleep(5_000, { name: `wait_for_agent_component_data_${check}` });
    }

    if (args.dataDeletionProgress) {
      for (let batch = 0; batch < MAX_BATCH_STEPS; batch += 1) {
        const done = await step.runMutation(
          internal.accountDeletion.cleanup.cleanupDataDeletionGroupBatch,
          { ...ownedArgs, group: "chatsAndAgentData" },
          { name: `delete_chat_and_agent_data_${batch}` },
        );

        if (done) {
          break;
        }

        if (batch === MAX_BATCH_STEPS - 1) {
          throw new Error(SAFE_WORKFLOW_ERROR);
        }
      }

      await step.runMutation(internal.accountDeletion.cleanup.startVaultDataDeletion, ownedArgs, {
        name: "start_vault_data_cleanup",
      });
      for (let batch = 0; batch < MAX_BATCH_STEPS; batch += 1) {
        const done = await step.runMutation(
          internal.accountDeletion.cleanup.cleanupVaultDataDeletionBatch,
          ownedArgs,
          { name: `delete_vault_data_${batch}` },
        );

        if (done) {
          break;
        }

        if (batch === MAX_BATCH_STEPS - 1) {
          throw new Error(SAFE_WORKFLOW_ERROR);
        }
      }

      for (const group of [
        "connectedMachines",
        "preferences",
        "appAccessAndTokens",
        "accessRequestsAndHistory",
      ] as const) {
        for (let batch = 0; batch < MAX_BATCH_STEPS; batch += 1) {
          const done = await step.runMutation(
            internal.accountDeletion.cleanup.cleanupDataDeletionGroupBatch,
            { ...ownedArgs, group },
            { name: `delete_${group}_${batch}` },
          );

          if (done) {
            break;
          }

          if (batch === MAX_BATCH_STEPS - 1) {
            throw new Error(SAFE_WORKFLOW_ERROR);
          }
        }
      }
    } else {
      for (let batch = 0; batch < MAX_BATCH_STEPS; batch += 1) {
        const result = await step.runMutation(
          internal.accountDeletion.cleanup.cleanupAccountLocalDataBatch,
          ownedArgs,
          { name: `delete_samebase_data_${batch}` },
        );

        if (result.state === "done") {
          break;
        }

        if (result.state === "blocked" || batch === MAX_BATCH_STEPS - 1) {
          throw new Error(SAFE_WORKFLOW_ERROR);
        }
      }
    }

    const finalBilling = await step.runAction(
      internal.accountDeletion.billingActions.cancelForAccountDeletion,
      ownedArgs,
      { name: "recheck_billing_before_finalizing", retry: false },
    );

    await step.runMutation(
      internal.accountDeletion.workflow.recordBillingOutcome,
      { ...ownedArgs, outcome: finalBilling },
      { name: "record_final_billing_outcome" },
    );

    if (finalBilling.state === "failed") {
      throw new Error(SAFE_WORKFLOW_ERROR);
    }

    if (initialOutcomes.completionEmail.state === "not_started") {
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
        internal.accountDeletion.workflow.deleteProviderConnections,
        ownedArgs,
        { name: `reclean_provider_connections_${batch}` },
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
        internal.accountDeletion.authCleanup.deleteOtherSessionBatch,
        ownedArgs,
        { name: `delete_late_sessions_${batch}` },
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

    await step.runMutation(internal.accountDeletion.workflow.markFinalizing, ownedArgs, {
      name: "mark_finalizing",
    });

    await step.sleep(3_000, { name: "observe_finalizing" });

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

    const user = await ctx.db.get(run.identity.userId);

    if (user?.accountDeletion?.runId === run._id && user.accountDeletion.state === "finalizing") {
      await ctx.db.patch(user._id, {
        accountDeletion: {
          state: "deleting",
          runId: run._id,
          requestedAt: run.requestedAt,
        },
      });
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
      dataDeletion: run.dataDeletion,
      latestSafeError: SAFE_WORKFLOW_ERROR,
      updatedAt: now,
    });

    await ctx.db.insert("accountDeletionEvents", {
      runId: run._id,
      step: run.currentStep,
      level: "error",
      message: SAFE_WORKFLOW_ERROR,
      createdAt: now,
    });

    return null;
  },
});
