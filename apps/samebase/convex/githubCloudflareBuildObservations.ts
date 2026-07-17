import { z } from "zod";

import type {
  GitHubCloudflareBuildCheckRun,
  PullRequestHeadIdentity,
} from "./repositoryObservations";

const CLOUDFLARE_WORKERS_GITHUB_APP_ID = 85455;
const GITHUB_CLOUDFLARE_MAX_HEADS = 25;
const GITHUB_CLOUDFLARE_SUITE_PAGE_SIZE = 10;
const GITHUB_CLOUDFLARE_CHECK_RUN_PAGE_SIZE = 100;

const pageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});

const checkRunSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.string().min(1),
  conclusion: z.string().nullable(),
  summary: z.string().nullable(),
});

const checkSuiteSchema = z.object({
  id: z.string().min(1),
  branch: z.object({ name: z.string().min(1) }).nullable(),
  checkRuns: z.object({
    totalCount: z.number().int().nonnegative(),
    pageInfo: pageInfoSchema,
    nodes: z.array(checkRunSchema),
  }),
});

const pullRequestSchema = z.object({
  __typename: z.literal("PullRequest"),
  id: z.string().min(1),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  repository: z.object({ id: z.string().min(1) }),
  headRefName: z.string().min(1),
  headRefOid: z.string().min(1),
  headRepository: z.object({ id: z.string().min(1) }).nullable(),
  commits: z.object({
    nodes: z.array(
      z.object({
        commit: z.object({
          id: z.string().min(1),
          oid: z.string().min(1),
          repository: z.object({ id: z.string().min(1) }),
        }),
      }),
    ),
  }),
});

const commitSchema = z.object({
  __typename: z.literal("Commit"),
  id: z.string().min(1),
  oid: z.string().min(1),
  repository: z.object({ id: z.string().min(1) }),
  checkSuites: z.object({
    totalCount: z.number().int().nonnegative(),
    pageInfo: pageInfoSchema,
    nodes: z.array(checkSuiteSchema),
  }),
});

const nodeIdentitySchema = z.object({
  __typename: z.string(),
  id: z.string().min(1),
});

const batchSchema = z.object({
  repository: z
    .object({
      id: z.string().min(1),
      databaseId: z.number().int().positive(),
      nameWithOwner: z.string().min(3),
    })
    .nullable(),
  pullRequests: z.array(z.unknown()),
  commits: z.array(z.unknown()),
});

const rateLimitErrorSchema = z.object({
  name: z.literal("GitHubGraphqlRateLimitError"),
  retryAt: z.number().int().nonnegative(),
});

const repositoryInputSchema = z.object({
  owner: z
    .string()
    .trim()
    .min(1)
    .regex(/^[^/]+$/),
  name: z
    .string()
    .trim()
    .min(1)
    .regex(/^[^/]+$/),
  expectedRepositoryDatabaseId: z.string().regex(/^[1-9][0-9]*$/),
});

const GITHUB_CLOUDFLARE_BUILD_OBSERVATIONS_QUERY = `
  query CloudflareBuildObservations(
    $owner: String!
    $name: String!
    $pullRequestIds: [ID!]!
    $commitIds: [ID!]!
    $checkRunType: CheckRunType!
  ) {
    repository(owner: $owner, name: $name) {
      id
      databaseId
      nameWithOwner
    }
    pullRequests: nodes(ids: $pullRequestIds) {
      __typename
      ... on PullRequest {
        id
        state
        repository { id }
        headRefName
        headRefOid
        headRepository { id }
        commits(last: 1) {
          nodes {
            commit {
              id
              oid
              repository { id }
            }
          }
        }
      }
    }
    commits: nodes(ids: $commitIds) {
      __typename
      ... on Commit {
        id
        oid
        repository { id }
        checkSuites(
          first: ${GITHUB_CLOUDFLARE_SUITE_PAGE_SIZE}
          filterBy: { appId: ${CLOUDFLARE_WORKERS_GITHUB_APP_ID} }
        ) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            branch { name }
            checkRuns(
              first: ${GITHUB_CLOUDFLARE_CHECK_RUN_PAGE_SIZE}
              filterBy: { checkType: $checkRunType }
            ) {
              totalCount
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                name
                status
                conclusion
                summary
              }
            }
          }
        }
      }
    }
    rateLimit { cost limit remaining resetAt }
  }
`;

type GitHubCloudflareBuildGraphqlVariables = {
  owner: string;
  name: string;
  pullRequestIds: readonly string[];
  commitIds: readonly string[];
  checkRunType: "LATEST";
};

export type GitHubCloudflareBuildGraphqlRequest = (
  query: string,
  variables: GitHubCloudflareBuildGraphqlVariables,
) => Promise<unknown>;

export type GitHubCloudflareBuildCheckRunObservation = {
  suiteNodeId: string;
  checkRun: GitHubCloudflareBuildCheckRun;
};

