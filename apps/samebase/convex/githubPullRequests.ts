import { z } from "zod";

import { createGitHubGraphqlClient, type GitHubGraphqlRateUsage } from "./githubGraphql";

const GITHUB_PULL_REQUEST_MAX_PAGE_SIZE = 25;
const GITHUB_PULL_REQUEST_MAX_SCAN_REQUESTS = 4;
const GITHUB_PULL_REQUEST_MAX_GRAPHQL_COST = 50;
const GITHUB_PULL_REQUEST_DEADLINE_MS = 15_000;

const pageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});

const GITHUB_CHECK_RUN_AGGREGATE_STATES = [
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

const GITHUB_STATUS_CONTEXT_AGGREGATE_STATES = [
  "ERROR",
  "EXPECTED",
  "FAILURE",
  "PENDING",
  "SUCCESS",
] as const;

const GITHUB_STATUS_CHECK_ROLLUP_STATES = [
  "ERROR",
  "EXPECTED",
  "FAILURE",
  "PENDING",
  "SUCCESS",
] as const;

const checkRunStateCountSchema = z.object({
  state: z.enum(GITHUB_CHECK_RUN_AGGREGATE_STATES),
  count: z.number().int().nonnegative(),
});

const statusContextStateCountSchema = z.object({
  state: z.enum(GITHUB_STATUS_CONTEXT_AGGREGATE_STATES),
  count: z.number().int().nonnegative(),
});

const checkCountsSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  checkRunCount: z.number().int().nonnegative(),
  statusContextCount: z.number().int().nonnegative(),
  checkRunCountsByState: z.array(checkRunStateCountSchema),
  statusContextCountsByState: z.array(statusContextStateCountSchema),
});

const statusCheckRollupSchema = z
  .object({
    state: z.enum(GITHUB_STATUS_CHECK_ROLLUP_STATES),
    contexts: checkCountsSchema,
  })
  .nullable();

const commitSchema = z.object({
  id: z.string().min(1),
  oid: z.string().min(1),
  repository: z.object({ id: z.string().min(1) }),
  statusCheckRollup: statusCheckRollupSchema,
});

const defaultBranchRefSchema = z
  .object({
    name: z.string().min(1),
    target: z.object({
      __typename: z.literal("Commit"),
      ...commitSchema.shape,
    }),
  })
  .nullable();

const labelSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^[0-9a-f]{6}$/i),
});

const labelsSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  pageInfo: pageInfoSchema,
  nodes: z.array(labelSchema),
});

const headRepositorySchema = z.object({
  id: z.string().min(1),
  nameWithOwner: z.string().min(3),
  owner: z.object({ login: z.string().min(1) }),
});

const pullRequestSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string().min(1),
  isDraft: z.boolean(),
  isCrossRepository: z.boolean(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changedFiles: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
  baseRefName: z.string().min(1),
  headRefName: z.string().min(1),
  headRefOid: z.string().min(1),
  headRepository: headRepositorySchema.nullable(),
  labels: labelsSchema,
  commits: z.object({
    nodes: z.array(z.object({ commit: commitSchema })),
  }),
});

const pullRequestPageSchema = z.object({
  repository: z
    .object({
      id: z.string().min(1),
      databaseId: z.number().int().positive(),
      nameWithOwner: z.string().min(3),
      defaultBranchRef: defaultBranchRefSchema,
      pullRequests: z.object({
        totalCount: z.number().int().nonnegative(),
        pageInfo: pageInfoSchema,
        nodes: z.array(pullRequestSchema),
      }),
    })
    .nullable(),
});

const filtersSchema = z.object({
  hiddenLabels: z.array(z.string().trim().min(1)).max(100),
  includeDrafts: z.boolean(),
  includeNoLabel: z.boolean(),
});

export type GitHubPullRequestFilters = z.infer<typeof filtersSchema>;

export type GitHubPullRequestCheckCounts = {
  rollupState: (typeof GITHUB_STATUS_CHECK_ROLLUP_STATES)[number] | null;
  totalCount: number;
  checkRunCount: number;
  statusContextCount: number;
  checkRunCountsByState: Array<z.infer<typeof checkRunStateCountSchema>>;
  statusContextCountsByState: Array<z.infer<typeof statusContextStateCountSchema>>;
};

