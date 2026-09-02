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
import {
  requireRepositoryAuthorityContinuation,
  requireRepositoryOperationLease,
  requireRepositoryOperationStart,
} from "../repositoryMigration/maintenance";
import {
  requireVaultProviderWorkflowContinuation,
  vVaultProviderWorkflowAuthority,
} from "../vaultWorkflowAuthority";

const nullValidator = v.null();
const { boolean, id, literal, number, object, optional, string, union } = v;

type RepositoryOperationLeaseArgs = {
  leaseId?: Id<"repositoryOperationLeases">;
  operationId?: string;
  operationName?: string;
};

async function requireRepositoryOperationAuthority(
  ctx: Pick<MutationCtx, "db">,
  args: RepositoryOperationLeaseArgs,
): Promise<void> {
  if (
    args.leaseId === undefined &&
    args.operationId === undefined &&
    args.operationName === undefined
  ) {
    await requireRepositoryOperationStart(ctx);
    return;
  }
  if (
    args.leaseId === undefined ||
    args.operationId === undefined ||
    args.operationName === undefined
  ) {
    throw new Error("Repository operation lease identity is incomplete.");
  }
  await requireRepositoryOperationLease(ctx, {
    leaseId: args.leaseId,
    operationId: args.operationId,
    operationName: args.operationName,
  });
}

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
    commitSHA: string;
  },
): Promise<void> {
  if (args.treeData.truncated) {
    throw new Error("GitHub returned an incomplete recursive repository tree.");
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("observations_vaultRepository_branchTrees")
    .withIndex("by_vault_and_branch", (q) =>
      q.eq("vaultId", args.vaultId).eq("branch", args.branch),
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

  await ctx.db.insert("observations_vaultRepository_branchTrees", {
    vaultId: args.vaultId,
    branch: args.branch,
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
    commitSHA: string(),
    authority: optional(vVaultProviderWorkflowAuthority),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    if (args.authority === undefined) {
      await requireRepositoryOperationStart(ctx);
    } else {
      await requireVaultProviderWorkflowContinuation(ctx, args.authority);
    }
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

    await requireRepositoryAuthorityContinuation(ctx);
    await writeVaultBranchTree(ctx, args);
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

// Atomically claim the tree refresh lock for a vault.
// Returns the claimed timestamp when this caller should proceed.
export const claimTreeRefresh = internalMutation({
  args: {
    vaultId: id("vaults"),
    leaseId: optional(id("repositoryOperationLeases")),
    operationId: optional(string()),
    operationName: optional(string()),
  },
  returns: vTreeRefreshClaim,
  handler: async (ctx, args): Promise<TreeRefreshClaim> => {
    await requireRepositoryOperationAuthority(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault)) {
      return { claimed: false, reason: "unavailable" };
    }

    const now = Date.now();
    if (
      typeof vault.treeRefreshCooldownUntil === "number" &&
      vault.treeRefreshCooldownUntil > now
    ) {
      return { claimed: false, reason: "cooldown" };
    }

    if (vault.treeRefreshStartedAt && now - vault.treeRefreshStartedAt < STALE_LOCK_MS) {
      return { claimed: false, reason: "in_progress" };
    }

    await ctx.db.patch(args.vaultId, { treeRefreshStartedAt: now });
    return { claimed: true, startedAt: now };
  },
});

export const releaseTreeRefresh = internalMutation({
  args: {
    vaultId: id("vaults"),
    startedAt: number(),
    markRefreshed: boolean(),
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

    await requireRepositoryAuthorityContinuation(ctx);
    const now = Date.now();
    const cooldownUntil = getLaterCooldownUntil(vault.treeRefreshCooldownUntil, args.cooldownUntil);
    const shouldPreserveCooldownState =
      args.markRefreshed &&
      shouldPreserveTreeRefreshCooldownAfterSuccess({
        claimedStartedAt: args.startedAt,
        lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
        cooldownUntil,
        now,
      });
    await ctx.db.patch(
      args.vaultId,
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
    leaseId: optional(id("repositoryOperationLeases")),
    operationId: optional(string()),
    operationName: optional(string()),
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

    if (typeof args.startedAt === "number") {
      await requireRepositoryAuthorityContinuation(ctx);
    } else {
      await requireRepositoryOperationAuthority(ctx, args);
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
