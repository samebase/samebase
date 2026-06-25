import { describe, expect, it } from "vite-plus/test";

import { createRepositoryMcpTool, findMcpTool, listMcpTools, MCP_TOOLS } from "./catalog";

describe("MCP tool catalog", () => {
  it("exposes only createRepository", () => {
    expect(MCP_TOOLS.map((tool) => tool.name)).toEqual(["vault.actions.createRepository"]);
  });

  it("requires access_app_create scope", () => {
    expect(listMcpTools([])).toEqual([]);
    expect(listMcpTools(["vaults.read", "files.write"])).toEqual([]);
    expect(listMcpTools(["access_app_create"]).map((tool) => tool.name)).toEqual([
      "vault.actions.createRepository",
    ]);
  });

  it("publishes createRepository input fields directly from the Convex contract", () => {
    expect(createRepositoryMcpTool.inputSchema.properties).toHaveProperty("name");
    expect(createRepositoryMcpTool.inputSchema.properties).toHaveProperty("owner");
    expect(createRepositoryMcpTool.inputSchema.properties).toHaveProperty("convexProjectName");
    expect(createRepositoryMcpTool.inputSchema.properties).toHaveProperty("cloudflareWorkerName");
    expect(createRepositoryMcpTool.inputSchema.properties).toHaveProperty("description");
    expect(createRepositoryMcpTool.inputSchema.properties).toHaveProperty("private");
    expect(createRepositoryMcpTool.inputSchema.properties).not.toHaveProperty("vaultId");
    expect(createRepositoryMcpTool.inputSchema.properties).not.toHaveProperty("branch");
    expect(createRepositoryMcpTool.inputSchema.properties).not.toHaveProperty("threadId");
    expect(createRepositoryMcpTool.inputSchema.required).toEqual([
      "name",
      "owner",
      "convexProjectName",
      "cloudflareWorkerName",
    ]);
  });

  it("does not resolve old tool names", () => {
    expect(findMcpTool("read_file")).toBeNull();
    expect(findMcpTool("vaults.list")).toBeNull();
  });
});
