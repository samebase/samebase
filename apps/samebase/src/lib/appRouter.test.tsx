// @vitest-environment jsdom

import * as React from "react";
import { type WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { appWorkspaceMountMock, appWorkspaceUnmountMock, useConvexAuthMock } = vi.hoisted(() => ({
  appWorkspaceMountMock: vi.fn(),
  appWorkspaceUnmountMock: vi.fn(),
  useConvexAuthMock: vi.fn(),
}));

vi.mock("@/components/RootIndexRoutePage", () => ({
  RootIndexRoutePage: () => <div data-testid="root-index-route">Root index route</div>,
}));

vi.mock("@/components/DashboardRoutePage", () => ({
  DashboardRoutePage: ({ selectedRepositoryFullName }: { selectedRepositoryFullName?: string }) => (
    <div data-testid="dashboard-route">{selectedRepositoryFullName ?? "Dashboard route"}</div>
  ),
}));

vi.mock("@/components/NotFoundRoutePage", () => ({
  NotFoundRoutePage: () => <div data-testid="not-found-route">Not found route</div>,
}));

vi.mock("@/components/AppWorkspaceShell", async () => {
  const ReactModule = await import("react");
  type MockPaneProps = Pick<WorkspaceLayoutV2PaneFrameProps, "content" | "footer" | "header">;

  return {
    AppWorkspaceShell: ({ children }: { children?: React.ReactNode }) => {
      ReactModule.useEffect(() => {
        appWorkspaceMountMock();
        return () => {
          appWorkspaceUnmountMock();
        };
      }, []);

      return (
        <div data-testid="app-workspace">
          <div data-testid="app-workspace-left-pane" />
          {children}
        </div>
      );
    },
    AppWorkspaceRouteChrome: ({
      children,
      headerAccessory,
      left,
    }: {
      children?: React.ReactNode;
      headerAccessory?: React.ReactNode;
      left?: MockPaneProps;
    }) => {
      return (
        <div data-testid="app-workspace-route-chrome">
          <div data-testid="app-workspace-route-header-accessory">{headerAccessory}</div>
          <div data-testid="app-workspace-route-left-pane">
            {left?.header}
            {left?.content}
            {left?.footer}
          </div>
          {children}
        </div>
      );
    },
  };
});

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useConvexAuth: useConvexAuthMock,
  };
});

vi.mock("@/lib/usePageMetadata", () => ({
  usePageMetadata: vi.fn(),
}));

vi.mock("@/components/TermsOfServicePage", () => ({
  TermsOfServicePage: () => <div data-testid="terms-page">Terms page</div>,
}));

vi.mock("@/components/PrivacyPolicyPage", () => ({
  PrivacyPolicyPage: () => <div data-testid="privacy-page">Privacy policy page</div>,
}));

vi.mock("@/components/AuthenticatedAppRoutePage", () => ({
  AuthenticatedAppRoutePage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/logo/LogoPreviewPage", () => ({
  LogoPreviewPage: ({ renderMode }: { renderMode: string }) => (
    <div data-testid="logo-page">{renderMode}</div>
  ),
}));

vi.mock("@/components/logo/LogoStaticSvgPage", () => ({
  LogoStaticSvgPage: () => <div data-testid="logo-svg-page">Logo SVG page</div>,
}));

vi.mock("@/components/logo/LogoSingleCubeStudyPage", () => ({
  LogoSingleCubeStudyPage: () => <div data-testid="logo-iso-study-page">Logo iso study page</div>,
}));

vi.mock("@/components/McpConsentRoutePage", () => ({
  McpConsentRoutePage: () => <div data-testid="mcp-consent-page">MCP consent page</div>,
}));

vi.mock("@/components/PricingPage", () => ({
  PricingPage: () => <div data-testid="pricing-page">Pricing page</div>,
}));

vi.mock("@/components/ConnectRepository", () => ({
  ConnectRepository: () => <div data-testid="connect-repository-page">Connect repository page</div>,
}));

vi.mock("@/components/NewAppPage", () => ({
  NewAppPage: () => <div data-testid="new-app-page">New app page</div>,
}));

vi.mock("@/components/ProviderConnectionsPage", () => ({
  ProviderConnectionsPage: () => <div data-testid="providers-page">Providers page</div>,
}));

