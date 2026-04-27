import { TestRouterProvider } from "@/test/TestRouterProvider";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import { PUBLIC_RIGHT_SIDEBAR_ROUTE_URL_HEADER_TEST_ID } from "@/components/PublicRightSidebar";
import {
  LANDING_DEV_MODE_DISABLE_LINK_LABEL,
  LANDING_DEV_MODE_LINK_LABEL,
  LANDING_DEV_MODE_QUERY_PARAM,
} from "@/lib/landingDevMode";
import {
  FORCE_PROD_UI_MODE_LINK_LABEL,
  FORCE_PROD_UI_QUERY_PARAM,
} from "@/lib/prodUiMode";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";
import { MACHINE_CONNECT_ROUTE, MACHINES_ROUTE } from "@/lib/noterSync";
import { Layout, PublicLayoutShell } from "./Layout";

const {
  signInWithGoogleMock,
  signInWithPasswordMock,
  useConvexAuthMock,
  useQueryMock,
} = vi.hoisted(() => ({
  signInWithGoogleMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  useConvexAuthMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

function encodeStaticHref(path: string): string {
  return path.split("&").join("&amp;");
}

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useConvexAuth: useConvexAuthMock,
    useQuery: useQueryMock,
  };
});

// Keep the public shell tests on the normal browser auth path while stubbing
// the sign-in actions that the sidebar buttons expose.
vi.mock("@/authClient", () => ({
  isInIframe: () => false,
  openAuthPopup: vi.fn(),
  useNoterSignInActions: () => ({
    signInWithGoogle: signInWithGoogleMock,
    signInWithPassword: signInWithPasswordMock,
  }),
}));

vi.mock("@/lib/rootRouteSearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rootRouteSearch")>();

  return {
    ...actual,
    useRootRouteSearch: () => ({}),
  };
});

