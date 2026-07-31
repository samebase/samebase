import { describe, expect, it } from "vite-plus/test";

import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import {
  normalizeGitHubCloudflareCommentBodyReads,
  normalizeGitHubCloudflareCommentPage,
  normalizeGitHubPullRequestResourceHeadReads,
  recoverGitHubPullRequestResourceHeadsFromError,
  resolveCloudflareBranchPreviewUrl,
  resolveCloudflareCommentBranchPreviewUrl,
  resolveCloudflareWorkerBranchPreview,
  resolveConvexPreviewDeployment,
  validatePullRequestResourceIds,
  type PullRequestResourceHead,
} from "./pullRequestResources";
import { buildCloudflareBuildLogsUrl } from "./providerDashboardUrls";

const headBase: Omit<PullRequestResourceHead, "cloudflareComments"> = {
  id: "PR_17",
  url: "https://github.com/samebase/samebase/pull/17",
  isCrossRepository: false,
  headRepositoryId: "R_base",
  headRefName: "feature/live-truth",
  headRefOid: "abc123",
  cloudflareChecks: {
    state: "available",
    runs: [
      {
        name: "Workers Builds: samebase-worker",
        externalId: "build-1",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        summary: `
Build ID: [build-1](https://dash.cloudflare.com/example/build-1)
Preview URL: https://a1b2c3d4-samebase-worker.samebase.workers.dev
Preview Alias URL: https://feature-live-truth-samebase-worker.samebase.workers.dev
`,
      },
    ],
  },
};
const head: PullRequestResourceHead = {
  ...headBase,
  cloudflareComments: { state: "available", bodies: [] },
};

function previewDeployment(
  args: {
    id?: string;
    lastDeployTime?: number;
    previewIdentifier?: string;
    reference?: string;
  } = {},
): ConvexCloudDeployment {
  return {
    class: "s2",
    createTime: Date.parse("2026-07-20T09:00:00.000Z"),
    deploymentType: "preview",
    deploymentUrl: "https://live-truth.convex.cloud",
    id: args.id ?? "91",
    isDefault: false,
    kind: "cloud",
    lastDeployTime: args.lastDeployTime ?? Date.parse("2026-07-20T10:00:30.000Z"),
    name: `live-truth-${args.id ?? "91"}`,
    previewIdentifier: args.previewIdentifier ?? "feature/live-truth",
    projectId: "7",
    reference: args.reference ?? "preview/feature/live-truth",
    region: "aws-us-east-1",
  };
}

function pullRequestNodeGraphqlError(args: { data: unknown; type?: string }) {
  const error = new Error("Request failed due to following response errors");
  error.name = "GraphqlResponseError";
  return Object.assign(error, {
    data: args.data,
    errors: [
      {
        type: args.type ?? "NOT_FOUND",
        message: "Could not resolve to a node.",
        path: ["nodes", 0],
        extensions: {},
        locations: [{ line: 1, column: 34 }],
      },
    ],
  });
}

describe("buildCloudflareBuildLogsUrl", () => {
  it("links the verified account, Worker, and build identities to the exact Cloudflare logs", () => {
    expect(
      buildCloudflareBuildLogsUrl({
        accountId: "account/id",
        workerName: "samebase worker",
        buildUuid: "build/id",
      }),
    ).toBe(
      "https://dash.cloudflare.com/account%2Fid/workers/services/view/samebase%20worker/production/builds/build%2Fid",
    );
  });
});

