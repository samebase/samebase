import { describe, expect, it } from "vite-plus/test";

import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import {
  normalizeGitHubPullRequestResourceHeadReads,
  recoverGitHubPullRequestResourceHeadsFromError,
  resolveCloudflareBranchPreviewUrl,
  resolveConvexPreviewDeployment,
  validatePullRequestResourceIds,
  type PullRequestResourceHead,
} from "./pullRequestResources";
import { buildCloudflareBuildLogsUrl } from "./providerDashboardUrls";

const head: PullRequestResourceHead = {
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
        path: ["nodes"],
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
    ).toEqual([{ state: "available", head }]);
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
        head: { ...head, cloudflareChecks: { state: "unavailable" } },
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
      { state: "available", head },
      { state: "unavailable", pullRequestId: "PR_18" },
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
  const successfulBuild = {
    buildState: "success" as const,
    createdAt: Date.parse("2026-07-20T10:00:00.000Z"),
    finishedAt: Date.parse("2026-07-20T10:01:00.000Z"),
  };

  it("requires the branch identifier, reference, and deploy time to match one build", () => {
    expect(
      resolveConvexPreviewDeployment({
        deployments: [previewDeployment()],
        head,
        build: successfulBuild,
      }),
    ).toMatchObject({
      state: "available",
      deployment: { name: "live-truth-91" },
    });
  });

  it("never resolves a fork preview by branch name", () => {
    expect(
      resolveConvexPreviewDeployment({
        deployments: [previewDeployment()],
        head: { ...head, isCrossRepository: true, headRepositoryId: "R_fork" },
        build: successfulBuild,
      }),
    ).toEqual({ state: "unavailable", reason: "fork_head" });
  });

  it("reports absence when the deployment was not updated inside the build window", () => {
    expect(
      resolveConvexPreviewDeployment({
        deployments: [
          previewDeployment({
            lastDeployTime: Date.parse("2026-07-20T09:59:59.000Z"),
          }),
        ],
        head,
        build: successfulBuild,
      }),
    ).toEqual({ state: "absent" });
  });

  it("refuses ambiguous preview deployments", () => {
    expect(
      resolveConvexPreviewDeployment({
        deployments: [previewDeployment({ id: "91" }), previewDeployment({ id: "92" })],
        head,
        build: successfulBuild,
      }),
    ).toEqual({ state: "unavailable", reason: "deployment_ambiguous" });
  });
});
