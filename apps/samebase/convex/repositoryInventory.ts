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
  REPOSITORY_INVENTORY_MIN_REFRESH_INTERVAL_MS,
  REPOSITORY_INVENTORY_LABEL_CHUNK_SIZE,
  REPOSITORY_INVENTORY_REFRESH_LEASE_MS,
  repositoryInventoryBranchRowKey,
  repositoryInventoryPullRequestBranchLookupKey,
  vRepositoryInventoryBranchContext,
  vRepositoryInventoryItemPage,
  vRepositoryInventoryLabelChunk,
  vRepositoryInventoryPublicState,
  vRepositoryInventoryRefreshRequestResult,
  vStoredRepositoryInventoryItem,
  type RepositoryInventoryPublicState,
  type RepositoryInventoryBranchContext,
  type RepositoryInventoryCommit,
  type RepositoryInventoryRefreshRequestResult,
  type RepositoryInventoryScheduledWait,
} from "./repositoryInventoryModel";
import { isLiveConnectedVault } from "./vault/state";

const { array, boolean, id, literal, null: vNull, number, object, string, union } = v;
const REPOSITORY_INVENTORY_CLEANUP_BATCH_SIZE = 100;
const REPOSITORY_INVENTORY_PUBLIC_PAGE_SIZE = 10;
const ACCOUNT_DELETION_QUIESCE_BATCH_SIZE = 25;

const repositoryInventoryWorkpool = new Workpool(components.repositoryInventoryWorkpool, {
  maxParallelism: 3,
  retryActionsByDefault: false,
});

const repositoryInventoryWorkpoolContext = object({
  vaultId: id("vaults"),
  generation: number(),
});

const vRepositoryInventoryWorkerInput = union(
  object({
    kind: literal("ready"),
    userId: id("users"),
    vaultId: id("vaults"),
    githubRepositoryId: string(),
    repositoryNodeId: v.optional(string()),
    generation: number(),
    targetDemandVersion: number(),
  }),
  object({
    kind: literal("cancel"),
  }),
);
export type RepositoryInventoryWorkerInput = Infer<typeof vRepositoryInventoryWorkerInput>;

type RepositoryInventoryRefreshDoc = Doc<"vaultRepositoryInventoryRefreshes">;

export type ActiveRepositoryInventoryBranchSelection = {
  repositoryFullName: string;
  activeGeneration: number;
  defaultBranch?: {
    name: string;
  };
  branch?: {
    name: string;
    headCommitSha: string;
    isDefault: boolean;
    headCommit: RepositoryInventoryCommit;
  };
};

export async function readActiveRepositoryInventoryBranchSelection(
  ctx: Pick<QueryCtx, "db">,
  args: {
    vaultId: Id<"vaults">;
    branch: string;
  },
): Promise<ActiveRepositoryInventoryBranchSelection | null> {
  const publication = await ctx.db
    .query("vaultRepositoryInventories")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .first();
  if (!publication) {
    return null;
  }

  const [storedBranch, storedDefaultBranch] = await Promise.all([
    ctx.db
      .query("vaultRepositoryInventoryItems")
      .withIndex("by_vault_and_generation_and_rowKey", (q) =>
        q
          .eq("vaultId", args.vaultId)
          .eq("generation", publication.activeGeneration)
          .eq("rowKey", repositoryInventoryBranchRowKey(args.branch)),
      )
      .unique(),
    ctx.db
      .query("vaultRepositoryInventoryItems")
      .withIndex("by_vault_and_generation_and_kindRank_and_timeRank_and_tie", (q) =>
        q
          .eq("vaultId", args.vaultId)
          .eq("generation", publication.activeGeneration)
          .eq("kindRank", 0),
      )
      .unique(),
  ]);
  if (storedBranch?.kind === "pull_request") {
    throw new Error("Repository inventory branch row key points at a pull request.");
  }
  if (
    storedDefaultBranch &&
    (storedDefaultBranch.kind !== "branch" || !storedDefaultBranch.isDefault)
  ) {
    throw new Error("Repository inventory default branch row is invalid.");
  }

  return {
    repositoryFullName: publication.repositoryFullName,
    activeGeneration: publication.activeGeneration,
    defaultBranch: storedDefaultBranch
      ? {
          name: storedDefaultBranch.name,
        }
      : undefined,
    branch: storedBranch
      ? {
          name: storedBranch.name,
          headCommitSha: storedBranch.headCommitSha,
          isDefault: storedBranch.isDefault,
          headCommit: storedBranch.headCommit,
        }
      : undefined,
  };
}

