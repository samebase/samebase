// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { SidebarProvider } from "@/components/sidebar";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "@/lib/workspacePaneSizes";
import { WorkspaceLayoutV2FullPage } from "./WorkspaceLayoutV2";

const { act } = React;

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const VIEWPORT_WIDTH_PX = 390;
const VIEWPORT_HEIGHT_PX = 844;
const MOBILE_PANE_PEEK_PX = 24;
const OMIT_HEADER = Symbol("omit-header");
const MOBILE_PANE_SEPARATOR_CLASSES = [
  "workspace-mobile-pane-separators",
] as const;

const originalGetBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "getBoundingClientRect",
);
let latestSetRenderedMobilePane: React.Dispatch<
  React.SetStateAction<"left" | "main" | "right">
> | null = null;

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
  value: VIEWPORT_WIDTH_PX,
  writable: true,
});

Object.defineProperty(window, "innerHeight", {
  configurable: true,
  value: VIEWPORT_HEIGHT_PX,
  writable: true,
});

HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return DOMRect.fromRect({
    height: VIEWPORT_HEIGHT_PX,
    width: VIEWPORT_WIDTH_PX,
    x: 0,
    y: 0,
  });
};

function renderMobileLayout({
  includeRightPane = true,
  leftMobileWidthPx = DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  mainHeader = OMIT_HEADER,
  mobilePane,
  rightMobileWidthPx = DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
}: {
  includeRightPane?: boolean;
  leftMobileWidthPx?: number;
  mainHeader?: React.ReactNode | typeof OMIT_HEADER;
  mobilePane?: "left" | "main" | "right";
  rightMobileWidthPx?: number;
}) {
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
    <SidebarProvider
      leftMobileWidthPx={leftMobileWidthPx}
      mobilePane={mobilePane}
      rightMobileWidthPx={rightMobileWidthPx}
    >
      <WorkspaceLayoutV2FullPage
        left={{
          content: <div>left pane</div>,
        }}
        main={mainProps}
        right={
          includeRightPane
            ? {
                content: <div>right pane</div>,
              }
            : undefined
        }
      />
    </SidebarProvider>
  );
}

