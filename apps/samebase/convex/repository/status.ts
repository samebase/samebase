"use node";

import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { resolveGitHubAppAccess } from "../githubAppAccess";
import { fetchGitHubRepoIdentity } from "../githubRepoApi";
import { listOpenPullRequestsForUser } from "../repositoryPullRequests";
import { findRepositoryByReference } from "../toolRuntime/mcpResolution";
import {
  getRepositoryStatusContract,
  REPOSITORY_STATUS_PULL_REQUEST_LIMIT,
  type RepositoryStatus,
} from "./contracts/getRepositoryStatus";
import type { UserRepositoryResult } from "./contracts/getUserRepositories";
import { readRepositoryStacks } from "./alchemyState";
import { isSamebaseManagedProviderPlan } from "./provisioningPlan";
import {
  buildRepositoryAttention,
  buildRepositorySetupStackStatus,
  buildRepositoryStacksStatus,
  type RepositoryObservations,
} from "./repositoryStatus";
import { isLiveConnectedRepository } from "./state";

const { id } = v;

/** GitHub's live default branch, which can differ from the default branch recorded at connect. */
async function readGitHubDefaultBranch(
  ctx: ActionCtx,
  args: { userId: Id<"users">; repositoryId: Id<"repositories"> },
): Promise<string> {
  const repository = await ctx.runQuery(internal.repository.records.getByIdForUser, {
    userId: args.userId,
    repositoryId: args.repositoryId,
  });
  if (!isLiveConnectedRepository(repository)) {
    throw new Error("Repository not found.");
  }
  const { octokit, githubOwnerLogin } = await resolveGitHubAppAccess(ctx, {
    userId: args.userId,
    target: { kind: "repository", repositoryId: args.repositoryId },
  });
  const identity = await fetchGitHubRepoIdentity({
    octokit,
    owner: githubOwnerLogin,
    repo: repository.githubRepositoryName,
    expectedRepoId: repository.githubRepositoryDatabaseId,
  });
  return identity.defaultBranch;
}

/**
Reads what the repository overview shows: the stacks of the repository in the team's Alchemy state
store, and the GitHub read of the pull request page. Unlike the overview, that read takes the head
of GitHub's live default branch instead of the recorded one. A read that fails becomes unavailable
or unreadable facts, so one outage does not hide the other. Nothing here depends on an attachment
or a creation plan: only `setupStack` needs a plan, the one of a repository_actions repository.
*/
export async function readRepositoryStatusForUser(
  ctx: ActionCtx,
  args: { userId: Id<"users">; repository: UserRepositoryResult },
): Promise<RepositoryStatus> {
  const { repository } = args;
  if (!repository.hasConnectedGitHubRepository) {
    throw new ConvexError(
      `${repository.githubRepositoryFullName} has no connected GitHub repository yet. Call repository_list until its source setup is ready.`,
    );
  }
  if (repository.deletion.state !== "not_deleting") {
    throw new ConvexError(
      `${repository.githubRepositoryFullName} is being removed from Samebase, so it has no status.`,
    );
  }
  const userId = args.userId;
  const repositoryId = repository.repositoryId;

  const [pullRequests, store] = await Promise.all([
    readGitHubDefaultBranch(ctx, { userId, repositoryId })
      .then(async (defaultBranch) => ({
        state: "available" as const,
        page: await listOpenPullRequestsForUser(ctx, {
          userId,
          repositoryId,
          defaultBranch: { source: "github", name: defaultBranch },
          first: REPOSITORY_STATUS_PULL_REQUEST_LIMIT,
          after: null,
        }),
      }))
      .catch(() => ({ state: "unavailable" as const })),
    readRepositoryStacks(ctx, { userId, repositoryId }).catch(() => null),
  ]);

  const plan = repository.providerPlan;
  const observations: RepositoryObservations = {
    pullRequests,
    stacks: buildRepositoryStacksStatus({
      read: store,
      headCommit:
        pullRequests.state === "available"
          ? (pullRequests.page.repository?.defaultBranch?.headCommitOid ?? null)
          : null,
    }),
    setupStack:
      plan && !isSamebaseManagedProviderPlan(plan)
        ? buildRepositorySetupStackStatus({
            read: store,
            repository: repository.githubRepositoryFullName,
          })
        : null,
  };
  return {
    ...observations,
    attention: buildRepositoryAttention({ repository, observations }),
  };
}

/** The Node read behind repository:getStatus, which runs in the default runtime. */
export const readForUser = internalAction({
  args: {
    userId: id("users"),
    repositoryId: id("repositories"),
  },
  returns: getRepositoryStatusContract.returns,
  handler: async (ctx, args): Promise<RepositoryStatus> => {
    const repositories: UserRepositoryResult[] = await ctx.runQuery(
      internal.repository.listForUser,
      { userId: args.userId },
    );
    return await readRepositoryStatusForUser(ctx, {
      userId: args.userId,
      repository: findRepositoryByReference(repositories, args.repositoryId),
    });
  },
});
