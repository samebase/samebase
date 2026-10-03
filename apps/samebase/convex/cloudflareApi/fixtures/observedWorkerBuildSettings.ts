import type { BuildsWorkerResponse } from "../generated/types.gen";

// Captured from POST /accounts/{account_id}/builds/workers and its GET read-back on 2026-09-30.
// The request set previews_enabled to true, but Cloudflare created legacy triggers.
export const observedCreatedWorkerBuildSettings = {
  script_tag: "eaeec9c35fa64976a823c246164f4204",
  git_repository: {
    repo_id: "1397342994",
    repo_name: "tmp-native-preview-template-native-previews",
    provider_type: "github",
    provider_account_id: "315958746",
    provider_account_name: "samebase-live-tests",
    grant_id: null,
    branch: "main",
  },
  production_settings: {
    build_command: "pnpm run build",
    deploy_command: "pnpm run deploy",
    root_directory: "/",
    build_caching_enabled: true,
    path_includes: ["*"],
    path_excludes: [],
    build_token_uuid: "37ba157d-9fb1-4cf9-8382-4d9fe7d69816",
    environment_variables: {},
  },
  previews_enabled: false,
  previews_base_config: {
    build_command: "pnpm run build",
    deploy_command: "pnpm run deploy:preview",
    root_directory: "/",
    build_caching_enabled: true,
    path_includes: ["*"],
    path_excludes: [],
    build_token_uuid: "37ba157d-9fb1-4cf9-8382-4d9fe7d69816",
    environment_variables: {},
    proposed_deploy_command: null,
  },
} satisfies BuildsWorkerResponse;

// Captured from the successful POST /accounts/{account_id}/builds/workers/{script_tag}/migrate_to_previews.
export const observedMigratedWorkerBuildSettings = {
  script_tag: "eaeec9c35fa64976a823c246164f4204",
  git_repository: {
    repo_id: "1397342994",
    repo_name: "tmp-native-preview-template-native-previews",
    provider_type: "github",
    provider_account_id: "315958746",
    provider_account_name: "samebase-live-tests",
    grant_id: null,
    branch: "main",
  },
  production_settings: {
    build_command: "pnpm run build",
    deploy_command: "pnpm run deploy",
    root_directory: "/",
    build_caching_enabled: true,
    path_includes: ["*"],
    path_excludes: [],
    build_token_uuid: "37ba157d-9fb1-4cf9-8382-4d9fe7d69816",
    environment_variables: {},
  },
  previews_enabled: true,
  previews_base_config: {
    build_command: "pnpm run build",
    deploy_command: "pnpm run deploy:preview",
    root_directory: "/",
    build_caching_enabled: true,
    path_includes: ["*"],
    path_excludes: [],
    build_token_uuid: "37ba157d-9fb1-4cf9-8382-4d9fe7d69816",
    environment_variables: {},
  },
} satisfies BuildsWorkerResponse;

// Captured from GET after key rotation on the same test Worker. Secret values are null.

export const observedNativeWorkerBuildSettings = {
  script_tag: "eaeec9c35fa64976a823c246164f4204",
  git_repository: {
    repo_id: "1397342994",
    repo_name: "tmp-native-preview-template-native-previews",
    provider_type: "github",
    provider_account_id: "315958746",
    provider_account_name: "samebase-live-tests",
    grant_id: null,
    branch: "main",
  },
  production_settings: {
    build_command: "pnpm run build",
    deploy_command: "pnpm run deploy",
    root_directory: "/",
    build_caching_enabled: true,
    path_includes: ["*"],
    path_excludes: [],
    build_token_uuid: "37ba157d-9fb1-4cf9-8382-4d9fe7d69816",
    environment_variables: {
      CONVEX_DEPLOY_KEY: {
        is_secret: true,
        created_on: "2026-09-30T08:15:08.207Z",
        value: null,
      },
      SAMEBASE_CONVEX_PROJECT: {
        is_secret: false,
        created_on: "2026-09-30T08:15:08.207Z",
        value: "version=1&teamId=522530&projectId=3108337",
      },
    },
  },
  previews_enabled: true,
  previews_base_config: {
    build_command: "pnpm run build",
    deploy_command: "pnpm run deploy:preview",
    root_directory: "/",
    build_caching_enabled: true,
    path_includes: ["*"],
    path_excludes: [],
    build_token_uuid: "37ba157d-9fb1-4cf9-8382-4d9fe7d69816",
    environment_variables: {
      CONVEX_DEPLOY_KEY: {
        is_secret: true,
        created_on: "2026-09-30T08:15:08.207Z",
        value: null,
      },
    },
  },
} satisfies BuildsWorkerResponse;

