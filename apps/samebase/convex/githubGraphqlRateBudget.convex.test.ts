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
    const firstSnapshotId = await ctx.db.insert("vaultRepositoryInventorySnapshots", {
      state: "collecting",
      vaultId: firstVaultId,
      branchCount: 0,
      pullRequestCount: 0,
      labelCount: 0,
      labelChunkCount: 0,
      labelFacetCount: 0,
      noLabelPullRequestCount: 0,
    });
    const secondSnapshotId = await ctx.db.insert("vaultRepositoryInventorySnapshots", {
      state: "collecting",
      vaultId: secondVaultId,
      branchCount: 0,
      pullRequestCount: 0,
      labelCount: 0,
      labelChunkCount: 0,
      labelFacetCount: 0,
      noLabelPullRequestCount: 0,
    });
    return {
      firstSnapshotId,
      firstVaultId,
      githubAccountId,
      providerConnectionId,
      secondSnapshotId,
      secondVaultId,
      userId,
    };
  });
  return { ids, t };
}

async function claim(
  t: ConvexTest,
  args: {
    githubAccountId: number;
    leaseId: string;
    vaultId: Id<"vaults">;
    snapshotId: Id<"vaultRepositoryInventorySnapshots">;
    estimatedCost?: number;
  },
) {
  return await t.mutation(internal.githubGraphqlRateBudget.claimGitHubGraphqlRateBudget, {
    githubAccountId: args.githubAccountId,
    leaseId: args.leaseId,
    owner: {
      kind: "repository_inventory",
      vaultId: args.vaultId,
      snapshotId: args.snapshotId,
    },
    estimatedCost: args.estimatedCost,
  });
}

async function claimSummaryBatch(
  t: ConvexTest,
  args: {
    githubAccountId: number;
    leaseId: string;
    userId: Id<"users">;
    batchId: string;
  },
) {
  return await t.mutation(internal.githubGraphqlRateBudget.claimGitHubGraphqlRateBudget, {
    githubAccountId: args.githubAccountId,
    leaseId: args.leaseId,
    owner: {
      kind: "repository_summary_batch",
      userId: args.userId,
      batchId: args.batchId,
    },
    estimatedCost: 1,
  });
}

async function readBudget(t: ConvexTest, accountId = githubAccountId) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("githubGraphqlRateBudgets")
      .withIndex("by_githubAccountId", (query) => query.eq("githubAccountId", accountId))
      .unique(),
  );
}

async function readBudgets(t: ConvexTest) {
  return await t.run(async (ctx) => ctx.db.query("githubGraphqlRateBudgets").take(10));
}

