"use node";

import type { Octokit } from "@octokit/rest";
import { v, type Infer } from "convex/values";
import { z } from "zod";

import { getConvexCodeRootDirectory } from "../../shared/convexCodeLocation";
import { internal } from "../_generated/api";
import { allLimited } from "../common";
import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import { action } from "../functions";
import { resolveGitHubAppAccess } from "../githubAppAccess";
import { createGitHubRequestDeadlineSignal } from "../githubRepoApi";
import { isRecord } from "../jsonUtils";
import { readConvexPreviewDeployments, readConvexProjectResource } from "./convexProjectResources";
import { vCloudflareBuildState } from "./cloudflareBuildMatching";
import {
  detectCloudflareWorkerCommentParseFailures,
  resolveCloudflareWorkerComments,
} from "./pullRequestCloudflareWorkerComments";
import { readGitHubCloudflareWorkerChecks } from "./pullRequestCloudflareWorkerChecks";
import {
  CLOUDFLARE_WORKER_PROOF_SOURCE,
  resolveCloudflareWorkerBranchPreviewUrl,
  resolveCloudflareWorkerBuild,
  type CloudflareWorkerProofRead,
} from "./pullRequestCloudflareWorkerProof";
import {
  detectHostingCommentParseFailures,
  resolveCloudflarePagesPreviews,
  resolveNetlifyHostingPreviews,
  type CloudflarePagesRead,
  type HostingCommentBodies,
  type HostingCommentParseFailure,
  type HostingPreviewRead,
  type NetlifyHostingPreview,
} from "./pullRequestHostingPreviews";
import { buildConvexDeploymentDashboardUrl } from "./providerDashboardUrls";
import type { VaultProviderObservationContext } from "./providerObservationQueries";

const { array, id, literal, object, string, union } = v;

const CLOUDFLARE_GITHUB_BOT_NODE_ID = "MDM6Qm90NzMxMzk0MDI=";
const NETLIFY_GITHUB_BOT_NODE_ID = "MDM6Qm90NDAyMDkzMjY=";
const GITHUB_PULL_REQUEST_COMMENT_PAGE_SIZE = 100;
const GITHUB_PULL_REQUEST_COMMIT_PAGE_SIZE = 100;
const GITHUB_PULL_REQUEST_RESOURCE_LIMIT = 100;

const vPullRequestConvexResource = union(
  object({
    state: literal("branch"),
    convexProjectId: id("vaultConvexProjects"),
    rootDirectory: string(),
    deploymentName: string(),
    dashboardUrl: string(),
  }),
  object({
    state: literal("absent"),
    convexProjectId: id("vaultConvexProjects"),
    rootDirectory: string(),
  }),
  object({
    state: literal("unavailable"),
    convexProjectId: id("vaultConvexProjects"),
    rootDirectory: string(),
  }),
);
const vCloudflareBranchPreview = union(
  object({ state: literal("available"), url: string() }),
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
const stableWorkerIdentityFields = {
  workerId: id("vaultCloudflareWorkers"),
  workerName: string(),
  rootDirectory: string(),
};
const vPullRequestWorkerResource = object({
  ...stableWorkerIdentityFields,
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
const vPullRequestResources = union(
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

const providerPullRequestResourceIdentitySchema = z.object({
  __typename: z.literal("PullRequest"),
  id: z.string().min(1),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  repository: z.object({ databaseId: z.number().int().positive() }),
});
const providerPullRequestCommentMetadataSchema = z.object({
  __typename: z.literal("IssueComment"),
  id: z.string().min(1),
  author: z
    .object({
      __typename: z.string().min(1),
      id: z.string().min(1).optional(),
    })
    .nullable(),
});
const providerPullRequestCommentConnectionSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    endCursor: z.string().min(1).nullable(),
  }),
  nodes: z
    .array(providerPullRequestCommentMetadataSchema)
    .max(GITHUB_PULL_REQUEST_COMMENT_PAGE_SIZE),
});
const providerGitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
const providerPullRequestCommitSchema = z.object({
  commit: z.object({
    id: z.string().min(1),
    oid: providerGitObjectIdSchema,
  }),
});
const providerPullRequestCommitConnectionSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  pageInfo: z.object({
    hasPreviousPage: z.boolean(),
    startCursor: z.string().min(1).nullable(),
  }),
  nodes: z.array(providerPullRequestCommitSchema).max(GITHUB_PULL_REQUEST_COMMIT_PAGE_SIZE),
});
const providerPullRequestResourceHeadSchema = providerPullRequestResourceIdentitySchema.extend({
  number: z.number().int().positive(),
  isCrossRepository: z.boolean(),
  state: z.literal("OPEN"),
  baseRefOid: providerGitObjectIdSchema,
  headRefOid: providerGitObjectIdSchema,
  headRepository: z.object({ id: z.string().min(1) }).nullable(),
  headRefName: z.string().min(1),
  comments: z.unknown().optional(),
  commits: z.unknown().optional(),
});
const providerPullRequestResourceHeadsSchema = z.object({ nodes: z.array(z.unknown()) });
const providerPullRequestNodePageSchema = z.object({ node: z.unknown() });
const providerIssueCommentIdentitySchema = z.object({
  __typename: z.string().min(1),
  id: z.string().min(1),
});
const providerIssueCommentBodySchema = z.object({
  __typename: z.literal("IssueComment"),
  id: z.string().min(1),
  body: z.string(),
  author: z.object({
    __typename: z.literal("Bot"),
    id: z.string().min(1),
  }),
  pullRequest: z.object({
    id: z.string().min(1),
    state: z.literal("OPEN"),
    repository: z.object({ databaseId: z.number().int().positive() }),
  }),
});
const providerIssueCommentBodiesSchema = z.object({ nodes: z.array(z.unknown()) });
const providerRecoverablePullRequestErrorsSchema = z
  .array(
    z.object({
      type: z.string().min(1),
      path: z.array(z.union([z.string(), z.number()])).nonempty(),
    }),
  )
  .nonempty();
