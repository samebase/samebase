import { z } from "zod";
import { describe, expect, it } from "vite-plus/test";

import { fetchGitHubPullRequestPage } from "./githubPullRequests";

const requestBodySchema = z.object({
  query: z.string(),
  variables: z.record(z.string(), z.unknown()),
});

function rateLimit(cost = 1) {
  return {
    cost,
    limit: 5_000,
    remaining: 4_000,
    resetAt: "2026-07-17T12:00:00.000Z",
  };
}

function checks(args?: { totalCount?: number; nullRollup?: boolean }) {
  if (args?.nullRollup) {
    return null;
  }
  const totalCount = args?.totalCount ?? 1;
  return {
    state: "SUCCESS",
    contexts: {
      totalCount,
      checkRunCount: totalCount,
      statusContextCount: 0,
      checkRunCountsByState: [{ state: "SUCCESS", count: totalCount }],
      statusContextCountsByState: [],
    },
  };
}

function pullRequest(
  number: number,
  args?: {
    draft?: boolean;
    labels?: Array<{ name: string; color: string }>;
    labelTotalCount?: number;
    labelHasNextPage?: boolean;
    labelEndCursor?: string | null;
    headRefOid?: string;
    commitOid?: string;
    commitRepositoryNodeId?: string;
    totalCheckCount?: number;
    nullRollup?: boolean;
  },
) {
  const headRefOid = args?.headRefOid ?? `sha-${number}`;
  const labels = args?.labels ?? [{ name: "ready", color: "00ff00" }];
  return {
    id: `PR_${number}`,
    number,
    title: `Pull request ${number}`,
    url: `https://github.com/samebase/samebase/pull/${number}`,
    isDraft: args?.draft ?? false,
    isCrossRepository: false,
    additions: number,
    deletions: number + 1,
    changedFiles: number + 2,
    updatedAt: `2026-07-${String((number % 27) + 1).padStart(2, "0")}T12:00:00Z`,
    baseRefName: "main",
    headRefName: `feature-${number}`,
    headRefOid,
    headRepository: {
      id: "R_repo",
      nameWithOwner: "samebase/samebase",
      owner: { login: "samebase" },
    },
    labels: {
      totalCount: args?.labelTotalCount ?? labels.length,
      pageInfo: {
        hasNextPage: args?.labelHasNextPage ?? false,
        endCursor: args?.labelEndCursor ?? null,
      },
      nodes: labels,
    },
    commits: {
      nodes: [
        {
          commit: {
            id: `C_${number}`,
            oid: args?.commitOid ?? headRefOid,
            repository: { id: args?.commitRepositoryNodeId ?? "R_repo" },
            statusCheckRollup: checks({
              totalCount: args?.totalCheckCount,
              nullRollup: args?.nullRollup,
            }),
          },
        },
      ],
    },
  };
}

function page(args: {
  nodes: ReturnType<typeof pullRequest>[];
  totalCount: number;
  hasNextPage: boolean;
  endCursor: string | null;
  databaseId?: number;
  repositoryNodeId?: string;
  defaultBranchRepositoryNodeId?: string;
}) {
  const repositoryNodeId = args.repositoryNodeId ?? "R_repo";
  return {
    data: {
      repository: {
        id: repositoryNodeId,
        databaseId: args.databaseId ?? 42,
        nameWithOwner: "samebase/samebase",
        defaultBranchRef: {
          name: "main",
          target: {
            __typename: "Commit",
            id: "C_main",
            oid: "sha-main",
            repository: { id: args.defaultBranchRepositoryNodeId ?? repositoryNodeId },
            statusCheckRollup: checks(),
          },
        },
        pullRequests: {
          totalCount: args.totalCount,
          pageInfo: {
            hasNextPage: args.hasNextPage,
            endCursor: args.endCursor,
          },
          nodes: args.nodes,
        },
      },
      rateLimit: rateLimit(),
    },
  };
}

function responseQueue(payloads: unknown[]): {
  fetchImpl: typeof fetch;
  requests: () => Array<z.infer<typeof requestBodySchema>>;
} {
  const queue = [...payloads];
  const requests: Array<z.infer<typeof requestBodySchema>> = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const payload = queue.shift();
    if (payload === undefined) {
      throw new Error("Unexpected GitHub GraphQL request.");
    }
    if (typeof init?.body !== "string") {
      throw new Error("Expected a JSON GraphQL request body.");
    }
    requests.push(requestBodySchema.parse(JSON.parse(init.body)));
    return new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
    });
  };
  return { fetchImpl, requests: () => requests };
}

const defaultArgs = {
  credential: "token",
  owner: "samebase",
  name: "samebase",
  expectedRepositoryDatabaseId: "42",
  cursor: null,
  pageSize: 25,
  filters: {
    hiddenLabels: [],
    includeDrafts: true,
    includeNoLabel: true,
  },
};

