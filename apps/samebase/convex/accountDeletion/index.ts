import { getAuthSessionId } from "@convex-dev/auth/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { type Infer, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { env, internalMutation, type MutationCtx } from "../_generated/server";
import { ACCOUNT_DELETION_CONFIRMATION_PHRASE } from "../../shared/accountDeletionPhrase";
import { mutation, query } from "../functions";
import { isAdminUser } from "../userAccess";
import { readUserProfile } from "../userLifecycle";
import {
  readRepositoryWriteMode,
  requireRepositoryOperationStart,
} from "../repositoryMigration/maintenance";
import {
  vAccountDeletionEventLevel,
  vAccountDeletionOutcomeSummary,
  vAccountDeletionStep,
} from "./model";
import { startAccountDeletionWorkflow } from "./workflow";

const { array, boolean, id, literal, number, object, optional, string, union } = v;

const ACCOUNT_DELETION_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1_000;

const vAccountDeletionStartMode = union(literal("seven_days"), literal("immediate"));
type AccountDeletionStartMode = Infer<typeof vAccountDeletionStartMode>;

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
  deletionStartsAt: number(),
  latestProgressAt: number(),
});

const vAccountDeletionRequestResult = union(
  object({ state: literal("accepted"), status: vAccountDeletionStatus }),
  object({ state: literal("confirmation_mismatch") }),
  object({ state: literal("organization_membership_exists") }),
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
  deletionStartsAt: number(),
  latestProgressAt: number(),
  retryCount: number(),
  outcomes: vAccountDeletionOutcomeSummary,
  email: optional(string()),
  latestSafeError: optional(string()),
  completedAt: optional(number()),
};

const vAdminAccountDeletionListItem = object(adminAccountDeletionFields);

const vAdminUserListItem = object({
  userId: id("users"),
  email: optional(string()),
  state: union(literal("active"), literal("deleting"), literal("deleted")),
  isApproved: boolean(),
  isCurrentUser: boolean(),
  providers: array(string()),
  createdAt: number(),
});

function resolveAccountDeletionStartMode(): AccountDeletionStartMode {
  return env.ACCOUNT_DELETION_GRACE_PERIOD_MS === "0" ? "immediate" : "seven_days";
}

function readDeletionStartsAt(run: Doc<"workflow_accountDeletion_runs">): number {
  return run.deletionStartsAt ?? run.requestedAt + ACCOUNT_DELETION_GRACE_PERIOD_MS;
}

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
    deletionStartsAt: readDeletionStartsAt(run),
    latestProgressAt: run.updatedAt,
  };
}

function projectAdminListItem(run: Doc<"workflow_accountDeletion_runs">) {
  return {
    runId: run._id,
    state: run.state,
    currentStep: run.currentStep,
    requestedAt: run.requestedAt,
    deletionStartsAt: readDeletionStartsAt(run),
    latestProgressAt: run.updatedAt,
    retryCount: run.retryCount,
    outcomes: run.outcomes,
    ...(run.identity.state === "active" ? { email: run.identity.email } : {}),
    ...(run.state === "needs_attention" ? { latestSafeError: run.latestSafeError } : {}),
    ...(run.state === "succeeded" ? { completedAt: run.completedAt } : {}),
  };
}