function emptyInventoryCounts() {
  return {
    itemCount: 0,
    branchCount: 0,
    pullRequestCount: 0,
  };
}

function publicationInventoryCounts(publication: Doc<"vaultRepositoryInventories"> | null) {
  if (publication === null) {
    return emptyInventoryCounts();
  }
  return {
    itemCount: publication.itemCount,
    branchCount: publication.branchCount,
    pullRequestCount: publication.pullRequestCount,
  };
}

async function readInventoryRefresh(
  ctx: Pick<MutationCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<RepositoryInventoryRefreshDoc | null> {
  return await ctx.db
    .query("vaultRepositoryInventoryRefreshes")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .first();
}

async function scheduleRepositoryInventoryRefresh(
  ctx: MutationCtx,
  refresh: RepositoryInventoryRefreshDoc,
  wait: RepositoryInventoryScheduledWait = { kind: "immediate" },
): Promise<void> {
  if (refresh.lifecycle.state !== "idle" && refresh.lifecycle.state !== "failed") {
    return;
  }
  const generation = refresh.nextGeneration;
  const scheduledAt = Date.now();
  const runAt = wait.kind === "immediate" ? scheduledAt : wait.retryAt;
  const workpoolJobId = await repositoryInventoryWorkpool.enqueueAction(
    ctx,
    internal.repositoryInventoryActions.runRepositoryInventoryRefresh,
    {
      vaultId: refresh.vaultId,
      generation,
    },
    {
      context: {
        vaultId: refresh.vaultId,
        generation,
      },
      onComplete: internal.repositoryInventory.handleRepositoryInventoryComplete,
      retry: false,
      runAt,
    },
  );
  await ctx.db.patch(refresh._id, {
    nextGeneration: generation + 1,
    lifecycle: {
      state: "scheduled",
      generation,
      targetDemandVersion: refresh.demandVersion,
      scheduledAt,
      workpoolJobId,
      wait,
    },
    updatedAt: scheduledAt,
  });
}

function repositoryInventoryMinimumIntervalWait(
  refresh: RepositoryInventoryRefreshDoc,
  now: number,
): RepositoryInventoryScheduledWait {
  if (refresh.lastStartedAt === undefined) {
    return { kind: "immediate" };
  }
  const retryAt = refresh.lastStartedAt + REPOSITORY_INVENTORY_MIN_REFRESH_INTERVAL_MS;
  return retryAt > now ? { kind: "queue", retryAt } : { kind: "immediate" };
}

async function cancelOwnedInventoryJob(
  ctx: MutationCtx,
  refresh: RepositoryInventoryRefreshDoc,
): Promise<void> {
  if (refresh.lifecycle.state !== "scheduled" && refresh.lifecycle.state !== "running") {
    return;
  }
  // @ts-expect-error This value was returned by this Workpool and persisted as a string.
  await repositoryInventoryWorkpool.cancel(ctx, refresh.lifecycle.workpoolJobId);
}

async function requestRepositoryInventoryRefreshForUser(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    ignoreRecentPublication: boolean;
  },
): Promise<RepositoryInventoryRefreshRequestResult> {
  const [user, vault, publication, existingRefresh] = await Promise.all([
    ctx.db.get(args.userId),
    ctx.db.get(args.vaultId),
    ctx.db
      .query("vaultRepositoryInventories")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first(),
    readInventoryRefresh(ctx, args.vaultId),
  ]);
  if (!user || user.accountDeletion !== undefined) {
    throw new Error("Repository inventory is unavailable during account deletion.");
  }
  if (!vault || vault.userId !== args.userId || !isLiveConnectedVault(vault)) {
    throw new Error("Vault not found.");
  }

  const now = Date.now();
  const demandVersion = (existingRefresh?.demandVersion ?? 0) + 1;
  if (existingRefresh === null) {
    const refreshId = await ctx.db.insert("vaultRepositoryInventoryRefreshes", {
      userId: args.userId,
      vaultId: args.vaultId,
      demandVersion,
      nextGeneration: 1,
      lifecycle: { state: "idle" },
      updatedAt: now,
    });
    const refresh = await ctx.db.get(refreshId);
    if (!refresh) {
      throw new Error("Repository inventory refresh was not created.");
    }
    await scheduleRepositoryInventoryRefresh(ctx, refresh);
    return { kind: "scheduled" };
  }
  if (existingRefresh.userId !== args.userId) {
    throw new Error("Repository inventory owner mismatch.");
  }

  let scheduledWait: RepositoryInventoryScheduledWait = { kind: "immediate" };
  switch (existingRefresh.lifecycle.state) {
    case "scheduled":
      await ctx.db.patch(existingRefresh._id, {
        demandVersion,
        lifecycle: {
          ...existingRefresh.lifecycle,
          targetDemandVersion: demandVersion,
        },
        updatedAt: now,
      });
      return { kind: "running" };
    case "running":
      if (existingRefresh.lifecycle.leaseExpiresAt > now) {
        await ctx.db.patch(existingRefresh._id, {
          demandVersion,
          updatedAt: now,
        });
        return { kind: "running" };
      }
      await cancelOwnedInventoryJob(ctx, existingRefresh);
      await ctx.db.patch(existingRefresh._id, {
        demandVersion,
        lifecycle: {
          state: "failed",
          failedAt: now,
          message: "Repository inventory worker lease expired.",
        },
        updatedAt: now,
      });
      break;
    case "idle":
    case "failed":
      await ctx.db.patch(existingRefresh._id, {
        demandVersion,
        updatedAt: now,
      });
      const lastStartedAt = existingRefresh.lastStartedAt ?? publication?.publishedAt;
      if (!args.ignoreRecentPublication && lastStartedAt !== undefined) {
        const earliestStartAt = lastStartedAt + REPOSITORY_INVENTORY_MIN_REFRESH_INTERVAL_MS;
        if (earliestStartAt > now) {
          scheduledWait = { kind: "queue", retryAt: earliestStartAt };
        }
      }
      break;
    default: {
      existingRefresh.lifecycle satisfies never;
      throw new Error("Unsupported repository inventory lifecycle.");
    }
  }

  const refresh = await ctx.db.get(existingRefresh._id);
  if (!refresh) {
    throw new Error("Repository inventory refresh disappeared.");
  }
  await scheduleRepositoryInventoryRefresh(ctx, refresh, scheduledWait);
  return { kind: "scheduled" };
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
      ignoreRecentPublication: false,
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
      userId: args.userId,
      vaultId: args.vaultId,
      ignoreRecentPublication: true,
    });
  },
});

