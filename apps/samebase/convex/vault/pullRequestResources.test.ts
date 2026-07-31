import { Octokit } from "@octokit/rest";
import { describe, expect, it } from "vite-plus/test";

import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import {
  buildPullRequestHostingPreviews,
  normalizeGitHubHostingCommentBodyReads,
  normalizeGitHubHostingCommentPage,
  normalizeGitHubPullRequestResourceHeadReads,
  readGitHubHostingCommentBodies,
  recoverGitHubPullRequestGraphqlData,
  resolveCloudflareBranchPreviewUrl,
  resolveCloudflareWorkerObservation,
  resolveConvexPreviewDeployment,
  validatePullRequestResourceIds,
  type PullRequestResourceHead,
} from "./pullRequestResources";
import { buildCloudflareBuildLogsUrl } from "./providerDashboardUrls";

const headBase: Omit<PullRequestResourceHead, "hostingPreviews"> = {
  id: "PR_17",
  number: 17,
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
  hostingPreviews: {
    cloudflare: { state: "available", previews: [] },
    netlify: { state: "available", previews: [] },
  },
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
    expect(
      resolveCloudflareBranchPreviewUrl({
        checks: {
          state: "available",
          runs: [{ ...run, summary: "Preview Alias URL: https://invalid.example.com" }],
        },
        workerName: "samebase-worker",
        build,
      }),
    ).toEqual({ state: "unavailable", reason: "url_malformed" });
  });
});

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
      octokit,
      signal: new AbortController().signal,
      ghRepoId: "42",
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

describe("resolveCloudflareWorkerObservation", () => {
  const recoveredPreview = {
    state: "available" as const,
    previews: [
      {
        kind: "worker" as const,
        accountId: "account-1",
        name: "samebase-worker",
        url: "https://older-samebase-worker.example.workers.dev",
      },
    ],
  };

  it("keeps the exact current check URL when the comment is unavailable", () => {
    expect(
      resolveCloudflareWorkerObservation({
        accountId: "account-1",
        workerName: "samebase-worker",
        match: {
          state: "available",
          buildUuid: "build-1",
          buildState: "success",
          createdAt: 1,
          finishedAt: 2,
        },
        buildsExhausted: true,
        previewUrlsEnabled: true,
        checks: head.cloudflareChecks,
        cloudflarePreviews: { state: "unavailable" },
      }),
    ).toMatchObject({
      state: "available",
      cloudflareBuild: { state: "available", buildState: "success" },
      cloudflareBranchPreview: {
        state: "available",
        url: "https://feature-live-truth-samebase-worker.samebase.workers.dev",
      },
    });
  });

  it("returns an unavailable build with an available recovered preview", () => {
    expect(
      resolveCloudflareWorkerObservation({
        accountId: "account-1",
        workerName: "samebase-worker",
        match: { state: "absent" },
        buildsExhausted: false,
        previewUrlsEnabled: true,
        checks: head.cloudflareChecks,
        cloudflarePreviews: recoveredPreview,
      }),
    ).toEqual({
      state: "available",
      cloudflareBuild: { state: "unavailable" },
      cloudflareBranchPreview: {
        state: "available",
        url: "https://older-samebase-worker.example.workers.dev",
      },
    });
  });

  it("keeps a recovered preview when the Worker provider data disagrees", () => {
    expect(
      resolveCloudflareWorkerObservation({
        accountId: "account-1",
        workerName: "samebase-worker",
        match: { state: "provider_disagreement" },
        buildsExhausted: false,
        previewUrlsEnabled: true,
        checks: head.cloudflareChecks,
        cloudflarePreviews: recoveredPreview,
      }),
    ).toEqual({
      state: "unavailable",
      cloudflareBranchPreview: {
        state: "available",
        url: "https://older-samebase-worker.example.workers.dev",
      },
    });
  });

  it("does not use a same-name Worker preview from another account", () => {
    expect(
      resolveCloudflareWorkerObservation({
        accountId: "account-1",
        workerName: "samebase-worker",
        match: { state: "absent" },
        buildsExhausted: true,
        previewUrlsEnabled: true,
        checks: head.cloudflareChecks,
        cloudflarePreviews: {
          state: "available",
          previews: recoveredPreview.previews.map((preview) => ({
            ...preview,
            accountId: "account-2",
          })),
        },
      }),
    ).toEqual({
      state: "available",
      cloudflareBuild: { state: "absent" },
      cloudflareBranchPreview: { state: "absent" },
    });
  });

  it("blocks an older comment when the current alias is malformed", () => {
    const currentRun =
      head.cloudflareChecks.state === "available" ? head.cloudflareChecks.runs[0] : null;
    if (currentRun === null) {
      throw new Error("Expected available Cloudflare check fixture.");
    }

    expect(
      resolveCloudflareWorkerObservation({
        accountId: "account-1",
        workerName: "samebase-worker",
        match: {
          state: "available",
          buildUuid: "build-1",
          buildState: "success",
          createdAt: 1,
          finishedAt: 2,
        },
        buildsExhausted: true,
        previewUrlsEnabled: true,
        checks: {
          state: "available",
          runs: [
            {
              ...currentRun,
              summary: "Preview Alias URL: https://invalid.example.com",
            },
          ],
        },
        cloudflarePreviews: recoveredPreview,
      }),
    ).toMatchObject({
      state: "available",
      cloudflareBuild: { state: "available" },
      cloudflareBranchPreview: { state: "unavailable" },
    });
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
