"use node";

import { Octokit } from "@octokit/rest";
import { Infer, v } from "convex/values";
import { z } from "zod";

import { internal } from "./_generated/api";
import { action } from "./functions";
import { isLiveConnectedVault } from "./vault/state";

const { array, boolean, id, literal, null: vNull, number, object, string, union } = v;

const checkRunState = union(
  literal("ACTION_REQUIRED"),
  literal("CANCELLED"),
  literal("COMPLETED"),
  literal("FAILURE"),
  literal("IN_PROGRESS"),
  literal("NEUTRAL"),
  literal("PENDING"),
  literal("QUEUED"),
  literal("SKIPPED"),
  literal("STALE"),
  literal("STARTUP_FAILURE"),
  literal("SUCCESS"),
  literal("TIMED_OUT"),
  literal("WAITING"),
);
const statusContextState = union(
  literal("ERROR"),
  literal("EXPECTED"),
  literal("FAILURE"),
  literal("PENDING"),
  literal("SUCCESS"),
);
const statusCheckRollupState = union(
  literal("ERROR"),
  literal("EXPECTED"),
  literal("FAILURE"),
  literal("PENDING"),
  literal("SUCCESS"),
);
const checkCountFields = {
  totalCount: number(),
  checkRunCount: number(),
  statusContextCount: number(),
  checkRunCountsByState: array(object({ state: checkRunState, count: number() })),
  statusContextCountsByState: array(object({ state: statusContextState, count: number() })),
};
const vStatusCheckRollup = union(
  vNull(),
  object({
    state: statusCheckRollupState,
    contexts: object(checkCountFields),
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
const vRepositoryPullRequestPage = object({
  repository: union(
    vNull(),
    object({
      id: string(),
      databaseId: number(),
      nameWithOwner: string(),
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
export type RepositoryPullRequestPage = Infer<typeof vRepositoryPullRequestPage>;
export type RepositoryPullRequest = Infer<typeof vPullRequest>;
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
const statusCheckRollupSchema = z
  .object({
    state: z.enum(["ERROR", "EXPECTED", "FAILURE", "PENDING", "SUCCESS"]),
    contexts: z.object({
      totalCount: countSchema,
      checkRunCount: countSchema,
      statusContextCount: countSchema,
      checkRunCountsByState: z.array(
        z.object({
          state: z.enum([
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
          ]),
          count: countSchema,
        }),
      ),
      statusContextCountsByState: z.array(
        z.object({
          state: z.enum(["ERROR", "EXPECTED", "FAILURE", "PENDING", "SUCCESS"]),
          count: countSchema,
        }),
      ),
    }),
  })
  .nullable();
const providerPullRequestSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string().url(),
  isDraft: z.boolean(),
  isCrossRepository: z.boolean(),
  additions: countSchema,
  deletions: countSchema,
  changedFiles: countSchema,
  updatedAt: z.string().datetime(),
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
const providerPageSchema = z.object({
  repository: z
    .object({
      id: z.string().min(1),
      databaseId: z.number().int().positive(),
      nameWithOwner: z.string().min(3),
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
    $first: Int!
    $after: String
  ) {
    repository(owner: $owner, name: $name) {
      id
      databaseId
      nameWithOwner
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
`;

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
          const rollup = commit.statusCheckRollup;
          if (rollup) {
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
            statusCheckRollup: commit.statusCheckRollup,
          };
        }),
      },
    },
  };
}

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
    const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: ctx.viewer.userId,
      kind: "github",
    });
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub connection unavailable.");
    }

    const octokit = new Octokit({
      auth: githubConnection.auth.credential,
      request: { timeout: 15_000 },
    });
    const page = normalizeGitHubPullRequestPage(
      await octokit.graphql(REPOSITORY_PULL_REQUEST_PAGE_QUERY, {
        owner: vault.owner,
        name: vault.name,
        first: args.first,
        after: args.after,
      }),
    );
    if (page.repository === null) {
      return page;
    }
    if (
      String(page.repository.databaseId) !== vault.ghRepoId ||
      page.repository.nameWithOwner.toLowerCase() !== `${vault.owner}/${vault.name}`.toLowerCase()
    ) {
      throw new Error("GitHub repository identity changed.");
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
    const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: ctx.viewer.userId,
      kind: "github",
    });
    if (githubConnection?.kind !== "github") {
      throw new Error("GitHub connection unavailable.");
    }
    const octokit = new Octokit({
      auth: githubConnection.auth.credential,
      request: { timeout: 15_000 },
    });
    const [comparison, pullRequests] = await Promise.all([
      octokit.rest.repos.compareCommitsWithBasehead({
        owner: vault.owner,
        repo: vault.name,
        basehead: `${vault.defaultBranch}...${branch}`,
      }),
      octokit.rest.pulls.list({
        owner: vault.owner,
        repo: vault.name,
        state: "open",
        head: `${vault.owner}:${branch}`,
        sort: "updated",
        direction: "desc",
        per_page: 1,
      }),
    ]);
    const pullRequest = pullRequests.data.at(0);
    return {
      aheadBy: comparison.data.ahead_by,
      pullRequest: pullRequest ? { number: pullRequest.number, url: pullRequest.html_url } : null,
    };
  },
});
