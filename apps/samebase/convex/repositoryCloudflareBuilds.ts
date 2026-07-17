import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./functions";
import {
  fetchGitHubCloudflareBuildObservations,
  type GitHubCloudflareBuildHeadObservation,
} from "./githubCloudflareBuildObservations";
import { createGitHubGraphqlClient } from "./githubGraphql";
import {
  normalizeCloudflareBuild,
  type CloudflareBuild,
  type CloudflareBuildObservationResult,
  type GitHubCloudflareBuildCheckRun,
  type PullRequestHeadIdentity,
  vCloudflareBuildObservationResult,
  vPullRequestHeadIdentity,
} from "./repositoryObservations";

const { array, id, literal, number, object, union } = v;

const CLOUDFLARE_OBSERVATION_DEADLINE_MS = 15_000;
const CLOUDFLARE_OBSERVATION_MAX_GRAPHQL_COST = 50;
const CLOUDFLARE_OBSERVATION_BUDGET_RETRY_MS = 30_000;

const vRepositoryCloudflareBuildBatchProblem = union(
  object({
    state: literal("budget_deferred"),
    reason: union(literal("rate_limit"), literal("request_budget")),
    retryAt: number(),
  }),
  object({
    state: literal("provider_unavailable"),
    reason: union(literal("github_connection_unavailable"), literal("repository_unavailable")),
  }),
  object({
    state: literal("provider_failure"),
    reason: union(literal("request_failed"), literal("invalid_response")),
  }),
);
export type RepositoryCloudflareBuildBatchProblem = Infer<
  typeof vRepositoryCloudflareBuildBatchProblem
>;

const vRepositoryCloudflareBuildBatchResult = union(
  object({
    state: literal("observed"),
    observedAt: number(),
    observations: array(vCloudflareBuildObservationResult),
  }),
  vRepositoryCloudflareBuildBatchProblem,
);
export type RepositoryCloudflareBuildBatchResult = Infer<
  typeof vRepositoryCloudflareBuildBatchResult
>;

function compareCloudflareBuilds(left: CloudflareBuild, right: CloudflareBuild): number {
  return (
    left.workerName.localeCompare(right.workerName) ||
    left.checkName.localeCompare(right.checkName) ||
    left.source.checkRunId.localeCompare(right.source.checkRunId)
  );
}

export function buildCompleteCloudflareBuildObservation(args: {
  head: PullRequestHeadIdentity;
  observedAt: number;
  checkRuns: ReadonlyArray<{
    checkRun: GitHubCloudflareBuildCheckRun;
  }>;
}): CloudflareBuildObservationResult {
  if (args.checkRuns.length === 0) {
    return {
      state: "fresh_absence",
      head: args.head,
      observedAt: args.observedAt,
    };
  }

  const builds = args.checkRuns
    .map(({ checkRun }) => normalizeCloudflareBuild(checkRun))
    .sort(compareCloudflareBuilds);
  const [first, ...rest] = builds;
  return {
    state: "ready",
    head: args.head,
    observedAt: args.observedAt,
    builds: { first, rest },
  };
}

export function buildCloudflareHeadObservation(args: {
  observation: GitHubCloudflareBuildHeadObservation;
  observedAt: number;
}): CloudflareBuildObservationResult {
  const observation = args.observation;
  switch (observation.state) {
    case "complete":
      return buildCompleteCloudflareBuildObservation({
        head: observation.head,
        observedAt: args.observedAt,
        checkRuns: observation.checkRuns,
      });
    case "head_unavailable":
      return {
        state: "provider_unavailable",
        head: observation.head,
        reason: "head_unavailable",
      };
    case "identity_mismatch":
      return {
        state: "provider_unavailable",
        head: observation.head,
        reason: "head_changed",
      };
    case "incomplete":
      return {
        state: "provider_unavailable",
        head: observation.head,
        reason: "pagination_guardrail",
      };
    case "invalid_response":
      return {
        state: "provider_failure",
        head: observation.head,
        reason: "invalid_response",
      };
    default:
      observation satisfies never;
      throw new Error("Cloudflare head observation was not classified.");
  }
}

export const observePullRequestHeads = action({
  access: "access_dashboard",
  args: {
    vaultId: id("vaults"),
    heads: array(vPullRequestHeadIdentity),
  },
  returns: vRepositoryCloudflareBuildBatchResult,
  handler: async (ctx, args): Promise<RepositoryCloudflareBuildBatchResult> => {
    const observationContext = await ctx.runQuery(
      internal.repositoryPullRequests.readRepositoryObservationContext,
      {
        userId: ctx.viewer.userId,
        vaultId: args.vaultId,
      },
    );
    if (observationContext.state === "repository_unavailable") {
      return {
        state: "provider_unavailable",
        reason: "repository_unavailable",
      };
    }

    const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: ctx.viewer.userId,
      kind: "github",
    });
    if (githubConnection?.kind !== "github") {
      return {
        state: "provider_unavailable",
        reason: "github_connection_unavailable",
      };
    }

    const client = createGitHubGraphqlClient({
      credential: githubConnection.auth.credential,
      limits: {
        deadlineAt: Date.now() + CLOUDFLARE_OBSERVATION_DEADLINE_MS,
        maximumCost: CLOUDFLARE_OBSERVATION_MAX_GRAPHQL_COST,
        maximumRequestCount: 1,
      },
    });
    const batch = await fetchGitHubCloudflareBuildObservations({
      requestGraphql: client.request,
      owner: observationContext.owner,
      name: observationContext.name,
      expectedRepositoryDatabaseId: observationContext.repositoryDatabaseId,
      heads: args.heads,
    });
    const observedAt = Date.now();

    switch (batch.state) {
      case "complete":
        return {
          state: "observed",
          observedAt,
          observations: batch.observations.map((observation) =>
            buildCloudflareHeadObservation({
              observation,
              observedAt,
            }),
          ),
        };
      case "rate_limited":
        return {
          state: "budget_deferred",
          reason: "rate_limit",
          retryAt: batch.retryAt,
        };
      case "budget_deferred":
        return {
          state: "budget_deferred",
          reason: "request_budget",
          retryAt: observedAt + CLOUDFLARE_OBSERVATION_BUDGET_RETRY_MS,
        };
      case "repository_unavailable":
        return {
          state: "provider_unavailable",
          reason: "repository_unavailable",
        };
      case "request_failed":
        return {
          state: "provider_failure",
          reason: "request_failed",
        };
      case "invalid_request":
      case "invalid_response":
      case "repository_identity_mismatch":
        return {
          state: "provider_failure",
          reason: "invalid_response",
        };
      default:
        batch satisfies never;
        throw new Error("Cloudflare build observation batch was not classified.");
    }
  },
});
