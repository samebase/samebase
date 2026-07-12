import { getAuthSessionId } from "@convex-dev/auth/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../functions";
import { isAdminUser } from "../userAccess";
import {
  vAccountDeletionEventLevel,
  vAccountDeletionOutcomeSummary,
  vAccountDeletionStep,
} from "./model";
import { startAccountDeletionWorkflow } from "./workflow";

const { array, id, literal, number, object, optional, string, union } = v;

const vAccountDeletionRunState = union(
  literal("queued"),
  literal("running"),
  literal("needs_attention"),
  literal("succeeded"),
);

const vAccountDeletionMarkerPhase = union(literal("deleting"), literal("finalizing"));

const vAccountDeletionStatus = object({
  runId: id("accountDeletionRuns"),
  state: vAccountDeletionRunState,
  markerPhase: vAccountDeletionMarkerPhase,
  currentStep: vAccountDeletionStep,
  requestedAt: number(),
  latestProgressAt: number(),
});

const vAccountDeletionEvent = object({
  step: vAccountDeletionStep,
  level: vAccountDeletionEventLevel,
  message: string(),
  createdAt: number(),
});

const vAdminAccountDeletionListItem = object({
  runId: id("accountDeletionRuns"),
  state: vAccountDeletionRunState,
  currentStep: vAccountDeletionStep,
  requestedAt: number(),
  latestProgressAt: number(),
  retryCount: number(),
  outcomes: vAccountDeletionOutcomeSummary,
  email: optional(string()),
  latestSafeError: optional(string()),
  completedAt: optional(number()),
});

function projectStatus(run: Doc<"accountDeletionRuns">, markerPhase: "deleting" | "finalizing") {
  return {
    runId: run._id,
    state: run.state,
    markerPhase,
    currentStep: run.currentStep,
    requestedAt: run.requestedAt,
    latestProgressAt: run.updatedAt,
  };
}

function projectAdminListItem(run: Doc<"accountDeletionRuns">) {
  return {
    runId: run._id,
    state: run.state,
    currentStep: run.currentStep,
    requestedAt: run.requestedAt,
    latestProgressAt: run.updatedAt,
    retryCount: run.retryCount,
    outcomes: run.outcomes,
    ...(run.identity.state === "active" ? { email: run.identity.email } : {}),
    ...(run.state === "needs_attention" ? { latestSafeError: run.latestSafeError } : {}),
    ...(run.state === "succeeded" ? { completedAt: run.completedAt } : {}),
  };
}

export const request = mutation({
  access: "access_account_deletion",
  args: {},
  returns: vAccountDeletionStatus,
  handler: async (ctx) => {
    if (isAdminUser(ctx.viewer.user.email)) {
      throw new Error("Staff accounts cannot request account deletion.");
    }

    const existingMarker = ctx.viewer.user.accountDeletion;
    if (existingMarker !== undefined) {
      const existingRun = await ctx.db.get(existingMarker.runId);
      if (
        existingRun === null ||
        existingRun.identity.state !== "active" ||
        existingRun.identity.userId !== ctx.viewer.userId
      ) {
        throw new Error("Account deletion state is inconsistent.");
      }
      return projectStatus(existingRun, existingMarker.state);
    }

    const initiatingSessionId = await getAuthSessionId(ctx);
    if (initiatingSessionId === null) {
      throw new Error("Authentication session is required to delete an account.");
    }

    const now = Date.now();
    const runId = await ctx.db.insert("accountDeletionRuns", {
      identity: {
        state: "active",
        userId: ctx.viewer.userId,
        email: ctx.viewer.user.email,
      },
      state: "queued",
      workflow: { state: "not_started" },
      currentStep: "request_accepted",
      requestedAt: now,
      updatedAt: now,
      initiatingSessionId,
      retryCount: 0,
      outcomes: {
        billing: { state: "not_started" },
        providerRevocation: { state: "not_started" },
        completionEmail: { state: "not_started" },
      },
    });
    await ctx.db.insert("accountDeletionEvents", {
      runId,
      step: "request_accepted",
      level: "info",
      message: "Account deletion was requested.",
      createdAt: now,
    });
    await ctx.db.patch(ctx.viewer.userId, {
      accountDeletion: {
        state: "deleting",
        runId,
        requestedAt: now,
      },
    });
    const workflowId = await startAccountDeletionWorkflow(ctx, runId);
    await ctx.db.replace(runId, {
      identity: {
        state: "active",
        userId: ctx.viewer.userId,
        email: ctx.viewer.user.email,
      },
      state: "running",
      workflow: { state: "started", workflowId, attempt: 1 },
      currentStep: "request_accepted",
      requestedAt: now,
      updatedAt: now,
      initiatingSessionId,
      retryCount: 0,
      outcomes: {
        billing: { state: "not_started" },
        providerRevocation: { state: "not_started" },
        completionEmail: { state: "not_started" },
      },
    });

    const run = await ctx.db.get(runId);
    if (run === null) {
      throw new Error("Account deletion run was not created.");
    }
    return projectStatus(run, "deleting");
  },
});

