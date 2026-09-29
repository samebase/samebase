import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const callCloudflareMcpToolMock = vi.hoisted(() => vi.fn());

vi.mock("./cloudflareMcp", () => ({
  callCloudflareMcpTool: callCloudflareMcpToolMock,
}));

import {
  assertCloudflareWorkerHasNoPreviewsForKeyRotation,
  buildCloudflareWorkerCreateBody,
  buildCloudflareWorkerEnvVars,
  CloudflareApiError,
  classifyCloudflareWorkerRepositoryDiscovery,
  deleteCloudflareResources,
  isCloudflareGitHubAppRepositoryAuthorizationError,
  isCloudflareMcpInvalidAccessTokenError,
  isCloudflareWorkerNotFoundError,
  isWorkersBuildsInvalidTokenMessage,
  listCloudflareBuildTokens,
  listCloudflareWorkerInventory,
  readRecentCloudflareWorkerBuilds,
  readCloudflareWorkerConvexBuildAccess,
  readCloudflareWorkerIdentity,
  readCloudflareWorkerIdentityByTag,
  readCloudflareWorkerRepositoryDiscoveryForIdentity,
  readCloudflareWorkerTag,
  rotateConvexDeployKeysForCloudflareWorkerBuilds,
  configureCloudflareWorkerBuildsForGitHub,
} from "./cloudflareResources";
import {
  normalizeCloudflareAccounts,
  resolveCloudflareAccountAfterAuthorization,
} from "./cloudflareAccountDiscovery";

type RecordedCloudflareRequest = {
  method: string;
  path: string;
  body: unknown;
};
const cloudflareGitHubAppDisconnectedApiMessage =
  "This project is disconnected from your Git account, this may cause deployments to fail. Refer to https://developers.cloudflare.com/pages/platform/git-integration/#this-project-is-disconnected-from-your-git-account-this-may-cause-deployments-to-fail";
