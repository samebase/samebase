import { vOnCompleteArgs } from "@convex-dev/workpool";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { readOwnedActiveRun } from "./accountDeletion/stepContext";
import { mutation, query } from "./functions";
import { githubObservationWorkpool } from "./githubObservationWorkpool";
import {
  REPOSITORY_SUMMARY_FAILURE_RETRY_MS,
  REPOSITORY_SUMMARY_PAGE_SIZE,
  REPOSITORY_SUMMARY_REFRESH_INTERVAL_MS,
  REPOSITORY_SUMMARY_UNAVAILABLE_RETRY_MS,
  vRepositorySummaryDirectoryEntry,
  vRepositorySummaryObservationResult,
  vRepositorySummaryRefreshRequestResult,
  vRepositorySummaryWorkerInput,
  type RepositorySummaryDefaultBranch,
  type RepositorySummaryPublicState,
  type RepositorySummaryWorkerInput,
} from "./repositorySummaryModel";
import { parseRepositoryFullName } from "../shared/repoName";
import { isLiveConnectedVault } from "./vault/state";

const { array, id, literal, null: vNull, number, object, string, union } = v;

const repositorySummaryBatchContext = object({
  userId: id("users"),
  batchId: string(),
  vaultIds: array(id("vaults")),
});

type RepositorySummaryDoc = Doc<"vaultRepositorySummaries">;

async function readRepositorySummary(
  ctx: Pick<QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<RepositorySummaryDoc | null> {
  return await ctx.db
    .query("vaultRepositorySummaries")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .unique();
}

export async function bumpRepositorySummaryDirectoryRevision(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
): Promise<void> {
  const state = await ctx.db
    .query("vaultRepositorySummaryDirectoryStates")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (state === null) {
    await ctx.db.insert("vaultRepositorySummaryDirectoryStates", {
      userId,
      revision: 1,
    });
    return;
  }
  await ctx.db.patch(state._id, { revision: state.revision + 1 });
}

export async function createRepositorySummaryForConnectedVault(
  ctx: MutationCtx,
  args: {
    vaultId: Id<"vaults">;
    userId: Id<"users">;
  },
): Promise<void> {
  const vault = await ctx.db.get(args.vaultId);
  if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
    throw new Error("Repository summary requires a connected vault.");
  }
  const existing = await readRepositorySummary(ctx, args.vaultId);
  if (existing !== null) {
    if (existing.userId !== args.userId) {
      throw new Error("Connected vault repository summary identity cannot be changed.");
    }
    return;
  }
  await ctx.db.insert("vaultRepositorySummaries", {
    userId: args.userId,
    vaultId: args.vaultId,
    refreshEligibleAt: 0,
    lifecycle: { state: "idle" },
    publication: { state: "unobserved" },
  });
  await bumpRepositorySummaryDirectoryRevision(ctx, args.userId);
}

export async function deleteRepositorySummaryForVault(
  ctx: Pick<MutationCtx, "db">,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<boolean> {
  const summary = await readRepositorySummary(ctx, args.vaultId);
  if (summary === null) {
    return false;
  }
  if (summary.userId !== args.userId) {
    throw new Error("Repository summary belongs to another user.");
  }
  await ctx.db.delete(summary._id);
  return true;
}

export const quiesceForVaultDeletion = internalMutation({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const summary = await readRepositorySummary(ctx, args.vaultId);
    if (summary === null) {
      return null;
    }
    if (summary.userId !== args.userId) {
      throw new Error("Repository summary belongs to another user.");
    }
    if (
      summary.lifecycle.state === "idle" ||
      summary.lifecycle.state === "failed" ||
      summary.lifecycle.state === "unavailable"
    ) {
      return null;
    }
    await ctx.db.patch(summary._id, {
      refreshEligibleAt: Date.now() + REPOSITORY_SUMMARY_REFRESH_INTERVAL_MS,
      lifecycle: { state: "idle" },
    });
    await bumpRepositorySummaryDirectoryRevision(ctx, args.userId);
    return null;
  },
});

const repositorySummaryAccountQuiescenceResult = union(
  object({ state: literal("done") }),
  object({ state: literal("needs_more") }),
);

