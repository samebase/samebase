import { Infer, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import {
  canonicalizeCommitPinnedDaytonaBranch,
  DAYTONA_COMMIT_PINNED_BRANCH,
  inferCommitPinnedSnapshotName,
} from "./snapshotPolicy";
import { DaytonaSnapshotBuildStatus } from "../schema";

const {
  array,
  boolean,
  id,
  null: vnull,
  number,
  object,
  optional,
  string,
  union,
} = v;

const nullValidator = vnull();

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

const tryMarkBuildStartedResult = object({
  started: boolean(),
  snapshotRecord: union(daytonaSnapshotRecord, vnull()),
});

type SnapshotRecord = Infer<typeof daytonaSnapshotRecord>;

type EnqueueSnapshotBuildArgs = {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
  force?: boolean;
};

async function getSnapshotRecordByCommit(
  ctx: QueryCtx | MutationCtx,
  args: {
    owner: string;
    repo: string;
    branch: string;
    commitSha: string;
  },
): Promise<SnapshotRecord | null> {
  const branch = canonicalizeCommitPinnedDaytonaBranch(args.branch);
  return await ctx.db
    .query("daytonaSnapshots")
    .withIndex("by_ghRepoOwner_and_ghRepoName_and_branch_and_commitSha", (q) =>
      q
        .eq("ghRepoOwner", args.owner)
        .eq("ghRepoName", args.repo)
        .eq("branch", branch)
        .eq("commitSha", args.commitSha),
    )
    .first();
}

export async function enqueueSnapshotBuild(
  ctx: MutationCtx,
  args: EnqueueSnapshotBuildArgs,
): Promise<Infer<typeof enqueueSnapshotBuildResult>> {
  const branch = canonicalizeCommitPinnedDaytonaBranch(args.branch);
  const normalizedArgs = {
    ...args,
    branch,
  };
  const now = Date.now();
  const existing = await getSnapshotRecordByCommit(ctx, normalizedArgs);
  const snapshotName = inferCommitPinnedSnapshotName(normalizedArgs);

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
    ghRepoOwner: normalizedArgs.owner,
    ghRepoName: normalizedArgs.repo,
    branch,
    commitSha: normalizedArgs.commitSha,
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
}

export const getByRepoBranchCommit = internalQuery({
  args: {
    owner: string(),
    repo: string(),
    branch: string(),
    commitSha: string(),
  },
  returns: union(daytonaSnapshotRecord, vnull()),
  handler: async (ctx, args) => {
    return (await getSnapshotRecordByCommit(ctx, args)) ?? null;
  },
});

export const getBySnapshotName = internalQuery({
  args: {
    snapshotName: string(),
  },
  returns: union(daytonaSnapshotRecord, vnull()),
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
    const branch = canonicalizeCommitPinnedDaytonaBranch(args.branch);
    return await ctx.db
      .query("daytonaSnapshots")
      .withIndex("by_ghRepoOwner_and_ghRepoName_and_branch", (q) =>
        q
          .eq("ghRepoOwner", args.owner)
          .eq("ghRepoName", args.repo)
          .eq("branch", branch),
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
      .withIndex("by_ghRepoOwner_and_ghRepoName_and_branch", (q) =>
        q
          .eq("ghRepoOwner", args.owner)
          .eq("ghRepoName", args.repo)
          .eq("branch", DAYTONA_COMMIT_PINNED_BRANCH),
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
    return await enqueueSnapshotBuild(ctx, args);
  },
});

export const tryMarkBuildStarted = internalMutation({
  args: {
    owner: string(),
    repo: string(),
    branch: string(),
    commitSha: string(),
    startedAt: number(),
    logs: optional(string()),
  },
  returns: tryMarkBuildStartedResult,
  handler: async (ctx, args) => {
    const branch = canonicalizeCommitPinnedDaytonaBranch(args.branch);
    const existing = await getSnapshotRecordByCommit(ctx, {
      owner: args.owner,
      repo: args.repo,
      branch,
      commitSha: args.commitSha,
    });
    if (!existing) {
      return {
        started: false,
        snapshotRecord: null,
      };
    }

    const retryBlocked =
      existing.status === "failed" &&
      typeof existing.nextRetryAt === "number" &&
      existing.nextRetryAt > args.startedAt;
    if (
      existing.status === "active" ||
      existing.status === "building" ||
      retryBlocked ||
      (existing.status !== "queued" && existing.status !== "failed")
    ) {
      return {
        started: false,
        snapshotRecord: existing,
      };
    }

    await ctx.db.patch(existing._id, {
      snapshotName:
        existing.snapshotName ??
        inferCommitPinnedSnapshotName({
          owner: args.owner,
          repo: args.repo,
          branch,
          commitSha: args.commitSha,
        }),
      status: "building",
      attemptCount: existing.attemptCount + 1,
      lastError: undefined,
      logs: args.logs ?? existing.logs,
      logsUpdatedAt:
        args.logs !== undefined ? args.startedAt : existing.logsUpdatedAt,
      nextRetryAt: undefined,
      updatedAt: args.startedAt,
    });

    return {
      started: true,
      snapshotRecord: (await ctx.db.get(existing._id)) ?? null,
    };
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
  returns: nullValidator,
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
  returns: union(daytonaSnapshotRecord, vnull()),
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
  returns: union(daytonaSnapshotRecord, vnull()),
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
  returns: union(daytonaSnapshotRecord, vnull()),
  handler: async (ctx, args) => {
    const branch = canonicalizeCommitPinnedDaytonaBranch(args.branch);
    const existing = await getSnapshotRecordByCommit(ctx, {
      owner: args.owner,
      repo: args.repo,
      branch,
      commitSha: args.commitSha,
    });
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
      internal.daytona.actions.buildCommitPinnedSnapshot,
      {
        userId: args.userId,
        owner: args.owner,
        repo: args.repo,
        branch,
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
  returns: nullValidator,
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
  returns: nullValidator,
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
  returns: nullValidator,
  handler: async (ctx, args) => {
    const snapshots = await ctx.db
      .query("daytonaSnapshots")
      .withIndex("by_snapshot_name", (q) =>
        q.eq("snapshotName", args.snapshotName),
      )
      .collect();
    await Promise.all(
      snapshots.map(async (snapshot) => {
        await ctx.db.delete(snapshot._id);
      }),
    );
    return null;
  },
});
