// @vitest-environment jsdom

import * as React from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { SidebarLayout } from "../src/SidebarLayout.tsx";
import type { SidebarLayoutState } from "../src/SidebarLayoutState.ts";
import { SidebarLayoutMemoryProvider } from "../src/SidebarLayoutTesting.tsx";

const { act } = React;

const TEST_SIDEBAR_WIDTH_PX = 240;
const VIEWPORT_HEIGHT_PX = 844;
const SIDEBAR_LAYOUT_HYDRATION_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: TEST_SIDEBAR_WIDTH_PX,
  leftMobileWidthPx: TEST_SIDEBAR_WIDTH_PX,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: TEST_SIDEBAR_WIDTH_PX,
  rightMobileWidthPx: TEST_SIDEBAR_WIDTH_PX,
} satisfies SidebarLayoutState;
const SIDEBAR_LAYOUT_CLOSED_DESKTOP_STATE = {
  ...SIDEBAR_LAYOUT_HYDRATION_STATE,
  leftDesktopOpen: false,
  rightDesktopOpen: false,
} satisfies SidebarLayoutState;

const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");
const originalInnerHeightDescriptor = Object.getOwnPropertyDescriptor(window, "innerHeight");
const originalMatchMedia = window.matchMedia;

let root: Root | null = null;
let testViewportWidthPx = 390;

function SidebarLayoutHydrationSubject() {
  return (
    <SidebarLayoutMemoryProvider initialState={SIDEBAR_LAYOUT_HYDRATION_STATE}>
      <SidebarLayout
        addressChrome={<div data-testid="test-address-chrome">/test</div>}
        left={<div>left pane</div>}
        main={<div>main pane</div>}
        resizeHandleLabels={{
          left: "Resize left pane",
          right: "Resize right pane",
        }}
        right={<div>right pane</div>}
      />
    </SidebarLayoutMemoryProvider>
  );
}

function MultipleSidebarLayoutHydrationSubject() {
  return (
    <div>
      <SidebarLayoutHydrationSubject />
      <SidebarLayoutHydrationSubject />
    </div>
  );
}

function ClosedDesktopPanesSubject() {
  return (
    <SidebarLayoutMemoryProvider initialState={SIDEBAR_LAYOUT_CLOSED_DESKTOP_STATE}>
      <SidebarLayout
        addressChrome={<div>/test</div>}
        left={<button type="button">left action</button>}
        main={<button type="button">main action</button>}
        resizeHandleLabels={{
          left: "Resize left pane",
          right: "Resize right pane",
        }}
        right={<button type="button">right action</button>}
      />
    </SidebarLayoutMemoryProvider>
  );
}

function renderWithServerWindow(element: React.ReactElement) {
  const browserWindow = window;
  vi.stubGlobal("window", undefined);
  try {
    return renderToString(element);
  } finally {
    vi.stubGlobal("window", browserWindow);
  }
}

