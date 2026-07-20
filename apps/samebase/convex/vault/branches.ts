import { v, type Infer } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import {
  doesTreeRefreshClaimMatch,
  shouldPreserveTreeRefreshCooldownAfterSuccess,
  TREE_REFRESH_STALE_LOCK_MS,
} from "../../shared/treeRefresh";
import { vGithubTreeData, vTreeRefreshFailureKind } from "./model";
import { isLiveConnectedVault } from "./state";

const nullValidator = v.null();
const { boolean, id, literal, number, object, optional, string, union } = v;

export const getVaultBranchTree = internalQuery({
  args: {
    vaultId: id("vaults"),
    branch: string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("observations_vaultRepository_branchTrees")
      .withIndex("by_vault_and_branch", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch),
      )
      .first();
  },
});

async function writeVaultBranchTree(
  ctx: MutationCtx,
  args: {
    vaultId: Id<"vaults">;
    branch: string;
    treeData: Infer<typeof vGithubTreeData>;
    commitSHA?: string;
  },
): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db
    .query("observations_vaultRepository_branchTrees")
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
    });
    return;
  }

  await ctx.db.insert("observations_vaultRepository_branchTrees", {
    vaultId: args.vaultId,
    branch: args.branch,
    treeSHA: args.treeData.sha,
    commitSHA: args.commitSHA,
    treeData: args.treeData,
    lastTreeRefreshAt: now,
  });
}

export const upsertVaultBranchTree = internalMutation({
  args: {
    vaultId: id("vaults"),
    branch: string(),
    treeData: vGithubTreeData,
    commitSHA: optional(string()),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault)) {
      return null;
    }

    await writeVaultBranchTree(ctx, args);

    return null;
  },
});

/**
 * Publishes a provider tree only while this refresh still owns the vault lock.
 * A timed-out request therefore cannot overwrite a newer branch generation.
 */
export const upsertClaimedVaultBranchTree = internalMutation({
  args: {
    vaultId: id("vaults"),
    branch: string(),
    startedAt: number(),
    treeData: vGithubTreeData,
    commitSHA: string(),
  },
  returns: object({
    written: boolean(),
  }),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (
      !isLiveConnectedVault(vault) ||
      !doesTreeRefreshClaimMatch({
        claimedStartedAt: args.startedAt,
        treeRefreshStartedAt: vault.treeRefreshStartedAt,
      })
    ) {
      return { written: false };
    }

    await writeVaultBranchTree(ctx, args);
    return { written: true };
  },
});

const STALE_LOCK_MS = TREE_REFRESH_STALE_LOCK_MS;

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

// Atomically claim the tree refresh lock for a vault.
// Returns the claimed timestamp when this caller should proceed.
export const claimTreeRefresh = internalMutation({
  args: {
    vaultId: id("vaults"),
    force: optional(boolean()),
  },
  returns: object({
    claimed: boolean(),
    startedAt: optional(number()),
    reason: optional(union(literal("cooldown"), literal("in_progress"))),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    claimed: boolean;
    startedAt?: number;
    reason?: "cooldown" | "in_progress";
  }> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault)) {
      return { claimed: false };
    }

    const now = Date.now();
    if (!args.force) {
      if (
        typeof vault.treeRefreshCooldownUntil === "number" &&
        vault.treeRefreshCooldownUntil > now
      ) {
        return { claimed: false, reason: "cooldown" };
      }

      if (vault.treeRefreshStartedAt && now - vault.treeRefreshStartedAt < STALE_LOCK_MS) {
        return { claimed: false, reason: "in_progress" };
      }
    }

    await ctx.db.patch(args.vaultId, { treeRefreshStartedAt: now });
    return { claimed: true, startedAt: now };
  },
});

export const releaseTreeRefresh = internalMutation({
  args: {
    vaultId: id("vaults"),
    startedAt: number(),
    markRefreshed: optional(boolean()),
    failureKind: optional(vTreeRefreshFailureKind),
    failureMessage: optional(string()),
    cooldownUntil: optional(number()),
  },
  returns: object({
    released: boolean(),
  }),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault)) {
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
            treeRefreshFailureMessage: args.failureMessage,
            treeRefreshCooldownUntil: cooldownUntil,
          }
        : {
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
    vaultId: id("vaults"),
    startedAt: optional(number()),
    failureKind: optional(vTreeRefreshFailureKind),
    failureMessage: optional(string()),
    cooldownUntil: optional(number()),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault)) {
      return null;
    }
    if (
      typeof args.startedAt === "number" &&
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
      treeRefreshFailureMessage: args.failureMessage,
      treeRefreshCooldownUntil: getLaterCooldownUntil(
        vault.treeRefreshCooldownUntil,
        args.cooldownUntil,
      ),
    });
    return null;
  },
});
