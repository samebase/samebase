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
import { WorkspaceLayoutV2FullPage } from "./WorkspaceLayoutV2";

const { act } = React;

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const VIEWPORT_WIDTH_PX = 390;
const VIEWPORT_HEIGHT_PX = 844;
const OMIT_HEADER = Symbol("omit-header");

const originalOffsetLeftDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetLeft",
);
const originalGetBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "getBoundingClientRect",
);
const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
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

Object.defineProperty(HTMLElement.prototype, "offsetLeft", {
  configurable: true,
  get() {
    if (this.getAttribute("data-testid") === "workspace-layout-v2-pane-left") {
      return 24;
    }

    if (this.classList.contains("snap-center")) {
      return 366;
    }

    if (this.getAttribute("data-testid") === "workspace-layout-v2-pane-right") {
      return 708;
    }

    return 0;
  },
});

HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
  const carouselNode = this.parentElement;
  if (carouselNode === null) {
    return;
  }

  if (this.getAttribute("data-testid") === "workspace-layout-v2-pane-left") {
    carouselNode.scrollLeft = 0;
    return;
  }

  if (this.classList.contains("snap-center")) {
    carouselNode.scrollLeft = 342;
    return;
  }

  if (this.getAttribute("data-testid") === "workspace-layout-v2-pane-right") {
    carouselNode.scrollLeft = 684;
  }
};

function renderMobileLayout({
  mainHeader = OMIT_HEADER,
  mobilePane,
}: {
  mainHeader?: React.ReactNode | typeof OMIT_HEADER;
  mobilePane?: "left" | "main" | "right";
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
    <SidebarProvider mobilePane={mobilePane}>
      <WorkspaceLayoutV2FullPage
        left={{
          content: <div>left pane</div>,
        }}
        main={mainProps}
        right={{
          content: <div>right pane</div>,
        }}
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

function expectMobilePaneBorderOwnership(
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
    if (paneName === activePane) {
      expect(paneNode.classList.contains("border-x-0")).toBe(true);
      expect(paneNode.classList.contains("border-x")).toBe(false);
      continue;
    }

    expect(paneNode.classList.contains("border-x")).toBe(true);
    expect(paneNode.classList.contains("border-border")).toBe(true);
    expect(paneNode.classList.contains("border-x-0")).toBe(false);
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
    expect(carouselNode?.scrollLeft).toBe(342);
    expect(
      rootElement
        .querySelector("[data-workspace-layout-v2]")
        ?.getAttribute("data-mobile-pane"),
    ).toBe("main");
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
    expect(carouselNode?.scrollLeft).toBe(684);
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
    ).toBe(342);

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
    ).toBe(684);

    act(() => {
      latestSetRenderedMobilePane?.("main");
    });

    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-pane-main"]')
        ?.scrollLeft,
    ).toBe(342);
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

    expectMobilePaneBorderOwnership(rootElement, "left");
  });

  it("lets the sidebars own both separators while the main pane is visible", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(renderMobileLayout({ mobilePane: "main" }));
    });

    expectMobilePaneBorderOwnership(rootElement, "main");
  });

  it("lets the right sidebar stay borderless while the main pane owns the separator", () => {
    const mountedRoot = root;
    if (mountedRoot === null || rootElement === null) {
      throw new Error("Expected mounted root");
    }

    act(() => {
      mountedRoot.render(renderMobileLayout({ mobilePane: "right" }));
    });

    expectMobilePaneBorderOwnership(rootElement, "right");
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
  if (originalOffsetLeftDescriptor !== undefined) {
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetLeft",
      originalOffsetLeftDescriptor,
    );
  }
  if (originalScrollIntoViewDescriptor !== undefined) {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScrollIntoViewDescriptor,
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
});
