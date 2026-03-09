import { describe, expect, it } from "vitest";

import {
  buildMcpToolInputSchema,
  findToolInCatalog,
  listCatalogToolsForSurface,
} from "./catalog";

describe("listCatalogToolsForSurface", () => {
  it("filters MCP tools by granted scopes", () => {
    const vaultTools = listCatalogToolsForSurface({
      surface: "mcp",
      grantedScopes: ["vaults.read"],
    }).map((tool) => tool.name);
    expect(vaultTools).toEqual(["vaults.list", "get_vault_remote_branches"]);

    const fileTools = listCatalogToolsForSurface({
      surface: "mcp",
      grantedScopes: ["files.read"],
    }).map((tool) => tool.name);
    expect(fileTools).toEqual(["read_file", "list_files"]);

    const writeTools = listCatalogToolsForSurface({
      surface: "mcp",
      grantedScopes: ["files.write"],
    }).map((tool) => tool.name);
    expect(writeTools).toEqual(["edit_file"]);

    const allTools = listCatalogToolsForSurface({
      surface: "mcp",
      grantedScopes: ["vaults.read", "files.read", "files.write"],
    }).map((tool) => tool.name);
    expect(allTools).toEqual([
      "vaults.list",
      "read_file",
      "list_files",
      "edit_file",
      "get_vault_remote_branches",
    ]);
  });

  it("does not scope-filter non-MCP surfaces", () => {
    const tools = listCatalogToolsForSurface({
      surface: "agent",
      grantedScopes: [],
    }).map((tool) => tool.name);

    expect(tools).toEqual([
      "read_file",
      "list_files",
      "edit_file",
      "get_vault_remote_branches",
    ]);
  });
});

describe("buildMcpToolInputSchema", () => {
  it("adds branch and vault context to branch-aware tools", () => {
    const readFile = findToolInCatalog({ name: "read_file" });
    expect(readFile).not.toBeNull();
    if (!readFile) {
      return;
    }

    const schema = buildMcpToolInputSchema(readFile);
    expect(schema.properties).toHaveProperty("path");
    expect(schema.properties).toHaveProperty("vaultId");
    expect(schema.properties).toHaveProperty("branch");
    expect(schema.required).toEqual(["path", "vaultId", "branch"]);
  });

  it("adds only vault context to vault-scoped tools", () => {
    const remoteBranches = findToolInCatalog({
      name: "get_vault_remote_branches",
    });
    expect(remoteBranches).not.toBeNull();
    if (!remoteBranches) {
      return;
    }

    const schema = buildMcpToolInputSchema(remoteBranches);
    expect(schema.properties).toHaveProperty("vaultId");
    expect(schema.properties).not.toHaveProperty("branch");
    expect(schema.required).toEqual(["vaultId"]);
  });

  it("keeps vaults.list as empty object input", () => {
    const vaultList = findToolInCatalog({ name: "vaults.list" });
    expect(vaultList).not.toBeNull();
    if (!vaultList) {
      return;
    }

    const schema = buildMcpToolInputSchema(vaultList);
    expect(schema.properties).toEqual({});
    expect(schema.required).toBeUndefined();
  });
});
