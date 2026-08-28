// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { SidebarLayout } from "../src/SidebarLayout.tsx";
import {
  SIDEBAR_LAYOUT_MOBILE_MAIN_PEEK_WIDTH_PX,
  SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_PX,
  getMobileSidebarMaxWidthPx,
  getMobileSidebarMinWidthPx,
  getMobilePaneScrollProgress,
  type SidebarLayoutMobileMinResizeBehavior,
} from "../src/SidebarLayoutGeometryInternal.ts";
import {
  SidebarRuntimeProvider,
  useSidebarRuntimeState,
  type SidebarRuntimeState,
} from "../src/SidebarRuntimeInternal.tsx";
import {
  useSidebarLayoutPresentation,
  type SidebarLayoutPresentation,
} from "../src/SidebarRuntime.ts";
import type {
  SidebarLayoutState,
  SidebarLayoutStateController,
} from "../src/SidebarLayoutState.ts";
import {
  SidebarLayoutMemoryProvider,
  useSidebarLayoutMemoryController,
} from "../src/SidebarLayoutTesting.tsx";

const { act } = React;

const VIEWPORT_WIDTH_PX = 390;
const VIEWPORT_HEIGHT_PX = 844;
const MOBILE_SIDEBAR_MIN_WIDTH_PX = 130;
const NARROW_VIEWPORT_WIDTH_PX = 320;
const NARROW_MOBILE_SIDEBAR_MIN_WIDTH_PX = 106;
const NARROW_MOBILE_MAIN_WIDTH_PX = 214;
const TEST_SIDEBAR_WIDTH_PX = 256;

const originalGetBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "getBoundingClientRect",
);
let latestSetRenderedMobilePane: ((nextPane: SidebarLayoutState["mobilePane"]) => void) | null =
  null;
let latestLayoutPresentation: SidebarLayoutPresentation | null = null;
let latestRenderedPaneState: SidebarRuntimeState | null = null;
let testViewportWidthPx = VIEWPORT_WIDTH_PX;
let testViewportHeightPx = VIEWPORT_HEIGHT_PX;
let testHasAnyFineHoverPointer = false;

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: query === "(any-hover: hover) and (any-pointer: fine)" && testHasAnyFineHoverPointer,
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
  mobileMinResizeBehavior?: SidebarLayoutMobileMinResizeBehavior;
  mobilePane?: SidebarLayoutState["mobilePane"];
  mobileSurface?: SidebarLayoutState["mobileSurface"];
  rightMobileWidthPx?: number;
};

function createMobileSidebarState({
  leftMobileWidthPx = TEST_SIDEBAR_WIDTH_PX,
  mobilePane = "main",
  mobileSurface = { kind: "unmerged" },
  rightMobileWidthPx = TEST_SIDEBAR_WIDTH_PX,
}: Pick<
  RenderMobileLayoutArgs,
  "leftMobileWidthPx" | "mobilePane" | "mobileSurface" | "rightMobileWidthPx"
>): SidebarLayoutState {
  return {
    leftDesktopOpen: true,
    leftDesktopWidthPx: TEST_SIDEBAR_WIDTH_PX,
    leftMobileWidthPx,
    mobilePane,
    mobileSurface,
    rightDesktopOpen: false,
    rightDesktopWidthPx: TEST_SIDEBAR_WIDTH_PX,
    rightMobileWidthPx,
  };
}

function renderMobileLayoutContent({
  includeLeftPane = true,
  includeRightPane = true,
  mobileMinResizeBehavior,
}: Omit<
  RenderMobileLayoutArgs,
  "leftMobileWidthPx" | "mobilePane" | "mobileSurface" | "rightMobileWidthPx"
>) {
  return (
    <SidebarLayout
      addressChrome={<div data-testid="test-address-chrome">/test</div>}
      left={includeLeftPane ? <div>left pane</div> : undefined}
      main={
        <>
          <SidebarLayoutPresentationProbe />
          <div>main pane</div>
        </>
      }
      mobileMinResizeBehavior={mobileMinResizeBehavior}
      resizeHandleLabels={{
        left: "Resize left pane",
        right: "Resize right pane",
      }}
      right={includeRightPane ? <div>right pane</div> : undefined}
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
    <SidebarLayoutMemoryProvider key={initialStateKey} initialState={initialState}>
      <SidebarRuntimeStateProbe />
      {renderMobileLayoutContent(contentProps)}
    </SidebarLayoutMemoryProvider>
  );
}