const providerRecoverablePullRequestErrorSchema = z.object({
  name: z.literal("GraphqlResponseError"),
  errors: providerRecoverablePullRequestErrorsSchema,
  data: z.unknown(),
});
type ProviderPullRequestResourceHead = z.infer<typeof providerPullRequestResourceHeadSchema>;
type PullRequestResourceHeadBase = Pick<
  ProviderPullRequestResourceHead,
  "id" | "number" | "isCrossRepository" | "baseRefOid" | "headRefName" | "headRefOid"
> & {
  headRepositoryId: string | null;
};
type HostingCommentProvider = "cloudflare" | "netlify";
type HostingCommentReference = {
  commentId: string;
  provider: HostingCommentProvider;
};
type HostingCommentScan =
  | {
      state: "available";
      allCommentIds: string[];
      hostingComments: HostingCommentReference[];
      totalCount: number;
      after: string | null;
    }
  | { state: "unavailable" };
type PullRequestCommit = {
  id: string;
  oid: string;
};
type PullRequestCommitScan =
  | {
      state: "available";
      commits: PullRequestCommit[];
      totalCount: number;
      before: string | null;
    }
  | { state: "unavailable" };
type PullRequestResourceHeadSeed = PullRequestResourceHeadBase & {
  hostingCommentScan: HostingCommentScan;
  commitScan: PullRequestCommitScan;
};
export type PullRequestResourceHead = PullRequestResourceHeadBase & {
  cloudflareWorkerProof: CloudflareWorkerProofRead;
  hostingPreviews: {
    cloudflare: CloudflarePagesRead;
    netlify: HostingPreviewRead<NetlifyHostingPreview>;
  };
};
type PullRequestResourceHeadRead =
  | { state: "available"; head: PullRequestResourceHead }
  | { state: "unavailable"; pullRequestId: string };
type PullRequestResourceHeadSeedRead =
  | { state: "available"; head: PullRequestResourceHeadSeed }
  | { state: "unavailable"; pullRequestId: string };

const PULL_REQUEST_RESOURCE_HEADS_QUERY = `
  query PullRequestResourceHeads($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on PullRequest {
        id
        number
        isCrossRepository
        state
        repository { databaseId }
        baseRefOid
        headRefOid
        headRepository { id }
        headRefName
        comments(
          first: ${GITHUB_PULL_REQUEST_COMMENT_PAGE_SIZE}
          orderBy: { field: UPDATED_AT, direction: ASC }
        ) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            __typename
            id
            author {
              __typename
              ... on Bot { id }
            }
          }
        }
        commits(last: ${GITHUB_PULL_REQUEST_COMMIT_PAGE_SIZE}) {
          totalCount
          pageInfo { hasPreviousPage startCursor }
          nodes { commit { id oid } }
        }
      }
    }
  }
`;

const PULL_REQUEST_COMMIT_PAGE_QUERY = `
  query PullRequestCommitPage($id: ID!, $before: String) {
    node(id: $id) {
      __typename
      ... on PullRequest {
        id
        state
        repository { databaseId }
        baseRefOid
        headRefOid
        commits(
          last: ${GITHUB_PULL_REQUEST_COMMIT_PAGE_SIZE}
          before: $before
        ) {
          totalCount
          pageInfo { hasPreviousPage startCursor }
          nodes { commit { id oid } }
        }
      }
    }
  }
`;

const PULL_REQUEST_COMMENT_PAGE_QUERY = `
  query PullRequestCommentPage($id: ID!, $after: String) {
    node(id: $id) {
      __typename
      ... on PullRequest {
        id
        state
        repository { databaseId }
        comments(
          first: ${GITHUB_PULL_REQUEST_COMMENT_PAGE_SIZE}
          after: $after
          orderBy: { field: UPDATED_AT, direction: ASC }
        ) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            __typename
            id
            author {
              __typename
              ... on Bot { id }
            }
          }
        }
      }
    }
  }
`;

const PULL_REQUEST_COMMENT_BODIES_QUERY = `
  query PullRequestCommentBodies($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on IssueComment {
        id
        body
        author {
          __typename
          ... on Bot { id }
        }
        pullRequest {
          id
          state
          repository { databaseId }
        }
      }
    }
  }
`;

function hostingCommentProviderForBotNodeId(nodeId: string): HostingCommentProvider | null {
  if (nodeId === CLOUDFLARE_GITHUB_BOT_NODE_ID) {
    return "cloudflare";
  }
  return nodeId === NETLIFY_GITHUB_BOT_NODE_ID ? "netlify" : null;
}

function hostingCommentBotNodeId(provider: HostingCommentProvider): string {
  switch (provider) {
    case "cloudflare":
      return CLOUDFLARE_GITHUB_BOT_NODE_ID;
    case "netlify":
      return NETLIFY_GITHUB_BOT_NODE_ID;
  }
}

