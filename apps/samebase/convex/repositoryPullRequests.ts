"use node";

import { Infer, v } from "convex/values";
import { z } from "zod";
import {
  compareBranches,
  getOpenPullRequestForBranch as readBranchPullRequest,
} from "@samebase/git-editor/pullRequests";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action } from "./functions";
import { resolveGitHubAppAccess } from "./githubAppAccess";
import { createGitHubRequestDeadlineSignal } from "./githubRepoApi";
import type { RepositoryConnectedGitHubTarget } from "./repository/model";
import {
  GITHUB_CHECK_CONCLUSIONS,
  GITHUB_CHECK_STATUSES,
  vRepositoryPullRequestPage,
  vRepositorySidebarSummary,
  type RepositoryCheck,
  type RepositoryPullRequestPage,
  type RepositorySidebarSummary,
  type RepositoryStatusCheckRollup,
} from "./repository/pullRequestModel";
import { isLiveConnectedRepository } from "./repository/state";
import { GITHUB_STATUS_STATES, UNKNOWN_GITHUB_STATE } from "../shared/repositoryChecks";

const { array, id, number, object, string, union } = v;
const REPOSITORY_SIDEBAR_SUMMARY_BATCH_SIZE = 20;

const vBranchPullRequest = object({
  aheadBy: number(),
  pullRequest: union(
    v.null(),
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
    // Null while the run is queued.
    startedAt: z.iso.datetime().nullable(),
    checkSuite: z.object({
      // Null for checks that GitHub Actions does not run, such as a code review app.
      workflowRun: z.object({ workflow: z.object({ name: z.string() }) }).nullable(),
    }),
  }),
  z.object({
    __typename: z.literal("StatusContext"),
    context: z.string().min(1),
    state: providerStatusStateSchema,
    targetUrl: z.url().nullable(),
    description: z.string().nullable(),
    createdAt: z.iso.datetime(),
  }),
]);
const statusCheckRollupSchema = z
  .object({
    contexts: z.object({
      pageInfo: z.object({ hasNextPage: z.boolean() }),
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
      message: z.string(),
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

// The start time and workflow name pick the newest run of each check in normalizeStatusCheckRollup.
const STATUS_CHECK_ROLLUP_FRAGMENT = `
  fragment StatusCheckRollupFields on StatusCheckRollup {
    contexts(first: 100) {
      pageInfo { hasNextPage }
      nodes {
        __typename
        ... on CheckRun {
          name
          status
          conclusion
          detailsUrl
          title
          startedAt
          checkSuite { workflowRun { workflow { name } } }
        }
        ... on StatusContext {
          context
          state
          targetUrl
          description
          createdAt
        }
      }
    }
  }
`;

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
            message
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

  ${STATUS_CHECK_ROLLUP_FRAGMENT}
`;

const providerSidebarRepositorySchema = z
  .object({
    databaseId: z.number().int().positive(),
    defaultBranch: z
      .object({
        name: z.string().min(1),
        target: z.object({
          __typename: z.literal("Commit"),
          statusCheckRollup: statusCheckRollupSchema,
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

type ProviderStatusCheckRollup = z.infer<typeof statusCheckRollupSchema>;

function buildRepositorySidebarSummariesQuery(
  repositories: readonly RepositoryConnectedGitHubTarget[],
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
                statusCheckRollup { ...StatusCheckRollupFields }
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
    query RepositorySidebarSummaries(
      ${variableDefinitions}
    ) {
      ${repositoryFields}
    }

    ${STATUS_CHECK_ROLLUP_FRAGMENT}
  `;
}

function repositorySidebarSummariesVariables(
  repositories: readonly RepositoryConnectedGitHubTarget[],
): Record<string, string> {
  const variables: Record<string, string> = {};
  repositories.forEach((repository, index) => {
    variables[`owner${index}`] = repository.githubOwnerLogin;
    variables[`name${index}`] = repository.githubRepositoryName;
    variables[`defaultBranchRef${index}`] = `refs/heads/${repository.defaultBranch}`;
  });
  return variables;
}

export function repositorySidebarSummaryBatches(
  repositories: readonly RepositoryConnectedGitHubTarget[],
): RepositoryConnectedGitHubTarget[][] {
  const batches: RepositoryConnectedGitHubTarget[][] = [];
  const repositoriesByOwner = new Map<string, RepositoryConnectedGitHubTarget[]>();
  for (const repository of repositories) {
    const ownerRepositories = repositoriesByOwner.get(repository.githubOwnerLogin) ?? [];
    ownerRepositories.push(repository);
    repositoriesByOwner.set(repository.githubOwnerLogin, ownerRepositories);
  }
  for (const ownerRepositories of repositoriesByOwner.values()) {
    for (
      let start = 0;
      start < ownerRepositories.length;
      start += REPOSITORY_SIDEBAR_SUMMARY_BATCH_SIZE
    ) {
      batches.push(ownerRepositories.slice(start, start + REPOSITORY_SIDEBAR_SUMMARY_BATCH_SIZE));
    }
  }
  return batches;
}

/**
Keeps the newest run of each check. GitHub lists every run on the commit, also the runs that a newer
run of the same check replaced, such as a run cancelled when the PR title changed. This is the rule
of `gh pr checks` (eliminateDuplicates in cli/cli pkg/cmd/pr/checks/aggregate.go) and of T3 Code
(dedupeChecks in pingdotgg/t3code): a check is its workflow name plus its name, because two workflows
can have jobs with the same name, and a run that has not started counts as the oldest. When two
remaining checks share a name, the workflow name goes in front, as T3 Code shows them.
*/
function normalizeStatusCheckRollup(
  rollup: ProviderStatusCheckRollup,
): RepositoryStatusCheckRollup {
  if (rollup === null) {
    return null;
  }
  const newestByCheck = new Map<
    string,
    { check: RepositoryCheck; workflowName: string | null; startedAt: number }
  >();
  for (const context of rollup.contexts.nodes) {
    const entry =
      context.__typename === "CheckRun"
        ? {
            key: JSON.stringify([
              "check_run",
              context.checkSuite.workflowRun?.workflow.name ?? "",
              context.name,
            ]),
            workflowName: context.checkSuite.workflowRun?.workflow.name ?? null,
            startedAt:
              context.startedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(context.startedAt),
            check: {
              kind: "check_run" as const,
              name: context.name,
              status: context.status,
              conclusion: context.conclusion,
              detailsUrl: context.detailsUrl,
              title: context.title,
            },
          }
        : {
            key: JSON.stringify(["status_context", context.context]),
            workflowName: null,
            startedAt: Date.parse(context.createdAt),
            check: {
              kind: "status_context" as const,
              context: context.context,
              state: context.state,
              targetUrl: context.targetUrl,
              description: context.description,
            },
          };
    const kept = newestByCheck.get(entry.key);
    if (kept === undefined || entry.startedAt >= kept.startedAt) {
      newestByCheck.set(entry.key, entry);
    }
  }

  const newest = [...newestByCheck.values()];
  const checkRunCountByName = new Map<string, number>();
  for (const { check } of newest) {
    if (check.kind === "check_run") {
      checkRunCountByName.set(check.name, (checkRunCountByName.get(check.name) ?? 0) + 1);
    }
  }
  return {
    checks: newest.map(({ check, workflowName }) =>
      check.kind === "check_run" &&
      workflowName !== null &&
      workflowName.length > 0 &&
      (checkRunCountByName.get(check.name) ?? 0) > 1
        ? { ...check, name: `${workflowName} / ${check.name}` }
        : check,
    ),
    complete: !rollup.contexts.pageInfo.hasNextPage,
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
              // GitHub's messageHeadline cuts subjects over 72 characters to 69 plus "…".
              // Keep the whole first line and let the page clamp it to the space it has.
              headCommitTitle: repository.defaultBranch.target.message.replace(/\r?\n.*/s, ""),
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

export function normalizeGitHubRepositorySidebarSummaries(
  value: unknown,
  repositories: readonly RepositoryConnectedGitHubTarget[],
): RepositorySidebarSummary[] {
  const parsed = providerSidebarResponseSchema.parse(value);
  return repositories.map((repository, index) => {
    const providerRepository = parsed[`repository${index}`];
    const defaultBranch = providerRepository?.defaultBranch;
    if (
      !providerRepository ||
      !defaultBranch ||
      String(providerRepository.databaseId) !== repository.githubRepositoryDatabaseId ||
      defaultBranch.name !== repository.defaultBranch
    ) {
      return {
        repositoryId: repository.repositoryId,
        repository: null,
      };
    }
    return {
      repositoryId: repository.repositoryId,
      repository: {
        openPullRequestCount: providerRepository.pullRequests.totalCount,
        statusCheckRollup: normalizeStatusCheckRollup(defaultBranch.target.statusCheckRollup),
      },
    };
  });
}

export function recoverGitHubRepositorySidebarSummariesFromError(
  error: unknown,
  repositories: readonly RepositoryConnectedGitHubTarget[],
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

export const listRepositorySidebarSummaries = action({
  access: "access_dashboard",
  args: {},
  returns: array(vRepositorySidebarSummary),
  handler: async (ctx): Promise<RepositorySidebarSummary[]> => {
    const repositories = await ctx.runQuery(
      internal.repository.records.listConnectedRepositoriesForUser,
      {
        userId: ctx.viewer.userId,
      },
    );
    if (repositories.length === 0) {
      return [];
    }
    const summaries: RepositorySidebarSummary[] = [];
    for (const batch of repositorySidebarSummaryBatches(repositories)) {
      const firstRepository = batch.at(0);
      if (firstRepository === undefined) {
        continue;
      }
      const { octokit } = await resolveGitHubAppAccess(ctx, {
        userId: ctx.viewer.userId,
        target: { kind: "owner", githubOwnerLogin: firstRepository.githubOwnerLogin },
      });
      const signal = createGitHubRequestDeadlineSignal();
      let providerResponse: unknown;
      try {
        providerResponse = await octokit.graphql(buildRepositorySidebarSummariesQuery(batch), {
          ...repositorySidebarSummariesVariables(batch),
          request: { signal },
        });
      } catch (error) {
        // GitHub throws for partial GraphQL responses. A missing aliased
        // repository is still usable data for every other repository in the batch.
        providerResponse = recoverGitHubRepositorySidebarSummariesFromError(error, batch);
      }
      summaries.push(...normalizeGitHubRepositorySidebarSummaries(providerResponse, batch));
    }
    return summaries;
  },
});

export async function listOpenPullRequestsForUser(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    /**
    The branch whose head commit and checks the page reports. The dashboard reads the recorded
    default branch, which its branch label shows. repository:getStatus reads GitHub's live default
    branch.
    */
    defaultBranch: { source: "recorded" } | { source: "github"; name: string };
    first: number;
    after: string | null;
  },
): Promise<RepositoryPullRequestPage> {
  if (!Number.isInteger(args.first) || args.first < 1 || args.first > 100) {
    throw new Error("GitHub pull request page size must be between 1 and 100.");
  }
  const repository = await ctx.runQuery(internal.repository.records.getByIdForUser, {
    userId: args.userId,
    repositoryId: args.repositoryId,
  });
  if (!isLiveConnectedRepository(repository)) {
    throw new Error("Repository not found.");
  }
  const defaultBranch =
    args.defaultBranch.source === "github" ? args.defaultBranch.name : repository.defaultBranch;
  const { octokit, githubOwnerLogin } = await resolveGitHubAppAccess(ctx, {
    userId: args.userId,
    target: { kind: "repository", repositoryId: repository._id },
  });
  const signal = createGitHubRequestDeadlineSignal();
  const page = normalizeGitHubPullRequestPage(
    await octokit.graphql(REPOSITORY_PULL_REQUEST_PAGE_QUERY, {
      owner: githubOwnerLogin,
      name: repository.githubRepositoryName,
      defaultBranchRef: `refs/heads/${defaultBranch}`,
      first: args.first,
      after: args.after,
      request: { signal },
    }),
  );
  if (page.repository === null) {
    return page;
  }
  if (String(page.repository.databaseId) !== repository.githubRepositoryDatabaseId) {
    throw new Error("GitHub repository identity changed.");
  }
  if (
    page.repository.defaultBranch !== null &&
    page.repository.defaultBranch.name !== defaultBranch
  ) {
    throw new Error("GitHub returned another default branch ref.");
  }
  return page;
}

export const listOpenPullRequests = action({
  access: "access_dashboard",
  args: {
    repositoryId: id("repositories"),
    first: number(),
    after: union(string(), v.null()),
  },
  returns: vRepositoryPullRequestPage,
  handler: async (ctx, args): Promise<RepositoryPullRequestPage> =>
    await listOpenPullRequestsForUser(ctx, {
      userId: ctx.viewer.userId,
      repositoryId: args.repositoryId,
      defaultBranch: { source: "recorded" },
      first: args.first,
      after: args.after,
    }),
});

export const getOpenPullRequestForBranch = action({
  access: "access_files_read",
  args: {
    repositoryId: id("repositories"),
    branch: string(),
  },
  returns: vBranchPullRequest,
  handler: async (ctx, args): Promise<BranchPullRequest> => {
    const branch = args.branch.trim();
    if (!branch) {
      throw new Error("Branch is required.");
    }
    const repository = await ctx.runQuery(internal.repository.records.getByIdForUser, {
      userId: ctx.viewer.userId,
      repositoryId: args.repositoryId,
    });
    if (!isLiveConnectedRepository(repository)) {
      throw new Error("Repository not found.");
    }
    if (branch === repository.defaultBranch) {
      return { aheadBy: 0, pullRequest: null };
    }
    const { octokit, githubOwnerLogin } = await resolveGitHubAppAccess(ctx, {
      userId: ctx.viewer.userId,
      target: { kind: "repository", repositoryId: repository._id },
    });
    const signal = createGitHubRequestDeadlineSignal();
    const [comparison, pullRequest] = await Promise.all([
      compareBranches({
        octokit,
        owner: githubOwnerLogin,
        repo: repository.githubRepositoryName,
        baseBranch: repository.defaultBranch,
        branch,
        signal,
      }),
      readBranchPullRequest({
        octokit,
        owner: githubOwnerLogin,
        repo: repository.githubRepositoryName,
        branch,
        signal,
      }),
    ]);
    return {
      aheadBy: comparison.ahead_by,
      pullRequest: pullRequest ? { number: pullRequest.number, url: pullRequest.url } : null,
    };
  },
});
