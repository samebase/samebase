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
  listCloudflareBuildTokens,
  listCloudflareWorkerInventory,
  readCloudflareWorkerBuildsDiscoveryForIdentity,
  readCloudflareWorkerBranchPreviewUrls,
  readRecentCloudflareWorkerBuilds,
  readCloudflareWorkerConvexBuildAccess,
  readCloudflareWorkerIdentity,
  readCloudflareWorkerIdentityByTag,
  readCloudflareWorkerTag,
  rotateConvexDeployKeysForCloudflareWorkerBuilds,
  configureCloudflareWorkerBuildsForGitHub,
} from "./cloudflareResources";
import {
  normalizeCloudflareAccounts,
  resolveCloudflareAccountAfterAuthorization,
} from "./cloudflareAccountDiscovery";
import { isRecord } from "./jsonUtils";
import {
  observedCreatedWorkerBuildSettings,
  observedLegacyPreviewEnableFailureResponse,
  observedLegacyWorkerBuildSettings,
  observedMigratedWorkerBuildSettings,
  observedMissingWorkerBuildSettingsResponse,
  observedNativeWorkerBuildSettings,
} from "./cloudflareApi/fixtures/observedWorkerBuildSettings";
import {
  observedPreviewWorkerBuildSettings,
  observedWorkerPreviewSummaries,
  observedWorkerRuntimePreview,
} from "./cloudflareApi/fixtures/observedWorkerPreviews";
import type { BuildsWorkerResponse } from "./cloudflareApi/generated/types.gen";
import { WORKER_PREVIEWS_MIGRATION_REQUIRED_MESSAGE } from "../shared/cloudflareWorkerPreviews";

type RecordedCloudflareRequest = {
  method: string;
  path: string;
  body: unknown;
  query?: string;
};

const cloudflareGitHubAppDisconnectedApiMessage =
  "This project is disconnected from your Git account, this may cause deployments to fail. Refer to https://developers.cloudflare.com/pages/platform/git-integration/#this-project-is-disconnected-from-your-git-account-this-may-cause-deployments-to-fail";
const cloudflareMcpGitHubAppDisconnectedErrorMessage = `Cloudflare MCP tool call failed: Error: Cloudflare API error: 8000008: ${cloudflareGitHubAppDisconnectedApiMessage}`;
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
      enabled: true,
      previews_enabled: true,
      url: "https://samebase-app.provider-owned.workers.dev",
    },
    tags: [],
    tail_consumers: [],
    updated_on: "2026-06-22T00:00:00Z",
  },
});

