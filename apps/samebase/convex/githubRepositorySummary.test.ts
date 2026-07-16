import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import type {
  RepositoryInventoryGraphqlError,
  RepositoryInventoryGraphqlPartialRequest,
} from "./githubRepositoryInventory";
import { collectGitHubRepositorySummaries } from "./githubRepositorySummary";

const RATE_LIMIT = {
  cost: 1,
  limit: 5_000,
  remaining: 4_999,
  resetAt: "2026-07-16T12:00:00Z",
};

function makeRepositoryNode(index: number) {
  return {
    __typename: "Repository",
    id: `R_${index}`,
    databaseId: index + 1,
    nameWithOwner: `samebase/repository-${index}`,
    defaultBranchRef: {
      name: "main",
      target: {
        __typename: "Commit",
        oid: `sha-${index}`,
        statusCheckRollup: { state: "SUCCESS" },
      },
    },
    pullRequests: { totalCount: index },
  };
}

function makeInputs(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    repositoryNodeId: `R_${index}`,
    expectedRepositoryDatabaseId: String(index + 1),
  }));
}

function makeRequest(args: {
  nodes: readonly unknown[];
  errors?: readonly RepositoryInventoryGraphqlError[];
  rateLimit?: unknown;
  observe?: (query: string, ids: string[]) => void;
}): RepositoryInventoryGraphqlPartialRequest {
  return async (query, variables) => {
    const ids = z.array(z.string()).parse(variables.ids);
    args.observe?.(query, ids);
    return {
      data: {
        nodes: args.nodes,
        rateLimit: args.rateLimit ?? RATE_LIMIT,
      },
      errors: [...(args.errors ?? [])],
    };
  };
}