export const claimRepositoryInventoryRefresh = internalMutation({
  args: {
    vaultId: id("vaults"),
    generation: number(),
  },
  returns: vRepositoryInventoryWorkerInput,
  handler: async (ctx, args): Promise<RepositoryInventoryWorkerInput> => {
    const refresh = await readInventoryRefresh(ctx, args.vaultId);
    if (
      !refresh ||
      refresh.lifecycle.state !== "scheduled" ||
      refresh.lifecycle.generation !== args.generation
    ) {
      return { kind: "cancel" };
    }
    const [vault, publication] = await Promise.all([
      ctx.db.get(args.vaultId),
      ctx.db
        .query("vaultRepositoryInventories")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .first(),
    ]);
    if (!vault || vault.userId !== refresh.userId || !isLiveConnectedVault(vault)) {
      await ctx.db.patch(refresh._id, {
        lifecycle: {
          state: "failed",
          failedAt: Date.now(),
          message: "Repository inventory vault is no longer connected.",
        },
        updatedAt: Date.now(),
      });
      return { kind: "cancel" };
    }

    const existingGeneration = await ctx.db
      .query("vaultRepositoryInventoryGenerations")
      .withIndex("by_vault_and_generation", (q) =>
        q.eq("vaultId", args.vaultId).eq("generation", args.generation),
      )
      .first();
    if (existingGeneration) {
      throw new Error("Repository inventory generation already exists.");
    }
    const now = Date.now();
    await ctx.db.insert("vaultRepositoryInventoryGenerations", {
      userId: refresh.userId,
      vaultId: args.vaultId,
      generation: args.generation,
      ...emptyInventoryCounts(),
      labelChunkCount: 0,
      createdAt: now,
    });
    await ctx.db.patch(refresh._id, {
      lifecycle: {
        state: "running",
        generation: args.generation,
        targetDemandVersion: refresh.lifecycle.targetDemandVersion,
        startedAt: now,
        leaseExpiresAt: now + REPOSITORY_INVENTORY_REFRESH_LEASE_MS,
        workpoolJobId: refresh.lifecycle.workpoolJobId,
      },
      lastStartedAt: now,
      updatedAt: now,
    });
    return {
      kind: "ready",
      userId: refresh.userId,
      vaultId: args.vaultId,
      githubRepositoryId: vault.ghRepoId,
      repositoryNodeId: publication?.repositoryNodeId,
      generation: args.generation,
      targetDemandVersion: refresh.lifecycle.targetDemandVersion,
    };
  },
});