vi.mock("@/components/MachinesWorkspacePage", () => ({
  MachinesWorkspacePage: () => <div data-testid="machines-page">Machines page</div>,
}));

vi.mock("@/components/MachineConnectPage", () => ({
  MachineConnectPage: () => <div data-testid="machine-connect-page">Machine connect page</div>,
}));

vi.mock("@/components/LandingMarkdownPreviewPage", () => ({
  LandingMarkdownPreviewPage: () => (
    <div data-testid="landing-markdown-preview-page">Landing markdown preview page</div>
  ),
}));

vi.mock("@/components/CodespaceChatOnlyView", () => ({
  CodespaceChatOnlyView: () => <div data-testid="codespace-chat-page">Codespace chat page</div>,
}));

vi.mock("@/components/FileView/FileView", () => ({
  FileView: () => <div data-testid="file-view-page">File view page</div>,
}));

vi.mock("@/components/VaultDatabaseView", () => ({
  VaultDatabaseView: () => <div data-testid="vault-database-page">Vault database page</div>,
}));

vi.mock("@/components/PitchDeckPage", () => ({
  PitchDeckPage: ({ mode }: { mode: string }) => <div data-testid="pitch-deck-page">{mode}</div>,
}));

vi.mock("@/components/logo/LogoTransitionLabPage", () => ({
  LogoTransitionLabPage: () => (
    <div data-testid="logo-transition-lab-page">Logo transition lab page</div>
  ),
}));

vi.mock("@/components/logo/LogoTransitionTransformsLabPage", () => ({
  LogoTransitionTransformsLabPage: () => (
    <div data-testid="logo-transition-transforms-lab-page">Logo transition transforms lab page</div>
  ),
}));

vi.mock("@/components/codex/CodexAppServerResearchPage", () => ({
  CodexAppServerResearchPage: () => (
    <div data-testid="codex-research-page">Codex research page</div>
  ),
}));

vi.mock("@/components/codex/CodexAppServerThreadBrowserResearchPage", () => ({
  CodexAppServerThreadBrowserResearchPage: () => (
    <div data-testid="codex-thread-browser-page">Codex thread browser page</div>
  ),
}));

vi.mock("@/components/AppRootClient", async () => {
  const { Outlet } = await import("@tanstack/react-router");
  const { AppWorkspaceShell } = await import("@/components/AppWorkspaceShell");

  return {
    AppRootClient: () => (
      <AppWorkspaceShell>
        <Outlet />
      </AppWorkspaceShell>
    ),
  };
});

vi.mock("@/lib/rootHead", () => ({
  buildRootHead: () => ({
    links: [],
    meta: [],
    scripts: [],
  }),
}));

import { createAppRouter } from "../router";
import { applySearchPatch } from "@/routing/searchFlags";
import { buildPathWithTanStackSearch, stringifyTanStackSearch } from "./tanstackSearchParams";

const { act } = React;
const scrollToMock = vi.fn();

Object.defineProperty(window, "scrollTo", {
  value: scrollToMock,
  writable: true,
});
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })),
});

async function settleRouterRender() {
  await vi.dynamicImportSettled();
  await Promise.resolve();
}

