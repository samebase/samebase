import { describe, expect, it } from "vitest";

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
    default:
      return {};
  }
}

describe("validateToolPolicy", () => {
  it("rejects calls on unsupported surfaces", () => {
    const tool = findToolInCatalog({ name: "vaults.list" });
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
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("not available");
  });

  it("rejects MCP calls without required scope", () => {
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
        grantedScopes: ["vaults.read"],
        vaultId: "vault_123",
        branch: "main",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Insufficient scope for read_file.");
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
        surface: "mcp",
        grantedScopes: ["files.read"],
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
        surface: "mcp",
        grantedScopes: ["files.read"],
        vaultId: "vault_123",
        branch: "   ",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("read_file requires branch context.");
  });

  it("allows valid branch-aware MCP requests", () => {
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
        surface: "mcp",
        grantedScopes: ["files.read"],
        vaultId: "vault_123",
        branch: "feature/runtime",
      }),
    });

    expect(result).toEqual({ ok: true });
  });

  it("allows MCP write requests when files.write scope is granted", () => {
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

    expect(result).toEqual({ ok: true });
  });

  it("requires files.write scope for every write tool", () => {
    const writeToolNames = [
      "edit_file",
      "replace_in_file",
      "create_file",
      "delete_file",
    ];

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
          surface: "mcp",
          grantedScopes: ["files.read"],
          vaultId: "vault_123",
          branch: "main",
        }),
      });

      expect(result.ok).toBe(false);
      expect(result.message).toBe(`Insufficient scope for ${tool.name}.`);
    }
  });
});