async function readOwnedRunningRefresh(
  ctx: Pick<MutationCtx, "db">,
  args: {
    vaultId: Id<"vaults">;
    generation: number;
  },
): Promise<RepositoryInventoryRefreshDoc | null> {
  const refresh = await readInventoryRefresh(ctx, args.vaultId);
  return refresh?.lifecycle.state === "running" && refresh.lifecycle.generation === args.generation
    ? refresh
    : null;
}

async function readInventoryGeneration(
  ctx: Pick<MutationCtx, "db">,
  args: {
    vaultId: Id<"vaults">;
    generation: number;
  },
) {
  return await ctx.db
    .query("vaultRepositoryInventoryGenerations")
    .withIndex("by_vault_and_generation", (q) =>
      q.eq("vaultId", args.vaultId).eq("generation", args.generation),
    )
    .first();
}

export const refreshRepositoryInventoryLease = internalMutation({
  args: {
    vaultId: id("vaults"),
    generation: number(),
  },
  returns: boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const refresh = await readOwnedRunningRefresh(ctx, args);
    if (!refresh || refresh.lifecycle.state !== "running") {
      return false;
    }
    const now = Date.now();
    await ctx.db.patch(refresh._id, {
      lifecycle: {
        ...refresh.lifecycle,
        leaseExpiresAt: now + REPOSITORY_INVENTORY_REFRESH_LEASE_MS,
      },
      updatedAt: now,
    });
    return true;
  },
});

export const deferRepositoryInventoryRefresh = internalMutation({
  args: {
    vaultId: id("vaults"),
    generation: number(),
    reason: union(literal("queue"), literal("rate_limit")),
    retryAt: number(),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const [refresh, generation] = await Promise.all([
      readOwnedRunningRefresh(ctx, args),
      readInventoryGeneration(ctx, args),
    ]);
    if (!refresh || refresh.lifecycle.state !== "running" || !generation) {
      return null;
    }
    if (
      generation.itemCount !== 0 ||
      generation.branchCount !== 0 ||
      generation.pullRequestCount !== 0 ||
      generation.labelChunkCount !== 0
    ) {
      throw new Error("Repository inventory cannot wait after staging provider data.");
    }

    await ctx.db.delete(generation._id);
    await ctx.db.patch(refresh._id, {
      lifecycle: { state: "idle" },
      updatedAt: Date.now(),
    });
    const idleRefresh = await ctx.db.get(refresh._id);
    if (!idleRefresh) {
      return null;
    }
    const retryAt = Math.max(args.retryAt, Date.now() + 1_000);
    await scheduleRepositoryInventoryRefresh(ctx, idleRefresh, {
      kind: args.reason,
      retryAt,
    });
    return null;
  },
});

export const stageRepositoryInventoryItems = internalMutation({
  args: {
    vaultId: id("vaults"),
    generation: number(),
    items: array(vStoredRepositoryInventoryItem),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const [refresh, generation] = await Promise.all([
      readOwnedRunningRefresh(ctx, args),
      readInventoryGeneration(ctx, args),
    ]);
    if (!refresh || !generation) {
      throw new Error("Repository inventory generation is not running.");
    }
    let branchCount = 0;
    let pullRequestCount = 0;
    for (const item of args.items) {
      if (
        item.userId !== refresh.userId ||
        item.vaultId !== args.vaultId ||
        item.generation !== args.generation
      ) {
        throw new Error("Repository inventory item ownership mismatch.");
      }
      switch (item.kind) {
        case "branch":
          branchCount += 1;
          break;
        case "pull_request":
          pullRequestCount += 1;
          break;
        default: {
          item satisfies never;
        }
      }
      await ctx.db.insert("vaultRepositoryInventoryItems", item);
    }
    await ctx.db.patch(generation._id, {
      itemCount: generation.itemCount + args.items.length,
      branchCount: generation.branchCount + branchCount,
      pullRequestCount: generation.pullRequestCount + pullRequestCount,
    });
    return null;
  },
});

