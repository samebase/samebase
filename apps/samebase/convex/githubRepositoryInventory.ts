import { z } from "zod";

import type { Id } from "./_generated/dataModel";
import {
  buildGitHubCommitCheckSnapshot,
  normalizeCommitCheckSnapshot,
  selectBranchPreviewAliasUrlFromCommitCheckItems,
  type CommitCheckItemInput,
  type GitHubCheckRunSnapshotInput,
  type GitHubCommitStatusSnapshotInput,
} from "./commitChecks";
import {
  REPOSITORY_INVENTORY_MAX_LABELS_PER_PULL_REQUEST,
  repositoryInventoryBranchRowKey,
  repositoryInventoryPullRequestRowKey,
  type RepositoryInventoryCheckSummary,
  type RepositoryInventoryItem,
} from "./repositoryInventoryModel";
import { toErrorMessage } from "./jsonUtils";
import type { GitHubGraphqlRateUsage } from "./githubGraphqlRateBudget";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const GITHUB_REPOSITORY_BY_DATABASE_ID_URL = "https://api.github.com/repositories";
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

const checkContextsSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  checkRunCount: z.number().int().nonnegative(),
  statusContextCount: z.number().int().nonnegative(),
  pageInfo: pageInfoSchema,
  nodes: z.array(checkContextSchema),
});

const statusCheckRollupSchema = z
  .object({
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

const branchRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  target: z.object({
    __typename: z.literal("Commit"),
    ...commitSchema.shape,
  }),
});

