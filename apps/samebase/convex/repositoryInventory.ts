import { vOnCompleteArgs } from "@convex-dev/workpool";
import { paginationOptsValidator } from "convex/server";
import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { mutation, query } from "./functions";
import { readOwnedActiveRun } from "./accountDeletion/stepContext";
import { clearGitHubGraphqlRateBudgetLeaseForVault } from "./githubGraphqlRateBudget";
import { githubObservationWorkpool } from "./githubObservationWorkpool";
import {
  claimRepositorySummaryForInventory,
  completeRepositorySummaryInventoryObservation,
  failRepositorySummaryInventoryObservation,
  releaseRepositorySummaryInventoryObservation,
  scheduleRepositorySummaryForInventory,
} from "./repositorySummary";
import { toErrorMessage } from "./jsonUtils";
import {
  REPOSITORY_INVENTORY_DEMAND_TTL_MS,
  DEFAULT_REPOSITORY_INVENTORY_FILTERS,
  normalizeRepositoryInventoryFilters,
  repositoryInventoryMinimumRefreshIntervalMs,
  repositoryInventoryBranchRowKey,
  repositoryInventoryFilterLabelKey,
  vRepositoryInventoryBranchPageResult,
  vRepositoryInventoryBranchContext,
  vRepositoryInventoryFilterState,
  vRepositoryInventoryFilters,
  vRepositoryInventoryLabelFacetPageResult,
  vRepositoryInventoryLabelPageResult,
  vRepositoryInventoryPullRequestPageResult,
  vRepositoryInventoryPublicState,
  vRepositoryInventoryRefreshRequestResult,
  vRepositoryInventoryLabelChunk,
  vStoredRepositoryInventoryPullRequestLabelFacet,
  vStoredRepositoryInventoryItem,
  type RepositoryInventoryBranchPageResult,
  type RepositoryInventoryBranchContext,
  type RepositoryInventoryCommit,
  type RepositoryInventoryFilterState,
  type RepositoryInventoryLabelFacetPageResult,
  type RepositoryInventoryLabelPageResult,
  type RepositoryInventoryPullRequestPageResult,
  type RepositoryInventoryPublicState,
  type RepositoryInventoryRefreshRequestResult,
  type RepositoryInventoryScheduledWait,
} from "./repositoryInventoryModel";
import { vRepositorySummaryDefaultBranch } from "./repositorySummaryModel";
import { isLiveConnectedVault } from "./vault/state";

const { array, boolean, id, literal, null: vNull, number, object, string, union } = v;
const REPOSITORY_INVENTORY_CLEANUP_BATCH_SIZE = 100;
const REPOSITORY_INVENTORY_PUBLIC_PAGE_SIZE = 10;
const REPOSITORY_INVENTORY_PUBLIC_LABEL_CHUNK_PAGE_SIZE = 5;
const REPOSITORY_INVENTORY_PUBLIC_LABEL_FACET_PAGE_SIZE = 25;
const REPOSITORY_INVENTORY_FILTER_MATERIALIZATION_BATCH_SIZE = 100;
const REPOSITORY_INVENTORY_FILTER_MATERIALIZATION_WATCHDOG_MS = 30_000;
const ACCOUNT_DELETION_QUIESCE_BATCH_SIZE = 25;

const repositoryInventoryWorkpoolContext = object({
  vaultId: id("vaults"),
  snapshotId: id("vaultRepositoryInventorySnapshots"),
});

const vRepositoryInventoryWorkerInput = union(
  object({
    kind: literal("ready"),
    userId: id("users"),
    vaultId: id("vaults"),
    githubRepositoryId: string(),
    repositoryNodeId: string(),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    estimatedCrawlCost: v.optional(number()),
  }),
  object({
    kind: literal("cancel"),
  }),
);
export type RepositoryInventoryWorkerInput = Infer<typeof vRepositoryInventoryWorkerInput>;

type RepositoryInventoryStateDoc = Doc<"vaultRepositoryInventories">;

export type ActiveRepositoryInventoryBranchSelection = {
  repositoryFullName: string;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  defaultBranch: string | null;
  branch?: {
    name: string;
    isDefault: boolean;
    headCommit: RepositoryInventoryCommit;
  };
};

async function readInventoryState(
  ctx: Pick<MutationCtx | QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<RepositoryInventoryStateDoc | null> {
  return await ctx.db
    .query("vaultRepositoryInventories")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .unique();
}

async function readRepositoryInventoryFilterState(
  ctx: Pick<MutationCtx | QueryCtx, "db">,
  userId: Id<"users">,
  vaultId: Id<"vaults">,
): Promise<RepositoryInventoryFilterState> {
  const filter = await ctx.db
    .query("vaultRepositoryInventoryFilters")
    .withIndex("by_user_and_vault", (q) => q.eq("userId", userId).eq("vaultId", vaultId))
    .unique();
  return filter
    ? {
        hiddenLabels: filter.hiddenLabels,
        includeDrafts: filter.includeDrafts,
        includeNoLabel: filter.includeNoLabel,
        revision: filter.revision,
      }
    : { ...DEFAULT_REPOSITORY_INVENTORY_FILTERS, revision: 0 };
}

function sameRepositoryInventoryFilters(
  left: RepositoryInventoryFilterState,
  right: ReturnType<typeof normalizeRepositoryInventoryFilters>,
): boolean {
  return (
    left.includeDrafts === right.includeDrafts &&
    left.includeNoLabel === right.includeNoLabel &&
    left.hiddenLabels.length === right.hiddenLabels.length &&
    left.hiddenLabels.every(
      (name, index) =>
        repositoryInventoryFilterLabelKey(name) ===
        repositoryInventoryFilterLabelKey(right.hiddenLabels[index] ?? ""),
    )
  );
}

function repositoryInventoryMaterializationSourceId(
  inventory: RepositoryInventoryStateDoc,
): Id<"vaultRepositoryInventorySnapshots"> | null {
  return inventory.lifecycle.state === "materializing"
    ? inventory.lifecycle.snapshotId
    : (inventory.publication?.snapshotId ?? null);
}

export const getRepositoryInventoryFilterForBuild = internalQuery({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
  },
  returns: vRepositoryInventoryFilterState,
  handler: async (ctx, args): Promise<RepositoryInventoryFilterState> => {
    return await readRepositoryInventoryFilterState(ctx, args.userId, args.vaultId);
  },
});

export async function readActiveRepositoryInventoryBranchSelection(
  ctx: Pick<QueryCtx, "db">,
  args: {
    vaultId: Id<"vaults">;
    branch: string;
  },
): Promise<ActiveRepositoryInventoryBranchSelection | null> {
  const inventory = await readInventoryState(ctx, args.vaultId);
  const publication = inventory?.publication;
  if (publication === undefined) {
    return null;
  }

  const storedBranch = await ctx.db
    .query("vaultRepositoryInventoryItems")
    .withIndex("by_snapshot_and_rowKey", (q) =>
      q
        .eq("snapshotId", publication.snapshotId)
        .eq("rowKey", repositoryInventoryBranchRowKey(args.branch)),
    )
    .unique();
  if (storedBranch?.kind === "pull_request") {
    throw new Error("Repository inventory branch row key points at a pull request.");
  }

  return {
    repositoryFullName: publication.repositoryFullName,
    snapshotId: publication.snapshotId,
    defaultBranch: publication.defaultBranch,
    branch: storedBranch
      ? {
          name: storedBranch.name,
          isDefault: storedBranch.isDefault,
          headCommit: storedBranch.headCommit,
        }
      : undefined,
  };
}

async function scheduleSnapshotCleanup(
  ctx: MutationCtx,
  snapshotId: Id<"vaultRepositoryInventorySnapshots">,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.repositoryInventory.cleanupRepositoryInventorySnapshot, {
    snapshotId,
  });
}

async function scheduleFilterViewCleanup(
  ctx: MutationCtx,
  viewId: Id<"vaultRepositoryInventoryFilterViews">,
): Promise<void> {
  await ctx.scheduler.runAfter(
    0,
    internal.repositoryInventory.cleanupRepositoryInventoryFilterView,
    { viewId },
  );
}

