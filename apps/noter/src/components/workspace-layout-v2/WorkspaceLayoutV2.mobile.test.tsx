// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "@/lib/workspacePaneSizes";
import type { WorkspaceSidebarState } from "../../../convex/workspaceSidebarStateModel";
import { WorkspaceLayoutV2FullPage } from "./WorkspaceLayoutV2FullPage";
import { type WorkspaceLayoutV2MobileMinResizeBehavior } from "./WorkspaceLayoutV2Geometry";
import { WorkspacePaneRuntimeProvider } from "./WorkspacePaneRuntime";
import { WorkspaceLayoutV2MemorySidebarProvider } from "./WorkspaceLayoutV2MemorySidebarProvider";
import { useWorkspaceLayoutV2MemorySidebarController } from "./useWorkspaceLayoutV2MemorySidebarController";

const { act } = React;

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const VIEWPORT_WIDTH_PX = 390;
const VIEWPORT_HEIGHT_PX = 844;
const MOBILE_PANE_PEEK_PX = 24;
const MOBILE_SIDEBAR_MIN_WIDTH_PX = 96;
const OMIT_HEADER = Symbol("omit-header");
const MOBILE_PANE_SEPARATOR_CLASSES = ["workspace-mobile-pane-separators"] as const;

const originalGetBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "getBoundingClientRect",
);
let latestSetRenderedMobilePane: ((nextPane: WorkspaceSidebarState["mobilePane"]) => void) | null =
  null;
let testViewportWidthPx = VIEWPORT_WIDTH_PX;
let testViewportHeightPx = VIEWPORT_HEIGHT_PX;

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: true,
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
  mobilePanePeekWidthPx?: number;
  mobilePane?: WorkspaceSidebarState["mobilePane"];
  rightMobileWidthPx?: number;
  rightToggleVisibility?: "all" | "desktop" | "hidden";
  showMobileResizeGripDots?: boolean;
};

function createMobileSidebarState({
  leftMobileWidthPx = DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  mobilePane = "main",
  rightMobileWidthPx = DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
}: Pick<
  RenderMobileLayoutArgs,
  "leftMobileWidthPx" | "mobilePane" | "rightMobileWidthPx"
>): WorkspaceSidebarState {
  return {
    leftDesktopOpen: true,
    leftDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
    leftMobileWidthPx,
    mobilePane,
    mobileSurface: { kind: "unmerged" },
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
  mobilePanePeekWidthPx = MOBILE_PANE_PEEK_PX,
  rightToggleVisibility,
  showMobileResizeGripDots,
}: Omit<RenderMobileLayoutArgs, "leftMobileWidthPx" | "mobilePane" | "rightMobileWidthPx">) {
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
      left={
        includeLeftPane
          ? {
              content: <div>left pane</div>,
            }
          : undefined
      }
      main={mainProps}
      mobileMinResizeBehavior={mobileMinResizeBehavior}
      mobilePanePeekWidthPx={mobilePanePeekWidthPx}
      right={
        includeRightPane
          ? {
              content: <div>right pane</div>,
            }
          : undefined
      }
      leftToggleVisibility={leftToggleVisibility}
      rightToggleVisibility={rightToggleVisibility}
      showMobileResizeGripDots={showMobileResizeGripDots}
    />
  );
}