describe("resolveCloudflareBranchPreviewUrl", () => {
  const build = {
    buildUuid: "build-1",
    buildState: "success" as const,
  };

  it("returns the branch alias from the exact Cloudflare build check", () => {
    expect(
      resolveCloudflareBranchPreviewUrl({
        checks: head.cloudflareChecks,
        workerName: "samebase-worker",
        build,
      }),
    ).toEqual({
      state: "available",
      url: "https://feature-live-truth-samebase-worker.samebase.workers.dev",
    });
  });

  it("does not guess a branch alias when no check belongs to the build", () => {
    expect(
      resolveCloudflareBranchPreviewUrl({
        checks: head.cloudflareChecks,
        workerName: "samebase-worker",
        build: { ...build, buildUuid: "build-2" },
      }),
    ).toEqual({ state: "absent" });
  });

  it("refuses a check whose Worker identity disagrees", () => {
    expect(
      resolveCloudflareBranchPreviewUrl({
        checks: head.cloudflareChecks,
        workerName: "other-worker",
        build,
      }),
    ).toEqual({ state: "unavailable", reason: "provider_disagreement" });
  });

  it("refuses malformed or repeated alias lines", () => {
    const run = head.cloudflareChecks.state === "available" ? head.cloudflareChecks.runs[0] : null;
    if (run === null) {
      throw new Error("Expected available Cloudflare check fixture.");
    }

    expect(
      resolveCloudflareBranchPreviewUrl({
        checks: {
          state: "available",
          runs: [
            {
              ...run,
              summary: `Preview Alias URL: https://feature-live-truth-samebase-worker.samebase.workers.dev
Preview Alias URL: https://other-samebase-worker.samebase.workers.dev`,
            },
          ],
        },
        workerName: "samebase-worker",
        build,
      }),
    ).toEqual({ state: "unavailable", reason: "url_ambiguous" });
  });
});

describe("Cloudflare pull request comment metadata", () => {
  const cloudflareAuthor = {
    __typename: "Bot",
    id: "MDM6Qm90NzMxMzk0MDI=",
  };

  it("selects only the exact Cloudflare Bot id", () => {
    expect(
      normalizeGitHubCloudflareCommentPage({
        totalCount: 3,
        pageInfo: { hasNextPage: false, endCursor: "cursor-3" },
        nodes: [
          {
            __typename: "IssueComment",
            id: "IC_cloudflare",
            author: cloudflareAuthor,
          },
          {
            __typename: "IssueComment",
            id: "IC_spoof",
            author: {
              __typename: "User",
              id: "MDM6Qm90NzMxMzk0MDI=",
            },
          },
          {
            __typename: "IssueComment",
            id: "IC_other_bot",
            author: { __typename: "Bot", id: "BOT_other" },
          },
        ],
      }),
    ).toEqual({
      state: "available",
      allCommentIds: ["IC_cloudflare", "IC_spoof", "IC_other_bot"],
      cloudflareCommentIds: ["IC_cloudflare"],
      totalCount: 3,
      after: null,
    });
  });

  it("completes a stable page boundary and keeps selected ids", () => {
    const first = normalizeGitHubCloudflareCommentPage({
      totalCount: 2,
      pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
      nodes: [
        {
          __typename: "IssueComment",
          id: "IC_1",
          author: cloudflareAuthor,
        },
      ],
    });
    if (first.state !== "available") {
      throw new Error("Expected an available first comment page.");
    }

    expect(
      normalizeGitHubCloudflareCommentPage(
        {
          totalCount: 2,
          pageInfo: { hasNextPage: false, endCursor: "cursor-2" },
          nodes: [
            {
              __typename: "IssueComment",
              id: "IC_2",
              author: { __typename: "User" },
            },
          ],
        },
        first,
      ),
    ).toEqual({
      state: "available",
      allCommentIds: ["IC_1", "IC_2"],
      cloudflareCommentIds: ["IC_1"],
      totalCount: 2,
      after: null,
    });
  });

  it("fails closed when a page repeats an id, changes the count, or does not advance", () => {
    const previous = {
      state: "available" as const,
      allCommentIds: ["IC_1"],
      cloudflareCommentIds: ["IC_1"],
      totalCount: 2,
      after: "cursor-1",
    };
    const page = {
      totalCount: 2,
      pageInfo: { hasNextPage: false, endCursor: "cursor-2" },
      nodes: [
        {
          __typename: "IssueComment",
          id: "IC_1",
          author: cloudflareAuthor,
        },
      ],
    };

    expect(normalizeGitHubCloudflareCommentPage(page, previous)).toEqual({
      state: "unavailable",
    });
    expect(normalizeGitHubCloudflareCommentPage({ ...page, totalCount: 3 }, previous)).toEqual({
      state: "unavailable",
    });
    expect(
      normalizeGitHubCloudflareCommentPage(
        {
          ...page,
          pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
          nodes: [
            {
              __typename: "IssueComment",
              id: "IC_2",
              author: cloudflareAuthor,
            },
          ],
        },
        previous,
      ),
    ).toEqual({ state: "unavailable" });
  });
});

