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

vi.mock("@/components/PricingRoutePage", () => ({
  PricingRoutePage: () => <div data-testid="pricing-page">Pricing page</div>,
}));

vi.mock("@/components/AddRepositoryRoutePage", () => ({
  AddRepositoryRoutePage: () => (
    <div data-testid="add-repository-page">Add repository page</div>
  ),
}));

vi.mock("@/components/MachinesRoutePage", () => ({
  MachinesRoutePage: () => <div data-testid="machines-page">Machines page</div>,
}));

vi.mock("@/components/MachineConnectRoutePage", () => ({
  MachineConnectRoutePage: () => (
    <div data-testid="machine-connect-page">Machine connect page</div>
  ),
}));

vi.mock("@/components/CodespaceChatRoutePage", () => ({
  CodespaceChatRoutePage: () => (
    <div data-testid="codespace-chat-page">Codespace chat page</div>
  ),
}));

vi.mock("@/components/FileViewRoutePage", () => ({
  FileViewRoutePage: () => (
    <div data-testid="file-view-page">File view page</div>
  ),
}));

import { createAppRouter } from "./appRouter";
import {
  buildPathWithUpdatedQuery,
  buildSearchString,
  setQueryParam,
  updateQueryParams,
} from "./queryParams";

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

    return router;
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

  it("retains the root devtools flag across logo route search updates", async () => {
    const router = await renderRoute(
      buildPathWithUpdatedQuery({ pathname: "/logo" }, (searchParams) => {
        setQueryParam(searchParams, "devtools", true);
        setQueryParam(searchParams, "rot", "10");
      }),
    );

    await act(async () => {
      await router.navigate({
        replace: true,
        search: {},
        to: "/logo-iso",
      });
      await settleRouterRender();
    });

    expect(router.state.location.pathname).toBe("/logo-iso");
    expect(router.state.location.searchStr).toBe(
      buildSearchString(
        updateQueryParams(undefined, (searchParams) => {
          setQueryParam(searchParams, "devtools", true);
        }),
      ),
    );
  });

  it("renders MCP consent through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/oauth/mcp/consent?mcp_consent_request=mcpar_test");

    expect(
      rootElement?.querySelector('[data-testid="mcp-consent-page"]')
        ?.textContent,
    ).toBe("MCP consent page");
    expect(rootElement?.querySelector('[data-testid="app-route"]')).toBeNull();
  });

  it("renders pricing through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/pricing?checkout=success");

    expect(
      rootElement?.querySelector('[data-testid="pricing-page"]')?.textContent,
    ).toBe("Pricing page");
    expect(rootElement?.querySelector('[data-testid="app-route"]')).toBeNull();
  });

  it("renders add repository through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/add");

    expect(
      rootElement?.querySelector('[data-testid="add-repository-page"]')
        ?.textContent,
    ).toBe("Add repository page");
    expect(rootElement?.querySelector('[data-testid="app-route"]')).toBeNull();
  });

  it("accepts a trailing slash on the promoted pricing route", async () => {
    await renderRoute("/pricing/");

    expect(
      rootElement?.querySelector('[data-testid="pricing-page"]')?.textContent,
    ).toBe("Pricing page");
    expect(rootElement?.querySelector('[data-testid="app-route"]')).toBeNull();
  });

  it("accepts a trailing slash on the promoted add route", async () => {
    await renderRoute("/add/");

    expect(
      rootElement?.querySelector('[data-testid="add-repository-page"]')
        ?.textContent,
    ).toBe("Add repository page");
    expect(rootElement?.querySelector('[data-testid="app-route"]')).toBeNull();
  });

  it("renders machines through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/machines?machineId=machine-123");

    expect(
      rootElement?.querySelector('[data-testid="machines-page"]')?.textContent,
    ).toBe("Machines page");
    expect(rootElement?.querySelector('[data-testid="app-route"]')).toBeNull();
  });

  it("renders machine connect through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/machines/connect?requestId=req_123");

    expect(
      rootElement?.querySelector('[data-testid="machine-connect-page"]')
        ?.textContent,
    ).toBe("Machine connect page");
    expect(rootElement?.querySelector('[data-testid="app-route"]')).toBeNull();
  });

  it("accepts a trailing slash on the promoted machines route", async () => {
    await renderRoute("/machines/");

    expect(
      rootElement?.querySelector('[data-testid="machines-page"]')?.textContent,
    ).toBe("Machines page");
    expect(rootElement?.querySelector('[data-testid="app-route"]')).toBeNull();
  });

  it("accepts a trailing slash on the promoted machine connect route", async () => {
    await renderRoute("/machines/connect/");

    expect(
      rootElement?.querySelector('[data-testid="machine-connect-page"]')
        ?.textContent,
    ).toBe("Machine connect page");
    expect(rootElement?.querySelector('[data-testid="app-route"]')).toBeNull();
  });

  it("renders codespace chat through an explicit TanStack route instead of the vault catch-all", async () => {
    await renderRoute("/vault/noter-md/noter/codespace/main/chat");

    expect(
      rootElement?.querySelector('[data-testid="codespace-chat-page"]')
        ?.textContent,
    ).toBe("Codespace chat page");
    expect(
      rootElement?.querySelector('[data-testid="file-view-page"]'),
    ).toBeNull();
    expect(rootElement?.querySelector('[data-testid="app-route"]')).toBeNull();
  });

  it("renders the generic vault route through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/vault/noter-md/noter/main/README.md");

    expect(
      rootElement?.querySelector('[data-testid="file-view-page"]')?.textContent,
    ).toBe("File view page");
    expect(rootElement?.querySelector('[data-testid="app-route"]')).toBeNull();
  });

  it("renders the vault repository root through the generic vault route", async () => {
    await renderRoute("/vault/noter-md/noter");

    expect(
      rootElement?.querySelector('[data-testid="file-view-page"]')?.textContent,
    ).toBe("File view page");
    expect(rootElement?.querySelector('[data-testid="app-route"]')).toBeNull();
  });

  it("keeps the App fallback for unresolved app-owned routes", async () => {
    await renderRoute("/test");

    expect(
      rootElement?.querySelector('[data-testid="app-route"]')?.textContent,
    ).toBe("App route");
  });
});