export type GitHubCloudflareBuildHeadObservation =
  | {
      state: "complete";
      head: PullRequestHeadIdentity;
      checkRuns: GitHubCloudflareBuildCheckRunObservation[];
    }
  | {
      state: "head_unavailable";
      head: PullRequestHeadIdentity;
    }
  | {
      state: "identity_mismatch";
      head: PullRequestHeadIdentity;
    }
  | {
      state: "incomplete";
      head: PullRequestHeadIdentity;
      reason: "check_suite_pagination" | "check_run_pagination";
    }
  | {
      state: "invalid_response";
      head: PullRequestHeadIdentity;
    };

export type GitHubCloudflareBuildObservationBatch =
  | {
      state: "complete";
      observations: GitHubCloudflareBuildHeadObservation[];
    }
  | {
      state: "invalid_request";
      reason: "invalid_repository" | "too_many_heads";
    }
  | {
      state: "repository_unavailable";
    }
  | {
      state: "repository_identity_mismatch";
    }
  | {
      state: "rate_limited";
      retryAt: number;
    }
  | {
      state: "request_failed";
    }
  | {
      state: "invalid_response";
    };

function connectionIsComplete(connection: {
  totalCount: number;
  pageInfo: z.infer<typeof pageInfoSchema>;
  nodes: readonly unknown[];
}): boolean {
  return !connection.pageInfo.hasNextPage && connection.nodes.length === connection.totalCount;
}

function toCheckRunObservation(args: {
  suite: z.infer<typeof checkSuiteSchema>;
  head: PullRequestHeadIdentity;
  checkRun: z.infer<typeof checkRunSchema>;
}): GitHubCloudflareBuildCheckRunObservation {
  const suiteBranch = args.suite.branch?.name ?? null;
  const branch =
    suiteBranch === null
      ? { state: "unknown" as const }
      : suiteBranch === args.head.headRefName
        ? { state: "known" as const, name: suiteBranch }
        : { state: "conflicting_evidence" as const, suiteBranch };

  return {
    suiteNodeId: args.suite.id,
    checkRun: {
      id: args.checkRun.id,
      name: args.checkRun.name,
      status: args.checkRun.status,
      conclusion: args.checkRun.conclusion,
      ...(args.checkRun.summary === null ? {} : { outputSummary: args.checkRun.summary }),
      branch,
    },
  };
}

function observeCommitForHead(args: {
  pullRequest: z.infer<typeof pullRequestSchema>;
  commit: z.infer<typeof commitSchema>;
  head: PullRequestHeadIdentity;
  repositoryNodeId: string;
}): GitHubCloudflareBuildHeadObservation {
  const latestCommits = args.pullRequest.commits.nodes;
  if (latestCommits.length !== 1) {
    return { state: "invalid_response", head: args.head };
  }
  const latestCommit = latestCommits[0].commit;
  if (
    args.head.baseRepositoryNodeId !== args.repositoryNodeId ||
    args.pullRequest.id !== args.head.pullRequestNodeId ||
    args.pullRequest.state !== "OPEN" ||
    args.pullRequest.repository.id !== args.repositoryNodeId ||
    args.pullRequest.headRefName !== args.head.headRefName ||
    args.pullRequest.headRefOid !== args.head.headOid ||
    (args.pullRequest.headRepository !== null &&
      args.pullRequest.headRepository.id !== args.head.headRepositoryNodeId) ||
    latestCommit.id !== args.head.headCommitNodeId ||
    latestCommit.oid !== args.head.headOid ||
    latestCommit.repository.id !== args.head.headRepositoryNodeId ||
    args.commit.id !== args.head.headCommitNodeId ||
    args.commit.oid !== args.head.headOid ||
    args.commit.repository.id !== args.head.headRepositoryNodeId
  ) {
    return { state: "identity_mismatch", head: args.head };
  }

  if (!connectionIsComplete(args.commit.checkSuites)) {
    return {
      state: "incomplete",
      head: args.head,
      reason: "check_suite_pagination",
    };
  }

  const seenSuiteIds = new Set<string>();
  const seenCheckRunIds = new Set<string>();
  const checkRuns: GitHubCloudflareBuildCheckRunObservation[] = [];

  for (const suite of args.commit.checkSuites.nodes) {
    if (seenSuiteIds.has(suite.id)) {
      return { state: "invalid_response", head: args.head };
    }
    seenSuiteIds.add(suite.id);

    if (!connectionIsComplete(suite.checkRuns)) {
      return {
        state: "incomplete",
        head: args.head,
        reason: "check_run_pagination",
      };
    }

    for (const checkRun of suite.checkRuns.nodes) {
      if (seenCheckRunIds.has(checkRun.id)) {
        return { state: "invalid_response", head: args.head };
      }
      seenCheckRunIds.add(checkRun.id);
      checkRuns.push(toCheckRunObservation({ suite, head: args.head, checkRun }));
    }
  }

  checkRuns.sort(
    (left, right) =>
      left.suiteNodeId.localeCompare(right.suiteNodeId) ||
      left.checkRun.id.localeCompare(right.checkRun.id),
  );

  return { state: "complete", head: args.head, checkRuns };
}