export function normalizeGitHubHostingCommentPage(
  value: unknown,
  previous?: Extract<HostingCommentScan, { state: "available" }>,
): HostingCommentScan {
  const parsed = providerPullRequestCommentConnectionSchema.safeParse(value);
  if (!parsed.success || (previous && parsed.data.totalCount !== previous.totalCount)) {
    return { state: "unavailable" };
  }

  const allCommentIds = [...(previous?.allCommentIds ?? [])];
  const hostingComments = [...(previous?.hostingComments ?? [])];
  const seen = new Set(allCommentIds);
  for (const comment of parsed.data.nodes) {
    if (seen.has(comment.id)) {
      return { state: "unavailable" };
    }
    seen.add(comment.id);
    allCommentIds.push(comment.id);
    if (comment.author?.__typename === "Bot") {
      if (!comment.author.id) {
        return { state: "unavailable" };
      }
      const provider = hostingCommentProviderForBotNodeId(comment.author.id);
      if (provider !== null) {
        hostingComments.push({ commentId: comment.id, provider });
      }
    }
  }

  const { endCursor, hasNextPage } = parsed.data.pageInfo;
  if (
    allCommentIds.length > parsed.data.totalCount ||
    (hasNextPage &&
      (endCursor === null ||
        endCursor === previous?.after ||
        parsed.data.nodes.length === 0 ||
        allCommentIds.length === parsed.data.totalCount)) ||
    (!hasNextPage && allCommentIds.length !== parsed.data.totalCount)
  ) {
    return { state: "unavailable" };
  }

  return {
    state: "available",
    allCommentIds,
    hostingComments,
    totalCount: parsed.data.totalCount,
    after: hasNextPage ? endCursor : null,
  };
}

export function normalizeGitHubPullRequestCommitPage(
  value: unknown,
  previous?: Extract<PullRequestCommitScan, { state: "available" }>,
): PullRequestCommitScan {
  const parsed = providerPullRequestCommitConnectionSchema.safeParse(value);
  if (!parsed.success || (previous && parsed.data.totalCount !== previous.totalCount)) {
    return { state: "unavailable" };
  }

  const pageCommits = parsed.data.nodes.map(({ commit }) => commit);
  const commits = [...pageCommits, ...(previous?.commits ?? [])];
  const ids = new Set<string>();
  const oids = new Set<string>();
  for (const commit of commits) {
    if (ids.has(commit.id) || oids.has(commit.oid)) {
      return { state: "unavailable" };
    }
    ids.add(commit.id);
    oids.add(commit.oid);
  }

  const { hasPreviousPage, startCursor } = parsed.data.pageInfo;
  if (
    commits.length > parsed.data.totalCount ||
    (hasPreviousPage &&
      (startCursor === null ||
        startCursor === previous?.before ||
        pageCommits.length === 0 ||
        commits.length === parsed.data.totalCount)) ||
    (!hasPreviousPage && commits.length !== parsed.data.totalCount)
  ) {
    return { state: "unavailable" };
  }

  return {
    state: "available",
    commits,
    totalCount: parsed.data.totalCount,
    before: hasPreviousPage ? startCursor : null,
  };
}

type HostingCommentBodyRequest = {
  commentId: string;
  provider: HostingCommentProvider;
  pullRequestId: string;
};
type HostingCommentBodyRead =
  | (HostingCommentBodyRequest & { state: "available"; body: string })
  | (HostingCommentBodyRequest & { state: "unavailable" });

export function normalizeGitHubHostingCommentBodyReads(
  value: unknown,
  args: {
    ghRepoId: string;
    requests: readonly HostingCommentBodyRequest[];
  },
): HostingCommentBodyRead[] {
  const response = providerIssueCommentBodiesSchema.safeParse(value);
  if (!response.success || response.data.nodes.length !== args.requests.length) {
    return args.requests.map((request) => ({ ...request, state: "unavailable" }));
  }

  const requestsById = new Map<string, HostingCommentBodyRequest>();
  const invalidIds = new Set<string>();
  for (const request of args.requests) {
    if (requestsById.has(request.commentId)) {
      invalidIds.add(request.commentId);
    } else {
      requestsById.set(request.commentId, request);
    }
  }

  const bodiesById = new Map<string, string>();
  const returnedIds = new Set<string>();
  let unexpectedReturnedId = false;
  for (const value of response.data.nodes) {
    const identity = providerIssueCommentIdentitySchema.safeParse(value);
    if (!identity.success) {
      continue;
    }
    if (returnedIds.has(identity.data.id)) {
      invalidIds.add(identity.data.id);
      bodiesById.delete(identity.data.id);
      continue;
    }
    returnedIds.add(identity.data.id);

    const expected = requestsById.get(identity.data.id);
    if (!expected) {
      unexpectedReturnedId = true;
      continue;
    }
    const comment = providerIssueCommentBodySchema.safeParse(value);
    if (
      !comment.success ||
      comment.data.author.id !== hostingCommentBotNodeId(expected.provider) ||
      comment.data.pullRequest.id !== expected.pullRequestId ||
      String(comment.data.pullRequest.repository.databaseId) !== args.ghRepoId
    ) {
      invalidIds.add(identity.data.id);
      continue;
    }
    bodiesById.set(identity.data.id, comment.data.body);
  }

  if (unexpectedReturnedId) {
    return args.requests.map((request) => ({ ...request, state: "unavailable" }));
  }
  return args.requests.map((request): HostingCommentBodyRead => {
    const body = bodiesById.get(request.commentId);
    return body === undefined || invalidIds.has(request.commentId)
      ? { ...request, state: "unavailable" }
      : { ...request, state: "available", body };
  });
}