export const retry = mutation({
  access: "access_admin",
  args: { runId: id("accountDeletionRuns") },
  returns: vAccountDeletionStatus,
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null || run.identity.state !== "active" || run.state !== "needs_attention") {
      throw new Error("Account deletion run is not retryable.");
    }
    const user = await ctx.db.get(run.identity.userId);
    if (user === null || user.accountDeletion?.runId !== run._id) {
      throw new Error("Account deletion marker is inconsistent.");
    }

    const workflowId = await startAccountDeletionWorkflow(ctx, run._id);
    const now = Date.now();
    const retryCount = run.retryCount + 1;
    await ctx.db.replace(run._id, {
      identity: run.identity,
      state: "running",
      workflow: {
        state: "started",
        workflowId,
        attempt: run.workflow.attempt + 1,
      },
      currentStep: run.currentStep,
      requestedAt: run.requestedAt,
      updatedAt: now,
      initiatingSessionId: run.initiatingSessionId,
      retryCount,
      outcomes: run.outcomes,
    });
    await ctx.db.patch(user._id, {
      accountDeletion: {
        state: "deleting",
        runId: run._id,
        requestedAt: run.requestedAt,
      },
    });
    await ctx.db.insert("accountDeletionEvents", {
      runId: run._id,
      step: run.currentStep,
      level: "info",
      message: "Staff retried account deletion.",
      createdAt: now,
    });

    const retried = await ctx.db.get(run._id);
    if (retried === null) {
      throw new Error("Account deletion run was not restarted.");
    }
    return projectStatus(retried, "deleting");
  },
});

export const status = query({
  access: "access_account_deletion",
  args: {},
  returns: union(v.null(), vAccountDeletionStatus),
  handler: async (ctx) => {
    const marker = ctx.viewer.user.accountDeletion;
    if (marker === undefined) {
      return null;
    }
    const run = await ctx.db.get(marker.runId);
    if (
      run === null ||
      run.identity.state !== "active" ||
      run.identity.userId !== ctx.viewer.userId
    ) {
      throw new Error("Account deletion state is inconsistent.");
    }
    return projectStatus(run, marker.state);
  },
});

export const listForAdmin = query({
  access: "access_admin",
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(vAdminAccountDeletionListItem),
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("accountDeletionRuns")
      .withIndex("by_updated_at")
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...runs,
      page: runs.page.map(projectAdminListItem),
    };
  },
});

export const detailForAdmin = query({
  access: "access_admin",
  args: {
    runId: id("accountDeletionRuns"),
  },
  returns: union(
    v.null(),
    object({
      run: vAdminAccountDeletionListItem,
      events: array(vAccountDeletionEvent),
    }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null) {
      return null;
    }
    const events = await ctx.db
      .query("accountDeletionEvents")
      .withIndex("by_run_and_created_at", (q) => q.eq("runId", args.runId))
      .order("desc")
      .take(100);
    return {
      run: projectAdminListItem(run),
      events: events.reverse().map(({ step, level, message, createdAt }) => ({
        step,
        level,
        message,
        createdAt,
      })),
    };
  },
});
