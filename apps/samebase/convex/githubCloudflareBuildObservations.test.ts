import { describe, expect, it, vi } from "vite-plus/test";

import {
  fetchGitHubCloudflareBuildObservations,
  type GitHubCloudflareBuildGraphqlRequest,
} from "./githubCloudflareBuildObservations";
import type { PullRequestHeadIdentity } from "./repositoryObservations";

const repository = {
  id: "repository-base",
  databaseId: 42,
  nameWithOwner: "samebase/fixture",
};

function makeHead(
  suffix: string,
  overrides: Partial<PullRequestHeadIdentity> = {},
): PullRequestHeadIdentity {
  return {
    baseRepositoryNodeId: "repository-base",
    pullRequestNodeId: `pull-request-${suffix}`,
    headRepositoryNodeId: `repository-${suffix}`,
    headRefName: `feature-${suffix}`,
    headCommitNodeId: `commit-${suffix}`,
    headOid: `sha-${suffix}`,
    ...overrides,
  };
}

function makeCheckRun(id: string) {
  return {
    id,
    name: `Workers Builds: ${id}`,
    status: "COMPLETED",
    conclusion: "SUCCESS",
    summary: `Script: ${id}\nPreview URL: https://${id}.workers.dev`,
  };
}

function makeSuite(args: {
  id: string;
  branchName: string | null;
  checkRuns?: ReturnType<typeof makeCheckRun>[];
  checkRunTotalCount?: number;
  checkRunHasNextPage?: boolean;
}) {
  const checkRuns = args.checkRuns ?? [makeCheckRun(`worker-${args.id}`)];
  return {
    id: args.id,
    branch: args.branchName === null ? null : { name: args.branchName },
    checkRuns: {
      totalCount: args.checkRunTotalCount ?? checkRuns.length,
      pageInfo: {
        hasNextPage: args.checkRunHasNextPage ?? false,
        endCursor: args.checkRunHasNextPage ? "next-check-run" : null,
      },
      nodes: checkRuns,
    },
  };
}

function makeCommit(args: {
  head: PullRequestHeadIdentity;
  suites?: ReturnType<typeof makeSuite>[];
  suiteTotalCount?: number;
  suiteHasNextPage?: boolean;
  oid?: string;
  repositoryNodeId?: string;
}) {
  const suites = args.suites ?? [];
  return {
    __typename: "Commit",
    id: args.head.headCommitNodeId,
    oid: args.oid ?? args.head.headOid,
    repository: { id: args.repositoryNodeId ?? args.head.headRepositoryNodeId },
    checkSuites: {
      totalCount: args.suiteTotalCount ?? suites.length,
      pageInfo: {
        hasNextPage: args.suiteHasNextPage ?? false,
        endCursor: args.suiteHasNextPage ? "next-suite" : null,
      },
      nodes: suites,
    },
  };
}

function makePullRequest(args: {
  head: PullRequestHeadIdentity;
  state?: "OPEN" | "CLOSED" | "MERGED";
  repositoryNodeId?: string;
  headRefName?: string;
  headRefOid?: string;
  headRepositoryNodeId?: string | null;
  latestCommitNodeId?: string;
  latestCommitOid?: string;
  latestCommitRepositoryNodeId?: string;
}) {
  return {
    __typename: "PullRequest",
    id: args.head.pullRequestNodeId,
    state: args.state ?? "OPEN",
    repository: { id: args.repositoryNodeId ?? args.head.baseRepositoryNodeId },
    headRefName: args.headRefName ?? args.head.headRefName,
    headRefOid: args.headRefOid ?? args.head.headOid,
    headRepository:
      args.headRepositoryNodeId === null
        ? null
        : { id: args.headRepositoryNodeId ?? args.head.headRepositoryNodeId },
    commits: {
      nodes: [
        {
          commit: {
            id: args.latestCommitNodeId ?? args.head.headCommitNodeId,
            oid: args.latestCommitOid ?? args.head.headOid,
            repository: {
              id: args.latestCommitRepositoryNodeId ?? args.head.headRepositoryNodeId,
            },
          },
        },
      ],
    },
  };
}

