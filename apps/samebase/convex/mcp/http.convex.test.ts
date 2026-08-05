import { generateKeyPairSync } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
import { actionContracts } from "../toolRuntime/actionCatalog";
import { ACCESS_KEYS } from "../../shared/accessModel";
import { isRecord } from "../jsonUtils";
import { sha256Hex } from "./tokens";
import {
  buildMcpToolInvocationArgs,
  listMcpToolsForAccess,
  readMcpMethodForUsage,
  readMcpToolNameForUsage,
} from "./http";

describe("MCP HTTP tool invocation args", () => {
  it("uses trusted user and scope values instead of raw tool arguments", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const tokenUserId = await ctx.db.insert("users", {
        name: "Token User",
        email: "token@example.com",
        isApproved: true,
      });
      const argumentUserId = await ctx.db.insert("users", {
        name: "Argument User",
        email: "argument@example.com",
        isApproved: true,
      });
      const tokenOrganizationId = await ctx.db.insert("organizations", {
        githubInstallationId: "token_installation",
        githubOwnerId: "token_owner",
        githubOwnerLogin: "token-owner",
        githubOwnerLoginNormalized: "token-owner",
        githubOwnerType: "organization",
      });
      const argumentOrganizationId = await ctx.db.insert("organizations", {
        githubInstallationId: "argument_installation",
        githubOwnerId: "argument_owner",
        githubOwnerLogin: "argument-owner",
        githubOwnerLoginNormalized: "argument-owner",
        githubOwnerType: "organization",
      });
      return { argumentOrganizationId, argumentUserId, tokenOrganizationId, tokenUserId };
    });
    const viewer = await t.query(internal.functions.resolveViewerForUserId, {
      userId: ids.tokenUserId,
    });

    const toolArgs = buildMcpToolInvocationArgs({
      input: {
        name: "test-app",
        owner: "samebase",
        convexProjectName: "test-app",
        cloudflareWorkerName: "test-app",
        userId: ids.argumentUserId,
        grantedScopes: ["access_app_create"],
        grantId: "raw_grant",
        clientId: "raw_client",
        organizationId: ids.argumentOrganizationId,
      },
      userId: ids.tokenUserId,
      organizationId: ids.tokenOrganizationId,
      grantedScopes: [],
      grantId: "trusted_grant",
      clientId: "trusted_client",
      viewer,
    });

    expect(toolArgs).toMatchObject({
      name: "test-app",
      owner: "samebase",
      convexProjectName: "test-app",
      cloudflareWorkerName: "test-app",
      userId: ids.tokenUserId,
      organizationId: ids.tokenOrganizationId,
      grantedScopes: [],
    });
    expect(isRecord(toolArgs) && "grantId" in toolArgs).toBe(false);
    expect(isRecord(toolArgs) && "clientId" in toolArgs).toBe(false);
  });
});