export function normalizeGitHubPullRequestResourceHeadReads(
  value: unknown,
  args: {
    ghRepoId: string;
    pullRequestIds: readonly string[];
  },
): PullRequestResourceHeadSeedRead[] {
  const providerHeads = providerPullRequestResourceHeadsSchema.parse(value).nodes;
  if (providerHeads.length !== args.pullRequestIds.length) {
    throw new Error("GitHub returned an incomplete pull request resource response.");
  }

  return providerHeads.map((value, index) => {
    const pullRequestId = args.pullRequestIds[index];
    if (value === null) {
      return { state: "unavailable", pullRequestId };
    }
    const identity = providerPullRequestResourceIdentitySchema.parse(value);
    if (identity.id !== pullRequestId || String(identity.repository.databaseId) !== args.ghRepoId) {
      throw new Error("GitHub pull request identity changed.");
    }
    if (identity.state !== "OPEN") {
      return { state: "unavailable", pullRequestId };
    }
    const head = providerPullRequestResourceHeadSchema.parse(value);
    return {
      state: "available",
      head: {
        id: head.id,
        number: head.number,
        isCrossRepository: head.isCrossRepository,
        baseRefOid: head.baseRefOid,
        headRefOid: head.headRefOid,
        headRepositoryId: head.headRepository?.id ?? null,
        headRefName: head.headRefName,
        hostingCommentScan: normalizeGitHubHostingCommentPage(head.comments),
        commitScan: normalizeGitHubPullRequestCommitPage(head.commits),
      },
    };
  });
}

export function recoverGitHubPullRequestGraphqlData(error: unknown): unknown {
  const parsed = providerRecoverablePullRequestErrorSchema.safeParse(error);
  if (
    !parsed.success ||
    !parsed.data.errors.every(
      (providerError) =>
        (providerError.type === "NOT_FOUND" && providerError.path[0] === "nodes") ||
        (providerError.path[0] === "nodes" &&
          typeof providerError.path[1] === "number" &&
          (providerError.path[2] === "comments" || providerError.path[2] === "commits")),
    )
  ) {
    throw error;
  }

  const commentErrorIndexes = parsed.data.errors.flatMap((providerError) =>
    providerError.path[0] === "nodes" &&
    typeof providerError.path[1] === "number" &&
    providerError.path[2] === "comments"
      ? [providerError.path[1]]
      : [],
  );
  const commitErrorIndexes = parsed.data.errors.flatMap((providerError) =>
    providerError.path[0] === "nodes" &&
    typeof providerError.path[1] === "number" &&
    providerError.path[2] === "commits"
      ? [providerError.path[1]]
      : [],
  );
  if (commentErrorIndexes.length === 0 && commitErrorIndexes.length === 0) {
    return parsed.data.data;
  }

  const response = providerPullRequestResourceHeadsSchema.safeParse(parsed.data.data);
  if (
    !response.success ||
    [...commentErrorIndexes, ...commitErrorIndexes].some(
      (index) => !Number.isInteger(index) || index < 0 || index >= response.data.nodes.length,
    )
  ) {
    throw error;
  }

  const unavailableCommentIndexes = new Set(commentErrorIndexes);
  const unavailableCommitIndexes = new Set(commitErrorIndexes);
  return {
    nodes: response.data.nodes.map((node, index) => {
      if (!isRecord(node)) {
        return node;
      }
      return {
        ...node,
        ...(unavailableCommentIndexes.has(index) ? { comments: null } : {}),
        ...(unavailableCommitIndexes.has(index) ? { commits: null } : {}),
      };
    }),
  };
}

type StableWorker = VaultProviderObservationContext["cloudflareWorkers"][number];
type StableConvexProject = VaultProviderObservationContext["convexProjects"][number];
type PullRequestCloudflareBuilds = Infer<typeof vPullRequestCloudflareBuilds>;
type PullRequestResourceAccumulator = {
  cloudflareBuilds: PullRequestCloudflareBuilds;
  workers: PullRequestWorkerResource[];
  convexProjects: PullRequestConvexResource[];
  hostingPreviews: PullRequestHostingPreviews;
};
type ConvexPreviewRead =
  | {
      state: "available";
      projectSlug: string;
      teamSlug: string;
      deployments: ConvexCloudDeployment[];
    }
  | { state: "missing" }
  | { state: "failed" };
const PULL_REQUEST_HOSTING_COMMENT_PARSE_LOG_TOPIC = "pull_request_hosting_comment_parse";

export function reportPullRequestHostingCommentParseFailures(
  failures: readonly HostingCommentParseFailure[],
): void {
  const reported = new Set<string>();
  for (const failure of failures) {
    const key = `${failure.providerFormat}:${failure.failureKind}`;
    if (reported.has(key)) {
      continue;
    }
    reported.add(key);
    console.warn(
      `${PULL_REQUEST_HOSTING_COMMENT_PARSE_LOG_TOPIC} ${JSON.stringify({
        topic: PULL_REQUEST_HOSTING_COMMENT_PARSE_LOG_TOPIC,
        version: 1,
        outcome: "failed",
        provider_format: failure.providerFormat,
        failure_kind: failure.failureKind,
      })}`,
    );
  }
}

function workerResourceIdentity(worker: StableWorker) {
  return {
    workerId: worker.workerId,
    workerName: worker.workerName,
    rootDirectory: worker.rootDirectory,
  };
}

function convexProjectResourceIdentity(project: StableConvexProject) {
  return {
    convexProjectId: project.convexProjectId,
    rootDirectory: getConvexCodeRootDirectory(project.codeLocation),
  };
}

