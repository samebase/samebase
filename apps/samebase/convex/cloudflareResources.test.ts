import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const callCloudflareMcpToolMock = vi.hoisted(() => vi.fn());

vi.mock("./cloudflareMcp", () => ({
  callCloudflareMcpTool: callCloudflareMcpToolMock,
}));

import {
  buildCloudflareWorkerCreateBody,
  buildCloudflareWorkersEnvVars,
  CloudflareApiError,
  ensureCloudflareResources,
  isCloudflareGitHubAppRepositoryAuthorizationError,
  isCloudflareMcpInvalidAccessTokenError,
  isWorkersBuildsInvalidTokenMessage,
  readCloudflareWorkerTag,
  selectCurrentBuildTokenUuid,
  selectReusableBuildTokenUuid,
} from "./cloudflareResources";
import {
  normalizeCloudflareAccounts,
  selectSingleCloudflareDefaultAccount,
} from "./cloudflareAccountDiscovery";

type RecordedCloudflareRequest = {
  method: string;
  path: string;
};

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

function buildTestEnsureCloudflareResourcesArgs(): Parameters<typeof ensureCloudflareResources>[0] {
  return {
    owner: "ada",
    repo: "samebase-app",
    ghRepoId: "123",
    ghRepoOwnerId: "456",
    defaultBranch: "main",
    vaultId: "vault-id",
    workerName: "samebase-app",
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
    existingWorker: { state: "created", workerTag: "worker-tag" },
    convex: {
      production: {
        cloudUrl: "https://prod.convex.cloud",
        deployKey: "prod-key",
      },
      preview: {
        cloudUrl: "https://preview.convex.cloud",
        deployKey: "preview-key",
      },
    },
    onWorkerResolved: async () => {},
  };
}

