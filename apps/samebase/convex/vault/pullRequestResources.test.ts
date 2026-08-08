import { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../_generated/dataModel";
import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import type { GitHubVaultAccess } from "../githubAppAccess";
import {
  buildPullRequestCloudflareWorkerResources,
  buildPullRequestHostingPreviews,
  normalizeGitHubHostingCommentBodyReads,
  normalizeGitHubHostingCommentPage,
  normalizeGitHubPullRequestResourceHeadReads,
  readGitHubHostingCommentBodies,
  recoverGitHubPullRequestGraphqlData,
  reportPullRequestHostingCommentParseFailures,
  resolveConvexPreviewDeployment,
  validatePullRequestResourceIds,
  type PullRequestResourceHead,
} from "./pullRequestResources";

const headBase: Omit<PullRequestResourceHead, "hostingPreviews"> = {
  id: "PR_17",
  number: 17,
  isCrossRepository: false,
  headRepositoryId: "R_base",
  headRefName: "feature/live-truth",
};

describe("hosting comment parse observability", () => {
  it("emits privacy-safe structured parse-failure markers", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      reportPullRequestHostingCommentParseFailures([
        { providerFormat: "cloudflare_workers", failureKind: "format_drift" },
        { providerFormat: "cloudflare_workers", failureKind: "format_drift" },
        { providerFormat: "netlify", failureKind: "invalid_or_conflict" },
      ]);
      expect(warn.mock.calls).toEqual([
        [
          'pull_request_hosting_comment_parse {"topic":"pull_request_hosting_comment_parse","version":1,"outcome":"failed","provider_format":"cloudflare_workers","failure_kind":"format_drift"}',
        ],
        [
          'pull_request_hosting_comment_parse {"topic":"pull_request_hosting_comment_parse","version":1,"outcome":"failed","provider_format":"netlify","failure_kind":"invalid_or_conflict"}',
        ],
      ]);
    } finally {
      warn.mockRestore();
    }
  });
});
const head: PullRequestResourceHead = {
  ...headBase,
  hostingPreviews: {
    cloudflare: { state: "available", previews: [], workerBuilds: [] },
    netlify: { state: "available", previews: [] },
  },
};

function fakeWorkerId(value: string): Id<"vaultCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; this test exercises stable Worker matching.
  return value;
}

function createTestGitHubVaultAccess(octokit: Octokit): GitHubVaultAccess {
  // @ts-expect-error Tests supply provider fixtures without the resolver-only capability marker.
  return {
    octokit,
    ghRepoId: "42",
    githubOwnerId: "owner-42",
    githubOwnerLogin: "samebase",
    repositoryName: "app",
    repositoryDefaultBranch: "main",
  };
}

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