export function buildPullRequestHostingPreviews(args: {
  head: PullRequestResourceHead;
  configuredWorkers: readonly { accountId: string; workerName: string }[];
}): PullRequestHostingPreviews {
  const cloudflarePages = args.head.hostingPreviews.cloudflare;
  const cloudflareWorkers = args.head.cloudflareWorkerProof;
  const cloudflareResult: PullRequestHostingPreviews["cloudflare"] =
    cloudflarePages.state === "unavailable" || cloudflareWorkers.state === "unavailable"
      ? { state: "unavailable" }
      : {
          state: "available",
          previews: [
            ...cloudflareWorkers.previews.filter(
              (preview) =>
                !args.configuredWorkers.some(
                  (worker) =>
                    worker.accountId === preview.accountId && worker.workerName === preview.name,
                ),
            ),
            ...cloudflarePages.previews,
          ].map((preview) => ({ kind: preview.kind, name: preview.name, url: preview.url })),
        };
  const netlify = args.head.hostingPreviews.netlify;
  const netlifyResult: PullRequestHostingPreviews["netlify"] =
    netlify.state === "unavailable"
      ? { state: "unavailable" }
      : { state: "available", previews: netlify.previews };
  return { cloudflare: cloudflareResult, netlify: netlifyResult };
}

export function resolveConvexPreviewDeployment(args: {
  deployments: readonly ConvexCloudDeployment[];
  head: PullRequestResourceHead;
}):
  | { state: "branch"; deployment: ConvexCloudDeployment }
  | { state: "absent" }
  | {
      state: "unavailable";
      reason: "fork_head" | "deployment_ambiguous";
    } {
  if (args.head.isCrossRepository || args.head.headRepositoryId === null) {
    return { state: "unavailable", reason: "fork_head" };
  }

  const branchMatches = args.deployments.filter(
    (deployment) => deployment.previewIdentifier === args.head.headRefName,
  );
  if (branchMatches.length === 0) {
    return { state: "absent" };
  }

  if (branchMatches.length > 1) {
    return { state: "unavailable", reason: "deployment_ambiguous" };
  }
  return { state: "branch", deployment: branchMatches[0] };
}

export function buildPullRequestCloudflareWorkerResources(args: {
  cloudflare: CloudflareWorkerProofRead;
  workers: readonly StableWorker[];
}): { state: "available"; workers: PullRequestWorkerResource[] } | { state: "unavailable" } {
  if (args.cloudflare.state === "unavailable") {
    return { state: "unavailable" };
  }

  const workers: PullRequestWorkerResource[] = [];
  for (const worker of args.workers) {
    const build = resolveCloudflareWorkerBuild({
      accountId: worker.accountId,
      proof: args.cloudflare,
      workerName: worker.workerName,
    });
    const preview = resolveCloudflareWorkerBranchPreviewUrl({
      accountId: worker.accountId,
      proof: args.cloudflare,
      workerName: worker.workerName,
    });
    if (build.state === "unavailable" || preview.state === "unavailable") {
      return { state: "unavailable" };
    }
    workers.push({
      ...workerResourceIdentity(worker),
      cloudflareBuild:
        build.state === "available"
          ? {
              state: "available",
              uuid: build.buildUuid,
              buildState: build.buildState,
              logsUrl: build.logsUrl,
            }
          : { state: "unavailable" },
      cloudflareBranchPreview:
        preview.state === "available"
          ? { state: "available", url: preview.url }
          : { state: "absent" },
    });
  }
  return { state: "available", workers };
}

async function readConvexPreview(args: {
  token: string;
  teamId: string;
  project: StableConvexProject;
}): Promise<ConvexPreviewRead> {
  try {
    const details = await readConvexProjectResource({
      token: args.token,
      teamId: args.teamId,
      projectId: args.project.projectId,
    });
    if (!details) {
      return { state: "missing" };
    }
    const deployments = await readConvexPreviewDeployments({
      token: args.token,
      projectId: args.project.projectId,
    });
    return {
      state: "available",
      projectSlug: details.slug,
      teamSlug: details.teamSlug,
      deployments,
    };
  } catch (error) {
    console.warn("Pull request Convex preview read failed.", {
      convexProjectId: args.project.convexProjectId,
      failureKind:
        error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
          ? "timeout"
          : error instanceof Error
            ? "error"
            : "unknown",
    });
    return { state: "failed" };
  }
}

function unavailableConvexProjectResources(args: {
  heads: readonly PullRequestResourceHead[];
  project: StableConvexProject;
}): PullRequestConvexResource[] {
  const identity = convexProjectResourceIdentity(args.project);
  return args.heads.map(() => ({ state: "unavailable", ...identity }));
}

async function readConvexProjectResourcesForHeads(args: {
  project: StableConvexProject;
  heads: readonly PullRequestResourceHead[];
  token: string;
  teamId: string;
}): Promise<PullRequestConvexResource[]> {
  const identity = convexProjectResourceIdentity(args.project);
  const observedPreviews = await readConvexPreview({
    token: args.token,
    teamId: args.teamId,
    project: args.project,
  });
  if (observedPreviews.state !== "available") {
    return unavailableConvexProjectResources(args);
  }

  return args.heads.map((head): PullRequestConvexResource => {
    const resolved = resolveConvexPreviewDeployment({
      deployments: observedPreviews.deployments,
      head,
    });
    if (resolved.state === "absent") {
      return { state: "absent", ...identity };
    }
    if (resolved.state === "unavailable") {
      return { state: "unavailable", ...identity };
    }
    return {
      state: resolved.state,
      ...identity,
      deploymentName: resolved.deployment.name,
      dashboardUrl: buildConvexDeploymentDashboardUrl({
        teamSlug: observedPreviews.teamSlug,
        projectSlug: observedPreviews.projectSlug,
        deploymentName: resolved.deployment.name,
      }),
    };
  });
}