async function failRepositoryInventoryFilterMaterialization(
  ctx: MutationCtx,
  args: {
    inventory: RepositoryInventoryStateDoc;
    view: Doc<"vaultRepositoryInventoryFilterViews">;
    message: string;
  },
): Promise<void> {
  const failedAt = Date.now();
  const activeSnapshotId =
    args.inventory.lifecycle.state === "scheduled" ||
    args.inventory.lifecycle.state === "running" ||
    args.inventory.lifecycle.state === "materializing"
      ? args.inventory.lifecycle.snapshotId
      : null;
  await ctx.db.patch(args.inventory._id, {
    lifecycle: {
      state: "failed",
      failedAt,
      message: args.message,
    },
  });
  if (activeSnapshotId !== null && activeSnapshotId !== args.inventory.publication?.snapshotId) {
    await failRepositorySummaryInventoryObservation(ctx, {
      vaultId: args.inventory.vaultId,
      snapshotId: activeSnapshotId,
      message: args.message,
    });
    await scheduleSnapshotCleanup(ctx, activeSnapshotId);
  }
  if (args.view.snapshotId !== activeSnapshotId) {
    await scheduleFilterViewCleanup(ctx, args.view._id);
  }
}

async function ensureRepositoryInventoryFilterMaterialization(
  ctx: MutationCtx,
  args: {
    vaultId: Id<"vaults">;
    snapshotId: Id<"vaultRepositoryInventorySnapshots">;
    filterRevision: number;
    totalPullRequestCount: number;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("vaultRepositoryInventoryFilterViews")
    .withIndex("by_snapshot_and_filterRevision", (q) =>
      q.eq("snapshotId", args.snapshotId).eq("filterRevision", args.filterRevision),
    )
    .unique();
  if (existing) {
    if (existing.state === "building") {
      await ctx.scheduler.runAfter(
        0,
        internal.repositoryInventory.advanceRepositoryInventoryFilterMaterialization,
        { viewId: existing._id },
      );
    }
    return;
  }
  const viewId = await ctx.db.insert("vaultRepositoryInventoryFilterViews", {
    state: "building",
    vaultId: args.vaultId,
    snapshotId: args.snapshotId,
    filterRevision: args.filterRevision,
    totalPullRequestCount: args.totalPullRequestCount,
    processedPullRequestCount: 0,
    visiblePullRequestCount: 0,
    cursor: null,
  });
  await ctx.scheduler.runAfter(
    0,
    internal.repositoryInventory.advanceRepositoryInventoryFilterMaterialization,
    { viewId },
  );
}

async function scheduleRepositoryInventoryRefresh(
  ctx: MutationCtx,
  inventory: RepositoryInventoryStateDoc,
  args: {
    required: boolean;
    wait?: RepositoryInventoryScheduledWait;
  },
): Promise<Id<"vaultRepositoryInventorySnapshots"> | null> {
  if (inventory.lifecycle.state !== "idle" && inventory.lifecycle.state !== "failed") {
    return null;
  }
  const wait = args.wait ?? { kind: "immediate" };
  const scheduledAt = Date.now();
  const runAt = wait.kind === "immediate" ? scheduledAt : wait.retryAt;
  const snapshotId = await ctx.db.insert("vaultRepositoryInventorySnapshots", {
    state: "collecting",
    vaultId: inventory.vaultId,
    branchCount: 0,
    pullRequestCount: 0,
    labelCount: 0,
    labelChunkCount: 0,
    labelFacetCount: 0,
    noLabelPullRequestCount: 0,
  });
  const workpoolJobId = await githubObservationWorkpool.enqueueAction(
    ctx,
    internal.repositoryInventoryActions.runRepositoryInventoryRefresh,
    {
      vaultId: inventory.vaultId,
      snapshotId,
    },
    {
      context: {
        vaultId: inventory.vaultId,
        snapshotId,
      },
      onComplete: internal.repositoryInventory.handleRepositoryInventoryComplete,
      retry: false,
      runAt,
    },
  );
  await ctx.db.patch(inventory._id, {
    lifecycle: {
      state: "scheduled",
      snapshotId,
      targetWriteVersion: inventory.writeVersion,
      required: args.required,
      scheduledAt,
      workpoolJobId,
      wait,
    },
  });
  await scheduleRepositorySummaryForInventory(ctx, {
    userId: inventory.userId,
    vaultId: inventory.vaultId,
    snapshotId,
    scheduledAt,
    wait,
  });
  return snapshotId;
}

function minimumIntervalWait(
  inventory: RepositoryInventoryStateDoc,
  now: number,
): RepositoryInventoryScheduledWait {
  if (inventory.lastStartedAt === undefined) {
    return { kind: "immediate" };
  }
  const retryAt =
    inventory.lastStartedAt +
    repositoryInventoryMinimumRefreshIntervalMs(inventory.estimatedCrawlCost);
  return retryAt > now ? { kind: "queue", retryAt } : { kind: "immediate" };
}

async function cancelOwnedInventoryJob(
  ctx: MutationCtx,
  inventory: RepositoryInventoryStateDoc,
): Promise<void> {
  if (inventory.lifecycle.state !== "scheduled" && inventory.lifecycle.state !== "running") {
    return;
  }
  // @ts-expect-error This value was returned by this Workpool and persisted as a string.
  await githubObservationWorkpool.cancel(ctx, inventory.lifecycle.workpoolJobId);
}

async function rescheduleRequiredInventoryRefresh(
  ctx: MutationCtx,
  inventory: RepositoryInventoryStateDoc,
): Promise<void> {
  if (inventory.lifecycle.state !== "scheduled") {
    return;
  }
  const obsoleteSnapshotId = inventory.lifecycle.snapshotId;
  await cancelOwnedInventoryJob(ctx, inventory);
  await ctx.db.patch(inventory._id, { lifecycle: { state: "idle" } });
  await scheduleSnapshotCleanup(ctx, obsoleteSnapshotId);
  const idleInventory = await ctx.db.get(inventory._id);
  if (!idleInventory) {
    throw new Error("Repository inventory disappeared while rescheduling.");
  }
  await scheduleRepositoryInventoryRefresh(ctx, idleInventory, { required: true });
}

async function requestRepositoryInventoryRefreshForUser(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    required: boolean;
  },
): Promise<RepositoryInventoryRefreshRequestResult> {
  const [user, vault, existingInventory] = await Promise.all([
    ctx.db.get(args.userId),
    ctx.db.get(args.vaultId),
    readInventoryState(ctx, args.vaultId),
  ]);
  if (!user || user.accountDeletion !== undefined) {
    throw new Error("Repository inventory is unavailable during account deletion.");
  }
  if (!vault || vault.userId !== args.userId || !isLiveConnectedVault(vault)) {
    throw new Error("Vault not found.");
  }

  const now = Date.now();
  const wantedUntil = Math.max(
    existingInventory?.wantedUntil ?? 0,
    now + REPOSITORY_INVENTORY_DEMAND_TTL_MS,
  );
  if (existingInventory === null) {
    const inventoryId = await ctx.db.insert("vaultRepositoryInventories", {
      userId: args.userId,
      vaultId: args.vaultId,
      wantedUntil,
      writeVersion: args.required ? 1 : 0,
      lifecycle: { state: "idle" },
    });
    const inventory = await ctx.db.get(inventoryId);
    if (!inventory) {
      throw new Error("Repository inventory was not created.");
    }
    await scheduleRepositoryInventoryRefresh(ctx, inventory, { required: args.required });
    return { kind: "scheduled" };
  }
  if (existingInventory.userId !== args.userId) {
    throw new Error("Repository inventory owner mismatch.");
  }

  const writeVersion = existingInventory.writeVersion + (args.required ? 1 : 0);
  switch (existingInventory.lifecycle.state) {
    case "scheduled":
      await ctx.db.patch(existingInventory._id, {
        wantedUntil,
        writeVersion,
        lifecycle: args.required
          ? {
              ...existingInventory.lifecycle,
              targetWriteVersion: writeVersion,
              required: true,
            }
          : existingInventory.lifecycle,
      });
      if (args.required && existingInventory.lifecycle.wait.kind !== "immediate") {
        const patchedInventory = await ctx.db.get(existingInventory._id);
        if (!patchedInventory) {
          throw new Error("Repository inventory disappeared while requesting a refresh.");
        }
        await rescheduleRequiredInventoryRefresh(ctx, patchedInventory);
      }
      return { kind: "running" };
    case "running":
      await ctx.db.patch(existingInventory._id, { wantedUntil, writeVersion });
      return { kind: "running" };
    case "materializing": {
      await ctx.db.patch(existingInventory._id, { wantedUntil, writeVersion });
      const [filter, snapshot] = await Promise.all([
        readRepositoryInventoryFilterState(ctx, args.userId, args.vaultId),
        ctx.db.get(existingInventory.lifecycle.snapshotId),
      ]);
      if (snapshot?.state === "ready" && snapshot.vaultId === args.vaultId) {
        await ensureRepositoryInventoryFilterMaterialization(ctx, {
          vaultId: args.vaultId,
          snapshotId: snapshot._id,
          filterRevision: filter.revision,
          totalPullRequestCount: snapshot.pullRequestCount,
        });
      }
      return { kind: "running" };
    }
    case "idle":
    case "failed": {
      await ctx.db.patch(existingInventory._id, { wantedUntil, writeVersion });
      const inventory = await ctx.db.get(existingInventory._id);
      if (!inventory) {
        throw new Error("Repository inventory disappeared while requesting a refresh.");
      }
      const wait = args.required
        ? { kind: "immediate" as const }
        : minimumIntervalWait(inventory, now);
      if (wait.kind !== "immediate") {
        return { kind: "deferred", retryAt: wait.retryAt };
      }
      await scheduleRepositoryInventoryRefresh(ctx, inventory, {
        required: args.required,
        wait,
      });
      return { kind: "scheduled" };
    }
    default: {
      existingInventory.lifecycle satisfies never;
      throw new Error("Unsupported repository inventory lifecycle.");
    }
  }
}

