// @vitest-environment jsdom

import * as React from "react";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/RootIndexRoutePage", () => ({
  RootIndexRoutePage: () => (
    <div data-testid="root-index-route">Root index route</div>
  ),
}));

vi.mock("@/components/NotFoundRoutePage", () => ({
  NotFoundRoutePage: () => (
    <div data-testid="not-found-route">Not found route</div>
  ),
}));

vi.mock("@/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
  PublicLayoutShell: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/lib/usePageMetadata", () => ({
  usePageMetadata: vi.fn(),
}));

vi.mock("@/components/TermsOfServicePage", () => ({
  TermsOfServicePage: () => <div data-testid="terms-page">Terms page</div>,
}));

vi.mock("@/components/PrivacyPolicyPage", () => ({
  PrivacyPolicyPage: () => (
    <div data-testid="privacy-page">Privacy policy page</div>
  ),
}));

vi.mock("@/components/AuthenticatedAppRoutePage", () => ({
  AuthenticatedAppRoutePage: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/components/LogoPreviewPage", () => ({
  LogoPreviewPage: ({ renderMode }: { renderMode: string }) => (
    <div data-testid="logo-page">{renderMode}</div>
  ),
}));

vi.mock("@/components/LogoStaticSvgPage", () => ({
  LogoStaticSvgPage: () => <div data-testid="logo-svg-page">Logo SVG page</div>,
}));

vi.mock("@/components/LogoSingleCubeStudyPage", () => ({
  LogoSingleCubeStudyPage: () => (
    <div data-testid="logo-iso-study-page">Logo iso study page</div>
  ),
}));

vi.mock("@/components/McpConsentRoutePage", () => ({
  McpConsentRoutePage: () => (
    <div data-testid="mcp-consent-page">MCP consent page</div>
  ),
}));

vi.mock("@/components/PricingPage", () => ({
  PricingPage: () => <div data-testid="pricing-page">Pricing page</div>,
}));

vi.mock("@/components/AddRepository", () => ({
  AddRepository: () => (
    <div data-testid="add-repository-page">Add repository page</div>
  ),
}));

vi.mock("@/components/MachinesWorkspacePage", () => ({
  MachinesWorkspacePage: () => (
    <div data-testid="machines-page">Machines page</div>
  ),
}));

vi.mock("@/components/MachineConnectPage", () => ({
  MachineConnectPage: () => (
    <div data-testid="machine-connect-page">Machine connect page</div>
  ),
}));

vi.mock("@/components/CodespaceChatOnlyView", () => ({
  CodespaceChatOnlyView: () => (
    <div data-testid="codespace-chat-page">Codespace chat page</div>
  ),
}));

vi.mock("@/components/FileView/FileView", () => ({
  FileView: () => <div data-testid="file-view-page">File view page</div>,
}));

vi.mock("@/components/PitchDeckPage", () => ({
  PitchDeckPage: ({ mode }: { mode: string }) => (
    <div data-testid="pitch-deck-page">{mode}</div>
  ),
}));

vi.mock("@/components/LogoTransitionLabPage", () => ({
  LogoTransitionLabPage: () => (
    <div data-testid="logo-transition-lab-page">Logo transition lab page</div>
  ),
}));

vi.mock("@/components/LogoTransitionTransformsLabPage", () => ({
  LogoTransitionTransformsLabPage: () => (
    <div data-testid="logo-transition-transforms-lab-page">
      Logo transition transforms lab page
    </div>
  ),
}));

vi.mock("@/components/CodexAppServerResearchPage", () => ({
  CodexAppServerResearchPage: () => (
    <div data-testid="codex-research-page">Codex research page</div>
  ),
}));

