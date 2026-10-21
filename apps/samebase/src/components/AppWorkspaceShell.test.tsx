// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { SidebarLayoutState } from "@samebase/sidebars/SidebarLayoutState";
import { AppWorkspaceRouteChrome, AppWorkspaceShell } from "./AppWorkspaceShell";
import { getFunctionName } from "convex/server";
import { api } from "../../convex/_generated/api";
import { RouterContextProvider, createMemoryHistory } from "@tanstack/react-router";
import { createAppRouter } from "@/router";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "@/lib/appWorkspaceSidebarPreferences";
import { DocumentRenderedWithSessionContext } from "@/lib/documentSession";
import { TestRouterProvider } from "@/test/TestRouterProvider";

const { act, useState } = React;
const { toggleLeftPaneMock, toggleRightPaneMock, useConvexAuthMock, useQueryMock } = vi.hoisted(
  () => ({
    toggleLeftPaneMock: vi.fn(),
    toggleRightPaneMock: vi.fn(),
    useConvexAuthMock: vi.fn(),
    useQueryMock: vi.fn(),
  }),
);
// The root loader's saved sidebar state; none, as for a visitor without a session, by default.
const savedSidebarState: { current: SidebarLayoutState | null } = vi.hoisted(() => ({
  current: null,
}));

// This jsdom mount has no Start server request or client compilation.
vi.mock("@/lib/isomorphic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/isomorphic")>()),
  readIsomorphicOrigin: () => window.location.origin,
}));

vi.mock("@samebase/sidebars/SidebarRuntime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@samebase/sidebars/SidebarRuntime")>();

  return {
    ...actual,
    useSidebarActions: () => ({
      ...actual.useSidebarActions(),
      toggleLeftPane: toggleLeftPaneMock,
      toggleRightPane: toggleRightPaneMock,
    }),
  };
});

// The root loader's saved sidebar state, or none, as for a visitor without a session. Other queries of
// the TanStack cache have no data.
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data:
      queryKey[1] === getFunctionName(api.workspaceSidebarState.getWorkspaceSidebarState)
        ? savedSidebarState.current
        : undefined,
  }),
}));

// The repository routes' loader would query Convex over a socket that jsdom cannot open.
vi.mock("@/routes/repository-dashboard.queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/routes/repository-dashboard.queries")>()),
  loadRepositoryDashboard: async () => {},
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
} satisfies SidebarLayoutState;