export function validatePullRequestResourceIds(pullRequestIds: readonly string[]): void {
  if (pullRequestIds.length < 1 || pullRequestIds.length > GITHUB_PULL_REQUEST_RESOURCE_LIMIT) {
    throw new Error("Pull request resource count must be between 1 and 100.");
  }
  const seenPullRequests = new Set<string>();
  for (const pullRequestId of pullRequestIds) {
    if (!pullRequestId || seenPullRequests.has(pullRequestId)) {
      throw new Error("Pull request identity was invalid or duplicated.");
    }
    seenPullRequests.add(pullRequestId);
  }
}

async function completeGitHubHostingCommentScan(args: {
  octokit: Octokit;
  signal: AbortSignal;
  ghRepoId: string;
  head: PullRequestResourceHeadSeed;
}): Promise<HostingCommentScan> {
  if (args.head.hostingCommentScan.state === "unavailable") {
    return args.head.hostingCommentScan;
  }

  let scan = args.head.hostingCommentScan;
  while (scan.after !== null) {
    let response: unknown;
    try {
      response = await args.octokit.graphql(PULL_REQUEST_COMMENT_PAGE_QUERY, {
        id: args.head.id,
        after: scan.after,
        request: { signal: args.signal },
      });
    } catch {
      return { state: "unavailable" };
    }
    const page = providerPullRequestNodePageSchema.safeParse(response);
    if (!page.success || page.data.node === null) {
      return { state: "unavailable" };
    }
    const identity = providerPullRequestResourceIdentitySchema.safeParse(page.data.node);
    const comments = z.object({ comments: z.unknown() }).safeParse(page.data.node);
    if (
      !identity.success ||
      !comments.success ||
      identity.data.id !== args.head.id ||
      String(identity.data.repository.databaseId) !== args.ghRepoId ||
      identity.data.state !== "OPEN"
    ) {
      return { state: "unavailable" };
    }
    const next = normalizeGitHubHostingCommentPage(comments.data.comments, scan);
    if (next.state === "unavailable") {
      return next;
    }
    scan = next;
  }
  return scan;
}

async function completeGitHubPullRequestCommitScan(args: {
  octokit: Octokit;
  signal: AbortSignal;
  ghRepoId: string;
  head: PullRequestResourceHeadSeed;
}): Promise<PullRequestCommitScan> {
  if (args.head.commitScan.state === "unavailable") {
    return args.head.commitScan;
  }

  let scan = args.head.commitScan;
  while (scan.before !== null) {
    let response: unknown;
    try {
      response = await args.octokit.graphql(PULL_REQUEST_COMMIT_PAGE_QUERY, {
        id: args.head.id,
        before: scan.before,
        request: { signal: args.signal },
      });
    } catch {
      return { state: "unavailable" };
    }
    const page = providerPullRequestNodePageSchema.safeParse(response);
    if (!page.success || page.data.node === null) {
      return { state: "unavailable" };
    }
    const identity = providerPullRequestResourceIdentitySchema.safeParse(page.data.node);
    const pullRequest = z
      .object({
        baseRefOid: providerGitObjectIdSchema,
        headRefOid: providerGitObjectIdSchema,
        commits: z.unknown(),
      })
      .safeParse(page.data.node);
    if (
      !identity.success ||
      !pullRequest.success ||
      identity.data.id !== args.head.id ||
      String(identity.data.repository.databaseId) !== args.ghRepoId ||
      identity.data.state !== "OPEN" ||
      pullRequest.data.baseRefOid !== args.head.baseRefOid ||
      pullRequest.data.headRefOid !== args.head.headRefOid
    ) {
      return { state: "unavailable" };
    }
    const next = normalizeGitHubPullRequestCommitPage(pullRequest.data.commits, scan);
    if (next.state === "unavailable") {
      return next;
    }
    scan = next;
  }
  return scan;
}

type HostingCommentBodiesByProvider = {
  cloudflare: HostingCommentBodies;
  netlify: HostingCommentBodies;
};