describe("MCP tool listing access", () => {
  it("exposes the public auth status tool without requiring a granted scope", () => {
    expect(
      listMcpToolsForAccess({
        grantedScopes: [],
        currentAccessKeys: ["access_public"],
      }).map((tool) => tool.name),
    ).toEqual(["samebase_auth_getAuthenticationStatus"]);
  });

  it("requires both granted scopes and current user access", () => {
    expect(
      listMcpToolsForAccess({
        grantedScopes: ["access_app_create", "access_dashboard", "access_repo_connect"],
        currentAccessKeys: ["access_dashboard"],
      }).map((tool) => tool.name),
    ).toEqual(["vault_dashboard_getUserVaults"]);

    expect(
      listMcpToolsForAccess({
        grantedScopes: ["access_dashboard"],
        currentAccessKeys: ["access_dashboard", "access_app_create", "access_repo_connect"],
      }).map((tool) => tool.name),
    ).toEqual(["vault_dashboard_getUserVaults"]);

    expect(
      listMcpToolsForAccess({
        grantedScopes: ["access_repo_connect"],
        currentAccessKeys: ["access_dashboard", "access_app_create", "access_repo_connect"],
      }).map((tool) => tool.name),
    ).toEqual(["vault_actions_connectRepository"]);
  });

  it("uses Claude-compatible public tool names", () => {
    const tools = listMcpToolsForAccess({
      grantedScopes: ["access_app_create", "access_dashboard", "access_repo_connect"],
      currentAccessKeys: [
        "access_public",
        "access_dashboard",
        "access_app_create",
        "access_repo_connect",
      ],
    });

    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    }
  });

  it("renders every cataloged action contract as an MCP tool, in catalog order", () => {
    const tools = listMcpToolsForAccess({
      grantedScopes: [...ACCESS_KEYS],
      currentAccessKeys: [...ACCESS_KEYS],
    });

    expect(tools.map((tool) => tool.name)).toEqual(
      actionContracts.map((contract) => contract.mcp.name),
    );
  });

  it("keeps the grant organization out of MCP tool input schemas", () => {
    const tools = listMcpToolsForAccess({
      grantedScopes: ["access_app_create", "access_repo_connect"],
      currentAccessKeys: ["access_app_create", "access_repo_connect"],
    });

    for (const tool of tools) {
      expect(tool.inputSchema.properties).not.toHaveProperty("organizationId");
      expect(tool.inputSchema.required ?? []).not.toContain("organizationId");
    }
  });

  it("publishes human titles and structured output schemas", () => {
    const tools = listMcpToolsForAccess({
      grantedScopes: [...ACCESS_KEYS],
      currentAccessKeys: [...ACCESS_KEYS],
    });

    expect(tools.find((tool) => tool.name === "vault_actions_createRepository")).toMatchObject({
      title: "Create Samebase app",
      outputSchema: {
        type: "object",
        properties: {
          vaultId: { type: "string" },
          runId: { type: "string" },
        },
        required: ["vaultId", "runId"],
        additionalProperties: false,
      },
    });
    expect(tools.find((tool) => tool.name === "vault_cloudflare_listAccounts")).toMatchObject({
      description:
        "List Cloudflare accounts for manual Worker discovery, attachment, or creation on an existing connected vault. This is not a managed app creation preflight.",
    });
    expect(tools.find((tool) => tool.name === "vault_cloudflare_createWorker")).toMatchObject({
      title: "Create Cloudflare Worker",
      outputSchema: {
        type: "object",
        properties: {
          workerId: { type: "string" },
        },
        required: ["workerId"],
        additionalProperties: false,
      },
    });
    const configureWorkersBuildsTool = tools.find(
      (tool) => tool.name === "vault_cloudflare_configureWorkersBuildsForGitHub",
    );
    expect(configureWorkersBuildsTool).not.toHaveProperty("outputSchema");
    expect(configureWorkersBuildsTool).toMatchObject({
      description: expect.stringContaining("start a production build"),
    });
    expect(
      tools.find((tool) => tool.name === "vault_cloudflare_rotateConvexDeployKeysForWorkersBuilds"),
    ).toMatchObject({
      description: expect.stringContaining("start a production build"),
    });
  });

  it("pins high-risk tool safety annotations", () => {
    const tools = listMcpToolsForAccess({
      grantedScopes: [...ACCESS_KEYS],
      currentAccessKeys: [...ACCESS_KEYS],
    });
    const expectedSafety = [
      ["vault_actions_createRepository", false],
      ["vault_cloudflare_createWorker", false],
      ["vault_cloudflare_configureWorkersBuildsForGitHub", true],
      ["vault_cloudflare_rotateConvexDeployKeysForWorkersBuilds", true],
      ["vault_actions_retryInfrastructureProvisioning", true],
    ] as const;

    for (const [name, destructiveHint] of expectedSafety) {
      expect(tools.find((tool) => tool.name === name)).toMatchObject({
        annotations: {
          readOnlyHint: false,
          openWorldHint: true,
          destructiveHint,
        },
      });
    }
  });
});

