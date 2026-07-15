import { Octokit } from "@octokit/rest";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import {
  collectRepositoryInventoryWithRetry,
  createGitHubGraphqlClient,
  GitHubGraphqlRateLimitError,
  resolveGitHubRepositoryNodeId,
} from "./githubRepositoryInventory";
import { toErrorMessage } from "./jsonUtils";
import {
  REPOSITORY_INVENTORY_LABEL_CHUNK_SIZE,
  REPOSITORY_INVENTORY_MAX_LABELS_PER_PULL_REQUEST,
  REPOSITORY_INVENTORY_STAGE_ITEM_BATCH_SIZE,
  REPOSITORY_INVENTORY_STAGE_LABEL_CHUNK_BATCH_SIZE,
  repositoryInventoryBranchLookupKey,
  repositoryInventoryPullRequestBranchLookupKey,
  repositoryInventoryPullRequestRowKey,
  type RepositoryInventoryItem,
  type RepositoryInventoryLabelChunk,
  type StoredRepositoryInventoryItem,
} from "./repositoryInventoryModel";
import type { RepositoryInventoryWorkerInput } from "./repositoryInventory";

const REPOSITORY_INVENTORY_LEASE_REFRESH_INTERVAL_MS = 30_000;
const GITHUB_IDENTITY_TIMEOUT_MS = 10_000;

class RepositoryInventoryRateDeferredError extends Error {
  constructor(readonly retryAt: number) {
    super("GitHub GraphQL rate budget blocked the active repository inventory crawl.");
    this.name = "RepositoryInventoryRateDeferredError";
  }
}

type GitHubConnection = Extract<Doc<"providerConnections">, { kind: "github" }>;

async function fetchGitHubAccountIdentity(credential: string): Promise<{
  githubAccountId: number;
  username: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_IDENTITY_TIMEOUT_MS);
  try {
    const response = await new Octokit({
      auth: credential,
      userAgent: "samebase-app",
    }).rest.users.getAuthenticated({ request: { signal: controller.signal } });
    const githubAccountId = response.data.id;
    const username = response.data.login;
    if (!Number.isSafeInteger(githubAccountId) || githubAccountId <= 0 || !username) {
      throw new Error("GitHub returned an invalid authenticated account identity.");
    }
    return { githubAccountId, username };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveGitHubConnectionWithAccountId(
  ctx: Pick<ActionCtx, "runMutation" | "runQuery">,
  userId: Id<"users">,
): Promise<{ connection: GitHubConnection; githubAccountId: number }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const connection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId,
      kind: "github",
    });
    if (connection?.kind !== "github") {
      throw new Error("GitHub is not connected.");
    }
    if (connection.githubAccountId !== undefined) {
      return { connection, githubAccountId: connection.githubAccountId };
    }

    const identity = await fetchGitHubAccountIdentity(connection.auth.credential);
    const persisted = await ctx.runMutation(
      internal.providerConnections.setGithubIdentityIfUnchanged,
      {
        providerConnectionId: connection._id,
        expectedUpdatedAt: connection.updatedAt,
        ...identity,
      },
    );
    if (persisted) {
      return { connection, githubAccountId: identity.githubAccountId };
    }
  }

  throw new Error("GitHub connection changed while resolving its account identity.");
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function prepareRepositoryInventoryForStorage(items: readonly RepositoryInventoryItem[]): {
  items: StoredRepositoryInventoryItem[];
  labelChunks: RepositoryInventoryLabelChunk[];
} {
  const storedItems: StoredRepositoryInventoryItem[] = [];
  const labelChunks: RepositoryInventoryLabelChunk[] = [];
  for (const item of items) {
    if (item.kind === "branch") {
      storedItems.push({
        ...item,
        branchLookupKey: repositoryInventoryBranchLookupKey(item.name),
      });
      continue;
    }
    const { labels, ...pullRequest } = item;
    if (labels.length > REPOSITORY_INVENTORY_MAX_LABELS_PER_PULL_REQUEST) {
      throw new Error("Repository inventory pull request labels exceed the publication limit.");
    }
    const chunks = chunk(labels, REPOSITORY_INVENTORY_LABEL_CHUNK_SIZE);
    storedItems.push({
      ...pullRequest,
      branchLookupKey: item.canOpenInSamebase
        ? repositoryInventoryPullRequestBranchLookupKey(item.headRefName)
        : repositoryInventoryPullRequestRowKey(item.nodeId),
      labelChunkCount: chunks.length,
    });
    labelChunks.push(
      ...chunks.map((chunkLabels, chunkIndex) => ({
        userId: item.userId,
        vaultId: item.vaultId,
        generation: item.generation,
        rowKey: item.rowKey,
        chunkIndex,
        labels: chunkLabels,
      })),
    );
  }
  return { items: storedItems, labelChunks };
}