const cloudflareMcpGitHubAppDisconnectedErrorMessage = `Cloudflare MCP tool call failed: Error: Cloudflare API error: 8000008: ${cloudflareGitHubAppDisconnectedApiMessage}`;
const cloudflareGitHubAppDisconnectedUserMessage =
  "Cloudflare Workers and Pages GitHub App is not authorized for ada/samebase-app. Follow Cloudflare's recovery steps at https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#reinstall-the-cloudflare-github-app: uninstall the GitHub App first, then reinstall/connect GitHub from Workers & Pages. GitHub gives this access to the Cloudflare Workers and Pages GitHub App, not to Samebase. Select All repositories so Cloudflare can connect repositories that Samebase creates later to Workers Builds, then retry.";
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
const cloudflareWorkerSubdomainDisabledEnvelope = JSON.stringify({
  success: true,
  errors: [],
  messages: [],
  result: { enabled: false },
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

function buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(): Parameters<
  typeof configureCloudflareWorkerBuildsForGitHub
>[0] {
  return {
    owner: "ada",
    repo: "samebase-app",
    githubRepositoryDatabaseId: "123",
    ghRepoOwnerId: "456",
    defaultBranch: "main",
    initialBuild: {
      state: "requested",
      readCommitHash: async () => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    repositoryId: "repository-id",
    workerName: "samebase-app",
    workerTag: "worker-tag",
    existingBuilds: "preserve_repository",
    cloudflareToken: "oauth-token",
    cloudflareAuthMethod: "oauth",
    accountId: "account-id",
    buildTokenUuid: "reusable-build-token",
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

function cloudflareSuccessResponse(result: unknown): Response {
  return new Response(JSON.stringify({ success: true, errors: [], messages: [], result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
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
  requests: RecordedCloudflareRequest[];
}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = input instanceof Request ? input.method : (init?.method ?? "GET");
      const endpoint = new URL(url).pathname;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      args.requests.push({ method, path: endpoint, body });
      if (endpoint.endsWith("/builds/workers/worker-tag/triggers") && method === "GET") {
        return cloudflareSuccessResponse(args.triggers);
      }
      if (endpoint.endsWith("/builds/tokens") && method === "GET") {
        return cloudflareSuccessResponse([
          {
            build_token_uuid: "reusable-build-token",
            build_token_name: "samebase build token",
            cloudflare_token_id: "opaque-oauth-token-id",
          },
        ]);
      }
      throw new Error(`No sourced response fixture for ${method} ${endpoint}`);
    }),
  );
}

afterEach(() => {
  callCloudflareMcpToolMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("cloudflare resources", () => {
  it("does not mistake a missing build trigger for a missing Worker", () => {
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

    expect(isCloudflareWorkerNotFoundError(triggerError)).toBe(false);
    expect(isCloudflareWorkerNotFoundError(workerError)).toBe(true);
  });

  it("sets explicit Worker observability defaults without trace propagation", () => {
    const worker = buildCloudflareWorkerCreateBody("samebase-app");

    expect(worker.subdomain).toEqual({ enabled: true, previews_enabled: true });
    expect(worker.observability.redact_query_string).toBe(false);
    expect(worker.observability.traces).toBe(undefined);
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
          method === "DELETE" &&
          path === "/client/v4/accounts/account-id/builds/workers/immutable-worker-tag"
        ) {
          return cloudflareSuccessResponse("ok");
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
        method: "DELETE",
        path: "/client/v4/accounts/account-id/builds/workers/immutable-worker-tag",
      },
      {
        method: "DELETE",
        path: "/client/v4/accounts/account-id/workers/workers/immutable-worker-tag",
      },
    ]);
  });

  it("builds scoped Convex variables for production and preview triggers", () => {
    expect(
      buildCloudflareWorkerEnvVars({
        triggerKind: "production",
        convexDeployKey: "prod-key",
        convexProject: { teamId: "team-1", projectId: "project-1" },
      }),
    ).toEqual({
      CONVEX_DEPLOY_KEY: {
        value: "prod-key",
        is_secret: true,
      },
      SAMEBASE_CONVEX_PROJECT: {
        value: "version=1&teamId=team-1&projectId=project-1",
        is_secret: false,
      },
    });
    expect(
      buildCloudflareWorkerEnvVars({
        triggerKind: "preview",
        convexDeployKey: "preview-key",
      }),
    ).toEqual({
      CONVEX_DEPLOY_KEY: {
        value: "preview-key",
        is_secret: true,
      },
    });
  });

  it("rejects a blank or unavailable selected token before a Builds write", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({
      requests,
      triggers: [],
    });

    for (const [buildTokenUuid, expectedMessage] of [
      ["", "Select a Cloudflare Workers Builds token and retry."],
      ["missing-build-token", "not in Cloudflare's current list for account account-id"],
    ] as const) {
      await expect(
        configureCloudflareWorkerBuildsForGitHub({
          ...buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
          buildTokenUuid,
        }),
      ).rejects.toThrow(expectedMessage);
    }
    expect(
      requests.some(
        (request) =>
          request.method !== "GET" &&
          request.path !== "/client/v4/accounts/account-id/builds/tokens",
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
        githubRepositoryFullName: "ada/samebase-app",
        rootDirectory: ".",
        repositoryId: "repository-id",
        workerName: "samebase-app",
        workerTag: "worker-tag",
        cloudflareToken: "oauth-token",
        cloudflareAuthMethod: "oauth",
        accountId: "account-id",
        build: {
          production: {
            triggerUuid: "production-trigger",
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
        path: "/accounts/account-id/builds/workers",
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
    expect(
      isCloudflareMcpInvalidAccessTokenError(
        new CloudflareApiError({
          method: "GET",
          path: "/accounts",
          details: [{ code: "9109", message: "Invalid access token" }],
        }),
      ),
    ).toBe(true);
  });

  it("recognizes Cloudflare GitHub App repository authorization failures", () => {
    expect(
      isCloudflareGitHubAppRepositoryAuthorizationError(
        new CloudflareApiError({
          method: "POST",
          path: "/accounts/account-id/builds/workers",
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
          method: "POST",
          path: "/accounts/account-id/builds/workers",
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
          case "/client/v4/accounts/account-id/builds/tokens":
            return cloudflareSuccessResponse([
              {
                build_token_uuid: "reusable-build-token",
                build_token_name: "samebase build token",
                cloudflare_token_id: "opaque-oauth-token-id",
              },
            ]);
          case "/client/v4/accounts/account-id/builds/workers/worker-tag/triggers":
            return cloudflareSuccessResponse([]);
          case "/client/v4/accounts/account-id/builds/workers":
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
          case "/client/v4/accounts/account-id/builds/tokens":
            return cloudflareSuccessResponse([
              {
                build_token_uuid: "reusable-build-token",
                build_token_name: "samebase build token",
                cloudflare_token_id: "opaque-oauth-token-id",
              },
            ]);
          case "/client/v4/accounts/account-id/builds/workers/worker-tag/triggers":
            return cloudflareSuccessResponse([]);
          case "/client/v4/accounts/account-id/builds/workers":
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
      "Cloudflare API request failed for POST /accounts/account-id/builds/workers: code 10000: Authentication error",
    );
  });

  it("surfaces exact Cloudflare MCP GitHub App disconnected failures from repository connection", async () => {
    callCloudflareMcpToolMock
      .mockResolvedValueOnce(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: [
            {
              build_token_uuid: "reusable-build-token",
              build_token_name: "samebase build token",
              cloudflare_token_id: "opaque-oauth-token-id",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ success: true, errors: [], messages: [], result: [] }),
      )
      .mockRejectedValueOnce(new Error(cloudflareMcpGitHubAppDisconnectedErrorMessage));

    await expect(
      configureCloudflareWorkerBuildsForGitHub({
        ...buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
        cloudflareToken: "mcp-oauth-token",
        cloudflareAuthMethod: "mcp_oauth",
      }),
    ).rejects.toThrow(cloudflareGitHubAppDisconnectedUserMessage);
    expect(callCloudflareMcpToolMock).toHaveBeenCalledTimes(3);
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
    ).rejects.toThrow("existing repository, root, or production branch does not match");
    expect(requests.every((request) => request.method === "GET")).toBe(true);
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
    ).rejects.toThrow("existing repository, root, or production branch does not match");
    expect(requests.every((request) => request.method === "GET")).toBe(true);
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
    ).rejects.toThrow("existing repository, root, or production branch does not match");
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
    ).rejects.toThrow("existing repository, root, or production branch does not match");
    expect(requests.every((request) => request.method === "GET")).toBe(true);
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
            build_token_uuid: "token-old",
            build_token_name: "Workers Builds - 2026-08-13 10:00",
            cloudflare_token_id: "secret-provider-id",
          },
          {
            build_token_uuid: "token-new-b",
            build_token_name: "Workers Builds - 2026-08-14 01:54",
          },
          {
            build_token_uuid: "token-new-a",
            build_token_name: "Workers Builds - 2026-08-14 01:54",
          },
          {
            build_token_uuid: "token-samebase",
            build_token_name: "samebase build token",
          },
          {
            build_token_uuid: "token-unnamed",
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
      { name: "Workers Builds - 2026-08-14 01:54", uuid: "token-new-a" },
      { name: "Workers Builds - 2026-08-14 01:54", uuid: "token-new-b" },
      { name: "Workers Builds - 2026-08-13 10:00", uuid: "token-old" },
      { name: "Unnamed token", uuid: "token-unnamed" },
      { name: "samebase build token", uuid: "token-samebase" },
    ]);
  });

  it("creates one Worker build configuration with previews enabled after approval", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    const beforeProviderWrite = vi.fn();
    stubEnsureCloudflareResourcesFetch({ requests, triggers: [] });

    await expect(
      configureCloudflareWorkerBuildsForGitHub({
        ...buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
        beforeProviderWrite,
      }),
    ).rejects.toThrow("No sourced response fixture for POST");

    expect(beforeProviderWrite).toHaveBeenCalledOnce();
    expect(requests.filter((request) => request.method !== "GET")).toEqual([
      {
        method: "POST",
        path: "/client/v4/accounts/account-id/builds/workers",
        body: {
          script_tag: "worker-tag",
          git_repository: {
            provider_type: "github",
            provider_account_id: "456",
            provider_account_name: "ada",
            repo_id: "123",
            repo_name: "samebase-app",
            branch: "main",
          },
          previews_enabled: true,
          production_settings: {
            build_token_uuid: "reusable-build-token",
            build_command: "pnpm build",
            build_caching_enabled: true,
            deploy_command: "pnpm deploy",
            root_directory: ".",
            path_includes: ["**/*"],
            path_excludes: [],
          },
          previews_base_config: {
            build_token_uuid: "reusable-build-token",
            build_command: "pnpm build",
            build_caching_enabled: true,
            deploy_command: "pnpm deploy:preview",
            root_directory: ".",
            path_includes: ["**/*"],
            path_excludes: [],
          },
        },
      },
    ]);
  });

  it("does not create a build configuration when approval expires", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    stubEnsureCloudflareResourcesFetch({ requests, triggers: [] });
    await expect(
      configureCloudflareWorkerBuildsForGitHub({
        ...buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
        beforeProviderWrite: () => {
          throw new Error("Approval expired");
        },
      }),
    ).rejects.toThrow("Approval expired");
    expect(requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("does not update settings when the Worker build configuration cannot be read", async () => {
    const requests: RecordedCloudflareRequest[] = [];
    const beforeProviderWrite = vi.fn();
    stubEnsureCloudflareResourcesFetch({ requests, triggers: [buildMatchingProductionTrigger()] });

    await expect(
      configureCloudflareWorkerBuildsForGitHub({
        ...buildTestConfigureCloudflareWorkerBuildsForGitHubArgs(),
        beforeProviderWrite,
      }),
    ).rejects.toThrow("No sourced response fixture for GET");
    expect(beforeProviderWrite).not.toHaveBeenCalled();
    expect(requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("reads Convex build access by Worker tag and leaves read failures unavailable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Builds read unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      readCloudflareWorkerConvexBuildAccess({
        token: "oauth-token",
        transport: "direct",
        accountId: "account-id",
        workerTag: "worker-tag",
      }),
    ).rejects.toThrow("Builds read unavailable");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-id/builds/workers/worker-tag",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("blocks key rotation when the Preview inventory cannot be read", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Preview inventory unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      assertCloudflareWorkerHasNoPreviewsForKeyRotation({
        token: "oauth-token",
        transport: "direct",
        accountId: "account-id",
        workerTag: "worker-tag",
      }),
    ).rejects.toThrow("Preview inventory unavailable");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-id/builds/workers/worker-tag/previews?page=1&per_page=1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  // The published OpenAPI contains request examples, but no WorkerResponse or Preview list example.
  // Replace these with sourced provider response tests before enabling this draft.
  it.todo("reads a migrated Worker with only its production trigger");
  it.todo(
    "reports one Worker's repository, branch, or root mismatch without rejecting other observations",
  );
  it.todo("rejects a legacy Worker without migrating it or rotating its keys");
  it.todo("updates build settings without changing existing previews");
  it.todo(
    "rotates production and preview-base keys without existing previews, preserves unrelated secrets, and verifies masked key readback",
  );
  it.todo("rejects existing previews before any Convex key is created or revoked");
  it.todo("verifies new settings before an optional initial build at the default-branch SHA");
});
