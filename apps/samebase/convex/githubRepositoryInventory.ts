import { z } from "zod";

import {
  GITHUB_STATUS_CHECK_ROLLUP_STATES,
  repositorySummaryCheckStateFromGitHubRollup,
} from "./githubRepositoryCheckState";
import type { RepositorySummaryCheckState } from "./repositorySummaryModel";

import {
  buildRepositoryInventoryCheckSummaryFromCounts,
  normalizeCloudflareBuildCheckRun,
  type GitHubCheckCountsSnapshotInput,
  type GitHubCloudflareBuildSnapshotInput,
} from "./commitChecks";
import {
  repositoryInventoryBranchRowKey,
  repositoryInventoryPullRequestRowKey,
  type CollectedRepositoryInventoryItem,
  type RepositoryInventoryCloudflareBuild,
  type RepositoryInventoryCheckSummary,
} from "./repositoryInventoryModel";
import { toErrorMessage } from "./jsonUtils";
import {
  githubGraphqlRateSafetyFloor,
  type GitHubGraphqlRateUsage,
} from "./githubGraphqlRateBudget";
import { parseRepositoryFullName } from "../shared/repoName";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const GITHUB_GRAPHQL_PAGE_SIZE = 50;
const GITHUB_GRAPHQL_RETRY_PAGE_SIZE = 25;
const GITHUB_GRAPHQL_MAX_PAGES = 1_000;
const GITHUB_REQUEST_TIMEOUT_MS = 30_000;
const CLOUDFLARE_WORKERS_GITHUB_APP_ID = 85_455;
const GITHUB_CLOUDFLARE_INITIAL_SUITE_PAGE_SIZE = 3;

const pageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});

const cloudflareCheckRunSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  detailsUrl: z.string().nullable(),
  url: z.string().nullable(),
  summary: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

const cloudflareCheckRunsSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  pageInfo: pageInfoSchema,
  nodes: z.array(cloudflareCheckRunSchema),
});

const cloudflareCheckSuiteSchema = z.object({
  id: z.string(),
  branch: z.object({ name: z.string() }).nullable(),
  checkRuns: cloudflareCheckRunsSchema,
});

const cloudflareCheckSuitesSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  pageInfo: pageInfoSchema,
  nodes: z.array(cloudflareCheckSuiteSchema),
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
  id: z.string(),
  oid: z.string(),
  messageHeadline: z.string(),
  authoredDate: z.string(),
  committedDate: z.string(),
  repository: z.object({
    id: z.string(),
  }),
  statusCheckRollup: statusCheckRollupSchema,
});

const comparisonSchema = z.object({
  aheadBy: z.number().int().nonnegative(),
  behindBy: z.number().int().nonnegative(),
  baseTarget: z.object({ oid: z.string() }),
  headTarget: z.object({ oid: z.string() }),
});

const branchRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  target: z.object({
    __typename: z.literal("Commit"),
    ...commitSchema.shape,
  }),
  comparison: comparisonSchema.nullable(),
});

const branchPageSchema = z.object({
  repository: z
    .object({
      id: z.string(),
      databaseId: z.number().int().positive(),
      nameWithOwner: z.string(),
      defaultBranchRef: z
        .object({
          name: z.string(),
          target: z.object({ oid: z.string() }),
        })
        .nullable(),
      refs: z.object({
        totalCount: z.number().int().nonnegative(),
        pageInfo: pageInfoSchema,
        nodes: z.array(branchRefSchema),
      }),
    })
    .nullable(),
});

const labelSchema = z.object({
  name: z.string(),
  color: z.string(),
});

const labelsSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  pageInfo: pageInfoSchema,
  nodes: z.array(labelSchema),
});

const pullRequestHeadRepositorySchema = z.object({
  id: z.string(),
  nameWithOwner: z.string(),
  owner: z.object({ login: z.string() }),
});

const pullRequestSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  isDraft: z.boolean(),
  isCrossRepository: z.boolean(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changedFiles: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  baseRefName: z.string(),
  headRefName: z.string(),
  headRefOid: z.string(),
  headRepository: pullRequestHeadRepositorySchema.nullable(),
  labels: labelsSchema,
  commits: z.object({
    nodes: z.array(
      z.object({
        commit: commitSchema,
      }),
    ),
  }),
});

const pullRequestPageSchema = z.object({
  repository: z
    .object({
      id: z.string(),
      databaseId: z.number().int().positive(),
      nameWithOwner: z.string(),
      pullRequests: z.object({
        totalCount: z.number().int().nonnegative(),
        pageInfo: pageInfoSchema,
        nodes: z.array(pullRequestSchema),
      }),
    })
    .nullable(),
});

const pullRequestComparisonNodeSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  baseRefName: z.string(),
  headRefName: z.string(),
  headRefOid: z.string(),
  headRepository: pullRequestHeadRepositorySchema.nullable(),
  baseRef: z
    .object({
      name: z.string(),
      target: z.object({ oid: z.string() }),
      comparison: comparisonSchema.nullable().optional(),
    })
    .nullable(),
  headRef: z
    .object({
      name: z.string(),
      target: z.object({ oid: z.string() }),
    })
    .nullable(),
});

const pullRequestComparisonBatchSchema = z.object({
  repository: z
    .object({
      id: z.string(),
      databaseId: z.number().int().positive(),
      nameWithOwner: z.string(),
    })
    .passthrough()
    .nullable(),
});

const commitSignatureSchema = z.object({
  id: z.string(),
  oid: z.string(),
  repository: z.object({
    id: z.string(),
  }),
  statusCheckRollup: statusCheckRollupSchema,
});

const cloudflareCommitObservationSchema = z.object({
  __typename: z.literal("Commit"),
  id: z.string(),
  oid: z.string(),
  repository: z.object({
    id: z.string(),
  }),
  checkSuites: cloudflareCheckSuitesSchema,
});

const cloudflareCommitBatchSchema = z.object({
  nodes: z.array(z.unknown()),
});

const branchSignaturePageSchema = z.object({
  repository: z
    .object({
      id: z.string(),
      databaseId: z.number().int().positive(),
      nameWithOwner: z.string(),
      defaultBranchRef: z
        .object({
          name: z.string(),
          target: z.object({ oid: z.string() }),
        })
        .nullable(),
      refs: z.object({
        totalCount: z.number().int().nonnegative(),
        pageInfo: pageInfoSchema,
        nodes: z.array(
          z.object({
            name: z.string(),
            target: commitSignatureSchema,
          }),
        ),
      }),
    })
    .nullable(),
});

const pullRequestSignaturePageSchema = z.object({
  repository: z
    .object({
      id: z.string(),
      databaseId: z.number().int().positive(),
      nameWithOwner: z.string(),
      pullRequests: z.object({
        totalCount: z.number().int().nonnegative(),
        pageInfo: pageInfoSchema,
        nodes: z.array(
          z.object({
            id: z.string(),
            updatedAt: z.string(),
            baseRefName: z.string(),
            headRefName: z.string(),
            headRefOid: z.string(),
            headRepository: pullRequestHeadRepositorySchema.nullable(),
            commits: z.object({
              nodes: z.array(
                z.object({
                  commit: commitSignatureSchema,
                }),
              ),
            }),
          }),
        ),
      }),
    })
    .nullable(),
});

const labelContinuationSchema = z.object({
  node: z
    .object({
      __typename: z.literal("PullRequest"),
      labels: labelsSchema,
    })
    .nullable(),
});

const cloudflareSuiteContinuationSchema = z.object({
  node: z
    .object({
      __typename: z.literal("Commit"),
      id: z.string(),
      oid: z.string(),
      repository: z.object({ id: z.string() }),
      checkSuites: cloudflareCheckSuitesSchema,
    })
    .nullable(),
});

const cloudflareCheckRunContinuationSchema = z.object({
  node: z
    .object({
      __typename: z.literal("CheckSuite"),
      id: z.string(),
      branch: z.object({ name: z.string() }).nullable(),
      checkRuns: cloudflareCheckRunsSchema,
    })
    .nullable(),
});

