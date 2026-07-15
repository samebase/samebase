import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type {
  RepositoryInventoryLifecycle,
  RepositoryInventoryPublication,
} from "./repositoryInventoryModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

const now = 1_700_000_000_000;
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

async function insertSnapshot(
  t: ConvexTest,
  args: {
    vaultId: Id<"vaults">;
    branchCount?: number;
    pullRequestCount?: number;
    labelCount?: number;
    labelChunkCount?: number;
  },
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("vaultRepositoryInventorySnapshots", {
        vaultId: args.vaultId,
        branchCount: args.branchCount ?? 0,
        pullRequestCount: args.pullRequestCount ?? 0,
        labelCount: args.labelCount ?? 0,
        labelChunkCount: args.labelChunkCount ?? 0,
      }),
  );
}

function publication(
  snapshotId: Id<"vaultRepositoryInventorySnapshots">,
  overrides: Partial<RepositoryInventoryPublication> = {},
): RepositoryInventoryPublication {
  return {
    snapshotId,
    repositoryNodeId: "R_inventory",
    repositoryFullName: "ada/inventory",
    defaultBranch: "main",
    publishedAt: now - 5_000,
    checkedAt: now - 5_000,
    fingerprint: "published-fingerprint",
    ...overrides,
  };
}

async function insertInventory(
  t: ConvexTest,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    lifecycle: RepositoryInventoryLifecycle;
    publication?: RepositoryInventoryPublication;
    wantedUntil?: number;
    writeVersion?: number;
    lastStartedAt?: number;
  },
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("vaultRepositoryInventories", {
        userId: args.userId,
        vaultId: args.vaultId,
        wantedUntil: args.wantedUntil ?? now + 135_000,
        writeVersion: args.writeVersion ?? 0,
        lifecycle: args.lifecycle,
        publication: args.publication,
        lastStartedAt: args.lastStartedAt,
      }),
  );
}

async function readVaultInventory(t: ConvexTest, vaultId: Id<"vaults">) {
  return await t.run(async (ctx) => {
    const [inventory, snapshots, items, labelChunks] = await Promise.all([
      ctx.db
        .query("vaultRepositoryInventories")
        .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
        .unique(),
      ctx.db
        .query("vaultRepositoryInventorySnapshots")
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
    return { inventory, snapshots, items, labelChunks };
  });
}

async function insertBranch(
  t: ConvexTest,
  args: {
    vaultId: Id<"vaults">;
    snapshotId: Id<"vaultRepositoryInventorySnapshots">;
    name: string;
    isDefault?: boolean;
    sortTime?: number;
  },
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("vaultRepositoryInventoryItems", {
        kind: "branch",
        vaultId: args.vaultId,
        snapshotId: args.snapshotId,
        sortGroup: args.isDefault ? 0 : 2,
        sortTime: args.sortTime ?? -now,
        rowKey: `branch:${args.name}`,
        name: args.name,
        isDefault: args.isDefault ?? false,
        headCommit: {
          sha: `${args.name}-sha`,
          title: `${args.name} commit`,
          authoredAt: now,
          checks,
        },
      }),
  );
}

async function insertPullRequest(
  t: ConvexTest,
  args: {
    vaultId: Id<"vaults">;
    snapshotId: Id<"vaultRepositoryInventorySnapshots">;
    rowKey: string;
    number: number;
    headRefName: string;
    sortTime: number;
    canOpenInSamebase: boolean;
    labelCount?: number;
    labelChunkCount?: number;
  },
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("vaultRepositoryInventoryItems", {
        kind: "pull_request",
        vaultId: args.vaultId,
        snapshotId: args.snapshotId,
        sortGroup: 1,
        sortTime: args.sortTime,
        rowKey: args.rowKey,
        number: args.number,
        url: `https://github.com/ada/inventory/pull/${args.number}`,
        title: `Pull request ${args.number}`,
        isDraft: args.number === 42,
        baseRefName: args.number === 42 ? "release/1.2" : "main",
        headRepositoryFullName: args.canOpenInSamebase ? "ada/inventory" : "contributor/fork",
        headRefName: args.headRefName,
        canOpenInSamebase: args.canOpenInSamebase,
        localHeadRefName: args.canOpenInSamebase ? args.headRefName : undefined,
        labelCount: args.labelCount ?? 0,
        labelChunkCount: args.labelChunkCount ?? 0,
        headCommit: {
          sha: `${args.headRefName}-sha`,
          title: `Pull request ${args.number}`,
          authoredAt: now,
          checks,
        },
      }),
  );
}

