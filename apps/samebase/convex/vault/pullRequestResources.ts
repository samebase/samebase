"use node";

import { Octokit } from "@octokit/rest";
import { v, type Infer } from "convex/values";
import { z } from "zod";

import { getConvexCodeRootDirectory } from "../../shared/convexCodeLocation";
import { internal } from "../_generated/api";
import { resolveCloudflareApiTransport } from "../cloudflareApi/client";
import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import {
  readRecentCloudflareWorkerBuilds,
  readCloudflareWorkerBuildsDiscoveryForIdentity,
  readCloudflareWorkerIdentity,
} from "../cloudflareResources";
import { action } from "../functions";
import { createGitHubRequestDeadlineSignal, fetchGitHubRepoIdentity } from "../githubRepoApi";
import { readConvexPreviewDeployments, readConvexProjectResource } from "./convexProjectResources";
import {
  matchCloudflareWorkerBuildForCommit,
  type CloudflareBuildMatch,
  vCloudflareBuildState,
} from "./cloudflareBuildMatching";
import {
  buildCloudflareBuildLogsUrl,
  buildConvexDeploymentDashboardUrl,
} from "./providerDashboardUrls";
import type { VaultProviderObservationContext } from "./providerObservationQueries";

const { array, id, literal, object, string, union } = v;

const CLOUDFLARE_GITHUB_APP_DATABASE_ID = 85455;
const CLOUDFLARE_GITHUB_BOT_NODE_ID = "MDM6Qm90NzMxMzk0MDI=";
const GITHUB_PULL_REQUEST_COMMENT_PAGE_SIZE = 100;
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
  object({ state: literal("unavailable") }),
);
const vCloudflareBuild = union(
  object({
    state: literal("available"),
    uuid: string(),
    buildState: vCloudflareBuildState,
    logsUrl: string(),
  }),
  object({ state: literal("absent") }),
  object({ state: literal("unavailable") }),
);
const stableWorkerIdentityFields = {
  workerId: id("vaultCloudflareWorkers"),
  workerName: string(),
};
const observedWorkerIdentityFields = {
  ...stableWorkerIdentityFields,
  rootDirectory: string(),
};
const vPullRequestWorkerResource = union(
  object({
    state: literal("available"),
    ...observedWorkerIdentityFields,
    cloudflareBuild: vCloudflareBuild,
    cloudflareBranchPreview: vCloudflareBranchPreview,
  }),
  object({
    state: literal("unavailable"),
    ...stableWorkerIdentityFields,
  }),
);
const vPullRequestResources = object({
  pullRequestId: string(),
  workers: array(vPullRequestWorkerResource),
  convexProjects: array(vPullRequestConvexResource),
});

export type PullRequestWorkerResource = Infer<typeof vPullRequestWorkerResource>;
export type PullRequestConvexResource = Infer<typeof vPullRequestConvexResource>;
export type PullRequestResources = Infer<typeof vPullRequestResources>;

