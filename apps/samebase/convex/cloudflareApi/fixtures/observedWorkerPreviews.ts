import type { components, Readable } from "../types.generated";

// Captured from GET /accounts/{account_id}/builds/workers/{script_tag} on 2026-09-30.
// Build commands, tokens, and environment variables are omitted.
export const observedPreviewWorkerBuildSettings = {
  script_tag: "83afd0d60a2e4ad790121bcb2c845f4f",
  git_repository: {
    repo_id: "1397389404",
    repo_name: "tmp-native-preview-template-native-previews",
    provider_type: "github",
    provider_account_id: "315958746",
    provider_account_name: "samebase-live-tests",
    grant_id: null,
    branch: "main",
  },
  production_settings: { root_directory: "/" },
  previews_enabled: true,
  previews_base_config: { root_directory: "/" },
} satisfies Readable<components["schemas"]["builds_WorkerResponse"]>;

// Captured from GET /accounts/{account_id}/builds/workers/{script_tag}/previews on 2026-09-30.
export const observedWorkerPreviewSummaries = [
  {
    preview_id: "f985667b85d9443291f31a1849028790",
    branch: "nicu-preview-smoke",
    auto_delete: true,
    auto_build: true,
  },
] satisfies Readable<components["schemas"]["builds_PreviewSummary"]>[];

// Captured from GET /accounts/{account_id}/workers/workers/{worker_id}/previews/{preview_id}
// on 2026-09-30, after the third build of the same branch.
export const observedWorkerRuntimePreview = {
  id: "f985667b85d9443291f31a1849028790",
  slug: "nicu-preview-smoke",
  name: "nicu-preview-smoke",
  tags: [],
  observability: {
    enabled: false,
    head_sampling_rate: 1,
    redact_query_string: false,
    logs: {
      enabled: false,
      head_sampling_rate: 1,
      invocation_logs: true,
      persist: true,
      destinations: [],
    },
    traces: { enabled: false, head_sampling_rate: 1, persist: true, destinations: [] },
  },
  logpush: false,
  tail_consumers: [],
  urls: ["https://nicu-preview-smoke-tmp-native-preview-template-native-previews.rir.workers.dev"],
  created_on: "2026-09-30T08:32:45.762865Z",
  updated_on: "2026-09-30T08:32:45.762865Z",
  deployed_on: "2026-09-30T08:53:15.214187Z",
} satisfies Readable<components["schemas"]["workers_Preview"]>;
