// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  MIN_WORKSPACE_MOBILE_MAIN_PEEK_WIDTH_PX,
} from "@/lib/workspacePaneSizes";
import type { WorkspaceSidebarState } from "../../../convex/userPreferenceModel";
import { WorkspaceLayoutV2FullPage } from "./WorkspaceLayoutV2FullPage";
import {
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
  getMobileSidebarMaxWidthPx,
  getMobileSidebarMinWidthPx,
  getMobilePaneScrollProgress,
  type WorkspaceLayoutV2MobileMinResizeBehavior,
} from "./WorkspaceLayoutV2Geometry";
import {
  WorkspacePaneRuntimeProvider,
  useWorkspacePaneActions,
  useWorkspacePaneState,
  type WorkspacePaneState,
} from "./WorkspacePaneRuntime";
import { WorkspaceLayoutV2MemorySidebarProvider } from "./WorkspaceLayoutV2MemorySidebarProvider";
import { useWorkspaceLayoutV2MemorySidebarController } from "./useWorkspaceLayoutV2MemorySidebarController";

const { act } = React;

const VIEWPORT_WIDTH_PX = 390;
const VIEWPORT_HEIGHT_PX = 844;
const MOBILE_SIDEBAR_MIN_WIDTH_PX = 130;
const NARROW_VIEWPORT_WIDTH_PX = 320;
const NARROW_MOBILE_SIDEBAR_MIN_WIDTH_PX = 106;
const NARROW_MOBILE_MAIN_WIDTH_PX = 214;
const OMIT_HEADER = Symbol("omit-header");

const originalGetBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "getBoundingClientRect",
);
let latestSetRenderedMobilePane: ((nextPane: WorkspaceSidebarState["mobilePane"]) => void) | null =
  null;
let latestOpenRightPane: (() => void) | null = null;
let latestRenderedPaneState: WorkspacePaneState | null = null;
let testViewportWidthPx = VIEWPORT_WIDTH_PX;
let testViewportHeightPx = VIEWPORT_HEIGHT_PX;
let testHasAnyFineHoverPointer = false;
let testPrefersReducedMotion = false;

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches:
      query === "(prefers-reduced-motion: reduce)"
        ? testPrefersReducedMotion
        : query === "(any-hover: hover) and (any-pointer: fine)" && testHasAnyFineHoverPointer,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })),
});

Object.defineProperty(window, "innerWidth", {
  configurable: true,
  get: () => testViewportWidthPx,
});

Object.defineProperty(window, "innerHeight", {
  configurable: true,
  get: () => testViewportHeightPx,
});

HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return DOMRect.fromRect({
    height: testViewportHeightPx,
    width: testViewportWidthPx,
    x: 0,
    y: 0,
  });
};

type RenderMobileLayoutArgs = {
  includeLeftPane?: boolean;
  includeRightPane?: boolean;
  leftMobileWidthPx?: number;
  leftToggleVisibility?: "all" | "desktop" | "hidden";
  mainHeader?: React.ReactNode | typeof OMIT_HEADER;
  mobileMinResizeBehavior?: WorkspaceLayoutV2MobileMinResizeBehavior;
  mobilePane?: WorkspaceSidebarState["mobilePane"];
  mobileSurface?: WorkspaceSidebarState["mobileSurface"];
  rightMobileWidthPx?: number;
  rightToggleVisibility?: "all" | "desktop" | "hidden";
};

function createMobileSidebarState({
  leftMobileWidthPx = DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  mobilePane = "main",
  mobileSurface = { kind: "unmerged" },
  rightMobileWidthPx = DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
}: Pick<
  RenderMobileLayoutArgs,
  "leftMobileWidthPx" | "mobilePane" | "mobileSurface" | "rightMobileWidthPx"
>): WorkspaceSidebarState {
  return {
    leftDesktopOpen: true,
    leftDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
    leftMobileWidthPx,
    mobilePane,
    mobileSurface,
    rightDesktopOpen: false,
    rightDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
    rightMobileWidthPx,
  };
}

function renderMobileLayoutContent({
  includeLeftPane = true,
  includeRightPane = true,
  leftToggleVisibility,
  mainHeader = OMIT_HEADER,
  mobileMinResizeBehavior,
  rightToggleVisibility,
}: Omit<
  RenderMobileLayoutArgs,
  "leftMobileWidthPx" | "mobilePane" | "mobileSurface" | "rightMobileWidthPx"
>) {
  const mainProps =
    mainHeader === OMIT_HEADER
      ? {
          headerTestId: "workspace-layout-v2-main-header-row",
          content: <div>main pane</div>,
        }
      : {
          header: mainHeader,
          headerTestId: "workspace-layout-v2-main-header-row",
          content: <div>main pane</div>,
        };

  return (
    <WorkspaceLayoutV2FullPage
      addressChrome={<div data-testid="test-address-chrome">/test</div>}
      left={
        includeLeftPane
          ? {
              content: <div>left pane</div>,
            }
          : undefined
      }
      main={mainProps}
      mobileMinResizeBehavior={mobileMinResizeBehavior}
      right={
        includeRightPane
          ? {
              content: <div>right pane</div>,
            }
          : undefined
      }
      leftToggleVisibility={leftToggleVisibility}
      rightToggleVisibility={rightToggleVisibility}
    />
  );
}

