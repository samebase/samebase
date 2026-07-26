import { describe, expect, it } from "vite-plus/test";

import type { CloudflareWorkerBuild } from "../cloudflareResources";
import {
  matchCloudflareWorkerBuildForCommit,
  matchLatestCloudflareWorkerBuildForBranch,
} from "./cloudflareBuildMatching";

function cloudflareBuild(
  args: {
    buildUuid?: string;
    branch?: string;
    buildTriggerSource?: "manual" | "push_event";
    commitHash?: string;
    createdOn?: string;
    externalScriptId?: string;
    metadataDeployCommand?: string;
    metadataRootDirectory?: string;
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
    pull_request: null,
    build_trigger_metadata: {
      branch: args.branch ?? "feature/live-truth",
      build_trigger_source: args.buildTriggerSource ?? "push_event",
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

describe("matchCloudflareWorkerBuildForCommit", () => {
  it("attributes an exact PR build through the immutable Worker and repository identities", () => {
    expect(
      matchCloudflareWorkerBuildForCommit({
        builds: [cloudflareBuild()],
        branch: "feature/live-truth",
        commitHash: "abc123",
        worker: { workerTag: "stable-worker-tag", rootDirectory: "/" },
        ghRepoId: "42",
        triggerUuid: "preview-trigger",
      }),
    ).toEqual({
      state: "available",
      buildUuid: "build-1",
      buildState: "success",
      createdAt: Date.parse("2026-07-20T10:00:00.000Z"),
      finishedAt: Date.parse("2026-07-20T10:01:00.000Z"),
    });
  });

  it.each([
    ["build UUID", { buildUuid: "" }],
    ["Worker tag", { externalScriptId: "replacement-tag" }],
    ["repository", { repoId: "99" }],
    ["Workers Builds root", { rootDirectory: "apps/docs" }],
    ["preview trigger", { triggerUuid: "production-trigger" }],
  ])("refuses exact commit evidence when the %s disagrees", (_label, overrides) => {
    expect(
      matchCloudflareWorkerBuildForCommit({
        builds: [cloudflareBuild(overrides)],
        branch: "feature/live-truth",
        commitHash: "abc123",
        worker: { workerTag: "stable-worker-tag", rootDirectory: "/" },
        ghRepoId: "42",
        triggerUuid: "preview-trigger",
      }),
    ).toEqual({ state: "provider_disagreement" });
  });

  it("does not treat another branch or commit as an attached build", () => {
    expect(
      matchCloudflareWorkerBuildForCommit({
        builds: [
          cloudflareBuild({
            branch: "feature/other",
          }),
          cloudflareBuild({
            commitHash: "def456",
          }),
        ],
        branch: "feature/live-truth",
        commitHash: "abc123",
        worker: { workerTag: "stable-worker-tag", rootDirectory: "/" },
        ghRepoId: "42",
        triggerUuid: "preview-trigger",
      }),
    ).toEqual({ state: "absent" });
  });

  it("accepts a manual rebuild for the exact branch head", () => {
    expect(
      matchCloudflareWorkerBuildForCommit({
        builds: [cloudflareBuild({ buildTriggerSource: "manual" })],
        branch: "feature/live-truth",
        commitHash: "abc123",
        worker: { workerTag: "stable-worker-tag", rootDirectory: "/" },
        ghRepoId: "42",
        triggerUuid: "preview-trigger",
      }),
    ).toMatchObject({ state: "available", buildState: "success" });
  });

  it("selects the newest exact build deterministically", () => {
    const result = matchCloudflareWorkerBuildForCommit({
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
      branch: "feature/live-truth",
      commitHash: "abc123",
      worker: { workerTag: "stable-worker-tag", rootDirectory: "/" },
      ghRepoId: "42",
      triggerUuid: "preview-trigger",
    });

    expect(result).toMatchObject({
      state: "available",
      createdAt: Date.parse("2026-07-20T10:00:00.000Z"),
    });
  });

  it("normalizes equivalent Cloudflare root spellings", () => {
    expect(
      matchCloudflareWorkerBuildForCommit({
        builds: [
          cloudflareBuild({
            rootDirectory: "./apps/site/",
            metadataRootDirectory: "/apps/site",
          }),
        ],
        branch: "feature/live-truth",
        commitHash: "abc123",
        worker: { workerTag: "stable-worker-tag", rootDirectory: "apps/site" },
        ghRepoId: "42",
        triggerUuid: "preview-trigger",
      }),
    ).toMatchObject({ state: "available" });
  });

  it("rejects build metadata that disagrees with its trigger deploy command", () => {
    expect(
      matchCloudflareWorkerBuildForCommit({
        builds: [cloudflareBuild({ metadataDeployCommand: "pnpm run deploy:other" })],
        branch: "feature/live-truth",
        commitHash: "abc123",
        worker: { workerTag: "stable-worker-tag", rootDirectory: "/" },
        ghRepoId: "42",
        triggerUuid: "preview-trigger",
      }),
    ).toEqual({ state: "provider_disagreement" });
  });
});

describe("matchLatestCloudflareWorkerBuildForBranch", () => {
  it("selects the newest production-trigger build for the default branch", () => {
    expect(
      matchLatestCloudflareWorkerBuildForBranch({
        builds: [
          cloudflareBuild({
            branch: "main",
            buildUuid: "production-build",
            commitHash: "main123",
            metadataDeployCommand: "pnpm run deploy",
            triggerDeployCommand: "pnpm run deploy",
            triggerUuid: "production-trigger",
          }),
        ],
        branch: "main",
        worker: { workerTag: "stable-worker-tag", rootDirectory: "/" },
        ghRepoId: "42",
        triggerUuid: "production-trigger",
      }),
    ).toMatchObject({
      state: "available",
      buildUuid: "production-build",
      buildState: "success",
    });
  });
});
