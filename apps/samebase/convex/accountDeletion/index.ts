import { getAuthSessionId } from "@convex-dev/auth/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../functions";
import { hasStagedFileChanges } from "../stagingChanges";
import { vAccountDeletionEventLevel, vAccountDeletionStep } from "./model";

const { array, id, literal, number, object, optional, string, union } = v;

const vAccountDeletionRunState = union(
  literal("queued"),
  literal("running"),
  literal("needs_attention"),
  literal("succeeded"),
);

const vAccountDeletionStatus = object({
  runId: id("accountDeletionRuns"),
  state: vAccountDeletionRunState,
  currentStep: vAccountDeletionStep,
  requestedAt: number(),
  latestProgressAt: number(),
  stagedFileCount: number(),
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
  stagedFileCount: number(),
  retryCount: number(),
  email: optional(string()),
  latestSafeError: optional(string()),
  completedAt: optional(number()),
});

async function countUserStagedFileChanges(
  ctx: QueryCtx | MutationCtx,
  userId: Doc<"users">["_id"],
): Promise<number> {
  let count = 0;
  const vaults = ctx.db.query("vaults").withIndex("by_userId", (q) => q.eq("userId", userId));

  for await (const vault of vaults) {
    const stagedFiles = ctx.db
      .query("fileStaging")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id));
    for await (const stagedFile of stagedFiles) {
      if (hasStagedFileChanges(stagedFile)) {
        count += 1;
      }
    }
  }
  return count;
}

function projectStatus(run: Doc<"accountDeletionRuns">) {
  return {
    runId: run._id,
    state: run.state,
    currentStep: run.currentStep,
    requestedAt: run.requestedAt,
    latestProgressAt: run.updatedAt,
    stagedFileCount: run.stagedFileCount,
  };
}

function projectAdminListItem(run: Doc<"accountDeletionRuns">) {
  return {
    ...projectStatus(run),
    retryCount: run.retryCount,
    ...(run.identity.state === "active" ? { email: run.identity.email } : {}),
    ...(run.state === "needs_attention" ? { latestSafeError: run.latestSafeError } : {}),
    ...(run.state === "succeeded" ? { completedAt: run.completedAt } : {}),
  };
}

export const preflight = query({
  access: "access_account_deletion",
  args: {},
  returns: object({
    stagedFileCount: number(),
  }),
  handler: async (ctx) => {
    if (ctx.viewer.user.accountDeletion !== undefined) {
      throw new Error("Account deletion has already been requested.");
    }
    return {
      stagedFileCount: await countUserStagedFileChanges(ctx, ctx.viewer.userId),
    };
  },
});

export const request = mutation({
  access: "access_account_deletion",
  args: {},
  returns: vAccountDeletionStatus,
  handler: async (ctx) => {
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
      return projectStatus(existingRun);
    }

    const initiatingSessionId = await getAuthSessionId(ctx);
    if (initiatingSessionId === null) {
      throw new Error("Authentication session is required to delete an account.");
    }

    const now = Date.now();
    const stagedFileCount = await countUserStagedFileChanges(ctx, ctx.viewer.userId);
    const runId = await ctx.db.insert("accountDeletionRuns", {
      identity: {
        state: "active",
        userId: ctx.viewer.userId,
        email: ctx.viewer.user.email,
      },
      state: "queued",
      currentStep: "request_accepted",
      requestedAt: now,
      stagedFileCount,
      updatedAt: now,
      initiatingSessionId,
      retryCount: 0,
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

    const run = await ctx.db.get(runId);
    if (run === null) {
      throw new Error("Account deletion run was not created.");
    }
    return projectStatus(run);
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
    return projectStatus(run);
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
