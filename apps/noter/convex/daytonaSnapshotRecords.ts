import { Infer, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { inferCommitPinnedSnapshotName } from "./daytonaSnapshotPolicy";
import { DaytonaSnapshotBuildStatus } from "./schema";

const { array, boolean, id, number, object, optional, string } = v;

const daytonaSnapshotRecord = object({
  _id: id("daytonaSnapshots"),
  _creationTime: number(),
  ghRepoOwner: string(),
  ghRepoName: string(),
  branch: string(),
  commitSha: string(),
  snapshotName: optional(string()),
  snapshotId: optional(string()),
  status: DaytonaSnapshotBuildStatus,
  attemptCount: number(),
  lastError: optional(string()),
  logs: optional(string()),
  logsUpdatedAt: optional(number()),
  nextRetryAt: optional(number()),
  createdAt: number(),
  updatedAt: number(),
});

const enqueueSnapshotBuildResult = object({
  snapshotRecordId: id("daytonaSnapshots"),
  snapshotName: string(),
  status: DaytonaSnapshotBuildStatus,
  shouldSchedule: boolean(),
});

type SnapshotRecord = Infer<typeof daytonaSnapshotRecord>;

async function getSnapshotRecordByCommit(
  ctx: QueryCtx | MutationCtx,
  args: {
    owner: string;
    repo: string;
    branch: string;
    commitSha: string;
  },
): Promise<SnapshotRecord | null> {
  return await ctx.db
    .query("daytonaSnapshots")
    .withIndex("by_repo_branch_commit", (q) =>
      q
        .eq("ghRepoOwner", args.owner)
        .eq("ghRepoName", args.repo)
        .eq("branch", args.branch)
        .eq("commitSha", args.commitSha),
    )
    .first();
}

export const getByRepoBranchCommit = internalQuery({
  args: {
    owner: string(),
    repo: string(),
    branch: string(),
    commitSha: string(),
  },
  returns: v.union(daytonaSnapshotRecord, v.null()),
  handler: async (ctx, args) => {
    return (await getSnapshotRecordByCommit(ctx, args)) ?? null;
  },
});

export const getBySnapshotName = internalQuery({
  args: {
    snapshotName: string(),
  },
  returns: v.union(daytonaSnapshotRecord, v.null()),
  handler: async (ctx, args) => {
    return (
      (await ctx.db
        .query("daytonaSnapshots")
        .withIndex("by_snapshot_name", (q) =>
          q.eq("snapshotName", args.snapshotName),
        )
        .first()) ?? null
    );
  },
});

export const listByRepoBranch = internalQuery({
  args: {
    owner: string(),
    repo: string(),
    branch: string(),
  },
  returns: array(daytonaSnapshotRecord),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("daytonaSnapshots")
      .withIndex("by_repo_branch", (q) =>
        q
          .eq("ghRepoOwner", args.owner)
          .eq("ghRepoName", args.repo)
          .eq("branch", args.branch),
      )
      .collect();
  },
});

export const listByRepo = internalQuery({
  args: {
    owner: string(),
    repo: string(),
  },
  returns: array(daytonaSnapshotRecord),
  handler: async (ctx, args) => {
    const mainBranchRecords = await ctx.db
      .query("daytonaSnapshots")
      .withIndex("by_repo_branch", (q) =>
        q
          .eq("ghRepoOwner", args.owner)
          .eq("ghRepoName", args.repo)
          .eq("branch", "main"),
      )
      .collect();

    return mainBranchRecords;
  },
});

export const enqueueBuild = internalMutation({
  args: {
    owner: string(),
    repo: string(),
    branch: string(),
    commitSha: string(),
    force: optional(boolean()),
  },
  returns: enqueueSnapshotBuildResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof enqueueSnapshotBuildResult>> => {
    const now = Date.now();
    const existing = await getSnapshotRecordByCommit(ctx, args);
    const snapshotName = inferCommitPinnedSnapshotName(args);

    if (existing) {
      const retryBlocked =
        existing.status === "failed" &&
        args.force !== true &&
        typeof existing.nextRetryAt === "number" &&
        existing.nextRetryAt > now;
      const shouldSchedule =
        !retryBlocked &&
        (existing.status === "failed" || existing.status === "removing");

      if (!shouldSchedule) {
        return {
          snapshotRecordId: existing._id,
          snapshotName: existing.snapshotName ?? snapshotName,
          status: existing.status,
          shouldSchedule: false,
        };
      }

      await ctx.db.patch(existing._id, {
        snapshotName,
        status: "queued",
        updatedAt: now,
        nextRetryAt: undefined,
      });
      return {
        snapshotRecordId: existing._id,
        snapshotName,
        status: "queued",
        shouldSchedule: true,
      };
    }

    const snapshotRecordId = await ctx.db.insert("daytonaSnapshots", {
      ghRepoOwner: args.owner,
      ghRepoName: args.repo,
      branch: args.branch,
      commitSha: args.commitSha,
      snapshotName,
      snapshotId: undefined,
      status: "queued",
      attemptCount: 0,
      lastError: undefined,
      logs: "",
      logsUpdatedAt: undefined,
      nextRetryAt: undefined,
      createdAt: now,
      updatedAt: now,
    });

    return {
      snapshotRecordId,
      snapshotName,
      status: "queued",
      shouldSchedule: true,
    };
  },
});

