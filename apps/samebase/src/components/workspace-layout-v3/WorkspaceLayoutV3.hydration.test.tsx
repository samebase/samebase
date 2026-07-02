// @vitest-environment jsdom

import * as React from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "@/lib/workspacePaneSizes";
import type { WorkspaceSidebarState } from "../../../convex/workspaceSidebarStateModel";
import { WorkspaceLayoutV3FullPage } from "./WorkspaceLayoutV3FullPage";
import { WorkspaceLayoutV3MemorySidebarProvider } from "./WorkspaceLayoutV3MemorySidebarProvider";

const { act } = React;

const VIEWPORT_HEIGHT_PX = 844;
const WORKSPACE_LAYOUT_V3_HYDRATION_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  leftMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  rightMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
} satisfies WorkspaceSidebarState;

const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");
const originalInnerHeightDescriptor = Object.getOwnPropertyDescriptor(window, "innerHeight");
const originalMatchMedia = window.matchMedia;

let root: Root | null = null;
let testViewportWidthPx = 390;

function WorkspaceLayoutV3HydrationSubject() {
  return (
    <WorkspaceLayoutV3MemorySidebarProvider initialState={WORKSPACE_LAYOUT_V3_HYDRATION_STATE}>
      <WorkspaceLayoutV3FullPage
        addressChrome={<div data-testid="test-address-chrome">/test</div>}
        left={{
          content: <div>left pane</div>,
        }}
        main={{
          headerTestId: "workspace-layout-v3-main-header-row",
          content: <div>main pane</div>,
        }}
        right={{
          content: <div>right pane</div>,
        }}
      />
    </WorkspaceLayoutV3MemorySidebarProvider>
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
    getRequiredElement(rootNode, '[data-testid="workspace-layout-v3-pane-left"]'),
    getRequiredElement(rootNode, "[data-workspace-layout-v3-mobile-main-pane]"),
    getRequiredElement(rootNode, '[data-testid="workspace-layout-v3-pane-right"]'),
  ].map((element) => ({
    className: element.className,
    mobileMainPane: element.hasAttribute("data-workspace-layout-v3-mobile-main-pane"),
    style: element.getAttribute("style") ?? "",
    tagName: element.tagName,
    testId: element.getAttribute("data-testid"),
    textContent: element.textContent,
  }));
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
  container.innerHTML = renderWithServerWindow(<WorkspaceLayoutV3HydrationSubject />);

  const beforeSignature = readPaneSignature(container);
  const beforeLeftPane = getRequiredElement(
    container,
    '[data-testid="workspace-layout-v3-pane-left"]',
  );
  const beforeMainPane = getRequiredElement(
    container,
    "[data-workspace-layout-v3-mobile-main-pane]",
  );
  const beforeRightPane = getRequiredElement(
    container,
    '[data-testid="workspace-layout-v3-pane-right"]',
  );
  const hydrationErrors: Array<unknown> = [];

  await act(async () => {
    root = hydrateRoot(container, <WorkspaceLayoutV3HydrationSubject />, {
      onRecoverableError(error: unknown) {
        hydrationErrors.push(error);
      },
    });
  });

  expect(hydrationErrors).toEqual([]);
  expect(readPaneSignature(container)).toEqual(beforeSignature);
  expect(getRequiredElement(container, '[data-testid="workspace-layout-v3-pane-left"]')).toBe(
    beforeLeftPane,
  );
  expect(getRequiredElement(container, "[data-workspace-layout-v3-mobile-main-pane]")).toBe(
    beforeMainPane,
  );
  expect(getRequiredElement(container, '[data-testid="workspace-layout-v3-pane-right"]')).toBe(
    beforeRightPane,
  );
}

describe("WorkspaceLayoutV3 hydration", () => {
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
});