describe("Cloudflare pull request comment bodies", () => {
  const comment = {
    __typename: "IssueComment",
    id: "IC_1",
    body: "body one",
    author: {
      __typename: "Bot",
      id: "MDM6Qm90NzMxMzk0MDI=",
    },
    pullRequest: {
      id: "PR_17",
      state: "OPEN",
      repository: { databaseId: 42 },
    },
  };

  it("maps bodies by returned id instead of response order", () => {
    expect(
      normalizeGitHubCloudflareCommentBodyReads(
        {
          nodes: [
            {
              ...comment,
              id: "IC_2",
              body: "body two",
              pullRequest: {
                id: "PR_18",
                state: "OPEN",
                repository: { databaseId: 42 },
              },
            },
            comment,
          ],
        },
        {
          ghRepoId: "42",
          requests: [
            { commentId: "IC_1", pullRequestId: "PR_17" },
            { commentId: "IC_2", pullRequestId: "PR_18" },
          ],
        },
      ),
    ).toEqual([
      {
        state: "available",
        commentId: "IC_1",
        pullRequestId: "PR_17",
        body: "body one",
      },
      {
        state: "available",
        commentId: "IC_2",
        pullRequestId: "PR_18",
        body: "body two",
      },
    ]);
  });

  it("rejects an author spoof or a foreign pull request identity", () => {
    const request = [{ commentId: "IC_1", pullRequestId: "PR_17" }];
    expect(
      normalizeGitHubCloudflareCommentBodyReads(
        {
          nodes: [
            {
              ...comment,
              author: {
                __typename: "Bot",
                id: "BOT_spoof",
              },
            },
          ],
        },
        { ghRepoId: "42", requests: request },
      ),
    ).toEqual([{ state: "unavailable", ...request[0] }]);
    expect(
      normalizeGitHubCloudflareCommentBodyReads(
        {
          nodes: [
            {
              ...comment,
              pullRequest: {
                id: "PR_other",
                state: "OPEN",
                repository: { databaseId: 42 },
              },
            },
          ],
        },
        { ghRepoId: "42", requests: request },
      ),
    ).toEqual([{ state: "unavailable", ...request[0] }]);
  });

  it("rejects duplicate, wrong-type, extra, and incomplete nodes", () => {
    const requests = [
      { commentId: "IC_1", pullRequestId: "PR_17" },
      { commentId: "IC_2", pullRequestId: "PR_18" },
    ];
    expect(
      normalizeGitHubCloudflareCommentBodyReads(
        { nodes: [comment, comment] },
        { ghRepoId: "42", requests },
      ),
    ).toEqual(requests.map((request) => ({ state: "unavailable", ...request })));
    expect(
      normalizeGitHubCloudflareCommentBodyReads(
        {
          nodes: [
            { __typename: "PullRequest", id: "IC_1" },
            {
              ...comment,
              id: "IC_2",
              pullRequest: {
                id: "PR_18",
                state: "OPEN",
                repository: { databaseId: 42 },
              },
            },
          ],
        },
        { ghRepoId: "42", requests },
      ),
    ).toEqual([
      { state: "unavailable", ...requests[0] },
      {
        state: "available",
        ...requests[1],
        body: "body one",
      },
    ]);
    expect(
      normalizeGitHubCloudflareCommentBodyReads(
        { nodes: [comment, { ...comment, id: "IC_extra" }] },
        { ghRepoId: "42", requests },
      ),
    ).toEqual(requests.map((request) => ({ state: "unavailable", ...request })));
    expect(
      normalizeGitHubCloudflareCommentBodyReads({ nodes: [comment] }, { ghRepoId: "42", requests }),
    ).toEqual(requests.map((request) => ({ state: "unavailable", ...request })));
  });
});

