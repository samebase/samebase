import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

const now = 1_700_000_000_000;
const leaseDurationMs = 2 * 60_000;
const githubAccountId = 101;

async function createRateBudgetTest() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const providerConnectionId = await ctx.db.insert("providerConnections", {
      kind: "github",
      userId,
      auth: {
        method: "api_key",
        credential: "github-token",
      },
      githubAccountId,
      username: "ada",
      createdAt: now,
      updatedAt: now,
    });
    const firstVaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const secondVaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    return { firstVaultId, githubAccountId, providerConnectionId, secondVaultId, userId };
  });
  return { ids, t };
}

async function claim(
  t: ConvexTest,
  args: {
    githubAccountId: number;
    leaseId: string;
    vaultId: Id<"vaults">;
    generation?: number;
  },
) {
  return await t.mutation(internal.githubGraphqlRateBudget.claimGitHubGraphqlRateBudget, {
    ...args,
    generation: args.generation ?? 1,
  });
}

async function readBudgets(t: ConvexTest) {
  return await t.run(async (ctx) => await ctx.db.query("githubGraphqlRateBudgets").collect());
}

describe("GitHub GraphQL account rate budget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("serializes duplicate connections for the same GitHub account", async () => {
    const { ids, t } = await createRateBudgetTest();
    const otherVaultId = await t.run(async (ctx) => {
      const otherUserId = await ctx.db.insert("users", {
        name: "Grace",
        email: "grace@example.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "github",
        userId: otherUserId,
        auth: { method: "oauth", credential: "other-token" },
        githubAccountId: ids.githubAccountId,
        username: "ada",
        createdAt: now,
        updatedAt: now,
      });
      return await ctx.db.insert("vaults", {
        userId: otherUserId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
    });

    const results = await Promise.all([
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-a",
        vaultId: ids.firstVaultId,
      }),
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-b",
        vaultId: otherVaultId,
      }),
    ]);

    expect(results).toEqual(
      expect.arrayContaining([
        { kind: "ready" },
        {
          kind: "wait",
          reason: "queue",
          retryAt: now + 5_000,
        },
      ]),
    );
    expect(await readBudgets(t)).toHaveLength(1);
  });

  it("returns the active lease retry time without replacing its owner", async () => {
    const { ids, t } = await createRateBudgetTest();
    await claim(t, {
      githubAccountId: ids.githubAccountId,
      leaseId: "lease-a",
      vaultId: ids.firstVaultId,
    });

    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-b",
        vaultId: ids.secondVaultId,
      }),
    ).resolves.toEqual({
      kind: "wait",
      reason: "queue",
      retryAt: now + 5_000,
    });
    expect((await readBudgets(t))[0]?.lease).toMatchObject({
      leaseId: "lease-a",
      vaultId: ids.firstVaultId,
    });
  });

  it("preserves the five percent safety floor after a primary block expires", async () => {
    const { ids, t } = await createRateBudgetTest();
    const resetAt = now + 60 * 60_000;
    await t.run(async (ctx) => {
      await ctx.db.insert("githubGraphqlRateBudgets", {
        githubAccountId: ids.githubAccountId,
        limit: 5_000,
        remaining: 300,
        resetAt,
        consecutiveSecondaryBlocks: 0,
        block: { kind: "primary", until: now + 10_000 },
        updatedAt: now,
      });
    });

    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-a",
        vaultId: ids.firstVaultId,
      }),
    ).resolves.toEqual({
      kind: "wait",
      reason: "rate_limit",
      retryAt: now + 10_000,
    });

    vi.setSystemTime(now + 10_001);
    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-b",
        vaultId: ids.secondVaultId,
      }),
    ).resolves.toEqual({
      kind: "wait",
      reason: "rate_limit",
      retryAt: resetAt,
    });
    expect((await readBudgets(t))[0]).toMatchObject({
      remaining: 300,
      block: { kind: "primary", until: resetAt },
    });
  });

  it("paces successful crawls using their observed cost and reset window", async () => {
    const { ids, t } = await createRateBudgetTest();
    const resetAt = now + 60 * 60_000;
    await claim(t, {
      githubAccountId: ids.githubAccountId,
      leaseId: "lease-a",
      vaultId: ids.firstVaultId,
    });

    const result = await t.mutation(
      internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetCrawl,
      {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-a",
        durationMs: 8_000,
        outcome: {
          kind: "success",
          usage: {
            cost: 20,
            limit: 5_000,
            remaining: 4_000,
            resetAt,
          },
        },
      },
    );
    const expectedRetryAt = now + Math.ceil((resetAt - now) / 187);

    expect(result).toEqual({ retryAt: expectedRetryAt });
    expect((await readBudgets(t))[0]).toMatchObject({
      remaining: 4_000,
      maxCompletedCrawlCostInWindow: 20,
      lastCompletedCrawlDurationMs: 8_000,
      nextAllowedAt: expectedRetryAt,
      consecutiveSecondaryBlocks: 0,
    });
    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-b",
        vaultId: ids.secondVaultId,
      }),
    ).resolves.toEqual({
      kind: "wait",
      reason: "queue",
      retryAt: expectedRetryAt,
    });
  });

  it("persists a provider rate-limit cooldown", async () => {
    const { ids, t } = await createRateBudgetTest();
    await claim(t, {
      githubAccountId: ids.githubAccountId,
      leaseId: "lease-a",
      vaultId: ids.firstVaultId,
    });

    await expect(
      t.mutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetCrawl, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-a",
        durationMs: 4_000,
        outcome: {
          kind: "rate_limited",
          limitKind: "secondary",
          retryAt: now + 5_000,
        },
      }),
    ).resolves.toEqual({ retryAt: now + 60_000 });
    const budget = (await readBudgets(t))[0];
    expect(budget).toMatchObject({
      block: { kind: "secondary", until: now + 60_000, attempt: 1 },
      consecutiveSecondaryBlocks: 1,
      nextAllowedAt: now + 60_000,
    });
    expect(budget.lease).toBeUndefined();
    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-b",
        vaultId: ids.secondVaultId,
      }),
    ).resolves.toEqual({
      kind: "wait",
      reason: "rate_limit",
      retryAt: now + 60_000,
    });
  });

  it("preserves a stricter late block when the active crawl is also rate limited", async () => {
    const { ids, t } = await createRateBudgetTest();
    await claim(t, {
      githubAccountId: ids.githubAccountId,
      leaseId: "lease-current",
      vaultId: ids.firstVaultId,
    });
    await t.run(async (ctx) => {
      const budget = await ctx.db
        .query("githubGraphqlRateBudgets")
        .withIndex("by_githubAccountId", (query) =>
          query.eq("githubAccountId", ids.githubAccountId),
        )
        .unique();
      if (!budget) {
        throw new Error("Expected a GitHub rate budget.");
      }
      await ctx.db.patch(budget._id, {
        block: { kind: "secondary", until: now + 90_000, attempt: 2 },
        nextAllowedAt: now + 90_000,
        consecutiveSecondaryBlocks: 2,
      });
    });

    await expect(
      t.mutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetCrawl, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-current",
        durationMs: 10_000,
        outcome: {
          kind: "rate_limited",
          limitKind: "primary",
          retryAt: now + 30_000,
          usage: {
            cost: 1,
            limit: 5_000,
            remaining: 4_900,
            resetAt: now + 60_000,
          },
        },
      }),
    ).resolves.toEqual({ retryAt: now + 90_000 });
    expect((await readBudgets(t))[0]).toMatchObject({
      block: { kind: "secondary", until: now + 90_000, attempt: 2 },
      nextAllowedAt: now + 90_000,
      consecutiveSecondaryBlocks: 2,
    });
  });

  it("does not let a late lease completion clear a newer lease or increase remaining", async () => {
    const { ids, t } = await createRateBudgetTest();
    const resetAt = now + 60 * 60_000;
    await t.run(async (ctx) => {
      await ctx.db.insert("githubGraphqlRateBudgets", {
        githubAccountId: ids.githubAccountId,
        limit: 5_000,
        remaining: 4_000,
        resetAt,
        maxCompletedCrawlCostInWindow: 100,
        consecutiveSecondaryBlocks: 0,
        lease: {
          leaseId: "lease-old",
          vaultId: ids.firstVaultId,
          generation: 1,
          startedAt: now - leaseDurationMs,
          expiresAt: now - 1,
          reservedPoints: 100,
        },
        updatedAt: now - 1,
      });
    });
    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-new",
        vaultId: ids.secondVaultId,
        generation: 2,
      }),
    ).resolves.toEqual({ kind: "ready" });

    await expect(
      t.mutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetCrawl, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-old",
        durationMs: 20_000,
        outcome: {
          kind: "success",
          usage: {
            cost: 100,
            limit: 5_000,
            remaining: 4_200,
            resetAt,
          },
        },
      }),
    ).resolves.toEqual({});
    const budgetAfterLateSuccess = (await readBudgets(t))[0];
    expect(budgetAfterLateSuccess).toMatchObject({
      lease: {
        leaseId: "lease-new",
        vaultId: ids.secondVaultId,
        generation: 2,
      },
    });
    expect(budgetAfterLateSuccess.remaining).toBeUndefined();

    await expect(
      t.mutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetCrawl, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-old",
        durationMs: 20_000,
        outcome: {
          kind: "rate_limited",
          limitKind: "secondary",
          retryAt: now + 90_000,
        },
      }),
    ).resolves.toEqual({});
    expect((await readBudgets(t))[0]).toMatchObject({
      block: { kind: "secondary", until: now + 90_000 },
      lease: {
        leaseId: "lease-new",
        vaultId: ids.secondVaultId,
      },
    });
    await expect(
      t.mutation(internal.githubGraphqlRateBudget.renewGitHubGraphqlRateBudgetLease, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-new",
        extendLease: false,
      }),
    ).resolves.toEqual({
      kind: "rate_limited",
      retryAt: now + 90_000,
    });
    expect((await readBudgets(t))[0]?.lease).toBeUndefined();
  });

  it("preserves a late rate-limit block when the newer lease succeeds", async () => {
    const { ids, t } = await createRateBudgetTest();
    const resetAt = now + 60 * 60_000;
    await t.run(async (ctx) => {
      await ctx.db.insert("githubGraphqlRateBudgets", {
        githubAccountId: ids.githubAccountId,
        limit: 5_000,
        remaining: 4_900,
        resetAt,
        maxCompletedCrawlCostInWindow: 1,
        consecutiveSecondaryBlocks: 0,
        lease: {
          leaseId: "lease-old",
          vaultId: ids.firstVaultId,
          generation: 1,
          startedAt: now - leaseDurationMs,
          expiresAt: now - 1,
          reservedPoints: 1,
        },
        updatedAt: now - 1,
      });
    });
    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-new",
        vaultId: ids.secondVaultId,
        generation: 2,
      }),
    ).resolves.toEqual({ kind: "ready" });

    await expect(
      t.mutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetCrawl, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-old",
        durationMs: 20_000,
        outcome: {
          kind: "rate_limited",
          limitKind: "secondary",
          retryAt: now + 90_000,
        },
      }),
    ).resolves.toEqual({});

    const result = await t.mutation(
      internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetCrawl,
      {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-new",
        durationMs: 8_000,
        outcome: {
          kind: "success",
          usage: {
            cost: 1,
            limit: 5_000,
            remaining: 4_898,
            resetAt,
          },
        },
      },
    );
    const expectedPacingAt = now + Math.ceil((resetAt - now) / Math.floor((4_898 - 250) / 1));

    expect(result).toEqual({ retryAt: expectedPacingAt });
    expect((await readBudgets(t))[0]).toMatchObject({
      remaining: 4_898,
      nextAllowedAt: now + 90_000,
      block: { kind: "secondary", until: now + 90_000, attempt: 1 },
    });
    expect((await readBudgets(t))[0]?.lease).toBeUndefined();
  });

  it("aborts and defers an active crawl when a late response installs a block", async () => {
    const { ids, t } = await createRateBudgetTest();
    await t.run(async (ctx) => {
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.firstVaultId,
        repositoryFullName: "ada/inventory",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: now - 3,
        updatedAt: now - 2,
        completedAt: now - 1,
      });
      await ctx.db.replace(ids.firstVaultId, {
        userId: ids.userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "inventory",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: now,
      });
      await ctx.db.insert("vaultRepositoryInventoryRefreshes", {
        userId: ids.userId,
        vaultId: ids.firstVaultId,
        demandVersion: 1,
        nextGeneration: 2,
        lifecycle: {
          state: "scheduled",
          generation: 1,
          targetDemandVersion: 1,
          scheduledAt: now,
          workpoolJobId: "job-1",
          wait: { kind: "immediate" },
        },
        updatedAt: now,
      });
      await ctx.db.insert("githubGraphqlRateBudgets", {
        githubAccountId: ids.githubAccountId,
        limit: 5_000,
        remaining: 4_000,
        resetAt: now + 60 * 60_000,
        maxCompletedCrawlCostInWindow: 100,
        consecutiveSecondaryBlocks: 0,
        updatedAt: now,
      });
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url !== "https://api.github.com/repositories/123") {
          throw new Error(`Unexpected GitHub request after rate block: ${url}`);
        }
        await t.mutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetCrawl, {
          githubAccountId: ids.githubAccountId,
          leaseId: "stale-lease",
          durationMs: 20_000,
          outcome: {
            kind: "rate_limited",
            limitKind: "secondary",
            retryAt: now + 90_000,
          },
        });
        return new Response(
          JSON.stringify({ id: 123, node_id: "R_inventory", full_name: "ada/inventory" }),
          {
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    await expect(
      t.action(internal.repositoryInventoryActions.runRepositoryInventoryRefresh, {
        vaultId: ids.firstVaultId,
        generation: 1,
      }),
    ).resolves.toBeNull();
    await expect(
      t.run(async (ctx) => {
        return await ctx.db
          .query("vaultRepositoryInventoryRefreshes")
          .withIndex("by_vault", (query) => query.eq("vaultId", ids.firstVaultId))
          .unique();
      }),
    ).resolves.toMatchObject({
      lifecycle: {
        state: "scheduled",
        wait: { kind: "rate_limit", retryAt: now + 90_000 },
      },
    });
    expect((await readBudgets(t))[0]).toMatchObject({
      block: { kind: "secondary", until: now + 90_000 },
    });
    expect((await readBudgets(t))[0]?.lease).toBeUndefined();
    expect((await readBudgets(t))[0]?.remaining).toBeUndefined();
  });

  it("invalidates a synthetic reservation when reclaiming an expired crawl", async () => {
    const { ids, t } = await createRateBudgetTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("githubGraphqlRateBudgets", {
        githubAccountId: ids.githubAccountId,
        limit: 5_000,
        remaining: 4_000,
        resetAt: now + 60 * 60_000,
        maxCompletedCrawlCostInWindow: 100,
        consecutiveSecondaryBlocks: 0,
        lease: {
          leaseId: "lease-old",
          vaultId: ids.firstVaultId,
          generation: 1,
          startedAt: now - leaseDurationMs,
          expiresAt: now - 1,
          reservedPoints: 100,
        },
        updatedAt: now - 1,
      });
    });

    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-new",
        vaultId: ids.secondVaultId,
        generation: 2,
      }),
    ).resolves.toEqual({ kind: "ready" });
    expect((await readBudgets(t))[0]?.lease).toMatchObject({
      leaseId: "lease-new",
      vaultId: ids.secondVaultId,
      generation: 2,
      expiresAt: now + leaseDurationMs,
      reservedPoints: 0,
    });
    expect((await readBudgets(t))[0]?.remaining).toBeUndefined();
  });

  it("refunds an owned reservation when a crawl fails before observing usage", async () => {
    const { ids, t } = await createRateBudgetTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("githubGraphqlRateBudgets", {
        githubAccountId: ids.githubAccountId,
        limit: 5_000,
        remaining: 4_000,
        resetAt: now + 60 * 60_000,
        maxCompletedCrawlCostInWindow: 100,
        consecutiveSecondaryBlocks: 0,
        updatedAt: now,
      });
    });
    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-failed",
        vaultId: ids.firstVaultId,
      }),
    ).resolves.toEqual({ kind: "ready" });
    expect((await readBudgets(t))[0]).toMatchObject({
      remaining: 3_900,
      lease: { reservedPoints: 100 },
    });

    await expect(
      t.mutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetCrawl, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-failed",
        durationMs: 1_000,
        outcome: { kind: "failed" },
      }),
    ).resolves.toEqual({});
    expect((await readBudgets(t))[0]).toMatchObject({ remaining: 4_000 });
    expect((await readBudgets(t))[0]?.lease).toBeUndefined();
  });

  it("keeps an old principal budget until the last shared connection leaves", async () => {
    const { ids, t } = await createRateBudgetTest();
    const otherUserId = await t.run(async (ctx) => {
      const inserted = await ctx.db.insert("users", {
        name: "Grace",
        email: "grace@example.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "github",
        userId: inserted,
        auth: { method: "api_key", credential: "shared-token" },
        githubAccountId: ids.githubAccountId,
        username: "ada",
        createdAt: now,
        updatedAt: now,
      });
      return inserted;
    });
    await claim(t, {
      githubAccountId: ids.githubAccountId,
      leaseId: "old-principal",
      vaultId: ids.firstVaultId,
    });

    await t.mutation(internal.providerConnections.upsertGithub, {
      userId: ids.userId,
      auth: { method: "api_key", credential: "new-account-token" },
      githubAccountId: 202,
      username: "ada-new",
    });
    expect(await readBudgets(t)).toMatchObject([{ githubAccountId: ids.githubAccountId }]);

    await expect(
      claim(t, {
        githubAccountId: 202,
        leaseId: "new-principal",
        vaultId: ids.secondVaultId,
      }),
    ).resolves.toEqual({ kind: "ready" });
    await t.mutation(internal.providerConnections.removeByUserAndKind, {
      userId: otherUserId,
      kind: "github",
    });

    expect(await readBudgets(t)).toMatchObject([{ githubAccountId: 202 }]);
  });

  it("keeps one budget when the token rotates on the same provider connection", async () => {
    const { ids, t } = await createRateBudgetTest();

    await claim(t, {
      githubAccountId: ids.githubAccountId,
      leaseId: "lease-old-token",
      vaultId: ids.firstVaultId,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.providerConnectionId, {
        auth: {
          method: "api_key",
          credential: "github-token-rotated",
        },
        updatedAt: now + 1,
      });
    });

    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-new-token",
        vaultId: ids.secondVaultId,
      }),
    ).resolves.toEqual({
      kind: "wait",
      reason: "queue",
      retryAt: now + 5_000,
    });
    const budgets = await readBudgets(t);
    expect(budgets).toHaveLength(1);
    expect(budgets[0]).toMatchObject({
      githubAccountId: ids.githubAccountId,
      lease: {
        leaseId: "lease-old-token",
        vaultId: ids.firstVaultId,
      },
    });
  });
});