export const getRepositoryInventoryFilter = query({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
  },
  returns: vRepositoryInventoryFilterState,
  handler: async (ctx, args): Promise<RepositoryInventoryFilterState> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== ctx.viewer.userId || !isLiveConnectedVault(vault)) {
      return { ...DEFAULT_REPOSITORY_INVENTORY_FILTERS, revision: 0 };
    }
    return await readRepositoryInventoryFilterState(ctx, ctx.viewer.userId, args.vaultId);
  },
});

export const setRepositoryInventoryFilter = mutation({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
    ...vRepositoryInventoryFilters.fields,
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== ctx.viewer.userId || !isLiveConnectedVault(vault)) {
      throw new Error("Vault not found.");
    }
    const normalized = normalizeRepositoryInventoryFilters(args);
    const current = await readRepositoryInventoryFilterState(ctx, ctx.viewer.userId, args.vaultId);
    if (sameRepositoryInventoryFilters(current, normalized)) {
      return null;
    }

    const revision = current.revision + 1;
    const existing = await ctx.db
      .query("vaultRepositoryInventoryFilters")
      .withIndex("by_user_and_vault", (q) =>
        q.eq("userId", ctx.viewer.userId).eq("vaultId", args.vaultId),
      )
      .unique();
    if (existing) {
      await ctx.db.replace(existing._id, {
        userId: ctx.viewer.userId,
        vaultId: args.vaultId,
        ...normalized,
        revision,
      });
    } else {
      await ctx.db.insert("vaultRepositoryInventoryFilters", {
        userId: ctx.viewer.userId,
        vaultId: args.vaultId,
        ...normalized,
        revision,
      });
    }

    const inventory = await readInventoryState(ctx, args.vaultId);
    if (inventory) {
      const snapshotId = repositoryInventoryMaterializationSourceId(inventory);
      const snapshot = snapshotId ? await ctx.db.get(snapshotId) : null;
      if (snapshotId !== null && snapshot?.state === "ready" && snapshot.vaultId === args.vaultId) {
        await ensureRepositoryInventoryFilterMaterialization(ctx, {
          vaultId: args.vaultId,
          snapshotId,
          filterRevision: revision,
          totalPullRequestCount: snapshot.pullRequestCount,
        });
      }
    }
    return null;
  },
});

export const requestRepositoryInventoryRefresh = mutation({
  access: "access_app_refresh",
  args: {
    vaultId: id("vaults"),
  },
  returns: vRepositoryInventoryRefreshRequestResult,
  handler: async (ctx, args): Promise<RepositoryInventoryRefreshRequestResult> => {
    return await requestRepositoryInventoryRefreshForUser(ctx, {
      userId: ctx.viewer.userId,
      vaultId: args.vaultId,
      required: false,
    });
  },
});

export const requestRepositoryInventoryRefreshAfterWrite = internalMutation({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
  },
  returns: vRepositoryInventoryRefreshRequestResult,
  handler: async (ctx, args): Promise<RepositoryInventoryRefreshRequestResult> => {
    return await requestRepositoryInventoryRefreshForUser(ctx, {
      ...args,
      required: true,
    });
  },
});

export const claimRepositoryInventoryRefresh = internalMutation({
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
  },
  returns: vRepositoryInventoryWorkerInput,
  handler: async (ctx, args): Promise<RepositoryInventoryWorkerInput> => {
    const inventory = await readInventoryState(ctx, args.vaultId);
    if (
      !inventory ||
      inventory.lifecycle.state !== "scheduled" ||
      inventory.lifecycle.snapshotId !== args.snapshotId
    ) {
      return { kind: "cancel" };
    }
    const now = Date.now();
    if (!inventory.lifecycle.required && inventory.wantedUntil <= now) {
      await ctx.db.patch(inventory._id, { lifecycle: { state: "idle" } });
      await releaseRepositorySummaryInventoryObservation(ctx, args);
      await scheduleSnapshotCleanup(ctx, args.snapshotId);
      return { kind: "cancel" };
    }

    const [vault, snapshot] = await Promise.all([
      ctx.db.get(args.vaultId),
      ctx.db.get(args.snapshotId),
    ]);
    if (
      !vault ||
      vault.userId !== inventory.userId ||
      !isLiveConnectedVault(vault) ||
      !snapshot ||
      snapshot.state !== "collecting" ||
      snapshot.vaultId !== args.vaultId
    ) {
      await transitionRepositoryInventoryToFailed(
        ctx,
        inventory,
        "Repository inventory vault is no longer connected.",
      );
      return { kind: "cancel" };
    }

    await ctx.db.patch(inventory._id, {
      lifecycle: {
        state: "running",
        snapshotId: args.snapshotId,
        targetWriteVersion: inventory.lifecycle.targetWriteVersion,
        required: inventory.lifecycle.required,
        startedAt: now,
        workpoolJobId: inventory.lifecycle.workpoolJobId,
      },
      lastStartedAt: now,
    });
    await claimRepositorySummaryForInventory(ctx, {
      userId: inventory.userId,
      vaultId: args.vaultId,
      snapshotId: args.snapshotId,
      startedAt: now,
    });
    return {
      kind: "ready",
      userId: inventory.userId,
      vaultId: args.vaultId,
      githubRepositoryId: vault.ghRepoId,
      repositoryNodeId: vault.ghRepoNodeId,
      snapshotId: args.snapshotId,
      estimatedCrawlCost: inventory.estimatedCrawlCost,
    };
  },
});

async function readOwnedRunningInventory(
  ctx: Pick<MutationCtx, "db">,
  args: {
    vaultId: Id<"vaults">;
    snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  },
): Promise<RepositoryInventoryStateDoc | null> {
  const inventory = await readInventoryState(ctx, args.vaultId);
  return inventory?.lifecycle.state === "running" &&
    inventory.lifecycle.snapshotId === args.snapshotId
    ? inventory
    : null;
}

export const deferRepositoryInventoryRefresh = internalMutation({
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    reason: union(literal("queue"), literal("rate_limit")),
    retryAt: number(),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const [inventory, snapshot] = await Promise.all([
      readOwnedRunningInventory(ctx, args),
      ctx.db.get(args.snapshotId),
    ]);
    if (
      !inventory ||
      inventory.lifecycle.state !== "running" ||
      !snapshot ||
      snapshot.state !== "collecting"
    ) {
      return null;
    }
    if (
      snapshot.branchCount !== 0 ||
      snapshot.pullRequestCount !== 0 ||
      snapshot.labelCount !== 0 ||
      snapshot.labelChunkCount !== 0 ||
      snapshot.labelFacetCount !== 0 ||
      snapshot.noLabelPullRequestCount !== 0
    ) {
      throw new Error("Repository inventory cannot wait after staging provider data.");
    }

    const required =
      inventory.lifecycle.required ||
      inventory.writeVersion > inventory.lifecycle.targetWriteVersion;
    await ctx.db.patch(inventory._id, { lifecycle: { state: "idle" } });
    await scheduleSnapshotCleanup(ctx, args.snapshotId);
    const idleInventory = await ctx.db.get(inventory._id);
    if (!idleInventory || (!required && idleInventory.wantedUntil <= Date.now())) {
      await releaseRepositorySummaryInventoryObservation(ctx, args);
      return null;
    }
    const scheduledSnapshotId = await scheduleRepositoryInventoryRefresh(ctx, idleInventory, {
      required,
      wait: {
        kind: args.reason,
        retryAt: Math.max(args.retryAt, Date.now() + 1_000),
      },
    });
    if (scheduledSnapshotId === null) {
      throw new Error("Repository inventory could not be rescheduled after waiting.");
    }
    return null;
  },
});

