import { generateKeyPairSync } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
import {
  observedCreatedWorkerBuildSettings,
  observedMigratedWorkerBuildSettings,
  observedMissingWorkerBuildSettingsResponse,
} from "../cloudflareApi/fixtures/observedWorkerBuildSettings";
import { makeConvexTest } from "../test.setup";
import { actionContracts } from "../toolRuntime/actionCatalog";
import { ACCESS_KEYS } from "../../shared/accessModel";
import { isRecord } from "../jsonUtils";
import { sha256Hex } from "./tokens";
import { MCP_PROTOCOL_VERSION } from "./protocol";
import {
  buildMcpToolInvocationArgs,
  listMcpToolsForAccess,
  readMcpMethodForUsage,
  readMcpToolNameForUsage,
} from "./http";

function mcpRequestHeaders(args: {
  accessToken?: string;
  origin?: string;
  protocolVersion?: string | null;
}) {
  const headers = new Headers({
    "content-type": "application/json",
  });
  const protocolVersion =
    args.protocolVersion === undefined ? MCP_PROTOCOL_VERSION : args.protocolVersion;
  if (protocolVersion !== null) {
    headers.set("MCP-Protocol-Version", protocolVersion);
  }
  if (args.accessToken) {
    headers.set("authorization", `Bearer ${args.accessToken}`);
  }
  if (args.origin) {
    headers.set("origin", args.origin);
  }
  return headers;
}

