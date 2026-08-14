import { generateKeyPairSync } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
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

const mcpRequestMetadata = {
  "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
  "io.modelcontextprotocol/clientInfo": { name: "samebase-test", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

function mcpRequestHeaders(args: {
  method: string;
  accessToken?: string;
  name?: string;
  origin?: string;
  version?: string;
}) {
  const headers = new Headers({
    "content-type": "application/json",
    "MCP-Protocol-Version": args.version ?? MCP_PROTOCOL_VERSION,
    "Mcp-Method": args.method,
  });
  if (args.accessToken) {
    headers.set("authorization", `Bearer ${args.accessToken}`);
  }
  if (args.name) {
    headers.set("Mcp-Name", args.name);
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
      });
      const argumentUserId = await ctx.db.insert("users", {
        state: "active",
        name: "Argument User",
        email: "argument@example.com",
        isApproved: true,
      });
      return { argumentUserId, tokenUserId };
    });
    const viewer = await t.query(internal.functions.resolveViewerForUserId, {
      userId: ids.tokenUserId,
    });

    const toolArgs = buildMcpToolInvocationArgs({
      input: {
        name: "test-app",
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
      viewer,
    });

    expect(toolArgs).toMatchObject({
      name: "test-app",
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

  it("uses resource ids or GitHub owner names instead of Samebase organization ids", () => {
    const tools = listMcpToolsForAccess({
      grantedScopes: ["access_app_create", "access_repo_connect"],
      currentAccessKeys: ["access_app_create", "access_repo_connect"],
    });

    for (const tool of tools) {
      expect(tool.inputSchema.properties).not.toHaveProperty("organizationId");
      expect(tool.inputSchema.required ?? []).not.toContain("organizationId");
    }
    expect(tools.find((tool) => tool.name === "vault_actions_createRepository")).toMatchObject({
      inputSchema: {
        properties: { githubOwnerLogin: { type: "string" } },
        required: expect.arrayContaining(["githubOwnerLogin"]),
      },
    });
    expect(tools.find((tool) => tool.name === "vault_actions_connectRepository")).toMatchObject({
      inputSchema: {
        properties: {
          githubOwnerLogin: { type: "string" },
          ghRepoId: { type: "string" },
        },
        required: expect.arrayContaining(["githubOwnerLogin", "ghRepoId"]),
      },
    });
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
    expect(tools.find((tool) => tool.name === "vault_actions_connectRepository")).toMatchObject({
      outputSchema: {
        type: "object",
        properties: {
          vaultId: { type: "string" },
          runId: { type: "string" },
          repositoryFullName: { type: "string" },
        },
        required: ["vaultId", "runId", "repositoryFullName"],
        additionalProperties: false,
      },
    });
    expect(tools.map((tool) => tool.name)).not.toContain("vault_cloudflare_listAccounts");
    expect(tools.find((tool) => tool.name === "vault_cloudflare_discoverWorkers")).toMatchObject({
      description: expect.stringContaining("the vault's stored Cloudflare account"),
      inputSchema: {
        properties: {
          accountId: {
            description: "The vault's cloudflareAccountId returned by get_user_vaults.",
          },
        },
      },
    });
    expect(tools.find((tool) => tool.name === "vault_cloudflare_createWorker")).toMatchObject({
      title: "Create Cloudflare Worker",
      description: expect.stringContaining("the vault's stored Cloudflare account"),
      inputSchema: {
        properties: {
          accountId: {
            description: "The vault's cloudflareAccountId returned by get_user_vaults.",
          },
        },
      },
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
    expect(readMcpMethodForUsage("server/discover")).toBe("server/discover");
    expect(readMcpMethodForUsage("tools/list")).toBe("tools/list");
    expect(readMcpMethodForUsage("tools/call")).toBe("tools/call");
    expect(readMcpMethodForUsage("initialize")).toBe("other");
    expect(readMcpMethodForUsage("caller controlled text")).toBe("other");
  });

  it("maps tool call params to catalog names or unknown", () => {
    for (const contract of actionContracts) {
      expect(readMcpToolNameForUsage({ name: contract.mcp.name })).toBe(contract.mcp.name);
    }
    expect(readMcpToolNameForUsage({ name: " vault_actions_createRepository " })).toBe("unknown");
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
      'scope="access_dashboard access_app_create access_repo_connect access_provider_connections access_browser_login_handoff"',
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
        headers: mcpRequestHeaders({ method: "tools/call", name, accessToken }),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { _meta: mcpRequestMetadata, name, arguments: toolArguments },
        }),
      });
      return await response.json();
    };

    return { accessToken, callTool, t, ...ids };
  }

  it("discovers the modern server contract without initialization", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });

    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ method: "server/discover", accessToken }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "server/discover",
        params: {
          _meta: mcpRequestMetadata,
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        resultType: "complete",
        supportedVersions: [MCP_PROTOCOL_VERSION],
        capabilities: { tools: {} },
        ttlMs: 0,
        cacheScope: "private",
        instructions: expect.stringMatching(
          /^Samebase is only for repository-backed apps.*The MCP acts as the authenticated Samebase account across every organization that the account can currently access\..*Never request or send an opaque Samebase organization ID\.[\s\S]*call vault_actions_createRepository directly with the human GitHub owner login[\s\S]*A started provisioning run, requested build, or successful Git push is not proof of a successful deployment\./,
        ),
        _meta: {
          "io.modelcontextprotocol/serverInfo": {
            name: "Samebase",
            version: "0.1.0",
          },
        },
      },
    });
  });

  it("advertises OAuth metadata when the bearer token is missing", async () => {
    const t = makeConvexTest();

    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ method: "tools/list" }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: { _meta: mcpRequestMetadata },
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
      headers: mcpRequestHeaders({ method: "tools/list", accessToken: "rejected-token" }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: { _meta: mcpRequestMetadata },
      }),
    });

    expect(response.status).toBe(401);
    expectMcpBearerChallenge(response, "Access token rejected.");
    await expect(response.json()).resolves.toEqual({
      error: "invalid_token",
      error_description: "Access token is invalid.",
    });
  });

  it("rejects legacy initialization before starting OAuth", async () => {
    const t = makeConvexTest();

    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "legacy-test", version: "1.0.0" },
        },
      }),
    });

    expect(response.status).toBe(400);
    expect(response.headers.has("WWW-Authenticate")).toBe(false);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: -32020 },
    });
  });

  it("returns supported versions before checking authorization", async () => {
    const t = makeConvexTest();
    const legacyVersion = "2025-03-26";

    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ method: "tools/list", version: legacyVersion }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {
          _meta: {
            ...mcpRequestMetadata,
            "io.modelcontextprotocol/protocolVersion": legacyVersion,
          },
        },
      }),
    });

    expect(response.status).toBe(400);
    expect(response.headers.has("WWW-Authenticate")).toBe(false);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32022,
        message: "Unsupported protocol version",
        data: {
          supported: [MCP_PROTOCOL_VERSION],
          requested: legacyVersion,
        },
      },
    });
  });

  it("rejects a foreign Origin", async () => {
    const t = makeConvexTest();

    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({
        method: "tools/list",
        origin: "https://attacker.example",
      }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: { _meta: mcpRequestMetadata },
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
        headers: mcpRequestHeaders({ method: "tools/list" }),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method: "tools/list",
          params: { _meta: mcpRequestMetadata },
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

  it("rejects every tools/list cursor before authorization", async () => {
    const t = makeConvexTest();

    for (const cursor of [123, "next-page"]) {
      const response = await t.fetch("/mcp", {
        method: "POST",
        headers: mcpRequestHeaders({ method: "tools/list" }),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: { _meta: mcpRequestMetadata, cursor },
        }),
      });

      expect(response.status).toBe(400);
      expect(response.headers.has("WWW-Authenticate")).toBe(false);
      await expect(response.json()).resolves.toMatchObject({
        id: 1,
        error: { code: -32602 },
      });
    }
  });

  it("returns private cache hints and server identity with tools", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ method: "tools/list", accessToken }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: { _meta: mcpRequestMetadata },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        resultType: "complete",
        ttlMs: 0,
        cacheScope: "private",
        tools: expect.any(Array),
        _meta: {
          "io.modelcontextprotocol/serverInfo": {
            name: "Samebase",
            version: "0.1.0",
          },
        },
      },
    });
  });

  it("returns HTTP 404 for removed and unknown methods", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ method: "initialize", accessToken }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { _meta: mcpRequestMetadata },
      }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: -32601 },
    });
  });

  it("returns HTTP 404 for an unknown notification", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: mcpRequestHeaders({ method: "notifications/unknown", accessToken }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/unknown",
        params: { _meta: mcpRequestMetadata },
      }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: -32601 },
    });
  });

  it("returns invalid params for malformed and unknown tool calls", async () => {
    const { accessToken, t } = await seedMcpBearer({ isApproved: true });
    const cases = [
      {
        headerName: "present-header-name",
        params: { name: "", arguments: {} },
      },
      {
        headerName: "samebase_auth_getAuthenticationStatus",
        params: {
          name: "samebase_auth_getAuthenticationStatus",
          arguments: "not-an-object",
        },
      },
      {
        headerName: "unknown_tool",
        params: { name: "unknown_tool", arguments: {} },
      },
    ];

    for (const testCase of cases) {
      const response = await t.fetch("/mcp", {
        method: "POST",
        headers: mcpRequestHeaders({
          method: "tools/call",
          name: testCase.headerName,
          accessToken,
        }),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { _meta: mcpRequestMetadata, ...testCase.params },
        }),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: -32602 },
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
      headers: mcpRequestHeaders({ method: "tools/list", accessToken }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: { _meta: mcpRequestMetadata },
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

    const payload = await callTool("vault_actions_createRepository");
    expect(payload).toMatchObject({
      result: {
        resultType: "complete",
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

  it("creates a browser handoff from trusted bearer grant values", async () => {
    vi.stubEnv("SITE_URL", "https://samebase.com");
    const { callTool, t, userId } = await seedMcpBearer({
      isApproved: true,
      scopes: ["access_browser_login_handoff"],
    });

    const payload = await callTool("create_browser_handoff", {
      clientId: "raw_client",
      grantId: "raw_grant",
      returnToPath: "/vault/",
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
    await t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
      userId,
      organizationId,
      ghRepoId: "mcp-existing-app-id",
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

  it("creates a Worker with the vault account from inventory, then returns it in inventory", async () => {
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
        },
      });
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        organizationId,
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
        convexTeamId: "convex-team",
        cloudflareAccountId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId,
        ghRepoId: "123",
        name: "demo",
        visibility: "private",
        defaultBranch: "stale-main",
        connectedAt: 2,
      });
      return vaultId;
    });

    const inventoryBeforeCreate = await callTool("vault_dashboard_getUserVaults");
    expect(inventoryBeforeCreate).toMatchObject({
      result: {
        structuredContent: {
          vaults: [expect.objectContaining({ _id: vaultId, cloudflareAccountId })],
        },
      },
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
              email: "ada@example.com",
            },
            role: "role_member",
            accessKeys: expect.arrayContaining(["access_public", "access_mcp"]),
            grantedScopes: ["access_dashboard", "access_app_create"],
          },
        },
      },
    });
    expect(JSON.stringify(payload)).not.toContain('"name":"Ada"');
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
