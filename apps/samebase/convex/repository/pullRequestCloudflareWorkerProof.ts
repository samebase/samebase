import type { CloudflareBuildState } from "./cloudflareBuildMatching";

export type CloudflareWorkerProofSource = "comments" | "checks";
export const CLOUDFLARE_WORKER_PROOF_SOURCE: CloudflareWorkerProofSource = "checks";

export type CloudflareWorkerPreview =
  | { state: "available"; url: string; provenance: "selected_result" | "earlier_check" }
  | { state: "absent" };

export type CloudflareWorkerProof = {
  accountId: string;
  buildUuid: string;
  buildState: CloudflareBuildState;
  logsUrl: string;
  name: string;
  preview: CloudflareWorkerPreview;
};

export type CloudflareWorkerProofRead =
  | { state: "available"; workers: CloudflareWorkerProof[] }
  | { state: "unavailable" };
