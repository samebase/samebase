import { describe, expect, it } from "vite-plus/test";

import type { CloudflareWorkerBuild } from "../cloudflareResources";
import {
  observedCompletedWorkerBuild,
  observedNativePreviewsProductionBuild,
  observedRunningWorkerBuild,
} from "../cloudflareApi/fixtures/observedWorkerBuilds";
import { matchLatestCloudflareWorkerBuildForBranch } from "./cloudflareBuildMatching";
import type { CloudflareBuildDisagreementReason } from "./providerObservationModel";

function observedCompletedCloudflareBuild(
  args: {
    buildUuid?: string | null;
    createdOn?: string | null;
    externalScriptId?: string;
    includeTrigger?: boolean;
    metadataDeployCommand?: string;
    metadataRootDirectory?: string;
    repoId?: string;
    rootDirectory?: string;
    triggerDeployCommand?: string | null;
    triggerRootDirectory?: string;
  } = {},
): CloudflareWorkerBuild {
  return {
    ...observedCompletedWorkerBuild,
    build_uuid:
      args.buildUuid === null
        ? undefined
        : (args.buildUuid ?? observedCompletedWorkerBuild.build_uuid),
    created_on:
      args.createdOn === null
        ? undefined
        : (args.createdOn ?? observedCompletedWorkerBuild.created_on),
    build_trigger_metadata: {
      ...observedCompletedWorkerBuild.build_trigger_metadata,
      deploy_command: args.metadataDeployCommand ?? "pnpm run deploy",
      root_directory: args.metadataRootDirectory ?? args.rootDirectory ?? "apps/samebase",
    },
    trigger:
      args.includeTrigger === false
        ? undefined
        : {
            ...observedCompletedWorkerBuild.trigger,
            deploy_command:
              args.triggerDeployCommand === null
                ? undefined
                : (args.triggerDeployCommand ?? "pnpm run deploy"),
            external_script_id: args.externalScriptId ?? "470db9109dce4196af330cdd7be89518",
            repo_connection: {
              ...observedCompletedWorkerBuild.trigger.repo_connection,
              repo_id: args.repoId ?? "1021726325",
            },
            root_directory: args.triggerRootDirectory ?? args.rootDirectory ?? "apps/samebase",
          },
  };
}

const defaultBranchMatcherArgs = {
  branch: "main",
  worker: {
    workerTag: "470db9109dce4196af330cdd7be89518",
    rootDirectory: "apps/samebase",
  },
  githubRepositoryDatabaseId: "1021726325",
};

describe("matchLatestCloudflareWorkerBuildForBranch", () => {
  it("uses production history after native Worker Previews are enabled", () => {
    expect(
      matchLatestCloudflareWorkerBuildForBranch({
        builds: [observedNativePreviewsProductionBuild],
        branch: "main",
        worker: { workerTag: "d8f877365405479ba51bd8f96fcdc156", rootDirectory: "/" },
        githubRepositoryDatabaseId: "993742136",
      }),
    ).toEqual({
      state: "available",
      buildUuid: "feb42f59-fbea-4f1f-95a1-8bf8598df55e",
      buildState: "success",
      commitHash: "6f242965dfc3aa68e26b4207f1747ee43799a0f4",
      createdAt: Date.parse("2026-09-29T20:46:01.006Z"),
      finishedAt: Date.parse("2026-09-29T20:46:56.238Z"),
    });
  });

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
        githubRepositoryDatabaseId: "1021726325",
      }),
    ).toEqual({
      state: "available",
      buildUuid: "89fa2f0f-ca7c-4f14-af5d-6f95714b68c3",
      buildState: "running",
      commitHash: "8a83aec75b99f8474652bd51dc945735c3e397ec",
      createdAt: Date.parse("2026-08-02T21:54:36.933Z"),
      finishedAt: null,
    });
  });

  it.each([
    [
      "missing trigger",
      observedCompletedCloudflareBuild({ includeTrigger: false }),
      "missing_trigger",
    ],
    [
      "missing build UUID",
      observedCompletedCloudflareBuild({ buildUuid: null }),
      "missing_build_uuid",
    ],
    [
      "blank build UUID",
      observedCompletedCloudflareBuild({ buildUuid: " " }),
      "missing_build_uuid",
    ],
    [
      "invalid creation time",
      observedCompletedCloudflareBuild({ createdOn: "not-a-time" }),
      "invalid_created_on",
    ],
    [
      "Worker tag",
      observedCompletedCloudflareBuild({ externalScriptId: "other-worker-tag" }),
      "worker_tag_mismatch",
    ],
    [
      "repository",
      observedCompletedCloudflareBuild({ repoId: "other-repository" }),
      "repository_id_mismatch",
    ],
    [
      "trigger root directory",
      observedCompletedCloudflareBuild({ triggerRootDirectory: "apps/docs" }),
      "trigger_root_directory_mismatch",
    ],
    [
      "metadata root directory",
      observedCompletedCloudflareBuild({ metadataRootDirectory: "apps/docs" }),
      "metadata_root_directory_mismatch",
    ],
    [
      "missing trigger deploy command",
      observedCompletedCloudflareBuild({ triggerDeployCommand: null }),
      "missing_trigger_deploy_command",
    ],
    [
      "deploy command",
      observedCompletedCloudflareBuild({ metadataDeployCommand: "pnpm run deploy:other" }),
      "deploy_command_mismatch",
    ],
  ] satisfies readonly [string, CloudflareWorkerBuild, CloudflareBuildDisagreementReason][])(
    "rejects an invalid default-branch build: %s",
    (_label, build, reason) => {
      expect(
        matchLatestCloudflareWorkerBuildForBranch({
          builds: [build],
          ...defaultBranchMatcherArgs,
        }),
      ).toEqual({ state: "provider_disagreement", reasons: [reason] });
    },
  );

  it("rejects an invalid expected root directory", () => {
    expect(
      matchLatestCloudflareWorkerBuildForBranch({
        builds: [observedCompletedCloudflareBuild()],
        ...defaultBranchMatcherArgs,
        worker: {
          ...defaultBranchMatcherArgs.worker,
          rootDirectory: "../apps/samebase",
        },
      }),
    ).toEqual({ state: "provider_disagreement", reasons: ["invalid_root_directory"] });
  });

  it("reports all independent disagreements without dependent errors", () => {
    expect(
      matchLatestCloudflareWorkerBuildForBranch({
        builds: [
          observedCompletedCloudflareBuild({
            buildUuid: " ",
            createdOn: "not-a-time",
            externalScriptId: "other-worker-tag",
            metadataRootDirectory: "apps/docs",
            repoId: "other-repository",
            triggerDeployCommand: null,
            triggerRootDirectory: "packages/api",
          }),
        ],
        ...defaultBranchMatcherArgs,
      }),
    ).toEqual({
      state: "provider_disagreement",
      reasons: [
        "missing_build_uuid",
        "invalid_created_on",
        "worker_tag_mismatch",
        "repository_id_mismatch",
        "trigger_root_directory_mismatch",
        "metadata_root_directory_mismatch",
        "missing_trigger_deploy_command",
      ],
    });
  });
});