const providerPullRequestResourceIdentitySchema = z.object({
  __typename: z.literal("PullRequest"),
  id: z.string().min(1),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  repository: z.object({ databaseId: z.number().int().positive() }),
});
const providerCloudflareCheckRunSchema = z.object({
  name: z.string().min(1),
  externalId: z.string().min(1).nullable(),
  status: z.string().min(1),
  conclusion: z.string().min(1).nullable(),
  summary: z.string().nullable(),
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
const providerPullRequestResourceHeadSchema = providerPullRequestResourceIdentitySchema.extend({
  url: z.url(),
  isCrossRepository: z.boolean(),
  state: z.literal("OPEN"),
  headRepository: z.object({ id: z.string().min(1) }).nullable(),
  headRefName: z.string().min(1),
  headRefOid: z.string().min(1),
  comments: z.unknown().optional(),
  commits: z.object({
    nodes: z.array(
      z.object({
        commit: z.object({
          oid: z.string().min(1),
          checkSuites: z.object({
            totalCount: z.number().int().nonnegative(),
            nodes: z.array(
              z.object({
                checkRuns: z.object({
                  totalCount: z.number().int().nonnegative(),
                  nodes: z.array(providerCloudflareCheckRunSchema),
                }),
              }),
            ),
          }),
        }),
      }),
    ),
  }),
});
const providerPullRequestResourceHeadsSchema = z.object({ nodes: z.array(z.unknown()) });
const providerPullRequestCommentPageSchema = z.object({ node: z.unknown() });
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
type ProviderCloudflareCheckRun = z.infer<typeof providerCloudflareCheckRunSchema>;
type PullRequestResourceHeadBase = Pick<
  ProviderPullRequestResourceHead,
  "id" | "url" | "isCrossRepository" | "headRefName" | "headRefOid"
> & {
  headRepositoryId: string | null;
  cloudflareChecks:
    | { state: "available"; runs: ProviderCloudflareCheckRun[] }
    | { state: "unavailable" };
};
type CloudflareCommentScan =
  | {
      state: "available";
      allCommentIds: string[];
      cloudflareCommentIds: string[];
      totalCount: number;
      after: string | null;
    }
  | { state: "unavailable" };
type PullRequestResourceHeadSeed = PullRequestResourceHeadBase & {
  cloudflareCommentScan: CloudflareCommentScan;
};
export type PullRequestResourceHead = PullRequestResourceHeadBase & {
  cloudflareComments: { state: "available"; bodies: string[] } | { state: "unavailable" };
};
type PullRequestResourceHeadRead =
  | { state: "available"; head: PullRequestResourceHead }
  | { state: "unavailable"; pullRequestId: string };
type PullRequestResourceHeadSeedRead =
  | { state: "available"; head: PullRequestResourceHeadSeed }
  | { state: "unavailable"; pullRequestId: string };

const PULL_REQUEST_RESOURCE_HEADS_QUERY = `
  query PullRequestResourceHeads(
    $ids: [ID!]!
    $cloudflareAppId: Int!
    $readCloudflareComments: Boolean!
  ) {
    nodes(ids: $ids) {
      __typename
      ... on PullRequest {
        id
        url
        isCrossRepository
        state
        repository { databaseId }
        headRepository { id }
        headRefName
        headRefOid
        comments(
          first: 100
          orderBy: { field: UPDATED_AT, direction: ASC }
        ) @include(if: $readCloudflareComments) {
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
        commits(last: 1) {
          nodes {
            commit {
              oid
              checkSuites(first: 20, filterBy: { appId: $cloudflareAppId }) {
                totalCount
                nodes {
                  checkRuns(first: 100) {
                    totalCount
                    nodes { name externalId status conclusion summary }
                  }
                }
              }
            }
          }
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
          first: 100
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

export function normalizeGitHubCloudflareCommentPage(
  value: unknown,
  previous?: Extract<CloudflareCommentScan, { state: "available" }>,
): CloudflareCommentScan {
  const parsed = providerPullRequestCommentConnectionSchema.safeParse(value);
  if (!parsed.success || (previous && parsed.data.totalCount !== previous.totalCount)) {
    return { state: "unavailable" };
  }

  const allCommentIds = [...(previous?.allCommentIds ?? [])];
  const cloudflareCommentIds = [...(previous?.cloudflareCommentIds ?? [])];
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
      if (comment.author.id === CLOUDFLARE_GITHUB_BOT_NODE_ID) {
        cloudflareCommentIds.push(comment.id);
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
    cloudflareCommentIds,
    totalCount: parsed.data.totalCount,
    after: hasNextPage ? endCursor : null,
  };
}

type CloudflareCommentBodyRequest = {
  commentId: string;
  pullRequestId: string;
};
type CloudflareCommentBodyRead =
  | (CloudflareCommentBodyRequest & { state: "available"; body: string })
  | (CloudflareCommentBodyRequest & { state: "unavailable" });

export function normalizeGitHubCloudflareCommentBodyReads(
  value: unknown,
  args: {
    ghRepoId: string;
    requests: readonly CloudflareCommentBodyRequest[];
  },
): CloudflareCommentBodyRead[] {
  const response = providerIssueCommentBodiesSchema.safeParse(value);
  if (!response.success || response.data.nodes.length !== args.requests.length) {
    return args.requests.map((request) => ({ ...request, state: "unavailable" }));
  }

  const requestsById = new Map<string, CloudflareCommentBodyRequest>();
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
      comment.data.author.id !== CLOUDFLARE_GITHUB_BOT_NODE_ID ||
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
  return args.requests.map((request): CloudflareCommentBodyRead => {
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
    readCloudflareComments: boolean;
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
    const commit = head.commits.nodes.at(0)?.commit;
    const completeCloudflareChecks =
      head.commits.nodes.length === 1 &&
      commit?.oid === head.headRefOid &&
      commit.checkSuites.totalCount === commit.checkSuites.nodes.length &&
      commit.checkSuites.nodes.every(
        (suite) => suite.checkRuns.totalCount === suite.checkRuns.nodes.length,
      );
    return {
      state: "available",
      head: {
        id: head.id,
        url: head.url,
        isCrossRepository: head.isCrossRepository,
        headRepositoryId: head.headRepository?.id ?? null,
        headRefName: head.headRefName,
        headRefOid: head.headRefOid,
        cloudflareChecks: completeCloudflareChecks
          ? {
              state: "available",
              runs: commit.checkSuites.nodes.flatMap((suite) => suite.checkRuns.nodes),
            }
          : { state: "unavailable" },
        cloudflareCommentScan: args.readCloudflareComments
          ? normalizeGitHubCloudflareCommentPage(head.comments)
          : {
              state: "available",
              allCommentIds: [],
              cloudflareCommentIds: [],
              totalCount: 0,
              after: null,
            },
      },
    };
  });
}

export function recoverGitHubPullRequestResourceHeadsFromError(error: unknown): unknown {
  const parsed = providerRecoverablePullRequestErrorSchema.safeParse(error);
  if (
    !parsed.success ||
    !parsed.data.errors.every(
      (providerError) =>
        (providerError.type === "NOT_FOUND" && providerError.path[0] === "nodes") ||
        (providerError.path[0] === "nodes" &&
          typeof providerError.path[1] === "number" &&
          providerError.path[2] === "comments"),
    )
  ) {
    throw error;
  }
  return parsed.data.data;
}

type StableWorker = VaultProviderObservationContext["cloudflareWorkers"][number];
type StableConvexProject = VaultProviderObservationContext["convexProjects"][number];
type AvailableWorkerResource = Extract<PullRequestWorkerResource, { state: "available" }>;
type PullRequestResourceAccumulator = {
  workers: PullRequestWorkerResource[];
  convexProjects: PullRequestConvexResource[];
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
type PullRequestProviderFailureOperation =
  | "read_cloudflare_worker_resources"
  | "read_convex_preview"
  | "resolve_cloudflare_connection";

function providerFailureKind(error: unknown): "error" | "timeout" | "unknown" {
  if (!(error instanceof Error)) {
    return "unknown";
  }
  return error.name === "AbortError" || error.name === "TimeoutError" ? "timeout" : "error";
}

function reportPullRequestProviderFailure(args: {
  operation: PullRequestProviderFailureOperation;
  error: unknown;
  workerId?: StableWorker["workerId"];
  convexProjectId?: string;
}): void {
  console.warn("Pull request resource provider read failed.", {
    operation: args.operation,
    failureKind: providerFailureKind(args.error),
    ...(args.workerId ? { workerId: args.workerId } : {}),
    ...(args.convexProjectId ? { convexProjectId: args.convexProjectId } : {}),
  });
}

function workerResourceIdentity(worker: StableWorker) {
  return {
    workerId: worker.workerId,
    workerName: worker.workerName,
  };
}

function observedWorkerResourceIdentity(worker: StableWorker, rootDirectory: string) {
  return {
    ...workerResourceIdentity(worker),
    rootDirectory,
  };
}

function convexProjectResourceIdentity(project: StableConvexProject) {
  return {
    convexProjectId: project.convexProjectId,
    rootDirectory: getConvexCodeRootDirectory(project.codeLocation),
  };
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
    (deployment) =>
      deployment.previewIdentifier === args.head.headRefName &&
      deployment.reference === `preview/${args.head.headRefName}`,
  );
  if (branchMatches.length === 0) {
    return { state: "absent" };
  }

  if (branchMatches.length > 1) {
    return { state: "unavailable", reason: "deployment_ambiguous" };
  }
  return { state: "branch", deployment: branchMatches[0] };
}

function normalizeCloudflareBranchPreviewUrl(url: string, workerName: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.port === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.hostname.endsWith(".workers.dev") &&
      parsed.hostname.includes(`-${workerName}.`)
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

export function resolveCloudflareBranchPreviewUrl(args: {
  checks: PullRequestResourceHead["cloudflareChecks"];
  workerName: string;
  build: Pick<Extract<CloudflareBuildMatch, { state: "available" }>, "buildUuid" | "buildState">;
}):
  | { state: "available"; url: string }
  | { state: "absent" }
  | {
      state: "unavailable";
      reason:
        | "checks_unavailable"
        | "check_ambiguous"
        | "provider_disagreement"
        | "url_ambiguous"
        | "url_malformed";
    } {
  if (args.build.buildState !== "success") {
    return { state: "absent" };
  }
  if (args.checks.state === "unavailable") {
    return { state: "unavailable", reason: "checks_unavailable" };
  }

  const checks = args.checks.runs.filter((check) => check.externalId === args.build.buildUuid);
  if (checks.length === 0) {
    return { state: "absent" };
  }
  if (checks.length > 1) {
    return { state: "unavailable", reason: "check_ambiguous" };
  }
  const check = checks[0];
  if (check.name !== `Workers Builds: ${args.workerName}`) {
    return { state: "unavailable", reason: "provider_disagreement" };
  }
  if (check.status !== "COMPLETED" || check.conclusion !== "SUCCESS") {
    return { state: "absent" };
  }

  const previewAliasLabel = "Preview Alias URL: ";
  const previewUrls = (check.summary ?? "")
    .split(/\r?\n/)
    .flatMap((line) =>
      line.startsWith(previewAliasLabel) ? [line.slice(previewAliasLabel.length).trim()] : [],
    );
  if (previewUrls.length === 0) {
    return { state: "absent" };
  }
  if (previewUrls.length > 1) {
    return { state: "unavailable", reason: "url_ambiguous" };
  }
  const previewUrl = normalizeCloudflareBranchPreviewUrl(previewUrls[0], args.workerName);
  return previewUrl === null
    ? { state: "unavailable", reason: "url_malformed" }
    : { state: "available", url: previewUrl };
}

function markdownTableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return null;
  }
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function isCloudflareCommentBuildLogsUrl(
  url: string,
  args: { accountId: string; workerName: string },
): boolean {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "dash.cloudflare.com" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.port !== "" ||
      parsed.hash !== ""
    ) {
      return false;
    }

    let target: string;
    if (parsed.pathname === "/") {
      const entries = [...parsed.searchParams.entries()];
      if (
        entries.length !== 1 ||
        entries[0][0] !== "to" ||
        /%(?:2f|5c)/i.test(parsed.search) ||
        /%(?:2f|5c)/i.test(entries[0][1])
      ) {
        return false;
      }
      target = entries[0][1];
    } else {
      if (parsed.search !== "" || /%(?:2f|5c)/i.test(parsed.pathname)) {
        return false;
      }
      target = parsed.pathname;
    }

    const buildPrefix = `/${args.accountId}/workers/services/view/${args.workerName}/production/builds/`;
    const buildId = target.startsWith(buildPrefix) ? target.slice(buildPrefix.length) : "";
    return /^[A-Za-z0-9-]+$/.test(buildId);
  } catch {
    return false;
  }
}

export function resolveCloudflareCommentBranchPreviewUrl(args: {
  comments: PullRequestResourceHead["cloudflareComments"];
  accountId: string;
  workerName: string;
}):
  | { state: "available"; url: string }
  | { state: "absent" }
  | {
      state: "unavailable";
      reason: "comments_unavailable" | "provider_disagreement" | "url_ambiguous" | "url_malformed";
    } {
  if (args.comments.state === "unavailable") {
    return { state: "unavailable", reason: "comments_unavailable" };
  }

  const urls = new Set<string>();
  for (const body of args.comments.bodies) {
    const lines = body.split(/\r?\n/);
    for (let headerIndex = 0; headerIndex + 2 < lines.length; headerIndex += 1) {
      const header = markdownTableCells(lines[headerIndex]);
      const separator = markdownTableCells(lines[headerIndex + 1]);
      if (!header || !separator || header.length !== separator.length) {
        continue;
      }
      const nameColumns = header.flatMap((cell, index) => (cell === "Name" ? [index] : []));
      const previewColumns = header.flatMap((cell, index) =>
        cell === "Preview URL" ? [index] : [],
      );
      const statusColumns = header.flatMap((cell, index) => (cell === "Status" ? [index] : []));
      if (
        nameColumns.length !== 1 ||
        previewColumns.length !== 1 ||
        statusColumns.length !== 1 ||
        !separator.every((cell) => /^:?-+:?$/.test(cell))
      ) {
        continue;
      }

      for (let rowIndex = headerIndex + 2; rowIndex < lines.length; rowIndex += 1) {
        const row = markdownTableCells(lines[rowIndex]);
        if (!row || row.length !== header.length) {
          break;
        }
        if (row[nameColumns[0]] !== args.workerName) {
          continue;
        }
        const previewCell = row[previewColumns[0]];
        if (!previewCell.includes("Branch Preview URL")) {
          continue;
        }
        const logsCell = row[statusColumns[0]];
        const buildLogsAnchors = [...logsCell.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)];
        const buildLogsLabelCount = [...logsCell.matchAll(/View logs/g)].length;
        if (
          buildLogsAnchors.length !== buildLogsLabelCount ||
          buildLogsAnchors.length !== 1 ||
          buildLogsAnchors[0][1] !== "View logs" ||
          !isCloudflareCommentBuildLogsUrl(buildLogsAnchors[0][2], {
            accountId: args.accountId,
            workerName: args.workerName,
          })
        ) {
          return { state: "unavailable", reason: "provider_disagreement" };
        }
        const branchPreviewAnchor = /<a href=(['"])([^'"]+)\1>Branch Preview URL<\/a>/g;
        const branchPreviewAnchors = [...previewCell.matchAll(branchPreviewAnchor)];
        const branchPreviewLabelCount = [...previewCell.matchAll(/Branch Preview URL/g)].length;
        if (
          branchPreviewAnchors.length !== branchPreviewLabelCount ||
          branchPreviewAnchors.length === 0
        ) {
          return { state: "unavailable", reason: "url_malformed" };
        }
        for (const match of branchPreviewAnchors) {
          const url = match[2];
          const normalized = normalizeCloudflareBranchPreviewUrl(url, args.workerName);
          if (normalized === null) {
            return { state: "unavailable", reason: "url_malformed" };
          }
          urls.add(normalized);
        }
      }
    }
  }

  if (urls.size === 0) {
    return { state: "absent" };
  }
  if (urls.size > 1) {
    return { state: "unavailable", reason: "url_ambiguous" };
  }
  return { state: "available", url: [...urls][0] };
}

type CloudflareBranchPreviewResolution =
  | { state: "available"; url: string }
  | { state: "absent" }
  | { state: "unavailable" };

export function resolveCloudflareWorkerObservation(args: {
  accountId: string;
  workerName: string;
  match: CloudflareBuildMatch;
  buildsExhausted: boolean;
  previewUrlsEnabled: boolean | undefined;
  checks: PullRequestResourceHead["cloudflareChecks"];
  comments: PullRequestResourceHead["cloudflareComments"];
  commentFallbackHasUniqueWorkerName: boolean;
}):
  | {
      state: "available";
      cloudflareBuild: AvailableWorkerResource["cloudflareBuild"];
      cloudflareBranchPreview: AvailableWorkerResource["cloudflareBranchPreview"];
    }
  | { state: "unavailable" } {
  if (args.match.state === "provider_disagreement") {
    return { state: "unavailable" };
  }

  const cloudflareBuild: AvailableWorkerResource["cloudflareBuild"] =
    args.match.state === "absent"
      ? args.buildsExhausted
        ? { state: "absent" }
        : { state: "unavailable" }
      : {
          state: "available",
          uuid: args.match.buildUuid,
          buildState: args.match.buildState,
          logsUrl: buildCloudflareBuildLogsUrl({
            accountId: args.accountId,
            workerName: args.workerName,
            buildUuid: args.match.buildUuid,
          }),
        };

  if (args.previewUrlsEnabled === false) {
    return {
      state: "available",
      cloudflareBuild,
      cloudflareBranchPreview: { state: "absent" },
    };
  }

  let currentCheck: CloudflareBranchPreviewResolution | null = null;
  if (args.match.state === "available") {
    const resolved = resolveCloudflareBranchPreviewUrl({
      checks: args.checks,
      workerName: args.workerName,
      build: args.match,
    });
    currentCheck =
      resolved.state === "available"
        ? { state: "available", url: resolved.url }
        : resolved.state === "absent"
          ? { state: "absent" }
          : { state: "unavailable" };
  }

  let cloudflareBranchPreview: AvailableWorkerResource["cloudflareBranchPreview"];
  if (currentCheck?.state === "available") {
    cloudflareBranchPreview = currentCheck;
  } else if (currentCheck?.state === "unavailable") {
    cloudflareBranchPreview = { state: "unavailable" };
  } else if (!args.commentFallbackHasUniqueWorkerName) {
    cloudflareBranchPreview = { state: "unavailable" };
  } else {
    const comment = resolveCloudflareCommentBranchPreviewUrl({
      comments: args.comments,
      accountId: args.accountId,
      workerName: args.workerName,
    });
    cloudflareBranchPreview =
      comment.state === "available"
        ? { state: "available", url: comment.url }
        : comment.state === "absent"
          ? { state: "absent" }
          : { state: "unavailable" };
  }

  return {
    state: "available",
    cloudflareBuild,
    cloudflareBranchPreview,
  };
}

function unavailableWorkerResources(args: {
  heads: readonly PullRequestResourceHead[];
  worker: StableWorker;
}): PullRequestWorkerResource[] {
  const identity = workerResourceIdentity(args.worker);
  return args.heads.map(() => ({
    state: "unavailable",
    ...identity,
  }));
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
    reportPullRequestProviderFailure({
      operation: "read_convex_preview",
      error,
      convexProjectId: args.project.convexProjectId,
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

async function readWorkerResourcesForHeads(args: {
  context: VaultProviderObservationContext;
  worker: StableWorker;
  heads: readonly PullRequestResourceHead[];
  defaultBranch: string;
  cloudflareToken: string;
  cloudflareTransport: ReturnType<typeof resolveCloudflareApiTransport>;
}): Promise<PullRequestWorkerResource[]> {
  const identity = await readCloudflareWorkerIdentity({
    token: args.cloudflareToken,
    transport: args.cloudflareTransport,
    accountId: args.worker.accountId,
    workerName: args.worker.workerName,
  });
  if (!identity || identity.workerTag !== args.worker.workerTag) {
    return unavailableWorkerResources({
      heads: args.heads,
      worker: args.worker,
    });
  }

  const discovery = await readCloudflareWorkerBuildsDiscoveryForIdentity({
    token: args.cloudflareToken,
    transport: args.cloudflareTransport,
    accountId: args.worker.accountId,
    workerTag: args.worker.workerTag,
    defaultBranch: args.defaultBranch,
    expectedRepoId: args.context.ghRepoId,
  });
  const repository = discovery.repository;
  const connectedBuilds = discovery.builds;
  if (repository.state !== "ready" || connectedBuilds.state !== "connected") {
    return unavailableWorkerResources({
      heads: args.heads,
      worker: args.worker,
    });
  }

  const { builds, exhausted } = await readRecentCloudflareWorkerBuilds({
    token: args.cloudflareToken,
    transport: args.cloudflareTransport,
    accountId: args.worker.accountId,
    workerTag: args.worker.workerTag,
  });

  const identityFields = observedWorkerResourceIdentity(args.worker, repository.rootDirectory);
  const commentFallbackHasUniqueWorkerName =
    args.context.cloudflareWorkers.filter((worker) => worker.workerName === args.worker.workerName)
      .length === 1;
  return args.heads.map((head): PullRequestWorkerResource => {
    const match = matchCloudflareWorkerBuildForCommit({
      builds,
      branch: head.headRefName,
      commitHash: head.headRefOid,
      worker: {
        workerTag: args.worker.workerTag,
        rootDirectory: repository.rootDirectory,
      },
      ghRepoId: args.context.ghRepoId,
      triggerUuid: connectedBuilds.previewTriggerUuid,
    });
    const observation = resolveCloudflareWorkerObservation({
      accountId: args.worker.accountId,
      workerName: args.worker.workerName,
      match,
      buildsExhausted: exhausted,
      previewUrlsEnabled: identity.previewUrlsEnabled,
      checks: head.cloudflareChecks,
      comments: head.cloudflareComments,
      commentFallbackHasUniqueWorkerName,
    });
    if (observation.state === "unavailable") {
      return {
        state: "unavailable",
        ...workerResourceIdentity(args.worker),
      };
    }

    return {
      state: observation.state,
      ...identityFields,
      cloudflareBuild: observation.cloudflareBuild,
      cloudflareBranchPreview: observation.cloudflareBranchPreview,
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

async function completeGitHubCloudflareCommentScan(args: {
  octokit: Octokit;
  signal: AbortSignal;
  ghRepoId: string;
  head: PullRequestResourceHeadSeed;
}): Promise<CloudflareCommentScan> {
  if (args.head.cloudflareCommentScan.state === "unavailable") {
    return args.head.cloudflareCommentScan;
  }

  let scan = args.head.cloudflareCommentScan;
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
    const page = providerPullRequestCommentPageSchema.safeParse(response);
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
    const next = normalizeGitHubCloudflareCommentPage(comments.data.comments, scan);
    if (next.state === "unavailable") {
      return next;
    }
    scan = next;
  }
  return scan;
}

async function readGitHubCloudflareCommentBodies(args: {
  octokit: Octokit;
  signal: AbortSignal;
  ghRepoId: string;
  scans: readonly {
    pullRequestId: string;
    scan: CloudflareCommentScan;
  }[];
}): Promise<Map<string, PullRequestResourceHead["cloudflareComments"]>> {
  const result = new Map<string, PullRequestResourceHead["cloudflareComments"]>();
  const commentOwners = new Map<string, string>();
  const duplicateCommentIds = new Set<string>();
  for (const { pullRequestId, scan } of args.scans) {
    if (scan.state === "unavailable") {
      result.set(pullRequestId, { state: "unavailable" });
      continue;
    }
    result.set(pullRequestId, { state: "available", bodies: [] });
    for (const commentId of scan.cloudflareCommentIds) {
      const existingOwner = commentOwners.get(commentId);
      if (existingOwner) {
        duplicateCommentIds.add(commentId);
        result.set(existingOwner, { state: "unavailable" });
        result.set(pullRequestId, { state: "unavailable" });
      } else {
        commentOwners.set(commentId, pullRequestId);
      }
    }
  }

  const requests = [...commentOwners.entries()]
    .filter(
      ([commentId, pullRequestId]) =>
        !duplicateCommentIds.has(commentId) && result.get(pullRequestId)?.state === "available",
    )
    .map(([commentId, pullRequestId]) => ({ commentId, pullRequestId }));
  const bodiesByCommentId = new Map<string, string>();
  for (let offset = 0; offset < requests.length; offset += GITHUB_PULL_REQUEST_COMMENT_PAGE_SIZE) {
    const chunk = requests.slice(offset, offset + GITHUB_PULL_REQUEST_COMMENT_PAGE_SIZE);
    let response: unknown;
    try {
      response = await args.octokit.graphql(PULL_REQUEST_COMMENT_BODIES_QUERY, {
        ids: chunk.map((request) => request.commentId),
        request: { signal: args.signal },
      });
    } catch (error) {
      try {
        response = recoverGitHubPullRequestResourceHeadsFromError(error);
      } catch {
        for (const request of chunk) {
          result.set(request.pullRequestId, { state: "unavailable" });
        }
        continue;
      }
    }

    for (const read of normalizeGitHubCloudflareCommentBodyReads(response, {
      ghRepoId: args.ghRepoId,
      requests: chunk,
    })) {
      if (read.state === "unavailable") {
        result.set(read.pullRequestId, { state: "unavailable" });
      } else {
        bodiesByCommentId.set(read.commentId, read.body);
      }
    }
  }

  for (const { pullRequestId, scan } of args.scans) {
    if (scan.state === "unavailable" || result.get(pullRequestId)?.state === "unavailable") {
      continue;
    }
    const bodies = scan.cloudflareCommentIds.flatMap((commentId) => {
      const body = bodiesByCommentId.get(commentId);
      return body === undefined ? [] : [body];
    });
    result.set(
      pullRequestId,
      bodies.length === scan.cloudflareCommentIds.length
        ? { state: "available", bodies }
        : { state: "unavailable" },
    );
  }
  return result;
}

async function readGitHubPullRequestResourceHeadReads(args: {
  octokit: Octokit;
  signal: AbortSignal;
  ghRepoId: string;
  pullRequestIds: readonly string[];
  readCloudflareComments: boolean;
}): Promise<PullRequestResourceHeadRead[]> {
  let response: unknown;
  try {
    response = await args.octokit.graphql(PULL_REQUEST_RESOURCE_HEADS_QUERY, {
      ids: args.pullRequestIds,
      cloudflareAppId: CLOUDFLARE_GITHUB_APP_DATABASE_ID,
      readCloudflareComments: args.readCloudflareComments,
      request: { signal: args.signal },
    });
  } catch (error) {
    response = recoverGitHubPullRequestResourceHeadsFromError(error);
  }
  const seedReads = normalizeGitHubPullRequestResourceHeadReads(response, {
    ghRepoId: args.ghRepoId,
    pullRequestIds: args.pullRequestIds,
    readCloudflareComments: args.readCloudflareComments,
  });
  const seeds = seedReads.flatMap((read) => (read.state === "available" ? [read.head] : []));
  const scans = await Promise.all(
    seeds.map(async (head) => ({
      pullRequestId: head.id,
      scan: await completeGitHubCloudflareCommentScan({
        octokit: args.octokit,
        signal: args.signal,
        ghRepoId: args.ghRepoId,
        head,
      }),
    })),
  );
  const commentsByPullRequestId = await readGitHubCloudflareCommentBodies({
    octokit: args.octokit,
    signal: args.signal,
    ghRepoId: args.ghRepoId,
    scans,
  });
  return seedReads.map((read): PullRequestResourceHeadRead => {
    if (read.state === "unavailable") {
      return read;
    }
    const cloudflareComments = commentsByPullRequestId.get(read.head.id);
    if (!cloudflareComments) {
      throw new Error("GitHub pull request comments lost requested identity.");
    }
    return {
      state: "available",
      head: {
        id: read.head.id,
        url: read.head.url,
        isCrossRepository: read.head.isCrossRepository,
        headRepositoryId: read.head.headRepositoryId,
        headRefName: read.head.headRefName,
        headRefOid: read.head.headRefOid,
        cloudflareChecks: read.head.cloudflareChecks,
        cloudflareComments,
      },
    };
  });
}

export const getPullRequestResources = action({
  access: "access_dashboard",
  args: {
    vaultId: id("vaults"),
    pullRequestIds: array(string()),
  },
  returns: array(vPullRequestResources),
  handler: async (ctx, args): Promise<PullRequestResources[]> => {
    validatePullRequestResourceIds(args.pullRequestIds);

    const [context, githubConnection, cloudflareConnection, convexConnection] = await Promise.all([
      ctx.runQuery(internal.vault.providerObservationQueries.readVaultProviderObservationContext, {
        vaultId: args.vaultId,
        userId: ctx.viewer.userId,
      }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId: ctx.viewer.userId,
        kind: "github",
      }),
      ctx
        .runAction(internal.cloudflareOAuth.resolveConnectionForUser, {
          userId: ctx.viewer.userId,
        })
        .catch((error) => {
          reportPullRequestProviderFailure({
            operation: "resolve_cloudflare_connection",
            error,
          });
          return null;
        }),
      ctx.runQuery(internal.providerConnections.getByUserAndKind, {
        userId: ctx.viewer.userId,
        kind: "convex",
      }),
    ]);
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub connection unavailable.");
    }
    const cloudflareToken = cloudflareConnection?.auth.credential.trim() ?? "";
    const octokit = new Octokit({ auth: githubConnection.auth.credential });
    const signal = createGitHubRequestDeadlineSignal();
    const [repository, headReads] = await Promise.all([
      fetchGitHubRepoIdentity({
        githubAccessToken: githubConnection.auth.credential,
        owner: context.owner,
        repo: context.name,
        expectedRepoId: context.ghRepoId,
        signal,
      }),
      readGitHubPullRequestResourceHeadReads({
        octokit,
        signal,
        ghRepoId: context.ghRepoId,
        pullRequestIds: args.pullRequestIds,
        readCloudflareComments:
          context.cloudflareWorkers.length > 0 &&
          cloudflareConnection !== null &&
          cloudflareToken !== "",
      }),
    ]);
    const heads = headReads.flatMap((read) => (read.state === "available" ? [read.head] : []));
    const convexToken =
      convexConnection?.kind === "convex" ? convexConnection.auth.credential.trim() : "";
    const convexTeamId = convexConnection?.kind === "convex" ? convexConnection.teamId.trim() : "";
    const resourcesByPullRequest = new Map<string, PullRequestResourceAccumulator>();
    for (const pullRequestId of args.pullRequestIds) {
      resourcesByPullRequest.set(pullRequestId, { workers: [], convexProjects: [] });
    }
    for (const read of headReads) {
      if (read.state === "available") {
        continue;
      }
      const resources = resourcesByPullRequest.get(read.pullRequestId);
      if (!resources) {
        throw new Error("Pull request resources lost requested identity.");
      }
      for (const worker of context.cloudflareWorkers) {
        resources.workers.push({ state: "unavailable", ...workerResourceIdentity(worker) });
      }
      for (const project of context.convexProjects) {
        resources.convexProjects.push({
          state: "unavailable",
          ...convexProjectResourceIdentity(project),
        });
      }
    }

    if (!cloudflareConnection || !cloudflareToken) {
      for (const worker of context.cloudflareWorkers) {
        const resources = unavailableWorkerResources({
          heads,
          worker,
        });
        heads.forEach((head, index) => {
          const pullRequestResources = resourcesByPullRequest.get(head.id);
          if (!pullRequestResources) {
            throw new Error("Pull request resources lost requested identity.");
          }
          pullRequestResources.workers.push(resources[index]);
        });
      }
    } else {
      const cloudflareTransport = resolveCloudflareApiTransport(cloudflareConnection.auth.method);
      const workerResources = await Promise.all(
        context.cloudflareWorkers.map(async (worker) => {
          try {
            return await readWorkerResourcesForHeads({
              context,
              worker,
              heads,
              defaultBranch: repository.defaultBranch,
              cloudflareToken,
              cloudflareTransport,
            });
          } catch (error) {
            reportPullRequestProviderFailure({
              operation: "read_cloudflare_worker_resources",
              error,
              workerId: worker.workerId,
            });
            return unavailableWorkerResources({
              heads,
              worker,
            });
          }
        }),
      );
      context.cloudflareWorkers.forEach((worker, workerIndex) => {
        heads.forEach((head, headIndex) => {
          const resource = workerResources[workerIndex][headIndex];
          if (resource.workerId !== worker.workerId) {
            throw new Error("Pull request resources lost stable Worker identity.");
          }
          const pullRequestResources = resourcesByPullRequest.get(head.id);
          if (!pullRequestResources) {
            throw new Error("Pull request resources lost requested identity.");
          }
          pullRequestResources.workers.push(resource);
        });
      });
    }

    if (!convexToken || !convexTeamId) {
      for (const project of context.convexProjects) {
        const resources = unavailableConvexProjectResources({ heads, project });
        heads.forEach((head, index) => {
          const pullRequestResources = resourcesByPullRequest.get(head.id);
          if (!pullRequestResources) {
            throw new Error("Pull request resources lost requested identity.");
          }
          pullRequestResources.convexProjects.push(resources[index]);
        });
      }
    } else {
      const projectResources = await Promise.all(
        context.convexProjects.map((project) =>
          readConvexProjectResourcesForHeads({
            project,
            heads,
            token: convexToken,
            teamId: convexTeamId,
          }),
        ),
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
    }

    return args.pullRequestIds.map((pullRequestId) => {
      const resources = resourcesByPullRequest.get(pullRequestId);
      if (!resources) {
        throw new Error("Pull request resources lost requested identity.");
      }
      return { pullRequestId, ...resources };
    });
  },
});
