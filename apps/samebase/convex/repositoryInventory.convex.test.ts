import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

const now = 1_700_000_000_000;
const emptyCounts = {
  itemCount: 0,
  branchCount: 0,
  pullRequestCount: 0,
};
const emptyGenerationCounts = {
  ...emptyCounts,
  labelChunkCount: 0,
};

async function createConnectedVault() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/inventory",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: now - 3,
      updatedAt: now - 2,
      completedAt: now - 1,
    });
    await ctx.db.replace(vaultId, {
      userId,
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

    return { userId, vaultId };
  });
  const asUser = t.withIdentity({
    subject: `${ids.userId}|test-session`,
    tokenIdentifier: `test:${ids.userId}`,
  });

  return { asUser, ids, t };
}

async function insertPublication(
  t: ConvexTest,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    generation: number;
    fingerprint: string;
    repositoryFullName?: string;
  },
) {
  return await t.run(async (ctx) => {
    await ctx.db.insert("vaultRepositoryInventoryGenerations", {
      userId: args.userId,
      vaultId: args.vaultId,
      generation: args.generation,
      ...emptyGenerationCounts,
      createdAt: now - 10,
    });
    return await ctx.db.insert("vaultRepositoryInventories", {
      userId: args.userId,
      vaultId: args.vaultId,
      repositoryNodeId: "R_inventory",
      repositoryFullName: args.repositoryFullName ?? "ada/inventory",
      activeGeneration: args.generation,
      publishedAt: now - 5,
      fingerprint: args.fingerprint,
      ...emptyCounts,
    });
  });
}

async function insertRunningRefresh(
  t: ConvexTest,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    generation: number;
    demandVersion?: number;
    targetDemandVersion?: number;
    workpoolJobId?: string;
    stagedData?: boolean;
    lastStartedAt?: number;
  },
) {
  return await t.run(async (ctx) => {
    const stagedCounts = args.stagedData
      ? {
          itemCount: 1,
          branchCount: 1,
          pullRequestCount: 0,
          labelChunkCount: 0,
        }
      : emptyGenerationCounts;
    await ctx.db.insert("vaultRepositoryInventoryGenerations", {
      userId: args.userId,
      vaultId: args.vaultId,
      generation: args.generation,
      ...stagedCounts,
      createdAt: now,
    });
    if (args.stagedData) {
      await ctx.db.insert("vaultRepositoryInventoryItems", {
        kind: "branch",
        userId: args.userId,
        vaultId: args.vaultId,
        generation: args.generation,
        kindRank: 2,
        timeRank: -now,
        tie: "feature",
        rowKey: "branch:feature",
        branchLookupKey: "branch:feature",
        lastSyncedAt: now,
        name: "feature",
        repositoryFullName: "ada/inventory",
        headCommitSha: "abc123",
        lastCommitAt: now,
        isDefault: false,
        headCommit: {
          sha: "abc123",
          title: "Test inventory cleanup",
          authoredAt: now,
          committedAt: now,
          checks: {
            state: "success",
            totalCount: 0,
            checkRunCount: 0,
            statusContextCount: 0,
            successCount: 0,
            failureCount: 0,
            runningCount: 0,
            neutralCount: 0,
            unknownCount: 0,
            syncedAt: now,
          },
        },
      });
    }
    return await ctx.db.insert("vaultRepositoryInventoryRefreshes", {
      userId: args.userId,
      vaultId: args.vaultId,
      demandVersion: args.demandVersion ?? 1,
      nextGeneration: args.generation + 1,
      lifecycle: {
        state: "running",
        generation: args.generation,
        targetDemandVersion: args.targetDemandVersion ?? 1,
        startedAt: now,
        leaseExpiresAt: now + 60_000,
        workpoolJobId: args.workpoolJobId ?? `job-${args.generation}`,
      },
      lastStartedAt: args.lastStartedAt ?? now,
      updatedAt: now,
    });
  });
}

async function readInventoryState(t: ConvexTest, vaultId: Id<"vaults">) {
  return await t.run(async (ctx) => {
    const [publication, refresh, generations, items, labelChunks] = await Promise.all([
      ctx.db
        .query("vaultRepositoryInventories")
        .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
        .first(),
      ctx.db
        .query("vaultRepositoryInventoryRefreshes")
        .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
        .first(),
      ctx.db
        .query("vaultRepositoryInventoryGenerations")
        .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
        .collect(),
      ctx.db
        .query("vaultRepositoryInventoryItems")
        .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
        .collect(),
      ctx.db
        .query("vaultRepositoryInventoryLabelChunks")
        .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
        .collect(),
    ]);
    return { publication, refresh, generations, items, labelChunks };
  });
}

