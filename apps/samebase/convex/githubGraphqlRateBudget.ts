import { Infer, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";

const { boolean, id, literal, number, object, optional, string, union } = v;

const GITHUB_GRAPHQL_RATE_BUDGET_LEASE_MS = 2 * 60_000;
const GITHUB_GRAPHQL_DEFAULT_CRAWL_RESERVATION = 128;
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

const vGitHubGraphqlRateLease = object({
  leaseId: string(),
  vaultId: id("vaults"),
  generation: number(),
  startedAt: number(),
  expiresAt: number(),
  reservedPoints: number(),
});

export const vGitHubGraphqlRateBudget = object({
  githubAccountId: number(),
  limit: optional(number()),
  remaining: optional(number()),
  resetAt: optional(number()),
  nextAllowedAt: optional(number()),
  maxCompletedCrawlCostInWindow: optional(number()),
  lastCompletedCrawlDurationMs: optional(number()),
  consecutiveSecondaryBlocks: number(),
  block: optional(vGitHubGraphqlRateBlock),
  lease: optional(vGitHubGraphqlRateLease),
  updatedAt: number(),
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

const vGitHubGraphqlCrawlOutcome = union(
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

function safetyFloor(limit: number): number {
  return Math.max(
    GITHUB_GRAPHQL_MINIMUM_SAFETY_FLOOR,
    Math.ceil(limit * GITHUB_GRAPHQL_SAFETY_FLOOR_RATIO),
  );
}

function retryAfterActiveLease(budget: GitHubGraphqlRateBudgetDoc, now: number): number {
  if (budget.lease === undefined) {
    return now;
  }
  const expectedDuration = Math.max(budget.lastCompletedCrawlDurationMs ?? 5_000, 5_000);
  const expectedFinish = budget.lease.startedAt + expectedDuration;
  return Math.min(
    budget.lease.expiresAt + 1_000,
    expectedFinish > now ? expectedFinish : now + GITHUB_GRAPHQL_ACTIVE_LEASE_RECHECK_MS,
  );
}

function resetExpiredWindow(
  budget: GitHubGraphqlRateBudgetDoc,
  now: number,
): Pick<
  GitHubGraphqlRateBudgetDoc,
  "remaining" | "resetAt" | "nextAllowedAt" | "maxCompletedCrawlCostInWindow"
> {
  if (budget.resetAt === undefined || budget.resetAt > now) {
    return {
      remaining: budget.remaining,
      resetAt: budget.resetAt,
      nextAllowedAt: budget.nextAllowedAt,
      maxCompletedCrawlCostInWindow: budget.maxCompletedCrawlCostInWindow,
    };
  }
  return {
    remaining: budget.limit,
    resetAt: undefined,
    nextAllowedAt: undefined,
    maxCompletedCrawlCostInWindow: undefined,
  };
}

export const claimGitHubGraphqlRateBudget = internalMutation({
  args: {
    githubAccountId: number(),
    leaseId: string(),
    vaultId: id("vaults"),
    generation: number(),
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
          vaultId: args.vaultId,
          generation: args.generation,
          startedAt: now,
          expiresAt: now + GITHUB_GRAPHQL_RATE_BUDGET_LEASE_MS,
          reservedPoints: 0,
        },
        updatedAt: now,
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
    if (window.nextAllowedAt !== undefined && window.nextAllowedAt > now) {
      return {
        kind: "wait",
        reason: "queue",
        retryAt: window.nextAllowedAt,
      };
    }
    const reservedPoints =
      window.remaining === undefined
        ? 0
        : (window.maxCompletedCrawlCostInWindow ?? GITHUB_GRAPHQL_DEFAULT_CRAWL_RESERVATION);
    if (
      existing.limit !== undefined &&
      window.remaining !== undefined &&
      window.remaining - reservedPoints < safetyFloor(existing.limit)
    ) {
      const retryAt = window.resetAt ?? now + GITHUB_GRAPHQL_SECONDARY_BACKOFF_MS;
      await ctx.db.patch(existing._id, {
        ...window,
        lease: undefined,
        block: {
          kind: "primary",
          until: retryAt,
        },
        updatedAt: now,
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
        vaultId: args.vaultId,
        generation: args.generation,
        startedAt: now,
        expiresAt: now + GITHUB_GRAPHQL_RATE_BUDGET_LEASE_MS,
        reservedPoints,
      },
      updatedAt: now,
    });
    return { kind: "ready" };
  },
});

export const renewGitHubGraphqlRateBudgetLease = internalMutation({
  args: {
    githubAccountId: number(),
    leaseId: string(),
    extendLease: boolean(),
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
        nextAllowedAt: Math.max(budget.nextAllowedAt ?? 0, budget.block.until),
        remaining: budget.lease.reservedPoints > 0 ? undefined : budget.remaining,
        lease: undefined,
        updatedAt: now,
      });
      return { kind: "rate_limited", retryAt: budget.block.until } as const;
    }
    if (args.extendLease) {
      await ctx.db.patch(budget._id, {
        lease: {
          ...budget.lease,
          expiresAt: now + GITHUB_GRAPHQL_RATE_BUDGET_LEASE_MS,
        },
        updatedAt: now,
      });
    }
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
      maxCompletedCrawlCostInWindow: budget.maxCompletedCrawlCostInWindow,
    };
  }
  const sameWindow = budget.resetAt === undefined || budget.resetAt === usage.resetAt;
  return {
    limit: usage.limit,
    remaining: usage.remaining,
    resetAt: usage.resetAt,
    maxCompletedCrawlCostInWindow: sameWindow ? budget.maxCompletedCrawlCostInWindow : undefined,
  };
}