function renderMobileLayout({
  leftMobileWidthPx,
  mobilePane,
  mobileSurface,
  rightMobileWidthPx,
  ...contentProps
}: RenderMobileLayoutArgs) {
  const initialState = createMobileSidebarState({
    leftMobileWidthPx,
    mobilePane,
    mobileSurface,
    rightMobileWidthPx,
  });
  const initialStateKey = `${initialState.leftMobileWidthPx}|${initialState.mobilePane}|${JSON.stringify(initialState.mobileSurface)}|${initialState.rightMobileWidthPx}`;

  return (
    <WorkspaceLayoutV2MemorySidebarProvider key={initialStateKey} initialState={initialState}>
      <WorkspacePaneStateProbe />
      {renderMobileLayoutContent(contentProps)}
    </WorkspaceLayoutV2MemorySidebarProvider>
  );
}

function WorkspacePaneStateProbe() {
  latestRenderedPaneState = useWorkspacePaneState();
  return null;
}

function WorkspacePaneActionsProbe() {
  latestOpenRightPane = useWorkspacePaneActions().openRightPane;
  return null;
}

function ControlledMobileLayout() {
  const controller = useWorkspaceLayoutV2MemorySidebarController(
    createMobileSidebarState({ mobilePane: "main" }),
  );
  latestSetRenderedMobilePane = (nextPane) => {
    controller.setState((state) => ({ ...state, mobilePane: nextPane }), "immediate");
  };

  return (
    <WorkspacePaneRuntimeProvider controller={controller}>
      <WorkspacePaneActionsProbe />
      {renderMobileLayoutContent({})}
    </WorkspacePaneRuntimeProvider>
  );
}

function ControlledMergedLeftMobileLayout() {
  const controller = useWorkspaceLayoutV2MemorySidebarController(
    createMobileSidebarState({
      leftMobileWidthPx: MOBILE_SIDEBAR_MIN_WIDTH_PX,
      mobilePane: "left",
    }),
  );
  latestSetRenderedMobilePane = (nextPane) => {
    controller.setState((state) => ({ ...state, mobilePane: nextPane }), "immediate");
  };

  return (
    <WorkspacePaneRuntimeProvider controller={controller}>
      {renderMobileLayoutContent({})}
    </WorkspacePaneRuntimeProvider>
  );
}

function getRequiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected element for selector: ${selector}`);
  }

  return element;
}

function expectWorkspaceMobileMergedSide(root: ParentNode, side: "left" | "right" | null) {
  expect(
    root
      .querySelector("[data-workspace-layout-v2]")
      ?.getAttribute("data-workspace-layout-v2-mobile-merged-side"),
  ).toBe(side);
}

function expectMobilePaneSeparatorOwnership(
  root: ParentNode,
  activePane: "left" | "main" | "right",
) {
  expect(root.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane")).toBe(
    activePane,
  );
  const leftPane = getRequiredElement(root, '[data-testid="workspace-layout-v2-pane-left"]');
  const mainPane = getRequiredElement(root, "[data-workspace-layout-v2-mobile-main-pane] > div");
  const rightPane = getRequiredElement(root, '[data-testid="workspace-layout-v2-pane-right"]');
  const paneEntries = [
    ["left", leftPane],
    ["main", mainPane],
    ["right", rightPane],
  ] as const;

  for (const [paneName, paneNode] of paneEntries) {
    expect(paneNode.classList.contains("border-x")).toBe(false);
    expect(paneNode.classList.contains("border-x-0")).toBe(false);
    expect(paneNode.classList.contains("border-border")).toBe(false);
    expect(paneNode.getAttribute("data-workspace-layout-v2-mobile-separator-pane")).toBe(paneName);
  }
}

describe("getMobilePaneScrollProgress", () => {
  const threePaneGeometry = {
    hasLeftPane: true,
    hasRightPane: true,
    leftWidthPx: 240,
    mainWidthPx: 390,
    mergedSurfaceSide: null,
    rightWidthPx: 288,
    viewportWidthPx: 390,
  } as const;

  it("maps native carousel positions to signed progress around main", () => {
    expect(getMobilePaneScrollProgress({ ...threePaneGeometry, scrollLeftPx: 0 })).toBe(-1);
    expect(getMobilePaneScrollProgress({ ...threePaneGeometry, scrollLeftPx: 240 })).toBe(0);
    expect(getMobilePaneScrollProgress({ ...threePaneGeometry, scrollLeftPx: 384 })).toBe(0.5);
    expect(getMobilePaneScrollProgress({ ...threePaneGeometry, scrollLeftPx: 528 })).toBe(1);
  });

  it("uses the main-to-right distance when the landing has no left pane", () => {
    expect(
      getMobilePaneScrollProgress({
        ...threePaneGeometry,
        hasLeftPane: false,
        leftWidthPx: 0,
        scrollLeftPx: 144,
      }),
    ).toBe(0.5);
  });

  it("becomes neutral when main is fully merged into a sidebar", () => {
    expect(
      getMobilePaneScrollProgress({
        hasLeftPane: false,
        hasRightPane: true,
        leftWidthPx: 0,
        mainWidthPx: 260,
        mergedSurfaceSide: "right",
        rightWidthPx: MOBILE_SIDEBAR_MIN_WIDTH_PX,
        scrollLeftPx: 0,
        viewportWidthPx: 390,
      }),
    ).toBe(0);
    expect(
      getMobilePaneScrollProgress({
        hasLeftPane: true,
        hasRightPane: false,
        leftWidthPx: MOBILE_SIDEBAR_MIN_WIDTH_PX,
        mainWidthPx: 260,
        mergedSurfaceSide: "left",
        rightWidthPx: 0,
        scrollLeftPx: 0,
        viewportWidthPx: 390,
      }),
    ).toBe(0);
  });
});

describe("getMobileSidebarMinWidthPx", () => {
  it("uses the 175px standard when it is less than one third of the page", () => {
    const viewportWidthPx = 600;

    expect(
      getMobileSidebarMinWidthPx({
        configuredMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
        maxWidthPx: getMobileSidebarMaxWidthPx(viewportWidthPx),
        viewportWidthPx,
      }),
    ).toBe(175);
  });

  it("uses one third of the page on narrow mobile viewports", () => {
    expect(
      getMobileSidebarMinWidthPx({
        configuredMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
        maxWidthPx: getMobileSidebarMaxWidthPx(VIEWPORT_WIDTH_PX),
        viewportWidthPx: VIEWPORT_WIDTH_PX,
      }),
    ).toBe(MOBILE_SIDEBAR_MIN_WIDTH_PX);
    expect(
      getMobileSidebarMinWidthPx({
        configuredMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
        maxWidthPx: getMobileSidebarMaxWidthPx(NARROW_VIEWPORT_WIDTH_PX),
        viewportWidthPx: NARROW_VIEWPORT_WIDTH_PX,
      }),
    ).toBe(NARROW_MOBILE_SIDEBAR_MIN_WIDTH_PX);
  });
});

describe("WorkspaceLayoutV2 mobile boot alignment", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
  });

  afterEach(() => {
    testViewportWidthPx = VIEWPORT_WIDTH_PX;
    testViewportHeightPx = VIEWPORT_HEIGHT_PX;
    testHasAnyFineHoverPointer = false;
    testPrefersReducedMotion = false;
    latestOpenRightPane = null;
    latestRenderedPaneState = null;
    latestSetRenderedMobilePane = null;
    if (root !== null) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
    }
    root = null;
    rootElement?.remove();
    rootElement = null;
  });

  it("boots mobile routes onto the main pane by default", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(renderMobileLayout({}));
    });

    const carouselNode = rootElement.querySelector('[data-testid="workspace-layout-v2-pane-main"]');

    expect(carouselNode).not.toBeNull();
    expect(carouselNode?.scrollLeft).toBe(DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX);
    expect(
      rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
    ).toBe("main");
    expect(rootElement.querySelector('[data-testid="workspace-layout-v2-left-resize"]')).toBeNull();
    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-right-resize"]'),
    ).toBeNull();
  });

  it("boots mobile routes onto the persisted pane when one is provided", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(renderMobileLayout({ mobilePane: "right" }));
    });

    const carouselNode = rootElement.querySelector('[data-testid="workspace-layout-v2-pane-main"]');

    expect(carouselNode).not.toBeNull();
    expect(carouselNode?.scrollLeft).toBe(DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX * 2);
    expect(
      rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
    ).toBe("right");
  });

  it("keeps the all-viewport sidebar toggle opt-in", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(renderMobileLayout({}));
    });

    expect(rootElement.querySelector('button[aria-label="Toggle sidebar"]')).toBeNull();
    expect(
      getRequiredElement(rootElement, '[aria-label="Toggle Right Sidebar"]').classList.contains(
        "hidden",
      ),
    ).toBe(true);

    act(() => {
      mountedRoot.render(renderMobileLayout({ leftToggleVisibility: "all" }));
    });

    const toggle = getRequiredElement(rootElement, 'button[aria-label="Toggle sidebar"]');
    expect(
      rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
    ).toBe("main");

    act(() => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
    ).toBe("left");
  });

  it("keeps the right all-viewport sidebar toggle opt-in", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(renderMobileLayout({ rightToggleVisibility: "all" }));
    });

    const rightToggle = getRequiredElement(rootElement, '[aria-label="Toggle Right Sidebar"]');
    expect(
      rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
    ).toBe("main");

    act(() => {
      rightToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
    ).toBe("right");
  });

  it("scrolls the carousel when code recenters the mobile pane after mount", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(<ControlledMobileLayout />);
    });

    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-pane-main"]'),
    ).not.toBeNull();
    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-pane-main"]')?.scrollLeft,
    ).toBe(DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX);

    act(() => {
      latestSetRenderedMobilePane?.("right");
    });

    expect(
      rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
    ).toBe("right");
    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-pane-main"]')?.scrollLeft,
    ).toBe(DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX * 2);

    act(() => {
      latestSetRenderedMobilePane?.("main");
    });

    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-pane-main"]')?.scrollLeft,
    ).toBe(DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX);
    expect(
      rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
    ).toBe("main");
  });

  it("smoothly opens the right pane for an explicit user action", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(<ControlledMobileLayout />);
    });

    const carouselNode = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-pane-main"]',
    );
    const scrollToCalls: ScrollToOptions[] = [];
    carouselNode.scrollTo = (first?: ScrollToOptions | number, y?: number) => {
      if (typeof first === "number") {
        carouselNode.scrollLeft = first;
        carouselNode.scrollTop = y ?? carouselNode.scrollTop;
        return;
      }

      const options = first ?? {};
      scrollToCalls.push(options);
      carouselNode.scrollLeft = options.left ?? carouselNode.scrollLeft;
    };

    act(() => {
      latestOpenRightPane?.();
    });

    expect(scrollToCalls).toEqual([
      {
        behavior: "smooth",
        left: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX * 2,
      },
    ]);
    expect(
      rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
    ).toBe("main");

    act(() => {
      carouselNode.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    expect(
      rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
    ).toBe("right");
  });

  it("opens the right pane without motion when reduced motion is requested", () => {
    testPrefersReducedMotion = true;
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(<ControlledMobileLayout />);
    });

    const carouselNode = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-pane-main"]',
    );
    const scrollToCalls: ScrollToOptions[] = [];
    carouselNode.scrollTo = (first?: ScrollToOptions | number) => {
      if (typeof first !== "number") {
        scrollToCalls.push(first ?? {});
      }
    };

    act(() => {
      latestOpenRightPane?.();
    });

    expect(scrollToCalls).toEqual([]);
    expect(carouselNode.scrollLeft).toBe(DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX * 2);
    expect(
      rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
    ).toBe("right");
  });

  it("keeps the resize grip reachable when a mobile sidebar fills the viewport", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(
        renderMobileLayout({
          mobilePane: "right",
          rightMobileWidthPx: VIEWPORT_WIDTH_PX,
        }),
      );
    });

    const maxReachableSidebarWidthPx = VIEWPORT_WIDTH_PX - MIN_WORKSPACE_MOBILE_MAIN_PEEK_WIDTH_PX;
    const carouselNode = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-pane-main"]',
    );
    const mainPane = getRequiredElement(rootElement, "[data-workspace-layout-v2-mobile-main-pane]");
    const rightPane = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-pane-right"]',
    );
    const rightHandle = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-right-resize"]',
    );

    expect(carouselNode.scrollLeft).toBe(
      DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX + maxReachableSidebarWidthPx,
    );
    expect(mainPane.style.width).toBe(`${VIEWPORT_WIDTH_PX}px`);
    expect(rightPane.style.width).toBe(`${maxReachableSidebarWidthPx}px`);
    expect(rightHandle.getAttribute("aria-valuemax")).toBe(`${maxReachableSidebarWidthPx}`);
    expect(rightHandle.getAttribute("aria-valuenow")).toBe(`${maxReachableSidebarWidthPx}`);
    expect(rightHandle.parentElement?.style.left).toBe(
      `${MIN_WORKSPACE_MOBILE_MAIN_PEEK_WIDTH_PX}px`,
    );
  });

  it("lets the left sidebar stay borderless while the main pane owns the separator", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(renderMobileLayout({ mobilePane: "left" }));
    });

    expectMobilePaneSeparatorOwnership(rootElement, "left");
  });

  it("lets the sidebars own both separators while the main pane is visible", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(renderMobileLayout({ mobilePane: "main" }));
    });

    expectMobilePaneSeparatorOwnership(rootElement, "main");
  });

  it("keeps the left pane addressable on mobile layouts without a right pane", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(
        renderMobileLayout({
          mobilePane: "left",
          includeRightPane: false,
        }),
      );
    });

    expect(
      rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
    ).toBe("left");
    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-pane-main"]')?.scrollLeft,
    ).toBe(0);
  });

  it("omits a stale left mobile pane when a route does not provide a left pane", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(
        renderMobileLayout({
          includeLeftPane: false,
          leftMobileWidthPx: MOBILE_SIDEBAR_MIN_WIDTH_PX,
          mobilePane: "left",
          mobileSurface: {
            kind: "merged",
            mainWidthPx: VIEWPORT_WIDTH_PX - MOBILE_SIDEBAR_MIN_WIDTH_PX,
            side: "left",
          },
        }),
      );
    });

    expect(
      rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
    ).toBe("main");
    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-pane-main"]')?.scrollLeft,
    ).toBe(0);
    expect(rootElement.querySelector('[data-testid="workspace-layout-v2-pane-left"]')).toBeNull();
    expect(rootElement.querySelector('[data-testid="workspace-layout-v2-left-resize"]')).toBeNull();
    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-pane-right"]'),
    ).not.toBeNull();
    expect(latestRenderedPaneState?.mobilePane).toBe("left");
    expect(latestRenderedPaneState?.mobileSurface).toEqual({
      kind: "merged",
      mainWidthPx: VIEWPORT_WIDTH_PX - MOBILE_SIDEBAR_MIN_WIDTH_PX,
      side: "left",
    });
  });

  it("fits a persisted merged surface to the current mobile viewport", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(
        renderMobileLayout({
          leftMobileWidthPx: MOBILE_SIDEBAR_MIN_WIDTH_PX,
          mobilePane: "left",
          mobileSurface: {
            kind: "merged",
            mainWidthPx: 302,
            side: "left",
          },
        }),
      );
    });

    expectWorkspaceMobileMergedSide(rootElement, "left");
    expect(
      getRequiredElement(rootElement, "[data-workspace-layout-v2-mobile-main-pane]").style.width,
    ).toBe(`${VIEWPORT_WIDTH_PX - MOBILE_SIDEBAR_MIN_WIDTH_PX}px`);
    expect(latestRenderedPaneState?.mobileSurface).toEqual({
      kind: "merged",
      mainWidthPx: 302,
      side: "left",
    });
  });

  it("lets the right sidebar stay borderless while the main pane owns the separator", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(renderMobileLayout({ mobilePane: "right" }));
    });

    expectMobilePaneSeparatorOwnership(rootElement, "right");
  });

  it("omits mobile resize grips on the main pane", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(
        renderMobileLayout({
          mobilePane: "main",
        }),
      );
    });

    expect(rootElement.querySelector('[data-testid="workspace-layout-v2-left-resize"]')).toBeNull();
    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-right-resize"]'),
    ).toBeNull();
  });

  it("renders a three-dot resize grip when no fine hover pointer is available", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(
        renderMobileLayout({
          leftMobileWidthPx: 220,
          mobilePane: "left",
          rightMobileWidthPx: 300,
        }),
      );
    });

    const leftPane = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-pane-left"]',
    );
    const leftHandle = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-left-resize"]',
    );

    expect(leftPane.style.width).toBe("220px");
    expect(leftHandle.getAttribute("aria-valuemin")).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX}`);
    expect(leftHandle.getAttribute("aria-valuemax")).toBe("350");
    expect(leftHandle.getAttribute("aria-valuenow")).toBe("220");
    expect(leftHandle.parentElement?.style.left).toBe("220px");
    expect(leftHandle.querySelector("[data-workspace-layout-v2-resize-grip-dots]")).not.toBeNull();
    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-right-resize"]'),
    ).toBeNull();
  });

  it("renders a mobile resize grip on a left-only route by default", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(
        renderMobileLayout({
          includeRightPane: false,
          leftMobileWidthPx: 220,
          mobilePane: "left",
        }),
      );
    });

    const leftPane = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-pane-left"]',
    );
    const leftHandle = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-left-resize"]',
    );

    expect(
      rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
    ).toBe("left");
    expect(leftPane.style.width).toBe("220px");
    expect(leftHandle.getAttribute("aria-valuenow")).toBe("220");
    expect(leftHandle.parentElement?.style.left).toBe("220px");
    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-right-resize"]'),
    ).toBeNull();
  });

  it("renders a mobile resize grip on the active right sidebar by default", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(
        renderMobileLayout({
          leftMobileWidthPx: 220,
          mobilePane: "right",
          rightMobileWidthPx: 300,
        }),
      );
    });

    const rightPane = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-pane-right"]',
    );
    const rightHandle = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-right-resize"]',
    );

    expect(rightPane.style.width).toBe("300px");
    expect(rightHandle.getAttribute("aria-valuemin")).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX}`);
    expect(rightHandle.getAttribute("aria-valuemax")).toBe("350");
    expect(rightHandle.getAttribute("aria-valuenow")).toBe("300");
    expect(rightHandle.parentElement?.style.left).toBe("90px");
    expect(rootElement.querySelector('[data-testid="workspace-layout-v2-left-resize"]')).toBeNull();
  });

  it("clamps mobile sidebar widths to the responsive mobile minimum", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(
        renderMobileLayout({
          leftMobileWidthPx: 1,
          mobilePane: "left",
          rightMobileWidthPx: 1,
        }),
      );
    });

    const leftPane = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-pane-left"]',
    );
    const leftHandle = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-left-resize"]',
    );

    expect(leftPane.style.width).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX}px`);
    expect(leftHandle.getAttribute("aria-valuemin")).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX}`);
    expect(leftHandle.getAttribute("aria-valuenow")).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX}`);
    expect(leftHandle.parentElement?.style.left).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX}px`);

    act(() => {
      mountedRoot.render(
        renderMobileLayout({
          leftMobileWidthPx: 1,
          mobilePane: "right",
          rightMobileWidthPx: 1,
        }),
      );
    });

    const rightPane = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-pane-right"]',
    );
    const rightHandle = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-right-resize"]',
    );

    expect(rightPane.style.width).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX}px`);
    expect(rightHandle.getAttribute("aria-valuemin")).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX}`);
    expect(rightHandle.getAttribute("aria-valuenow")).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX}`);
    expect(rightHandle.parentElement?.style.left).toBe("260px");
  });

  it("lets default merge mode finish a below-min left resize into a fitted main pane", () => {
    vi.useFakeTimers();
    try {
      const mountedRoot = root;
      if (mountedRoot === null || rootElement === null) {
        throw new Error("Expected mounted root");
      }
      const rootElementNode = rootElement;

      act(() => {
        mountedRoot.render(
          renderMobileLayout({
            leftMobileWidthPx: MOBILE_SIDEBAR_MIN_WIDTH_PX,
            mobilePane: "left",
          }),
        );
      });

      const leftHandle = getRequiredElement(
        rootElement,
        '[data-testid="workspace-layout-v2-left-resize"]',
      );
      const getMainPane = () =>
        getRequiredElement(rootElementNode, "[data-workspace-layout-v2-mobile-main-pane]");

      expect(getMainPane().style.width).toBe("390px");

      act(() => {
        leftHandle.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowLeft",
          }),
        );
      });

      expect(getMainPane().style.width).toBe("260px");
      act(() => {
        leftHandle.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowLeft",
          }),
        );
      });

      expect(getMainPane().style.width).toBe("260px");
      expect(
        rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
      ).toBe("left");

      act(() => {
        vi.advanceTimersByTime(121);
      });

      expect(getMainPane().style.width).toBe("260px");
      expect(leftHandle.getAttribute("aria-valuenow")).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX}`);
      expect(
        rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
      ).toBe("left");

      act(() => {
        leftHandle.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowRight",
          }),
        );
      });

      expect(getMainPane().style.width).toBe("390px");
      expect(
        getRequiredElement(rootElement, '[data-testid="workspace-layout-v2-pane-left"]').style
          .width,
      ).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX + 24}px`);
      expect(leftHandle.parentElement?.style.left).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX + 24}px`);

      act(() => {
        vi.advanceTimersByTime(121);
      });

      expect(latestRenderedPaneState?.mobileSurface).toEqual({ kind: "unmerged" });
      expect(getMainPane().style.width).toBe("390px");
      expect(
        getRequiredElement(rootElement, '[data-testid="workspace-layout-v2-pane-left"]').style
          .width,
      ).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX + 24}px`);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a wide sidebar unmerged until it reaches the fixed merge threshold", () => {
    vi.useFakeTimers();
    try {
      const mountedRoot = root;
      if (mountedRoot === null || rootElement === null) {
        throw new Error("Expected mounted root");
      }
      const rootElementNode = rootElement;

      act(() => {
        mountedRoot.render(
          renderMobileLayout({
            leftMobileWidthPx: 240,
            mobilePane: "left",
          }),
        );
      });

      const leftHandle = getRequiredElement(
        rootElement,
        '[data-testid="workspace-layout-v2-left-resize"]',
      );
      const leftPane = getRequiredElement(
        rootElement,
        '[data-testid="workspace-layout-v2-pane-left"]',
      );
      const getMainPane = () =>
        getRequiredElement(rootElementNode, "[data-workspace-layout-v2-mobile-main-pane]");

      for (let index = 0; index < 2; index += 1) {
        act(() => {
          leftHandle.dispatchEvent(
            new KeyboardEvent("keydown", {
              bubbles: true,
              key: "ArrowLeft",
            }),
          );
        });
      }

      expect(getMainPane().style.width).toBe("390px");
      act(() => {
        vi.advanceTimersByTime(121);
      });

      expect(getMainPane().style.width).toBe("390px");
      expect(leftPane.style.width).toBe("192px");
      expectWorkspaceMobileMergedSide(rootElement, null);

      for (let index = 0; index < 2; index += 1) {
        act(() => {
          leftHandle.dispatchEvent(
            new KeyboardEvent("keydown", {
              bubbles: true,
              key: "ArrowLeft",
            }),
          );
        });
      }

      expect(getMainPane().style.width).toBe("390px");
      act(() => {
        vi.advanceTimersByTime(121);
      });

      expect(getMainPane().style.width).toBe("390px");
      expect(leftPane.style.width).toBe("144px");
      expectWorkspaceMobileMergedSide(rootElement, null);

      for (let index = 0; index < 2; index += 1) {
        act(() => {
          leftHandle.dispatchEvent(
            new KeyboardEvent("keydown", {
              bubbles: true,
              key: "ArrowLeft",
            }),
          );
        });
      }

      expect(getMainPane().style.width).toBe("260px");
      act(() => {
        vi.advanceTimersByTime(121);
      });

      expect(getMainPane().style.width).toBe("260px");
      expect(leftPane.style.width).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX}px`);
      expectWorkspaceMobileMergedSide(rootElement, "left");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps mobile carousel and merge behavior with a fine-hover edge handle", () => {
    vi.useFakeTimers();
    try {
      testViewportWidthPx = NARROW_VIEWPORT_WIDTH_PX;
      testHasAnyFineHoverPointer = true;
      const mountedRoot = root;
      if (mountedRoot === null || rootElement === null) {
        throw new Error("Expected mounted root");
      }
      const rootElementNode = rootElement;

      act(() => {
        mountedRoot.render(
          renderMobileLayout({
            mobilePane: "right",
          }),
        );
      });

      const rightHandle = getRequiredElement(
        rootElement,
        '[data-testid="workspace-layout-v2-right-resize"]',
      );
      const rightPane = getRequiredElement(
        rootElement,
        '[data-testid="workspace-layout-v2-pane-right"]',
      );
      const carouselNode = getRequiredElement(
        rootElement,
        '[data-testid="workspace-layout-v2-pane-main"]',
      );
      const getMainPane = () =>
        getRequiredElement(rootElementNode, "[data-workspace-layout-v2-mobile-main-pane]");

      expect(getMainPane().style.width).toBe("320px");
      expect(carouselNode.classList.contains("snap-x")).toBe(true);
      expect(carouselNode.classList.contains("overflow-x-auto")).toBe(true);
      expect(rightHandle.classList.contains("cursor-col-resize")).toBe(true);
      expect(rightHandle.classList.contains("w-4")).toBe(true);
      expect(rightHandle.querySelector("[data-workspace-layout-v2-resize-grip-dots]")).toBeNull();

      for (let index = 0; index < 5; index += 1) {
        act(() => {
          rightHandle.dispatchEvent(
            new KeyboardEvent("keydown", {
              bubbles: true,
              key: "ArrowRight",
            }),
          );
        });
      }

      expect(getMainPane().style.width).toBe("320px");
      expect(rightPane.style.width).toBe("136px");
      act(() => {
        vi.advanceTimersByTime(121);
      });

      expectWorkspaceMobileMergedSide(rootElement, null);
      expect(getMainPane().style.width).toBe("320px");

      act(() => {
        rightHandle.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowRight",
            shiftKey: true,
          }),
        );
      });

      expect(getMainPane().style.width).toBe(`${NARROW_MOBILE_MAIN_WIDTH_PX}px`);

      act(() => {
        vi.advanceTimersByTime(121);
      });

      expectWorkspaceMobileMergedSide(rootElement, "right");
      expect(getMainPane().style.width).toBe(`${NARROW_MOBILE_MAIN_WIDTH_PX}px`);
      expect(
        getRequiredElement(rootElement, '[data-testid="workspace-layout-v2-pane-right"]').style
          .width,
      ).toBe(`${NARROW_MOBILE_SIDEBAR_MIN_WIDTH_PX}px`);
      expect(
        rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
      ).toBe("right");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps merged main geometry while moving from a merged left pane to the right pane", () => {
    vi.useFakeTimers();
    try {
      const mountedRoot = root;
      if (mountedRoot === null || rootElement === null) {
        throw new Error("Expected mounted root");
      }
      const rootElementNode = rootElement;

      act(() => {
        mountedRoot.render(<ControlledMergedLeftMobileLayout />);
      });

      const carouselNode = getRequiredElement(
        rootElement,
        '[data-testid="workspace-layout-v2-pane-main"]',
      );
      const leftHandle = getRequiredElement(
        rootElement,
        '[data-testid="workspace-layout-v2-left-resize"]',
      );
      const getMainPane = () =>
        getRequiredElement(rootElementNode, "[data-workspace-layout-v2-mobile-main-pane]");

      act(() => {
        leftHandle.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowLeft",
          }),
        );
      });
      act(() => {
        leftHandle.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowLeft",
          }),
        );
      });
      act(() => {
        vi.advanceTimersByTime(121);
      });

      expect(getMainPane().style.width).toBe("260px");
      expectWorkspaceMobileMergedSide(rootElement, "left");
      expect(carouselNode.classList.contains("overflow-x-auto")).toBe(true);
      expect(carouselNode.classList.contains("overflow-x-hidden")).toBe(false);
      act(() => {
        carouselNode.scrollLeft = 180;
        carouselNode.dispatchEvent(new Event("scroll", { bubbles: true }));
      });

      expect(
        rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
      ).toBe("left");
      expectWorkspaceMobileMergedSide(rootElement, "left");

      act(() => {
        latestSetRenderedMobilePane?.("right");
      });

      expect(
        rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
      ).toBe("right");
      expect(getMainPane().style.width).toBe("260px");
      expectWorkspaceMobileMergedSide(rootElement, "left");
      expect(
        rootElement.querySelector('[data-testid="workspace-layout-v2-right-resize"]'),
      ).not.toBeNull();
      const rightHandle = getRequiredElement(
        rootElement,
        '[data-testid="workspace-layout-v2-right-resize"]',
      );

      act(() => {
        carouselNode.scrollLeft = MOBILE_SIDEBAR_MIN_WIDTH_PX + 14;
        carouselNode.dispatchEvent(new Event("scroll", { bubbles: true }));
      });

      expect(
        rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
      ).toBe("right");
      expect(getMainPane().style.width).toBe("260px");

      act(() => {
        rightHandle.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowRight",
          }),
        );
      });
      act(() => {
        vi.advanceTimersByTime(121);
      });

      expectWorkspaceMobileMergedSide(rootElement, "left");
      expect(getMainPane().style.width).toBe("260px");

      act(() => {
        latestSetRenderedMobilePane?.("main");
      });

      expect(
        rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
      ).toBe("main");
      expect(getMainPane().style.width).toBe("390px");
      expect(
        rootElement.querySelector('[data-testid="workspace-layout-v2-left-resize"]'),
      ).toBeNull();
      expect(
        rootElement.querySelector('[data-testid="workspace-layout-v2-right-resize"]'),
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the desktop-only shared header row hidden by CSS when mobile omits header content", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(renderMobileLayout({}));
    });

    const headerRow = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-main-header-row"]',
    );
    expect(headerRow.classList.contains("hidden")).toBe(true);
    expect(headerRow.classList.contains("md:block")).toBe(true);
    expect(
      getRequiredElement(rootElement, '[aria-label="Toggle Left Sidebar"]').classList.contains(
        "hidden",
      ),
    ).toBe(true);
    expect(
      getRequiredElement(rootElement, '[aria-label="Toggle Right Sidebar"]').classList.contains(
        "hidden",
      ),
    ).toBe(true);
  });

  it("treats omitted and null main headers the same on mobile", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(renderMobileLayout({ mainHeader: null }));
    });

    const headerRow = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-main-header-row"]',
    );
    expect(headerRow.classList.contains("hidden")).toBe(true);
    expect(headerRow.classList.contains("md:block")).toBe(true);
    expect(
      getRequiredElement(rootElement, '[aria-label="Toggle Left Sidebar"]').classList.contains(
        "hidden",
      ),
    ).toBe(true);
    expect(
      getRequiredElement(rootElement, '[aria-label="Toggle Right Sidebar"]').classList.contains(
        "hidden",
      ),
    ).toBe(true);
  });

  it("keeps the shared header row on mobile when the route provides content", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(
        renderMobileLayout({
          mainHeader: <div data-testid="main-header-actions">/logo</div>,
        }),
      );
    });

    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-main-header-row"]'),
    ).not.toBeNull();
    expect(rootElement.querySelector('[data-testid="main-header-actions"]')?.textContent).toBe(
      "/logo",
    );
  });
});

afterAll(() => {
  if (originalGetBoundingClientRectDescriptor !== undefined) {
    Object.defineProperty(
      HTMLElement.prototype,
      "getBoundingClientRect",
      originalGetBoundingClientRectDescriptor,
    );
  }
});