async function queueAccountDeletion(
  ctx: MutationCtx,
  args: {
    completionCapability: string;
    deletionStartMode: AccountDeletionStartMode;
    eventMessage: string;
    initiatingSessionId?: Id<"authSessions">;
    user: Extract<Doc<"users">, { state: "active" }>;
  },
) {
  await requireRepositoryOperationStart(ctx);
  if (args.deletionStartMode !== resolveAccountDeletionStartMode()) {
    throw new Error("Account deletion policy changed. Review the current deletion terms.");
  }

  const now = Date.now();
  const deletionStartsAt =
    now + (args.deletionStartMode === "immediate" ? 0 : ACCOUNT_DELETION_GRACE_PERIOD_MS);
  const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
    identity: {
      state: "active",
      userId: args.user._id,
      email: args.user.email,
    },
    completionCapability: args.completionCapability,
    state: "queued",
    workflow: { state: "not_started" },
    currentStep: "request_accepted",
    requestedAt: now,
    deletionStartsAt,
    updatedAt: now,
    ...(args.initiatingSessionId === undefined
      ? {}
      : { initiatingSessionId: args.initiatingSessionId }),
    retryCount: 0,
    outcomes: {
      providerRevocation: { state: "not_started" },
      completionEmail: { state: "not_started" },
    },
  });
  await ctx.db.insert("workflow_accountDeletion_events", {
    runId,
    step: "request_accepted",
    level: "info",
    message: args.eventMessage,
    createdAt: now,
  });
  await ctx.db.replace(args.user._id, {
    state: "deleting",
    ...readUserProfile(args.user),
    runId,
    requestedAt: now,
  });
  await ctx.scheduler.runAt(deletionStartsAt, internal.accountDeletion.index.startScheduled, {
    runId,
  });

  const run = await ctx.db.get(runId);
  if (run === null || run.identity.state !== "active") {
    throw new Error("Account deletion run was not created.");
  }
  return run;
}

async function startQueuedAccountDeletion(
  ctx: MutationCtx,
  run: Extract<Doc<"workflow_accountDeletion_runs">, { state: "queued" }>,
): Promise<void> {
  await requireRepositoryOperationStart(ctx);
  const user = await ctx.db.get(run.identity.userId);
  if (user === null || user.state !== "deleting" || user.runId !== run._id) {
    throw new Error("Account deletion marker is inconsistent.");
  }

  const workflowId = await startAccountDeletionWorkflow(ctx, run._id);
  await ctx.db.replace(run._id, {
    identity: run.identity,
    completionCapability: run.completionCapability,
    state: "running",
    workflow: { state: "started", workflowId, attempt: 1 },
    currentStep: run.currentStep,
    requestedAt: run.requestedAt,
    ...(run.deletionStartsAt === undefined ? {} : { deletionStartsAt: run.deletionStartsAt }),
    updatedAt: Date.now(),
    ...(run.initiatingSessionId === undefined
      ? {}
      : { initiatingSessionId: run.initiatingSessionId }),
    retryCount: run.retryCount,
    outcomes: run.outcomes,
  });
}

export const request = mutation({
  access: "access_account_deletion",
  args: {
    completionCapability: string(),
    deletionStartMode: vAccountDeletionStartMode,
    deletionConfirmationText: string(),
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

    if (args.deletionConfirmationText !== ACCOUNT_DELETION_CONFIRMATION_PHRASE) {
      return { state: "confirmation_mismatch" as const };
    }

    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (query) => query.eq("userId", ctx.viewer.userId))
      .first();
    if (membership !== null) {
      return { state: "organization_membership_exists" as const };
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

    const run = await queueAccountDeletion(ctx, {
      completionCapability: args.completionCapability,
      deletionStartMode: args.deletionStartMode,
      eventMessage: "Account deletion was requested.",
      initiatingSessionId,
      user: ctx.viewer.user,
    });
    return { state: "accepted" as const, status: projectStatus(run) };
  },
});

export const startScheduled = internalMutation({
  args: { runId: id("workflow_accountDeletion_runs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null || run.state !== "queued") {
      return null;
    }

    const repositoryWriteMode = await readRepositoryWriteMode(ctx);
    if (repositoryWriteMode.mode !== "normal") {
      await ctx.scheduler.runAfter(60_000, internal.accountDeletion.index.startScheduled, {
        runId: args.runId,
      });
      return null;
    }
    await startQueuedAccountDeletion(ctx, run);
    return null;
  },
});

export const deleteNow = mutation({
  access: "access_admin",
  args: { runId: id("workflow_accountDeletion_runs") },
  returns: vAccountDeletionStatus,
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null || run.state !== "queued") {
      throw new Error("Account deletion run is not queued.");
    }

    await startQueuedAccountDeletion(ctx, run);

    const started = await ctx.db.get(run._id);
    if (started === null) {
      throw new Error("Account deletion run was not started.");
    }
    return projectStatus(started);
  },
});