function makeBatch(args: {
  heads: readonly PullRequestHeadIdentity[];
  commits: unknown[];
  pullRequests?: unknown[];
  repository?: typeof repository | null;
}) {
  return {
    repository: args.repository === undefined ? repository : args.repository,
    pullRequests: args.pullRequests ?? args.heads.map((head) => makePullRequest({ head })),
    commits: args.commits,
  };
}

function fetchObservations(args: {
  requestGraphql: GitHubCloudflareBuildGraphqlRequest;
  heads: readonly PullRequestHeadIdentity[];
  owner?: string;
  name?: string;
  expectedRepositoryDatabaseId?: string;
}) {
  return fetchGitHubCloudflareBuildObservations({
    requestGraphql: args.requestGraphql,
    owner: args.owner ?? "samebase",
    name: args.name ?? "fixture",
    expectedRepositoryDatabaseId: args.expectedRepositoryDatabaseId ?? "42",
    heads: args.heads,
  });
}

describe("fetchGitHubCloudflareBuildObservations", () => {
  it("uses one exact-head query and maps reordered commits back by node id", async () => {
    const alpha = makeHead("alpha");
    const beta = makeHead("beta");
    const requestGraphql = vi.fn<GitHubCloudflareBuildGraphqlRequest>(async (query, variables) => {
      expect(query).toContain("pullRequests: nodes(ids: $pullRequestIds)");
      expect(query).toContain("commits: nodes(ids: $commitIds)");
      expect(query).toContain("appId: 85455");
      expect(query).toContain("checkType: $checkRunType");
      expect(variables).toEqual({
        owner: "samebase",
        name: "fixture",
        pullRequestIds: [alpha.pullRequestNodeId, beta.pullRequestNodeId],
        commitIds: [alpha.headCommitNodeId, beta.headCommitNodeId],
        checkRunType: "LATEST",
      });
      return makeBatch({
        heads: [alpha, beta],
        pullRequests: [makePullRequest({ head: beta }), makePullRequest({ head: alpha })],
        commits: [
          makeCommit({
            head: beta,
            suites: [makeSuite({ id: "suite-beta", branchName: beta.headRefName })],
          }),
          makeCommit({
            head: alpha,
            suites: [makeSuite({ id: "suite-alpha", branchName: alpha.headRefName })],
          }),
        ],
      });
    });

    const result = await fetchObservations({
      requestGraphql,
      heads: [alpha, beta],
    });

    expect(requestGraphql).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      state: "complete",
      observations: [
        {
          state: "complete",
          head: alpha,
          checkRuns: [
            {
              suiteNodeId: "suite-alpha",
              checkRun: { branch: { state: "known", name: alpha.headRefName } },
            },
          ],
        },
        {
          state: "complete",
          head: beta,
          checkRuns: [
            {
              suiteNodeId: "suite-beta",
              checkRun: { branch: { state: "known", name: beta.headRefName } },
            },
          ],
        },
      ],
    });
  });

  it("rejects a forged base repository even when the commit exists", async () => {
    const head = makeHead("forged-base", { baseRepositoryNodeId: "forged-repository" });
    const result = await fetchObservations({
      requestGraphql: async () =>
        makeBatch({
          heads: [head],
          pullRequests: [makePullRequest({ head, repositoryNodeId: repository.id })],
          commits: [makeCommit({ head })],
        }),
      heads: [head],
    });

    expect(result).toEqual({
      state: "complete",
      observations: [{ state: "identity_mismatch", head }],
    });
  });

  it("rejects an arbitrary commit that is not the PR's latest head", async () => {
    const realHead = makeHead("real-head");
    const forgedHead = makeHead("arbitrary-commit", {
      baseRepositoryNodeId: realHead.baseRepositoryNodeId,
      pullRequestNodeId: realHead.pullRequestNodeId,
      headRefName: realHead.headRefName,
      headRepositoryNodeId: realHead.headRepositoryNodeId,
    });
    const result = await fetchObservations({
      requestGraphql: async () =>
        makeBatch({
          heads: [forgedHead],
          pullRequests: [makePullRequest({ head: realHead })],
          commits: [makeCommit({ head: forgedHead })],
        }),
      heads: [forgedHead],
    });

    expect(result).toEqual({
      state: "complete",
      observations: [{ state: "identity_mismatch", head: forgedHead }],
    });
  });

  it.each([
    {
      name: "closed PR",
      pullRequest: (head: PullRequestHeadIdentity) => makePullRequest({ head, state: "CLOSED" }),
    },
    {
      name: "updated PR",
      pullRequest: (head: PullRequestHeadIdentity) =>
        makePullRequest({
          head,
          headRefOid: "new-sha",
          latestCommitNodeId: "new-commit",
          latestCommitOid: "new-sha",
        }),
    },
  ])("rejects a $name that changed after the list observation", async ({ pullRequest }) => {
    const head = makeHead("changed-pr");
    const result = await fetchObservations({
      requestGraphql: async () =>
        makeBatch({
          heads: [head],
          pullRequests: [pullRequest(head)],
          commits: [makeCommit({ head })],
        }),
      heads: [head],
    });

    expect(result).toEqual({
      state: "complete",
      observations: [{ state: "identity_mismatch", head }],
    });
  });

  it("accepts a deleted head repository when GitHub still proves the latest commit", async () => {
    const head = makeHead("deleted-head");
    const result = await fetchObservations({
      requestGraphql: async () =>
        makeBatch({
          heads: [head],
          pullRequests: [makePullRequest({ head, headRepositoryNodeId: null })],
          commits: [makeCommit({ head })],
        }),
      heads: [head],
    });

    expect(result).toEqual({
      state: "complete",
      observations: [{ state: "complete", head, checkRuns: [] }],
    });
  });

  it("deduplicates a shared commit query while keeping branch evidence specific to each PR", async () => {
    const alpha = makeHead("alpha");
    const beta = makeHead("beta", {
      headCommitNodeId: alpha.headCommitNodeId,
      headOid: alpha.headOid,
      headRepositoryNodeId: alpha.headRepositoryNodeId,
    });
    const requestGraphql = vi.fn<GitHubCloudflareBuildGraphqlRequest>(async (_query, variables) => {
      expect(variables.commitIds).toEqual([alpha.headCommitNodeId]);
      return makeBatch({
        heads: [alpha, beta],
        commits: [
          makeCommit({
            head: alpha,
            suites: [
              makeSuite({ id: "suite-alpha", branchName: alpha.headRefName }),
              makeSuite({ id: "suite-beta", branchName: beta.headRefName }),
              makeSuite({ id: "suite-unknown", branchName: null }),
            ],
          }),
        ],
      });
    });

    const result = await fetchObservations({
      requestGraphql,
      heads: [alpha, beta],
    });

    expect(result).toMatchObject({
      state: "complete",
      observations: [
        {
          state: "complete",
          checkRuns: [
            { checkRun: { branch: { state: "known", name: alpha.headRefName } } },
            {
              checkRun: {
                branch: {
                  state: "conflicting_evidence",
                  suiteBranch: beta.headRefName,
                },
              },
            },
            { checkRun: { branch: { state: "unknown" } } },
          ],
        },
        {
          state: "complete",
          checkRuns: [
            {
              checkRun: {
                branch: {
                  state: "conflicting_evidence",
                  suiteBranch: alpha.headRefName,
                },
              },
            },
            { checkRun: { branch: { state: "known", name: beta.headRefName } } },
            { checkRun: { branch: { state: "unknown" } } },
          ],
        },
      ],
    });
  });

  it.each([
    {
      name: "suite pagination",
      commit: (head: PullRequestHeadIdentity) =>
        makeCommit({ head, suiteHasNextPage: true, suiteTotalCount: 1 }),
      reason: "check_suite_pagination",
    },
    {
      name: "suite count mismatch",
      commit: (head: PullRequestHeadIdentity) => makeCommit({ head, suiteTotalCount: 1 }),
      reason: "check_suite_pagination",
    },
    {
      name: "check run pagination",
      commit: (head: PullRequestHeadIdentity) =>
        makeCommit({
          head,
          suites: [
            makeSuite({
              id: "suite",
              branchName: head.headRefName,
              checkRunHasNextPage: true,
            }),
          ],
        }),
      reason: "check_run_pagination",
    },
    {
      name: "check run count mismatch",
      commit: (head: PullRequestHeadIdentity) =>
        makeCommit({
          head,
          suites: [
            makeSuite({
              id: "suite",
              branchName: head.headRefName,
              checkRunTotalCount: 2,
            }),
          ],
        }),
      reason: "check_run_pagination",
    },
  ])("does not report fresh absence for incomplete $name", async ({ commit, reason }) => {
    const head = makeHead("incomplete");
    const result = await fetchObservations({
      requestGraphql: async () => makeBatch({ heads: [head], commits: [commit(head)] }),
      heads: [head],
    });

    expect(result).toEqual({
      state: "complete",
      observations: [{ state: "incomplete", head, reason }],
    });
  });

  it("distinguishes complete absence from an unavailable head", async () => {
    const absent = makeHead("absent");
    const unavailable = makeHead("unavailable");
    const result = await fetchObservations({
      requestGraphql: async () =>
        makeBatch({
          heads: [unavailable, absent],
          pullRequests: [null, makePullRequest({ head: absent })],
          commits: [null, makeCommit({ head: absent })],
        }),
      heads: [unavailable, absent],
    });

    expect(result).toEqual({
      state: "complete",
      observations: [
        { state: "head_unavailable", head: unavailable },
        { state: "complete", head: absent, checkRuns: [] },
      ],
    });
  });

  it.each([
    {
      name: "commit oid",
      commit: (head: PullRequestHeadIdentity) => makeCommit({ head, oid: "different-sha" }),
    },
    {
      name: "head repository",
      commit: (head: PullRequestHeadIdentity) =>
        makeCommit({ head, repositoryNodeId: "different-repository" }),
    },
  ])("rejects a mismatched $name", async ({ commit }) => {
    const head = makeHead("mismatch");
    const result = await fetchObservations({
      requestGraphql: async () => makeBatch({ heads: [head], commits: [commit(head)] }),
      heads: [head],
    });

    expect(result).toEqual({
      state: "complete",
      observations: [{ state: "identity_mismatch", head }],
    });
  });

  it("rejects duplicate provider node identities", async () => {
    const head = makeHead("duplicate");
    const commit = makeCommit({ head });
    const result = await fetchObservations({
      requestGraphql: async () =>
        makeBatch({
          heads: [head, makeHead("second")],
          commits: [commit, commit],
        }),
      heads: [head, makeHead("second")],
    });

    expect(result).toEqual({ state: "invalid_response" });
  });

  it("returns rate limits and transport failures as explicit batch outcomes", async () => {
    const head = makeHead("transport");
    const limited = await fetchObservations({
      requestGraphql: async () => {
        throw Object.assign(new Error("limited"), {
          name: "GitHubGraphqlRateLimitError",
          retryAt: 1_800_000_000_000,
        });
      },
      heads: [head],
    });
    const failed = await fetchObservations({
      requestGraphql: async () => {
        throw new Error("network unavailable");
      },
      heads: [head],
    });
    const deferred = await fetchObservations({
      requestGraphql: async () => {
        throw Object.assign(new Error("cost guardrail"), {
          name: "GitHubGraphqlBudgetError",
        });
      },
      heads: [head],
    });

    expect(limited).toEqual({ state: "rate_limited", retryAt: 1_800_000_000_000 });
    expect(deferred).toEqual({ state: "budget_deferred" });
    expect(failed).toEqual({ state: "request_failed" });
  });

  it("rejects malformed or unexpected node responses", async () => {
    const head = makeHead("invalid");
    const malformed = await fetchObservations({
      requestGraphql: async () =>
        makeBatch({
          heads: [head],
          commits: [{ __typename: "Commit", id: head.headCommitNodeId }],
        }),
      heads: [head],
    });
    const unexpected = await fetchObservations({
      requestGraphql: async () =>
        makeBatch({
          heads: [head],
          commits: [makeCommit({ head: makeHead("unexpected") })],
        }),
      heads: [head],
    });

    expect(malformed).toEqual({ state: "invalid_response" });
    expect(unexpected).toEqual({ state: "invalid_response" });
  });

  it("enforces the 25-head request boundary without calling GitHub", async () => {
    const requestGraphql = vi.fn<GitHubCloudflareBuildGraphqlRequest>();
    const result = await fetchObservations({
      requestGraphql,
      heads: Array.from({ length: 26 }, (_value, index) => makeHead(String(index))),
    });

    expect(result).toEqual({ state: "invalid_request", reason: "too_many_heads" });
    expect(requestGraphql).not.toHaveBeenCalled();
  });
});