export const quiesceForAccountDeletion = internalMutation({
  args: {
    runId: id("accountDeletionRuns"),
    workflowId: string(),
  },
  returns: repositorySummaryAccountQuiescenceResult,
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const userId = run.identity.userId;
    const scheduled = await ctx.db
      .query("vaultRepositorySummaries")
      .withIndex("by_userId_and_lifecycle_state_and_refreshEligibleAt", (q) =>
        q.eq("userId", userId).eq("lifecycle.state", "scheduled"),
      )
      .take(REPOSITORY_SUMMARY_PAGE_SIZE);
    const running =
      scheduled.length >= REPOSITORY_SUMMARY_PAGE_SIZE
        ? []
        : await ctx.db
            .query("vaultRepositorySummaries")
            .withIndex("by_userId_and_lifecycle_state_and_refreshEligibleAt", (q) =>
              q.eq("userId", userId).eq("lifecycle.state", "running"),
            )
            .take(REPOSITORY_SUMMARY_PAGE_SIZE - scheduled.length);
    const active = [...scheduled, ...running];
    if (active.length === 0) {
      return { state: "done" } as const;
    }
    const canceledWorkIds = new Set<string>();
    for (const summary of active) {
      if (
        (summary.lifecycle.state === "scheduled" || summary.lifecycle.state === "running") &&
        summary.lifecycle.source === "summary_batch" &&
        !canceledWorkIds.has(summary.lifecycle.workpoolJobId)
      ) {
        // @ts-expect-error This value was returned by this Workpool and persisted as a string.
        await githubObservationWorkpool.cancel(ctx, summary.lifecycle.workpoolJobId);
        canceledWorkIds.add(summary.lifecycle.workpoolJobId);
      }
      await ctx.db.patch(summary._id, {
        refreshEligibleAt: Date.now() + REPOSITORY_SUMMARY_REFRESH_INTERVAL_MS,
        lifecycle: { state: "idle" },
      });
    }
    await bumpRepositorySummaryDirectoryRevision(ctx, userId);
    return { state: "needs_more" } as const;
  },
});

function publicRepositorySummaryState(summary: RepositorySummaryDoc): RepositorySummaryPublicState {
  const publication = summary.publication;
  switch (summary.lifecycle.state) {
    case "idle":
      return { lifecycle: { state: "idle" }, publication };
    case "scheduled":
      return summary.lifecycle.wait.kind === "rate_limit"
        ? {
            lifecycle: {
              state: "waiting",
              reason: "rate_limit",
              retryAt: summary.lifecycle.wait.retryAt,
            },
            publication,
          }
        : { lifecycle: { state: "updating" }, publication };
    case "running":
      return { lifecycle: { state: "updating" }, publication };
    case "failed":
      return {
        lifecycle: {
          state: "failed",
          failedAt: summary.lifecycle.failedAt,
          message: summary.lifecycle.message,
        },
        publication,
      };
    case "unavailable":
      return {
        lifecycle: {
          state: "unavailable",
          observedAt: summary.lifecycle.observedAt,
          reason: summary.lifecycle.reason,
        },
        publication,
      };
    default: {
      summary.lifecycle satisfies never;
      return { lifecycle: { state: "idle" }, publication };
    }
  }
}

export const getRepositorySummaryDirectoryState = query({
  access: "access_dashboard",
  args: {},
  returns: object({ revision: number() }),
  handler: async (ctx) => {
    const state = await ctx.db
      .query("vaultRepositorySummaryDirectoryStates")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.viewer.userId))
      .unique();
    return { revision: state?.revision ?? 0 };
  },
});

