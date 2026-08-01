import { describe, expect, it } from "vite-plus/test";

import type { CloudflareWorkerBuild } from "../cloudflareResources";
import { matchLatestCloudflareWorkerBuildForBranch } from "./cloudflareBuildMatching";

function cloudflareBuild(
  args: {
    buildUuid?: string;
    branch?: string;
    commitHash?: string;
    metadataDeployCommand?: string;
    triggerDeployCommand?: string;
    triggerUuid?: string;
  } = {},
): CloudflareWorkerBuild {
  return {
    build_uuid: args.buildUuid ?? "build-1",
    created_on: "2026-07-20T10:00:00.000Z",
    running_on: "2026-07-20T10:00:05.000Z",
    stopped_on: "2026-07-20T10:01:00.000Z",
    status: "stopped",
    build_outcome: "success",
    pull_request: null,
    build_trigger_metadata: {
      branch: args.branch ?? "feature/live-truth",
      build_trigger_source: "push_event",
      commit_hash: args.commitHash ?? "abc123",
      deploy_command: args.metadataDeployCommand ?? "pnpm run deploy:preview",
      root_directory: "/",
    },
    trigger: {
      deploy_command: args.triggerDeployCommand ?? "pnpm run deploy:preview",
      external_script_id: "stable-worker-tag",
      repo_connection: { repo_id: "42" },
      root_directory: "/",
      trigger_uuid: args.triggerUuid ?? "preview-trigger",
    },
  };
}

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
