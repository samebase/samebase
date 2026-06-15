// @vitest-environment jsdom

import { createContext, Script } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import * as React from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AppWorkspaceRouteChrome, AppWorkspaceShell } from "./AppWorkspaceShell";
import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";
import {
  appWorkspaceMobilePanePrehydrationScript,
  appWorkspaceSidebarPrehydrationScript,
  clearAppWorkspaceSidebarPrehydrationStyle,
} from "@/lib/appWorkspaceSidebarPrehydration";
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

const APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_SELECTOR =
  "style#noter-app-workspace-sidebar-prehydration";
const APP_WORKSPACE_SIDEBAR_MOBILE_PREHYDRATION_STYLE_SELECTOR =
  "style#noter-app-workspace-sidebar-mobile-prehydration";
const APP_WORKSPACE_SIDEBAR_PREHYDRATION_UNMEASURED_SELECTOR =
  ".workspace-layout-v2-responsive-viewport:not([data-workspace-layout-v2-measured])";

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
    clearAppWorkspaceSidebarPrehydrationStyle();
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

  function runAppWorkspaceSidebarPrehydrationScript(
    contextOverrides: Record<string, unknown> = {},
  ) {
    new Script(appWorkspaceSidebarPrehydrationScript).runInContext(
      createContext({
        document,
        JSON,
        Math,
        Number,
        window,
        ...contextOverrides,
      }),
    );
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

  function appendMobilePrehydrationCarousel({
    includeLeftPane = true,
    includeRightPane = true,
    peekWidthPx = 0,
  }: {
    includeLeftPane?: boolean;
    includeRightPane?: boolean;
    peekWidthPx?: number;
  }) {
    const container = document.createElement("div");
    const layoutRoot = document.createElement("div");
    const carousel = document.createElement("div");
    const frameworkScriptElement = document.createElement("script");
    const scriptElement = document.createElement("script");
    carousel.className = "workspace-layout-v2-responsive-viewport";
    carousel.style.paddingLeft = `${peekWidthPx}px`;
    carousel.style.paddingRight = `${peekWidthPx}px`;
    layoutRoot.setAttribute("data-mobile-pane", "main");
    layoutRoot.setAttribute("data-workspace-layout-v2", "responsive");

    if (includeLeftPane) {
      const leftPane = document.createElement("div");
      leftPane.className =
        "workspace-layout-v2-responsive-left-pane workspace-mobile-pane-separators";
      leftPane.setAttribute("data-testid", "workspace-layout-v2-pane-left");
      carousel.append(leftPane);
    }

    const mainPane = document.createElement("div");
    const mainPaneSurface = document.createElement("div");
    mainPane.className = "workspace-layout-v2-responsive-main-pane";
    mainPane.setAttribute("data-workspace-layout-v2-mobile-main-pane", "");
    mainPaneSurface.setAttribute("data-workspace-layout-v2-mobile-main-pane-surface", "");
    mainPane.append(mainPaneSurface);
    carousel.append(mainPane);

    if (includeRightPane) {
      const rightPane = document.createElement("div");
      rightPane.className =
        "workspace-layout-v2-responsive-right-pane workspace-mobile-pane-separators";
      rightPane.setAttribute("data-testid", "workspace-layout-v2-pane-right");
      carousel.append(rightPane);
    }

    layoutRoot.append(carousel);
    container.append(layoutRoot, frameworkScriptElement, scriptElement);
    document.body.append(container);

    return {
      carousel,
      layoutRoot,
      scriptElement,
    };
  }

  async function hydrateClientShellFromServerMarkup() {
    const recoverableErrors: unknown[] = [];
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

  function getRequiredPrehydrationStyleText() {
    return getRequiredDocumentElement(APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_SELECTOR)
      .textContent;
  }

  function getRequiredMobilePrehydrationStyleText() {
    return getRequiredDocumentElement(APP_WORKSPACE_SIDEBAR_MOBILE_PREHYDRATION_STYLE_SELECTOR)
      .textContent;
  }

  type ExpectedPrehydrationGeometry = {
    leftDesktopOpen: boolean;
    leftDesktopWidth: string;
    rightDesktopOpen: boolean;
    rightDesktopWidth: string;
  };

  function expectPrehydrationStyleText({
    leftDesktopOpen,
    leftDesktopWidth,
    rightDesktopOpen,
    rightDesktopWidth,
    styleText,
  }: ExpectedPrehydrationGeometry & { styleText: string }) {
    expect(styleText).toContain("@layer utilities");
    expect(styleText).toContain("@media (min-width: 768px)");
    expect(styleText).toContain(
      `${APP_WORKSPACE_SIDEBAR_PREHYDRATION_UNMEASURED_SELECTOR} .workspace-layout-v2-responsive-left-pane`,
    );
    expect(styleText).toContain(`width: ${leftDesktopWidth} !important;`);
    if (leftDesktopOpen) {
      expect(styleText).not.toContain("border-right-width: 0 !important;");
    } else {
      expect(styleText).toContain("border-right-width: 0 !important;");
    }
    expect(styleText).toContain(
      `${APP_WORKSPACE_SIDEBAR_PREHYDRATION_UNMEASURED_SELECTOR} .workspace-layout-v2-responsive-right-pane`,
    );
    expect(styleText).toContain(`width: ${rightDesktopWidth} !important;`);
    if (rightDesktopOpen) {
      expect(styleText).not.toContain("border-left-width: 0 !important;");
    } else {
      expect(styleText).toContain("border-left-width: 0 !important;");
    }
  }

  function expectPrehydrationStyle(expectedGeometry: ExpectedPrehydrationGeometry) {
    expectPrehydrationStyleText({
      ...expectedGeometry,
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

    runAppWorkspaceSidebarPrehydrationScript();

    expectPrehydrationStyle({
      leftDesktopOpen: true,
      leftDesktopWidth: "360px",
      rightDesktopOpen: true,
      rightDesktopWidth: "420px",
    });

    const recoverableErrors = await hydrateClientShellFromServerMarkup();

    const viewport = getRequiredElement('[data-testid="workspace-layout-v2-pane-main"]');
    expect(viewport.getAttribute("style")).toContain(
      "--workspace-layout-v2-left-desktop-width: 360px",
    );
    expect(viewport.getAttribute("style")).toContain(
      "--workspace-layout-v2-right-desktop-width: 420px",
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

    runAppWorkspaceSidebarPrehydrationScript();

    expectPrehydrationStyle({
      leftDesktopOpen: false,
      leftDesktopWidth: "0px",
      rightDesktopOpen: true,
      rightDesktopWidth: "340px",
    });

    clearAppWorkspaceSidebarPrehydrationStyle();

    expect(document.querySelector(APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_SELECTOR)).toBeNull();
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

    runAppWorkspaceSidebarPrehydrationScript();

    expect(document.querySelector(APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_SELECTOR)).toBeNull();
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

    runAppWorkspaceSidebarPrehydrationScript();

    expectPrehydrationStyle({
      leftDesktopOpen: false,
      leftDesktopWidth: "0px",
      rightDesktopOpen: false,
      rightDesktopWidth: "0px",
    });
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
    const { carousel, layoutRoot, scriptElement } = appendMobilePrehydrationCarousel({});

    withMobileViewportWidth(390, () => {
      runAppWorkspaceMobilePanePrehydrationScript(scriptElement);
    });

    const styleText = getRequiredMobilePrehydrationStyleText();
    expect(styleText).toContain("@media (max-width: 767px)");
    expect(styleText).toContain(
      `${APP_WORKSPACE_SIDEBAR_PREHYDRATION_UNMEASURED_SELECTOR} .workspace-layout-v2-responsive-left-pane`,
    );
    expect(styleText).toContain("width: 260px !important;");
    expect(styleText).toContain("width: 390px !important;");
    expect(styleText).toContain("width: 340px !important;");
    expect(carousel.scrollLeft).toBe(600);
    expect(layoutRoot.getAttribute("data-mobile-pane")).toBe("right");
    expect(
      carousel
        .querySelector('[data-testid="workspace-layout-v2-pane-left"]')
        ?.classList.contains("workspace-mobile-pane-separators"),
    ).toBe(true);
    expect(
      carousel
        .querySelector("[data-workspace-layout-v2-mobile-main-pane-surface]")
        ?.classList.contains("workspace-mobile-pane-separators"),
    ).toBe(true);
    expect(
      carousel
        .querySelector('[data-testid="workspace-layout-v2-pane-right"]')
        ?.classList.contains("workspace-mobile-pane-separators"),
    ).toBe(false);
  });

  it("leaves merged mobile pane state for React hydration", () => {
    window.localStorage.setItem(
      APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        state: {
          ...LOCAL_SIDEBAR_STATE,
          mobilePane: "right",
          mobileSurface: {
            kind: "merged",
            mainWidthPx: 294,
            side: "right",
          },
        },
        version: 2,
      }),
    );
    const { carousel, scriptElement } = appendMobilePrehydrationCarousel({});

    withMobileViewportWidth(390, () => {
      runAppWorkspaceMobilePanePrehydrationScript(scriptElement);
    });

    expect(
      document.querySelector(APP_WORKSPACE_SIDEBAR_MOBILE_PREHYDRATION_STYLE_SELECTOR),
    ).toBeNull();
    expect(carousel.scrollLeft).toBe(0);
  });

  it("uses default sidebar width fallbacks in server markup", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <AppWorkspaceShell>
          <div data-testid="workspace-route-content">workspace route content</div>
        </AppWorkspaceShell>
      </TestRouterProvider>,
    );

    expect(markup).toContain("--workspace-layout-v2-left-desktop-width:240px");
    expect(markup).toContain("--workspace-layout-v2-right-desktop-width:288px");
  });
});