function nextAllowedAt(args: {
  now: number;
  usage: GitHubGraphqlRateUsage;
  maxCompletedCrawlCostInWindow: number;
}): number {
  const available = args.usage.remaining - safetyFloor(args.usage.limit);
  const crawlsRemaining = Math.floor(available / args.maxCompletedCrawlCostInWindow);
  if (crawlsRemaining <= 0) {
    return args.usage.resetAt + 1_000;
  }
  return args.now + Math.ceil(Math.max(0, args.usage.resetAt - args.now) / crawlsRemaining);
}

export const finishGitHubGraphqlRateBudgetCrawl = internalMutation({
  args: {
    githubAccountId: number(),
    leaseId: string(),
    durationMs: number(),
    outcome: vGitHubGraphqlCrawlOutcome,
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
        nextAllowedAt?: number;
        block?:
          | { kind: "primary"; until: number }
          | { kind: "secondary"; until: number; attempt: number };
        updatedAt?: number;
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
        patch.nextAllowedAt = Math.max(budget.nextAllowedAt ?? 0, block.until);
        patch.block = block;
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(budget._id, {
          ...patch,
          updatedAt: now,
        });
      }
      return {};
    }

    switch (args.outcome.kind) {
      case "success": {
        const maxCompletedCrawlCostInWindow = Math.max(
          observed.maxCompletedCrawlCostInWindow ?? 0,
          args.outcome.usage.cost,
          1,
        );
        const scheduledAt = nextAllowedAt({
          now,
          usage: args.outcome.usage,
          maxCompletedCrawlCostInWindow,
        });
        const activeBlock =
          budget.block !== undefined && budget.block.until > now ? budget.block : undefined;
        await ctx.db.patch(budget._id, {
          ...observed,
          maxCompletedCrawlCostInWindow,
          lastCompletedCrawlDurationMs: args.durationMs,
          nextAllowedAt: Math.max(scheduledAt, activeBlock?.until ?? 0),
          consecutiveSecondaryBlocks:
            activeBlock?.kind === "secondary" ? budget.consecutiveSecondaryBlocks : 0,
          block: activeBlock,
          lease: undefined,
          updatedAt: now,
        });
        return { retryAt: scheduledAt };
      }
      case "failed": {
        const remaining =
          usage === undefined && budget.remaining !== undefined
            ? Math.min(
                budget.limit ?? Number.POSITIVE_INFINITY,
                budget.remaining + budget.lease.reservedPoints,
              )
            : observed.remaining;
        await ctx.db.patch(budget._id, {
          ...observed,
          remaining,
          lease: undefined,
          updatedAt: now,
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
          nextAllowedAt: block.until,
          lease: undefined,
          updatedAt: now,
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
    .withIndex("by_lease_vaultId", (q) => q.eq("lease.vaultId", vaultId))
    .take(100);
  for (const budget of budgets) {
    await ctx.db.patch(budget._id, {
      remaining:
        budget.lease !== undefined && budget.lease.reservedPoints > 0
          ? undefined
          : budget.remaining,
      lease: undefined,
      updatedAt: Date.now(),
    });
  }
}