export async function fetchGitHubCloudflareBuildObservations(args: {
  requestGraphql: GitHubCloudflareBuildGraphqlRequest;
  owner: string;
  name: string;
  expectedRepositoryDatabaseId: string;
  heads: readonly PullRequestHeadIdentity[];
}): Promise<GitHubCloudflareBuildObservationBatch> {
  const repositoryInput = repositoryInputSchema.safeParse({
    owner: args.owner,
    name: args.name,
    expectedRepositoryDatabaseId: args.expectedRepositoryDatabaseId,
  });
  if (!repositoryInput.success) {
    return { state: "invalid_request", reason: "invalid_repository" };
  }
  if (args.heads.length > GITHUB_CLOUDFLARE_MAX_HEADS) {
    return { state: "invalid_request", reason: "too_many_heads" };
  }
  if (args.heads.length === 0) {
    return { state: "complete", observations: [] };
  }

  const pullRequestIds = [...new Set(args.heads.map((head) => head.pullRequestNodeId))];
  const commitIds = [...new Set(args.heads.map((head) => head.headCommitNodeId))];
  let response: unknown;
  try {
    response = await args.requestGraphql(GITHUB_CLOUDFLARE_BUILD_OBSERVATIONS_QUERY, {
      owner: repositoryInput.data.owner,
      name: repositoryInput.data.name,
      pullRequestIds,
      commitIds,
      checkRunType: "LATEST",
    });
  } catch (error) {
    const rateLimit = rateLimitErrorSchema.safeParse(error);
    return rateLimit.success
      ? { state: "rate_limited", retryAt: rateLimit.data.retryAt }
      : { state: "request_failed" };
  }

  const batch = batchSchema.safeParse(response);
  if (
    !batch.success ||
    batch.data.pullRequests.length > pullRequestIds.length ||
    batch.data.commits.length > commitIds.length
  ) {
    return { state: "invalid_response" };
  }

  const repository = batch.data.repository;
  if (repository === null) {
    return { state: "repository_unavailable" };
  }
  if (
    String(repository.databaseId) !== repositoryInput.data.expectedRepositoryDatabaseId ||
    repository.nameWithOwner.toLowerCase() !==
      `${repositoryInput.data.owner}/${repositoryInput.data.name}`.toLowerCase()
  ) {
    return { state: "repository_identity_mismatch" };
  }

  const pullRequestsByNodeId = new Map<string, z.infer<typeof pullRequestSchema>>();
  const unavailablePullRequestNodeIds = new Set<string>();
  for (const rawNode of batch.data.pullRequests) {
    if (rawNode === null) {
      continue;
    }

    const identity = nodeIdentitySchema.safeParse(rawNode);
    if (
      !identity.success ||
      pullRequestsByNodeId.has(identity.data.id) ||
      unavailablePullRequestNodeIds.has(identity.data.id)
    ) {
      return { state: "invalid_response" };
    }

    const pullRequest = pullRequestSchema.safeParse(rawNode);
    if (!pullRequest.success) {
      if (identity.data.__typename === "PullRequest") {
        return { state: "invalid_response" };
      }
      unavailablePullRequestNodeIds.add(identity.data.id);
      continue;
    }
    pullRequestsByNodeId.set(pullRequest.data.id, pullRequest.data);
  }

  const requestedPullRequestIds = new Set(pullRequestIds);
  for (const nodeId of [...pullRequestsByNodeId.keys(), ...unavailablePullRequestNodeIds]) {
    if (!requestedPullRequestIds.has(nodeId)) {
      return { state: "invalid_response" };
    }
  }

  const commitsByNodeId = new Map<string, z.infer<typeof commitSchema>>();
  const unavailableNodeIds = new Set<string>();
  for (const rawNode of batch.data.commits) {
    if (rawNode === null) {
      continue;
    }

    const identity = nodeIdentitySchema.safeParse(rawNode);
    if (
      !identity.success ||
      commitsByNodeId.has(identity.data.id) ||
      unavailableNodeIds.has(identity.data.id)
    ) {
      return { state: "invalid_response" };
    }

    const commit = commitSchema.safeParse(rawNode);
    if (!commit.success) {
      if (identity.data.__typename === "Commit") {
        return { state: "invalid_response" };
      }
      unavailableNodeIds.add(identity.data.id);
      continue;
    }
    commitsByNodeId.set(commit.data.id, commit.data);
  }

  const requestedCommitIds = new Set(commitIds);
  for (const nodeId of [...commitsByNodeId.keys(), ...unavailableNodeIds]) {
    if (!requestedCommitIds.has(nodeId)) {
      return { state: "invalid_response" };
    }
  }

  return {
    state: "complete",
    observations: args.heads.map((head) => {
      const pullRequest = pullRequestsByNodeId.get(head.pullRequestNodeId);
      const commit = commitsByNodeId.get(head.headCommitNodeId);
      if (pullRequest === undefined || commit === undefined) {
        return { state: "head_unavailable", head };
      }
      return observeCommitForHead({
        pullRequest,
        commit,
        head,
        repositoryNodeId: repository.id,
      });
    }),
  };
}