describe("resolveCloudflareCommentBranchPreviewUrl", () => {
  function workersComment(previewCell: string, workerName = "samebase-worker") {
    return `## Cloudflare Workers

| Status | Name | Latest Commit | Preview URL | Updated (UTC) |
| -|-|-|-|-|
| Ready | ${workerName} | abc123 | ${previewCell} | now |`;
  }

  it("reads the exact Workers row and canonicalizes equal branch URLs", () => {
    expect(
      resolveCloudflareCommentBranchPreviewUrl({
        comments: {
          state: "available",
          bodies: [
            workersComment(
              "<a href='https://feature-samebase-worker.example.workers.dev'>Branch Preview URL</a>",
            ),
            workersComment(
              '<a href="https://feature-samebase-worker.example.workers.dev/">Branch Preview URL</a>',
            ),
          ],
        },
        workerName: "samebase-worker",
      }),
    ).toEqual({
      state: "available",
      url: "https://feature-samebase-worker.example.workers.dev",
    });
  });

  it("ignores the wrong Worker and strict URL failures", () => {
    expect(
      resolveCloudflareCommentBranchPreviewUrl({
        comments: {
          state: "available",
          bodies: [
            workersComment(
              "<a href='http://feature-samebase-worker.example.workers.dev'>Branch Preview URL</a>",
            ),
            workersComment(
              "<a href='https://feature-samebase-worker.example.workers.dev/path'>Branch Preview URL</a>",
            ),
            workersComment(
              "<a href='https://user@feature-samebase-worker.example.workers.dev'>Branch Preview URL</a>",
            ),
            workersComment(
              "<a href='https://feature-samebase-worker.example.workers.dev:8443'>Branch Preview URL</a>",
            ),
            workersComment(
              "<a href='https://feature-samebase-worker.example.workers.dev?key=value'>Branch Preview URL</a>",
            ),
            workersComment(
              "<a href='https://feature-samebase-worker.example.workers.dev#fragment'>Branch Preview URL</a>",
            ),
            workersComment(
              "<a href='https://feature-samebase-worker.example.com'>Branch Preview URL</a>",
            ),
            workersComment(
              "<a href='https://feature-other-worker.example.workers.dev'>Branch Preview URL</a>",
              "other-worker",
            ),
          ],
        },
        workerName: "samebase-worker",
      }),
    ).toEqual({ state: "absent" });
  });

  it("fails closed for two distinct valid branch URLs", () => {
    expect(
      resolveCloudflareCommentBranchPreviewUrl({
        comments: {
          state: "available",
          bodies: [
            workersComment(
              "<a href='https://feature-samebase-worker.example.workers.dev'>Branch Preview URL</a>",
            ),
            workersComment(
              "<a href='https://other-samebase-worker.example.workers.dev'>Branch Preview URL</a>",
            ),
          ],
        },
        workerName: "samebase-worker",
      }),
    ).toEqual({ state: "unavailable", reason: "url_ambiguous" });
  });
});

describe("resolveCloudflareWorkerBranchPreview", () => {
  it("keeps the exact current check URL when comment recovery is unavailable", () => {
    expect(
      resolveCloudflareWorkerBranchPreview({
        currentCheck: {
          state: "available",
          url: "https://current-samebase-worker.example.workers.dev",
        },
        comment: { state: "unavailable" },
      }),
    ).toEqual({
      state: "available",
      url: "https://current-samebase-worker.example.workers.dev",
    });
  });

  it("uses a comment URL only as recovery when no exact check URL exists", () => {
    expect(
      resolveCloudflareWorkerBranchPreview({
        currentCheck: null,
        comment: {
          state: "available",
          url: "https://older-samebase-worker.example.workers.dev",
        },
      }),
    ).toEqual({
      state: "available",
      url: "https://older-samebase-worker.example.workers.dev",
    });
  });
});

