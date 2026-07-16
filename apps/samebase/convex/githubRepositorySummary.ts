import { z } from "zod";

import type {
  RepositoryInventoryGraphqlError,
  RepositoryInventoryGraphqlPartialRequest,
} from "./githubRepositoryInventory";
import {
  GITHUB_STATUS_CHECK_ROLLUP_STATES,
  repositorySummaryCheckStateFromGitHubRollup,
} from "./githubRepositoryCheckState";

const GITHUB_REPOSITORY_SUMMARY_MAX_BATCH_SIZE = 50;

const repositoryDatabaseIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .refine((value) => Number.isSafeInteger(Number(value)));
const repositoryFullNameSchema = z.string().regex(/^[^/\s]+\/[^/\s]+$/);

const repositorySummaryInputSchema = z.object({
  repositoryNodeId: z.string().min(1),
  expectedRepositoryDatabaseId: repositoryDatabaseIdSchema,
});

const statusCheckRollupStateSchema = z.enum(GITHUB_STATUS_CHECK_ROLLUP_STATES);

const repositorySummaryNodeSchema = z.object({
  __typename: z.literal("Repository"),
  id: z.string().min(1),
  databaseId: z.number().int().positive(),
  nameWithOwner: repositoryFullNameSchema,
  defaultBranchRef: z
    .object({
      name: z.string().min(1),
      target: z.object({
        __typename: z.literal("Commit"),
        oid: z.string().min(1),
        statusCheckRollup: z
          .object({
            state: statusCheckRollupStateSchema,
          })
          .nullable(),
      }),
    })
    .nullable(),
  pullRequests: z.object({
    totalCount: z.number().int().nonnegative(),
  }),
});

const repositorySummaryResponseSchema = z.object({
  nodes: z.array(repositorySummaryNodeSchema.nullable()),
  rateLimit: z.object({
    cost: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    remaining: z.number().int().nonnegative(),
    resetAt: z.string().min(1),
  }),
});

const repositorySummaryCheckStateSchema = z.enum(["none", "success", "failure", "running"]);

const repositorySummarySchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("ready"),
    repositoryNodeId: z.string(),
    repositoryDatabaseId: z.string(),
    repositoryFullName: repositoryFullNameSchema,
    defaultBranch: z.discriminatedUnion("state", [
      z.object({
        state: z.literal("ready"),
        name: z.string(),
        headSha: z.string(),
        checkState: repositorySummaryCheckStateSchema,
      }),
      z.object({
        state: z.literal("unavailable"),
        reason: z.literal("repository_has_no_default_branch"),
      }),
    ]),
    openPullRequestCount: z.number().int().nonnegative(),
  }),
  z.object({
    state: z.literal("unavailable"),
    reason: z.literal("repository_unavailable"),
  }),
]);

const REPOSITORY_SUMMARY_QUERY = `
  query RepositorySummaryBatch($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Repository {
        id
        databaseId
        nameWithOwner
        defaultBranchRef {
          name
          target {
            __typename
            oid
            ... on Commit {
              statusCheckRollup { state }
            }
          }
        }
        pullRequests(states: OPEN) { totalCount }
      }
    }
    rateLimit { cost limit remaining resetAt }
  }
`;

export type GitHubRepositorySummaryInput = z.infer<typeof repositorySummaryInputSchema>;
export type GitHubRepositorySummary = z.infer<typeof repositorySummarySchema>;

function requireUnavailableRepositoryIndexes(args: {
  errors: readonly RepositoryInventoryGraphqlError[];
  nodes: readonly (z.infer<typeof repositorySummaryNodeSchema> | null)[];
}): ReadonlySet<number> {
  const indexes = new Set<number>();
  for (const error of args.errors) {
    const path = error.path;
    if (
      error.type !== "NOT_FOUND" ||
      path === undefined ||
      path.length !== 2 ||
      path[0] !== "nodes" ||
      typeof path[1] !== "number" ||
      !Number.isInteger(path[1]) ||
      path[1] < 0 ||
      path[1] >= args.nodes.length ||
      args.nodes[path[1]] !== null ||
      indexes.has(path[1])
    ) {
      throw new Error(`GitHub repository summary request failed: ${error.message}`);
    }
    indexes.add(path[1]);
  }

  for (const [index, node] of args.nodes.entries()) {
    if (node === null && !indexes.has(index)) {
      throw new Error("GitHub repository summary response contained an unexplained null node.");
    }
  }
  return indexes;
}

export async function collectGitHubRepositorySummaries(args: {
  repositories: readonly GitHubRepositorySummaryInput[];
  requestGraphqlPartial: RepositoryInventoryGraphqlPartialRequest;
}): Promise<GitHubRepositorySummary[]> {
  if (
    args.repositories.length === 0 ||
    args.repositories.length > GITHUB_REPOSITORY_SUMMARY_MAX_BATCH_SIZE
  ) {
    throw new Error(
      "GitHub repository summary batches must contain between 1 and 50 repositories.",
    );
  }
  const repositories = repositorySummaryInputSchema.array().parse(args.repositories);

  const envelope = await args.requestGraphqlPartial(REPOSITORY_SUMMARY_QUERY, {
    ids: repositories.map((repository) => repository.repositoryNodeId),
  });
  const response = repositorySummaryResponseSchema.parse(envelope.data);
  if (response.nodes.length !== repositories.length) {
    throw new Error("GitHub repository summary response returned the wrong number of nodes.");
  }
  const unavailableIndexes = requireUnavailableRepositoryIndexes({
    errors: envelope.errors,
    nodes: response.nodes,
  });

  return repositories.map((repository, index): GitHubRepositorySummary => {
    if (unavailableIndexes.has(index)) {
      return { state: "unavailable", reason: "repository_unavailable" };
    }
    const node = response.nodes[index];
    if (node === null) {
      throw new Error("GitHub repository summary response contained an unavailable node.");
    }
    if (
      node.id !== repository.repositoryNodeId ||
      String(node.databaseId) !== repository.expectedRepositoryDatabaseId
    ) {
      throw new Error("GitHub repository summary response returned another repository.");
    }

    let defaultBranch: Extract<GitHubRepositorySummary, { state: "ready" }>["defaultBranch"];
    if (node.defaultBranchRef === null) {
      defaultBranch = {
        state: "unavailable",
        reason: "repository_has_no_default_branch",
      };
    } else {
      const rollupState = node.defaultBranchRef.target.statusCheckRollup?.state ?? null;
      const checkState = repositorySummaryCheckStateFromGitHubRollup(rollupState);
      defaultBranch = {
        state: "ready",
        name: node.defaultBranchRef.name,
        headSha: node.defaultBranchRef.target.oid,
        checkState,
      };
    }

    return {
      state: "ready",
      repositoryNodeId: node.id,
      repositoryDatabaseId: String(node.databaseId),
      repositoryFullName: node.nameWithOwner,
      defaultBranch,
      openPullRequestCount: node.pullRequests.totalCount,
    };
  });
}
