// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { McpClientsSettingsSection } from "./McpClientsSettingsSection";

const { act } = React;
const testState = vi.hoisted(() => ({
  paginatedQueryCalls: new Array<unknown[]>(),
  revokeGrant: vi.fn(async () => null),
  viewerAccess: { accessKeys: ["access_mcp"] },
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useMutation: () => testState.revokeGrant,
    usePaginatedQuery: (...args: unknown[]) => {
      testState.paginatedQueryCalls.push(args);
      return {
        isLoading: false,
        loadMore: vi.fn(),
        results: [
          {
            clientId: "codex-client",
            clientName: "Codex",
            createdAt: Date.now() - 60_000,
            grantId: "grant_123",
            resource: "https://api.samebase.com/mcp",
            scopes: ["vaults:read"],
          },
        ],
        status: "Exhausted",
      };
    },
    useQuery: () => testState.viewerAccess,
  };
});

let root: Root | null = null;
let rootElement: HTMLDivElement | null = null;

describe("McpClientsSettingsSection", () => {
  beforeEach(() => {
    testState.paginatedQueryCalls = [];
    testState.revokeGrant.mockReset();
    testState.revokeGrant.mockResolvedValue(null);
    testState.viewerAccess = { accessKeys: ["access_mcp"] };
  });

  afterEach(async () => {
    if (root !== null) {
      await act(async () => root?.unmount());
    }
    rootElement?.remove();
    root = null;
    rootElement = null;
  });

  it("shows and revokes the current user's MCP client grant", async () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    await act(async () => root?.render(<McpClientsSettingsSection />));

    expect(rootElement.textContent).toContain("MCP clients");
    expect(rootElement.textContent).toContain("Codex");
    expect(rootElement.textContent).toContain("vaults:read");
    const revokeButton = [...rootElement.querySelectorAll("button")].find(
      (button) => button.textContent === "Revoke",
    );
    await act(async () => {
      revokeButton?.click();
      await Promise.resolve();
    });

    expect(testState.revokeGrant).toHaveBeenCalledWith({ grantId: "grant_123" });
  });

  it("does not read MCP grants without MCP access", async () => {
    testState.viewerAccess = { accessKeys: ["access_user_preferences"] };
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    await act(async () => root?.render(<McpClientsSettingsSection />));

    expect(rootElement.textContent).not.toContain("MCP clients");
    expect(testState.paginatedQueryCalls.at(-1)?.[1]).toBe("skip");
  });
});