describe("hosting pull request comment metadata", () => {
  const cloudflareAuthor = {
    __typename: "Bot",
    id: "MDM6Qm90NzMxMzk0MDI=",
  };

  it("selects only the exact Cloudflare and Netlify Bot ids", () => {
    expect(
      normalizeGitHubHostingCommentPage({
        totalCount: 4,
        pageInfo: { hasNextPage: false, endCursor: "cursor-4" },
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
            id: "IC_netlify",
            author: { __typename: "Bot", id: "MDM6Qm90NDAyMDkzMjY=" },
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
      allCommentIds: ["IC_cloudflare", "IC_spoof", "IC_netlify", "IC_other_bot"],
      hostingComments: [
        { commentId: "IC_cloudflare", provider: "cloudflare" },
        { commentId: "IC_netlify", provider: "netlify" },
      ],
      totalCount: 4,
      after: null,
    });
  });

  it("completes a stable page boundary and keeps selected ids", () => {
    const first = normalizeGitHubHostingCommentPage({
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
      normalizeGitHubHostingCommentPage(
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
      hostingComments: [{ commentId: "IC_1", provider: "cloudflare" }],
      totalCount: 2,
      after: null,
    });
  });

  it("fails closed when a page repeats an id, changes the count, or does not advance", () => {
    const previous = {
      state: "available" as const,
      allCommentIds: ["IC_1"],
      hostingComments: [{ commentId: "IC_1", provider: "cloudflare" as const }],
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

    expect(normalizeGitHubHostingCommentPage(page, previous)).toEqual({
      state: "unavailable",
    });
    expect(normalizeGitHubHostingCommentPage({ ...page, totalCount: 3 }, previous)).toEqual({
      state: "unavailable",
    });
    expect(
      normalizeGitHubHostingCommentPage(
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

describe("hosting pull request comment bodies", () => {
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
      normalizeGitHubHostingCommentBodyReads(
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
            { commentId: "IC_1", provider: "cloudflare", pullRequestId: "PR_17" },
            { commentId: "IC_2", provider: "cloudflare", pullRequestId: "PR_18" },
          ],
        },
      ),
    ).toEqual([
      {
        state: "available",
        commentId: "IC_1",
        provider: "cloudflare",
        pullRequestId: "PR_17",
        body: "body one",
      },
      {
        state: "available",
        commentId: "IC_2",
        provider: "cloudflare",
        pullRequestId: "PR_18",
        body: "body two",
      },
    ]);
  });

  it("accepts the exact Netlify Bot for a Netlify body request", () => {
    expect(
      normalizeGitHubHostingCommentBodyReads(
        {
          nodes: [
            {
              ...comment,
              author: { __typename: "Bot", id: "MDM6Qm90NDAyMDkzMjY=" },
            },
          ],
        },
        {
          ghRepoId: "42",
          requests: [{ commentId: "IC_1", provider: "netlify", pullRequestId: "PR_17" }],
        },
      ),
    ).toEqual([
      {
        state: "available",
        commentId: "IC_1",
        provider: "netlify",
        pullRequestId: "PR_17",
        body: "body one",
      },
    ]);
  });

  it("rejects an author spoof or a foreign pull request identity", () => {
    const request = [
      { commentId: "IC_1", provider: "cloudflare" as const, pullRequestId: "PR_17" },
    ];
    expect(
      normalizeGitHubHostingCommentBodyReads(
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
      normalizeGitHubHostingCommentBodyReads(
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

  it("keeps one provider available when the other provider body query fails", async () => {
    const requestBodies: string[] = [];
    const netlifyBody = "Netlify deploy preview";
    const octokit = new Octokit({
      request: {
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
          const requestBody = typeof init?.body === "string" ? init.body : "";
          requestBodies.push(requestBody);
          if (requestBody.includes("IC_cloudflare")) {
            return new Response(JSON.stringify({ message: "Temporary GitHub failure" }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response(
            JSON.stringify({
              data: {
                nodes: [
                  {
                    ...comment,
                    id: "IC_netlify",
                    body: netlifyBody,
                    author: { __typename: "Bot", id: "MDM6Qm90NDAyMDkzMjY=" },
                  },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        },
      },
    });

    const result = await readGitHubHostingCommentBodies({
      githubAccess: createTestGitHubVaultAccess(octokit),
      signal: new AbortController().signal,
      scans: [
        {
          pullRequestId: "PR_17",
          scan: {
            state: "available",
            allCommentIds: ["IC_cloudflare", "IC_netlify"],
            hostingComments: [
              { commentId: "IC_cloudflare", provider: "cloudflare" },
              { commentId: "IC_netlify", provider: "netlify" },
            ],
            totalCount: 2,
            after: null,
          },
        },
      ],
    });

    expect(result.get("PR_17")).toEqual({
      cloudflare: { state: "unavailable" },
      netlify: { state: "available", bodies: [netlifyBody] },
    });
    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[0]).toContain('"ids":["IC_cloudflare"]');
    expect(requestBodies[0]).not.toContain("IC_netlify");
    expect(requestBodies[1]).toContain('"ids":["IC_netlify"]');
    expect(requestBodies[1]).not.toContain("IC_cloudflare");
  });

  it("rejects duplicate, wrong-type, extra, and incomplete nodes", () => {
    const requests = [
      { commentId: "IC_1", provider: "cloudflare" as const, pullRequestId: "PR_17" },
      { commentId: "IC_2", provider: "cloudflare" as const, pullRequestId: "PR_18" },
    ];
    expect(
      normalizeGitHubHostingCommentBodyReads(
        { nodes: [comment, comment] },
        { ghRepoId: "42", requests },
      ),
    ).toEqual(requests.map((request) => ({ state: "unavailable", ...request })));
    expect(
      normalizeGitHubHostingCommentBodyReads(
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
      normalizeGitHubHostingCommentBodyReads(
        { nodes: [comment, { ...comment, id: "IC_extra" }] },
        { ghRepoId: "42", requests },
      ),
    ).toEqual(requests.map((request) => ({ state: "unavailable", ...request })));
    expect(
      normalizeGitHubHostingCommentBodyReads({ nodes: [comment] }, { ghRepoId: "42", requests }),
    ).toEqual(requests.map((request) => ({ state: "unavailable", ...request })));
  });
});

describe("buildPullRequestHostingPreviews", () => {
  it("keeps rootless previews and removes an attached Cloudflare Worker", () => {
    expect(
      buildPullRequestHostingPreviews({
        head: {
          ...head,
          hostingPreviews: {
            cloudflare: {
              state: "available",
              previews: [
                {
                  kind: "worker",
                  accountId: "account-1",
                  name: "attached-worker",
                  url: "https://branch-attached-worker.example.workers.dev",
                },
                {
                  kind: "worker",
                  accountId: "account-1",
                  name: "unattached-worker",
                  url: "https://branch-unattached-worker.example.workers.dev",
                },
                {
                  kind: "pages",
                  accountId: "account-1",
                  name: "docs",
                  url: "https://branch.docs.pages.dev",
                },
              ],
              workerBuilds: [],
            },
            netlify: {
              state: "available",
              previews: [
                {
                  name: "legacy-site",
                  url: "https://deploy-preview-17--legacy-site.netlify.app",
                },
              ],
            },
          },
        },
        configuredWorkers: [{ accountId: "account-1", workerName: "attached-worker" }],
      }),
    ).toEqual({
      cloudflare: {
        state: "available",
        previews: [
          {
            kind: "worker",
            name: "unattached-worker",
            url: "https://branch-unattached-worker.example.workers.dev",
          },
          {
            kind: "pages",
            name: "docs",
            url: "https://branch.docs.pages.dev",
          },
        ],
      },
      netlify: {
        state: "available",
        previews: [
          {
            name: "legacy-site",
            url: "https://deploy-preview-17--legacy-site.netlify.app",
          },
        ],
      },
    });
  });
});

describe("buildPullRequestCloudflareWorkerResources", () => {
  const worker = {
    workerId: fakeWorkerId("worker-1"),
    accountId: "account-1",
    workerName: "samebase-worker",
    workerTag: "samebase-worker",
  };

  it("uses the matching comment row without a pull request head check", () => {
    expect(
      buildPullRequestCloudflareWorkerResources({
        cloudflare: {
          state: "available",
          previews: [
            {
              kind: "worker",
              accountId: "account-1",
              name: "samebase-worker",
              url: "https://feature-samebase-worker.example.workers.dev",
            },
          ],
          workerBuilds: [
            {
              accountId: "account-1",
              buildUuid: "build-1",
              buildState: "failure",
              logsUrl:
                "https://dash.cloudflare.com/?to=/account-1/workers/services/view/samebase-worker/production/builds/build-1",
              name: "samebase-worker",
            },
          ],
        },
        workers: [worker],
      }),
    ).toEqual({
      state: "available",
      workers: [
        {
          workerId: worker.workerId,
          workerName: "samebase-worker",
          cloudflareBuild: {
            state: "available",
            uuid: "build-1",
            buildState: "failure",
            logsUrl:
              "https://dash.cloudflare.com/?to=/account-1/workers/services/view/samebase-worker/production/builds/build-1",
          },
          cloudflareBranchPreview: {
            state: "available",
            url: "https://feature-samebase-worker.example.workers.dev",
          },
        },
      ],
    });
  });

  it("marks only a missing parsed row unavailable", () => {
    expect(
      buildPullRequestCloudflareWorkerResources({
        cloudflare: { state: "available", previews: [], workerBuilds: [] },
        workers: [worker],
      }),
    ).toEqual({
      state: "available",
      workers: [
        {
          workerId: worker.workerId,
          workerName: "samebase-worker",
          cloudflareBuild: { state: "unavailable" },
          cloudflareBranchPreview: { state: "absent" },
        },
      ],
    });
  });

  it("returns one unavailable result when Cloudflare comments are unreadable", () => {
    expect(
      buildPullRequestCloudflareWorkerResources({
        cloudflare: { state: "unavailable" },
        workers: [worker],
      }),
    ).toEqual({ state: "unavailable" });
  });
});

describe("normalizeGitHubPullRequestResourceHeadReads", () => {
  const providerHead = {
    __typename: "PullRequest",
    id: "PR_17",
    number: 17,
    isCrossRepository: false,
    state: "OPEN",
    repository: { databaseId: 42 },
    headRepository: { id: "R_base" },
    headRefName: "feature/live-truth",
    comments: {
      totalCount: 0,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [],
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
          hostingCommentScan: {
            state: "available",
            allCommentIds: [],
            hostingComments: [],
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
        {
          ghRepoId: "42",
          pullRequestIds: ["PR_17", "PR_18"],
        },
      ),
    ).toEqual([
      { state: "unavailable", pullRequestId: "PR_17" },
      { state: "unavailable", pullRequestId: "PR_18" },
    ]);
  });

  it("recovers valid siblings when GitHub reports only missing nodes", () => {
    const error = pullRequestNodeGraphqlError({ data: { nodes: [providerHead, null] } });
    const response = recoverGitHubPullRequestGraphqlData(error);

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
          hostingCommentScan: {
            state: "available",
            allCommentIds: [],
            hostingComments: [],
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
      normalizeGitHubPullRequestResourceHeadReads(recoverGitHubPullRequestGraphqlData(error), {
        ghRepoId: "42",
        pullRequestIds: ["PR_17"],
      }),
    ).toEqual([
      {
        state: "available",
        head: {
          ...headBase,
          hostingCommentScan: { state: "unavailable" },
        },
      },
    ]);
  });

  it("isolates a nested comment field error to its pull request scan", () => {
    const error = pullRequestNodeGraphqlError({
      data: {
        nodes: [
          {
            ...providerHead,
            comments: {
              totalCount: 1,
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [{ __typename: "IssueComment", id: "IC_cloudflare", author: null }],
            },
          },
          {
            ...providerHead,
            id: "PR_18",
          },
        ],
      },
      type: "FORBIDDEN",
    });
    error.errors[0].path = ["nodes", 0, "comments", "nodes", 0, "author"];

    expect(
      normalizeGitHubPullRequestResourceHeadReads(recoverGitHubPullRequestGraphqlData(error), {
        ghRepoId: "42",
        pullRequestIds: ["PR_17", "PR_18"],
      }),
    ).toEqual([
      {
        state: "available",
        head: {
          ...headBase,
          hostingCommentScan: { state: "unavailable" },
        },
      },
      {
        state: "available",
        head: {
          ...headBase,
          id: "PR_18",
          hostingCommentScan: {
            state: "available",
            allCommentIds: [],
            hostingComments: [],
            totalCount: 0,
            after: null,
          },
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

    expect(() => recoverGitHubPullRequestGraphqlData(error)).toThrow(
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
  it("returns the branch deployment when the provider normalizes its reference", () => {
    expect(
      resolveConvexPreviewDeployment({
        deployments: [previewDeployment({ reference: "preview/feature-live-truth" })],
        head,
      }),
    ).toMatchObject({
      state: "branch",
      deployment: {
        name: "live-truth-91",
        reference: "preview/feature-live-truth",
      },
    });
  });

  it("returns the unique branch deployment without comparing its deploy time", () => {
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

  it("reports absence when the preview identifier does not match the branch", () => {
    expect(
      resolveConvexPreviewDeployment({
        deployments: [
          previewDeployment({
            previewIdentifier: "another-branch",
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
