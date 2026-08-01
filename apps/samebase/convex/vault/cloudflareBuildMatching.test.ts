import { describe, expect, it } from "vite-plus/test";

import type { CloudflareWorkerBuild } from "../cloudflareResources";
import { matchLatestCloudflareWorkerBuildForBranch } from "./cloudflareBuildMatching";

function cloudflareBuild(
  args: {
    buildUuid?: string | null;
    externalScriptId?: string;
    metadataDeployCommand?: string;
    repoId?: string;
    rootDirectory?: string;
    triggerDeployCommand?: string;
    triggerUuid?: string;
  } = {},
): CloudflareWorkerBuild {
  return {
    build_uuid: args.buildUuid === null ? undefined : (args.buildUuid ?? "production-build"),
    created_on: "2026-07-20T10:00:00.000Z",
    running_on: "2026-07-20T10:00:05.000Z",
    stopped_on: "2026-07-20T10:01:00.000Z",
    status: "stopped",
    build_outcome: "success",
    pull_request: null,
    build_trigger_metadata: {
      branch: "main",
      build_trigger_source: "push_event",
      commit_hash: "main123",
      deploy_command: args.metadataDeployCommand ?? "pnpm run deploy",
      root_directory: args.rootDirectory ?? "/",
    },
    trigger: {
      deploy_command: args.triggerDeployCommand ?? "pnpm run deploy",
      external_script_id: args.externalScriptId ?? "stable-worker-tag",
      repo_connection: { repo_id: args.repoId ?? "42" },
      root_directory: args.rootDirectory ?? "/",
      trigger_uuid: args.triggerUuid ?? "production-trigger",
    },
  };
}

const defaultBranchMatcherArgs = {
  branch: "main",
  worker: { workerTag: "stable-worker-tag", rootDirectory: "/" },
  ghRepoId: "42",
  triggerUuid: "production-trigger",
};

describe("matchLatestCloudflareWorkerBuildForBranch", () => {
  it("uses a valid default-branch build", () => {
    expect(
      matchLatestCloudflareWorkerBuildForBranch({
        builds: [cloudflareBuild()],
        ...defaultBranchMatcherArgs,
      }),
    ).toMatchObject({
      state: "available",
      buildUuid: "production-build",
      buildState: "success",
    });
  });

  it.each([
    ["Worker tag", cloudflareBuild({ externalScriptId: "other-worker-tag" })],
    ["repository", cloudflareBuild({ repoId: "other-repository" })],
    ["root directory", cloudflareBuild({ rootDirectory: "apps/docs" })],
    ["trigger", cloudflareBuild({ triggerUuid: "other-trigger" })],
    ["missing build UUID", cloudflareBuild({ buildUuid: null })],
    ["blank build UUID", cloudflareBuild({ buildUuid: " " })],
    ["deploy command", cloudflareBuild({ metadataDeployCommand: "pnpm run deploy:other" })],
  ] as const)("rejects an invalid default-branch build: %s", (_label, build) => {
    expect(
      matchLatestCloudflareWorkerBuildForBranch({
        builds: [build],
        ...defaultBranchMatcherArgs,
      }),
    ).toEqual({ state: "provider_disagreement" });
  });
});