export async function readGitHubHostingCommentBodies(args: {
  octokit: Octokit;
  signal: AbortSignal;
  ghRepoId: string;
  scans: readonly {
    pullRequestId: string;
    scan: HostingCommentScan;
  }[];
}): Promise<Map<string, HostingCommentBodiesByProvider>> {
  const result = new Map<string, HostingCommentBodiesByProvider>();
  const commentOwners = new Map<
    string,
    { pullRequestId: string; provider: HostingCommentProvider }
  >();
  const duplicateCommentIds = new Set<string>();
  for (const { pullRequestId, scan } of args.scans) {
    if (scan.state === "unavailable") {
      result.set(pullRequestId, {
        cloudflare: { state: "unavailable" },
        netlify: { state: "unavailable" },
      });
      continue;
    }
    result.set(pullRequestId, {
      cloudflare: { state: "available", bodies: [] },
      netlify: { state: "available", bodies: [] },
    });
    for (const comment of scan.hostingComments) {
      const existingOwner = commentOwners.get(comment.commentId);
      if (existingOwner) {
        duplicateCommentIds.add(comment.commentId);
        const existingResult = result.get(existingOwner.pullRequestId);
        const currentResult = result.get(pullRequestId);
        if (!existingResult || !currentResult) {
          throw new Error("GitHub pull request comments lost requested identity.");
        }
        existingResult[existingOwner.provider] = { state: "unavailable" };
        currentResult[comment.provider] = { state: "unavailable" };
      } else {
        commentOwners.set(comment.commentId, {
          pullRequestId,
          provider: comment.provider,
        });
      }
    }
  }

  const requests = [...commentOwners.entries()]
    .filter(
      ([commentId, owner]) =>
        !duplicateCommentIds.has(commentId) &&
        result.get(owner.pullRequestId)?.[owner.provider].state === "available",
    )
    .map(([commentId, owner]) => ({ commentId, ...owner }));
  const bodiesByCommentId = new Map<string, string>();
  for (const provider of ["cloudflare", "netlify"] as const) {
    const providerRequests = requests.filter((request) => request.provider === provider);
    for (
      let offset = 0;
      offset < providerRequests.length;
      offset += GITHUB_PULL_REQUEST_COMMENT_PAGE_SIZE
    ) {
      const chunk = providerRequests.slice(offset, offset + GITHUB_PULL_REQUEST_COMMENT_PAGE_SIZE);
      let response: unknown;
      try {
        response = await args.octokit.graphql(PULL_REQUEST_COMMENT_BODIES_QUERY, {
          ids: chunk.map((request) => request.commentId),
          request: { signal: args.signal },
        });
      } catch (error) {
        try {
          response = recoverGitHubPullRequestGraphqlData(error);
        } catch {
          for (const request of chunk) {
            const providerResult = result.get(request.pullRequestId);
            if (!providerResult) {
              throw new Error("GitHub pull request comments lost requested identity.");
            }
            providerResult[request.provider] = { state: "unavailable" };
          }
          continue;
        }
      }

      for (const read of normalizeGitHubHostingCommentBodyReads(response, {
        ghRepoId: args.ghRepoId,
        requests: chunk,
      })) {
        if (read.state === "unavailable") {
          const providerResult = result.get(read.pullRequestId);
          if (!providerResult) {
            throw new Error("GitHub pull request comments lost requested identity.");
          }
          providerResult[read.provider] = { state: "unavailable" };
        } else {
          bodiesByCommentId.set(read.commentId, read.body);
        }
      }
    }
  }

  for (const { pullRequestId, scan } of args.scans) {
    if (scan.state === "unavailable") {
      continue;
    }
    const providerResult = result.get(pullRequestId);
    if (!providerResult) {
      throw new Error("GitHub pull request comments lost requested identity.");
    }
    for (const provider of ["cloudflare", "netlify"] as const) {
      if (providerResult[provider].state === "unavailable") {
        continue;
      }
      const commentIds = scan.hostingComments.flatMap((comment) =>
        comment.provider === provider ? [comment.commentId] : [],
      );
      const bodies = commentIds.flatMap((commentId) => {
        const body = bodiesByCommentId.get(commentId);
        return body === undefined ? [] : [body];
      });
      providerResult[provider] =
        bodies.length === commentIds.length
          ? { state: "available", bodies }
          : { state: "unavailable" };
    }
  }
  return result;
}

async function readGitHubPullRequestResourceHeadReads(args: {
  octokit: Octokit;
  signal: AbortSignal;
  ghRepoId: string;
  pullRequestIds: readonly string[];
}): Promise<PullRequestResourceHeadRead[]> {
  let response: unknown;
  try {
    response = await args.octokit.graphql(PULL_REQUEST_RESOURCE_HEADS_QUERY, {
      ids: args.pullRequestIds,
      request: { signal: args.signal },
    });
  } catch (error) {
    response = recoverGitHubPullRequestGraphqlData(error);
  }
  const seedReads = normalizeGitHubPullRequestResourceHeadReads(response, {
    ghRepoId: args.ghRepoId,
    pullRequestIds: args.pullRequestIds,
  });
  const seeds = seedReads.flatMap((read) => (read.state === "available" ? [read.head] : []));
  const completedSeeds = await allLimited(
    seeds.map((head) => async () => {
      const [hostingCommentScan, commitScan] = await Promise.all([
        completeGitHubHostingCommentScan({
          octokit: args.octokit,
          signal: args.signal,
          ghRepoId: args.ghRepoId,
          head,
        }),
        CLOUDFLARE_WORKER_PROOF_SOURCE === "checks"
          ? completeGitHubPullRequestCommitScan({
              octokit: args.octokit,
              signal: args.signal,
              ghRepoId: args.ghRepoId,
              head,
            })
          : Promise.resolve(head.commitScan),
      ]);
      return { ...head, hostingCommentScan, commitScan };
    }),
    6,
  );
  const completedSeedsById = new Map(completedSeeds.map((head) => [head.id, head]));
  const [commentsByPullRequestId, checkProofsByPullRequestId] = await Promise.all([
    readGitHubHostingCommentBodies({
      octokit: args.octokit,
      signal: args.signal,
      ghRepoId: args.ghRepoId,
      scans: completedSeeds.map((head) => ({
        pullRequestId: head.id,
        scan: head.hostingCommentScan,
      })),
    }),
    CLOUDFLARE_WORKER_PROOF_SOURCE === "checks"
      ? readGitHubCloudflareWorkerChecks({
          octokit: args.octokit,
          signal: args.signal,
          ghRepoId: args.ghRepoId,
          heads: completedSeeds,
        })
      : Promise.resolve(null),
  ]);
  const workerProofsByPullRequestId =
    checkProofsByPullRequestId ??
    new Map(
      completedSeeds.map((head) => {
        const comments = commentsByPullRequestId.get(head.id);
        if (!comments) {
          throw new Error("GitHub pull request comments lost requested identity.");
        }
        return [head.id, resolveCloudflareWorkerComments(comments.cloudflare)];
      }),
    );
  const parseFailures: HostingCommentParseFailure[] = [];
  const reads = seedReads.map((read): PullRequestResourceHeadRead => {
    if (read.state === "unavailable") {
      return read;
    }
    const completedHead = completedSeedsById.get(read.head.id);
    const comments = commentsByPullRequestId.get(read.head.id);
    const cloudflareWorkerProof = workerProofsByPullRequestId.get(read.head.id);
    if (!completedHead || !comments || !cloudflareWorkerProof) {
      throw new Error("GitHub pull request resources lost requested identity.");
    }
    const cloudflarePreviews = resolveCloudflarePagesPreviews(comments.cloudflare);
    const netlifyPreviews = resolveNetlifyHostingPreviews({
      comments: comments.netlify,
      pullRequestNumber: read.head.number,
    });
    const hostingCommentParseFailures = detectHostingCommentParseFailures({
      cloudflareComments: comments.cloudflare,
      cloudflareRead: cloudflarePreviews,
      netlifyComments: comments.netlify,
      netlifyRead: netlifyPreviews,
    });
    const workerCommentParseFailures =
      CLOUDFLARE_WORKER_PROOF_SOURCE === "comments"
        ? detectCloudflareWorkerCommentParseFailures({
            comments: comments.cloudflare,
            proof: cloudflareWorkerProof,
          })
        : [];
    const commentParseFailures = [...hostingCommentParseFailures, ...workerCommentParseFailures];
    parseFailures.push(...commentParseFailures);
    const cloudflareCommentFailed = commentParseFailures.some((failure) =>
      failure.providerFormat.startsWith("cloudflare_"),
    );
    const cloudflareRead = cloudflareCommentFailed
      ? ({ state: "unavailable" } as const)
      : cloudflarePreviews;
    return {
      state: "available",
      head: {
        id: read.head.id,
        number: read.head.number,
        isCrossRepository: read.head.isCrossRepository,
        baseRefOid: read.head.baseRefOid,
        headRefOid: read.head.headRefOid,
        headRepositoryId: read.head.headRepositoryId,
        headRefName: read.head.headRefName,
        cloudflareWorkerProof:
          CLOUDFLARE_WORKER_PROOF_SOURCE === "comments" && cloudflareCommentFailed
            ? { state: "unavailable" }
            : cloudflareWorkerProof,
        hostingPreviews: {
          cloudflare: cloudflareRead,
          netlify: netlifyPreviews,
        },
      },
    };
  });
  reportPullRequestHostingCommentParseFailures(parseFailures);
  return reads;
}