export type GitHubPullRequestPageItem = {
  nodeId: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  isCrossRepository: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  updatedAt: string;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  headRepository: {
    nodeId: string;
    nameWithOwner: string;
    owner: string;
  } | null;
  labels: Array<{ name: string; color: string }>;
  headCommit: {
    nodeId: string;
    repositoryNodeId: string;
    sha: string;
    checks: GitHubPullRequestCheckCounts;
  };
};

export type GitHubDefaultBranchObservation = {
  name: string;
  headCommit: {
    nodeId: string;
    repositoryNodeId: string;
    sha: string;
    checks: GitHubPullRequestCheckCounts;
  };
};

export type GitHubPullRequestPageContinuation =
  | { kind: "complete" }
  | { kind: "next_page"; cursor: string }
  | {
      kind: "scan_guardrail";
      cursor: string;
      scannedProviderPages: number;
    };

export type GitHubPullRequestPage = {
  repositoryNodeId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  defaultBranch: GitHubDefaultBranchObservation | null;
  providerOpenPullRequestCount: number;
  scannedPullRequestCount: number;
  providerSequenceDrifted: boolean;
  pullRequests: GitHubPullRequestPageItem[];
  continuation: GitHubPullRequestPageContinuation;
  rateUsage: GitHubGraphqlRateUsage;
  requestCount: number;
};

export class GitHubRepositoryUnavailableError extends Error {
  constructor() {
    super("GitHub repository was unavailable to the current connection.");
    this.name = "GitHubRepositoryUnavailableError";
  }
}

const REPOSITORY_PULL_REQUEST_PAGE_QUERY = `
  query RepositoryPullRequestPage(
    $owner: String!
    $name: String!
    $pageSize: Int!
    $after: String
  ) {
    repository(owner: $owner, name: $name) {
      id
      databaseId
      nameWithOwner
      defaultBranchRef {
        name
        target {
          __typename
          ... on Commit {
            id
            oid
            repository { id }
            statusCheckRollup {
              state
              contexts(first: 1) {
                totalCount
                checkRunCount
                statusContextCount
                checkRunCountsByState { state count }
                statusContextCountsByState { state count }
              }
            }
          }
        }
      }
      pullRequests(
        first: $pageSize
        after: $after
        states: [OPEN]
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          number
          title
          url
          isDraft
          isCrossRepository
          additions
          deletions
          changedFiles
          updatedAt
          baseRefName
          headRefName
          headRefOid
          headRepository { id nameWithOwner owner { login } }
          labels(first: 100) {
            totalCount
            pageInfo { hasNextPage endCursor }
            nodes { name color }
          }
          commits(last: 1) {
            nodes {
              commit {
                id
                oid
                repository { id }
                statusCheckRollup {
                  state
                  contexts(first: 1) {
                    totalCount
                    checkRunCount
                    statusContextCount
                    checkRunCountsByState { state count }
                    statusContextCountsByState { state count }
                  }
                }
              }
            }
          }
        }
      }
    }
    rateLimit { cost limit remaining resetAt }
  }
`;

function requireTimestamp(value: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error("GitHub returned an invalid pull request timestamp.");
  }
  return value;
}

function requireNextCursor(pageInfo: z.infer<typeof pageInfoSchema>): string | null {
  if (!pageInfo.hasNextPage) {
    return null;
  }
  if (pageInfo.endCursor === null || pageInfo.endCursor.length === 0) {
    throw new Error("GitHub pagination reported another page without a cursor.");
  }
  return pageInfo.endCursor;
}

function normalizeCountBuckets<State extends string>(args: {
  values: readonly { state: State; count: number }[];
  expectedCount: number;
  kind: "check run" | "status context";
}): Array<{ state: State; count: number }> {
  const states = new Set<string>();
  let total = 0;
  for (const value of args.values) {
    if (states.has(value.state)) {
      throw new Error(`GitHub returned a duplicate ${args.kind} aggregate state.`);
    }
    states.add(value.state);
    total += value.count;
  }
  if (total !== args.expectedCount) {
    throw new Error(`GitHub returned inconsistent ${args.kind} aggregate counts.`);
  }
  return [...args.values].sort((left, right) => left.state.localeCompare(right.state));
}