function stubCloudflareWorkerRead(envelope = cloudflareWorkerReadEnvelope) {
  const fetchMock = vi.fn(
    async () =>
      new Response(envelope, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

type WorkerBuildSettings = BuildsWorkerResponse;
const observedRepository = observedNativeWorkerBuildSettings.git_repository;
const observedProductionSettings = observedNativeWorkerBuildSettings.production_settings;
const workerTag = observedNativeWorkerBuildSettings.script_tag;
const accountId = "account-id";
const settingsPath = `/client/v4/accounts/${accountId}/builds/workers/${workerTag}`;
const buildTokenUuid = observedProductionSettings.build_token_uuid;

function cloudflareSuccessResponse(result: unknown): Response {
  return new Response(JSON.stringify({ success: true, errors: [], messages: [], result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function buildConfigureArgs(): Parameters<typeof configureCloudflareWorkerBuildsForGitHub>[0] {
  return {
    owner: observedRepository.provider_account_name,
    repo: observedRepository.repo_name,
    githubRepositoryDatabaseId: observedRepository.repo_id,
    ghRepoOwnerId: observedRepository.provider_account_id,
    defaultBranch: observedRepository.branch,
    initialBuild: {
      state: "requested",
      readCommitHash: async () => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    repositoryId: "repository-id",
    workerName: "samebase-app",
    workerTag,
    existingBuilds: "preserve_repository",
    cloudflareToken: "oauth-token",
    cloudflareAuthMethod: "oauth",
    accountId,
    buildTokenUuid,
    buildConfig: {
      rootDir: "/",
      buildCommand: "pnpm run build",
      deployCommand: "pnpm run deploy",
      previewDeployCommand: "pnpm run deploy:preview",
      pathIncludes: ["*"],
      pathExcludes: [],
    },
  };
}

function buildRotationArgs(): Parameters<
  typeof rotateConvexDeployKeysForCloudflareWorkerBuilds
>[0] {
  return {
    defaultBranch: "main",
    readInitialBuildCommitHash: async () => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    expectedRepoId: observedRepository.repo_id,
    githubRepositoryFullName: `${observedRepository.provider_account_name}/${observedRepository.repo_name}`,
    rootDirectory: "/",
    repositoryId: "repository-id",
    workerName: "samebase-app",
    workerTag,
    cloudflareToken: "oauth-token",
    cloudflareAuthMethod: "oauth",
    accountId,
    convex: { production: { deployKey: "prod:key" }, preview: { deployKey: "preview:key" } },
    convexProject: { teamId: "522530", projectId: "3108337" },
  };
}

function buildDiscoveryArgs() {
  return {
    token: "oauth-token",
    transport: "direct" as const,
    accountId,
    workerTag,
    expectedRepoId: observedRepository.repo_id,
    defaultBranch: "main",
  };
}

function buildCloudflareWorkerListItem(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    created_on: "2026-06-22T00:00:00Z",
    id: "samebase-app",
    logpush: false,
    name: "samebase-app",
    observability: { enabled: false, head_sampling_rate: 1 },
    references: {
      dispatch_namespace_outbounds: [],
      domains: [],
      durable_objects: [],
      queues: [],
      workers: [],
    },
    subdomain: { enabled: false },
    tag: "worker-tag",
    tags: [],
    tail_consumers: [],
    updated_on: "2026-06-22T00:00:00Z",
    ...overrides,
  };
}

function storedVariables(variables: unknown): Record<string, unknown> {
  if (!isRecord(variables)) return {};
  return Object.fromEntries(
    Object.entries(variables).map(([key, variable]) => {
      if (!isRecord(variable)) throw new Error("Invalid test variable.");
      return [
        key,
        {
          created_on: "2026-09-30T00:00:00Z",
          is_secret: variable["is_secret"],
          value: variable["is_secret"] ? null : variable["value"],
        },
      ];
    }),
  );
}

function stubNativeBuilds(args: {
  settings: WorkerBuildSettings | null;
  dropPreviewKey?: boolean;
}) {
  const requests: RecordedCloudflareRequest[] = [];
  let settings: unknown = args.settings;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = input instanceof Request ? input.method : (init?.method ?? "GET");
      const parsedUrl = new URL(url);
      const path = parsedUrl.pathname;
      const body: unknown =
        input instanceof Request && input.body
          ? await input.json()
          : typeof init?.body === "string"
            ? JSON.parse(init.body)
            : undefined;
      requests.push({
        method,
        path,
        body,
        ...(parsedUrl.search ? { query: parsedUrl.search } : {}),
      });
      if (path.endsWith("/builds/tokens")) {
        return cloudflareSuccessResponse([
          { build_token_uuid: buildTokenUuid, build_token_name: "test build token" },
        ]);
      }
      if (path === settingsPath && method === "GET") {
        if (!settings)
          return new Response(JSON.stringify(observedMissingWorkerBuildSettingsResponse), {
            status: 404,
          });
        return cloudflareSuccessResponse(settings);
      }
      if (path === `/client/v4/accounts/${accountId}/builds/workers` && method === "POST") {
        settings = observedCreatedWorkerBuildSettings;
        return cloudflareSuccessResponse(settings);
      }
      if (path === `${settingsPath}/migrate_to_previews` && method === "POST") {
        settings = observedMigratedWorkerBuildSettings;
        return cloudflareSuccessResponse(settings);
      }
      if (path === settingsPath && method === "PATCH" && isRecord(body) && isRecord(settings)) {
        if (body["previews_enabled"] === true && settings["previews_enabled"] === false)
          return new Response(JSON.stringify(observedLegacyPreviewEnableFailureResponse), {
            status: 400,
          });
        const production = isRecord(settings["production_settings"])
          ? settings["production_settings"]
          : {};
        const preview = isRecord(settings["previews_base_config"])
          ? settings["previews_base_config"]
          : {};
        const productionPatch = isRecord(body["production_settings"])
          ? body["production_settings"]
          : {};
        const previewPatch = isRecord(body["previews_base_config"])
          ? body["previews_base_config"]
          : {};
        const updated = {
          ...settings,
          ...body,
          git_repository: body["git_repository"]
            ? { ...observedRepository, ...body["git_repository"] }
            : settings["git_repository"],
          production_settings: {
            ...production,
            ...productionPatch,
            environment_variables: productionPatch["environment_variables"]
              ? storedVariables(productionPatch["environment_variables"])
              : production["environment_variables"],
          },
          previews_base_config: {
            ...preview,
            ...previewPatch,
            environment_variables: previewPatch["environment_variables"]
              ? storedVariables(previewPatch["environment_variables"])
              : preview["environment_variables"],
          },
        };
        if (args.dropPreviewKey) updated.previews_base_config.environment_variables = {};
        settings = updated;
        return cloudflareSuccessResponse(settings);
      }
      if (path === `${settingsPath}/triggers`) {
        return cloudflareSuccessResponse([
          {
            trigger_uuid: "b595a215-7b9b-4a04-a55d-578f39ca4335",
            root_directory: "/",
            branch_includes: ["main"],
            branch_excludes: [],
            repo_connection: { provider_type: "github", repo_id: observedRepository.repo_id },
          },
        ]);
      }
      if (path.endsWith("/builds/triggers/b595a215-7b9b-4a04-a55d-578f39ca4335/builds"))
        return cloudflareSuccessResponse({});
      throw new Error(`Unexpected Cloudflare request ${method} ${path}`);
    }),
  );
  return requests;
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

  it("sets explicit Worker observability defaults without trace propagation", () => {
    const observability = buildCloudflareWorkerCreateBody("samebase-app").observability;

    expect(observability.redact_query_string).toBe(false);
    expect(observability.traces).toBe(undefined);
  });

  it("reads the production URL and normalized custom domains from the Worker identity response", async () => {
    const fetchMock = stubCloudflareWorkerRead();

    await expect(
      readCloudflareWorkerIdentity({
        token: "oauth-token",
        transport: "direct",
        accountId: "account-id",
        workerName: "samebase-app",
      }),
    ).resolves.toEqual({
      customDomains: ["app.example.com", "www.example.com"],
      workersDev: {
        state: "enabled",
        url: "https://samebase-app.provider-owned.workers.dev",
      },
      workerName: "samebase-app",
      workerTag: "worker-tag",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads a renamed Worker by its immutable tag and returns its current name", async () => {
    const requestedPaths: string[] = [];
    const renamedEnvelope = cloudflareWorkerReadEnvelope
      .replace('"name":"samebase-app"', '"name":"renamed-app"')
      .replace("samebase-app.provider-owned.workers.dev", "renamed-app.provider-owned.workers.dev");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        requestedPaths.push(new URL(input instanceof Request ? input.url : String(input)).pathname);
        return new Response(renamedEnvelope, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await expect(
      readCloudflareWorkerIdentityByTag({
        token: "oauth-token",
        transport: "direct",
        accountId: "account-id",
        workerTag: "worker-tag",
      }),
    ).resolves.toMatchObject({ workerName: "renamed-app", workerTag: "worker-tag" });
    expect(requestedPaths).toEqual(["/client/v4/accounts/account-id/workers/workers/worker-tag"]);
  });

  it("does not expose the production URL when workers.dev is disabled", async () => {
    const disabledEnvelope = cloudflareWorkerReadEnvelope.replace(
      '"subdomain":{"enabled":true',
      '"subdomain":{"enabled":false',
    );
    stubCloudflareWorkerRead(disabledEnvelope);

    await expect(
      readCloudflareWorkerIdentity({
        token: "oauth-token",
        transport: "direct",
        accountId: "account-id",
        workerName: "samebase-app",
      }),
    ).resolves.toMatchObject({ workersDev: { state: "disabled" } });
  });

  it("marks an enabled Worker without a production URL as invalid", async () => {
    const missingUrlEnvelope = cloudflareWorkerReadEnvelope.replace(
      ',"url":"https://samebase-app.provider-owned.workers.dev"',
      "",
    );
    stubCloudflareWorkerRead(missingUrlEnvelope);

    await expect(
      readCloudflareWorkerIdentity({
        token: "oauth-token",
        transport: "direct",
        accountId: "account-id",
        workerName: "samebase-app",
      }),
    ).resolves.toMatchObject({
      workersDev: { state: "failed", reason: "response_validation_failed" },
    });
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
          build_uuid: `f9e12f48-dd63-4e28-aef7-${`${page}${index}`.padStart(12, "0")}`,
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

    const [valid, read] = await readRecentCloudflareWorkerBuilds({
      token: "oauth-token",
      transport: "direct",
      accountId: "account-id",
      workerTag: "worker-tag",
    });

    expect(valid).toBe(true);
    if (!valid) {
      throw new Error("Expected the Workers Builds history response to pass validation.");
    }
    expect(requestedPages).toEqual(["1", "2"]);
    expect(read.builds).toHaveLength(101);
    expect(read.exhausted).toBe(true);
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
      resolveCloudflareAccountAfterAuthorization(
        normalizeCloudflareAccounts([{ id: " account-id ", name: " Account " }]),
        undefined,
      ),
    ).toEqual({
      accountId: "account-id",
      accountName: "Account",
    });
  });

  it("fails closed unless Cloudflare OAuth exposes exactly one account", () => {
    const accounts = normalizeCloudflareAccounts([
      { id: "first-account-id", name: "First account" },
      { id: "second-account-id", name: "Second account" },
    ]);

    expect(resolveCloudflareAccountAfterAuthorization([], undefined)).toBeNull();
    expect(resolveCloudflareAccountAfterAuthorization(accounts, undefined)).toBeNull();
    expect(
      resolveCloudflareAccountAfterAuthorization(accounts, {
        accountId: "first-account-id",
        accountName: "First account",
      }),
    ).toBeNull();
  });

  it("rejects a Cloudflare account without a name", () => {
    expect(() => normalizeCloudflareAccounts([{ id: "account-id", name: " " }])).toThrow(
      "Cloudflare account response included an account without a name.",
    );
  });

  it("keeps the connected account only when a replacement grant can access it", () => {
    const accounts = normalizeCloudflareAccounts([{ id: "account-a", name: "Account A renamed" }]);

    expect(
      resolveCloudflareAccountAfterAuthorization(accounts, {
        accountId: "account-a",
        accountName: "Account A",
      }),
    ).toEqual({
      accountId: "account-a",
      accountName: "Account A renamed",
    });
    expect(
      resolveCloudflareAccountAfterAuthorization(accounts, {
        accountId: "account-missing",
        accountName: "Missing account",
      }),
    ).toBeNull();
  });

  it("lists Workers Builds token records in deterministic descending name order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        cloudflareSuccessResponse([
          {
            build_token_uuid: "f9e12f48-dd63-4e28-aef7-ece63d115392",
            build_token_name: "Workers Builds - 2026-08-13 10:00",
            cloudflare_token_id: "secret-provider-id",
          },
          {
            build_token_uuid: "f9e12f48-dd63-4e28-aef7-ece63d115391",
            build_token_name: "Workers Builds - 2026-08-14 01:54",
          },
          {
            build_token_uuid: "f9e12f48-dd63-4e28-aef7-ece63d115390",
            build_token_name: "Workers Builds - 2026-08-14 01:54",
          },
          {
            build_token_uuid: "f9e12f48-dd63-4e28-aef7-ece63d115394",
            build_token_name: "samebase build token",
          },
          {
            build_token_uuid: "f9e12f48-dd63-4e28-aef7-ece63d115393",
          },
        ]),
      ),
    );

    await expect(
      listCloudflareBuildTokens({
        token: "oauth-token",
        accountId: "account-id",
        transport: "direct",
      }),
    ).resolves.toEqual([
      { name: "Workers Builds - 2026-08-14 01:54", uuid: "f9e12f48-dd63-4e28-aef7-ece63d115390" },
      { name: "Workers Builds - 2026-08-14 01:54", uuid: "f9e12f48-dd63-4e28-aef7-ece63d115391" },
      { name: "Workers Builds - 2026-08-13 10:00", uuid: "f9e12f48-dd63-4e28-aef7-ece63d115392" },
      { name: "Unnamed token", uuid: "f9e12f48-dd63-4e28-aef7-ece63d115393" },
      { name: "samebase build token", uuid: "f9e12f48-dd63-4e28-aef7-ece63d115394" },
    ]);
  });
});

