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
  LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM,
  LANDING_MARKDOWN_PREVIEW_ROMANIAN_QUERY_LINK_LABEL,
  LANDING_MARKDOWN_PREVIEW_ROUTE,
} from "@/lib/landingMarkdownPreview";
import { LOCAL_STORAGE_ROUTE } from "@/lib/localStorageRoute";
import {
  FORCE_PROD_UI_MODE_LINK_LABEL,
  FORCE_PROD_UI_QUERY_PARAM,
} from "@/lib/prodUiMode";
import {
  SEARCH_RESET_LINK_LABEL,
  SEARCH_RESET_QUERY_PARAM,
} from "@/lib/searchReset";
import {
  ROOT_THEME_DARK_MODE_LINK_LABEL,
  ROOT_THEME_LIGHT_MODE_DISABLE_LINK_LABEL,
  ROOT_THEME_LIGHT_MODE_LINK_LABEL,
} from "@/lib/rootThemeModeSearch";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import type { WorkspaceSidebarState } from "../convex/workspaceSidebarStateModel";
import type { WorkspaceSidebarStateController } from "@/lib/workspaceSidebarStateController";
import { sanitizePublicLayoutSidebarState } from "@/lib/publicLayoutSidebarState";
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
    expect(markup).toContain(`id="public-local-storage-route-link"`);
    expect(markup).toContain(LOCAL_STORAGE_ROUTE);
    expect(markup).not.toContain("/pricing");
    expect(markup).toContain(LANDING_DEV_MODE_LINK_LABEL);
    expect(markup).not.toContain(LANDING_DEV_MODE_DISABLE_LINK_LABEL);
    expect(markup).toContain(FORCE_PROD_UI_MODE_LINK_LABEL);
    expect(markup).toContain(ROOT_THEME_LIGHT_MODE_LINK_LABEL);
    expect(markup).toContain(ROOT_THEME_DARK_MODE_LINK_LABEL);
    expect(markup).toContain('data-testid="workspace-layout-v2-pane-right"');
    expect(markup).not.toContain('data-testid="workspace-layout-v2-pane-left"');
    expect(markup).not.toContain('aria-label="Toggle Left Sidebar"');
    expect(markup).toContain('aria-label="Toggle Right Sidebar"');
  });

  it("shows the public shell right sidebar toggle", () => {
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

    expect(markup).toContain('aria-label="Toggle Right Sidebar"');
    expect(markup).not.toContain('aria-label="Toggle sidebar"');
  });

  it("ignores stored left pane values when the public route has no left pane", () => {
    const defaultSidebarState = {
      leftDesktopOpen: false,
      leftDesktopWidthPx: 48,
      leftMobileWidthPx: 288,
      mobilePane: "main",
      mobileSurface: { kind: "unmerged" },
      rightDesktopOpen: true,
      rightDesktopWidthPx: 288,
      rightMobileWidthPx: 288,
    } satisfies WorkspaceSidebarState;
    const storedSidebarState = {
      leftDesktopOpen: true,
      leftDesktopWidthPx: 420,
      leftMobileWidthPx: 410,
      mobilePane: "left",
      mobileSurface: { kind: "merged", mainWidthPx: 294, side: "left" },
      rightDesktopOpen: true,
      rightDesktopWidthPx: 360,
      rightMobileWidthPx: 340,
    } satisfies WorkspaceSidebarState;
    const setState: WorkspaceSidebarStateController["setState"] = () => {};
    const storedSidebarStateController = {
      isHydrated: true,
      state: storedSidebarState,
      setState,
    } satisfies WorkspaceSidebarStateController;

    const sanitizedSidebarStateController = sanitizePublicLayoutSidebarState({
      defaultSidebarState,
      hasLeftPane: false,
      sidebarState: storedSidebarStateController,
    });

    expect(sanitizedSidebarStateController.state).toEqual({
      ...storedSidebarState,
      leftDesktopOpen: false,
      leftDesktopWidthPx: defaultSidebarState.leftDesktopWidthPx,
      leftMobileWidthPx: defaultSidebarState.leftMobileWidthPx,
      mobilePane: "main",
      mobileSurface: { kind: "unmerged" },
    });
    expect(sanitizedSidebarStateController.setState).toBe(setState);
  });

  it("keeps standard right rail links around public workspace panes", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/localStorage"]}>
        <Layout>
          <PublicLayoutShell
            dataTestId="local-storage-workspace"
            defaultLeftOpen
            left={{
              content: (
                <div data-testid="local-storage-left-pane">localStorage</div>
              ),
            }}
            leftToggleVisibility="all"
            main={{
              header: <div>Storage header</div>,
              content: <div>Storage values</div>,
            }}
          />
        </Layout>
      </TestRouterProvider>,
    );

    expect(markup).toContain('data-testid="local-storage-workspace"');
    expect(markup).toContain('data-testid="workspace-layout-v2-pane-left"');
    expect(markup).toContain('data-testid="workspace-layout-v2-pane-right"');
    expect(markup).toContain('aria-label="Toggle sidebar"');
    expect(markup).toContain("/logo");
    expect(markup).toContain("/home");
    expect(markup).toContain("/terms");
    expect(markup).toContain("/privacy");
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
    expect(rightRailMarkup).toContain(`id="public-local-storage-route-link"`);
    expect(rightRailMarkup).toContain(LOCAL_STORAGE_ROUTE);
    expect(rightRailMarkup).toContain(`aria-hidden="true"`);
    expect(rightRailMarkup).toContain(`tabindex="-1"`);
    expect(rightRailMarkup).toContain("text-background");
  });

  it("shows the localStorage link only in the right dev sidebar", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const landingDevPath = buildPathWithTanStackSearch({
      pathname: "/",
      search: {
        [LANDING_DEV_MODE_QUERY_PARAM]: true,
      },
    });

    const leftRailMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[landingDevPath]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );
    const rightRailMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[landingDevPath]}>
        <AppSidebarMetaSection side="right" />
      </TestRouterProvider>,
    );

    expect(leftRailMarkup).not.toContain(LOCAL_STORAGE_ROUTE);
    expect(rightRailMarkup).toContain(`id="public-local-storage-route-link"`);
    expect(rightRailMarkup).toContain(
      `href="${encodeStaticHref(
        buildPathWithTanStackSearch({
          pathname: LOCAL_STORAGE_ROUTE,
          search: {
            [LANDING_DEV_MODE_QUERY_PARAM]: true,
          },
        }),
      )}"`,
    );
  });

  it("keeps search-param shortcuts above a stable path list", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const landingDevPath = buildPathWithTanStackSearch({
      pathname: "/",
      search: {
        [LANDING_DEV_MODE_QUERY_PARAM]: true,
      },
    });

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[landingDevPath]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    const devShortcutIndex = markup.indexOf(
      LANDING_DEV_MODE_DISABLE_LINK_LABEL,
    );
    const prodUiShortcutIndex = markup.indexOf(FORCE_PROD_UI_MODE_LINK_LABEL);
    const resetShortcutIndex = markup.indexOf(SEARCH_RESET_LINK_LABEL);
    const lightShortcutIndex = markup.indexOf(ROOT_THEME_LIGHT_MODE_LINK_LABEL);
    const darkShortcutIndex = markup.indexOf(ROOT_THEME_DARK_MODE_LINK_LABEL);
    const logoLinkIndex = markup.indexOf("/logo");
    const homeLinkIndex = markup.indexOf("/home");
    const termsLinkIndex = markup.indexOf("/terms");
    const privacyLinkIndex = markup.indexOf("/privacy");

    expect(prodUiShortcutIndex).toBeGreaterThanOrEqual(0);
    expect(devShortcutIndex).toBeGreaterThanOrEqual(0);
    expect(resetShortcutIndex).toBeGreaterThanOrEqual(0);
    expect(lightShortcutIndex).toBeGreaterThanOrEqual(0);
    expect(darkShortcutIndex).toBeGreaterThanOrEqual(0);
    expect(resetShortcutIndex).toBeLessThan(lightShortcutIndex);
    expect(lightShortcutIndex).toBeLessThan(darkShortcutIndex);
    expect(darkShortcutIndex).toBeLessThan(prodUiShortcutIndex);
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
    const landingDevPath = buildPathWithTanStackSearch({
      pathname: "/",
      search: {
        [LANDING_DEV_MODE_QUERY_PARAM]: true,
      },
    });

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

  it("reserves the route URL header slot in the normal public sidebar", () => {
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

    expect(markup).toContain(
      `data-testid="${PUBLIC_RIGHT_SIDEBAR_ROUTE_URL_HEADER_TEST_ID}"`,
    );
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-testid="route-url-display"');
  });

  it("opens the logo shortcut without changing root flags", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const landingProdUiPath = buildPathWithTanStackSearch({
      pathname: "/",
      search: {
        [FORCE_PROD_UI_QUERY_PARAM]: true,
      },
    });
    const logoPath = buildPathWithTanStackSearch({
      pathname: "/logo",
      search: {
        [FORCE_PROD_UI_QUERY_PARAM]: true,
      },
    });

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[landingProdUiPath]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(markup).toContain(`href="${encodeStaticHref(logoPath)}"`);
  });

  it("adds dev to the current URL without dropping other URL parts", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const logoPath = buildPathWithTanStackSearch({
      pathname: "/logo",
      search: {
        [FORCE_PROD_UI_QUERY_PARAM]: true,
      },
      hash: "top",
    });
    const logoWithDevPath = buildPathWithTanStackSearch({
      pathname: "/logo",
      search: {
        [FORCE_PROD_UI_QUERY_PARAM]: true,
        [LANDING_DEV_MODE_QUERY_PARAM]: true,
      },
      hash: "top",
    });

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
    const logoDevPath = buildPathWithTanStackSearch({
      pathname: "/logo",
      search: {
        [FORCE_PROD_UI_QUERY_PARAM]: true,
        [LANDING_DEV_MODE_QUERY_PARAM]: true,
      },
      hash: "top",
    });
    const logoWithoutDevPath = buildPathWithTanStackSearch({
      pathname: "/logo",
      search: {
        [FORCE_PROD_UI_QUERY_PARAM]: true,
      },
      hash: "top",
    });

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[logoDevPath]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(markup).toContain(LANDING_DEV_MODE_DISABLE_LINK_LABEL);
    expect(markup).not.toContain(`>${LANDING_DEV_MODE_LINK_LABEL}<`);
    expect(markup).toContain(`href="${encodeStaticHref(logoWithoutDevPath)}"`);
  });

  it("adds light mode to the current URL without dropping other URL parts", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const logoPath = buildPathWithTanStackSearch({
      pathname: "/logo",
      search: {
        [FORCE_PROD_UI_QUERY_PARAM]: true,
        [LANDING_DEV_MODE_QUERY_PARAM]: true,
      },
      hash: "top",
    });
    const logoWithLightPath = buildPathWithTanStackSearch({
      pathname: "/logo",
      search: {
        [LANDING_DEV_MODE_QUERY_PARAM]: true,
        [FORCE_PROD_UI_QUERY_PARAM]: true,
        light: true,
      },
      hash: "top",
    });

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[logoPath]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(markup).toContain(ROOT_THEME_LIGHT_MODE_LINK_LABEL);
    expect(markup).toContain(ROOT_THEME_DARK_MODE_LINK_LABEL);
    expect(markup).toContain(`href="${encodeStaticHref(logoWithLightPath)}"`);
  });

  it("removes active light mode from the current URL", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const logoLightPath = buildPathWithTanStackSearch({
      pathname: "/logo",
      search: {
        [FORCE_PROD_UI_QUERY_PARAM]: true,
        [LANDING_DEV_MODE_QUERY_PARAM]: true,
        light: true,
      },
      hash: "top",
    });
    const logoWithoutLightPath = buildPathWithTanStackSearch({
      pathname: "/logo",
      search: {
        [LANDING_DEV_MODE_QUERY_PARAM]: true,
        [FORCE_PROD_UI_QUERY_PARAM]: true,
      },
      hash: "top",
    });

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[logoLightPath]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(markup).toContain(ROOT_THEME_LIGHT_MODE_DISABLE_LINK_LABEL);
    expect(markup).not.toContain(`>${ROOT_THEME_LIGHT_MODE_LINK_LABEL}<`);
    expect(markup).toContain(ROOT_THEME_DARK_MODE_LINK_LABEL);
    expect(markup).toContain(
      `href="${encodeStaticHref(logoWithoutLightPath)}"`,
    );
  });

  it("replaces active light mode with dark mode in the current URL", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const logoLightPath = buildPathWithTanStackSearch({
      pathname: "/logo",
      search: {
        [FORCE_PROD_UI_QUERY_PARAM]: true,
        [LANDING_DEV_MODE_QUERY_PARAM]: true,
        light: true,
      },
      hash: "top",
    });
    const logoDarkPath = buildPathWithTanStackSearch({
      pathname: "/logo",
      search: {
        [LANDING_DEV_MODE_QUERY_PARAM]: true,
        [FORCE_PROD_UI_QUERY_PARAM]: true,
        dark: true,
      },
      hash: "top",
    });

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[logoLightPath]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(markup).toContain(ROOT_THEME_DARK_MODE_LINK_LABEL);
    expect(markup).toContain(`href="${encodeStaticHref(logoDarkPath)}"`);
  });

  it("adds prod-ui to the current URL without dropping other URL parts", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const logoPath = buildPathWithTanStackSearch({
      pathname: "/logo",
      search: {
        [LANDING_DEV_MODE_QUERY_PARAM]: true,
      },
      hash: "top",
    });
    const logoWithProdUiPath = buildPathWithTanStackSearch({
      pathname: "/logo",
      search: {
        [LANDING_DEV_MODE_QUERY_PARAM]: true,
        [FORCE_PROD_UI_QUERY_PARAM]: true,
      },
      hash: "top",
    });

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[logoPath]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(markup).toContain(FORCE_PROD_UI_MODE_LINK_LABEL);
    expect(markup).toContain(`href="${encodeStaticHref(logoWithProdUiPath)}"`);
  });

  it("adds a reset shortcut that owns the visible query string", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const logoPath = buildPathWithTanStackSearch({
      pathname: "/logo",
      search: {
        [LANDING_DEV_MODE_QUERY_PARAM]: true,
        primary: "red-600",
      },
      hash: "top",
    });
    const logoResetPath = buildPathWithTanStackSearch({
      pathname: "/logo",
      search: {
        [SEARCH_RESET_QUERY_PARAM]: true,
      },
      hash: "top",
    });

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[logoPath]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(markup).toContain(`id="public-landing-search-reset"`);
    expect(markup).toContain(`>${SEARCH_RESET_LINK_LABEL}<`);
    expect(markup).toContain(`href="${encodeStaticHref(logoResetPath)}"`);
  });

  it("hides the reset shortcut when the current URL has no search params", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/logo#top"]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );

    expect(markup).not.toContain(`id="public-landing-search-reset"`);
    expect(markup).not.toContain(`>${SEARCH_RESET_LINK_LABEL}<`);
  });

  it("hides the prod-ui shortcut from the prod-like surface", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    const logoProdUiPath = buildPathWithTanStackSearch({
      pathname: "/logo",
      search: {
        [FORCE_PROD_UI_QUERY_PARAM]: true,
        [LANDING_DEV_MODE_QUERY_PARAM]: true,
      },
      hash: "top",
    });

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

  it("keeps low-use machine routes out of the plain path list", () => {
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
        <AppSidebarMetaSection showLandingPreviewLink />
      </TestRouterProvider>,
    );
    const homeHref = 'href="/"';
    const machinesHref = 'href="/machines"';
    const machineConnectHref = 'href="/machines/connect"';
    const landingPreviewHref = `href="${LANDING_MARKDOWN_PREVIEW_ROUTE}"`;
    const termsHref = 'href="/terms"';

    expect(defaultMarkup).not.toContain(machinesHref);
    expect(defaultMarkup).not.toContain(machineConnectHref);
    expect(defaultMarkup).not.toContain(landingPreviewHref);
    expect(dashboardMarkup).not.toContain(machinesHref);
    expect(dashboardMarkup).not.toContain(machineConnectHref);
    expect(dashboardMarkup).toContain(landingPreviewHref);
    expect(dashboardMarkup.indexOf(homeHref)).toBeLessThan(
      dashboardMarkup.indexOf(landingPreviewHref),
    );
    expect(dashboardMarkup.indexOf(landingPreviewHref)).toBeLessThan(
      dashboardMarkup.indexOf(termsHref),
    );
  });

  it("shows the Romanian language shortcut only on the landing preview route", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    useConvexAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    const homeMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );
    const landingPreviewMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[LANDING_MARKDOWN_PREVIEW_ROUTE]}>
        <AppSidebarMetaSection />
      </TestRouterProvider>,
    );
    const landingPreviewRomanianHref = `href="${buildPathWithTanStackSearch({
      pathname: LANDING_MARKDOWN_PREVIEW_ROUTE,
      search: {
        [LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM]: "ro",
      },
    })}"`;

    expect(homeMarkup).not.toContain(
      LANDING_MARKDOWN_PREVIEW_ROMANIAN_QUERY_LINK_LABEL,
    );
    expect(landingPreviewMarkup).toContain(
      LANDING_MARKDOWN_PREVIEW_ROMANIAN_QUERY_LINK_LABEL,
    );
    expect(landingPreviewMarkup).toContain(landingPreviewRomanianHref);
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