describe("Layout", () => {
  afterEach(() => {
    signInWithGoogleMock.mockReset();
    signInWithPasswordMock.mockReset();
    useConvexAuthMock.mockReset();
    useQueryMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("keeps landing legal links visible while auth is still loading", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    useConvexAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <Layout>
          <PublicLayoutShell>
            <div>landing</div>
          </PublicLayoutShell>
        </Layout>
      </TestRouterProvider>,
    );

    expect(markup).toContain("/terms");
    expect(markup).toContain("/privacy");
    expect(markup).toContain("/logo");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain("text-background");
    expect(markup).toContain("/home");
    expect(markup).not.toContain("/pricing");
    expect(markup).toContain(LANDING_DEV_MODE_LINK_LABEL);
    expect(markup).not.toContain(LANDING_DEV_MODE_DISABLE_LINK_LABEL);
    expect(markup).toContain(FORCE_PROD_UI_MODE_LINK_LABEL);
    expect(markup).toContain('data-testid="workspace-layout-v2-pane-right"');
    expect(markup).not.toContain('data-testid="workspace-layout-v2-pane-left"');
    expect(markup).not.toContain('aria-label="Toggle Left Sidebar"');
    expect(markup).not.toContain('aria-label="Toggle Right Sidebar"');
  });

  it("keeps the public shell sidebar toggle hidden", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <Layout>
          <PublicLayoutShell>
            <div>landing</div>
          </PublicLayoutShell>
        </Layout>
      </TestRouterProvider>,
    );

    expect(markup).not.toContain('aria-label="Toggle sidebar"');
  });

  it("places left public rail links on the mobile carousel peek edge", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    useConvexAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    const leftRailMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(leftRailMarkup).toContain("items-end");
    expect(leftRailMarkup).toContain("text-right");
    expect(leftRailMarkup).toContain("flex-row-reverse");
  });

  it("places right public rail links on the mobile carousel peek edge", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    useConvexAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    const rightRailMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <AppSidebarMetaSection side="right" />
      </TestRouterProvider>,
    );

    expect(rightRailMarkup).toContain("items-start");
    expect(rightRailMarkup).toContain("text-left");
    expect(rightRailMarkup).toContain("flex-row");
    expect(rightRailMarkup).not.toContain("flex-row-reverse");
  });

  it("keeps search-param shortcuts above a stable path list", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const landingDevPath = buildPathWithUpdatedQuery(
      { pathname: "/" },
      (searchParams) => {
        setQueryParam(searchParams, LANDING_DEV_MODE_QUERY_PARAM, true);
      },
    );

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[landingDevPath]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    const devShortcutIndex = markup.indexOf(
      LANDING_DEV_MODE_DISABLE_LINK_LABEL,
    );
    const prodUiShortcutIndex = markup.indexOf(FORCE_PROD_UI_MODE_LINK_LABEL);
    const logoLinkIndex = markup.indexOf("/logo");
    const homeLinkIndex = markup.indexOf("/home");
    const termsLinkIndex = markup.indexOf("/terms");
    const privacyLinkIndex = markup.indexOf("/privacy");

    expect(prodUiShortcutIndex).toBeGreaterThanOrEqual(0);
    expect(devShortcutIndex).toBeGreaterThanOrEqual(0);
    expect(prodUiShortcutIndex).toBeLessThan(devShortcutIndex);
    expect(devShortcutIndex).toBeLessThan(logoLinkIndex);
    expect(logoLinkIndex).toBeLessThan(homeLinkIndex);
    expect(homeLinkIndex).toBeLessThan(termsLinkIndex);
    expect(termsLinkIndex).toBeLessThan(privacyLinkIndex);
  });

  it("shows a route URL editor in the public sidebar header", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const landingDevPath = buildPathWithUpdatedQuery(
      { pathname: "/" },
      (searchParams) => {
        setQueryParam(searchParams, LANDING_DEV_MODE_QUERY_PARAM, true);
      },
    );

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[landingDevPath]}>
        <Layout>
          <PublicLayoutShell>
            <div>landing</div>
          </PublicLayoutShell>
        </Layout>
      </TestRouterProvider>,
    );

    expect(markup).toContain(
      `data-testid="${PUBLIC_RIGHT_SIDEBAR_ROUTE_URL_HEADER_TEST_ID}"`,
    );
    expect(markup).toContain('data-testid="route-url-display"');
    expect(markup).toContain('title="/?dev"');
    expect(markup).toContain(">/?dev</p>");
  });

  it("keeps the route URL editor out of the normal public sidebar", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <Layout>
          <PublicLayoutShell>
            <div>landing</div>
          </PublicLayoutShell>
        </Layout>
      </TestRouterProvider>,
    );

    expect(markup).not.toContain(
      `data-testid="${PUBLIC_RIGHT_SIDEBAR_ROUTE_URL_HEADER_TEST_ID}"`,
    );
    expect(markup).not.toContain('data-testid="route-url-display"');
  });

  it("opens the logo shortcut in dev mode without dropping root flags", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const landingProdUiPath = buildPathWithUpdatedQuery(
      { pathname: "/" },
      (searchParams) => {
        setQueryParam(searchParams, FORCE_PROD_UI_QUERY_PARAM, true);
      },
    );
    const logoDevPath = buildPathWithUpdatedQuery(
      { pathname: "/logo", search: FORCE_PROD_UI_QUERY_PARAM },
      (searchParams) => {
        setQueryParam(searchParams, LANDING_DEV_MODE_QUERY_PARAM, true);
      },
    );

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[landingProdUiPath]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(markup).toContain(`href="${encodeStaticHref(logoDevPath)}"`);
  });

  it("adds dev to the current URL without dropping other URL parts", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const logoPath = buildPathWithUpdatedQuery(
      { pathname: "/logo", search: "prod-ui", hash: "top" },
      (searchParams) => {
        setQueryParam(searchParams, LANDING_DEV_MODE_QUERY_PARAM, false);
      },
    );
    const logoWithDevPath = buildPathWithUpdatedQuery(
      { pathname: "/logo", search: "prod-ui", hash: "top" },
      (searchParams) => {
        setQueryParam(searchParams, LANDING_DEV_MODE_QUERY_PARAM, true);
      },
    );

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[logoPath]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(markup).toContain(LANDING_DEV_MODE_LINK_LABEL);
    expect(markup).not.toContain(LANDING_DEV_MODE_DISABLE_LINK_LABEL);
    expect(markup).toContain(`href="${encodeStaticHref(logoWithDevPath)}"`);
  });

  it("removes dev from the current URL without dropping other URL parts", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const logoDevPath = buildPathWithUpdatedQuery(
      { pathname: "/logo", search: "prod-ui&dev", hash: "top" },
      (searchParams) => {
        setQueryParam(searchParams, LANDING_DEV_MODE_QUERY_PARAM, true);
      },
    );
    const logoWithoutDevPath = buildPathWithUpdatedQuery(
      { pathname: "/logo", search: "prod-ui&dev", hash: "top" },
      (searchParams) => {
        setQueryParam(searchParams, LANDING_DEV_MODE_QUERY_PARAM, false);
      },
    );

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[logoDevPath]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(markup).toContain(LANDING_DEV_MODE_DISABLE_LINK_LABEL);
    expect(markup).not.toContain(`>${LANDING_DEV_MODE_LINK_LABEL}<`);
    expect(markup).toContain(`href="${encodeStaticHref(logoWithoutDevPath)}"`);
  });

  it("adds prod-ui to the current URL without dropping other URL parts", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const logoPath = buildPathWithUpdatedQuery(
      { pathname: "/logo", search: "dev", hash: "top" },
      (searchParams) => {
        setQueryParam(searchParams, FORCE_PROD_UI_QUERY_PARAM, false);
      },
    );
    const logoWithProdUiPath = buildPathWithUpdatedQuery(
      { pathname: "/logo", search: "dev", hash: "top" },
      (searchParams) => {
        setQueryParam(searchParams, FORCE_PROD_UI_QUERY_PARAM, true);
      },
    );

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[logoPath]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(markup).toContain(FORCE_PROD_UI_MODE_LINK_LABEL);
    expect(markup).toContain(`href="${encodeStaticHref(logoWithProdUiPath)}"`);
  });

  it("hides the prod-ui shortcut from the prod-like surface", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const logoProdUiPath = buildPathWithUpdatedQuery(
      { pathname: "/logo", search: "prod-ui&dev", hash: "top" },
      (searchParams) => {
        setQueryParam(searchParams, FORCE_PROD_UI_QUERY_PARAM, true);
      },
    );

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[logoProdUiPath]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(markup).not.toContain(`id="public-landing-prod-ui-toggle"`);
    expect(markup).not.toContain(`>${FORCE_PROD_UI_MODE_LINK_LABEL}<`);
    expect(markup).toContain(LANDING_DEV_MODE_DISABLE_LINK_LABEL);
  });

  it("hides the prod-ui shortcut on the production public host", () => {
    vi.stubGlobal("window", {
      location: {
        hostname: "noter.md",
      },
    });
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(markup).not.toContain(`id="public-landing-prod-ui-toggle"`);
    expect(markup).not.toContain(`>${FORCE_PROD_UI_MODE_LINK_LABEL}<`);
  });

  it("keeps legal links visible on non-root sign-in routes", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    useConvexAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/oauth/mcp/consent"]}>
        <Layout>
          <PublicLayoutShell>
            <div>consent</div>
          </PublicLayoutShell>
        </Layout>
      </TestRouterProvider>,
    );

    expect(markup).toContain("/terms");
    expect(markup).toContain("/privacy");
    expect(markup).toContain("/home");
    expect(markup).toContain("/logo");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('data-testid="workspace-layout-v2-pane-right"');
    expect(markup).not.toContain('data-testid="workspace-layout-v2-pane-left"');
  });

  it("keeps legal links and shows /home away from the plain root landing route", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    useConvexAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/machines"]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(markup).toContain("/terms");
    expect(markup).toContain("/privacy");
    expect(markup).toContain("/home");
    expect(markup).toContain("/logo");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('tabindex="-1"');
  });

  it("lets dashboard opt into machine route links in the plain path list", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    useConvexAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    const defaultMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );
    const dashboardMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <AppSidebarMetaSection showMachineLinks />
      </TestRouterProvider>,
    );
    const homeHref = 'href="/"';
    const machinesHref = `href="${MACHINES_ROUTE}"`;
    const machineConnectHref = `href="${MACHINE_CONNECT_ROUTE}"`;
    const termsHref = 'href="/terms"';

    expect(defaultMarkup).not.toContain(machinesHref);
    expect(defaultMarkup).not.toContain(machineConnectHref);
    expect(dashboardMarkup).toContain(machinesHref);
    expect(dashboardMarkup).toContain(machineConnectHref);
    expect(dashboardMarkup.indexOf(homeHref)).toBeLessThan(
      dashboardMarkup.indexOf(machinesHref),
    );
    expect(dashboardMarkup.indexOf(machineConnectHref)).toBeLessThan(
      dashboardMarkup.indexOf(termsHref),
    );
  });

  it("keeps legal links visible on the legal pages themselves", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    useConvexAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/terms"]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(markup).toContain("/terms");
    expect(markup).toContain("/privacy");
    expect(markup).toContain("/logo");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('tabindex="-1"');
  });

  it("renders children directly without auth-specific shell branching", () => {
    useConvexAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    const markup = renderToStaticMarkup(
      <Layout>
        <div>plain layout child</div>
      </Layout>,
    );

    expect(markup).toContain("plain layout child");
    expect(markup).not.toContain("/terms");
  });

  it("keeps Layout free of fixture-only test ids", () => {
    const markup = renderToStaticMarkup(
      <Layout>
        <div>fixture child</div>
      </Layout>,
    );

    expect(markup).toContain("fixture child");
    expect(markup).not.toContain("data-testid=");
  });
});