describe("normalizeGitHubPullRequestResourceHeadReads", () => {
  const providerHead = {
    __typename: "PullRequest",
    id: "PR_17",
    url: "https://github.com/samebase/samebase/pull/17",
    isCrossRepository: false,
    state: "OPEN",
    repository: { databaseId: 42 },
    headRepository: { id: "R_base" },
    headRefName: "feature/live-truth",
    headRefOid: "abc123",
    comments: {
      totalCount: 0,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [],
    },
    commits: {
      nodes: [
        {
          commit: {
            oid: "abc123",
            checkSuites: {
              totalCount: 1,
              nodes: [
                {
                  checkRuns: {
                    totalCount: 1,
                    nodes:
                      head.cloudflareChecks.state === "available" ? head.cloudflareChecks.runs : [],
                  },
                },
              ],
            },
          },
        },
      ],
    },
  };

  it("derives resource identity from the server-observed GitHub node", () => {
    expect(
      normalizeGitHubPullRequestResourceHeadReads(
        { nodes: [providerHead] },
        { ghRepoId: "42", pullRequestIds: ["PR_17"] },
      ),
    ).toEqual([
      {
        state: "available",
        head: {
          ...headBase,
          cloudflareCommentScan: {
            state: "available",
            allCommentIds: [],
            cloudflareCommentIds: [],
            totalCount: 0,
            after: null,
          },
        },
      },
    ]);
  });

  it("marks Cloudflare checks unavailable when GitHub truncates the filtered connection", () => {
    expect(
      normalizeGitHubPullRequestResourceHeadReads(
        {
          nodes: [
            {
              ...providerHead,
              commits: {
                nodes: [
                  {
                    commit: {
                      ...providerHead.commits.nodes[0].commit,
                      checkSuites: {
                        ...providerHead.commits.nodes[0].commit.checkSuites,
                        totalCount: 2,
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
        { ghRepoId: "42", pullRequestIds: ["PR_17"] },
      ),
    ).toEqual([
      {
        state: "available",
        head: {
          ...headBase,
          cloudflareChecks: { state: "unavailable" },
          cloudflareCommentScan: {
            state: "available",
            allCommentIds: [],
            cloudflareCommentIds: [],
            totalCount: 0,
            after: null,
          },
        },
      },
    ]);
  });

  it("rejects a pull request from another repository", () => {
    expect(() =>
      normalizeGitHubPullRequestResourceHeadReads(
        { nodes: [{ ...providerHead, repository: { databaseId: 99 } }] },
        { ghRepoId: "42", pullRequestIds: ["PR_17"] },
      ),
    ).toThrow("GitHub pull request identity changed.");
  });

  it("isolates a closed or missing pull request from the rest of the batch", () => {
    expect(
      normalizeGitHubPullRequestResourceHeadReads(
        { nodes: [{ ...providerHead, state: "MERGED" }, null] },
        { ghRepoId: "42", pullRequestIds: ["PR_17", "PR_18"] },
      ),
    ).toEqual([
      { state: "unavailable", pullRequestId: "PR_17" },
      { state: "unavailable", pullRequestId: "PR_18" },
    ]);
  });

  it("recovers valid siblings when GitHub reports only missing nodes", () => {
    const error = pullRequestNodeGraphqlError({ data: { nodes: [providerHead, null] } });
    const response = recoverGitHubPullRequestResourceHeadsFromError(error);

    expect(
      normalizeGitHubPullRequestResourceHeadReads(response, {
        ghRepoId: "42",
        pullRequestIds: ["PR_17", "PR_18"],
      }),
    ).toEqual([
      {
        state: "available",
        head: {
          ...headBase,
          cloudflareCommentScan: {
            state: "available",
            allCommentIds: [],
            cloudflareCommentIds: [],
            totalCount: 0,
            after: null,
          },
        },
      },
      { state: "unavailable", pullRequestId: "PR_18" },
    ]);
  });

  it("recovers head data when only the comment connection fails", () => {
    const error = pullRequestNodeGraphqlError({
      data: { nodes: [{ ...providerHead, comments: null }] },
      type: "FORBIDDEN",
    });
    error.errors[0].path = ["nodes", 0, "comments"];

    expect(
      normalizeGitHubPullRequestResourceHeadReads(
        recoverGitHubPullRequestResourceHeadsFromError(error),
        {
          ghRepoId: "42",
          pullRequestIds: ["PR_17"],
        },
      ),
    ).toEqual([
      {
        state: "available",
        head: {
          ...headBase,
          cloudflareCommentScan: { state: "unavailable" },
        },
      },
    ]);
  });

  it("rejects a partial response when any GraphQL failure is not a missing node", () => {
    const error = pullRequestNodeGraphqlError({ data: { nodes: [providerHead, null] } });
    error.errors.push({
      type: "FORBIDDEN",
      message: "Resource not accessible by integration.",
      path: ["nodes"],
      extensions: {},
      locations: [{ line: 1, column: 34 }],
    });

    expect(() => recoverGitHubPullRequestResourceHeadsFromError(error)).toThrow(
      "Request failed due to following response errors",
    );
  });
});

describe("validatePullRequestResourceIds", () => {
  it("accepts a single provider identity and the maximum batch", () => {
    expect(() => validatePullRequestResourceIds(["PR_1"])).not.toThrow();
    expect(() =>
      validatePullRequestResourceIds(
        Array.from({ length: 100 }, (_value, index) => `PR_${index + 1}`),
      ),
    ).not.toThrow();
  });

  it("rejects empty, oversized, and duplicate batches before provider work", () => {
    expect(() => validatePullRequestResourceIds([])).toThrow(
      "Pull request resource count must be between 1 and 100.",
    );
    expect(() =>
      validatePullRequestResourceIds(
        Array.from({ length: 101 }, (_value, index) => `PR_${index + 1}`),
      ),
    ).toThrow("Pull request resource count must be between 1 and 100.");
    expect(() => validatePullRequestResourceIds(["PR_1", "PR_1"])).toThrow(
      "Pull request identity was invalid or duplicated.",
    );
  });
});

describe("resolveConvexPreviewDeployment", () => {
  it("returns the unique branch deployment independently of Cloudflare build timing", () => {
    expect(
      resolveConvexPreviewDeployment({
        deployments: [
          previewDeployment({
            lastDeployTime: Date.parse("2026-07-19T10:00:00.000Z"),
          }),
        ],
        head,
      }),
    ).toMatchObject({
      state: "branch",
      deployment: { name: "live-truth-91" },
    });
  });

  it("never resolves a fork preview by branch name", () => {
    expect(
      resolveConvexPreviewDeployment({
        deployments: [previewDeployment()],
        head: { ...head, isCrossRepository: true, headRepositoryId: "R_fork" },
      }),
    ).toEqual({ state: "unavailable", reason: "fork_head" });
  });

  it("reports absence when the deployment reference does not match the branch", () => {
    expect(
      resolveConvexPreviewDeployment({
        deployments: [
          previewDeployment({
            reference: "preview/another-branch",
          }),
        ],
        head,
      }),
    ).toEqual({ state: "absent" });
  });

  it("refuses ambiguous preview deployments", () => {
    expect(
      resolveConvexPreviewDeployment({
        deployments: [previewDeployment({ id: "91" }), previewDeployment({ id: "92" })],
        head,
      }),
    ).toEqual({ state: "unavailable", reason: "deployment_ambiguous" });
  });
});
