import { TestRouterProvider } from "@/test/TestRouterProvider";
import { APP_BUILD_STATUS_BAR_TEST_ID } from "@/lib/appBuild";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

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
        <Layout showLandingBottomBar>
          <div>landing</div>
        </Layout>
      </TestRouterProvider>,
    );

    expect(markup).toContain(APP_BUILD_STATUS_BAR_TEST_ID);
    expect(markup).toContain("/terms");
    expect(markup).toContain("/privacy");
  });

  it("does not render the landing footer when the layout does not opt in", () => {
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

    expect(markup).not.toContain(APP_BUILD_STATUS_BAR_TEST_ID);
    expect(markup).not.toContain("/terms");
    expect(markup).not.toContain("/privacy");
  });

  it("hides the landing footer for signed-in root state", () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    useConvexAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <Layout showLandingBottomBar>
          <div>vault dashboard</div>
        </Layout>
      </TestRouterProvider>,
    );

    expect(markup).not.toContain(APP_BUILD_STATUS_BAR_TEST_ID);
    expect(markup).not.toContain("/terms");
    expect(markup).not.toContain("/privacy");
  });
});