export const runRepositoryInventoryRefresh = internalAction({
  args: {
    vaultId: v.id("vaults"),
    generation: v.number(),
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

    let githubAccountId: number | undefined;
    let rateBudgetLeaseId: string | undefined;
    let rateBudgetLeaseOwned = false;
    let crawlStartedAt = Date.now();
    let graphqlClient: ReturnType<typeof createGitHubGraphqlClient> | undefined;
    try {
      const resolvedConnection = await resolveGitHubConnectionWithAccountId(ctx, input.userId);
      const githubConnection = resolvedConnection.connection;
      const claimedGithubAccountId = resolvedConnection.githubAccountId;
      githubAccountId = claimedGithubAccountId;
      const claimedRateBudgetLeaseId = crypto.randomUUID();
      rateBudgetLeaseId = claimedRateBudgetLeaseId;
      const budgetClaim = await ctx.runMutation(
        internal.githubGraphqlRateBudget.claimGitHubGraphqlRateBudget,
        {
          githubAccountId: claimedGithubAccountId,
          leaseId: claimedRateBudgetLeaseId,
          vaultId: input.vaultId,
          generation: input.generation,
        },
      );
      if (budgetClaim.kind === "wait") {
        await ctx.runMutation(internal.repositoryInventory.deferRepositoryInventoryRefresh, {
          vaultId: input.vaultId,
          generation: input.generation,
          reason: budgetClaim.reason,
          retryAt: budgetClaim.retryAt,
        });
        return null;
      }
      rateBudgetLeaseOwned = true;
      crawlStartedAt = Date.now();

      let leaseRefreshedAt = Date.now();
      const refreshLeaseIfNeeded = async (force = false): Promise<void> => {
        const now = Date.now();
        const extendLease =
          force || now - leaseRefreshedAt >= REPOSITORY_INVENTORY_LEASE_REFRESH_INTERVAL_MS;
        if (extendLease) {
          const retained = await ctx.runMutation(
            internal.repositoryInventory.refreshRepositoryInventoryLease,
            {
              vaultId: input.vaultId,
              generation: input.generation,
            },
          );
          if (!retained) {
            throw new Error("Repository inventory refresh no longer owns its lease.");
          }
        }
        if (rateBudgetLeaseOwned) {
          const budgetRenewal = await ctx.runMutation(
            internal.githubGraphqlRateBudget.renewGitHubGraphqlRateBudgetLease,
            {
              githubAccountId: claimedGithubAccountId,
              leaseId: claimedRateBudgetLeaseId,
              extendLease,
            },
          );
          if (budgetRenewal.kind === "rate_limited") {
            throw new RepositoryInventoryRateDeferredError(budgetRenewal.retryAt);
          }
          if (budgetRenewal.kind === "lost") {
            throw new Error("Repository inventory refresh no longer owns its GitHub budget.");
          }
        }
        if (extendLease) {
          leaseRefreshedAt = now;
        }
      };
      const client = createGitHubGraphqlClient({
        credential: githubConnection.auth.credential,
      });
      graphqlClient = client;
      const repositoryNodeId =
        input.repositoryNodeId ??
        (await resolveGitHubRepositoryNodeId({
          credential: githubConnection.auth.credential,
          repositoryDatabaseId: input.githubRepositoryId,
        }));

      const inventory = await collectRepositoryInventoryWithRetry({
        context: {
          userId: input.userId,
          vaultId: input.vaultId,
          generation: input.generation,
          syncedAt: Date.now(),
        },
        repositoryNodeId,
        expectedRepositoryDatabaseId: input.githubRepositoryId,
        requestGraphql: async (query, variables) => {
          await refreshLeaseIfNeeded();
          return await client.request(query, variables);
        },
      });
      if (inventory.repositoryDatabaseId !== input.githubRepositoryId) {
        throw new Error("GitHub repository identity does not match the connected vault.");
      }

      await refreshLeaseIfNeeded(true);
      const usage = client.getUsage();
      if (usage === undefined) {
        throw new Error("GitHub GraphQL accounting was not collected.");
      }
      await ctx.runMutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetCrawl, {
        githubAccountId: claimedGithubAccountId,
        leaseId: claimedRateBudgetLeaseId,
        durationMs: Date.now() - crawlStartedAt,
        outcome: {
          kind: "success",
          usage,
        },
      });
      rateBudgetLeaseOwned = false;
      const storedInventory = prepareRepositoryInventoryForStorage(inventory.items);
      const unchanged = await ctx.runMutation(
        internal.repositoryInventory.completeUnchangedRepositoryInventoryRefresh,
        {
          vaultId: input.vaultId,
          generation: input.generation,
          fingerprint: inventory.fingerprint,
        },
      );
      if (unchanged) {
        return null;
      }
      for (const items of chunk(
        storedInventory.items,
        REPOSITORY_INVENTORY_STAGE_ITEM_BATCH_SIZE,
      )) {
        await refreshLeaseIfNeeded();
        await ctx.runMutation(internal.repositoryInventory.stageRepositoryInventoryItems, {
          vaultId: input.vaultId,
          generation: input.generation,
          items,
        });
      }
      for (const labelChunks of chunk(
        storedInventory.labelChunks,
        REPOSITORY_INVENTORY_STAGE_LABEL_CHUNK_BATCH_SIZE,
      )) {
        await refreshLeaseIfNeeded();
        await ctx.runMutation(internal.repositoryInventory.stageRepositoryInventoryLabelChunks, {
          vaultId: input.vaultId,
          generation: input.generation,
          labelChunks,
        });
      }
      await refreshLeaseIfNeeded(true);
      await ctx.runMutation(internal.repositoryInventory.publishRepositoryInventoryGeneration, {
        vaultId: input.vaultId,
        generation: input.generation,
        repositoryNodeId: inventory.repositoryId,
        repositoryFullName: inventory.repositoryFullName,
        itemCount: inventory.items.length,
        branchCount: inventory.branchCount,
        pullRequestCount: inventory.pullRequestCount,
        labelChunkCount: storedInventory.labelChunks.length,
        fingerprint: inventory.fingerprint,
      });
      return null;
    } catch (error) {
      if (
        error instanceof RepositoryInventoryRateDeferredError &&
        githubAccountId !== undefined &&
        rateBudgetLeaseId !== undefined &&
        rateBudgetLeaseOwned
      ) {
        await ctx.runMutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetCrawl, {
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
          generation: input.generation,
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
          internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetCrawl,
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
          generation: input.generation,
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
        await ctx.runMutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetCrawl, {
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
        generation: input.generation,
        message: toErrorMessage(error),
      });
      throw error;
    }
  },
});
