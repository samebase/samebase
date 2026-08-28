// @vitest-environment jsdom

import { createContext, Script } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import * as React from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { WorkspaceLayoutV2MobileMinResizeBehavior } from "@samebase/workspace-layout/geometry";
import type { WorkspaceSidebarState } from "@samebase/workspace-layout/state";
import { AppWorkspaceRouteChrome, AppWorkspaceShell } from "./AppWorkspaceShell";
import {
  appWorkspaceMobilePanePrehydrationScript,
  appWorkspaceSidebarPrehydrationScript,
  clearAppWorkspaceSidebarDesktopPrehydrationStyle,
} from "@/lib/appWorkspaceSidebarPrehydration";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "@/lib/appWorkspaceSidebarPreferences";
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

vi.mock("@samebase/workspace-layout/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@samebase/workspace-layout/runtime")>();

  return {
    ...actual,
    useWorkspacePaneActions: () => ({
      ...actual.useWorkspacePaneActions(),
      toggleLeftPane: toggleLeftPaneMock,
      toggleRightPane: toggleRightPaneMock,
    }),
  };
});

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

const APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_SELECTOR =
  "style#samebase-app-workspace-sidebar-prehydration";
const APP_WORKSPACE_SIDEBAR_PREHYDRATION_SCOPE_ATTRIBUTE =
  "data-workspace-layout-desktop-prehydration-scope";

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
    toggleLeftPaneMock.mockReset();
    toggleRightPaneMock.mockReset();
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
    clearAppWorkspaceSidebarDesktopPrehydrationStyle();
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

  function runAppWorkspaceSidebarPrehydrationScript(scriptElement: HTMLScriptElement) {
    const currentScriptSpy = vi
      .spyOn(document, "currentScript", "get")
      .mockReturnValue(scriptElement);
    try {
      new Script(appWorkspaceSidebarPrehydrationScript).runInContext(
        createContext({
          document,
          encodeURIComponent,
          JSON,
          Math,
          Number,
          window,
        }),
      );
    } finally {
      currentScriptSpy.mockRestore();
    }
  }

  function runAppWorkspaceMobilePanePrehydrationScript(scriptElement: HTMLScriptElement) {
    const currentScriptSpy = vi
      .spyOn(document, "currentScript", "get")
      .mockReturnValue(scriptElement);
    try {
      new Script(appWorkspaceMobilePanePrehydrationScript).runInContext(
        createContext({
          document,
          JSON,
          Math,
          Number,
          window,
        }),
      );
    } finally {
      currentScriptSpy.mockRestore();
    }
  }

  function withMobileViewportWidth<T>(widthPx: number, callback: () => T) {
    const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      get: () => widthPx,
    });
    try {
      return callback();
    } finally {
      if (originalInnerWidthDescriptor !== undefined) {
        Object.defineProperty(window, "innerWidth", originalInnerWidthDescriptor);
      }
    }
  }

  function appendPrehydrationCarousel({
    includeLeftPane = true,
    includeRightPane = true,
    mobileMinResizeBehavior = "min_resize_to_merge",
  }: {
    includeLeftPane?: boolean;
    includeRightPane?: boolean;
    mobileMinResizeBehavior?: WorkspaceLayoutV2MobileMinResizeBehavior;
  }) {
    const container = document.createElement("div");
    rootElement = container;
    const layoutRoot = document.createElement("div");
    const carousel = document.createElement("div");
    const frameworkScriptElement = document.createElement("script");
    const scriptElement = document.createElement("script");
    carousel.setAttribute("data-workspace-layout-part", "carousel");
    layoutRoot.setAttribute("data-mobile-pane", "main");
    layoutRoot.setAttribute("data-mobile-min-resize-behavior", mobileMinResizeBehavior);
    layoutRoot.setAttribute("data-workspace-layout-part", "viewport");

    if (includeLeftPane) {
      const leftPane = document.createElement("div");
      leftPane.setAttribute("data-pane-side", "left");
      leftPane.setAttribute("data-workspace-layout-part", "pane");
      carousel.append(leftPane);
    }

    const mainPane = document.createElement("div");
    const mainPaneSurface = document.createElement("div");
    mainPane.setAttribute("data-pane-side", "main");
    mainPane.setAttribute("data-workspace-layout-part", "pane");
    mainPaneSurface.setAttribute("data-workspace-layout-part", "pane-surface");
    mainPane.append(mainPaneSurface);
    carousel.append(mainPane);

    if (includeRightPane) {
      const rightPane = document.createElement("div");
      rightPane.setAttribute("data-pane-side", "right");
      rightPane.setAttribute("data-workspace-layout-part", "pane");
      carousel.append(rightPane);
    }

    layoutRoot.append(carousel);
    container.append(layoutRoot, frameworkScriptElement, scriptElement);
    document.body.append(container);

    return {
      carousel,
      container,
      layoutRoot,
      scriptElement,
    };
  }

  async function hydrateClientShellFromServerMarkup({
    initialEntry = "/logo",
    inspectPrehydratedMarkup,
  }: {
    initialEntry?: string;
    inspectPrehydratedMarkup?: (carousel: HTMLElement) => void;
  } = {}) {
    const recoverableErrors: unknown[] = [];
    const container = document.createElement("div");
    rootElement = container;
    document.body.append(container);
    container.innerHTML = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[initialEntry]}>
        <AppWorkspaceShell>
          <div data-testid="workspace-route-content">workspace route content</div>
        </AppWorkspaceShell>
      </TestRouterProvider>,
    );
    const carousel = getRequiredElement('[data-workspace-layout-part="carousel"]');
    runAppWorkspaceSidebarPrehydrationScript(
      getRequiredInlineScriptElement(appWorkspaceSidebarPrehydrationScript),
    );
    inspectPrehydratedMarkup?.(carousel);

    await act(async () => {
      root = hydrateRoot(
        container,
        <TestRouterProvider initialEntries={[initialEntry]}>
          <AppWorkspaceShell>
            <div data-testid="workspace-route-content">workspace route content</div>
          </AppWorkspaceShell>
        </TestRouterProvider>,
        {
          onRecoverableError: (error: unknown) => {
            recoverableErrors.push(error);
          },
        },
      );
    });

    return recoverableErrors;
  }

  function getRequiredElement(selector: string) {
    const element = rootElement?.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      throw new Error(`Expected element matching ${selector}.`);
    }

    return element;
  }

  function getRequiredDocumentElement(selector: string) {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      throw new Error(`Expected document element matching ${selector}.`);
    }

    return element;
  }

  function getRequiredInlineScriptElement(source: string) {
    for (const scriptElement of rootElement?.querySelectorAll("script") ?? []) {
      if (scriptElement.textContent === source) return scriptElement;
    }

    throw new Error("Expected the inline workspace prehydration script.");
  }

  function getRequiredPrehydrationStyleText() {
    return getRequiredDocumentElement(APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_SELECTOR)
      .textContent;
  }

  function getPrehydrationViewportSelector(carousel: HTMLElement) {
    const scopeValue = carousel.getAttribute(APP_WORKSPACE_SIDEBAR_PREHYDRATION_SCOPE_ATTRIBUTE);
    if (scopeValue === null) {
      throw new Error("Expected the desktop prehydration scope.");
    }

    return `[data-workspace-layout-part="carousel"][${APP_WORKSPACE_SIDEBAR_PREHYDRATION_SCOPE_ATTRIBUTE}="${scopeValue}"]:not([data-viewport-measured])`;
  }

  type ExpectedPrehydrationGeometry = {
    leftDesktopOpen: boolean;
    leftDesktopWidth: string;
    rightDesktopOpen: boolean;
    rightDesktopWidth: string;
  };

  function expectPrehydrationStyleText({
    carousel,
    leftDesktopOpen,
    leftDesktopWidth,
    rightDesktopOpen,
    rightDesktopWidth,
    styleText,
  }: ExpectedPrehydrationGeometry & { carousel: HTMLElement; styleText: string }) {
    const viewportSelector = getPrehydrationViewportSelector(carousel);
    expect(styleText).toContain("@media (min-width: 768px)");
    expect(styleText).toContain(
      `${viewportSelector} [data-workspace-layout-part="pane"][data-pane-side="left"]`,
    );
    expect(styleText).toContain(
      `border-inline-end-width: ${leftDesktopOpen ? 1 : 0}px !important;`,
    );
    expect(styleText).toContain(`width: ${leftDesktopWidth} !important;`);
    expect(styleText).toContain(
      `${viewportSelector} [data-workspace-layout-part="pane"][data-pane-side="right"]`,
    );
    expect(styleText).toContain(
      `border-inline-start-width: ${rightDesktopOpen ? 1 : 0}px !important;`,
    );
    expect(styleText).toContain(`width: ${rightDesktopWidth} !important;`);
  }

  function expectPrehydrationStyle(
    expectedGeometry: ExpectedPrehydrationGeometry,
    carousel: HTMLElement,
  ) {
    expectPrehydrationStyleText({
      ...expectedGeometry,
      carousel,
      styleText: getRequiredPrehydrationStyleText(),
    });
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
      <TestRouterProvider initialEntries={["/logo"]}>
        <AppWorkspaceShell>
          <div data-testid="workspace-route-content">workspace route content</div>
        </AppWorkspaceShell>
      </TestRouterProvider>,
    );

    expect(markup).toContain('data-workspace-layout-part="viewport"');
    expect(markup).toContain('data-workspace-layout-part="root"');
    expect(markup).toContain('data-workspace-layout-part="address-chrome"');
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

    expect(markup).toContain('data-workspace-layout-part="root"');
    expect(markup).toContain("visual fixture content");
    expect(markup).toContain('data-workspace-layout-part="address-chrome"');
    expect(markup).toContain('data-testid="route-url-editor"');
    expect(markup).toContain('data-pane-side="left"');
    expect(markup).toContain('data-pane-side="right"');
    expect(markup).toContain("flex h-full min-h-0 flex-col");
    expect(markup).not.toContain("min-h-dvh");
  });

  it("server-renders static no-left routes without the default left pane", () => {
    for (const route of [
      "/",
      "/account-deletion",
      "/admin/account-deletions",
      "/admin/users",
      "/logo/raster-seams",
      "/logo/single-cube",
      "/logo/svg",
      "/logo/transition",
      "/logo/transition/transforms",
      "/org/samebase",
      "/org/samebase/connect-repo",
      "/org/samebase/new-app",
      "/org/samebase/providers",
      "/org/samebase/settings",
      "/org/samebase/vaults",
      "/oauth/mcp/consent?mcp_consent_request=mcpar_test",
      "/pitch",
      "/pitch/print",
      "/pitch/print/mobile",
      "/settings",
      "/terms",
      "/privacy",
      "/test",
      "/vault/",
      "/vault/ada/demo/db/main/project/convex-attachment",
    ]) {
      const markup = renderToStaticMarkup(
        <TestRouterProvider initialEntries={[route]}>
          <AppWorkspaceShell>
            <div data-testid="workspace-route-content">workspace route content</div>
          </AppWorkspaceShell>
        </TestRouterProvider>,
      );

      expect(markup).toContain('data-workspace-layout-part="root"');
      expect(markup).toContain('data-workspace-layout-part="address-chrome"');
      expect(markup).toContain('data-testid="route-url-editor"');
      expect(markup).toContain('data-pane-side="right"');
      expect(markup).toContain("workspace route content");
      const markupContainer = document.createElement("div");
      markupContainer.innerHTML = markup;
      expect(
        markupContainer.querySelector('[data-workspace-layout-part="pane"][data-pane-side="left"]'),
      ).toBeNull();
    }
  });

  it("does not inherit no-left metadata into ordinary child routes", () => {
    for (const route of [
      "/logo",
      "/vault/ada/demo",
      "/vault/ada/demo/schema/main/project/convex-attachment",
    ]) {
      const markup = renderToStaticMarkup(
        <TestRouterProvider initialEntries={[route]}>
          <AppWorkspaceShell>
            <div data-testid="workspace-route-content">workspace route content</div>
          </AppWorkspaceShell>
        </TestRouterProvider>,
      );

      expect(markup).toContain('data-workspace-layout-part="address-chrome"');
      expect(markup).toContain('data-pane-side="left"');
      expect(markup).toContain("workspace route content");
    }
  });

  it("keeps static no-left route metadata authoritative over route chrome", () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(
        <TestRouterProvider initialEntries={["/terms"]}>
          <AppWorkspaceShell>
            <LeftPaneRouteChromeProbe />
          </AppWorkspaceShell>
        </TestRouterProvider>,
      );
    });

    expect(getRequiredElement('[data-testid="route-chrome-left-probe"]').textContent).toBe(
      "Route content",
    );
    expect(
      rootElement.querySelector('[data-workspace-layout-part="pane"][data-pane-side="left"]'),
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
      '[data-workspace-layout-part="pane"][data-pane-side="main"] [data-workspace-layout-part="pane-header"]',
    );
    const rightToggle = getRequiredElement('button[aria-label="Toggle Right Sidebar"]');

    expect(mainHeader.textContent).not.toContain("samebase");
    expect(mainHeader.querySelector('[aria-label^="Switch organization"]')).toBeNull();
    expect(rightToggle.classList.contains("hidden")).toBe(false);
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

  it("prehydrates local sidebar widths before the client hydration update", async () => {
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

    const recoverableErrors = await hydrateClientShellFromServerMarkup({
      inspectPrehydratedMarkup: (carousel) => {
        expectPrehydrationStyle(
          {
            leftDesktopOpen: true,
            leftDesktopWidth: "360px",
            rightDesktopOpen: true,
            rightDesktopWidth: "420px",
          },
          carousel,
        );
      },
    });

    const viewport = getRequiredElement('[data-workspace-layout-part="carousel"]');
    expect(viewport.getAttribute("style")).toContain(
      "--workspace-layout-v2-left-desktop-width: 360px",
    );
    expect(viewport.getAttribute("style")).toContain(
      "--workspace-layout-v2-right-desktop-width: 420px",
    );
    expect(document.querySelector(APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_SELECTOR)).toBeNull();
    expect(recoverableErrors).toEqual([]);
  });

  it("hydrates no-left routes against stored left sidebar state without adding a left pane", async () => {
    window.localStorage.setItem(
      APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        state: {
          ...LOCAL_SIDEBAR_STATE,
          leftDesktopOpen: true,
          leftDesktopWidthPx: 360,
          mobilePane: "left",
        },
        version: 2,
      }),
    );

    const recoverableErrors = await hydrateClientShellFromServerMarkup({
      initialEntry: "/terms",
    });

    expect(
      rootElement?.querySelector('[data-workspace-layout-part="pane"][data-pane-side="left"]'),
    ).toBeNull();
    expect(getRequiredElement('[data-workspace-layout-part="carousel"]')).toBeInstanceOf(
      HTMLElement,
    );
    expect(getRequiredElement('[data-workspace-layout-part="address-chrome"]')).toBeInstanceOf(
      HTMLElement,
    );
    expect(document.querySelector(APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_SELECTOR)).toBeNull();
    expect(recoverableErrors).toEqual([]);
  });

  it("clears the temporary prehydration style element", () => {
    window.localStorage.setItem(
      APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        state: LOCAL_SIDEBAR_STATE,
        version: 2,
      }),
    );

    const { carousel, scriptElement } = appendPrehydrationCarousel({});
    runAppWorkspaceSidebarPrehydrationScript(scriptElement);

    expectPrehydrationStyle(
      {
        leftDesktopOpen: false,
        leftDesktopWidth: "0px",
        rightDesktopOpen: true,
        rightDesktopWidth: "340px",
      },
      carousel,
    );

    clearAppWorkspaceSidebarDesktopPrehydrationStyle();

    expect(document.querySelector(APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_SELECTOR)).toBeNull();
    expect(carousel.hasAttribute(APP_WORKSPACE_SIDEBAR_PREHYDRATION_SCOPE_ATTRIBUTE)).toBe(false);
  });

  it("does not prehydrate invalid local sidebar widths", () => {
    window.localStorage.setItem(
      APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        state: {
          ...LOCAL_SIDEBAR_STATE,
          leftDesktopOpen: true,
          leftDesktopWidthPx: "360",
        },
        version: 2,
      }),
    );

    const { carousel, scriptElement } = appendPrehydrationCarousel({});
    runAppWorkspaceSidebarPrehydrationScript(scriptElement);

    expect(document.querySelector(APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_SELECTOR)).toBeNull();
    expect(carousel.hasAttribute(APP_WORKSPACE_SIDEBAR_PREHYDRATION_SCOPE_ATTRIBUTE)).toBe(false);
  });

  it("does not prehydrate a merged surface below the runtime main-width minimum", () => {
    window.localStorage.setItem(
      APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        state: {
          ...LOCAL_SIDEBAR_STATE,
          mobilePane: "right",
          mobileSurface: {
            kind: "merged",
            mainWidthPx: 0,
            side: "right",
          },
        },
        version: 2,
      }),
    );

    const { carousel, layoutRoot, scriptElement } = appendPrehydrationCarousel({});
    runAppWorkspaceSidebarPrehydrationScript(scriptElement);
    expect(document.querySelector(APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_SELECTOR)).toBeNull();
    expect(carousel.hasAttribute(APP_WORKSPACE_SIDEBAR_PREHYDRATION_SCOPE_ATTRIBUTE)).toBe(false);

    withMobileViewportWidth(390, () => {
      runAppWorkspaceMobilePanePrehydrationScript(scriptElement);
    });

    expect(layoutRoot.getAttribute("data-mobile-pane")).toBe("main");
    expect(layoutRoot.hasAttribute("data-workspace-layout-v2-mobile-merged-side")).toBe(false);
    expect(layoutRoot.style.length).toBe(0);
    expect(carousel.scrollLeft).toBe(0);
  });

  it("prehydrates closed local sidebars as zero width", () => {
    window.localStorage.setItem(
      APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        state: {
          ...LOCAL_SIDEBAR_STATE,
          leftDesktopOpen: false,
          rightDesktopOpen: false,
        },
        version: 2,
      }),
    );

    const { carousel, scriptElement } = appendPrehydrationCarousel({});
    runAppWorkspaceSidebarPrehydrationScript(scriptElement);

    expectPrehydrationStyle(
      {
        leftDesktopOpen: false,
        leftDesktopWidth: "0px",
        rightDesktopOpen: false,
        rightDesktopWidth: "0px",
      },
      carousel,
    );
  });

  it("prehydrates the unmerged mobile pane before hydration", () => {
    window.localStorage.setItem(
      APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        state: {
          ...LOCAL_SIDEBAR_STATE,
          leftMobileWidthPx: 260,
          mobilePane: "right",
          mobileSurface: { kind: "unmerged" },
          rightMobileWidthPx: 340,
        },
        version: 2,
      }),
    );
    const { carousel, layoutRoot, scriptElement } = appendPrehydrationCarousel({});

    withMobileViewportWidth(390, () => {
      runAppWorkspaceMobilePanePrehydrationScript(scriptElement);
    });

    expect(
      document.querySelector("style#samebase-app-workspace-sidebar-mobile-prehydration"),
    ).toBeNull();
    expect(layoutRoot.style.getPropertyValue("--workspace-layout-v2-left-mobile-width")).toBe(
      "260px",
    );
    expect(layoutRoot.style.getPropertyValue("--workspace-layout-v2-main-mobile-width")).toBe(
      "390px",
    );
    expect(layoutRoot.style.getPropertyValue("--workspace-layout-v2-right-mobile-width")).toBe(
      "340px",
    );
    expect(carousel.scrollLeft).toBe(600);
    expect(layoutRoot.getAttribute("data-mobile-pane")).toBe("right");
    expect(layoutRoot.hasAttribute("data-workspace-layout-v2-mobile-merged-side")).toBe(false);
    expect(
      carousel
        .querySelector('[data-workspace-layout-part="pane"][data-pane-side="main"]')
        ?.getAttribute("data-workspace-layout-part"),
    ).toBe("pane");
  });

  it("fits a persisted merged mobile pane to the current viewport before hydration", () => {
    window.localStorage.setItem(
      APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        state: {
          ...LOCAL_SIDEBAR_STATE,
          leftMobileWidthPx: 260,
          mobilePane: "right",
          mobileSurface: {
            kind: "merged",
            mainWidthPx: 302,
            side: "right",
          },
          rightMobileWidthPx: 1,
        },
        version: 2,
      }),
    );
    const { carousel, layoutRoot, scriptElement } = appendPrehydrationCarousel({});

    withMobileViewportWidth(390, () => {
      runAppWorkspaceMobilePanePrehydrationScript(scriptElement);
    });

    expect(layoutRoot.style.getPropertyValue("--workspace-layout-v2-left-mobile-width")).toBe(
      "260px",
    );
    expect(layoutRoot.style.getPropertyValue("--workspace-layout-v2-main-mobile-width")).toBe(
      "260px",
    );
    expect(layoutRoot.style.getPropertyValue("--workspace-layout-v2-right-mobile-width")).toBe(
      "130px",
    );
    expect(carousel.scrollLeft).toBe(260);
    expect(layoutRoot.getAttribute("data-mobile-pane")).toBe("right");
    expect(layoutRoot.getAttribute("data-workspace-layout-v2-mobile-merged-side")).toBe("right");
    expect(
      carousel
        .querySelector('[data-workspace-layout-part="pane"][data-pane-side="main"]')
        ?.getAttribute("data-workspace-layout-part"),
    ).toBe("pane");
  });

  it("prehydrates a persisted merge as unmerged geometry for slide behavior", () => {
    window.localStorage.setItem(
      APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        state: {
          ...LOCAL_SIDEBAR_STATE,
          leftMobileWidthPx: 260,
          mobilePane: "right",
          mobileSurface: {
            kind: "merged",
            mainWidthPx: 260,
            side: "right",
          },
          rightMobileWidthPx: 130,
        },
        version: 2,
      }),
    );
    const { carousel, layoutRoot, scriptElement } = appendPrehydrationCarousel({
      mobileMinResizeBehavior: "min_resize_to_slide",
    });

    withMobileViewportWidth(390, () => {
      runAppWorkspaceMobilePanePrehydrationScript(scriptElement);
    });

    expect(layoutRoot.style.getPropertyValue("--workspace-layout-v2-main-mobile-width")).toBe(
      "390px",
    );
    expect(carousel.scrollLeft).toBe(390);
    expect(layoutRoot.getAttribute("data-mobile-pane")).toBe("right");
    expect(layoutRoot.hasAttribute("data-workspace-layout-v2-mobile-merged-side")).toBe(false);
  });

  it("prehydrates invalid merged mobile pane state as unmerged geometry", () => {
    window.localStorage.setItem(
      APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        state: {
          ...LOCAL_SIDEBAR_STATE,
          leftMobileWidthPx: 260,
          mobilePane: "right",
          mobileSurface: {
            kind: "merged",
            mainWidthPx: 294,
            side: "right",
          },
          rightMobileWidthPx: 340,
        },
        version: 2,
      }),
    );
    const { carousel, layoutRoot, scriptElement } = appendPrehydrationCarousel({});

    withMobileViewportWidth(390, () => {
      runAppWorkspaceMobilePanePrehydrationScript(scriptElement);
    });

    expect(layoutRoot.style.getPropertyValue("--workspace-layout-v2-left-mobile-width")).toBe(
      "260px",
    );
    expect(layoutRoot.style.getPropertyValue("--workspace-layout-v2-main-mobile-width")).toBe(
      "390px",
    );
    expect(layoutRoot.style.getPropertyValue("--workspace-layout-v2-right-mobile-width")).toBe(
      "340px",
    );
    expect(carousel.scrollLeft).toBe(600);
    expect(layoutRoot.hasAttribute("data-workspace-layout-v2-mobile-merged-side")).toBe(false);
    expect(
      carousel
        .querySelector('[data-workspace-layout-part="pane"][data-pane-side="main"]')
        ?.getAttribute("data-workspace-layout-part"),
    ).toBe("pane");
  });

  it("uses default sidebar width fallbacks in server markup", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/logo"]}>
        <AppWorkspaceShell>
          <div data-testid="workspace-route-content">workspace route content</div>
        </AppWorkspaceShell>
      </TestRouterProvider>,
    );

    expect(markup).toContain("--workspace-layout-v2-left-desktop-width:240px");
    expect(markup).toContain("--workspace-layout-v2-right-desktop-width:288px");
  });
});