vi.mock("@/components/CodexAppServerThreadBrowserResearchPage", () => ({
  CodexAppServerThreadBrowserResearchPage: () => (
    <div data-testid="codex-thread-browser-page">Codex thread browser page</div>
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
    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]'),
    ).toBeNull();
  });

  it("renders / through the explicit routed root index page", async () => {
    await renderRoute("/");

    expect(
      rootElement?.querySelector('[data-testid="root-index-route"]')
        ?.textContent,
    ).toBe("Root index route");
    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]'),
    ).toBeNull();
  });

  it("renders logo routes through explicit public routes without the layout shell", async () => {
    await renderRoute("/logo");

    expect(
      rootElement?.querySelector('[data-testid="logo-page"]')?.textContent,
    ).toBe("three");
    expect(rootElement?.querySelector('[data-testid="layout"]')).toBeNull();
    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]'),
    ).toBeNull();
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
    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]'),
    ).toBeNull();
  });

  it("renders pricing through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/pricing?checkout=success");

    expect(
      rootElement?.querySelector('[data-testid="pricing-page"]')?.textContent,
    ).toBe("Pricing page");
    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]'),
    ).toBeNull();
  });

  it("renders add repository through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/add");

    expect(
      rootElement?.querySelector('[data-testid="add-repository-page"]')
        ?.textContent,
    ).toBe("Add repository page");
    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]'),
    ).toBeNull();
  });

  it("accepts a trailing slash on the promoted pricing route", async () => {
    await renderRoute("/pricing/");

    expect(
      rootElement?.querySelector('[data-testid="pricing-page"]')?.textContent,
    ).toBe("Pricing page");
    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]'),
    ).toBeNull();
  });

  it("accepts a trailing slash on the promoted add route", async () => {
    await renderRoute("/add/");

    expect(
      rootElement?.querySelector('[data-testid="add-repository-page"]')
        ?.textContent,
    ).toBe("Add repository page");
    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]'),
    ).toBeNull();
  });

  it("renders machines through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/machines?machineId=machine-123");

    expect(
      rootElement?.querySelector('[data-testid="machines-page"]')?.textContent,
    ).toBe("Machines page");
    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]'),
    ).toBeNull();
  });

  it("renders machine connect through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/machines/connect?requestId=req_123");

    expect(
      rootElement?.querySelector('[data-testid="machine-connect-page"]')
        ?.textContent,
    ).toBe("Machine connect page");
    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]'),
    ).toBeNull();
  });

  it("accepts a trailing slash on the promoted machines route", async () => {
    await renderRoute("/machines/");

    expect(
      rootElement?.querySelector('[data-testid="machines-page"]')?.textContent,
    ).toBe("Machines page");
    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]'),
    ).toBeNull();
  });

  it("accepts a trailing slash on the promoted machine connect route", async () => {
    await renderRoute("/machines/connect/");

    expect(
      rootElement?.querySelector('[data-testid="machine-connect-page"]')
        ?.textContent,
    ).toBe("Machine connect page");
    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]'),
    ).toBeNull();
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
    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]'),
    ).toBeNull();
  });

  it("renders the generic vault route through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/vault/noter-md/noter/main/README.md");

    expect(
      rootElement?.querySelector('[data-testid="file-view-page"]')?.textContent,
    ).toBe("File view page");
    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]'),
    ).toBeNull();
  });

  it("renders the vault repository root through the generic vault route", async () => {
    await renderRoute("/vault/noter-md/noter");

    expect(
      rootElement?.querySelector('[data-testid="file-view-page"]')?.textContent,
    ).toBe("File view page");
    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]'),
    ).toBeNull();
  });

  it("renders /test through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/test");

    expect(
      rootElement?.querySelector('[data-testid="root-test-route"]')
        ?.textContent,
    ).toBe("Test");
    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]'),
    ).toBeNull();
  });

  it("renders the root not-found route for unresolved paths", async () => {
    await renderRoute("/missing");

    expect(
      rootElement?.querySelector('[data-testid="not-found-route"]')
        ?.textContent,
    ).toBe("Not found route");
  });
});
