import { getAuthSessionId } from "@convex-dev/auth/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../functions";
import { isAdminUser } from "../userAccess";
import {
  INITIAL_ACCOUNT_DELETION_DATA_PROGRESS,
  vAccountDeletionDataProgress,
  vAccountDeletionEventLevel,
  vAccountDeletionOutcomeSummary,
  vAccountDeletionStep,
} from "./model";
import { startAccountDeletionWorkflow } from "./workflow";

const { array, id, literal, number, object, optional, string, union } = v;

const vActiveAccountDeletionRunState = union(
  literal("queued"),
  literal("running"),
  literal("needs_attention"),
);

const vAccountDeletionRunState = union(
  literal("queued"),
  literal("running"),
  literal("needs_attention"),
  literal("succeeded"),
);

const vAccountDeletionMarkerPhase = union(literal("deleting"), literal("finalizing"));

const vAccountDeletionStatus = object({
  runId: id("accountDeletionRuns"),
  completionCapability: string(),
  state: vActiveAccountDeletionRunState,
  markerPhase: vAccountDeletionMarkerPhase,
  currentStep: vAccountDeletionStep,
  requestedAt: number(),
  latestProgressAt: number(),
  dataDeletion: union(
    vAccountDeletionDataProgress,
    object({ state: literal("legacy_unavailable") }),
  ),
});

const vAccountDeletionEvent = object({
  step: vAccountDeletionStep,
  level: vAccountDeletionEventLevel,
  message: string(),
  createdAt: number(),
});

const vAccountDeletionCompletion = object({
  state: literal("succeeded"),
  completedAt: number(),
});

const adminAccountDeletionFields = {
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
} as const;
const vAdminAccountDeletionListItem = object(adminAccountDeletionFields);
const vAdminAccountDeletionDetail = object({
  ...adminAccountDeletionFields,
  dataDeletion: union(
    vAccountDeletionDataProgress,
    object({ state: literal("legacy_unavailable") }),
    object({ state: literal("receipt_scrubbed") }),
  ),
});

function projectStatus(run: Doc<"accountDeletionRuns">, markerPhase: "deleting" | "finalizing") {
  if (run.state === "succeeded") {
    throw new Error("Account deletion completion state is inconsistent.");
  }
  return {
    runId: run._id,
    completionCapability: run.completionCapability,
    state: run.state,
    markerPhase,
    currentStep: run.currentStep,
    requestedAt: run.requestedAt,
    latestProgressAt: run.updatedAt,
    dataDeletion: run.dataDeletion ?? { state: "legacy_unavailable" as const },
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

function projectAdminDetail(run: Doc<"accountDeletionRuns">) {
  const dataDeletion =
    run.state === "succeeded"
      ? ({ state: "receipt_scrubbed" } as const)
      : (run.dataDeletion ?? ({ state: "legacy_unavailable" } as const));
  return {
    ...projectAdminListItem(run),
    dataDeletion,
  };
}

export const request = mutation({
  access: "access_account_deletion",
  args: { completionCapability: string() },
  returns: vAccountDeletionStatus,
  handler: async (ctx, args) => {
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

    if (!/^[0-9a-f]{64}$/.test(args.completionCapability)) {
      throw new Error("Account deletion completion capability is invalid.");
    }
    const existingCapability = await ctx.db
      .query("accountDeletionRuns")
      .withIndex("by_completion_capability", (query) =>
        query.eq("completionCapability", args.completionCapability),
      )
      .first();
    if (existingCapability !== null) {
      throw new Error("Account deletion completion capability is already in use.");
    }

    const now = Date.now();
    const activeRunFields = {
      identity: {
        state: "active",
        userId: ctx.viewer.userId,
        email: ctx.viewer.user.email,
      },
      completionCapability: args.completionCapability,
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
      dataDeletion: INITIAL_ACCOUNT_DELETION_DATA_PROGRESS,
    } as const;
    const runId = await ctx.db.insert("accountDeletionRuns", {
      ...activeRunFields,
      state: "queued",
      workflow: { state: "not_started" },
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
      ...activeRunFields,
      state: "running",
      workflow: { state: "started", workflowId, attempt: 1 },
    });

    const run = await ctx.db.get(runId);
    if (run === null || run.identity.state !== "active") {
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
      completionCapability: run.completionCapability,
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
      dataDeletion: run.dataDeletion,
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

export const completion = query({
  access: "access_public",
  args: { completionCapability: string() },
  returns: union(v.null(), vAccountDeletionCompletion),
  handler: async (ctx, args) => {
    if (!/^[0-9a-f]{64}$/.test(args.completionCapability)) {
      return null;
    }
    const run = await ctx.db
      .query("accountDeletionRuns")
      .withIndex("by_completion_capability", (query) =>
        query.eq("completionCapability", args.completionCapability),
      )
      .first();
    if (run === null || run.identity.state !== "scrubbed" || run.state !== "succeeded") {
      return null;
    }
    return { state: run.state, completedAt: run.completedAt };
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
      run: vAdminAccountDeletionDetail,
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
      run: projectAdminDetail(run),
      events: events.reverse().map(({ step, level, message, createdAt }) => ({
        step,
        level,
        message,
        createdAt,
      })),
    };
  },
});
