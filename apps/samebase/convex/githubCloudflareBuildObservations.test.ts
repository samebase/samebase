import { describe, expect, it, vi } from "vite-plus/test";

import {
  fetchGitHubCloudflareBuildObservations,
  type GitHubCloudflareBuildGraphqlRequest,
} from "./githubCloudflareBuildObservations";
import type { PullRequestHeadIdentity } from "./repositoryObservations";

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

describe("fetchGitHubCloudflareBuildObservations", () => {
  it("uses one exact-head query and maps reordered commits back by node id", async () => {
    const alpha = makeHead("alpha");
    const beta = makeHead("beta");
    const requestGraphql = vi.fn<GitHubCloudflareBuildGraphqlRequest>(async (query, variables) => {
      expect(query).toContain("nodes(ids: $commitIds)");
      expect(query).toContain("appId: 85455");
      expect(query).toContain("checkType: $checkRunType");
      expect(variables).toEqual({
        commitIds: [alpha.headCommitNodeId, beta.headCommitNodeId],
        checkRunType: "LATEST",
      });
      return {
        nodes: [
          makeCommit({
            head: beta,
            suites: [makeSuite({ id: "suite-beta", branchName: beta.headRefName })],
          }),
          makeCommit({
            head: alpha,
            suites: [makeSuite({ id: "suite-alpha", branchName: alpha.headRefName })],
          }),
        ],
      };
    });

    const result = await fetchGitHubCloudflareBuildObservations({
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

  it("deduplicates a shared commit query while keeping branch evidence specific to each PR", async () => {
    const alpha = makeHead("alpha");
    const beta = makeHead("beta", {
      headCommitNodeId: alpha.headCommitNodeId,
      headOid: alpha.headOid,
      headRepositoryNodeId: alpha.headRepositoryNodeId,
    });
    const requestGraphql = vi.fn<GitHubCloudflareBuildGraphqlRequest>(async (_query, variables) => {
      expect(variables.commitIds).toEqual([alpha.headCommitNodeId]);
      return {
        nodes: [
          makeCommit({
            head: alpha,
            suites: [
              makeSuite({ id: "suite-alpha", branchName: alpha.headRefName }),
              makeSuite({ id: "suite-beta", branchName: beta.headRefName }),
              makeSuite({ id: "suite-unknown", branchName: null }),
            ],
          }),
        ],
      };
    });

    const result = await fetchGitHubCloudflareBuildObservations({
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
    const result = await fetchGitHubCloudflareBuildObservations({
      requestGraphql: async () => ({ nodes: [commit(head)] }),
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
    const result = await fetchGitHubCloudflareBuildObservations({
      requestGraphql: async () => ({ nodes: [null, makeCommit({ head: absent })] }),
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
    const result = await fetchGitHubCloudflareBuildObservations({
      requestGraphql: async () => ({ nodes: [commit(head)] }),
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
    const result = await fetchGitHubCloudflareBuildObservations({
      requestGraphql: async () => ({ nodes: [commit, commit] }),
      heads: [head, makeHead("second")],
    });

    expect(result).toEqual({ state: "invalid_response" });
  });

  it("returns rate limits and transport failures as explicit batch outcomes", async () => {
    const head = makeHead("transport");
    const limited = await fetchGitHubCloudflareBuildObservations({
      requestGraphql: async () => {
        throw Object.assign(new Error("limited"), {
          name: "GitHubGraphqlRateLimitError",
          retryAt: 1_800_000_000_000,
        });
      },
      heads: [head],
    });
    const failed = await fetchGitHubCloudflareBuildObservations({
      requestGraphql: async () => {
        throw new Error("network unavailable");
      },
      heads: [head],
    });

    expect(limited).toEqual({ state: "rate_limited", retryAt: 1_800_000_000_000 });
    expect(failed).toEqual({ state: "request_failed" });
  });

  it("rejects malformed or unexpected node responses", async () => {
    const head = makeHead("invalid");
    const malformed = await fetchGitHubCloudflareBuildObservations({
      requestGraphql: async () => ({
        nodes: [{ __typename: "Commit", id: head.headCommitNodeId }],
      }),
      heads: [head],
    });
    const unexpected = await fetchGitHubCloudflareBuildObservations({
      requestGraphql: async () => ({
        nodes: [makeCommit({ head: makeHead("unexpected") })],
      }),
      heads: [head],
    });

    expect(malformed).toEqual({ state: "invalid_response" });
    expect(unexpected).toEqual({ state: "invalid_response" });
  });

  it("enforces the 25-head request boundary without calling GitHub", async () => {
    const requestGraphql = vi.fn<GitHubCloudflareBuildGraphqlRequest>();
    const result = await fetchGitHubCloudflareBuildObservations({
      requestGraphql,
      heads: Array.from({ length: 26 }, (_value, index) => makeHead(String(index))),
    });

    expect(result).toEqual({ state: "invalid_request", reason: "too_many_heads" });
    expect(requestGraphql).not.toHaveBeenCalled();
  });
});
