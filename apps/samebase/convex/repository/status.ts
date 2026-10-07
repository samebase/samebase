"use node";

import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { listOpenPullRequestsForUser } from "../repositoryPullRequests";
import { findRepositoryByReference } from "../toolRuntime/mcpResolution";
import {
  getRepositoryStatusContract,
  REPOSITORY_STATUS_PULL_REQUEST_LIMIT,
  type RepositoryStatus,
} from "./contracts/getRepositoryStatus";
import type { UserRepositoryResult } from "./contracts/getUserRepositories";
import {
  observeCloudflareWorkerBuildsForUser,
  observeCloudflareWorkerConvexBuildAccessForUser,
  observeCloudflareWorkersForUser,
  observeConvexProjectsForUser,
  readGitHubDefaultBranchForUser,
} from "./providerObservations";
import { isSamebaseManagedProviderPlan } from "./provisioningPlan";
import { getPullRequestResourcesForUser } from "./pullRequestResources";
import { buildRepositoryAttention, type RepositoryObservations } from "./repositoryStatus";
import { readSetupStatus } from "./setupOutput";
import type { RepositorySetupStack } from "./setupOutputModel";

const { id } = v;

/**
Reads what the repository overview shows with the overview's own reads: the four provider
observations, the two pull request reads, and for a repository_actions plan the setup status. Unlike
the overview, the pull request page reads the head of GitHub's live default branch instead of the
recorded one. A read that fails becomes unavailable facts, so one provider outage does not hide the
others.
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
  const failedWorkerObservations = (workerIds: ReadonlyArray<Id<"repositoryCloudflareWorkers">>) =>
    workerIds.map((workerId) => ({
      state: "failed" as const,
      workerId,
      reason: "request_failed" as const,
    }));
  const attachedWorkerIds = repository.cloudflareWorkers.map((worker) => worker.workerId);
  // One read of GitHub's live default branch serves the production builds and the default branch
  // head, so that the production build commit is compared with the head of the branch it builds.
  const defaultBranchRead = readGitHubDefaultBranchForUser(ctx, { userId, repositoryId }).catch(
    () => null,
  );

  const plan = repository.providerPlan;
  const setupStackRead: Promise<RepositorySetupStack | null> =
    plan && !isSamebaseManagedProviderPlan(plan)
      ? readSetupStatus(ctx, { userId, repositoryId }).then(
          (status) => ({ state: "available" as const, ...status }),
          () => ({ state: "unavailable" as const }),
        )
      : Promise.resolve(null);

  const [workers, workerBuilds, convexProjects, pullRequests, setupStack] = await Promise.all([
    observeCloudflareWorkersForUser(ctx, { userId, repositoryId }).catch(() =>
      failedWorkerObservations(attachedWorkerIds),
    ),
    defaultBranchRead
      .then(
        async (defaultBranch) =>
          await observeCloudflareWorkerBuildsForUser(ctx, { userId, repositoryId, defaultBranch }),
      )
      .catch(() => failedWorkerObservations(attachedWorkerIds)),
    observeConvexProjectsForUser(ctx, { userId, repositoryId }).catch(() =>
      repository.convexProjects.map((project) => ({
        convexProjectId: project.convexProjectId,
        projectId: project.projectId,
        codeLocation: project.codeLocation,
        source: { state: "unavailable" as const, reason: "request_failed" as const },
        provider: { state: "unavailable" as const, reason: "request_failed" as const },
      })),
    ),
    defaultBranchRead.then(async (defaultBranch) =>
      defaultBranch === null
        ? { state: "unavailable" as const }
        : await listOpenPullRequestsForUser(ctx, {
            userId,
            repositoryId,
            defaultBranch: { source: "github", name: defaultBranch },
            first: REPOSITORY_STATUS_PULL_REQUEST_LIMIT,
            after: null,
          }).then(
            (page) => ({ state: "available" as const, page }),
            () => ({ state: "unavailable" as const }),
          ),
    ),
    setupStackRead,
  ]);

  // The overview reads deploy keys only for Workers whose Builds settings are connected.
  const buildAccessTargets = workerBuilds.flatMap((observation) =>
    observation.state === "available" && observation.builds.state === "connected"
      ? [{ workerId: observation.workerId }]
      : [],
  );
  const pullRequestIds =
    pullRequests.state === "available"
      ? (pullRequests.page.repository?.pullRequests.nodes ?? []).map(
          (pullRequest) => pullRequest.id,
        )
      : [];
  const [workerConvexBuildAccess, pullRequestResources] = await Promise.all([
    buildAccessTargets.length === 0
      ? []
      : observeCloudflareWorkerConvexBuildAccessForUser(ctx, {
          userId,
          repositoryId,
          targets: buildAccessTargets,
        }).catch(() =>
          failedWorkerObservations(buildAccessTargets.map((target) => target.workerId)),
        ),
    pullRequestIds.length === 0
      ? []
      : getPullRequestResourcesForUser(ctx, { userId, repositoryId, pullRequestIds }).catch(() =>
          pullRequestIds.map((pullRequestId) => ({
            state: "unavailable" as const,
            pullRequestId,
          })),
        ),
  ]);

  const observations: RepositoryObservations = {
    workers,
    workerBuilds,
    workerConvexBuildAccess,
    convexProjects,
    pullRequests,
    pullRequestResources,
    setupStack,
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