describe("repository inventory refresh state machine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("coalesces ordinary visible demand without scheduling a trailing crawl", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const snapshotId = await insertSnapshot(t, ids);
    await insertInventory(t, {
      ...ids,
      lifecycle: {
        state: "running",
        snapshotId,
        targetWriteVersion: 0,
        required: false,
        startedAt: now,
        workpoolJobId: "job-visible",
      },
    });

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

    await t.mutation(internal.repositoryInventory.publishRepositoryInventorySnapshot, {
      vaultId: ids.vaultId,
      snapshotId,
      repositoryNodeId: "R_inventory",
      repositoryFullName: "ada/inventory",
      defaultBranch: "main",
      branchCount: 0,
      pullRequestCount: 0,
      labelCount: 0,
      labelChunkCount: 0,
      fingerprint: "first-publication",
      crawlCost: 12,
    });

    const state = await readVaultInventory(t, ids.vaultId);
    expect(state.inventory).toMatchObject({
      writeVersion: 0,
      lifecycle: { state: "idle" },
      publication: { snapshotId, fingerprint: "first-publication" },
    });
    expect(state.snapshots).toHaveLength(1);
  });

  it("schedules exactly one immediate trailing snapshot after writes during a crawl", async () => {
    const { ids, t } = await createConnectedVault();
    const snapshotId = await insertSnapshot(t, ids);
    await insertInventory(t, {
      ...ids,
      lifecycle: {
        state: "running",
        snapshotId,
        targetWriteVersion: 0,
        required: false,
        startedAt: now,
        workpoolJobId: "job-write",
      },
    });

    await t.mutation(internal.repositoryInventory.requestRepositoryInventoryRefreshAfterWrite, ids);
    await t.mutation(internal.repositoryInventory.requestRepositoryInventoryRefreshAfterWrite, ids);
    await t.mutation(internal.repositoryInventory.publishRepositoryInventorySnapshot, {
      vaultId: ids.vaultId,
      snapshotId,
      repositoryNodeId: "R_inventory",
      repositoryFullName: "ada/inventory",
      defaultBranch: "main",
      branchCount: 0,
      pullRequestCount: 0,
      labelCount: 0,
      labelChunkCount: 0,
      fingerprint: "after-write",
      crawlCost: 15,
    });

    const state = await readVaultInventory(t, ids.vaultId);
    expect(state.inventory).toMatchObject({
      writeVersion: 2,
      publication: { snapshotId },
      lifecycle: {
        state: "scheduled",
        targetWriteVersion: 2,
        required: true,
        wait: { kind: "immediate" },
      },
    });
    expect(state.snapshots).toHaveLength(2);
  });

  it("drops an ordinary deferred crawl after visible demand expires", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await expect(
      asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({ kind: "scheduled" });
    const scheduled = (await readVaultInventory(t, ids.vaultId)).inventory;
    if (scheduled?.lifecycle.state !== "scheduled") {
      throw new Error("Expected a scheduled repository inventory refresh.");
    }

    vi.setSystemTime(now + 135_001);
    await expect(
      t.mutation(internal.repositoryInventory.claimRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
        snapshotId: scheduled.lifecycle.snapshotId,
      }),
    ).resolves.toEqual({ kind: "cancel" });
    await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
      inventory: { lifecycle: { state: "idle" } },
    });
  });

  it("delays repeated ordinary demand from the prior crawl start", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await insertInventory(t, {
      ...ids,
      lifecycle: { state: "idle" },
      lastStartedAt: now,
    });
    vi.setSystemTime(now + 59_000);

    await expect(
      asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({ kind: "scheduled" });
    await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
      inventory: {
        lifecycle: {
          state: "scheduled",
          wait: { kind: "queue", retryAt: now + 60_000 },
        },
      },
    });
  });

  it("keeps the published snapshot and advances checkedAt after an unchanged crawl", async () => {
    const { ids, t } = await createConnectedVault();
    const activeSnapshotId = await insertSnapshot(t, ids);
    const stagingSnapshotId = await insertSnapshot(t, ids);
    await insertInventory(t, {
      ...ids,
      lifecycle: {
        state: "running",
        snapshotId: stagingSnapshotId,
        targetWriteVersion: 0,
        required: false,
        startedAt: now,
        workpoolJobId: "job-unchanged",
      },
      publication: publication(activeSnapshotId),
    });

    await expect(
      t.mutation(internal.repositoryInventory.completeUnchangedRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
        snapshotId: stagingSnapshotId,
        fingerprint: "published-fingerprint",
        crawlCost: 18,
      }),
    ).resolves.toBe(true);

    const state = await readVaultInventory(t, ids.vaultId);
    expect(state.inventory).toMatchObject({
      lifecycle: { state: "idle" },
      estimatedCrawlCost: 18,
      publication: {
        snapshotId: activeSnapshotId,
        publishedAt: now - 5_000,
        checkedAt: now,
      },
    });
    expect(state.snapshots.map((snapshot) => snapshot._id)).toEqual([activeSnapshotId]);
  });

  it("rejects incomplete publication without disturbing the active snapshot", async () => {
    const { ids, t } = await createConnectedVault();
    const activeSnapshotId = await insertSnapshot(t, ids);
    const stagingSnapshotId = await insertSnapshot(t, ids);
    await insertInventory(t, {
      ...ids,
      lifecycle: {
        state: "running",
        snapshotId: stagingSnapshotId,
        targetWriteVersion: 0,
        required: false,
        startedAt: now,
        workpoolJobId: "job-incomplete",
      },
      publication: publication(activeSnapshotId),
    });

    await expect(
      t.mutation(internal.repositoryInventory.publishRepositoryInventorySnapshot, {
        vaultId: ids.vaultId,
        snapshotId: stagingSnapshotId,
        repositoryNodeId: "R_inventory",
        repositoryFullName: "ada/inventory",
        defaultBranch: "main",
        branchCount: 1,
        pullRequestCount: 0,
        labelCount: 0,
        labelChunkCount: 0,
        fingerprint: "incomplete",
        crawlCost: 5,
      }),
    ).rejects.toThrow("Repository inventory snapshot counts are incomplete.");

    await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
      inventory: {
        publication: { snapshotId: activeSnapshotId },
        lifecycle: { state: "running", snapshotId: stagingSnapshotId },
      },
    });
  });

  it("treats Workpool success without publication as an invariant failure", async () => {
    const { ids, t } = await createConnectedVault();
    const snapshotId = await insertSnapshot(t, ids);
    await insertInventory(t, {
      ...ids,
      lifecycle: {
        state: "running",
        snapshotId,
        targetWriteVersion: 0,
        required: false,
        startedAt: now,
        workpoolJobId: "job-unpublished",
      },
    });

    await t.mutation(internal.repositoryInventory.handleRepositoryInventoryComplete, {
      // @ts-expect-error Workpool persists its branded WorkId as this validated string.
      workId: "job-unpublished",
      context: { vaultId: ids.vaultId, snapshotId },
      result: { kind: "success", returnValue: null },
    });

    await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
      inventory: {
        lifecycle: {
          state: "failed",
          failedAt: now,
          message: "Repository inventory worker completed without publishing its snapshot.",
        },
      },
    });
  });
});