export const listRepositorySummaryDirectoryPage = query({
  access: "access_dashboard",
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(vRepositorySummaryDirectoryEntry),
  handler: async (ctx, args) => {
    if (
      !Number.isInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > REPOSITORY_SUMMARY_PAGE_SIZE
    ) {
      throw new Error(
        `Repository summary directory pages must request between 1 and ${REPOSITORY_SUMMARY_PAGE_SIZE} items.`,
      );
    }
    const requestedMaximumRowsRead = args.paginationOpts.maximumRowsRead;
    if (
      requestedMaximumRowsRead !== undefined &&
      (!Number.isInteger(requestedMaximumRowsRead) ||
        requestedMaximumRowsRead < 1 ||
        requestedMaximumRowsRead > REPOSITORY_SUMMARY_PAGE_SIZE)
    ) {
      throw new Error(
        `Repository summary directory pages may read at most ${REPOSITORY_SUMMARY_PAGE_SIZE} rows.`,
      );
    }
    const page = await ctx.db
      .query("vaults")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.viewer.userId))
      .paginate({
        ...args.paginationOpts,
        maximumRowsRead: requestedMaximumRowsRead ?? REPOSITORY_SUMMARY_PAGE_SIZE,
      });
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (vault) => {
          if (vault.state === "not_connected") {
            throw new Error("Repository directory found an uninitialized vault.");
          }
          const repositoryFullName = `${vault.owner}/${vault.name}`;
          if (vault.deletion.state === "deleting") {
            return {
              vaultId: vault._id,
              repositoryFullName,
              state: { state: "deleting" as const, requestedAt: vault.deletion.requestedAt },
            };
          }
          if (vault.deletion.state === "delete_failed") {
            return {
              vaultId: vault._id,
              repositoryFullName,
              state: { state: "delete_failed" as const, failedAt: vault.deletion.failedAt },
            };
          }
          if (vault.state === "provisioning") {
            return {
              vaultId: vault._id,
              repositoryFullName,
              state: { state: "provisioning" as const, startedAt: vault.startedAt },
            };
          }
          if (vault.state === "failed") {
            return {
              vaultId: vault._id,
              repositoryFullName,
              state: { state: "setup_failed" as const, failedAt: vault.failedAt },
            };
          }
          const summary = await readRepositorySummary(ctx, vault._id);
          if (summary === null || summary.userId !== ctx.viewer.userId) {
            throw new Error("Connected vault repository summary is missing.");
          }
          return {
            vaultId: vault._id,
            repositoryFullName,
            state: { state: "connected" as const, summary: publicRepositorySummaryState(summary) },
          };
        }),
      ),
    };
  },
});

function canScheduleRepositorySummary(summary: RepositorySummaryDoc, now: number): boolean {
  return (
    summary.refreshEligibleAt <= now &&
    (summary.lifecycle.state === "idle" ||
      summary.lifecycle.state === "failed" ||
      summary.lifecycle.state === "unavailable")
  );
}

async function enqueueRepositorySummaryBatch(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    summaries: readonly RepositorySummaryDoc[];
    wait?: { kind: "queue" | "rate_limit"; retryAt: number };
  },
): Promise<void> {
  const batchId = crypto.randomUUID();
  const vaultIds = args.summaries.map((summary) => summary.vaultId);
  const scheduledAt = Date.now();
  const wait = args.wait ?? { kind: "immediate" as const };
  const runAt = wait.kind === "immediate" ? scheduledAt : wait.retryAt;
  const workpoolJobId = await githubObservationWorkpool.enqueueAction(
    ctx,
    internal.repositorySummaryActions.runRepositorySummaryBatch,
    { userId: args.userId, batchId, vaultIds },
    {
      context: { userId: args.userId, batchId, vaultIds },
      onComplete: internal.repositorySummary.handleRepositorySummaryBatchComplete,
      retry: false,
      ...(wait.kind === "immediate" ? {} : { runAt }),
    },
  );
  for (const summary of args.summaries) {
    await ctx.db.patch(summary._id, {
      refreshEligibleAt: runAt + REPOSITORY_SUMMARY_REFRESH_INTERVAL_MS,
      lifecycle: {
        state: "scheduled",
        source: "summary_batch",
        batchId,
        scheduledAt,
        workpoolJobId,
        wait,
      },
    });
  }
}

