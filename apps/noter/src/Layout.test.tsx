import { TestRouterProvider } from "@/test/TestRouterProvider";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import {
  LANDING_DEV_MODE_DISABLE_LINK_LABEL,
  LANDING_DEV_MODE_LINK_LABEL,
  LANDING_DEV_MODE_QUERY_PARAM,
} from "@/lib/landingDevMode";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";
import { Layout, PublicLayoutShell } from "./Layout";

const { useConvexAuthMock } = vi.hoisted(() => ({
  useConvexAuthMock: vi.fn(),
}));

function encodeStaticHref(path: string): string {
  return path.split("&").join("&amp;");
}

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useConvexAuth: useConvexAuthMock,
  };
});

vi.mock("@/lib/rootRouteSearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rootRouteSearch")>();

  return {
    ...actual,
    useRootRouteSearch: () => ({}),
  };
});

describe("Layout", () => {
  afterEach(() => {
    useConvexAuthMock.mockReset();
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
    expect(markup).toContain(LANDING_DEV_MODE_LINK_LABEL);
    expect(markup).not.toContain(LANDING_DEV_MODE_DISABLE_LINK_LABEL);
    expect(markup).toContain('style="width:160px"');
    expect(markup).not.toContain('aria-label="Toggle Left Sidebar"');
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

  it("places public rail links on the mobile carousel peek edge", () => {
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
    const logoLinkIndex = markup.indexOf("/logo");
    const homeLinkIndex = markup.indexOf("/home");
    const termsLinkIndex = markup.indexOf("/terms");
    const privacyLinkIndex = markup.indexOf("/privacy");

    expect(devShortcutIndex).toBeGreaterThanOrEqual(0);
    expect(devShortcutIndex).toBeLessThan(logoLinkIndex);
    expect(logoLinkIndex).toBeLessThan(homeLinkIndex);
    expect(homeLinkIndex).toBeLessThan(termsLinkIndex);
    expect(termsLinkIndex).toBeLessThan(privacyLinkIndex);
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