describe("MCP HTTP tool invocation args", () => {
  it("uses trusted user and scope values instead of raw tool arguments", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const tokenUserId = await ctx.db.insert("users", {
        state: "active",
        name: "Token User",
        email: "token@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const argumentUserId = await ctx.db.insert("users", {
        state: "active",
        name: "Argument User",
        email: "argument@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      return { argumentUserId, tokenUserId };
    });
    const toolArgs = buildMcpToolInvocationArgs({
      input: {
        githubRepositoryName: "test-app",
        githubOwnerLogin: "samebase",
        convexProjectName: "test-app",
        cloudflareWorkerName: "test-app",
        userId: ids.argumentUserId,
        grantedScopes: ["access_app_create"],
        grantId: "raw_grant",
        clientId: "raw_client",
      },
      userId: ids.tokenUserId,
      grantedScopes: [],
      grantId: "trusted_grant",
      clientId: "trusted_client",
    });

    expect(toolArgs).toMatchObject({
      githubRepositoryName: "test-app",
      githubOwnerLogin: "samebase",
      convexProjectName: "test-app",
      cloudflareWorkerName: "test-app",
      userId: ids.tokenUserId,
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
    ).toEqual(["account_getAuthenticationStatus"]);
  });

  it("requires both granted scopes and current user access", () => {
    expect(
      listMcpToolsForAccess({
        grantedScopes: ["access_app_create", "access_dashboard", "access_repo_connect"],
        currentAccessKeys: ["access_dashboard"],
      }).map((tool) => tool.name),
    ).toEqual(["repository_list"]);

    expect(
      listMcpToolsForAccess({
        grantedScopes: ["access_dashboard"],
        currentAccessKeys: ["access_dashboard", "access_app_create", "access_repo_connect"],
      }).map((tool) => tool.name),
    ).toEqual(["repository_list"]);

    expect(
      listMcpToolsForAccess({
        grantedScopes: ["access_repo_connect"],
        currentAccessKeys: ["access_dashboard", "access_app_create", "access_repo_connect"],
      }).map((tool) => tool.name),
    ).toEqual(["repository_connect"]);

    expect(
      listMcpToolsForAccess({
        grantedScopes: ["access_feedback_submit"],
        currentAccessKeys: ["access_feedback_submit"],
      }).map((tool) => tool.name),
    ).toEqual(["feedback_submit"]);
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

  it("takes repositories and resources by name, never by internal ID", () => {
    const tools = listMcpToolsForAccess({
      grantedScopes: [...ACCESS_KEYS],
      currentAccessKeys: [...ACCESS_KEYS],
    });

    for (const tool of tools) {
      for (const internalId of [
        "organizationId",
        "repositoryId",
        "accountId",
        "workerId",
        "workerTag",
        "convexProjectId",
        "githubRepositoryDatabaseId",
        "vaultId",
        "ghRepoId",
      ]) {
        expect(tool.inputSchema.properties).not.toHaveProperty(internalId);
      }
    }
    expect(tools.find((tool) => tool.name === "repository_create")).toMatchObject({
      inputSchema: {
        properties: {
          githubOwnerLogin: { type: "string" },
          name: { type: "string" },
          convexDeploymentRegion: {
            anyOf: [
              { const: "aws-us-east-1" },
              { const: "aws-eu-west-1" },
              { const: "aws-ca-central-1" },
              { const: "aws-ap-southeast-2" },
            ],
            description: expect.stringContaining("EU usage costs 1.3 times US usage"),
          },
          buildTokenUuid: { type: "string" },
        },
        required: ["githubOwnerLogin", "name"],
      },
    });
    expect(tools.find((tool) => tool.name === "repository_connect")).toMatchObject({
      inputSchema: {
        properties: { githubRepositoryFullName: { type: "string" } },
        required: ["githubRepositoryFullName"],
      },
    });
    expect(tools.find((tool) => tool.name === "repository_detachResource")).toMatchObject({
      inputSchema: {
        properties: {
          repository: { type: "string" },
          kind: { anyOf: [{ const: "cloudflare_worker" }, { const: "convex_project" }] },
          resourceName: { type: "string" },
        },
        required: ["repository", "kind", "resourceName"],
      },
    });
    for (const name of [
      "repository_cloudflare_connectWorker",
      "repository_cloudflare_createWorker",
      "repository_cloudflare_rotateConvexDeployKeys",
    ]) {
      expect(tools.find((tool) => tool.name === name)?.inputSchema.properties).toHaveProperty(
        "convexProjectName",
      );
    }
  });

  it("publishes human titles and structured output schemas", () => {
    const tools = listMcpToolsForAccess({
      grantedScopes: [...ACCESS_KEYS],
      currentAccessKeys: [...ACCESS_KEYS],
    });

    expect(tools.find((tool) => tool.name === "repository_list")).toMatchObject({
      outputSchema: {
        type: "object",
        properties: {
          repositories: {
            type: "array",
            items: {
              required: expect.arrayContaining([
                "repositoryId",
                "githubOwnerLogin",
                "githubRepositoryFullName",
                "cloudflareWorkers",
                "convexProjects",
              ]),
            },
          },
        },
        required: ["repositories"],
      },
    });
    expect(
      JSON.stringify(tools.find((tool) => tool.name === "repository_list")?.outputSchema),
    ).not.toMatch(/"(organizationId|accountId|workerId|workerTag|convexProjectId)"/);
    expect(tools.find((tool) => tool.name === "repository_create")).toMatchObject({
      title: "Create Samebase repository",
      outputSchema: {
        type: "object",
        required: ["repositoryId", "githubRepositoryFullName", "cloudflare"],
        additionalProperties: false,
      },
    });
    expect(tools.find((tool) => tool.name === "repository_cloudflare_findWorkers")).toMatchObject({
      outputSchema: {
        type: "object",
        required: ["inventoryState", "workers", "counts"],
      },
    });
    expect(tools.map((tool) => tool.name)).not.toContain("repository_cloudflare_listAccounts");
    expect(tools.map((tool) => tool.name)).not.toContain("cloudflare_listWorkersBuildTokens");
    const configureBuildsTool = tools.find(
      (tool) => tool.name === "repository_cloudflare_configureBuilds",
    );
    expect(configureBuildsTool).not.toHaveProperty("outputSchema");
    expect(configureBuildsTool).toMatchObject({
      description: expect.stringContaining("start a production build"),
    });
    expect(
      tools.find((tool) => tool.name === "repository_cloudflare_rotateConvexDeployKeys"),
    ).toMatchObject({
      description: expect.stringContaining("start a production build"),
    });
  });

  it("pins the RFC 125 hints of every write tool", () => {
    const tools = listMcpToolsForAccess({
      grantedScopes: [...ACCESS_KEYS],
      currentAccessKeys: [...ACCESS_KEYS],
    });
    const expectedHints = [
      ["account_createSignInLink", false, false],
      ["feedback_submit", true, true],
      ["repository_create", true, false],
      ["repository_connect", false, false],
      ["repository_retryProviderSetup", true, true],
      ["repository_detachResource", false, true],
      ["repository_cloudflare_attachWorkers", false, false],
      ["repository_cloudflare_connectWorker", true, true],
      ["repository_cloudflare_createWorker", true, false],
      ["repository_cloudflare_configureBuilds", true, true],
      ["repository_cloudflare_rotateConvexDeployKeys", true, true],
      ["repository_convex_attachProject", false, false],
      ["repository_convex_createProject", true, false],
    ] as const;

    for (const [name, openWorldHint, destructiveHint] of expectedHints) {
      expect(tools.find((tool) => tool.name === name)).toMatchObject({
        annotations: {
          readOnlyHint: false,
          openWorldHint,
          destructiveHint,
        },
      });
    }
  });

  it("marks account reads and provider discovery as bounded read-only tools", () => {
    const tools = listMcpToolsForAccess({
      grantedScopes: [...ACCESS_KEYS],
      currentAccessKeys: [...ACCESS_KEYS],
    });
    for (const name of [
      "account_getAuthenticationStatus",
      "repository_list",
      "repository_convex_findProjects",
      "repository_cloudflare_findWorkers",
    ]) {
      expect(tools.find((tool) => tool.name === name)).toMatchObject({
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
          destructiveHint: false,
        },
      });
    }
  });
});

describe("MCP usage attribution dimensions", () => {
  it("maps request methods to closed usage values", () => {
    expect(readMcpMethodForUsage("initialize")).toBe("initialize");
    expect(readMcpMethodForUsage("notifications/initialized")).toBe("notifications/initialized");
    expect(readMcpMethodForUsage("tools/list")).toBe("tools/list");
    expect(readMcpMethodForUsage("tools/call")).toBe("tools/call");
    expect(readMcpMethodForUsage("server/discover")).toBe("other");
    expect(readMcpMethodForUsage("caller controlled text")).toBe("other");
  });

  it("maps tool call params to catalog names or unknown", () => {
    for (const contract of actionContracts) {
      expect(readMcpToolNameForUsage({ name: contract.mcp.name })).toBe(contract.mcp.name);
    }
    expect(readMcpToolNameForUsage({ name: " repository_create " })).toBe("unknown");
    expect(readMcpToolNameForUsage({ name: "caller controlled text" })).toBe("unknown");
    expect(readMcpToolNameForUsage({ name: "" })).toBe("unknown");
    expect(readMcpToolNameForUsage(null)).toBe("unknown");
  });
});

describe("MCP tools/call access enforcement", () => {
  const removedRepositoryToolNames = [
    "vault_dashboard_getUserVaults",
    "vault_actions_createRepository",
    "vault_actions_connectRepository",
    "vault_convex_discoverProjects",
    "vault_cloudflare_discoverWorkers",
    "vault_convex_attachProjects",
    "vault_cloudflare_attachWorkers",
    "vault_cloudflare_createWorker",
    "vault_cloudflare_configureWorkersBuildsForGitHub",
    "vault_cloudflare_rotateConvexDeployKeysForWorkersBuilds",
    "vault_actions_retryInfrastructureProvisioning",
  ] as const;

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
      'scope="access_dashboard access_provider_connections access_app_create access_repo_connect access_feedback_submit access_browser_login_handoff"',
    );
    expect(header).toContain('error="invalid_token"');
    expect(header).toContain(`error_description="${errorDescription}"`);
  }

  it("uses one authorization-server issuer in both metadata documents", async () => {
    const t = makeConvexTest();
    const rootResponse = await t.fetch("/.well-known/oauth-authorization-server");
    const pathResponse = await t.fetch("/.well-known/oauth-authorization-server/mcp");
    const rootMetadata = await rootResponse.json();
    const pathMetadata = await pathResponse.json();

    expect(rootMetadata).toMatchObject({
      issuer: expect.any(String),
      authorization_response_iss_parameter_supported: true,
    });
    expect(pathMetadata).toEqual(rootMetadata);
  });

  async function seedMcpBearer(args: {
    isApproved: boolean;
    scopes?: string[];
    tokenResource?: string;
  }) {
    const t = makeConvexTest();
    const metadataResponse = await t.fetch("/.well-known/oauth-protected-resource");
    const metadata = await metadataResponse.json();
    if (!isRecord(metadata) || typeof metadata["resource"] !== "string") {
      throw new Error("Protected resource metadata did not expose the MCP resource.");
    }
    const resource = metadata["resource"];
    const tokenResource = args.tokenResource ?? resource;

    const accessToken = "test-mcp-access-token";
    const tokenHash = await sha256Hex(accessToken);
    const now = Date.now();
    const scope = (args.scopes ?? ["access_dashboard", "access_app_create"]).join(" ");
    const ids = await t.run(async (ctx) => {
      const seededUserId = await ctx.db.insert("users", {
        state: "active",
        name: "Ada",
        email: "ada@example.com",
        isApproved: args.isApproved,
        ...(args.isApproved ? { termsVersion: "2026-08-12", termsAcceptedAt: 1 } : {}),
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
        role: "owner",
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
        clientId: "client_test",
        resource: tokenResource,
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
        resource: tokenResource,
        scope,
        createdAt: now,
        expiresAt: now + 60 * 60 * 1000,
      });
      return { organizationId, userId: seededUserId };
    });

    const callTool = async (name: string, toolArguments: Record<string, unknown> = {}) => {
      const response = await t.fetch("/mcp", {
        method: "POST",
        headers: mcpRequestHeaders({ accessToken }),
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

  it("returns a correlated legacy fallback before authorization", async () => {
    const t = makeConvexTest();
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "MCP-Protocol-Version": "2026-07-28",
        "Mcp-Method": "server/discover",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "discover-1",
        method: "server/discover",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.has("WWW-Authenticate")).toBe(false);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: "discover-1",
      error: {
        code: -32601,
        message: "Method not found: server/discover",
      },
    });
  });

  it("does not bypass authentication for a server/discover notification", async () => {
    const t = makeConvexTest();
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({}),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "server/discover",
        params: {},
      }),
    });

    expect(response.status).toBe(401);
    expectMcpBearerChallenge(response, "Invalid or missing bearer token.");
  });

  it("advertises OAuth metadata when the bearer token is missing", async () => {
    const t = makeConvexTest();

    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({}),
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
      headers: mcpRequestHeaders({ accessToken: "rejected-token" }),
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

  it("authenticates and initializes the current Codex client shape", async () => {
    const initializeBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { elicitation: {} },
        clientInfo: {
          name: "codex-mcp-client",
          title: "Codex",
          version: "0.53.0",
        },
      },
    });

    const unauthenticatedTest = makeConvexTest();
    const unauthenticatedResponse = await unauthenticatedTest.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ protocolVersion: null }),
      body: initializeBody,
    });
    expect(unauthenticatedResponse.status).toBe(401);
    expectMcpBearerChallenge(unauthenticatedResponse, "Invalid or missing bearer token.");
    const unauthenticatedPayload = await unauthenticatedResponse.json();
    expect(JSON.stringify(unauthenticatedPayload)).not.toContain("-32020");

    const { accessToken, t } = await seedMcpBearer({ isApproved: true });
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ accessToken, protocolVersion: null }),
      body: initializeBody,
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "Samebase", version: "0.3.0" },
        instructions: expect.stringMatching(
          /^Samebase manages repositories: a GitHub repository with its attached Cloudflare Workers and Convex projects, in every organization of the signed-in account\.[\s\S]*Name a repository by its GitHub full name \(owner\/name\)\.[\s\S]*For a request to open the Samebase dashboard, call account_createSignInLink directly and show the returned URL as a clickable link\.[\s\S]*call it only after the user accepts\.[\s\S]*A started setup, requested build, or Git push does not prove a successful deployment\.$/,
        ),
      },
    });
    // The server picks tokens and installs deploy keys, so the instructions stay near 1k characters.
    expect(payload.result.instructions.length).toBeLessThan(1_200);
    expect(JSON.stringify(payload)).not.toContain("marketplace");
    expect(JSON.stringify(payload)).not.toContain("resultType");
  });

  it("returns invalid params for malformed initialize requests", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });
    const validClientInfo = { name: "codex-mcp-client", version: "0.53.0" };
    const cases = [
      null,
      { protocolVersion: "", capabilities: {}, clientInfo: validClientInfo },
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: "invalid",
        clientInfo: validClientInfo,
      },
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "", version: "0.53.0" },
      },
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "codex-mcp-client", version: "" },
      },
    ];

    for (const [index, params] of cases.entries()) {
      const response = await t.fetch("/mcp", {
        method: "POST",
        headers: mcpRequestHeaders({ accessToken, protocolVersion: null }),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: index + 1,
          method: "initialize",
          params,
        }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        jsonrpc: "2.0",
        id: index + 1,
        error: { code: -32602 },
      });
    }
  });

  it("accepts the initialized notification", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ accessToken }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      }),
    });

    expect(response.status).toBe(202);
    expect(response.headers.has("WWW-Authenticate")).toBe(false);
    await expect(response.text()).resolves.toBe("");
  });

  it("requires authentication for the initialized notification", async () => {
    const t = makeConvexTest();
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({}),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      }),
    });

    expect(response.status).toBe(401);
    expectMcpBearerChallenge(response, "Invalid or missing bearer token.");
  });

  it("rejects initialized as a request when it has an id", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ accessToken }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "initialized-request",
        method: "notifications/initialized",
        params: {},
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: "initialized-request",
      error: {
        code: -32601,
        message: "Method not found: notifications/initialized",
      },
    });
  });

  it("requires the 2025-06-18 protocol header after initialization", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });

    const requestTools = (protocolVersion: string | null) =>
      t.fetch("/mcp", {
        method: "POST",
        headers: mcpRequestHeaders({ accessToken, protocolVersion }),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      });

    const supportedResponse = await requestTools(MCP_PROTOCOL_VERSION);
    expect(supportedResponse.status).toBe(200);
    await expect(supportedResponse.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { tools: expect.any(Array) },
    });

    const missingResponse = await requestTools(null);
    expect(missingResponse.status).toBe(400);
    expect(missingResponse.headers.has("WWW-Authenticate")).toBe(false);
    await expect(missingResponse.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32020,
        message: "MCP-Protocol-Version header is required.",
      },
    });

    const unsupportedResponse = await requestTools("2025-03-26");
    expect(unsupportedResponse.status).toBe(400);
    expect(unsupportedResponse.headers.has("WWW-Authenticate")).toBe(false);
    await expect(unsupportedResponse.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32022,
        message: "Unsupported MCP-Protocol-Version: 2025-03-26",
      },
    });
  });

  it("rejects a foreign Origin", async () => {
    const t = makeConvexTest();

    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ origin: "https://attacker.example" }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload).not.toHaveProperty("id");
  });

  it("rejects GET and DELETE transport requests", async () => {
    const t = makeConvexTest();

    for (const method of ["GET", "DELETE"]) {
      const response = await t.fetch("/mcp", { method });
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");

      const foreignOriginResponse = await t.fetch("/mcp", {
        method,
        headers: { Origin: "https://attacker.example" },
      });
      expect(foreignOriginResponse.status).toBe(403);
      expect(await foreignOriginResponse.json()).not.toHaveProperty("id");
    }
  });

  it("uses only readable request IDs in invalid request errors", async () => {
    const t = makeConvexTest();

    for (const id of [17, "request-17"]) {
      const response = await t.fetch("/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "1.0", id, method: "tools/list" }),
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        id,
        error: { code: -32600 },
      });
    }

    for (const id of [null, 1.5, { nested: "invalid" }]) {
      const response = await t.fetch("/mcp", {
        method: "POST",
        headers: mcpRequestHeaders({}),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method: "tools/list",
          params: {},
        }),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).not.toHaveProperty("id");
    }

    const parseErrorResponse = await t.fetch("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect(parseErrorResponse.status).toBe(400);
    expect(await parseErrorResponse.json()).not.toHaveProperty("id");
  });

  it("rejects every tools/list cursor after authorization", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });

    for (const cursor of [123, "next-page"]) {
      const response = await t.fetch("/mcp", {
        method: "POST",
        headers: mcpRequestHeaders({ accessToken }),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: { cursor },
        }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.has("WWW-Authenticate")).toBe(false);
      await expect(response.json()).resolves.toMatchObject({
        id: 1,
        error: { code: -32602 },
      });
    }
  });

  it("returns a plain tools/list result", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ accessToken }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: expect.any(Array),
      },
    });
  });

  it("returns a plain success result for ping", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ accessToken }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "ping-1",
        method: "ping",
        params: {},
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: "ping-1",
      result: {},
    });
  });

  it("returns a correlated invalid-params error for malformed ping", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ accessToken }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "ping-invalid",
        method: "ping",
        params: null,
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: "ping-invalid",
      error: {
        code: -32602,
        message: "ping params must be an object when provided.",
      },
    });
  });

  it("returns a correlated method-not-found error after authorization", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ accessToken }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 17,
        method: "unknown/request",
        params: {},
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: 17,
      error: { code: -32601, message: "Method not found: unknown/request" },
    });
  });

  it("accepts an unknown notification without a response body", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ accessToken }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/unknown",
        params: {},
      }),
    });

    expect(response.status).toBe(202);
    await expect(response.text()).resolves.toBe("");
  });

  it("does not execute request-only methods when they are sent as notifications", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });
    const notifications = [
      { method: "initialize", params: {} },
      { method: "ping", params: {} },
      { method: "tools/list", params: {} },
      { method: "tools/call", params: { name: "unknown_tool", arguments: {} } },
    ];

    for (const notification of notifications) {
      const response = await t.fetch("/mcp", {
        method: "POST",
        headers: mcpRequestHeaders({
          accessToken,
          protocolVersion: notification.method === "initialize" ? null : undefined,
        }),
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: notification.method,
          params: notification.params,
        }),
      });

      expect(response.status).toBe(202);
      await expect(response.text()).resolves.toBe("");
    }
  });

  it("does not return a JSON-RPC error body for a malformed notification", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ accessToken }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "account_getAuthenticationStatus",
          arguments: "not-an-object",
        },
      }),
    });

    expect(response.status).toBe(202);
    await expect(response.text()).resolves.toBe("");
  });

  it("returns invalid params for malformed and unknown tool calls", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });
    const cases = [
      {
        params: { name: "", arguments: {} },
      },
      {
        params: {
          name: "account_getAuthenticationStatus",
          arguments: "not-an-object",
        },
      },
      {
        params: { name: "unknown_tool", arguments: {} },
      },
    ];

    for (const testCase of cases) {
      const response = await t.fetch("/mcp", {
        method: "POST",
        headers: mcpRequestHeaders({ accessToken }),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: testCase.params,
        }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: -32602 },
      });
    }
  });

  it("rejects every removed vault tool name without an alias", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });

    for (const name of removedRepositoryToolNames) {
      const response = await t.fetch("/mcp", {
        method: "POST",
        headers: mcpRequestHeaders({ accessToken }),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: name,
          method: "tools/call",
          params: { name, arguments: {} },
        }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        id: name,
        error: { code: -32602, message: `Unknown tool: ${name}` },
      });
    }
  });

  it("rejects a token for another resource with an OAuth challenge", async () => {
    const { accessToken, t } = await seedMcpBearer({
      isApproved: true,
      tokenResource: "https://other.example/mcp",
    });
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ accessToken }),
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
      error_description: "Token resource does not match this MCP endpoint.",
    });
  });

  it("rejects a scoped token when the user's current access no longer allows the tool", async () => {
    // role_pending_access carries neither access_dashboard nor
    // access_app_create, while the token still names both scopes. This is the exact
    // stale-token-after-downgrade case the dispatch gate exists for.
    const { callTool } = await seedMcpBearer({ isApproved: false });

    const payload = await callTool("repository_create");
    expect(payload).toMatchObject({
      result: {
        isError: true,
        content: [
          {
            type: "text",
            text: "Insufficient access for repository_create.",
          },
        ],
      },
    });
  });

  it("creates a browser handoff from trusted bearer grant values", async () => {
    vi.stubEnv("SITE_URL", "https://samebase.com");
    const { callTool, t, userId } = await seedMcpBearer({
      isApproved: true,
      scopes: ["access_browser_login_handoff"],
    });

    const payload = await callTool("account_createSignInLink", {
      clientId: "raw_client",
      grantId: "raw_grant",
      returnToPath: "/repo/",
    });
    expect(payload).toMatchObject({
      result: {
        structuredContent: {
          expiresAt: expect.any(Number),
          url: expect.stringContaining("https://samebase.com/agents/connect#"),
        },
      },
    });

    const rows = await t.run(
      async (ctx) =>
        await ctx.db
          .query("mcpBrowserLoginTokens")
          .withIndex("by_user_id", (query) => query.eq("userId", userId))
          .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      clientId: "client_test",
      grantId: "grant_test",
      userId,
    });
  });

  it("executes the tool when scopes and current access both allow it", async () => {
    const { callTool, organizationId, t, userId } = await seedMcpBearer({ isApproved: true });
    await t.run(async (ctx) => {
      await ctx.db.patch(organizationId, {
        convexTeam: { teamId: "convex-team" },
        cloudflareAccount: {
          accountId: "cloudflare-account",
          accountName: "Cloudflare account",
        },
      });
    });
    await t.mutation(internal.repository.records.createInitializingExistingRepositoryForUser, {
      userId,
      organizationId,
      githubRepositoryDatabaseId: "mcp-existing-app-id",
      githubOwnerLogin: "samebase",
      githubRepositoryName: "existing-app",
    });

    const payload = await callTool("repository_list");
    expect(payload).toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: "Found 1 repository.",
          },
        ],
      },
    });
    expect(payload.result).not.toHaveProperty("resultType");
    expect(payload.result).not.toHaveProperty("_meta");
    expect(JSON.stringify(payload)).not.toContain("_creationTime");
    expect(JSON.stringify(payload)).not.toContain("runId");
    expect(JSON.stringify(payload)).not.toContain("updatedAt");
  });

  it("does not expose Convex validation diagnostics in tool errors", async () => {
    const { callTool } = await seedMcpBearer({ isApproved: true });
    const payload = await callTool("repository_create", {
      githubOwnerLogin: "samebase",
      githubRepositoryName: "test-app",
      convexProjectName: "test-app",
      cloudflareWorkerName: "test-app",
      cloudflareBuildTokenUuid: null,
      unexpectedDiagnostic: "private-diagnostic@example.com",
    });

    expect(payload.result).toEqual({
      content: [
        {
          type: "text",
          text: "Samebase could not complete this request. Check the app in Samebase before retrying.",
        },
      ],
      isError: true,
    });
  });

  /**
  A connected repository samebase/demo whose organization has a Cloudflare OAuth connection and a
  last-used Workers Builds token, and a provider fetch mock for one Worker named mcp-worker.
  */
  async function seedWorkerCreateFixture() {
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
    const createdBuildSettings = {
      ...observedCreatedWorkerBuildSettings,
      script_tag: "mcp-worker-tag",
      git_repository: {
        ...observedCreatedWorkerBuildSettings.git_repository,
        repo_id: "123",
        repo_name: "demo",
        provider_account_id: "456",
        provider_account_name: "samebase",
      },
      production_settings: {
        ...observedCreatedWorkerBuildSettings.production_settings,
        root_directory: "apps/web",
        build_token_uuid: "reusable-build-token",
      },
      previews_base_config: {
        ...observedCreatedWorkerBuildSettings.previews_base_config,
        root_directory: "apps/web",
        build_token_uuid: "reusable-build-token",
      },
    };
    const nativeBuildSettings = {
      ...observedMigratedWorkerBuildSettings,
      script_tag: createdBuildSettings.script_tag,
      git_repository: createdBuildSettings.git_repository,
      production_settings: createdBuildSettings.production_settings,
      previews_base_config: {
        ...observedMigratedWorkerBuildSettings.previews_base_config,
        root_directory: "apps/web",
        build_token_uuid: "reusable-build-token",
      },
    };
    let buildSettings: typeof createdBuildSettings | typeof nativeBuildSettings | null = null;
    // Workers without Builds settings that Samebase records by tag, or by name under an old tag.
    const recordedWorkersWithoutBuilds = [
      { id: "other-app-worker-tag", name: "other-app-worker" },
      { id: "replaced-worker-new-tag", name: "replaced-worker" },
      { id: "other-app-replaced-worker-new-tag", name: "other-app-replaced-worker" },
    ];
    const providerState = { failWorkerDiscovery: false, listRecordedWorkersWithoutBuilds: false };

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
      if (method === "GET" && url.pathname.endsWith("/workers/workers")) {
        return cloudflareResponse([
          workerDetails(),
          ...(providerState.listRecordedWorkersWithoutBuilds
            ? recordedWorkersWithoutBuilds.map((worker) => ({ ...workerDetails(), ...worker }))
            : []),
        ]);
      }
      if (
        method === "GET" &&
        recordedWorkersWithoutBuilds.some((worker) =>
          url.pathname.endsWith(`/builds/workers/${worker.id}`),
        )
      ) {
        return jsonResponse(observedMissingWorkerBuildSettingsResponse, 404);
      }
      if (url.pathname.endsWith("/builds/workers/mcp-worker-tag/triggers")) {
        return cloudflareResponse([
          {
            trigger_uuid: "created-trigger-1",
            external_script_id: "mcp-worker-tag",
            branch_includes: ["main"],
            branch_excludes: [],
            repo_connection: { repo_id: "123", provider_type: "github" },
            root_directory: "apps/web",
          },
        ]);
      }
      if (method === "GET" && url.pathname.endsWith("/builds/workers/mcp-worker-tag")) {
        if (providerState.failWorkerDiscovery) {
          return jsonResponse(
            {
              success: false,
              errors: [
                { code: 1000, message: "private-diagnostic@example.com provider debug detail" },
              ],
              messages: [],
              result: null,
            },
            500,
          );
        }
        return buildSettings
          ? cloudflareResponse(buildSettings)
          : jsonResponse(observedMissingWorkerBuildSettingsResponse, 404);
      }
      if (method === "POST" && url.pathname.endsWith("/builds/workers")) {
        buildSettings = createdBuildSettings;
        return cloudflareResponse(buildSettings);
      }
      if (
        method === "POST" &&
        url.pathname.endsWith("/builds/workers/mcp-worker-tag/migrate_to_previews")
      ) {
        buildSettings = nativeBuildSettings;
        return cloudflareResponse(buildSettings);
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
    const repositoryId = await t.run(async (ctx) => {
      await ctx.db.insert("organizationProviderCredentials", {
        organizationId,
        cloudflare: {
          connectedByUserId: userId,
          auth: {
            method: "oauth",
            credential: "cloudflare-token",
            refreshCredential: "cloudflare-refresh-token",
            credentialExpiresAt: 4_000_000_000_000,
          },
          updatedAt: 1,
        },
      });
      await ctx.db.patch(organizationId, {
        cloudflareAccount: {
          accountId: cloudflareAccountId,
          accountName: "Test account",
          lastUsedBuildTokenUuid: "reusable-build-token",
        },
      });
      const repositoryId = await ctx.db.insert("repositories", {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
        createdAt: 2,
      });
      const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId,
        userId,
        repositoryId,
        githubRepositoryFullName: "samebase/demo",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 2,
        updatedAt: 2,
        completedAt: 2,
      });
      await ctx.db.replace(repositoryId, {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId,
        githubRepositoryDatabaseId: "123",
        githubRepositoryName: "demo",
        visibility: "private",
        defaultBranch: "stale-main",
        connectedAt: 2,
        createdAt: 2,
      });
      return repositoryId;
    });
    return {
      callTool,
      cloudflareAccountId,
      defaultBranchCommitSha,
      organizationId,
      providerRequests,
      providerState,
      repositoryId,
      t,
    };
  }

  function findInitialBuildRequest(
    providerRequests: Array<{ body: unknown; method: string; path: string }>,
  ) {
    return providerRequests.find(
      (request) =>
        request.method === "POST" &&
        request.path.endsWith("/builds/triggers/created-trigger-1/builds"),
    );
  }

  it("creates a Worker with the repository account from inventory, then returns it in inventory", async () => {
    const {
      callTool,
      cloudflareAccountId,
      defaultBranchCommitSha,
      organizationId,
      providerRequests,
      providerState,
      repositoryId,
      t,
    } = await seedWorkerCreateFixture();

    const inventoryBeforeCreate = await callTool("repository_list");
    expect(inventoryBeforeCreate).toMatchObject({
      result: {
        structuredContent: {
          repositories: [
            expect.objectContaining({ repositoryId, githubRepositoryFullName: "samebase/demo" }),
          ],
        },
      },
    });

    // No token UUID: Samebase uses the account's last-used Workers Builds token.
    const createPayload = await callTool("repository_cloudflare_createWorker", {
      repository: "samebase/demo",
      workerName: "mcp-worker",
      rootDirectory: "apps/web",
    });
    if (isRecord(createPayload.result) && createPayload.result["isError"] === true) {
      throw new Error(JSON.stringify(createPayload.result));
    }
    const attachment = await t.run(
      async (ctx) =>
        await ctx.db
          .query("repositoryCloudflareWorkers")
          .withIndex("by_repository", (q) => q.eq("repositoryId", repositoryId))
          .unique(),
    );
    if (!attachment) {
      throw new Error("Expected the MCP tool to record the Worker attachment.");
    }

    const noDeployKeyMessage =
      "No Convex project is attached to this repository, so no deploy key was installed. After you attach or create one, call repository_cloudflare_rotateConvexDeployKeys for this Worker.";
    expect(createPayload).toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: `Created mcp-worker for samebase/demo at apps/web. ${noDeployKeyMessage}`,
          },
        ],
        structuredContent: {
          workerName: "mcp-worker",
          rootDirectory: "apps/web",
          convexDeployKey: { state: "not_installed", message: noDeployKeyMessage },
        },
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
            .query("workflow_repositoryProvisioning_writeLocks")
            .withIndex("by_repository", (q) => q.eq("repositoryId", repositoryId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      state: "succeeded",
      lastWriteAt: { cloudflare: expect.any(Number) },
    });

    const inventoryPayload = await callTool("repository_list");
    expect(inventoryPayload).toMatchObject({
      result: {
        structuredContent: {
          repositories: [
            expect.objectContaining({
              repositoryId,
              cloudflareWorkers: [{ workerName: "mcp-worker", rootDirectory: "apps/web" }],
            }),
          ],
        },
      },
    });

    const workerCreateRequests = providerRequests.filter(
      (request) => request.method === "POST" && request.path.endsWith("/workers/workers"),
    );
    const buildsCreateRequests = providerRequests.filter(
      (request) => request.method === "POST" && request.path.endsWith("/builds/workers"),
    );
    const previewMigrationRequests = providerRequests.filter(
      (request) =>
        request.method === "POST" &&
        request.path.endsWith("/builds/workers/mcp-worker-tag/migrate_to_previews"),
    );
    const initialBuildRequest = findInitialBuildRequest(providerRequests);
    expect(workerCreateRequests).toHaveLength(1);
    expect(buildsCreateRequests).toHaveLength(1);
    expect(buildsCreateRequests.map((request) => request.body)).toEqual([
      expect.objectContaining({
        script_tag: "mcp-worker-tag",
        git_repository: {
          branch: "main",
          provider_type: "github",
          provider_account_id: "456",
          provider_account_name: "samebase",
          repo_id: "123",
          repo_name: "demo",
        },
        production_settings: expect.objectContaining({
          build_token_uuid: "reusable-build-token",
          root_directory: "apps/web",
          build_command: "pnpm run build",
          deploy_command: "pnpm run deploy",
        }),
        previews_base_config: expect.objectContaining({
          build_token_uuid: "reusable-build-token",
          root_directory: "apps/web",
          build_command: "pnpm run build",
          deploy_command: "pnpm run deploy:preview",
        }),
        previews_enabled: true,
      }),
    ]);
    expect(previewMigrationRequests).toHaveLength(1);
    expect(previewMigrationRequests[0]?.body).toEqual({
      deploy_command: "pnpm run deploy:preview",
    });
    expect(
      providerRequests.some((request) => request.method === "PATCH" || request.method === "DELETE"),
    ).toBe(false);
    expect(initialBuildRequest?.body).toEqual({
      branch: "main",
      commit_hash: defaultBranchCommitSha,
    });

    const otherRepositoryId = await t.run(async (ctx) => {
      const otherRepositoryId = await ctx.db.insert("repositories", {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
        createdAt: 3,
      });
      await ctx.db.insert("repositoryCloudflareWorkers", {
        repositoryId: otherRepositoryId,
        organizationId,
        accountId: cloudflareAccountId,
        workerName: "other-app-worker",
        workerTag: "other-app-worker-tag",
        rootDirectory: "/",
        origin: "provisioned",
      });
      await ctx.db.insert("repositoryCloudflareWorkers", {
        repositoryId: otherRepositoryId,
        organizationId,
        accountId: cloudflareAccountId,
        workerName: "other-app-replaced-worker",
        workerTag: "other-app-replaced-worker-old-tag",
        rootDirectory: "/",
        origin: "provisioned",
      });
      await ctx.db.insert("repositoryCloudflareWorkers", {
        repositoryId,
        organizationId,
        accountId: cloudflareAccountId,
        workerName: "replaced-worker",
        workerTag: "replaced-worker-old-tag",
        rootDirectory: "/",
        origin: "selected_existing",
      });
      return otherRepositoryId;
    });
    providerState.listRecordedWorkersWithoutBuilds = true;
    providerState.failWorkerDiscovery = true;
    const discovery = await callTool("repository_cloudflare_findWorkers", {
      repository: repositoryId,
    });
    // MCP discovery lists only Workers that a tool can add, and counts the others.
    expect(discovery.result.structuredContent).toEqual({
      inventoryState: "complete",
      workers: [],
      counts: { attached: 2, attachedElsewhere: 2, connectedElsewhere: 0, unavailable: 0 },
    });
    expect(JSON.stringify(discovery)).not.toContain("private-diagnostic@example.com");
    expect(JSON.stringify(discovery)).not.toContain(otherRepositoryId);
    expect(JSON.stringify(discovery)).not.toContain("old-tag");
  });

  it("defers the first build to the deploy key of the only Convex project, and reports a key it could not install", async () => {
    const { callTool, organizationId, providerRequests, repositoryId, t } =
      await seedWorkerCreateFixture();
    await t.run(async (ctx) => {
      await ctx.db.insert("repositoryConvexProjects", {
        repositoryId,
        organizationId,
        teamId: "convex-team",
        projectId: "convex-project",
        convexConfigPath: "apps/web/convex.json",
        origin: "selected_existing",
      });
    });

    // The organization has no Convex connection, so the deploy-key step fails after Builds setup.
    const createPayload = await callTool("repository_cloudflare_createWorker", {
      repository: "samebase/demo",
      workerName: "mcp-worker",
      rootDirectory: "apps/web",
    });

    expect(createPayload).toMatchObject({
      result: {
        structuredContent: {
          workerName: "mcp-worker",
          convexDeployKey: {
            state: "not_installed",
            message: expect.stringMatching(
              /^Samebase did not install the Convex deploy key, so no production build started: .+ The repair tool is repository_cloudflare_rotateConvexDeployKeys\.$/,
            ),
          },
        },
      },
    });
    expect(createPayload.result).not.toHaveProperty("isError");
    expect(
      providerRequests.filter(
        (request) => request.method === "POST" && request.path.endsWith("/builds/workers"),
      ),
    ).toHaveLength(1);
    expect(findInitialBuildRequest(providerRequests)).toBeUndefined();
  });

  it("fails closed before any provider change when several Convex projects could take the deploy key", async () => {
    const { callTool, organizationId, providerRequests, repositoryId, t } =
      await seedWorkerCreateFixture();
    await t.run(async (ctx) => {
      for (const convexConfigPath of ["convex.json", "apps/admin/convex.json"]) {
        await ctx.db.insert("repositoryConvexProjects", {
          repositoryId,
          organizationId,
          teamId: "convex-team",
          projectId: `project-${convexConfigPath}`,
          convexConfigPath,
          origin: "selected_existing",
        });
      }
    });

    for (const toolName of [
      "repository_cloudflare_createWorker",
      "repository_cloudflare_connectWorker",
    ]) {
      const payload = await callTool(toolName, {
        repository: "samebase/demo",
        workerName: "mcp-worker",
      });
      expect(payload).toMatchObject({
        result: {
          isError: true,
          content: [
            {
              type: "text",
              // No Convex connection: the names are unreadable, so the code locations identify them.
              text: expect.stringMatching(
                /^samebase\/demo has several attached Convex projects: .*\(apps\/admin\/convex\.json\).*\(convex\.json\).*pass its name as convexProjectName\.$/,
              ),
            },
          ],
        },
      });
    }
    expect(providerRequests.filter((request) => request.path.startsWith("/client/v4/"))).toEqual(
      [],
    );
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_repositoryProvisioning_writeLocks")
            .withIndex("by_repository", (q) => q.eq("repositoryId", repositoryId))
            .unique(),
      ),
    ).resolves.toBeNull();
  });

  it("reports authentication status for a valid MCP bearer token", async () => {
    const { callTool } = await seedMcpBearer({ isApproved: true });

    const payload = await callTool("account_getAuthenticationStatus");
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
              email: "ada@example.com",
            },
            role: "role_member",
            githubOwnerLogins: ["samebase"],
            grantedScopes: ["access_dashboard", "access_app_create"],
          },
        },
      },
    });
    expect(payload.result.structuredContent.authentication).not.toHaveProperty("accessKeys");
    expect(JSON.stringify(payload)).not.toContain('"name":"Ada"');
    expect(JSON.stringify(payload)).not.toContain("userId");
  });

  it("fails closed instead of returning malformed stored account fields", async () => {
    const { callTool, t, userId } = await seedMcpBearer({ isApproved: true });
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { email: "not-an-email" });
    });

    const payload = await callTool("account_getAuthenticationStatus");
    expect(payload).toMatchObject({
      result: {
        isError: true,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("not-an-email");
  });
});
