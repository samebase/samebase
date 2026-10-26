import { v, type Infer } from "convex/values";
import {
  branchTree,
  vGitHubTreeData,
  vRepositoryTreeRefreshFailureKind,
} from "@samebase/git-workspace/model";
import { components } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import { isLiveConnectedRepository } from "./state";
import {
  requireRepositoryProviderWorkflowContinuation,
  vRepositoryProviderWorkflowAuthority,
} from "../repositoryWorkflowAuthority";

const { boolean, id, literal, number, object, optional, string, union } = v;

export const getRepositoryBranchTree = internalQuery({
  args: { repositoryId: id("repositories"), branch: string() },
  returns: union(branchTree, v.null()),
  handler: async (ctx, args) =>
    await ctx.runQuery(components.gitWorkspace.branches.get, {
      repositoryId: args.repositoryId,
      branch: args.branch,
    }),
});

export const upsertRepositoryBranchTree = internalMutation({
  args: {
    repositoryId: id("repositories"),
    branch: string(),
    treeData: vGitHubTreeData,
    commitSHA: string(),
    authority: optional(vRepositoryProviderWorkflowAuthority),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.authority !== undefined) {
      await requireRepositoryProviderWorkflowContinuation(ctx, args.authority);
    }
    const repository = await ctx.db.get(args.repositoryId);
    if (!isLiveConnectedRepository(repository)) return null;
    await ctx.runMutation(components.gitWorkspace.branches.upsert, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      treeData: args.treeData,
      commitSHA: args.commitSHA,
    });
    return null;
  },
});

/**
 * Publishes a provider tree only while this refresh still owns the repository lock.
 * A timed-out request therefore cannot overwrite a newer branch generation.
 */
export const upsertClaimedRepositoryBranchTree = internalMutation({
  args: {
    repositoryId: id("repositories"),
    branch: string(),
    startedAt: number(),
    treeData: vGitHubTreeData,
    commitSHA: string(),
  },
  returns: object({ written: boolean() }),
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!isLiveConnectedRepository(repository)) return { written: false };
    return await ctx.runMutation(components.gitWorkspace.branches.upsert, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      treeData: args.treeData,
      commitSHA: args.commitSHA,
      startedAt: args.startedAt,
    });
  },
});

const vTreeRefreshClaim = union(
  object({ claimed: literal(true), startedAt: number() }),
  object({
    claimed: literal(false),
    reason: union(literal("cooldown"), literal("in_progress"), literal("unavailable")),
  }),
);
type TreeRefreshClaim = Infer<typeof vTreeRefreshClaim>;

// Atomically claim the tree refresh lock for a repository.
// Returns the claimed timestamp when this caller should proceed.
export const claimTreeRefresh = internalMutation({
  args: { repositoryId: id("repositories") },
  returns: vTreeRefreshClaim,
  handler: async (ctx, args): Promise<TreeRefreshClaim> => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!isLiveConnectedRepository(repository)) return { claimed: false, reason: "unavailable" };
    return await ctx.runMutation(components.gitWorkspace.branches.claimRefresh, {
      repositoryId: args.repositoryId,
    });
  },
});

export const releaseTreeRefresh = internalMutation({
  args: {
    repositoryId: id("repositories"),
    startedAt: number(),
    markRefreshed: boolean(),
    failureKind: optional(vRepositoryTreeRefreshFailureKind),
    failureMessage: optional(string()),
    cooldownUntil: optional(number()),
  },
  returns: object({ released: boolean() }),
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!isLiveConnectedRepository(repository)) return { released: false };
    return await ctx.runMutation(components.gitWorkspace.branches.releaseRefresh, {
      repositoryId: args.repositoryId,
      startedAt: args.startedAt,
      markRefreshed: args.markRefreshed,
      failureKind: args.failureKind,
      failureMessage: args.failureMessage,
      cooldownUntil: args.cooldownUntil,
    });
  },
});

export const recordTreeRefreshFailure = internalMutation({
  args: {
    repositoryId: id("repositories"),
    startedAt: optional(number()),
    failureKind: optional(vRepositoryTreeRefreshFailureKind),
    failureMessage: optional(string()),
    cooldownUntil: optional(number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!isLiveConnectedRepository(repository)) return null;
    return await ctx.runMutation(components.gitWorkspace.branches.recordRefreshFailure, {
      repositoryId: args.repositoryId,
      startedAt: args.startedAt,
      failureKind: args.failureKind,
      failureMessage: args.failureMessage,
      cooldownUntil: args.cooldownUntil,
    });
  },
});
