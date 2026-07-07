import { describe, expect, it } from "vite-plus/test";

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

    const toolArgs = buildMcpToolInvocationArgs({
      input: {
        name: "test-app",
        owner: "samebase",
        convexProjectName: "test-app",
        cloudflareWorkerName: "test-app",
        userId: ids.argumentUserId,
        grantedScopes: ["access_app_create"],
      },
      userId: ids.tokenUserId,
      grantedScopes: [],
    });

    expect(toolArgs).toMatchObject({
      name: "test-app",
      owner: "samebase",
      convexProjectName: "test-app",
      cloudflareWorkerName: "test-app",
      userId: ids.tokenUserId,
      grantedScopes: [],
    });
  });
});

describe("MCP tool listing access", () => {
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
        currentAccessKeys: ["access_dashboard", "access_app_create"],
      }),
    ).toEqual([
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
      currentAccessKeys: ["access_dashboard", "access_app_create", "access_repo_connect"],
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
    expect(readMcpToolNameForUsage({ name: "vault_actions_retryInfrastructureProvisioning" })).toBe(
      "vault_actions_retryInfrastructureProvisioning",
    );
    expect(readMcpToolNameForUsage({ name: "caller controlled text" })).toBe("unknown");
    expect(readMcpToolNameForUsage({ name: "" })).toBe("unknown");
    expect(readMcpToolNameForUsage(null)).toBe("unknown");
  });
});

describe("MCP tools/call access enforcement", () => {
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
      await ctx.db.insert("mcpAccessTokens", {
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

    return { callTool, userId };
  }

  it("rejects a scoped token when the user's current access no longer allows the tool", async () => {
    // role_pending_access carries neither access_dashboard nor
    // access_app_create, while the token still names both scopes — the exact
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
});
