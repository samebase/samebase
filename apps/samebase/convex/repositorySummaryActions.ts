import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  createGitHubGraphqlClient,
  GitHubGraphqlRateLimitError,
} from "./githubRepositoryInventory";
import { collectGitHubRepositorySummaries } from "./githubRepositorySummary";
import { toErrorMessage } from "./jsonUtils";
import type {
  RepositorySummaryObservationResult,
  RepositorySummaryWorkerInput,
} from "./repositorySummaryModel";

export const runRepositorySummaryBatch = internalAction({
  args: {
    userId: v.id("users"),
    batchId: v.string(),
    vaultIds: v.array(v.id("vaults")),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const input: RepositorySummaryWorkerInput = await ctx.runMutation(
      internal.repositorySummary.claimRepositorySummaryBatch,
      args,
    );
    if (input.state === "cancel") {
      return null;
    }

    const observationLeaseGroupId = crypto.randomUUID();
    const observationLeaseAcquired = await ctx.runMutation(
      internal.githubObservationActionLease.acquire,
      {
        userId: input.userId,
        leaseGroupId: observationLeaseGroupId,
        vaultIds: input.repositories.map((repository) => repository.vaultId),
      },
    );
    if (!observationLeaseAcquired) {
      await ctx.runMutation(internal.repositorySummary.failRepositorySummaryBatch, {
        userId: input.userId,
        batchId: input.batchId,
        vaultIds: input.repositories.map((repository) => repository.vaultId),
        message: "Repository summary stopped before accessing GitHub.",
      });
      return null;
    }

    let githubAccountId: number | undefined;
    let rateBudgetLeaseId: string | undefined;
    let rateBudgetLeaseOwned = false;
    let requestStartedAt = Date.now();
    let graphqlClient: ReturnType<typeof createGitHubGraphqlClient> | undefined;
    try {
      const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId: input.userId,
        kind: "github",
      });
      if (githubConnection?.kind !== "github") {
        throw new Error("GitHub is not connected.");
      }
      githubAccountId = githubConnection.githubAccountId;
      const leaseId = crypto.randomUUID();
      rateBudgetLeaseId = leaseId;
      const budgetClaim = await ctx.runMutation(
        internal.githubGraphqlRateBudget.claimGitHubGraphqlRateBudget,
        {
          githubAccountId,
          leaseId,
          owner: {
            kind: "repository_summary_batch",
            userId: input.userId,
            batchId: input.batchId,
          },
          estimatedCost: 1,
        },
      );
      if (budgetClaim.kind === "wait") {
        await ctx.runMutation(internal.repositorySummary.deferRepositorySummaryBatch, {
          userId: input.userId,
          batchId: input.batchId,
          vaultIds: input.repositories.map((repository) => repository.vaultId),
          reason: budgetClaim.reason,
          retryAt: budgetClaim.retryAt,
        });
        return null;
      }
      rateBudgetLeaseOwned = true;
      requestStartedAt = Date.now();
      const client = createGitHubGraphqlClient({
        credential: githubConnection.auth.credential,
      });
      graphqlClient = client;
      const collected = await collectGitHubRepositorySummaries({
        repositories: input.repositories,
        requestGraphqlPartial: client.requestPartial,
      });
      const observedAt = Date.now();
      const usage = client.getUsage();
      if (usage === undefined) {
        throw new Error("GitHub GraphQL accounting was not collected.");
      }
      await ctx.runMutation(internal.githubGraphqlRateBudget.finishGitHubGraphqlRateBudgetLease, {
        githubAccountId,
        leaseId,
        durationMs: Date.now() - requestStartedAt,
        outcome: { kind: "success", usage },
      });
      rateBudgetLeaseOwned = false;

      const results: RepositorySummaryObservationResult[] = collected.map((summary, index) => {
        const repository = input.repositories[index];
        return summary.state === "unavailable"
          ? {
              state: "unavailable",
              vaultId: repository.vaultId,
            }
          : {
              state: "ready",
              vaultId: repository.vaultId,
              repositoryNodeId: repository.repositoryNodeId,
              repositoryFullName: summary.repositoryFullName,
              defaultBranch: summary.defaultBranch,
              openPullRequestCount: summary.openPullRequestCount,
            };
      });
      await ctx.runMutation(internal.repositorySummary.completeRepositorySummaryBatch, {
        userId: input.userId,
        batchId: input.batchId,
        observedAt,
        results,
      });
      return null;
    } catch (error) {
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
            durationMs: Date.now() - requestStartedAt,
            outcome: {
              kind: "rate_limited",
              limitKind: error.limitKind,
              retryAt: error.retryAt,
              usage: error.usage,
            },
          },
        );
        rateBudgetLeaseOwned = false;
        await ctx.runMutation(internal.repositorySummary.deferRepositorySummaryBatch, {
          userId: input.userId,
          batchId: input.batchId,
          vaultIds: input.repositories.map((repository) => repository.vaultId),
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
          durationMs: Date.now() - requestStartedAt,
          outcome: {
            kind: "failed",
            usage: graphqlClient?.getUsage(),
          },
        });
        rateBudgetLeaseOwned = false;
      }
      await ctx.runMutation(internal.repositorySummary.failRepositorySummaryBatch, {
        userId: input.userId,
        batchId: input.batchId,
        vaultIds: input.repositories.map((repository) => repository.vaultId),
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