describe("MCP usage attribution dimensions", () => {
  it("maps request methods to closed usage values", () => {
    expect(readMcpMethodForUsage("initialize")).toBe("initialize");
    expect(readMcpMethodForUsage("tools/list")).toBe("tools/list");
    expect(readMcpMethodForUsage("tools/call")).toBe("tools/call");
    expect(readMcpMethodForUsage("notifications/initialized")).toBe("notifications/initialized");
    expect(readMcpMethodForUsage("caller controlled text")).toBe("other");
  });

  it("maps tool call params to catalog names or unknown", () => {
    for (const contract of actionContracts) {
      expect(readMcpToolNameForUsage({ name: ` ${contract.mcp.name} ` })).toBe(contract.mcp.name);
    }
    expect(readMcpToolNameForUsage({ name: "caller controlled text" })).toBe("unknown");
    expect(readMcpToolNameForUsage({ name: "" })).toBe("unknown");
    expect(readMcpToolNameForUsage(null)).toBe("unknown");
  });
});

describe("MCP tools/call access enforcement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function expectMcpBearerChallenge(response: Response, errorDescription: string) {
    const header = response.headers.get("WWW-Authenticate");
    expect(header).toContain("Bearer ");
    expect(header).toContain('resource_metadata="');
    expect(header).toContain('/.well-known/oauth-protected-resource/mcp"');
    expect(header).toContain(
      'scope="access_dashboard access_app_create access_repo_connect access_provider_connections"',
    );
    expect(header).toContain('error="invalid_token"');
    expect(header).toContain(`error_description="${errorDescription}"`);
  }

  async function seedMcpBearer(args: { isApproved: boolean; scopes?: string[] }) {
    const t = makeConvexTest();
    const metadataResponse = await t.fetch("/.well-known/oauth-protected-resource");
    const metadata = await metadataResponse.json();
    if (!isRecord(metadata) || typeof metadata.resource !== "string") {
      throw new Error("Protected resource metadata did not expose the MCP resource.");
    }
    const resource = metadata.resource;

    const accessToken = "test-mcp-access-token";
    const tokenHash = await sha256Hex(accessToken);
    const now = Date.now();
    const scope = (args.scopes ?? ["access_dashboard", "access_app_create"]).join(" ");
    const ids = await t.run(async (ctx) => {
      const seededUserId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: args.isApproved,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubInstallationId: "12345",
        githubOwnerId: "owner_test",
        githubOwnerLogin: "samebase",
        githubOwnerLoginNormalized: "samebase",
        githubOwnerType: "organization",
      });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: seededUserId,
      });
      await ctx.db.insert("mcpOauthClients", {
        clientId: "client_test",
        redirectUris: ["https://example.com/callback"],
        grantTypes: ["authorization_code"],
        responseTypes: ["code"],
        tokenEndpointAuthMethod: "none",
        createdAt: now,
        updatedAt: now,
        createdBy: "dynamic_registration",
        registrationStatus: "active",
        metadataJson: "{}",
      });
      await ctx.db.insert("mcpGrants", {
        grantId: "grant_test",
        userId: seededUserId,
        organizationId,
        clientId: "client_test",
        resource,
        scope,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("mcpAccessTokens", {
        tokenHash,
        grantId: "grant_test",
        clientId: "client_test",
        userId: seededUserId,
        resource,
        scope,
        createdAt: now,
        expiresAt: now + 60 * 60 * 1000,
      });
      return { organizationId, userId: seededUserId };
    });

    const callTool = async (name: string, toolArguments: Record<string, unknown> = {}) => {
      const response = await t.fetch("/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: toolArguments },
        }),
      });
      return await response.json();
    };

    return { accessToken, callTool, t, ...ids };
  }

  it("returns cross-tool workflow instructions during initialization", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });

    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        instructions: expect.stringMatching(
          /^Samebase is only for repository-backed apps.*Never use Samebase for unrelated Git work or standalone provider resources[\s\S]*For managed app creation, use only this closed sequence: read vault_dashboard_getUserVaults, call vault_actions_createRepository directly, then poll vault_dashboard_getUserVaults\. Do not call vault_cloudflare_listAccounts first\.[\s\S]*A started provisioning run, requested build, or successful Git push is not proof of a successful deployment\./,
        ),
        serverInfo: {
          name: "Samebase",
          version: "0.1.0",
        },
      },
    });
  });

  it("advertises OAuth metadata when the bearer token is missing", async () => {
    const t = makeConvexTest();

    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(401);
    expectMcpBearerChallenge(response, "Invalid or missing bearer token.");
    await expect(response.json()).resolves.toEqual({
      error: "invalid_token",
      error_description: "Authorization header must be provided.",
    });
  });

  it("advertises OAuth metadata when the bearer token is rejected", async () => {
    const t = makeConvexTest();

    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer rejected-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(401);
    expectMcpBearerChallenge(response, "Access token rejected.");
    await expect(response.json()).resolves.toEqual({
      error: "invalid_token",
      error_description: "Access token is invalid.",
    });
  });

  it("rejects a scoped token when the user's current access no longer allows the tool", async () => {
    // role_pending_access carries neither access_dashboard nor
    // access_app_create, while the token still names both scopes. This is the exact
    // stale-token-after-downgrade case the dispatch gate exists for.
    const { callTool } = await seedMcpBearer({ isApproved: false });

    const payload = await callTool("vault_actions_createRepository");
    expect(payload).toMatchObject({
      result: {
        isError: true,
        content: [
          {
            type: "text",
            text: "Insufficient access for vault_actions_createRepository.",
          },
        ],
      },
    });
  });

  it("executes the tool when scopes and current access both allow it", async () => {
    const { callTool, organizationId, t, userId } = await seedMcpBearer({ isApproved: true });
    await t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
      userId,
      organizationId,
      ghRepoOwner: "samebase",
      ghRepoName: "existing-app",
    });

    const payload = await callTool("vault_dashboard_getUserVaults");
    expect(payload).toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: "Found 1 vault.",
          },
        ],
      },
    });
    expect(JSON.stringify(payload)).not.toContain("_creationTime");
  });

  it("creates and attaches a repository-backed Worker, then returns it in inventory", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    vi.stubEnv("GITHUB_APP_ID", "123");
    vi.stubEnv("GITHUB_APP_SLUG", "samebase-test");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "test-client");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "test-secret");
    vi.stubEnv(
      "GITHUB_APP_PRIVATE_KEY",
      privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    );
    vi.stubEnv("GITHUB_APP_OAUTH_CALLBACK_URL", "https://samebase.test/github/callback");

    const cloudflareAccountId = "00000000000000000000000000000001";
    const defaultBranchCommitSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const providerRequests: Array<{ body: unknown; method: string; path: string }> = [];
    let createdTriggerCount = 0;

    function jsonResponse(result: unknown, status = 200): Response {
      return new Response(JSON.stringify(result), {
        status,
        headers: { "content-type": "application/json" },
      });
    }

    function cloudflareResponse(result: unknown): Response {
      return jsonResponse({ success: true, errors: [], messages: [], result });
    }

    function workerDetails() {
      return {
        created_on: "2026-08-03T00:00:00Z",
        id: "mcp-worker-tag",
        logpush: false,
        name: "mcp-worker",
        observability: { enabled: false, head_sampling_rate: 1 },
        references: {
          dispatch_namespace_outbounds: [],
          domains: [],
          durable_objects: [],
          queues: [],
          workers: [],
        },
        subdomain: { enabled: false },
        tags: [],
        tail_consumers: [],
        updated_on: "2026-08-03T00:00:00Z",
      };
    }

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = input instanceof Request ? input.method : (init?.method ?? "GET");
      const rawBody =
        input instanceof Request
          ? await input.clone().text()
          : typeof init?.body === "string"
            ? init.body
            : "";
      providerRequests.push({
        body: rawBody ? JSON.parse(rawBody) : undefined,
        method,
        path: url.pathname,
      });

      if (
        method === "POST" &&
        url.hostname === "api.github.com" &&
        url.pathname === "/app/installations/12345/access_tokens"
      ) {
        return jsonResponse({
          token: "installation-token",
          expires_at: "2026-08-03T01:00:00Z",
          permissions: {},
          repositories: [],
          repository_selection: "selected",
        });
      }

      if (url.hostname === "api.github.com" && url.pathname === "/repos/samebase/demo") {
        return jsonResponse({ id: 123, default_branch: "main", owner: { id: 456 } });
      }
      if (
        url.hostname === "api.github.com" &&
        decodeURIComponent(url.pathname) === "/repos/samebase/demo/git/ref/heads/main"
      ) {
        return jsonResponse({ object: { sha: defaultBranchCommitSha } });
      }
      if (url.pathname === "/client/v4/accounts") {
        return cloudflareResponse([
          { id: cloudflareAccountId, name: "Ada Cloudflare", type: "standard" },
        ]);
      }
      if (method === "GET" && url.pathname.endsWith("/workers/workers/mcp-worker")) {
        return jsonResponse(
          {
            success: false,
            errors: [{ code: 10007, message: "Worker not found" }],
            messages: [],
            result: null,
          },
          404,
        );
      }
      if (method === "POST" && url.pathname.endsWith("/workers/workers")) {
        return cloudflareResponse(workerDetails());
      }
      if (url.pathname.endsWith("/builds/workers/mcp-worker-tag/triggers")) {
        return cloudflareResponse([]);
      }
      if (url.pathname.endsWith("/builds/repos/connections")) {
        return cloudflareResponse({ repo_connection_uuid: "repo-connection" });
      }
      if (url.pathname.endsWith("/builds/tokens")) {
        return cloudflareResponse([
          {
            build_token_uuid: "reusable-build-token",
            build_token_name: "samebase build token",
            cloudflare_token_id: "opaque-oauth-token-id",
          },
        ]);
      }
      if (method === "POST" && url.pathname.endsWith("/builds/triggers")) {
        createdTriggerCount += 1;
        return cloudflareResponse({ trigger_uuid: `created-trigger-${createdTriggerCount}` });
      }
      if (method === "POST" && url.pathname.endsWith("/builds/triggers/created-trigger-1/builds")) {
        return cloudflareResponse({});
      }
      throw new Error(`Unexpected provider request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { callTool, organizationId, t, userId } = await seedMcpBearer({
      isApproved: true,
      scopes: ["access_dashboard", "access_provider_connections"],
    });
    const vaultId = await t.run(async (ctx) => {
      const cloudflareProviderConnectionId = await ctx.db.insert("providerConnections", {
        kind: "cloudflare",
        organizationId,
        connectedByUserId: userId,
        auth: {
          method: "oauth",
          credential: "cloudflare-token",
          refreshCredential: "cloudflare-refresh-token",
          credentialExpiresAt: 4_000_000_000_000,
        },
        defaultAccount: { state: "not_selected" },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(organizationId, {
        selectedCloudflareProviderConnectionId: cloudflareProviderConnectionId,
      });
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId,
        vaultId,
        repositoryFullName: "samebase/demo",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 2,
        updatedAt: 2,
        completedAt: 2,
      });
      await ctx.db.replace(vaultId, {
        organizationId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId,
        ghRepoId: "123",
        owner: "samebase",
        name: "demo",
        visibility: "private",
        defaultBranch: "stale-main",
        connectedAt: 2,
      });
      return vaultId;
    });

    const createPayload = await callTool("vault_cloudflare_createWorker", {
      vaultId,
      accountId: cloudflareAccountId,
      workerName: "mcp-worker",
      rootDirectory: "apps/web",
    });
    const attachment = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultCloudflareWorkers")
          .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
          .unique(),
    );
    if (!attachment) {
      throw new Error("Expected the MCP tool to record the Worker attachment.");
    }

    expect(createPayload).toMatchObject({
      result: {
        content: [{ type: "text", text: "Created and attached Cloudflare Worker mcp-worker." }],
        structuredContent: { workerId: attachment._id },
      },
    });
    expect(attachment).toMatchObject({
      accountId: cloudflareAccountId,
      workerName: "mcp-worker",
      workerTag: "mcp-worker-tag",
      origin: "provisioned",
    });
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_vaultProvisioning_writeLocks")
            .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      state: "succeeded",
      lastWriteAt: { cloudflare: expect.any(Number) },
    });

    const inventoryPayload = await callTool("vault_dashboard_getUserVaults");
    expect(inventoryPayload).toMatchObject({
      result: {
        structuredContent: {
          vaults: [
            expect.objectContaining({
              _id: vaultId,
              hasCloudflareProvision: true,
              canRemoveCloudflareProvision: true,
              cloudflareWorkers: [
                {
                  workerId: attachment._id,
                  accountId: cloudflareAccountId,
                  workerName: "mcp-worker",
                  workerTag: "mcp-worker-tag",
                },
              ],
            }),
          ],
        },
      },
    });

    const workerCreateRequests = providerRequests.filter(
      (request) => request.method === "POST" && request.path.endsWith("/workers/workers"),
    );
    const triggerCreateRequests = providerRequests.filter(
      (request) => request.method === "POST" && request.path.endsWith("/builds/triggers"),
    );
    const initialBuildRequest = providerRequests.find(
      (request) =>
        request.method === "POST" &&
        request.path.endsWith("/builds/triggers/created-trigger-1/builds"),
    );
    expect(workerCreateRequests).toHaveLength(1);
    expect(triggerCreateRequests).toHaveLength(2);
    expect(triggerCreateRequests.map((request) => request.body)).toEqual([
      expect.objectContaining({
        repo_connection_uuid: "repo-connection",
        root_directory: "apps/web",
        branch_includes: ["main"],
      }),
      expect.objectContaining({
        repo_connection_uuid: "repo-connection",
        root_directory: "apps/web",
        branch_includes: ["*"],
        branch_excludes: ["main"],
      }),
    ]);
    expect(
      providerRequests.some((request) => request.method === "PATCH" || request.method === "DELETE"),
    ).toBe(false);
    expect(initialBuildRequest?.body).toEqual({
      branch: "main",
      commit_hash: defaultBranchCommitSha,
    });
  });

  it("reports authentication status for a valid MCP bearer token", async () => {
    const { callTool } = await seedMcpBearer({ isApproved: true });

    const payload = await callTool("samebase_auth_getAuthenticationStatus");
    expect(payload).toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: "Authenticated as ada@example.com.",
          },
        ],
        structuredContent: {
          authentication: {
            authenticated: true,
            user: {
              name: "Ada",
              email: "ada@example.com",
            },
            role: "role_member",
            accessKeys: expect.arrayContaining(["access_public", "access_mcp"]),
            grantedScopes: ["access_dashboard", "access_app_create"],
          },
        },
      },
    });
    expect(JSON.stringify(payload)).not.toContain("userId");
  });

  it("fails closed instead of returning malformed stored account fields", async () => {
    const { callTool, t, userId } = await seedMcpBearer({ isApproved: true });
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { email: "not-an-email" });
    });

    const payload = await callTool("samebase_auth_getAuthenticationStatus");
    expect(payload).toMatchObject({
      result: {
        isError: true,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("not-an-email");
  });
});