async function cleanupFailedGeneration(t: ConvexTest, vaultId: Id<"vaults">) {
  for (let pass = 0; pass < 3; pass += 1) {
    await t.mutation(internal.repositoryInventory.cleanupOldRepositoryInventory, { vaultId });
  }
}

describe("repository inventory refresh state machine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(async () => {
    await Promise.resolve();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("keeps the active generation untouched when the fingerprint is unchanged", async () => {
    const { ids, t } = await createConnectedVault();
    const publicationId = await insertPublication(t, {
      ...ids,
      generation: 1,
      fingerprint: "same-fingerprint",
    });
    await insertRunningRefresh(t, { ...ids, generation: 2 });
    const before = await t.run(async (ctx) => await ctx.db.get(publicationId));

    await expect(
      t.mutation(internal.repositoryInventory.completeUnchangedRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
        generation: 2,
        fingerprint: "same-fingerprint",
      }),
    ).resolves.toBe(true);

    const state = await readInventoryState(t, ids.vaultId);
    expect(state.publication).toEqual(before);
    expect(state.generations.map((generation) => generation.generation)).toEqual([1]);
    expect(state.refresh).toMatchObject({
      lastCheckedAt: now,
      lifecycle: { state: "idle" },
    });
  });

  it("coalesces demand received during a run into one trailing generation", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await insertRunningRefresh(t, { ...ids, generation: 1 });

    await expect(
      asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({ kind: "running" });
    await expect(
      asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({ kind: "running" });

    await t.mutation(internal.repositoryInventory.publishRepositoryInventoryGeneration, {
      vaultId: ids.vaultId,
      generation: 1,
      repositoryNodeId: "R_inventory",
      repositoryFullName: "ada/inventory",
      fingerprint: "generation-one",
      ...emptyCounts,
      labelChunkCount: 0,
    });

    const state = await readInventoryState(t, ids.vaultId);
    expect(state.refresh).toMatchObject({
      demandVersion: 3,
      nextGeneration: 3,
      lifecycle: {
        state: "scheduled",
        generation: 2,
        targetDemandVersion: 3,
        wait: { kind: "queue", retryAt: now + 60_000 },
      },
    });
    expect(state.generations.map((generation) => generation.generation)).toEqual([1]);
    expect(state.publication?.activeGeneration).toBe(1);
  });

  it("preserves early demand and starts it sixty seconds after the prior crawl began", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultRepositoryInventoryRefreshes", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        demandVersion: 1,
        nextGeneration: 2,
        lifecycle: { state: "idle" },
        lastStartedAt: now,
        lastCheckedAt: now + 20_000,
        updatedAt: now + 20_000,
      });
    });
    vi.setSystemTime(now + 59_000);

    await expect(
      asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({ kind: "scheduled" });

    const state = await readInventoryState(t, ids.vaultId);
    expect(state.refresh?.lifecycle).toMatchObject({
      state: "scheduled",
      generation: 2,
      wait: { kind: "queue", retryAt: now + 60_000 },
    });
  });

  it("measures the minimum interval from crawl start instead of completion", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultRepositoryInventoryRefreshes", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        demandVersion: 1,
        nextGeneration: 2,
        lifecycle: { state: "idle" },
        lastStartedAt: now,
        lastCheckedAt: now + 20_000,
        updatedAt: now + 20_000,
      });
    });
    vi.setSystemTime(now + 60_000);

    await expect(
      asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({ kind: "scheduled" });

    const state = await readInventoryState(t, ids.vaultId);
    expect(state.refresh?.lifecycle).toMatchObject({
      state: "scheduled",
      generation: 2,
      wait: { kind: "immediate" },
    });
  });

  it("starts an immediate inventory refresh after a confirmed GitHub write", async () => {
    const { ids, t } = await createConnectedVault();
    await insertPublication(t, {
      ...ids,
      generation: 1,
      fingerprint: "before-write",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultRepositoryInventoryRefreshes", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        demandVersion: 1,
        nextGeneration: 2,
        lifecycle: { state: "idle" },
        lastStartedAt: now,
        lastCheckedAt: now,
        updatedAt: now,
      });
    });

    await expect(
      t.mutation(internal.repositoryInventory.requestRepositoryInventoryRefreshAfterWrite, ids),
    ).resolves.toEqual({ kind: "scheduled" });

    const state = await readInventoryState(t, ids.vaultId);
    expect(state.refresh?.lifecycle).toMatchObject({
      state: "scheduled",
      generation: 2,
      wait: { kind: "immediate" },
    });
  });

  it("rejects publication from a generation that no longer owns the run", async () => {
    const { ids, t } = await createConnectedVault();
    const publicationId = await insertPublication(t, {
      ...ids,
      generation: 1,
      fingerprint: "active",
    });
    await insertRunningRefresh(t, { ...ids, generation: 3 });
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultRepositoryInventoryGenerations", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        generation: 2,
        ...emptyGenerationCounts,
        createdAt: now - 1,
      });
    });
    const before = await t.run(async (ctx) => await ctx.db.get(publicationId));

    await expect(
      t.mutation(internal.repositoryInventory.publishRepositoryInventoryGeneration, {
        vaultId: ids.vaultId,
        generation: 2,
        repositoryNodeId: "R_inventory",
        repositoryFullName: "ada/inventory",
        fingerprint: "stale",
        ...emptyCounts,
        labelChunkCount: 0,
      }),
    ).rejects.toThrow("Repository inventory generation is not running.");

    const state = await readInventoryState(t, ids.vaultId);
    expect(state.publication).toEqual(before);
    expect(state.refresh?.lifecycle).toMatchObject({ state: "running", generation: 3 });
  });

  it.each([
    {
      completion: "failure",
      result: { kind: "failed", error: "GitHub inventory failed." },
      message: "GitHub inventory failed.",
    },
    {
      completion: "cancellation",
      result: { kind: "canceled" },
      message: "Repository inventory worker was canceled.",
    },
  ] as const)("cleans staged data after Workpool $completion", async ({ result, message }) => {
    const { ids, t } = await createConnectedVault();
    await insertPublication(t, {
      ...ids,
      generation: 1,
      fingerprint: "active",
    });
    await insertRunningRefresh(t, {
      ...ids,
      generation: 2,
      stagedData: true,
      workpoolJobId: "job-2",
    });

    await t.mutation(internal.repositoryInventory.handleRepositoryInventoryComplete, {
      // @ts-expect-error Workpool's WorkId brand is type-only; Convex receives the validated string.
      workId: "job-2",
      context: { vaultId: ids.vaultId, generation: 2 },
      result,
    });
    await cleanupFailedGeneration(t, ids.vaultId);

    const state = await readInventoryState(t, ids.vaultId);
    expect(state.refresh?.lifecycle).toEqual({
      state: "failed",
      failedAt: now,
      message,
    });
    expect(state.publication?.activeGeneration).toBe(1);
    expect(state.generations.map((generation) => generation.generation)).toEqual([1]);
    expect(state.items).toEqual([]);
    expect(state.labelChunks).toEqual([]);
  });

  it("reconstructs every pull request label across bounded chunks", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await insertRunningRefresh(t, { ...ids, generation: 1 });
    const rowKey = "pull-request:PR_inventory";
    const labels = Array.from({ length: 125 }, (_, index) => ({
      name: `label-${index}`,
      color: index % 2 === 0 ? "00ff00" : "ff00ff",
    }));

    await t.mutation(internal.repositoryInventory.stageRepositoryInventoryItems, {
      vaultId: ids.vaultId,
      generation: 1,
      items: [
        {
          kind: "pull_request",
          userId: ids.userId,
          vaultId: ids.vaultId,
          generation: 1,
          kindRank: 1,
          timeRank: -now,
          tie: "42",
          rowKey,
          branchLookupKey: "pull-request-head:feature/labels",
          lastSyncedAt: now,
          nodeId: "PR_inventory",
          number: 42,
          url: "https://github.com/ada/inventory/pull/42",
          title: "Keep every label",
          isDraft: false,
          isCrossRepository: false,
          createdAt: now - 1_000,
          updatedAt: now,
          baseRepositoryFullName: "ada/inventory",
          baseRefName: "main",
          headRepositoryId: "123",
          headRepositoryFullName: "ada/inventory",
          headRefName: "feature/labels",
          headCommitSha: "abc123",
          canOpenInSamebase: true,
          headCommit: {
            sha: "abc123",
            title: "Keep every label",
            authoredAt: now - 1_000,
            committedAt: now - 500,
            checks: {
              state: "success",
              totalCount: 0,
              checkRunCount: 0,
              statusContextCount: 0,
              successCount: 0,
              failureCount: 0,
              runningCount: 0,
              neutralCount: 0,
              unknownCount: 0,
              syncedAt: now,
            },
          },
          labelChunkCount: 2,
        },
      ],
    });
    await t.mutation(internal.repositoryInventory.stageRepositoryInventoryLabelChunks, {
      vaultId: ids.vaultId,
      generation: 1,
      labelChunks: [
        {
          userId: ids.userId,
          vaultId: ids.vaultId,
          generation: 1,
          rowKey,
          chunkIndex: 0,
          labels: labels.slice(0, 100),
        },
        {
          userId: ids.userId,
          vaultId: ids.vaultId,
          generation: 1,
          rowKey,
          chunkIndex: 1,
          labels: labels.slice(100),
        },
      ],
    });
    await t.mutation(internal.repositoryInventory.publishRepositoryInventoryGeneration, {
      vaultId: ids.vaultId,
      generation: 1,
      repositoryNodeId: "R_inventory",
      repositoryFullName: "ada/inventory",
      itemCount: 1,
      branchCount: 0,
      pullRequestCount: 1,
      labelChunkCount: 2,
      fingerprint: "labels-across-two-chunks",
    });

    const page = await asUser.query(api.repositoryInventory.listRepositoryInventoryPage, {
      vaultId: ids.vaultId,
      generation: 1,
      paginationOpts: { cursor: null, numItems: 10 },
    });

    expect(page.page).toHaveLength(1);
    expect(page.page[0]).toMatchObject({
      kind: "pull_request",
      rowKey,
      labels,
    });
    expect(page.page[0]).not.toHaveProperty("labelChunkCount");
    expect(page.page[0]).not.toHaveProperty("branchLookupKey");
  });

  it("bounds public repository inventory pages", async () => {
    const { asUser, ids } = await createConnectedVault();

    await expect(
      asUser.query(api.repositoryInventory.listRepositoryInventoryPage, {
        vaultId: ids.vaultId,
        generation: 1,
        paginationOpts: { cursor: null, numItems: 11 },
      }),
    ).rejects.toThrow("Repository inventory pages must request between 1 and 10 items.");
  });

  it("quiesces scheduled work before vault deletion can continue", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await expect(
      asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({ kind: "scheduled" });
    const scheduled = (await readInventoryState(t, ids.vaultId)).refresh;
    if (scheduled?.lifecycle.state !== "scheduled") {
      throw new Error("Expected a scheduled repository inventory refresh.");
    }

    await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      userId: ids.userId,
      vaultId: ids.vaultId,
      options: {
        removeCodespaces: false,
        removeGithubRepo: false,
        removeConvexProvision: false,
        removeCloudflareProvision: false,
      },
    });
    await t.mutation(internal.repositoryInventory.quiesceForVaultDeletion, ids);

    const state = await readInventoryState(t, ids.vaultId);
    expect(state.refresh?.lifecycle).toEqual({
      state: "failed",
      failedAt: now,
      message: "Repository inventory stopped for vault deletion.",
    });
    await expect(
      t.mutation(internal.repositoryInventory.claimRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
        generation: scheduled.lifecycle.generation,
      }),
    ).resolves.toEqual({ kind: "cancel" });
    await expect(
      asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow("Vault not found.");
  });
});