export const stageRepositoryInventoryItems = internalMutation({
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    items: array(vStoredRepositoryInventoryItem),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const [inventory, snapshot] = await Promise.all([
      readOwnedRunningInventory(ctx, args),
      ctx.db.get(args.snapshotId),
    ]);
    if (
      !inventory ||
      !snapshot ||
      snapshot.state !== "collecting" ||
      snapshot.vaultId !== args.vaultId
    ) {
      throw new Error("Repository inventory snapshot is not running.");
    }
    let branchCount = 0;
    let pullRequestCount = 0;
    let noLabelPullRequestCount = 0;
    for (const item of args.items) {
      if (item.vaultId !== args.vaultId || item.snapshotId !== args.snapshotId) {
        throw new Error("Repository inventory item belongs to another snapshot.");
      }
      if (item.kind === "branch") {
        branchCount += 1;
      } else {
        pullRequestCount += 1;
        if (item.filterLabelKeys.length === 0) {
          noLabelPullRequestCount += 1;
        }
      }
      await ctx.db.insert("vaultRepositoryInventoryItems", item);
    }
    await ctx.db.patch(snapshot._id, {
      branchCount: snapshot.branchCount + branchCount,
      pullRequestCount: snapshot.pullRequestCount + pullRequestCount,
      noLabelPullRequestCount: snapshot.noLabelPullRequestCount + noLabelPullRequestCount,
    });
    return null;
  },
});

export const stageRepositoryInventoryLabelChunks = internalMutation({
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    labelChunks: array(vRepositoryInventoryLabelChunk),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const [inventory, snapshot] = await Promise.all([
      readOwnedRunningInventory(ctx, args),
      ctx.db.get(args.snapshotId),
    ]);
    if (
      !inventory ||
      !snapshot ||
      snapshot.state !== "collecting" ||
      snapshot.vaultId !== args.vaultId
    ) {
      throw new Error("Repository inventory snapshot is not running.");
    }
    for (const labelChunk of args.labelChunks) {
      if (labelChunk.vaultId !== args.vaultId || labelChunk.snapshotId !== args.snapshotId) {
        throw new Error("Repository inventory labels belong to another snapshot.");
      }
      await ctx.db.insert("vaultRepositoryInventoryLabelChunks", labelChunk);
    }
    await ctx.db.patch(snapshot._id, {
      labelCount:
        snapshot.labelCount +
        args.labelChunks.reduce((count, labelChunk) => count + labelChunk.labels.length, 0),
      labelChunkCount: snapshot.labelChunkCount + args.labelChunks.length,
    });
    return null;
  },
});

export const stageRepositoryInventoryLabelFacets = internalMutation({
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    facets: array(vStoredRepositoryInventoryPullRequestLabelFacet),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const [inventory, snapshot] = await Promise.all([
      readOwnedRunningInventory(ctx, args),
      ctx.db.get(args.snapshotId),
    ]);
    if (
      !inventory ||
      !snapshot ||
      snapshot.state !== "collecting" ||
      snapshot.vaultId !== args.vaultId
    ) {
      throw new Error("Repository inventory snapshot is not running.");
    }
    for (const facet of args.facets) {
      if (facet.vaultId !== args.vaultId || facet.snapshotId !== args.snapshotId) {
        throw new Error("Repository inventory label facet belongs to another snapshot.");
      }
      await ctx.db.insert("vaultRepositoryInventoryLabelFacets", facet);
    }
    await ctx.db.patch(snapshot._id, {
      labelFacetCount: snapshot.labelFacetCount + args.facets.length,
    });
    return null;
  },
});

async function finishSuccessfulRefresh(
  ctx: MutationCtx,
  inventory: RepositoryInventoryStateDoc,
  args: {
    crawlCost: number;
  },
): Promise<void> {
  if (inventory.lifecycle.state !== "running" && inventory.lifecycle.state !== "materializing") {
    throw new Error("Repository inventory refresh is not active.");
  }
  const trailingWrite = inventory.writeVersion > inventory.lifecycle.targetWriteVersion;
  await ctx.db.patch(inventory._id, {
    lifecycle: { state: "idle" },
    estimatedCrawlCost: args.crawlCost,
  });
  if (!trailingWrite) {
    return;
  }
  const idleInventory = await ctx.db.get(inventory._id);
  if (!idleInventory) {
    throw new Error("Repository inventory disappeared after publication.");
  }
  await scheduleRepositoryInventoryRefresh(ctx, idleInventory, {
    required: true,
    wait: { kind: "immediate" },
  });
}

export const completeUnchangedRepositoryInventoryRefresh = internalMutation({
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    fingerprint: string(),
    crawlCost: number(),
    summaryDefaultBranch: vRepositorySummaryDefaultBranch,
    summaryOpenPullRequestCount: number(),
  },
  returns: boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const [inventory, snapshot] = await Promise.all([
      readOwnedRunningInventory(ctx, args),
      ctx.db.get(args.snapshotId),
    ]);
    if (
      !inventory ||
      inventory.lifecycle.state !== "running" ||
      !snapshot ||
      snapshot.state !== "collecting"
    ) {
      throw new Error("Repository inventory snapshot is not running.");
    }
    await ctx.db.patch(inventory._id, { estimatedCrawlCost: args.crawlCost });
    if (inventory.publication?.fingerprint !== args.fingerprint) {
      return false;
    }
    if (
      snapshot.branchCount !== 0 ||
      snapshot.pullRequestCount !== 0 ||
      snapshot.labelCount !== 0 ||
      snapshot.labelChunkCount !== 0 ||
      snapshot.labelFacetCount !== 0 ||
      snapshot.noLabelPullRequestCount !== 0
    ) {
      throw new Error("Repository inventory snapshot was staged before its fingerprint check.");
    }

    const checkedAt = Date.now();
    await ctx.db.delete(snapshot._id);
    await ctx.db.patch(inventory._id, {
      publication: {
        ...inventory.publication,
        checkedAt,
      },
    });
    await completeRepositorySummaryInventoryObservation(ctx, {
      userId: inventory.userId,
      vaultId: args.vaultId,
      snapshotId: args.snapshotId,
      repositoryFullName: inventory.publication.repositoryFullName,
      defaultBranch: args.summaryDefaultBranch,
      openPullRequestCount: args.summaryOpenPullRequestCount,
    });
    const patchedInventory = await ctx.db.get(inventory._id);
    if (!patchedInventory) {
      throw new Error("Repository inventory disappeared after its fingerprint check.");
    }
    await finishSuccessfulRefresh(ctx, patchedInventory, {
      crawlCost: args.crawlCost,
    });
    return true;
  },
});

export const handoffCompletedRepositoryInventorySnapshot = internalMutation({
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    repositoryNodeId: string(),
    repositoryFullName: string(),
    defaultBranch: union(string(), vNull()),
    branchCount: number(),
    pullRequestCount: number(),
    labelCount: number(),
    labelChunkCount: number(),
    labelFacetCount: number(),
    noLabelPullRequestCount: number(),
    fingerprint: string(),
    crawlCost: number(),
    summaryDefaultBranch: vRepositorySummaryDefaultBranch,
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const [inventory, snapshot] = await Promise.all([
      readOwnedRunningInventory(ctx, args),
      ctx.db.get(args.snapshotId),
    ]);
    if (
      !inventory ||
      inventory.lifecycle.state !== "running" ||
      !snapshot ||
      snapshot.state !== "collecting"
    ) {
      throw new Error("Repository inventory snapshot is not running.");
    }
    if (
      snapshot.branchCount !== args.branchCount ||
      snapshot.pullRequestCount !== args.pullRequestCount ||
      snapshot.labelCount !== args.labelCount ||
      snapshot.labelChunkCount !== args.labelChunkCount ||
      snapshot.labelFacetCount !== args.labelFacetCount ||
      snapshot.noLabelPullRequestCount !== args.noLabelPullRequestCount
    ) {
      throw new Error("Repository inventory snapshot counts are incomplete.");
    }
    await ctx.db.replace(snapshot._id, {
      state: "ready",
      vaultId: args.vaultId,
      branchCount: snapshot.branchCount,
      pullRequestCount: snapshot.pullRequestCount,
      labelCount: snapshot.labelCount,
      labelChunkCount: snapshot.labelChunkCount,
      labelFacetCount: snapshot.labelFacetCount,
      noLabelPullRequestCount: snapshot.noLabelPullRequestCount,
      repositoryNodeId: args.repositoryNodeId,
      repositoryFullName: args.repositoryFullName,
      defaultBranch: args.defaultBranch,
      fingerprint: args.fingerprint,
      crawlCost: args.crawlCost,
      summaryDefaultBranch: args.summaryDefaultBranch,
    });
    await ctx.db.patch(inventory._id, {
      lifecycle: {
        state: "materializing",
        snapshotId: args.snapshotId,
        targetWriteVersion: inventory.lifecycle.targetWriteVersion,
        required: inventory.lifecycle.required,
        startedAt: inventory.lifecycle.startedAt,
        workpoolJobId: inventory.lifecycle.workpoolJobId,
      },
    });
    const filter = await readRepositoryInventoryFilterState(ctx, inventory.userId, args.vaultId);
    await ensureRepositoryInventoryFilterMaterialization(ctx, {
      vaultId: args.vaultId,
      snapshotId: args.snapshotId,
      filterRevision: filter.revision,
      totalPullRequestCount: snapshot.pullRequestCount,
    });
    await ctx.scheduler.runAfter(
      REPOSITORY_INVENTORY_FILTER_MATERIALIZATION_WATCHDOG_MS,
      internal.repositoryInventory.repairRepositoryInventoryFilterMaterialization,
      { vaultId: args.vaultId, snapshotId: args.snapshotId },
    );
    return null;
  },
});

