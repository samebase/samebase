import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  type ActionCtx,
  type MutationCtx,
} from "../_generated/server";
import { createPolarClient } from "../polarClient";
import {
  createPolarOrganizationDeletionClient,
  OrganizationDeletionAttentionError,
  performPolarOrganizationDeletionStep,
} from "./providerActions";
import { appendOrganizationDeletionEvent } from "./events";
import { readOwnedActiveRun } from "./stepContext";

const SAFE_WORKFLOW_ERROR = "Organization deletion needs staff attention.";
const MAX_QUIESCENCE_CHECKS = 1_200;
const MAX_PROVIDER_STEPS = 128;
const MAX_LOCAL_CLEANUP_BATCHES = 2_048;
const POLAR_CHECKOUT_RECHECK_DELAY_MS = 30_000;
const QUIESCENCE_RECHECK_DELAY_MS = 5_000;
const EXECUTION_WATCHDOG_INTERVAL_MS = 60_000;
const MAX_AUTOMATIC_STALE_RESTARTS = 1;
// A Convex upload URL from the deployment before organization deletion can stay valid for one
// hour, and its upload can run for two more minutes. This settling period also exceeds the
// 30-minute action limit, so old untracked authorization cannot cross local cleanup.
export const ORGANIZATION_DELETION_AUTHORIZATION_SETTLE_MS = 65 * 60_000;
// A default Convex action can run for 30 minutes. The watchdog must not start
// a second provider cleanup while the first action can still be running.
export const ORGANIZATION_DELETION_STALE_EXECUTION_MS = 35 * 60_000;
const { id, number, string } = v;

type ExecutionArgs = {
  runId: Id<"workflow_organizationDeletion_runs">;
  executionAttempt: number;
  quiescenceChecks: number;
  providerSteps: number;
  cleanupBatches: number;
};

export async function scheduleOrganizationDeletion(
  ctx: Pick<MutationCtx, "scheduler">,
  args: {
    runId: Id<"workflow_organizationDeletion_runs">;
    executionAttempt: number;
  },
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.organizationDeletion.executor.advance, {
    runId: args.runId,
    executionAttempt: args.executionAttempt,
    quiescenceChecks: 0,
    providerSteps: 0,
    cleanupBatches: 0,
  });
  await ctx.scheduler.runAfter(
    EXECUTION_WATCHDOG_INTERVAL_MS,
    internal.organizationDeletion.executor.restartStaleExecution,
    {
      runId: args.runId,
      executionAttempt: args.executionAttempt,
    },
  );
}

async function scheduleAdvance(
  ctx: Pick<ActionCtx, "scheduler">,
  args: ExecutionArgs,
  delayMs: number,
): Promise<void> {
  await ctx.scheduler.runAfter(delayMs, internal.organizationDeletion.executor.advance, {
    runId: args.runId,
    executionAttempt: args.executionAttempt,
    quiescenceChecks: args.quiescenceChecks,
    providerSteps: args.providerSteps,
    cleanupBatches: args.cleanupBatches,
  });
}

