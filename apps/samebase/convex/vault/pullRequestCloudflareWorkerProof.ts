import type { CloudflareBuildState } from "./cloudflareBuildMatching";

export type CloudflareWorkerProofSource = "comments" | "checks";
export const CLOUDFLARE_WORKER_PROOF_SOURCE: CloudflareWorkerProofSource = "checks";

export type CloudflareWorkerProof = {
  accountId: string;
  buildUuid: string;
  buildState: CloudflareBuildState;
  logsUrl: string;
  name: string;
  previewUrl: string | null;
};

export type CloudflareWorkerProofRead =
  | { state: "available"; workers: CloudflareWorkerProof[] }
  | { state: "unavailable" };
