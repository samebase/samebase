// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { McpClientsSettingsSection } from "./McpClientsSettingsSection";

const { act } = React;
const testState = vi.hoisted(() => ({
  revokeGrant: vi.fn(async () => null),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useMutation: () => testState.revokeGrant,
    usePaginatedQuery: () => ({
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
    }),
  };
});

let root: Root | null = null;
let rootElement: HTMLDivElement | null = null;

describe("McpClientsSettingsSection", () => {
  beforeEach(() => {
    testState.revokeGrant.mockReset();
    testState.revokeGrant.mockResolvedValue(null);
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
});
