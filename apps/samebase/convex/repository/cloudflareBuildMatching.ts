import { bad, good, pure } from "@samebase/sure";
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
export type CloudflareBuildDisagreementReasons = [
  CloudflareBuildDisagreementReason,
  ...CloudflareBuildDisagreementReason[],
];

export type CloudflareBuildMatch =
  | {
      state: "available";
      buildUuid: string;
      buildState: CloudflareBuildState;
      createdAt: number;
      finishedAt: number | null;
    }
  | { state: "absent" }
  | { state: "provider_disagreement"; reasons: CloudflareBuildDisagreementReasons };

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

const validateCloudflareBuildAgreement = pure(
  (args: {
    build: CloudflareWorkerBuild;
    metadata: NonNullable<CloudflareWorkerBuild["build_trigger_metadata"]>;
    createdAt: number | null;
    worker: {
      workerTag: string;
      rootDirectory: string;
    };
    githubRepositoryDatabaseId: string;
    triggerUuid: string;
  }) => {
    const build = args.build;
    const trigger = build.trigger;
    const buildUuid = build.build_uuid?.trim();
    const rootDirectory = normalizeCloudflareBuildRoot(args.worker.rootDirectory);
    const triggerRootDirectory = normalizeCloudflareBuildRoot(trigger?.root_directory);
    const metadataRootDirectory = normalizeCloudflareBuildRoot(args.metadata.root_directory);
    const triggerDeployCommand = trigger?.deploy_command?.trim();
    const metadataDeployCommand = args.metadata.deploy_command?.trim();
    const reasons: CloudflareBuildDisagreementReason[] = [];

    if (!trigger) {
      reasons.push("missing_trigger");
    } else {
      if (trigger.external_script_id !== args.worker.workerTag) {
        reasons.push("worker_tag_mismatch");
      }
      if (trigger.trigger_uuid !== args.triggerUuid) {
        reasons.push("trigger_uuid_mismatch");
      }
      if (trigger.repo_connection?.repo_id !== args.githubRepositoryDatabaseId) {
        reasons.push("repository_id_mismatch");
      }
    }

    if (rootDirectory === null) {
      reasons.push("invalid_root_directory");
    } else {
      if (trigger && triggerRootDirectory !== rootDirectory) {
        reasons.push("trigger_root_directory_mismatch");
      }
      if (metadataRootDirectory !== rootDirectory) {
        reasons.push("metadata_root_directory_mismatch");
      }
    }

    if (trigger) {
      if (!triggerDeployCommand) {
        reasons.push("missing_trigger_deploy_command");
      } else if (triggerDeployCommand !== metadataDeployCommand) {
        reasons.push("deploy_command_mismatch");
      }
    }

    if (!buildUuid && args.createdAt === null) {
      return bad([
        "missing_build_uuid",
        "invalid_created_on",
        ...reasons,
      ] satisfies CloudflareBuildDisagreementReasons);
    }
    if (!buildUuid) {
      return bad(["missing_build_uuid", ...reasons] satisfies CloudflareBuildDisagreementReasons);
    }
    if (args.createdAt === null) {
      return bad(["invalid_created_on", ...reasons] satisfies CloudflareBuildDisagreementReasons);
    }
    const firstReason = reasons.at(0);
    if (firstReason !== undefined) {
      return bad([firstReason, ...reasons.slice(1)] satisfies CloudflareBuildDisagreementReasons);
    }

    return good({
      buildUuid,
      createdAt: args.createdAt,
      finishedAt: providerTimestamp(build.stopped_on),
    });
  },
);

export function matchLatestCloudflareWorkerBuildForBranch(args: {
  builds: readonly CloudflareWorkerBuild[];
  branch: string;
  worker: {
    workerTag: string;
    rootDirectory: string;
  };
  githubRepositoryDatabaseId: string;
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
  const metadata = candidate.metadata;
  const [agrees, agreement] = validateCloudflareBuildAgreement({
    build,
    metadata,
    createdAt: candidate.createdAt,
    worker: args.worker,
    githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
    triggerUuid: args.triggerUuid,
  });
  if (!agrees) {
    return { state: "provider_disagreement", reasons: agreement };
  }

  return {
    state: "available",
    buildUuid: agreement.buildUuid,
    buildState: classifyCloudflareBuildState(build),
    createdAt: agreement.createdAt,
    finishedAt: agreement.finishedAt,
  };
}