function cloudflareSuccessResponse(result: unknown): Response {
  return new Response(JSON.stringify({ success: true, errors: [], messages: [], result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function stubEnsureCloudflareResourcesFetch(args: {
  triggers: readonly unknown[];
  requests: RecordedCloudflareRequest[];
}): void {
  let createdTriggerCount = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = input instanceof Request ? input.method : (init?.method ?? "GET");
      const endpoint = new URL(url).pathname;
      args.requests.push({ method, path: endpoint });

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
        case "/client/v4/accounts/account-id/builds/triggers/created-trigger-1/environment_variables":
        case "/client/v4/accounts/account-id/builds/triggers/created-trigger-2/environment_variables":
        case "/client/v4/accounts/account-id/builds/triggers/existing-production-trigger/environment_variables":
        case "/client/v4/accounts/account-id/builds/triggers/existing-production-trigger/builds":
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
  it("omits trace propagation policy when creating Workers with traces disabled", () => {
    expect(buildCloudflareWorkerCreateBody("samebase-app").observability.traces).toBe(undefined);
  });

  it("uses the split production Convex deploy key for production Workers builds", () => {
    expect(
      buildCloudflareWorkersEnvVars({
        deployKeyName: "PROD_CONVEX_DEPLOY_KEY",
        convexDeployKey: "prod-key",
        convexUrl: "https://prod.convex.cloud",
      }),
    ).toEqual({
      PROD_CONVEX_DEPLOY_KEY: {
        value: "prod-key",
        is_secret: true,
      },
      VITE_CONVEX_URL: {
        value: "https://prod.convex.cloud",
        is_secret: false,
      },
    });
  });

  it("uses the split preview Convex deploy key for preview Workers builds", () => {
    expect(
      buildCloudflareWorkersEnvVars({
        deployKeyName: "PREVIEW_CONVEX_DEPLOY_KEY",
        convexDeployKey: "preview-key",
        convexUrl: "https://preview.convex.cloud",
      }),
    ).toEqual({
      PREVIEW_CONVEX_DEPLOY_KEY: {
        value: "preview-key",
        is_secret: true,
      },
      VITE_CONVEX_URL: {
        value: "https://preview.convex.cloud",
        is_secret: false,
      },
    });
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
      ensureCloudflareResources({
        owner: "ada",
        repo: "samebase-app",
        ghRepoId: "123",
        ghRepoOwnerId: "456",
        defaultBranch: "main",
        vaultId: "vault-id",
        workerName: "samebase-app",
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
        existingWorker: { state: "created", workerTag: "worker-tag" },
        convex: {
          production: {
            cloudUrl: "https://prod.convex.cloud",
            deployKey: "prod-key",
          },
          preview: {
            cloudUrl: "https://preview.convex.cloud",
            deployKey: "preview-key",
          },
        },
        onWorkerResolved: async () => {},
      }),
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
      await ensureCloudflareResources({
        owner: "ada",
        repo: "samebase-app",
        ghRepoId: "123",
        ghRepoOwnerId: "456",
        defaultBranch: "main",
        vaultId: "vault-id",
        workerName: "samebase-app",
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
        existingWorker: { state: "created", workerTag: "worker-tag" },
        convex: {
          production: {
            cloudUrl: "https://prod.convex.cloud",
            deployKey: "prod-key",
          },
          preview: {
            cloudUrl: "https://preview.convex.cloud",
            deployKey: "preview-key",
          },
        },
        onWorkerResolved: async () => {},
      });
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
    callCloudflareMcpToolMock
      .mockResolvedValueOnce(cloudflareWorkerReadEnvelope)
      .mockResolvedValueOnce(cloudflareWorkerSubdomainDisabledEnvelope)
      .mockRejectedValueOnce(new Error(cloudflareMcpGitHubAppDisconnectedErrorMessage));

    await expect(
      ensureCloudflareResources({
        owner: "ada",
        repo: "samebase-app",
        ghRepoId: "123",
        ghRepoOwnerId: "456",
        defaultBranch: "main",
        vaultId: "vault-id",
        workerName: "samebase-app",
        cloudflareToken: "api-key-token",
        cloudflareAuthMethod: "api_key",
        accountId: "account-id",
        buildConfig: {
          rootDir: ".",
          buildCommand: "pnpm build",
          deployCommand: "pnpm deploy",
          previewDeployCommand: "pnpm deploy:preview",
          pathIncludes: ["**/*"],
          pathExcludes: [],
        },
        existingWorker: { state: "created", workerTag: "worker-tag" },
        convex: {
          production: {
            cloudUrl: "https://prod.convex.cloud",
            deployKey: "prod-key",
          },
          preview: {
            cloudUrl: "https://preview.convex.cloud",
            deployKey: "preview-key",
          },
        },
        onWorkerResolved: async () => {},
      }),
    ).rejects.toThrow(cloudflareGitHubAppDisconnectedUserMessage);
    expect(callCloudflareMcpToolMock).toHaveBeenCalledTimes(3);
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
          repo_connection: {
            repo_connection_uuid: "repo-connection",
            repo_id: "123",
            repo_name: "ada/samebase-app",
          },
        },
      ],
    });

    await ensureCloudflareResources(buildTestEnsureCloudflareResourcesArgs());

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
      ensureCloudflareResources(buildTestEnsureCloudflareResourcesArgs()),
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
      ensureCloudflareResources(buildTestEnsureCloudflareResourcesArgs()),
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

    await ensureCloudflareResources(buildTestEnsureCloudflareResourcesArgs());

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

    await ensureCloudflareResources({
      owner: "ada",
      repo: "samebase-app",
      ghRepoId: "123",
      ghRepoOwnerId: "456",
      defaultBranch: "main",
      vaultId: "vault-id",
      workerName: "samebase-app",
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
      existingWorker: { state: "planned" },
      convex: {
        production: {
          cloudUrl: "https://prod.convex.cloud",
          deployKey: "prod-key",
        },
        preview: {
          cloudUrl: "https://preview.convex.cloud",
          deployKey: "preview-key",
        },
      },
      onWorkerResolved: async () => {},
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
