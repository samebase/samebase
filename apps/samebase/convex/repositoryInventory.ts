import { Workpool, vOnCompleteArgs } from "@convex-dev/workpool";
import { paginationOptsValidator } from "convex/server";
import { Infer, v } from "convex/values";

import { components, internal } from "./_generated/api";
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
import {
  REPOSITORY_INVENTORY_DEMAND_TTL_MS,
  REPOSITORY_INVENTORY_MIN_REFRESH_INTERVAL_MS,
  repositoryInventoryBranchRowKey,
  vRepositoryInventoryBranchContext,
  vRepositoryInventoryLabelPageResult,
  vRepositoryInventoryPageResult,
  vRepositoryInventoryPublicState,
  vRepositoryInventoryRefreshRequestResult,
  vRepositoryInventoryLabelChunk,
  vStoredRepositoryInventoryItem,
  type RepositoryInventoryBranchContext,
  type RepositoryInventoryCommit,
  type RepositoryInventoryLabelPageResult,
  type RepositoryInventoryPageResult,
  type RepositoryInventoryPublicState,
  type RepositoryInventoryRefreshRequestResult,
  type RepositoryInventoryScheduledWait,
} from "./repositoryInventoryModel";
import { isLiveConnectedVault } from "./vault/state";

const { array, boolean, id, literal, null: vNull, number, object, string, union } = v;
const REPOSITORY_INVENTORY_CLEANUP_BATCH_SIZE = 100;
const REPOSITORY_INVENTORY_PUBLIC_PAGE_SIZE = 10;
const REPOSITORY_INVENTORY_PUBLIC_LABEL_CHUNK_PAGE_SIZE = 5;
const ACCOUNT_DELETION_QUIESCE_BATCH_SIZE = 25;

const repositoryInventoryWorkpool = new Workpool(components.repositoryInventoryWorkpool, {
  maxParallelism: 3,
  retryActionsByDefault: false,
});

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
    repositoryNodeId: v.optional(string()),
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

