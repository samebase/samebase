import type { CloudflareBuildState } from "./cloudflareBuildMatching";

export type CloudflareWorkerProofSource = "comments" | "checks";
export const CLOUDFLARE_WORKER_PROOF_SOURCE: CloudflareWorkerProofSource = "checks";

export type CloudflareWorkerPreview = {
  kind: "worker";
  accountId: string;
  name: string;
  url: string;
};

export type CloudflareWorkerBuildRead = {
  accountId: string;
  buildUuid: string;
  buildState: CloudflareBuildState;
  logsUrl: string;
  name: string;
};

export type CloudflareWorkerProofRead =
  | {
      state: "available";
      previews: CloudflareWorkerPreview[];
      workerBuilds: CloudflareWorkerBuildRead[];
    }
  | { state: "unavailable" };

export function resolveCloudflareWorkerBuild(args: {
  accountId: string;
  proof: CloudflareWorkerProofRead;
  workerName: string;
}):
  | { state: "available"; buildUuid: string; buildState: CloudflareBuildState; logsUrl: string }
  | { state: "absent" }
  | { state: "unavailable" } {
  if (args.proof.state === "unavailable") {
    return args.proof;
  }
  const matches = args.proof.workerBuilds.filter(
    (build) => build.accountId === args.accountId && build.name === args.workerName,
  );
  if (matches.length === 0) {
    return { state: "absent" };
  }
  return matches.length === 1
    ? {
        state: "available",
        buildUuid: matches[0].buildUuid,
        buildState: matches[0].buildState,
        logsUrl: matches[0].logsUrl,
      }
    : { state: "unavailable" };
}

export function resolveCloudflareWorkerBranchPreviewUrl(args: {
  accountId: string;
  proof: CloudflareWorkerProofRead;
  workerName: string;
}): { state: "available"; url: string } | { state: "absent" } | { state: "unavailable" } {
  if (args.proof.state === "unavailable") {
    return args.proof;
  }
  const matches = args.proof.previews.filter(
    (preview) => preview.accountId === args.accountId && preview.name === args.workerName,
  );
  if (matches.length === 0) {
    return { state: "absent" };
  }
  return matches.length === 1
    ? { state: "available", url: matches[0].url }
    : { state: "unavailable" };
}