export const requestRepositorySummaryRefresh = mutation({
  access: "access_dashboard",
  args: {
    visibleVaultIds: array(id("vaults")),
  },
  returns: vRepositorySummaryRefreshRequestResult,
  handler: async (ctx, args) => {
    if (ctx.viewer.user.accountDeletion !== undefined) {
      throw new Error("Repository summaries are unavailable during account deletion.");
    }
    if (args.visibleVaultIds.length > REPOSITORY_SUMMARY_PAGE_SIZE) {
      throw new Error(
        `Repository summary refresh demand accepts at most ${REPOSITORY_SUMMARY_PAGE_SIZE} visible vaults.`,
      );
    }
    const now = Date.now();
    const uniqueVisibleVaultIds = [...new Set(args.visibleVaultIds)];
    const visibleSummaries = await Promise.all(
      uniqueVisibleVaultIds.map((vaultId) => readRepositorySummary(ctx, vaultId)),
    );
    const selected: RepositorySummaryDoc[] = [];
    const selectedVaultIds = new Set<Id<"vaults">>();
    for (const summary of visibleSummaries) {
      if (
        summary !== null &&
        summary.userId === ctx.viewer.userId &&
        canScheduleRepositorySummary(summary, now)
      ) {
        selected.push(summary);
        selectedVaultIds.add(summary.vaultId);
      }
    }
    if (selected.length < REPOSITORY_SUMMARY_PAGE_SIZE) {
      const eligibleByState = await Promise.all(
        (["idle", "failed", "unavailable"] as const).map(
          async (state) =>
            await ctx.db
              .query("vaultRepositorySummaries")
              .withIndex("by_userId_and_lifecycle_state_and_refreshEligibleAt", (q) =>
                q
                  .eq("userId", ctx.viewer.userId)
                  .eq("lifecycle.state", state)
                  .lte("refreshEligibleAt", now),
              )
              .take(REPOSITORY_SUMMARY_PAGE_SIZE),
        ),
      );
      const oldestEligible = eligibleByState
        .flat()
        .sort(
          (left, right) =>
            left.refreshEligibleAt - right.refreshEligibleAt ||
            left.vaultId.localeCompare(right.vaultId),
        )
        .slice(0, REPOSITORY_SUMMARY_PAGE_SIZE);
      for (const summary of oldestEligible) {
        if (
          selected.length >= REPOSITORY_SUMMARY_PAGE_SIZE ||
          selectedVaultIds.has(summary.vaultId) ||
          !canScheduleRepositorySummary(summary, now)
        ) {
          continue;
        }
        selected.push(summary);
        selectedVaultIds.add(summary.vaultId);
      }
    }
    if (selected.length === 0) {
      return { state: "idle" } as const;
    }
    await enqueueRepositorySummaryBatch(ctx, {
      userId: ctx.viewer.userId,
      summaries: selected,
    });
    await bumpRepositorySummaryDirectoryRevision(ctx, ctx.viewer.userId);
    return { state: "scheduled", repositoryCount: selected.length } as const;
  },
});

export const claimRepositorySummaryBatch = internalMutation({
  args: {
    userId: id("users"),
    batchId: string(),
    vaultIds: array(id("vaults")),
  },
  returns: vRepositorySummaryWorkerInput,
  handler: async (ctx, args): Promise<RepositorySummaryWorkerInput> => {
    if (args.vaultIds.length < 1 || args.vaultIds.length > REPOSITORY_SUMMARY_PAGE_SIZE) {
      throw new Error("Repository summary batch has an invalid size.");
    }
    const repositories: Extract<RepositorySummaryWorkerInput, { state: "ready" }>["repositories"] =
      [];
    let publicStateChanged = false;
    const startedAt = Date.now();
    for (const vaultId of new Set(args.vaultIds)) {
      const [summary, vault] = await Promise.all([
        readRepositorySummary(ctx, vaultId),
        ctx.db.get(vaultId),
      ]);
      if (
        summary === null ||
        summary.userId !== args.userId ||
        summary.lifecycle.state !== "scheduled" ||
        summary.lifecycle.source !== "summary_batch" ||
        summary.lifecycle.batchId !== args.batchId
      ) {
        continue;
      }
      if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
        await ctx.db.patch(summary._id, {
          refreshEligibleAt: startedAt + REPOSITORY_SUMMARY_FAILURE_RETRY_MS,
          lifecycle: {
            state: "failed",
            failedAt: startedAt,
            message: "Connected repository is unavailable.",
          },
        });
        publicStateChanged = true;
        continue;
      }
      if (summary.lifecycle.wait.kind === "rate_limit") {
        publicStateChanged = true;
      }
      await ctx.db.patch(summary._id, {
        lifecycle: {
          state: "running",
          source: "summary_batch",
          batchId: args.batchId,
          startedAt,
          workpoolJobId: summary.lifecycle.workpoolJobId,
        },
      });
      repositories.push({
        vaultId,
        repositoryNodeId: vault.ghRepoNodeId,
        expectedRepositoryDatabaseId: vault.ghRepoId,
      });
    }
    if (publicStateChanged) {
      await bumpRepositorySummaryDirectoryRevision(ctx, args.userId);
    }
    return repositories.length === 0
      ? { state: "cancel" }
      : { state: "ready", userId: args.userId, batchId: args.batchId, repositories };
  },
});