export const repairRepositoryInventoryFilterMaterialization = internalMutation({
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const inventory = await readInventoryState(ctx, args.vaultId);
    if (
      !inventory ||
      inventory.lifecycle.state !== "materializing" ||
      inventory.lifecycle.snapshotId !== args.snapshotId
    ) {
      return null;
    }
    const [snapshot, filter] = await Promise.all([
      ctx.db.get(args.snapshotId),
      readRepositoryInventoryFilterState(ctx, inventory.userId, args.vaultId),
    ]);
    if (!snapshot || snapshot.state !== "ready" || snapshot.vaultId !== args.vaultId) {
      const message = "Repository inventory filter materialization lost its snapshot.";
      await failRepositorySummaryInventoryObservation(ctx, {
        vaultId: args.vaultId,
        snapshotId: args.snapshotId,
        message,
      });
      await ctx.db.patch(inventory._id, {
        lifecycle: {
          state: "failed",
          failedAt: Date.now(),
          message,
        },
      });
      await scheduleSnapshotCleanup(ctx, args.snapshotId);
      return null;
    }
    const view = await ctx.db
      .query("vaultRepositoryInventoryFilterViews")
      .withIndex("by_snapshot_and_filterRevision", (q) =>
        q.eq("snapshotId", args.snapshotId).eq("filterRevision", filter.revision),
      )
      .unique();
    if (view?.state === "complete") {
      await failRepositoryInventoryFilterMaterialization(ctx, {
        inventory,
        view,
        message: "Repository inventory filter materialization stopped before publication.",
      });
      return null;
    }
    await ensureRepositoryInventoryFilterMaterialization(ctx, {
      vaultId: args.vaultId,
      snapshotId: args.snapshotId,
      filterRevision: filter.revision,
      totalPullRequestCount: snapshot.pullRequestCount,
    });
    await ctx.scheduler.runAfter(
      REPOSITORY_INVENTORY_FILTER_MATERIALIZATION_WATCHDOG_MS,
      internal.repositoryInventory.repairRepositoryInventoryFilterMaterialization,
      args,
    );
    return null;
  },
});

function matchesRepositoryInventoryFilters(
  item: Extract<Doc<"vaultRepositoryInventoryItems">, { kind: "pull_request" }>,
  filters: RepositoryInventoryFilterState,
  hiddenLabelKeys: ReadonlySet<string>,
): boolean {
  if (!filters.includeDrafts && item.isDraft) {
    return false;
  }
  if (item.filterLabelKeys.length === 0) {
    return filters.includeNoLabel;
  }
  return !item.filterLabelKeys.some((labelKey) => hiddenLabelKeys.has(labelKey));
}

export const advanceRepositoryInventoryFilterMaterialization = internalMutation({
  args: {
    viewId: id("vaultRepositoryInventoryFilterViews"),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const view = await ctx.db.get(args.viewId);
    if (!view || view.state !== "building") {
      return null;
    }
    const inventory = await readInventoryState(ctx, view.vaultId);
    if (!inventory) {
      await scheduleFilterViewCleanup(ctx, view._id);
      return null;
    }
    const filter = await readRepositoryInventoryFilterState(ctx, inventory.userId, view.vaultId);
    if (
      filter.revision !== view.filterRevision ||
      repositoryInventoryMaterializationSourceId(inventory) !== view.snapshotId
    ) {
      await scheduleFilterViewCleanup(ctx, view._id);
      return null;
    }
    const snapshot = await ctx.db.get(view.snapshotId);
    if (
      !snapshot ||
      snapshot.state !== "ready" ||
      snapshot.vaultId !== view.vaultId ||
      snapshot.pullRequestCount !== view.totalPullRequestCount
    ) {
      await failRepositoryInventoryFilterMaterialization(ctx, {
        inventory,
        view,
        message: "Repository inventory filter materialization has an invalid snapshot.",
      });
      return null;
    }

    try {
      const page = await ctx.db
        .query("vaultRepositoryInventoryItems")
        .withIndex("by_snapshot_and_kind_and_sortGroup_and_sortTime_and_rowKey", (q) =>
          q.eq("snapshotId", view.snapshotId).eq("kind", "pull_request"),
        )
        .paginate({
          cursor: view.cursor,
          numItems: REPOSITORY_INVENTORY_FILTER_MATERIALIZATION_BATCH_SIZE,
        });
      const hiddenLabelKeys = new Set(filter.hiddenLabels.map(repositoryInventoryFilterLabelKey));
      let visiblePullRequestCount = view.visiblePullRequestCount;
      for (const item of page.page) {
        if (item.kind !== "pull_request") {
          throw new Error("Repository inventory filter page returned a branch.");
        }
        if (!matchesRepositoryInventoryFilters(item, filter, hiddenLabelKeys)) {
          continue;
        }
        await ctx.db.insert("vaultRepositoryInventoryFilterViewRows", {
          vaultId: view.vaultId,
          snapshotId: view.snapshotId,
          viewId: view._id,
          pullRequestItemId: item._id,
          rowKey: item.rowKey,
          sortTime: item.sortTime,
        });
        visiblePullRequestCount += 1;
      }
      const processedPullRequestCount = view.processedPullRequestCount + page.page.length;
      if (
        processedPullRequestCount > view.totalPullRequestCount ||
        (page.isDone && processedPullRequestCount !== view.totalPullRequestCount)
      ) {
        throw new Error("Repository inventory filter materialization has an invalid total.");
      }
      if (!page.isDone) {
        await ctx.db.replace(view._id, {
          state: "building",
          vaultId: view.vaultId,
          snapshotId: view.snapshotId,
          filterRevision: view.filterRevision,
          totalPullRequestCount: view.totalPullRequestCount,
          processedPullRequestCount,
          visiblePullRequestCount,
          cursor: page.continueCursor,
        });
        await ctx.scheduler.runAfter(
          0,
          internal.repositoryInventory.advanceRepositoryInventoryFilterMaterialization,
          { viewId: view._id },
        );
        return null;
      }

      const priorPublication = inventory.publication;
      const publishesNewSnapshot =
        inventory.lifecycle.state === "materializing" &&
        inventory.lifecycle.snapshotId === view.snapshotId;
      if (
        !publishesNewSnapshot &&
        (!priorPublication || priorPublication.snapshotId !== view.snapshotId)
      ) {
        throw new Error("Repository inventory filter view lost its publication source.");
      }
      await ctx.db.replace(view._id, {
        state: "complete",
        vaultId: view.vaultId,
        snapshotId: view.snapshotId,
        filterRevision: view.filterRevision,
        totalPullRequestCount: view.totalPullRequestCount,
        processedPullRequestCount,
        visiblePullRequestCount,
      });
      const publishedAt = Date.now();
      let nextPublication: NonNullable<RepositoryInventoryStateDoc["publication"]>;
      if (publishesNewSnapshot) {
        nextPublication = {
          snapshotId: view.snapshotId,
          filterViewId: view._id,
          filterRevision: view.filterRevision,
          repositoryNodeId: snapshot.repositoryNodeId,
          repositoryFullName: snapshot.repositoryFullName,
          defaultBranch: snapshot.defaultBranch,
          publishedAt,
          checkedAt: publishedAt,
          fingerprint: snapshot.fingerprint,
        };
      } else {
        if (!priorPublication) {
          throw new Error("Repository inventory filter view has no prior publication.");
        }
        nextPublication = {
          ...priorPublication,
          filterViewId: view._id,
          filterRevision: view.filterRevision,
        };
      }
      await ctx.db.patch(inventory._id, {
        publication: nextPublication,
      });
      if (publishesNewSnapshot) {
        await completeRepositorySummaryInventoryObservation(ctx, {
          userId: inventory.userId,
          vaultId: inventory.vaultId,
          snapshotId: snapshot._id,
          repositoryFullName: snapshot.repositoryFullName,
          defaultBranch: snapshot.summaryDefaultBranch,
          openPullRequestCount: snapshot.pullRequestCount,
        });
        if (priorPublication && priorPublication.snapshotId !== view.snapshotId) {
          await scheduleSnapshotCleanup(ctx, priorPublication.snapshotId);
        }
        const publishedInventory = await ctx.db.get(inventory._id);
        if (!publishedInventory) {
          throw new Error("Repository inventory disappeared after publication.");
        }
        await finishSuccessfulRefresh(ctx, publishedInventory, {
          crawlCost: snapshot.crawlCost,
        });
      } else if (priorPublication && priorPublication.filterViewId !== view._id) {
        await scheduleFilterViewCleanup(ctx, priorPublication.filterViewId);
      }
      return null;
    } catch (error) {
      await failRepositoryInventoryFilterMaterialization(ctx, {
        inventory,
        view,
        message: `Repository inventory filter materialization failed: ${toErrorMessage(error)}`,
      });
      return null;
    }
  },
});

