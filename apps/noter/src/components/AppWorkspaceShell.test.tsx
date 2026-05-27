import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { AppWorkspaceShell } from "./AppWorkspaceShell";
import { TestRouterProvider } from "@/test/TestRouterProvider";

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useConvexAuth: () => ({
      isAuthenticated: false,
      isLoading: false,
    }),
    useMutation: () => () => Promise.resolve(),
    useQuery: () => undefined,
  };
});

vi.mock("@/components/RouteUrlEditor", () => ({
  RouteUrlEditor: () => <input data-testid="route-url-editor" readOnly value="/machines" />,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AppWorkspaceShell", () => {
  it("server-renders route content inside the workspace layout", () => {
    vi.stubGlobal("__APP_COMMIT__", "test-commit");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 1);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/machines"]}>
        <AppWorkspaceShell>
          <div data-testid="workspace-route-content">workspace route content</div>
        </AppWorkspaceShell>
      </TestRouterProvider>,
    );

    expect(markup).toContain('data-workspace-layout-v2="responsive"');
    expect(markup).toContain('data-testid="app-workspace"');
    expect(markup).toContain('data-testid="workspace-layout-v2-pane-left"');
    expect(markup).toContain('data-testid="workspace-layout-v2-pane-right"');
    expect(markup).toContain("workspace route content");
  });

  it("bounds the workspace shell to the root height instead of a viewport-unit min-height", () => {
    vi.stubGlobal("__APP_COMMIT__", "test-commit");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 1);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/machines"]}>
        <AppWorkspaceShell>
          <div data-testid="workspace-route-content">workspace route content</div>
        </AppWorkspaceShell>
      </TestRouterProvider>,
    );

    expect(markup).toContain("flex h-full min-h-0 flex-col");
    expect(markup).not.toContain("min-h-dvh");
  });
});
