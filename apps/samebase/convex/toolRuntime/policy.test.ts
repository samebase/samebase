import { describe, expect, it } from "vite-plus/test";

import { findToolInCatalog } from "./catalog";
import { validateToolPolicy } from "./policy";
import type { ToolRunRequest } from "./types";

function makeRequest(request: Omit<ToolRunRequest, "userId">): ToolRunRequest {
  return {
    ...request,
    // @ts-expect-error Test-only synthetic id string is sufficient here.
    userId: "users_test",
  };
}

function inputForTool(toolName: string): unknown {
  switch (toolName) {
    case "create_app":
      return {
        name: "todo-app",
        owner: "samebase",
        convexProjectName: "todo-app",
        cloudflareWorkerName: "todo-app",
      };
    case "edit_file":
      return { path: "README.md", content: "updated" };
    case "create_file":
      return { path: "NEW.md", content: "new" };
    case "delete_file":
      return { path: "README.md" };
    case "replace_in_file":
      return {
        path: "README.md",
        replacements: [{ oldText: "old", newText: "new" }],
      };
    case "request_convex_data_read":
      return { table: "vaults" };
    case "request_convex_projects_read":
      return {};
    default:
      return {};
  }
}

describe("validateToolPolicy", () => {
  it("rejects calls on unsupported surfaces", () => {
    const tool = findToolInCatalog({ name: "read_file" });
    expect(tool).not.toBeNull();
    if (!tool) {
      return;
    }

    const result = validateToolPolicy({
      tool,
      request: makeRequest({
        toolName: tool.name,
        input: { path: "README.md" },
        surface: "mcp",
        grantedScopes: ["files.read"],
        vaultId: "vault_123",
        branch: "main",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("not available");
  });

  it("rejects MCP calls without required scope", () => {
    const tool = findToolInCatalog({ name: "create_app" });
    expect(tool).not.toBeNull();
    if (!tool) {
      return;
    }

    const result = validateToolPolicy({
      tool,
      request: makeRequest({
        toolName: tool.name,
        input: inputForTool(tool.name),
        surface: "mcp",
        grantedScopes: [],
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Insufficient scope for create_app.");
  });

  it("allows MCP create_app when apps.create scope is granted", () => {
    const tool = findToolInCatalog({ name: "create_app" });
    expect(tool).not.toBeNull();
    if (!tool) {
      return;
    }

    const result = validateToolPolicy({
      tool,
      request: makeRequest({
        toolName: tool.name,
        input: inputForTool(tool.name),
        surface: "mcp",
        grantedScopes: ["apps.create"],
      }),
    });

    expect(result).toEqual({ ok: true });
  });

  it("does not require MCP scopes on agent surface", () => {
    const tool = findToolInCatalog({ name: "read_file" });
    expect(tool).not.toBeNull();
    if (!tool) {
      return;
    }

    const result = validateToolPolicy({
      tool,
      request: makeRequest({
        toolName: tool.name,
        input: { path: "README.md" },
        surface: "agent",
        grantedScopes: [],
        vaultId: "vault_123",
        branch: "main",
      }),
    });

    expect(result.ok).toBe(true);
  });

  it("requires vaultId when tool needs vault context", () => {
    const tool = findToolInCatalog({ name: "read_file" });
    expect(tool).not.toBeNull();
    if (!tool) {
      return;
    }

    const result = validateToolPolicy({
      tool,
      request: makeRequest({
        toolName: tool.name,
        input: { path: "README.md" },
        surface: "agent",
        grantedScopes: [],
        branch: "main",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("read_file requires vaultId context.");
  });

  it("rejects blank vaultId when tool needs vault context", () => {
    const tool = findToolInCatalog({ name: "read_file" });
    expect(tool).not.toBeNull();
    if (!tool) {
      return;
    }

    const result = validateToolPolicy({
      tool,
      request: makeRequest({
        toolName: tool.name,
        input: { path: "README.md" },
        surface: "agent",
        grantedScopes: [],
        vaultId: "   ",
        branch: "main",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("read_file requires vaultId context.");
  });

  it("requires non-empty branch for branch-aware tools", () => {
    const tool = findToolInCatalog({ name: "read_file" });
    expect(tool).not.toBeNull();
    if (!tool) {
      return;
    }

    const result = validateToolPolicy({
      tool,
      request: makeRequest({
        toolName: tool.name,
        input: { path: "README.md" },
        surface: "agent",
        grantedScopes: [],
        vaultId: "vault_123",
        branch: "   ",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("read_file requires branch context.");
  });

  it("allows valid branch-aware agent requests", () => {
    const tool = findToolInCatalog({ name: "list_files" });
    expect(tool).not.toBeNull();
    if (!tool) {
      return;
    }

    const result = validateToolPolicy({
      tool,
      request: makeRequest({
        toolName: tool.name,
        input: {},
        surface: "agent",
        grantedScopes: [],
        vaultId: "vault_123",
        branch: "feature/runtime",
      }),
    });

    expect(result).toEqual({ ok: true });
  });

  it("keeps write tools unavailable on MCP even with old write scopes", () => {
    const tool = findToolInCatalog({ name: "edit_file" });
    expect(tool).not.toBeNull();
    if (!tool) {
      return;
    }

    const result = validateToolPolicy({
      tool,
      request: makeRequest({
        toolName: tool.name,
        input: {
          path: "README.md",
          content: "updated",
        },
        surface: "mcp",
        grantedScopes: ["files.write"],
        vaultId: "vault_123",
        branch: "main",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("not available");
  });

  it("allows write tools on the agent surface without MCP scopes", () => {
    const writeToolNames = ["edit_file", "replace_in_file", "create_file", "delete_file"];

    for (const toolName of writeToolNames) {
      const tool = findToolInCatalog({ name: toolName });
      expect(tool).not.toBeNull();
      if (!tool) {
        continue;
      }

      const result = validateToolPolicy({
        tool,
        request: makeRequest({
          toolName: tool.name,
          input: inputForTool(tool.name),
          surface: "agent",
          grantedScopes: [],
          vaultId: "vault_123",
          branch: "main",
        }),
      });

      expect(result).toEqual({ ok: true });
    }
  });

  it("requires threadId for proposal tools", () => {
    const tool = findToolInCatalog({ name: "request_convex_projects_read" });
    expect(tool).not.toBeNull();
    if (!tool) {
      return;
    }

    const result = validateToolPolicy({
      tool,
      request: makeRequest({
        toolName: tool.name,
        input: inputForTool(tool.name),
        surface: "agent",
        grantedScopes: [],
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("request_convex_projects_read requires threadId context.");
  });

  it("allows proposal tools on the agent surface with threadId", () => {
    const tool = findToolInCatalog({ name: "request_convex_projects_read" });
    expect(tool).not.toBeNull();
    if (!tool) {
      return;
    }

    const result = validateToolPolicy({
      tool,
      request: makeRequest({
        toolName: tool.name,
        input: inputForTool(tool.name),
        surface: "agent",
        grantedScopes: [],
        threadId: "thread_123",
      }),
    });

    expect(result).toEqual({ ok: true });
  });
});
