import { v, type Infer } from "convex/values";

import { vCloudflareBuildState } from "./cloudflareBuildMatching";

/*
Result validators of the GitHub pull request reads in repositoryPullRequests.ts and
pullRequestResources.ts. They live in this default-runtime module so that repository:getStatus can
declare the same shapes.
*/

const { array, boolean, id, literal, number, object, string, union } = v;

export const GITHUB_CHECK_RUN_STATES = [
  "ACTION_REQUIRED",
  "CANCELLED",
  "COMPLETED",
  "FAILURE",
  "IN_PROGRESS",
  "NEUTRAL",
  "PENDING",
  "QUEUED",
  "SKIPPED",
  "STALE",
  "STARTUP_FAILURE",
  "SUCCESS",
  "TIMED_OUT",
  "WAITING",
] as const;
export const GITHUB_STATUS_STATES = ["ERROR", "EXPECTED", "FAILURE", "PENDING", "SUCCESS"] as const;
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
export const UNKNOWN_GITHUB_STATE = "UNKNOWN" as const;

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

const vPullRequestConvexResource = union(
  object({
    state: literal("branch"),
    convexProjectId: id("repositoryConvexProjects"),
    rootDirectory: string(),
    deploymentName: string(),
    dashboardUrl: string(),
  }),
  object({
    state: literal("absent"),
    convexProjectId: id("repositoryConvexProjects"),
    rootDirectory: string(),
  }),
  object({
    state: literal("unavailable"),
    convexProjectId: id("repositoryConvexProjects"),
    rootDirectory: string(),
  }),
);
const vCloudflareBranchPreview = union(
  object({
    state: literal("available"),
    url: string(),
    provenance: union(literal("selected_result"), literal("earlier_check")),
  }),
  object({ state: literal("absent") }),
);
const vCloudflareBuild = union(
  object({
    state: literal("available"),
    uuid: string(),
    buildState: vCloudflareBuildState,
    logsUrl: string(),
  }),
  object({ state: literal("unavailable") }),
);
const vPullRequestWorkerResource = object({
  workerId: id("repositoryCloudflareWorkers"),
  workerName: string(),
  rootDirectory: string(),
  cloudflareBuild: vCloudflareBuild,
  cloudflareBranchPreview: vCloudflareBranchPreview,
});
const vPullRequestCloudflareBuilds = union(
  object({ state: literal("available") }),
  object({ state: literal("unavailable") }),
);
const vCloudflareHostingPreview = union(
  object({
    kind: literal("worker"),
    name: string(),
    url: string(),
  }),
  object({
    kind: literal("pages"),
    name: string(),
    url: string(),
  }),
);
const vCloudflareHostingPreviewResult = union(
  object({
    state: literal("available"),
    previews: array(vCloudflareHostingPreview),
  }),
  object({
    state: literal("unavailable"),
  }),
);
const vNetlifyHostingPreviewResult = union(
  object({
    state: literal("available"),
    previews: array(object({ name: string(), url: string() })),
  }),
  object({
    state: literal("unavailable"),
  }),
);
const vPullRequestHostingPreviews = object({
  cloudflare: vCloudflareHostingPreviewResult,
  netlify: vNetlifyHostingPreviewResult,
});
export const vPullRequestResources = union(
  object({
    state: literal("available"),
    pullRequestId: string(),
    cloudflareBuilds: vPullRequestCloudflareBuilds,
    workers: array(vPullRequestWorkerResource),
    convexProjects: array(vPullRequestConvexResource),
    hostingPreviews: vPullRequestHostingPreviews,
  }),
  object({
    state: literal("unavailable"),
    pullRequestId: string(),
  }),
);

export type PullRequestWorkerResource = Infer<typeof vPullRequestWorkerResource>;
export type PullRequestConvexResource = Infer<typeof vPullRequestConvexResource>;
export type PullRequestHostingPreviews = Infer<typeof vPullRequestHostingPreviews>;
export type PullRequestResourceRead = Infer<typeof vPullRequestResources>;
export type PullRequestResources = Omit<
  Extract<PullRequestResourceRead, { state: "available" }>,
  "state"
>;
