"use node";

import { Infer, v } from "convex/values";
import { z } from "zod";

import { internal } from "./_generated/api";
import { action } from "./functions";
import { resolveGitHubAppAccess } from "./githubAppAccess";
import { createGitHubRequestDeadlineSignal } from "./githubRepoApi";
import type { VaultConnectedRepositoryTarget } from "./vault/model";
import { isLiveConnectedVault } from "./vault/state";

const { array, boolean, id, literal, null: vNull, number, object, string, union } = v;

const GITHUB_CHECK_RUN_STATES = [
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
const GITHUB_STATUS_STATES = ["ERROR", "EXPECTED", "FAILURE", "PENDING", "SUCCESS"] as const;
const GITHUB_CHECK_STATUSES = [
  "REQUESTED",
  "QUEUED",
  "IN_PROGRESS",
  "COMPLETED",
  "WAITING",
  "PENDING",
] as const;
const GITHUB_CHECK_CONCLUSIONS = [
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
const UNKNOWN_GITHUB_STATE = "UNKNOWN" as const;
const VAULT_SIDEBAR_SUMMARY_BATCH_SIZE = 20;
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
    conclusion: union(vNull(), checkConclusion),
    detailsUrl: union(vNull(), string()),
    title: union(vNull(), string()),
  }),
  object({
    kind: literal("status_context"),
    context: string(),
    state: statusState,
    targetUrl: union(vNull(), string()),
    description: union(vNull(), string()),
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
  vNull(),
  object({
    contexts: object(checkCountFields),
  }),
);
const vStatusCheckRollup = union(
  vNull(),
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
    vNull(),
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
  vNull(),
  object({
    name: string(),
    headCommitOid: string(),
    headCommitTitle: string(),
    headCommitCommittedAt: string(),
    headCommitUrl: string(),
    statusCheckRollup: vStatusCheckRollup,
  }),
);
const vRepositoryPullRequestPage = object({
  repository: union(
    vNull(),
    object({
      id: string(),
      databaseId: number(),
      nameWithOwner: string(),
      defaultBranch: vRepositoryDefaultBranch,
      pullRequests: object({
        totalCount: number(),
        pageInfo: object({
          hasNextPage: boolean(),
          endCursor: union(vNull(), string()),
        }),
        nodes: array(vPullRequest),
      }),
    }),
  ),
});
const vVaultSidebarSummary = object({
  vaultId: id("vaults"),
  repository: union(
    vNull(),
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
export type VaultSidebarSummary = Infer<typeof vVaultSidebarSummary>;
const vBranchPullRequest = object({
  aheadBy: number(),
  pullRequest: union(
    vNull(),
    object({
      number: number(),
      url: string(),
    }),
  ),
});
type BranchPullRequest = Infer<typeof vBranchPullRequest>;

const countSchema = z.number().int().nonnegative();
function providerEnumWithUnknown<const T extends readonly [string, ...string[]]>(values: T) {
  const knownValues = z.enum(values);
  return z.string().transform((value) => {
    const parsed = knownValues.safeParse(value);
    return parsed.success ? parsed.data : UNKNOWN_GITHUB_STATE;
  });
}

const providerCheckRunStateSchema = providerEnumWithUnknown(GITHUB_CHECK_RUN_STATES);
const providerStatusStateSchema = providerEnumWithUnknown(GITHUB_STATUS_STATES);
const providerCheckStatusSchema = providerEnumWithUnknown(GITHUB_CHECK_STATUSES);
const providerCheckConclusionSchema = providerEnumWithUnknown(GITHUB_CHECK_CONCLUSIONS);
const providerCheckContextSchema = z.discriminatedUnion("__typename", [
  z.object({
    __typename: z.literal("CheckRun"),
    name: z.string().min(1),
    status: providerCheckStatusSchema,
    conclusion: providerCheckConclusionSchema.nullable(),
    detailsUrl: z.url().nullable(),
    title: z.string().nullable(),
  }),
  z.object({
    __typename: z.literal("StatusContext"),
    context: z.string().min(1),
    state: providerStatusStateSchema,
    targetUrl: z.url().nullable(),
    description: z.string().nullable(),
  }),
]);
const providerStatusCheckCountsSchema = z.object({
  totalCount: countSchema,
  checkRunCount: countSchema,
  statusContextCount: countSchema,
  checkRunCountsByState: z.array(
    z.object({
      state: providerCheckRunStateSchema,
      count: countSchema,
    }),
  ),
  statusContextCountsByState: z.array(
    z.object({
      state: providerStatusStateSchema,
      count: countSchema,
    }),
  ),
});
const statusCheckCountsSchema = z
  .object({
    contexts: providerStatusCheckCountsSchema,
  })
  .nullable();
const statusCheckRollupSchema = z
  .object({
    contexts: providerStatusCheckCountsSchema.extend({
      nodes: z.array(providerCheckContextSchema),
    }),
  })
  .nullable();
const providerPullRequestSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.url(),
  isDraft: z.boolean(),
  isCrossRepository: z.boolean(),
  additions: countSchema,
  deletions: countSchema,
  changedFiles: countSchema,
  updatedAt: z.iso.datetime(),
  baseRefName: z.string().min(1),
  headRefName: z.string().min(1),
  headRefOid: z.string().min(1),
  headRepository: z
    .object({
      id: z.string().min(1),
      nameWithOwner: z.string().min(3),
      owner: z.object({ login: z.string().min(1) }),
    })
    .nullable(),
  labels: z.object({
    totalCount: countSchema,
    nodes: z.array(
      z.object({
        name: z.string().min(1),
        color: z.string().regex(/^[0-9a-f]{6}$/i),
      }),
    ),
  }),
  commits: z.object({
    nodes: z.array(
      z.object({
        commit: z.object({
          oid: z.string().min(1),
          statusCheckRollup: statusCheckRollupSchema,
        }),
      }),
    ),
  }),
});
const providerDefaultBranchSchema = z
  .object({
    name: z.string().min(1),
    target: z.object({
      __typename: z.literal("Commit"),
      oid: z.string().min(1),
      messageHeadline: z.string(),
      committedDate: z.iso.datetime(),
      url: z.url(),
      statusCheckRollup: statusCheckRollupSchema,
    }),
  })
  .nullable();
const providerPageSchema = z.object({
  repository: z
    .object({
      id: z.string().min(1),
      databaseId: z.number().int().positive(),
      nameWithOwner: z.string().min(3),
      defaultBranch: providerDefaultBranchSchema,
      pullRequests: z.object({
        totalCount: countSchema,
        pageInfo: z.object({
          hasNextPage: z.boolean(),
          endCursor: z.string().min(1).nullable(),
        }),
        nodes: z.array(providerPullRequestSchema),
      }),
    })
    .nullable(),
});

const REPOSITORY_PULL_REQUEST_PAGE_QUERY = `
  query RepositoryPullRequestPage(
    $owner: String!
    $name: String!
    $defaultBranchRef: String!
    $first: Int!
    $after: String
  ) {
    repository(owner: $owner, name: $name) {
      id
      databaseId
      nameWithOwner
      defaultBranch: ref(qualifiedName: $defaultBranchRef) {
        name
        target {
          __typename
          ... on Commit {
            oid
            messageHeadline
            committedDate
            url
            statusCheckRollup { ...StatusCheckRollupFields }
          }
        }
      }
      pullRequests(
        first: $first
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
          labels(first: 100) { totalCount nodes { name color } }
          commits(last: 1) {
            nodes {
              commit {
                oid
                statusCheckRollup { ...StatusCheckRollupFields }
              }
            }
          }
        }
      }
    }
  }

  fragment StatusCheckRollupFields on StatusCheckRollup {
    contexts(first: 100) {
      totalCount
      checkRunCount
      statusContextCount
      checkRunCountsByState { state count }
      statusContextCountsByState { state count }
      nodes {
        __typename
        ... on CheckRun {
          name
          status
          conclusion
          detailsUrl
          title
        }
        ... on StatusContext {
          context
          state
          targetUrl
          description
        }
      }
    }
  }
`;

const providerSidebarRepositorySchema = z
  .object({
    databaseId: z.number().int().positive(),
    defaultBranch: z
      .object({
        name: z.string().min(1),
        target: z.object({
          __typename: z.literal("Commit"),
          statusCheckRollup: statusCheckCountsSchema,
        }),
      })
      .nullable(),
    pullRequests: z.object({
      totalCount: countSchema,
    }),
  })
  .nullable();
const providerSidebarResponseSchema = z.record(z.string(), providerSidebarRepositorySchema);
const providerMissingSidebarRepositoryErrorsSchema = z
  .array(
    z.object({
      type: z.literal("NOT_FOUND"),
      path: z.tuple([z.string().regex(/^repository\d+$/)]).rest(z.union([z.string(), z.number()])),
    }),
  )
  .nonempty();
const providerMissingSidebarRepositoriesErrorSchema = z.object({
  name: z.literal("GraphqlResponseError"),
  errors: providerMissingSidebarRepositoryErrorsSchema,
  data: z.unknown(),
});

type ProviderStatusCheckCounts = z.infer<typeof statusCheckCountsSchema>;
type ProviderStatusCheckRollup = z.infer<typeof statusCheckRollupSchema>;

function buildVaultSidebarSummariesQuery(
  repositories: readonly VaultConnectedRepositoryTarget[],
): string {
  const variableDefinitions = repositories
    .flatMap((_, index) => [
      `$owner${index}: String!`,
      `$name${index}: String!`,
      `$defaultBranchRef${index}: String!`,
    ])
    .join("\n");
  const repositoryFields = repositories
    .map(
      (_, index) => `
        repository${index}: repository(owner: $owner${index}, name: $name${index}) {
          databaseId
          defaultBranch: ref(qualifiedName: $defaultBranchRef${index}) {
            name
            target {
              __typename
              ... on Commit {
                statusCheckRollup {
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
          pullRequests(states: [OPEN]) {
            totalCount
          }
        }
      `,
    )
    .join("\n");

  return `
    query VaultSidebarSummaries(
      ${variableDefinitions}
    ) {
      ${repositoryFields}
    }
  `;
}

function vaultSidebarSummariesVariables(
  repositories: readonly VaultConnectedRepositoryTarget[],
): Record<string, string> {
  const variables: Record<string, string> = {};
  repositories.forEach((repository, index) => {
    variables[`owner${index}`] = repository.owner;
    variables[`name${index}`] = repository.name;
    variables[`defaultBranchRef${index}`] = `refs/heads/${repository.defaultBranch}`;
  });
  return variables;
}

export function vaultSidebarSummaryBatches(
  repositories: readonly VaultConnectedRepositoryTarget[],
): VaultConnectedRepositoryTarget[][] {
  const batches: VaultConnectedRepositoryTarget[][] = [];
  const repositoriesByOwner = new Map<string, VaultConnectedRepositoryTarget[]>();
  for (const repository of repositories) {
    const ownerRepositories = repositoriesByOwner.get(repository.owner) ?? [];
    ownerRepositories.push(repository);
    repositoriesByOwner.set(repository.owner, ownerRepositories);
  }
  for (const ownerRepositories of repositoriesByOwner.values()) {
    for (
      let start = 0;
      start < ownerRepositories.length;
      start += VAULT_SIDEBAR_SUMMARY_BATCH_SIZE
    ) {
      batches.push(ownerRepositories.slice(start, start + VAULT_SIDEBAR_SUMMARY_BATCH_SIZE));
    }
  }
  return batches;
}

function normalizeStatusCheckCounts(
  rollup: NonNullable<ProviderStatusCheckCounts>,
): NonNullable<RepositoryStatusCheckCounts> {
  const checkRunCount = rollup.contexts.checkRunCountsByState.reduce(
    (total, count) => total + count.count,
    0,
  );
  const statusContextCount = rollup.contexts.statusContextCountsByState.reduce(
    (total, count) => total + count.count,
    0,
  );
  if (
    checkRunCount !== rollup.contexts.checkRunCount ||
    statusContextCount !== rollup.contexts.statusContextCount ||
    checkRunCount + statusContextCount !== rollup.contexts.totalCount
  ) {
    throw new Error("GitHub returned inconsistent check counts.");
  }
  return {
    contexts: {
      totalCount: rollup.contexts.totalCount,
      checkRunCount: rollup.contexts.checkRunCount,
      statusContextCount: rollup.contexts.statusContextCount,
      checkRunCountsByState: rollup.contexts.checkRunCountsByState,
      statusContextCountsByState: rollup.contexts.statusContextCountsByState,
    },
  };
}

function normalizeStatusCheckRollup(
  rollup: ProviderStatusCheckRollup,
): RepositoryStatusCheckRollup {
  if (rollup === null) {
    return null;
  }
  const counts = normalizeStatusCheckCounts(rollup);
  return {
    contexts: {
      totalCount: counts.contexts.totalCount,
      checkRunCount: counts.contexts.checkRunCount,
      statusContextCount: counts.contexts.statusContextCount,
      checkRunCountsByState: counts.contexts.checkRunCountsByState,
      statusContextCountsByState: counts.contexts.statusContextCountsByState,
      nodes: rollup.contexts.nodes.map((context) => {
        if (context.__typename === "CheckRun") {
          return {
            kind: "check_run" as const,
            name: context.name,
            status: context.status,
            conclusion: context.conclusion,
            detailsUrl: context.detailsUrl,
            title: context.title,
          };
        }
        return {
          kind: "status_context" as const,
          context: context.context,
          state: context.state,
          targetUrl: context.targetUrl,
          description: context.description,
        };
      }),
    },
  };
}

export function normalizeGitHubPullRequestPage(value: unknown): RepositoryPullRequestPage {
  const parsed = providerPageSchema.parse(value);
  const repository = parsed.repository;
  if (repository === null) {
    return { repository: null };
  }
  if (repository.pullRequests.pageInfo.hasNextPage && !repository.pullRequests.pageInfo.endCursor) {
    throw new Error("GitHub returned another pull request page without a cursor.");
  }

  return {
    repository: {
      id: repository.id,
      databaseId: repository.databaseId,
      nameWithOwner: repository.nameWithOwner,
      defaultBranch:
        repository.defaultBranch === null
          ? null
          : {
              name: repository.defaultBranch.name,
              headCommitOid: repository.defaultBranch.target.oid,
              headCommitTitle: repository.defaultBranch.target.messageHeadline,
              headCommitCommittedAt: repository.defaultBranch.target.committedDate,
              headCommitUrl: repository.defaultBranch.target.url,
              statusCheckRollup: normalizeStatusCheckRollup(
                repository.defaultBranch.target.statusCheckRollup,
              ),
            },
      pullRequests: {
        totalCount: repository.pullRequests.totalCount,
        pageInfo: repository.pullRequests.pageInfo,
        nodes: repository.pullRequests.nodes.map((pullRequest) => {
          if (pullRequest.labels.nodes.length !== pullRequest.labels.totalCount) {
            throw new Error("GitHub returned incomplete pull request labels.");
          }
          const commit = pullRequest.commits.nodes.at(0)?.commit;
          if (
            !commit ||
            pullRequest.commits.nodes.length !== 1 ||
            commit.oid !== pullRequest.headRefOid
          ) {
            throw new Error("GitHub did not return the pull request head commit.");
          }
          return {
            id: pullRequest.id,
            number: pullRequest.number,
            title: pullRequest.title,
            url: pullRequest.url,
            isDraft: pullRequest.isDraft,
            isCrossRepository: pullRequest.isCrossRepository,
            additions: pullRequest.additions,
            deletions: pullRequest.deletions,
            changedFiles: pullRequest.changedFiles,
            updatedAt: pullRequest.updatedAt,
            baseRefName: pullRequest.baseRefName,
            headRefName: pullRequest.headRefName,
            headRefOid: pullRequest.headRefOid,
            headRepository: pullRequest.headRepository,
            labels: { nodes: pullRequest.labels.nodes },
            statusCheckRollup: normalizeStatusCheckRollup(commit.statusCheckRollup),
          };
        }),
      },
    },
  };
}

export function normalizeGitHubVaultSidebarSummaries(
  value: unknown,
  repositories: readonly VaultConnectedRepositoryTarget[],
): VaultSidebarSummary[] {
  const parsed = providerSidebarResponseSchema.parse(value);
  return repositories.map((repository, index) => {
    const providerRepository = parsed[`repository${index}`];
    const defaultBranch = providerRepository?.defaultBranch;
    if (
      !providerRepository ||
      !defaultBranch ||
      String(providerRepository.databaseId) !== repository.ghRepoId ||
      defaultBranch.name !== repository.defaultBranch
    ) {
      return {
        vaultId: repository.vaultId,
        repository: null,
      };
    }
    return {
      vaultId: repository.vaultId,
      repository: {
        openPullRequestCount: providerRepository.pullRequests.totalCount,
        statusCheckRollup:
          defaultBranch.target.statusCheckRollup === null
            ? null
            : normalizeStatusCheckCounts(defaultBranch.target.statusCheckRollup),
      },
    };
  });
}

export function recoverGitHubVaultSidebarSummariesFromError(
  error: unknown,
  repositories: readonly VaultConnectedRepositoryTarget[],
): unknown {
  const parsed = providerMissingSidebarRepositoriesErrorSchema.safeParse(error);
  if (!parsed.success) {
    throw error;
  }

  const expectedAliases = new Set(repositories.map((_, index) => `repository${index}`));
  if (!parsed.data.errors.every((providerError) => expectedAliases.has(providerError.path[0]))) {
    throw error;
  }

  return parsed.data.data;
}

export const listVaultSidebarSummaries = action({
  access: "access_dashboard",
  args: {},
  returns: array(vVaultSidebarSummary),
  handler: async (ctx): Promise<VaultSidebarSummary[]> => {
    const repositories = await ctx.runQuery(
      internal.vault.records.listConnectedRepositoriesForUser,
      {
        userId: ctx.viewer.userId,
      },
    );
    if (repositories.length === 0) {
      return [];
    }
    const summaries: VaultSidebarSummary[] = [];
    for (const batch of vaultSidebarSummaryBatches(repositories)) {
      const firstRepository = batch.at(0);
      if (firstRepository === undefined) {
        continue;
      }
      const { octokit } = await resolveGitHubAppAccess(ctx, {
        userId: ctx.viewer.userId,
        target: { kind: "owner", githubOwnerLogin: firstRepository.owner },
      });
      const signal = createGitHubRequestDeadlineSignal();
      let providerResponse: unknown;
      try {
        providerResponse = await octokit.graphql(buildVaultSidebarSummariesQuery(batch), {
          ...vaultSidebarSummariesVariables(batch),
          request: { signal },
        });
      } catch (error) {
        // GitHub throws for partial GraphQL responses. A missing aliased
        // repository is still usable data for every other vault in the batch.
        providerResponse = recoverGitHubVaultSidebarSummariesFromError(error, batch);
      }
      summaries.push(...normalizeGitHubVaultSidebarSummaries(providerResponse, batch));
    }
    return summaries;
  },
});

export const listOpenPullRequests = action({
  access: "access_dashboard",
  args: {
    vaultId: id("vaults"),
    first: number(),
    after: union(string(), vNull()),
  },
  returns: vRepositoryPullRequestPage,
  handler: async (ctx, args): Promise<RepositoryPullRequestPage> => {
    if (!Number.isInteger(args.first) || args.first < 1 || args.first > 100) {
      throw new Error("GitHub pull request page size must be between 1 and 100.");
    }
    const vault = await ctx.runQuery(internal.vault.records.getByIdForUser, {
      userId: ctx.viewer.userId,
      vaultId: args.vaultId,
    });
    if (!isLiveConnectedVault(vault)) {
      throw new Error("Vault not found.");
    }
    const { octokit, githubOwnerLogin } = await resolveGitHubAppAccess(ctx, {
      userId: ctx.viewer.userId,
      target: { kind: "vault", vaultId: vault._id },
    });
    const signal = createGitHubRequestDeadlineSignal();
    const page = normalizeGitHubPullRequestPage(
      await octokit.graphql(REPOSITORY_PULL_REQUEST_PAGE_QUERY, {
        owner: githubOwnerLogin,
        name: vault.name,
        defaultBranchRef: `refs/heads/${vault.defaultBranch}`,
        first: args.first,
        after: args.after,
        request: { signal },
      }),
    );
    if (page.repository === null) {
      return page;
    }
    if (String(page.repository.databaseId) !== vault.ghRepoId) {
      throw new Error("GitHub repository identity changed.");
    }
    if (
      page.repository.defaultBranch !== null &&
      page.repository.defaultBranch.name !== vault.defaultBranch
    ) {
      throw new Error("GitHub returned another default branch ref.");
    }
    return page;
  },
});

export const getOpenPullRequestForBranch = action({
  access: "access_files_read",
  args: {
    vaultId: id("vaults"),
    branch: string(),
  },
  returns: vBranchPullRequest,
  handler: async (ctx, args): Promise<BranchPullRequest> => {
    const branch = args.branch.trim();
    if (!branch) {
      throw new Error("Branch is required.");
    }
    const vault = await ctx.runQuery(internal.vault.records.getByIdForUser, {
      userId: ctx.viewer.userId,
      vaultId: args.vaultId,
    });
    if (!isLiveConnectedVault(vault)) {
      throw new Error("Vault not found.");
    }
    if (branch === vault.defaultBranch) {
      return { aheadBy: 0, pullRequest: null };
    }
    const { octokit, githubOwnerLogin } = await resolveGitHubAppAccess(ctx, {
      userId: ctx.viewer.userId,
      target: { kind: "vault", vaultId: vault._id },
    });
    const signal = createGitHubRequestDeadlineSignal();
    const [comparison, pullRequests] = await Promise.all([
      octokit.rest.repos.compareCommitsWithBasehead({
        owner: githubOwnerLogin,
        repo: vault.name,
        basehead: `${vault.defaultBranch}...${branch}`,
        request: { signal },
      }),
      octokit.rest.pulls.list({
        owner: githubOwnerLogin,
        repo: vault.name,
        state: "open",
        head: `${githubOwnerLogin}:${branch}`,
        sort: "updated",
        direction: "desc",
        per_page: 1,
        request: { signal },
      }),
    ]);
    const pullRequest = pullRequests.data.at(0);
    return {
      aheadBy: comparison.data.ahead_by,
      pullRequest: pullRequest ? { number: pullRequest.number, url: pullRequest.html_url } : null,
    };
  },
});