function getRequiredElement(rootNode: ParentNode, selector: string) {
  const element = rootNode.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected element for selector: ${selector}`);
  }

  return element;
}

function readPaneSignature(rootNode: ParentNode) {
  return [
    getRequiredElement(rootNode, '[data-sidebar-layout-part="pane"][data-pane-side="left"]'),
    getRequiredElement(rootNode, '[data-sidebar-layout-part="pane"][data-pane-side="main"]'),
    getRequiredElement(rootNode, '[data-sidebar-layout-part="pane"][data-pane-side="right"]'),
  ].map((element) => ({
    className: element.className,
    paneSide: element.getAttribute("data-pane-side"),
    style: element.getAttribute("style") ?? "",
    tagName: element.tagName,
    textContent: element.textContent,
  }));
}

function readResizeRelationships(rootNode: ParentNode) {
  const layoutRoots = Array.from(rootNode.querySelectorAll('[data-sidebar-layout-part="root"]'));

  return layoutRoots.flatMap((layoutRoot, layoutIndex) =>
    Array.from(layoutRoot.querySelectorAll('[data-sidebar-layout-part="resize-handle"]')).map(
      (resizeHandle) => {
        const controlledPaneId = resizeHandle.getAttribute("aria-controls");
        const resizeSide = resizeHandle.getAttribute("data-resize-side");
        const controlledPane = Array.from(
          layoutRoot.querySelectorAll('[data-sidebar-layout-part="pane"]'),
        ).find((pane) => pane.id === controlledPaneId);
        if (!(controlledPane instanceof HTMLElement) || controlledPaneId === null) {
          throw new Error("Expected each resize handle to control a pane in its layout.");
        }

        return {
          controlledPaneId,
          layoutIndex,
          paneSide: controlledPane.getAttribute("data-pane-side"),
          resizeSide,
        };
      },
    ),
  );
}

function readSidePaneIds(rootNode: ParentNode) {
  return Array.from(
    rootNode.querySelectorAll(
      '[data-sidebar-layout-part="pane"]:is([data-pane-side="left"], [data-pane-side="right"])',
    ),
    (pane) => pane.id,
  );
}

function installViewport(widthPx: number) {
  testViewportWidthPx = widthPx;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    get: () => testViewportWidthPx,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    get: () => VIEWPORT_HEIGHT_PX,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: testViewportWidthPx < 768,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

async function expectHydratesWithoutReplacingPaneTree(widthPx: number) {
  installViewport(widthPx);
  const container = document.createElement("div");
  document.body.append(container);
  container.innerHTML = renderWithServerWindow(<SidebarLayoutHydrationSubject />);

  const beforeSignature = readPaneSignature(container);
  const beforeLeftPane = getRequiredElement(
    container,
    '[data-sidebar-layout-part="pane"][data-pane-side="left"]',
  );
  const beforeMainPane = getRequiredElement(
    container,
    '[data-sidebar-layout-part="pane"][data-pane-side="main"]',
  );
  const beforeRightPane = getRequiredElement(
    container,
    '[data-sidebar-layout-part="pane"][data-pane-side="right"]',
  );
  const hydrationErrors: Array<unknown> = [];

  await act(async () => {
    root = hydrateRoot(container, <SidebarLayoutHydrationSubject />, {
      onRecoverableError(error: unknown) {
        hydrationErrors.push(error);
      },
    });
  });

  expect(hydrationErrors).toEqual([]);
  expect(readPaneSignature(container)).toEqual(beforeSignature);
  expect(
    getRequiredElement(container, '[data-sidebar-layout-part="pane"][data-pane-side="left"]'),
  ).toBe(beforeLeftPane);
  expect(
    getRequiredElement(container, '[data-sidebar-layout-part="pane"][data-pane-side="main"]'),
  ).toBe(beforeMainPane);
  expect(
    getRequiredElement(container, '[data-sidebar-layout-part="pane"][data-pane-side="right"]'),
  ).toBe(beforeRightPane);
}

describe("SidebarLayout hydration", () => {
  beforeEach(() => {
    root = null;
  });

  afterEach(() => {
    if (root !== null) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
    }
    root = null;
    document.body.replaceChildren();
    if (originalInnerWidthDescriptor !== undefined) {
      Object.defineProperty(window, "innerWidth", originalInnerWidthDescriptor);
    }
    if (originalInnerHeightDescriptor !== undefined) {
      Object.defineProperty(window, "innerHeight", originalInnerHeightDescriptor);
    }
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
    });
    vi.unstubAllGlobals();
  });

  it("hydrates the server pane tree on mobile width without replacing panes", async () => {
    await expectHydratesWithoutReplacingPaneTree(390);
  });

  it("hydrates the server pane tree on desktop width without replacing panes", async () => {
    await expectHydratesWithoutReplacingPaneTree(1280);
  });

  it("keeps resize controls linked to unique panes across SSR and hydration", async () => {
    installViewport(1280);
    const container = document.createElement("div");
    document.body.append(container);
    container.innerHTML = renderWithServerWindow(<MultipleSidebarLayoutHydrationSubject />);

    const serverPaneIds = readSidePaneIds(container);
    expect(serverPaneIds).toHaveLength(4);
    expect(serverPaneIds.every((paneId) => paneId.length > 0)).toBe(true);
    expect(new Set(serverPaneIds).size).toBe(4);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ height: VIEWPORT_HEIGHT_PX, width: 1280 }),
    );
    const hydrationErrors: Array<unknown> = [];

    await act(async () => {
      root = hydrateRoot(container, <MultipleSidebarLayoutHydrationSubject />, {
        onRecoverableError(error: unknown) {
          hydrationErrors.push(error);
        },
      });
    });

    expect(hydrationErrors).toEqual([]);
    expect(readSidePaneIds(container)).toEqual(serverPaneIds);
    const hydratedRelationships = readResizeRelationships(container);
    expect(hydratedRelationships).toHaveLength(4);
    expect(new Set(hydratedRelationships.map(({ controlledPaneId }) => controlledPaneId))).toEqual(
      new Set(serverPaneIds),
    );
    for (const relationship of hydratedRelationships) {
      expect(relationship.paneSide).toBe(relationship.resizeSide);
    }
  });

  it.each([
    ["desktop", 1280, true],
    ["mobile", 390, false],
  ])("marks closed desktop panes inert on %s", (_viewportName, widthPx, expectedInert) => {
    installViewport(widthPx);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ height: VIEWPORT_HEIGHT_PX, width: widthPx }),
    );
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(<ClosedDesktopPanesSubject />);
    });

    const leftPane = getRequiredElement(
      container,
      '[data-sidebar-layout-part="pane"][data-pane-side="left"]',
    );
    const rightPane = getRequiredElement(
      container,
      '[data-sidebar-layout-part="pane"][data-pane-side="right"]',
    );
    expect(leftPane.hasAttribute("inert")).toBe(expectedInert);
    expect(rightPane.hasAttribute("inert")).toBe(expectedInert);
  });
});