export async function claimRepositorySummaryForInventory(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    snapshotId: Id<"vaultRepositoryInventorySnapshots">;
    startedAt: number;
  },
): Promise<void> {
  const summary = await readRepositorySummary(ctx, args.vaultId);
  if (summary === null || summary.userId !== args.userId) {
    throw new Error("Connected vault repository summary is missing.");
  }
  await ctx.db.patch(summary._id, {
    refreshEligibleAt: args.startedAt + REPOSITORY_SUMMARY_REFRESH_INTERVAL_MS,
    lifecycle: {
      state: "running",
      source: "repository_inventory",
      snapshotId: args.snapshotId,
      startedAt: args.startedAt,
    },
  });
  await bumpRepositorySummaryDirectoryRevision(ctx, args.userId);
}

export async function releaseRepositorySummaryInventoryObservation(
  ctx: MutationCtx,
  args: {
    vaultId: Id<"vaults">;
    snapshotId: Id<"vaultRepositoryInventorySnapshots">;
  },
): Promise<void> {
  const summary = await readRepositorySummary(ctx, args.vaultId);
  if (
    summary === null ||
    (summary.lifecycle.state !== "running" && summary.lifecycle.state !== "scheduled") ||
    summary.lifecycle.source !== "repository_inventory" ||
    summary.lifecycle.snapshotId !== args.snapshotId
  ) {
    return;
  }
  await ctx.db.patch(summary._id, {
    refreshEligibleAt: Date.now(),
    lifecycle: { state: "idle" },
  });
  await bumpRepositorySummaryDirectoryRevision(ctx, summary.userId);
}

export async function deferRepositorySummaryInventoryObservation(
  ctx: MutationCtx,
  args: {
    vaultId: Id<"vaults">;
    claimedSnapshotId: Id<"vaultRepositoryInventorySnapshots">;
    scheduledSnapshotId: Id<"vaultRepositoryInventorySnapshots">;
    reason: "queue" | "rate_limit";
    retryAt: number;
  },
): Promise<void> {
  const summary = await readRepositorySummary(ctx, args.vaultId);
  if (
    summary === null ||
    summary.lifecycle.state !== "running" ||
    summary.lifecycle.source !== "repository_inventory" ||
    summary.lifecycle.snapshotId !== args.claimedSnapshotId
  ) {
    return;
  }
  await ctx.db.patch(summary._id, {
    refreshEligibleAt: args.retryAt + REPOSITORY_SUMMARY_REFRESH_INTERVAL_MS,
    lifecycle: {
      state: "scheduled",
      source: "repository_inventory",
      snapshotId: args.scheduledSnapshotId,
      scheduledAt: Date.now(),
      wait: { kind: args.reason, retryAt: args.retryAt },
    },
  });
  await bumpRepositorySummaryDirectoryRevision(ctx, summary.userId);
}

export async function failRepositorySummaryInventoryObservation(
  ctx: MutationCtx,
  args: {
    vaultId: Id<"vaults">;
    snapshotId: Id<"vaultRepositoryInventorySnapshots">;
    message: string;
  },
): Promise<void> {
  const summary = await readRepositorySummary(ctx, args.vaultId);
  if (
    summary === null ||
    (summary.lifecycle.state !== "running" && summary.lifecycle.state !== "scheduled") ||
    summary.lifecycle.source !== "repository_inventory" ||
    summary.lifecycle.snapshotId !== args.snapshotId
  ) {
    return;
  }
  const failedAt = Date.now();
  await ctx.db.patch(summary._id, {
    refreshEligibleAt: failedAt + REPOSITORY_SUMMARY_FAILURE_RETRY_MS,
    lifecycle: {
      state: "failed",
      failedAt,
      message: args.message,
    },
  });
  await bumpRepositorySummaryDirectoryRevision(ctx, summary.userId);
}

function sameDefaultBranch(
  left: RepositorySummaryDefaultBranch,
  right: RepositorySummaryDefaultBranch,
): boolean {
  if (left.state !== right.state) {
    return false;
  }
  if (left.state === "unavailable") {
    return true;
  }
  return (
    right.state === "ready" &&
    left.name === right.name &&
    left.headSha === right.headSha &&
    left.checkState === right.checkState
  );
}

async function failRepositorySummaryObservation(
  ctx: MutationCtx,
  args: {
    summary: RepositorySummaryDoc;
    failedAt: number;
    message: string;
  },
): Promise<void> {
  await ctx.db.patch(args.summary._id, {
    refreshEligibleAt: args.failedAt + REPOSITORY_SUMMARY_FAILURE_RETRY_MS,
    lifecycle: {
      state: "failed",
      failedAt: args.failedAt,
      message: args.message,
    },
  });
}