async function transitionRepositoryInventoryToFailed(
  ctx: MutationCtx,
  inventory: RepositoryInventoryStateDoc,
  message: string,
): Promise<void> {
  if (
    inventory.lifecycle.state !== "scheduled" &&
    inventory.lifecycle.state !== "running" &&
    inventory.lifecycle.state !== "materializing"
  ) {
    return;
  }
  const failedAt = Date.now();
  const obsoleteSnapshotId = inventory.lifecycle.snapshotId;
  await failRepositorySummaryInventoryObservation(ctx, {
    vaultId: inventory.vaultId,
    snapshotId: obsoleteSnapshotId,
    message,
  });
  await ctx.db.patch(inventory._id, {
    lifecycle: {
      state: "failed",
      failedAt,
      message,
    },
  });
  await scheduleSnapshotCleanup(ctx, obsoleteSnapshotId);
}

export const failRepositoryInventoryRefresh = internalMutation({
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    message: string(),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const inventory = await readOwnedRunningInventory(ctx, args);
    if (!inventory) {
      return null;
    }
    await transitionRepositoryInventoryToFailed(ctx, inventory, args.message);
    return null;
  },
});

export const handleRepositoryInventoryComplete = internalMutation({
  args: vOnCompleteArgs(repositoryInventoryWorkpoolContext),
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const inventory = await readInventoryState(ctx, args.context.vaultId);
    if (
      !inventory ||
      (inventory.lifecycle.state !== "scheduled" && inventory.lifecycle.state !== "running") ||
      inventory.lifecycle.snapshotId !== args.context.snapshotId ||
      inventory.lifecycle.workpoolJobId !== args.workId
    ) {
      return null;
    }
    switch (args.result.kind) {
      case "success":
        await transitionRepositoryInventoryToFailed(
          ctx,
          inventory,
          "Repository inventory worker completed without publishing its snapshot.",
        );
        return null;
      case "failed":
        await transitionRepositoryInventoryToFailed(ctx, inventory, args.result.error);
        return null;
      case "canceled":
        await transitionRepositoryInventoryToFailed(
          ctx,
          inventory,
          "Repository inventory worker was canceled.",
        );
        return null;
      default: {
        args.result satisfies never;
        return null;
      }
    }
  },
});

export const cleanupRepositoryInventoryFilterView = internalMutation({
  args: {
    viewId: id("vaultRepositoryInventoryFilterViews"),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const view = await ctx.db.get(args.viewId);
    if (!view) {
      return null;
    }
    const inventory = await readInventoryState(ctx, view.vaultId);
    if (inventory?.publication?.filterViewId === args.viewId) {
      return null;
    }
    const rows = await ctx.db
      .query("vaultRepositoryInventoryFilterViewRows")
      .withIndex("by_view_and_sortTime_and_rowKey", (q) => q.eq("viewId", args.viewId))
      .take(REPOSITORY_INVENTORY_CLEANUP_BATCH_SIZE);
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    if (rows.length > 0) {
      await scheduleFilterViewCleanup(ctx, args.viewId);
      return null;
    }
    await ctx.db.delete(args.viewId);
    return null;
  },
});

export const cleanupRepositoryInventorySnapshot = internalMutation({
  args: {
    snapshotId: id("vaultRepositoryInventorySnapshots"),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const snapshot = await ctx.db.get(args.snapshotId);
    if (!snapshot) {
      return null;
    }
    const inventory = await readInventoryState(ctx, snapshot.vaultId);
    if (
      inventory?.publication?.snapshotId === args.snapshotId ||
      ((inventory?.lifecycle.state === "scheduled" ||
        inventory?.lifecycle.state === "running" ||
        inventory?.lifecycle.state === "materializing") &&
        inventory.lifecycle.snapshotId === args.snapshotId)
    ) {
      return null;
    }

    const filterView = await ctx.db
      .query("vaultRepositoryInventoryFilterViews")
      .withIndex("by_snapshot", (q) => q.eq("snapshotId", args.snapshotId))
      .first();
    if (filterView) {
      const filterRows = await ctx.db
        .query("vaultRepositoryInventoryFilterViewRows")
        .withIndex("by_view_and_sortTime_and_rowKey", (q) => q.eq("viewId", filterView._id))
        .take(REPOSITORY_INVENTORY_CLEANUP_BATCH_SIZE);
      for (const row of filterRows) {
        await ctx.db.delete(row._id);
      }
      if (filterRows.length === 0) {
        await ctx.db.delete(filterView._id);
      }
      await scheduleSnapshotCleanup(ctx, args.snapshotId);
      return null;
    }

    const labelFacets = await ctx.db
      .query("vaultRepositoryInventoryLabelFacets")
      .withIndex("by_snapshot_and_sortKey_and_labelKey", (q) => q.eq("snapshotId", args.snapshotId))
      .take(REPOSITORY_INVENTORY_CLEANUP_BATCH_SIZE);
    for (const facet of labelFacets) {
      await ctx.db.delete(facet._id);
    }
    if (labelFacets.length > 0) {
      await scheduleSnapshotCleanup(ctx, args.snapshotId);
      return null;
    }

    const labelChunks = await ctx.db
      .query("vaultRepositoryInventoryLabelChunks")
      .withIndex("by_snapshot_and_rowKey_and_chunkIndex", (q) =>
        q.eq("snapshotId", args.snapshotId),
      )
      .take(REPOSITORY_INVENTORY_CLEANUP_BATCH_SIZE);
    for (const labelChunk of labelChunks) {
      await ctx.db.delete(labelChunk._id);
    }
    if (labelChunks.length === 0) {
      const items = await ctx.db
        .query("vaultRepositoryInventoryItems")
        .withIndex("by_snapshot_and_rowKey", (q) => q.eq("snapshotId", args.snapshotId))
        .take(REPOSITORY_INVENTORY_CLEANUP_BATCH_SIZE);
      for (const item of items) {
        await ctx.db.delete(item._id);
      }
      if (items.length === 0) {
        await ctx.db.delete(snapshot._id);
        return null;
      }
    }
    await scheduleSnapshotCleanup(ctx, args.snapshotId);
    return null;
  },
});

