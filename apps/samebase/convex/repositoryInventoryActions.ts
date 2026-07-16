import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import {
  collectRepositoryInventoryWithRetry,
  createGitHubGraphqlClient,
  GitHubGraphqlRateLimitError,
} from "./githubRepositoryInventory";
import { toErrorMessage } from "./jsonUtils";
import { repositoryInventoryFilterLabelKey } from "../shared/repositoryInventoryFilters";
import {
  REPOSITORY_INVENTORY_LABEL_CHUNK_SIZE,
  REPOSITORY_INVENTORY_STAGE_ITEM_BATCH_SIZE,
  REPOSITORY_INVENTORY_STAGE_LABEL_CHUNK_BATCH_SIZE,
  REPOSITORY_INVENTORY_STAGE_LABEL_FACET_BATCH_SIZE,
  type CollectedRepositoryInventoryItem,
  type RepositoryInventoryLabelChunk,
  type StoredRepositoryInventoryPullRequestLabelFacet,
  type StoredRepositoryInventoryItem,
} from "./repositoryInventoryModel";
import type { RepositoryInventoryWorkerInput } from "./repositoryInventory";
import type { RepositorySummaryDefaultBranch } from "./repositorySummaryModel";

const GITHUB_RATE_LEASE_RENEW_INTERVAL_MS = 30_000;
const GITHUB_REPOSITORY_INVENTORY_DEADLINE_MS = 8 * 60_000;
const GITHUB_REPOSITORY_INVENTORY_MAXIMUM_COST = 500;
const GITHUB_REPOSITORY_INVENTORY_MAXIMUM_REQUEST_COUNT = 250;

class RepositoryInventoryRateDeferredError extends Error {
  constructor(readonly retryAt: number) {
    super("GitHub GraphQL rate budget blocked the active repository inventory crawl.");
    this.name = "RepositoryInventoryRateDeferredError";
  }
}

