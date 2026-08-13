import { type Infer, v } from "convex/values";

import { normalizeCloudflareBuildRoot, type CloudflareWorkerBuild } from "../cloudflareResources";

const { literal, union } = v;

export const vCloudflareBuildState = union(
  literal("queued"),
  literal("running"),
  literal("success"),
  literal("failure"),
  literal("cancelled"),
  literal("skipped"),
  literal("unknown"),
);
export type CloudflareBuildState = Infer<typeof vCloudflareBuildState>;

export const vCloudflareBuildDisagreementReason = union(
  literal("missing_trigger"),
  literal("missing_build_uuid"),
  literal("invalid_created_on"),
  literal("invalid_root_directory"),
  literal("worker_tag_mismatch"),
  literal("trigger_uuid_mismatch"),
  literal("repository_id_mismatch"),
  literal("trigger_root_directory_mismatch"),
  literal("metadata_root_directory_mismatch"),
  literal("missing_trigger_deploy_command"),
  literal("deploy_command_mismatch"),
);
export type CloudflareBuildDisagreementReason = Infer<typeof vCloudflareBuildDisagreementReason>;

export type CloudflareBuildMatch =
  | {
      state: "available";
      buildUuid: string;
      buildState: CloudflareBuildState;
      createdAt: number;
      finishedAt: number | null;
    }
  | { state: "absent" }
  | { state: "provider_disagreement"; reason: CloudflareBuildDisagreementReason };

function providerTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function classifyCloudflareBuildState(build: CloudflareWorkerBuild): CloudflareBuildState {
  if (build.status !== "stopped") {
    switch (build.status) {
      case "queued":
        return "queued";
      case "initializing":
      case "running":
        return "running";
      case undefined:
        return "unknown";
      default:
        build.status satisfies never;
        return "unknown";
    }
  }

  switch (build.build_outcome) {
    case "success":
      return "success";
    case "fail":
    case "terminated":
      return "failure";
    case "cancelled":
      return "cancelled";
    case "skipped":
      return "skipped";
    case null:
    case undefined:
      return "unknown";
    default:
      build.build_outcome satisfies never;
      return "unknown";
  }
}

export function matchLatestCloudflareWorkerBuildForBranch(args: {
  builds: readonly CloudflareWorkerBuild[];
  branch: string;
  worker: {
    workerTag: string;
    rootDirectory: string;
  };
  ghRepoId: string;
  triggerUuid: string;
}): CloudflareBuildMatch {
  const candidates = args.builds
    .flatMap((build) => {
      const metadata = build.build_trigger_metadata;
      return metadata?.branch === args.branch
        ? [{ build, metadata, createdAt: providerTimestamp(build.created_on) }]
        : [];
    })
    .sort(
      (left, right) =>
        (right.createdAt ?? -1) - (left.createdAt ?? -1) ||
        (left.build.build_uuid ?? "").localeCompare(right.build.build_uuid ?? ""),
    );
  const candidate = candidates.at(0);
  if (candidate === undefined) {
    return { state: "absent" };
  }

  const build = candidate.build;
  const trigger = build.trigger;
  const metadata = candidate.metadata;
  const createdAt = candidate.createdAt;
  const finishedAt = providerTimestamp(build.stopped_on);
  const buildUuid = build.build_uuid?.trim();
  const rootDirectory = normalizeCloudflareBuildRoot(args.worker.rootDirectory);
  const triggerRootDirectory = normalizeCloudflareBuildRoot(trigger?.root_directory);
  const metadataRootDirectory = normalizeCloudflareBuildRoot(metadata.root_directory);
  const triggerDeployCommand = trigger?.deploy_command?.trim();
  const metadataDeployCommand = metadata.deploy_command?.trim();
  if (!trigger) {
    return { state: "provider_disagreement", reason: "missing_trigger" };
  }
  if (!buildUuid) {
    return { state: "provider_disagreement", reason: "missing_build_uuid" };
  }
  if (createdAt === null) {
    return { state: "provider_disagreement", reason: "invalid_created_on" };
  }
  if (rootDirectory === null) {
    return { state: "provider_disagreement", reason: "invalid_root_directory" };
  }
  if (trigger.external_script_id !== args.worker.workerTag) {
    return { state: "provider_disagreement", reason: "worker_tag_mismatch" };
  }
  if (trigger.trigger_uuid !== args.triggerUuid) {
    return { state: "provider_disagreement", reason: "trigger_uuid_mismatch" };
  }
  if (trigger.repo_connection?.repo_id !== args.ghRepoId) {
    return { state: "provider_disagreement", reason: "repository_id_mismatch" };
  }
  if (triggerRootDirectory !== rootDirectory) {
    return {
      state: "provider_disagreement",
      reason: "trigger_root_directory_mismatch",
    };
  }
  if (metadataRootDirectory !== rootDirectory) {
    return {
      state: "provider_disagreement",
      reason: "metadata_root_directory_mismatch",
    };
  }
  if (!triggerDeployCommand) {
    return {
      state: "provider_disagreement",
      reason: "missing_trigger_deploy_command",
    };
  }
  if (triggerDeployCommand !== metadataDeployCommand) {
    return { state: "provider_disagreement", reason: "deploy_command_mismatch" };
  }

  return {
    state: "available",
    buildUuid,
    buildState: classifyCloudflareBuildState(build),
    createdAt,
    finishedAt,
  };
}
