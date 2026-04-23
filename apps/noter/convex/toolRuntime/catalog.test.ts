import { describe, expect, it } from "vite-plus/test";

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
    expect(writeTools).toEqual([
      "edit_file",
      "replace_in_file",
      "create_file",
      "delete_file",
    ]);

    const prodProposalTools = listCatalogToolsForSurface({
      surface: "mcp",
      grantedScopes: ["prod.read.propose"],
    }).map((tool) => tool.name);
    expect(prodProposalTools).toEqual([
      "request_convex_status_read",
      "request_convex_logs_read",
      "request_convex_projects_read",
      "request_cloudflare_status_read",
      "request_cloudflare_logs_read",
      "request_cloudflare_accounts_read",
      "request_cloudflare_pages_projects_read",
      "request_convex_data_read",
    ]);

    const allTools = listCatalogToolsForSurface({
      surface: "mcp",
      grantedScopes: [
        "vaults.read",
        "files.read",
        "files.write",
        "prod.read.propose",
      ],
    }).map((tool) => tool.name);
    expect(allTools).toEqual([
      "vaults.list",
      "read_file",
      "list_files",
      "edit_file",
      "replace_in_file",
      "create_file",
      "delete_file",
      "get_vault_remote_branches",
      "request_convex_status_read",
      "request_convex_logs_read",
      "request_convex_projects_read",
      "request_cloudflare_status_read",
      "request_cloudflare_logs_read",
      "request_cloudflare_accounts_read",
      "request_cloudflare_pages_projects_read",
      "request_convex_data_read",
    ]);
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

  it("preserves write tool fields and adds context requirements", () => {
    const replaceInFile = findToolInCatalog({ name: "replace_in_file" });
    expect(replaceInFile).not.toBeNull();
    if (!replaceInFile) {
      return;
    }

    const schema = buildMcpToolInputSchema(replaceInFile);
    expect(schema.properties).toHaveProperty("path");
    expect(schema.properties).toHaveProperty("replacements");
    expect(schema.properties).toHaveProperty("vaultId");
    expect(schema.properties).toHaveProperty("branch");
    expect(schema.required).toEqual([
      "path",
      "replacements",
      "vaultId",
      "branch",
    ]);
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

  it("adds threadId context for prod-read proposal tools", () => {
    const proposalTool = findToolInCatalog({
      name: "request_convex_data_read",
    });
    expect(proposalTool).not.toBeNull();
    if (!proposalTool) {
      return;
    }

    const schema = buildMcpToolInputSchema(proposalTool);
    expect(schema.properties).toHaveProperty("table");
    expect(schema.properties).toHaveProperty("vaultId");
    expect(schema.properties).toHaveProperty("threadId");
    expect(schema.required).toEqual(["table", "vaultId", "threadId"]);
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
