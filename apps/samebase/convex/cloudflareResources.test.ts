import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const callCloudflareMcpToolMock = vi.hoisted(() => vi.fn());

vi.mock("./cloudflareMcp", () => ({
  callCloudflareMcpTool: callCloudflareMcpToolMock,
}));

import {
  blockVerification,
  buildCloudflareWorkerCreateBody,
  buildCloudflareWorkersEnvVars,
  CloudflareApiError,
  classifyCloudflareWorkerRepositoryDiscovery,
  isCloudflareGitHubAppRepositoryAuthorizationError,
  isCloudflareMcpInvalidAccessTokenError,
  isWorkersBuildsInvalidTokenMessage,
  readCloudflareWorkerRepositoryDiscovery,
  readCloudflareWorkerTag,
  selectCurrentBuildTokenUuid,
  selectReusableBuildTokenUuid,
  verifyCloudflareWorkerInfrastructure,
  wireCloudflareWorkerConvexBuildAccess,
  wireCloudflareWorkerBuilds,
} from "./cloudflareResources";
import {
  normalizeCloudflareAccounts,
  selectSingleCloudflareDefaultAccount,
} from "./cloudflareAccountDiscovery";
import { isRecord } from "./jsonUtils";

type RecordedCloudflareRequest = {
  method: string;
  path: string;
  body: unknown;
};
type RecordedCloudflareEnvironmentVariables = Record<
  string,
  {
    created_on: string;
    is_secret: boolean;
    value: string | null;
  }
>;

const cloudflareGitHubAppDisconnectedApiMessage =
  "This project is disconnected from your Git account, this may cause deployments to fail. Refer to https://developers.cloudflare.com/pages/platform/git-integration/#this-project-is-disconnected-from-your-git-account-this-may-cause-deployments-to-fail";
const cloudflareMcpGitHubAppDisconnectedErrorMessage = `Cloudflare MCP tool call failed: Error: Cloudflare API error: 8000008: ${cloudflareGitHubAppDisconnectedApiMessage}`;
const cloudflareGitHubAppDisconnectedUserMessage =
  "Cloudflare Workers and Pages GitHub App is not authorized for ada/samebase-app. Follow Cloudflare's recovery steps at https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#reinstall-the-cloudflare-github-app: uninstall the GitHub App first, then reinstall/connect GitHub from Workers & Pages and include ada/samebase-app, then retry.";
const cloudflareWorkerReadEnvelope = JSON.stringify({
  success: true,
  errors: [],
  messages: [],
  result: {
    created_on: "2026-06-22T00:00:00Z",
    id: "worker-tag",
    logpush: false,
    name: "samebase-app",
    observability: {
      enabled: false,
      head_sampling_rate: 1,
    },
    references: {
      dispatch_namespace_outbounds: [],
      domains: [],
      durable_objects: [],
      queues: [],
      workers: [],
    },
    subdomain: {
      enabled: false,
    },
    tags: [],
    tail_consumers: [],
    updated_on: "2026-06-22T00:00:00Z",
  },
});
const cloudflareWorkerSubdomainDisabledEnvelope = JSON.stringify({
  success: true,
  errors: [],
  messages: [],
  result: { enabled: false },
});

function buildTestWireCloudflareWorkerBuildsArgs(): Parameters<
  typeof wireCloudflareWorkerBuilds
>[0] {
  return {
    owner: "ada",
    repo: "samebase-app",
    ghRepoId: "123",
    ghRepoOwnerId: "456",
    defaultBranch: "main",
    triggerInitialBuild: true,
    vaultId: "vault-id",
    workerName: "samebase-app",
    workerTag: "worker-tag",
    cloudflareToken: "oauth-token",
    cloudflareAuthMethod: "oauth",
    accountId: "account-id",
    buildConfig: {
      rootDir: ".",
      buildCommand: "pnpm build",
      deployCommand: "pnpm deploy",
      previewDeployCommand: "pnpm deploy:preview",
      pathIncludes: ["**/*"],
      pathExcludes: [],
    },
  };
}

function buildTestVerifyCloudflareWorkerInfrastructureArgs(): Parameters<
  typeof verifyCloudflareWorkerInfrastructure
>[0] {
  return {
    vaultId: "vault-id",
    workerName: "samebase-app",
    workerTag: "worker-tag",
    cloudflareToken: "oauth-token",
    cloudflareAuthMethod: "oauth",
    accountId: "account-id",
    defaultBranch: "main",
    expectedRepoId: "123",
    buildConfig: {
      rootDir: ".",
      buildCommand: "pnpm build",
      deployCommand: "pnpm deploy",
      previewDeployCommand: "pnpm deploy:preview",
      pathIncludes: ["**/*"],
      pathExcludes: [],
    },
    build: {
      state: "connected",
      rootDirectory: ".",
      buildCommand: "pnpm build",
      deployCommand: "pnpm deploy",
      previewDeployCommand: "pnpm deploy:preview",
      pathIncludes: ["**/*"],
      pathExcludes: [],
      production: {
        triggerUuid: "production-trigger",
        buildTokenUuid: "build-token",
      },
      preview: {
        triggerUuid: "preview-trigger",
        buildTokenUuid: "build-token",
      },
    },
    verifyConvexBuildAccess: true,
  };
}