function normalizeChecks(
  rollup: z.infer<typeof statusCheckRollupSchema>,
): GitHubPullRequestCheckCounts {
  if (rollup === null) {
    return {
      rollupState: null,
      totalCount: 0,
      checkRunCount: 0,
      statusContextCount: 0,
      checkRunCountsByState: [],
      statusContextCountsByState: [],
    };
  }
  const contexts = rollup.contexts;
  if (contexts.checkRunCount + contexts.statusContextCount !== contexts.totalCount) {
    throw new Error("GitHub returned inconsistent aggregate check counts.");
  }
  return {
    rollupState: rollup.state,
    totalCount: contexts.totalCount,
    checkRunCount: contexts.checkRunCount,
    statusContextCount: contexts.statusContextCount,
    checkRunCountsByState: normalizeCountBuckets({
      values: contexts.checkRunCountsByState,
      expectedCount: contexts.checkRunCount,
      kind: "check run",
    }),
    statusContextCountsByState: normalizeCountBuckets({
      values: contexts.statusContextCountsByState,
      expectedCount: contexts.statusContextCount,
      kind: "status context",
    }),
  };
}

function requireRepositoryCoordinates(args: {
  nameWithOwner: string;
  expectedOwner: string;
  expectedName: string;
}): void {
  if (
    args.nameWithOwner.toLowerCase() !== `${args.expectedOwner}/${args.expectedName}`.toLowerCase()
  ) {
    throw new Error("GitHub repository coordinates changed or the repository was renamed.");
  }
}

function normalizeDefaultBranch(args: {
  value: z.infer<typeof defaultBranchRefSchema>;
  repositoryNodeId: string;
}): GitHubDefaultBranchObservation | null {
  if (args.value === null) {
    return null;
  }
  if (args.value.target.repository.id !== args.repositoryNodeId) {
    throw new Error("GitHub default branch commit belongs to another repository.");
  }
  return {
    name: args.value.name,
    headCommit: {
      nodeId: args.value.target.id,
      repositoryNodeId: args.value.target.repository.id,
      sha: args.value.target.oid,
      checks: normalizeChecks(args.value.target.statusCheckRollup),
    },
  };
}