function ControlledMobileLayout() {
  const [mobilePane, setMobilePane] = React.useState<"left" | "main" | "right">(
    "main",
  );
  latestSetRenderedMobilePane = setMobilePane;

  return renderMobileLayout({ mobilePane });
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
  const leftPane = getRequiredElement(
    root,
    '[data-testid="workspace-layout-v2-pane-left"]',
  );
  const mainPane = getRequiredElement(root, ".snap-center > div");
  const rightPane = getRequiredElement(
    root,
    '[data-testid="workspace-layout-v2-pane-right"]',
  );
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

    const carouselNode = rootElement.querySelector(
      '[data-testid="workspace-layout-v2-pane-main"]',
    );

    expect(carouselNode).not.toBeNull();
    expect(carouselNode?.scrollLeft).toBe(DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX);
    expect(
      rootElement
        .querySelector("[data-workspace-layout-v2]")
        ?.getAttribute("data-mobile-pane"),
    ).toBe("main");
    expect(
      rootElement.querySelector(
        '[data-testid="workspace-layout-v2-left-resize"]',
      ),
    ).toBeNull();
    expect(
      rootElement.querySelector(
        '[data-testid="workspace-layout-v2-right-resize"]',
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

    const carouselNode = rootElement.querySelector(
      '[data-testid="workspace-layout-v2-pane-main"]',
    );

    expect(carouselNode).not.toBeNull();
    expect(carouselNode?.scrollLeft).toBe(
      DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX * 2 - MOBILE_PANE_PEEK_PX,
    );
    expect(
      rootElement
        .querySelector("[data-workspace-layout-v2]")
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

    expect(
      rootElement.querySelector(
        '[data-testid="workspace-layout-v2-pane-main"]',
      ),
    ).not.toBeNull();
    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-pane-main"]')
        ?.scrollLeft,
    ).toBe(DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX);

    act(() => {
      latestSetRenderedMobilePane?.("right");
    });

    expect(
      rootElement
        .querySelector("[data-workspace-layout-v2]")
        ?.getAttribute("data-mobile-pane"),
    ).toBe("right");
    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-pane-main"]')
        ?.scrollLeft,
    ).toBe(DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX * 2 - MOBILE_PANE_PEEK_PX);

    act(() => {
      latestSetRenderedMobilePane?.("main");
    });

    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-pane-main"]')
        ?.scrollLeft,
    ).toBe(DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX);
    expect(
      rootElement
        .querySelector("[data-workspace-layout-v2]")
        ?.getAttribute("data-mobile-pane"),
    ).toBe("main");
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
        .querySelector("[data-workspace-layout-v2]")
        ?.getAttribute("data-mobile-pane"),
    ).toBe("left");
    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-pane-main"]')
        ?.scrollLeft,
    ).toBe(MOBILE_PANE_PEEK_PX);
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

  it("renders a mobile resize grip on the active left sidebar", () => {
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
    expect(leftHandle.getAttribute("aria-valuemin")).toBe("96");
    expect(leftHandle.getAttribute("aria-valuemax")).toBe("342");
    expect(leftHandle.getAttribute("aria-valuenow")).toBe("220");
    expect(leftHandle.parentElement?.style.left).toBe("220px");
    expect(
      rootElement.querySelector(
        '[data-testid="workspace-layout-v2-right-resize"]',
      ),
    ).toBeNull();
  });

  it("renders a mobile resize grip on a left-only route", () => {
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
      rootElement
        .querySelector("[data-workspace-layout-v2]")
        ?.getAttribute("data-mobile-pane"),
    ).toBe("left");
    expect(leftPane.style.width).toBe("220px");
    expect(leftHandle.getAttribute("aria-valuenow")).toBe("220");
    expect(leftHandle.parentElement?.style.left).toBe("220px");
    expect(
      rootElement.querySelector(
        '[data-testid="workspace-layout-v2-right-resize"]',
      ),
    ).toBeNull();
  });

  it("renders a mobile resize grip on the active right sidebar", () => {
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
    expect(rightHandle.getAttribute("aria-valuemin")).toBe("96");
    expect(rightHandle.getAttribute("aria-valuemax")).toBe("342");
    expect(rightHandle.getAttribute("aria-valuenow")).toBe("300");
    expect(rightHandle.parentElement?.style.left).toBe("90px");
    expect(
      rootElement.querySelector(
        '[data-testid="workspace-layout-v2-left-resize"]',
      ),
    ).toBeNull();
  });

  it("clamps mobile sidebar widths to double the leftover width outside max width", () => {
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

    expect(leftPane.style.width).toBe("96px");
    expect(leftHandle.getAttribute("aria-valuemin")).toBe("96");
    expect(leftHandle.getAttribute("aria-valuenow")).toBe("96");
    expect(leftHandle.parentElement?.style.left).toBe("96px");

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

    expect(rightPane.style.width).toBe("96px");
    expect(rightHandle.getAttribute("aria-valuemin")).toBe("96");
    expect(rightHandle.getAttribute("aria-valuenow")).toBe("96");
    expect(rightHandle.parentElement?.style.left).toBe("294px");
  });

  it("hides the shared header row on mobile when the route omits main header content", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(renderMobileLayout({}));
    });

    expect(
      rootElement.querySelector(
        '[data-testid="workspace-layout-v2-main-header-row"]',
      ),
    ).toBeNull();
    expect(
      rootElement.querySelector('[aria-label="Toggle Left Sidebar"]'),
    ).toBeNull();
    expect(
      rootElement.querySelector('[aria-label="Toggle Right Sidebar"]'),
    ).toBeNull();
  });

  it("treats omitted and null main headers the same on mobile", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(renderMobileLayout({ mainHeader: null }));
    });

    expect(
      rootElement.querySelector(
        '[data-testid="workspace-layout-v2-main-header-row"]',
      ),
    ).toBeNull();
    expect(
      rootElement.querySelector('[aria-label="Toggle Left Sidebar"]'),
    ).toBeNull();
    expect(
      rootElement.querySelector('[aria-label="Toggle Right Sidebar"]'),
    ).toBeNull();
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
      rootElement.querySelector(
        '[data-testid="workspace-layout-v2-main-header-row"]',
      ),
    ).not.toBeNull();
    expect(
      rootElement.querySelector('[data-testid="main-header-actions"]')
        ?.textContent,
    ).toBe("/machines");
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