const graphqlErrorSchema = z.object({
  message: z.string(),
  type: z.string().optional(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
});

const graphqlEnvelopeSchema = z.object({
  data: z.unknown().optional(),
  message: z.string().optional(),
  errors: z.array(graphqlErrorSchema).optional(),
});

const graphqlRateLimitSchema = z.object({
  cost: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
  resetAt: z.string(),
});

const resolvedRepositorySchema = z.object({
  __typename: z.literal("Repository"),
  id: z.string(),
  databaseId: z.number().int().positive(),
  name: z.string(),
  nameWithOwner: z.string(),
  owner: z.object({
    login: z.string(),
    databaseId: z.number().int().positive(),
  }),
});

const resolvedRepositoryIdentitySchema = z.object({
  repository: resolvedRepositorySchema.nullable(),
});

const renamedRepositoryIdentitySchema = z.object({
  updateRepository: z.object({
    repository: resolvedRepositorySchema.nullable(),
  }),
});

const RESOLVE_REPOSITORY_IDENTITY_QUERY = `
  query ResolveRepositoryIdentity($repositoryId: ID!) {
    repository: node(id: $repositoryId) {
      __typename
      ... on Repository {
        id
        databaseId
        name
        nameWithOwner
        owner {
          login
          ... on Organization { databaseId }
          ... on User { databaseId }
        }
      }
    }
    rateLimit { cost limit remaining resetAt }
  }
`;

const RENAME_REPOSITORY_FOR_DELETION_MUTATION = `
  mutation RenameRepositoryForDeletion($repositoryId: ID!, $name: String!) {
    updateRepository(input: { repositoryId: $repositoryId, name: $name }) {
      repository {
        __typename
        id
        databaseId
        name
        nameWithOwner
        owner {
          login
          ... on Organization { databaseId }
          ... on User { databaseId }
        }
      }
    }
    rateLimit { cost limit remaining resetAt }
  }
`;

const REPOSITORY_BRANCH_PAGE_QUERY = `
  query RepositoryInventoryBranchPage(
    $repositoryId: ID!
    $pageSize: Int!
    $after: String
  ) {
    repository: node(id: $repositoryId) {
      ... on Repository {
        id
        databaseId
        nameWithOwner
        defaultBranchRef { name target { oid } }
        refs(
          refPrefix: "refs/heads/"
          first: $pageSize
          after: $after
          orderBy: { field: ALPHABETICAL, direction: ASC }
        ) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            name
            target {
              __typename
              ... on Commit {
                id
                oid
                messageHeadline
                authoredDate
                committedDate
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
            comparison: compare(headRef: "HEAD") {
              aheadBy
              behindBy
              baseTarget { oid }
              headTarget { oid }
            }
          }
        }
      }
    }
    rateLimit { cost limit remaining resetAt }
  }
`;

const REPOSITORY_PULL_REQUEST_PAGE_QUERY = `
  query RepositoryInventoryPullRequestPage(
    $repositoryId: ID!
    $pageSize: Int!
    $after: String
  ) {
    repository: node(id: $repositoryId) {
      ... on Repository {
        id
        databaseId
        nameWithOwner
        pullRequests(
          first: $pageSize
          after: $after
          states: [OPEN]
          orderBy: { field: CREATED_AT, direction: ASC }
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
            createdAt
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
                  messageHeadline
                  authoredDate
                  committedDate
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
    }
    rateLimit { cost limit remaining resetAt }
  }
`;

function pullRequestComparisonBatchQuery(
  pullRequests: readonly z.infer<typeof pullRequestSchema>[],
): string {
  if (pullRequests.length === 0 || pullRequests.length > GITHUB_GRAPHQL_PAGE_SIZE) {
    throw new GitHubGraphqlRequestError(
      "GitHub pull request comparison batch exceeded its safety limit.",
      false,
    );
  }
  const variableDefinitions = pullRequests.flatMap((pullRequest, index) => [
    `$pr${index}Number: Int!`,
    ...(pullRequest.headRepository === null ? [] : [`$pr${index}HeadRef: String!`]),
  ]);
  const aliases = pullRequests.map(
    (pullRequest, index) => `
    pr${index}: pullRequest(number: $pr${index}Number) {
      id
      number
      baseRefName
      headRefName
      headRefOid
      headRepository { id nameWithOwner owner { login } }
      headRef { name target { oid } }
      baseRef {
        name
        target { oid }
        ${
          pullRequest.headRepository === null
            ? ""
            : `comparison: compare(headRef: $pr${index}HeadRef) {
          aheadBy
          behindBy
          baseTarget { oid }
          headTarget { oid }
        }`
        }
      }
    }
  `,
  );
  return `
    query RepositoryInventoryPullRequestComparisonBatch(
      $repositoryId: ID!
      ${variableDefinitions.join("\n      ")}
    ) {
      repository: node(id: $repositoryId) {
        ... on Repository {
          id
          databaseId
          nameWithOwner
          ${aliases.join("\n")}
        }
      }
      rateLimit { cost limit remaining resetAt }
    }
  `;
}

const REPOSITORY_BRANCH_SIGNATURE_PAGE_QUERY = `
  query RepositoryInventoryBranchSignaturePage($repositoryId: ID!, $after: String) {
    repository: node(id: $repositoryId) {
      ... on Repository {
        id
        databaseId
        nameWithOwner
        defaultBranchRef {
          name
          target { ... on Commit { oid } }
        }
        refs(
          refPrefix: "refs/heads/"
          first: 100
          after: $after
          orderBy: { field: ALPHABETICAL, direction: ASC }
        ) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            name
            target {
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
        }
      }
    }
    rateLimit { cost limit remaining resetAt }
  }
`;

const REPOSITORY_PULL_REQUEST_SIGNATURE_PAGE_QUERY = `
  query RepositoryInventoryPullRequestSignaturePage($repositoryId: ID!, $after: String) {
    repository: node(id: $repositoryId) {
      ... on Repository {
        id
        databaseId
        nameWithOwner
        pullRequests(
          first: 100
          after: $after
          states: [OPEN]
          orderBy: { field: CREATED_AT, direction: ASC }
        ) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            updatedAt
            baseRefName
            headRefName
            headRefOid
            headRepository { id nameWithOwner owner { login } }
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
    }
    rateLimit { cost limit remaining resetAt }
  }
`;

const REPOSITORY_CLOUDFLARE_COMMIT_BATCH_QUERY = `
  query RepositoryInventoryCloudflareCommitBatch(
    $commitIds: [ID!]!
    $checkRunType: CheckRunType!
  ) {
    nodes(ids: $commitIds) {
      __typename
      ... on Commit {
        id
        oid
        repository { id }
        checkSuites(
          first: ${GITHUB_CLOUDFLARE_INITIAL_SUITE_PAGE_SIZE}
          filterBy: { appId: ${CLOUDFLARE_WORKERS_GITHUB_APP_ID} }
        ) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            branch { name }
            checkRuns(first: 100, filterBy: { checkType: $checkRunType }) {
              totalCount
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                name
                status
                conclusion
                detailsUrl
                url
                summary
                startedAt
                completedAt
              }
            }
          }
        }
      }
    }
    rateLimit { cost limit remaining resetAt }
  }
`;

const REPOSITORY_LABEL_CONTINUATION_QUERY = `
  query RepositoryInventoryLabelContinuation($nodeId: ID!, $after: String!) {
    node(id: $nodeId) {
      __typename
      ... on PullRequest {
        labels(first: 100, after: $after) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes { name color }
        }
      }
    }
    rateLimit { cost limit remaining resetAt }
  }
`;

const REPOSITORY_CLOUDFLARE_SUITE_CONTINUATION_QUERY = `
  query RepositoryInventoryCloudflareSuiteContinuation(
    $nodeId: ID!
    $after: String!
    $checkRunType: CheckRunType!
  ) {
    node(id: $nodeId) {
      __typename
      ... on Commit {
        id
        oid
        repository { id }
        checkSuites(
          first: 100
          after: $after
          filterBy: { appId: ${CLOUDFLARE_WORKERS_GITHUB_APP_ID} }
        ) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            branch { name }
            checkRuns(first: 100, filterBy: { checkType: $checkRunType }) {
              totalCount
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                name
                status
                conclusion
                detailsUrl
                url
                summary
                startedAt
                completedAt
              }
            }
          }
        }
      }
    }
    rateLimit { cost limit remaining resetAt }
  }
`;

const REPOSITORY_CLOUDFLARE_CHECK_RUN_CONTINUATION_QUERY = `
  query RepositoryInventoryCloudflareCheckRunContinuation(
    $nodeId: ID!
    $after: String!
    $checkRunType: CheckRunType!
  ) {
    node(id: $nodeId) {
      __typename
      ... on CheckSuite {
        id
        branch { name }
        checkRuns(
          first: 100
          after: $after
          filterBy: { checkType: $checkRunType }
        ) {
            totalCount
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              name
              status
              conclusion
              detailsUrl
              url
              summary
              startedAt
              completedAt
            }
        }
      }
    }
    rateLimit { cost limit remaining resetAt }
  }
`;

type GraphqlVariable =
  | string
  | number
  | boolean
  | null
  | readonly GraphqlVariable[]
  | { readonly [key: string]: GraphqlVariable };
type GraphqlVariables = Record<string, GraphqlVariable>;
export type RepositoryInventoryGraphqlRequest = (
  query: string,
  variables: GraphqlVariables,
) => Promise<unknown>;

export type RepositoryInventoryGraphqlError = z.infer<typeof graphqlErrorSchema>;

export type RepositoryInventoryGraphqlPartialResponse = {
  data: unknown;
  errors: RepositoryInventoryGraphqlError[];
};

export type RepositoryInventoryGraphqlPartialRequest = (
  query: string,
  variables: GraphqlVariables,
) => Promise<RepositoryInventoryGraphqlPartialResponse>;

export type GitHubGraphqlClient = {
  request: RepositoryInventoryGraphqlRequest;
  requestPartial: RepositoryInventoryGraphqlPartialRequest;
  getUsage: () => GitHubGraphqlRateUsage | undefined;
  getRequestCount: () => number;
};

export type RepositoryInventoryCloudflareBuildResolutionRequest = {
  sourceKey: string;
  providerBuildId: string | null;
  workerName: string;
  detailsUrl: string | null;
  commitRepositoryNodeId: string;
  commitSha: string;
  requiresBranchResolution: boolean;
  priority: {
    sortGroup: number;
    sortTime: number;
    rowKey: string;
  };
  candidateRefs: Array<{
    repositoryNodeId: string | null;
    branchName: string;
    pullRequestUrls: string[];
  }>;
};

export type RepositoryInventoryCloudflareBuildResolution = {
  sourceKey: string;
  providerBuildId: string | null;
  accountId: string;
  workerTag: string;
  rootDirectory: string;
  branch:
    | { state: "unresolved" }
    | {
        state: "resolved";
        refRepositoryNodeId: string;
        branchName: string;
        createdAt: number;
      };
};

export type RepositoryInventoryCloudflareBuildResolver = (
  requests: readonly RepositoryInventoryCloudflareBuildResolutionRequest[],
) => Promise<readonly RepositoryInventoryCloudflareBuildResolution[]>;

function samePullRequestUrl(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return (
      leftUrl.protocol === "https:" &&
      rightUrl.protocol === "https:" &&
      leftUrl.origin === rightUrl.origin &&
      leftUrl.pathname.replace(/\/$/, "") === rightUrl.pathname.replace(/\/$/, "")
    );
  } catch {
    return false;
  }
}

export function resolveCloudflareBuildCandidateRef(args: {
  candidateRefs: RepositoryInventoryCloudflareBuildResolutionRequest["candidateRefs"];
  branchName: string;
  pullRequestUrl: string | null;
}):
  | { state: "unresolved" }
  | { state: "resolved"; refRepositoryNodeId: string; branchName: string } {
  const branchRefs = args.candidateRefs.filter(
    (ref) => ref.repositoryNodeId !== null && ref.branchName === args.branchName,
  );
  const pullRequestUrl = args.pullRequestUrl;
  const pullRequestRefs =
    pullRequestUrl === null
      ? []
      : branchRefs.filter((ref) =>
          ref.pullRequestUrls.some((url) => samePullRequestUrl(url, pullRequestUrl)),
        );
  const resolvedRef =
    pullRequestRefs.length === 1
      ? pullRequestRefs[0]
      : branchRefs.length === 1
        ? branchRefs[0]
        : undefined;
  if (resolvedRef?.repositoryNodeId === null || resolvedRef === undefined) {
    return { state: "unresolved" };
  }
  return {
    state: "resolved",
    refRepositoryNodeId: resolvedRef.repositoryNodeId,
    branchName: args.branchName,
  };
}

export type CollectedRepositoryInventoryUnattributedCloudflareBuild = {
  commitRepositoryNodeId: string;
  commitSha: string;
  build: RepositoryInventoryCloudflareBuild;
};

export type CollectedRepositoryInventory = {
  repositoryId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  defaultBranch: string | null;
  defaultBranchCheckState: RepositorySummaryCheckState | null;
  items: CollectedRepositoryInventoryItem[];
  unattributedCloudflareBuilds: CollectedRepositoryInventoryUnattributedCloudflareBuild[];
  fingerprint: string;
  branchCount: number;
  pullRequestCount: number;
};

function sameGraphqlPath(
  left: readonly (string | number)[] | undefined,
  right: readonly (string | number)[],
): boolean {
  return left?.length === right.length && left.every((part, index) => part === right[index]);
}

function rejectErrorsThatCannotBeItemComparisons(
  errors: readonly RepositoryInventoryGraphqlError[],
): void {
  const unexpected = errors.filter(
    (error) => error.type?.toUpperCase() !== "NOT_FOUND" || error.path === undefined,
  );
  if (unexpected.length > 0) {
    throw new GitHubGraphqlRequestError(
      `GitHub GraphQL request failed: ${unexpected.map((error) => error.message).join("; ")}`,
      unexpected.some(isRetryableGraphqlError),
    );
  }
}

function acceptOnlyExpectedComparisonErrors(args: {
  errors: readonly RepositoryInventoryGraphqlError[];
  expectedPathByKey: ReadonlyMap<string, readonly (string | number)[]>;
}): ReadonlySet<string> {
  const keys = new Set<string>();
  const unexpected: RepositoryInventoryGraphqlError[] = [];
  for (const error of args.errors) {
    const entry = [...args.expectedPathByKey].find(
      ([, path]) => error.type?.toUpperCase() === "NOT_FOUND" && sameGraphqlPath(error.path, path),
    );
    if (entry === undefined || keys.has(entry[0])) {
      unexpected.push(error);
      continue;
    }
    keys.add(entry[0]);
  }
  if (unexpected.length > 0) {
    throw new GitHubGraphqlRequestError(
      `GitHub GraphQL request failed: ${unexpected.map((error) => error.message).join("; ")}`,
      unexpected.some(isRetryableGraphqlError),
    );
  }
  return keys;
}

async function fetchGitHubJson(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<{ response: Response; rawPayload: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(input, { ...init, signal: controller.signal });
    try {
      return { response, rawPayload: await response.json() };
    } catch (error) {
      if (controller.signal.aborted) {
        throw error;
      }
      return { response, rawPayload: undefined };
    }
  } finally {
    clearTimeout(timeout);
  }
}

type CollectedCloudflareCheckRun = {
  suiteId: string;
  branchName: string | null;
  checkRun: z.infer<typeof cloudflareCheckRunSchema>;
};

type ProviderCloudflareCheckSignature = {
  suiteId: string;
  sourceKey: string;
  branchName: string | null;
  name: string;
  status: string;
  conclusion: string | null;
  summary: string | null;
  detailsUrl: string | null;
  githubUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

type RepositoryScopedCommit = {
  nodeId: string;
  repositoryNodeId: string;
  sha: string;
};

type CloudflareCheckRunType = "ALL" | "LATEST";

type RepositoryScopedCommitRequest = RepositoryScopedCommit & {
  checkRunType: CloudflareCheckRunType;
};

type CommitMetadataSignature = RepositoryScopedCommit & {
  statusCheckRollup: {
    state: (typeof GITHUB_STATUS_CHECK_ROLLUP_STATES)[number];
    contexts: GitHubCheckCountsSnapshotInput;
  } | null;
};

type CloudflareCommitSignature = RepositoryScopedCommit & {
  cloudflareChecks: ProviderCloudflareCheckSignature[];
};

type CloudflareCommitObservation = {
  checkRuns: CollectedCloudflareCheckRun[];
  signature: CloudflareCommitSignature;
};

type CollectedCommitMetadata = {
  commit: CollectedRepositoryInventoryItem["headCommit"];
  identity: RepositoryScopedCommit;
  signature: CommitMetadataSignature;
  summaryCheckState: RepositorySummaryCheckState;
};

type CollectedBranchWithoutCloudflareBuilds = Omit<
  Extract<CollectedRepositoryInventoryItem, { kind: "branch" }>,
  "cloudflareBuilds"
>;
type CollectedPullRequestWithoutCloudflareBuilds = Omit<
  Extract<CollectedRepositoryInventoryItem, { kind: "pull_request" }>,
  "cloudflareBuilds"
>;
type CollectedItemWithoutCloudflareBuilds =
  | CollectedBranchWithoutCloudflareBuilds
  | CollectedPullRequestWithoutCloudflareBuilds;

type InventoryItemCommitAssociation = {
  rowKey: string;
  branchName: string;
  refRepositoryNodeId: string | null;
  pullRequestUrl: string | null;
  commit: RepositoryScopedCommit;
  signature: CommitMetadataSignature;
};

class GitHubGraphqlRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GitHubGraphqlRequestError";
  }
}

export class GitHubGraphqlRateLimitError extends Error {
  constructor(
    message: string,
    readonly limitKind: "primary" | "secondary",
    readonly retryAt: number,
    readonly usage: GitHubGraphqlRateUsage | undefined,
  ) {
    super(message);
    this.name = "GitHubGraphqlRateLimitError";
  }
}

export type ResolvedGitHubRepositoryIdentity = {
  databaseId: string;
  nodeId: string;
  ownerDatabaseId: string;
  owner: string;
  name: string;
  fullName: string;
};

function requireResolvedGitHubRepositoryIdentity(args: {
  identity: z.infer<typeof resolvedRepositorySchema> | null;
  repositoryNodeId: string;
  expectedRepositoryDatabaseId: string;
}): ResolvedGitHubRepositoryIdentity {
  const { identity } = args;
  if (identity === null) {
    throw new GitHubGraphqlRequestError(
      "GitHub repository identity is unavailable to the current connection.",
      false,
    );
  }
  if (
    identity.id !== args.repositoryNodeId ||
    String(identity.databaseId) !== args.expectedRepositoryDatabaseId
  ) {
    throw new GitHubGraphqlRequestError("GitHub returned another repository.", false);
  }
  const { owner, name } = parseRepositoryFullName(identity.nameWithOwner);
  if (owner.toLowerCase() !== identity.owner.login.toLowerCase() || name !== identity.name) {
    throw new GitHubGraphqlRequestError(
      "GitHub returned inconsistent repository coordinates.",
      false,
    );
  }
  return {
    databaseId: String(identity.databaseId),
    nodeId: identity.id,
    ownerDatabaseId: String(identity.owner.databaseId),
    owner,
    name,
    fullName: identity.nameWithOwner,
  };
}