describe("fetchGitHubPullRequestPage", () => {
  it("paginates 51 pull requests without collecting the whole repository", async () => {
    const all = Array.from({ length: 51 }, (_, index) => pullRequest(51 - index));
    const queue = responseQueue([
      page({ nodes: all.slice(0, 25), totalCount: 51, hasNextPage: true, endCursor: "c25" }),
      page({ nodes: all.slice(25, 50), totalCount: 51, hasNextPage: true, endCursor: "c50" }),
      page({ nodes: all.slice(50), totalCount: 51, hasNextPage: false, endCursor: null }),
    ]);

    const first = await fetchGitHubPullRequestPage({ ...defaultArgs, fetchImpl: queue.fetchImpl });
    expect(first.pullRequests).toHaveLength(25);
    expect(first.defaultBranch).toMatchObject({
      name: "main",
      headCommit: { nodeId: "C_main", sha: "sha-main", repositoryNodeId: "R_repo" },
    });
    expect(first.continuation).toEqual({ kind: "next_page", cursor: "c25" });
    const second = await fetchGitHubPullRequestPage({
      ...defaultArgs,
      cursor: "c25",
      fetchImpl: queue.fetchImpl,
    });
    expect(second.pullRequests).toHaveLength(25);
    expect(second.continuation).toEqual({ kind: "next_page", cursor: "c50" });
    const third = await fetchGitHubPullRequestPage({
      ...defaultArgs,
      cursor: "c50",
      fetchImpl: queue.fetchImpl,
    });
    expect(third.pullRequests.map((pullRequest) => pullRequest.number)).toEqual([1]);
    expect(third.continuation).toEqual({ kind: "complete" });

    const queries = queue.requests().map((request) => request.query);
    expect(queries[0]).toContain("orderBy: { field: UPDATED_AT, direction: DESC }");
    expect(queries[0]).toContain("repository(owner: $owner, name: $name)");
    expect(queries[0]).toContain("defaultBranchRef");
    expect(queries[0]).toContain("contexts(first: 1)");
    expect(queue.requests().map((request) => request.variables.after)).toEqual([
      null,
      "c25",
      "c50",
    ]);
  });

  it("fills a display page by scanning bounded raw pages through all filters", async () => {
    const hidden = { name: "hidden", color: "ff0000" };
    const queue = responseQueue([
      page({
        nodes: [
          pullRequest(9, { labels: [hidden] }),
          pullRequest(8, { draft: true }),
          pullRequest(7),
        ],
        totalCount: 9,
        hasNextPage: true,
        endCursor: "c1",
      }),
      page({
        nodes: [pullRequest(6, { labels: [] }), pullRequest(5)],
        totalCount: 9,
        hasNextPage: true,
        endCursor: "c2",
      }),
      page({
        nodes: [pullRequest(4)],
        totalCount: 9,
        hasNextPage: true,
        endCursor: "c3",
      }),
    ]);

    const result = await fetchGitHubPullRequestPage({
      ...defaultArgs,
      pageSize: 3,
      filters: {
        hiddenLabels: ["hidden"],
        includeDrafts: false,
        includeNoLabel: false,
      },
      fetchImpl: queue.fetchImpl,
    });

    expect(result.pullRequests.map((pullRequest) => pullRequest.number)).toEqual([7, 5, 4]);
    expect(result.scannedPullRequestCount).toBe(6);
    expect(result.requestCount).toBe(3);
    expect(result.continuation).toEqual({ kind: "next_page", cursor: "c3" });
    expect(queue.requests().map((request) => request.variables.pageSize)).toEqual([3, 2, 1]);
  });

  it("returns an explicit scan guardrail when four raw pages cannot fill the display page", async () => {
    const hidden = { name: "hidden", color: "ff0000" };
    const queue = responseQueue(
      Array.from({ length: 4 }, (_, pageIndex) =>
        page({
          nodes: [
            pullRequest(pageIndex * 2 + 1, { labels: [hidden] }),
            pullRequest(pageIndex * 2 + 2, { labels: [hidden] }),
          ],
          totalCount: 20,
          hasNextPage: true,
          endCursor: `c${pageIndex + 1}`,
        }),
      ),
    );

    const result = await fetchGitHubPullRequestPage({
      ...defaultArgs,
      pageSize: 2,
      filters: { ...defaultArgs.filters, hiddenLabels: ["hidden"] },
      fetchImpl: queue.fetchImpl,
    });

    expect(result.pullRequests).toEqual([]);
    expect(result.scannedPullRequestCount).toBe(8);
    expect(result.continuation).toEqual({
      kind: "scan_guardrail",
      cursor: "c4",
      scannedProviderPages: 4,
    });
  });

  it("keeps aggregate counts for 101 checks without loading individual checks", async () => {
    const queue = responseQueue([
      page({
        nodes: [pullRequest(1, { totalCheckCount: 101 })],
        totalCount: 1,
        hasNextPage: false,
        endCursor: null,
      }),
    ]);

    const result = await fetchGitHubPullRequestPage({
      ...defaultArgs,
      pageSize: 1,
      fetchImpl: queue.fetchImpl,
    });

    expect(result.pullRequests[0].headCommit.checks).toMatchObject({
      totalCount: 101,
      checkRunCount: 101,
      statusContextCount: 0,
      checkRunCountsByState: [{ state: "SUCCESS", count: 101 }],
    });
  });

  it("turns a null check rollup into explicit zero counts", async () => {
    const queue = responseQueue([
      page({
        nodes: [pullRequest(1, { nullRollup: true })],
        totalCount: 1,
        hasNextPage: false,
        endCursor: null,
      }),
    ]);

    const result = await fetchGitHubPullRequestPage({
      ...defaultArgs,
      pageSize: 1,
      fetchImpl: queue.fetchImpl,
    });

    expect(result.pullRequests[0].headCommit.checks).toEqual({
      rollupState: null,
      totalCount: 0,
      checkRunCount: 0,
      statusContextCount: 0,
      checkRunCountsByState: [],
      statusContextCountsByState: [],
    });
  });

  it("rejects a head commit that does not belong to the reported head repository", async () => {
    const queue = responseQueue([
      page({
        nodes: [pullRequest(1, { commitRepositoryNodeId: "R_other" })],
        totalCount: 1,
        hasNextPage: false,
        endCursor: null,
      }),
    ]);

    await expect(
      fetchGitHubPullRequestPage({
        ...defaultArgs,
        pageSize: 1,
        fetchImpl: queue.fetchImpl,
      }),
    ).rejects.toThrow("head commit belongs to another repository");
  });

  it("fails when another provider page has no cursor", async () => {
    const queue = responseQueue([
      page({ nodes: [], totalCount: 1, hasNextPage: true, endCursor: null }),
    ]);

    await expect(
      fetchGitHubPullRequestPage({ ...defaultArgs, fetchImpl: queue.fetchImpl }),
    ).rejects.toThrow("without a cursor");
  });

  it("fails when a pull request repeats during a filtered scan", async () => {
    const hidden = { name: "hidden", color: "ff0000" };
    const duplicate = pullRequest(1, { labels: [hidden] });
    const queue = responseQueue([
      page({ nodes: [duplicate], totalCount: 2, hasNextPage: true, endCursor: "c1" }),
      page({ nodes: [duplicate], totalCount: 2, hasNextPage: false, endCursor: null }),
    ]);

    await expect(
      fetchGitHubPullRequestPage({
        ...defaultArgs,
        pageSize: 2,
        filters: { ...defaultArgs.filters, hiddenLabels: ["hidden"] },
        fetchImpl: queue.fetchImpl,
      }),
    ).rejects.toThrow("duplicate pull request");
  });

  it("fails when the latest commit does not match the pull request head", async () => {
    const queue = responseQueue([
      page({
        nodes: [pullRequest(1, { headRefOid: "head", commitOid: "other" })],
        totalCount: 1,
        hasNextPage: false,
        endCursor: null,
      }),
    ]);

    await expect(
      fetchGitHubPullRequestPage({
        ...defaultArgs,
        pageSize: 1,
        fetchImpl: queue.fetchImpl,
      }),
    ).rejects.toThrow("did not match its latest commit");
  });

  it("fails rather than silently filtering a pull request with more than 100 labels", async () => {
    const pullRequestWithTooManyLabels = pullRequest(1, {
      labelTotalCount: 101,
      labelHasNextPage: true,
      labelEndCursor: "labels",
    });
    const queue = responseQueue([
      page({
        nodes: [pullRequestWithTooManyLabels],
        totalCount: 1,
        hasNextPage: false,
        endCursor: null,
      }),
    ]);

    await expect(
      fetchGitHubPullRequestPage({
        ...defaultArgs,
        pageSize: 1,
        fetchImpl: queue.fetchImpl,
      }),
    ).rejects.toThrow("more than 100 labels");
  });

  it("validates the default branch commit repository identity", async () => {
    const queue = responseQueue([
      page({
        nodes: [],
        totalCount: 0,
        hasNextPage: false,
        endCursor: null,
        defaultBranchRepositoryNodeId: "R_other",
      }),
    ]);

    await expect(
      fetchGitHubPullRequestPage({ ...defaultArgs, fetchImpl: queue.fetchImpl }),
    ).rejects.toThrow("default branch commit belongs to another repository");
  });

  it("validates the repository database identity", async () => {
    const queue = responseQueue([
      page({
        nodes: [],
        totalCount: 0,
        hasNextPage: false,
        endCursor: null,
        databaseId: 43,
      }),
    ]);

    await expect(
      fetchGitHubPullRequestPage({ ...defaultArgs, fetchImpl: queue.fetchImpl }),
    ).rejects.toThrow("another repository database identity");
  });

  it("validates the repository node identity across a filtered scan", async () => {
    const queue = responseQueue([
      page({ nodes: [], totalCount: 1, hasNextPage: true, endCursor: "c1" }),
      page({
        nodes: [],
        totalCount: 1,
        hasNextPage: false,
        endCursor: null,
        repositoryNodeId: "R_other",
      }),
    ]);

    await expect(
      fetchGitHubPullRequestPage({ ...defaultArgs, fetchImpl: queue.fetchImpl }),
    ).rejects.toThrow("node identity changed");
  });
});