describe("repository inventory snapshot reads", () => {
  it("returns point-in-time items and labels without storage-only fields", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const snapshotId = await insertSnapshot(t, {
      vaultId: ids.vaultId,
      branchCount: 1,
      pullRequestCount: 1,
      labelCount: 3,
      labelChunkCount: 2,
    });
    await insertBranch(t, {
      vaultId: ids.vaultId,
      snapshotId,
      name: "main",
      isDefault: true,
      sortTime: 0,
    });
    const rowKey = "pull-request:PR_42";
    await insertPullRequest(t, {
      vaultId: ids.vaultId,
      snapshotId,
      rowKey,
      number: 42,
      headRefName: "feature/labels",
      sortTime: -now,
      canOpenInSamebase: true,
      labelCount: 3,
      labelChunkCount: 2,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultRepositoryInventoryLabelChunks", {
        vaultId: ids.vaultId,
        snapshotId,
        rowKey,
        chunkIndex: 0,
        labels: [{ name: "bug", color: "ff0000" }, { name: "priority" }],
      });
      await ctx.db.insert("vaultRepositoryInventoryLabelChunks", {
        vaultId: ids.vaultId,
        snapshotId,
        rowKey,
        chunkIndex: 1,
        labels: [{ name: "ready", color: "00ff00" }],
      });
    });

    const itemPage = await asUser.query(api.repositoryInventory.listRepositoryInventoryPage, {
      vaultId: ids.vaultId,
      snapshotId,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(itemPage).toMatchObject({
      state: "ready",
      expectedItemCount: 2,
      isDone: true,
      page: [
        { kind: "branch", rowKey: "branch:main", name: "main", isDefault: true },
        { kind: "pull_request", rowKey, number: 42, labelCount: 3 },
      ],
    });
    expect(itemPage).not.toHaveProperty("page.1.labelChunkCount");
    expect(itemPage).not.toHaveProperty("page.1.localHeadRefName");

    const labelPage = await asUser.query(api.repositoryInventory.listRepositoryInventoryLabelPage, {
      vaultId: ids.vaultId,
      snapshotId,
      rowKey,
      paginationOpts: { cursor: null, numItems: 5 },
    });
    expect(labelPage).toMatchObject({
      state: "ready",
      expectedLabelCount: 3,
      expectedChunkCount: 2,
      isDone: true,
      page: [
        {
          chunkIndex: 0,
          labels: [{ name: "bug", color: "ff0000" }, { name: "priority" }],
        },
        { chunkIndex: 1, labels: [{ name: "ready", color: "00ff00" }] },
      ],
    });
  });

  it("distinguishes a removed snapshot from a valid empty snapshot", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const snapshotId = await insertSnapshot(t, ids);
    await expect(
      asUser.query(api.repositoryInventory.listRepositoryInventoryPage, {
        vaultId: ids.vaultId,
        snapshotId,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toMatchObject({
      state: "ready",
      expectedItemCount: 0,
      page: [],
      isDone: true,
    });
    await t.run(async (ctx) => await ctx.db.delete(snapshotId));
    await expect(
      asUser.query(api.repositoryInventory.listRepositoryInventoryPage, {
        vaultId: ids.vaultId,
        snapshotId,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toEqual({ state: "unavailable" });
  });

  it("cleans only the exact obsolete snapshot", async () => {
    const { ids, t } = await createConnectedVault();
    const activeSnapshotId = await insertSnapshot(t, { vaultId: ids.vaultId, branchCount: 1 });
    const obsoleteSnapshotId = await insertSnapshot(t, {
      vaultId: ids.vaultId,
      branchCount: 1,
      pullRequestCount: 1,
      labelCount: 1,
      labelChunkCount: 1,
    });
    await insertInventory(t, {
      ...ids,
      lifecycle: { state: "idle" },
      publication: publication(activeSnapshotId),
    });
    await insertBranch(t, {
      vaultId: ids.vaultId,
      snapshotId: activeSnapshotId,
      name: "main",
      isDefault: true,
    });
    await insertBranch(t, {
      vaultId: ids.vaultId,
      snapshotId: obsoleteSnapshotId,
      name: "old",
    });
    const rowKey = "pull-request:obsolete";
    await insertPullRequest(t, {
      vaultId: ids.vaultId,
      snapshotId: obsoleteSnapshotId,
      rowKey,
      number: 9,
      headRefName: "old",
      sortTime: -1,
      canOpenInSamebase: true,
      labelCount: 1,
      labelChunkCount: 1,
    });
    await t.run(
      async (ctx) =>
        await ctx.db.insert("vaultRepositoryInventoryLabelChunks", {
          vaultId: ids.vaultId,
          snapshotId: obsoleteSnapshotId,
          rowKey,
          chunkIndex: 0,
          labels: [{ name: "old" }],
        }),
    );

    for (let pass = 0; pass < 3; pass += 1) {
      await t.mutation(internal.repositoryInventory.cleanupRepositoryInventorySnapshot, {
        snapshotId: obsoleteSnapshotId,
      });
    }

    const state = await readVaultInventory(t, ids.vaultId);
    expect(state.snapshots.map((snapshot) => snapshot._id)).toEqual([activeSnapshotId]);
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ snapshotId: activeSnapshotId, rowKey: "branch:main" });
    expect(state.labelChunks).toEqual([]);
  });

  it("bounds public item and label pages", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const snapshotId = await insertSnapshot(t, ids);
    await expect(
      asUser.query(api.repositoryInventory.listRepositoryInventoryPage, {
        vaultId: ids.vaultId,
        snapshotId,
        paginationOpts: { cursor: null, numItems: 11 },
      }),
    ).rejects.toThrow("Repository inventory pages must request between 1 and 10 items.");
    await expect(
      asUser.query(api.repositoryInventory.listRepositoryInventoryLabelPage, {
        vaultId: ids.vaultId,
        snapshotId,
        rowKey: "pull-request:PR_1",
        paginationOpts: { cursor: null, numItems: 6 },
      }),
    ).rejects.toThrow("Repository inventory label pages must request between 1 and 5 chunks.");
  });
});

describe("repository inventory branch context", () => {
  it("does not claim a branch is missing before the first publication", async () => {
    const { asUser, ids } = await createConnectedVault();
    await expect(
      asUser.query(api.repositoryInventory.getRepositoryInventoryBranchContext, {
        vaultId: ids.vaultId,
        branch: "feature/new",
      }),
    ).resolves.toEqual({ state: "unpublished" });
  });

  it("returns exact-case branch metadata and the newest eligible open pull request", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const snapshotId = await insertSnapshot(t, {
      vaultId: ids.vaultId,
      branchCount: 2,
      pullRequestCount: 3,
    });
    await insertInventory(t, {
      ...ids,
      lifecycle: { state: "idle" },
      publication: publication(snapshotId, {
        repositoryFullName: "Ada/Renamed",
        defaultBranch: "trunk",
      }),
    });
    await insertBranch(t, {
      vaultId: ids.vaultId,
      snapshotId,
      name: "trunk",
      isDefault: true,
      sortTime: 0,
    });
    await insertBranch(t, {
      vaultId: ids.vaultId,
      snapshotId,
      name: "Feature/Case",
      sortTime: -now,
    });
    await insertPullRequest(t, {
      vaultId: ids.vaultId,
      snapshotId,
      rowKey: "pull-request:older",
      number: 40,
      headRefName: "Feature/Case",
      sortTime: -(now - 1_000),
      canOpenInSamebase: true,
    });
    await insertPullRequest(t, {
      vaultId: ids.vaultId,
      snapshotId,
      rowKey: "pull-request:newest",
      number: 42,
      headRefName: "Feature/Case",
      sortTime: -now,
      canOpenInSamebase: true,
    });
    await insertPullRequest(t, {
      vaultId: ids.vaultId,
      snapshotId,
      rowKey: "pull-request:fork",
      number: 43,
      headRefName: "Feature/Case",
      sortTime: -(now + 1_000),
      canOpenInSamebase: false,
    });

    await expect(
      asUser.query(api.repositoryInventory.getRepositoryInventoryBranchContext, {
        vaultId: ids.vaultId,
        branch: "Feature/Case",
      }),
    ).resolves.toEqual({
      state: "ready",
      repositoryFullName: "Ada/Renamed",
      defaultBranch: "trunk",
      branch: {
        name: "Feature/Case",
        isDefault: false,
        headCommit: {
          sha: "Feature/Case-sha",
          title: "Feature/Case commit",
          authoredAt: now,
          checks,
        },
      },
      pullRequest: {
        number: 42,
        url: "https://github.com/ada/inventory/pull/42",
        isDraft: true,
        baseRefName: "release/1.2",
      },
    });
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
  });
});