export async function resolveGitHubRepositoryIdentity(args: {
  credential: string;
  repositoryNodeId: string;
  expectedRepositoryDatabaseId: string;
  fetchImpl?: typeof fetch;
}): Promise<ResolvedGitHubRepositoryIdentity> {
  const response = resolvedRepositoryIdentitySchema.parse(
    await createGitHubGraphqlClient({
      credential: args.credential,
      fetchImpl: args.fetchImpl,
    }).request(RESOLVE_REPOSITORY_IDENTITY_QUERY, {
      repositoryId: args.repositoryNodeId,
    }),
  );
  return requireResolvedGitHubRepositoryIdentity({
    identity: response.repository,
    repositoryNodeId: args.repositoryNodeId,
    expectedRepositoryDatabaseId: args.expectedRepositoryDatabaseId,
  });
}

export async function renameGitHubRepositoryForDeletion(args: {
  credential: string;
  repositoryNodeId: string;
  expectedRepositoryDatabaseId: string;
  deletionRepositoryName: string;
  fetchImpl?: typeof fetch;
}): Promise<ResolvedGitHubRepositoryIdentity> {
  const response = renamedRepositoryIdentitySchema.parse(
    await createGitHubGraphqlClient({
      credential: args.credential,
      fetchImpl: args.fetchImpl,
    }).request(RENAME_REPOSITORY_FOR_DELETION_MUTATION, {
      repositoryId: args.repositoryNodeId,
      name: args.deletionRepositoryName,
    }),
  );
  const identity = requireResolvedGitHubRepositoryIdentity({
    identity: response.updateRepository.repository,
    repositoryNodeId: args.repositoryNodeId,
    expectedRepositoryDatabaseId: args.expectedRepositoryDatabaseId,
  });
  if (identity.name !== args.deletionRepositoryName) {
    throw new GitHubGraphqlRequestError(
      "GitHub did not apply the repository deletion tombstone.",
      false,
    );
  }
  return identity;
}

function requireRepository<T>(repository: T | null): T {
  if (repository === null) {
    throw new GitHubGraphqlRequestError("GitHub repository was not found.", false);
  }
  return repository;
}

function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new GitHubGraphqlRequestError("GitHub returned an invalid timestamp.", false);
  }
  return timestamp;
}

function optionalString(value: string | null): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requireNextCursor(pageInfo: z.infer<typeof pageInfoSchema>): string | null {
  if (!pageInfo.hasNextPage) {
    return null;
  }
  if (pageInfo.endCursor === null || pageInfo.endCursor.length === 0) {
    throw new GitHubGraphqlRequestError(
      "GitHub pagination reported another page without a cursor.",
      true,
    );
  }
  return pageInfo.endCursor;
}

function assertNewCursor(seenCursors: Set<string>, cursor: string): void {
  if (seenCursors.has(cursor)) {
    throw new GitHubGraphqlRequestError("GitHub pagination cursor repeated.", true);
  }
  seenCursors.add(cursor);
}

function assertPageLimit(page: number): void {
  if (page > GITHUB_GRAPHQL_MAX_PAGES) {
    throw new GitHubGraphqlRequestError("GitHub pagination exceeded its safety limit.", false);
  }
}

function assertRepositoryIdentity(args: {
  expectedId: string | null;
  expectedFullName: string;
  actualId: string;
  actualFullName: string;
}): string {
  if (args.actualFullName.toLowerCase() !== args.expectedFullName.toLowerCase()) {
    throw new GitHubGraphqlRequestError("GitHub returned another repository.", false);
  }
  if (args.expectedId !== null && args.actualId !== args.expectedId) {
    throw new GitHubGraphqlRequestError(
      "GitHub repository identity changed during pagination.",
      true,
    );
  }
  return args.actualId;
}

function canonicalCheckCounts(
  contexts: z.infer<typeof checkCountsSchema>,
): GitHubCheckCountsSnapshotInput {
  const counts = {
    totalCount: contexts.totalCount,
    checkRunCount: contexts.checkRunCount,
    statusContextCount: contexts.statusContextCount,
    checkRunCountsByState: [...contexts.checkRunCountsByState].sort((left, right) =>
      left.state.localeCompare(right.state),
    ),
    statusContextCountsByState: [...contexts.statusContextCountsByState].sort((left, right) =>
      left.state.localeCompare(right.state),
    ),
  };
  try {
    buildRepositoryInventoryCheckSummaryFromCounts(counts);
  } catch (error) {
    throw new GitHubGraphqlRequestError(
      `GitHub returned inconsistent aggregate check counts: ${toErrorMessage(error)}`,
      true,
    );
  }
  return counts;
}

function toCheckSummary(
  rollup: z.infer<typeof statusCheckRollupSchema>,
): RepositoryInventoryCheckSummary {
  return buildRepositoryInventoryCheckSummaryFromCounts(
    rollup === null
      ? {
          totalCount: 0,
          checkRunCount: 0,
          statusContextCount: 0,
          checkRunCountsByState: [],
          statusContextCountsByState: [],
        }
      : canonicalCheckCounts(rollup.contexts),
  );
}

async function readCompleteCloudflareSuiteCheckRuns(args: {
  requestGraphql: RepositoryInventoryGraphqlRequest;
  suite: z.infer<typeof cloudflareCheckSuiteSchema>;
  checkRunType: CloudflareCheckRunType;
}): Promise<z.infer<typeof cloudflareCheckRunSchema>[]> {
  const expectedTotalCount = args.suite.checkRuns.totalCount;
  const checkRuns = [...args.suite.checkRuns.nodes];
  const seenCheckRunIds = new Set<string>();
  for (const checkRun of checkRuns) {
    if (seenCheckRunIds.has(checkRun.id)) {
      throw new GitHubGraphqlRequestError(
        "GitHub returned a duplicate Cloudflare check run.",
        true,
      );
    }
    seenCheckRunIds.add(checkRun.id);
  }

  const seenCursors = new Set<string>();
  let cursor = requireNextCursor(args.suite.checkRuns.pageInfo);
  let page = 2;
  while (cursor !== null) {
    assertPageLimit(page);
    assertNewCursor(seenCursors, cursor);
    const response = cloudflareCheckRunContinuationSchema.parse(
      await args.requestGraphql(REPOSITORY_CLOUDFLARE_CHECK_RUN_CONTINUATION_QUERY, {
        nodeId: args.suite.id,
        after: cursor,
        checkRunType: args.checkRunType,
      }),
    );
    const node = response.node;
    if (
      node === null ||
      node.id !== args.suite.id ||
      node.branch?.name !== args.suite.branch?.name ||
      node.checkRuns.totalCount !== expectedTotalCount
    ) {
      throw new GitHubGraphqlRequestError(
        "GitHub Cloudflare check run pagination changed while it was being collected.",
        true,
      );
    }
    for (const checkRun of node.checkRuns.nodes) {
      if (seenCheckRunIds.has(checkRun.id)) {
        throw new GitHubGraphqlRequestError(
          "GitHub returned a duplicate Cloudflare check run.",
          true,
        );
      }
      seenCheckRunIds.add(checkRun.id);
      checkRuns.push(checkRun);
    }
    cursor = requireNextCursor(node.checkRuns.pageInfo);
    page += 1;
  }

  if (checkRuns.length !== expectedTotalCount) {
    throw new GitHubGraphqlRequestError(
      "GitHub Cloudflare check run pagination did not return every check run.",
      true,
    );
  }
  return checkRuns;
}

async function readCompleteCloudflareCheckRuns(args: {
  requestGraphql: RepositoryInventoryGraphqlRequest;
  value: z.infer<typeof cloudflareCommitObservationSchema>;
  checkRunType: CloudflareCheckRunType;
}): Promise<CollectedCloudflareCheckRun[]> {
  const initial = args.value.checkSuites;
  const expectedTotalCount = initial.totalCount;
  const seenSuiteIds = new Set<string>();
  const seenCheckRunIds = new Set<string>();
  const checkRuns: CollectedCloudflareCheckRun[] = [];

  const appendSuite = async (suite: z.infer<typeof cloudflareCheckSuiteSchema>): Promise<void> => {
    if (seenSuiteIds.has(suite.id)) {
      throw new GitHubGraphqlRequestError(
        "GitHub returned a duplicate Cloudflare check suite.",
        true,
      );
    }
    seenSuiteIds.add(suite.id);
    for (const checkRun of await readCompleteCloudflareSuiteCheckRuns({
      requestGraphql: args.requestGraphql,
      suite,
      checkRunType: args.checkRunType,
    })) {
      if (seenCheckRunIds.has(checkRun.id)) {
        throw new GitHubGraphqlRequestError(
          "GitHub returned a Cloudflare check run in more than one suite.",
          true,
        );
      }
      seenCheckRunIds.add(checkRun.id);
      checkRuns.push({
        suiteId: suite.id,
        branchName: suite.branch?.name ?? null,
        checkRun,
      });
    }
  };

  for (const suite of initial.nodes) {
    await appendSuite(suite);
  }

  const seenCursors = new Set<string>();
  let cursor = requireNextCursor(initial.pageInfo);
  let page = 2;
  while (cursor !== null) {
    assertPageLimit(page);
    assertNewCursor(seenCursors, cursor);
    const response = cloudflareSuiteContinuationSchema.parse(
      await args.requestGraphql(REPOSITORY_CLOUDFLARE_SUITE_CONTINUATION_QUERY, {
        nodeId: args.value.id,
        after: cursor,
        checkRunType: args.checkRunType,
      }),
    );
    const node = response.node;
    if (
      node === null ||
      node.id !== args.value.id ||
      node.oid !== args.value.oid ||
      node.repository.id !== args.value.repository.id ||
      node.checkSuites.totalCount !== expectedTotalCount
    ) {
      throw new GitHubGraphqlRequestError(
        "GitHub Cloudflare check suite pagination changed while it was being collected.",
        true,
      );
    }
    for (const suite of node.checkSuites.nodes) {
      await appendSuite(suite);
    }
    cursor = requireNextCursor(node.checkSuites.pageInfo);
    page += 1;
  }

  if (seenSuiteIds.size !== expectedTotalCount) {
    throw new GitHubGraphqlRequestError(
      "GitHub Cloudflare check suite pagination did not return every suite.",
      true,
    );
  }
  return checkRuns.sort(
    (left, right) =>
      left.suiteId.localeCompare(right.suiteId) ||
      left.checkRun.id.localeCompare(right.checkRun.id),
  );
}

function toCloudflareBuild(args: {
  value: CollectedCloudflareCheckRun;
  branch: RepositoryInventoryCloudflareBuild["branch"];
  rootDirectory?: string;
}): RepositoryInventoryCloudflareBuild {
  const value = args.value;
  const input: GitHubCloudflareBuildSnapshotInput = {
    id: value.checkRun.id,
    name: value.checkRun.name,
    status: value.checkRun.status.toLowerCase(),
    conclusion: value.checkRun.conclusion?.toLowerCase(),
    detailsUrl: optionalString(value.checkRun.detailsUrl),
    htmlUrl: optionalString(value.checkRun.url),
    outputSummary: optionalString(value.checkRun.summary),
    startedAt: optionalString(value.checkRun.startedAt),
    completedAt: optionalString(value.checkRun.completedAt),
    branch: args.branch,
    rootDirectory: args.rootDirectory,
  };
  return normalizeCloudflareBuildCheckRun(input);
}

function cloudflareCommitSignature(args: {
  value: z.infer<typeof cloudflareCommitObservationSchema>;
  cloudflareCheckRuns: readonly CollectedCloudflareCheckRun[];
}): CloudflareCommitSignature {
  return {
    nodeId: args.value.id,
    repositoryNodeId: args.value.repository.id,
    sha: args.value.oid,
    cloudflareChecks: args.cloudflareCheckRuns.map(({ suiteId, branchName, checkRun }) => ({
      suiteId,
      sourceKey: checkRun.id,
      branchName,
      name: checkRun.name,
      status: checkRun.status.toLowerCase(),
      conclusion: checkRun.conclusion?.toLowerCase() ?? null,
      summary: checkRun.summary,
      detailsUrl: checkRun.detailsUrl,
      githubUrl: checkRun.url,
      startedAt: checkRun.startedAt,
      completedAt: checkRun.completedAt,
    })),
  };
}

function repositoryScopedCommitKey(commit: RepositoryScopedCommit): string {
  return JSON.stringify([commit.repositoryNodeId, commit.sha]);
}

function commitMetadataSignature(
  value: z.infer<typeof commitSignatureSchema>,
): CommitMetadataSignature {
  const rollup = value.statusCheckRollup;
  return {
    nodeId: value.id,
    repositoryNodeId: value.repository.id,
    sha: value.oid,
    statusCheckRollup:
      rollup === null
        ? null
        : {
            state: rollup.state,
            contexts: canonicalCheckCounts(rollup.contexts),
          },
  };
}