async function readOwnedRepositoryInventoryBranchContext(
  ctx: Pick<QueryCtx, "db">,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    branch: string;
  },
): Promise<RepositoryInventoryBranchContext | null> {
  const vault = await ctx.db.get(args.vaultId);
  if (!vault || vault.userId !== args.userId || !isLiveConnectedVault(vault)) {
    return null;
  }
  const selection = await readActiveRepositoryInventoryBranchSelection(ctx, args);
  if (!selection) {
    return { state: "unpublished" };
  }

  const defaultBranch = selection.defaultBranch ?? vault.defaultBranch;
  if (!selection.branch) {
    return {
      state: "missing",
      repositoryFullName: selection.repositoryFullName,
      defaultBranch,
    };
  }
  const branch = selection.branch;
  const pullRequest = branch.isDefault
    ? null
    : await ctx.db
        .query("vaultRepositoryInventoryItems")
        .withIndex("by_snapshot_kind_localHeadRefName_sortTime_rowKey", (q) =>
          q
            .eq("snapshotId", selection.snapshotId)
            .eq("kind", "pull_request")
            .eq("localHeadRefName", branch.name),
        )
        .order("asc")
        .first();
  if (
    pullRequest &&
    (pullRequest.kind !== "pull_request" ||
      !pullRequest.canOpenInSamebase ||
      pullRequest.headRefName !== branch.name)
  ) {
    throw new Error("Repository inventory pull request branch lookup is invalid.");
  }

  return {
    state: "ready",
    repositoryFullName: selection.repositoryFullName,
    defaultBranch,
    branch,
    pullRequest: pullRequest
      ? {
          number: pullRequest.number,
          url: pullRequest.url,
          isDraft: pullRequest.isDraft,
          baseRefName: pullRequest.baseRefName,
        }
      : undefined,
  };
}

export const getRepositoryInventoryBranchContextForUser = internalQuery({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
    branch: string(),
  },
  returns: union(vNull(), vRepositoryInventoryBranchContext),
  handler: async (ctx, args): Promise<RepositoryInventoryBranchContext | null> => {
    return await readOwnedRepositoryInventoryBranchContext(ctx, args);
  },
});

export const getRepositoryInventoryBranchContext = query({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
    branch: string(),
  },
  returns: union(vNull(), vRepositoryInventoryBranchContext),
  handler: async (ctx, args): Promise<RepositoryInventoryBranchContext | null> => {
    return await readOwnedRepositoryInventoryBranchContext(ctx, {
      userId: ctx.viewer.userId,
      ...args,
    });
  },
});

function publicPublicationFields(inventory: RepositoryInventoryStateDoc) {
  const publication = inventory.publication;
  return publication
    ? {
        activeSnapshotId: publication.snapshotId,
        activeFilterViewId: publication.filterViewId,
        activeFilterRevision: publication.filterRevision,
        repositoryFullName: publication.repositoryFullName,
        defaultBranch: publication.defaultBranch,
        publishedAt: publication.publishedAt,
        checkedAt: publication.checkedAt,
      }
    : {};
}

export const getRepositoryInventoryState = query({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
  },
  returns: vRepositoryInventoryPublicState,
  handler: async (ctx, args): Promise<RepositoryInventoryPublicState> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== ctx.viewer.userId || !isLiveConnectedVault(vault)) {
      return { state: "empty" };
    }
    const inventory = await readInventoryState(ctx, args.vaultId);
    if (!inventory) {
      return { state: "empty" };
    }
    const publication = publicPublicationFields(inventory);
    switch (inventory.lifecycle.state) {
      case "idle":
        return inventory.publication
          ? {
              state: "ready",
              activeSnapshotId: inventory.publication.snapshotId,
              activeFilterViewId: inventory.publication.filterViewId,
              activeFilterRevision: inventory.publication.filterRevision,
              repositoryFullName: inventory.publication.repositoryFullName,
              defaultBranch: inventory.publication.defaultBranch,
              publishedAt: inventory.publication.publishedAt,
              checkedAt: inventory.publication.checkedAt,
            }
          : { state: "empty" };
      case "scheduled":
        return inventory.lifecycle.wait.kind === "immediate"
          ? {
              state: "refreshing",
              startedAt: inventory.lifecycle.scheduledAt,
              ...publication,
            }
          : {
              state: "waiting",
              reason: inventory.lifecycle.wait.kind,
              retryAt: inventory.lifecycle.wait.retryAt,
              ...publication,
            };
      case "running":
      case "materializing":
        return {
          state: "refreshing",
          startedAt: inventory.lifecycle.startedAt,
          ...publication,
        };
      case "failed":
        return {
          state: "failed",
          failedAt: inventory.lifecycle.failedAt,
          message: inventory.lifecycle.message,
          ...publication,
        };
      default: {
        inventory.lifecycle satisfies never;
        return { state: "empty" };
      }
    }
  },
});

