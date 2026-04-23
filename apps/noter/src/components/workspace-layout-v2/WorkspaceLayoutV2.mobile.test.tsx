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
  mobilePane,
}: {
  mobilePane?: "left" | "main" | "right";
}) {
  return (
    <SidebarProvider mobilePane={mobilePane}>
      <WorkspaceLayoutV2FullPage
        left={{
          content: <div>left pane</div>,
        }}
        main={{
          content: <div>main pane</div>,
        }}
        right={{
          content: <div>right pane</div>,
        }}
      />
    </SidebarProvider>
  );
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