describe("GitHub GraphQL account rate budget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("serializes connections that share a GitHub account", async () => {
    const { ids, t } = await createRateBudgetTest();
    const other = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Grace",
        email: "grace@example.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "github",
        userId,
        auth: { method: "oauth", credential: "other-token" },
        githubAccountId: ids.githubAccountId,
        username: "ada",
        createdAt: now,
        updatedAt: now,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const snapshotId = await ctx.db.insert("vaultRepositoryInventorySnapshots", {
        state: "collecting",
        vaultId,
        branchCount: 0,
        pullRequestCount: 0,
        labelCount: 0,
        labelChunkCount: 0,
        labelFacetCount: 0,
        noLabelPullRequestCount: 0,
      });
      return { snapshotId, vaultId };
    });

    const results = await Promise.all([
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-a",
        vaultId: ids.firstVaultId,
        snapshotId: ids.firstSnapshotId,
      }),
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-b",
        vaultId: other.vaultId,
        snapshotId: other.snapshotId,
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

  it("retains lease ownership and only renews the owning lease", async () => {
    const { ids, t } = await createRateBudgetTest();
    await claim(t, {
      githubAccountId: ids.githubAccountId,
      leaseId: "lease-owner",
      vaultId: ids.firstVaultId,
      snapshotId: ids.firstSnapshotId,
    });

    await expect(
      t.mutation(internal.githubGraphqlRateBudget.renewGitHubGraphqlRateBudgetLease, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-stranger",
      }),
    ).resolves.toEqual({ kind: "lost" });

    vi.setSystemTime(now + 40_000);
    await expect(
      t.mutation(internal.githubGraphqlRateBudget.renewGitHubGraphqlRateBudgetLease, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-owner",
      }),
    ).resolves.toEqual({ kind: "retained" });
    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-next",
        vaultId: ids.secondVaultId,
        snapshotId: ids.secondSnapshotId,
      }),
    ).resolves.toEqual({
      kind: "wait",
      reason: "queue",
      retryAt: now + 70_000,
    });
    expect((await readBudget(t))?.lease).toMatchObject({
      leaseId: "lease-owner",
      owner: {
        kind: "repository_inventory",
        vaultId: ids.firstVaultId,
        snapshotId: ids.firstSnapshotId,
      },
      expiresAt: now + 40_000 + leaseDurationMs,
    });
  });

  it("serializes summary batches behind full inventory requests", async () => {
    const { ids, t } = await createRateBudgetTest();
    await claim(t, {
      githubAccountId: ids.githubAccountId,
      leaseId: "inventory-lease",
      vaultId: ids.firstVaultId,
      snapshotId: ids.firstSnapshotId,
    });

    await expect(
      claimSummaryBatch(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "summary-lease",
        userId: ids.userId,
        batchId: "summary-batch",
      }),
    ).resolves.toEqual({
      kind: "wait",
      reason: "queue",
      retryAt: now + 5_000,
    });
  });

  it("uses each request's own estimated cost", async () => {
    const { ids, t } = await createRateBudgetTest();
    const resetAt = now + 60 * 60_000;
    await t.run(async (ctx) => {
      await ctx.db.insert("githubGraphqlRateBudgets", {
        githubAccountId: ids.githubAccountId,
        limit: 5_000,
        remaining: 1_000,
        resetAt,
        consecutiveSecondaryBlocks: 0,
      });
    });

    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-small",
        vaultId: ids.firstVaultId,
        snapshotId: ids.firstSnapshotId,
        estimatedCost: 120,
      }),
    ).resolves.toEqual({ kind: "ready" });
    expect(await readBudget(t)).toMatchObject({
      remaining: 880,
      lease: { leaseId: "lease-small", reservedPoints: 120 },
    });

    await t.mutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetLease, {
      githubAccountId: ids.githubAccountId,
      leaseId: "lease-small",
      durationMs: 1_000,
      outcome: { kind: "failed" },
    });
    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-large",
        vaultId: ids.secondVaultId,
        snapshotId: ids.secondSnapshotId,
        estimatedCost: 300,
      }),
    ).resolves.toEqual({ kind: "ready" });
    expect(await readBudget(t)).toMatchObject({
      remaining: 700,
      lease: { leaseId: "lease-large", reservedPoints: 300 },
    });
  });

  it("preserves the five percent safety floor", async () => {
    const { ids, t } = await createRateBudgetTest();
    const resetAt = now + 60 * 60_000;
    await t.run(async (ctx) => {
      await ctx.db.insert("githubGraphqlRateBudgets", {
        githubAccountId: ids.githubAccountId,
        limit: 5_000,
        remaining: 300,
        resetAt,
        consecutiveSecondaryBlocks: 0,
      });
    });

    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-at-floor",
        vaultId: ids.firstVaultId,
        snapshotId: ids.firstSnapshotId,
        estimatedCost: 50,
      }),
    ).resolves.toEqual({ kind: "ready" });
    await t.mutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetLease, {
      githubAccountId: ids.githubAccountId,
      leaseId: "lease-at-floor",
      durationMs: 1_000,
      outcome: { kind: "failed" },
    });

    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-below-floor",
        vaultId: ids.secondVaultId,
        snapshotId: ids.secondSnapshotId,
        estimatedCost: 51,
      }),
    ).resolves.toEqual({
      kind: "wait",
      reason: "rate_limit",
      retryAt: resetAt,
    });
    expect(await readBudget(t)).toMatchObject({
      remaining: 300,
      block: { kind: "primary", until: resetAt },
    });
  });

  it("records successful observed usage and request duration", async () => {
    const { ids, t } = await createRateBudgetTest();
    const resetAt = now + 60 * 60_000;
    await claim(t, {
      githubAccountId: ids.githubAccountId,
      leaseId: "lease-success",
      vaultId: ids.firstVaultId,
      snapshotId: ids.firstSnapshotId,
    });

    await expect(
      t.mutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetLease, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-success",
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
      }),
    ).resolves.toEqual({});
    expect(await readBudget(t)).toMatchObject({
      limit: 5_000,
      remaining: 4_000,
      resetAt,
      lastCompletedRequestDurationMs: 8_000,
      consecutiveSecondaryBlocks: 0,
    });
    expect((await readBudget(t))?.lease).toBeUndefined();
  });

  it("uses the primary reset window as the cooldown", async () => {
    const { ids, t } = await createRateBudgetTest();
    const resetAt = now + 60 * 60_000;
    await claim(t, {
      githubAccountId: ids.githubAccountId,
      leaseId: "lease-primary",
      vaultId: ids.firstVaultId,
      snapshotId: ids.firstSnapshotId,
    });

    await expect(
      t.mutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetLease, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-primary",
        durationMs: 4_000,
        outcome: {
          kind: "rate_limited",
          limitKind: "primary",
          retryAt: now + 30_000,
          usage: {
            cost: 20,
            limit: 5_000,
            remaining: 100,
            resetAt,
          },
        },
      }),
    ).resolves.toEqual({ retryAt: resetAt });
    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-after-primary",
        vaultId: ids.secondVaultId,
        snapshotId: ids.secondSnapshotId,
      }),
    ).resolves.toEqual({
      kind: "wait",
      reason: "rate_limit",
      retryAt: resetAt,
    });
    expect(await readBudget(t)).toMatchObject({
      remaining: 100,
      block: { kind: "primary", until: resetAt },
    });
  });

  it("backs off consecutive secondary limits", async () => {
    const { ids, t } = await createRateBudgetTest();
    await claim(t, {
      githubAccountId: ids.githubAccountId,
      leaseId: "lease-secondary-1",
      vaultId: ids.firstVaultId,
      snapshotId: ids.firstSnapshotId,
    });

    await expect(
      t.mutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetLease, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-secondary-1",
        durationMs: 4_000,
        outcome: {
          kind: "rate_limited",
          limitKind: "secondary",
          retryAt: now + 5_000,
        },
      }),
    ).resolves.toEqual({ retryAt: now + 60_000 });
    expect(await readBudget(t)).toMatchObject({
      consecutiveSecondaryBlocks: 1,
      block: { kind: "secondary", until: now + 60_000, attempt: 1 },
    });

    vi.setSystemTime(now + 60_001);
    await claim(t, {
      githubAccountId: ids.githubAccountId,
      leaseId: "lease-secondary-2",
      vaultId: ids.secondVaultId,
      snapshotId: ids.secondSnapshotId,
    });
    await expect(
      t.mutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetLease, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-secondary-2",
        durationMs: 4_000,
        outcome: {
          kind: "rate_limited",
          limitKind: "secondary",
          retryAt: now + 65_001,
        },
      }),
    ).resolves.toEqual({ retryAt: now + 180_001 });
    expect(await readBudget(t)).toMatchObject({
      consecutiveSecondaryBlocks: 2,
      block: { kind: "secondary", until: now + 180_001, attempt: 2 },
    });
  });

  it("does not let a late completion clear a newer lease", async () => {
    const { ids, t } = await createRateBudgetTest();
    const resetAt = now + 60 * 60_000;
    await t.run(async (ctx) => {
      await ctx.db.insert("githubGraphqlRateBudgets", {
        githubAccountId: ids.githubAccountId,
        limit: 5_000,
        remaining: 4_000,
        resetAt,
        consecutiveSecondaryBlocks: 0,
        lease: {
          leaseId: "lease-old",
          owner: {
            kind: "repository_inventory",
            vaultId: ids.firstVaultId,
            snapshotId: ids.firstSnapshotId,
          },
          startedAt: now - leaseDurationMs,
          expiresAt: now - 1,
          reservedPoints: 100,
        },
      });
    });
    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-new",
        vaultId: ids.secondVaultId,
        snapshotId: ids.secondSnapshotId,
        estimatedCost: 200,
      }),
    ).resolves.toEqual({ kind: "ready" });

    await expect(
      t.mutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetLease, {
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
    expect(await readBudget(t)).toMatchObject({
      lease: {
        leaseId: "lease-new",
        owner: {
          kind: "repository_inventory",
          vaultId: ids.secondVaultId,
          snapshotId: ids.secondSnapshotId,
        },
      },
    });
    expect((await readBudget(t))?.remaining).toBeUndefined();

    await t.mutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetLease, {
      githubAccountId: ids.githubAccountId,
      leaseId: "lease-old",
      durationMs: 20_000,
      outcome: {
        kind: "rate_limited",
        limitKind: "secondary",
        retryAt: now + 90_000,
      },
    });
    expect(await readBudget(t)).toMatchObject({
      block: { kind: "secondary", until: now + 90_000, attempt: 1 },
      lease: { leaseId: "lease-new" },
    });
    await expect(
      t.mutation(internal.githubGraphqlRateBudget.renewGitHubGraphqlRateBudgetLease, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-new",
      }),
    ).resolves.toEqual({
      kind: "rate_limited",
      retryAt: now + 90_000,
    });
    expect((await readBudget(t))?.lease).toBeUndefined();
  });

  it("clears a deleted vault's lease without refunding uncertain usage", async () => {
    const { ids, t } = await createRateBudgetTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("githubGraphqlRateBudgets", {
        githubAccountId: ids.githubAccountId,
        limit: 5_000,
        remaining: 1_000,
        resetAt: now + 60 * 60_000,
        consecutiveSecondaryBlocks: 0,
      });
    });
    await claim(t, {
      githubAccountId: ids.githubAccountId,
      leaseId: "lease-deleted-vault",
      vaultId: ids.firstVaultId,
      snapshotId: ids.firstSnapshotId,
      estimatedCost: 200,
    });

    await t.mutation(internal.repositoryInventory.quiesceForVaultDeletion, {
      userId: ids.userId,
      vaultId: ids.firstVaultId,
    });

    expect((await readBudget(t))?.remaining).toBeUndefined();
    expect((await readBudget(t))?.lease).toBeUndefined();
    await expect(
      claim(t, {
        githubAccountId: ids.githubAccountId,
        leaseId: "lease-surviving-vault",
        vaultId: ids.secondVaultId,
        snapshotId: ids.secondSnapshotId,
        estimatedCost: 300,
      }),
    ).resolves.toEqual({ kind: "ready" });
    expect(await readBudget(t)).toMatchObject({
      lease: { leaseId: "lease-surviving-vault", reservedPoints: 0 },
    });
    expect((await readBudget(t))?.remaining).toBeUndefined();
  });

  it("deletes an account budget only after its last provider connection leaves", async () => {
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
      leaseId: "old-account",
      vaultId: ids.firstVaultId,
      snapshotId: ids.firstSnapshotId,
    });

    await t.mutation(internal.providerConnections.upsertGithub, {
      userId: ids.userId,
      auth: { method: "api_key", credential: "new-account-token" },
      githubAccountId: 202,
      username: "ada-new",
    });
    expect(
      (await readBudgets(t))
        .map((budget) => budget.githubAccountId)
        .sort((left, right) => left - right),
    ).toEqual([101]);

    await claim(t, {
      githubAccountId: 202,
      leaseId: "new-account",
      vaultId: ids.secondVaultId,
      snapshotId: ids.secondSnapshotId,
    });
    await t.mutation(internal.providerConnections.removeByUserAndKind, {
      userId: otherUserId,
      kind: "github",
    });

    expect(
      (await readBudgets(t))
        .map((budget) => budget.githubAccountId)
        .sort((left, right) => left - right),
    ).toEqual([202]);
  });
});