export const listRepositoryInventoryBranchPage = query({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    paginationOpts: paginationOptsValidator,
  },
  returns: vRepositoryInventoryBranchPageResult,
  handler: async (ctx, args): Promise<RepositoryInventoryBranchPageResult> => {
    if (
      !Number.isInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > REPOSITORY_INVENTORY_PUBLIC_PAGE_SIZE
    ) {
      throw new Error(
        `Repository inventory branch pages must request between 1 and ${REPOSITORY_INVENTORY_PUBLIC_PAGE_SIZE} items.`,
      );
    }
    const [vault, snapshot] = await Promise.all([
      ctx.db.get(args.vaultId),
      ctx.db.get(args.snapshotId),
    ]);
    if (
      !vault ||
      vault.userId !== ctx.viewer.userId ||
      !isLiveConnectedVault(vault) ||
      !snapshot ||
      snapshot.state !== "ready" ||
      snapshot.vaultId !== args.vaultId
    ) {
      return { state: "unavailable" };
    }
    const page = await ctx.db
      .query("vaultRepositoryInventoryItems")
      .withIndex("by_snapshot_and_kind_and_sortGroup_and_sortTime_and_rowKey", (q) =>
        q.eq("snapshotId", args.snapshotId).eq("kind", "branch"),
      )
      .paginate(args.paginationOpts);
    return {
      state: "ready",
      snapshotId: args.snapshotId,
      expectedBranchCount: snapshot.branchCount,
      page: page.page.map((item) => {
        if (item.kind !== "branch") {
          throw new Error("Repository inventory branch page returned a pull request.");
        }
        return {
          kind: item.kind,
          rowKey: item.rowKey,
          previewUrl: item.previewUrl,
          headCommit: item.headCommit,
          name: item.name,
          isDefault: item.isDefault,
          comparison: item.comparison,
        };
      }),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const listRepositoryInventoryPullRequestPage = query({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    viewId: id("vaultRepositoryInventoryFilterViews"),
    paginationOpts: paginationOptsValidator,
  },
  returns: vRepositoryInventoryPullRequestPageResult,
  handler: async (ctx, args): Promise<RepositoryInventoryPullRequestPageResult> => {
    if (
      !Number.isInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > REPOSITORY_INVENTORY_PUBLIC_PAGE_SIZE
    ) {
      throw new Error(
        `Repository inventory pull request pages must request between 1 and ${REPOSITORY_INVENTORY_PUBLIC_PAGE_SIZE} items.`,
      );
    }
    const [vault, snapshot, view, inventory] = await Promise.all([
      ctx.db.get(args.vaultId),
      ctx.db.get(args.snapshotId),
      ctx.db.get(args.viewId),
      readInventoryState(ctx, args.vaultId),
    ]);
    if (
      !vault ||
      vault.userId !== ctx.viewer.userId ||
      !isLiveConnectedVault(vault) ||
      !snapshot ||
      snapshot.state !== "ready" ||
      snapshot.vaultId !== args.vaultId ||
      !view ||
      view.state !== "complete" ||
      view.vaultId !== args.vaultId ||
      view.snapshotId !== args.snapshotId ||
      inventory?.publication?.snapshotId !== args.snapshotId ||
      inventory.publication.filterViewId !== args.viewId ||
      view.totalPullRequestCount !== snapshot.pullRequestCount ||
      view.processedPullRequestCount !== view.totalPullRequestCount
    ) {
      return { state: "unavailable" };
    }
    const page = await ctx.db
      .query("vaultRepositoryInventoryFilterViewRows")
      .withIndex("by_view_and_sortTime_and_rowKey", (q) => q.eq("viewId", args.viewId))
      .paginate(args.paginationOpts);
    const pullRequests = await Promise.all(
      page.page.map(async (membership) => {
        const item = await ctx.db.get(membership.pullRequestItemId);
        if (
          item?.kind !== "pull_request" ||
          item.snapshotId !== args.snapshotId ||
          item.rowKey !== membership.rowKey
        ) {
          throw new Error("Repository inventory filter view references an invalid pull request.");
        }
        return {
          kind: item.kind,
          rowKey: item.rowKey,
          previewUrl: item.previewUrl,
          headCommit: item.headCommit,
          number: item.number,
          url: item.url,
          title: item.title,
          isDraft: item.isDraft,
          additions: item.additions,
          deletions: item.deletions,
          changedFiles: item.changedFiles,
          baseRefName: item.baseRefName,
          isCrossRepository: item.isCrossRepository,
          headRepositoryFullName: item.headRepositoryFullName,
          headRefName: item.headRefName,
          comparison: item.comparison,
          canOpenInSamebase: item.canOpenInSamebase,
          labelCount: item.labelCount,
        };
      }),
    );
    return {
      state: "ready",
      snapshotId: args.snapshotId,
      viewId: args.viewId,
      expectedVisiblePullRequestCount: view.visiblePullRequestCount,
      totalPullRequestCount: view.totalPullRequestCount,
      page: pullRequests,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const listRepositoryInventoryLabelFacetPage = query({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    paginationOpts: paginationOptsValidator,
  },
  returns: vRepositoryInventoryLabelFacetPageResult,
  handler: async (ctx, args): Promise<RepositoryInventoryLabelFacetPageResult> => {
    if (
      !Number.isInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > REPOSITORY_INVENTORY_PUBLIC_LABEL_FACET_PAGE_SIZE
    ) {
      throw new Error(
        `Repository inventory label facet pages must request between 1 and ${REPOSITORY_INVENTORY_PUBLIC_LABEL_FACET_PAGE_SIZE} items.`,
      );
    }
    const [vault, snapshot] = await Promise.all([
      ctx.db.get(args.vaultId),
      ctx.db.get(args.snapshotId),
    ]);
    if (
      !vault ||
      vault.userId !== ctx.viewer.userId ||
      !isLiveConnectedVault(vault) ||
      !snapshot ||
      snapshot.state !== "ready" ||
      snapshot.vaultId !== args.vaultId
    ) {
      return { state: "unavailable" };
    }
    const page = await ctx.db
      .query("vaultRepositoryInventoryLabelFacets")
      .withIndex("by_snapshot_and_sortKey_and_labelKey", (q) => q.eq("snapshotId", args.snapshotId))
      .paginate(args.paginationOpts);
    return {
      state: "ready",
      snapshotId: args.snapshotId,
      expectedFacetCount: snapshot.labelFacetCount,
      noLabelPullRequestCount: snapshot.noLabelPullRequestCount,
      page: page.page.map((facet) => ({
        name: facet.name,
        color: facet.color,
        pullRequestCount: facet.pullRequestCount,
      })),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const listRepositoryInventoryLabelPage = query({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    rowKey: string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: vRepositoryInventoryLabelPageResult,
  handler: async (ctx, args): Promise<RepositoryInventoryLabelPageResult> => {
    if (
      !Number.isInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > REPOSITORY_INVENTORY_PUBLIC_LABEL_CHUNK_PAGE_SIZE
    ) {
      throw new Error(
        `Repository inventory label pages must request between 1 and ${REPOSITORY_INVENTORY_PUBLIC_LABEL_CHUNK_PAGE_SIZE} chunks.`,
      );
    }
    const [vault, snapshot, item] = await Promise.all([
      ctx.db.get(args.vaultId),
      ctx.db.get(args.snapshotId),
      ctx.db
        .query("vaultRepositoryInventoryItems")
        .withIndex("by_snapshot_and_rowKey", (q) =>
          q.eq("snapshotId", args.snapshotId).eq("rowKey", args.rowKey),
        )
        .unique(),
    ]);
    if (
      !vault ||
      vault.userId !== ctx.viewer.userId ||
      !isLiveConnectedVault(vault) ||
      !snapshot ||
      snapshot.state !== "ready" ||
      snapshot.vaultId !== args.vaultId ||
      item?.kind !== "pull_request"
    ) {
      return { state: "unavailable" };
    }
    const page = await ctx.db
      .query("vaultRepositoryInventoryLabelChunks")
      .withIndex("by_snapshot_and_rowKey_and_chunkIndex", (q) =>
        q.eq("snapshotId", args.snapshotId).eq("rowKey", args.rowKey),
      )
      .paginate(args.paginationOpts);
    return {
      state: "ready",
      expectedLabelCount: item.labelCount,
      expectedChunkCount: item.labelChunkCount,
      page: page.page.map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        labels: chunk.labels,
      })),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const quiesceForVaultDeletion = internalMutation({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    await clearGitHubGraphqlRateBudgetLeaseForVault(ctx, args.vaultId);
    const inventory = await readInventoryState(ctx, args.vaultId);
    if (!inventory) {
      return null;
    }
    if (inventory.userId !== args.userId) {
      throw new Error("Repository inventory owner mismatch.");
    }
    if (
      inventory.lifecycle.state === "scheduled" ||
      inventory.lifecycle.state === "running" ||
      inventory.lifecycle.state === "materializing"
    ) {
      await cancelOwnedInventoryJob(ctx, inventory);
      await transitionRepositoryInventoryToFailed(
        ctx,
        inventory,
        "Repository inventory stopped for vault deletion.",
      );
    }
    return null;
  },
});

export const quiesceForAccountDeletion = internalMutation({
  args: {
    runId: id("accountDeletionRuns"),
    workflowId: string(),
  },
  returns: union(object({ state: literal("done") }), object({ state: literal("needs_more") })),
  handler: async (ctx, args): Promise<{ state: "done" } | { state: "needs_more" }> => {
    const deletionRun = await readOwnedActiveRun(ctx, args);
    const scheduled = await ctx.db
      .query("vaultRepositoryInventories")
      .withIndex("by_userId_and_lifecycle_state", (q) =>
        q.eq("userId", deletionRun.identity.userId).eq("lifecycle.state", "scheduled"),
      )
      .take(ACCOUNT_DELETION_QUIESCE_BATCH_SIZE);
    const running = await ctx.db
      .query("vaultRepositoryInventories")
      .withIndex("by_userId_and_lifecycle_state", (q) =>
        q.eq("userId", deletionRun.identity.userId).eq("lifecycle.state", "running"),
      )
      .take(ACCOUNT_DELETION_QUIESCE_BATCH_SIZE - scheduled.length);
    const materializing = await ctx.db
      .query("vaultRepositoryInventories")
      .withIndex("by_userId_and_lifecycle_state", (q) =>
        q.eq("userId", deletionRun.identity.userId).eq("lifecycle.state", "materializing"),
      )
      .take(ACCOUNT_DELETION_QUIESCE_BATCH_SIZE - scheduled.length - running.length);
    const active = [...scheduled, ...running, ...materializing];
    for (const inventory of active) {
      await cancelOwnedInventoryJob(ctx, inventory);
      await clearGitHubGraphqlRateBudgetLeaseForVault(ctx, inventory.vaultId);
      await transitionRepositoryInventoryToFailed(
        ctx,
        inventory,
        "Repository inventory stopped for account deletion.",
      );
    }
    return active.length === 0 ? { state: "done" } : { state: "needs_more" };
  },
});

export const completeExistingRepositoryConnectionAndRequestInventory = internalMutation({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
  },
  returns: vRepositoryInventoryRefreshRequestResult,
  handler: async (ctx, args): Promise<RepositoryInventoryRefreshRequestResult> => {
    const run = await ctx.db.get(args.runId);
    if (
      !run ||
      run.userId !== args.userId ||
      run.vaultId !== args.vaultId ||
      run.trigger !== "connect_existing_repository"
    ) {
      throw new Error("Provisioning run does not match existing repository workflow.");
    }
    if (run.state === "failed" || run.state === "canceled") {
      throw new Error("Terminal source setup run cannot be completed.");
    }
    const now = Date.now();
    if (run.state !== "succeeded") {
      if (run.state !== "running" || run.currentStep !== "sync_tree") {
        throw new Error("Existing repository workflow has not reached the finish boundary.");
      }
      const vault = await ctx.db.get(args.vaultId);
      if (!vault || vault.userId !== args.userId || !isLiveConnectedVault(vault)) {
        throw new Error("Existing repository vault is not connected.");
      }
      await ctx.db.insert("appProvisioningEvents", {
        userId: run.userId,
        vaultId: run.vaultId,
        repositoryFullName: run.repositoryFullName,
        runId: args.runId,
        step: "finish",
        level: "info",
        message: "Connected existing repository.",
        createdAt: now,
      });
      await ctx.db.patch(args.runId, {
        state: "succeeded",
        currentStep: "finish",
        updatedAt: now,
        completedAt: now,
      });
    }
    return await requestRepositoryInventoryRefreshForUser(ctx, {
      userId: args.userId,
      vaultId: args.vaultId,
      required: true,
    });
  },
});