export const markBuildStarted = internalMutation({
  args: {
    owner: string(),
    repo: string(),
    branch: string(),
    commitSha: string(),
    startedAt: number(),
    logs: optional(string()),
  },
  returns: v.union(daytonaSnapshotRecord, v.null()),
  handler: async (ctx, args) => {
    const existing = await getSnapshotRecordByCommit(ctx, args);
    if (!existing) {
      return null;
    }

    await ctx.db.patch(existing._id, {
      snapshotName:
        existing.snapshotName ?? inferCommitPinnedSnapshotName(args),
      status: "building",
      attemptCount: existing.attemptCount + 1,
      lastError: undefined,
      logs: args.logs ?? existing.logs,
      logsUpdatedAt: args.logs ? args.startedAt : existing.logsUpdatedAt,
      nextRetryAt: undefined,
      updatedAt: args.startedAt,
    });

    return await ctx.db.get(existing._id);
  },
});

export const updateLogs = internalMutation({
  args: {
    owner: string(),
    repo: string(),
    branch: string(),
    commitSha: string(),
    snapshotName: optional(string()),
    logs: string(),
    updatedAt: number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await getSnapshotRecordByCommit(ctx, args);
    if (!existing) {
      return null;
    }

    await ctx.db.patch(existing._id, {
      snapshotName: args.snapshotName ?? existing.snapshotName,
      logs: args.logs,
      logsUpdatedAt: args.updatedAt,
      updatedAt: args.updatedAt,
    });
    return null;
  },
});

export const markBuildActive = internalMutation({
  args: {
    owner: string(),
    repo: string(),
    branch: string(),
    commitSha: string(),
    snapshotName: string(),
    snapshotId: optional(string()),
    updatedAt: number(),
  },
  returns: v.union(daytonaSnapshotRecord, v.null()),
  handler: async (ctx, args) => {
    const existing = await getSnapshotRecordByCommit(ctx, args);
    if (!existing) {
      return null;
    }

    await ctx.db.patch(existing._id, {
      snapshotName: args.snapshotName,
      snapshotId: args.snapshotId,
      status: "active",
      lastError: undefined,
      nextRetryAt: undefined,
      updatedAt: args.updatedAt,
    });

    return await ctx.db.get(existing._id);
  },
});

export const markBuildFailed = internalMutation({
  args: {
    owner: string(),
    repo: string(),
    branch: string(),
    commitSha: string(),
    error: string(),
    updatedAt: number(),
    nextRetryAt: optional(number()),
  },
  returns: v.union(daytonaSnapshotRecord, v.null()),
  handler: async (ctx, args) => {
    const existing = await getSnapshotRecordByCommit(ctx, args);
    if (!existing) {
      return null;
    }

    await ctx.db.patch(existing._id, {
      status: "failed",
      lastError: args.error,
      nextRetryAt: args.nextRetryAt,
      updatedAt: args.updatedAt,
    });

    return await ctx.db.get(existing._id);
  },
});

export const markBuildFailedAndScheduleRetry = internalMutation({
  args: {
    owner: string(),
    repo: string(),
    branch: string(),
    commitSha: string(),
    userId: id("users"),
    error: string(),
    updatedAt: number(),
    retryDelayMs: number(),
  },
  returns: v.union(daytonaSnapshotRecord, v.null()),
  handler: async (ctx, args) => {
    const existing = await getSnapshotRecordByCommit(ctx, args);
    if (!existing) {
      return null;
    }

    const nextRetryAt = args.updatedAt + args.retryDelayMs;
    await ctx.db.patch(existing._id, {
      status: "failed",
      lastError: args.error,
      nextRetryAt,
      updatedAt: args.updatedAt,
    });

    await ctx.scheduler.runAfter(
      args.retryDelayMs,
      internal.daytonaActions.buildCommitPinnedSnapshot,
      {
        userId: args.userId,
        owner: args.owner,
        repo: args.repo,
        branch: args.branch,
        commitSha: args.commitSha,
      },
    );

    return await ctx.db.get(existing._id);
  },
});

export const markBuildRemoving = internalMutation({
  args: {
    snapshotIds: array(id("daytonaSnapshots")),
    updatedAt: number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await Promise.all(
      args.snapshotIds.map(async (snapshotId) => {
        const snapshot = await ctx.db.get(snapshotId);
        if (!snapshot) {
          return;
        }
        await ctx.db.patch(snapshotId, {
          status: "removing",
          updatedAt: args.updatedAt,
        });
      }),
    );

    return null;
  },
});

export const removeRecordsByIds = internalMutation({
  args: {
    snapshotIds: array(id("daytonaSnapshots")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await Promise.all(
      args.snapshotIds.map(async (snapshotId) => {
        await ctx.db.delete(snapshotId);
      }),
    );
    return null;
  },
});

export const removeBySnapshotName = internalMutation({
  args: {
    snapshotName: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const snapshot = await ctx.db
      .query("daytonaSnapshots")
      .withIndex("by_snapshot_name", (q) =>
        q.eq("snapshotName", args.snapshotName),
      )
      .first();
    if (snapshot) {
      await ctx.db.delete(snapshot._id);
    }
    return null;
  },
});