describe("AppWorkspaceShell", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    toggleLeftPaneMock.mockReset();
    toggleRightPaneMock.mockReset();
    useConvexAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });
    useQueryMock.mockReturnValue(undefined);
    savedSidebarState.current = null;
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

  function MobileSidebarToggleRouteChromeProbe() {
    return (
      <AppWorkspaceRouteChrome leftToggleVisibility="all" rightToggleVisibility="all">
        <div data-testid="route-chrome-mobile-toggle-probe">Route content</div>
      </AppWorkspaceRouteChrome>
    );
  }

  function LeftPaneRouteChromeProbe() {
    return (
      <AppWorkspaceRouteChrome left={{ content: <div>route left pane</div> }}>
        <div data-testid="route-chrome-left-probe">Route content</div>
      </AppWorkspaceRouteChrome>
    );
  }

  function ShortcutPaneSideRouteChromeProbe() {
    const [useLeftPaneShortcut, setUseLeftPaneShortcut] = useState(false);

    return (
      <AppWorkspaceRouteChrome shortcutPaneSide={useLeftPaneShortcut ? "left" : undefined}>
        <button
          data-testid="use-left-pane-shortcut"
          type="button"
          onClick={() => {
            setUseLeftPaneShortcut(true);
          }}
        >
          Use left pane shortcut
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
        <TestRouterProvider initialEntries={["/logo"]}>
          <AppWorkspaceShell>
            <RouteChromeProbe />
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

  it("server-renders route content inside the workspace layout", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/logo"]}>
        <AppWorkspaceShell>
          <div data-testid="workspace-route-content">workspace route content</div>
        </AppWorkspaceShell>
      </TestRouterProvider>,
    );

    expect(markup).toContain('data-sidebar-layout-part="viewport"');
    expect(markup).toContain('data-sidebar-layout-part="root"');
    expect(markup).toContain('data-sidebar-layout-part="address-chrome"');
    expect(markup).toContain('data-testid="route-url-editor"');
    expect(markup).toContain('data-pane-side="left"');
    expect(markup).toContain('data-pane-side="right"');
    expect(markup).toContain("workspace route content");
  });

  it("server-renders visual fixtures with normal pane defaults before fixture chrome registers", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/visual-fixture"]}>
        <AppWorkspaceShell>
          <div data-testid="workspace-route-content">visual fixture content</div>
        </AppWorkspaceShell>
      </TestRouterProvider>,
    );

    expect(markup).toContain('data-sidebar-layout-part="root"');
    expect(markup).toContain("visual fixture content");
    expect(markup).toContain('data-sidebar-layout-part="address-chrome"');
    expect(markup).toContain('data-testid="route-url-editor"');
    expect(markup).toContain('data-pane-side="left"');
    expect(markup).toContain('data-pane-side="right"');
    expect(markup).toContain("flex h-full min-h-0 flex-col");
    expect(markup).not.toContain("min-h-dvh");
  });

  it("server-renders static no-left routes without the default left pane", async () => {
    // The shell reads the rendered route matches, which a server render has after its loaders.
    const router = createAppRouter(createMemoryHistory({ initialEntries: ["/terms"] }));
    await router.load();
    const markup = renderToStaticMarkup(
      <RouterContextProvider router={router}>
        <AppWorkspaceShell>
          <div data-testid="workspace-route-content">workspace route content</div>
        </AppWorkspaceShell>
      </RouterContextProvider>,
    );

    expect(markup).toContain('data-sidebar-layout-part="root"');
    expect(markup).toContain('data-sidebar-layout-part="address-chrome"');
    expect(markup).toContain('data-testid="route-url-editor"');
    expect(markup).toContain('data-pane-side="right"');
    expect(markup).toContain("workspace route content");
    const markupContainer = document.createElement("div");
    markupContainer.innerHTML = markup;
    expect(
      markupContainer.querySelector('[data-sidebar-layout-part="pane"][data-pane-side="left"]'),
    ).toBeNull();
  });

  it("does not inherit no-left metadata into ordinary child routes", () => {
    for (const route of [
      "/logo",
      "/repo/ada/demo",
      "/repo/ada/demo/schema/main/project/convex-attachment",
    ]) {
      const markup = renderToStaticMarkup(
        <TestRouterProvider initialEntries={[route]}>
          <AppWorkspaceShell>
            <div data-testid="workspace-route-content">workspace route content</div>
          </AppWorkspaceShell>
        </TestRouterProvider>,
      );

      expect(markup).toContain('data-sidebar-layout-part="address-chrome"');
      expect(markup).toContain('data-pane-side="left"');
      expect(markup).toContain("workspace route content");
    }
  });

  it("keeps static no-left route metadata authoritative over route chrome", async () => {
    const router = createAppRouter(createMemoryHistory({ initialEntries: ["/terms"] }));
    await router.load();
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(
        <RouterContextProvider router={router}>
          <AppWorkspaceShell>
            <LeftPaneRouteChromeProbe />
          </AppWorkspaceShell>
        </RouterContextProvider>,
      );
    });

    expect(getRequiredElement('[data-testid="route-chrome-left-probe"]').textContent).toBe(
      "Route content",
    );
    expect(
      rootElement.querySelector('[data-sidebar-layout-part="pane"][data-pane-side="left"]'),
    ).toBeNull();
    expect(rootElement.textContent).not.toContain("route left pane");
  });

  it("bounds the workspace shell to the root height instead of a viewport-unit height", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/logo"]}>
        <AppWorkspaceShell>
          <div data-testid="workspace-route-content">workspace route content</div>
        </AppWorkspaceShell>
      </TestRouterProvider>,
    );

    expect(markup).toContain("flex h-full min-h-0 flex-col");
    expect(markup).not.toContain("--samebase-app-workspace-shell-height");
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

  it("applies the route-selected pane policy to the global workspace shortcut", () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(
        <TestRouterProvider initialEntries={["/logo"]}>
          <AppWorkspaceShell>
            <ShortcutPaneSideRouteChromeProbe />
          </AppWorkspaceShell>
        </TestRouterProvider>,
      );
    });

    const defaultShortcutEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "b",
    });
    act(() => {
      window.dispatchEvent(defaultShortcutEvent);
    });

    expect(defaultShortcutEvent.defaultPrevented).toBe(true);
    expect(toggleRightPaneMock).toHaveBeenCalledOnce();
    expect(toggleLeftPaneMock).not.toHaveBeenCalled();

    act(() => {
      getRequiredElement('[data-testid="use-left-pane-shortcut"]').click();
    });
    toggleLeftPaneMock.mockClear();
    toggleRightPaneMock.mockClear();

    const leftShortcutEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "b",
      metaKey: true,
    });
    act(() => {
      window.dispatchEvent(leftShortcutEvent);
    });

    expect(leftShortcutEvent.defaultPrevented).toBe(true);
    expect(toggleLeftPaneMock).toHaveBeenCalledOnce();
    expect(toggleRightPaneMock).not.toHaveBeenCalled();
  });

  it("leaves Ctrl+B and Command+B available to editable targets", () => {
    renderClientShell();
    const editableTargetMarkup = [
      '<input data-shortcut-target="">',
      '<textarea data-shortcut-target=""></textarea>',
      '<select data-shortcut-target=""><option>Option</option></select>',
      '<div contenteditable="true"><span data-shortcut-target="" tabindex="0"></span></div>',
      '<div role="textbox"><span data-shortcut-target="" tabindex="0"></span></div>',
      '<div class="monaco-editor"><span data-shortcut-target="" tabindex="0"></span></div>',
      '<div class="cm-editor"><span data-shortcut-target="" tabindex="0"></span></div>',
    ];

    for (const markup of editableTargetMarkup) {
      const host = document.createElement("div");
      host.innerHTML = markup;
      document.body.append(host);
      const target = host.querySelector("[data-shortcut-target]");
      if (!(target instanceof HTMLElement)) {
        throw new Error("Expected an editable shortcut target.");
      }

      target.focus();
      for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
        const event = new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "b",
          ...modifier,
        });
        act(() => {
          target.dispatchEvent(event);
        });

        expect(event.defaultPrevented).toBe(false);
      }
      host.remove();
    }

    expect(toggleLeftPaneMock).not.toHaveBeenCalled();
    expect(toggleRightPaneMock).not.toHaveBeenCalled();
  });

  it("lets route chrome expose both sidebar toggles on mobile", () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(
        <TestRouterProvider initialEntries={["/logo"]}>
          <AppWorkspaceShell>
            <MobileSidebarToggleRouteChromeProbe />
          </AppWorkspaceShell>
        </TestRouterProvider>,
      );
    });

    const leftToggle = getRequiredElement('button[aria-label="Toggle sidebar"]');
    const rightToggle = getRequiredElement('button[aria-label="Toggle Right Sidebar"]');

    expect(leftToggle.classList.contains("hidden")).toBe(false);
    expect(rightToggle.classList.contains("hidden")).toBe(false);
  });

  it("exposes the right pane without a repeated route context label on mobile", () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(
        <TestRouterProvider initialEntries={["/org/samebase/settings"]}>
          <AppWorkspaceShell>
            <div>Organization settings</div>
          </AppWorkspaceShell>
        </TestRouterProvider>,
      );
    });

    const mainHeader = getRequiredElement(
      '[data-sidebar-layout-part="pane"][data-pane-side="main"] [data-sidebar-layout-part="pane-header"]',
    );
    const rightToggle = getRequiredElement('button[aria-label="Toggle Right Sidebar"]');

    expect(mainHeader.textContent).not.toContain("samebase");
    expect(mainHeader.querySelector('[aria-label^="Switch organization"]')).toBeNull();
    expect(rightToggle.classList.contains("hidden")).toBe(false);
  });

  it("starts with the left sidebar closed and the right sidebar open in server markup", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/logo"]}>
        <AppWorkspaceShell>
          <div data-testid="workspace-route-content">workspace route content</div>
        </AppWorkspaceShell>
      </TestRouterProvider>,
    );

    expect(markup).toContain("--sidebar-layout-left-desktop-width:0px");
    expect(markup).toContain("--sidebar-layout-right-desktop-width:min(288px, calc(100% - 160px))");
  });

  it("server-renders the root loader's saved sidebar state", () => {
    savedSidebarState.current = SERVER_SIDEBAR_STATE;
    const markup = renderToStaticMarkup(
      <DocumentRenderedWithSessionContext value>
        <TestRouterProvider initialEntries={["/logo"]}>
          <AppWorkspaceShell>
            <div data-testid="workspace-route-content">workspace route content</div>
          </AppWorkspaceShell>
        </TestRouterProvider>
      </DocumentRenderedWithSessionContext>,
    );
    const markupContainer = document.createElement("div");
    markupContainer.innerHTML = markup;
    const viewport = markupContainer.querySelector('[data-sidebar-layout-part="viewport"]');
    const leftPane = markupContainer.querySelector('[data-pane-side="left"]');
    const rightPane = markupContainer.querySelector('[data-pane-side="right"]');

    expect(leftPane?.getAttribute("style")).toContain(
      "--sidebar-layout-left-desktop-width:min(300px, calc(100% - 160px))",
    );
    expect(rightPane?.getAttribute("style")).toContain("--sidebar-layout-right-desktop-width:0px");
    expect(viewport?.getAttribute("data-mobile-pane")).toBe("right");
    expect(viewport?.getAttribute("data-sidebar-layout-mobile-merged-side")).toBe("right");
    expect(viewport?.getAttribute("style")).toContain(
      "--sidebar-layout-right-mobile-width:clamp(min(175px, round(down, 100% / 3, 1px)), 420px, calc(100% - 40px))",
    );
    const rightMobileWidth =
      "clamp(min(175px, round(down, 100% / 3, 1px)), 420px, calc(100% - 40px))";
    expect(viewport?.getAttribute("style")).toContain(
      `--sidebar-layout-main-mobile-width:calc(100% - ${rightMobileWidth} + clamp(0px, (214px - (100% - ${rightMobileWidth})) * 1000, ${rightMobileWidth}))`,
    );
    expect(viewport?.getAttribute("style")).toContain(
      "--sidebar-layout-left-mobile-width:clamp(min(175px, round(down, 100% / 3, 1px)), 300px, calc(100% - 40px))",
    );
  });

  it("renders the local prehydration script only for a render without a session", () => {
    const renderShell = (renderedWithSession: boolean) =>
      renderToStaticMarkup(
        <DocumentRenderedWithSessionContext value={renderedWithSession}>
          <TestRouterProvider initialEntries={["/logo"]}>
            <AppWorkspaceShell>
              <div data-testid="workspace-route-content">workspace route content</div>
            </AppWorkspaceShell>
          </TestRouterProvider>
        </DocumentRenderedWithSessionContext>,
      );

    expect(renderShell(false)).toContain(APP_WORKSPACE_SIDEBAR_STORAGE_KEY);
    expect(renderShell(true)).not.toContain(APP_WORKSPACE_SIDEBAR_STORAGE_KEY);
  });
});
