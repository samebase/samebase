import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";
import {
  VAULT_TREE_REFRESH_FAILURE_MESSAGE_MAX_LENGTH,
  vGithubTreeData,
  vTreeRefreshFailureKind,
} from "./model";
import { isVaultDeletingOrDeleteFailed } from "./deletion/state";
import {
  doesTreeRefreshClaimMatch,
  shouldPreserveTreeRefreshCooldownAfterSuccess,
  TREE_REFRESH_DEBOUNCE_MS,
  TREE_REFRESH_STALE_LOCK_MS,
} from "../../shared/treeRefresh";

export const getVaultBranchTree = internalQuery({
  args: {
    vaultId: v.id("vaults"),
    branch: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vaultBranchTrees")
      .withIndex("by_vault_and_branch", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch),
      )
      .first();
  },
});

export const upsertVaultBranchTree = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    branch: v.string(),
    treeData: vGithubTreeData,
    commitSHA: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || isVaultDeletingOrDeleteFailed(vault)) {
      return null;
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("vaultBranchTrees")
      .withIndex("by_vault_and_branch", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        treeSHA: args.treeData.sha,
        commitSHA: args.commitSHA,
        treeData: args.treeData,
        lastTreeRefreshAt: now,
        treeRefreshStartedAt: undefined,
      });
      return null;
    }

    await ctx.db.insert("vaultBranchTrees", {
      vaultId: args.vaultId,
      branch: args.branch,
      treeSHA: args.treeData.sha,
      commitSHA: args.commitSHA,
      treeData: args.treeData,
      lastTreeRefreshAt: now,
      treeRefreshStartedAt: undefined,
    });

    return null;
  },
});

function getLaterCooldownUntil(
  existingCooldownUntil: number | undefined,
  nextCooldownUntil: number | undefined,
): number | undefined {
  if (existingCooldownUntil === undefined) {
    return nextCooldownUntil;
  }
  if (nextCooldownUntil === undefined) {
    return existingCooldownUntil;
  }
  return Math.max(existingCooldownUntil, nextCooldownUntil);
}

/**
 * Atomically claims the vault's branch-tree refresh lock.
 *
 * The caller receives the claim timestamp and must pass that exact value when
 * releasing the lock so a late request cannot release a newer claim.
 */
export const claimTreeRefresh = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    force: v.optional(v.boolean()),
    debounceMs: v.optional(v.number()),
    skipRecentSuccessDebounce: v.optional(v.boolean()),
  },
  returns: v.object({
    claimed: v.boolean(),
    startedAt: v.optional(v.number()),
    reason: v.optional(
      v.union(v.literal("cooldown"), v.literal("recent_success"), v.literal("in_progress")),
    ),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    claimed: boolean;
    startedAt?: number;
    reason?: "cooldown" | "recent_success" | "in_progress";
  }> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || isVaultDeletingOrDeleteFailed(vault)) {
      return { claimed: false };
    }

    const now = Date.now();
    const debounceMs =
      args.debounceMs === undefined
        ? TREE_REFRESH_DEBOUNCE_MS
        : Math.max(0, Math.floor(args.debounceMs));

    if (!args.force) {
      if (vault.treeRefreshCooldownUntil !== undefined && vault.treeRefreshCooldownUntil > now) {
        return { claimed: false, reason: "cooldown" };
      }

      if (
        !args.skipRecentSuccessDebounce &&
        vault.lastTreeRefreshAt !== undefined &&
        now - vault.lastTreeRefreshAt < debounceMs
      ) {
        return { claimed: false, reason: "recent_success" };
      }

      if (
        vault.treeRefreshStartedAt !== undefined &&
        now - vault.treeRefreshStartedAt < TREE_REFRESH_STALE_LOCK_MS
      ) {
        return { claimed: false, reason: "in_progress" };
      }
    }

    await ctx.db.patch(args.vaultId, { treeRefreshStartedAt: now });
    return { claimed: true, startedAt: now };
  },
});

export const releaseTreeRefresh = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    startedAt: v.number(),
    markRefreshed: v.optional(v.boolean()),
    updateLastTreeRefreshAt: v.optional(v.boolean()),
    failureKind: v.optional(vTreeRefreshFailureKind),
    failureMessage: v.optional(v.string()),
    cooldownUntil: v.optional(v.number()),
  },
  returns: v.object({
    released: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || isVaultDeletingOrDeleteFailed(vault)) {
      return { released: false };
    }

    if (
      !doesTreeRefreshClaimMatch({
        claimedStartedAt: args.startedAt,
        treeRefreshStartedAt: vault.treeRefreshStartedAt,
      })
    ) {
      return { released: false };
    }

    const now = Date.now();
    const cooldownUntil = getLaterCooldownUntil(vault.treeRefreshCooldownUntil, args.cooldownUntil);
    const shouldPreserveCooldownState =
      args.markRefreshed !== false &&
      shouldPreserveTreeRefreshCooldownAfterSuccess({
        claimedStartedAt: args.startedAt,
        lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
        cooldownUntil,
        now,
      });
    await ctx.db.patch(
      args.vaultId,
      args.markRefreshed === false
        ? {
            treeRefreshStartedAt: undefined,
            lastTreeRefreshFailedAt: now,
            treeRefreshFailureKind: args.failureKind ?? "failed",
            treeRefreshFailureMessage: args.failureMessage?.slice(
              0,
              VAULT_TREE_REFRESH_FAILURE_MESSAGE_MAX_LENGTH,
            ),
            treeRefreshCooldownUntil: cooldownUntil,
          }
        : {
            lastTreeRefreshAt:
              args.updateLastTreeRefreshAt === false ? vault.lastTreeRefreshAt : now,
            treeRefreshStartedAt: undefined,
            lastTreeRefreshFailedAt: shouldPreserveCooldownState
              ? vault.lastTreeRefreshFailedAt
              : undefined,
            treeRefreshFailureKind: shouldPreserveCooldownState
              ? vault.treeRefreshFailureKind
              : undefined,
            treeRefreshFailureMessage: shouldPreserveCooldownState
              ? vault.treeRefreshFailureMessage
              : undefined,
            treeRefreshCooldownUntil: shouldPreserveCooldownState ? cooldownUntil : undefined,
          },
    );
    return { released: true };
  },
});

export const recordTreeRefreshFailure = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    startedAt: v.optional(v.number()),
    failureKind: v.optional(vTreeRefreshFailureKind),
    failureMessage: v.optional(v.string()),
    cooldownUntil: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || isVaultDeletingOrDeleteFailed(vault)) {
      return null;
    }
    if (
      args.startedAt !== undefined &&
      !doesTreeRefreshClaimMatch({
        claimedStartedAt: args.startedAt,
        treeRefreshStartedAt: vault.treeRefreshStartedAt,
      })
    ) {
      return null;
    }

    await ctx.db.patch(args.vaultId, {
      lastTreeRefreshFailedAt: Date.now(),
      treeRefreshFailureKind: args.failureKind ?? "failed",
      treeRefreshFailureMessage: args.failureMessage?.slice(
        0,
        VAULT_TREE_REFRESH_FAILURE_MESSAGE_MAX_LENGTH,
      ),
      treeRefreshCooldownUntil: getLaterCooldownUntil(
        vault.treeRefreshCooldownUntil,
        args.cooldownUntil,
      ),
    });
    return null;
  },
});
