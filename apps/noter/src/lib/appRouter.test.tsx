// @vitest-environment jsdom

import * as React from "react";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/App", () => ({
  default: () => <div data-testid="app-route">App route</div>,
}));

vi.mock("@/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}));

vi.mock("@/lib/usePageMetadata", () => ({
  usePageMetadata: vi.fn(),
}));

vi.mock("@/components/TermsOfServicePage", () => ({
  TermsOfServicePage: () => <div data-testid="terms-page">Terms page</div>,
}));

vi.mock("@/components/LogoPreviewPage", () => ({
  LogoPreviewPage: ({ renderMode }: { renderMode: string }) => (
    <div data-testid="logo-page">{renderMode}</div>
  ),
}));

vi.mock("@/components/McpConsentRoutePage", () => ({
  McpConsentRoutePage: () => (
    <div data-testid="mcp-consent-page">MCP consent page</div>
  ),
}));

import { createAppRouter } from "./appRouter";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
const scrollToMock = vi.fn();

Object.defineProperty(window, "scrollTo", {
  value: scrollToMock,
  writable: true,
});

async function settleRouterRender() {
  await vi.dynamicImportSettled();
  await Promise.resolve();
}

describe("appRouter", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    scrollToMock.mockClear();
  });

  afterEach(() => {
    if (root !== null) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }

    rootElement?.remove();
    rootElement = null;
  });

  async function renderRoute(initialEntry: string) {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    const router = createAppRouter(
      createMemoryHistory({
        initialEntries: [initialEntry],
      }),
    );

    await act(async () => {
      root?.render(<RouterProvider router={router} />);
      await settleRouterRender();
    });
  }

  it("renders terms through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/terms");

    expect(rootElement?.querySelector('[data-testid="layout"]')).not.toBeNull();
    expect(
      rootElement?.querySelector('[data-testid="terms-page"]')?.textContent,
    ).toBe("Terms page");
    expect(rootElement?.querySelector('[data-testid="app-route"]')).toBeNull();
  });

  it("renders logo routes through explicit public routes without the layout shell", async () => {
    await renderRoute("/logo");

    expect(
      rootElement?.querySelector('[data-testid="logo-page"]')?.textContent,
    ).toBe("three");
    expect(rootElement?.querySelector('[data-testid="layout"]')).toBeNull();
    expect(rootElement?.querySelector('[data-testid="app-route"]')).toBeNull();
  });

  it("renders MCP consent through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/oauth/mcp/consent?mcp_consent_request=mcpar_test");

    expect(
      rootElement?.querySelector('[data-testid="mcp-consent-page"]')
        ?.textContent,
    ).toBe("MCP consent page");
    expect(rootElement?.querySelector('[data-testid="app-route"]')).toBeNull();
  });

  it("keeps the App fallback for workspace and app-owned routes", async () => {
    await renderRoute("/vault/noter-md/noter/main/README.md");

    expect(
      rootElement?.querySelector('[data-testid="app-route"]')?.textContent,
    ).toBe("App route");
  });
});
