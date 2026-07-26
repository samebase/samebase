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

export type CloudflareBuildMatch =
  | {
      state: "available";
      buildUuid: string;
      buildState: CloudflareBuildState;
      createdAt: number;
      finishedAt: number | null;
    }
  | { state: "absent" }
  | { state: "provider_disagreement" };

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
    case undefined:
      return "unknown";
    default:
      build.build_outcome satisfies never;
      return "unknown";
  }
}

function matchCloudflareWorkerBuildCandidate(args: {
  builds: readonly CloudflareWorkerBuild[];
  branch: string;
  commitHash: string | null;
  worker: {
    workerTag: string;
    rootDirectory: string;
  };
  ghRepoId: string;
  triggerUuid: string;
}): CloudflareBuildMatch {
  const candidates = args.builds
    .filter((build) => {
      const metadata = build.build_trigger_metadata;
      return (
        metadata?.branch === args.branch &&
        (args.commitHash === null || metadata.commit_hash === args.commitHash)
      );
    })
    .map((build) => ({
      build,
      createdAt: providerTimestamp(build.created_on),
    }))
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
  const metadata = build.build_trigger_metadata;
  const createdAt = candidate.createdAt;
  const finishedAt = providerTimestamp(build.stopped_on);
  const buildUuid = build.build_uuid?.trim();
  const rootDirectory = normalizeCloudflareBuildRoot(args.worker.rootDirectory);
  const triggerRootDirectory = normalizeCloudflareBuildRoot(trigger?.root_directory);
  const metadataRootDirectory = normalizeCloudflareBuildRoot(metadata?.root_directory);
  const triggerDeployCommand = trigger?.deploy_command?.trim();
  const metadataDeployCommand = metadata?.deploy_command?.trim();
  if (
    !trigger ||
    !metadata ||
    !buildUuid ||
    createdAt === null ||
    rootDirectory === null ||
    trigger.external_script_id !== args.worker.workerTag ||
    trigger.trigger_uuid !== args.triggerUuid ||
    trigger.repo_connection?.repo_id !== args.ghRepoId ||
    triggerRootDirectory !== rootDirectory ||
    metadataRootDirectory !== rootDirectory ||
    !triggerDeployCommand ||
    triggerDeployCommand !== metadataDeployCommand
  ) {
    return { state: "provider_disagreement" };
  }

  return {
    state: "available",
    buildUuid,
    buildState: classifyCloudflareBuildState(build),
    createdAt,
    finishedAt,
  };
}

export function matchCloudflareWorkerBuildForCommit(args: {
  builds: readonly CloudflareWorkerBuild[];
  branch: string;
  commitHash: string;
  worker: {
    workerTag: string;
    rootDirectory: string;
  };
  ghRepoId: string;
  triggerUuid: string;
}): CloudflareBuildMatch {
  return matchCloudflareWorkerBuildCandidate(args);
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
  return matchCloudflareWorkerBuildCandidate({ ...args, commitHash: null });
}