function cloudflareSuccessResponse(result: unknown): Response {
  return new Response(JSON.stringify({ success: true, errors: [], messages: [], result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function buildRecordedEnvironmentVariables(body: unknown): RecordedCloudflareEnvironmentVariables {
  if (!isRecord(body)) {
    return {};
  }

  const variables: RecordedCloudflareEnvironmentVariables = {};
  for (const [key, value] of Object.entries(body)) {
    if (!isRecord(value)) {
      continue;
    }
    const isSecret = value.is_secret === true;
    variables[key] = {
      created_on: "2026-07-05T00:00:00Z",
      is_secret: isSecret,
      value: isSecret ? null : typeof value.value === "string" ? value.value : null,
    };
  }
  return variables;
}

function buildCloudflareWorkerListItem(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    created_on: "2026-06-22T00:00:00Z",
    id: "samebase-app",
    logpush: false,
    name: "samebase-app",
    observability: {
      enabled: false,
      head_sampling_rate: 1,
    },
    references: {
      dispatch_namespace_outbounds: [],
      domains: [],
      durable_objects: [],
      queues: [],
      workers: [],
    },
    subdomain: {
      enabled: false,
    },
    tag: "worker-tag",
    tags: [],
    tail_consumers: [],
    updated_on: "2026-06-22T00:00:00Z",
    ...overrides,
  };
}

function stubEnsureCloudflareResourcesFetch(args: {
  triggers: readonly unknown[];
  requests: RecordedCloudflareRequest[];
  dropReadEnvKeys?: Record<string, readonly string[]>;
  readEnvVars?: Record<string, RecordedCloudflareEnvironmentVariables>;
}): void {
  let createdTriggerCount = 0;
  const environmentVariables = new Map<string, RecordedCloudflareEnvironmentVariables>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = input instanceof Request ? input.method : (init?.method ?? "GET");
      const endpoint = new URL(url).pathname;
      const body =
        typeof init?.body === "string" && init.body.length > 0 ? JSON.parse(init.body) : undefined;
      args.requests.push({ method, path: endpoint, body });

      const environmentVariablesMatch = endpoint.match(
        /^\/client\/v4\/accounts\/account-id\/builds\/triggers\/([^/]+)\/environment_variables$/,
      );
      if (environmentVariablesMatch) {
        const triggerUuid = environmentVariablesMatch[1];
        if (method === "PATCH") {
          const stored = buildRecordedEnvironmentVariables(body);
          environmentVariables.set(endpoint, {
            ...environmentVariables.get(endpoint),
            ...stored,
          });
          return cloudflareSuccessResponse(environmentVariables.get(endpoint) ?? {});
        }
        if (method === "GET") {
          const stored = {
            ...(args.readEnvVars?.[triggerUuid] ?? {}),
            ...(environmentVariables.get(endpoint) ?? {}),
          };
          for (const key of args.dropReadEnvKeys?.[triggerUuid] ?? []) {
            delete stored[key];
          }
          return cloudflareSuccessResponse(stored);
        }
      }

      switch (endpoint) {
        case "/client/v4/accounts/account-id/workers/workers/samebase-app":
          return new Response(cloudflareWorkerReadEnvelope, {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        case "/client/v4/accounts/account-id/workers/scripts/samebase-app/subdomain":
          return new Response(cloudflareWorkerSubdomainDisabledEnvelope, {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        case "/client/v4/accounts/account-id/builds/repos/connections":
          return cloudflareSuccessResponse({ repo_connection_uuid: "repo-connection" });
        case "/client/v4/accounts/account-id/builds/workers/worker-tag/triggers":
          return cloudflareSuccessResponse(args.triggers);
        case "/client/v4/accounts/account-id/builds/tokens":
          return cloudflareSuccessResponse([
            {
              build_token_uuid: "reusable-build-token",
              build_token_name: "samebase build token",
              cloudflare_token_id: "opaque-oauth-token-id",
            },
          ]);
        case "/client/v4/accounts/account-id/builds/triggers":
          createdTriggerCount += 1;
          return cloudflareSuccessResponse({
            trigger_uuid: `created-trigger-${createdTriggerCount}`,
          });
        case "/client/v4/accounts/account-id/builds/triggers/existing-production-trigger":
          return cloudflareSuccessResponse({ trigger_uuid: "existing-production-trigger" });
        case "/client/v4/accounts/account-id/builds/triggers/existing-production-trigger/builds":
        case "/client/v4/accounts/account-id/builds/triggers/production-trigger/builds":
        case "/client/v4/accounts/account-id/builds/triggers/created-trigger-1/builds":
          return cloudflareSuccessResponse({});
      }

      return new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 1000, message: `Unexpected endpoint ${endpoint}` }],
          messages: [],
          result: null,
        }),
        { status: 404 },
      );
    }),
  );
}

