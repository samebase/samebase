// @vitest-environment jsdom

import * as React from "react";
import { type ViewerOrganization } from "@/lib/organizationContext";
import { type WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { ConvexError } from "convex/values";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Id } from "../../convex/_generated/dataModel";

const { appWorkspaceMountMock, appWorkspaceUnmountMock, useConvexAuthMock } = vi.hoisted(() => ({
  appWorkspaceMountMock: vi.fn(),
  appWorkspaceUnmountMock: vi.fn(),
  useConvexAuthMock: vi.fn(),
}));
const routeErrorState = vi.hoisted(
  (): { providerError: Error | null; termsError: Error | null } => ({
    providerError: null,
    termsError: null,
  }),
);

vi.mock("@/components/RootIndexRoutePage", () => ({
  RootIndexRoutePage: () => <div data-testid="root-index-route">Root index route</div>,
}));

vi.mock("@/components/DashboardRoutePage", () => ({
  DashboardRoutePage: ({
    organizationOwner,
    page = "overview",
    selectedRepositoryFullName,
  }: {
    organizationOwner?: string;
    page?: "overview" | "settings";
    selectedRepositoryFullName?: string;
  }) => (
    <div data-testid="dashboard-route" data-owner={organizationOwner} data-page={page}>
      {selectedRepositoryFullName ?? "Dashboard route"}
    </div>
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
  TermsOfServicePage: () => {
    if (routeErrorState.termsError) {
      throw routeErrorState.termsError;
    }

    return <div data-testid="terms-page">Terms page</div>;
  },
}));

vi.mock("@/components/PrivacyPolicyPage", () => ({
  PrivacyPolicyPage: () => <div data-testid="privacy-page">Privacy policy page</div>,
}));

vi.mock("@/components/AuthenticatedAppRoutePage", () => ({
  AuthenticatedAppRoutePage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AuthenticatedUserRoutePage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

vi.mock("@/components/AgentsConnectRoutePage", () => ({
  AgentsConnectRoutePage: () => <div data-testid="agents-connect-page">Agents connect page</div>,
}));

vi.mock("@/components/ConnectRepository", () => ({
  ConnectRepository: ({ organization }: { organization: ViewerOrganization }) => (
    <div data-testid="connect-repository-page" data-owner={organization.githubOwnerLogin}>
      Connect repository page
    </div>
  ),
}));

vi.mock("@/components/ConnectOrganizationPage", () => ({
  ConnectOrganizationPage: () => (
    <div data-testid="connect-organization-page">Connect organization page</div>
  ),
}));

vi.mock("@/components/NewAppPage", () => ({
  NewAppPage: ({ organization }: { organization: ViewerOrganization }) => (
    <div data-testid="new-app-page" data-owner={organization.githubOwnerLogin}>
      New app page
    </div>
  ),
}));

vi.mock("@/components/ProviderConnectionsPage", () => ({
  ProviderConnectionsPage: ({ organization }: { organization: ViewerOrganization }) => {
    if (routeErrorState.providerError) {
      throw routeErrorState.providerError;
    }

    return (
      <div data-testid="providers-page" data-owner={organization.githubOwnerLogin}>
        Providers page
      </div>
    );
  },
}));

vi.mock("@/components/OrganizationRouteBoundary", () => ({
  AuthenticatedOrganizationRoutePage: ({
    children,
    owner,
  }: {
    children: (organization: ViewerOrganization) => React.ReactNode;
    owner: string;
  }) => {
    const normalizedOwner = owner.toLowerCase();
    if (normalizedOwner !== "samebase" && normalizedOwner !== "acme") {
      return <div data-testid="organization-unavailable">Organization unavailable</div>;
    }
    // @ts-expect-error Convex ids are strings at runtime; this test only needs
    // stable values for client route selection.
    const organizationId: Id<"organizations"> = `organization_${normalizedOwner}`;
    return children({
      canCreateRepository: true,
      githubOwnerId: organizationId,
      githubOwnerLogin: normalizedOwner,
      githubOwnerType: "organization",
      organizationId,
      role: "owner",
    });
  },
}));

vi.mock("@/components/UserSettingsPage", () => ({
  UserSettingsPage: () => <div data-testid="settings-page">Settings page</div>,
}));

vi.mock("@/components/OrganizationSettingsPage", () => ({
  OrganizationSettingsPage: ({ organization }: { organization: ViewerOrganization }) => (
    <div data-testid="organization-settings-page" data-owner={organization.githubOwnerLogin}>
      Organization settings page
    </div>
  ),
}));

vi.mock("@/components/LandingPreviewPage", () => ({
  DocsCloudflareSetupPage: () => (
    <div data-testid="docs-cloudflare-setup-page">Docs Cloudflare setup page</div>
  ),
  DocsDoItYourselfPage: () => (
    <div data-testid="docs-do-it-yourself-page">Docs do it yourself page</div>
  ),
  DocsPricingPage: () => <div data-testid="docs-pricing-page">Docs pricing page</div>,
  LandingPreviewPage: () => <div data-testid="landing-preview-page">Landing preview page</div>,
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

vi.mock("@/components/logo/LogoMengerDepthTransitionPage", () => ({
  LogoMengerDepthTransitionPage: ({
    mode,
    routeSearch,
  }: {
    mode?: "hover" | "transition";
    routeSearch: {
      depth?: number;
      elev?: number;
      primary?: string;
      probe?: true;
      probeHeight?: number;
      probeLanding?: true;
      probeLoop?: number;
      probePath?: string;
      probePathVisible?: true;
      probeOffset?: number;
      probeRest?: number;
      probeStart?: number;
      probeWidth?: number;
      rot?: number;
      tilt?: true;
      tiltRadius?: number;
      tiltStrength?: number;
    };
  }) => (
    <div
      data-depth={routeSearch.depth}
      data-elevation={routeSearch.elev}
      data-primary={routeSearch.primary}
      data-probe={routeSearch.probe ? "true" : "false"}
      data-probe-height={routeSearch.probeHeight}
      data-probe-landing={routeSearch.probeLanding ? "true" : "false"}
      data-probe-loop={routeSearch.probeLoop}
      data-probe-path={routeSearch.probePath}
      data-probe-path-visible={routeSearch.probePathVisible ? "true" : "false"}
      data-probe-offset={routeSearch.probeOffset}
      data-probe-rest={routeSearch.probeRest}
      data-probe-start={routeSearch.probeStart}
      data-probe-width={routeSearch.probeWidth}
      data-rotation={routeSearch.rot}
      data-tilt={routeSearch.tilt ? "true" : "false"}
      data-tilt-radius={routeSearch.tiltRadius}
      data-tilt-strength={routeSearch.tiltStrength}
      data-testid={
        mode === "hover" ? "logo-menger-hover-page" : "logo-menger-depth-transition-page"
      }
    >
      Menger depth transition page
    </div>
  ),
}));

vi.mock("@/components/logo/LogoSierpinskiCarpetHoverPage", () => ({
  LogoSierpinskiCarpetHoverPage: ({
    routeSearch,
  }: {
    routeSearch: {
      depth?: number;
      mechanic?: string;
      primary?: string;
      radius?: number;
    };
  }) => (
    <div
      data-depth={routeSearch.depth}
      data-mechanic={routeSearch.mechanic}
      data-primary={routeSearch.primary}
      data-radius={routeSearch.radius}
      data-testid="logo-carpet-hover-page"
    >
      Carpet hover page
    </div>
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
    routeErrorState.providerError = null;
    routeErrorState.termsError = null;
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
    document.querySelector("script[data-react-scan-loader]")?.remove();
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

  it("keeps the original billing query error inside the app workspace", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const billingError = new ConvexError(
      "This organization needs more paid member seats. Billing and member management are still available.",
    );
    routeErrorState.providerError = billingError;

    const router = await renderRoute("/org/samebase/providers");

    expect(rootElement?.querySelector('[data-testid="app-workspace"]')).not.toBeNull();
    expect(appWorkspaceMountMock).toHaveBeenCalledTimes(1);
    expect(rootElement?.textContent).toContain("Page could not load");
    expect(rootElement?.textContent).not.toContain("App Recovery");
    expect(rootElement?.textContent).not.toContain("Billing and member management");
    expect(consoleError).toHaveBeenCalledWith("Route failure", billingError, expect.any(Object));

    routeErrorState.providerError = null;
    await act(async () => {
      await router.navigate({
        search: { "prod-ui": true },
        to: "/org/$owner/providers",
        params: { owner: "samebase" },
      });
      await settleRouterRender();
    });

    expect(rootElement?.querySelector('[data-testid="providers-page"]')?.textContent).toBe(
      "Providers page",
    );
    expect(appWorkspaceMountMock).toHaveBeenCalledTimes(1);
    expect(appWorkspaceUnmountMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  it("keeps stale app-file failures on the app recovery path", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    routeErrorState.termsError = new Error("Failed to fetch dynamically imported module");

    await renderRoute("/terms");

    expect(rootElement?.textContent).toContain("App Recovery");
    expect(rootElement?.textContent).not.toContain("Page could not load");
    consoleError.mockRestore();
    consoleWarn.mockRestore();
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

  it("renders the React Scan hook and loader when the development tools flag is present", async () => {
    await renderRoute("/?devtools");

    const reactScanHook = document.querySelector(
      'script[src="https://unpkg.com/react-scan@0.5.7/dist/install-hook.global.js"]',
    );
    const reactScanScript = document.querySelector(
      'script[src="https://unpkg.com/react-scan@0.5.7/dist/auto.global.js"]',
    );

    expect(reactScanHook?.getAttribute("integrity")).toBe(
      "sha384-gtx085UgMdaRetpZlCm2iy6u+Te8ZsKK0xhjG8ybjt2JfW7adJJf0gfOFkAjC0dK",
    );
    expect(reactScanScript?.getAttribute("integrity")).toBe(
      "sha384-DDZCsimcjpG92OUulxf7DHi4rGS/fNIW7lC5DT8+5ftaTDiUKfzIq+pDTUbPjC86",
    );
    expect(reactScanScript?.getAttribute("crossorigin")).toBe("anonymous");
    expect(reactScanScript?.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("does not load React Scan without the development tools flag", async () => {
    await renderRoute("/");

    expect(
      document.querySelector('script[src^="https://unpkg.com/react-scan@0.5.7/dist/"]'),
    ).toBeNull();
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

    await act(async () => {
      await settleRouterRender();
    });

    const dashboardRoute = rootElement?.querySelector('[data-testid="dashboard-route"]');
    expect(dashboardRoute?.textContent).toBe("Dashboard route");
    expect(dashboardRoute?.getAttribute("data-page")).toBe("overview");
    expect(rootElement?.querySelector('[data-testid="root-index-route"]')).toBeNull();
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
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
    const searchParams = new window.URLSearchParams(router.state.location.searchStr);

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

  it("does not keep the removed /home route", async () => {
    await renderRoute("/home?delete");

    expect(rootElement?.querySelector('[data-testid="not-found-route"]')?.textContent).toBe(
      "Not found route",
    );
    expect(rootElement?.querySelector('[data-testid="dashboard-route"]')).toBeNull();
  });

  it("renders logo routes through explicit public routes", async () => {
    const router = await renderRoute("/logo");

    expect(rootElement?.querySelector('[data-testid="logo-page"]')?.textContent).toBe("three");
    expect(new window.URLSearchParams(router.state.location.searchStr).has("dev")).toBe(false);
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
    const searchParams = new window.URLSearchParams(router.state.location.searchStr);

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

    const searchParams = new window.URLSearchParams(router.state.location.searchStr);

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

    const searchParams = new window.URLSearchParams(router.state.location.searchStr);

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

    const searchParams = new window.URLSearchParams(router.state.location.searchStr);

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

    const searchParams = new window.URLSearchParams(router.state.location.searchStr);

    expect(router.state.location.pathname).toBe("/vault");
    expect(searchParams.get("leftFace")).toBe("striped");
    expect(searchParams.get("secondary")).toBe("amber-500");
  });

  it("redirects iso renderer params away from non-iso logo routes on load", async () => {
    const router = await renderRoute("/logo?isoStyle=shaded-edge");

    expect(router.state.location.pathname).toBe("/logo");
    expect(new window.URLSearchParams(router.state.location.searchStr).has("isoStyle")).toBe(false);
  });

  it("keeps iso renderer params on the iso route on load", async () => {
    const router = await renderRoute("/logo/iso?isoStyle=shaded-edge&isoSide=40");

    const searchParams = new window.URLSearchParams(router.state.location.searchStr);

    expect(router.state.location.pathname).toBe("/logo/iso");
    expect(searchParams.get("isoStyle")).toBe("shaded-edge");
    expect(searchParams.get("isoSide")).toBe("40");
  });

  it("redirects unknown params away from /vault on load", async () => {
    const router = await renderRoute("/vault?stale=1&prod-ui");

    const searchParams = new window.URLSearchParams(router.state.location.searchStr);

    expect(router.state.location.pathname).toBe("/vault");
    expect(searchParams.has("stale")).toBe(false);
    expect(searchParams.has("prod-ui")).toBe(true);
  });

  it("retains prod-ui mode across vault navigation", async () => {
    const router = await renderRoute("/vault?prod-ui");

    await act(async () => {
      await router.navigate({
        search: {},
        to: "/vault/$owner/$repo/settings",
        params: { owner: "samebase", repo: "samebase" },
      });
      await settleRouterRender();
    });

    expect(router.state.location.pathname).toBe("/vault/samebase/samebase/settings");
    expect(new window.URLSearchParams(router.state.location.searchStr).has("prod-ui")).toBe(true);
  });

  it("keeps the global swipe debug flag on public routes", async () => {
    const router = await renderRoute("/privacy?swipe-debug");

    expect(router.state.location.pathname).toBe("/privacy");
    expect(new window.URLSearchParams(router.state.location.searchStr).has("swipe-debug")).toBe(
      true,
    );
  });

  it("renders MCP consent through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/oauth/mcp/consent?mcp_consent_request=mcpar_test");

    expect(rootElement?.querySelector('[data-testid="mcp-consent-page"]')?.textContent).toBe(
      "MCP consent page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders agent browser handoff through an explicit TanStack route", async () => {
    await renderRoute("/agents/connect");

    expect(rootElement?.querySelector('[data-testid="agents-connect-page"]')?.textContent).toBe(
      "Agents connect page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("accepts a trailing slash on the agent browser handoff route", async () => {
    await renderRoute("/agents/connect/");

    expect(rootElement?.querySelector('[data-testid="agents-connect-page"]')?.textContent).toBe(
      "Agents connect page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders pricing through an explicit TanStack route instead of the App fallback", async () => {
    await renderRoute("/pricing");

    expect(rootElement?.querySelector('[data-testid="docs-pricing-page"]')?.textContent).toBe(
      "Docs pricing page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("accepts a trailing slash on the promoted pricing route", async () => {
    await renderRoute("/pricing/");

    expect(rootElement?.querySelector('[data-testid="docs-pricing-page"]')?.textContent).toBe(
      "Docs pricing page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("redirects the organization index to its vault list and keeps search params", async () => {
    const router = await renderRoute("/org/Samebase?devtools&prod-ui");
    const searchParams = new window.URLSearchParams(router.state.location.searchStr);

    expect(router.state.location.pathname).toBe("/org/samebase/vaults");
    expect(router.history.canGoBack()).toBe(false);
    expect(searchParams.has("devtools")).toBe(true);
    expect(searchParams.has("prod-ui")).toBe(true);
  });

  it.each([
    ["vaults", "/org/Samebase/vaults", "dashboard-route"],
    ["providers", "/org/Samebase/providers", "providers-page"],
    ["new app", "/org/Samebase/new-app", "new-app-page"],
    ["connect repository", "/org/Samebase/connect-repo", "connect-repository-page"],
    ["organization settings", "/org/Samebase/settings", "organization-settings-page"],
  ])("renders the organization %s route with its resolved owner", async (_name, path, testId) => {
    await renderRoute(path);

    expect(
      rootElement?.querySelector(`[data-testid="${testId}"]`)?.getAttribute("data-owner"),
    ).toBe("samebase");
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders organization connection through a global route", async () => {
    await renderRoute("/connect-organization");

    expect(
      rootElement?.querySelector('[data-testid="connect-organization-page"]')?.textContent,
    ).toBe("Connect organization page");
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("keeps an unavailable organization URL and shows the unavailable state", async () => {
    const router = await renderRoute("/org/stale/providers?prod-ui");

    expect(router.state.location.pathname).toBe("/org/stale/providers");
    expect(
      rootElement?.querySelector('[data-testid="organization-unavailable"]')?.textContent,
    ).toBe("Organization unavailable");
  });

  it.each(["/providers", "/new-app", "/connect-repo"])(
    "does not register the retired route %s",
    async (path) => {
      await renderRoute(path);

      expect(rootElement?.querySelector('[data-testid="not-found-route"]')).not.toBeNull();
    },
  );

  it("renders Settings through an explicit TanStack route", async () => {
    await renderRoute("/settings");

    expect(rootElement?.querySelector('[data-testid="settings-page"]')?.textContent).toBe(
      "Settings page",
    );
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders landing preview through an explicit route", async () => {
    await renderRoute("/landing-preview");

    expect(
      rootElement?.querySelector('[data-testid="landing-preview-page"]')?.textContent,
    ).toContain("Landing preview page");
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("passes shared logo search state to the Menger transition research route", async () => {
    await renderRoute("/logo/transition/menger?elev=0&primary=emerald-500&rot=0");

    const page = rootElement?.querySelector('[data-testid="logo-menger-depth-transition-page"]');
    expect(page?.getAttribute("data-elevation")).toBe("0");
    expect(page?.getAttribute("data-primary")).toBe("emerald-500");
    expect(page?.getAttribute("data-rotation")).toBe("0");
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("passes shared logo search state to the Menger hover research route", async () => {
    await renderRoute(
      "/logo/hover/menger?depth=99&elev=0&primary=emerald-500&probe&probeHeight=0.7&probeLanding&probeLoop=7&probePath=orbit&probePathVisible&probeOffset=-0.4&probeRest=2&probeStart=0.6&probeWidth=0.4&rot=0&tilt&tiltRadius=1.2&tiltStrength=1.5",
    );

    const page = rootElement?.querySelector('[data-testid="logo-menger-hover-page"]');
    expect(page?.getAttribute("data-depth")).toBe("5");
    expect(page?.getAttribute("data-elevation")).toBe("0");
    expect(page?.getAttribute("data-primary")).toBe("emerald-500");
    expect(page?.getAttribute("data-probe")).toBe("true");
    expect(page?.getAttribute("data-probe-height")).toBe("0.7");
    expect(page?.getAttribute("data-probe-landing")).toBe("true");
    expect(page?.getAttribute("data-probe-loop")).toBe("7");
    expect(page?.getAttribute("data-probe-path")).toBe("orbit");
    expect(page?.getAttribute("data-probe-path-visible")).toBe("true");
    expect(page?.getAttribute("data-probe-offset")).toBe("-0.4");
    expect(page?.getAttribute("data-probe-rest")).toBe("2");
    expect(page?.getAttribute("data-probe-start")).toBe("0.6");
    expect(page?.getAttribute("data-probe-width")).toBe("0.4");
    expect(page?.getAttribute("data-rotation")).toBe("0");
    expect(page?.getAttribute("data-tilt")).toBe("true");
    expect(page?.getAttribute("data-tilt-radius")).toBe("1.2");
    expect(page?.getAttribute("data-tilt-strength")).toBe("1.5");
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("passes shared logo search state to the carpet hover research route", async () => {
    await renderRoute("/logo/hover/carpet?primary=emerald-500&mechanic=slide&radius=0.5&depth=9");

    const page = rootElement?.querySelector('[data-testid="logo-carpet-hover-page"]');
    expect(page?.getAttribute("data-primary")).toBe("emerald-500");
    expect(page?.getAttribute("data-mechanic")).toBe("slide");
    expect(page?.getAttribute("data-radius")).toBe("0.5");
    expect(page?.getAttribute("data-depth")).toBe("6");
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders the do-it-yourself landing guide through an explicit route", async () => {
    await renderRoute("/docs/do-it-yourself");

    expect(
      rootElement?.querySelector('[data-testid="docs-do-it-yourself-page"]')?.textContent,
    ).toContain("Docs do it yourself page");
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders the first-app Cloudflare setup guide through an explicit route", async () => {
    await renderRoute("/docs/cloudflare-setup");

    expect(
      rootElement?.querySelector('[data-testid="docs-cloudflare-setup-page"]')?.textContent,
    ).toContain("Docs Cloudflare setup page");
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

  it("ignores the obsolete language query on the landing preview route", async () => {
    await renderRoute("/landing-preview?lang=ro");

    expect(
      rootElement?.querySelector('[data-testid="landing-preview-page"]')?.textContent,
    ).toContain("Landing preview page");
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
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

    const dashboardRoute = rootElement?.querySelector('[data-testid="dashboard-route"]');
    expect(dashboardRoute?.textContent).toBe("samebase/samebase");
    expect(dashboardRoute?.getAttribute("data-page")).toBe("overview");
    expect(rootElement?.querySelector('[data-testid="file-view-page"]')).toBeNull();
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders canonical vault settings through the dashboard route", async () => {
    await renderRoute("/vault/samebase/samebase/settings");

    await act(async () => {
      await settleRouterRender();
    });

    const dashboardRoute = rootElement?.querySelector('[data-testid="dashboard-route"]');
    expect(dashboardRoute?.textContent).toBe("samebase/samebase");
    expect(dashboardRoute?.getAttribute("data-page")).toBe("settings");
    expect(rootElement?.querySelector('[data-testid="not-found-route"]')).toBeNull();
  });

  it("renders the vault database route through the database route", async () => {
    await renderRoute("/vault/samebase/samebase/db/main/project/convex-attachment");

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
