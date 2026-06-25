import { describe, expect, it } from "vite-plus/test";

import {
  buildMcpToolInputSchema,
  findToolInCatalog,
  listCatalogToolsForSurface,
  MCP_TOOL_CATALOG,
} from "./catalog";

describe("listCatalogToolsForSurface", () => {
  it("keeps the public MCP catalog focused on createRepository", () => {
    expect(MCP_TOOL_CATALOG.map((tool) => tool.name)).toEqual(["vault.actions.createRepository"]);
  });

  it("filters MCP tools by granted scopes", () => {
    const noScopeTools = listCatalogToolsForSurface({
      surface: "mcp",
      grantedScopes: [],
    }).map((tool) => tool.name);
    expect(noScopeTools).toEqual([]);

    const createTools = listCatalogToolsForSurface({
      surface: "mcp",
      grantedScopes: ["access_app_create"],
    }).map((tool) => tool.name);
    expect(createTools).toEqual(["vault.actions.createRepository"]);

    const oldScopeTools = listCatalogToolsForSurface({
      surface: "mcp",
      grantedScopes: ["vaults.read", "files.read", "files.write", "prod.read.propose"],
    }).map((tool) => tool.name);
    expect(oldScopeTools).toEqual([]);
  });

  it("does not scope-filter non-MCP surfaces", () => {
    const tools = listCatalogToolsForSurface({
      surface: "agent",
      grantedScopes: [],
    }).map((tool) => tool.name);

    expect(tools).toEqual(
      expect.arrayContaining([
        "read_file",
        "list_files",
        "edit_file",
        "replace_in_file",
        "create_file",
        "delete_file",
        "get_vault_remote_branches",
        "request_convex_status_read",
        "request_convex_data_read",
      ]),
    );
  });
});

describe("buildMcpToolInputSchema", () => {
  it("publishes createRepository fields without vault, branch, or thread context", () => {
    const createRepository = findToolInCatalog({ name: "vault.actions.createRepository" });
    expect(createRepository).not.toBeNull();
    if (!createRepository) {
      return;
    }

    const schema = buildMcpToolInputSchema(createRepository);
    expect(schema.properties).toHaveProperty("name");
    expect(schema.properties).toHaveProperty("owner");
    expect(schema.properties).toHaveProperty("convexProjectName");
    expect(schema.properties).toHaveProperty("cloudflareWorkerName");
    expect(schema.properties).toHaveProperty("description");
    expect(schema.properties).toHaveProperty("private");
    expect(schema.properties).not.toHaveProperty("vaultId");
    expect(schema.properties).not.toHaveProperty("branch");
    expect(schema.properties).not.toHaveProperty("threadId");
    expect(schema.required).toEqual(["name", "owner", "convexProjectName", "cloudflareWorkerName"]);
  });

  it("does not keep vault discovery as a public runtime tool", () => {
    expect(findToolInCatalog({ name: "vaults.list" })).toBeNull();
  });
});