export const stageRepositoryInventoryLabelChunks = internalMutation({
  args: {
    vaultId: id("vaults"),
    generation: number(),
    labelChunks: array(vRepositoryInventoryLabelChunk),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const [refresh, generation] = await Promise.all([
      readOwnedRunningRefresh(ctx, args),
      readInventoryGeneration(ctx, args),
    ]);
    if (!refresh || !generation) {
      throw new Error("Repository inventory generation is not running.");
    }
    for (const labelChunk of args.labelChunks) {
      if (
        labelChunk.userId !== refresh.userId ||
        labelChunk.vaultId !== args.vaultId ||
        labelChunk.generation !== args.generation
      ) {
        throw new Error("Repository inventory label chunk ownership mismatch.");
      }
      if (
        !Number.isInteger(labelChunk.chunkIndex) ||
        labelChunk.chunkIndex < 0 ||
        labelChunk.labels.length === 0 ||
        labelChunk.labels.length > REPOSITORY_INVENTORY_LABEL_CHUNK_SIZE
      ) {
        throw new Error("Repository inventory label chunk is invalid.");
      }
      await ctx.db.insert("vaultRepositoryInventoryLabelChunks", labelChunk);
    }
    await ctx.db.patch(generation._id, {
      labelChunkCount: generation.labelChunkCount + args.labelChunks.length,
    });
    return null;
  },
});

async function scheduleTrailingRepositoryInventoryRefresh(
  ctx: MutationCtx,
  refresh: RepositoryInventoryRefreshDoc,
): Promise<void> {
  await ctx.db.patch(refresh._id, {
    lifecycle: { state: "idle" },
    updatedAt: Date.now(),
  });
  const idleRefresh = await ctx.db.get(refresh._id);
  if (!idleRefresh) {
    return;
  }
  await scheduleRepositoryInventoryRefresh(
    ctx,
    idleRefresh,
    repositoryInventoryMinimumIntervalWait(idleRefresh, Date.now()),
  );
}

async function completeSuccessfulRepositoryInventoryRefresh(
  ctx: MutationCtx,
  refresh: RepositoryInventoryRefreshDoc,
  completedAt: number,
): Promise<void> {
  if (refresh.lifecycle.state !== "running") {
    throw new Error("Repository inventory generation is not running.");
  }
  await ctx.db.patch(refresh._id, { lastCheckedAt: completedAt });
  if (refresh.demandVersion > refresh.lifecycle.targetDemandVersion) {
    await scheduleTrailingRepositoryInventoryRefresh(ctx, refresh);
  } else {
    await ctx.db.patch(refresh._id, {
      lifecycle: { state: "idle" },
      updatedAt: completedAt,
    });
  }
  await ctx.scheduler.runAfter(0, internal.repositoryInventory.cleanupOldRepositoryInventory, {
    vaultId: refresh.vaultId,
  });
}

export const completeUnchangedRepositoryInventoryRefresh = internalMutation({
  args: {
    vaultId: id("vaults"),
    generation: number(),
    fingerprint: string(),
  },
  returns: boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const [refresh, generation, publication] = await Promise.all([
      readOwnedRunningRefresh(ctx, args),
      readInventoryGeneration(ctx, args),
      ctx.db
        .query("vaultRepositoryInventories")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .first(),
    ]);
    if (!refresh || refresh.lifecycle.state !== "running" || !generation) {
      throw new Error("Repository inventory generation is not running.");
    }
    if (!publication || publication.fingerprint !== args.fingerprint) {
      return false;
    }
    if (
      generation.itemCount !== 0 ||
      generation.branchCount !== 0 ||
      generation.pullRequestCount !== 0 ||
      generation.labelChunkCount !== 0
    ) {
      throw new Error("Repository inventory generation was staged before its fingerprint check.");
    }

    const checkedAt = Date.now();
    await ctx.db.delete(generation._id);
    await completeSuccessfulRepositoryInventoryRefresh(ctx, refresh, checkedAt);
    return true;
  },
});

