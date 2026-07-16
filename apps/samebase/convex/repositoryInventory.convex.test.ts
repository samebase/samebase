import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type {
  RepositoryInventoryBranchComparison,
  RepositoryInventoryLifecycle,
  RepositoryInventoryPublication,
  RepositoryInventoryPullRequestComparison,
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
const summaryDefaultBranch = {
  state: "ready" as const,
  name: "main",
  headSha: "summary-head",
  checkState: "none" as const,
};

function summaryObservation() {
  return { summaryDefaultBranch };
}

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
      ghRepoNodeId: "R_inventory",
      owner: "ada",
      name: "inventory",
      defaultBranch: "main",
      visibility: "private",
      connectedAt: now,
    });
    await ctx.db.insert("vaultRepositorySummaries", {
      userId,
      vaultId,
      refreshEligibleAt: 0,
      lifecycle: { state: "idle" },
      publication: { state: "unobserved" },
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
    labelFacetCount?: number;
    noLabelPullRequestCount?: number;
    state?: "collecting" | "ready";
  },
) {
  return await t.run(async (ctx) => {
    const counts = {
      branchCount: args.branchCount ?? 0,
      pullRequestCount: args.pullRequestCount ?? 0,
      labelCount: args.labelCount ?? 0,
      labelChunkCount: args.labelChunkCount ?? 0,
      labelFacetCount: args.labelFacetCount ?? 0,
      noLabelPullRequestCount: args.noLabelPullRequestCount ?? 0,
    };
    return args.state === "collecting"
      ? await ctx.db.insert("vaultRepositoryInventorySnapshots", {
          state: "collecting",
          vaultId: args.vaultId,
          ...counts,
        })
      : await ctx.db.insert("vaultRepositoryInventorySnapshots", {
          state: "ready",
          repositoryNodeId: "R_inventory",
          repositoryFullName: "ada/inventory",
          defaultBranch: "main",
          fingerprint: "published-fingerprint",
          crawlCost: 10,
          summaryDefaultBranch,
          vaultId: args.vaultId,
          ...counts,
        });
  });
}

async function insertFilterView(
  t: ConvexTest,
  args: {
    vaultId: Id<"vaults">;
    snapshotId: Id<"vaultRepositoryInventorySnapshots">;
    filterRevision?: number;
    totalPullRequestCount?: number;
    visiblePullRequestCount?: number;
  },
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("vaultRepositoryInventoryFilterViews", {
        state: "complete",
        vaultId: args.vaultId,
        snapshotId: args.snapshotId,
        filterRevision: args.filterRevision ?? 0,
        totalPullRequestCount: args.totalPullRequestCount ?? 0,
        processedPullRequestCount: args.totalPullRequestCount ?? 0,
        visiblePullRequestCount: args.visiblePullRequestCount ?? 0,
      }),
  );
}

async function finishFilterMaterialization(
  t: ConvexTest,
  args: {
    snapshotId: Id<"vaultRepositoryInventorySnapshots">;
    filterRevision: number;
  },
): Promise<Id<"vaultRepositoryInventoryFilterViews">> {
  for (let pass = 0; pass < 100; pass += 1) {
    const view = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultRepositoryInventoryFilterViews")
          .withIndex("by_snapshot_and_filterRevision", (q) =>
            q.eq("snapshotId", args.snapshotId).eq("filterRevision", args.filterRevision),
          )
          .unique(),
    );
    if (!view) {
      throw new Error("Expected a repository inventory filter view to materialize.");
    }
    if (view.state === "complete") {
      return view._id;
    }
    await t.mutation(internal.repositoryInventory.advanceRepositoryInventoryFilterMaterialization, {
      viewId: view._id,
    });
  }
  throw new Error("Repository inventory filter view did not finish materializing.");
}

async function handoffAndMaterializeSnapshot(
  t: ConvexTest,
  args: {
    vaultId: Id<"vaults">;
    snapshotId: Id<"vaultRepositoryInventorySnapshots">;
    branchCount: number;
    pullRequestCount: number;
    labelCount: number;
    labelChunkCount: number;
    labelFacetCount: number;
    noLabelPullRequestCount: number;
    fingerprint: string;
    crawlCost: number;
    filterRevision?: number;
  },
) {
  await t.mutation(internal.repositoryInventory.handoffCompletedRepositoryInventorySnapshot, {
    vaultId: args.vaultId,
    snapshotId: args.snapshotId,
    repositoryNodeId: "R_inventory",
    repositoryFullName: "ada/inventory",
    defaultBranch: "main",
    branchCount: args.branchCount,
    pullRequestCount: args.pullRequestCount,
    labelCount: args.labelCount,
    labelChunkCount: args.labelChunkCount,
    labelFacetCount: args.labelFacetCount,
    noLabelPullRequestCount: args.noLabelPullRequestCount,
    fingerprint: args.fingerprint,
    crawlCost: args.crawlCost,
    summaryDefaultBranch,
  });
  return await finishFilterMaterialization(t, {
    snapshotId: args.snapshotId,
    filterRevision: args.filterRevision ?? 0,
  });
}

function publication(
  snapshotId: Id<"vaultRepositoryInventorySnapshots">,
  filterViewId: Id<"vaultRepositoryInventoryFilterViews">,
  overrides: Partial<RepositoryInventoryPublication> = {},
): RepositoryInventoryPublication {
  return {
    snapshotId,
    filterViewId,
    filterRevision: 0,
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
    estimatedCrawlCost?: number;
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
        estimatedCrawlCost: args.estimatedCrawlCost,
      }),
  );
}

async function readVaultInventory(t: ConvexTest, vaultId: Id<"vaults">) {
  return await t.run(async (ctx) => {
    const [inventory, snapshots, items, labelChunks, labelFacets, filterViews, filterViewRows] =
      await Promise.all([
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
        ctx.db
          .query("vaultRepositoryInventoryLabelFacets")
          .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
          .collect(),
        ctx.db
          .query("vaultRepositoryInventoryFilterViews")
          .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
          .collect(),
        ctx.db
          .query("vaultRepositoryInventoryFilterViewRows")
          .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
          .collect(),
      ]);
    return {
      inventory,
      snapshots,
      items,
      labelChunks,
      labelFacets,
      filterViews,
      filterViewRows,
    };
  });
}

async function readRepositorySummary(t: ConvexTest, vaultId: Id<"vaults">) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("vaultRepositorySummaries")
        .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
        .unique(),
  );
}

