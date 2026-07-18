import { describe, expect, it } from "vite-plus/test";

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
      return { argumentUserId, tokenUserId };
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
      },
      userId: ids.tokenUserId,
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

    expect(
      listMcpToolsForAccess({
        grantedScopes: ["access_app_create", "access_dashboard"],
        currentAccessKeys: ["access_public", "access_dashboard", "access_app_create"],
      }),
    ).toEqual([
      expect.objectContaining({
        name: "samebase_auth_getAuthenticationStatus",
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
          destructiveHint: false,
        },
      }),
      expect.objectContaining({
        name: "vault_dashboard_getUserVaults",
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
          destructiveHint: false,
        },
      }),
      expect.objectContaining({
        name: "vault_actions_createRepository",
        annotations: {
          readOnlyHint: false,
          openWorldHint: true,
          destructiveHint: false,
        },
      }),
      expect.objectContaining({
        name: "vault_convex_listProjects",
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
          destructiveHint: false,
        },
      }),
      expect.objectContaining({
        name: "vault_cloudflare_listAccounts",
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
          destructiveHint: false,
        },
      }),
      expect.objectContaining({
        name: "vault_cloudflare_listWorkers",
        annotations: {
          readOnlyHint: true,
          openWorldHint: true,
          destructiveHint: false,
        },
      }),
      expect.objectContaining({
        name: "vault_convex_connectExistingProject",
        annotations: {
          readOnlyHint: false,
          openWorldHint: true,
          destructiveHint: false,
        },
      }),
      expect.objectContaining({
        name: "vault_cloudflare_connectExistingWorker",
        annotations: {
          readOnlyHint: false,
          openWorldHint: true,
          destructiveHint: false,
        },
      }),
      expect.objectContaining({
        name: "vault_cloudflare_wireBuilds",
        annotations: {
          readOnlyHint: false,
          openWorldHint: true,
          destructiveHint: false,
        },
      }),
      expect.objectContaining({
        name: "vault_cloudflare_wireConvexBuildAccess",
        annotations: {
          readOnlyHint: false,
          openWorldHint: true,
          destructiveHint: false,
        },
      }),
      expect.objectContaining({
        name: "vault_cloudflare_verifyInfrastructure",
        annotations: {
          readOnlyHint: false,
          openWorldHint: true,
          destructiveHint: false,
        },
      }),
      expect.objectContaining({
        name: "vault_actions_retryInfrastructureProvisioning",
        annotations: {
          readOnlyHint: false,
          openWorldHint: true,
          destructiveHint: false,
        },
      }),
    ]);
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
    expect(tools.find((tool) => tool.name === "vault_cloudflare_wireBuilds")).not.toHaveProperty(
      "outputSchema",
    );
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
    expect(readMcpToolNameForUsage({ name: "samebase_auth_getAuthenticationStatus" })).toBe(
      "samebase_auth_getAuthenticationStatus",
    );
    expect(readMcpToolNameForUsage({ name: "vault_actions_createRepository" })).toBe(
      "vault_actions_createRepository",
    );
    expect(readMcpToolNameForUsage({ name: "vault_actions_connectRepository" })).toBe(
      "vault_actions_connectRepository",
    );
    expect(readMcpToolNameForUsage({ name: "vault_convex_listProjects" })).toBe(
      "vault_convex_listProjects",
    );
    expect(readMcpToolNameForUsage({ name: "vault_cloudflare_listAccounts" })).toBe(
      "vault_cloudflare_listAccounts",
    );
    expect(readMcpToolNameForUsage({ name: "vault_cloudflare_listWorkers" })).toBe(
      "vault_cloudflare_listWorkers",
    );
    expect(readMcpToolNameForUsage({ name: "vault_convex_connectExistingProject" })).toBe(
      "vault_convex_connectExistingProject",
    );
    expect(readMcpToolNameForUsage({ name: "vault_cloudflare_connectExistingWorker" })).toBe(
      "vault_cloudflare_connectExistingWorker",
    );
    expect(readMcpToolNameForUsage({ name: "vault_cloudflare_wireBuilds" })).toBe(
      "vault_cloudflare_wireBuilds",
    );
    expect(readMcpToolNameForUsage({ name: "vault_cloudflare_wireConvexBuildAccess" })).toBe(
      "vault_cloudflare_wireConvexBuildAccess",
    );
    expect(readMcpToolNameForUsage({ name: "vault_cloudflare_verifyInfrastructure" })).toBe(
      "vault_cloudflare_verifyInfrastructure",
    );
    expect(readMcpToolNameForUsage({ name: "vault_actions_retryInfrastructureProvisioning" })).toBe(
      "vault_actions_retryInfrastructureProvisioning",
    );
    expect(readMcpToolNameForUsage({ name: "caller controlled text" })).toBe("unknown");
    expect(readMcpToolNameForUsage({ name: "" })).toBe("unknown");
    expect(readMcpToolNameForUsage(null)).toBe("unknown");
  });
});

describe("MCP tools/call access enforcement", () => {
  function expectMcpBearerChallenge(response: Response, errorDescription: string) {
    const header = response.headers.get("WWW-Authenticate");
    expect(header).toContain("Bearer ");
    expect(header).toContain('resource_metadata="');
    expect(header).toContain('/.well-known/oauth-protected-resource/mcp"');
    expect(header).toContain(
      'scope="access_dashboard access_app_create access_repo_connect access_browser_login_handoff"',
    );
    expect(header).toContain('error="invalid_token"');
    expect(header).toContain(`error_description="${errorDescription}"`);
  }

  async function seedMcpBearer(args: { isApproved: boolean }) {
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
    const userId = await t.run(async (ctx) => {
      const seededUserId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: args.isApproved,
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
        resource,
        scope: "access_dashboard access_app_create",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("operations_mcpAccessTokens", {
        tokenHash,
        grantId: "grant_test",
        clientId: "client_test",
        userId: seededUserId,
        resource,
        scope: "access_dashboard access_app_create",
        createdAt: now,
        expiresAt: now + 60 * 60 * 1000,
      });
      return seededUserId;
    });

    const callTool = async (name: string) => {
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
          params: { name, arguments: {} },
        }),
      });
      return await response.json();
    };

    return { accessToken, callTool, t, userId };
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
        instructions: expect.stringContaining(
          "A started provisioning run, requested build, or successful Git push is not proof of a successful deployment.",
        ),
        serverInfo: {
          name: "samebase",
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
    const { callTool } = await seedMcpBearer({ isApproved: true });

    const payload = await callTool("vault_dashboard_getUserVaults");
    expect(payload).toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: "Found 0 vaults.",
          },
        ],
      },
    });
  });

  it("reports authentication status for a valid MCP bearer token", async () => {
    const { callTool, userId } = await seedMcpBearer({ isApproved: true });

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
              userId,
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