describe("native Worker Preview URLs", () => {
  const previewArgs = {
    token: "test-token",
    transport: "direct" as const,
    accountId,
    workerTag: observedPreviewWorkerBuildSettings.script_tag,
    workerName: observedPreviewWorkerBuildSettings.git_repository.repo_name,
    expectedRepoId: observedPreviewWorkerBuildSettings.git_repository.repo_id,
    defaultBranch: observedPreviewWorkerBuildSettings.git_repository.branch,
    rootDirectory: observedPreviewWorkerBuildSettings.production_settings.root_directory,
    branches: [observedWorkerPreviewSummaries[0].branch],
  };

  function stubPreviewReads(results: readonly unknown[]) {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const result = results[requests.length];
        requests.push(input instanceof Request ? input.url : String(input));
        if (result === undefined) throw new Error("Unexpected Preview read.");
        return cloudflareSuccessResponse(result);
      }),
    );
    return requests;
  }

  it("reads the current branch Preview ID and its runtime URL under the attached Worker", async () => {
    const requests = stubPreviewReads([
      observedPreviewWorkerBuildSettings,
      observedWorkerPreviewSummaries,
      observedWorkerRuntimePreview,
    ]);
    expect(await readCloudflareWorkerBranchPreviewUrls(previewArgs)).toEqual(
      new Map([[observedWorkerPreviewSummaries[0].branch, observedWorkerRuntimePreview.urls[0]]]),
    );
    expect(requests.map((url) => new URL(url).pathname)).toEqual([
      `/client/v4/accounts/${accountId}/builds/workers/${previewArgs.workerTag}`,
      `/client/v4/accounts/${accountId}/builds/workers/${previewArgs.workerTag}/previews`,
      `/client/v4/accounts/${accountId}/workers/workers/${previewArgs.workerTag}/previews/${observedWorkerRuntimePreview.id}`,
    ]);
  });

  it("does not read a runtime URL when there is no exact branch match", async () => {
    const requests = stubPreviewReads([
      observedPreviewWorkerBuildSettings,
      observedWorkerPreviewSummaries,
    ]);
    expect(
      await readCloudflareWorkerBranchPreviewUrls({ ...previewArgs, branches: ["other-branch"] }),
    ).toEqual(new Map());
    expect(requests).toHaveLength(2);
  });

  it.each([
    { expectedRepoId: "another-repository" },
    { rootDirectory: "apps/another-app" },
    { defaultBranch: "another-production-branch" },
  ])(
    "rejects a changed repository, root, or production branch before reading Previews (%j)",
    async (changed) => {
      const requests = stubPreviewReads([observedPreviewWorkerBuildSettings]);
      await expect(
        readCloudflareWorkerBranchPreviewUrls({ ...previewArgs, ...changed }),
      ).rejects.toThrow("no longer match");
      expect(requests).toHaveLength(1);
    },
  );

  it("does not choose between two Preview IDs for the same branch", async () => {
    const requests = stubPreviewReads([
      observedPreviewWorkerBuildSettings,
      [
        ...observedWorkerPreviewSummaries,
        { ...observedWorkerPreviewSummaries[0], preview_id: "f".repeat(32) },
      ],
    ]);
    expect(await readCloudflareWorkerBranchPreviewUrls(previewArgs)).toEqual(new Map());
    expect(requests).toHaveLength(2);
  });

  it.each([
    {
      previews: Array.from({ length: 100 }, () => ({
        ...observedWorkerPreviewSummaries[0],
        preview_id: undefined,
      })),
    },
    { previews: [...observedWorkerPreviewSummaries, ...observedWorkerPreviewSummaries] },
  ])("rejects missing or repeated Preview IDs within a page", async ({ previews }) => {
    const requests = stubPreviewReads([observedPreviewWorkerBuildSettings, previews]);
    await expect(readCloudflareWorkerBranchPreviewUrls(previewArgs)).rejects.toThrow(
      "omitted or repeated",
    );
    expect(requests).toHaveLength(2);
  });

  it("rejects a Preview ID repeated from an earlier full page", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...observedWorkerPreviewSummaries[0],
      preview_id: index.toString(16).padStart(32, "0"),
    }));
    const requests = stubPreviewReads([
      observedPreviewWorkerBuildSettings,
      firstPage,
      [firstPage[0]],
    ]);
    await expect(readCloudflareWorkerBranchPreviewUrls(previewArgs)).rejects.toThrow(
      "omitted or repeated",
    );
    expect(requests).toHaveLength(3);
  });

  it.each([
    { ...observedWorkerRuntimePreview, id: "f".repeat(32) },
    { ...observedWorkerRuntimePreview, urls: [] },
    {
      ...observedWorkerRuntimePreview,
      urls: [...observedWorkerRuntimePreview.urls, ...observedWorkerRuntimePreview.urls],
    },
    { ...observedWorkerRuntimePreview, urls: ["https://untrusted.example"] },
    { ...observedWorkerRuntimePreview, urls: ["https://branch-another-worker.rir.workers.dev"] },
  ])("omits the URL when runtime identity or URL authority is not proven", async (preview) => {
    stubPreviewReads([observedPreviewWorkerBuildSettings, observedWorkerPreviewSummaries, preview]);
    expect(await readCloudflareWorkerBranchPreviewUrls(previewArgs)).toEqual(new Map());
  });
});

