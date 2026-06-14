// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import * as React from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AppWorkspaceRouteChrome, AppWorkspaceShell } from "./AppWorkspaceShell";
import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "@/lib/appWorkspaceSidebarPreferences";
import { TestRouterProvider } from "@/test/TestRouterProvider";

const { act, useState } = React;
const { useConvexAuthMock, useQueryMock } = vi.hoisted(() => ({
  useConvexAuthMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("@/components/useAppRightSidebarPane", () => ({
  useAppRightSidebarPane: () => ({
    content: null,
  }),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useConvexAuth: useConvexAuthMock,
    useMutation: () => () => Promise.resolve(),
    useQuery: useQueryMock,
  };
});

const LOCAL_SIDEBAR_STATE = {
  leftDesktopOpen: false,
  leftDesktopWidthPx: 260,
  leftMobileWidthPx: 260,
  mobilePane: "left",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: 340,
  rightMobileWidthPx: 340,
} satisfies WorkspaceSidebarState;

const SERVER_SIDEBAR_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: 300,
  leftMobileWidthPx: 300,
  mobilePane: "right",
  mobileSurface: {
    kind: "merged",
    mainWidthPx: 300,
    side: "right",
  },
  rightDesktopOpen: false,
  rightDesktopWidthPx: 420,
  rightMobileWidthPx: 420,
} satisfies WorkspaceSidebarState;

describe("AppWorkspaceShell", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    useConvexAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });
    useQueryMock.mockReturnValue(undefined);
    window.localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    useConvexAuthMock.mockReset();
    useQueryMock.mockReset();
    window.localStorage.clear();
    const mountedRoot = root;
    if (mountedRoot) {
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }

    rootElement?.remove();
    rootElement = null;
  });

  function RouteChromeProbe() {
    const [headerLabel, setHeaderLabel] = useState("Initial route chrome");

    return (
      <AppWorkspaceRouteChrome
        headerAccessory={<span data-testid="route-chrome-accessory">{headerLabel}</span>}
        left={null}
        right={null}
      >
        <button
          data-testid="route-chrome-update"
          type="button"
          onClick={() => {
            setHeaderLabel("Updated route chrome");
          }}
        >
          Update chrome
        </button>
      </AppWorkspaceRouteChrome>
    );
  }

  function renderClientShell() {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(
        <TestRouterProvider initialEntries={["/machines"]}>
          <AppWorkspaceShell>
            <RouteChromeProbe />
          </AppWorkspaceShell>
        </TestRouterProvider>,
      );
    });
  }

  async function hydrateClientShellFromServerMarkup() {
    const container = document.createElement("div");
    rootElement = container;
    document.body.append(container);
    container.innerHTML = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <AppWorkspaceShell>
          <div data-testid="workspace-route-content">workspace route content</div>
        </AppWorkspaceShell>
      </TestRouterProvider>,
    );

    await act(async () => {
      root = hydrateRoot(
        container,
        <TestRouterProvider initialEntries={["/"]}>
          <AppWorkspaceShell>
            <div data-testid="workspace-route-content">workspace route content</div>
          </AppWorkspaceShell>
        </TestRouterProvider>,
      );
    });
  }

  function getRequiredElement(selector: string) {
    const element = rootElement?.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      throw new Error(`Expected element matching ${selector}.`);
    }

    return element;
  }

  function readStoredAppWorkspaceSidebarState() {
    const storedValue = window.localStorage.getItem(APP_WORKSPACE_SIDEBAR_STORAGE_KEY);
    if (storedValue === null) {
      throw new Error("Expected app workspace sidebar state in localStorage.");
    }

    return JSON.parse(storedValue);
  }

  it("server-renders route content inside the workspace layout", () => {
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

  it("bounds the workspace shell to the root height instead of a viewport-unit height", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/machines"]}>
        <AppWorkspaceShell>
          <div data-testid="workspace-route-content">workspace route content</div>
        </AppWorkspaceShell>
      </TestRouterProvider>,
    );

    expect(markup).toContain("flex h-full min-h-0 flex-col");
    expect(markup).not.toContain("--noter-app-workspace-shell-height");
    expect(markup).not.toContain("h-dvh");
    expect(markup).not.toContain("min-h-dvh");
  });

  it("accepts route chrome updates without re-rendering in a loop", () => {
    renderClientShell();

    expect(getRequiredElement('[data-testid="route-chrome-accessory"]').textContent).toBe(
      "Initial route chrome",
    );

    act(() => {
      getRequiredElement('[data-testid="route-chrome-update"]').click();
    });

    expect(getRequiredElement('[data-testid="route-chrome-accessory"]').textContent).toBe(
      "Updated route chrome",
    );
  });

  it("mirrors hydrated Convex sidebar state into localStorage", () => {
    useConvexAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });
    useQueryMock.mockReturnValue(SERVER_SIDEBAR_STATE);

    renderClientShell();

    expect(readStoredAppWorkspaceSidebarState()).toMatchObject({
      state: SERVER_SIDEBAR_STATE,
      version: 2,
    });
  });

  it("keeps the local sidebar cache when Convex has no row", () => {
    window.localStorage.setItem(
      APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        state: LOCAL_SIDEBAR_STATE,
        version: 2,
      }),
    );
    useConvexAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });
    useQueryMock.mockReturnValue(null);

    renderClientShell();

    expect(readStoredAppWorkspaceSidebarState()).toMatchObject({
      state: LOCAL_SIDEBAR_STATE,
      version: 2,
    });
  });

  it("applies local sidebar widths as a real client hydration update", async () => {
    const localWidthState = {
      ...LOCAL_SIDEBAR_STATE,
      leftDesktopOpen: true,
      leftDesktopWidthPx: 360,
      rightDesktopOpen: true,
      rightDesktopWidthPx: 420,
    } satisfies WorkspaceSidebarState;

    window.localStorage.setItem(
      APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        state: localWidthState,
        version: 2,
      }),
    );

    await hydrateClientShellFromServerMarkup();

    const viewport = getRequiredElement('[data-testid="workspace-layout-v2-pane-main"]');
    expect(viewport.getAttribute("style")).toContain(
      "--workspace-layout-v2-left-desktop-width: 360px",
    );
    expect(viewport.getAttribute("style")).toContain(
      "--workspace-layout-v2-right-desktop-width: 420px",
    );
  });
});