function chunk<Value>(values: readonly Value[], size: number): Value[][] {
  const chunks: Value[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function prepareRepositoryInventoryForStorage(args: {
  items: readonly CollectedRepositoryInventoryItem[];
  vaultId: Id<"vaults">;
  snapshotId: Id<"vaultRepositoryInventorySnapshots">;
}): {
  items: StoredRepositoryInventoryItem[];
  labelChunks: RepositoryInventoryLabelChunk[];
  labelFacets: StoredRepositoryInventoryPullRequestLabelFacet[];
  noLabelPullRequestCount: number;
} {
  const storedItems: StoredRepositoryInventoryItem[] = [];
  const labelChunks: RepositoryInventoryLabelChunk[] = [];
  const labelFacets = new Map<string, { name: string; color?: string; pullRequestCount: number }>();
  let noLabelPullRequestCount = 0;
  for (const item of args.items) {
    if (item.kind === "branch") {
      storedItems.push({
        ...item,
        vaultId: args.vaultId,
        snapshotId: args.snapshotId,
      });
      continue;
    }
    const { labels, ...pullRequest } = item;
    const labelsByKey = new Map<string, (typeof labels)[number]>();
    for (const label of labels) {
      const labelKey = repositoryInventoryFilterLabelKey(label.name);
      if (labelKey.length > 0 && !labelsByKey.has(labelKey)) {
        labelsByKey.set(labelKey, label);
      }
    }
    if (labelsByKey.size === 0) {
      noLabelPullRequestCount += 1;
    }
    for (const [labelKey, label] of labelsByKey) {
      const facet = labelFacets.get(labelKey);
      if (facet) {
        facet.pullRequestCount += 1;
      } else {
        labelFacets.set(labelKey, {
          name: label.name,
          color: label.color,
          pullRequestCount: 1,
        });
      }
    }
    const chunks = chunk(labels, REPOSITORY_INVENTORY_LABEL_CHUNK_SIZE);
    storedItems.push({
      ...pullRequest,
      vaultId: args.vaultId,
      snapshotId: args.snapshotId,
      labelChunkCount: chunks.length,
    });
    labelChunks.push(
      ...chunks.map((chunkLabels, chunkIndex) => ({
        vaultId: args.vaultId,
        snapshotId: args.snapshotId,
        rowKey: item.rowKey,
        chunkIndex,
        labels: chunkLabels,
      })),
    );
  }
  return {
    items: storedItems,
    labelChunks,
    labelFacets: Array.from(labelFacets, ([labelKey, facet]) => ({
      vaultId: args.vaultId,
      snapshotId: args.snapshotId,
      labelKey,
      sortKey: labelKey,
      ...facet,
    })).sort(
      (left, right) =>
        left.sortKey.localeCompare(right.sortKey) || left.labelKey.localeCompare(right.labelKey),
    ),
    noLabelPullRequestCount,
  };
}

function repositorySummaryDefaultBranch(
  inventory: Awaited<ReturnType<typeof collectRepositoryInventoryWithRetry>>,
): RepositorySummaryDefaultBranch {
  if (inventory.defaultBranch === null) {
    return {
      state: "unavailable",
      reason: "repository_has_no_default_branch",
    };
  }
  const defaultBranch = inventory.items.find(
    (item) => item.kind === "branch" && item.isDefault && item.name === inventory.defaultBranch,
  );
  if (defaultBranch?.kind !== "branch") {
    throw new Error("GitHub repository inventory omitted its default branch.");
  }
  return {
    state: "ready",
    name: defaultBranch.name,
    headSha: defaultBranch.headCommit.sha,
    checkState:
      inventory.defaultBranchCheckState ??
      (() => {
        throw new Error("GitHub repository inventory omitted its default branch check state.");
      })(),
  };
}

export const runRepositoryInventoryRefresh = internalAction({
  args: {
    vaultId: v.id("vaults"),
    snapshotId: v.id("vaultRepositoryInventorySnapshots"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const input: RepositoryInventoryWorkerInput = await ctx.runMutation(
      internal.repositoryInventory.claimRepositoryInventoryRefresh,
      args,
    );
    if (input.kind === "cancel") {
      return null;
    }

    const observationLeaseGroupId = crypto.randomUUID();
    const observationLeaseAcquired = await ctx.runMutation(
      internal.githubObservationActionLease.acquire,
      {
        userId: input.userId,
        leaseGroupId: observationLeaseGroupId,
        vaultIds: [input.vaultId],
      },
    );
    if (!observationLeaseAcquired) {
      await ctx.runMutation(internal.repositoryInventory.failRepositoryInventoryRefresh, {
        vaultId: input.vaultId,
        snapshotId: input.snapshotId,
        message: "Repository inventory stopped before accessing GitHub.",
      });
      return null;
    }

    let githubAccountId: number | undefined;
    let rateBudgetLeaseId: string | undefined;
    let rateBudgetLeaseOwned = false;
    let crawlStartedAt = Date.now();
    let graphqlClient: ReturnType<typeof createGitHubGraphqlClient> | undefined;
    try {
      const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId: input.userId,
        kind: "github",
      });
      if (githubConnection?.kind !== "github") {
        throw new Error("GitHub is not connected.");
      }
      const claimedGithubAccountId = githubConnection.githubAccountId;
      githubAccountId = claimedGithubAccountId;
      const claimedRateBudgetLeaseId = crypto.randomUUID();
      rateBudgetLeaseId = claimedRateBudgetLeaseId;
      const budgetClaim = await ctx.runMutation(
        internal.githubGraphqlRateBudget.claimGitHubGraphqlRateBudget,
        {
          githubAccountId: claimedGithubAccountId,
          leaseId: claimedRateBudgetLeaseId,
          owner: {
            kind: "repository_inventory",
            vaultId: input.vaultId,
            snapshotId: input.snapshotId,
          },
          estimatedCost: input.estimatedCrawlCost,
        },
      );
      if (budgetClaim.kind === "wait") {
        await ctx.runMutation(internal.repositoryInventory.deferRepositoryInventoryRefresh, {
          vaultId: input.vaultId,
          snapshotId: input.snapshotId,
          reason: budgetClaim.reason,
          retryAt: budgetClaim.retryAt,
        });
        return null;
      }
      rateBudgetLeaseOwned = true;
      crawlStartedAt = Date.now();

      let rateLeaseRenewedAt = Date.now();
      const renewRateLeaseIfNeeded = async (force = false): Promise<void> => {
        const now = Date.now();
        if (!force && now - rateLeaseRenewedAt < GITHUB_RATE_LEASE_RENEW_INTERVAL_MS) {
          return;
        }
        if (!rateBudgetLeaseOwned) {
          return;
        }
        const budgetRenewal = await ctx.runMutation(
          internal.githubGraphqlRateBudget.renewGitHubGraphqlRateBudgetLease,
          {
            githubAccountId: claimedGithubAccountId,
            leaseId: claimedRateBudgetLeaseId,
          },
        );
        if (budgetRenewal.kind === "rate_limited") {
          throw new RepositoryInventoryRateDeferredError(budgetRenewal.retryAt);
        }
        if (budgetRenewal.kind === "lost") {
          throw new Error("Repository inventory no longer owns its GitHub budget.");
        }
        rateLeaseRenewedAt = now;
      };

      const client = createGitHubGraphqlClient({
        credential: githubConnection.auth.credential,
        limits: {
          deadlineAt: Date.now() + GITHUB_REPOSITORY_INVENTORY_DEADLINE_MS,
          maximumCost: GITHUB_REPOSITORY_INVENTORY_MAXIMUM_COST,
          maximumRequestCount: GITHUB_REPOSITORY_INVENTORY_MAXIMUM_REQUEST_COUNT,
        },
      });
      graphqlClient = client;
      const providerCollectionStartedAt = Date.now();
      const inventory = await collectRepositoryInventoryWithRetry({
        repositoryNodeId: input.repositoryNodeId,
        expectedRepositoryDatabaseId: input.githubRepositoryId,
        requestGraphql: async (query, variables) => {
          await renewRateLeaseIfNeeded();
          return await client.request(query, variables);
        },
        requestGraphqlPartial: async (query, variables) => {
          await renewRateLeaseIfNeeded();
          return await client.requestPartial(query, variables);
        },
      });
      const observedAt = Date.now();
      const crawlDurationMs = observedAt - providerCollectionStartedAt;
      if (inventory.repositoryDatabaseId !== input.githubRepositoryId) {
        throw new Error("GitHub repository identity does not match the connected vault.");
      }
      const summaryDefaultBranch = repositorySummaryDefaultBranch(inventory);

      await renewRateLeaseIfNeeded(true);
      const usage = client.getUsage();
      if (usage === undefined) {
        throw new Error("GitHub GraphQL accounting was not collected.");
      }
      await ctx.runMutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetLease, {
        githubAccountId: claimedGithubAccountId,
        leaseId: claimedRateBudgetLeaseId,
        durationMs: Date.now() - crawlStartedAt,
        outcome: {
          kind: "success",
          usage,
        },
      });
      rateBudgetLeaseOwned = false;

      const unchanged = await ctx.runMutation(
        internal.repositoryInventory.completeUnchangedRepositoryInventoryRefresh,
        {
          vaultId: input.vaultId,
          snapshotId: input.snapshotId,
          observedAt,
          fingerprint: inventory.fingerprint,
          crawlCost: usage.cost,
          crawlRequestCount: client.getRequestCount(),
          crawlDurationMs,
          summaryDefaultBranch,
          summaryOpenPullRequestCount: inventory.pullRequestCount,
        },
      );
      if (unchanged) {
        return null;
      }

      const storedInventory = prepareRepositoryInventoryForStorage({
        items: inventory.items,
        vaultId: input.vaultId,
        snapshotId: input.snapshotId,
      });
      for (const items of chunk(
        storedInventory.items,
        REPOSITORY_INVENTORY_STAGE_ITEM_BATCH_SIZE,
      )) {
        await ctx.runMutation(internal.repositoryInventory.stageRepositoryInventoryItems, {
          vaultId: input.vaultId,
          snapshotId: input.snapshotId,
          items,
        });
      }
      for (const labelChunks of chunk(
        storedInventory.labelChunks,
        REPOSITORY_INVENTORY_STAGE_LABEL_CHUNK_BATCH_SIZE,
      )) {
        await ctx.runMutation(internal.repositoryInventory.stageRepositoryInventoryLabelChunks, {
          vaultId: input.vaultId,
          snapshotId: input.snapshotId,
          labelChunks,
        });
      }
      for (const facets of chunk(
        storedInventory.labelFacets,
        REPOSITORY_INVENTORY_STAGE_LABEL_FACET_BATCH_SIZE,
      )) {
        await ctx.runMutation(internal.repositoryInventory.stageRepositoryInventoryLabelFacets, {
          vaultId: input.vaultId,
          snapshotId: input.snapshotId,
          facets,
        });
      }

      await ctx.runMutation(
        internal.repositoryInventory.handoffCompletedRepositoryInventorySnapshot,
        {
          vaultId: input.vaultId,
          snapshotId: input.snapshotId,
          observedAt,
          repositoryNodeId: inventory.repositoryId,
          repositoryFullName: inventory.repositoryFullName,
          defaultBranch: inventory.defaultBranch,
          branchCount: inventory.branchCount,
          pullRequestCount: inventory.pullRequestCount,
          labelCount: inventory.items.reduce(
            (count, item) => count + (item.kind === "pull_request" ? item.labelCount : 0),
            0,
          ),
          labelChunkCount: storedInventory.labelChunks.length,
          labelFacetCount: storedInventory.labelFacets.length,
          noLabelPullRequestCount: storedInventory.noLabelPullRequestCount,
          fingerprint: inventory.fingerprint,
          crawlCost: usage.cost,
          summaryDefaultBranch,
        },
      );
      return null;
    } catch (error) {
      if (
        error instanceof RepositoryInventoryRateDeferredError &&
        githubAccountId !== undefined &&
        rateBudgetLeaseId !== undefined &&
        rateBudgetLeaseOwned
      ) {
        await ctx.runMutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetLease, {
          githubAccountId,
          leaseId: rateBudgetLeaseId,
          durationMs: Date.now() - crawlStartedAt,
          outcome: {
            kind: "failed",
            usage: graphqlClient?.getUsage(),
          },
        });
        rateBudgetLeaseOwned = false;
        await ctx.runMutation(internal.repositoryInventory.deferRepositoryInventoryRefresh, {
          vaultId: input.vaultId,
          snapshotId: input.snapshotId,
          reason: "rate_limit",
          retryAt: error.retryAt,
        });
        return null;
      }
      if (
        error instanceof GitHubGraphqlRateLimitError &&
        githubAccountId !== undefined &&
        rateBudgetLeaseId !== undefined &&
        rateBudgetLeaseOwned
      ) {
        const result = await ctx.runMutation(
          internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetLease,
          {
            githubAccountId,
            leaseId: rateBudgetLeaseId,
            durationMs: Date.now() - crawlStartedAt,
            outcome: {
              kind: "rate_limited",
              limitKind: error.limitKind,
              retryAt: error.retryAt,
              usage: error.usage,
            },
          },
        );
        rateBudgetLeaseOwned = false;
        await ctx.runMutation(internal.repositoryInventory.deferRepositoryInventoryRefresh, {
          vaultId: input.vaultId,
          snapshotId: input.snapshotId,
          reason: "rate_limit",
          retryAt: result.retryAt ?? error.retryAt,
        });
        return null;
      }
      if (
        githubAccountId !== undefined &&
        rateBudgetLeaseId !== undefined &&
        rateBudgetLeaseOwned
      ) {
        await ctx.runMutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetLease, {
          githubAccountId,
          leaseId: rateBudgetLeaseId,
          durationMs: Date.now() - crawlStartedAt,
          outcome: {
            kind: "failed",
            usage: graphqlClient?.getUsage(),
          },
        });
        rateBudgetLeaseOwned = false;
      }
      await ctx.runMutation(internal.repositoryInventory.failRepositoryInventoryRefresh, {
        vaultId: input.vaultId,
        snapshotId: input.snapshotId,
        message: toErrorMessage(error),
      });
      throw error;
    } finally {
      await ctx.runMutation(internal.githubObservationActionLease.release, {
        leaseGroupId: observationLeaseGroupId,
      });
    }
  },
});
