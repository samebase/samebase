import { describe, expect, it } from "vite-plus/test";

import type { ConvexCloudDeployment } from "../convexManagementApi/client";
import type { CloudflareWorkerBuild } from "../cloudflareResources";
import type { PullRequestHeadIdentity } from "../repositoryPullRequestObservations";
import {
  matchCloudflareWorkerBuild,
  resolveConvexPreviewDeployment,
} from "./pullRequestResourceObservations";

const head: PullRequestHeadIdentity = {
  baseRepositoryNodeId: "R_base",
  pullRequestNodeId: "PR_17",
  pullRequestNumber: 17,
  pullRequestUrl: "https://github.com/samebase/samebase/pull/17",
  headRepositoryNodeId: "R_base",
  headRefName: "feature/live-truth",
  headCommitNodeId: "C_head",
  headOid: "abc123",
};

function cloudflareBuild(
  args: {
    buildUuid?: string;
    commitHash?: string;
    createdOn?: string;
    externalScriptId?: string;
    pullRequestUrl?: string;
    repoId?: string;
    rootDirectory?: string;
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
      deploy_command: "pnpm run deploy:preview",
      root_directory: rootDirectory,
    },
    trigger: {
      deploy_command: "pnpm run deploy:preview",
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

describe("matchCloudflareWorkerBuild", () => {
  it("attributes an exact PR build through the immutable Worker and repository identities", () => {
    expect(
      matchCloudflareWorkerBuild({
        builds: [cloudflareBuild()],
        head,
        worker: { workerTag: "stable-worker-tag", rootDirectory: "/" },
        ghRepoId: "42",
        previewTriggerUuid: "preview-trigger",
        previewDeployCommand: "pnpm run deploy:preview",
      }),
    ).toEqual({
      state: "available",
      buildUuid: "build-1",
      buildState: "success",
      createdAt: Date.parse("2026-07-20T10:00:00.000Z"),
      startedAt: Date.parse("2026-07-20T10:00:05.000Z"),
      finishedAt: Date.parse("2026-07-20T10:01:00.000Z"),
    });
  });

  it.each([
    ["Worker tag", { externalScriptId: "replacement-tag" }],
    ["repository", { repoId: "99" }],
    ["app root", { rootDirectory: "apps/docs" }],
    ["preview trigger", { triggerUuid: "production-trigger" }],
  ])("refuses exact commit evidence when the %s disagrees", (_label, overrides) => {
    expect(
      matchCloudflareWorkerBuild({
        builds: [cloudflareBuild(overrides)],
        head,
        worker: { workerTag: "stable-worker-tag", rootDirectory: "/" },
        ghRepoId: "42",
        previewTriggerUuid: "preview-trigger",
        previewDeployCommand: "pnpm run deploy:preview",
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
        previewDeployCommand: "pnpm run deploy:preview",
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
      previewDeployCommand: "pnpm run deploy:preview",
    });

    expect(result).toMatchObject({ state: "available", buildUuid: "newer" });
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
        head: { ...head, headRepositoryNodeId: "R_fork" },
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
