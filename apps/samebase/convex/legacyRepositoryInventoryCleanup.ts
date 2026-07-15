import { Migrations } from "@convex-dev/migrations";
import { Workpool } from "@convex-dev/workpool";
import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

const { boolean, literal, number, object, union } = v;
const migrations = new Migrations(components.migrations, {
  internalMutation,
});
const retiredRepositoryRefreshWorkpool = new Workpool(components.repositoryRefreshWorkpool, {
  maxParallelism: 3,
  retryActionsByDefault: false,
});
const RETIRED_REFRESH_QUIESCE_BATCH_SIZE = 25;
const RETIRED_REFRESH_MAX_ACTION_MS = 15 * 60 * 1000;

const cleanupStateValidator = object({
  repositoryRefreshRequests: boolean(),
  vaultBranchFilters: boolean(),
  vaultRemoteBranches: boolean(),
  githubCommitCheckSnapshots: boolean(),
  githubCommitCheckItems: boolean(),
});

const cleanupVerificationValidator = object({
  complete: boolean(),
  remaining: cleanupStateValidator,
});

const cleanupPreflightValidator = object({
  safeToDelete: boolean(),
  graceComplete: boolean(),
  queued: boolean(),
  scheduled: boolean(),
  running: boolean(),
});

const cleanupQuiesceValidator = object({
  state: union(literal("done"), literal("needs_more"), literal("waiting")),
  canceled: number(),
  waitUntil: v.optional(number()),
});

/**
Deploy-one only. Cancel every pending job in the retired Workpool, then move its database rows to a
terminal state. The persisted 15-minute grace also covers an already-running action whose request
row was removed by an old vault deletion before this deployment.
*/
export const quiesce = internalMutation({
  args: {},
  returns: cleanupQuiesceValidator,
  handler: async (ctx) => {
    await retiredRepositoryRefreshWorkpool.cancelAll(ctx);

    const now = Date.now();
    let cleanupState = await ctx.db.query("legacyRepositoryInventoryCleanupState").first();
    if (cleanupState === null) {
      const cleanupStateId = await ctx.db.insert("legacyRepositoryInventoryCleanupState", {
        startedAt: now,
      });
      cleanupState = await ctx.db.get(cleanupStateId);
    }
    if (cleanupState === null) {
      throw new Error("Retired repository refresh cleanup state was not created.");
    }

    const graceWaitUntil = cleanupState.startedAt + RETIRED_REFRESH_MAX_ACTION_MS;
    let canceled = 0;
    let waitUntil = now < graceWaitUntil ? graceWaitUntil : undefined;
    for (const state of ["queued", "scheduled", "running"] as const) {
      const requests = await ctx.db
        .query("repositoryRefreshRequests")
        .withIndex("by_lifecycle_state", (q) => q.eq("lifecycle.state", state))
        .take(RETIRED_REFRESH_QUIESCE_BATCH_SIZE - canceled);
      for (const request of requests) {
        if (request.lifecycle.state === "running" && request.lifecycle.leaseExpiresAt > now) {
          waitUntil = Math.max(waitUntil ?? 0, request.lifecycle.leaseExpiresAt);
          continue;
        }
        await ctx.db.patch(request._id, {
          lifecycle: {
            state: "canceled",
            canceledAt: now,
            reason: "worker_canceled",
          },
          updatedAt: now,
        });
        canceled += 1;
      }
      if (canceled >= RETIRED_REFRESH_QUIESCE_BATCH_SIZE) {
        break;
      }
    }

    const [queued, scheduled, running] = await Promise.all([
      ctx.db
        .query("repositoryRefreshRequests")
        .withIndex("by_lifecycle_state", (q) => q.eq("lifecycle.state", "queued"))
        .first(),
      ctx.db
        .query("repositoryRefreshRequests")
        .withIndex("by_lifecycle_state", (q) => q.eq("lifecycle.state", "scheduled"))
        .first(),
      ctx.db
        .query("repositoryRefreshRequests")
        .withIndex("by_lifecycle_state", (q) => q.eq("lifecycle.state", "running"))
        .first(),
    ]);
    if (queued === null && scheduled === null && running === null && waitUntil === undefined) {
      if (cleanupState.completedAt === undefined) {
        await ctx.db.patch(cleanupState._id, { completedAt: now });
      }
      return { state: "done", canceled } as const;
    }
    if (waitUntil !== undefined && queued === null && scheduled === null) {
      return { state: "waiting", canceled, waitUntil } as const;
    }
    return { state: "needs_more", canceled } as const;
  },
});

export const deleteRepositoryRefreshRequests = migrations.define({
  table: "repositoryRefreshRequests",
  migrateOne: async (ctx, request) => {
    if (
      request.lifecycle.state === "queued" ||
      request.lifecycle.state === "scheduled" ||
      request.lifecycle.state === "running"
    ) {
      throw new Error("Retired repository refresh work is still active.");
    }
    await ctx.db.delete(request._id);
  },
});

export const deleteVaultBranchFilters = migrations.define({
  table: "vaultBranchFilters",
  migrateOne: async (ctx, filters) => {
    await ctx.db.delete(filters._id);
  },
});

export const deleteVaultRemoteBranches = migrations.define({
  table: "vaultRemoteBranches",
  migrateOne: async (ctx, branch) => {
    await ctx.db.delete(branch._id);
  },
});