export const publishRepositoryInventoryGeneration = internalMutation({
  args: {
    vaultId: id("vaults"),
    generation: number(),
    repositoryNodeId: string(),
    repositoryFullName: string(),
    itemCount: number(),
    branchCount: number(),
    pullRequestCount: number(),
    labelChunkCount: number(),
    fingerprint: string(),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const [refresh, generation, publication] = await Promise.all([
      readOwnedRunningRefresh(ctx, args),
      readInventoryGeneration(ctx, args),
      ctx.db
        .query("vaultRepositoryInventories")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .first(),
    ]);
    if (!refresh || refresh.lifecycle.state !== "running" || !generation) {
      throw new Error("Repository inventory generation is not running.");
    }
    const publicationCounts = {
      itemCount: args.itemCount,
      branchCount: args.branchCount,
      pullRequestCount: args.pullRequestCount,
    };
    if (
      generation.itemCount !== publicationCounts.itemCount ||
      generation.branchCount !== publicationCounts.branchCount ||
      generation.pullRequestCount !== publicationCounts.pullRequestCount ||
      generation.labelChunkCount !== args.labelChunkCount
    ) {
      throw new Error("Repository inventory generation counts are incomplete.");
    }

    const publishedAt = Date.now();
    if (publication) {
      if (publication.userId !== refresh.userId) {
        throw new Error("Repository inventory publication owner mismatch.");
      }
      await ctx.db.replace(publication._id, {
        userId: refresh.userId,
        vaultId: args.vaultId,
        repositoryNodeId: args.repositoryNodeId,
        repositoryFullName: args.repositoryFullName,
        activeGeneration: args.generation,
        publishedAt,
        fingerprint: args.fingerprint,
        ...publicationCounts,
      });
    } else {
      await ctx.db.insert("vaultRepositoryInventories", {
        userId: refresh.userId,
        vaultId: args.vaultId,
        repositoryNodeId: args.repositoryNodeId,
        repositoryFullName: args.repositoryFullName,
        activeGeneration: args.generation,
        publishedAt,
        fingerprint: args.fingerprint,
        ...publicationCounts,
      });
    }

    await completeSuccessfulRepositoryInventoryRefresh(ctx, refresh, publishedAt);
    return null;
  },
});

async function transitionRepositoryInventoryRefreshToFailed(
  ctx: MutationCtx,
  refresh: RepositoryInventoryRefreshDoc,
  message: string,
): Promise<void> {
  if (refresh.lifecycle.state !== "scheduled" && refresh.lifecycle.state !== "running") {
    return;
  }
  const targetDemandVersion = refresh.lifecycle.targetDemandVersion;
  const failedAt = Date.now();
  await ctx.db.patch(refresh._id, {
    lifecycle: {
      state: "failed",
      failedAt,
      message,
    },
    updatedAt: failedAt,
  });
  const failedRefresh = await ctx.db.get(refresh._id);
  if (failedRefresh && failedRefresh.demandVersion > targetDemandVersion) {
    await scheduleRepositoryInventoryRefresh(
      ctx,
      failedRefresh,
      repositoryInventoryMinimumIntervalWait(failedRefresh, failedAt),
    );
  }
  await ctx.scheduler.runAfter(0, internal.repositoryInventory.cleanupOldRepositoryInventory, {
    vaultId: refresh.vaultId,
  });
}

export const failRepositoryInventoryRefresh = internalMutation({
  args: {
    vaultId: id("vaults"),
    generation: number(),
    message: string(),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const refresh = await readOwnedRunningRefresh(ctx, args);
    if (!refresh || refresh.lifecycle.state !== "running") {
      return null;
    }
    await transitionRepositoryInventoryRefreshToFailed(ctx, refresh, args.message);
    return null;
  },
});