export const getPullRequestResources = action({
  access: "access_dashboard",
  args: {
    vaultId: id("vaults"),
    pullRequestIds: array(string()),
  },
  returns: array(vPullRequestResources),
  handler: async (ctx, args): Promise<PullRequestResourceRead[]> => {
    validatePullRequestResourceIds(args.pullRequestIds);

    const [context, githubAccess] = await Promise.all([
      ctx.runQuery(internal.vault.providerObservationQueries.readVaultProviderObservationContext, {
        vaultId: args.vaultId,
        userId: ctx.viewer.userId,
      }),
      resolveGitHubAppAccess(ctx, {
        userId: ctx.viewer.userId,
        target: { kind: "vault", vaultId: args.vaultId },
      }),
    ]);
    const signal = createGitHubRequestDeadlineSignal();
    const headReads = await readGitHubPullRequestResourceHeadReads({
      octokit: githubAccess.octokit,
      signal,
      ghRepoId: context.ghRepoId,
      pullRequestIds: args.pullRequestIds,
    });
    const heads = headReads.flatMap((read) => (read.state === "available" ? [read.head] : []));
    const resourcesByPullRequest = new Map<string, PullRequestResourceAccumulator>();
    for (const head of heads) {
      const hostingPreviews = buildPullRequestHostingPreviews({
        head,
        configuredWorkers: context.cloudflareWorkers,
      });
      const cloudflareWorkers = buildPullRequestCloudflareWorkerResources({
        cloudflare: head.cloudflareWorkerProof,
        workers: context.cloudflareWorkers,
      });
      resourcesByPullRequest.set(head.id, {
        cloudflareBuilds: { state: cloudflareWorkers.state },
        workers: cloudflareWorkers.state === "available" ? cloudflareWorkers.workers : [],
        convexProjects: [],
        hostingPreviews,
      });
    }

    const projectResources = await Promise.all(
      context.convexProjects.map(async (project) => {
        const connection = await ctx.runQuery(
          internal.organizationProviderCredentials.loadConvexForOrganizationTeam,
          {
            organizationId: context.organizationId,
            userId: ctx.viewer.userId,
            teamId: project.teamId,
          },
        );
        const credential = connection?.credential;
        if (!connection || !credential) {
          return unavailableConvexProjectResources({ heads, project });
        }
        const token = credential.auth.credential.trim();
        if (!token) {
          return unavailableConvexProjectResources({ heads, project });
        }

        return await readConvexProjectResourcesForHeads({
          project,
          heads,
          token,
          teamId: connection.teamId,
        });
      }),
    );
    context.convexProjects.forEach((project, projectIndex) => {
      heads.forEach((head, headIndex) => {
        const resource = projectResources[projectIndex][headIndex];
        if (resource.convexProjectId !== project.convexProjectId) {
          throw new Error("Pull request resources lost stable Convex project identity.");
        }
        const pullRequestResources = resourcesByPullRequest.get(head.id);
        if (!pullRequestResources) {
          throw new Error("Pull request resources lost requested identity.");
        }
        pullRequestResources.convexProjects.push(resource);
      });
    });

    return args.pullRequestIds.map((pullRequestId): PullRequestResourceRead => {
      const resources = resourcesByPullRequest.get(pullRequestId);
      return resources
        ? { state: "available", pullRequestId, ...resources }
        : { state: "unavailable", pullRequestId };
    });
  },
});