function renderMobileLayoutWithController(
  controller: SidebarLayoutStateController,
  contentProps: Omit<
    RenderMobileLayoutArgs,
    "leftMobileWidthPx" | "mobilePane" | "mobileSurface" | "rightMobileWidthPx"
  >,
) {
  return (
    <SidebarRuntimeProvider controller={controller}>
      <SidebarRuntimeStateProbe />
      {renderMobileLayoutContent(contentProps)}
    </SidebarRuntimeProvider>
  );
}

function SidebarRuntimeStateProbe() {
  const paneState = useSidebarRuntimeState();
  React.useEffect(() => {
    latestRenderedPaneState = paneState;
  }, [paneState]);
  return null;
}

function SidebarLayoutPresentationProbe() {
  const presentation = useSidebarLayoutPresentation();
  React.useEffect(() => {
    latestLayoutPresentation = presentation;
  }, [presentation]);
  return null;
}

function ControlledMobileLayout() {
  const controller = useSidebarLayoutMemoryController(
    createMobileSidebarState({ mobilePane: "main" }),
  );
  React.useEffect(() => {
    latestSetRenderedMobilePane = (nextPane) => {
      controller.setState((state) => ({ ...state, mobilePane: nextPane }), "immediate");
    };
  }, [controller]);

  return (
    <SidebarRuntimeProvider controller={controller}>
      {renderMobileLayoutContent({})}
    </SidebarRuntimeProvider>
  );
}

function ControlledMergedLeftMobileLayout() {
  const controller = useSidebarLayoutMemoryController(
    createMobileSidebarState({
      leftMobileWidthPx: MOBILE_SIDEBAR_MIN_WIDTH_PX,
      mobilePane: "left",
    }),
  );
  React.useEffect(() => {
    latestSetRenderedMobilePane = (nextPane) => {
      controller.setState((state) => ({ ...state, mobilePane: nextPane }), "immediate");
    };
  }, [controller]);

  return (
    <SidebarRuntimeProvider controller={controller}>
      {renderMobileLayoutContent({})}
    </SidebarRuntimeProvider>
  );
}

function getRequiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected element for selector: ${selector}`);
  }

  return element;
}

function expectSidebarMobileMergedSide(root: ParentNode, side: "left" | "right" | null) {
  expect(
    root
      .querySelector('[data-sidebar-layout-part="viewport"]')
      ?.getAttribute("data-sidebar-layout-mobile-merged-side"),
  ).toBe(side);
}

function expectMobilePaneSeparatorOwnership(
  root: ParentNode,
  activePane: "left" | "main" | "right",
) {
  expect(
    root.querySelector('[data-sidebar-layout-part="viewport"]')?.getAttribute("data-mobile-pane"),
  ).toBe(activePane);
  const leftPane = getRequiredElement(
    root,
    '[data-sidebar-layout-part="pane"][data-pane-side="left"]',
  );
  const mainPane = getRequiredElement(
    root,
    '[data-sidebar-layout-part="pane"][data-pane-side="main"]',
  );
  const rightPane = getRequiredElement(
    root,
    '[data-sidebar-layout-part="pane"][data-pane-side="right"]',
  );
  const paneEntries = [
    ["left", leftPane],
    ["main", mainPane],
    ["right", rightPane],
  ] as const;

  for (const [paneName, paneNode] of paneEntries) {
    expect(paneNode.getAttribute("data-sidebar-layout-part")).toBe("pane");
    expect(paneNode.getAttribute("data-pane-side")).toBe(paneName);
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
        configuredMinWidthPx: SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_PX,
        maxWidthPx: getMobileSidebarMaxWidthPx(viewportWidthPx),
        viewportWidthPx,
      }),
    ).toBe(175);
  });

  it("uses one third of the page on narrow mobile viewports", () => {
    expect(
      getMobileSidebarMinWidthPx({
        configuredMinWidthPx: SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_PX,
        maxWidthPx: getMobileSidebarMaxWidthPx(VIEWPORT_WIDTH_PX),
        viewportWidthPx: VIEWPORT_WIDTH_PX,
      }),
    ).toBe(MOBILE_SIDEBAR_MIN_WIDTH_PX);
    expect(
      getMobileSidebarMinWidthPx({
        configuredMinWidthPx: SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_PX,
        maxWidthPx: getMobileSidebarMaxWidthPx(NARROW_VIEWPORT_WIDTH_PX),
        viewportWidthPx: NARROW_VIEWPORT_WIDTH_PX,
      }),
    ).toBe(NARROW_MOBILE_SIDEBAR_MIN_WIDTH_PX);
  });
});

describe("SidebarLayout mobile boot alignment", () => {
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
    latestLayoutPresentation = null;
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

    const carouselNode = rootElement.querySelector('[data-sidebar-layout-part="carousel"]');

    expect(carouselNode).not.toBeNull();
    expect(carouselNode?.scrollLeft).toBe(TEST_SIDEBAR_WIDTH_PX);
    expect(
      rootElement
        .querySelector('[data-sidebar-layout-part="viewport"]')
        ?.getAttribute("data-mobile-pane"),
    ).toBe("main");
    expect(
      rootElement.querySelector(
        '[data-sidebar-layout-part="resize-handle"][data-resize-side="left"]',
      ),
    ).toBeNull();
    expect(
      rootElement.querySelector(
        '[data-sidebar-layout-part="resize-handle"][data-resize-side="right"]',
      ),
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

    const carouselNode = rootElement.querySelector('[data-sidebar-layout-part="carousel"]');

    expect(carouselNode).not.toBeNull();
    expect(carouselNode?.scrollLeft).toBe(TEST_SIDEBAR_WIDTH_PX * 2);
    expect(
      rootElement
        .querySelector('[data-sidebar-layout-part="viewport"]')
        ?.getAttribute("data-mobile-pane"),
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

    expect(rootElement.querySelector('[data-sidebar-layout-part="carousel"]')).not.toBeNull();
    expect(rootElement.querySelector('[data-sidebar-layout-part="carousel"]')?.scrollLeft).toBe(
      TEST_SIDEBAR_WIDTH_PX,
    );

    act(() => {
      latestSetRenderedMobilePane?.("right");
    });

    expect(
      rootElement
        .querySelector('[data-sidebar-layout-part="viewport"]')
        ?.getAttribute("data-mobile-pane"),
    ).toBe("right");
    expect(rootElement.querySelector('[data-sidebar-layout-part="carousel"]')?.scrollLeft).toBe(
      TEST_SIDEBAR_WIDTH_PX * 2,
    );

    act(() => {
      latestSetRenderedMobilePane?.("main");
    });

    expect(rootElement.querySelector('[data-sidebar-layout-part="carousel"]')?.scrollLeft).toBe(
      TEST_SIDEBAR_WIDTH_PX,
    );
    expect(
      rootElement
        .querySelector('[data-sidebar-layout-part="viewport"]')
        ?.getAttribute("data-mobile-pane"),
    ).toBe("main");
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

    const maxReachableSidebarWidthPx = VIEWPORT_WIDTH_PX - SIDEBAR_LAYOUT_MOBILE_MAIN_PEEK_WIDTH_PX;
    const carouselNode = getRequiredElement(rootElement, '[data-sidebar-layout-part="carousel"]');
    const mainPane = getRequiredElement(
      rootElement,
      '[data-sidebar-layout-part="pane"][data-pane-side="main"]',
    );
    const rightPane = getRequiredElement(
      rootElement,
      '[data-sidebar-layout-part="pane"][data-pane-side="right"]',
    );
    const rightHandle = getRequiredElement(
      rootElement,
      '[data-sidebar-layout-part="resize-handle"][data-resize-side="right"]',
    );

    expect(carouselNode.scrollLeft).toBe(TEST_SIDEBAR_WIDTH_PX + maxReachableSidebarWidthPx);
    expect(mainPane.style.width).toBe(`${VIEWPORT_WIDTH_PX}px`);
    expect(rightPane.style.width).toBe(`${maxReachableSidebarWidthPx}px`);
    expect(rightHandle.getAttribute("aria-valuemax")).toBe(`${maxReachableSidebarWidthPx}`);
    expect(rightHandle.getAttribute("aria-valuenow")).toBe(`${maxReachableSidebarWidthPx}`);
    expect(rightHandle.parentElement?.style.left).toBe(
      `${SIDEBAR_LAYOUT_MOBILE_MAIN_PEEK_WIDTH_PX}px`,
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
      rootElement
        .querySelector('[data-sidebar-layout-part="viewport"]')
        ?.getAttribute("data-mobile-pane"),
    ).toBe("left");
    expect(rootElement.querySelector('[data-sidebar-layout-part="carousel"]')?.scrollLeft).toBe(0);
  });

  it("restores a saved left merge when the missing pane returns without writing state", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }
    const savedState = createMobileSidebarState({
      leftMobileWidthPx: MOBILE_SIDEBAR_MIN_WIDTH_PX,
      mobilePane: "left",
      mobileSurface: {
        kind: "merged",
        mainWidthPx: VIEWPORT_WIDTH_PX - MOBILE_SIDEBAR_MIN_WIDTH_PX,
        side: "left",
      },
    });
    const setState = vi.fn<SidebarLayoutStateController["setState"]>();
    const controller = {
      isHydrated: true,
      setState,
      state: savedState,
    } satisfies SidebarLayoutStateController;

    act(() => {
      mountedRoot.render(
        renderMobileLayoutWithController(controller, {
          includeLeftPane: false,
        }),
      );
    });

    expect(
      rootElement
        .querySelector('[data-sidebar-layout-part="viewport"]')
        ?.getAttribute("data-mobile-pane"),
    ).toBe("main");
    expect(rootElement.querySelector('[data-sidebar-layout-part="carousel"]')?.scrollLeft).toBe(0);
    expect(
      rootElement.querySelector('[data-sidebar-layout-part="pane"][data-pane-side="left"]'),
    ).toBeNull();
    expect(
      rootElement.querySelector(
        '[data-sidebar-layout-part="resize-handle"][data-resize-side="left"]',
      ),
    ).toBeNull();
    expect(
      rootElement.querySelector('[data-sidebar-layout-part="pane"][data-pane-side="right"]'),
    ).not.toBeNull();
    expect(latestRenderedPaneState?.mobilePane).toBe("left");
    expect(latestRenderedPaneState?.mobileSurface).toEqual({
      kind: "merged",
      mainWidthPx: VIEWPORT_WIDTH_PX - MOBILE_SIDEBAR_MIN_WIDTH_PX,
      side: "left",
    });
    expect(latestLayoutPresentation?.mobilePane).toBe("main");
    expect(latestLayoutPresentation?.mobileMergeProgress).toBeNull();

    act(() => {
      mountedRoot.render(renderMobileLayoutWithController(controller, {}));
    });

    expectSidebarMobileMergedSide(rootElement, "left");
    expect(
      getRequiredElement(rootElement, '[data-sidebar-layout-part="pane"][data-pane-side="main"]')
        .style.width,
    ).toBe(`${VIEWPORT_WIDTH_PX - MOBILE_SIDEBAR_MIN_WIDTH_PX}px`);
    expect(
      rootElement
        .querySelector('[data-sidebar-layout-part="viewport"]')
        ?.getAttribute("data-mobile-pane"),
    ).toBe("left");
    expect(latestLayoutPresentation?.mobileMergeProgress).toEqual({
      progress: 1,
      side: "left",
    });
    expect(latestRenderedPaneState?.mobileSurface).toEqual(savedState.mobileSurface);
    expect(setState).not.toHaveBeenCalled();
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

    expectSidebarMobileMergedSide(rootElement, "left");
    expect(
      getRequiredElement(rootElement, '[data-sidebar-layout-part="pane"][data-pane-side="main"]')
        .style.width,
    ).toBe(`${VIEWPORT_WIDTH_PX - MOBILE_SIDEBAR_MIN_WIDTH_PX}px`);
    expect(latestRenderedPaneState?.mobileSurface).toEqual({
      kind: "merged",
      mainWidthPx: 302,
      side: "left",
    });
    expect(latestLayoutPresentation?.mobilePane).toBe("left");
    expect(latestLayoutPresentation?.mobileMergeProgress).toEqual({
      progress: 1,
      side: "left",
    });
  });

  it("restores a saved merge when the viewport can fit it without writing state", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }
    testViewportWidthPx = 300;
    const savedState = createMobileSidebarState({
      leftMobileWidthPx: 100,
      mobilePane: "left",
      mobileSurface: {
        kind: "merged",
        mainWidthPx: 260,
        side: "left",
      },
    });
    const setState = vi.fn<SidebarLayoutStateController["setState"]>();
    const controller = {
      isHydrated: true,
      setState,
      state: savedState,
    } satisfies SidebarLayoutStateController;

    act(() => {
      mountedRoot.render(renderMobileLayoutWithController(controller, {}));
    });

    expectSidebarMobileMergedSide(rootElement, null);
    expect(
      getRequiredElement(rootElement, '[data-sidebar-layout-part="pane"][data-pane-side="main"]')
        .style.width,
    ).toBe("300px");
    expect(latestLayoutPresentation?.mobilePane).toBe("left");
    expect(latestLayoutPresentation?.mobileMergeProgress).toBeNull();
    expect(latestRenderedPaneState?.mobileSurface).toEqual({
      kind: "merged",
      mainWidthPx: 260,
      side: "left",
    });

    testViewportWidthPx = VIEWPORT_WIDTH_PX;
    act(() => {
      mountedRoot.render(renderMobileLayoutWithController(controller, {}));
      window.dispatchEvent(new Event("resize"));
    });

    expectSidebarMobileMergedSide(rootElement, "left");
    expect(
      getRequiredElement(rootElement, '[data-sidebar-layout-part="pane"][data-pane-side="main"]')
        .style.width,
    ).toBe(`${VIEWPORT_WIDTH_PX - MOBILE_SIDEBAR_MIN_WIDTH_PX}px`);
    expect(latestLayoutPresentation?.mobileMergeProgress).toEqual({
      progress: 1,
      side: "left",
    });
    expect(latestRenderedPaneState?.mobileSurface).toEqual(savedState.mobileSurface);
    expect(setState).not.toHaveBeenCalled();
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

    expect(
      rootElement.querySelector(
        '[data-sidebar-layout-part="resize-handle"][data-resize-side="left"]',
      ),
    ).toBeNull();
    expect(
      rootElement.querySelector(
        '[data-sidebar-layout-part="resize-handle"][data-resize-side="right"]',
      ),
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
      '[data-sidebar-layout-part="pane"][data-pane-side="left"]',
    );
    const leftHandle = getRequiredElement(
      rootElement,
      '[data-sidebar-layout-part="resize-handle"][data-resize-side="left"]',
    );

    expect(leftPane.style.width).toBe("220px");
    expect(leftHandle.getAttribute("aria-valuemin")).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX}`);
    expect(leftHandle.getAttribute("aria-valuemax")).toBe("350");
    expect(leftHandle.getAttribute("aria-valuenow")).toBe("220");
    expect(leftHandle.parentElement?.style.left).toBe("220px");
    expect(
      leftHandle.querySelector('[data-sidebar-layout-part="resize-grip-indicator"]'),
    ).not.toBeNull();
    expect(
      rootElement.querySelector(
        '[data-sidebar-layout-part="resize-handle"][data-resize-side="right"]',
      ),
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
      '[data-sidebar-layout-part="pane"][data-pane-side="left"]',
    );
    const leftHandle = getRequiredElement(
      rootElement,
      '[data-sidebar-layout-part="resize-handle"][data-resize-side="left"]',
    );

    expect(
      rootElement
        .querySelector('[data-sidebar-layout-part="viewport"]')
        ?.getAttribute("data-mobile-pane"),
    ).toBe("left");
    expect(leftPane.style.width).toBe("220px");
    expect(leftHandle.getAttribute("aria-valuenow")).toBe("220");
    expect(leftHandle.parentElement?.style.left).toBe("220px");
    expect(
      rootElement.querySelector(
        '[data-sidebar-layout-part="resize-handle"][data-resize-side="right"]',
      ),
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
      '[data-sidebar-layout-part="pane"][data-pane-side="right"]',
    );
    const rightHandle = getRequiredElement(
      rootElement,
      '[data-sidebar-layout-part="resize-handle"][data-resize-side="right"]',
    );

    expect(rightPane.style.width).toBe("300px");
    expect(rightHandle.getAttribute("aria-valuemin")).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX}`);
    expect(rightHandle.getAttribute("aria-valuemax")).toBe("350");
    expect(rightHandle.getAttribute("aria-valuenow")).toBe("300");
    expect(rightHandle.parentElement?.style.left).toBe("90px");
    expect(
      rootElement.querySelector(
        '[data-sidebar-layout-part="resize-handle"][data-resize-side="left"]',
      ),
    ).toBeNull();
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
      '[data-sidebar-layout-part="pane"][data-pane-side="left"]',
    );
    const leftHandle = getRequiredElement(
      rootElement,
      '[data-sidebar-layout-part="resize-handle"][data-resize-side="left"]',
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
      '[data-sidebar-layout-part="pane"][data-pane-side="right"]',
    );
    const rightHandle = getRequiredElement(
      rootElement,
      '[data-sidebar-layout-part="resize-handle"][data-resize-side="right"]',
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
        '[data-sidebar-layout-part="resize-handle"][data-resize-side="left"]',
      );
      const getMainPane = () =>
        getRequiredElement(
          rootElementNode,
          '[data-sidebar-layout-part="pane"][data-pane-side="main"]',
        );

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
        rootElement
          .querySelector('[data-sidebar-layout-part="viewport"]')
          ?.getAttribute("data-mobile-pane"),
      ).toBe("left");

      act(() => {
        vi.advanceTimersByTime(121);
      });

      expect(getMainPane().style.width).toBe("260px");
      expect(leftHandle.getAttribute("aria-valuenow")).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX}`);
      expect(
        rootElement
          .querySelector('[data-sidebar-layout-part="viewport"]')
          ?.getAttribute("data-mobile-pane"),
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
        getRequiredElement(rootElement, '[data-sidebar-layout-part="pane"][data-pane-side="left"]')
          .style.width,
      ).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX + 24}px`);
      expect(leftHandle.parentElement?.style.left).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX + 24}px`);

      act(() => {
        vi.advanceTimersByTime(121);
      });

      expect(latestRenderedPaneState?.mobileSurface).toEqual({ kind: "unmerged" });
      expect(getMainPane().style.width).toBe("390px");
      expect(
        getRequiredElement(rootElement, '[data-sidebar-layout-part="pane"][data-pane-side="left"]')
          .style.width,
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
        '[data-sidebar-layout-part="resize-handle"][data-resize-side="left"]',
      );
      const leftPane = getRequiredElement(
        rootElement,
        '[data-sidebar-layout-part="pane"][data-pane-side="left"]',
      );
      const getMainPane = () =>
        getRequiredElement(
          rootElementNode,
          '[data-sidebar-layout-part="pane"][data-pane-side="main"]',
        );

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
      expectSidebarMobileMergedSide(rootElement, null);

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
      expectSidebarMobileMergedSide(rootElement, null);

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
      expectSidebarMobileMergedSide(rootElement, "left");
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
        '[data-sidebar-layout-part="resize-handle"][data-resize-side="right"]',
      );
      const rightPane = getRequiredElement(
        rootElement,
        '[data-sidebar-layout-part="pane"][data-pane-side="right"]',
      );
      const carouselNode = getRequiredElement(rootElement, '[data-sidebar-layout-part="carousel"]');
      const getMainPane = () =>
        getRequiredElement(
          rootElementNode,
          '[data-sidebar-layout-part="pane"][data-pane-side="main"]',
        );

      expect(getMainPane().style.width).toBe("320px");
      expect(carouselNode.getAttribute("data-sidebar-layout-part")).toBe("carousel");
      expect(rightHandle.getAttribute("data-resize-mode")).toBe("edge");
      expect(rightHandle.getAttribute("data-sidebar-layout-part")).toBe("resize-handle");
      expect(
        rightHandle.querySelector('[data-sidebar-layout-part="resize-grip-indicator"]'),
      ).toBeNull();

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

      expectSidebarMobileMergedSide(rootElement, null);
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

      expectSidebarMobileMergedSide(rootElement, "right");
      expect(getMainPane().style.width).toBe(`${NARROW_MOBILE_MAIN_WIDTH_PX}px`);
      expect(
        getRequiredElement(rootElement, '[data-sidebar-layout-part="pane"][data-pane-side="right"]')
          .style.width,
      ).toBe(`${NARROW_MOBILE_SIDEBAR_MIN_WIDTH_PX}px`);
      expect(
        rootElement
          .querySelector('[data-sidebar-layout-part="viewport"]')
          ?.getAttribute("data-mobile-pane"),
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

      const carouselNode = getRequiredElement(rootElement, '[data-sidebar-layout-part="carousel"]');
      const leftHandle = getRequiredElement(
        rootElement,
        '[data-sidebar-layout-part="resize-handle"][data-resize-side="left"]',
      );
      const getMainPane = () =>
        getRequiredElement(
          rootElementNode,
          '[data-sidebar-layout-part="pane"][data-pane-side="main"]',
        );

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
      expectSidebarMobileMergedSide(rootElement, "left");
      expect(carouselNode.getAttribute("data-sidebar-layout-part")).toBe("carousel");
      act(() => {
        carouselNode.scrollLeft = 180;
        carouselNode.dispatchEvent(new Event("scroll", { bubbles: true }));
      });

      expect(
        rootElement
          .querySelector('[data-sidebar-layout-part="viewport"]')
          ?.getAttribute("data-mobile-pane"),
      ).toBe("left");
      expectSidebarMobileMergedSide(rootElement, "left");

      act(() => {
        latestSetRenderedMobilePane?.("right");
      });

      expect(
        rootElement
          .querySelector('[data-sidebar-layout-part="viewport"]')
          ?.getAttribute("data-mobile-pane"),
      ).toBe("right");
      expect(getMainPane().style.width).toBe("260px");
      expectSidebarMobileMergedSide(rootElement, "left");
      expect(
        rootElement.querySelector(
          '[data-sidebar-layout-part="resize-handle"][data-resize-side="right"]',
        ),
      ).not.toBeNull();
      const rightHandle = getRequiredElement(
        rootElement,
        '[data-sidebar-layout-part="resize-handle"][data-resize-side="right"]',
      );

      act(() => {
        carouselNode.scrollLeft = MOBILE_SIDEBAR_MIN_WIDTH_PX + 14;
        carouselNode.dispatchEvent(new Event("scroll", { bubbles: true }));
      });

      expect(
        rootElement
          .querySelector('[data-sidebar-layout-part="viewport"]')
          ?.getAttribute("data-mobile-pane"),
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

      expectSidebarMobileMergedSide(rootElement, "left");
      expect(getMainPane().style.width).toBe("260px");

      act(() => {
        latestSetRenderedMobilePane?.("main");
      });

      expect(
        rootElement
          .querySelector('[data-sidebar-layout-part="viewport"]')
          ?.getAttribute("data-mobile-pane"),
      ).toBe("main");
      expect(getMainPane().style.width).toBe("390px");
      expect(
        rootElement.querySelector(
          '[data-sidebar-layout-part="resize-handle"][data-resize-side="left"]',
        ),
      ).toBeNull();
      expect(
        rootElement.querySelector(
          '[data-sidebar-layout-part="resize-handle"][data-resize-side="right"]',
        ),
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
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