describe("repository inventory branch context", () => {
  const checks = {
    state: "success" as const,
    totalCount: 0,
    checkRunCount: 0,
    statusContextCount: 0,
    successCount: 0,
    failureCount: 0,
    runningCount: 0,
    neutralCount: 0,
    unknownCount: 0,
    syncedAt: now,
  };

  it("does not claim that a branch is missing before the first complete publication", async () => {
    const { asUser, ids } = await createConnectedVault();

    await expect(
      asUser.query(api.repositoryInventory.getRepositoryInventoryBranchContext, {
        vaultId: ids.vaultId,
        branch: "feature/new",
      }),
    ).resolves.toEqual({ state: "unpublished" });
  });

  it("returns exact-case branch metadata and the newest same-repository open pull request", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await insertPublication(t, {
      ...ids,
      generation: 1,
      fingerprint: "canonical-branch-context",
      repositoryFullName: "Ada/Renamed",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultRepositoryInventoryItems", {
        kind: "branch",
        userId: ids.userId,
        vaultId: ids.vaultId,
        generation: 1,
        kindRank: 0,
        timeRank: 0,
        tie: "trunk",
        rowKey: "branch:trunk",
        branchLookupKey: "branch:trunk",
        lastSyncedAt: now,
        name: "trunk",
        repositoryFullName: "Ada/Renamed",
        headCommitSha: "default-sha",
        lastCommitAt: now - 2_000,
        isDefault: true,
        headCommit: {
          sha: "default-sha",
          committedAt: now - 2_000,
          checks,
        },
      });
      await ctx.db.insert("vaultRepositoryInventoryItems", {
        kind: "branch",
        userId: ids.userId,
        vaultId: ids.vaultId,
        generation: 1,
        kindRank: 2,
        timeRank: -now,
        tie: "Feature/Case",
        rowKey: "branch:Feature/Case",
        branchLookupKey: "branch:Feature/Case",
        lastSyncedAt: now,
        name: "Feature/Case",
        repositoryFullName: "Ada/Renamed",
        headCommitSha: "feature-sha",
        lastCommitAt: now,
        isDefault: false,
        headCommit: {
          sha: "feature-sha",
          committedAt: now,
          checks,
        },
      });
      for (const pullRequest of [
        {
          nodeId: "PR_older",
          number: 40,
          updatedAt: now - 1_000,
          isCrossRepository: false,
          canOpenInSamebase: true,
        },
        {
          nodeId: "PR_newest_same_repository",
          number: 42,
          updatedAt: now,
          isCrossRepository: false,
          canOpenInSamebase: true,
        },
        {
          nodeId: "PR_newest_fork",
          number: 43,
          updatedAt: now + 1_000,
          isCrossRepository: true,
          canOpenInSamebase: false,
        },
      ]) {
        await ctx.db.insert("vaultRepositoryInventoryItems", {
          kind: "pull_request",
          userId: ids.userId,
          vaultId: ids.vaultId,
          generation: 1,
          kindRank: 1,
          timeRank: -pullRequest.updatedAt,
          tie: String(pullRequest.number),
          rowKey: `pull-request:${pullRequest.nodeId}`,
          branchLookupKey: pullRequest.canOpenInSamebase
            ? "pull-request-head:Feature/Case"
            : `pull-request:${pullRequest.nodeId}`,
          lastSyncedAt: now,
          nodeId: pullRequest.nodeId,
          number: pullRequest.number,
          url: `https://github.com/Ada/Renamed/pull/${pullRequest.number}`,
          title: `Pull request ${pullRequest.number}`,
          isDraft: pullRequest.number === 42,
          isCrossRepository: pullRequest.isCrossRepository,
          createdAt: now - 10_000,
          updatedAt: pullRequest.updatedAt,
          baseRepositoryFullName: "Ada/Renamed",
          baseRefName: pullRequest.number === 42 ? "release/1.2" : "trunk",
          headRepositoryId: pullRequest.isCrossRepository ? "R_fork" : "R_inventory",
          headRepositoryFullName: pullRequest.isCrossRepository
            ? "Contributor/Renamed"
            : "Ada/Renamed",
          headRefName: "Feature/Case",
          headCommitSha: "feature-sha",
          canOpenInSamebase: pullRequest.canOpenInSamebase,
          headCommit: {
            sha: "feature-sha",
            committedAt: now,
            checks,
          },
          labelChunkCount: 0,
        });
      }
    });

    const expectedContext = {
      state: "ready",
      repositoryFullName: "Ada/Renamed",
      defaultBranch: "trunk",
      branch: {
        name: "Feature/Case",
        headCommitSha: "feature-sha",
        isDefault: false,
        headCommit: {
          sha: "feature-sha",
          committedAt: now,
          checks,
        },
      },
      pullRequest: {
        number: 42,
        url: "https://github.com/Ada/Renamed/pull/42",
        isDraft: true,
        baseRefName: "release/1.2",
      },
    } as const;
    await expect(
      asUser.query(api.repositoryInventory.getRepositoryInventoryBranchContext, {
        vaultId: ids.vaultId,
        branch: "Feature/Case",
      }),
    ).resolves.toEqual(expectedContext);
    await expect(
      t.query(internal.repositoryInventory.getRepositoryInventoryBranchContextForUser, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        branch: "Feature/Case",
      }),
    ).resolves.toEqual(expectedContext);
    await expect(
      asUser.query(api.repositoryInventory.getRepositoryInventoryBranchContext, {
        vaultId: ids.vaultId,
        branch: "feature/case",
      }),
    ).resolves.toEqual({
      state: "missing",
      repositoryFullName: "Ada/Renamed",
      defaultBranch: "trunk",
    });
    const page = await asUser.query(api.repositoryInventory.listRepositoryInventoryPage, {
      vaultId: ids.vaultId,
      generation: 1,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(page.page).not.toContainEqual(
      expect.objectContaining({ branchLookupKey: expect.anything() }),
    );
  });
});
