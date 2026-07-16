import { z } from "zod";

import {
  GITHUB_STATUS_CHECK_ROLLUP_STATES,
  repositorySummaryCheckStateFromGitHubRollup,
} from "./githubRepositoryCheckState";
import type { RepositorySummaryCheckState } from "./repositorySummaryModel";

import {
  buildRepositoryInventoryCheckSummary,
  normalizeCommitCheckSnapshot,
  selectBranchPreviewAliasUrlFromCommitCheckItems,
  type CommitCheckItemInput,
  type GitHubCheckRunSnapshotInput,
  type GitHubCommitStatusSnapshotInput,
} from "./commitChecks";
import {
  repositoryInventoryBranchRowKey,
  repositoryInventoryPullRequestRowKey,
  type CollectedRepositoryInventoryItem,
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

const pageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});

const checkRunSchema = z.object({
  __typename: z.literal("CheckRun"),
  id: z.string(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  detailsUrl: z.string().nullable(),
  url: z.string().nullable(),
  summary: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  checkSuite: z
    .object({
      app: z
        .object({
          name: z.string(),
          slug: z.string(),
        })
        .nullable(),
    })
    .nullable(),
});

const statusContextSchema = z.object({
  __typename: z.literal("StatusContext"),
  id: z.string(),
  context: z.string(),
  state: z.string(),
  description: z.string().nullable(),
  targetUrl: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

const checkContextSchema = z.discriminatedUnion("__typename", [
  checkRunSchema,
  statusContextSchema,
]);

const checkCountsSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  checkRunCount: z.number().int().nonnegative(),
  statusContextCount: z.number().int().nonnegative(),
});

const checkContextsSchema = checkCountsSchema.extend({
  pageInfo: pageInfoSchema,
  nodes: z.array(checkContextSchema),
});

const statusCheckRollupSchema = z
  .object({
    state: z.enum(GITHUB_STATUS_CHECK_ROLLUP_STATES),
    contexts: checkContextsSchema,
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
  headRepository: z
    .object({
      id: z.string(),
      nameWithOwner: z.string(),
      owner: z.object({ login: z.string() }),
    })
    .nullable(),
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
  headRepository: z
    .object({
      id: z.string(),
      nameWithOwner: z.string(),
      owner: z.object({ login: z.string() }),
    })
    .nullable(),
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

const providerCommitSignatureSchema = z.object({
  oid: z.string(),
  statusCheckRollup: z
    .object({
      state: z.enum(GITHUB_STATUS_CHECK_ROLLUP_STATES),
      contexts: checkCountsSchema,
    })
    .nullable(),
});
type ProviderCommitSignature = z.infer<typeof providerCommitSignatureSchema>;

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
            target: providerCommitSignatureSchema,
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
            headRefOid: z.string(),
            commits: z.object({
              nodes: z.array(
                z.object({
                  commit: providerCommitSignatureSchema,
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

const checkContinuationSchema = z.object({
  node: z
    .object({
      __typename: z.literal("Commit"),
      oid: z.string(),
      statusCheckRollup: statusCheckRollupSchema,
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
                  contexts(first: 100) {
                    totalCount
                    checkRunCount
                    statusContextCount
                    pageInfo { hasNextPage endCursor }
                    nodes {
                      __typename
                      ... on CheckRun {
                        id
                        name
                        status
                        conclusion
                        detailsUrl
                        url
                        summary
                        startedAt
                        completedAt
                        checkSuite { app { name slug } }
                      }
                      ... on StatusContext {
                        id
                        context
                        state
                        description
                        targetUrl
                        updatedAt
                      }
                    }
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
                    contexts(first: 100) {
                      totalCount
                      checkRunCount
                      statusContextCount
                      pageInfo { hasNextPage endCursor }
                      nodes {
                        __typename
                        ... on CheckRun {
                          id
                          name
                          status
                          conclusion
                          detailsUrl
                          url
                          summary
                          startedAt
                          completedAt
                          checkSuite { app { name slug } }
                        }
                        ... on StatusContext {
                          id
                          context
                          state
                          description
                          targetUrl
                          updatedAt
                        }
                      }
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
                oid
                statusCheckRollup {
                  state
                  contexts(first: 1) {
                    totalCount
                    checkRunCount
                    statusContextCount
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
            headRefOid
            commits(last: 1) {
              nodes {
                commit {
                  oid
                  statusCheckRollup {
                    state
                    contexts(first: 1) {
                      totalCount
                      checkRunCount
                      statusContextCount
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

const REPOSITORY_CHECK_CONTINUATION_QUERY = `
  query RepositoryInventoryCheckContinuation($nodeId: ID!, $after: String!) {
    node(id: $nodeId) {
      __typename
      ... on Commit {
        oid
        statusCheckRollup {
          state
          contexts(first: 100, after: $after) {
            totalCount
            checkRunCount
            statusContextCount
            pageInfo { hasNextPage endCursor }
            nodes {
              __typename
              ... on CheckRun {
                id
                name
                status
                conclusion
                detailsUrl
                url
                summary
                startedAt
                completedAt
                checkSuite { app { name slug } }
              }
              ... on StatusContext {
                id
                context
                state
                description
                targetUrl
                updatedAt
              }
            }
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

export type CollectedRepositoryInventory = {
  repositoryId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  defaultBranch: string | null;
  defaultBranchCheckState: RepositorySummaryCheckState | null;
  items: CollectedRepositoryInventoryItem[];
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

type CollectedCommit = {
  commit: CollectedRepositoryInventoryItem["headCommit"];
  checkItems: CommitCheckItemInput[];
  summaryCheckState: RepositorySummaryCheckState;
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

function normalizeCheckContexts(
  contexts: readonly z.infer<typeof checkContextSchema>[],
): CommitCheckItemInput[] {
  const checkRuns: GitHubCheckRunSnapshotInput[] = [];
  const statuses: GitHubCommitStatusSnapshotInput[] = [];
  for (const context of contexts) {
    switch (context.__typename) {
      case "CheckRun":
        checkRuns.push({
          id: context.id,
          name: context.name,
          status: context.status.toLowerCase(),
          conclusion: context.conclusion?.toLowerCase(),
          detailsUrl: optionalString(context.detailsUrl),
          htmlUrl: optionalString(context.url),
          appName: context.checkSuite?.app?.name,
          appSlug: context.checkSuite?.app?.slug,
          outputSummary: optionalString(context.summary),
          startedAt: optionalString(context.startedAt),
          completedAt: optionalString(context.completedAt),
        });
        break;
      case "StatusContext":
        statuses.push({
          id: context.id,
          state: context.state.toLowerCase(),
          context: context.context,
          description: context.description,
          targetUrl: context.targetUrl,
          updatedAt: optionalString(context.updatedAt),
        });
        break;
      default: {
        context satisfies never;
      }
    }
  }
  return normalizeCommitCheckSnapshot({ checkRuns, statuses });
}

function toCheckSummary(args: {
  checkItems: CommitCheckItemInput[];
}): RepositoryInventoryCheckSummary {
  return buildRepositoryInventoryCheckSummary({ items: args.checkItems });
}

async function readCompleteCheckContexts(args: {
  requestGraphql: RepositoryInventoryGraphqlRequest;
  commitNodeId: string;
  commitSha: string;
  initial: z.infer<typeof checkContextsSchema> | null;
}): Promise<z.infer<typeof checkContextSchema>[]> {
  if (args.initial === null) {
    return [];
  }

  const expectedTotalCount = args.initial.totalCount;
  const expectedCheckRunCount = args.initial.checkRunCount;
  const expectedStatusContextCount = args.initial.statusContextCount;
  if (expectedCheckRunCount + expectedStatusContextCount !== expectedTotalCount) {
    throw new GitHubGraphqlRequestError("GitHub returned inconsistent check counts.", true);
  }
  const contexts = [...args.initial.nodes];
  const seenKeys = new Set<string>();
  for (const context of contexts) {
    const key = `${context.__typename}:${context.id}`;
    if (seenKeys.has(key)) {
      throw new GitHubGraphqlRequestError("GitHub returned a duplicate check context.", true);
    }
    seenKeys.add(key);
  }

  const seenCursors = new Set<string>();
  let cursor = requireNextCursor(args.initial.pageInfo);
  let page = 2;
  while (cursor !== null) {
    assertPageLimit(page);
    assertNewCursor(seenCursors, cursor);
    const response = checkContinuationSchema.parse(
      await args.requestGraphql(REPOSITORY_CHECK_CONTINUATION_QUERY, {
        nodeId: args.commitNodeId,
        after: cursor,
      }),
    );
    const node = response.node;
    if (node === null || node.oid !== args.commitSha || node.statusCheckRollup === null) {
      throw new GitHubGraphqlRequestError(
        "GitHub check pagination changed while it was being collected.",
        true,
      );
    }
    const nextPage = node.statusCheckRollup.contexts;
    if (
      nextPage.totalCount !== expectedTotalCount ||
      nextPage.checkRunCount !== expectedCheckRunCount ||
      nextPage.statusContextCount !== expectedStatusContextCount
    ) {
      throw new GitHubGraphqlRequestError(
        "GitHub check count changed while it was being collected.",
        true,
      );
    }
    for (const context of nextPage.nodes) {
      const key = `${context.__typename}:${context.id}`;
      if (seenKeys.has(key)) {
        throw new GitHubGraphqlRequestError("GitHub returned a duplicate check context.", true);
      }
      seenKeys.add(key);
      contexts.push(context);
    }
    cursor = requireNextCursor(nextPage.pageInfo);
    page += 1;
  }

  const checkRunCount = contexts.filter((context) => context.__typename === "CheckRun").length;
  const statusContextCount = contexts.length - checkRunCount;
  if (
    contexts.length !== expectedTotalCount ||
    checkRunCount !== expectedCheckRunCount ||
    statusContextCount !== expectedStatusContextCount
  ) {
    throw new GitHubGraphqlRequestError(
      "GitHub check pagination did not return every context.",
      true,
    );
  }
  return contexts;
}

async function collectCommit(args: {
  requestGraphql: RepositoryInventoryGraphqlRequest;
  value: z.infer<typeof commitSchema>;
}): Promise<CollectedCommit> {
  const contexts = await readCompleteCheckContexts({
    requestGraphql: args.requestGraphql,
    commitNodeId: args.value.id,
    commitSha: args.value.oid,
    initial: args.value.statusCheckRollup?.contexts ?? null,
  });
  const checkItems = normalizeCheckContexts(contexts);
  return {
    checkItems,
    summaryCheckState: repositorySummaryCheckStateFromGitHubRollup(
      args.value.statusCheckRollup?.state ?? null,
    ),
    commit: {
      sha: args.value.oid,
      title: optionalString(args.value.messageHeadline),
      authoredAt: parseTimestamp(args.value.authoredDate),
      checks: toCheckSummary({
        checkItems,
      }),
    },
  };
}

function providerCommitSignature(value: ProviderCommitSignature): ProviderCommitSignature {
  const rollup = value.statusCheckRollup;
  if (rollup === null) {
    return { oid: value.oid, statusCheckRollup: null };
  }
  if (
    rollup.contexts.totalCount !==
    rollup.contexts.checkRunCount + rollup.contexts.statusContextCount
  ) {
    throw new GitHubGraphqlRequestError(
      "GitHub returned inconsistent aggregate check counts.",
      true,
    );
  }
  return {
    oid: value.oid,
    statusCheckRollup: {
      state: rollup.state,
      contexts: {
        totalCount: rollup.contexts.totalCount,
        checkRunCount: rollup.contexts.checkRunCount,
        statusContextCount: rollup.contexts.statusContextCount,
      },
    },
  };
}

function sameProviderCommitSignature(
  left: ProviderCommitSignature,
  right: ProviderCommitSignature,
): boolean {
  if (left.oid !== right.oid) {
    return false;
  }
  const leftRollup = left.statusCheckRollup;
  const rightRollup = right.statusCheckRollup;
  if (leftRollup === null || rightRollup === null) {
    return leftRollup === rightRollup;
  }
  return (
    leftRollup.state === rightRollup.state &&
    leftRollup.contexts.totalCount === rightRollup.contexts.totalCount &&
    leftRollup.contexts.checkRunCount === rightRollup.contexts.checkRunCount &&
    leftRollup.contexts.statusContextCount === rightRollup.contexts.statusContextCount
  );
}

type PullRequestProviderSignature = {
  updatedAt: string;
  headRefOid: string;
  latestCommit: ProviderCommitSignature;
};

function samePullRequestProviderSignature(
  left: PullRequestProviderSignature,
  right: PullRequestProviderSignature,
): boolean {
  return (
    left.updatedAt === right.updatedAt &&
    left.headRefOid === right.headRefOid &&
    sameProviderCommitSignature(left.latestCommit, right.latestCommit)
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
  providerSignatures: ReadonlyMap<string, ProviderCommitSignature>;
  items: CollectedRepositoryInventoryItem[];
}> {
  const seenCursors = new Set<string>();
  const seenBranchNames = new Set<string>();
  const providerSignatures = new Map<string, ProviderCommitSignature>();
  const items: CollectedRepositoryInventoryItem[] = [];
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
      providerSignatures.set(branchKey, providerCommitSignature(ref.target));
      const rowKey = repositoryInventoryBranchRowKey(ref.name);
      const collectedCommit = await collectCommit({
        requestGraphql: args.requestGraphql,
        value: ref.target,
      });
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
        previewUrl: selectBranchPreviewAliasUrlFromCommitCheckItems(collectedCommit.checkItems),
        headCommit: collectedCommit.commit,
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
  if (defaultBranch !== null && providerSignatures.get(defaultBranch)?.oid !== defaultBranchSha) {
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
    providerSignatures,
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
  items: CollectedRepositoryInventoryItem[];
  providerSignatures: ReadonlyMap<string, PullRequestProviderSignature>;
}> {
  const seenCursors = new Set<string>();
  const seenPullRequestIds = new Set<string>();
  const providerSignatures = new Map<string, PullRequestProviderSignature>();
  const items: CollectedRepositoryInventoryItem[] = [];
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
      const collectedCommit = await collectCommit({
        requestGraphql: args.requestGraphql,
        value: latestCommit,
      });
      const rowKey = repositoryInventoryPullRequestRowKey(pullRequest.id);
      providerSignatures.set(rowKey, {
        updatedAt: pullRequest.updatedAt,
        headRefOid: pullRequest.headRefOid,
        latestCommit: providerCommitSignature(latestCommit),
      });
      const pullRequestLabels = await readCompleteLabels({
        requestGraphql: args.requestGraphql,
        pullRequestNodeId: pullRequest.id,
        initial: pullRequest.labels,
      });
      const headRepositoryFullName = pullRequest.headRepository?.nameWithOwner;
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
        headRepositoryFullName,
        headRefName: pullRequest.headRefName,
        canOpenInSamebase,
        localHeadRefName: canOpenInSamebase ? pullRequest.headRefName : undefined,
        labelCount: pullRequestLabels.length,
        labels: pullRequestLabels.map((label) => ({
          name: label.name,
          color: optionalString(label.color),
        })),
        previewUrl: selectBranchPreviewAliasUrlFromCommitCheckItems(collectedCommit.checkItems),
        headCommit: collectedCommit.commit,
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
  return { items, providerSignatures };
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
  branchSignatures: ReadonlyMap<string, ProviderCommitSignature>;
}): Promise<void> {
  const seenCursors = new Set<string>();
  const verifiedBranchSignatures = new Map<string, ProviderCommitSignature>();
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
      verifiedBranchSignatures.set(ref.name, providerCommitSignature(ref.target));
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
    same: sameProviderCommitSignature,
  });
}

async function verifyCollectedPullRequestSignatures(args: {
  requestGraphql: RepositoryInventoryGraphqlRequest;
  repositoryId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  pullRequestSignatures: ReadonlyMap<string, PullRequestProviderSignature>;
}): Promise<void> {
  const seenCursors = new Set<string>();
  const verifiedPullRequestSignatures = new Map<string, PullRequestProviderSignature>();
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
        headRefOid: pullRequest.headRefOid,
        latestCommit: providerCommitSignature(latestCommit),
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
    same: samePullRequestProviderSignature,
  });
}

async function repositoryInventoryFingerprint(args: {
  repositoryId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  defaultBranch: string | null;
  items: readonly CollectedRepositoryInventoryItem[];
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
}): Promise<CollectedRepositoryInventory> {
  const branches = await collectBranches(args);
  const branchHeadShaByName = new Map(
    branches.items.map((item): [string, string] => {
      if (item.kind !== "branch") {
        throw new Error("Branch collection returned another item kind.");
      }
      return [item.name, item.headCommit.sha];
    }),
  );
  const pullRequests = await collectPullRequests({
    ...args,
    repositoryId: branches.repositoryId,
    repositoryDatabaseId: branches.repositoryDatabaseId,
    repositoryFullName: branches.repositoryFullName,
    branchHeadShaByName,
  });
  await verifyCollectedBranchSignatures({
    requestGraphql: args.requestGraphql,
    repositoryId: branches.repositoryId,
    repositoryDatabaseId: branches.repositoryDatabaseId,
    repositoryFullName: branches.repositoryFullName,
    defaultBranch: branches.defaultBranch,
    defaultBranchHeadSha: branches.defaultBranchHeadSha,
    branchSignatures: branches.providerSignatures,
  });
  await verifyCollectedPullRequestSignatures({
    requestGraphql: args.requestGraphql,
    repositoryId: branches.repositoryId,
    repositoryDatabaseId: branches.repositoryDatabaseId,
    repositoryFullName: branches.repositoryFullName,
    pullRequestSignatures: pullRequests.providerSignatures,
  });

  const items = [...branches.items, ...pullRequests.items];

  return {
    repositoryId: branches.repositoryId,
    repositoryDatabaseId: branches.repositoryDatabaseId,
    repositoryFullName: branches.repositoryFullName,
    defaultBranch: branches.defaultBranch,
    defaultBranchCheckState: branches.defaultBranchCheckState,
    items,
    fingerprint: await repositoryInventoryFingerprint({
      repositoryId: branches.repositoryId,
      repositoryDatabaseId: branches.repositoryDatabaseId,
      repositoryFullName: branches.repositoryFullName,
      defaultBranch: branches.defaultBranch,
      items,
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