function renderMobileLayout({
  leftMobileWidthPx,
  mobilePane,
  rightMobileWidthPx,
  ...contentProps
}: RenderMobileLayoutArgs) {
  const initialState = createMobileSidebarState({
    leftMobileWidthPx,
    mobilePane,
    rightMobileWidthPx,
  });
  const initialStateKey = `${initialState.leftMobileWidthPx}|${initialState.mobilePane}|${initialState.rightMobileWidthPx}`;

  return (
    <WorkspaceLayoutV2MemorySidebarProvider key={initialStateKey} initialState={initialState}>
      {renderMobileLayoutContent(contentProps)}
    </WorkspaceLayoutV2MemorySidebarProvider>
  );
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
      {renderMobileLayoutContent({ showMobileResizeGripDots: true })}
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

function expectMobilePaneSeparatorOwnership(
  root: ParentNode,
  activePane: "left" | "main" | "right",
) {
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

    if (paneName === activePane) {
      for (const separatorClass of MOBILE_PANE_SEPARATOR_CLASSES) {
        expect(paneNode.classList.contains(separatorClass)).toBe(false);
      }
      continue;
    }

    for (const separatorClass of MOBILE_PANE_SEPARATOR_CLASSES) {
      expect(paneNode.classList.contains(separatorClass)).toBe(true);
    }
  }
}

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
    expect(carouselNode?.scrollLeft).toBe(
      DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX * 2 - MOBILE_PANE_PEEK_PX,
    );
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
    ).toBe(DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX * 2 - MOBILE_PANE_PEEK_PX);

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

  it("lets routes remove the mobile pane peek from carousel geometry", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(
        renderMobileLayout({
          mobilePane: "right",
          mobilePanePeekWidthPx: 0,
          showMobileResizeGripDots: true,
        }),
      );
    });

    const carouselNode = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-pane-main"]',
    );
    const mainPane = getRequiredElement(rootElement, "[data-workspace-layout-v2-mobile-main-pane]");
    const rightHandle = getRequiredElement(
      rootElement,
      '[data-testid="workspace-layout-v2-right-resize"]',
    );

    expect(carouselNode.style.paddingLeft).toBe("0px");
    expect(carouselNode.style.paddingRight).toBe("0px");
    expect(carouselNode.scrollLeft).toBe(DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX * 2);
    expect(mainPane.style.width).toBe(`${VIEWPORT_WIDTH_PX}px`);
    expect(rightHandle.getAttribute("aria-valuemax")).toBe(`${VIEWPORT_WIDTH_PX}`);
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
    ).toBe(MOBILE_PANE_PEEK_PX);
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
          mobilePane: "left",
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

  it("omits mobile resize grips by default", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(
        renderMobileLayout({
          mobilePane: "left",
        }),
      );
    });

    expect(rootElement.querySelector('[data-testid="workspace-layout-v2-left-resize"]')).toBeNull();
    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-right-resize"]'),
    ).toBeNull();
  });

  it("renders a mobile resize grip on the active left sidebar when grip dots are enabled", () => {
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
          showMobileResizeGripDots: true,
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
    expect(leftHandle.getAttribute("aria-valuemin")).toBe("96");
    expect(leftHandle.getAttribute("aria-valuemax")).toBe("342");
    expect(leftHandle.getAttribute("aria-valuenow")).toBe("220");
    expect(leftHandle.parentElement?.style.left).toBe("220px");
    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-right-resize"]'),
    ).toBeNull();
  });

  it("renders a mobile resize grip on a left-only route when grip dots are enabled", () => {
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
          showMobileResizeGripDots: true,
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

  it("renders a mobile resize grip on the active right sidebar when grip dots are enabled", () => {
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
          showMobileResizeGripDots: true,
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
    expect(rightHandle.getAttribute("aria-valuemin")).toBe("96");
    expect(rightHandle.getAttribute("aria-valuemax")).toBe("342");
    expect(rightHandle.getAttribute("aria-valuenow")).toBe("300");
    expect(rightHandle.parentElement?.style.left).toBe("90px");
    expect(rootElement.querySelector('[data-testid="workspace-layout-v2-left-resize"]')).toBeNull();
  });

  it("clamps mobile sidebar widths to the configured mobile minimum", () => {
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
          showMobileResizeGripDots: true,
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
          showMobileResizeGripDots: true,
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
    expect(rightHandle.parentElement?.style.left).toBe("294px");
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
            showMobileResizeGripDots: true,
          }),
        );
      });

      const leftHandle = getRequiredElement(
        rootElement,
        '[data-testid="workspace-layout-v2-left-resize"]',
      );
      const getMainPane = () =>
        getRequiredElement(rootElementNode, "[data-workspace-layout-v2-mobile-main-pane]");

      expect(getMainPane().style.width).toBe("342px");

      act(() => {
        leftHandle.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowLeft",
          }),
        );
      });

      expect(getMainPane().style.width).toBe("318px");
      expect(
        rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
      ).toBe("left");

      act(() => {
        vi.advanceTimersByTime(121);
      });

      expect(getMainPane().style.width).toBe("294px");
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

      expect(getMainPane().style.width).toBe("318px");
      expect(
        getRequiredElement(rootElement, '[data-testid="workspace-layout-v2-pane-left"]').style
          .width,
      ).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX + 24}px`);
      expect(leftHandle.parentElement?.style.left).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX + 24}px`);

      act(() => {
        vi.advanceTimersByTime(121);
      });

      expect(getMainPane().style.width).toBe("294px");
      expect(
        getRequiredElement(rootElement, '[data-testid="workspace-layout-v2-pane-left"]').style
          .width,
      ).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX}px`);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets a 320px mobile viewport settle into a right merged pane", () => {
    vi.useFakeTimers();
    try {
      testViewportWidthPx = 320;
      const mountedRoot = root;
      if (mountedRoot === null || rootElement === null) {
        throw new Error("Expected mounted root");
      }
      const rootElementNode = rootElement;

      act(() => {
        mountedRoot.render(
          renderMobileLayout({
            mobilePane: "right",
            showMobileResizeGripDots: true,
          }),
        );
      });

      const rightHandle = getRequiredElement(
        rootElement,
        '[data-testid="workspace-layout-v2-right-resize"]',
      );
      const getMainPane = () =>
        getRequiredElement(rootElementNode, "[data-workspace-layout-v2-mobile-main-pane]");

      expect(getMainPane().style.width).toBe("272px");

      act(() => {
        rightHandle.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowRight",
          }),
        );
      });

      expect(getMainPane().style.width).toBe("248px");

      act(() => {
        vi.advanceTimersByTime(121);
      });

      expect(
        rootElement.querySelector('[data-workspace-layout-v2-mobile-merged-pane="right"]'),
      ).not.toBeNull();
      expect(getMainPane().style.width).toBe("224px");
      expect(
        getRequiredElement(rootElement, '[data-testid="workspace-layout-v2-pane-right"]').style
          .width,
      ).toBe(`${MOBILE_SIDEBAR_MIN_WIDTH_PX}px`);
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
        vi.advanceTimersByTime(121);
      });

      expect(getMainPane().style.width).toBe("294px");
      expect(getMainPane().classList.contains("snap-none")).toBe(true);
      expect(
        rootElement.querySelector('[data-workspace-layout-v2-mobile-merged-pane="left"]'),
      ).not.toBeNull();
      expect(carouselNode.classList.contains("overflow-x-auto")).toBe(true);
      expect(carouselNode.classList.contains("overflow-x-hidden")).toBe(false);
      act(() => {
        carouselNode.scrollLeft = 180;
        carouselNode.dispatchEvent(new Event("scroll", { bubbles: true }));
      });

      expect(
        rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
      ).toBe("left");
      expect(
        rootElement.querySelector('[data-workspace-layout-v2-mobile-merged-pane="left"]'),
      ).not.toBeNull();

      act(() => {
        latestSetRenderedMobilePane?.("right");
      });

      expect(
        rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
      ).toBe("right");
      expect(getMainPane().style.width).toBe("294px");
      expect(getMainPane().classList.contains("snap-none")).toBe(true);
      expect(
        rootElement.querySelector('[data-workspace-layout-v2-mobile-merged-pane="left"]'),
      ).not.toBeNull();
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
      expect(getMainPane().style.width).toBe("294px");

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

      expect(
        rootElement.querySelector('[data-workspace-layout-v2-mobile-merged-pane="left"]'),
      ).not.toBeNull();
      expect(
        rootElement.querySelector('[data-workspace-layout-v2-mobile-merged-pane="right"]'),
      ).toBeNull();
      expect(getMainPane().style.width).toBe("294px");

      act(() => {
        latestSetRenderedMobilePane?.("main");
      });

      expect(
        rootElement.querySelector("[data-workspace-layout-v2]")?.getAttribute("data-mobile-pane"),
      ).toBe("main");
      expect(getMainPane().style.width).toBe("342px");
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
          mainHeader: <div data-testid="main-header-actions">/machines</div>,
        }),
      );
    });

    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-main-header-row"]'),
    ).not.toBeNull();
    expect(rootElement.querySelector('[data-testid="main-header-actions"]')?.textContent).toBe(
      "/machines",
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