describe("appRouter", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    appWorkspaceMountMock.mockClear();
    appWorkspaceUnmountMock.mockClear();
    scrollToMock.mockClear();
    useConvexAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });
    document.documentElement.className = "";
    window.localStorage.removeItem("theme");
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
    useConvexAuthMock.mockReset();
    vi.unstubAllEnvs();
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

    expect(rootElement?.querySelector('[data-testid="app-workspace"]')).not.toBeNull();
    expect(rootElement?.querySelector('[data-testid="terms-page"]')?.textContent).toBe(
      "Terms page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("keeps the app workspace shell mounted while route content changes", async () => {
    const router = await renderRoute("/terms");

    expect(appWorkspaceMountMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await router.navigate({ to: "/privacy" });
      await settleRouterRender();
    });

    expect(appWorkspaceMountMock).toHaveBeenCalledTimes(1);
    expect(appWorkspaceUnmountMock).not.toHaveBeenCalled();
    expect(rootElement?.querySelector('[data-testid="privacy-page"]')?.textContent).toBe(
      "Privacy policy page",
    );

    await act(async () => {
      await router.navigate({ to: "/" });
      await settleRouterRender();
    });

    expect(appWorkspaceMountMock).toHaveBeenCalledTimes(1);
    expect(appWorkspaceUnmountMock).not.toHaveBeenCalled();
    expect(rootElement?.querySelector('[data-testid="root-index-route"]')?.textContent).toBe(
      "Root index route",
    );

    await act(async () => {
      await router.navigate({ to: "/localStorage" });
      await settleRouterRender();
    });

    expect(appWorkspaceMountMock).toHaveBeenCalledTimes(1);
    expect(appWorkspaceUnmountMock).not.toHaveBeenCalled();
    expect(
      rootElement?.querySelector('[data-testid="local-storage-sidebar-file"]')?.textContent,
    ).toBe("/localStorage");

    await act(async () => {
      await router.navigate({ to: "/indexDB" });
      await settleRouterRender();
    });

    expect(appWorkspaceMountMock).toHaveBeenCalledTimes(1);
    expect(appWorkspaceUnmountMock).not.toHaveBeenCalled();
    expect(rootElement?.querySelector('[data-testid="indexed-db-sidebar-file"]')?.textContent).toBe(
      "/indexDB",
    );
  });

  it("renders / through the explicit routed root index page", async () => {
    await renderRoute("/");

    expect(rootElement?.querySelector('[data-testid="root-index-route"]')?.textContent).toBe(
      "Root index route",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("redirects /landing to the public landing root route", async () => {
    const router = await renderRoute("/landing");

    await act(async () => {
      await settleRouterRender();
    });

    expect(router.state.location.pathname).toBe("/");
    expect(rootElement?.querySelector('[data-testid="root-index-route"]')?.textContent).toBe(
      "Root index route",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders /vault through the explicit dashboard route", async () => {
    await renderRoute("/vault");

    expect(rootElement?.querySelector('[data-testid="dashboard-route"]')?.textContent).toBe(
      "Dashboard route",
    );
    expect(rootElement?.querySelector('[data-testid="root-index-route"]')).toBeNull();
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("does not keep the removed /home dashboard route", async () => {
    await renderRoute("/home?delete");

    expect(rootElement?.querySelector('[data-testid="not-found-route"]')?.textContent).toBe(
      "Not found route",
    );
    expect(rootElement?.querySelector('[data-testid="dashboard-route"]')).toBeNull();
  });

  it("does not redirect old root dashboard query URLs to /vault", async () => {
    const router = await renderRoute("/?delete");

    expect(router.state.location.pathname).toBe("/");
    expect(rootElement?.querySelector('[data-testid="root-index-route"]')?.textContent).toBe(
      "Root index route",
    );
    expect(rootElement?.querySelector('[data-testid="dashboard-route"]')).toBeNull();
  });

  it("removes all visible search params when reset is present", async () => {
    const router = await renderRoute("/terms?reset&devtools&primary=red-600#top");

    expect(router.state.location.pathname).toBe("/terms");
    expect(router.state.location.searchStr).toBe("");
    expect(router.state.location.hash).toBe("top");
  });

  it("removes conflicting visible theme mode flags through typed root search", async () => {
    const router = await renderRoute("/terms?devtools&light&dark&primary=red-600#top");
    const searchParams = new URLSearchParams(router.state.location.searchStr);

    expect(router.state.location.pathname).toBe("/terms");
    expect(searchParams.has("light")).toBe(false);
    expect(searchParams.has("dark")).toBe(false);
    expect(searchParams.has("devtools")).toBe(true);
    expect(searchParams.get("primary")).toBe("red-600");
    expect(router.state.location.hash).toBe("top");
  });

  it("does not keep the removed /dashboard route", async () => {
    await renderRoute("/dashboard?delete");

    expect(rootElement?.querySelector('[data-testid="not-found-route"]')?.textContent).toBe(
      "Not found route",
    );
    expect(rootElement?.querySelector('[data-testid="dashboard-route"]')).toBeNull();
  });

  it("renders logo routes through explicit public routes", async () => {
    const router = await renderRoute("/logo");

    expect(rootElement?.querySelector('[data-testid="logo-page"]')?.textContent).toBe("three");
    expect(new URLSearchParams(router.state.location.searchStr).has("dev")).toBe(false);
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("keeps direct logo loads from adding dev or dropping route search and hash", async () => {
    const router = await renderRoute(
      buildPathWithTanStackSearch({
        pathname: "/logo",
        search: {
          devtools: true,
          rot: "10",
        },
        hash: "top",
      }),
    );
    const searchParams = new URLSearchParams(router.state.location.searchStr);

    expect(router.state.location.pathname).toBe("/logo");
    expect(searchParams.has("dev")).toBe(false);
    expect(searchParams.has("devtools")).toBe(true);
    expect(searchParams.get("rot")).toBe("10");
    expect(router.state.location.hash).toBe("top");
  });

  it("retains the root devtools flag across logo route search updates", async () => {
    const router = await renderRoute(
      buildPathWithTanStackSearch({
        pathname: "/logo",
        search: {
          devtools: true,
          primary: "red-600",
          rot: "10",
        },
      }),
    );

    await act(async () => {
      await router.navigate({
        replace: true,
        search: {},
        to: "/logo/iso",
      });
      await settleRouterRender();
    });

    const searchParams = new URLSearchParams(router.state.location.searchStr);

    expect(router.state.location.pathname).toBe("/logo/iso");
    expect(searchParams.has("dev")).toBe(false);
    expect(searchParams.has("devtools")).toBe(true);
    expect(searchParams.get("primary")).toBe("red-600");
  });

  it("clears retained theme colors with null tombstones", async () => {
    const router = await renderRoute(
      buildPathWithTanStackSearch({
        pathname: "/logo",
        search: {
          primary: "red-600",
        },
      }),
    );

    await act(async () => {
      await router.navigate({
        replace: true,
        search: (currentSearch) => applySearchPatch(currentSearch, { primary: null }),
        to: "/logo/iso",
      });
      await settleRouterRender();
    });

    const searchParams = new URLSearchParams(router.state.location.searchStr);

    expect(router.state.location.pathname).toBe("/logo/iso");
    expect(searchParams.has("primary")).toBe(false);
  });

  it("retains the root theme mode across logo route search updates", async () => {
    const router = await renderRoute(
      buildPathWithTanStackSearch({
        pathname: "/logo",
        search: {
          light: true,
          rot: "10",
        },
      }),
    );

    await act(async () => {
      await router.navigate({
        replace: true,
        search: {},
        to: "/logo/iso",
      });
      await settleRouterRender();
    });

    const searchParams = new URLSearchParams(router.state.location.searchStr);

    expect(router.state.location.pathname).toBe("/logo/iso");
    expect(searchParams.has("dev")).toBe(false);
    expect(searchParams.has("light")).toBe(true);
    expect(searchParams.has("dark")).toBe(false);
  });

  it("retains the root dev flag across public route navigation", async () => {
    const router = await renderRoute(
      buildPathWithTanStackSearch({
        pathname: "/",
        search: {
          dev: true,
        },
      }),
    );

    await act(async () => {
      await router.navigate({
        search: {},
        to: "/terms",
      });
      await settleRouterRender();
    });

    expect(router.state.location.pathname).toBe("/terms");
    expect(router.state.location.searchStr).toBe(stringifyTanStackSearch({ dev: true }));
  });

  it("retains the explicit striped logo left face across logo to dashboard navigation", async () => {
    const router = await renderRoute(
      buildPathWithTanStackSearch({
        pathname: "/logo",
        search: {
          leftFace: "striped",
          secondary: "amber-500",
        },
      }),
    );

    await act(async () => {
      await router.navigate({
        to: "/vault",
      });
      await settleRouterRender();
    });

    const searchParams = new URLSearchParams(router.state.location.searchStr);

    expect(router.state.location.pathname).toBe("/vault");
    expect(searchParams.get("leftFace")).toBe("striped");
    expect(searchParams.get("secondary")).toBe("amber-500");
  });

  it("redirects iso renderer params away from non-iso logo routes on load", async () => {
    const router = await renderRoute("/logo?isoStyle=shaded-edge");

    expect(router.state.location.pathname).toBe("/logo");
    expect(new URLSearchParams(router.state.location.searchStr).has("isoStyle")).toBe(false);
  });

  it("keeps iso renderer params on the iso route on load", async () => {
    const router = await renderRoute("/logo/iso?isoStyle=shaded-edge&isoSide=40");

    const searchParams = new URLSearchParams(router.state.location.searchStr);

    expect(router.state.location.pathname).toBe("/logo/iso");
    expect(searchParams.get("isoStyle")).toBe("shaded-edge");
    expect(searchParams.get("isoSide")).toBe("40");
  });

  it("redirects machine params away from /vault on load", async () => {
    const router = await renderRoute("/vault?machineId=sample-machine&prod-ui");

    const searchParams = new URLSearchParams(router.state.location.searchStr);

    expect(router.state.location.pathname).toBe("/vault");
    expect(searchParams.has("machineId")).toBe(false);
    expect(searchParams.has("prod-ui")).toBe(true);
  });

  it("keeps the global swipe debug flag on public routes", async () => {
    const router = await renderRoute("/privacy?swipe-debug");

    expect(router.state.location.pathname).toBe("/privacy");
    expect(new URLSearchParams(router.state.location.searchStr).has("swipe-debug")).toBe(true);
  });

  it("renders MCP consent through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/oauth/mcp/consent?mcp_consent_request=mcpar_test");

    expect(rootElement?.querySelector('[data-testid="mcp-consent-page"]')?.textContent).toBe(
      "MCP consent page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders pricing through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/pricing?checkout=success");

    expect(rootElement?.querySelector('[data-testid="pricing-page"]')?.textContent).toBe(
      "Pricing page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders connect repository through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/connect-repo");

    expect(rootElement?.querySelector('[data-testid="connect-repository-page"]')?.textContent).toBe(
      "Connect repository page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("accepts a trailing slash on the promoted pricing route", async () => {
    await renderRoute("/pricing/");

    expect(rootElement?.querySelector('[data-testid="pricing-page"]')?.textContent).toBe(
      "Pricing page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("accepts a trailing slash on the promoted connect repository route", async () => {
    await renderRoute("/connect-repo/");

    expect(rootElement?.querySelector('[data-testid="connect-repository-page"]')?.textContent).toBe(
      "Connect repository page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders new app through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/new-app");

    expect(rootElement?.querySelector('[data-testid="new-app-page"]')?.textContent).toBe(
      "New app page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("accepts a trailing slash on the promoted new app route", async () => {
    await renderRoute("/new-app/");

    expect(rootElement?.querySelector('[data-testid="new-app-page"]')?.textContent).toBe(
      "New app page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders providers through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/providers");

    expect(rootElement?.querySelector('[data-testid="providers-page"]')?.textContent).toBe(
      "Providers page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("accepts a trailing slash on the promoted providers route", async () => {
    await renderRoute("/providers/");

    expect(rootElement?.querySelector('[data-testid="providers-page"]')?.textContent).toBe(
      "Providers page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders machines through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/machines?machineId=machine-123");

    expect(rootElement?.querySelector('[data-testid="machines-page"]')?.textContent).toBe(
      "Machines page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders machine connect through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/machines/connect?requestId=req_123");

    expect(rootElement?.querySelector('[data-testid="machine-connect-page"]')?.textContent).toBe(
      "Machine connect page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders landing preview through an explicit route", async () => {
    await renderRoute("/landing-preview");

    expect(
      rootElement?.querySelector('[data-testid="landing-markdown-preview-page"]')?.textContent,
    ).toContain("Landing markdown preview page");
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders localStorage through an explicit route with the shared app workspace shell", async () => {
    await renderRoute("/localStorage");

    expect(
      rootElement?.querySelector('[data-testid="local-storage-sidebar-file"]')?.textContent,
    ).toBe("/localStorage");
    expect(rootElement?.querySelector('[data-testid="app-workspace"]')).not.toBeNull();
    expect(appWorkspaceMountMock).toHaveBeenCalledTimes(1);
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders indexedDB through an explicit route with the shared app workspace shell", async () => {
    await renderRoute("/indexDB");

    expect(rootElement?.querySelector('[data-testid="indexed-db-sidebar-file"]')?.textContent).toBe(
      "/indexDB",
    );
    expect(rootElement?.querySelector('[data-testid="app-workspace"]')).not.toBeNull();
    expect(appWorkspaceMountMock).toHaveBeenCalledTimes(1);
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("keeps browser storage hover inert and navigates on click", async () => {
    const router = await renderRoute("/localStorage");
    const indexedDbLink = rootElement?.querySelector<HTMLAnchorElement>(
      '[data-testid="indexed-db-sidebar-file"]',
    );
    if (!indexedDbLink) {
      throw new Error("Expected indexedDB sidebar link.");
    }

    await act(async () => {
      indexedDbLink.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await settleRouterRender();
    });

    expect(router.latestLocation.href).toBe("/localStorage");

    await act(async () => {
      indexedDbLink.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          button: 0,
          cancelable: true,
        }),
      );
      await settleRouterRender();
    });

    expect(router.latestLocation.href).toBe("/indexDB");

    await act(async () => {
      router.history.back();
      await settleRouterRender();
    });

    expect(router.latestLocation.href).toBe("/localStorage");
  });

  it("keeps the app left pane mounted for logo lab routes without route chrome", async () => {
    await renderRoute("/logo/svg");

    expect(rootElement?.querySelector('[data-testid="logo-svg-page"]')?.textContent).toBe(
      "Logo SVG page",
    );
    expect(rootElement?.querySelector('[data-testid="app-workspace-left-pane"]')).not.toBeNull();
  });

  it("accepts the Romanian landing preview query on the explicit route", async () => {
    await renderRoute("/landing-preview?lang=ro");

    expect(
      rootElement?.querySelector('[data-testid="landing-markdown-preview-page"]')?.textContent,
    ).toContain("Landing markdown preview page");
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("accepts a trailing slash on the promoted machines route", async () => {
    await renderRoute("/machines/");

    expect(rootElement?.querySelector('[data-testid="machines-page"]')?.textContent).toBe(
      "Machines page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("accepts a trailing slash on the promoted machine connect route", async () => {
    await renderRoute("/machines/connect/");

    expect(rootElement?.querySelector('[data-testid="machine-connect-page"]')?.textContent).toBe(
      "Machine connect page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("redirects the disabled codespace chat route back to the vault view", async () => {
    const router = await renderRoute("/vault/samebase/samebase/codespace/main/chat");

    await act(async () => {
      await settleRouterRender();
    });

    expect(router.state.location.pathname).toBe("/vault/samebase/samebase/fs/main");
    expect(rootElement?.querySelector('[data-testid="codespace-chat-page"]')).toBeNull();
    expect(rootElement?.querySelector('[data-testid="file-view-page"]')).not.toBeNull();
  });

  it("renders the generic vault route through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/vault/samebase/samebase/fs/main/README.md");

    expect(rootElement?.querySelector('[data-testid="file-view-page"]')?.textContent).toBe(
      "File view page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders the bare vault route through the dashboard route", async () => {
    await renderRoute("/vault/samebase/samebase");

    await act(async () => {
      await settleRouterRender();
    });

    expect(rootElement?.querySelector('[data-testid="dashboard-route"]')?.textContent).toBe(
      "samebase/samebase",
    );
    expect(rootElement?.querySelector('[data-testid="file-view-page"]')).toBeNull();
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders the vault database route through the database route", async () => {
    await renderRoute("/vault/samebase/samebase/db/main/root");

    expect(rootElement?.querySelector('[data-testid="vault-database-page"]')?.textContent).toBe(
      "Vault database page",
    );
    expect(rootElement?.querySelector('[data-testid="file-view-page"]')).toBeNull();
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders /test through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/test");

    expect(rootElement?.querySelector('[data-testid="root-test-route"]')?.textContent).toBe("Test");
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders local-only routes as not found in deployed route environments", async () => {
    vi.stubEnv("VITE_SAMEBASE_ROUTE_ENVIRONMENT", "production");

    await renderRoute("/test");

    expect(rootElement?.querySelector('[data-testid="not-found-route"]')?.textContent).toBe(
      "Not found route",
    );
    expect(rootElement?.querySelector('[data-testid="root-test-route"]')).toBeNull();
  });

  it("renders the root not-found route for unresolved paths", async () => {
    await renderRoute("/missing");

    expect(rootElement?.querySelector('[data-testid="not-found-route"]')?.textContent).toBe(
      "Not found route",
    );
  });
});
