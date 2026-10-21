import { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../_generated/dataModel";
import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import { observedAlchemyStackReply } from "./fixtures/observedAlchemyState";
import {
  buildPullRequestAlchemyPreview,
  buildPullRequestCloudflareWorkerResources,
  buildPullRequestHostingPreviews,
  completeGitHubPullRequestCommitScan,
  normalizeGitHubHostingCommentBodyReads,
  normalizeGitHubHostingCommentPage,
  normalizeGitHubPullRequestCommitPage,
  normalizeGitHubPullRequestResourceHeadReads,
  readGitHubHostingCommentBodies,
  reportPullRequestHostingCommentParseFailures,
  resolveConvexPreviewDeployment,
  selectBranchPreviewConvexProjects,
  validatePullRequestResourceIds,
  type PullRequestResourceHead,
} from "./pullRequestResources";

const headBase: Omit<PullRequestResourceHead, "cloudflareWorkerProof" | "hostingPreviews"> = {
  id: "PR_17",
  number: 17,
  isCrossRepository: false,
  baseRefOid: "a".repeat(40),
  headRefOid: "b".repeat(40),
  headRepositoryId: "R_base",
  headRefName: "feature/live-truth",
};

describe("hosting comment parse observability", () => {
  it("emits privacy-safe structured parse-failure markers", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      reportPullRequestHostingCommentParseFailures([
        { providerFormat: "cloudflare_pages", failureKind: "format_drift" },
        { providerFormat: "cloudflare_pages", failureKind: "format_drift" },
        { providerFormat: "netlify", failureKind: "invalid_or_conflict" },
      ]);
      expect(warn.mock.calls).toEqual([
        [
          'pull_request_hosting_comment_parse {"topic":"pull_request_hosting_comment_parse","version":1,"outcome":"failed","provider_format":"cloudflare_pages","failure_kind":"format_drift"}',
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
  cloudflareWorkerProof: { state: "available", workers: [] },
  hostingPreviews: {
    cloudflare: { state: "available", previews: [] },
    netlify: { state: "available", previews: [] },
  },
};

function fakeWorkerId(value: string): Id<"repositoryCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; this test exercises stable Worker matching.
  return value;
}

function fakeConvexProjectId(value: string): Id<"repositoryConvexProjects"> {
  // @ts-expect-error Convex ids are strings at runtime; this test matches provider project ids.
  return value;
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

describe("pull request commit pagination", () => {
  function commit(index: number) {
    return {
      commit: {
        id: `C_${index}`,
        oid: index.toString(16).padStart(40, "0"),
      },
    };
  }

  it("completes a stable 101-commit scan in pull request order", () => {
    const newestPage = normalizeGitHubPullRequestCommitPage({
      totalCount: 101,
      pageInfo: { hasPreviousPage: true, startCursor: "cursor-2" },
      nodes: Array.from({ length: 100 }, (_value, index) => commit(index + 2)),
    });
    if (newestPage.state !== "available") {
      throw new Error("Expected an available first commit page.");
    }

    const complete = normalizeGitHubPullRequestCommitPage(
      {
        totalCount: 101,
        pageInfo: { hasPreviousPage: false, startCursor: "cursor-1" },
        nodes: [commit(1)],
      },
      newestPage,
    );
    expect(complete).toMatchObject({
      state: "available",
      totalCount: 101,
      before: null,
    });
    if (complete.state === "available") {
      expect(complete.commits).toHaveLength(101);
      expect(complete.commits.at(0)?.id).toBe("C_1");
      expect(complete.commits.at(-1)?.id).toBe("C_101");
    }
  });

  it("fails closed when count, cursor, or commit identity changes", () => {
    const previous = normalizeGitHubPullRequestCommitPage({
      totalCount: 2,
      pageInfo: { hasPreviousPage: true, startCursor: "cursor-2" },
      nodes: [commit(2)],
    });
    if (previous.state !== "available") {
      throw new Error("Expected an available first commit page.");
    }
    const olderPage = {
      totalCount: 2,
      pageInfo: { hasPreviousPage: false, startCursor: "cursor-1" },
      nodes: [commit(1)],
    };

    expect(normalizeGitHubPullRequestCommitPage({ ...olderPage, totalCount: 3 }, previous)).toEqual(
      {
        state: "unavailable",
      },
    );
    expect(
      normalizeGitHubPullRequestCommitPage(
        {
          ...olderPage,
          pageInfo: { hasPreviousPage: true, startCursor: "cursor-2" },
        },
        previous,
      ),
    ).toEqual({ state: "unavailable" });
    expect(
      normalizeGitHubPullRequestCommitPage(
        { ...olderPage, nodes: [{ commit: { ...commit(2).commit, id: "C_1" } }] },
        previous,
      ),
    ).toEqual({ state: "unavailable" });
  });

  it("fails closed when a complete scan does not end at the current head", async () => {
    expect(
      await completeGitHubPullRequestCommitScan({
        octokit: new Octokit(),
        signal: new AbortController().signal,
        githubRepositoryDatabaseId: "42",
        head: {
          ...headBase,
          hostingCommentScan: { state: "unavailable" },
          commitScan: {
            state: "available",
            commits: [{ id: "C_stale", oid: "c".repeat(40) }],
            totalCount: 1,
            before: null,
          },
        },
      }),
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
          githubRepositoryDatabaseId: "42",
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
          githubRepositoryDatabaseId: "42",
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
        { githubRepositoryDatabaseId: "42", requests: request },
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
        { githubRepositoryDatabaseId: "42", requests: request },
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
      githubRepositoryDatabaseId: "42",
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
        { githubRepositoryDatabaseId: "42", requests },
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
        { githubRepositoryDatabaseId: "42", requests },
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
        { githubRepositoryDatabaseId: "42", requests },
      ),
    ).toEqual(requests.map((request) => ({ state: "unavailable", ...request })));
    expect(
      normalizeGitHubHostingCommentBodyReads(
        { nodes: [comment] },
        { githubRepositoryDatabaseId: "42", requests },
      ),
    ).toEqual(requests.map((request) => ({ state: "unavailable", ...request })));
  });
});

describe("buildPullRequestHostingPreviews", () => {
  it("keeps rootless previews and removes an attached Cloudflare Worker", () => {
    expect(
      buildPullRequestHostingPreviews({
        head: {
          ...head,
          cloudflareWorkerProof: {
            state: "available",
            workers: [
              {
                accountId: "account-1",
                buildState: "success",
                buildUuid: "attached-build",
                logsUrl: "https://dash.cloudflare.com/attached-build",
                name: "attached-worker",
                preview: {
                  state: "available",
                  url: "https://branch-attached-worker.example.workers.dev",
                  provenance: "selected_result",
                },
              },
              {
                accountId: "account-1",
                buildState: "running",
                buildUuid: "recovered-build",
                logsUrl: "https://dash.cloudflare.com/recovered-build",
                name: "recovered-worker",
                preview: {
                  state: "available",
                  url: "https://branch-recovered-worker.example.workers.dev",
                  provenance: "earlier_check",
                },
              },
              {
                accountId: "account-1",
                buildState: "success",
                buildUuid: "unattached-build",
                logsUrl: "https://dash.cloudflare.com/unattached-build",
                name: "unattached-worker",
                preview: {
                  state: "available",
                  url: "https://branch-unattached-worker.example.workers.dev",
                  provenance: "selected_result",
                },
              },
            ],
          },
          hostingPreviews: {
            cloudflare: {
              state: "available",
              previews: [
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

  it("keeps Pages previews when Worker proof is unavailable", () => {
    expect(
      buildPullRequestHostingPreviews({
        head: {
          ...head,
          cloudflareWorkerProof: { state: "unavailable" },
          hostingPreviews: {
            ...head.hostingPreviews,
            cloudflare: {
              state: "available",
              previews: [
                {
                  kind: "pages",
                  accountId: "account-1",
                  name: "docs",
                  url: "https://branch.docs.pages.dev",
                },
              ],
            },
          },
        },
        configuredWorkers: [],
      }).cloudflare,
    ).toEqual({
      state: "available",
      previews: [{ kind: "pages", name: "docs", url: "https://branch.docs.pages.dev" }],
    });
  });
});

describe("buildPullRequestCloudflareWorkerResources", () => {
  const worker = {
    workerId: fakeWorkerId("worker-1"),
    accountId: "account-1",
    workerName: "samebase-worker",
    workerTag: "samebase-worker",
    rootDirectory: "apps/samebase",
  };

  it("uses the matching check result from the current pull request commit scan", () => {
    expect(
      buildPullRequestCloudflareWorkerResources({
        head: {
          ...head,
          cloudflareWorkerProof: {
            state: "available",
            workers: [
              {
                accountId: "account-1",
                buildUuid: "build-1",
                buildState: "failure",
                logsUrl:
                  "https://dash.cloudflare.com/?to=/account-1/workers/services/view/samebase-worker/production/builds/build-1",
                name: "samebase-worker",
                preview: {
                  state: "available",
                  url: "https://feature-samebase-worker.example.workers.dev",
                  provenance: "selected_result",
                },
              },
            ],
          },
        },
        workers: [worker],
        nativePreviewUrlsByWorker: new Map(),
      }),
    ).toEqual({
      state: "available",
      workers: [
        {
          workerId: worker.workerId,
          workerName: "samebase-worker",
          rootDirectory: "apps/samebase",
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
            provenance: "selected_result",
          },
        },
      ],
    });
  });

  it("marks only a missing parsed row unavailable", () => {
    expect(
      buildPullRequestCloudflareWorkerResources({
        head: { ...head, cloudflareWorkerProof: { state: "available", workers: [] } },
        workers: [worker],
        nativePreviewUrlsByWorker: new Map(),
      }),
    ).toEqual({
      state: "available",
      workers: [
        {
          workerId: worker.workerId,
          workerName: "samebase-worker",
          rootDirectory: "apps/samebase",
          cloudflareBuild: { state: "unavailable" },
          cloudflareBranchPreview: { state: "absent" },
        },
      ],
    });
  });

  it("returns one unavailable result when Cloudflare checks are unreadable", () => {
    expect(
      buildPullRequestCloudflareWorkerResources({
        head: { ...head, cloudflareWorkerProof: { state: "unavailable" } },
        workers: [worker],
        nativePreviewUrlsByWorker: new Map(),
      }),
    ).toEqual({ state: "unavailable" });
  });

  const nativeProof = {
    accountId: worker.accountId,
    buildUuid: "build-1",
    buildState: "success" as const,
    logsUrl:
      "https://dash.cloudflare.com/account-1/workers/services/view/samebase-worker/production/previews/feature-live-truth/builds/build-1",
    name: worker.workerName,
    preview: { state: "absent" as const },
  };
  const nativeHead: PullRequestResourceHead = {
    ...head,
    cloudflareWorkerProof: { state: "available", workers: [nativeProof] },
  };
  const nativeUrl = "https://feature-live-truth-samebase-worker.example.workers.dev";
  const nativePreviewUrlsByWorker = new Map([
    [worker.workerId, new Map([[head.headRefName, nativeUrl]])],
  ]);

  it("adds an observed native branch URL without changing the current build proof", () => {
    expect(
      buildPullRequestCloudflareWorkerResources({
        head: nativeHead,
        workers: [worker],
        nativePreviewUrlsByWorker,
      }),
    ).toEqual({
      state: "available",
      workers: [
        {
          workerId: worker.workerId,
          workerName: worker.workerName,
          rootDirectory: worker.rootDirectory,
          cloudflareBuild: {
            state: "available",
            uuid: nativeProof.buildUuid,
            buildState: nativeProof.buildState,
            logsUrl: nativeProof.logsUrl,
          },
          cloudflareBranchPreview: {
            state: "available",
            url: nativeUrl,
            provenance: "selected_result",
          },
        },
      ],
    });
  });

  it.each([
    { ...nativeHead, isCrossRepository: true },
    { ...nativeHead, headRepositoryId: null },
    { ...nativeHead, headRefName: "another-branch" },
    {
      ...nativeHead,
      cloudflareWorkerProof: {
        state: "available" as const,
        workers: [
          {
            ...nativeProof,
            logsUrl: nativeProof.logsUrl.replace("previews/feature-live-truth/", ""),
          },
        ],
      },
    },
  ])("does not apply a native URL to a fork, another branch, or a legacy build", (changedHead) => {
    const result = buildPullRequestCloudflareWorkerResources({
      head: changedHead,
      workers: [worker],
      nativePreviewUrlsByWorker,
    });
    expect(
      result.state === "available" ? result.workers[0].cloudflareBranchPreview : result,
    ).toEqual({ state: "absent" });
  });

  it("keeps the current build when a provider URL read fails", () => {
    expect(
      buildPullRequestCloudflareWorkerResources({
        head: nativeHead,
        workers: [worker],
        nativePreviewUrlsByWorker: new Map(),
      }),
    ).toEqual({
      state: "available",
      workers: [
        {
          workerId: worker.workerId,
          workerName: worker.workerName,
          rootDirectory: worker.rootDirectory,
          cloudflareBuild: {
            state: "available",
            uuid: nativeProof.buildUuid,
            buildState: nativeProof.buildState,
            logsUrl: nativeProof.logsUrl,
          },
          cloudflareBranchPreview: { state: "absent" },
        },
      ],
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
    baseRefOid: "a".repeat(40),
    headRefOid: "b".repeat(40),
    headRepository: { id: "R_base" },
    headRefName: "feature/live-truth",
    comments: {
      totalCount: 0,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [],
    },
    commits: {
      totalCount: 1,
      pageInfo: { hasPreviousPage: false, startCursor: "commit-cursor-1" },
      nodes: [{ commit: { id: "C_1", oid: "b".repeat(40) } }],
    },
  };

  it("derives resource identity from the server-observed GitHub node", () => {
    expect(
      normalizeGitHubPullRequestResourceHeadReads(
        { nodes: [providerHead] },
        { githubRepositoryDatabaseId: "42", pullRequestIds: ["PR_17"] },
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
          commitScan: {
            state: "available",
            commits: [{ id: "C_1", oid: "b".repeat(40) }],
            totalCount: 1,
            before: null,
          },
        },
      },
    ]);
  });

  it("rejects a pull request from another repository", () => {
    expect(() =>
      normalizeGitHubPullRequestResourceHeadReads(
        { nodes: [{ ...providerHead, repository: { databaseId: 99 } }] },
        { githubRepositoryDatabaseId: "42", pullRequestIds: ["PR_17"] },
      ),
    ).toThrow("GitHub pull request identity changed.");
  });

  it("isolates a closed or missing pull request from the rest of the batch", () => {
    expect(
      normalizeGitHubPullRequestResourceHeadReads(
        { nodes: [{ ...providerHead, state: "MERGED" }, null] },
        {
          githubRepositoryDatabaseId: "42",
          pullRequestIds: ["PR_17", "PR_18"],
        },
      ),
    ).toEqual([
      { state: "unavailable", pullRequestId: "PR_17" },
      { state: "unavailable", pullRequestId: "PR_18" },
    ]);
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

describe("buildPullRequestAlchemyPreview", () => {
  const [pr24, pr25, prod] = observedAlchemyStackReply.value.stages;
  // The stages as `readAlchemyStack` returns the captured reply: no value holds a secret, and the
  // run record of `prod` leaves its output.
  const stack = {
    state: "found" as const,
    stages: [
      {
        name: pr24.stage,
        run: { state: "none" as const },
        resources: pr24.resources,
        output: pr24.output,
      },
      {
        name: pr25.stage,
        run: { state: "none" as const },
        resources: pr25.resources,
        output: pr25.output,
      },
      {
        name: prod.stage,
        run: { state: "unknown" as const },
        resources: prod.resources,
        output: '{"url":"https://ideal-dolphin-15.convex.site"}',
      },
    ],
  };

  it("reads the preview of a pull request from its stage pr-<number>", () => {
    expect(buildPullRequestAlchemyPreview({ stack, pullRequestNumber: 24 })).toEqual({
      state: "available",
      url: "https://nautical-eagle-647.convex.site",
      convexDeployments: [
        { name: "nautical-eagle-647", url: "https://nautical-eagle-647.convex.cloud" },
      ],
    });
  });

  it("finds no preview for a pull request without a stage or a repository without a stack", () => {
    expect(buildPullRequestAlchemyPreview({ stack, pullRequestNumber: 23 })).toEqual({
      state: "absent",
    });
    expect(
      buildPullRequestAlchemyPreview({ stack: { state: "missing" }, pullRequestNumber: 24 }),
    ).toEqual({ state: "absent" });
  });

  it("reports a store that could not be read", () => {
    expect(
      buildPullRequestAlchemyPreview({ stack: { state: "failed" }, pullRequestNumber: 24 }),
    ).toEqual({ state: "unavailable" });
  });

  it("keeps the branch-name match only for Convex projects that the stack does not deploy", () => {
    const projects = [
      {
        convexProjectId: fakeConvexProjectId("base-alchemy"),
        teamId: "38516",
        projectId: "3245938",
        codeLocation: { kind: "config" as const, convexConfigPath: "convex.json" },
      },
      {
        convexProjectId: fakeConvexProjectId("other"),
        teamId: "38516",
        projectId: "3300002",
        codeLocation: { kind: "config" as const, convexConfigPath: "other/convex.json" },
      },
    ];

    expect(
      selectBranchPreviewConvexProjects({ stack, projects }).map((project) => project.projectId),
    ).toEqual(["3300002"]);
    for (const read of [{ state: "missing" as const }, { state: "failed" as const }]) {
      expect(selectBranchPreviewConvexProjects({ stack: read, projects })).toEqual(projects);
    }
  });
});