describe("native Worker Builds", () => {
  it("writes each Convex key to its own settings and the project marker only to production", () => {
    const env = buildCloudflareWorkersEnvVars({
      productionConvexDeployKey: "prod:key",
      previewConvexDeployKey: "preview:key",
      convexProject: { teamId: "522530", projectId: "2939992" },
    });
    expect(env).toEqual({
      production: {
        CONVEX_DEPLOY_KEY: { value: "prod:key", is_secret: true },
        SAMEBASE_CONVEX_PROJECT: {
          value: "version=1&teamId=522530&projectId=2939992",
          is_secret: false,
        },
      },
      preview: { CONVEX_DEPLOY_KEY: { value: "preview:key", is_secret: true } },
    });
  });

  it("creates native production and preview settings before starting the exact main commit", async () => {
    const requests = stubNativeBuilds({ settings: null });
    await configureCloudflareWorkerBuildsForGitHub(buildConfigureArgs());
    const writes = requests.filter((request) => request.method !== "GET");
    expect(writes).toEqual([
      {
        method: "POST",
        path: `/client/v4/accounts/${accountId}/builds/workers`,
        body: {
          script_tag: workerTag,
          git_repository: {
            branch: observedRepository.branch,
            provider_type: observedRepository.provider_type,
            provider_account_id: observedRepository.provider_account_id,
            provider_account_name: observedRepository.provider_account_name,
            repo_id: observedRepository.repo_id,
            repo_name: observedRepository.repo_name,
          },
          previews_enabled: true,
          production_settings: {
            build_token_uuid: buildTokenUuid,
            build_command: "pnpm run build",
            deploy_command: "pnpm run deploy",
            root_directory: "/",
            build_caching_enabled: true,
            path_includes: ["*"],
            path_excludes: [],
          },
          previews_base_config: {
            build_token_uuid: buildTokenUuid,
            build_command: "pnpm run build",
            deploy_command: "pnpm run deploy:preview",
            root_directory: "/",
            build_caching_enabled: true,
            path_includes: ["*"],
            path_excludes: [],
          },
        },
      },
      {
        method: "POST",
        path: `${settingsPath}/migrate_to_previews`,
        body: { deploy_command: "pnpm run deploy:preview" },
      },
      {
        method: "POST",
        path: `/client/v4/accounts/${accountId}/builds/triggers/b595a215-7b9b-4a04-a55d-578f39ca4335/builds`,
        body: { branch: "main", commit_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      },
    ]);
  });

  it("defers the first build until the Convex keys are installed", async () => {
    const requests = stubNativeBuilds({ settings: null });
    await configureCloudflareWorkerBuildsForGitHub({
      ...buildConfigureArgs(),
      initialBuild: { state: "deferred" },
    });
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(2);
  });

  it("rejects an unavailable token before writing", async () => {
    const requests = stubNativeBuilds({ settings: null });
    await expect(
      configureCloudflareWorkerBuildsForGitHub({
        ...buildConfigureArgs(),
        buildTokenUuid: "missing",
      }),
    ).rejects.toThrow("not in Cloudflare's current list");
    expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  it("completes native setup for a created Worker when its workflow retries", async () => {
    const requests = stubNativeBuilds({ settings: observedCreatedWorkerBuildSettings });
    await configureCloudflareWorkerBuildsForGitHub({
      ...buildConfigureArgs(),
      existingBuilds: "initialize_created_worker",
      initialBuild: { state: "deferred" },
    });
    expect(requests.filter((request) => request.method !== "GET")).toMatchObject([
      {
        method: "POST",
        path: `${settingsPath}/migrate_to_previews`,
        body: { deploy_command: "pnpm run deploy:preview" },
      },
      { method: "PATCH", path: settingsPath, query: "?patch_existing_previews=true" },
    ]);
  });

  it("does not migrate a pre-existing Worker during manual configuration", async () => {
    const requests = stubNativeBuilds({ settings: observedCreatedWorkerBuildSettings });
    await expect(configureCloudflareWorkerBuildsForGitHub(buildConfigureArgs())).rejects.toThrow(
      WORKER_PREVIEWS_MIGRATION_REQUIRED_MESSAGE,
    );
    expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  it("does not start a build from an invalid commit SHA", async () => {
    const requests = stubNativeBuilds({ settings: null });
    await expect(
      configureCloudflareWorkerBuildsForGitHub({
        ...buildConfigureArgs(),
        initialBuild: { state: "requested", readCommitHash: async () => "invalid" },
      }),
    ).rejects.toThrow("full commit SHA");
    expect(
      requests.filter((request) =>
        request.path.endsWith("/b595a215-7b9b-4a04-a55d-578f39ca4335/builds"),
      ),
    ).toEqual([]);
  });

  it("requires native preview setup before updating a legacy connection", async () => {
    const requests = stubNativeBuilds({ settings: observedLegacyWorkerBuildSettings });
    await expect(
      configureCloudflareWorkerBuildsForGitHub({
        ...buildConfigureArgs(),
        githubRepositoryDatabaseId: observedLegacyWorkerBuildSettings.git_repository.repo_id,
      }),
    ).rejects.toThrow(WORKER_PREVIEWS_MIGRATION_REQUIRED_MESSAGE);
    expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  it("does not adopt a different GitHub repository", async () => {
    const requests = stubNativeBuilds({ settings: observedLegacyWorkerBuildSettings });
    await expect(
      configureCloudflareWorkerBuildsForGitHub({
        ...buildConfigureArgs(),
        githubRepositoryDatabaseId: "another",
      }),
    ).rejects.toThrow("another repository");
    expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  it("does not replace an existing connection when an unconnected Worker is required", async () => {
    const requests = stubNativeBuilds({ settings: observedLegacyWorkerBuildSettings });
    await expect(
      configureCloudflareWorkerBuildsForGitHub({
        ...buildConfigureArgs(),
        existingBuilds: "require_unconnected",
      }),
    ).rejects.toThrow("already has a Builds connection");
    expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  it("classifies captured legacy settings without requiring two trigger UUIDs", async () => {
    stubNativeBuilds({ settings: observedLegacyWorkerBuildSettings });
    await expect(
      readCloudflareWorkerBuildsDiscoveryForIdentity({
        ...buildDiscoveryArgs(),
        expectedRepoId: observedLegacyWorkerBuildSettings.git_repository.repo_id,
      }),
    ).resolves.toEqual({
      repository: { state: "ready", rootDirectory: "/", builds: { state: "legacy_previews" } },
      builds: { state: "not_connected" },
    });
  });

  it("rejects different production and preview roots", () => {
    const settings = {
      ...observedLegacyWorkerBuildSettings,
      previews_base_config: {
        ...observedLegacyWorkerBuildSettings.previews_base_config,
        root_directory: "apps/other",
      },
    };
    expect(
      classifyCloudflareWorkerRepositoryDiscovery({
        settings,
        expectedRepoId: observedLegacyWorkerBuildSettings.git_repository.repo_id,
        defaultBranch: "main",
      }),
    ).toEqual({ state: "ambiguous", reason: "multiple_root_directories" });
  });

  it("uses the production marker when no preview marker exists", async () => {
    stubNativeBuilds({ settings: observedNativeWorkerBuildSettings });
    await expect(readCloudflareWorkerConvexBuildAccess(buildDiscoveryArgs())).resolves.toEqual({
      state: "configured",
      convexProject: { teamId: "522530", projectId: "3108337" },
    });
  });

  it("reports incomplete access when the preview key is missing", async () => {
    stubNativeBuilds({
      settings: {
        ...observedNativeWorkerBuildSettings,
        previews_base_config: {
          ...observedNativeWorkerBuildSettings.previews_base_config,
          environment_variables: {},
        },
      },
    });
    await expect(readCloudflareWorkerConvexBuildAccess(buildDiscoveryArgs())).resolves.toEqual({
      state: "incomplete",
      convexProject: { teamId: "522530", projectId: "3108337" },
    });
  });

  it("does not rotate keys before the native preview settings are enabled", async () => {
    const requests = stubNativeBuilds({ settings: observedLegacyWorkerBuildSettings });
    await expect(
      rotateConvexDeployKeysForCloudflareWorkerBuilds({
        ...buildRotationArgs(),
        expectedRepoId: observedLegacyWorkerBuildSettings.git_repository.repo_id,
      }),
    ).rejects.toThrow(WORKER_PREVIEWS_MIGRATION_REQUIRED_MESSAGE);
    expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  it("rotates each scoped key and patches existing previews before starting production", async () => {
    const requests = stubNativeBuilds({ settings: observedNativeWorkerBuildSettings });
    await rotateConvexDeployKeysForCloudflareWorkerBuilds(buildRotationArgs());
    expect(requests.filter((request) => request.method !== "GET")).toEqual([
      {
        method: "PATCH",
        path: settingsPath,
        query: "?patch_existing_previews=true",
        body: {
          production_settings: {
            environment_variables: {
              CONVEX_DEPLOY_KEY: { is_secret: true, value: "prod:key" },
              SAMEBASE_CONVEX_PROJECT: {
                is_secret: false,
                value: "version=1&teamId=522530&projectId=3108337",
              },
            },
          },
          previews_base_config: {
            environment_variables: { CONVEX_DEPLOY_KEY: { is_secret: true, value: "preview:key" } },
          },
        },
      },
      {
        method: "POST",
        path: `/client/v4/accounts/${accountId}/builds/triggers/b595a215-7b9b-4a04-a55d-578f39ca4335/builds`,
        body: { branch: "main", commit_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      },
    ]);
  });

  it("does not start production when the rotated preview key is missing from read-back", async () => {
    const requests = stubNativeBuilds({
      settings: observedNativeWorkerBuildSettings,
      dropPreviewKey: true,
    });
    await expect(
      rotateConvexDeployKeysForCloudflareWorkerBuilds(buildRotationArgs()),
    ).rejects.toThrow("missing the expected CONVEX_DEPLOY_KEY");
    expect(requests.filter((request) => request.method === "POST")).toEqual([]);
  });
});
