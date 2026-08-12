import { getAuthSessionId } from "@convex-dev/auth/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import { ACCOUNT_DELETION_CONFIRMATION_PHRASE } from "../../shared/accountDeletionPhrase";
import { mutation, query } from "../functions";
import { isAdminUser } from "../userAccess";
import { readUserProfile } from "../userLifecycle";
import {
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

const vAccountDeletionStatus = object({
  runId: id("workflow_accountDeletion_runs"),
  completionCapability: string(),
  state: vActiveAccountDeletionRunState,
  currentStep: vAccountDeletionStep,
  requestedAt: number(),
  latestProgressAt: number(),
});

const vAccountDeletionRequestResult = union(
  object({ state: literal("accepted"), status: vAccountDeletionStatus }),
  object({ state: literal("confirmation_mismatch") }),
);

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
  runId: id("workflow_accountDeletion_runs"),
  state: vAccountDeletionRunState,
  currentStep: vAccountDeletionStep,
  requestedAt: number(),
  latestProgressAt: number(),
  retryCount: number(),
  outcomes: vAccountDeletionOutcomeSummary,
  email: optional(string()),
  latestSafeError: optional(string()),
  completedAt: optional(number()),
};

const vAdminAccountDeletionListItem = object(adminAccountDeletionFields);

function projectStatus(run: Doc<"workflow_accountDeletion_runs">) {
  if (run.state === "succeeded") {
    throw new Error("Account deletion completion state is inconsistent.");
  }

  return {
    runId: run._id,
    completionCapability: run.completionCapability,
    state: run.state,
    currentStep: run.currentStep,
    requestedAt: run.requestedAt,
    latestProgressAt: run.updatedAt,
  };
}

function projectAdminListItem(run: Doc<"workflow_accountDeletion_runs">) {
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
  args: {
    completionCapability: string(),
    confirmationPhrase: string(),
  },
  returns: vAccountDeletionRequestResult,
  handler: async (ctx, args) => {
    if (isAdminUser(ctx.viewer.user.email)) {
      throw new Error("Staff accounts cannot request account deletion.");
    }

    if (ctx.viewer.user.state !== "active") {
      const existingRun = await ctx.db.get(ctx.viewer.user.runId);
      if (
        existingRun === null ||
        existingRun.identity.state !== "active" ||
        existingRun.identity.userId !== ctx.viewer.userId
      ) {
        throw new Error("Account deletion state is inconsistent.");
      }
      return { state: "accepted" as const, status: projectStatus(existingRun) };
    }

    if (args.confirmationPhrase !== ACCOUNT_DELETION_CONFIRMATION_PHRASE) {
      return { state: "confirmation_mismatch" as const };
    }

    const initiatingSessionId = await getAuthSessionId(ctx);
    if (initiatingSessionId === null) {
      throw new Error("Authentication session is required to delete an account.");
    }
    if (!/^[0-9a-f]{64}$/.test(args.completionCapability)) {
      throw new Error("Account deletion completion capability is invalid.");
    }

    const existingCapability = await ctx.db
      .query("workflow_accountDeletion_runs")
      .withIndex("by_completion_capability", (query) =>
        query.eq("completionCapability", args.completionCapability),
      )
      .unique();
    if (existingCapability !== null) {
      throw new Error("Account deletion completion capability is already in use.");
    }

    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (query) => query.eq("userId", ctx.viewer.userId))
      .first();
    if (membership !== null) {
      const organization = await ctx.db.get(membership.organizationId);
      if (organization === null) {
        throw new Error("Organization membership refers to a missing organization.");
      }
      throw new ConvexError(
        `Leave or delete the ${organization.githubOwnerLogin} organization before you delete your account.`,
      );
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
        providerRevocation: { state: "not_started" },
        completionEmail: { state: "not_started" },
      },
    } as const;

    const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
      ...activeRunFields,
      state: "queued",
      workflow: { state: "not_started" },
    });
    await ctx.db.insert("workflow_accountDeletion_events", {
      runId,
      step: "request_accepted",
      level: "info",
      message: "Account deletion was requested.",
      createdAt: now,
    });
    await ctx.db.replace(ctx.viewer.userId, {
      state: "deleting",
      ...readUserProfile(ctx.viewer.user),
      runId,
      requestedAt: now,
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
    return { state: "accepted" as const, status: projectStatus(run) };
  },
});

export const retry = mutation({
  access: "access_admin",
  args: { runId: id("workflow_accountDeletion_runs") },
  returns: vAccountDeletionStatus,
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null || run.identity.state !== "active" || run.state !== "needs_attention") {
      throw new Error("Account deletion run is not retryable.");
    }

    const user = await ctx.db.get(run.identity.userId);
    if (user === null) {
      throw new Error("Account deletion marker is inconsistent.");
    }
    if (user.state !== "deleting" || user.runId !== run._id) {
      throw new Error("Account deletion marker is inconsistent.");
    }

    const workflowId = await startAccountDeletionWorkflow(ctx, run._id);
    const now = Date.now();
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
      retryCount: run.retryCount + 1,
      outcomes: run.outcomes,
    });
    await ctx.db.insert("workflow_accountDeletion_events", {
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
    return projectStatus(retried);
  },
});

export const status = query({
  access: "access_account_deletion",
  args: {},
  returns: union(v.null(), vAccountDeletionStatus),
  handler: async (ctx) => {
    if (ctx.viewer.user.state === "active") {
      return null;
    }

    const run = await ctx.db.get(ctx.viewer.user.runId);
    if (
      run === null ||
      run.identity.state !== "active" ||
      run.identity.userId !== ctx.viewer.userId
    ) {
      throw new Error("Account deletion state is inconsistent.");
    }
    return projectStatus(run);
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
      .query("workflow_accountDeletion_runs")
      .withIndex("by_completion_capability", (query) =>
        query.eq("completionCapability", args.completionCapability),
      )
      .unique();
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
      .query("workflow_accountDeletion_runs")
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
    runId: id("workflow_accountDeletion_runs"),
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
      .query("workflow_accountDeletion_events")
      .withIndex("by_run_and_created_at", (query) => query.eq("runId", args.runId))
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