async function markRepositorySummaryUnavailable(
  ctx: MutationCtx,
  args: {
    summary: RepositorySummaryDoc;
    observedAt: number;
  },
): Promise<void> {
  await ctx.db.patch(args.summary._id, {
    refreshEligibleAt: args.observedAt + REPOSITORY_SUMMARY_UNAVAILABLE_RETRY_MS,
    lifecycle: {
      state: "unavailable",
      observedAt: args.observedAt,
      reason: "repository_unavailable",
    },
  });
}

async function publishRepositorySummaryObservation(
  ctx: MutationCtx,
  args: {
    summary: RepositorySummaryDoc;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    repositoryFullName: string;
    defaultBranch: RepositorySummaryDefaultBranch;
    openPullRequestCount: number;
    checkedAt: number;
  },
): Promise<void> {
  const vault = await ctx.db.get(args.vaultId);
  if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
    await failRepositorySummaryObservation(ctx, {
      summary: args.summary,
      failedAt: args.checkedAt,
      message: "Connected repository is unavailable.",
    });
    return;
  }
  const { owner, name } = parseRepositoryFullName(args.repositoryFullName);
  const conflictingVault = await ctx.db
    .query("vaults")
    .withIndex("by_userId_and_owner_and_name", (q) =>
      q.eq("userId", args.userId).eq("owner", owner).eq("name", name),
    )
    .first();
  if (conflictingVault !== null && conflictingVault._id !== vault._id) {
    await failRepositorySummaryObservation(ctx, {
      summary: args.summary,
      failedAt: args.checkedAt,
      message: "Canonical GitHub repository name conflicts with another vault.",
    });
    return;
  }
  const defaultBranch =
    args.defaultBranch.state === "ready" ? args.defaultBranch.name : vault.defaultBranch;
  if (vault.owner !== owner || vault.name !== name || vault.defaultBranch !== defaultBranch) {
    await ctx.db.patch(vault._id, { owner, name, defaultBranch });
  }
  const publishedAt =
    args.summary.publication.state === "complete" &&
    sameDefaultBranch(args.summary.publication.defaultBranch, args.defaultBranch) &&
    args.summary.publication.openPullRequestCount === args.openPullRequestCount
      ? args.summary.publication.publishedAt
      : args.checkedAt;
  await ctx.db.patch(args.summary._id, {
    refreshEligibleAt: args.checkedAt + REPOSITORY_SUMMARY_REFRESH_INTERVAL_MS,
    lifecycle: { state: "idle" },
    publication: {
      state: "complete",
      defaultBranch: args.defaultBranch,
      openPullRequestCount: args.openPullRequestCount,
      publishedAt,
      checkedAt: args.checkedAt,
    },
  });
}

export async function completeRepositorySummaryInventoryObservation(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    snapshotId: Id<"vaultRepositoryInventorySnapshots">;
    repositoryFullName: string;
    defaultBranch: RepositorySummaryDefaultBranch;
    openPullRequestCount: number;
  },
): Promise<void> {
  const summary = await readRepositorySummary(ctx, args.vaultId);
  if (
    summary === null ||
    summary.userId !== args.userId ||
    summary.lifecycle.state !== "running" ||
    summary.lifecycle.source !== "repository_inventory" ||
    summary.lifecycle.snapshotId !== args.snapshotId
  ) {
    return;
  }
  await publishRepositorySummaryObservation(ctx, {
    ...args,
    summary,
    checkedAt: Date.now(),
  });
  await bumpRepositorySummaryDirectoryRevision(ctx, args.userId);
}

function activeBatchObservation(summary: RepositorySummaryDoc, batchId: string): boolean {
  return (
    summary.lifecycle.state === "running" &&
    summary.lifecycle.source === "summary_batch" &&
    summary.lifecycle.batchId === batchId
  );
}

