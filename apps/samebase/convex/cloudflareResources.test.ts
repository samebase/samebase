import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const callCloudflareMcpToolMock = vi.hoisted(() => vi.fn());

vi.mock("./cloudflareMcp", () => ({
  callCloudflareMcpTool: callCloudflareMcpToolMock,
}));

import {
  buildCloudflareWorkerCreateBody,
  buildCloudflareWorkersEnvVars,
  CloudflareApiError,
  classifyCloudflareWorkerRepositoryDiscovery,
  deleteCloudflareResources,
  isCloudflareGitHubAppRepositoryAuthorizationError,
  isCloudflareBuildTriggerNotFoundError,
  isCloudflareMcpInvalidAccessTokenError,
  isCloudflareWorkerNotFoundError,
  isWorkersBuildsInvalidTokenMessage,
  listCloudflareWorkerInventory,
  readCloudflareWorkerBuildsDiscoveryForIdentity,
  readRecentCloudflareWorkerBuilds,
  readCloudflareWorkerConvexBuildAccess,
  readCloudflareWorkerIdentity,
  readCloudflareWorkerRepositoryDiscoveryForIdentity,
  readCloudflareWorkerTag,
  readCloudflareWorkerVersionsPage,
  selectCurrentBuildTokenUuid,
  selectReusableBuildTokenUuid,
  rotateConvexDeployKeysForCloudflareWorkerBuilds,
  configureCloudflareWorkerBuildsForGitHub,
} from "./cloudflareResources";
import {
  normalizeCloudflareAccounts,
  resolveCloudflareAccountAfterAuthorization,
  selectSingleCloudflareAccount,
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
      domains: [
        {
          hostname: "www.example.com",
          id: "domain-www",
          zone_id: "zone-id",
          zone_name: "example.com",
        },
        {
          hostname: " app.example.com ",
          id: "domain-app",
          zone_id: "zone-id",
          zone_name: "example.com",
        },
        {
          hostname: "app.example.com",
          id: "domain-app-duplicate",
          zone_id: "zone-id",
          zone_name: "example.com",
        },
      ],
      durable_objects: [],
      queues: [],
      workers: [],
    },
    subdomain: {
      enabled: false,
      previews_enabled: true,
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

function buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(): Parameters<
  typeof configureCloudflareWorkerBuildsForGitHub
>[0] {
  return {
    owner: "ada",
    repo: "samebase-app",
    ghRepoId: "123",
    ghRepoOwnerId: "456",
    defaultBranch: "main",
    initialBuild: {
      state: "requested",
      readCommitHash: async () => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    vaultId: "vault-id",
    workerName: "samebase-app",
    workerTag: "worker-tag",
    existingBuilds: "preserve_repository",
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

function buildTestCloudflareWorkerBuildsDiscoveryArgs(): Parameters<
  typeof readCloudflareWorkerBuildsDiscoveryForIdentity
>[0] {
  return {
    workerTag: "worker-tag",
    token: "oauth-token",
    transport: "direct",
    accountId: "account-id",
    defaultBranch: "main",
    expectedRepoId: "123",
  };
}

function buildTestCloudflareWorkerConvexBuildAccessArgs(): Parameters<
  typeof readCloudflareWorkerConvexBuildAccess
>[0] {
  return {
    token: "oauth-token",
    transport: "direct",
    accountId: "account-id",
    productionTriggerUuid: "production-trigger",
    previewTriggerUuid: "preview-trigger",
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
    const isSecret = value["is_secret"] === true;
    variables[key] = {
      created_on: "2026-07-05T00:00:00Z",
      is_secret: isSecret,
      value: isSecret ? null : typeof value["value"] === "string" ? value["value"] : null,
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

function buildMatchingProductionTrigger(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    trigger_uuid: "production-trigger",
    build_token_uuid: "build-token",
    trigger_name: "Production Deploy",
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
      provider_type: "github",
    },
    ...overrides,
  };
}

function buildMatchingPreviewTrigger(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    trigger_uuid: "preview-trigger",
    build_token_uuid: "build-token",
    trigger_name: "Preview Deploy",
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
      provider_type: "github",
    },
    ...overrides,
  };
}

function stubEnsureCloudflareResourcesFetch(args: {
  triggers: readonly unknown[];
  triggerReads?: readonly (readonly unknown[])[];
  requests: RecordedCloudflareRequest[];
  createTriggerWithoutIdNumber?: number;
  dropReadEnvKeys?: Record<string, readonly string[]>;
  failCreateTriggerNumber?: number;
  missingWorker?: boolean;
  missingTrigger?: string;
  readEnvVars?: Record<string, RecordedCloudflareEnvironmentVariables>;
}): void {
  let createdTriggerCount = 0;
  let triggerCreateCount = 0;
  let triggerReadCount = 0;
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
          if (triggerUuid === args.missingTrigger) {
            return new Response(
              JSON.stringify({
                success: false,
                errors: [{ code: 10007, message: "trigger not found" }],
                messages: [],
                result: null,
              }),
              { status: 404, headers: { "Content-Type": "application/json" } },
            );
          }
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

      if (
        method === "DELETE" &&
        /^\/client\/v4\/accounts\/account-id\/builds\/triggers\/[^/]+$/.test(endpoint)
      ) {
        return cloudflareSuccessResponse(null);
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
          if (args.missingWorker) {
            return new Response(
              JSON.stringify({
                success: false,
                errors: [{ code: 10007, message: "Worker not found" }],
                messages: [],
                result: null,
              }),
              { status: 404, headers: { "Content-Type": "application/json" } },
            );
          }
          return cloudflareSuccessResponse(
            args.triggerReads?.[triggerReadCount++] ?? args.triggers,
          );
        case "/client/v4/accounts/account-id/builds/tokens":
          return cloudflareSuccessResponse([
            {
              build_token_uuid: "reusable-build-token",
              build_token_name: "samebase build token",
              cloudflare_token_id: "opaque-oauth-token-id",
            },
          ]);
        case "/client/v4/accounts/account-id/builds/triggers":
          triggerCreateCount += 1;
          if (args.failCreateTriggerNumber === triggerCreateCount) {
            return new Response(
              JSON.stringify({
                success: false,
                errors: [{ code: 9999, message: "Workers Builds trigger creation failed" }],
                messages: [],
                result: null,
              }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }
          createdTriggerCount += 1;
          if (args.createTriggerWithoutIdNumber === triggerCreateCount) {
            return cloudflareSuccessResponse({});
          }
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
  it("classifies trigger not-found errors separately from Worker not-found errors", () => {
    const triggerError = new CloudflareApiError({
      method: "GET",
      path: "/accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables",
      details: [{ code: "10007", message: "trigger not found" }],
    });
    const workerError = new CloudflareApiError({
      method: "GET",
      path: "/accounts/{account_id}/builds/workers/{external_script_id}/triggers",
      details: [{ code: "10007", message: "Worker not found" }],
    });

    expect(isCloudflareBuildTriggerNotFoundError(triggerError)).toBe(true);
    expect(isCloudflareWorkerNotFoundError(triggerError)).toBe(false);
    expect(isCloudflareWorkerNotFoundError(workerError)).toBe(true);
    expect(isCloudflareBuildTriggerNotFoundError(workerError)).toBe(false);
  });

  it("omits trace propagation policy when creating Workers with traces disabled", () => {
    expect(buildCloudflareWorkerCreateBody("samebase-app").observability.traces).toBe(undefined);
  });

  it("reads workers.dev availability and normalized custom domains from the Worker identity response", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(cloudflareWorkerReadEnvelope, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      readCloudflareWorkerIdentity({
        token: "oauth-token",
        transport: "direct",
        accountId: "account-id",
        workerName: "samebase-app",
      }),
    ).resolves.toEqual({
      customDomains: ["app.example.com", "www.example.com"],
      previewUrlsEnabled: true,
      workersDevEnabled: false,
      workerName: "samebase-app",
      workerTag: "worker-tag",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads a second Workers Builds page before declaring the history exhausted", async () => {
    const requestedPages: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const page = url.searchParams.get("page") ?? "";
        requestedPages.push(page);
        const result = Array.from({ length: page === "1" ? 100 : 1 }, (_, index) => ({
          build_uuid: `build-${page}-${index}`,
        }));
        return new Response(
          JSON.stringify({
            success: true,
            errors: [],
            messages: [],
            result,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const read = await readRecentCloudflareWorkerBuilds({
      token: "oauth-token",
      transport: "direct",
      accountId: "account-id",
      workerTag: "worker-tag",
    });

    expect(requestedPages).toEqual(["1", "2"]);
    expect(read.builds).toHaveLength(101);
    expect(read.exhausted).toBe(true);
  });

  it("reads exact preview URLs from Worker versions with Cloudflare's nullable envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: true,
              errors: null,
              messages: null,
              result: [
                {
                  created_on: "2026-07-20T10:00:30.000Z",
                  id: "version-1",
                  number: 17,
                  urls: ["https://a1b2c3d4-samebase.samebase.workers.dev"],
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    await expect(
      readCloudflareWorkerVersionsPage({
        token: "oauth-token",
        transport: "direct",
        accountId: "account-id",
        workerName: "samebase",
        page: 1,
        perPage: 100,
      }),
    ).resolves.toEqual([
      {
        created_on: "2026-07-20T10:00:30.000Z",
        id: "version-1",
        number: 17,
        urls: ["https://a1b2c3d4-samebase.samebase.workers.dev"],
      },
    ]);
  });

  it("deletes a Worker by its immutable tag", async () => {
    const requests: Array<{ method: string; path: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        const method = input instanceof Request ? input.method : (init?.method ?? "GET");
        const path = new URL(url).pathname;
        requests.push({ method, path });
        if (
          method === "GET" &&
          path === "/client/v4/accounts/account-id/builds/workers/immutable-worker-tag/triggers"
        ) {
          return cloudflareSuccessResponse([]);
        }
        if (
          method === "DELETE" &&
          path === "/client/v4/accounts/account-id/workers/workers/immutable-worker-tag"
        ) {
          return cloudflareSuccessResponse(null);
        }
        throw new Error(`Unexpected Cloudflare request: ${method} ${path}`);
      }),
    );

    await deleteCloudflareResources({
      accountId: "account-id",
      workerTag: "immutable-worker-tag",
      cloudflareToken: "cloudflare-token",
      transport: "direct",
    });

    expect(requests).toEqual([
      {
        method: "GET",
        path: "/client/v4/accounts/account-id/builds/workers/immutable-worker-tag/triggers",
      },
      {
        method: "DELETE",
        path: "/client/v4/accounts/account-id/workers/workers/immutable-worker-tag",
      },
    ]);
  });

  it("uses both Convex deploy keys and the readable project marker for Workers builds", () => {
    expect(
      buildCloudflareWorkersEnvVars({
        productionConvexDeployKey: "prod-key",
        previewConvexDeployKey: "preview-key",
        convexProject: { teamId: "team-1", projectId: "project-1" },
      }),
    ).toEqual({
      CONVEX_DEPLOY_KEY: {
        value: "prod-key",
        is_secret: true,
      },
      PREVIEW_CONVEX_DEPLOY_KEY: {
        value: "preview-key",
        is_secret: true,
      },
      SAMEBASE_CONVEX_PROJECT: {
        value: "version=1&teamId=team-1&projectId=project-1",
        is_secret: false,
      },
    });
  });

  it("observes a configured Convex project regardless of marker parameter order", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    const variables = {
      CONVEX_DEPLOY_KEY: {
        created_on: "2026-07-20T00:00:00Z",
        is_secret: true,
        value: null,
      },
      PREVIEW_CONVEX_DEPLOY_KEY: {
        created_on: "2026-07-20T00:00:00Z",
        is_secret: true,
        value: null,
      },
      SAMEBASE_CONVEX_PROJECT: {
        created_on: "2026-07-20T00:00:00Z",
        is_secret: false,
        value: "version=1&teamId=team-1&projectId=project-1",
      },
    };
    stubEnsureCloudflareResourcesFetch({
      requests,
      readEnvVars: {
        "production-trigger": variables,
        "preview-trigger": {
          ...variables,
          SAMEBASE_CONVEX_PROJECT: {
            created_on: "2026-07-20T00:00:00Z",
            is_secret: false,
            value: "projectId=project-1&version=1&teamId=team-1",
          },
        },
      },
      triggers: [buildMatchingProductionTrigger(), buildMatchingPreviewTrigger()],
    });

    await expect(
      readCloudflareWorkerBuildsDiscoveryForIdentity(
        buildTestCloudflareWorkerBuildsDiscoveryArgs(),
      ),
    ).resolves.toMatchObject({
      repository: {
        state: "ready",
        rootDirectory: "/",
        builds: {
          state: "available",
          productionTriggerUuid: "production-trigger",
          previewTriggerUuid: "preview-trigger",
        },
      },
      builds: {
        state: "connected",
        productionTriggerUuid: "production-trigger",
        previewTriggerUuid: "preview-trigger",
      },
    });
    expect(requests.some((request) => request.path.includes("environment_variables"))).toBe(false);

    await expect(
      readCloudflareWorkerConvexBuildAccess(buildTestCloudflareWorkerConvexBuildAccessArgs()),
    ).resolves.toEqual({
      state: "configured",
      convexProject: { teamId: "team-1", projectId: "project-1" },
    });
    expect(
      requests.filter((request) => request.path.includes("environment_variables")),
    ).toHaveLength(2);
  });

  it("distinguishes incomplete build access from a missing relationship", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      readEnvVars: {
        "production-trigger": {
          CONVEX_DEPLOY_KEY: {
            created_on: "2026-07-20T00:00:00Z",
            is_secret: true,
            value: null,
          },
          PREVIEW_CONVEX_DEPLOY_KEY: {
            created_on: "2026-07-20T00:00:00Z",
            is_secret: true,
            value: null,
          },
          SAMEBASE_CONVEX_PROJECT: {
            created_on: "2026-07-20T00:00:00Z",
            is_secret: false,
            value: "version=1&teamId=team-1&projectId=project-1",
          },
        },
        "preview-trigger": {
          CONVEX_DEPLOY_KEY: {
            created_on: "2026-07-20T00:00:00Z",
            is_secret: true,
            value: null,
          },
          SAMEBASE_CONVEX_PROJECT: {
            created_on: "2026-07-20T00:00:00Z",
            is_secret: false,
            value: "version=1&teamId=team-1&projectId=project-1",
          },
        },
      },
      triggers: [buildMatchingProductionTrigger(), buildMatchingPreviewTrigger()],
    });

    await expect(
      readCloudflareWorkerConvexBuildAccess(buildTestCloudflareWorkerConvexBuildAccessArgs()),
    ).resolves.toEqual({
      state: "incomplete",
      convexProject: { teamId: "team-1", projectId: "project-1" },
    });
  });

  it("reports an unknown target when secret names exist without a marker", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    const variables = {
      CONVEX_DEPLOY_KEY: {
        created_on: "2026-07-20T00:00:00Z",
        is_secret: true,
        value: null,
      },
      PREVIEW_CONVEX_DEPLOY_KEY: {
        created_on: "2026-07-20T00:00:00Z",
        is_secret: true,
        value: null,
      },
    };
    stubEnsureCloudflareResourcesFetch({
      requests,
      readEnvVars: {
        "production-trigger": variables,
        "preview-trigger": variables,
      },
      triggers: [buildMatchingProductionTrigger(), buildMatchingPreviewTrigger()],
    });

    await expect(
      readCloudflareWorkerConvexBuildAccess(buildTestCloudflareWorkerConvexBuildAccessArgs()),
    ).resolves.toEqual({ state: "target_unknown" });
  });

  it("reports an unknown target when only one secret survives without a marker", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      readEnvVars: {
        "production-trigger": {
          CONVEX_DEPLOY_KEY: {
            created_on: "2026-07-20T00:00:00Z",
            is_secret: true,
            value: null,
          },
        },
        "preview-trigger": {},
      },
      triggers: [buildMatchingProductionTrigger(), buildMatchingPreviewTrigger()],
    });

    await expect(
      readCloudflareWorkerConvexBuildAccess(buildTestCloudflareWorkerConvexBuildAccessArgs()),
    ).resolves.toEqual({ state: "target_unknown" });
  });

  it("reports inconsistent markers instead of selecting one trigger", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      readEnvVars: {
        "production-trigger": {
          SAMEBASE_CONVEX_PROJECT: {
            created_on: "2026-07-20T00:00:00Z",
            is_secret: false,
            value: "version=1&teamId=team-1&projectId=project-1",
          },
        },
        "preview-trigger": {
          SAMEBASE_CONVEX_PROJECT: {
            created_on: "2026-07-20T00:00:00Z",
            is_secret: false,
            value: "version=1&teamId=team-1&projectId=project-2",
          },
        },
      },
      triggers: [buildMatchingProductionTrigger(), buildMatchingPreviewTrigger()],
    });

    await expect(
      readCloudflareWorkerConvexBuildAccess(buildTestCloudflareWorkerConvexBuildAccessArgs()),
    ).resolves.toEqual({ state: "inconsistent" });
  });

  it.each([
    "v1:team-1:project-1",
    "version=2&teamId=team-1&projectId=project-1",
    "version=1&teamId=team-1&teamId=team-2&projectId=project-1",
    "version=1&teamId=team-1&projectId=project-1&extra=value",
  ])("reports a malformed marker as invalid", async (marker) => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      readEnvVars: {
        "production-trigger": {
          SAMEBASE_CONVEX_PROJECT: {
            created_on: "2026-07-20T00:00:00Z",
            is_secret: false,
            value: marker,
          },
        },
        "preview-trigger": {
          SAMEBASE_CONVEX_PROJECT: {
            created_on: "2026-07-20T00:00:00Z",
            is_secret: false,
            value: marker,
          },
        },
      },
      triggers: [buildMatchingProductionTrigger(), buildMatchingPreviewTrigger()],
    });

    await expect(
      readCloudflareWorkerConvexBuildAccess(buildTestCloudflareWorkerConvexBuildAccessArgs()),
    ).resolves.toEqual({ state: "invalid" });
  });

  it("does not read build variables until both Builds triggers exist", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [buildMatchingProductionTrigger()],
    });

    await expect(
      readCloudflareWorkerBuildsDiscoveryForIdentity(
        buildTestCloudflareWorkerBuildsDiscoveryArgs(),
      ),
    ).resolves.toMatchObject({
      repository: {
        state: "ready",
        rootDirectory: "/",
        builds: { state: "not_available" },
      },
      builds: { state: "not_connected" },
    });
    expect(requests.some((request) => request.path.includes("environment_variables"))).toBe(false);
  });

  it("starts the manual initial build at the default-branch commit", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [],
    });

    const build = await configureCloudflareWorkerBuildsForGitHub(
      buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
    );

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
      requests.find(
        (request) =>
          request.method === "POST" &&
          request.path ===
            "/client/v4/accounts/account-id/builds/triggers/created-trigger-1/builds",
      )?.body,
    ).toEqual({
      branch: "main",
      commit_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(requests.some((request) => request.path.includes("environment_variables"))).toBe(false);
  });

  it("wires Workers Builds without starting a build when initial builds are deferred", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [],
    });

    await configureCloudflareWorkerBuildsForGitHub({
      ...buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
      initialBuild: { state: "deferred" },
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

  it("does not request a manual build when the default-branch SHA is invalid", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [],
    });

    await expect(
      configureCloudflareWorkerBuildsForGitHub({
        ...buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
        initialBuild: {
          state: "requested",
          readCommitHash: async () => "not-a-commit",
        },
      }),
    ).rejects.toThrow("Initial Workers build did not receive a full commit SHA.");
    expect(requests.some((request) => request.path.endsWith("/builds"))).toBe(false);
  });

  it.each([
    {
      failure: "a successful create response omits its id",
      createTriggerWithoutIdNumber: 1,
      failCreateTriggerNumber: undefined,
      previewTriggerUuid: "created-trigger-2",
    },
    {
      failure: "the create request reports an error after committing",
      createTriggerWithoutIdNumber: undefined,
      failCreateTriggerNumber: 1,
      previewTriggerUuid: "created-trigger-1",
    },
  ])("reconciles the production trigger when $failure", async (testCase) => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [],
      triggerReads: [
        [],
        [
          buildMatchingProductionTrigger({
            trigger_uuid: "recovered-production-trigger",
            build_token_uuid: "reusable-build-token",
          }),
        ],
      ],
      createTriggerWithoutIdNumber: testCase.createTriggerWithoutIdNumber,
      failCreateTriggerNumber: testCase.failCreateTriggerNumber,
    });

    await expect(
      configureCloudflareWorkerBuildsForGitHub({
        ...buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
        initialBuild: { state: "deferred" },
      }),
    ).resolves.toMatchObject({
      production: { triggerUuid: "recovered-production-trigger" },
      preview: { triggerUuid: testCase.previewTriggerUuid },
    });
    expect(requests.some((request) => request.method === "DELETE")).toBe(false);
  });

  it("leaves a successfully created production trigger for retry when preview creation fails", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      failCreateTriggerNumber: 2,
      triggers: [],
    });

    await expect(
      configureCloudflareWorkerBuildsForGitHub({
        ...buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
        initialBuild: { state: "deferred" },
      }),
    ).rejects.toThrow("Workers Builds trigger creation failed");

    const createRequests = requests.filter(
      (request) =>
        request.method === "POST" &&
        request.path === "/client/v4/accounts/account-id/builds/triggers",
    );
    expect(createRequests).toHaveLength(2);
    expect(
      requests.some(
        (request) =>
          request.method === "DELETE" &&
          request.path === "/client/v4/accounts/account-id/builds/triggers/created-trigger-1",
      ),
    ).toBe(false);
  });

  it("writes both Convex deploy keys to both triggers for Cloudflare's shared variable table", async () => {
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

    await rotateConvexDeployKeysForCloudflareWorkerBuilds({
      defaultBranch: "main",
      readInitialBuildCommitHash: async () => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
        },
        preview: {
          triggerUuid: "preview-trigger",
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
      convexProject: { teamId: "team-1", projectId: "project-1" },
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
    const convexEnvVars = buildCloudflareWorkersEnvVars({
      productionConvexDeployKey: "prod-key",
      previewConvexDeployKey: "preview-key",
      convexProject: { teamId: "team-1", projectId: "project-1" },
    });
    expect(requests[productionPatchIndex]?.body).toEqual(convexEnvVars);
    expect(requests[previewPatchIndex]?.body).toEqual(convexEnvVars);
    expect(requests[buildIndex]?.body).toEqual({
      branch: "main",
      commit_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
  });

  it("fails closed when the production trigger does not read back the preview deploy key", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      dropReadEnvKeys: {
        "production-trigger": ["PREVIEW_CONVEX_DEPLOY_KEY"],
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
      rotateConvexDeployKeysForCloudflareWorkerBuilds({
        defaultBranch: "main",
        readInitialBuildCommitHash: async () => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
          },
          preview: {
            triggerUuid: "preview-trigger",
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
        convexProject: { teamId: "team-1", projectId: "project-1" },
      }),
    ).rejects.toThrow(
      "Cloudflare production Workers Builds trigger production-trigger is missing build environment variable PREVIEW_CONVEX_DEPLOY_KEY after deploy-key rotation.",
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
      rotateConvexDeployKeysForCloudflareWorkerBuilds({
        defaultBranch: "main",
        readInitialBuildCommitHash: async () => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
          },
          preview: {
            triggerUuid: "preview-trigger",
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
        convexProject: { teamId: "team-1", projectId: "project-1" },
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
      configureCloudflareWorkerBuildsForGitHub({
        ...buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
        cloudflareToken: "api-key-token",
        cloudflareAuthMethod: "api_key",
      }),
    ).rejects.toThrow(cloudflareGitHubAppDisconnectedUserMessage);
    expect(callCloudflareMcpToolMock).not.toHaveBeenCalled();
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
      await configureCloudflareWorkerBuildsForGitHub(
        buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
      );
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
      configureCloudflareWorkerBuildsForGitHub({
        ...buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
        cloudflareToken: "mcp-oauth-token",
        cloudflareAuthMethod: "mcp_oauth",
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

    await configureCloudflareWorkerBuildsForGitHub(
      buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
    );

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

  it("prefers a target-repository trigger over an earlier conflicting candidate", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [
        buildMatchingProductionTrigger({
          trigger_uuid: "conflicting-production-trigger",
          repo_connection: {
            repo_connection_uuid: "other-repo-connection",
            repo_id: "999",
            repo_name: "ada/other-app",
          },
        }),
        buildMatchingProductionTrigger({ trigger_uuid: "existing-production-trigger" }),
      ],
    });

    await configureCloudflareWorkerBuildsForGitHub(
      buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
    );

    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "PATCH",
          path: "/client/v4/accounts/account-id/builds/triggers/existing-production-trigger",
        }),
      ]),
    );
    expect(
      requests.some(
        (request) =>
          request.method === "DELETE" &&
          request.path.endsWith("/builds/triggers/conflicting-production-trigger"),
      ),
    ).toBe(false);
  });

  it("does not replace an existing Builds connection when an unconnected Worker is required", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [
        buildMatchingProductionTrigger({
          trigger_uuid: "conflicting-production-trigger",
          repo_connection: {
            repo_connection_uuid: "other-repo-connection",
            repo_id: "999",
            repo_name: "ada/other-app",
          },
        }),
      ],
    });

    await expect(
      configureCloudflareWorkerBuildsForGitHub({
        ...buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
        existingBuilds: "require_unconnected",
      }),
    ).rejects.toThrow("already has a Workers Builds connection");
    expect(requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("does not create triggers when an unconnected Worker gains a Builds connection during setup", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [],
      triggerReads: [
        [],
        [
          buildMatchingProductionTrigger({
            trigger_uuid: "concurrent-production-trigger",
            repo_connection: {
              repo_connection_uuid: "other-repo-connection",
              repo_id: "999",
              repo_name: "ada/other-app",
            },
          }),
        ],
      ],
    });

    await expect(
      configureCloudflareWorkerBuildsForGitHub({
        ...buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
        existingBuilds: "require_unconnected",
      }),
    ).rejects.toThrow("already has a Workers Builds connection");
    expect(
      requests.some(
        (request) =>
          request.method === "DELETE" ||
          request.method === "PATCH" ||
          (request.method === "POST" &&
            request.path === "/client/v4/accounts/account-id/builds/triggers"),
      ),
    ).toBe(false);
  });

  it("fails closed before writes when multiple conflicting trigger candidates exist", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    const otherRepository = {
      repo_connection_uuid: "other-repo-connection",
      repo_id: "999",
      repo_name: "ada/other-app",
    };
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [
        buildMatchingProductionTrigger({
          trigger_uuid: "conflicting-production-trigger-1",
          repo_connection: otherRepository,
        }),
        buildMatchingProductionTrigger({
          trigger_uuid: "conflicting-production-trigger-2",
          repo_connection: otherRepository,
        }),
      ],
    });

    await expect(
      configureCloudflareWorkerBuildsForGitHub(
        buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
      ),
    ).rejects.toThrow("multiple matching trigger candidates");
    expect(
      requests.some(
        (request) =>
          request.method === "DELETE" ||
          (request.method === "POST" &&
            request.path === "/client/v4/accounts/account-id/builds/triggers"),
      ),
    ).toBe(false);
  });

  it("patches an existing Workers Builds trigger connected to a different root directory", async () => {
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

    await configureCloudflareWorkerBuildsForGitHub(
      buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
    );
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "PATCH",
          path: "/client/v4/accounts/account-id/builds/triggers/existing-production-trigger",
          body: expect.objectContaining({ root_directory: "." }),
        }),
      ]),
    );
    expect(
      requests.some(
        (request) =>
          request.method === "DELETE" &&
          request.path ===
            "/client/v4/accounts/account-id/builds/triggers/existing-production-trigger",
      ),
    ).toBe(false);
  });

  it("does not replace a trigger connected to a different GitHub repository", async () => {
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
      configureCloudflareWorkerBuildsForGitHub(
        buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
      ),
    ).rejects.toThrow("connected to another or deleted repository");
    expect(
      requests.some(
        (request) =>
          request.method === "DELETE" ||
          request.method === "PATCH" ||
          (request.method === "POST" &&
            request.path === "/client/v4/accounts/account-id/builds/triggers"),
      ),
    ).toBe(false);
  });

  it("patches an existing Workers Builds trigger when its repository connection id matches", async () => {
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

    await configureCloudflareWorkerBuildsForGitHub(
      buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
    );
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
          request.method === "DELETE" &&
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
    ).toBe(true);
  });

  it("does not replace a trigger whose repository identity is incomplete", async () => {
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
            repo_connection_uuid: "unrecognized-repo-connection",
            repo_name: "ada/samebase-app",
          },
        },
      ],
    });

    await expect(
      configureCloudflareWorkerBuildsForGitHub(
        buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
      ),
    ).rejects.toThrow("Cloudflare did not return enough repository identity");
    expect(
      requests.some(
        (request) => request.method === "DELETE" && request.path.includes("/builds/triggers/"),
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

  it("does not replace a trigger connected through a deleted repository connection", async () => {
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
      configureCloudflareWorkerBuildsForGitHub(
        buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
      ),
    ).rejects.toThrow("connected to another or deleted repository");
    expect(
      requests.some(
        (request) =>
          request.method === "DELETE" ||
          request.method === "PATCH" ||
          (request.method === "POST" &&
            request.path === "/client/v4/accounts/account-id/builds/triggers"),
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

    await configureCloudflareWorkerBuildsForGitHub(
      buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
    );

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

  it("uses the one live Workers Builds root as repository placement", () => {
    expect(
      classifyCloudflareWorkerRepositoryDiscovery({
        expectedRepoId: "123",
        defaultBranch: "main",
        triggers: [
          buildMatchingProductionTrigger({
            root_directory: "./apps/web/",
            build_command: "a command Samebase does not manage",
          }),
          buildMatchingPreviewTrigger({
            root_directory: "apps/web",
            deploy_command: "another command Samebase does not manage",
          }),
        ],
      }),
    ).toEqual({
      state: "ready",
      rootDirectory: "apps/web",
      builds: {
        state: "available",
        productionTriggerUuid: "production-trigger",
        previewTriggerUuid: "preview-trigger",
      },
    });
  });

  it("rejects ambiguous live Workers Builds roots", () => {
    expect(
      classifyCloudflareWorkerRepositoryDiscovery({
        expectedRepoId: "123",
        defaultBranch: "main",
        triggers: [
          buildMatchingProductionTrigger({ root_directory: "apps/web" }),
          buildMatchingPreviewTrigger({ root_directory: "apps/admin" }),
        ],
      }),
    ).toEqual({ state: "ambiguous", reason: "multiple_root_directories" });
  });

  it("requires an explicit GitHub provider type on a matching repository", () => {
    expect(
      classifyCloudflareWorkerRepositoryDiscovery({
        expectedRepoId: "123",
        defaultBranch: "main",
        triggers: [
          buildMatchingProductionTrigger({
            repo_connection: {
              repo_connection_uuid: "repo-connection",
              repo_id: "123",
              repo_name: "ada/samebase-app",
            },
          }),
        ],
      }),
    ).toEqual({ state: "ambiguous", reason: "missing_provider_type" });
  });

  it("distinguishes another provider or repository from no Builds connection", () => {
    expect(
      classifyCloudflareWorkerRepositoryDiscovery({
        expectedRepoId: "123",
        defaultBranch: "main",
        triggers: [
          buildMatchingProductionTrigger({
            repo_connection: {
              repo_connection_uuid: "repo-connection",
              repo_id: "123",
              repo_name: "ada/samebase-app",
              provider_type: "gitlab",
            },
          }),
          buildMatchingPreviewTrigger({
            repo_connection: {
              repo_connection_uuid: "repo-connection",
              repo_id: "999",
              repo_name: "ada/other-app",
              provider_type: "github",
            },
          }),
        ],
      }),
    ).toEqual({ state: "connected_elsewhere" });

    expect(
      classifyCloudflareWorkerRepositoryDiscovery({
        expectedRepoId: "123",
        defaultBranch: "main",
        triggers: [],
      }),
    ).toEqual({ state: "not_connected" });
  });

  it("fails closed when a matching trigger omits its root or repository id", () => {
    expect(
      classifyCloudflareWorkerRepositoryDiscovery({
        expectedRepoId: "123",
        defaultBranch: "main",
        triggers: [buildMatchingProductionTrigger({ root_directory: undefined })],
      }),
    ).toEqual({ state: "ambiguous", reason: "missing_root_directory" });
    expect(
      classifyCloudflareWorkerRepositoryDiscovery({
        expectedRepoId: "123",
        defaultBranch: "main",
        triggers: [
          buildMatchingProductionTrigger({
            repo_connection: {
              repo_connection_uuid: "repo-connection",
              repo_name: "ada/samebase-app",
              provider_type: "github",
            },
          }),
        ],
      }),
    ).toEqual({ state: "ambiguous", reason: "missing_repo_id" });
  });

  it("ignores deleted Workers Builds triggers during placement discovery", () => {
    expect(
      classifyCloudflareWorkerRepositoryDiscovery({
        expectedRepoId: "123",
        defaultBranch: "main",
        triggers: [buildMatchingProductionTrigger({ deleted_on: "2026-07-01T00:00:00Z" })],
      }),
    ).toEqual({ state: "not_connected" });
  });

  it("re-reads a selected Worker placement by immutable Worker tag", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        const method = input instanceof Request ? input.method : (init?.method ?? "GET");
        const endpoint = new URL(url).pathname;
        requests.push({ method, path: endpoint, body: undefined });

        switch (endpoint) {
          case "/client/v4/accounts/account-id/builds/workers/worker-tag/triggers":
            return cloudflareSuccessResponse([
              {
                trigger_name: "Production Deploy",
                root_directory: "apps/samebase",
                repo_connection: {
                  repo_connection_uuid: "repo-connection",
                  repo_id: "123",
                  repo_name: "samebase/samebase",
                  provider_type: "github",
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
      readCloudflareWorkerRepositoryDiscoveryForIdentity({
        token: "oauth-token",
        transport: "direct",
        accountId: "account-id",
        workerName: "samebase-app",
        workerTag: "worker-tag",
        expectedRepoId: "123",
        defaultBranch: "main",
      }),
    ).resolves.toEqual({
      state: "ready",
      rootDirectory: "apps/samebase",
      builds: { state: "not_available" },
    });

    expect(requests.map((request) => request.path)).not.toContain(
      "/client/v4/accounts/account-id/workers/workers/samebase-app",
    );
  });

  it("reads a complete paginated Worker inventory beyond 100 Workers", async () => {
    const workers = Array.from({ length: 101 }, (_, index) =>
      buildCloudflareWorkerListItem({
        id: `worker-tag-${index.toString().padStart(3, "0")}`,
        name: `worker-${index.toString().padStart(3, "0")}`,
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        expect(url.pathname).toBe("/client/v4/accounts/account-id/workers/workers");
        const page = Number(url.searchParams.get("page"));
        return cloudflareSuccessResponse(page === 1 ? workers.slice(0, 100) : workers.slice(100));
      }),
    );

    await expect(
      listCloudflareWorkerInventory({
        token: "oauth-token",
        transport: "direct",
        accountId: "account-id",
      }),
    ).resolves.toEqual({
      state: "complete",
      workers: workers.map((_, index) => ({
        workerName: `worker-${index.toString().padStart(3, "0")}`,
        workerTag: `worker-tag-${index.toString().padStart(3, "0")}`,
      })),
    });
  });

  it("labels the legacy Worker inventory fallback as partial", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const endpoint = new URL(input instanceof Request ? input.url : String(input)).pathname;
        if (endpoint === "/client/v4/accounts/account-id/workers/scripts") {
          return cloudflareSuccessResponse([buildCloudflareWorkerListItem()]);
        }
        return new Response(
          JSON.stringify({
            success: false,
            errors: [{ code: 1000, message: "Worker services inventory unavailable" }],
          }),
          { status: 404 },
        );
      }),
    );

    await expect(
      listCloudflareWorkerInventory({
        token: "oauth-token",
        transport: "direct",
        accountId: "account-id",
      }),
    ).resolves.toEqual({
      state: "partial",
      workers: [{ workerName: "samebase-app", workerTag: "worker-tag" }],
    });
  });

  it("selects the only Cloudflare account exposed to OAuth", () => {
    expect(
      selectSingleCloudflareAccount(
        normalizeCloudflareAccounts([{ id: " account-id ", name: " Account " }]),
      ),
    ).toEqual({
      accountId: "account-id",
      accountName: "Account",
    });
  });

  it("fails closed when Cloudflare OAuth exposes multiple accounts", () => {
    expect(
      selectSingleCloudflareAccount(
        normalizeCloudflareAccounts([
          { id: "first-account-id", name: "First account" },
          { id: "second-account-id", name: "Second account" },
        ]),
      ),
    ).toBeNull();
  });

  it("rejects a Cloudflare account without a name", () => {
    expect(() => normalizeCloudflareAccounts([{ id: "account-id", name: " " }])).toThrow(
      "Cloudflare account response included an account without a name.",
    );
  });

  it("keeps the connected account only when a replacement grant can access it", () => {
    const accounts = normalizeCloudflareAccounts([
      { id: "account-a", name: "Account A renamed" },
      { id: "account-b", name: "Account B" },
    ]);

    expect(
      resolveCloudflareAccountAfterAuthorization(accounts, {
        accountId: "account-a",
        accountName: "Account A",
      }),
    ).toEqual({
      accountId: "account-a",
      accountName: "Account A renamed",
    });
    expect(() =>
      resolveCloudflareAccountAfterAuthorization(accounts, {
        accountId: "account-missing",
        accountName: "Missing account",
      }),
    ).toThrow("The new Cloudflare authorization cannot access the connected account.");
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

    await configureCloudflareWorkerBuildsForGitHub({
      owner: "ada",
      repo: "samebase-app",
      ghRepoId: "123",
      ghRepoOwnerId: "456",
      defaultBranch: "main",
      initialBuild: {
        state: "requested",
        readCommitHash: async () => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      vaultId: "vault-id",
      workerName: "samebase-app",
      workerTag: "worker-tag",
      existingBuilds: "preserve_repository",
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
