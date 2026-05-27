// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { AppWorkspaceShell } from "./AppWorkspaceShell";
import { TestRouterProvider } from "@/test/TestRouterProvider";

const { act } = React;

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

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

let root: Root | null = null;
let rootElement: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    const mountedRoot = root;
    act(() => {
      mountedRoot.unmount();
    });
    root = null;
  }

  rootElement?.remove();
  rootElement = null;
  vi.unstubAllGlobals();
});

function stubBuildGlobals() {
  vi.stubGlobal("__APP_COMMIT__", "test-commit");
  vi.stubGlobal("__APP_COMMIT_NUMBER__", 1);
  vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
}

describe("AppWorkspaceShell", () => {
  it("server-renders route content inside the workspace layout", () => {
    stubBuildGlobals();

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

  it("bounds the workspace shell with a viewport height instead of a viewport-unit min-height", () => {
    stubBuildGlobals();

    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/machines"]}>
        <AppWorkspaceShell>
          <div data-testid="workspace-route-content">workspace route content</div>
        </AppWorkspaceShell>
      </TestRouterProvider>,
    );

    expect(markup).toContain("[--noter-app-workspace-shell-height:100dvh]");
    expect(markup).toContain("h-(--noter-app-workspace-shell-height)");
    expect(markup).not.toContain("h-dvh");
    expect(markup).not.toContain("min-h-dvh");
  });

  it("uses visualViewport height for the shell height after hydration", async () => {
    stubBuildGlobals();
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      removeItem: () => {},
      setItem: () => {},
    });
    vi.stubGlobal("matchMedia", (query: string) => ({
      addEventListener: () => {},
      addListener: () => {},
      dispatchEvent: () => false,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: () => {},
      removeListener: () => {},
    }));

    let viewportHeight = 866.25;
    const visualViewport = new EventTarget();
    Object.defineProperty(visualViewport, "height", {
      configurable: true,
      get: () => viewportHeight,
    });
    vi.stubGlobal("visualViewport", visualViewport);
    vi.stubGlobal("innerHeight", 922);

    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(
        <TestRouterProvider initialEntries={["/machines"]}>
          <AppWorkspaceShell>
            <div data-testid="workspace-route-content">workspace route content</div>
          </AppWorkspaceShell>
        </TestRouterProvider>,
      );
    });

    const shell = rootElement.querySelector('[data-testid="app-workspace"]')?.parentElement;
    expect(shell?.style.getPropertyValue("--noter-app-workspace-shell-height")).toBe("866.25px");

    viewportHeight = 810;
    await act(async () => {
      visualViewport.dispatchEvent(new Event("resize"));
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });
    expect(shell?.style.getPropertyValue("--noter-app-workspace-shell-height")).toBe("810px");
  });
});