describe("GitHub repository summary collection", () => {
  it.each([1, 25, 50])(
    "collects one static nodes(ids:) batch of %i repositories",
    async (count) => {
      const observe = vi.fn<(query: string, ids: string[]) => void>();
      const inputs = makeInputs(count);

      const summaries = await collectGitHubRepositorySummaries({
        repositories: inputs,
        requestGraphqlPartial: makeRequest({
          nodes: inputs.map((_, index) => makeRepositoryNode(index)),
          observe,
        }),
      });

      expect(summaries).toHaveLength(count);
      expect(observe).toHaveBeenCalledOnce();
      const [query, ids] = observe.mock.calls[0];
      expect(ids).toEqual(inputs.map((input) => input.repositoryNodeId));
      expect(query).toContain("nodes(ids: $ids)");
      expect(query).toContain("pullRequests(states: OPEN) { totalCount }");
      expect(query).toContain("rateLimit { cost limit remaining resetAt }");
      expect(query).not.toContain("R_0");
      expect(query).not.toContain("messageHeadline");
      expect(query).not.toContain("committedDate");
    },
  );

  it.each([0, 51])("rejects a batch of %i repositories before requesting GitHub", async (count) => {
    const requestGraphqlPartial = vi.fn<RepositoryInventoryGraphqlPartialRequest>();

    await expect(
      collectGitHubRepositorySummaries({
        repositories: makeInputs(count),
        requestGraphqlPartial,
      }),
    ).rejects.toThrow("between 1 and 50");
    expect(requestGraphqlPartial).not.toHaveBeenCalled();
  });

  it("maps canonical identity, default-branch head, checks, and open PR count", async () => {
    await expect(
      collectGitHubRepositorySummaries({
        repositories: makeInputs(1),
        requestGraphqlPartial: makeRequest({
          nodes: [
            {
              ...makeRepositoryNode(0),
              nameWithOwner: "Canonical/Repository",
              pullRequests: { totalCount: 37 },
            },
          ],
        }),
      }),
    ).resolves.toEqual([
      {
        state: "ready",
        repositoryNodeId: "R_0",
        repositoryDatabaseId: "1",
        repositoryFullName: "Canonical/Repository",
        defaultBranch: {
          state: "ready",
          name: "main",
          headSha: "sha-0",
          checkState: "success",
        },
        openPullRequestCount: 37,
      },
    ]);
  });

  it.each([
    [null, "none"],
    ["ERROR", "failure"],
    ["FAILURE", "failure"],
    ["EXPECTED", "running"],
    ["PENDING", "running"],
  ])("maps a %s rollup to %s", async (rollupState, expectedCheckState) => {
    const node = makeRepositoryNode(0);

    const [summary] = await collectGitHubRepositorySummaries({
      repositories: makeInputs(1),
      requestGraphqlPartial: makeRequest({
        nodes: [
          {
            ...node,
            defaultBranchRef: {
              ...node.defaultBranchRef,
              target: {
                ...node.defaultBranchRef.target,
                statusCheckRollup: rollupState === null ? null : { state: rollupState },
              },
            },
          },
        ],
      }),
    });

    expect(summary).toMatchObject({
      defaultBranch: { state: "ready", checkState: expectedCheckState },
    });
  });

  it("keeps an available repository whose default branch is absent", async () => {
    const node = makeRepositoryNode(0);

    await expect(
      collectGitHubRepositorySummaries({
        repositories: makeInputs(1),
        requestGraphqlPartial: makeRequest({
          nodes: [{ ...node, defaultBranchRef: null }],
        }),
      }),
    ).resolves.toMatchObject([
      {
        state: "ready",
        defaultBranch: {
          state: "unavailable",
          reason: "repository_has_no_default_branch",
        },
      },
    ]);
  });

  it("keeps valid siblings when one exact nodes index is unavailable", async () => {
    await expect(
      collectGitHubRepositorySummaries({
        repositories: makeInputs(3),
        requestGraphqlPartial: makeRequest({
          nodes: [makeRepositoryNode(0), null, makeRepositoryNode(2)],
          errors: [
            {
              type: "NOT_FOUND",
              path: ["nodes", 1],
              message: "Could not resolve to a node.",
            },
          ],
        }),
      }),
    ).resolves.toMatchObject([
      { state: "ready", repositoryNodeId: "R_0" },
      { state: "unavailable", reason: "repository_unavailable" },
      { state: "ready", repositoryNodeId: "R_2" },
    ]);
  });

  it.each([
    {
      label: "wrong path",
      nodes: [null],
      errors: [{ type: "NOT_FOUND", path: ["node", 0], message: "Missing" }],
    },
    {
      label: "duplicate error",
      nodes: [null],
      errors: [
        { type: "NOT_FOUND", path: ["nodes", 0], message: "Missing" },
        { type: "NOT_FOUND", path: ["nodes", 0], message: "Still missing" },
      ],
    },
    {
      label: "error with a present node",
      nodes: [makeRepositoryNode(0)],
      errors: [{ type: "NOT_FOUND", path: ["nodes", 0], message: "Missing" }],
    },
    {
      label: "null without an error",
      nodes: [null],
      errors: [],
    },
    {
      label: "rate-limit error",
      nodes: [null],
      errors: [{ type: "RATE_LIMITED", message: "Rate limited" }],
    },
  ])("fails closed for a $label", async ({ nodes, errors }) => {
    await expect(
      collectGitHubRepositorySummaries({
        repositories: makeInputs(1),
        requestGraphqlPartial: makeRequest({ nodes, errors }),
      }),
    ).rejects.toThrow();
  });

  it("rejects a non-Repository node", async () => {
    await expect(
      collectGitHubRepositorySummaries({
        repositories: makeInputs(1),
        requestGraphqlPartial: makeRequest({
          nodes: [{ ...makeRepositoryNode(0), __typename: "Issue" }],
        }),
      }),
    ).rejects.toThrow();
  });

  it.each([
    { id: "R_other", databaseId: 1 },
    { id: "R_0", databaseId: 2 },
  ])("rejects a repository identity mismatch", async (identity) => {
    await expect(
      collectGitHubRepositorySummaries({
        repositories: makeInputs(1),
        requestGraphqlPartial: makeRequest({
          nodes: [{ ...makeRepositoryNode(0), ...identity }],
        }),
      }),
    ).rejects.toThrow("another repository");
  });

  it("rejects a default branch whose target is not a commit", async () => {
    const node = makeRepositoryNode(0);

    await expect(
      collectGitHubRepositorySummaries({
        repositories: makeInputs(1),
        requestGraphqlPartial: makeRequest({
          nodes: [
            {
              ...node,
              defaultBranchRef: {
                ...node.defaultBranchRef,
                target: {
                  __typename: "Tag",
                  oid: "tag-sha",
                },
              },
            },
          ],
        }),
      }),
    ).rejects.toThrow();
  });

  it("rejects malformed rate accounting", async () => {
    await expect(
      collectGitHubRepositorySummaries({
        repositories: makeInputs(1),
        requestGraphqlPartial: makeRequest({
          nodes: [makeRepositoryNode(0)],
          rateLimit: { ...RATE_LIMIT, cost: -1 },
        }),
      }),
    ).rejects.toThrow();
  });
});