function normalizeLabels(value: z.infer<typeof labelsSchema>): Array<{
  name: string;
  color: string;
}> {
  if (
    value.totalCount > 100 ||
    value.pageInfo.hasNextPage ||
    value.totalCount !== value.nodes.length
  ) {
    throw new Error("GitHub pull request has more than 100 labels or omitted label data.");
  }
  const names = new Set<string>();
  for (const label of value.nodes) {
    const name = label.name.toLowerCase();
    if (names.has(name)) {
      throw new Error("GitHub returned a duplicate pull request label.");
    }
    names.add(name);
  }
  return [...value.nodes].sort(
    (left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
      left.name.localeCompare(right.name),
  );
}

function normalizePullRequest(args: {
  value: z.infer<typeof pullRequestSchema>;
  repositoryNodeId: string;
}): GitHubPullRequestPageItem {
  const value = args.value;
  if (value.commits.nodes.length !== 1) {
    throw new Error("GitHub pull request did not return exactly one latest commit.");
  }
  const latestCommit = value.commits.nodes[0].commit;
  if (latestCommit.oid !== value.headRefOid) {
    throw new Error("GitHub pull request head did not match its latest commit.");
  }
  const headRepository = value.headRepository;
  if (
    headRepository !== null &&
    value.isCrossRepository !== (headRepository.id !== args.repositoryNodeId)
  ) {
    throw new Error("GitHub returned inconsistent pull request repository identities.");
  }
  if (headRepository !== null && latestCommit.repository.id !== headRepository.id) {
    throw new Error("GitHub pull request head commit belongs to another repository.");
  }
  if (headRepository !== null) {
    const separator = headRepository.nameWithOwner.indexOf("/");
    if (
      separator <= 0 ||
      separator === headRepository.nameWithOwner.length - 1 ||
      headRepository.nameWithOwner.indexOf("/", separator + 1) >= 0 ||
      headRepository.nameWithOwner.slice(0, separator).toLowerCase() !==
        headRepository.owner.login.toLowerCase()
    ) {
      throw new Error("GitHub returned inconsistent pull request head coordinates.");
    }
  }
  return {
    nodeId: value.id,
    number: value.number,
    title: value.title,
    url: value.url,
    isDraft: value.isDraft,
    isCrossRepository: value.isCrossRepository,
    additions: value.additions,
    deletions: value.deletions,
    changedFiles: value.changedFiles,
    updatedAt: requireTimestamp(value.updatedAt),
    baseRefName: value.baseRefName,
    headRefName: value.headRefName,
    headRefOid: value.headRefOid,
    headRepository:
      headRepository === null
        ? null
        : {
            nodeId: headRepository.id,
            nameWithOwner: headRepository.nameWithOwner,
            owner: headRepository.owner.login,
          },
    labels: normalizeLabels(value.labels),
    headCommit: {
      nodeId: latestCommit.id,
      repositoryNodeId: latestCommit.repository.id,
      sha: latestCommit.oid,
      checks: normalizeChecks(latestCommit.statusCheckRollup),
    },
  };
}

export async function fetchGitHubPullRequestPage(args: {
  credential: string;
  owner: string;
  name: string;
  expectedRepositoryDatabaseId: string;
  cursor: string | null;
  pageSize: number;
  filters: GitHubPullRequestFilters;
  fetchImpl?: typeof fetch;
}): Promise<GitHubPullRequestPage> {
  const owner = z
    .string()
    .trim()
    .min(1)
    .regex(/^[^/]+$/)
    .parse(args.owner);
  const name = z
    .string()
    .trim()
    .min(1)
    .regex(/^[^/]+$/)
    .parse(args.name);
  const expectedRepositoryDatabaseId = z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .parse(args.expectedRepositoryDatabaseId);
  const cursor = z.string().min(1).nullable().parse(args.cursor);
  const pageSize = z
    .number()
    .int()
    .min(1)
    .max(GITHUB_PULL_REQUEST_MAX_PAGE_SIZE)
    .parse(args.pageSize);
  const filters = filtersSchema.parse(args.filters);
  const hiddenLabels = new Set(filters.hiddenLabels.map((label) => label.toLowerCase()));
  const client = createGitHubGraphqlClient({
    credential: args.credential,
    fetchImpl: args.fetchImpl,
    limits: {
      deadlineAt: Date.now() + GITHUB_PULL_REQUEST_DEADLINE_MS,
      maximumCost: GITHUB_PULL_REQUEST_MAX_GRAPHQL_COST,
      maximumRequestCount: GITHUB_PULL_REQUEST_MAX_SCAN_REQUESTS,
    },
  });

  const seenCursors = new Set<string>(cursor === null ? [] : [cursor]);
  const pullRequestNumberByNodeId = new Map<string, number>();
  const pullRequestNodeIdByNumber = new Map<number, string>();
  const pullRequests: GitHubPullRequestPageItem[] = [];
  let repositoryNodeId: string | null = null;
  let repositoryFullName: string | null = null;
  let defaultBranch: GitHubDefaultBranchObservation | null | undefined;
  let providerOpenPullRequestCount: number | null = null;
  let scannedPullRequestCount = 0;
  let providerSequenceDrifted = false;
  let requestCursor = cursor;
  let nextCursor: string | null = null;

  while (client.getRequestCount() < GITHUB_PULL_REQUEST_MAX_SCAN_REQUESTS) {
    const response = pullRequestPageSchema.parse(
      await client.request(REPOSITORY_PULL_REQUEST_PAGE_QUERY, {
        owner,
        name,
        pageSize: pageSize - pullRequests.length,
        after: requestCursor,
      }),
    );
    const repository = response.repository;
    if (repository === null) {
      throw new GitHubRepositoryUnavailableError();
    }
    requireRepositoryCoordinates({
      nameWithOwner: repository.nameWithOwner,
      expectedOwner: owner,
      expectedName: name,
    });
    if (String(repository.databaseId) !== expectedRepositoryDatabaseId) {
      throw new Error("GitHub returned another repository database identity.");
    }
    if (repositoryNodeId !== null && repository.id !== repositoryNodeId) {
      throw new Error("GitHub repository node identity changed during pagination.");
    }
    if (
      repositoryFullName !== null &&
      repository.nameWithOwner.toLowerCase() !== repositoryFullName.toLowerCase()
    ) {
      throw new Error("GitHub repository coordinates changed during pagination.");
    }
    repositoryNodeId = repository.id;
    repositoryFullName = repository.nameWithOwner;

    const pageDefaultBranch = normalizeDefaultBranch({
      value: repository.defaultBranchRef,
      repositoryNodeId,
    });
    if (
      defaultBranch !== undefined &&
      JSON.stringify(defaultBranch) !== JSON.stringify(pageDefaultBranch)
    ) {
      providerSequenceDrifted = true;
    }
    defaultBranch = pageDefaultBranch;
    if (
      providerOpenPullRequestCount !== null &&
      providerOpenPullRequestCount !== repository.pullRequests.totalCount
    ) {
      providerSequenceDrifted = true;
    }
    providerOpenPullRequestCount = repository.pullRequests.totalCount;

    const remainingCapacity = pageSize - pullRequests.length;
    if (repository.pullRequests.nodes.length > remainingCapacity) {
      throw new Error("GitHub returned more pull requests than requested.");
    }
    scannedPullRequestCount += repository.pullRequests.nodes.length;
    for (const rawPullRequest of repository.pullRequests.nodes) {
      const pullRequest = normalizePullRequest({
        value: rawPullRequest,
        repositoryNodeId,
      });
      const previousNumber = pullRequestNumberByNodeId.get(pullRequest.nodeId);
      const previousNodeId = pullRequestNodeIdByNumber.get(pullRequest.number);
      if (previousNumber !== undefined || previousNodeId !== undefined) {
        if (previousNumber !== pullRequest.number || previousNodeId !== pullRequest.nodeId) {
          throw new Error(
            "GitHub returned inconsistent pull request identities during pagination.",
          );
        }

        providerSequenceDrifted = true;
        continue;
      }
      pullRequestNumberByNodeId.set(pullRequest.nodeId, pullRequest.number);
      pullRequestNodeIdByNumber.set(pullRequest.number, pullRequest.nodeId);
      if (
        (filters.includeDrafts || !pullRequest.isDraft) &&
        (filters.includeNoLabel || pullRequest.labels.length > 0) &&
        !pullRequest.labels.some((label) => hiddenLabels.has(label.name.toLowerCase()))
      ) {
        pullRequests.push(pullRequest);
      }
    }

    nextCursor = requireNextCursor(repository.pullRequests.pageInfo);
    if (nextCursor === null || pullRequests.length === pageSize) {
      break;
    }
    if (seenCursors.has(nextCursor)) {
      throw new Error("GitHub pagination cursor repeated.");
    }
    seenCursors.add(nextCursor);
    requestCursor = nextCursor;
  }

  if (
    repositoryNodeId === null ||
    repositoryFullName === null ||
    defaultBranch === undefined ||
    providerOpenPullRequestCount === null
  ) {
    throw new Error("GitHub pull request pagination did not return repository metadata.");
  }
  const rateUsage = client.getUsage();
  if (rateUsage === undefined) {
    throw new Error("GitHub pull request pagination omitted rate-limit accounting.");
  }

  const continuation: GitHubPullRequestPageContinuation =
    nextCursor === null
      ? { kind: "complete" }
      : pullRequests.length === pageSize
        ? { kind: "next_page", cursor: nextCursor }
        : {
            kind: "scan_guardrail",
            cursor: nextCursor,
            scannedProviderPages: client.getRequestCount(),
          };

  return {
    repositoryNodeId,
    repositoryDatabaseId: expectedRepositoryDatabaseId,
    repositoryFullName,
    defaultBranch,
    providerOpenPullRequestCount,
    scannedPullRequestCount,
    providerSequenceDrifted,
    pullRequests,
    continuation,
    rateUsage,
    requestCount: client.getRequestCount(),
  };
}