export const deleteGitHubCommitCheckItems = migrations.define({
  table: "githubCommitCheckItems",
  migrateOne: async (ctx, item) => {
    await ctx.db.delete(item._id);
  },
});

export const deleteGitHubCommitCheckSnapshots = migrations.define({
  table: "githubCommitCheckSnapshots",
  migrateOne: async (ctx, snapshot) => {
    await ctx.db.delete(snapshot._id);
  },
});

const cleanupMigrations = [
  internal.legacyRepositoryInventoryCleanup.deleteRepositoryRefreshRequests,
  internal.legacyRepositoryInventoryCleanup.deleteVaultBranchFilters,
  internal.legacyRepositoryInventoryCleanup.deleteVaultRemoteBranches,
  internal.legacyRepositoryInventoryCleanup.deleteGitHubCommitCheckItems,
  internal.legacyRepositoryInventoryCleanup.deleteGitHubCommitCheckSnapshots,
] as const;

/** Starts the ordered cleanup only after the retired Workpool grace has completed. */
export const run = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cleanupState = await ctx.db.query("legacyRepositoryInventoryCleanupState").first();
    if (cleanupState?.completedAt === undefined) {
      throw new Error("Retired repository refresh work has not finished quiescing.");
    }

    const activeRequest = await ctx.db
      .query("repositoryRefreshRequests")
      .withIndex("by_lifecycle_state", (q) => q.eq("lifecycle.state", "queued"))
      .first();
    const scheduledRequest = await ctx.db
      .query("repositoryRefreshRequests")
      .withIndex("by_lifecycle_state", (q) => q.eq("lifecycle.state", "scheduled"))
      .first();
    const runningRequest = await ctx.db
      .query("repositoryRefreshRequests")
      .withIndex("by_lifecycle_state", (q) => q.eq("lifecycle.state", "running"))
      .first();
    if (activeRequest !== null || scheduledRequest !== null || runningRequest !== null) {
      throw new Error("Retired repository refresh work is still active.");
    }

    await migrations.runSerially(ctx, [...cleanupMigrations]);
    return null;
  },
});

export const preflight = internalQuery({
  args: {},
  returns: cleanupPreflightValidator,
  handler: async (ctx) => {
    const [cleanupState, queued, scheduled, running] = await Promise.all([
      ctx.db.query("legacyRepositoryInventoryCleanupState").first(),
      ctx.db
        .query("repositoryRefreshRequests")
        .withIndex("by_lifecycle_state", (q) => q.eq("lifecycle.state", "queued"))
        .first(),
      ctx.db
        .query("repositoryRefreshRequests")
        .withIndex("by_lifecycle_state", (q) => q.eq("lifecycle.state", "scheduled"))
        .first(),
      ctx.db
        .query("repositoryRefreshRequests")
        .withIndex("by_lifecycle_state", (q) => q.eq("lifecycle.state", "running"))
        .first(),
    ]);

    const graceComplete = cleanupState?.completedAt !== undefined;
    return {
      safeToDelete: graceComplete && queued === null && scheduled === null && running === null,
      graceComplete,
      queued: queued !== null,
      scheduled: scheduled !== null,
      running: running !== null,
    };
  },
});

/**
 * Removes the temporary grace marker after every legacy row is gone. Deploy two
 * can then remove this module, its table, and both temporary components.
 */
export const finalize = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cleanupState = await ctx.db.query("legacyRepositoryInventoryCleanupState").first();
    if (cleanupState === null) {
      throw new Error("Retired repository refresh cleanup was never started.");
    }
    if (cleanupState.completedAt === undefined) {
      throw new Error("Retired repository refresh work has not finished quiescing.");
    }

    const remaining = [
      await ctx.db.query("repositoryRefreshRequests").first(),
      await ctx.db.query("vaultBranchFilters").first(),
      await ctx.db.query("vaultRemoteBranches").first(),
      await ctx.db.query("githubCommitCheckSnapshots").first(),
      await ctx.db.query("githubCommitCheckItems").first(),
    ];
    if (remaining.some((row) => row !== null)) {
      throw new Error("Legacy repository inventory rows remain.");
    }

    const statuses = await migrations.getStatus(ctx, {
      migrations: [...cleanupMigrations],
    });
    if (
      statuses.length !== cleanupMigrations.length ||
      statuses.some((status) => !status.isDone || status.state !== "success")
    ) {
      throw new Error("Legacy repository inventory migrations are not complete.");
    }

    await ctx.db.delete(cleanupState._id);
    return null;
  },
});

export const verify = internalQuery({
  args: {},
  returns: cleanupVerificationValidator,
  handler: async (ctx) => {
    const remaining = {
      repositoryRefreshRequests: (await ctx.db.query("repositoryRefreshRequests").first()) !== null,
      vaultBranchFilters: (await ctx.db.query("vaultBranchFilters").first()) !== null,
      vaultRemoteBranches: (await ctx.db.query("vaultRemoteBranches").first()) !== null,
      githubCommitCheckSnapshots:
        (await ctx.db.query("githubCommitCheckSnapshots").first()) !== null,
      githubCommitCheckItems: (await ctx.db.query("githubCommitCheckItems").first()) !== null,
    };

    return {
      complete: !Object.values(remaining).some(Boolean),
      remaining,
    };
  },
});