function collectCommitMetadata(value: z.infer<typeof commitSchema>): CollectedCommitMetadata {
  const signature = commitMetadataSignature(value);
  return {
    identity: {
      nodeId: signature.nodeId,
      repositoryNodeId: signature.repositoryNodeId,
      sha: signature.sha,
    },
    signature,
    summaryCheckState: repositorySummaryCheckStateFromGitHubRollup(
      value.statusCheckRollup?.state ?? null,
    ),
    commit: {
      sha: value.oid,
      title: optionalString(value.messageHeadline),
      authoredAt: parseTimestamp(value.authoredDate),
      checks: toCheckSummary(value.statusCheckRollup),
    },
  };
}

function sameCommitMetadataSignature(
  left: CommitMetadataSignature,
  right: CommitMetadataSignature,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function uniqueRepositoryScopedCommits(
  associations: readonly InventoryItemCommitAssociation[],
): RepositoryScopedCommitRequest[] {
  const byKey = new Map<string, RepositoryScopedCommit>();
  const signatureByKey = new Map<string, CommitMetadataSignature>();
  const keyByNodeId = new Map<string, string>();
  const refIdentitiesByKey = new Map<string, Set<string>>();
  const requiresAuthoritativeBranchByKey = new Map<string, boolean>();
  for (const association of associations) {
    const key = repositoryScopedCommitKey(association.commit);
    const existing = byKey.get(key);
    if (existing !== undefined && existing.nodeId !== association.commit.nodeId) {
      throw new GitHubGraphqlRequestError(
        "GitHub returned two commit identities for one repository commit.",
        true,
      );
    }
    const existingSignature = signatureByKey.get(key);
    if (
      existingSignature !== undefined &&
      !sameCommitMetadataSignature(existingSignature, association.signature)
    ) {
      throw new GitHubGraphqlRequestError(
        "GitHub returned different metadata for one repository commit.",
        true,
      );
    }
    const existingKey = keyByNodeId.get(association.commit.nodeId);
    if (existingKey !== undefined && existingKey !== key) {
      throw new GitHubGraphqlRequestError(
        "GitHub returned one commit identity for different repository commits.",
        true,
      );
    }
    byKey.set(key, association.commit);
    signatureByKey.set(key, association.signature);
    keyByNodeId.set(association.commit.nodeId, key);
    const refIdentities = refIdentitiesByKey.get(key) ?? new Set<string>();
    refIdentities.add(
      association.refRepositoryNodeId === null
        ? JSON.stringify(["unavailable", association.rowKey])
        : JSON.stringify([association.refRepositoryNodeId, association.branchName]),
    );
    refIdentitiesByKey.set(key, refIdentities);
    if (
      association.refRepositoryNodeId === null ||
      association.refRepositoryNodeId !== association.commit.repositoryNodeId
    ) {
      requiresAuthoritativeBranchByKey.set(key, true);
    }
  }
  return [...byKey]
    .map(
      ([key, commit]): RepositoryScopedCommitRequest => ({
        ...commit,
        checkRunType:
          (refIdentitiesByKey.get(key)?.size ?? 0) > 1 ||
          requiresAuthoritativeBranchByKey.get(key) === true
            ? "ALL"
            : "LATEST",
      }),
    )
    .sort(
      (left, right) =>
        left.checkRunType.localeCompare(right.checkRunType) ||
        left.repositoryNodeId.localeCompare(right.repositoryNodeId) ||
        left.sha.localeCompare(right.sha),
    );
}

async function collectCloudflareCommitObservations(args: {
  requestGraphql: RepositoryInventoryGraphqlRequest;
  commits: readonly RepositoryScopedCommitRequest[];
  batchSize: number;
}): Promise<ReadonlyMap<string, CloudflareCommitObservation>> {
  const observations = new Map<string, CloudflareCommitObservation>();
  for (const checkRunType of ["LATEST", "ALL"] as const) {
    const commits = args.commits.filter((commit) => commit.checkRunType === checkRunType);
    for (let start = 0; start < commits.length; start += args.batchSize) {
      const batch = commits.slice(start, start + args.batchSize);
      const expectedByNodeId = new Map(batch.map((commit) => [commit.nodeId, commit]));
      if (expectedByNodeId.size !== batch.length) {
        throw new GitHubGraphqlRequestError(
          "GitHub repository commit batch contained duplicate node identities.",
          true,
        );
      }
      const response = cloudflareCommitBatchSchema.parse(
        await args.requestGraphql(REPOSITORY_CLOUDFLARE_COMMIT_BATCH_QUERY, {
          commitIds: batch.map((commit) => commit.nodeId),
          checkRunType,
        }),
      );
      if (response.nodes.length !== batch.length) {
        throw new GitHubGraphqlRequestError(
          "GitHub omitted a repository commit from Cloudflare observation.",
          true,
        );
      }
      const seenNodeIds = new Set<string>();
      for (const rawNode of response.nodes) {
        const parsed = cloudflareCommitObservationSchema.safeParse(rawNode);
        if (!parsed.success) {
          throw new GitHubGraphqlRequestError(
            "GitHub returned a non-commit Cloudflare observation.",
            true,
          );
        }
        const value = parsed.data;
        const expected = expectedByNodeId.get(value.id);
        if (expected === undefined || seenNodeIds.has(value.id)) {
          throw new GitHubGraphqlRequestError(
            "GitHub returned an unexpected or duplicate Cloudflare commit observation.",
            true,
          );
        }
        if (value.oid !== expected.sha || value.repository.id !== expected.repositoryNodeId) {
          throw new GitHubGraphqlRequestError(
            "GitHub Cloudflare observation did not match its repository commit.",
            true,
          );
        }
        seenNodeIds.add(value.id);
        const checkRuns = await readCompleteCloudflareCheckRuns({
          requestGraphql: args.requestGraphql,
          value,
          checkRunType,
        });
        const key = repositoryScopedCommitKey(expected);
        if (observations.has(key)) {
          throw new GitHubGraphqlRequestError(
            "GitHub returned a duplicate repository commit observation.",
            true,
          );
        }
        observations.set(key, {
          checkRuns,
          signature: cloudflareCommitSignature({ value, cloudflareCheckRuns: checkRuns }),
        });
      }
      if (seenNodeIds.size !== batch.length) {
        throw new GitHubGraphqlRequestError(
          "GitHub omitted a repository commit from Cloudflare observation.",
          true,
        );
      }
    }
  }
  return observations;
}

function sameCloudflareCommitSignature(
  left: CloudflareCommitSignature,
  right: CloudflareCommitSignature,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertSameCloudflareCommitObservations(args: {
  collected: ReadonlyMap<string, CloudflareCommitObservation>;
  verified: ReadonlyMap<string, CloudflareCommitObservation>;
}): void {
  if (args.collected.size !== args.verified.size) {
    throw new GitHubGraphqlRequestError(
      "GitHub Cloudflare build observations changed while the repository was being collected.",
      true,
    );
  }
  for (const [key, collected] of args.collected) {
    const verified = args.verified.get(key);
    if (
      verified === undefined ||
      !sameCloudflareCommitSignature(collected.signature, verified.signature)
    ) {
      throw new GitHubGraphqlRequestError(
        "GitHub Cloudflare build observations changed while the repository was being collected.",
        true,
      );
    }
  }
}

type CloudflareBuildCandidate = {
  commit: RepositoryScopedCommitRequest;
  source: CollectedCloudflareCheckRun;
  build: RepositoryInventoryCloudflareBuild;
  priority: RepositoryInventoryCloudflareBuildResolutionRequest["priority"];
  candidateRefs: Array<{
    repositoryNodeId: string | null;
    branchName: string;
    pullRequestUrls: string[];
  }>;
};

function cloudflareBuildAliasUrl(build: RepositoryInventoryCloudflareBuild): string | undefined {
  if (build.preview.state !== "ready") {
    return undefined;
  }
  switch (build.preview.branchAlias.state) {
    case "ready":
      return build.preview.branchAlias.url;
    case "provider_unknown":
      return build.preview.branchAlias.providerUrl;
    case "not_provided":
      return undefined;
    default: {
      build.preview.branchAlias satisfies never;
      return undefined;
    }
  }
}

function assertCompatibleCloudflareBuildObservations(
  left: CloudflareBuildCandidate,
  right: CloudflareBuildCandidate,
): void {
  const conflicting =
    left.commit.repositoryNodeId !== right.commit.repositoryNodeId ||
    left.commit.sha !== right.commit.sha ||
    left.build.providerBuildId !== right.build.providerBuildId ||
    left.build.workerName !== right.build.workerName ||
    (left.build.detailsUrl !== undefined &&
      right.build.detailsUrl !== undefined &&
      left.build.detailsUrl !== right.build.detailsUrl) ||
    (left.build.preview.state === "ready" &&
      right.build.preview.state === "ready" &&
      left.build.preview.versionUrl !== right.build.preview.versionUrl) ||
    (cloudflareBuildAliasUrl(left.build) !== undefined &&
      cloudflareBuildAliasUrl(right.build) !== undefined &&
      cloudflareBuildAliasUrl(left.build) !== cloudflareBuildAliasUrl(right.build));
  if (conflicting) {
    throw new GitHubGraphqlRequestError(
      "GitHub returned conflicting evidence for one Cloudflare build.",
      true,
    );
  }
}

function cloudflareBuildObservationOrder(
  left: CloudflareBuildCandidate,
  right: CloudflareBuildCandidate,
): number {
  const leftTime = left.build.completedAt ?? left.build.startedAt ?? 0;
  const rightTime = right.build.completedAt ?? right.build.startedAt ?? 0;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  const stateOrder: Record<RepositoryInventoryCloudflareBuild["state"], number> = {
    queued: 0,
    running: 1,
    provider_unknown: 2,
    skipped: 3,
    cancelled: 4,
    failure: 5,
    success: 6,
  };
  return (
    stateOrder[left.build.state] - stateOrder[right.build.state] ||
    left.source.checkRun.id.localeCompare(right.source.checkRun.id)
  );
}

function currentCloudflareBuildCandidates(
  candidates: readonly CloudflareBuildCandidate[],
): CloudflareBuildCandidate[] {
  const bySourceKey = new Map<string, CloudflareBuildCandidate>();
  for (const candidate of candidates) {
    const existing = bySourceKey.get(candidate.build.sourceKey);
    if (existing !== undefined) {
      assertCompatibleCloudflareBuildObservations(existing, candidate);
      if (cloudflareBuildObservationOrder(existing, candidate) < 0) {
        bySourceKey.set(candidate.build.sourceKey, candidate);
      }
      continue;
    }
    bySourceKey.set(candidate.build.sourceKey, candidate);
  }
  return [...bySourceKey.values()];
}

async function attachCloudflareBuilds(args: {
  items: readonly CollectedItemWithoutCloudflareBuilds[];
  associations: readonly InventoryItemCommitAssociation[];
  commits: readonly RepositoryScopedCommitRequest[];
  observations: ReadonlyMap<string, CloudflareCommitObservation>;
  resolveCloudflareBuilds?: RepositoryInventoryCloudflareBuildResolver;
}): Promise<{
  items: CollectedRepositoryInventoryItem[];
  unattributedCloudflareBuilds: CollectedRepositoryInventoryUnattributedCloudflareBuild[];
}> {
  const associationsByRowKey = new Map<string, InventoryItemCommitAssociation>();
  const associationsByCommitKey = new Map<string, InventoryItemCommitAssociation[]>();
  for (const association of args.associations) {
    if (associationsByRowKey.has(association.rowKey)) {
      throw new Error("Repository inventory item has more than one commit association.");
    }
    associationsByRowKey.set(association.rowKey, association);
    const commitKey = repositoryScopedCommitKey(association.commit);
    const commitAssociations = associationsByCommitKey.get(commitKey) ?? [];
    commitAssociations.push(association);
    associationsByCommitKey.set(commitKey, commitAssociations);
  }
  const commitByKey = new Map(
    args.commits.map((commit) => [repositoryScopedCommitKey(commit), commit]),
  );
  const itemByRowKey = new Map(args.items.map((item) => [item.rowKey, item]));
  const candidates: CloudflareBuildCandidate[] = [];
  for (const [commitKey, observation] of args.observations) {
    const commit = commitByKey.get(commitKey);
    const commitAssociations = associationsByCommitKey.get(commitKey);
    if (commit === undefined || commitAssociations === undefined) {
      throw new Error("Repository inventory Cloudflare observation has no commit association.");
    }
    const candidateRefByIdentity = new Map<
      string,
      {
        repositoryNodeId: string | null;
        branchName: string;
        pullRequestUrls: string[];
      }
    >();
    for (const association of commitAssociations) {
      const identity = JSON.stringify([association.refRepositoryNodeId, association.branchName]);
      const candidateRef = candidateRefByIdentity.get(identity) ?? {
        repositoryNodeId: association.refRepositoryNodeId,
        branchName: association.branchName,
        pullRequestUrls: [],
      };
      if (
        association.pullRequestUrl !== null &&
        !candidateRef.pullRequestUrls.includes(association.pullRequestUrl)
      ) {
        candidateRef.pullRequestUrls.push(association.pullRequestUrl);
      }
      candidateRefByIdentity.set(identity, candidateRef);
    }
    const candidateRefs = [...candidateRefByIdentity.values()].map((candidateRef) => ({
      ...candidateRef,
      pullRequestUrls: candidateRef.pullRequestUrls.sort(),
    }));
    candidateRefs.sort(
      (left, right) =>
        (left.repositoryNodeId ?? "").localeCompare(right.repositoryNodeId ?? "") ||
        left.branchName.localeCompare(right.branchName),
    );
    const priority = commitAssociations
      .map((association) => itemByRowKey.get(association.rowKey))
      .filter((item) => item !== undefined)
      .sort(
        (left, right) =>
          left.sortGroup - right.sortGroup ||
          left.sortTime - right.sortTime ||
          left.rowKey.localeCompare(right.rowKey),
      )
      .at(0);
    if (priority === undefined) {
      throw new Error("Repository inventory Cloudflare observation has no visible item.");
    }
    for (const source of observation.checkRuns) {
      const onlyCandidateRef = candidateRefs.length === 1 ? candidateRefs[0] : undefined;
      const exactRef =
        commit.checkRunType === "LATEST" &&
        source.branchName !== null &&
        onlyCandidateRef?.repositoryNodeId === commit.repositoryNodeId &&
        onlyCandidateRef.branchName === source.branchName;
      let branch: RepositoryInventoryCloudflareBuild["branch"];
      if (exactRef && source.branchName !== null) {
        branch = { state: "known", name: source.branchName };
      } else if (commit.checkRunType === "ALL" || source.branchName !== null) {
        branch = { state: "conflicting_evidence", suiteBranch: source.branchName };
      } else {
        branch = { state: "unknown" };
      }
      candidates.push({
        commit,
        source,
        build: toCloudflareBuild({ value: source, branch }),
        priority: {
          sortGroup: priority.sortGroup,
          sortTime: priority.sortTime,
          rowKey: priority.rowKey,
        },
        candidateRefs,
      });
    }
  }

  const currentCandidates = currentCloudflareBuildCandidates(candidates);
  const resolutionRequests: RepositoryInventoryCloudflareBuildResolutionRequest[] =
    currentCandidates
      .map((candidate) => ({
        sourceKey: candidate.build.sourceKey,
        providerBuildId: candidate.build.providerBuildId ?? null,
        workerName: candidate.build.workerName,
        detailsUrl: candidate.build.detailsUrl ?? null,
        commitRepositoryNodeId: candidate.commit.repositoryNodeId,
        commitSha: candidate.commit.sha,
        requiresBranchResolution: candidate.build.branch.state !== "known",
        priority: candidate.priority,
        candidateRefs: candidate.candidateRefs,
      }))
      .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
  const resolutions =
    args.resolveCloudflareBuilds === undefined || resolutionRequests.length === 0
      ? []
      : await args.resolveCloudflareBuilds(resolutionRequests);
  const requestBySourceKey = new Map(
    resolutionRequests.map((request) => [request.sourceKey, request]),
  );
  const resolutionBySourceKey = new Map<string, RepositoryInventoryCloudflareBuildResolution>();
  for (const resolution of resolutions) {
    const request = requestBySourceKey.get(resolution.sourceKey);
    const branchResolution = resolution.branch;
    if (
      request === undefined ||
      resolutionBySourceKey.has(resolution.sourceKey) ||
      request.providerBuildId !== resolution.providerBuildId ||
      resolution.accountId.length === 0 ||
      resolution.workerTag.length === 0 ||
      resolution.rootDirectory.length === 0 ||
      (branchResolution.state === "resolved" &&
        (!request.requiresBranchResolution ||
          !Number.isFinite(branchResolution.createdAt) ||
          !request.candidateRefs.some(
            (ref) =>
              ref.repositoryNodeId === branchResolution.refRepositoryNodeId &&
              ref.branchName === branchResolution.branchName,
          )))
    ) {
      throw new Error("Cloudflare build resolution returned an invalid build identity.");
    }
    resolutionBySourceKey.set(resolution.sourceKey, resolution);
  }

  type CurrentBuildAssociation = {
    candidate: CloudflareBuildCandidate;
    build: RepositoryInventoryCloudflareBuild;
    refRepositoryNodeId: string;
    branchName: string;
    createdAt: number;
  };
  const resolvedCurrentByRef = new Map<string, CurrentBuildAssociation>();
  const unattributedBySourceKey = new Map<
    string,
    { candidate: CloudflareBuildCandidate; build: RepositoryInventoryCloudflareBuild }
  >();
  const unresolvedAmbiguousCandidates = currentCandidates.filter((candidate) => {
    const resolution = resolutionBySourceKey.get(candidate.build.sourceKey);
    return candidate.build.branch.state !== "known" && resolution?.branch.state !== "resolved";
  });
  const retainCurrentAssociation = (refKey: string, association: CurrentBuildAssociation): void => {
    const existing = resolvedCurrentByRef.get(refKey);
    if (
      existing === undefined ||
      existing.createdAt < association.createdAt ||
      (existing.createdAt === association.createdAt &&
        existing.candidate.build.sourceKey.localeCompare(association.candidate.build.sourceKey) < 0)
    ) {
      resolvedCurrentByRef.set(refKey, association);
    }
  };

  for (const candidate of currentCandidates) {
    const resolution = resolutionBySourceKey.get(candidate.build.sourceKey);
    const rootDirectory = resolution?.rootDirectory;
    const build =
      rootDirectory === undefined
        ? candidate.build
        : toCloudflareBuild({
            value: candidate.source,
            branch: candidate.build.branch,
            rootDirectory,
          });
    if (resolution?.branch.state === "resolved") {
      const supersededByUnresolved = unresolvedAmbiguousCandidates.some(
        (unresolved) =>
          repositoryScopedCommitKey(unresolved.commit) ===
            repositoryScopedCommitKey(candidate.commit) &&
          unresolved.build.workerName === candidate.build.workerName &&
          cloudflareBuildObservationOrder(candidate, unresolved) <= 0,
      );
      if (supersededByUnresolved) {
        continue;
      }
      const resolvedBranch = resolution.branch;
      const refKey = JSON.stringify([
        resolution.accountId,
        resolution.workerTag,
        resolvedBranch.refRepositoryNodeId,
        resolvedBranch.branchName,
      ]);
      retainCurrentAssociation(refKey, {
        candidate,
        build: toCloudflareBuild({
          value: candidate.source,
          branch: { state: "known", name: resolvedBranch.branchName },
          rootDirectory: resolution.rootDirectory,
        }),
        refRepositoryNodeId: resolvedBranch.refRepositoryNodeId,
        branchName: resolvedBranch.branchName,
        createdAt: resolvedBranch.createdAt,
      });
      continue;
    }
    if (build.branch.state === "known") {
      const branchName = build.branch.name;
      const knownRef = candidate.candidateRefs.find(
        (ref) =>
          ref.repositoryNodeId === candidate.commit.repositoryNodeId &&
          ref.branchName === branchName,
      );
      if (knownRef !== undefined) {
        const refKey =
          resolution === undefined
            ? JSON.stringify([
                "github",
                candidate.commit.repositoryNodeId,
                build.workerName,
                knownRef.branchName,
              ])
            : JSON.stringify([
                resolution.accountId,
                resolution.workerTag,
                candidate.commit.repositoryNodeId,
                knownRef.branchName,
              ]);
        retainCurrentAssociation(refKey, {
          candidate,
          build,
          refRepositoryNodeId: candidate.commit.repositoryNodeId,
          branchName: knownRef.branchName,
          createdAt: build.completedAt ?? build.startedAt ?? 0,
        });
        continue;
      }
    }
    unattributedBySourceKey.set(build.sourceKey, { candidate, build });
  }

  const buildsByRowKey = new Map<string, RepositoryInventoryCloudflareBuild[]>();
  for (const associationEvidence of resolvedCurrentByRef.values()) {
    const { branchName, build, candidate, refRepositoryNodeId } = associationEvidence;
    const commitAssociations = associationsByCommitKey.get(
      repositoryScopedCommitKey(candidate.commit),
    );
    if (commitAssociations === undefined) {
      throw new Error("Resolved Cloudflare build lost its commit association.");
    }
    for (const association of commitAssociations) {
      if (
        association.refRepositoryNodeId === refRepositoryNodeId &&
        association.branchName === branchName
      ) {
        const rowBuilds = buildsByRowKey.get(association.rowKey) ?? [];
        rowBuilds.push(build);
        buildsByRowKey.set(association.rowKey, rowBuilds);
      }
    }
  }

  const items = args.items.map((item) => {
    if (!associationsByRowKey.has(item.rowKey)) {
      throw new Error("Repository inventory item is missing its commit association.");
    }
    const cloudflareBuilds = (buildsByRowKey.get(item.rowKey) ?? []).sort((left, right) =>
      left.sourceKey.localeCompare(right.sourceKey),
    );
    return item.kind === "branch" ? { ...item, cloudflareBuilds } : { ...item, cloudflareBuilds };
  });
  const unattributedCloudflareBuilds = [...unattributedBySourceKey.values()]
    .map(({ build, candidate }) => ({
      commitRepositoryNodeId: candidate.commit.repositoryNodeId,
      commitSha: candidate.commit.sha,
      build,
    }))
    .sort(
      (left, right) =>
        left.commitRepositoryNodeId.localeCompare(right.commitRepositoryNodeId) ||
        left.commitSha.localeCompare(right.commitSha) ||
        left.build.sourceKey.localeCompare(right.build.sourceKey),
    );
  return { items, unattributedCloudflareBuilds };
}

type PullRequestMetadataSignature = {
  updatedAt: string;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  headRepository: {
    nodeId: string;
    fullName: string;
    owner: string;
  } | null;
  latestCommit: CommitMetadataSignature;
};

function samePullRequestMetadataSignature(
  left: PullRequestMetadataSignature,
  right: PullRequestMetadataSignature,
): boolean {
  return (
    left.updatedAt === right.updatedAt &&
    left.baseRefName === right.baseRefName &&
    left.headRefName === right.headRefName &&
    left.headRefOid === right.headRefOid &&
    JSON.stringify(left.headRepository) === JSON.stringify(right.headRepository) &&
    sameCommitMetadataSignature(left.latestCommit, right.latestCommit)
  );
}

async function readCompleteLabels(args: {
  requestGraphql: RepositoryInventoryGraphqlRequest;
  pullRequestNodeId: string;
  initial: z.infer<typeof labelsSchema>;
}): Promise<z.infer<typeof labelSchema>[]> {
  const expectedTotalCount = args.initial.totalCount;
  const labels = [...args.initial.nodes];
  const seenNames = new Set<string>();
  for (const label of labels) {
    const key = label.name.toLowerCase();
    if (seenNames.has(key)) {
      throw new GitHubGraphqlRequestError("GitHub returned a duplicate pull request label.", true);
    }
    seenNames.add(key);
  }

  const seenCursors = new Set<string>();
  let cursor = requireNextCursor(args.initial.pageInfo);
  let page = 2;
  while (cursor !== null) {
    assertPageLimit(page);
    assertNewCursor(seenCursors, cursor);
    const response = labelContinuationSchema.parse(
      await args.requestGraphql(REPOSITORY_LABEL_CONTINUATION_QUERY, {
        nodeId: args.pullRequestNodeId,
        after: cursor,
      }),
    );
    const node = response.node;
    if (node === null || node.labels.totalCount !== expectedTotalCount) {
      throw new GitHubGraphqlRequestError(
        "GitHub label pagination changed while it was being collected.",
        true,
      );
    }
    for (const label of node.labels.nodes) {
      const key = label.name.toLowerCase();
      if (seenNames.has(key)) {
        throw new GitHubGraphqlRequestError(
          "GitHub returned a duplicate pull request label.",
          true,
        );
      }
      seenNames.add(key);
      labels.push(label);
    }
    cursor = requireNextCursor(node.labels.pageInfo);
    page += 1;
  }

  if (labels.length !== expectedTotalCount) {
    throw new GitHubGraphqlRequestError(
      "GitHub label pagination did not return every label.",
      true,
    );
  }
  return labels.sort((left, right) => {
    const normalizedLeft = left.name.toLowerCase();
    const normalizedRight = right.name.toLowerCase();
    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft < normalizedRight ? -1 : 1;
    }
    return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
  });
}

async function collectBranches(args: {
  repositoryNodeId: string;
  expectedRepositoryDatabaseId: string;
  pageSize: number;
  requestGraphql: RepositoryInventoryGraphqlRequest;
  requestGraphqlPartial: RepositoryInventoryGraphqlPartialRequest;
}): Promise<{
  repositoryId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  defaultBranch: string | null;
  defaultBranchHeadSha: string | null;
  defaultBranchCheckState: RepositorySummaryCheckState | null;
  signatures: ReadonlyMap<string, CommitMetadataSignature>;
  associations: InventoryItemCommitAssociation[];
  items: CollectedBranchWithoutCloudflareBuilds[];
}> {
  const seenCursors = new Set<string>();
  const seenBranchNames = new Set<string>();
  const signatures = new Map<string, CommitMetadataSignature>();
  const associations: InventoryItemCommitAssociation[] = [];
  const items: CollectedBranchWithoutCloudflareBuilds[] = [];
  let repositoryId: string | null = args.repositoryNodeId;
  let repositoryDatabaseId: string | null = null;
  let repositoryFullName: string | null = null;
  let defaultBranch: string | null = null;
  let defaultBranchCheckState: RepositorySummaryCheckState | null = null;
  let defaultBranchSha: string | null = null;
  let expectedTotalCount: number | null = null;
  let cursor: string | null = null;
  let page = 1;

  do {
    assertPageLimit(page);
    const envelope = await args.requestGraphqlPartial(REPOSITORY_BRANCH_PAGE_QUERY, {
      repositoryId: args.repositoryNodeId,
      pageSize: args.pageSize,
      after: cursor,
    });
    rejectErrorsThatCannotBeItemComparisons(envelope.errors);
    const response = branchPageSchema.parse(envelope.data);
    const repository = requireRepository(response.repository);
    const comparisonErrorIndexes = acceptOnlyExpectedComparisonErrors({
      errors: envelope.errors,
      expectedPathByKey: new Map(
        repository.refs.nodes.map((_, index) => [
          String(index),
          ["repository", "refs", "nodes", index, "comparison"],
        ]),
      ),
    });
    const pageRepositoryDatabaseId = String(repository.databaseId);
    if (pageRepositoryDatabaseId !== args.expectedRepositoryDatabaseId) {
      throw new GitHubGraphqlRequestError("GitHub returned another repository.", false);
    }
    repositoryId = assertRepositoryIdentity({
      expectedId: repositoryId,
      expectedFullName: repositoryFullName ?? repository.nameWithOwner,
      actualId: repository.id,
      actualFullName: repository.nameWithOwner,
    });
    if (repositoryDatabaseId !== null && repositoryDatabaseId !== pageRepositoryDatabaseId) {
      throw new GitHubGraphqlRequestError(
        "GitHub repository database identity changed during pagination.",
        true,
      );
    }
    repositoryDatabaseId = pageRepositoryDatabaseId;
    repositoryFullName = repository.nameWithOwner;
    const pageDefaultBranch = repository.defaultBranchRef?.name ?? null;
    const pageDefaultBranchSha = repository.defaultBranchRef?.target.oid ?? null;
    if (page === 1) {
      defaultBranch = pageDefaultBranch;
      defaultBranchSha = pageDefaultBranchSha;
      expectedTotalCount = repository.refs.totalCount;
    } else if (
      defaultBranch !== pageDefaultBranch ||
      defaultBranchSha !== pageDefaultBranchSha ||
      expectedTotalCount !== repository.refs.totalCount
    ) {
      throw new GitHubGraphqlRequestError(
        "GitHub branch inventory changed during pagination.",
        true,
      );
    }

    for (const [index, ref] of repository.refs.nodes.entries()) {
      const branchKey = ref.name;
      if (seenBranchNames.has(branchKey)) {
        throw new GitHubGraphqlRequestError("GitHub returned a duplicate branch.", true);
      }
      seenBranchNames.add(branchKey);
      const rowKey = repositoryInventoryBranchRowKey(ref.name);
      const collectedCommit = collectCommitMetadata(ref.target);
      signatures.set(branchKey, collectedCommit.signature);
      const isDefault = ref.name === defaultBranch;
      if (isDefault) {
        defaultBranchCheckState = collectedCommit.summaryCheckState;
      }
      const lastCommitAt = parseTimestamp(ref.target.committedDate);
      const comparisonError = comparisonErrorIndexes.has(String(index));
      if (comparisonError && ref.comparison !== null) {
        throw new GitHubGraphqlRequestError(
          "GitHub returned both a branch comparison and an error for it.",
          true,
        );
      }
      let comparison: Extract<CollectedRepositoryInventoryItem, { kind: "branch" }>["comparison"];
      if (defaultBranchSha === null) {
        comparison = { state: "unavailable", reason: "default_branch_unavailable" };
      } else if (ref.comparison === null) {
        comparison = { state: "unavailable", reason: "not_comparable" };
      } else {
        if (
          ref.comparison.baseTarget.oid !== ref.target.oid ||
          ref.comparison.headTarget.oid !== defaultBranchSha
        ) {
          throw new GitHubGraphqlRequestError(
            "GitHub branch comparison targets changed while they were being collected.",
            true,
          );
        }
        comparison = {
          state: "ready",
          aheadBy: ref.comparison.behindBy,
          behindBy: ref.comparison.aheadBy,
        };
      }
      items.push({
        kind: "branch",
        sortGroup: isDefault ? 0 : 2,
        sortTime: isDefault ? 0 : -lastCommitAt,
        rowKey,
        name: ref.name,
        isDefault,
        comparison,
        headCommit: collectedCommit.commit,
      });
      associations.push({
        rowKey,
        branchName: ref.name,
        refRepositoryNodeId: repository.id,
        pullRequestUrl: null,
        commit: collectedCommit.identity,
        signature: collectedCommit.signature,
      });
    }

    const nextCursor = requireNextCursor(repository.refs.pageInfo);
    if (nextCursor !== null) {
      assertNewCursor(seenCursors, nextCursor);
    }
    cursor = nextCursor;
    page += 1;
  } while (cursor !== null);

  if (expectedTotalCount !== items.length) {
    throw new GitHubGraphqlRequestError(
      "GitHub branch pagination did not return every branch.",
      true,
    );
  }
  if (defaultBranch !== null && defaultBranchCheckState === null) {
    throw new GitHubGraphqlRequestError("GitHub omitted the default branch from its refs.", true);
  }
  if (defaultBranch !== null && signatures.get(defaultBranch)?.sha !== defaultBranchSha) {
    throw new GitHubGraphqlRequestError(
      "GitHub returned inconsistent default branch targets.",
      true,
    );
  }

  return {
    repositoryId,
    repositoryDatabaseId,
    repositoryFullName,
    defaultBranch,
    defaultBranchHeadSha: defaultBranchSha,
    defaultBranchCheckState,
    signatures,
    associations,
    items,
  };
}

type PullRequestComparison = Extract<
  CollectedRepositoryInventoryItem,
  { kind: "pull_request" }
>["comparison"];

async function collectPullRequestComparisons(args: {
  requestGraphqlPartial: RepositoryInventoryGraphqlPartialRequest;
  repositoryId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  branchHeadShaByName: ReadonlyMap<string, string>;
  pullRequests: readonly z.infer<typeof pullRequestSchema>[];
}): Promise<ReadonlyMap<string, PullRequestComparison>> {
  if (args.pullRequests.length === 0) {
    return new Map();
  }
  const variables: GraphqlVariables = { repositoryId: args.repositoryId };
  for (const [index, pullRequest] of args.pullRequests.entries()) {
    variables[`pr${index}Number`] = pullRequest.number;
    if (pullRequest.headRepository !== null) {
      variables[`pr${index}HeadRef`] =
        `${pullRequest.headRepository.owner.login}:${pullRequest.headRefName}`;
    }
  }
  const envelope = await args.requestGraphqlPartial(
    pullRequestComparisonBatchQuery(args.pullRequests),
    variables,
  );
  rejectErrorsThatCannotBeItemComparisons(envelope.errors);
  const response = pullRequestComparisonBatchSchema.parse(envelope.data);
  const repository = requireRepository(response.repository);
  assertRepositoryIdentity({
    expectedId: args.repositoryId,
    expectedFullName: args.repositoryFullName,
    actualId: repository.id,
    actualFullName: repository.nameWithOwner,
  });
  if (String(repository.databaseId) !== args.repositoryDatabaseId) {
    throw new GitHubGraphqlRequestError(
      "GitHub repository database identity changed during comparison collection.",
      true,
    );
  }
  const comparisonErrorPullRequestIds = acceptOnlyExpectedComparisonErrors({
    errors: envelope.errors,
    expectedPathByKey: new Map(
      args.pullRequests.flatMap((pullRequest, index) =>
        pullRequest.headRepository === null
          ? []
          : [[pullRequest.id, ["repository", `pr${index}`, "baseRef", "comparison"]] as const],
      ),
    ),
  });
  const comparisons = new Map<string, PullRequestComparison>();
  for (const [index, pullRequest] of args.pullRequests.entries()) {
    const node = pullRequestComparisonNodeSchema.nullable().parse(repository[`pr${index}`]);
    if (node === null) {
      throw new GitHubGraphqlRequestError(
        "GitHub pull request changed during comparison collection.",
        true,
      );
    }
    if (
      node.id !== pullRequest.id ||
      node.number !== pullRequest.number ||
      node.baseRefName !== pullRequest.baseRefName ||
      node.headRefName !== pullRequest.headRefName ||
      node.headRefOid !== pullRequest.headRefOid
    ) {
      throw new GitHubGraphqlRequestError(
        "GitHub pull request identity changed during comparison collection.",
        true,
      );
    }
    if (node.baseRef === null) {
      comparisons.set(pullRequest.id, {
        state: "unavailable",
        reason: "base_ref_unavailable",
      });
      continue;
    }
    const expectedBaseSha = args.branchHeadShaByName.get(pullRequest.baseRefName);
    if (
      expectedBaseSha === undefined ||
      node.baseRef.name !== pullRequest.baseRefName ||
      node.baseRef.target.oid !== expectedBaseSha
    ) {
      throw new GitHubGraphqlRequestError(
        "GitHub pull request base changed during comparison collection.",
        true,
      );
    }
    const expectedHeadRepository = pullRequest.headRepository;
    if (expectedHeadRepository === null) {
      if (node.headRepository !== null || node.headRef !== null) {
        throw new GitHubGraphqlRequestError(
          "GitHub pull request head became available during comparison collection.",
          true,
        );
      }
      comparisons.set(pullRequest.id, {
        state: "unavailable",
        reason: "head_ref_unavailable",
      });
      continue;
    }
    if (node.headRepository === null || node.headRef === null) {
      comparisons.set(pullRequest.id, {
        state: "unavailable",
        reason: "head_ref_unavailable",
      });
      continue;
    }
    if (
      node.headRepository.id !== expectedHeadRepository.id ||
      node.headRepository.nameWithOwner.toLowerCase() !==
        expectedHeadRepository.nameWithOwner.toLowerCase() ||
      node.headRepository.owner.login.toLowerCase() !==
        expectedHeadRepository.owner.login.toLowerCase() ||
      node.headRef.name !== pullRequest.headRefName ||
      node.headRef.target.oid !== pullRequest.headRefOid
    ) {
      throw new GitHubGraphqlRequestError(
        "GitHub pull request head changed during comparison collection.",
        true,
      );
    }
    const comparison = node.baseRef.comparison;
    const comparisonError = comparisonErrorPullRequestIds.has(pullRequest.id);
    if (comparisonError && comparison !== null && comparison !== undefined) {
      throw new GitHubGraphqlRequestError(
        "GitHub returned both a pull request comparison and an error for it.",
        true,
      );
    }
    if (comparison === null) {
      comparisons.set(pullRequest.id, {
        state: "unavailable",
        reason: "not_comparable",
      });
      continue;
    }
    if (comparison === undefined) {
      throw new GitHubGraphqlRequestError(
        "GitHub did not return a pull request comparison.",
        false,
      );
    }
    if (
      comparison.baseTarget.oid !== node.baseRef.target.oid ||
      comparison.headTarget.oid !== node.headRef.target.oid
    ) {
      throw new GitHubGraphqlRequestError(
        "GitHub pull request comparison targets changed while they were being collected.",
        true,
      );
    }
    comparisons.set(pullRequest.id, {
      state: "ready",
      aheadBy: comparison.aheadBy,
      behindBy: comparison.behindBy,
    });
  }
  return comparisons;
}

async function collectPullRequests(args: {
  pageSize: number;
  requestGraphql: RepositoryInventoryGraphqlRequest;
  requestGraphqlPartial: RepositoryInventoryGraphqlPartialRequest;
  repositoryId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  branchHeadShaByName: ReadonlyMap<string, string>;
}): Promise<{
  items: CollectedPullRequestWithoutCloudflareBuilds[];
  associations: InventoryItemCommitAssociation[];
  signatures: ReadonlyMap<string, PullRequestMetadataSignature>;
}> {
  const seenCursors = new Set<string>();
  const seenPullRequestIds = new Set<string>();
  const signatures = new Map<string, PullRequestMetadataSignature>();
  const associations: InventoryItemCommitAssociation[] = [];
  const items: CollectedPullRequestWithoutCloudflareBuilds[] = [];
  let expectedTotalCount: number | null = null;
  let cursor: string | null = null;
  let page = 1;

  do {
    assertPageLimit(page);
    const response = pullRequestPageSchema.parse(
      await args.requestGraphql(REPOSITORY_PULL_REQUEST_PAGE_QUERY, {
        repositoryId: args.repositoryId,
        pageSize: args.pageSize,
        after: cursor,
      }),
    );
    const repository = requireRepository(response.repository);
    assertRepositoryIdentity({
      expectedId: args.repositoryId,
      expectedFullName: args.repositoryFullName,
      actualId: repository.id,
      actualFullName: repository.nameWithOwner,
    });
    if (String(repository.databaseId) !== args.repositoryDatabaseId) {
      throw new GitHubGraphqlRequestError(
        "GitHub repository database identity changed during pull request pagination.",
        true,
      );
    }
    if (page === 1) {
      expectedTotalCount = repository.pullRequests.totalCount;
    } else if (expectedTotalCount !== repository.pullRequests.totalCount) {
      throw new GitHubGraphqlRequestError(
        "GitHub pull request count changed during pagination.",
        true,
      );
    }

    const comparisons = await collectPullRequestComparisons({
      requestGraphqlPartial: args.requestGraphqlPartial,
      repositoryId: args.repositoryId,
      repositoryDatabaseId: args.repositoryDatabaseId,
      repositoryFullName: args.repositoryFullName,
      branchHeadShaByName: args.branchHeadShaByName,
      pullRequests: repository.pullRequests.nodes,
    });

    for (const pullRequest of repository.pullRequests.nodes) {
      if (seenPullRequestIds.has(pullRequest.id)) {
        throw new GitHubGraphqlRequestError("GitHub returned a duplicate pull request.", true);
      }
      seenPullRequestIds.add(pullRequest.id);
      if (pullRequest.commits.nodes.length !== 1) {
        throw new GitHubGraphqlRequestError(
          "GitHub pull request did not have one latest commit.",
          true,
        );
      }
      const latestCommit = pullRequest.commits.nodes[0].commit;
      if (latestCommit.oid !== pullRequest.headRefOid) {
        throw new GitHubGraphqlRequestError(
          "GitHub pull request head changed while it was being collected.",
          true,
        );
      }
      const collectedCommit = collectCommitMetadata(latestCommit);
      const rowKey = repositoryInventoryPullRequestRowKey(pullRequest.id);
      signatures.set(rowKey, {
        updatedAt: pullRequest.updatedAt,
        baseRefName: pullRequest.baseRefName,
        headRefName: pullRequest.headRefName,
        headRefOid: pullRequest.headRefOid,
        headRepository:
          pullRequest.headRepository === null
            ? null
            : {
                nodeId: pullRequest.headRepository.id,
                fullName: pullRequest.headRepository.nameWithOwner,
                owner: pullRequest.headRepository.owner.login,
              },
        latestCommit: collectedCommit.signature,
      });
      const pullRequestLabels = await readCompleteLabels({
        requestGraphql: args.requestGraphql,
        pullRequestNodeId: pullRequest.id,
        initial: pullRequest.labels,
      });
      if (
        pullRequest.headRepository !== null &&
        pullRequest.isCrossRepository !== (pullRequest.headRepository.id !== args.repositoryId)
      ) {
        throw new GitHubGraphqlRequestError(
          "GitHub returned inconsistent pull request repository identities.",
          true,
        );
      }
      const isBaseRepositoryHead = pullRequest.headRepository?.id === args.repositoryId;
      const collectedBranchHeadSha = args.branchHeadShaByName.get(pullRequest.headRefName);
      if (
        isBaseRepositoryHead &&
        collectedBranchHeadSha !== undefined &&
        collectedBranchHeadSha !== pullRequest.headRefOid
      ) {
        throw new GitHubGraphqlRequestError(
          "GitHub branch and pull request heads changed while they were being collected.",
          true,
        );
      }
      const canOpenInSamebase =
        isBaseRepositoryHead && collectedBranchHeadSha === pullRequest.headRefOid;
      const comparison = comparisons.get(pullRequest.id);
      if (comparison === undefined) {
        throw new Error("Pull request comparison collection omitted a pull request.");
      }
      items.push({
        kind: "pull_request",
        sortGroup: 1,
        sortTime: -parseTimestamp(pullRequest.updatedAt),
        rowKey,
        number: pullRequest.number,
        url: pullRequest.url,
        title: pullRequest.title,
        isDraft: pullRequest.isDraft,
        isCrossRepository: pullRequest.isCrossRepository,
        comparison,
        additions: pullRequest.additions,
        deletions: pullRequest.deletions,
        changedFiles: pullRequest.changedFiles,
        baseRefName: pullRequest.baseRefName,
        headRepository:
          pullRequest.headRepository === null
            ? { state: "unavailable" }
            : {
                state: "available",
                repositoryNodeId: pullRequest.headRepository.id,
                repositoryFullName: pullRequest.headRepository.nameWithOwner,
              },
        headRefName: pullRequest.headRefName,
        canOpenInSamebase,
        localHeadRefName: canOpenInSamebase ? pullRequest.headRefName : undefined,
        labelCount: pullRequestLabels.length,
        labels: pullRequestLabels.map((label) => ({
          name: label.name,
          color: optionalString(label.color),
        })),
        headCommit: collectedCommit.commit,
      });
      associations.push({
        rowKey,
        branchName: pullRequest.headRefName,
        refRepositoryNodeId: pullRequest.headRepository?.id ?? null,
        pullRequestUrl: pullRequest.url,
        commit: collectedCommit.identity,
        signature: collectedCommit.signature,
      });
    }

    const nextCursor = requireNextCursor(repository.pullRequests.pageInfo);
    if (nextCursor !== null) {
      assertNewCursor(seenCursors, nextCursor);
    }
    cursor = nextCursor;
    page += 1;
  } while (cursor !== null);

  if (expectedTotalCount !== items.length) {
    throw new GitHubGraphqlRequestError(
      "GitHub pull request pagination did not return every pull request.",
      true,
    );
  }
  return { items, associations, signatures };
}

function assertSameProviderSignatureMap<Signature extends object>(args: {
  collected: ReadonlyMap<string, Signature>;
  verified: ReadonlyMap<string, Signature>;
  expectedTotalCount: number | null;
  kind: "branch" | "pull request";
  same: (left: Signature, right: Signature) => boolean;
}): void {
  if (
    args.expectedTotalCount !== args.verified.size ||
    args.verified.size !== args.collected.size
  ) {
    throw new GitHubGraphqlRequestError(
      `GitHub ${args.kind} inventory changed while it was being collected.`,
      true,
    );
  }
  for (const [identity, collectedSignature] of args.collected) {
    const verifiedSignature = args.verified.get(identity);
    if (verifiedSignature === undefined || !args.same(collectedSignature, verifiedSignature)) {
      throw new GitHubGraphqlRequestError(
        `GitHub ${args.kind} inventory changed while it was being collected.`,
        true,
      );
    }
  }
}

async function verifyCollectedBranchSignatures(args: {
  requestGraphql: RepositoryInventoryGraphqlRequest;
  repositoryId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  defaultBranch: string | null;
  defaultBranchHeadSha: string | null;
  branchSignatures: ReadonlyMap<string, CommitMetadataSignature>;
}): Promise<void> {
  const seenCursors = new Set<string>();
  const verifiedBranchSignatures = new Map<string, CommitMetadataSignature>();
  let expectedTotalCount: number | null = null;
  let cursor: string | null = null;
  let page = 1;

  do {
    assertPageLimit(page);
    const response = branchSignaturePageSchema.parse(
      await args.requestGraphql(REPOSITORY_BRANCH_SIGNATURE_PAGE_QUERY, {
        repositoryId: args.repositoryId,
        after: cursor,
      }),
    );
    const repository = requireRepository(response.repository);
    assertRepositoryIdentity({
      expectedId: args.repositoryId,
      expectedFullName: args.repositoryFullName,
      actualId: repository.id,
      actualFullName: repository.nameWithOwner,
    });
    if (String(repository.databaseId) !== args.repositoryDatabaseId) {
      throw new GitHubGraphqlRequestError(
        "GitHub repository database identity changed during branch verification.",
        true,
      );
    }
    if (
      (repository.defaultBranchRef?.name ?? null) !== args.defaultBranch ||
      (repository.defaultBranchRef?.target.oid ?? null) !== args.defaultBranchHeadSha
    ) {
      throw new GitHubGraphqlRequestError(
        "GitHub default branch changed while the repository was being collected.",
        true,
      );
    }
    if (page === 1) {
      expectedTotalCount = repository.refs.totalCount;
    } else if (expectedTotalCount !== repository.refs.totalCount) {
      throw new GitHubGraphqlRequestError(
        "GitHub branch count changed during branch verification.",
        true,
      );
    }

    for (const ref of repository.refs.nodes) {
      if (verifiedBranchSignatures.has(ref.name)) {
        throw new GitHubGraphqlRequestError(
          "GitHub returned a duplicate branch during verification.",
          true,
        );
      }
      verifiedBranchSignatures.set(ref.name, commitMetadataSignature(ref.target));
    }

    const nextCursor = requireNextCursor(repository.refs.pageInfo);
    if (nextCursor !== null) {
      assertNewCursor(seenCursors, nextCursor);
    }
    cursor = nextCursor;
    page += 1;
  } while (cursor !== null);

  assertSameProviderSignatureMap({
    collected: args.branchSignatures,
    verified: verifiedBranchSignatures,
    expectedTotalCount,
    kind: "branch",
    same: sameCommitMetadataSignature,
  });
}

async function verifyCollectedPullRequestSignatures(args: {
  requestGraphql: RepositoryInventoryGraphqlRequest;
  repositoryId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  pullRequestSignatures: ReadonlyMap<string, PullRequestMetadataSignature>;
}): Promise<void> {
  const seenCursors = new Set<string>();
  const verifiedPullRequestSignatures = new Map<string, PullRequestMetadataSignature>();
  let expectedTotalCount: number | null = null;
  let cursor: string | null = null;
  let page = 1;

  do {
    assertPageLimit(page);
    const response = pullRequestSignaturePageSchema.parse(
      await args.requestGraphql(REPOSITORY_PULL_REQUEST_SIGNATURE_PAGE_QUERY, {
        repositoryId: args.repositoryId,
        after: cursor,
      }),
    );
    const repository = requireRepository(response.repository);
    assertRepositoryIdentity({
      expectedId: args.repositoryId,
      expectedFullName: args.repositoryFullName,
      actualId: repository.id,
      actualFullName: repository.nameWithOwner,
    });
    if (String(repository.databaseId) !== args.repositoryDatabaseId) {
      throw new GitHubGraphqlRequestError(
        "GitHub repository database identity changed during pull request verification.",
        true,
      );
    }
    if (page === 1) {
      expectedTotalCount = repository.pullRequests.totalCount;
    } else if (expectedTotalCount !== repository.pullRequests.totalCount) {
      throw new GitHubGraphqlRequestError(
        "GitHub pull request count changed during verification.",
        true,
      );
    }
    for (const pullRequest of repository.pullRequests.nodes) {
      const rowKey = repositoryInventoryPullRequestRowKey(pullRequest.id);
      if (verifiedPullRequestSignatures.has(rowKey)) {
        throw new GitHubGraphqlRequestError(
          "GitHub returned a duplicate pull request during verification.",
          true,
        );
      }
      if (pullRequest.commits.nodes.length !== 1) {
        throw new GitHubGraphqlRequestError(
          "GitHub pull request did not have one latest commit during verification.",
          true,
        );
      }
      const latestCommit = pullRequest.commits.nodes[0].commit;
      if (latestCommit.oid !== pullRequest.headRefOid) {
        throw new GitHubGraphqlRequestError(
          "GitHub pull request head changed during verification.",
          true,
        );
      }
      verifiedPullRequestSignatures.set(rowKey, {
        updatedAt: pullRequest.updatedAt,
        baseRefName: pullRequest.baseRefName,
        headRefName: pullRequest.headRefName,
        headRefOid: pullRequest.headRefOid,
        headRepository:
          pullRequest.headRepository === null
            ? null
            : {
                nodeId: pullRequest.headRepository.id,
                fullName: pullRequest.headRepository.nameWithOwner,
                owner: pullRequest.headRepository.owner.login,
              },
        latestCommit: commitMetadataSignature(latestCommit),
      });
    }
    const nextCursor = requireNextCursor(repository.pullRequests.pageInfo);
    if (nextCursor !== null) {
      assertNewCursor(seenCursors, nextCursor);
    }
    cursor = nextCursor;
    page += 1;
  } while (cursor !== null);

  assertSameProviderSignatureMap({
    collected: args.pullRequestSignatures,
    verified: verifiedPullRequestSignatures,
    expectedTotalCount,
    kind: "pull request",
    same: samePullRequestMetadataSignature,
  });
}

async function repositoryInventoryFingerprint(args: {
  repositoryId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  defaultBranch: string | null;
  items: readonly CollectedRepositoryInventoryItem[];
  unattributedCloudflareBuilds: readonly CollectedRepositoryInventoryUnattributedCloudflareBuild[];
}): Promise<string> {
  const providerItems = [...args.items].sort((left, right) =>
    left.rowKey.localeCompare(right.rowKey),
  );
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      repositoryId: args.repositoryId,
      repositoryDatabaseId: args.repositoryDatabaseId,
      repositoryFullName: args.repositoryFullName,
      defaultBranch: args.defaultBranch,
      items: providerItems,
      unattributedCloudflareBuilds: args.unattributedCloudflareBuilds,
    }),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function collectRepositoryInventory(args: {
  repositoryNodeId: string;
  expectedRepositoryDatabaseId: string;
  pageSize: number;
  requestGraphql: RepositoryInventoryGraphqlRequest;
  requestGraphqlPartial: RepositoryInventoryGraphqlPartialRequest;
  resolveCloudflareBuilds?: RepositoryInventoryCloudflareBuildResolver;
}): Promise<CollectedRepositoryInventory> {
  const branches = await collectBranches(args);
  const branchHeadShaByName = new Map(
    branches.items.map((item): [string, string] => [item.name, item.headCommit.sha]),
  );
  const pullRequests = await collectPullRequests({
    ...args,
    repositoryId: branches.repositoryId,
    repositoryDatabaseId: branches.repositoryDatabaseId,
    repositoryFullName: branches.repositoryFullName,
    branchHeadShaByName,
  });
  const associations = [...branches.associations, ...pullRequests.associations];
  const commits = uniqueRepositoryScopedCommits(associations);
  const collectedCloudflareObservations = await collectCloudflareCommitObservations({
    requestGraphql: args.requestGraphql,
    commits,
    batchSize: args.pageSize,
  });
  await verifyCollectedBranchSignatures({
    requestGraphql: args.requestGraphql,
    repositoryId: branches.repositoryId,
    repositoryDatabaseId: branches.repositoryDatabaseId,
    repositoryFullName: branches.repositoryFullName,
    defaultBranch: branches.defaultBranch,
    defaultBranchHeadSha: branches.defaultBranchHeadSha,
    branchSignatures: branches.signatures,
  });
  await verifyCollectedPullRequestSignatures({
    requestGraphql: args.requestGraphql,
    repositoryId: branches.repositoryId,
    repositoryDatabaseId: branches.repositoryDatabaseId,
    repositoryFullName: branches.repositoryFullName,
    pullRequestSignatures: pullRequests.signatures,
  });
  const verifiedCloudflareObservations = await collectCloudflareCommitObservations({
    requestGraphql: args.requestGraphql,
    commits,
    batchSize: args.pageSize,
  });
  assertSameCloudflareCommitObservations({
    collected: collectedCloudflareObservations,
    verified: verifiedCloudflareObservations,
  });

  const { items, unattributedCloudflareBuilds } = await attachCloudflareBuilds({
    items: [...branches.items, ...pullRequests.items],
    associations,
    commits,
    observations: collectedCloudflareObservations,
    resolveCloudflareBuilds: args.resolveCloudflareBuilds,
  });

  return {
    repositoryId: branches.repositoryId,
    repositoryDatabaseId: branches.repositoryDatabaseId,
    repositoryFullName: branches.repositoryFullName,
    defaultBranch: branches.defaultBranch,
    defaultBranchCheckState: branches.defaultBranchCheckState,
    items,
    unattributedCloudflareBuilds,
    fingerprint: await repositoryInventoryFingerprint({
      repositoryId: branches.repositoryId,
      repositoryDatabaseId: branches.repositoryDatabaseId,
      repositoryFullName: branches.repositoryFullName,
      defaultBranch: branches.defaultBranch,
      items,
      unattributedCloudflareBuilds,
    }),
    branchCount: branches.items.length,
    pullRequestCount: pullRequests.items.length,
  };
}

