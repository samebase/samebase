import { describe, expect, it } from "vite-plus/test";

import type { CloudflareWorkerBuild } from "../cloudflareResources";
import {
  observedCompletedWorkerBuild,
  observedRunningWorkerBuild,
} from "../cloudflareApi/fixtures/observedWorkerBuilds";
import { matchLatestCloudflareWorkerBuildForBranch } from "./cloudflareBuildMatching";

function observedCompletedCloudflareBuild(
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
    ...observedCompletedWorkerBuild,
    build_uuid:
      args.buildUuid === null
        ? undefined
        : (args.buildUuid ?? observedCompletedWorkerBuild.build_uuid),
    build_trigger_metadata: {
      ...observedCompletedWorkerBuild.build_trigger_metadata,
      deploy_command: args.metadataDeployCommand ?? "pnpm run deploy",
      root_directory: args.rootDirectory ?? "apps/samebase",
    },
    trigger: {
      ...observedCompletedWorkerBuild.trigger,
      deploy_command: args.triggerDeployCommand ?? "pnpm run deploy",
      external_script_id: args.externalScriptId ?? "470db9109dce4196af330cdd7be89518",
      repo_connection: {
        ...observedCompletedWorkerBuild.trigger.repo_connection,
        repo_id: args.repoId ?? "1021726325",
      },
      root_directory: args.rootDirectory ?? "apps/samebase",
      trigger_uuid: args.triggerUuid ?? "b595a215-7b9b-4a04-a55d-578f39ca4335",
    },
  };
}

const defaultBranchMatcherArgs = {
  branch: "main",
  worker: {
    workerTag: "470db9109dce4196af330cdd7be89518",
    rootDirectory: "apps/samebase",
  },
  ghRepoId: "1021726325",
  triggerUuid: "b595a215-7b9b-4a04-a55d-578f39ca4335",
};

describe("matchLatestCloudflareWorkerBuildForBranch", () => {
  it("uses a valid default-branch build", () => {
    expect(
      matchLatestCloudflareWorkerBuildForBranch({
        builds: [observedCompletedCloudflareBuild()],
        ...defaultBranchMatcherArgs,
      }),
    ).toMatchObject({
      state: "available",
      buildUuid: "f9e12f48-dd63-4e28-aef7-ece63d11539d",
      buildState: "success",
    });
  });

  it("uses an observed running branch build", () => {
    expect(
      matchLatestCloudflareWorkerBuildForBranch({
        builds: [observedRunningWorkerBuild],
        branch: "codex-show-active-build-status",
        worker: {
          workerTag: "470db9109dce4196af330cdd7be89518",
          rootDirectory: "apps/samebase",
        },
        ghRepoId: "1021726325",
        triggerUuid: "3ff74fd1-50c4-43d2-9fd3-72086962b3e3",
      }),
    ).toEqual({
      state: "available",
      buildUuid: "89fa2f0f-ca7c-4f14-af5d-6f95714b68c3",
      buildState: "running",
      createdAt: Date.parse("2026-08-02T21:54:36.933Z"),
      finishedAt: null,
    });
  });

  it.each([
    ["Worker tag", observedCompletedCloudflareBuild({ externalScriptId: "other-worker-tag" })],
    ["repository", observedCompletedCloudflareBuild({ repoId: "other-repository" })],
    ["root directory", observedCompletedCloudflareBuild({ rootDirectory: "apps/docs" })],
    ["trigger", observedCompletedCloudflareBuild({ triggerUuid: "other-trigger" })],
    ["missing build UUID", observedCompletedCloudflareBuild({ buildUuid: null })],
    ["blank build UUID", observedCompletedCloudflareBuild({ buildUuid: " " })],
    [
      "deploy command",
      observedCompletedCloudflareBuild({ metadataDeployCommand: "pnpm run deploy:other" }),
    ],
  ] as const)("rejects an invalid default-branch build: %s", (_label, build) => {
    expect(
      matchLatestCloudflareWorkerBuildForBranch({
        builds: [build],
        ...defaultBranchMatcherArgs,
      }),
    ).toEqual({ state: "provider_disagreement" });
  });
});
