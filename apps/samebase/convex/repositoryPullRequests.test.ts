import { describe, expect, it } from "vite-plus/test";

import type { Id } from "./_generated/dataModel";
import {
  normalizeGitHubPullRequestPage,
  normalizeGitHubVaultSidebarSummaries,
  recoverGitHubVaultSidebarSummariesFromError,
  vaultSidebarSummaryBatches,
} from "./repositoryPullRequests";

function fakeVaultId(): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this provider boundary
  // test only needs a stable vault identity.
  return "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function providerPage() {
  return {
    repository: {
      id: "R_base",
      databaseId: 123,
      nameWithOwner: "samebase/samebase",
      defaultBranch: {
        name: "main",
        target: {
          __typename: "Commit",
          oid: "main123",
          messageHeadline: "Keep the workspace model explicit",
          committedDate: "2026-07-21T09:30:00Z",
          url: "https://github.com/samebase/samebase/commit/main123",
          statusCheckRollup: {
            contexts: {
              totalCount: 1,
              checkRunCount: 1,
              statusContextCount: 0,
              checkRunCountsByState: [{ state: "SUCCESS", count: 1 }],
              statusContextCountsByState: [],
              nodes: [
                {
                  __typename: "CheckRun",
                  name: "main checks (24.x)",
                  status: "COMPLETED",
                  conclusion: "SUCCESS",
                  detailsUrl: "https://github.com/samebase/samebase/actions/runs/2/job/1",
                  title: null,
                },
              ],
            },
          },
        },
      },
      pullRequests: {
        totalCount: 1,
        pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
        nodes: [
          {
            id: "PR_1",
            number: 1,
            title: "Keep provider truth",
            url: "https://github.com/samebase/samebase/pull/1",
            isDraft: false,
            isCrossRepository: false,
            additions: 4,
            deletions: 2,
            changedFiles: 3,
            updatedAt: "2026-07-21T10:00:00Z",
            baseRefName: "main",
            headRefName: "feature/provider-truth",
            headRefOid: "abc123",
            headRepository: {
              id: "R_base",
              nameWithOwner: "samebase/samebase",
              owner: { login: "samebase" },
            },
            labels: {
              totalCount: 1,
              nodes: [{ name: "product", color: "1a7f37" }],
            },
            commits: {
              nodes: [
                {
                  commit: {
                    oid: "abc123",
                    statusCheckRollup: {
                      contexts: {
                        totalCount: 2,
                        checkRunCount: 1,
                        statusContextCount: 1,
                        checkRunCountsByState: [{ state: "SUCCESS", count: 1 }],
                        statusContextCountsByState: [{ state: "SUCCESS", count: 1 }],
                        nodes: [
                          {
                            __typename: "CheckRun",
                            name: "checks (24.x)",
                            status: "COMPLETED",
                            conclusion: "SUCCESS",
                            detailsUrl: "https://github.com/samebase/samebase/actions/runs/1/job/1",
                            title: null,
                          },
                          {
                            __typename: "StatusContext",
                            context: "Cloudflare Workers",
                            state: "SUCCESS",
                            targetUrl: "https://dash.cloudflare.com/builds/1",
                            description: "Build succeeded",
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  };
}

describe("normalizeGitHubPullRequestPage", () => {
  it("keeps the provider page and cursor shape", () => {
    expect(normalizeGitHubPullRequestPage(providerPage())).toEqual({
      repository: {
        id: "R_base",
        databaseId: 123,
        nameWithOwner: "samebase/samebase",
        defaultBranch: {
          name: "main",
          headCommitOid: "main123",
          headCommitTitle: "Keep the workspace model explicit",
          headCommitCommittedAt: "2026-07-21T09:30:00Z",
          headCommitUrl: "https://github.com/samebase/samebase/commit/main123",
          statusCheckRollup: expect.objectContaining({
            contexts: expect.objectContaining({
              nodes: [expect.objectContaining({ name: "main checks (24.x)" })],
            }),
          }),
        },
        pullRequests: {
          totalCount: 1,
          pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
          nodes: [
            expect.objectContaining({
              id: "PR_1",
              number: 1,
              headRefName: "feature/provider-truth",
              headRefOid: "abc123",
              labels: { nodes: [{ name: "product", color: "1a7f37" }] },
              statusCheckRollup: expect.objectContaining({
                contexts: expect.any(Object),
              }),
            }),
          ],
        },
      },
    });
  });

  it("normalizes future GitHub check enums without rejecting the page", () => {
    const value = providerPage();
    const rollup = value.repository.pullRequests.nodes[0].commits.nodes[0].commit.statusCheckRollup;
    rollup.contexts.totalCount = 2;
    rollup.contexts.statusContextCount = 1;
    rollup.contexts.checkRunCountsByState = [{ state: "FUTURE_CHECK_RUN_STATE", count: 1 }];
    rollup.contexts.statusContextCountsByState = [
      { state: "FUTURE_STATUS_CONTEXT_STATE", count: 1 },
    ];

    expect(
      normalizeGitHubPullRequestPage(value).repository?.pullRequests.nodes[0].statusCheckRollup,
    ).toEqual({
      contexts: {
        totalCount: 2,
        checkRunCount: 1,
        statusContextCount: 1,
        checkRunCountsByState: [{ state: "UNKNOWN", count: 1 }],
        statusContextCountsByState: [{ state: "UNKNOWN", count: 1 }],
        nodes: [
          {
            kind: "check_run",
            name: "checks (24.x)",
            status: "COMPLETED",
            conclusion: "SUCCESS",
            detailsUrl: "https://github.com/samebase/samebase/actions/runs/1/job/1",
            title: null,
          },
          {
            kind: "status_context",
            context: "Cloudflare Workers",
            state: "SUCCESS",
            targetUrl: "https://dash.cloudflare.com/builds/1",
            description: "Build succeeded",
          },
        ],
      },
    });
  });

  it("normalizes individual check states that GitHub adds in the future", () => {
    const value = providerPage();
    const nodes =
      value.repository.pullRequests.nodes[0].commits.nodes[0].commit.statusCheckRollup.contexts
        .nodes;
    nodes[0].status = "FUTURE_CHECK_STATUS";
    nodes[0].conclusion = "FUTURE_CHECK_CONCLUSION";
    nodes[1].state = "FUTURE_STATUS_CONTEXT_STATE";

    expect(
      normalizeGitHubPullRequestPage(value).repository?.pullRequests.nodes[0].statusCheckRollup
        ?.contexts.nodes,
    ).toEqual([
      expect.objectContaining({
        kind: "check_run",
        status: "UNKNOWN",
        conclusion: "UNKNOWN",
      }),
      expect.objectContaining({ kind: "status_context", state: "UNKNOWN" }),
    ]);
  });

  it("preserves a missing exact default branch ref without dropping pull requests", () => {
    const value = providerPage();

    const repository = normalizeGitHubPullRequestPage({
      repository: { ...value.repository, defaultBranch: null },
    }).repository;
    expect(repository?.defaultBranch).toBeNull();
    expect(repository?.pullRequests.nodes).toHaveLength(1);
  });

  it("preserves GitHub's null repository result", () => {
    expect(normalizeGitHubPullRequestPage({ repository: null })).toEqual({ repository: null });
  });

  it("rejects a latest commit from another head generation", () => {
    const value = providerPage();
    value.repository.pullRequests.nodes[0].commits.nodes[0].commit.oid = "new-head";
    expect(() => normalizeGitHubPullRequestPage(value)).toThrow(
      "GitHub did not return the pull request head commit.",
    );
  });

  it("rejects inconsistent grouped check counts at the provider boundary", () => {
    const value = providerPage();
    value.repository.pullRequests.nodes[0].commits.nodes[0].commit.statusCheckRollup.contexts.checkRunCountsByState =
      [];

    expect(() => normalizeGitHubPullRequestPage(value)).toThrow(
      "GitHub returned inconsistent check counts.",
    );
  });

  it("rejects an incomplete label page at the provider boundary", () => {
    const value = providerPage();
    value.repository.pullRequests.nodes[0].labels.totalCount = 2;

    expect(() => normalizeGitHubPullRequestPage(value)).toThrow(
      "GitHub returned incomplete pull request labels.",
    );
  });
});

describe("normalizeGitHubVaultSidebarSummaries", () => {
  const repository = {
    vaultId: fakeVaultId(),
    ghRepoId: "123",
    owner: "samebase",
    name: "samebase",
    defaultBranch: "main",
  };

  it("keeps only main check counts", () => {
    expect(
      normalizeGitHubVaultSidebarSummaries(
        {
          repository0: {
            databaseId: 123,
            defaultBranch: {
              name: "main",
              target: {
                __typename: "Commit",
                statusCheckRollup: {
                  contexts: {
                    totalCount: 2,
                    checkRunCount: 1,
                    statusContextCount: 1,
                    checkRunCountsByState: [{ state: "SUCCESS", count: 1 }],
                    statusContextCountsByState: [{ state: "SUCCESS", count: 1 }],
                  },
                },
              },
            },
          },
        },
        [repository],
      ),
    ).toEqual([
      {
        vaultId: repository.vaultId,
        repository: {
          statusCheckRollup: {
            contexts: {
              totalCount: 2,
              checkRunCount: 1,
              statusContextCount: 1,
              checkRunCountsByState: [{ state: "SUCCESS", count: 1 }],
              statusContextCountsByState: [{ state: "SUCCESS", count: 1 }],
            },
          },
        },
      },
    ]);
  });

  it("marks a repository unavailable when GitHub returns another identity", () => {
    expect(
      normalizeGitHubVaultSidebarSummaries(
        {
          repository0: {
            databaseId: 456,
            defaultBranch: null,
          },
        },
        [repository],
      ),
    ).toEqual([{ vaultId: repository.vaultId, repository: null }]);
  });
});

describe("recoverGitHubVaultSidebarSummariesFromError", () => {
  const repositories = [
    {
      vaultId: fakeVaultId(),
      ghRepoId: "123",
      owner: "samebase",
      name: "samebase",
      defaultBranch: "main",
    },
    {
      vaultId: fakeVaultId(),
      ghRepoId: "456",
      owner: "samebase",
      name: "deleted-repository",
      defaultBranch: "main",
    },
  ];

  it("keeps partial sidebar data when one requested repository is missing", () => {
    const data = {
      repository0: {
        databaseId: 123,
        defaultBranch: null,
      },
      repository1: null,
    };

    expect(
      recoverGitHubVaultSidebarSummariesFromError(
        {
          name: "GraphqlResponseError",
          errors: [
            {
              type: "NOT_FOUND",
              path: ["repository1"],
            },
          ],
          data,
        },
        repositories,
      ),
    ).toBe(data);
  });

  it("rethrows provider errors that are not missing requested repositories", () => {
    const error = {
      name: "GraphqlResponseError",
      errors: [
        {
          type: "FORBIDDEN",
          path: ["repository0"],
        },
      ],
      data: {},
    };

    expect(() => recoverGitHubVaultSidebarSummariesFromError(error, repositories)).toThrow(error);
  });

  it("rethrows a missing-repository error for an alias outside the request", () => {
    const error = {
      name: "GraphqlResponseError",
      errors: [
        {
          type: "NOT_FOUND",
          path: ["repository2"],
        },
      ],
      data: {},
    };

    expect(() => recoverGitHubVaultSidebarSummariesFromError(error, repositories)).toThrow(error);
  });
});

describe("vaultSidebarSummaryBatches", () => {
  it("separates GitHub owners while bounding each query and preserving order", () => {
    const repositories = Array.from({ length: 41 }, (_, index) => ({
      vaultId: fakeVaultId(),
      ghRepoId: String(1_000 + index),
      owner: index < 21 ? "owner-a" : "owner-b",
      name: `repository-${index}`,
      defaultBranch: index % 2 === 0 ? "main" : "trunk",
    }));

    const batches = vaultSidebarSummaryBatches(repositories);

    expect(batches.map((batch) => batch.length)).toEqual([20, 1, 20]);
    expect(batches.flat()).toEqual(repositories);
  });
});
