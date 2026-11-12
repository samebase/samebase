import { describe, expect, it } from "vite-plus/test";

import type { Id } from "./_generated/dataModel";
import { summarizeRepositoryChecks } from "./repository/pullRequestModel";
import {
  normalizeGitHubPullRequestPage,
  normalizeGitHubRepositorySidebarSummaries,
  recoverGitHubRepositorySidebarSummariesFromError,
  repositorySidebarSummaryBatches,
} from "./repositoryPullRequests";

function fakeRepositoryId(): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; this provider boundary
  // test only needs a stable repository identity.
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
          message:
            "Keep the workspace model explicit so the repository page shows every stack and check\n\nThe body is not part of the title.",
          committedDate: "2026-07-21T09:30:00Z",
          url: "https://github.com/samebase/samebase/commit/main123",
          statusCheckRollup: {
            contexts: {
              pageInfo: { hasNextPage: false },
              nodes: [
                {
                  __typename: "CheckRun",
                  name: "main checks (24.x)",
                  status: "COMPLETED",
                  conclusion: "SUCCESS",
                  detailsUrl: "https://github.com/samebase/samebase/actions/runs/2/job/1",
                  title: null,
                  startedAt: "2026-07-21T09:31:00Z",
                  checkSuite: { workflowRun: { workflow: { name: "CI" } } },
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
                        pageInfo: { hasNextPage: false },
                        nodes: [
                          {
                            __typename: "CheckRun",
                            name: "checks (24.x)",
                            status: "COMPLETED",
                            conclusion: "SUCCESS",
                            detailsUrl: "https://github.com/samebase/samebase/actions/runs/1/job/1",
                            title: null,
                            startedAt: "2026-07-21T10:01:00Z",
                            checkSuite: { workflowRun: { workflow: { name: "CI" } } },
                          },
                          {
                            __typename: "StatusContext",
                            context: "Cloudflare Workers",
                            state: "SUCCESS",
                            targetUrl: "https://dash.cloudflare.com/builds/1",
                            description: "Build succeeded",
                            createdAt: "2026-07-21T10:02:00Z",
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

/** The provider page with other check runs on the pull request head commit. */
function providerPageWithChecks(nodes: readonly unknown[]) {
  const page = providerPage();
  const pullRequest = page.repository.pullRequests.nodes[0];
  const commit = pullRequest.commits.nodes[0].commit;
  return {
    repository: {
      ...page.repository,
      pullRequests: {
        ...page.repository.pullRequests,
        nodes: [
          {
            ...pullRequest,
            commits: {
              nodes: [
                {
                  commit: {
                    ...commit,
                    statusCheckRollup: { contexts: { pageInfo: { hasNextPage: false }, nodes } },
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

function pullRequestChecksOf(value: unknown) {
  return normalizeGitHubPullRequestPage(value).repository?.pullRequests.nodes[0].statusCheckRollup;
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
          headCommitTitle:
            "Keep the workspace model explicit so the repository page shows every stack and check",
          headCommitCommittedAt: "2026-07-21T09:30:00Z",
          headCommitUrl: "https://github.com/samebase/samebase/commit/main123",
          statusCheckRollup: {
            complete: true,
            checks: [expect.objectContaining({ name: "main checks (24.x)" })],
          },
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
              statusCheckRollup: {
                complete: true,
                checks: [
                  expect.objectContaining({ name: "checks (24.x)" }),
                  expect.objectContaining({ context: "Cloudflare Workers" }),
                ],
              },
            }),
          ],
        },
      },
    });
  });

  it("keeps the newest run of each check, as GitHub, gh, and T3 Code count them", () => {
    // Runs of PR 1915 in samebase/samebase, read on 2026-11-06. The title edit after the PR opened
    // started a second `pr build label` run, which cancelled the first one. GitHub reported the
    // commit as SUCCESS, and the dashboard showed 1 failed check.
    const run = (args: {
      workflow: string;
      name: string;
      conclusion: string;
      startedAt: string;
      job: number;
    }) => ({
      __typename: "CheckRun",
      name: args.name,
      status: "COMPLETED",
      conclusion: args.conclusion,
      detailsUrl: `https://github.com/samebase/samebase/actions/runs/1/job/${args.job}`,
      title: null,
      startedAt: args.startedAt,
      checkSuite: { workflowRun: { workflow: { name: args.workflow } } },
    });
    const rollup = pullRequestChecksOf(
      providerPageWithChecks([
        run({
          workflow: "PR title",
          name: "pr build label",
          conclusion: "CANCELLED",
          startedAt: "2026-11-06T13:56:07Z",
          job: 127931488253,
        }),
        run({
          workflow: "Alchemy",
          name: "Destroy the preview",
          conclusion: "SKIPPED",
          startedAt: "2026-11-06T13:56:07Z",
          job: 127931488254,
        }),
        run({
          workflow: "PR title",
          name: "pr build label",
          conclusion: "SUCCESS",
          startedAt: "2026-11-06T13:56:11Z",
          job: 127931499461,
        }),
        run({
          workflow: "Alchemy",
          name: "Deploy the preview",
          conclusion: "SUCCESS",
          startedAt: "2026-11-06T13:56:34Z",
          job: 127931499462,
        }),
        run({
          workflow: "Alchemy",
          name: "Sidebars example / Destroy the preview",
          conclusion: "SKIPPED",
          startedAt: "2026-11-06T13:56:07Z",
          job: 127931499463,
        }),
        run({
          workflow: "Alchemy",
          name: "Destroy the preview",
          conclusion: "SUCCESS",
          startedAt: "2026-11-06T14:01:49Z",
          job: 127931499464,
        }),
      ]),
    );
    expect(
      rollup?.checks.map((check) =>
        check.kind === "check_run" ? [check.name, check.conclusion] : [check.context, check.state],
      ),
    ).toEqual([
      ["pr build label", "SUCCESS"],
      ["Destroy the preview", "SUCCESS"],
      ["Deploy the preview", "SUCCESS"],
      ["Sidebars example / Destroy the preview", "SKIPPED"],
    ]);
    expect(summarizeRepositoryChecks(rollup ?? null)).toMatchObject({
      state: "success",
      totalCount: 4,
      failureCount: 0,
    });
  });

  it("keeps same-named checks of two workflows apart and names their workflows", () => {
    const nodes =
      providerPage().repository.pullRequests.nodes[0].commits.nodes[0].commit.statusCheckRollup
        .contexts.nodes;
    const rollup = pullRequestChecksOf(
      providerPageWithChecks([
        ...nodes,
        {
          ...nodes[0],
          conclusion: "FAILURE",
          checkSuite: { workflowRun: { workflow: { name: "Release" } } },
        },
      ]),
    );

    expect(
      rollup?.checks.map((check) => (check.kind === "check_run" ? check.name : check.context)),
    ).toEqual(["CI / checks (24.x)", "Cloudflare Workers", "Release / checks (24.x)"]);
  });

  it("keeps a finished run over a newer run that has not started", () => {
    const nodes =
      providerPage().repository.pullRequests.nodes[0].commits.nodes[0].commit.statusCheckRollup
        .contexts.nodes;
    const rollup = pullRequestChecksOf(
      providerPageWithChecks([
        ...nodes,
        { ...nodes[0], status: "QUEUED", conclusion: null, startedAt: null },
      ]),
    );

    expect(rollup?.checks[0]).toMatchObject({ name: "checks (24.x)", conclusion: "SUCCESS" });
  });

  it("says when GitHub has more check runs than the read lists", () => {
    const value = providerPage();
    value.repository.pullRequests.nodes[0].commits.nodes[0].commit.statusCheckRollup.contexts.pageInfo.hasNextPage = true;

    expect(pullRequestChecksOf(value)?.complete).toBe(false);
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
        ?.checks,
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

  it("rejects an incomplete label page at the provider boundary", () => {
    const value = providerPage();
    value.repository.pullRequests.nodes[0].labels.totalCount = 2;

    expect(() => normalizeGitHubPullRequestPage(value)).toThrow(
      "GitHub returned incomplete pull request labels.",
    );
  });
});

describe("normalizeGitHubRepositorySidebarSummaries", () => {
  const repository = {
    repositoryId: fakeRepositoryId(),
    githubRepositoryDatabaseId: "123",
    githubOwnerLogin: "samebase",
    githubRepositoryName: "samebase",
    defaultBranch: "main",
  };

  it("keeps the main checks and the open pull request total", () => {
    expect(
      normalizeGitHubRepositorySidebarSummaries(
        {
          repository0: {
            databaseId: 123,
            defaultBranch: {
              name: "main",
              target: {
                __typename: "Commit",
                statusCheckRollup: providerPage().repository.defaultBranch.target.statusCheckRollup,
              },
            },
            pullRequests: { totalCount: 7 },
          },
        },
        [repository],
      ),
    ).toEqual([
      {
        repositoryId: repository.repositoryId,
        repository: {
          openPullRequestCount: 7,
          statusCheckRollup: {
            complete: true,
            checks: [expect.objectContaining({ name: "main checks (24.x)" })],
          },
        },
      },
    ]);
  });

  it("marks a repository unavailable when GitHub returns another identity", () => {
    expect(
      normalizeGitHubRepositorySidebarSummaries(
        {
          repository0: {
            databaseId: 456,
            defaultBranch: null,
            pullRequests: { totalCount: 0 },
          },
        },
        [repository],
      ),
    ).toEqual([{ repositoryId: repository.repositoryId, repository: null }]);
  });
});

describe("recoverGitHubRepositorySidebarSummariesFromError", () => {
  const repositories = [
    {
      repositoryId: fakeRepositoryId(),
      githubRepositoryDatabaseId: "123",
      githubOwnerLogin: "samebase",
      githubRepositoryName: "samebase",
      defaultBranch: "main",
    },
    {
      repositoryId: fakeRepositoryId(),
      githubRepositoryDatabaseId: "456",
      githubOwnerLogin: "samebase",
      githubRepositoryName: "deleted-repository",
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
      recoverGitHubRepositorySidebarSummariesFromError(
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

    expect(() => recoverGitHubRepositorySidebarSummariesFromError(error, repositories)).toThrow(
      error,
    );
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

    expect(() => recoverGitHubRepositorySidebarSummariesFromError(error, repositories)).toThrow(
      error,
    );
  });
});

describe("repositorySidebarSummaryBatches", () => {
  it("separates GitHub owners while bounding each query and preserving order", () => {
    const repositories = Array.from({ length: 41 }, (_, index) => ({
      repositoryId: fakeRepositoryId(),
      githubRepositoryDatabaseId: String(1_000 + index),
      githubOwnerLogin: index < 21 ? "owner-a" : "owner-b",
      githubRepositoryName: `repository-${index}`,
      defaultBranch: index % 2 === 0 ? "main" : "trunk",
    }));

    const batches = repositorySidebarSummaryBatches(repositories);

    expect(batches.map((batch) => batch.length)).toEqual([20, 1, 20]);
    expect(batches.flat()).toEqual(repositories);
  });
});