export const queueUserDeletionForAdmin = mutation({
  access: "access_admin",
  args: {
    deletionStartMode: vAccountDeletionStartMode,
    userId: id("users"),
  },
  returns: vAccountDeletionStatus,
  handler: async (ctx, args) => {
    if (args.userId === ctx.viewer.userId) {
      throw new Error("Use Account settings to delete the current account.");
    }

    const user = await ctx.db.get(args.userId);
    if (user === null || user.state !== "active") {
      throw new Error("User account is not active.");
    }

    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (query) => query.eq("userId", args.userId))
      .first();
    if (membership !== null) {
      throw new Error("User must leave all organizations before account deletion.");
    }

    const capabilityBytes = new Uint8Array(32);
    crypto.getRandomValues(capabilityBytes);
    const completionCapability = Array.from(capabilityBytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const run = await queueAccountDeletion(ctx, {
      completionCapability,
      deletionStartMode: args.deletionStartMode,
      eventMessage: "Account deletion was requested by staff.",
      user,
    });
    return projectStatus(run);
  },
});

export const restore = mutation({
  access: "access_admin",
  args: { runId: id("workflow_accountDeletion_runs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null || run.state !== "queued") {
      throw new Error("Account deletion run is not restorable.");
    }

    const user = await ctx.db.get(run.identity.userId);
    if (user === null || user.state !== "deleting" || user.runId !== run._id) {
      throw new Error("Account deletion marker is inconsistent.");
    }

    const event = await ctx.db
      .query("workflow_accountDeletion_events")
      .withIndex("by_run_and_created_at", (query) => query.eq("runId", run._id))
      .unique();
    if (event === null || event.step !== "request_accepted") {
      throw new Error("Account deletion request event is inconsistent.");
    }

    await ctx.db.replace(user._id, {
      state: "active",
      ...readUserProfile(user),
    });
    await ctx.db.delete(event._id);
    await ctx.db.delete(run._id);
    return null;
  },
});

export const retry = mutation({
  access: "access_admin",
  args: { runId: id("workflow_accountDeletion_runs") },
  returns: vAccountDeletionStatus,
  handler: async (ctx, args) => {
    await requireRepositoryOperationStart(ctx);
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
      ...(run.deletionStartsAt === undefined ? {} : { deletionStartsAt: run.deletionStartsAt }),
      updatedAt: now,
      ...(run.initiatingSessionId === undefined
        ? {}
        : { initiatingSessionId: run.initiatingSessionId }),
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

export const policy = query({
  access: "access_account_deletion",
  args: {},
  returns: vAccountDeletionStartMode,
  handler: async () => resolveAccountDeletionStartMode(),
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

export const listUsersForAdmin = query({
  access: "access_admin",
  args: {
    includeScrubbed: boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(vAdminUserListItem),
  handler: async (ctx, args) => {
    const users = await (
      args.includeScrubbed
        ? ctx.db.query("users")
        : ctx.db
            .query("users")
            .withIndex("by_deleted_at", (query) => query.eq("deletedAt", undefined))
    )
      .order("desc")
      .paginate(args.paginationOpts);
    const page = await Promise.all(
      users.page.map(async (user) => {
        if (user.state === "deleted") {
          return {
            userId: user._id,
            state: user.state,
            isApproved: false,
            isCurrentUser: false,
            providers: [],
            createdAt: user._creationTime,
          };
        }

        const accounts = await ctx.db
          .query("authAccounts")
          .withIndex("userIdAndProvider", (query) => query.eq("userId", user._id))
          .take(10);
        return {
          userId: user._id,
          email: user.email,
          state: user.state,
          isApproved: user.isApproved === true,
          isCurrentUser: user._id === ctx.viewer.userId,
          providers: [...new Set(accounts.map(({ provider }) => provider))].sort(),
          createdAt: user._creationTime,
        };
      }),
    );
    return { ...users, page };
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
