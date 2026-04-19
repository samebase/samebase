import { TestRouterProvider } from "@/test/TestRouterProvider";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";

const { useConvexAuthMock } = vi.hoisted(() => ({
  useConvexAuthMock: vi.fn(),
}));

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

import { Layout } from "./Layout";

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
          <div>landing</div>
        </Layout>
      </TestRouterProvider>,
    );

    expect(markup).toContain("/terms");
    expect(markup).toContain("/privacy");
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
          <div>consent</div>
        </Layout>
      </TestRouterProvider>,
    );

    expect(markup).toContain("/terms");
    expect(markup).toContain("/privacy");
    expect(markup).toContain("Home");
  });

  it("keeps legal links but not the duplicate Home link on authenticated routes", () => {
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
    expect(markup).not.toContain("Home");
  });
});
