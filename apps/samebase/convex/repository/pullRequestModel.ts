import { v, type Infer } from "convex/values";

import {
  GITHUB_CHECK_RUN_STATES,
  GITHUB_STATUS_STATES,
  UNKNOWN_GITHUB_STATE,
  type RepositoryCheckState,
} from "../../shared/repositoryChecks";

/*
Result validators of the GitHub pull request reads in repositoryPullRequests.ts, and the
classification of one check. They live in this default-runtime module so that repository:getStatus
can declare the same shapes and classify checks like the dashboard. The count validators take their
state literals from shared/repositoryChecks.ts, which summarizes the counts.
*/

const { array, boolean, id, literal, number, object, string, union } = v;

export const GITHUB_CHECK_STATUSES = [
  "REQUESTED",
  "QUEUED",
  "IN_PROGRESS",
  "COMPLETED",
  "WAITING",
  "PENDING",
] as const;
export const GITHUB_CHECK_CONCLUSIONS = [
  "ACTION_REQUIRED",
  "TIMED_OUT",
  "CANCELLED",
  "FAILURE",
  "SUCCESS",
  "NEUTRAL",
  "SKIPPED",
  "STARTUP_FAILURE",
  "STALE",
] as const;

const checkRunState = union(
  ...[...GITHUB_CHECK_RUN_STATES, UNKNOWN_GITHUB_STATE].map((state) => literal(state)),
);
const statusState = union(
  ...[...GITHUB_STATUS_STATES, UNKNOWN_GITHUB_STATE].map((state) => literal(state)),
);
const checkStatus = union(
  ...[...GITHUB_CHECK_STATUSES, UNKNOWN_GITHUB_STATE].map((state) => literal(state)),
);
const checkConclusion = union(
  ...[...GITHUB_CHECK_CONCLUSIONS, UNKNOWN_GITHUB_STATE].map((state) => literal(state)),
);
const checkContext = union(
  object({
    kind: literal("check_run"),
    name: string(),
    status: checkStatus,
    conclusion: union(v.null(), checkConclusion),
    detailsUrl: union(v.null(), string()),
    title: union(v.null(), string()),
  }),
  object({
    kind: literal("status_context"),
    context: string(),
    state: statusState,
    targetUrl: union(v.null(), string()),
    description: union(v.null(), string()),
  }),
);
const checkCountFields = {
  totalCount: number(),
  checkRunCount: number(),
  statusContextCount: number(),
  checkRunCountsByState: array(object({ state: checkRunState, count: number() })),
  statusContextCountsByState: array(object({ state: statusState, count: number() })),
};
const vStatusCheckCounts = union(
  v.null(),
  object({
    contexts: object(checkCountFields),
  }),
);
const vStatusCheckRollup = union(
  v.null(),
  object({
    contexts: object({
      ...checkCountFields,
      nodes: array(checkContext),
    }),
  }),
);
const vPullRequest = object({
  id: string(),
  number: number(),
  title: string(),
  url: string(),
  isDraft: boolean(),
  isCrossRepository: boolean(),
  additions: number(),
  deletions: number(),
  changedFiles: number(),
  updatedAt: string(),
  baseRefName: string(),
  headRefName: string(),
  headRefOid: string(),
  headRepository: union(
    v.null(),
    object({
      id: string(),
      nameWithOwner: string(),
      owner: object({ login: string() }),
    }),
  ),
  labels: object({
    nodes: array(object({ name: string(), color: string() })),
  }),
  statusCheckRollup: vStatusCheckRollup,
});
const vRepositoryDefaultBranch = union(
  v.null(),
  object({
    name: string(),
    headCommitOid: string(),
    headCommitTitle: string(),
    headCommitCommittedAt: string(),
    headCommitUrl: string(),
    statusCheckRollup: vStatusCheckRollup,
  }),
);
export const vRepositoryPullRequestPage = object({
  repository: union(
    v.null(),
    object({
      id: string(),
      databaseId: number(),
      nameWithOwner: string(),
      defaultBranch: vRepositoryDefaultBranch,
      pullRequests: object({
        totalCount: number(),
        pageInfo: object({
          hasNextPage: boolean(),
          endCursor: union(v.null(), string()),
        }),
        nodes: array(vPullRequest),
      }),
    }),
  ),
});
export const vRepositorySidebarSummary = object({
  repositoryId: id("repositories"),
  repository: union(
    v.null(),
    object({
      openPullRequestCount: number(),
      statusCheckRollup: vStatusCheckCounts,
    }),
  ),
});
export type RepositoryPullRequestPage = Infer<typeof vRepositoryPullRequestPage>;
export type RepositoryPullRequest = Infer<typeof vPullRequest>;
export type RepositoryStatusCheckCounts = Infer<typeof vStatusCheckCounts>;
export type RepositoryStatusCheckRollup = Infer<typeof vStatusCheckRollup>;
export type RepositorySidebarSummary = Infer<typeof vRepositorySidebarSummary>;
export type RepositoryCheck = Infer<typeof checkContext>;

/** The state of one check, shared by the dashboard checks list and the status read. */
export function classifyRepositoryCheck(check: RepositoryCheck): RepositoryCheckState {
  if (check.kind === "status_context") {
    switch (check.state) {
      case "SUCCESS":
        return "success";
      case "ERROR":
      case "FAILURE":
        return "failure";
      case "EXPECTED":
      case "PENDING":
        return "running";
      case "UNKNOWN":
        return "unknown";
      default:
        check.state satisfies never;
        return "unknown";
    }
  }
  if (check.status !== "COMPLETED") {
    switch (check.status) {
      case "REQUESTED":
      case "QUEUED":
      case "IN_PROGRESS":
      case "WAITING":
      case "PENDING":
        return "running";
      case "UNKNOWN":
        return "unknown";
      default:
        check.status satisfies never;
        return "unknown";
    }
  }
  switch (check.conclusion) {
    case "SUCCESS":
      return "success";
    case "ACTION_REQUIRED":
    case "TIMED_OUT":
    case "CANCELLED":
    case "FAILURE":
    case "STARTUP_FAILURE":
    case "STALE":
      return "failure";
    case "NEUTRAL":
    case "SKIPPED":
      return "neutral";
    case "UNKNOWN":
    case null:
      return "unknown";
    default:
      check.conclusion satisfies never;
      return "unknown";
  }
}