function headerInteger(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (value === null || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function retryAfterTimestamp(headers: Headers, now: number): number | undefined {
  const value = headers.get("retry-after");
  if (value === null) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return now + Math.ceil(seconds * 1_000);
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function responseRateUsage(args: {
  data: unknown;
  headerUsage: GitHubGraphqlRateUsage | undefined;
  accumulatedCost: number;
}): GitHubGraphqlRateUsage | undefined {
  const parsed = z.object({ rateLimit: graphqlRateLimitSchema }).safeParse(args.data);
  if (!parsed.success) {
    return undefined;
  }
  const resetAtFromGraphql = Date.parse(parsed.data.rateLimit.resetAt);
  const resetAt = args.headerUsage?.resetAt ?? resetAtFromGraphql;
  if (Number.isNaN(resetAt)) {
    return undefined;
  }
  return {
    cost: args.accumulatedCost + parsed.data.rateLimit.cost,
    limit: args.headerUsage?.limit ?? parsed.data.rateLimit.limit,
    remaining: args.headerUsage?.remaining ?? parsed.data.rateLimit.remaining,
    resetAt,
  };
}

function responseHeaderRateUsage(args: {
  headers: Headers;
  accumulatedCost: number;
}): GitHubGraphqlRateUsage | undefined {
  const limit = headerInteger(args.headers, "x-ratelimit-limit");
  const remaining = headerInteger(args.headers, "x-ratelimit-remaining");
  const resetAtSeconds = headerInteger(args.headers, "x-ratelimit-reset");
  const resetAt = resetAtSeconds === undefined ? undefined : resetAtSeconds * 1_000;
  if (
    limit === undefined ||
    limit === 0 ||
    remaining === undefined ||
    remaining > limit ||
    resetAtSeconds === 0 ||
    resetAt === undefined ||
    !Number.isSafeInteger(resetAt)
  ) {
    return undefined;
  }
  return {
    cost: args.accumulatedCost,
    limit,
    remaining,
    resetAt,
  };
}

function responseHeadersPermitRetry(usage: GitHubGraphqlRateUsage | undefined): boolean {
  return usage !== undefined && usage.remaining > githubGraphqlRateSafetyFloor(usage.limit);
}

function responseHeadersReachedSafetyFloor(usage: GitHubGraphqlRateUsage): boolean {
  return usage.remaining <= githubGraphqlRateSafetyFloor(usage.limit);
}

function rateSafetyFloorError(usage: GitHubGraphqlRateUsage): GitHubGraphqlRateLimitError {
  return new GitHubGraphqlRateLimitError(
    "GitHub GraphQL remaining points reached the safety floor.",
    "primary",
    Math.max(Date.now() + 60_000, usage.resetAt + 1_000),
    usage,
  );
}

function isRateLimitFailure(args: {
  response: Response;
  errors: readonly { message: string; type?: string }[];
  topLevelMessage?: string;
}): boolean {
  if (args.response.status === 429) {
    return true;
  }
  if (args.errors.some((error) => error.type?.toUpperCase() === "RATE_LIMITED")) {
    return true;
  }
  const messageSignalsRateLimit = args.errors.some((error) =>
    /rate limit|abuse detection|temporarily blocked/i.test(error.message),
  );
  if (
    messageSignalsRateLimit ||
    (args.topLevelMessage !== undefined &&
      /rate limit|abuse detection|temporarily blocked/i.test(args.topLevelMessage))
  ) {
    return true;
  }
  return (
    args.response.status === 403 &&
    (args.response.headers.has("retry-after") ||
      headerInteger(args.response.headers, "x-ratelimit-remaining") === 0)
  );
}

function isRetryableGraphqlError(error: { type?: string }): boolean {
  const type = error.type?.toUpperCase();
  return (
    type === "RESOURCE_LIMIT" ||
    type === "MAX_NODE_LIMIT_EXCEEDED" ||
    type === "TIMEOUT" ||
    type === "INTERNAL"
  );
}

function rateLimitRetryAt(args: {
  response: Response;
  usage: GitHubGraphqlRateUsage | undefined;
  now: number;
}): number {
  const remainingFromHeader = headerInteger(args.response.headers, "x-ratelimit-remaining");
  const resetFromHeader = headerInteger(args.response.headers, "x-ratelimit-reset");
  const candidates = [
    retryAfterTimestamp(args.response.headers, args.now),
    remainingFromHeader === 0 && resetFromHeader !== undefined
      ? resetFromHeader * 1_000 + 1_000
      : undefined,
    args.usage?.remaining === 0 ? args.usage.resetAt + 1_000 : undefined,
  ].filter((candidate) => candidate !== undefined);
  return Math.max(args.now + 60_000, ...candidates);
}

export function createGitHubGraphqlClient(args: {
  credential: string;
  fetchImpl?: typeof fetch;
  limits?: {
    deadlineAt: number;
    maximumCost: number;
    maximumRequestCount: number;
  };
}): GitHubGraphqlClient {
  const fetchImpl = args.fetchImpl ?? fetch;
  let usage: GitHubGraphqlRateUsage | undefined;
  let requestCount = 0;
  const requestPartial: RepositoryInventoryGraphqlPartialRequest = async (query, variables) => {
    if (args.limits !== undefined) {
      if (Date.now() >= args.limits.deadlineAt) {
        throw new GitHubGraphqlRequestError(
          "GitHub repository inventory exceeded its execution deadline.",
          false,
        );
      }
      if (requestCount >= args.limits.maximumRequestCount) {
        throw new GitHubGraphqlRequestError(
          "GitHub repository inventory exceeded its request limit.",
          false,
        );
      }
      if (usage !== undefined && usage.cost >= args.limits.maximumCost) {
        throw new GitHubGraphqlRequestError(
          "GitHub repository inventory reached its cost limit.",
          false,
        );
      }
    }
    if (usage !== undefined && usage.remaining <= githubGraphqlRateSafetyFloor(usage.limit)) {
      throw rateSafetyFloorError(usage);
    }

    const accumulatedCost = usage?.cost ?? 0;
    let response: Response;
    let rawPayload: unknown;
    requestCount += 1;
    try {
      ({ response, rawPayload } = await fetchGitHubJson(fetchImpl, GITHUB_GRAPHQL_URL, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${args.credential}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ query, variables }),
      }));
    } catch (error) {
      usage = undefined;
      throw new GitHubGraphqlRequestError(
        `GitHub GraphQL request failed: ${toErrorMessage(error)}`,
        false,
      );
    }

    const headerUsage = responseHeaderRateUsage({
      headers: response.headers,
      accumulatedCost,
    });
    if (headerUsage !== undefined) {
      usage = headerUsage;
    }

    if (isRateLimitFailure({ response, errors: [] })) {
      if (headerUsage === undefined) {
        usage = undefined;
      }
      const remaining =
        headerInteger(response.headers, "x-ratelimit-remaining") ?? usage?.remaining;
      throw new GitHubGraphqlRateLimitError(
        `GitHub paused GraphQL requests (${response.status}).`,
        remaining === 0 ? "primary" : "secondary",
        rateLimitRetryAt({ response, usage, now: Date.now() }),
        usage,
      );
    }

    if (rawPayload === undefined) {
      if (headerUsage === undefined) {
        usage = undefined;
      }
      if (
        response.status >= 500 &&
        headerUsage !== undefined &&
        responseHeadersReachedSafetyFloor(headerUsage)
      ) {
        throw rateSafetyFloorError(headerUsage);
      }
      throw new GitHubGraphqlRequestError(
        `GitHub GraphQL returned an unreadable response (${response.status}).`,
        response.status >= 500 && responseHeadersPermitRetry(headerUsage),
      );
    }
    const envelope = graphqlEnvelopeSchema.safeParse(rawPayload);
    if (!envelope.success) {
      if (headerUsage === undefined) {
        usage = undefined;
      }
      if (
        response.status >= 500 &&
        headerUsage !== undefined &&
        responseHeadersReachedSafetyFloor(headerUsage)
      ) {
        throw rateSafetyFloorError(headerUsage);
      }
      throw new GitHubGraphqlRequestError(
        `GitHub GraphQL returned an invalid response (${response.status}).`,
        response.status >= 500 && responseHeadersPermitRetry(headerUsage),
      );
    }
    const observedUsage = responseRateUsage({
      data: envelope.data.data,
      headerUsage,
      accumulatedCost,
    });
    const currentRequestUsage = observedUsage ?? headerUsage;
    usage = currentRequestUsage;
    if (args.limits !== undefined) {
      if (Date.now() >= args.limits.deadlineAt) {
        throw new GitHubGraphqlRequestError(
          "GitHub repository inventory exceeded its execution deadline.",
          false,
        );
      }
      if (currentRequestUsage !== undefined && currentRequestUsage.cost > args.limits.maximumCost) {
        throw new GitHubGraphqlRequestError(
          "GitHub repository inventory exceeded its cost limit.",
          false,
        );
      }
    }
    const errors = envelope.data.errors ?? [];
    if (
      isRateLimitFailure({
        response,
        errors,
        topLevelMessage: envelope.data.message,
      })
    ) {
      const remaining =
        headerInteger(response.headers, "x-ratelimit-remaining") ?? usage?.remaining;
      const limitKind = remaining === 0 ? "primary" : "secondary";
      throw new GitHubGraphqlRateLimitError(
        `GitHub paused GraphQL requests (${response.status}).`,
        limitKind,
        rateLimitRetryAt({ response, usage, now: Date.now() }),
        usage,
      );
    }
    const retryableGraphqlFailure = errors.some(isRetryableGraphqlError);
    const retryableFailure = response.status >= 500 || retryableGraphqlFailure;
    if (
      retryableFailure &&
      headerUsage !== undefined &&
      responseHeadersReachedSafetyFloor(headerUsage)
    ) {
      throw rateSafetyFloorError(headerUsage);
    }
    if (
      !response.ok ||
      envelope.data.message !== undefined ||
      envelope.data.data === undefined ||
      retryableGraphqlFailure
    ) {
      const details = [
        ...errors.map((error) => error.message),
        ...(envelope.data.message ? [envelope.data.message] : []),
      ];
      const detail = details.length > 0 ? `: ${details.join("; ")}` : "";
      throw new GitHubGraphqlRequestError(
        `GitHub GraphQL request failed (${response.status})${detail}`,
        retryableFailure && responseHeadersPermitRetry(headerUsage),
      );
    }
    if (observedUsage === undefined) {
      throw new GitHubGraphqlRequestError(
        "GitHub GraphQL did not return rate-limit accounting.",
        false,
      );
    }
    return { data: envelope.data.data, errors };
  };
  const request: RepositoryInventoryGraphqlRequest = async (query, variables) => {
    const response = await requestPartial(query, variables);
    if (response.errors.length > 0) {
      throw new GitHubGraphqlRequestError(
        `GitHub GraphQL request failed (200): ${response.errors
          .map((error) => error.message)
          .join("; ")}`,
        false,
      );
    }
    return response.data;
  };
  return {
    request,
    requestPartial,
    getUsage: () => usage,
    getRequestCount: () => requestCount,
  };
}

export async function collectRepositoryInventoryWithRetry(args: {
  repositoryNodeId: string;
  expectedRepositoryDatabaseId: string;
  requestGraphql: RepositoryInventoryGraphqlRequest;
  requestGraphqlPartial: RepositoryInventoryGraphqlPartialRequest;
  resolveCloudflareBuilds?: RepositoryInventoryCloudflareBuildResolver;
}): Promise<CollectedRepositoryInventory> {
  try {
    return await collectRepositoryInventory({
      ...args,
      pageSize: GITHUB_GRAPHQL_PAGE_SIZE,
    });
  } catch (error) {
    if (!(error instanceof GitHubGraphqlRequestError) || !error.retryable) {
      throw error;
    }
    return await collectRepositoryInventory({
      ...args,
      pageSize: GITHUB_GRAPHQL_RETRY_PAGE_SIZE,
    });
  }
}