export const handleRepositoryInventoryComplete = internalMutation({
  args: vOnCompleteArgs(repositoryInventoryWorkpoolContext),
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const refresh = await readInventoryRefresh(ctx, args.context.vaultId);
    if (
      !refresh ||
      (refresh.lifecycle.state !== "scheduled" && refresh.lifecycle.state !== "running") ||
      refresh.lifecycle.generation !== args.context.generation ||
      refresh.lifecycle.workpoolJobId !== args.workId
    ) {
      return null;
    }
    switch (args.result.kind) {
      case "success":
        return null;
      case "failed":
        await transitionRepositoryInventoryRefreshToFailed(ctx, refresh, args.result.error);
        return null;
      case "canceled":
        await transitionRepositoryInventoryRefreshToFailed(
          ctx,
          refresh,
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

export const cleanupOldRepositoryInventory = internalMutation({
  args: {
    vaultId: id("vaults"),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const [publication, refresh, generations] = await Promise.all([
      ctx.db
        .query("vaultRepositoryInventories")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .first(),
      readInventoryRefresh(ctx, args.vaultId),
      ctx.db
        .query("vaultRepositoryInventoryGenerations")
        .withIndex("by_vault_and_generation", (q) => q.eq("vaultId", args.vaultId))
        .take(10),
    ]);
    const runningGeneration =
      refresh?.lifecycle.state === "scheduled" || refresh?.lifecycle.state === "running"
        ? refresh.lifecycle.generation
        : null;
    const generation = generations.find(
      (candidate) =>
        candidate.generation !== publication?.activeGeneration &&
        candidate.generation !== runningGeneration,
    );
    if (!generation) {
      return null;
    }

    const labelChunks = await ctx.db
      .query("vaultRepositoryInventoryLabelChunks")
      .withIndex("by_vault_and_generation", (q) =>
        q.eq("vaultId", args.vaultId).eq("generation", generation.generation),
      )
      .take(REPOSITORY_INVENTORY_CLEANUP_BATCH_SIZE);
    for (const labelChunk of labelChunks) {
      await ctx.db.delete(labelChunk._id);
    }
    if (labelChunks.length === 0) {
      const items = await ctx.db
        .query("vaultRepositoryInventoryItems")
        .withIndex("by_vault_and_generation", (q) =>
          q.eq("vaultId", args.vaultId).eq("generation", generation.generation),
        )
        .take(REPOSITORY_INVENTORY_CLEANUP_BATCH_SIZE);
      for (const item of items) {
        await ctx.db.delete(item._id);
      }
      if (items.length === 0) {
        await ctx.db.delete(generation._id);
      }
    }
    await ctx.scheduler.runAfter(0, internal.repositoryInventory.cleanupOldRepositoryInventory, {
      vaultId: args.vaultId,
    });
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

  const defaultBranch = selection.defaultBranch?.name ?? vault.defaultBranch;
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
        .withIndex("by_vaultId_generation_kind_branchLookupKey_timeRank_tie", (q) =>
          q
            .eq("vaultId", args.vaultId)
            .eq("generation", selection.activeGeneration)
            .eq("kind", "pull_request")
            .eq("branchLookupKey", repositoryInventoryPullRequestBranchLookupKey(branch.name)),
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
    const [publication, refresh] = await Promise.all([
      ctx.db
        .query("vaultRepositoryInventories")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .first(),
      ctx.db
        .query("vaultRepositoryInventoryRefreshes")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .first(),
    ]);
    const counts = publicationInventoryCounts(publication);
    const lastCompleteAt = refresh?.lastCheckedAt ?? publication?.publishedAt;
    if (!refresh || refresh.lifecycle.state === "idle") {
      return publication
        ? {
            state: "ready",
            activeGeneration: publication.activeGeneration,
            repositoryFullName: publication.repositoryFullName,
            publishedAt: lastCompleteAt ?? publication.publishedAt,
            ...counts,
          }
        : { state: "empty" };
    }
    switch (refresh.lifecycle.state) {
      case "scheduled":
        if (refresh.lifecycle.wait.kind !== "immediate") {
          return {
            state: "waiting",
            reason: refresh.lifecycle.wait.kind,
            retryAt: refresh.lifecycle.wait.retryAt,
            activeGeneration: publication?.activeGeneration,
            repositoryFullName: publication?.repositoryFullName,
            publishedAt: lastCompleteAt,
            ...counts,
          };
        }
        return {
          state: "refreshing",
          startedAt: refresh.lifecycle.scheduledAt,
          activeGeneration: publication?.activeGeneration,
          repositoryFullName: publication?.repositoryFullName,
          publishedAt: lastCompleteAt,
          ...counts,
        };
      case "running":
        return {
          state: "refreshing",
          startedAt: refresh.lifecycle.startedAt,
          activeGeneration: publication?.activeGeneration,
          repositoryFullName: publication?.repositoryFullName,
          publishedAt: lastCompleteAt,
          ...counts,
        };
      case "failed":
        return {
          state: "failed",
          failedAt: refresh.lifecycle.failedAt,
          message: refresh.lifecycle.message,
          activeGeneration: publication?.activeGeneration,
          repositoryFullName: publication?.repositoryFullName,
          publishedAt: lastCompleteAt,
          ...counts,
        };
      default: {
        refresh.lifecycle satisfies never;
        return { state: "empty" };
      }
    }
  },
});

export const listRepositoryInventoryPage = query({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
    generation: number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: vRepositoryInventoryItemPage,
  handler: async (ctx, args) => {
    if (
      !Number.isInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > REPOSITORY_INVENTORY_PUBLIC_PAGE_SIZE
    ) {
      throw new Error(
        `Repository inventory pages must request between 1 and ${REPOSITORY_INVENTORY_PUBLIC_PAGE_SIZE} items.`,
      );
    }
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== ctx.viewer.userId || !isLiveConnectedVault(vault)) {
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      };
    }
    const publication = await ctx.db
      .query("vaultRepositoryInventories")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
    if (!publication || publication.activeGeneration !== args.generation) {
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      };
    }
    const page = await ctx.db
      .query("vaultRepositoryInventoryItems")
      .withIndex("by_vault_and_generation_and_kindRank_and_timeRank_and_tie", (q) =>
        q.eq("vaultId", args.vaultId).eq("generation", args.generation),
      )
      .paginate(args.paginationOpts);
    const publicItems = await Promise.all(
      page.page.map(async (storedItem) => {
        const { _id: _itemId, _creationTime: _createdAt, ...item } = storedItem;
        if (item.kind === "branch") {
          const { branchLookupKey: _branchLookupKey, ...branch } = item;
          return branch;
        }
        const labelChunks = await ctx.db
          .query("vaultRepositoryInventoryLabelChunks")
          .withIndex("by_vault_and_generation_and_rowKey_and_chunkIndex", (q) =>
            q
              .eq("vaultId", args.vaultId)
              .eq("generation", args.generation)
              .eq("rowKey", item.rowKey),
          )
          .take(item.labelChunkCount + 1);
        if (
          labelChunks.length !== item.labelChunkCount ||
          labelChunks.some((labelChunk, chunkIndex) => labelChunk.chunkIndex !== chunkIndex)
        ) {
          throw new Error("Repository inventory label chunks are incomplete.");
        }
        const {
          branchLookupKey: _branchLookupKey,
          labelChunkCount: _labelChunkCount,
          ...pullRequest
        } = item;
        return {
          ...pullRequest,
          labels: labelChunks.flatMap((labelChunk) => labelChunk.labels),
        };
      }),
    );
    return {
      page: publicItems,
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
    const refresh = await readInventoryRefresh(ctx, args.vaultId);
    if (!refresh) {
      return null;
    }
    if (refresh.userId !== args.userId) {
      throw new Error("Repository inventory owner mismatch.");
    }
    if (refresh.lifecycle.state === "scheduled" || refresh.lifecycle.state === "running") {
      await cancelOwnedInventoryJob(ctx, refresh);
    }
    const stoppedAt = Date.now();
    await ctx.db.patch(refresh._id, {
      lifecycle: {
        state: "failed",
        failedAt: stoppedAt,
        message: "Repository inventory stopped for vault deletion.",
      },
      updatedAt: stoppedAt,
    });
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
    const refreshes = await ctx.db
      .query("vaultRepositoryInventoryRefreshes")
      .withIndex("by_userId_and_lifecycle_state_and_updatedAt", (q) =>
        q.eq("userId", deletionRun.identity.userId).eq("lifecycle.state", "scheduled"),
      )
      .take(ACCOUNT_DELETION_QUIESCE_BATCH_SIZE);
    const running = await ctx.db
      .query("vaultRepositoryInventoryRefreshes")
      .withIndex("by_userId_and_lifecycle_state_and_updatedAt", (q) =>
        q.eq("userId", deletionRun.identity.userId).eq("lifecycle.state", "running"),
      )
      .take(ACCOUNT_DELETION_QUIESCE_BATCH_SIZE - refreshes.length);
    const active = [...refreshes, ...running];
    for (const refresh of active) {
      await cancelOwnedInventoryJob(ctx, refresh);
      await clearGitHubGraphqlRateBudgetLeaseForVault(ctx, refresh.vaultId);
      const now = Date.now();
      await ctx.db.patch(refresh._id, {
        lifecycle: {
          state: "failed",
          failedAt: now,
          message: "Repository inventory stopped for account deletion.",
        },
        updatedAt: now,
      });
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
      ignoreRecentPublication: true,
    });
  },
});
