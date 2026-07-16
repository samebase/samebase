import { Infer, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";

const { id, literal, number, object, optional, string, union } = v;

const GITHUB_GRAPHQL_RATE_BUDGET_LEASE_MS = 2 * 60_000;
const GITHUB_GRAPHQL_DEFAULT_REQUEST_RESERVATION = 128;
const GITHUB_GRAPHQL_MINIMUM_SAFETY_FLOOR = 50;
const GITHUB_GRAPHQL_SAFETY_FLOOR_RATIO = 0.05;
const GITHUB_GRAPHQL_SECONDARY_BACKOFF_MS = 60_000;
const GITHUB_GRAPHQL_MAX_SECONDARY_BACKOFF_MS = 60 * 60_000;
const GITHUB_GRAPHQL_ACTIVE_LEASE_RECHECK_MS = 30_000;

export const vGitHubGraphqlRateUsage = object({
  cost: number(),
  limit: number(),
  remaining: number(),
  resetAt: number(),
});
export type GitHubGraphqlRateUsage = Infer<typeof vGitHubGraphqlRateUsage>;

const vGitHubGraphqlRateBlock = union(
  object({
    kind: literal("primary"),
    until: number(),
  }),
  object({
    kind: literal("secondary"),
    until: number(),
    attempt: number(),
  }),
);

export const vGitHubGraphqlRateLeaseOwner = union(
  object({
    kind: literal("repository_inventory"),
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
  }),
  object({
    kind: literal("repository_inventory_checks"),
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
  }),
  object({
    kind: literal("repository_summary_batch"),
    userId: id("users"),
    batchId: string(),
  }),
);

const vGitHubGraphqlRateLease = object({
  leaseId: string(),
  owner: vGitHubGraphqlRateLeaseOwner,
  startedAt: number(),
  expiresAt: number(),
  reservedPoints: number(),
});

export const vGitHubGraphqlRateBudget = object({
  githubAccountId: number(),
  limit: optional(number()),
  remaining: optional(number()),
  resetAt: optional(number()),
  lastCompletedRequestDurationMs: optional(number()),
  consecutiveSecondaryBlocks: number(),
  block: optional(vGitHubGraphqlRateBlock),
  lease: optional(vGitHubGraphqlRateLease),
});

const vGitHubGraphqlRateBudgetClaimResult = union(
  object({
    kind: literal("ready"),
  }),
  object({
    kind: literal("wait"),
    reason: union(literal("queue"), literal("rate_limit")),
    retryAt: number(),
  }),
);
export type GitHubGraphqlRateBudgetClaimResult = Infer<typeof vGitHubGraphqlRateBudgetClaimResult>;

const vGitHubGraphqlRequestOutcome = union(
  object({
    kind: literal("success"),
    usage: vGitHubGraphqlRateUsage,
  }),
  object({
    kind: literal("failed"),
    usage: optional(vGitHubGraphqlRateUsage),
  }),
  object({
    kind: literal("rate_limited"),
    limitKind: union(literal("primary"), literal("secondary")),
    retryAt: number(),
    usage: optional(vGitHubGraphqlRateUsage),
  }),
);

type GitHubGraphqlRateBudgetDoc = Doc<"githubGraphqlRateBudgets">;

async function readRateBudget(
  ctx: Pick<MutationCtx, "db">,
  githubAccountId: number,
): Promise<GitHubGraphqlRateBudgetDoc | null> {
  return await ctx.db
    .query("githubGraphqlRateBudgets")
    .withIndex("by_githubAccountId", (q) => q.eq("githubAccountId", githubAccountId))
    .unique();
}

export function githubGraphqlRateSafetyFloor(limit: number): number {
  return Math.max(
    GITHUB_GRAPHQL_MINIMUM_SAFETY_FLOOR,
    Math.ceil(limit * GITHUB_GRAPHQL_SAFETY_FLOOR_RATIO),
  );
}

function retryAfterActiveLease(budget: GitHubGraphqlRateBudgetDoc, now: number): number {
  if (budget.lease === undefined) {
    return now;
  }
  const expectedDuration = Math.max(budget.lastCompletedRequestDurationMs ?? 5_000, 5_000);
  const expectedFinish = budget.lease.startedAt + expectedDuration;
  return Math.min(
    budget.lease.expiresAt + 1_000,
    expectedFinish > now ? expectedFinish : now + GITHUB_GRAPHQL_ACTIVE_LEASE_RECHECK_MS,
  );
}

function resetExpiredWindow(
  budget: GitHubGraphqlRateBudgetDoc,
  now: number,
): Pick<GitHubGraphqlRateBudgetDoc, "remaining" | "resetAt"> {
  if (budget.resetAt === undefined || budget.resetAt > now) {
    return {
      remaining: budget.remaining,
      resetAt: budget.resetAt,
    };
  }
  return {
    remaining: budget.limit,
    resetAt: undefined,
  };
}

export const claimGitHubGraphqlRateBudget = internalMutation({
  args: {
    githubAccountId: number(),
    leaseId: string(),
    owner: vGitHubGraphqlRateLeaseOwner,
    estimatedCost: optional(number()),
  },
  returns: vGitHubGraphqlRateBudgetClaimResult,
  handler: async (ctx, args): Promise<GitHubGraphqlRateBudgetClaimResult> => {
    const now = Date.now();
    const existing = await readRateBudget(ctx, args.githubAccountId);
    if (existing === null) {
      await ctx.db.insert("githubGraphqlRateBudgets", {
        githubAccountId: args.githubAccountId,
        consecutiveSecondaryBlocks: 0,
        lease: {
          leaseId: args.leaseId,
          owner: args.owner,
          startedAt: now,
          expiresAt: now + GITHUB_GRAPHQL_RATE_BUDGET_LEASE_MS,
          reservedPoints: 0,
        },
      });
      return { kind: "ready" };
    }

    if (existing.block !== undefined && existing.block.until > now) {
      return {
        kind: "wait",
        reason: "rate_limit",
        retryAt: existing.block.until,
      };
    }
    if (existing.lease !== undefined && existing.lease.expiresAt > now) {
      return {
        kind: "wait",
        reason: "queue",
        retryAt: retryAfterActiveLease(existing, now),
      };
    }

    const resetWindow = resetExpiredWindow(existing, now);
    const window = {
      ...resetWindow,
      remaining:
        existing.lease !== undefined &&
        existing.lease.expiresAt <= now &&
        existing.lease.reservedPoints > 0 &&
        existing.resetAt !== undefined &&
        existing.resetAt > now
          ? undefined
          : resetWindow.remaining,
    };
    const reservedPoints =
      window.remaining === undefined
        ? 0
        : (args.estimatedCost ?? GITHUB_GRAPHQL_DEFAULT_REQUEST_RESERVATION);
    if (
      existing.limit !== undefined &&
      window.remaining !== undefined &&
      window.remaining - reservedPoints < githubGraphqlRateSafetyFloor(existing.limit)
    ) {
      const retryAt = window.resetAt ?? now + GITHUB_GRAPHQL_SECONDARY_BACKOFF_MS;
      await ctx.db.patch(existing._id, {
        ...window,
        lease: undefined,
        block: {
          kind: "primary",
          until: retryAt,
        },
      });
      return {
        kind: "wait",
        reason: "rate_limit",
        retryAt,
      };
    }

    await ctx.db.patch(existing._id, {
      ...window,
      remaining: window.remaining === undefined ? undefined : window.remaining - reservedPoints,
      block: undefined,
      lease: {
        leaseId: args.leaseId,
        owner: args.owner,
        startedAt: now,
        expiresAt: now + GITHUB_GRAPHQL_RATE_BUDGET_LEASE_MS,
        reservedPoints,
      },
    });
    return { kind: "ready" };
  },
});

export const renewGitHubGraphqlRateBudgetLease = internalMutation({
  args: {
    githubAccountId: number(),
    leaseId: string(),
  },
  returns: union(
    object({ kind: literal("retained") }),
    object({ kind: literal("lost") }),
    object({ kind: literal("rate_limited"), retryAt: number() }),
  ),
  handler: async (ctx, args) => {
    const budget = await readRateBudget(ctx, args.githubAccountId);
    if (!budget || budget.lease?.leaseId !== args.leaseId) {
      return { kind: "lost" } as const;
    }
    const now = Date.now();
    if (budget.block !== undefined && budget.block.until > now) {
      await ctx.db.patch(budget._id, {
        remaining: budget.lease.reservedPoints > 0 ? undefined : budget.remaining,
        lease: undefined,
      });
      return { kind: "rate_limited", retryAt: budget.block.until } as const;
    }
    await ctx.db.patch(budget._id, {
      lease: {
        ...budget.lease,
        expiresAt: now + GITHUB_GRAPHQL_RATE_BUDGET_LEASE_MS,
      },
    });
    return { kind: "retained" } as const;
  },
});

function applyRateUsage(
  budget: GitHubGraphqlRateBudgetDoc,
  usage: GitHubGraphqlRateUsage | undefined,
) {
  if (usage === undefined) {
    return {
      limit: budget.limit,
      remaining: budget.remaining,
      resetAt: budget.resetAt,
    };
  }
  return {
    limit: usage.limit,
    remaining: usage.remaining,
    resetAt: usage.resetAt,
  };
}

export const finishGitHubGraphqlRateBudgetLease = internalMutation({
  args: {
    githubAccountId: number(),
    leaseId: string(),
    durationMs: number(),
    outcome: vGitHubGraphqlRequestOutcome,
  },
  returns: object({
    retryAt: optional(number()),
  }),
  handler: async (ctx, args): Promise<{ retryAt?: number }> => {
    const budget = await readRateBudget(ctx, args.githubAccountId);
    if (!budget) {
      return {};
    }
    const now = Date.now();
    const usage = args.outcome.usage;
    const observed = applyRateUsage(budget, usage);
    if (budget.lease?.leaseId !== args.leaseId) {
      const patch: {
        remaining?: number;
        block?:
          | { kind: "primary"; until: number }
          | { kind: "secondary"; until: number; attempt: number };
      } = {};
      if (
        usage !== undefined &&
        budget.resetAt === usage.resetAt &&
        budget.remaining !== undefined &&
        usage.remaining < budget.remaining
      ) {
        patch.remaining = usage.remaining;
      }
      if (args.outcome.kind === "rate_limited") {
        const candidateUntil = Math.max(
          args.outcome.retryAt,
          args.outcome.limitKind === "primary" ? (usage?.resetAt ?? 0) : 0,
        );
        const candidateBlock =
          args.outcome.limitKind === "primary"
            ? ({ kind: "primary", until: candidateUntil } as const)
            : {
                kind: "secondary" as const,
                until: candidateUntil,
                attempt: Math.max(budget.consecutiveSecondaryBlocks, 1),
              };
        const block =
          budget.block !== undefined && budget.block.until >= candidateBlock.until
            ? budget.block
            : candidateBlock;
        patch.block = block;
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(budget._id, {
          ...patch,
        });
      }
      return {};
    }

    switch (args.outcome.kind) {
      case "success": {
        const activeBlock =
          budget.block !== undefined && budget.block.until > now ? budget.block : undefined;
        await ctx.db.patch(budget._id, {
          ...observed,
          lastCompletedRequestDurationMs: args.durationMs,
          consecutiveSecondaryBlocks:
            activeBlock?.kind === "secondary" ? budget.consecutiveSecondaryBlocks : 0,
          block: activeBlock,
          lease: undefined,
        });
        return {};
      }
      case "failed": {
        await ctx.db.patch(budget._id, {
          ...observed,
          lease: undefined,
        });
        return {};
      }
      case "rate_limited": {
        const secondaryAttempt = budget.consecutiveSecondaryBlocks + 1;
        const exponentialBackoff = Math.min(
          GITHUB_GRAPHQL_SECONDARY_BACKOFF_MS * 2 ** (secondaryAttempt - 1),
          GITHUB_GRAPHQL_MAX_SECONDARY_BACKOFF_MS,
        );
        const candidateRetryAt =
          args.outcome.limitKind === "primary"
            ? Math.max(args.outcome.retryAt, usage?.resetAt ?? 0)
            : Math.max(args.outcome.retryAt, now + exponentialBackoff);
        const candidateBlock =
          args.outcome.limitKind === "primary"
            ? ({ kind: "primary", until: candidateRetryAt } as const)
            : ({
                kind: "secondary",
                until: candidateRetryAt,
                attempt: secondaryAttempt,
              } as const);
        const block =
          budget.block !== undefined &&
          budget.block.until > now &&
          budget.block.until >= candidateBlock.until
            ? budget.block
            : candidateBlock;
        await ctx.db.patch(budget._id, {
          ...observed,
          consecutiveSecondaryBlocks:
            block.kind === "secondary"
              ? Math.max(budget.consecutiveSecondaryBlocks, block.attempt)
              : 0,
          block,
          lease: undefined,
        });
        return { retryAt: block.until };
      }
      default: {
        args.outcome satisfies never;
        return {};
      }
    }
  },
});

export async function clearGitHubGraphqlRateBudgetLeaseForVault(
  ctx: MutationCtx,
  vaultId: Id<"vaults">,
): Promise<void> {
  const budgets = await ctx.db
    .query("githubGraphqlRateBudgets")
    .withIndex("by_inventory_lease_vaultId", (q) => q.eq("lease.owner.vaultId", vaultId))
    .take(100);
  for (const budget of budgets) {
    if (
      budget.lease?.owner.kind !== "repository_inventory" &&
      budget.lease?.owner.kind !== "repository_inventory_checks"
    ) {
      continue;
    }
    await ctx.db.patch(budget._id, {
      remaining: budget.lease.reservedPoints > 0 ? undefined : budget.remaining,
      lease: undefined,
    });
  }
}
