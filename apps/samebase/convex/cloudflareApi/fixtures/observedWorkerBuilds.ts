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