afterEach(() => {
  callCloudflareMcpToolMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("cloudflare resources", () => {
  it("declares verification coverage for every durable infrastructure block", () => {
    expect(Object.keys(blockVerification).sort()).toEqual([
      "attach_convex",
      "attach_worker",
      "source_setup",
      "wire_builds",
      "wire_convex_build_access",
    ]);
    expect(blockVerification.wire_builds).toEqual({
      verify: expect.any(Function),
    });
    expect(blockVerification.wire_convex_build_access).toEqual({
      verify: expect.any(Function),
    });
    expect(blockVerification.attach_worker).toEqual({
      notVerifiable: {
        category: "state_shape_not_ready",
        detail: "existence verifier lands in Phase 2 with the missing-upstream variant",
      },
    });
    expect(blockVerification.attach_convex).toEqual({
      notVerifiable: {
        category: "state_shape_not_ready",
        detail: "existence verifier lands in Phase 2 with the missing-upstream variant",
      },
    });
    expect(blockVerification.source_setup).toEqual({
      notVerifiable: {
        category: "no_remedy",
        detail: "a deleted or renamed source repo has no re-create/re-link verb in the catalog",
      },
    });
  });

  it("omits trace propagation policy when creating Workers with traces disabled", () => {
    expect(buildCloudflareWorkerCreateBody("samebase-app").observability.traces).toBe(undefined);
  });

  it("uses trigger-specific Convex deploy keys for Workers builds", () => {
    expect(
      buildCloudflareWorkersEnvVars({
        triggerKind: "production",
        productionConvexDeployKey: "prod-key",
      }),
    ).toEqual({
      CONVEX_DEPLOY_KEY: {
        value: "prod-key",
        is_secret: true,
      },
    });
    expect(
      buildCloudflareWorkersEnvVars({
        triggerKind: "preview",
        previewConvexDeployKey: "preview-key",
      }),
    ).toEqual({
      PREVIEW_CONVEX_DEPLOY_KEY: {
        value: "preview-key",
        is_secret: true,
      },
    });
  });

  it("verifies recorded Cloudflare infrastructure when triggers and deploy-key variables exist", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      readEnvVars: {
        "production-trigger": {
          CONVEX_DEPLOY_KEY: {
            created_on: "2026-07-05T00:00:00Z",
            is_secret: true,
            value: null,
          },
        },
        "preview-trigger": {
          PREVIEW_CONVEX_DEPLOY_KEY: {
            created_on: "2026-07-05T00:00:00Z",
            is_secret: true,
            value: null,
          },
        },
      },
      triggers: [
        {
          trigger_uuid: "production-trigger",
          branch_includes: ["main"],
          branch_excludes: [],
        },
        {
          trigger_uuid: "preview-trigger",
          branch_includes: ["*"],
          branch_excludes: ["main"],
        },
      ],
    });

    await expect(
      verifyCloudflareWorkerInfrastructure({
        ...buildTestVerifyCloudflareWorkerInfrastructureArgs(),
        verifyConvexBuildAccess: true,
      }),
    ).resolves.toEqual({
      builds: "confirmed",
      convexBuildAccess: "confirmed",
    });
    expect(
      requests.filter((request) => request.path.includes("environment_variables")),
    ).toHaveLength(2);
  });

  it("adopts matching Workers Builds triggers when the Worker was attached before Builds were recorded", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [
        {
          trigger_uuid: "production-trigger",
          build_token_uuid: "production-build-token",
          branch_includes: ["main"],
          branch_excludes: [],
          build_command: "pnpm build",
          deploy_command: "pnpm deploy",
          root_directory: ".",
          path_includes: ["**/*"],
          path_excludes: [],
          repo_connection: {
            repo_connection_uuid: "repo-connection",
            repo_id: "123",
            repo_name: "ada/samebase-app",
          },
        },
        {
          trigger_uuid: "preview-trigger",
          build_token_uuid: "preview-build-token",
          branch_includes: ["*"],
          branch_excludes: ["main"],
          build_command: "pnpm build",
          deploy_command: "pnpm deploy:preview",
          root_directory: ".",
          path_includes: ["**/*"],
          path_excludes: [],
          repo_connection: {
            repo_connection_uuid: "repo-connection",
            repo_id: "123",
            repo_name: "ada/samebase-app",
          },
        },
      ],
    });

    await expect(
      verifyCloudflareWorkerInfrastructure({
        ...buildTestVerifyCloudflareWorkerInfrastructureArgs(),
        build: { state: "not_connected" },
        verifyConvexBuildAccess: false,
      }),
    ).resolves.toEqual({
      builds: "adopted",
      connectedBuilds: {
        state: "connected",
        rootDirectory: ".",
        buildCommand: "pnpm build",
        deployCommand: "pnpm deploy",
        previewDeployCommand: "pnpm deploy:preview",
        pathIncludes: ["**/*"],
        pathExcludes: [],
        production: {
          triggerUuid: "production-trigger",
          buildTokenUuid: "production-build-token",
        },
        preview: {
          triggerUuid: "preview-trigger",
          buildTokenUuid: "preview-build-token",
        },
      },
      convexBuildAccess: "not_checked",
    });
    expect(requests.some((request) => request.path.includes("environment_variables"))).toBe(false);
  });

  it("does not adopt Workers Builds triggers when the existing trigger config differs", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [
        {
          trigger_uuid: "production-trigger",
          build_token_uuid: "production-build-token",
          branch_includes: ["main"],
          branch_excludes: [],
          build_command: "npm run build",
          deploy_command: "pnpm deploy",
          root_directory: ".",
          path_includes: ["**/*"],
          path_excludes: [],
          repo_connection: {
            repo_connection_uuid: "repo-connection",
            repo_id: "123",
            repo_name: "ada/samebase-app",
          },
        },
        {
          trigger_uuid: "preview-trigger",
          build_token_uuid: "preview-build-token",
          branch_includes: ["*"],
          branch_excludes: ["main"],
          build_command: "pnpm build",
          deploy_command: "pnpm deploy:preview",
          root_directory: ".",
          path_includes: ["**/*"],
          path_excludes: [],
          repo_connection: {
            repo_connection_uuid: "repo-connection",
            repo_id: "123",
            repo_name: "ada/samebase-app",
          },
        },
      ],
    });

    await expect(
      verifyCloudflareWorkerInfrastructure({
        ...buildTestVerifyCloudflareWorkerInfrastructureArgs(),
        build: { state: "not_connected" },
        verifyConvexBuildAccess: false,
      }),
    ).resolves.toEqual({
      builds: "not_checked",
      convexBuildAccess: "not_checked",
    });
    expect(requests.some((request) => request.path.includes("environment_variables"))).toBe(false);
  });

  it("contradicts connected Builds when a recorded trigger is missing", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [
        {
          trigger_uuid: "preview-trigger",
          branch_includes: ["*"],
          branch_excludes: ["main"],
        },
      ],
    });

    await expect(
      verifyCloudflareWorkerInfrastructure({
        ...buildTestVerifyCloudflareWorkerInfrastructureArgs(),
        verifyConvexBuildAccess: true,
      }),
    ).resolves.toEqual({
      builds: "contradicted",
      convexBuildAccess: "not_checked",
    });
    expect(requests.some((request) => request.path.includes("environment_variables"))).toBe(false);
  });

  it("contradicts Convex build access when a deploy-key variable is missing", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      readEnvVars: {
        "production-trigger": {
          CONVEX_DEPLOY_KEY: {
            created_on: "2026-07-05T00:00:00Z",
            is_secret: true,
            value: null,
          },
        },
      },
      triggers: [
        {
          trigger_uuid: "production-trigger",
          branch_includes: ["main"],
          branch_excludes: [],
        },
        {
          trigger_uuid: "preview-trigger",
          branch_includes: ["*"],
          branch_excludes: ["main"],
        },
      ],
    });

    await expect(
      verifyCloudflareWorkerInfrastructure({
        ...buildTestVerifyCloudflareWorkerInfrastructureArgs(),
        verifyConvexBuildAccess: true,
      }),
    ).resolves.toEqual({
      builds: "confirmed",
      convexBuildAccess: "contradicted",
    });
  });

  it("wires Workers Builds without patching Convex environment variables", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [],
    });

    const build = await wireCloudflareWorkerBuilds(buildTestWireCloudflareWorkerBuildsArgs());

    expect(build).toMatchObject({
      production: {
        triggerUuid: "created-trigger-1",
        buildTokenUuid: "reusable-build-token",
      },
      preview: {
        triggerUuid: "created-trigger-2",
        buildTokenUuid: "reusable-build-token",
      },
    });
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.path ===
            "/client/v4/accounts/account-id/builds/triggers/created-trigger-1/builds",
      ),
    ).toBe(true);
    expect(requests.some((request) => request.path.includes("environment_variables"))).toBe(false);
  });

  it("wires Workers Builds without starting a build when initial builds are deferred", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [],
    });

    await wireCloudflareWorkerBuilds({
      ...buildTestWireCloudflareWorkerBuildsArgs(),
      triggerInitialBuild: false,
    });

    expect(
      requests.filter(
        (request) =>
          request.method === "POST" &&
          request.path === "/client/v4/accounts/account-id/builds/triggers",
      ),
    ).toHaveLength(2);
    expect(requests.some((request) => request.path.endsWith("/builds"))).toBe(false);
    expect(requests.some((request) => request.path.includes("environment_variables"))).toBe(false);
  });

  it("patches Convex build environment variables before starting the deferred production build", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [
        {
          trigger_uuid: "production-trigger",
          branch_includes: ["main"],
          branch_excludes: [],
          root_directory: ".",
          repo_connection: {
            repo_connection_uuid: "repo-connection",
            repo_id: "123",
            repo_name: "ada/samebase-app",
          },
        },
        {
          trigger_uuid: "preview-trigger",
          branch_includes: ["*"],
          branch_excludes: ["main"],
          root_directory: ".",
          repo_connection: {
            repo_connection_uuid: "repo-connection",
            repo_id: "123",
            repo_name: "ada/samebase-app",
          },
        },
      ],
    });

    await wireCloudflareWorkerConvexBuildAccess({
      defaultBranch: "main",
      expectedRepoId: "123",
      repositoryFullName: "ada/samebase-app",
      rootDirectory: ".",
      vaultId: "vault-id",
      workerName: "samebase-app",
      workerTag: "worker-tag",
      cloudflareToken: "oauth-token",
      cloudflareAuthMethod: "oauth",
      accountId: "account-id",
      build: {
        production: {
          triggerUuid: "production-trigger",
          buildTokenUuid: "build-token",
        },
        preview: {
          triggerUuid: "preview-trigger",
          buildTokenUuid: "build-token",
        },
      },
      convex: {
        production: {
          deployKey: "prod-key",
        },
        preview: {
          deployKey: "preview-key",
        },
      },
    });

    const productionPatchIndex = requests.findIndex(
      (request) =>
        request.method === "PATCH" &&
        request.path ===
          "/client/v4/accounts/account-id/builds/triggers/production-trigger/environment_variables",
    );
    const previewPatchIndex = requests.findIndex(
      (request) =>
        request.method === "PATCH" &&
        request.path ===
          "/client/v4/accounts/account-id/builds/triggers/preview-trigger/environment_variables",
    );
    const productionVerifyIndex = requests.findIndex(
      (request) =>
        request.method === "GET" &&
        request.path ===
          "/client/v4/accounts/account-id/builds/triggers/production-trigger/environment_variables",
    );
    const previewVerifyIndex = requests.findIndex(
      (request) =>
        request.method === "GET" &&
        request.path ===
          "/client/v4/accounts/account-id/builds/triggers/preview-trigger/environment_variables",
    );
    const buildIndex = requests.findIndex(
      (request) =>
        request.method === "POST" &&
        request.path === "/client/v4/accounts/account-id/builds/triggers/production-trigger/builds",
    );

    expect(productionPatchIndex).toBeGreaterThanOrEqual(0);
    expect(previewPatchIndex).toBeGreaterThanOrEqual(0);
    expect(productionVerifyIndex).toBeGreaterThan(productionPatchIndex);
    expect(previewVerifyIndex).toBeGreaterThan(previewPatchIndex);
    expect(buildIndex).toBeGreaterThan(productionPatchIndex);
    expect(buildIndex).toBeGreaterThan(previewPatchIndex);
    expect(buildIndex).toBeGreaterThan(productionVerifyIndex);
    expect(buildIndex).toBeGreaterThan(previewVerifyIndex);
    const productionConvexEnvVars = buildCloudflareWorkersEnvVars({
      triggerKind: "production",
      productionConvexDeployKey: "prod-key",
    });
    const previewConvexEnvVars = buildCloudflareWorkersEnvVars({
      triggerKind: "preview",
      previewConvexDeployKey: "preview-key",
    });
    expect(requests[productionPatchIndex]?.body).toEqual(productionConvexEnvVars);
    expect(requests[previewPatchIndex]?.body).toEqual(previewConvexEnvVars);
  });

  it("fails closed when Cloudflare does not read back the preview deploy key", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      dropReadEnvKeys: {
        "preview-trigger": ["PREVIEW_CONVEX_DEPLOY_KEY"],
      },
      triggers: [
        {
          trigger_uuid: "production-trigger",
          branch_includes: ["main"],
          branch_excludes: [],
          root_directory: ".",
          repo_connection: {
            repo_connection_uuid: "repo-connection",
            repo_id: "123",
            repo_name: "ada/samebase-app",
          },
        },
        {
          trigger_uuid: "preview-trigger",
          branch_includes: ["*"],
          branch_excludes: ["main"],
          root_directory: ".",
          repo_connection: {
            repo_connection_uuid: "repo-connection",
            repo_id: "123",
            repo_name: "ada/samebase-app",
          },
        },
      ],
    });

    await expect(
      wireCloudflareWorkerConvexBuildAccess({
        defaultBranch: "main",
        expectedRepoId: "123",
        repositoryFullName: "ada/samebase-app",
        rootDirectory: ".",
        vaultId: "vault-id",
        workerName: "samebase-app",
        workerTag: "worker-tag",
        cloudflareToken: "oauth-token",
        cloudflareAuthMethod: "oauth",
        accountId: "account-id",
        build: {
          production: {
            triggerUuid: "production-trigger",
            buildTokenUuid: "build-token",
          },
          preview: {
            triggerUuid: "preview-trigger",
            buildTokenUuid: "build-token",
          },
        },
        convex: {
          production: {
            deployKey: "prod-key",
          },
          preview: {
            deployKey: "preview-key",
          },
        },
      }),
    ).rejects.toThrow(
      "Cloudflare preview Workers Builds trigger preview-trigger is missing build environment variable PREVIEW_CONVEX_DEPLOY_KEY after wiring.",
    );

    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.path ===
            "/client/v4/accounts/account-id/builds/triggers/production-trigger/builds",
      ),
    ).toBe(false);
  });

  it("does not patch Convex build environment variables after a root-directory drift", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [
        {
          trigger_uuid: "production-trigger",
          branch_includes: ["main"],
          branch_excludes: [],
          root_directory: "apps/admin",
          repo_connection: {
            repo_connection_uuid: "repo-connection",
            repo_id: "123",
            repo_name: "ada/samebase-app",
          },
        },
        {
          trigger_uuid: "preview-trigger",
          branch_includes: ["*"],
          branch_excludes: ["main"],
          root_directory: ".",
          repo_connection: {
            repo_connection_uuid: "repo-connection",
            repo_id: "123",
            repo_name: "ada/samebase-app",
          },
        },
      ],
    });

    await expect(
      wireCloudflareWorkerConvexBuildAccess({
        defaultBranch: "main",
        expectedRepoId: "123",
        repositoryFullName: "ada/samebase-app",
        rootDirectory: ".",
        vaultId: "vault-id",
        workerName: "samebase-app",
        workerTag: "worker-tag",
        cloudflareToken: "oauth-token",
        cloudflareAuthMethod: "oauth",
        accountId: "account-id",
        build: {
          production: {
            triggerUuid: "production-trigger",
            buildTokenUuid: "build-token",
          },
          preview: {
            triggerUuid: "preview-trigger",
            buildTokenUuid: "build-token",
          },
        },
        convex: {
          production: {
            deployKey: "prod-key",
          },
          preview: {
            deployKey: "preview-key",
          },
        },
      }),
    ).rejects.toThrow(
      "Cannot connect Cloudflare Worker worker-tag to ada/samebase-app: its existing production Workers Builds trigger is connected to root directory apps/admin. Expected /. Disconnect Builds in Cloudflare or choose another Worker.",
    );
    expect(requests.some((request) => request.path.includes("environment_variables"))).toBe(false);
    expect(requests.some((request) => request.path.endsWith("/builds"))).toBe(false);
  });

  it("uses the Workers service id as the Workers Builds tag", () => {
    expect(
      readCloudflareWorkerTag(
        {
          id: "775e3115b5f8411988e4a6b1411d0022",
          name: "samebase-app",
        },
        "samebase-app",
      ),
    ).toBe("775e3115b5f8411988e4a6b1411d0022");
  });

  it("uses alternate Worker tag fields when the service id is missing", () => {
    expect(
      readCloudflareWorkerTag(
        {
          external_script_id: "worker-external-script-id",
          tag: "worker-tag",
          name: "samebase-app",
        },
        "samebase-app",
      ),
    ).toBe("worker-external-script-id");
    expect(
      readCloudflareWorkerTag(
        {
          tag: "worker-tag",
          name: "samebase-app",
        },
        "samebase-app",
      ),
    ).toBe("worker-tag");
  });

  it("recognizes Workers Builds invalid token failures from MCP errors", () => {
    expect(
      isWorkersBuildsInvalidTokenMessage({
        path: "/accounts/account-id/builds/repos/connections",
        message:
          "Cloudflare MCP tool call failed: Error: Cloudflare API error: 12006: Invalid token",
      }),
    ).toBe(true);
  });

  it("recognizes invalid Cloudflare MCP access tokens", () => {
    expect(
      isCloudflareMcpInvalidAccessTokenError(
        new Error(
          'Cloudflare MCP request failed (401): {"error":"invalid_token","error_description":"Invalid access token"}',
        ),
      ),
    ).toBe(true);
  });

  it("recognizes invalid direct Cloudflare API tokens", () => {
    expect(
      isCloudflareMcpInvalidAccessTokenError(
        new CloudflareApiError({
          method: "GET",
          path: "/accounts",
          details: [{ code: "10000", message: "Authentication error" }],
        }),
      ),
    ).toBe(true);
  });

  it("recognizes Cloudflare GitHub App repository authorization failures", () => {
    expect(
      isCloudflareGitHubAppRepositoryAuthorizationError(
        new CloudflareApiError({
          method: "PUT",
          path: "/accounts/account-id/builds/repos/connections",
          details: [
            {
              code: "8000008",
              message: cloudflareGitHubAppDisconnectedApiMessage,
            },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      isCloudflareGitHubAppRepositoryAuthorizationError(
        new CloudflareApiError({
          method: "PUT",
          path: "/accounts/account-id/builds/repos/connections",
          details: [{ code: "10000", message: "Authentication error" }],
        }),
      ),
    ).toBe(false);
    expect(
      isCloudflareGitHubAppRepositoryAuthorizationError(
        new Error(cloudflareMcpGitHubAppDisconnectedErrorMessage),
      ),
    ).toBe(true);
  });

  it("surfaces Cloudflare GitHub App authorization failures from repository connection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : String(input);
        const endpoint = new URL(url).pathname;
        switch (endpoint) {
          case "/client/v4/accounts/account-id/workers/workers/samebase-app":
            return new Response(cloudflareWorkerReadEnvelope, {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          case "/client/v4/accounts/account-id/workers/scripts/samebase-app/subdomain":
            return new Response(cloudflareWorkerSubdomainDisabledEnvelope, {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          case "/client/v4/accounts/account-id/builds/repos/connections":
            return new Response(
              JSON.stringify({
                success: false,
                errors: [
                  {
                    code: 8000008,
                    message: cloudflareGitHubAppDisconnectedApiMessage,
                  },
                ],
                messages: [],
                result: null,
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              },
            );
        }
        return new Response(
          JSON.stringify({
            success: false,
            errors: [{ code: 1000, message: `Unexpected endpoint ${endpoint}` }],
          }),
          { status: 404 },
        );
      }),
    );

    await expect(
      wireCloudflareWorkerBuilds(buildTestWireCloudflareWorkerBuildsArgs()),
    ).rejects.toThrow(cloudflareGitHubAppDisconnectedUserMessage);
  });

  it("preserves non-GitHub-App direct Cloudflare repository connection failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : String(input);
        const endpoint = new URL(url).pathname;
        switch (endpoint) {
          case "/client/v4/accounts/account-id/workers/workers/samebase-app":
            return new Response(cloudflareWorkerReadEnvelope, {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          case "/client/v4/accounts/account-id/workers/scripts/samebase-app/subdomain":
            return new Response(cloudflareWorkerSubdomainDisabledEnvelope, {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          case "/client/v4/accounts/account-id/builds/repos/connections":
            return new Response(
              JSON.stringify({
                success: false,
                errors: [
                  {
                    code: 10000,
                    message: "Authentication error",
                  },
                ],
                messages: [],
                result: null,
              }),
              {
                status: 403,
                headers: { "Content-Type": "application/json" },
              },
            );
        }
        return new Response(
          JSON.stringify({
            success: false,
            errors: [{ code: 1000, message: `Unexpected endpoint ${endpoint}` }],
          }),
          { status: 404 },
        );
      }),
    );

    let caughtError: unknown;
    try {
      await wireCloudflareWorkerBuilds(buildTestWireCloudflareWorkerBuildsArgs());
    } catch (error) {
      caughtError = error;
    }

    if (!(caughtError instanceof CloudflareApiError)) {
      throw new Error("Expected unwrapped CloudflareApiError.");
    }
    expect(caughtError.details).toEqual([{ code: "10000", message: "Authentication error" }]);
    expect(caughtError.message).toBe(
      "Cloudflare API request failed for PUT /accounts/account-id/builds/repos/connections: code 10000: Authentication error",
    );
  });

  it("surfaces exact Cloudflare MCP GitHub App disconnected failures from repository connection", async () => {
    callCloudflareMcpToolMock.mockRejectedValueOnce(
      new Error(cloudflareMcpGitHubAppDisconnectedErrorMessage),
    );

    await expect(
      wireCloudflareWorkerBuilds({
        ...buildTestWireCloudflareWorkerBuildsArgs(),
        cloudflareToken: "api-key-token",
        cloudflareAuthMethod: "api_key",
      }),
    ).rejects.toThrow(cloudflareGitHubAppDisconnectedUserMessage);
    expect(callCloudflareMcpToolMock).toHaveBeenCalledTimes(1);
  });

  it("patches existing Workers Builds triggers only when the GitHub repository id matches", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [
        {
          trigger_uuid: "existing-production-trigger",
          branch_includes: ["main"],
          branch_excludes: [],
          build_token_uuid: "reusable-build-token",
          root_directory: ".",
          repo_connection: {
            repo_connection_uuid: "repo-connection",
            repo_id: "123",
            repo_name: "ada/samebase-app",
          },
        },
      ],
    });

    await wireCloudflareWorkerBuilds(buildTestWireCloudflareWorkerBuildsArgs());

    expect(
      requests.some(
        (request) =>
          request.method === "PATCH" &&
          request.path ===
            "/client/v4/accounts/account-id/builds/triggers/existing-production-trigger",
      ),
    ).toBe(true);
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.path === "/client/v4/accounts/account-id/builds/triggers",
      ),
    ).toBe(true);
  });

  it("does not patch an existing Workers Builds trigger connected to a different root directory", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [
        {
          trigger_uuid: "existing-production-trigger",
          branch_includes: ["main"],
          branch_excludes: [],
          build_token_uuid: "reusable-build-token",
          root_directory: "apps/admin",
          repo_connection: {
            repo_connection_uuid: "repo-connection",
            repo_id: "123",
            repo_name: "ada/samebase-app",
          },
        },
      ],
    });

    await expect(
      wireCloudflareWorkerBuilds(buildTestWireCloudflareWorkerBuildsArgs()),
    ).rejects.toThrow(
      "Cannot connect Cloudflare Worker worker-tag to ada/samebase-app: its existing production Workers Builds trigger is connected to root directory apps/admin. Expected /. Disconnect Builds in Cloudflare or choose another Worker.",
    );
    expect(
      requests.some(
        (request) =>
          request.method === "PATCH" &&
          request.path ===
            "/client/v4/accounts/account-id/builds/triggers/existing-production-trigger",
      ),
    ).toBe(false);
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.path === "/client/v4/accounts/account-id/builds/triggers",
      ),
    ).toBe(false);
  });

  it("does not patch an existing Workers Builds trigger connected to a different GitHub repository", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [
        {
          trigger_uuid: "existing-production-trigger",
          branch_includes: ["main"],
          branch_excludes: [],
          build_token_uuid: "reusable-build-token",
          repo_connection: {
            repo_connection_uuid: "other-repo-connection",
            repo_id: "999",
            repo_name: "ada/other-app",
          },
        },
      ],
    });

    await expect(
      wireCloudflareWorkerBuilds(buildTestWireCloudflareWorkerBuildsArgs()),
    ).rejects.toThrow(
      "Cannot connect Cloudflare Worker worker-tag to ada/samebase-app: its existing production Workers Builds trigger is connected to GitHub repository ada/other-app (999). Disconnect Builds in Cloudflare or choose another Worker.",
    );
    expect(
      requests.some(
        (request) =>
          request.method === "PATCH" &&
          request.path ===
            "/client/v4/accounts/account-id/builds/triggers/existing-production-trigger",
      ),
    ).toBe(false);
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.path === "/client/v4/accounts/account-id/builds/triggers",
      ),
    ).toBe(false);
  });

  it("does not patch an existing Workers Builds trigger when Cloudflare omits the repository id", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [
        {
          trigger_uuid: "existing-production-trigger",
          branch_includes: ["main"],
          branch_excludes: [],
          build_token_uuid: "reusable-build-token",
          repo_connection: {
            repo_connection_uuid: "repo-connection",
            repo_name: "ada/samebase-app",
          },
        },
      ],
    });

    await expect(
      wireCloudflareWorkerBuilds(buildTestWireCloudflareWorkerBuildsArgs()),
    ).rejects.toThrow(
      "Cannot connect Cloudflare Worker worker-tag to ada/samebase-app: Cloudflare did not return a GitHub repository id for the existing production Workers Builds trigger. Disconnect Builds in Cloudflare or choose another Worker.",
    );
    expect(
      requests.some(
        (request) =>
          request.method === "PATCH" &&
          request.path ===
            "/client/v4/accounts/account-id/builds/triggers/existing-production-trigger",
      ),
    ).toBe(false);
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.path === "/client/v4/accounts/account-id/builds/triggers",
      ),
    ).toBe(false);
  });

  it("does not patch an existing Workers Builds trigger connected through a deleted repository connection", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [
        {
          trigger_uuid: "existing-production-trigger",
          branch_includes: ["main"],
          branch_excludes: [],
          build_token_uuid: "reusable-build-token",
          repo_connection: {
            repo_connection_uuid: "deleted-repo-connection",
            repo_id: "123",
            repo_name: "ada/samebase-app",
            deleted_on: "2026-07-01T00:00:00Z",
          },
        },
      ],
    });

    await expect(
      wireCloudflareWorkerBuilds(buildTestWireCloudflareWorkerBuildsArgs()),
    ).rejects.toThrow(
      "Cannot connect Cloudflare Worker worker-tag to ada/samebase-app: its existing production Workers Builds trigger references a deleted Cloudflare GitHub repository connection. Disconnect Builds in Cloudflare or choose another Worker.",
    );
    expect(
      requests.some(
        (request) =>
          request.method === "PATCH" &&
          request.path ===
            "/client/v4/accounts/account-id/builds/triggers/existing-production-trigger",
      ),
    ).toBe(false);
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.path === "/client/v4/accounts/account-id/builds/triggers",
      ),
    ).toBe(false);
  });

  it("ignores deleted Workers Builds triggers when connecting a GitHub repository", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [
        {
          trigger_uuid: "deleted-production-trigger",
          deleted_on: "2026-07-01T00:00:00Z",
          branch_includes: ["main"],
          branch_excludes: [],
          build_token_uuid: "deleted-build-token",
          repo_connection: {
            repo_connection_uuid: "other-repo-connection",
            repo_id: "999",
            repo_name: "ada/other-app",
          },
        },
      ],
    });

    await wireCloudflareWorkerBuilds(buildTestWireCloudflareWorkerBuildsArgs());

    expect(
      requests.some(
        (request) =>
          request.method === "PATCH" &&
          request.path ===
            "/client/v4/accounts/account-id/builds/triggers/deleted-production-trigger",
      ),
    ).toBe(false);
    expect(
      requests.filter(
        (request) =>
          request.method === "POST" &&
          request.path === "/client/v4/accounts/account-id/builds/triggers",
      ),
    ).toHaveLength(2);
  });

  it("classifies matching Workers Builds trigger repository evidence as recommended", () => {
    expect(
      classifyCloudflareWorkerRepositoryDiscovery({
        expectedRepoId: "123",
        expectedRootDirectory: ".",
        triggers: [
          {
            trigger_name: "Production Deploy",
            root_directory: ".",
            repo_connection: {
              repo_connection_uuid: "repo-connection",
              repo_id: "123",
              repo_name: "ada/samebase-app",
            },
          },
        ],
      }),
    ).toEqual({
      classification: "recommended",
      evidence: {
        state: "matching_repo",
        repoId: "123",
        repoName: "ada/samebase-app",
        triggerName: "Production Deploy",
        rootDirectory: "/",
      },
    });
  });

  it("classifies same-repo Workers Builds trigger evidence with a different root as blocked", () => {
    expect(
      classifyCloudflareWorkerRepositoryDiscovery({
        expectedRepoId: "123",
        expectedRootDirectory: "apps/web",
        triggers: [
          {
            trigger_name: "Production Deploy",
            root_directory: "apps/admin",
            repo_connection: {
              repo_connection_uuid: "repo-connection",
              repo_id: "123",
              repo_name: "ada/samebase-app",
            },
          },
        ],
      }),
    ).toEqual({
      classification: "blocked",
      evidence: {
        state: "same_repo_different_root",
        repoId: "123",
        repoName: "ada/samebase-app",
        triggerName: "Production Deploy",
        rootDirectory: "apps/admin",
        expectedRootDirectory: "apps/web",
      },
    });
  });

  it("fails closed when a same-repo Workers Builds trigger omits the root directory", () => {
    expect(
      classifyCloudflareWorkerRepositoryDiscovery({
        expectedRepoId: "123",
        expectedRootDirectory: "apps/web",
        triggers: [
          {
            trigger_name: "Production Deploy",
            repo_connection: {
              repo_connection_uuid: "repo-connection",
              repo_id: "123",
              repo_name: "ada/samebase-app",
            },
          },
        ],
      }),
    ).toEqual({
      classification: "unknown",
      evidence: {
        state: "missing_root_directory",
        repoId: "123",
        repoName: "ada/samebase-app",
        triggerName: "Production Deploy",
        expectedRootDirectory: "apps/web",
      },
    });
  });

  it("classifies Workers without active Builds repo triggers as available", () => {
    expect(
      classifyCloudflareWorkerRepositoryDiscovery({
        expectedRepoId: "123",
        expectedRootDirectory: ".",
        triggers: [
          {
            deleted_on: "2026-07-01T00:00:00Z",
            trigger_name: "Deleted Deploy",
            repo_connection: {
              repo_connection_uuid: "repo-connection",
              repo_id: "999",
              repo_name: "ada/other-app",
            },
          },
        ],
      }),
    ).toEqual({
      classification: "available",
      evidence: { state: "none" },
    });
  });

  it("classifies different-repo Workers Builds trigger evidence as blocked", () => {
    expect(
      classifyCloudflareWorkerRepositoryDiscovery({
        expectedRepoId: "123",
        expectedRootDirectory: ".",
        triggers: [
          {
            trigger_name: "Production Deploy",
            repo_connection: {
              repo_connection_uuid: "repo-connection",
              repo_id: "999",
              repo_name: "ada/other-app",
            },
          },
        ],
      }),
    ).toEqual({
      classification: "blocked",
      evidence: {
        state: "different_repo",
        repoId: "999",
        repoName: "ada/other-app",
        triggerName: "Production Deploy",
      },
    });
  });

  it("fails closed when any active Workers Builds trigger cannot be inspected", () => {
    expect(
      classifyCloudflareWorkerRepositoryDiscovery({
        expectedRepoId: "123",
        expectedRootDirectory: ".",
        triggers: [
          {
            trigger_name: "Production Deploy",
            root_directory: ".",
            repo_connection: {
              repo_connection_uuid: "repo-connection",
              repo_id: "123",
              repo_name: "ada/samebase-app",
            },
          },
          {
            trigger_name: "Preview Deploy",
            repo_connection: {
              repo_connection_uuid: "repo-connection",
              repo_name: "ada/samebase-app",
            },
          },
        ],
      }),
    ).toEqual({
      classification: "unknown",
      evidence: {
        state: "missing_repo_id",
        repoName: "ada/samebase-app",
        triggerName: "Preview Deploy",
      },
    });
  });

  it("discovers a selected Worker from inventory without reading Worker detail", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        const method = input instanceof Request ? input.method : (init?.method ?? "GET");
        const endpoint = new URL(url).pathname;
        requests.push({ method, path: endpoint, body: undefined });

        switch (endpoint) {
          case "/client/v4/accounts/account-id/workers/scripts":
            return cloudflareSuccessResponse([buildCloudflareWorkerListItem()]);
          case "/client/v4/accounts/account-id/builds/workers/worker-tag/triggers":
            return cloudflareSuccessResponse([
              {
                trigger_name: "Production Deploy",
                root_directory: "apps/samebase",
                repo_connection: {
                  repo_connection_uuid: "repo-connection",
                  repo_id: "123",
                  repo_name: "samebase/samebase",
                },
              },
            ]);
          case "/client/v4/accounts/account-id/workers/workers/samebase-app":
            return new Response("detail endpoint should not be called", { status: 500 });
        }
        return new Response(
          JSON.stringify({
            success: false,
            errors: [{ code: 1000, message: `Unexpected endpoint ${endpoint}` }],
          }),
          { status: 404 },
        );
      }),
    );

    await expect(
      readCloudflareWorkerRepositoryDiscovery({
        token: "oauth-token",
        transport: "direct",
        accountId: "account-id",
        workerName: "samebase-app",
        expectedRepoId: "123",
        expectedRootDirectory: "apps/samebase",
      }),
    ).resolves.toEqual({
      workerName: "samebase-app",
      workerTag: "worker-tag",
      discovery: {
        classification: "recommended",
        evidence: {
          state: "matching_repo",
          repoId: "123",
          repoName: "samebase/samebase",
          triggerName: "Production Deploy",
          rootDirectory: "apps/samebase",
        },
      },
    });

    expect(requests.map((request) => request.path)).not.toContain(
      "/client/v4/accounts/account-id/workers/workers/samebase-app",
    );
  });

  it("selects the only Cloudflare account exposed to OAuth", () => {
    expect(
      selectSingleCloudflareDefaultAccount(
        normalizeCloudflareAccounts([{ id: " account-id ", name: " Account " }]),
      ),
    ).toEqual({
      state: "selected",
      accountId: "account-id",
      accountName: "Account",
    });
  });

  it("fails closed when Cloudflare OAuth exposes multiple accounts", () => {
    expect(
      selectSingleCloudflareDefaultAccount(
        normalizeCloudflareAccounts([{ id: "first-account-id" }, { id: "second-account-id" }]),
      ),
    ).toEqual({
      state: "not_selected",
    });
  });

  it("selects the build token backed by the current Cloudflare token", () => {
    expect(
      selectCurrentBuildTokenUuid({
        cloudflareTokenId: "current-token-id",
        tokens: [
          {
            name: "app-workers build token",
            uuid: "stale-build-token",
            cloudflareTokenId: "old-token-id",
          },
          {
            name: "samebase build token",
            uuid: "current-build-token",
            cloudflareTokenId: "current-token-id",
          },
        ],
      }),
    ).toBe("current-build-token");
  });

  it("prefers the current build token already attached to Workers Builds triggers", () => {
    expect(
      selectCurrentBuildTokenUuid({
        cloudflareTokenId: "current-token-id",
        preferredBuildTokenUuids: ["trigger-build-token"],
        tokens: [
          {
            name: "samebase build token",
            uuid: "current-build-token",
            cloudflareTokenId: "current-token-id",
          },
          {
            name: "older samebase build token",
            uuid: "trigger-build-token",
            cloudflareTokenId: "current-token-id",
          },
        ],
      }),
    ).toBe("trigger-build-token");
  });

  it("reuses an existing named build token for Cloudflare OAuth", () => {
    expect(
      selectReusableBuildTokenUuid({
        tokens: [
          {
            name: "other token",
            uuid: "other-build-token",
            cloudflareTokenId: "other-token-id",
          },
          {
            name: "samebase build token",
            uuid: "noter-build-token",
            cloudflareTokenId: "oauth-unverifiable-token-id",
          },
        ],
      }),
    ).toBe("noter-build-token");
  });

  it("chooses a stable Samebase-named build token when Cloudflare has duplicates", () => {
    expect(
      selectReusableBuildTokenUuid({
        tokens: [
          {
            name: "samebase build token",
            uuid: "z-noter-build-token",
            cloudflareTokenId: "oauth-unverifiable-token-id",
          },
          {
            name: "samebase build token",
            uuid: "a-noter-build-token",
            cloudflareTokenId: "older-oauth-unverifiable-token-id",
          },
        ],
      }),
    ).toBe("a-noter-build-token");
  });

  it("prefers the reusable build token already attached to Workers Builds triggers", () => {
    expect(
      selectReusableBuildTokenUuid({
        preferredBuildTokenUuids: ["trigger-build-token"],
        tokens: [
          {
            name: "samebase build token",
            uuid: "current-build-token",
            cloudflareTokenId: "oauth-unverifiable-token-id",
          },
          {
            name: "older samebase build token",
            uuid: "trigger-build-token",
            cloudflareTokenId: "oauth-unverifiable-token-id",
          },
        ],
      }),
    ).toBe("trigger-build-token");
  });

  it("does not invent a reusable build token when Cloudflare has none", () => {
    expect(selectReusableBuildTokenUuid({ tokens: [] })).toBe(undefined);
  });

  it("fails when multiple reusable build tokens cannot be distinguished", () => {
    expect(() =>
      selectReusableBuildTokenUuid({
        tokens: [
          {
            name: "other build token",
            uuid: "first-build-token",
            cloudflareTokenId: "first-token-id",
          },
          {
            name: "another build token",
            uuid: "second-build-token",
            cloudflareTokenId: "second-token-id",
          },
        ],
      }),
    ).toThrow("multiple Workers build tokens");
  });

  it("does not select stale build tokens with unrelated Cloudflare token ids", () => {
    expect(
      selectCurrentBuildTokenUuid({
        cloudflareTokenId: "current-token-id",
        tokens: [
          {
            name: "samebase build token",
            uuid: "stale-build-token",
            cloudflareTokenId: "old-token-id",
          },
        ],
      }),
    ).toBe(undefined);
  });

  it("uses direct transport when OAuth provisioning reuses a Workers build token", async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : String(input);
        requestedUrls.push(url);
        const endpoint = new URL(url).pathname;
        let result: unknown;
        switch (endpoint) {
          case "/client/v4/accounts/account-id/workers/workers/samebase-app":
            result = {
              created_on: "2026-06-22T00:00:00Z",
              id: "worker-tag",
              logpush: false,
              name: "samebase-app",
              observability: {
                enabled: false,
                head_sampling_rate: 1,
              },
              references: {
                dispatch_namespace_outbounds: [],
                domains: [],
                durable_objects: [],
                queues: [],
                workers: [],
              },
              subdomain: {
                enabled: false,
              },
              tags: [],
              tail_consumers: [],
              updated_on: "2026-06-22T00:00:00Z",
            };
            break;
          case "/client/v4/accounts/account-id/workers/scripts/samebase-app/subdomain":
            result = { enabled: false };
            break;
          case "/client/v4/accounts/account-id/builds/repos/connections":
            result = { repo_connection_uuid: "repo-connection" };
            break;
          case "/client/v4/accounts/account-id/builds/workers/worker-tag/triggers":
            result = [];
            break;
          case "/client/v4/accounts/account-id/builds/tokens":
            result = [
              {
                build_token_uuid: "reusable-build-token",
                build_token_name: "samebase build token",
                cloudflare_token_id: "opaque-oauth-token-id",
              },
            ];
            break;
          case "/client/v4/accounts/account-id/builds/triggers":
            result = { trigger_uuid: "trigger-id" };
            break;
          case "/client/v4/accounts/account-id/builds/triggers/trigger-id/environment_variables":
          case "/client/v4/accounts/account-id/builds/triggers/trigger-id/builds":
            result = {};
            break;
        }
        if (result === undefined) {
          return new Response(
            JSON.stringify({
              success: false,
              errors: [{ code: 1000, message: `Unexpected endpoint ${endpoint}` }],
            }),
            { status: 404 },
          );
        }
        return new Response(JSON.stringify({ success: true, errors: [], messages: [], result }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await wireCloudflareWorkerBuilds({
      owner: "ada",
      repo: "samebase-app",
      ghRepoId: "123",
      ghRepoOwnerId: "456",
      defaultBranch: "main",
      triggerInitialBuild: true,
      vaultId: "vault-id",
      workerName: "samebase-app",
      workerTag: "worker-tag",
      cloudflareToken: "oauth-token",
      cloudflareAuthMethod: "oauth",
      accountId: "account-id",
      buildConfig: {
        rootDir: ".",
        buildCommand: "pnpm build",
        deployCommand: "pnpm deploy",
        previewDeployCommand: "pnpm deploy:preview",
        pathIncludes: ["**/*"],
        pathExcludes: [],
      },
    });

    expect(
      requestedUrls.some(
        (url) => new URL(url).pathname === "/client/v4/accounts/account-id/builds/tokens",
      ),
    ).toBe(true);
  });

  it("chooses a stable current build token when Cloudflare has duplicates", () => {
    expect(
      selectCurrentBuildTokenUuid({
        cloudflareTokenId: "current-token-id",
        tokens: [
          {
            name: "other build token",
            uuid: "first-current-build-token",
            cloudflareTokenId: "current-token-id",
          },
          {
            name: "another build token",
            uuid: "second-current-build-token",
            cloudflareTokenId: "current-token-id",
          },
        ],
      }),
    ).toBe("second-current-build-token");
  });
});