export const recordPolarCustomerIdentity = internalMutation({
  args: {
    runId: id("workflow_organizationDeletion_runs"),
    executionAttempt: number(),
    customerId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    if (run.providerCleanup.state === "completed") {
      return null;
    }
    if (run.providerCleanup.state === "customer_identified") {
      if (run.providerCleanup.customerId !== args.customerId) {
        throw new Error("Polar Customer identity changed during deletion.");
      }
      return null;
    }
    if (run.providerCleanup.state !== "pending_customer_lookup") {
      throw new Error("Polar Customer lookup is not active.");
    }
    await ctx.db.patch(run._id, {
      providerCleanup: {
        state: "customer_identified",
        externalCustomerId: run.providerCleanup.externalCustomerId,
        customerId: args.customerId,
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const recordExecutionHeartbeat = internalMutation({
  args: {
    runId: id("workflow_organizationDeletion_runs"),
    executionAttempt: number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    await ctx.db.patch(run._id, { updatedAt: Date.now() });
    return null;
  },
});

export const restartStaleExecution = internalMutation({
  args: {
    runId: id("workflow_organizationDeletion_runs"),
    executionAttempt: number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null || run.state !== "running" || run.executionAttempt !== args.executionAttempt) {
      return false;
    }
    const organization = await ctx.db.get(run.organization.organizationId);
    if (
      organization === null ||
      organization.deletion?.state !== "deleting" ||
      organization.deletion.runId !== run._id
    ) {
      return false;
    }

    const now = Date.now();
    if (now - run.updatedAt < ORGANIZATION_DELETION_STALE_EXECUTION_MS) {
      await ctx.scheduler.runAfter(
        EXECUTION_WATCHDOG_INTERVAL_MS,
        internal.organizationDeletion.executor.restartStaleExecution,
        {
          runId: args.runId,
          executionAttempt: args.executionAttempt,
        },
      );
      return false;
    }

    if (run.automaticRestartCount >= MAX_AUTOMATIC_STALE_RESTARTS) {
      const safeError = "Organization deletion stopped repeatedly and needs staff attention.";
      await ctx.db.patch(run._id, {
        state: "needs_attention",
        latestSafeError: safeError,
        updatedAt: now,
      });
      await ctx.db.patch(organization._id, {
        deletion: { state: "delete_failed", runId: run._id, failedAt: now },
      });
      await appendOrganizationDeletionEvent(ctx, {
        runId: run._id,
        step: run.currentStep,
        level: "error",
        message: safeError,
        createdAt: now,
      });
      return false;
    }

    const executionAttempt = run.executionAttempt + 1;
    await ctx.db.patch(run._id, {
      executionAttempt,
      automaticRestartCount: run.automaticRestartCount + 1,
      updatedAt: now,
    });
    await appendOrganizationDeletionEvent(ctx, {
      runId: run._id,
      step: run.currentStep,
      level: "warning",
      message: "Restarting a stopped organization deletion step.",
      createdAt: now,
    });
    await scheduleOrganizationDeletion(ctx, { runId: run._id, executionAttempt });
    return true;
  },
});

export const recordPolarCleanupCompleted = internalMutation({
  args: {
    runId: id("workflow_organizationDeletion_runs"),
    executionAttempt: number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    if (run.providerCleanup.state === "not_required") {
      return null;
    }
    if (run.providerCleanup.state === "completed") {
      return null;
    }
    await ctx.db.patch(run._id, {
      providerCleanup: {
        state: "completed",
        externalCustomerId: run.providerCleanup.externalCustomerId,
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const beginSamebaseDataCleanup = internalMutation({
  args: {
    runId: id("workflow_organizationDeletion_runs"),
    executionAttempt: number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    if (run.currentStep === "delete_samebase_data") {
      return true;
    }
    if (run.currentStep !== "stop_billing") {
      throw new Error("Billing cleanup step is not active.");
    }
    if (run.providerCleanup.state !== "not_required" && run.providerCleanup.state !== "completed") {
      throw new Error("Polar cleanup is not complete.");
    }
    const now = Date.now();
    if (now < run.requestedAt + ORGANIZATION_DELETION_AUTHORIZATION_SETTLE_MS) {
      return false;
    }
    await ctx.db.patch(run._id, {
      currentStep: "delete_samebase_data",
      updatedAt: now,
    });
    await appendOrganizationDeletionEvent(ctx, {
      runId: run._id,
      step: "delete_samebase_data",
      level: "info",
      message: "Deleting Samebase organization data.",
      createdAt: now,
    });
    return true;
  },
});

export const markNeedsAttention = internalMutation({
  args: {
    runId: id("workflow_organizationDeletion_runs"),
    executionAttempt: number(),
    safeError: string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null || run.state !== "running" || run.executionAttempt !== args.executionAttempt) {
      return false;
    }
    const organization = await ctx.db.get(run.organization.organizationId);
    if (
      organization === null ||
      organization.deletion?.state !== "deleting" ||
      organization.deletion.runId !== run._id
    ) {
      return false;
    }
    const now = Date.now();
    await ctx.db.patch(run._id, {
      state: "needs_attention",
      latestSafeError: args.safeError,
      updatedAt: now,
    });
    await ctx.db.patch(organization._id, {
      deletion: { state: "delete_failed", runId: run._id, failedAt: now },
    });
    await appendOrganizationDeletionEvent(ctx, {
      runId: run._id,
      step: run.currentStep,
      level: "error",
      message: args.safeError,
      createdAt: now,
    });
    return true;
  },
});

export const advance = internalAction({
  args: {
    runId: id("workflow_organizationDeletion_runs"),
    executionAttempt: number(),
    quiescenceChecks: number(),
    providerSteps: number(),
    cleanupBatches: number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const executionIdentity = {
      runId: args.runId,
      executionAttempt: args.executionAttempt,
    };
    const execution = await ctx.runQuery(internal.organizationDeletion.stepContext.getExecution, {
      runId: executionIdentity.runId,
      executionAttempt: executionIdentity.executionAttempt,
    });
    if (execution === null) {
      return null;
    }

    try {
      await ctx.runMutation(internal.organizationDeletion.executor.recordExecutionHeartbeat, {
        runId: executionIdentity.runId,
        executionAttempt: executionIdentity.executionAttempt,
      });
      if (
        execution.currentStep === "request_accepted" ||
        execution.currentStep === "wait_for_active_work"
      ) {
        const result = await ctx.runMutation(
          internal.organizationDeletion.cleanup.inspectQuiescence,
          {
            runId: executionIdentity.runId,
            executionAttempt: executionIdentity.executionAttempt,
          },
        );
        if (result.state === "waiting") {
          if (args.quiescenceChecks >= MAX_QUIESCENCE_CHECKS - 1) {
            throw new OrganizationDeletionAttentionError(
              "Active Samebase work did not stop before organization deletion.",
            );
          }
          await scheduleAdvance(
            ctx,
            {
              runId: args.runId,
              executionAttempt: args.executionAttempt,
              quiescenceChecks: args.quiescenceChecks + 1,
              providerSteps: args.providerSteps,
              cleanupBatches: args.cleanupBatches,
            },
            QUIESCENCE_RECHECK_DELAY_MS,
          );
          return null;
        }
        await scheduleAdvance(ctx, args, 0);
        return null;
      }

      if (execution.currentStep === "stop_billing") {
        if (
          execution.providerCleanup.state === "not_required" ||
          execution.providerCleanup.state === "completed"
        ) {
          const cleanupStarted = await ctx.runMutation(
            internal.organizationDeletion.executor.beginSamebaseDataCleanup,
            {
              runId: executionIdentity.runId,
              executionAttempt: executionIdentity.executionAttempt,
            },
          );
          if (!cleanupStarted) {
            if (args.quiescenceChecks >= MAX_QUIESCENCE_CHECKS - 1) {
              throw new OrganizationDeletionAttentionError(
                "Pre-deployment Samebase work did not settle before organization deletion.",
              );
            }
            await scheduleAdvance(
              ctx,
              {
                runId: args.runId,
                executionAttempt: args.executionAttempt,
                quiescenceChecks: args.quiescenceChecks + 1,
                providerSteps: args.providerSteps,
                cleanupBatches: args.cleanupBatches,
              },
              QUIESCENCE_RECHECK_DELAY_MS,
            );
            return null;
          }
          await scheduleAdvance(ctx, args, 0);
          return null;
        }
        if (args.providerSteps >= MAX_PROVIDER_STEPS) {
          throw new OrganizationDeletionAttentionError(
            "Polar billing cleanup exceeded its safe step limit.",
          );
        }
        const result = await performPolarOrganizationDeletionStep(
          createPolarOrganizationDeletionClient(createPolarClient()),
          execution.providerCleanup,
        );
        if (result.state === "customer_identified") {
          await ctx.runMutation(
            internal.organizationDeletion.executor.recordPolarCustomerIdentity,
            {
              runId: executionIdentity.runId,
              executionAttempt: executionIdentity.executionAttempt,
              customerId: result.customerId,
            },
          );
          await scheduleAdvance(
            ctx,
            {
              runId: args.runId,
              executionAttempt: args.executionAttempt,
              quiescenceChecks: args.quiescenceChecks,
              providerSteps: args.providerSteps + 1,
              cleanupBatches: args.cleanupBatches,
            },
            0,
          );
          return null;
        }
        if (result.state === "needs_more") {
          await scheduleAdvance(
            ctx,
            {
              runId: args.runId,
              executionAttempt: args.executionAttempt,
              quiescenceChecks: args.quiescenceChecks,
              providerSteps: args.providerSteps + 1,
              cleanupBatches: args.cleanupBatches,
            },
            0,
          );
          return null;
        }
        if (result.state === "waiting_for_checkout") {
          await scheduleAdvance(
            ctx,
            {
              runId: args.runId,
              executionAttempt: args.executionAttempt,
              quiescenceChecks: args.quiescenceChecks,
              providerSteps: args.providerSteps + 1,
              cleanupBatches: args.cleanupBatches,
            },
            POLAR_CHECKOUT_RECHECK_DELAY_MS,
          );
          return null;
        }
        await ctx.runMutation(internal.organizationDeletion.executor.recordPolarCleanupCompleted, {
          runId: executionIdentity.runId,
          executionAttempt: executionIdentity.executionAttempt,
        });
        await ctx.runMutation(internal.organizationDeletion.executor.beginSamebaseDataCleanup, {
          runId: executionIdentity.runId,
          executionAttempt: executionIdentity.executionAttempt,
        });
        await scheduleAdvance(ctx, args, 0);
        return null;
      }

      if (execution.currentStep === "delete_samebase_data") {
        if (args.cleanupBatches >= MAX_LOCAL_CLEANUP_BATCHES) {
          throw new OrganizationDeletionAttentionError(
            "Samebase data cleanup exceeded its safe batch limit.",
          );
        }
        const done = await ctx.runMutation(
          internal.organizationDeletion.cleanup.cleanupOrganizationDataBatch,
          {
            runId: executionIdentity.runId,
            executionAttempt: executionIdentity.executionAttempt,
          },
        );
        if (!done) {
          await scheduleAdvance(
            ctx,
            {
              runId: args.runId,
              executionAttempt: args.executionAttempt,
              quiescenceChecks: args.quiescenceChecks,
              providerSteps: args.providerSteps,
              cleanupBatches: args.cleanupBatches + 1,
            },
            0,
          );
        }
        return null;
      }

      throw new Error("Organization deletion execution reached an invalid step.");
    } catch (error) {
      const safeError =
        error instanceof OrganizationDeletionAttentionError ? error.message : SAFE_WORKFLOW_ERROR;
      console.error("organization_deletion:execution_failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      await ctx.runMutation(internal.organizationDeletion.executor.markNeedsAttention, {
        runId: args.runId,
        executionAttempt: args.executionAttempt,
        safeError,
      });
      return null;
    }
  },
});
