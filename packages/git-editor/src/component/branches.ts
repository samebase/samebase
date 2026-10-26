import { v, type Infer } from "convex/values";

// eslint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host wrappers enforce access.
import { mutation, query, type MutationCtx } from "./_generated/server.js";
import {
  doesTreeRefreshClaimMatch,
  shouldPreserveTreeRefreshCooldownAfterSuccess,
  TREE_REFRESH_STALE_LOCK_MS,
} from "../treeRefresh.js";
import {
  branchTree,
  repositorySyncState,
  vGitHubTreeData,
  vRepositoryTreeRefreshFailureKind,
} from "../model.js";

const nullValidator = v.null();
const { boolean, literal, number, object, optional, string, union } = v;

export const get = query({
  args: {
    repositoryId: string(),
    branch: string(),
  },
  returns: union(branchTree, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("branchTrees")
      .withIndex("by_repository_and_branch", (q) =>
        q.eq("repositoryId", args.repositoryId).eq("branch", args.branch),
      )
      .first();
  },
});

async function writeRepositoryBranchTree(
  ctx: MutationCtx,
  args: {
    repositoryId: string;
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
    .query("branchTrees")
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

  await ctx.db.insert("branchTrees", {
    repositoryId: args.repositoryId,
    branch: args.branch,
    commitSHA: args.commitSHA,
    treeData: args.treeData,
    lastTreeRefreshAt: now,
  });
}

/** Publishes a provider tree only while its optional refresh claim is current. */
export const upsert = mutation({
  args: {
    repositoryId: string(),
    branch: string(),
    treeData: vGitHubTreeData,
    commitSHA: string(),
    startedAt: optional(number()),
  },
  returns: object({ written: boolean() }),
  handler: async (ctx, args) => {
    if (args.startedAt !== undefined) {
      const state = await ctx.db
        .query("repositorySyncState")
        .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
        .unique();
      if (
        !doesTreeRefreshClaimMatch({
          claimedStartedAt: args.startedAt,
          treeRefreshStartedAt: state?.treeRefreshStartedAt,
        })
      ) {
        return { written: false };
      }
    }
    await writeRepositoryBranchTree(ctx, args);
    return { written: true };
  },
});

export const getSyncState = query({
  args: { repositoryId: string() },
  returns: union(repositorySyncState, v.null()),
  handler: async (ctx, args) =>
    await ctx.db
      .query("repositorySyncState")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .unique(),
});

const STALE_LOCK_MS = TREE_REFRESH_STALE_LOCK_MS;
const vTreeRefreshClaim = union(
  object({
    claimed: literal(true),
    startedAt: number(),
  }),
  object({
    claimed: literal(false),
    reason: union(literal("cooldown"), literal("in_progress")),
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
export const claimRefresh = mutation({
  args: {
    repositoryId: string(),
  },
  returns: vTreeRefreshClaim,
  handler: async (ctx, args): Promise<TreeRefreshClaim> => {
    const repository = await ctx.db
      .query("repositorySyncState")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .unique();
    if (!repository) {
      const startedAt = Date.now();
      await ctx.db.insert("repositorySyncState", {
        repositoryId: args.repositoryId,
        treeRefreshStartedAt: startedAt,
      });
      return { claimed: true, startedAt };
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

    await ctx.db.patch(repository._id, { treeRefreshStartedAt: now });
    return { claimed: true, startedAt: now };
  },
});

export const releaseRefresh = mutation({
  args: {
    repositoryId: string(),
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
    const repository = await ctx.db
      .query("repositorySyncState")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .unique();
    if (!repository) {
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
      repository._id,
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

export const recordRefreshFailure = mutation({
  args: {
    repositoryId: string(),
    startedAt: optional(number()),
    failureKind: optional(vRepositoryTreeRefreshFailureKind),
    failureMessage: optional(string()),
    cooldownUntil: optional(number()),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const repository = await ctx.db
      .query("repositorySyncState")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .unique();
    if (!repository) {
      if (args.startedAt === undefined) {
        await ctx.db.insert("repositorySyncState", {
          repositoryId: args.repositoryId,
          lastTreeRefreshFailedAt: Date.now(),
          treeRefreshFailureKind: args.failureKind ?? "failed",
          treeRefreshFailureMessage: args.failureMessage,
          treeRefreshCooldownUntil: args.cooldownUntil,
        });
      }
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

    await ctx.db.patch(repository._id, {
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

export const deleteRepositoryBatch = mutation({
  args: {
    repositoryId: string(),
    table: union(literal("branchTrees"), literal("repositorySyncState")),
  },
  returns: number(),
  handler: async (ctx, args) => {
    const rows =
      args.table === "branchTrees"
        ? await ctx.db
            .query("branchTrees")
            .withIndex("by_repository_and_branch", (q) => q.eq("repositoryId", args.repositoryId))
            .take(50)
        : await ctx.db
            .query("repositorySyncState")
            .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
            .take(50);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
