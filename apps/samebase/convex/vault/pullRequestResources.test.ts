import { describe, expect, it } from "vite-plus/test";

import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import type { CloudflareWorkerBuild } from "../cloudflareResources";
import {
  matchCloudflareWorkerBuild,
  normalizeGitHubPullRequestResourceHeadReads,
  recoverGitHubPullRequestResourceHeadsFromError,
  resolveConvexPreviewDeployment,
  validatePullRequestResourceIds,
  type PullRequestResourceHead,
} from "./pullRequestResources";

const head: PullRequestResourceHead = {
  id: "PR_17",
  url: "https://github.com/samebase/samebase/pull/17",
  isCrossRepository: false,
  headRepositoryId: "R_base",
  headRefName: "feature/live-truth",
  headRefOid: "abc123",
};

function cloudflareBuild(
  args: {
    buildUuid?: string;
    commitHash?: string;
    createdOn?: string;
    externalScriptId?: string;
    metadataDeployCommand?: string;
    metadataRootDirectory?: string;
    pullRequestUrl?: string;
    repoId?: string;
    rootDirectory?: string;
    triggerDeployCommand?: string;
    triggerUuid?: string;
  } = {},
): CloudflareWorkerBuild {
  const rootDirectory = args.rootDirectory ?? "/";
  return {
    build_uuid: args.buildUuid ?? "build-1",
    created_on: args.createdOn ?? "2026-07-20T10:00:00.000Z",
    running_on: "2026-07-20T10:00:05.000Z",
    stopped_on: "2026-07-20T10:01:00.000Z",
    status: "stopped",
    build_outcome: "success",
    pull_request: {
      pull_request_url: args.pullRequestUrl ?? "https://github.com/samebase/samebase/pull/17",
    },
    build_trigger_metadata: {
      branch: "feature/live-truth",
      build_trigger_source: "pull_request",
      commit_hash: args.commitHash ?? "abc123",
      deploy_command: args.metadataDeployCommand ?? "pnpm run deploy:preview",
      root_directory: args.metadataRootDirectory ?? rootDirectory,
    },
    trigger: {
      deploy_command: args.triggerDeployCommand ?? "pnpm run deploy:preview",
      external_script_id: args.externalScriptId ?? "stable-worker-tag",
      repo_connection: { repo_id: args.repoId ?? "42" },
      root_directory: rootDirectory,
      trigger_uuid: args.triggerUuid ?? "preview-trigger",
    },
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
        path: ["nodes"],
        extensions: {},
        locations: [{ line: 1, column: 34 }],
      },
    ],
  });
}

describe("matchCloudflareWorkerBuild", () => {
  it("attributes an exact PR build through the immutable Worker and repository identities", () => {
    expect(
      matchCloudflareWorkerBuild({
        builds: [cloudflareBuild()],
        head,
        worker: { workerTag: "stable-worker-tag", rootDirectory: "/" },
        ghRepoId: "42",
        previewTriggerUuid: "preview-trigger",
      }),
    ).toEqual({
      state: "available",
      buildState: "success",
      createdAt: Date.parse("2026-07-20T10:00:00.000Z"),
      finishedAt: Date.parse("2026-07-20T10:01:00.000Z"),
    });
  });

  it.each([
    ["Worker tag", { externalScriptId: "replacement-tag" }],
    ["repository", { repoId: "99" }],
    ["Workers Builds root", { rootDirectory: "apps/docs" }],
    ["preview trigger", { triggerUuid: "production-trigger" }],
  ])("refuses exact commit evidence when the %s disagrees", (_label, overrides) => {
    expect(
      matchCloudflareWorkerBuild({
        builds: [cloudflareBuild(overrides)],
        head,
        worker: { workerTag: "stable-worker-tag", rootDirectory: "/" },
        ghRepoId: "42",
        previewTriggerUuid: "preview-trigger",
      }),
    ).toEqual({ state: "provider_disagreement" });
  });

  it("does not treat another PR or commit as an attached build", () => {
    expect(
      matchCloudflareWorkerBuild({
        builds: [
          cloudflareBuild({
            pullRequestUrl: "https://github.com/samebase/samebase/pull/18",
            commitHash: "def456",
          }),
        ],
        head,
        worker: { workerTag: "stable-worker-tag", rootDirectory: "/" },
        ghRepoId: "42",
        previewTriggerUuid: "preview-trigger",
      }),
    ).toEqual({ state: "absent" });
  });

  it("selects the newest exact build deterministically", () => {
    const result = matchCloudflareWorkerBuild({
      builds: [
        cloudflareBuild({
          buildUuid: "older",
          createdOn: "2026-07-20T09:00:00.000Z",
        }),
        cloudflareBuild({
          buildUuid: "newer",
          createdOn: "2026-07-20T10:00:00.000Z",
        }),
      ],
      head,
      worker: { workerTag: "stable-worker-tag", rootDirectory: "/" },
      ghRepoId: "42",
      previewTriggerUuid: "preview-trigger",
    });

    expect(result).toMatchObject({
      state: "available",
      createdAt: Date.parse("2026-07-20T10:00:00.000Z"),
    });
  });

  it("normalizes equivalent Cloudflare root spellings", () => {
    expect(
      matchCloudflareWorkerBuild({
        builds: [
          cloudflareBuild({
            rootDirectory: "./apps/site/",
            metadataRootDirectory: "/apps/site",
          }),
        ],
        head,
        worker: { workerTag: "stable-worker-tag", rootDirectory: "apps/site" },
        ghRepoId: "42",
        previewTriggerUuid: "preview-trigger",
      }),
    ).toMatchObject({ state: "available" });
  });

  it("rejects build metadata that disagrees with its trigger deploy command", () => {
    expect(
      matchCloudflareWorkerBuild({
        builds: [cloudflareBuild({ metadataDeployCommand: "pnpm run deploy:other" })],
        head,
        worker: { workerTag: "stable-worker-tag", rootDirectory: "/" },
        ghRepoId: "42",
        previewTriggerUuid: "preview-trigger",
      }),
    ).toEqual({ state: "provider_disagreement" });
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
  };

  it("derives resource identity from the server-observed GitHub node", () => {
    expect(
      normalizeGitHubPullRequestResourceHeadReads(
        { nodes: [providerHead] },
        { ghRepoId: "42", pullRequestIds: ["PR_17"] },
      ),
    ).toEqual([{ state: "available", head }]);
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