const branchPageSchema = z.object({
  repository: z
    .object({
      id: z.string(),
      databaseId: z.number().int().positive(),
      nameWithOwner: z.string(),
      defaultBranchRef: z.object({ name: z.string() }).nullable(),
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
  createdAt: z.string(),
  updatedAt: z.string(),
  baseRefName: z.string(),
  headRefName: z.string(),
  headRefOid: z.string(),
  headRepository: z
    .object({
      id: z.string(),
      nameWithOwner: z.string(),
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

const branchSignaturePageSchema = z.object({
  repository: z
    .object({
      id: z.string(),
      databaseId: z.number().int().positive(),
      nameWithOwner: z.string(),
      defaultBranchRef: z.object({ name: z.string() }).nullable(),
      refs: z.object({
        totalCount: z.number().int().nonnegative(),
        pageInfo: pageInfoSchema,
        nodes: z.array(
          z.object({
            name: z.string(),
            target: z.object({
              __typename: z.literal("Commit"),
              oid: z.string(),
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

const graphqlEnvelopeSchema = z.object({
  data: z.unknown().optional(),
  message: z.string().optional(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        type: z.string().optional(),
      }),
    )
    .optional(),
});

const graphqlRateLimitSchema = z.object({
  cost: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
  resetAt: z.string(),
});

const repositoryIdentitySchema = z.object({
  id: z.number().int().nonnegative(),
  node_id: z.string(),
  full_name: z.string(),
});

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
        defaultBranchRef { name }
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
            createdAt
            updatedAt
            baseRefName
            headRefName
            headRefOid
            headRepository { id nameWithOwner }
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

const REPOSITORY_BRANCH_SIGNATURE_PAGE_QUERY = `
  query RepositoryInventoryBranchSignaturePage($repositoryId: ID!, $after: String) {
    repository: node(id: $repositoryId) {
      ... on Repository {
        id
        databaseId
        nameWithOwner
        defaultBranchRef { name }
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
              __typename
              ... on Commit { oid }
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

type GraphqlVariables = Record<string, string | number | null>;
export type RepositoryInventoryGraphqlRequest = (
  query: string,
  variables: GraphqlVariables,
) => Promise<unknown>;

export type GitHubGraphqlClient = {
  request: RepositoryInventoryGraphqlRequest;
  getUsage: () => GitHubGraphqlRateUsage | undefined;
};

export type CollectedRepositoryInventory = {
  repositoryId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  defaultBranch: string | null;
  items: RepositoryInventoryItem[];
  fingerprint: string;
  branchCount: number;
  pullRequestCount: number;
};

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

export type RepositoryInventoryCollectionContext = {
  userId: Id<"users">;
  vaultId: Id<"vaults">;
  generation: number;
  syncedAt: number;
};

type CollectedCommit = {
  commit: RepositoryInventoryItem["headCommit"];
  checkItems: CommitCheckItemInput[];
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

export async function resolveGitHubRepositoryNodeId(args: {
  credential: string;
  repositoryDatabaseId: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = args.fetchImpl ?? fetch;
  let response: Response;
  let rawPayload: unknown;
  try {
    ({ response, rawPayload } = await fetchGitHubJson(
      fetchImpl,
      `${GITHUB_REPOSITORY_BY_DATABASE_ID_URL}/${encodeURIComponent(args.repositoryDatabaseId)}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${args.credential}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    ));
  } catch (error) {
    throw new GitHubGraphqlRequestError(
      `GitHub repository identity request failed: ${toErrorMessage(error)}`,
      true,
    );
  }

  const topLevelMessage = z.object({ message: z.string() }).safeParse(rawPayload);
  if (
    isRateLimitFailure({
      response,
      errors: [],
      topLevelMessage: topLevelMessage.success ? topLevelMessage.data.message : undefined,
    })
  ) {
    const remaining = headerInteger(response.headers, "x-ratelimit-remaining");
    throw new GitHubGraphqlRateLimitError(
      `GitHub paused repository identity requests (${response.status}).`,
      remaining === 0 ? "primary" : "secondary",
      rateLimitRetryAt({ response, usage: undefined, now: Date.now() }),
      undefined,
    );
  }
  const identity = repositoryIdentitySchema.safeParse(rawPayload);
  if (!response.ok || !identity.success) {
    throw new GitHubGraphqlRequestError(
      `GitHub repository identity request failed (${response.status}).`,
      response.status >= 500,
    );
  }
  if (String(identity.data.id) !== args.repositoryDatabaseId) {
    throw new GitHubGraphqlRequestError("GitHub returned another repository.", false);
  }
  return identity.data.node_id;
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
  if (pageInfo.endCursor === null) {
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
  repositoryId: string;
  commitSha: string;
  checkItems: CommitCheckItemInput[];
  syncedAt: number;
}): RepositoryInventoryCheckSummary {
  const {
    githubRepositoryId: _repositoryId,
    commitSha: _commitSha,
    ...summary
  } = buildGitHubCommitCheckSnapshot({
    githubRepositoryId: args.repositoryId,
    commitSha: args.commitSha,
    items: args.checkItems,
    syncedAt: args.syncedAt,
  });
  return summary;
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
  let page = 1;
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
  syncedAt: number;
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
    commit: {
      sha: args.value.oid,
      title: optionalString(args.value.messageHeadline),
      authoredAt: parseTimestamp(args.value.authoredDate),
      committedAt: parseTimestamp(args.value.committedDate),
      checks: toCheckSummary({
        repositoryId: args.value.repository.id,
        commitSha: args.value.oid,
        checkItems,
        syncedAt: args.syncedAt,
      }),
    },
  };
}

async function readCompleteLabels(args: {
  requestGraphql: RepositoryInventoryGraphqlRequest;
  pullRequestNodeId: string;
  initial: z.infer<typeof labelsSchema>;
}): Promise<z.infer<typeof labelSchema>[]> {
  const expectedTotalCount = args.initial.totalCount;
  if (expectedTotalCount > REPOSITORY_INVENTORY_MAX_LABELS_PER_PULL_REQUEST) {
    throw new GitHubGraphqlRequestError(
      `A pull request has more than ${REPOSITORY_INVENTORY_MAX_LABELS_PER_PULL_REQUEST} labels, which cannot be published without truncation.`,
      false,
    );
  }
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
  let page = 1;
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
  context: RepositoryInventoryCollectionContext;
  repositoryNodeId: string;
  expectedRepositoryDatabaseId: string;
  pageSize: number;
  requestGraphql: RepositoryInventoryGraphqlRequest;
}): Promise<{
  repositoryId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  defaultBranch: string | null;
  items: RepositoryInventoryItem[];
}> {
  const seenCursors = new Set<string>();
  const seenBranchNames = new Set<string>();
  const items: RepositoryInventoryItem[] = [];
  let repositoryId: string | null = args.repositoryNodeId;
  let repositoryDatabaseId: string | null = null;
  let repositoryFullName: string | null = null;
  let defaultBranch: string | null = null;
  let expectedTotalCount: number | null = null;
  let cursor: string | null = null;
  let page = 1;

  do {
    assertPageLimit(page);
    const response = branchPageSchema.parse(
      await args.requestGraphql(REPOSITORY_BRANCH_PAGE_QUERY, {
        repositoryId: args.repositoryNodeId,
        pageSize: args.pageSize,
        after: cursor,
      }),
    );
    const repository = requireRepository(response.repository);
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
    if (page === 1) {
      defaultBranch = pageDefaultBranch;
      expectedTotalCount = repository.refs.totalCount;
    } else if (
      defaultBranch !== pageDefaultBranch ||
      expectedTotalCount !== repository.refs.totalCount
    ) {
      throw new GitHubGraphqlRequestError(
        "GitHub branch inventory changed during pagination.",
        true,
      );
    }

    for (const ref of repository.refs.nodes) {
      const branchKey = ref.name;
      if (seenBranchNames.has(branchKey)) {
        throw new GitHubGraphqlRequestError("GitHub returned a duplicate branch.", true);
      }
      seenBranchNames.add(branchKey);
      const rowKey = repositoryInventoryBranchRowKey(ref.name);
      const collectedCommit = await collectCommit({
        requestGraphql: args.requestGraphql,
        value: ref.target,
        syncedAt: args.context.syncedAt,
      });
      const isDefault = ref.name === defaultBranch;
      const lastCommitAt = collectedCommit.commit.committedAt;
      items.push({
        kind: "branch",
        userId: args.context.userId,
        vaultId: args.context.vaultId,
        generation: args.context.generation,
        kindRank: isDefault ? 0 : 2,
        timeRank: isDefault ? 0 : -(lastCommitAt ?? 0),
        tie: `${ref.name.toLowerCase()}\n${ref.name}`,
        rowKey,
        lastSyncedAt: args.context.syncedAt,
        name: ref.name,
        repositoryFullName,
        headCommitSha: ref.target.oid,
        lastCommitAt,
        isDefault,
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

  return {
    repositoryId,
    repositoryDatabaseId,
    repositoryFullName,
    defaultBranch,
    items,
  };
}

async function collectPullRequests(args: {
  context: RepositoryInventoryCollectionContext;
  pageSize: number;
  requestGraphql: RepositoryInventoryGraphqlRequest;
  repositoryId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  branchHeadShaByName: ReadonlyMap<string, string>;
}): Promise<RepositoryInventoryItem[]> {
  const seenCursors = new Set<string>();
  const seenPullRequestIds = new Set<string>();
  const items: RepositoryInventoryItem[] = [];
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
        syncedAt: args.context.syncedAt,
      });
      const rowKey = repositoryInventoryPullRequestRowKey(pullRequest.id);
      const pullRequestLabels = await readCompleteLabels({
        requestGraphql: args.requestGraphql,
        pullRequestNodeId: pullRequest.id,
        initial: pullRequest.labels,
      });
      const headRepositoryFullName = pullRequest.headRepository?.nameWithOwner;
      const isBaseRepositoryHead =
        headRepositoryFullName?.toLowerCase() === args.repositoryFullName.toLowerCase();
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
      items.push({
        kind: "pull_request",
        userId: args.context.userId,
        vaultId: args.context.vaultId,
        generation: args.context.generation,
        kindRank: 1,
        timeRank: -parseTimestamp(pullRequest.updatedAt),
        tie: String(pullRequest.number).padStart(12, "0"),
        rowKey,
        lastSyncedAt: args.context.syncedAt,
        nodeId: pullRequest.id,
        number: pullRequest.number,
        url: pullRequest.url,
        title: pullRequest.title,
        isDraft: pullRequest.isDraft,
        isCrossRepository: pullRequest.isCrossRepository,
        createdAt: parseTimestamp(pullRequest.createdAt),
        updatedAt: parseTimestamp(pullRequest.updatedAt),
        baseRepositoryFullName: args.repositoryFullName,
        baseRefName: pullRequest.baseRefName,
        headRepositoryId: pullRequest.headRepository?.id,
        headRepositoryFullName,
        headRefName: pullRequest.headRefName,
        headCommitSha: pullRequest.headRefOid,
        canOpenInSamebase,
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
  return items;
}

async function verifyCollectedBranchHeads(args: {
  requestGraphql: RepositoryInventoryGraphqlRequest;
  repositoryId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  defaultBranch: string | null;
  branchHeadShaByName: ReadonlyMap<string, string>;
}): Promise<void> {
  const seenCursors = new Set<string>();
  const verifiedBranchHeadShaByName = new Map<string, string>();
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
    if ((repository.defaultBranchRef?.name ?? null) !== args.defaultBranch) {
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
      if (verifiedBranchHeadShaByName.has(ref.name)) {
        throw new GitHubGraphqlRequestError(
          "GitHub returned a duplicate branch during verification.",
          true,
        );
      }
      verifiedBranchHeadShaByName.set(ref.name, ref.target.oid);
    }

    const nextCursor = requireNextCursor(repository.refs.pageInfo);
    if (nextCursor !== null) {
      assertNewCursor(seenCursors, nextCursor);
    }
    cursor = nextCursor;
    page += 1;
  } while (cursor !== null);

  if (
    expectedTotalCount !== verifiedBranchHeadShaByName.size ||
    verifiedBranchHeadShaByName.size !== args.branchHeadShaByName.size
  ) {
    throw new GitHubGraphqlRequestError(
      "GitHub branch inventory changed while it was being collected.",
      true,
    );
  }
  for (const [name, headSha] of args.branchHeadShaByName) {
    if (verifiedBranchHeadShaByName.get(name) !== headSha) {
      throw new GitHubGraphqlRequestError(
        "GitHub branch inventory changed while it was being collected.",
        true,
      );
    }
  }
}

async function repositoryInventoryFingerprint(args: {
  repositoryId: string;
  repositoryDatabaseId: string;
  repositoryFullName: string;
  defaultBranch: string | null;
  items: readonly RepositoryInventoryItem[];
}): Promise<string> {
  const providerItems = [...args.items]
    .sort((left, right) => left.rowKey.localeCompare(right.rowKey))
    .map((item) => {
      const {
        userId: _userId,
        vaultId: _vaultId,
        generation: _generation,
        lastSyncedAt: _lastSyncedAt,
        headCommit,
        ...providerItem
      } = item;
      const { checks, ...providerCommit } = headCommit;
      const { syncedAt: _checksSyncedAt, ...providerChecks } = checks;
      return {
        ...providerItem,
        headCommit: {
          ...providerCommit,
          checks: providerChecks,
        },
      };
    });
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
  context: RepositoryInventoryCollectionContext;
  repositoryNodeId: string;
  expectedRepositoryDatabaseId: string;
  pageSize: number;
  requestGraphql: RepositoryInventoryGraphqlRequest;
}): Promise<CollectedRepositoryInventory> {
  const branches = await collectBranches(args);
  const branchHeadShaByName = new Map(
    branches.items.map((item): [string, string] => {
      if (item.kind !== "branch") {
        throw new Error("Branch collection returned another item kind.");
      }
      return [item.name, item.headCommitSha];
    }),
  );
  const pullRequestItems = await collectPullRequests({
    ...args,
    repositoryId: branches.repositoryId,
    repositoryDatabaseId: branches.repositoryDatabaseId,
    repositoryFullName: branches.repositoryFullName,
    branchHeadShaByName,
  });
  await verifyCollectedBranchHeads({
    requestGraphql: args.requestGraphql,
    repositoryId: branches.repositoryId,
    repositoryDatabaseId: branches.repositoryDatabaseId,
    repositoryFullName: branches.repositoryFullName,
    defaultBranch: branches.defaultBranch,
    branchHeadShaByName,
  });

  const items = [...branches.items, ...pullRequestItems];

  return {
    repositoryId: branches.repositoryId,
    repositoryDatabaseId: branches.repositoryDatabaseId,
    repositoryFullName: branches.repositoryFullName,
    defaultBranch: branches.defaultBranch,
    items,
    fingerprint: await repositoryInventoryFingerprint({
      repositoryId: branches.repositoryId,
      repositoryDatabaseId: branches.repositoryDatabaseId,
      repositoryFullName: branches.repositoryFullName,
      defaultBranch: branches.defaultBranch,
      items,
    }),
    branchCount: branches.items.length,
    pullRequestCount: pullRequestItems.length,
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
  headers: Headers;
  accumulatedCost: number;
}): GitHubGraphqlRateUsage | undefined {
  const parsed = z.object({ rateLimit: graphqlRateLimitSchema }).safeParse(args.data);
  if (!parsed.success) {
    return undefined;
  }
  const resetAtFromHeader = headerInteger(args.headers, "x-ratelimit-reset");
  const resetAtFromGraphql = Date.parse(parsed.data.rateLimit.resetAt);
  const resetAt = resetAtFromHeader === undefined ? resetAtFromGraphql : resetAtFromHeader * 1_000;
  if (Number.isNaN(resetAt)) {
    return undefined;
  }
  return {
    cost: args.accumulatedCost + parsed.data.rateLimit.cost,
    limit: headerInteger(args.headers, "x-ratelimit-limit") ?? parsed.data.rateLimit.limit,
    remaining:
      headerInteger(args.headers, "x-ratelimit-remaining") ?? parsed.data.rateLimit.remaining,
    resetAt,
  };
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
}): GitHubGraphqlClient {
  const fetchImpl = args.fetchImpl ?? fetch;
  let usage: GitHubGraphqlRateUsage | undefined;
  const request: RepositoryInventoryGraphqlRequest = async (query, variables) => {
    let response: Response;
    let rawPayload: unknown;
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
      throw new GitHubGraphqlRequestError(
        `GitHub GraphQL request failed: ${toErrorMessage(error)}`,
        true,
      );
    }

    if (isRateLimitFailure({ response, errors: [] })) {
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
      throw new GitHubGraphqlRequestError(
        `GitHub GraphQL returned an unreadable response (${response.status}).`,
        response.status >= 500,
      );
    }
    const envelope = graphqlEnvelopeSchema.safeParse(rawPayload);
    if (!envelope.success) {
      throw new GitHubGraphqlRequestError(
        `GitHub GraphQL returned an invalid response (${response.status}).`,
        response.status >= 500,
      );
    }
    const observedUsage = responseRateUsage({
      data: envelope.data.data,
      headers: response.headers,
      accumulatedCost: usage?.cost ?? 0,
    });
    if (observedUsage !== undefined) {
      usage = observedUsage;
    }
    const errors = envelope.data.errors ?? [];
    const messages = errors.map((error) => error.message);
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
    if (observedUsage === undefined && response.ok && messages.length === 0) {
      throw new GitHubGraphqlRequestError(
        "GitHub GraphQL did not return rate-limit accounting.",
        false,
      );
    }
    if (!response.ok || messages.length > 0 || envelope.data.data === undefined) {
      const details = [...messages, ...(envelope.data.message ? [envelope.data.message] : [])];
      const detail = details.length > 0 ? `: ${details.join("; ")}` : "";
      throw new GitHubGraphqlRequestError(
        `GitHub GraphQL request failed (${response.status})${detail}`,
        response.status >= 500 || errors.some(isRetryableGraphqlError),
      );
    }
    return envelope.data.data;
  };
  return {
    request,
    getUsage: () => usage,
  };
}

export async function collectRepositoryInventoryWithRetry(args: {
  context: RepositoryInventoryCollectionContext;
  repositoryNodeId: string;
  expectedRepositoryDatabaseId: string;
  requestGraphql: RepositoryInventoryGraphqlRequest;
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
