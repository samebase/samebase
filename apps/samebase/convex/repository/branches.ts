import { v, type Infer } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import {
  doesTreeRefreshClaimMatch,
  shouldPreserveTreeRefreshCooldownAfterSuccess,
  TREE_REFRESH_STALE_LOCK_MS,
} from "../../shared/treeRefresh";
import { vGitHubTreeData, vRepositoryTreeRefreshFailureKind } from "./model";
import { isLiveConnectedRepository } from "./state";
import {
  requireRepositoryProviderWorkflowContinuation,
  vRepositoryProviderWorkflowAuthority,
} from "../repositoryWorkflowAuthority";

const nullValidator = v.null();
const { boolean, id, literal, number, object, optional, string, union } = v;

export const getRepositoryBranchTree = internalQuery({
  args: {
    repositoryId: id("repositories"),
    branch: string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("observations_repository_branchTrees")
      .withIndex("by_repository_and_branch", (q) =>
        q.eq("repositoryId", args.repositoryId).eq("branch", args.branch),
      )
      .first();
  },
});

async function writeRepositoryBranchTree(
  ctx: MutationCtx,
  args: {
    repositoryId: Id<"repositories">;
    branch: string;
    treeData: Infer<typeof vGitHubTreeData>;
    commitSHA: string;
  },
): Promise<void> {
  if (args.treeData.truncated) {
    throw new Error("GitHub returned an incomplete recursive repository tree.");
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("observations_repository_branchTrees")
    .withIndex("by_repository_and_branch", (q) =>
      q.eq("repositoryId", args.repositoryId).eq("branch", args.branch),
    )
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      commitSHA: args.commitSHA,
      treeData: args.treeData,
      lastTreeRefreshAt: now,
    });
    return;
  }

  await ctx.db.insert("observations_repository_branchTrees", {
    repositoryId: args.repositoryId,
    branch: args.branch,
    commitSHA: args.commitSHA,
    treeData: args.treeData,
    lastTreeRefreshAt: now,
  });
}

export const upsertRepositoryBranchTree = internalMutation({
  args: {
    repositoryId: id("repositories"),
    branch: string(),
    treeData: vGitHubTreeData,
    commitSHA: string(),
    authority: optional(vRepositoryProviderWorkflowAuthority),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    if (args.authority !== undefined) {
      await requireRepositoryProviderWorkflowContinuation(ctx, args.authority);
    }
    const repository = await ctx.db.get(args.repositoryId);
    if (!isLiveConnectedRepository(repository)) {
      return null;
    }

    await writeRepositoryBranchTree(ctx, args);

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
  returns: object({
    written: boolean(),
  }),
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (
      !isLiveConnectedRepository(repository) ||
      !doesTreeRefreshClaimMatch({
        claimedStartedAt: args.startedAt,
        treeRefreshStartedAt: repository.treeRefreshStartedAt,
      })
    ) {
      return { written: false };
    }

    await writeRepositoryBranchTree(ctx, args);
    return { written: true };
  },
});

const STALE_LOCK_MS = TREE_REFRESH_STALE_LOCK_MS;
const vTreeRefreshClaim = union(
  object({
    claimed: literal(true),
    startedAt: number(),
  }),
  object({
    claimed: literal(false),
    reason: union(literal("cooldown"), literal("in_progress"), literal("unavailable")),
  }),
);
type TreeRefreshClaim = Infer<typeof vTreeRefreshClaim>;

function getLaterCooldownUntil(
  existingCooldownUntil: number | undefined,
  nextCooldownUntil: number | undefined,
): number | undefined {
  if (typeof existingCooldownUntil !== "number") {
    return nextCooldownUntil;
  }
  if (typeof nextCooldownUntil !== "number") {
    return existingCooldownUntil;
  }
  return Math.max(existingCooldownUntil, nextCooldownUntil);
}

// Atomically claim the tree refresh lock for a repository.
// Returns the claimed timestamp when this caller should proceed.
export const claimTreeRefresh = internalMutation({
  args: {
    repositoryId: id("repositories"),
  },
  returns: vTreeRefreshClaim,
  handler: async (ctx, args): Promise<TreeRefreshClaim> => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!isLiveConnectedRepository(repository)) {
      return { claimed: false, reason: "unavailable" };
    }

    const now = Date.now();
    if (
      typeof repository.treeRefreshCooldownUntil === "number" &&
      repository.treeRefreshCooldownUntil > now
    ) {
      return { claimed: false, reason: "cooldown" };
    }

    if (repository.treeRefreshStartedAt && now - repository.treeRefreshStartedAt < STALE_LOCK_MS) {
      return { claimed: false, reason: "in_progress" };
    }

    await ctx.db.patch(args.repositoryId, { treeRefreshStartedAt: now });
    return { claimed: true, startedAt: now };
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
  returns: object({
    released: boolean(),
  }),
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!isLiveConnectedRepository(repository)) {
      return { released: false };
    }

    if (
      !doesTreeRefreshClaimMatch({
        claimedStartedAt: args.startedAt,
        treeRefreshStartedAt: repository.treeRefreshStartedAt,
      })
    ) {
      return { released: false };
    }

    const now = Date.now();
    const cooldownUntil = getLaterCooldownUntil(
      repository.treeRefreshCooldownUntil,
      args.cooldownUntil,
    );
    const shouldPreserveCooldownState =
      args.markRefreshed &&
      shouldPreserveTreeRefreshCooldownAfterSuccess({
        claimedStartedAt: args.startedAt,
        lastTreeRefreshFailedAt: repository.lastTreeRefreshFailedAt,
        cooldownUntil,
        now,
      });
    await ctx.db.patch(
      args.repositoryId,
      !args.markRefreshed
        ? {
            treeRefreshStartedAt: undefined,
            lastTreeRefreshFailedAt: now,
            treeRefreshFailureKind: args.failureKind ?? "failed",
            treeRefreshFailureMessage: args.failureMessage,
            treeRefreshCooldownUntil: cooldownUntil,
          }
        : {
            treeRefreshStartedAt: undefined,
            lastTreeRefreshFailedAt: shouldPreserveCooldownState
              ? repository.lastTreeRefreshFailedAt
              : undefined,
            treeRefreshFailureKind: shouldPreserveCooldownState
              ? repository.treeRefreshFailureKind
              : undefined,
            treeRefreshFailureMessage: shouldPreserveCooldownState
              ? repository.treeRefreshFailureMessage
              : undefined,
            treeRefreshCooldownUntil: shouldPreserveCooldownState ? cooldownUntil : undefined,
          },
    );
    return { released: true };
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
  returns: nullValidator,
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!isLiveConnectedRepository(repository)) {
      return null;
    }
    if (
      typeof args.startedAt === "number" &&
      !doesTreeRefreshClaimMatch({
        claimedStartedAt: args.startedAt,
        treeRefreshStartedAt: repository.treeRefreshStartedAt,
      })
    ) {
      return null;
    }

    await ctx.db.patch(args.repositoryId, {
      lastTreeRefreshFailedAt: Date.now(),
      treeRefreshFailureKind: args.failureKind ?? "failed",
      treeRefreshFailureMessage: args.failureMessage,
      treeRefreshCooldownUntil: getLaterCooldownUntil(
        repository.treeRefreshCooldownUntil,
        args.cooldownUntil,
      ),
    });
    return null;
  },
});