export const completeRepositorySummaryBatch = internalMutation({
  args: {
    userId: id("users"),
    batchId: string(),
    results: array(vRepositorySummaryObservationResult),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    if (args.results.length < 1 || args.results.length > REPOSITORY_SUMMARY_PAGE_SIZE) {
      throw new Error("Repository summary result batch has an invalid size.");
    }
    const checkedAt = Date.now();
    const seenVaultIds = new Set<Id<"vaults">>();
    let changed = false;
    for (const result of args.results) {
      if (seenVaultIds.has(result.vaultId)) {
        throw new Error("Repository summary result batch contains a duplicate vault.");
      }
      seenVaultIds.add(result.vaultId);
      const summary = await readRepositorySummary(ctx, result.vaultId);
      if (
        summary === null ||
        summary.userId !== args.userId ||
        !activeBatchObservation(summary, args.batchId)
      ) {
        continue;
      }
      if (result.state === "unavailable") {
        await markRepositorySummaryUnavailable(ctx, {
          summary,
          observedAt: checkedAt,
        });
        changed = true;
        continue;
      }
      await publishRepositorySummaryObservation(ctx, {
        summary,
        userId: args.userId,
        vaultId: result.vaultId,
        repositoryFullName: result.repositoryFullName,
        defaultBranch: result.defaultBranch,
        openPullRequestCount: result.openPullRequestCount,
        checkedAt,
      });
      changed = true;
    }
    if (changed) {
      await bumpRepositorySummaryDirectoryRevision(ctx, args.userId);
    }
    return null;
  },
});

async function transitionRepositorySummaryBatchToFailed(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    batchId: string;
    vaultIds: readonly Id<"vaults">[];
    message: string;
    workpoolJobId?: string;
  },
): Promise<void> {
  const failedAt = Date.now();
  let changed = false;
  for (const vaultId of new Set(args.vaultIds)) {
    const summary = await readRepositorySummary(ctx, vaultId);
    if (
      summary === null ||
      summary.userId !== args.userId ||
      (summary.lifecycle.state !== "scheduled" && summary.lifecycle.state !== "running") ||
      summary.lifecycle.source !== "summary_batch" ||
      summary.lifecycle.batchId !== args.batchId ||
      (args.workpoolJobId !== undefined && summary.lifecycle.workpoolJobId !== args.workpoolJobId)
    ) {
      continue;
    }
    await ctx.db.patch(summary._id, {
      refreshEligibleAt: failedAt + REPOSITORY_SUMMARY_FAILURE_RETRY_MS,
      lifecycle: {
        state: "failed",
        failedAt,
        message: args.message,
      },
    });
    changed = true;
  }
  if (changed) {
    await bumpRepositorySummaryDirectoryRevision(ctx, args.userId);
  }
}

export const failRepositorySummaryBatch = internalMutation({
  args: {
    userId: id("users"),
    batchId: string(),
    vaultIds: array(id("vaults")),
    message: string(),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    await transitionRepositorySummaryBatchToFailed(ctx, args);
    return null;
  },
});

export const deferRepositorySummaryBatch = internalMutation({
  args: {
    userId: id("users"),
    batchId: string(),
    vaultIds: array(id("vaults")),
    reason: union(literal("queue"), literal("rate_limit")),
    retryAt: number(),
  },
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const active: RepositorySummaryDoc[] = [];
    for (const vaultId of new Set(args.vaultIds)) {
      const summary = await readRepositorySummary(ctx, vaultId);
      if (
        summary !== null &&
        summary.userId === args.userId &&
        summary.lifecycle.state === "running" &&
        summary.lifecycle.source === "summary_batch" &&
        summary.lifecycle.batchId === args.batchId
      ) {
        active.push(summary);
      }
    }
    if (active.length === 0) {
      return null;
    }
    await enqueueRepositorySummaryBatch(ctx, {
      userId: args.userId,
      summaries: active,
      wait: { kind: args.reason, retryAt: args.retryAt },
    });
    await bumpRepositorySummaryDirectoryRevision(ctx, args.userId);
    return null;
  },
});

export const handleRepositorySummaryBatchComplete = internalMutation({
  args: vOnCompleteArgs(repositorySummaryBatchContext),
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    switch (args.result.kind) {
      case "success":
        await transitionRepositorySummaryBatchToFailed(ctx, {
          ...args.context,
          workpoolJobId: args.workId,
          message: "Repository summary worker completed without publishing its observations.",
        });
        return null;
      case "failed":
        await transitionRepositorySummaryBatchToFailed(ctx, {
          ...args.context,
          workpoolJobId: args.workId,
          message: args.result.error,
        });
        return null;
      case "canceled":
        await transitionRepositorySummaryBatchToFailed(ctx, {
          ...args.context,
          workpoolJobId: args.workId,
          message: "Repository summary worker was canceled.",
        });
        return null;
      default: {
        args.result satisfies never;
        return null;
      }
    }
  },
});
