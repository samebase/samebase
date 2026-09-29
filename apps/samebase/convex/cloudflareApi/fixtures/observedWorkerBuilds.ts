// Captured from GET
// https://api.cloudflare.com/client/v4/accounts/{account_id}/builds/workers/{external_script_id}/builds
// on 2026-08-03. Fields unrelated to build matching, including environment variables, are omitted.
export const observedCompletedWorkerBuild = {
  build_uuid: "f9e12f48-dd63-4e28-aef7-ece63d11539d",
  status: "stopped",
  build_outcome: "success",
  initializing_on: "2026-08-02T21:45:39.750Z",
  running_on: "2026-08-02T21:45:41.791Z",
  stopped_on: "2026-08-02T21:47:46.612Z",
  created_on: "2026-08-02T21:45:39.403Z",
  modified_on: "2026-08-02T21:47:46.612Z",
  pull_request: null,
  build_trigger_metadata: {
    branch: "main",
    build_trigger_source: "push_event",
    commit_hash: "6d09686de7d285f174770eb3f0c8a5ff60f17376",
    deploy_command: "pnpm run deploy",
    root_directory: "apps/samebase",
  },
  trigger: {
    deploy_command: "pnpm run deploy",
    external_script_id: "470db9109dce4196af330cdd7be89518",
    repo_connection: { repo_id: "1021726325" },
    root_directory: "apps/samebase",
    trigger_uuid: "b595a215-7b9b-4a04-a55d-578f39ca4335",
  },
} as const;

// Captured while PR #1350 was building.
export const observedRunningWorkerBuild = {
  build_uuid: "89fa2f0f-ca7c-4f14-af5d-6f95714b68c3",
  status: "running",
  build_outcome: null,
  initializing_on: "2026-08-02T21:54:38.426Z",
  running_on: "2026-08-02T21:54:42.343Z",
  stopped_on: null,
  created_on: "2026-08-02T21:54:36.933Z",
  modified_on: "2026-08-02T21:54:42.343Z",
  pull_request: null,
  build_trigger_metadata: {
    branch: "codex-show-active-build-status",
    build_trigger_source: "push_event",
    commit_hash: "8a83aec75b99f8474652bd51dc945735c3e397ec",
    deploy_command: "pnpm run deploy:preview",
    root_directory: "apps/samebase",
  },
  trigger: {
    deploy_command: "pnpm run deploy:preview",
    external_script_id: "470db9109dce4196af330cdd7be89518",
    repo_connection: { repo_id: "1021726325" },
    root_directory: "apps/samebase",
    trigger_uuid: "3ff74fd1-50c4-43d2-9fd3-72086962b3e3",
  },
} as const;

// Captured from the same Workers Builds endpoint on 2026-08-13 after a
// dashboard retry. All fields except the observed trigger source are omitted.
export const observedRetriedWorkerBuildMetadata = {
  build_trigger_metadata: {
    build_trigger_source: "retry",
  },
} as const;

// Captured from the Workers Builds endpoint on 2026-09-30 after ChessMerge switched
// to native Worker Previews. Only the build identity and status fields are retained.
export const observedNativePreviewsProductionBuild = {
  build_uuid: "feb42f59-fbea-4f1f-95a1-8bf8598df55e",
  status: "stopped",
  build_outcome: "success",
  created_on: "2026-09-29T20:46:01.006Z",
  stopped_on: "2026-09-29T20:46:56.238Z",
  build_trigger_metadata: {
    branch: "main",
    root_directory: "/",
    deploy_command: "pnpm run deploy",
    commit_hash: "6f242965dfc3aa68e26b4207f1747ee43799a0f4",
  },
  trigger: {
    trigger_uuid: "6bb5c81d-900b-405a-a52c-565dc4d90a82",
    external_script_id: "d8f877365405479ba51bd8f96fcdc156",
    root_directory: "/",
    deploy_command: "pnpm run deploy",
    repo_connection: { repo_id: "993742136" },
  },
} as const;