// Captured from PATCH with previews_enabled=true while the legacy preview trigger still existed.
export const observedLegacyPreviewEnableFailureResponse = {
  success: false,
  messages: [],
  errors: [
    {
      code: 12048,
      message:
        "Cannot enable preview settings while a non-production trigger exists. Use the migrate_to_previews endpoint instead.",
    },
  ],
  result: null,
};

// Captured from the same GET for a newly created Worker with no Builds configuration.
export const observedMissingWorkerBuildSettingsResponse = {
  success: false,
  messages: [],
  errors: [
    {
      code: 12040,
      message: "No build configuration associated with that script tag was found for this account",
    },
  ],
  result: null,
};

// Captured from GET /accounts/{account_id}/builds/workers/{script_tag} on 2026-09-30.
// Secret values are null in the provider response.
export const observedLegacyWorkerBuildSettings = {
  script_tag: "3717c592bb564236a6815df01f084963",
  git_repository: {
    repo_id: "1358278395",
    repo_name: "tmp-plugin-review-9806-20260905-1434",
    provider_type: "github",
    provider_account_id: "315958746",
    provider_account_name: "samebase-live-tests",
    grant_id: null,
    branch: "main",
  },
  production_settings: {
    build_command: "pnpm run build",
    deploy_command: "pnpm run deploy",
    root_directory: "/",
    build_caching_enabled: false,
    path_includes: ["*"],
    path_excludes: [],
    build_token_uuid: "bf34959e-03df-446a-af6d-b55bff91ab8b",
    environment_variables: {
      CONVEX_DEPLOY_KEY: {
        is_secret: true,
        created_on: "2026-09-05T14:35:42.071Z",
        value: null,
      },
      PREVIEW_CONVEX_DEPLOY_KEY: {
        is_secret: true,
        created_on: "2026-09-05T14:35:42.071Z",
        value: null,
      },
      SAMEBASE_CONVEX_PROJECT: {
        is_secret: false,
        created_on: "2026-09-05T14:35:42.071Z",
        value: "version=1&teamId=522530&projectId=2939992",
      },
    },
  },
  previews_enabled: false,
  previews_base_config: {
    build_command: "pnpm run build",
    deploy_command: "pnpm run deploy:preview",
    root_directory: "/",
    build_caching_enabled: false,
    path_includes: ["*"],
    path_excludes: [],
    build_token_uuid: "bf34959e-03df-446a-af6d-b55bff91ab8b",
    environment_variables: {
      CONVEX_DEPLOY_KEY: {
        is_secret: true,
        created_on: "2026-09-05T14:35:42.042Z",
        value: null,
      },
      PREVIEW_CONVEX_DEPLOY_KEY: {
        is_secret: true,
        created_on: "2026-09-05T14:35:42.042Z",
        value: null,
      },
      SAMEBASE_CONVEX_PROJECT: {
        is_secret: false,
        created_on: "2026-09-05T14:35:42.042Z",
        value: "version=1&teamId=522530&projectId=2939992",
      },
    },
    proposed_deploy_command: null,
  },
} satisfies BuildsWorkerResponse;