async function scheduleRepositoryInventoryRefresh(
  ctx: MutationCtx,
  inventory: RepositoryInventoryStateDoc,
  args: {
    required: boolean;
    wait?: RepositoryInventoryScheduledWait;
  },
): Promise<void> {
  if (inventory.lifecycle.state !== "idle" && inventory.lifecycle.state !== "failed") {
    return;
  }
  const wait = args.wait ?? { kind: "immediate" };
  const scheduledAt = Date.now();
  const runAt = wait.kind === "immediate" ? scheduledAt : wait.retryAt;
  const snapshotId = await ctx.db.insert("vaultRepositoryInventorySnapshots", {
    vaultId: inventory.vaultId,
    branchCount: 0,
    pullRequestCount: 0,
    labelCount: 0,
    labelChunkCount: 0,
  });
  const workpoolJobId = await repositoryInventoryWorkpool.enqueueAction(
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
}

function minimumIntervalWait(
  inventory: RepositoryInventoryStateDoc,
  now: number,
): RepositoryInventoryScheduledWait {
  if (inventory.lastStartedAt === undefined) {
    return { kind: "immediate" };
  }
  const retryAt = inventory.lastStartedAt + REPOSITORY_INVENTORY_MIN_REFRESH_INTERVAL_MS;
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
  await repositoryInventoryWorkpool.cancel(ctx, inventory.lifecycle.workpoolJobId);
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
    case "idle":
    case "failed": {
      await ctx.db.patch(existingInventory._id, { wantedUntil, writeVersion });
      const inventory = await ctx.db.get(existingInventory._id);
      if (!inventory) {
        throw new Error("Repository inventory disappeared while requesting a refresh.");
      }
      await scheduleRepositoryInventoryRefresh(ctx, inventory, {
        required: args.required,
        wait: args.required ? { kind: "immediate" } : minimumIntervalWait(inventory, now),
      });
      return { kind: "scheduled" };
    }
    default: {
      existingInventory.lifecycle satisfies never;
      throw new Error("Unsupported repository inventory lifecycle.");
    }
  }
}

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
      snapshot.vaultId !== args.vaultId
    ) {
      await ctx.db.patch(inventory._id, {
        lifecycle: {
          state: "failed",
          failedAt: now,
          message: "Repository inventory vault is no longer connected.",
        },
      });
      await scheduleSnapshotCleanup(ctx, args.snapshotId);
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
    return {
      kind: "ready",
      userId: inventory.userId,
      vaultId: args.vaultId,
      githubRepositoryId: vault.ghRepoId,
      repositoryNodeId: inventory.publication?.repositoryNodeId,
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
    if (!inventory || inventory.lifecycle.state !== "running" || !snapshot) {
      return null;
    }
    if (
      snapshot.branchCount !== 0 ||
      snapshot.pullRequestCount !== 0 ||
      snapshot.labelCount !== 0 ||
      snapshot.labelChunkCount !== 0
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
      return null;
    }
    await scheduleRepositoryInventoryRefresh(ctx, idleInventory, {
      required,
      wait: {
        kind: args.reason,
        retryAt: Math.max(args.retryAt, Date.now() + 1_000),
      },
    });
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
    if (!inventory || !snapshot || snapshot.vaultId !== args.vaultId) {
      throw new Error("Repository inventory snapshot is not running.");
    }
    let branchCount = 0;
    let pullRequestCount = 0;
    for (const item of args.items) {
      if (item.vaultId !== args.vaultId || item.snapshotId !== args.snapshotId) {
        throw new Error("Repository inventory item belongs to another snapshot.");
      }
      if (item.kind === "branch") {
        branchCount += 1;
      } else {
        pullRequestCount += 1;
      }
      await ctx.db.insert("vaultRepositoryInventoryItems", item);
    }
    await ctx.db.patch(snapshot._id, {
      branchCount: snapshot.branchCount + branchCount,
      pullRequestCount: snapshot.pullRequestCount + pullRequestCount,
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
    if (!inventory || !snapshot || snapshot.vaultId !== args.vaultId) {
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

async function finishSuccessfulRefresh(
  ctx: MutationCtx,
  inventory: RepositoryInventoryStateDoc,
  args: {
    crawlCost: number;
  },
): Promise<void> {
  if (inventory.lifecycle.state !== "running") {
    throw new Error("Repository inventory snapshot is not running.");
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
  await scheduleRepositoryInventoryRefresh(ctx, idleInventory, { required: true });
}

export const completeUnchangedRepositoryInventoryRefresh = internalMutation({
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    fingerprint: string(),
    crawlCost: number(),
  },
  returns: boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const [inventory, snapshot] = await Promise.all([
      readOwnedRunningInventory(ctx, args),
      ctx.db.get(args.snapshotId),
    ]);
    if (!inventory || inventory.lifecycle.state !== "running" || !snapshot) {
      throw new Error("Repository inventory snapshot is not running.");
    }
    if (inventory.publication?.fingerprint !== args.fingerprint) {
      return false;
    }
    if (
      snapshot.branchCount !== 0 ||
      snapshot.pullRequestCount !== 0 ||
      snapshot.labelCount !== 0 ||
      snapshot.labelChunkCount !== 0
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

export const publishRepositoryInventorySnapshot = internalMutation({
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
    fingerprint: string(),
    crawlCost: number(),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const [inventory, snapshot] = await Promise.all([
      readOwnedRunningInventory(ctx, args),
      ctx.db.get(args.snapshotId),
    ]);
    if (!inventory || inventory.lifecycle.state !== "running" || !snapshot) {
      throw new Error("Repository inventory snapshot is not running.");
    }
    if (
      snapshot.branchCount !== args.branchCount ||
      snapshot.pullRequestCount !== args.pullRequestCount ||
      snapshot.labelCount !== args.labelCount ||
      snapshot.labelChunkCount !== args.labelChunkCount
    ) {
      throw new Error("Repository inventory snapshot counts are incomplete.");
    }

    const publishedAt = Date.now();
    const obsoleteSnapshotId = inventory.publication?.snapshotId;
    await ctx.db.patch(inventory._id, {
      publication: {
        snapshotId: args.snapshotId,
        repositoryNodeId: args.repositoryNodeId,
        repositoryFullName: args.repositoryFullName,
        defaultBranch: args.defaultBranch,
        publishedAt,
        checkedAt: publishedAt,
        fingerprint: args.fingerprint,
      },
    });
    if (obsoleteSnapshotId !== undefined && obsoleteSnapshotId !== args.snapshotId) {
      await scheduleSnapshotCleanup(ctx, obsoleteSnapshotId);
    }
    const publishedInventory = await ctx.db.get(inventory._id);
    if (!publishedInventory) {
      throw new Error("Repository inventory disappeared after publication.");
    }
    await finishSuccessfulRefresh(ctx, publishedInventory, {
      crawlCost: args.crawlCost,
    });
    return null;
  },
});

async function transitionRepositoryInventoryToFailed(
  ctx: MutationCtx,
  inventory: RepositoryInventoryStateDoc,
  message: string,
): Promise<void> {
  if (inventory.lifecycle.state !== "scheduled" && inventory.lifecycle.state !== "running") {
    return;
  }
  const failedAt = Date.now();
  const obsoleteSnapshotId = inventory.lifecycle.snapshotId;
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
      ((inventory?.lifecycle.state === "scheduled" || inventory?.lifecycle.state === "running") &&
        inventory.lifecycle.snapshotId === args.snapshotId)
    ) {
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
        .withIndex("by_snapshot_and_sortGroup_and_sortTime_and_rowKey", (q) =>
          q.eq("snapshotId", args.snapshotId),
        )
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

export const listRepositoryInventoryPage = query({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    paginationOpts: paginationOptsValidator,
  },
  returns: vRepositoryInventoryPageResult,
  handler: async (ctx, args): Promise<RepositoryInventoryPageResult> => {
    if (
      !Number.isInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > REPOSITORY_INVENTORY_PUBLIC_PAGE_SIZE
    ) {
      throw new Error(
        `Repository inventory pages must request between 1 and ${REPOSITORY_INVENTORY_PUBLIC_PAGE_SIZE} items.`,
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
      snapshot.vaultId !== args.vaultId
    ) {
      return { state: "unavailable" };
    }

    const page = await ctx.db
      .query("vaultRepositoryInventoryItems")
      .withIndex("by_snapshot_and_sortGroup_and_sortTime_and_rowKey", (q) =>
        q.eq("snapshotId", args.snapshotId),
      )
      .paginate(args.paginationOpts);
    const publicItems = page.page.map((item) => {
      if (item.kind === "branch") {
        return {
          kind: item.kind,
          rowKey: item.rowKey,
          previewUrl: item.previewUrl,
          headCommit: item.headCommit,
          name: item.name,
          isDefault: item.isDefault,
        };
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
        baseRefName: item.baseRefName,
        headRepositoryFullName: item.headRepositoryFullName,
        headRefName: item.headRefName,
        canOpenInSamebase: item.canOpenInSamebase,
        labelCount: item.labelCount,
      };
    });
    return {
      state: "ready",
      expectedItemCount: snapshot.branchCount + snapshot.pullRequestCount,
      page: publicItems,
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
    if (inventory.lifecycle.state === "scheduled" || inventory.lifecycle.state === "running") {
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
    const active = [...scheduled, ...running];
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