async function insertBranch(
  t: ConvexTest,
  args: {
    vaultId: Id<"vaults">;
    snapshotId: Id<"vaultRepositoryInventorySnapshots">;
    name: string;
    isDefault?: boolean;
    sortTime?: number;
    comparison?: RepositoryInventoryBranchComparison;
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
        comparison:
          args.comparison ??
          (args.isDefault
            ? { state: "ready", aheadBy: 0, behindBy: 0 }
            : { state: "ready", aheadBy: 6, behindBy: 2 }),
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
    isCrossRepository?: boolean;
    comparison?: RepositoryInventoryPullRequestComparison;
    labelCount?: number;
    labelChunkCount?: number;
    filterLabelKeys?: string[];
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
        additions: args.number * 10,
        deletions: args.number,
        changedFiles: Math.max(1, args.number % 10),
        baseRefName: args.number === 42 ? "release/1.2" : "main",
        isCrossRepository: args.isCrossRepository ?? !args.canOpenInSamebase,
        headRepositoryFullName: args.canOpenInSamebase ? "ada/inventory" : "contributor/fork",
        headRefName: args.headRefName,
        comparison: args.comparison ?? { state: "ready", aheadBy: 6, behindBy: 2 },
        canOpenInSamebase: args.canOpenInSamebase,
        localHeadRefName: args.canOpenInSamebase ? args.headRefName : undefined,
        labelCount: args.labelCount ?? 0,
        labelChunkCount: args.labelChunkCount ?? 0,
        filterLabelKeys: args.filterLabelKeys ?? [],
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
    const snapshotId = await insertSnapshot(t, { ...ids, state: "collecting" });
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

    await handoffAndMaterializeSnapshot(t, {
      vaultId: ids.vaultId,
      snapshotId,
      branchCount: 0,
      pullRequestCount: 0,
      labelCount: 0,
      labelChunkCount: 0,
      labelFacetCount: 0,
      noLabelPullRequestCount: 0,
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

  it("publishes the shared summary with the completed full inventory generation", async () => {
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
    await expect(readRepositorySummary(t, ids.vaultId)).resolves.toMatchObject({
      lifecycle: {
        state: "scheduled",
        source: "repository_inventory",
        snapshotId: scheduled.lifecycle.snapshotId,
        wait: { kind: "immediate" },
      },
      publication: { state: "unobserved" },
    });
    await expect(
      asUser.mutation(api.repositorySummary.requestRepositorySummaryRefresh, {
        visibleVaultIds: [ids.vaultId],
      }),
    ).resolves.toEqual({ state: "idle" });

    const claimed = await t.mutation(internal.repositoryInventory.claimRepositoryInventoryRefresh, {
      vaultId: ids.vaultId,
      snapshotId: scheduled.lifecycle.snapshotId,
    });
    if (claimed.kind !== "ready") {
      throw new Error("Expected the repository inventory claim to be ready.");
    }
    expect(claimed).toMatchObject({
      repositoryNodeId: "R_inventory",
    });
    await expect(readRepositorySummary(t, ids.vaultId)).resolves.toMatchObject({
      lifecycle: {
        state: "running",
        source: "repository_inventory",
        snapshotId: claimed.snapshotId,
      },
      publication: { state: "unobserved" },
    });

    await t.mutation(internal.repositoryInventory.handoffCompletedRepositoryInventorySnapshot, {
      vaultId: ids.vaultId,
      snapshotId: claimed.snapshotId,
      repositoryNodeId: "R_inventory",
      repositoryFullName: "Ada/Inventory",
      defaultBranch: "main",
      branchCount: 0,
      pullRequestCount: 0,
      labelCount: 0,
      labelChunkCount: 0,
      labelFacetCount: 0,
      noLabelPullRequestCount: 0,
      fingerprint: "summary-publication",
      crawlCost: 9,
      summaryDefaultBranch: {
        state: "ready",
        name: "main",
        headSha: "observed-main-head",
        checkState: "success",
      },
    });

    await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
      inventory: {
        lifecycle: { state: "materializing", snapshotId: claimed.snapshotId },
      },
      snapshots: [
        {
          _id: claimed.snapshotId,
          state: "ready",
          repositoryFullName: "Ada/Inventory",
          fingerprint: "summary-publication",
        },
      ],
    });
    await expect(readRepositorySummary(t, ids.vaultId)).resolves.toMatchObject({
      lifecycle: {
        state: "running",
        source: "repository_inventory",
        snapshotId: claimed.snapshotId,
      },
      publication: { state: "unobserved" },
    });

    const filterViewId = await finishFilterMaterialization(t, {
      snapshotId: claimed.snapshotId,
      filterRevision: 0,
    });
    await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
      inventory: {
        lifecycle: { state: "idle" },
        publication: {
          snapshotId: claimed.snapshotId,
          filterViewId,
          repositoryFullName: "Ada/Inventory",
          fingerprint: "summary-publication",
        },
      },
    });
    await expect(readRepositorySummary(t, ids.vaultId)).resolves.toMatchObject({
      lifecycle: { state: "idle" },
      publication: {
        state: "complete",
        defaultBranch: {
          state: "ready",
          name: "main",
          headSha: "observed-main-head",
          checkState: "success",
        },
        openPullRequestCount: 0,
        publishedAt: now,
        checkedAt: now,
      },
    });
  });

  it("fails the paired summary when materialization loses its ready snapshot", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
      vaultId: ids.vaultId,
    });
    const scheduled = (await readVaultInventory(t, ids.vaultId)).inventory;
    if (scheduled?.lifecycle.state !== "scheduled") {
      throw new Error("Expected a scheduled repository inventory refresh.");
    }
    const claimed = await t.mutation(internal.repositoryInventory.claimRepositoryInventoryRefresh, {
      vaultId: ids.vaultId,
      snapshotId: scheduled.lifecycle.snapshotId,
    });
    if (claimed.kind !== "ready") {
      throw new Error("Expected the repository inventory claim to be ready.");
    }
    await t.mutation(internal.repositoryInventory.handoffCompletedRepositoryInventorySnapshot, {
      vaultId: ids.vaultId,
      snapshotId: claimed.snapshotId,
      repositoryNodeId: "R_inventory",
      repositoryFullName: "Ada/Inventory",
      defaultBranch: "main",
      branchCount: 0,
      pullRequestCount: 0,
      labelCount: 0,
      labelChunkCount: 0,
      labelFacetCount: 0,
      noLabelPullRequestCount: 0,
      fingerprint: "lost-snapshot",
      crawlCost: 9,
      summaryDefaultBranch: {
        state: "ready",
        name: "main",
        headSha: "lost-snapshot-head",
        checkState: "success",
      },
    });
    await t.run(async (ctx) => await ctx.db.delete(claimed.snapshotId));

    await t.mutation(internal.repositoryInventory.repairRepositoryInventoryFilterMaterialization, {
      vaultId: ids.vaultId,
      snapshotId: claimed.snapshotId,
    });

    const message = "Repository inventory filter materialization lost its snapshot.";
    await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
      inventory: { lifecycle: { state: "failed", message } },
    });
    await expect(readRepositorySummary(t, ids.vaultId)).resolves.toMatchObject({
      lifecycle: {
        state: "failed",
        message,
      },
      publication: { state: "unobserved" },
    });
  });

  it("moves a deferred summary observation to the replacement crawl and releases expired demand", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
      vaultId: ids.vaultId,
    });
    const initial = (await readVaultInventory(t, ids.vaultId)).inventory;
    if (initial?.lifecycle.state !== "scheduled") {
      throw new Error("Expected an initial scheduled repository inventory refresh.");
    }
    const claimed = await t.mutation(internal.repositoryInventory.claimRepositoryInventoryRefresh, {
      vaultId: ids.vaultId,
      snapshotId: initial.lifecycle.snapshotId,
    });
    if (claimed.kind !== "ready") {
      throw new Error("Expected the repository inventory claim to be ready.");
    }

    const retryAt = now + 30_000;
    await t.mutation(internal.repositoryInventory.deferRepositoryInventoryRefresh, {
      vaultId: ids.vaultId,
      snapshotId: claimed.snapshotId,
      reason: "rate_limit",
      retryAt,
    });
    const deferred = (await readVaultInventory(t, ids.vaultId)).inventory;
    if (deferred?.lifecycle.state !== "scheduled") {
      throw new Error("Expected a replacement repository inventory refresh.");
    }
    expect(deferred.lifecycle.snapshotId).not.toBe(claimed.snapshotId);
    await expect(readRepositorySummary(t, ids.vaultId)).resolves.toMatchObject({
      lifecycle: {
        state: "scheduled",
        source: "repository_inventory",
        snapshotId: deferred.lifecycle.snapshotId,
        wait: { kind: "rate_limit", retryAt },
      },
      publication: { state: "unobserved" },
    });

    vi.setSystemTime(now + 135_001);
    await expect(
      t.mutation(internal.repositoryInventory.claimRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
        snapshotId: deferred.lifecycle.snapshotId,
      }),
    ).resolves.toEqual({ kind: "cancel" });
    await expect(readRepositorySummary(t, ids.vaultId)).resolves.toMatchObject({
      refreshEligibleAt: now + 135_001,
      lifecycle: { state: "idle" },
      publication: { state: "unobserved" },
    });
  });

  it("keeps a completed crawl unpublished until its filter view is complete", async () => {
    const { ids, t } = await createConnectedVault();
    const snapshotId = await insertSnapshot(t, { ...ids, state: "collecting" });
    await insertInventory(t, {
      ...ids,
      lifecycle: {
        state: "running",
        snapshotId,
        targetWriteVersion: 0,
        required: false,
        startedAt: now,
        workpoolJobId: "job-materializing",
      },
    });

    await t.mutation(internal.repositoryInventory.handoffCompletedRepositoryInventorySnapshot, {
      vaultId: ids.vaultId,
      snapshotId,
      repositoryNodeId: "R_inventory",
      repositoryFullName: "ada/inventory",
      defaultBranch: "main",
      branchCount: 0,
      pullRequestCount: 0,
      labelCount: 0,
      labelChunkCount: 0,
      labelFacetCount: 0,
      noLabelPullRequestCount: 0,
      fingerprint: "materializing",
      crawlCost: 9,
      ...summaryObservation(),
    });

    const materializingState = await readVaultInventory(t, ids.vaultId);
    expect(materializingState).toMatchObject({
      inventory: {
        lifecycle: { state: "materializing", snapshotId },
      },
      snapshots: [{ _id: snapshotId, state: "ready" }],
      filterViews: [{ state: "building", snapshotId, filterRevision: 0 }],
    });
    expect(materializingState.inventory).not.toHaveProperty("publication");

    await t.mutation(internal.repositoryInventory.handleRepositoryInventoryComplete, {
      // @ts-expect-error Workpool persists its branded WorkId as this validated string.
      workId: "job-materializing",
      context: { vaultId: ids.vaultId, snapshotId },
      result: { kind: "success", returnValue: null },
    });
    await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
      inventory: { lifecycle: { state: "materializing", snapshotId } },
    });

    const filterViewId = await finishFilterMaterialization(t, {
      snapshotId,
      filterRevision: 0,
    });
    await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
      inventory: {
        lifecycle: { state: "idle" },
        publication: { snapshotId, filterViewId, filterRevision: 0 },
      },
    });
  });

  it("coalesces ordinary focus demand received during materialization", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const snapshotId = await insertSnapshot(t, { ...ids, state: "collecting" });
    await insertInventory(t, {
      ...ids,
      lastStartedAt: now,
      lifecycle: {
        state: "running",
        snapshotId,
        targetWriteVersion: 0,
        required: false,
        startedAt: now,
        workpoolJobId: "job-trailing-focus",
      },
    });
    await t.mutation(internal.repositoryInventory.handoffCompletedRepositoryInventorySnapshot, {
      vaultId: ids.vaultId,
      snapshotId,
      repositoryNodeId: "R_inventory",
      repositoryFullName: "ada/inventory",
      defaultBranch: "main",
      branchCount: 0,
      pullRequestCount: 0,
      labelCount: 0,
      labelChunkCount: 0,
      labelFacetCount: 0,
      noLabelPullRequestCount: 0,
      fingerprint: "before-focus",
      crawlCost: 8,
      ...summaryObservation(),
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
    await finishFilterMaterialization(t, { snapshotId, filterRevision: 0 });

    const state = await readVaultInventory(t, ids.vaultId);
    expect(state.inventory).toMatchObject({
      lifecycle: { state: "idle" },
      publication: { snapshotId, fingerprint: "before-focus" },
    });
    expect(state.snapshots).toHaveLength(1);
  });

  it("schedules one required trailing crawl for writes during materialization", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const snapshotId = await insertSnapshot(t, { ...ids, state: "collecting" });
    await insertInventory(t, {
      ...ids,
      lifecycle: {
        state: "running",
        snapshotId,
        targetWriteVersion: 0,
        required: false,
        startedAt: now,
        workpoolJobId: "job-materializing-write",
      },
    });
    await t.mutation(internal.repositoryInventory.handoffCompletedRepositoryInventorySnapshot, {
      vaultId: ids.vaultId,
      snapshotId,
      repositoryNodeId: "R_inventory",
      repositoryFullName: "ada/inventory",
      defaultBranch: "main",
      branchCount: 0,
      pullRequestCount: 0,
      labelCount: 0,
      labelChunkCount: 0,
      labelFacetCount: 0,
      noLabelPullRequestCount: 0,
      fingerprint: "before-materializing-write",
      crawlCost: 8,
      ...summaryObservation(),
    });

    await t.mutation(internal.repositoryInventory.requestRepositoryInventoryRefreshAfterWrite, ids);
    await t.mutation(internal.repositoryInventory.requestRepositoryInventoryRefreshAfterWrite, ids);
    await asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
      vaultId: ids.vaultId,
    });
    await finishFilterMaterialization(t, { snapshotId, filterRevision: 0 });

    const state = await readVaultInventory(t, ids.vaultId);
    expect(state.inventory).toMatchObject({
      writeVersion: 2,
      publication: { snapshotId, fingerprint: "before-materializing-write" },
      lifecycle: {
        state: "scheduled",
        targetWriteVersion: 2,
        required: true,
        wait: { kind: "immediate" },
      },
    });
    expect(state.snapshots).toHaveLength(2);
  });

  it("recovers a missing materialization batch from the watchdog", async () => {
    const { ids, t } = await createConnectedVault();
    const snapshotId = await insertSnapshot(t, { ...ids, state: "collecting" });
    await insertInventory(t, {
      ...ids,
      lifecycle: {
        state: "running",
        snapshotId,
        targetWriteVersion: 0,
        required: false,
        startedAt: now,
        workpoolJobId: "job-watchdog",
      },
    });
    await t.mutation(internal.repositoryInventory.handoffCompletedRepositoryInventorySnapshot, {
      vaultId: ids.vaultId,
      snapshotId,
      repositoryNodeId: "R_inventory",
      repositoryFullName: "ada/inventory",
      defaultBranch: "main",
      branchCount: 0,
      pullRequestCount: 0,
      labelCount: 0,
      labelChunkCount: 0,
      labelFacetCount: 0,
      noLabelPullRequestCount: 0,
      fingerprint: "watchdog",
      crawlCost: 7,
      ...summaryObservation(),
    });
    const abandonedView = (await readVaultInventory(t, ids.vaultId)).filterViews.at(0);
    if (!abandonedView) {
      throw new Error("Expected the initial materialization view.");
    }
    await t.run(async (ctx) => await ctx.db.delete(abandonedView._id));

    await t.mutation(internal.repositoryInventory.repairRepositoryInventoryFilterMaterialization, {
      vaultId: ids.vaultId,
      snapshotId,
    });
    const recoveredViewId = await finishFilterMaterialization(t, {
      snapshotId,
      filterRevision: 0,
    });
    expect(recoveredViewId).not.toBe(abandonedView._id);
    await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
      inventory: {
        lifecycle: { state: "idle" },
        publication: { snapshotId, filterViewId: recoveredViewId },
      },
    });
  });

  it("fails closed instead of remaining materializing after an invalid batch", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const activeSnapshotId = await insertSnapshot(t, ids);
    const activeFilterViewId = await insertFilterView(t, {
      ...ids,
      snapshotId: activeSnapshotId,
    });
    const stagingSnapshotId = await insertSnapshot(t, { ...ids, state: "collecting" });
    await insertInventory(t, {
      ...ids,
      lastStartedAt: now,
      lifecycle: {
        state: "running",
        snapshotId: stagingSnapshotId,
        targetWriteVersion: 0,
        required: false,
        startedAt: now,
        workpoolJobId: "job-invalid-materialization",
      },
      publication: publication(activeSnapshotId, activeFilterViewId),
    });
    await t.mutation(internal.repositoryInventory.handoffCompletedRepositoryInventorySnapshot, {
      vaultId: ids.vaultId,
      snapshotId: stagingSnapshotId,
      repositoryNodeId: "R_inventory",
      repositoryFullName: "ada/inventory",
      defaultBranch: "main",
      branchCount: 0,
      pullRequestCount: 0,
      labelCount: 0,
      labelChunkCount: 0,
      labelFacetCount: 0,
      noLabelPullRequestCount: 0,
      fingerprint: "invalid-view",
      crawlCost: 6,
      ...summaryObservation(),
    });
    const stagingView = (await readVaultInventory(t, ids.vaultId)).filterViews.find(
      (view) => view.snapshotId === stagingSnapshotId,
    );
    if (!stagingView) {
      throw new Error("Expected the staging materialization view.");
    }
    await t.run(async (ctx) => await ctx.db.patch(stagingSnapshotId, { pullRequestCount: 1 }));

    await t.mutation(internal.repositoryInventory.advanceRepositoryInventoryFilterMaterialization, {
      viewId: stagingView._id,
    });
    await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
      inventory: {
        lifecycle: {
          state: "failed",
          message: "Repository inventory filter materialization has an invalid snapshot.",
        },
        publication: { snapshotId: activeSnapshotId, filterViewId: activeFilterViewId },
      },
    });

    await expect(
      asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({ kind: "deferred", retryAt: now + 60_000 });
    await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
      inventory: {
        lifecycle: {
          state: "failed",
          message: "Repository inventory filter materialization has an invalid snapshot.",
        },
        publication: { snapshotId: activeSnapshotId, filterViewId: activeFilterViewId },
      },
    });

    vi.setSystemTime(now + 60_000);
    await expect(
      asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({ kind: "scheduled" });
  });

  it("schedules exactly one immediate trailing snapshot after writes during a crawl", async () => {
    const { ids, t } = await createConnectedVault();
    const snapshotId = await insertSnapshot(t, { ...ids, state: "collecting" });
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
    await handoffAndMaterializeSnapshot(t, {
      vaultId: ids.vaultId,
      snapshotId,
      branchCount: 0,
      pullRequestCount: 0,
      labelCount: 0,
      labelChunkCount: 0,
      labelFacetCount: 0,
      noLabelPullRequestCount: 0,
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

  it.each([
    { crawlCost: undefined, expectedIntervalMs: 60_000 },
    { crawlCost: 12, expectedIntervalMs: 60_000 },
    { crawlCost: 13, expectedIntervalMs: 65_000 },
    { crawlCost: 100, expectedIntervalMs: 500_000 },
  ])(
    "defers a $crawlCost-point ordinary crawl until $expectedIntervalMs ms after the prior start",
    async ({ crawlCost, expectedIntervalMs }) => {
      const { asUser, ids, t } = await createConnectedVault();
      await insertInventory(t, {
        ...ids,
        lifecycle: { state: "idle" },
        lastStartedAt: now,
        estimatedCrawlCost: crawlCost,
      });
      vi.setSystemTime(now + 59_000);

      await expect(
        asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
          vaultId: ids.vaultId,
        }),
      ).resolves.toEqual({ kind: "deferred", retryAt: now + expectedIntervalMs });
      await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
        inventory: {
          lifecycle: { state: "idle" },
        },
        snapshots: [],
      });
    },
  );

  it("keeps summaries eligible until a cost-paced crawl becomes runnable", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await insertInventory(t, {
      ...ids,
      lifecycle: { state: "idle" },
      lastStartedAt: now,
      estimatedCrawlCost: 100,
    });
    vi.setSystemTime(now + 60_000);

    await expect(
      asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({ kind: "deferred", retryAt: now + 500_000 });
    await expect(
      asUser.mutation(api.repositorySummary.requestRepositorySummaryRefresh, {
        visibleVaultIds: [ids.vaultId],
      }),
    ).resolves.toEqual({ state: "scheduled", repositoryCount: 1 });
    await expect(readRepositorySummary(t, ids.vaultId)).resolves.toMatchObject({
      lifecycle: { state: "scheduled", source: "summary_batch" },
    });
    for (const heartbeatAt of [180_000, 300_000, 420_000]) {
      vi.setSystemTime(now + heartbeatAt);
      await expect(
        asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
          vaultId: ids.vaultId,
        }),
      ).resolves.toEqual({ kind: "deferred", retryAt: now + 500_000 });
    }

    vi.setSystemTime(now + 500_000);
    await expect(
      asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({ kind: "scheduled" });
    const scheduled = (await readVaultInventory(t, ids.vaultId)).inventory;
    if (scheduled?.lifecycle.state !== "scheduled") {
      throw new Error("Expected a runnable repository inventory refresh.");
    }
    await expect(readRepositorySummary(t, ids.vaultId)).resolves.toMatchObject({
      lifecycle: {
        state: "scheduled",
        source: "repository_inventory",
        snapshotId: scheduled.lifecycle.snapshotId,
      },
    });
    await expect(
      t.mutation(internal.repositoryInventory.claimRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
        snapshotId: scheduled.lifecycle.snapshotId,
      }),
    ).resolves.toMatchObject({ kind: "ready", vaultId: ids.vaultId });
  });

  it("creates no cost-paced job when visible heartbeats stop", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await insertInventory(t, {
      ...ids,
      lifecycle: { state: "idle" },
      lastStartedAt: now,
      estimatedCrawlCost: 100,
    });
    vi.setSystemTime(now + 60_000);
    await expect(
      asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({ kind: "deferred", retryAt: now + 500_000 });
    vi.setSystemTime(now + 500_000);
    await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
      inventory: { lifecycle: { state: "idle" } },
      snapshots: [],
    });
  });

  it("lets a required write bypass cost pacing", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await insertInventory(t, {
      ...ids,
      lifecycle: { state: "idle" },
      lastStartedAt: now,
      estimatedCrawlCost: 100,
    });
    vi.setSystemTime(now + 100_000);
    await expect(
      asUser.mutation(api.repositoryInventory.requestRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({ kind: "deferred", retryAt: now + 500_000 });

    await expect(
      t.mutation(internal.repositoryInventory.requestRepositoryInventoryRefreshAfterWrite, ids),
    ).resolves.toEqual({ kind: "scheduled" });
    await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
      inventory: {
        writeVersion: 1,
        lifecycle: { state: "scheduled", required: true, wait: { kind: "immediate" } },
      },
    });
  });

  it("learns changed provider cost before local snapshot materialization", async () => {
    const { ids, t } = await createConnectedVault();
    const activeSnapshotId = await insertSnapshot(t, ids);
    const activeFilterViewId = await insertFilterView(t, {
      ...ids,
      snapshotId: activeSnapshotId,
    });
    const stagingSnapshotId = await insertSnapshot(t, { ...ids, state: "collecting" });
    await insertInventory(t, {
      ...ids,
      lifecycle: {
        state: "running",
        snapshotId: stagingSnapshotId,
        targetWriteVersion: 0,
        required: false,
        startedAt: now,
        workpoolJobId: "job-cost",
      },
      publication: publication(activeSnapshotId, activeFilterViewId),
    });

    await expect(
      t.mutation(internal.repositoryInventory.completeUnchangedRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
        snapshotId: stagingSnapshotId,
        fingerprint: "changed-fingerprint",
        crawlCost: 37,
        ...summaryObservation(),
        summaryOpenPullRequestCount: 0,
      }),
    ).resolves.toBe(false);
    await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
      inventory: {
        estimatedCrawlCost: 37,
        lifecycle: { state: "running", snapshotId: stagingSnapshotId },
        publication: { snapshotId: activeSnapshotId },
      },
    });
  });

  it("keeps the published snapshot and advances checkedAt after an unchanged crawl", async () => {
    const { ids, t } = await createConnectedVault();
    const activeSnapshotId = await insertSnapshot(t, ids);
    const activeFilterViewId = await insertFilterView(t, {
      ...ids,
      snapshotId: activeSnapshotId,
    });
    const stagingSnapshotId = await insertSnapshot(t, { ...ids, state: "collecting" });
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
      publication: publication(activeSnapshotId, activeFilterViewId),
    });

    await expect(
      t.mutation(internal.repositoryInventory.completeUnchangedRepositoryInventoryRefresh, {
        vaultId: ids.vaultId,
        snapshotId: stagingSnapshotId,
        fingerprint: "published-fingerprint",
        crawlCost: 18,
        ...summaryObservation(),
        summaryOpenPullRequestCount: 0,
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
    const activeFilterViewId = await insertFilterView(t, {
      ...ids,
      snapshotId: activeSnapshotId,
    });
    const stagingSnapshotId = await insertSnapshot(t, { ...ids, state: "collecting" });
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
      publication: publication(activeSnapshotId, activeFilterViewId),
    });

    await expect(
      t.mutation(internal.repositoryInventory.handoffCompletedRepositoryInventorySnapshot, {
        vaultId: ids.vaultId,
        snapshotId: stagingSnapshotId,
        repositoryNodeId: "R_inventory",
        repositoryFullName: "ada/inventory",
        defaultBranch: "main",
        branchCount: 1,
        pullRequestCount: 0,
        labelCount: 0,
        labelChunkCount: 0,
        labelFacetCount: 0,
        noLabelPullRequestCount: 0,
        fingerprint: "incomplete",
        crawlCost: 5,
        ...summaryObservation(),
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
    const snapshotId = await insertSnapshot(t, { ...ids, state: "collecting" });
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
      branchCount: 2,
      pullRequestCount: 2,
      labelCount: 3,
      labelChunkCount: 2,
      labelFacetCount: 3,
    });
    await insertBranch(t, {
      vaultId: ids.vaultId,
      snapshotId,
      name: "main",
      isDefault: true,
      sortTime: 0,
    });
    await insertBranch(t, {
      vaultId: ids.vaultId,
      snapshotId,
      name: "feature/unrelated-history",
      sortTime: -now,
      comparison: { state: "unavailable", reason: "not_comparable" },
    });
    const rowKey = "pull-request:PR_42";
    const pullRequestItemId = await insertPullRequest(t, {
      vaultId: ids.vaultId,
      snapshotId,
      rowKey,
      number: 42,
      headRefName: "feature/labels",
      sortTime: -now,
      canOpenInSamebase: true,
      labelCount: 3,
      labelChunkCount: 2,
      filterLabelKeys: ["bug", "priority", "ready"],
    });
    const forkRowKey = "pull-request:PR_43";
    const forkPullRequestItemId = await insertPullRequest(t, {
      vaultId: ids.vaultId,
      snapshotId,
      rowKey: forkRowKey,
      number: 43,
      headRefName: "feature/from-fork",
      sortTime: -(now - 1_000),
      canOpenInSamebase: false,
      comparison: { state: "unavailable", reason: "head_ref_unavailable" },
    });
    const filterViewId = await insertFilterView(t, {
      ...ids,
      snapshotId,
      totalPullRequestCount: 2,
      visiblePullRequestCount: 2,
    });
    await insertInventory(t, {
      ...ids,
      lifecycle: { state: "idle" },
      publication: publication(snapshotId, filterViewId),
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultRepositoryInventoryFilterViewRows", {
        vaultId: ids.vaultId,
        snapshotId,
        viewId: filterViewId,
        pullRequestItemId,
        rowKey,
        sortTime: -now,
      });
      await ctx.db.insert("vaultRepositoryInventoryFilterViewRows", {
        vaultId: ids.vaultId,
        snapshotId,
        viewId: filterViewId,
        pullRequestItemId: forkPullRequestItemId,
        rowKey: forkRowKey,
        sortTime: -(now - 1_000),
      });
      await ctx.db.insert("vaultRepositoryInventoryLabelFacets", {
        vaultId: ids.vaultId,
        snapshotId,
        labelKey: "bug",
        sortKey: "bug",
        name: "bug",
        color: "ff0000",
        pullRequestCount: 1,
      });
      await ctx.db.insert("vaultRepositoryInventoryLabelFacets", {
        vaultId: ids.vaultId,
        snapshotId,
        labelKey: "priority",
        sortKey: "priority",
        name: "priority",
        pullRequestCount: 1,
      });
      await ctx.db.insert("vaultRepositoryInventoryLabelFacets", {
        vaultId: ids.vaultId,
        snapshotId,
        labelKey: "ready",
        sortKey: "ready",
        name: "ready",
        color: "00ff00",
        pullRequestCount: 1,
      });
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

    const branchPage = await asUser.query(
      api.repositoryInventory.listRepositoryInventoryBranchPage,
      {
        vaultId: ids.vaultId,
        snapshotId,
        paginationOpts: { cursor: null, numItems: 10 },
      },
    );
    expect(branchPage).toMatchObject({
      state: "ready",
      snapshotId,
      expectedBranchCount: 2,
      isDone: true,
      page: [
        {
          kind: "branch",
          rowKey: "branch:main",
          name: "main",
          isDefault: true,
          comparison: { state: "ready", aheadBy: 0, behindBy: 0 },
        },
        {
          kind: "branch",
          rowKey: "branch:feature/unrelated-history",
          name: "feature/unrelated-history",
          isDefault: false,
          comparison: { state: "unavailable", reason: "not_comparable" },
        },
      ],
    });

    const pullRequestPage = await asUser.query(
      api.repositoryInventory.listRepositoryInventoryPullRequestPage,
      {
        vaultId: ids.vaultId,
        snapshotId,
        viewId: filterViewId,
        paginationOpts: { cursor: null, numItems: 10 },
      },
    );
    expect(pullRequestPage).toMatchObject({
      state: "ready",
      snapshotId,
      viewId: filterViewId,
      expectedVisiblePullRequestCount: 2,
      totalPullRequestCount: 2,
      isDone: true,
      page: [
        {
          kind: "pull_request",
          rowKey,
          number: 42,
          additions: 420,
          deletions: 42,
          changedFiles: 2,
          baseRefName: "release/1.2",
          isCrossRepository: false,
          headRepositoryFullName: "ada/inventory",
          comparison: { state: "ready", aheadBy: 6, behindBy: 2 },
          labelCount: 3,
        },
        {
          kind: "pull_request",
          rowKey: forkRowKey,
          number: 43,
          baseRefName: "main",
          isCrossRepository: true,
          headRepositoryFullName: "contributor/fork",
          comparison: { state: "unavailable", reason: "head_ref_unavailable" },
          labelCount: 0,
        },
      ],
    });
    expect(pullRequestPage).not.toHaveProperty("page.0.labelChunkCount");
    expect(pullRequestPage).not.toHaveProperty("page.0.localHeadRefName");

    const facetPage = await asUser.query(
      api.repositoryInventory.listRepositoryInventoryLabelFacetPage,
      {
        vaultId: ids.vaultId,
        snapshotId,
        paginationOpts: { cursor: null, numItems: 25 },
      },
    );
    expect(facetPage).toMatchObject({
      state: "ready",
      snapshotId,
      expectedFacetCount: 3,
      noLabelPullRequestCount: 0,
      isDone: true,
      page: [
        { name: "bug", color: "ff0000", pullRequestCount: 1 },
        { name: "priority", pullRequestCount: 1 },
        { name: "ready", color: "00ff00", pullRequestCount: 1 },
      ],
    });

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
    const filterViewId = await insertFilterView(t, { ...ids, snapshotId });
    await insertInventory(t, {
      ...ids,
      lifecycle: { state: "idle" },
      publication: publication(snapshotId, filterViewId),
    });
    await expect(
      asUser.query(api.repositoryInventory.listRepositoryInventoryBranchPage, {
        vaultId: ids.vaultId,
        snapshotId,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toMatchObject({
      state: "ready",
      expectedBranchCount: 0,
      page: [],
      isDone: true,
    });
    await expect(
      asUser.query(api.repositoryInventory.listRepositoryInventoryPullRequestPage, {
        vaultId: ids.vaultId,
        snapshotId,
        viewId: filterViewId,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toMatchObject({
      state: "ready",
      expectedVisiblePullRequestCount: 0,
      totalPullRequestCount: 0,
      page: [],
      isDone: true,
    });
    await t.run(async (ctx) => await ctx.db.delete(snapshotId));
    await expect(
      asUser.query(api.repositoryInventory.listRepositoryInventoryBranchPage, {
        vaultId: ids.vaultId,
        snapshotId,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toEqual({ state: "unavailable" });
  });

  it("cleans only the exact obsolete snapshot", async () => {
    const { ids, t } = await createConnectedVault();
    const activeSnapshotId = await insertSnapshot(t, { vaultId: ids.vaultId, branchCount: 1 });
    const activeFilterViewId = await insertFilterView(t, {
      ...ids,
      snapshotId: activeSnapshotId,
    });
    const obsoleteSnapshotId = await insertSnapshot(t, {
      vaultId: ids.vaultId,
      branchCount: 1,
      pullRequestCount: 1,
      labelCount: 1,
      labelChunkCount: 1,
      labelFacetCount: 1,
    });
    await insertInventory(t, {
      ...ids,
      lifecycle: { state: "idle" },
      publication: publication(activeSnapshotId, activeFilterViewId),
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
    const obsoletePullRequestItemId = await insertPullRequest(t, {
      vaultId: ids.vaultId,
      snapshotId: obsoleteSnapshotId,
      rowKey,
      number: 9,
      headRefName: "old",
      sortTime: -1,
      canOpenInSamebase: true,
      labelCount: 1,
      labelChunkCount: 1,
      filterLabelKeys: ["old"],
    });
    const obsoleteFilterViewId = await insertFilterView(t, {
      ...ids,
      snapshotId: obsoleteSnapshotId,
      totalPullRequestCount: 1,
      visiblePullRequestCount: 1,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultRepositoryInventoryFilterViewRows", {
        vaultId: ids.vaultId,
        snapshotId: obsoleteSnapshotId,
        viewId: obsoleteFilterViewId,
        pullRequestItemId: obsoletePullRequestItemId,
        rowKey,
        sortTime: -1,
      });
      await ctx.db.insert("vaultRepositoryInventoryLabelFacets", {
        vaultId: ids.vaultId,
        snapshotId: obsoleteSnapshotId,
        labelKey: "old",
        sortKey: "old",
        name: "old",
        pullRequestCount: 1,
      });
      await ctx.db.insert("vaultRepositoryInventoryLabelChunks", {
        vaultId: ids.vaultId,
        snapshotId: obsoleteSnapshotId,
        rowKey,
        chunkIndex: 0,
        labels: [{ name: "old" }],
      });
    });

    for (let pass = 0; pass < 10; pass += 1) {
      await t.mutation(internal.repositoryInventory.cleanupRepositoryInventorySnapshot, {
        snapshotId: obsoleteSnapshotId,
      });
    }

    const state = await readVaultInventory(t, ids.vaultId);
    expect(state.snapshots.map((snapshot) => snapshot._id)).toEqual([activeSnapshotId]);
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ snapshotId: activeSnapshotId, rowKey: "branch:main" });
    expect(state.labelChunks).toEqual([]);
    expect(state.labelFacets).toEqual([]);
    expect(state.filterViews.map((view) => view._id)).toEqual([activeFilterViewId]);
    expect(state.filterViewRows).toEqual([]);
  });

  it("bounds public inventory pages", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const snapshotId = await insertSnapshot(t, ids);
    const filterViewId = await insertFilterView(t, { ...ids, snapshotId });
    await expect(
      asUser.query(api.repositoryInventory.listRepositoryInventoryBranchPage, {
        vaultId: ids.vaultId,
        snapshotId,
        paginationOpts: { cursor: null, numItems: 11 },
      }),
    ).rejects.toThrow("Repository inventory branch pages must request between 1 and 10 items.");
    await expect(
      asUser.query(api.repositoryInventory.listRepositoryInventoryPullRequestPage, {
        vaultId: ids.vaultId,
        snapshotId,
        viewId: filterViewId,
        paginationOpts: { cursor: null, numItems: 11 },
      }),
    ).rejects.toThrow(
      "Repository inventory pull request pages must request between 1 and 10 items.",
    );
    await expect(
      asUser.query(api.repositoryInventory.listRepositoryInventoryLabelFacetPage, {
        vaultId: ids.vaultId,
        snapshotId,
        paginationOpts: { cursor: null, numItems: 26 },
      }),
    ).rejects.toThrow(
      "Repository inventory label facet pages must request between 1 and 25 items.",
    );
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

describe("repository inventory pull request filters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("publishes complete filter views without changing branch visibility", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const snapshotId = await insertSnapshot(t, {
      vaultId: ids.vaultId,
      branchCount: 1,
      pullRequestCount: 4,
      noLabelPullRequestCount: 1,
    });
    const initialFilterViewId = await insertFilterView(t, {
      ...ids,
      snapshotId,
      totalPullRequestCount: 4,
      visiblePullRequestCount: 3,
    });
    await insertInventory(t, {
      ...ids,
      lifecycle: { state: "idle" },
      publication: publication(snapshotId, initialFilterViewId),
    });
    await insertBranch(t, {
      vaultId: ids.vaultId,
      snapshotId,
      name: "main",
      isDefault: true,
      sortTime: 0,
    });
    const researchPullRequestId = await insertPullRequest(t, {
      vaultId: ids.vaultId,
      snapshotId,
      rowKey: "pull-request:research",
      number: 1,
      headRefName: "research",
      sortTime: -400,
      canOpenInSamebase: true,
      labelCount: 1,
      filterLabelKeys: ["research"],
    });
    const noLabelPullRequestId = await insertPullRequest(t, {
      vaultId: ids.vaultId,
      snapshotId,
      rowKey: "pull-request:no-label",
      number: 2,
      headRefName: "no-label",
      sortTime: -300,
      canOpenInSamebase: true,
    });
    await insertPullRequest(t, {
      vaultId: ids.vaultId,
      snapshotId,
      rowKey: "pull-request:draft",
      number: 42,
      headRefName: "draft",
      sortTime: -500,
      canOpenInSamebase: true,
      labelCount: 1,
      filterLabelKeys: ["ready"],
    });
    const readyPullRequestId = await insertPullRequest(t, {
      vaultId: ids.vaultId,
      snapshotId,
      rowKey: "pull-request:ready",
      number: 3,
      headRefName: "ready",
      sortTime: -200,
      canOpenInSamebase: true,
      labelCount: 1,
      filterLabelKeys: ["ready"],
    });
    await t.run(async (ctx) => {
      for (const membership of [
        {
          pullRequestItemId: researchPullRequestId,
          rowKey: "pull-request:research",
          sortTime: -400,
        },
        {
          pullRequestItemId: noLabelPullRequestId,
          rowKey: "pull-request:no-label",
          sortTime: -300,
        },
        {
          pullRequestItemId: readyPullRequestId,
          rowKey: "pull-request:ready",
          sortTime: -200,
        },
      ]) {
        await ctx.db.insert("vaultRepositoryInventoryFilterViewRows", {
          vaultId: ids.vaultId,
          snapshotId,
          viewId: initialFilterViewId,
          ...membership,
        });
      }
    });

    await expect(
      asUser.query(api.repositoryInventory.getRepositoryInventoryFilter, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      hiddenLabels: [],
      includeDrafts: false,
      includeNoLabel: true,
      revision: 0,
    });

    const defaultState = await asUser.query(api.repositoryInventory.getRepositoryInventoryState, {
      vaultId: ids.vaultId,
    });
    expect(defaultState).toMatchObject({
      state: "ready",
      activeSnapshotId: snapshotId,
      activeFilterRevision: 0,
    });
    if (defaultState.state !== "ready") {
      throw new Error("Expected a published default repository inventory filter view.");
    }
    await expect(
      asUser.query(api.repositoryInventory.listRepositoryInventoryPullRequestPage, {
        vaultId: ids.vaultId,
        snapshotId,
        viewId: defaultState.activeFilterViewId,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toMatchObject({
      state: "ready",
      expectedVisiblePullRequestCount: 3,
      totalPullRequestCount: 4,
      page: [{ number: 1 }, { number: 2 }, { number: 3 }],
      isDone: true,
    });

    await asUser.mutation(api.repositoryInventory.setRepositoryInventoryFilter, {
      vaultId: ids.vaultId,
      hiddenLabels: [" Research ", "research"],
      includeDrafts: true,
      includeNoLabel: false,
    });
    await expect(
      asUser.query(api.repositoryInventory.getRepositoryInventoryFilter, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      hiddenLabels: ["Research"],
      includeDrafts: true,
      includeNoLabel: false,
      revision: 1,
    });
    await asUser.mutation(api.repositoryInventory.setRepositoryInventoryFilter, {
      vaultId: ids.vaultId,
      hiddenLabels: ["research"],
      includeDrafts: true,
      includeNoLabel: false,
    });
    await expect(
      asUser.query(api.repositoryInventory.getRepositoryInventoryFilter, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      hiddenLabels: ["Research"],
      includeDrafts: true,
      includeNoLabel: false,
      revision: 1,
    });
    await expect(
      asUser.query(api.repositoryInventory.getRepositoryInventoryState, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toMatchObject({
      state: "ready",
      activeFilterViewId: defaultState.activeFilterViewId,
      activeFilterRevision: 0,
    });

    await finishFilterMaterialization(t, { snapshotId, filterRevision: 1 });
    const filteredState = await asUser.query(api.repositoryInventory.getRepositoryInventoryState, {
      vaultId: ids.vaultId,
    });
    expect(filteredState).toMatchObject({
      state: "ready",
      activeSnapshotId: snapshotId,
      activeFilterRevision: 1,
    });
    if (filteredState.state !== "ready") {
      throw new Error("Expected a published custom repository inventory filter view.");
    }
    expect(filteredState.activeFilterViewId).not.toBe(defaultState.activeFilterViewId);
    await expect(
      asUser.query(api.repositoryInventory.listRepositoryInventoryPullRequestPage, {
        vaultId: ids.vaultId,
        snapshotId,
        viewId: filteredState.activeFilterViewId,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toMatchObject({
      state: "ready",
      expectedVisiblePullRequestCount: 2,
      totalPullRequestCount: 4,
      page: [{ number: 42 }, { number: 3 }],
      isDone: true,
    });
    await expect(
      asUser.query(api.repositoryInventory.listRepositoryInventoryBranchPage, {
        vaultId: ids.vaultId,
        snapshotId,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toMatchObject({
      state: "ready",
      expectedBranchCount: 1,
      page: [{ kind: "branch", name: "main", isDefault: true }],
      isDone: true,
    });
  });

  it("publishes the latest filter revision without discarding a completed crawl", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const activeSnapshotId = await insertSnapshot(t, ids);
    const activeFilterViewId = await insertFilterView(t, {
      ...ids,
      snapshotId: activeSnapshotId,
    });
    const stagingSnapshotId = await insertSnapshot(t, {
      ...ids,
      state: "collecting",
      pullRequestCount: 2,
      labelCount: 2,
    });
    await insertPullRequest(t, {
      vaultId: ids.vaultId,
      snapshotId: stagingSnapshotId,
      rowKey: "pull-request:research",
      number: 1,
      headRefName: "research",
      sortTime: -200,
      canOpenInSamebase: true,
      labelCount: 1,
      filterLabelKeys: ["research"],
    });
    await insertPullRequest(t, {
      vaultId: ids.vaultId,
      snapshotId: stagingSnapshotId,
      rowKey: "pull-request:draft",
      number: 42,
      headRefName: "draft",
      sortTime: -100,
      canOpenInSamebase: true,
      labelCount: 1,
      filterLabelKeys: ["ready"],
    });
    await insertInventory(t, {
      ...ids,
      lifecycle: {
        state: "running",
        snapshotId: stagingSnapshotId,
        targetWriteVersion: 0,
        required: false,
        startedAt: now,
        workpoolJobId: "job-filter-churn",
      },
      publication: publication(activeSnapshotId, activeFilterViewId),
    });
    await t.mutation(internal.repositoryInventory.handoffCompletedRepositoryInventorySnapshot, {
      vaultId: ids.vaultId,
      snapshotId: stagingSnapshotId,
      repositoryNodeId: "R_inventory",
      repositoryFullName: "ada/inventory",
      defaultBranch: "main",
      branchCount: 0,
      pullRequestCount: 2,
      labelCount: 2,
      labelChunkCount: 0,
      labelFacetCount: 0,
      noLabelPullRequestCount: 0,
      fingerprint: "completed-crawl",
      crawlCost: 11,
      ...summaryObservation(),
    });

    await asUser.mutation(api.repositoryInventory.setRepositoryInventoryFilter, {
      vaultId: ids.vaultId,
      hiddenLabels: ["research"],
      includeDrafts: false,
      includeNoLabel: true,
    });
    await asUser.mutation(api.repositoryInventory.setRepositoryInventoryFilter, {
      vaultId: ids.vaultId,
      hiddenLabels: ["research"],
      includeDrafts: true,
      includeNoLabel: true,
    });
    await asUser.mutation(api.repositoryInventory.setRepositoryInventoryFilter, {
      vaultId: ids.vaultId,
      hiddenLabels: ["research"],
      includeDrafts: true,
      includeNoLabel: false,
    });

    const staleViews = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultRepositoryInventoryFilterViews")
          .withIndex("by_snapshot", (q) => q.eq("snapshotId", stagingSnapshotId))
          .collect(),
    );
    for (const view of staleViews) {
      if (view.filterRevision < 3) {
        await t.mutation(
          internal.repositoryInventory.advanceRepositoryInventoryFilterMaterialization,
          { viewId: view._id },
        );
      }
    }
    await expect(readVaultInventory(t, ids.vaultId)).resolves.toMatchObject({
      inventory: {
        lifecycle: { state: "materializing", snapshotId: stagingSnapshotId },
        publication: { snapshotId: activeSnapshotId, filterRevision: 0 },
      },
    });

    const latestFilterViewId = await finishFilterMaterialization(t, {
      snapshotId: stagingSnapshotId,
      filterRevision: 3,
    });
    const publishedState = await readVaultInventory(t, ids.vaultId);
    expect(publishedState.inventory).toMatchObject({
      lifecycle: { state: "idle" },
      publication: {
        snapshotId: stagingSnapshotId,
        filterViewId: latestFilterViewId,
        filterRevision: 3,
        fingerprint: "completed-crawl",
      },
    });
    expect(publishedState.snapshots).toContainEqual(
      expect.objectContaining({ _id: stagingSnapshotId, state: "ready" }),
    );
    await expect(
      asUser.query(api.repositoryInventory.listRepositoryInventoryPullRequestPage, {
        vaultId: ids.vaultId,
        snapshotId: stagingSnapshotId,
        viewId: latestFilterViewId,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toMatchObject({
      state: "ready",
      expectedVisiblePullRequestCount: 1,
      totalPullRequestCount: 2,
      page: [{ number: 42 }],
      isDone: true,
    });
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
    const filterViewId = await insertFilterView(t, {
      ...ids,
      snapshotId,
      totalPullRequestCount: 3,
      visiblePullRequestCount: 2,
    });
    await insertInventory(t, {
      ...ids,
      lifecycle: { state: "idle" },
      publication: publication(snapshotId, filterViewId, {
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
