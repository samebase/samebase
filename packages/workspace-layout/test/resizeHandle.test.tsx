// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { WorkspaceLayoutV2 } from "../src/WorkspaceLayoutV2.tsx";
import { WorkspaceLayoutV2ResizeHandle } from "../src/WorkspaceLayoutV2ResizeHandle.tsx";
import type { WorkspaceSidebarState } from "../src/WorkspaceLayoutV2State.ts";
import { WorkspaceLayoutV2MemorySidebarProvider } from "../src/WorkspaceLayoutV2Testing.tsx";
import { acquireWorkspaceResizeBodyStyleLock } from "../src/workspaceResizeBodyStyleLock.ts";

const { act } = React;
const TEST_SIDEBAR_WIDTH_PX = 240;
const TEST_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: TEST_SIDEBAR_WIDTH_PX,
  leftMobileWidthPx: TEST_SIDEBAR_WIDTH_PX,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: false,
  rightDesktopWidthPx: TEST_SIDEBAR_WIDTH_PX,
  rightMobileWidthPx: TEST_SIDEBAR_WIDTH_PX,
} satisfies WorkspaceSidebarState;
const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
let root: Root | null = null;

function installDesktopMatchMedia() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ height: 768, width: 1024 }),
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
    })),
  });
}

function ResizeHandleUnmountSubject({ showLeftPane }: { showLeftPane: boolean }) {
  return (
    <WorkspaceLayoutV2MemorySidebarProvider initialState={TEST_STATE}>
      <WorkspaceLayoutV2
        addressChrome={<div>/test</div>}
        left={showLeftPane ? <div>left pane</div> : undefined}
        main={<div>main pane</div>}
        resizeHandleLabels={{
          left: "Resize left pane",
          right: "Resize right pane",
        }}
      />
    </WorkspaceLayoutV2MemorySidebarProvider>
  );
}

function getRequiredElement(rootNode: ParentNode, selector: string) {
  const element = rootNode.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected element for selector: ${selector}`);
  }

  return element;
}

afterEach(() => {
  if (root !== null) {
    const mountedRoot = root;
    act(() => mountedRoot.unmount());
  }
  root = null;
  document.body.replaceChildren();
  document.body.removeAttribute("style");
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalMatchMediaDescriptor === undefined) {
    Reflect.deleteProperty(window, "matchMedia");
  } else {
    Object.defineProperty(window, "matchMedia", originalMatchMediaDescriptor);
  }
});

describe("workspace resize body style lock", () => {
  it("keeps the lock until every owner releases it, then restores exact inline styles", () => {
    document.body.style.setProperty("cursor", "wait", "important");
    document.body.style.setProperty("user-select", "text", "important");

    const releaseFirst = acquireWorkspaceResizeBodyStyleLock(document.body);
    const releaseSecond = acquireWorkspaceResizeBodyStyleLock(document.body);

    expect(document.body.style.getPropertyValue("cursor")).toBe("col-resize");
    expect(document.body.style.getPropertyValue("user-select")).toBe("none");

    releaseFirst();
    expect(document.body.style.getPropertyValue("cursor")).toBe("col-resize");

    releaseSecond();
    expect(document.body.style.getPropertyValue("cursor")).toBe("wait");
    expect(document.body.style.getPropertyPriority("cursor")).toBe("important");
    expect(document.body.style.getPropertyValue("user-select")).toBe("text");
    expect(document.body.style.getPropertyPriority("user-select")).toBe("important");
  });

  it("does not change body styles when an idle handle mounts", () => {
    document.body.style.setProperty("cursor", "wait", "important");
    document.body.style.setProperty("user-select", "text", "important");
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <WorkspaceLayoutV2ResizeHandle
          ariaControls="navigation-pane"
          ariaLabel="Resize navigation pane"
          currentSizePx={240}
          maxSizePx={400}
          minSizePx={160}
          positionPx={240}
          resizeFrom="left"
          onSizeChange={vi.fn()}
        />,
      );
    });

    expect(document.body.style.getPropertyValue("cursor")).toBe("wait");
    expect(document.body.style.getPropertyPriority("cursor")).toBe("important");
    expect(document.body.style.getPropertyValue("user-select")).toBe("text");
    expect(document.body.style.getPropertyPriority("user-select")).toBe("important");
  });

  it("ends a pointer resize and restores body styles when the active handle unmounts", () => {
    installDesktopMatchMedia();
    document.body.style.setProperty("cursor", "wait", "important");
    document.body.style.setProperty("user-select", "text", "important");
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(<ResizeHandleUnmountSubject showLeftPane />);
    });

    const handle = getRequiredElement(
      container,
      '[data-workspace-layout-part="resize-handle"][data-resize-side="left"]',
    );
    Object.defineProperty(handle, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    act(() => {
      handle.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: TEST_SIDEBAR_WIDTH_PX,
        }),
      );
    });

    expect(
      getRequiredElement(
        container,
        '[data-workspace-layout-part="pane"][data-pane-side="left"]',
      ).hasAttribute("data-active-resize"),
    ).toBe(true);
    expect(document.body.style.getPropertyValue("cursor")).toBe("col-resize");
    expect(document.body.style.getPropertyValue("user-select")).toBe("none");

    act(() => {
      root?.render(<ResizeHandleUnmountSubject showLeftPane={false} />);
    });

    expect(document.body.style.getPropertyValue("cursor")).toBe("wait");
    expect(document.body.style.getPropertyPriority("cursor")).toBe("important");
    expect(document.body.style.getPropertyValue("user-select")).toBe("text");
    expect(document.body.style.getPropertyPriority("user-select")).toBe("important");

    act(() => {
      root?.render(<ResizeHandleUnmountSubject showLeftPane />);
    });

    expect(
      getRequiredElement(
        container,
        '[data-workspace-layout-part="pane"][data-pane-side="left"]',
      ).hasAttribute("data-active-resize"),
    ).toBe(false);
  });

  it("ends a keyboard resize when the active handle unmounts", () => {
    vi.useFakeTimers();
    installDesktopMatchMedia();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(<ResizeHandleUnmountSubject showLeftPane />);
    });

    const handle = getRequiredElement(
      container,
      '[data-workspace-layout-part="resize-handle"][data-resize-side="left"]',
    );
    act(() => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "ArrowRight",
        }),
      );
    });

    expect(
      getRequiredElement(
        container,
        '[data-workspace-layout-part="pane"][data-pane-side="left"]',
      ).hasAttribute("data-active-resize"),
    ).toBe(true);

    act(() => {
      root?.render(<ResizeHandleUnmountSubject showLeftPane={false} />);
    });
    act(() => {
      vi.advanceTimersByTime(121);
    });
    act(() => {
      root?.render(<ResizeHandleUnmountSubject showLeftPane />);
    });

    expect(
      getRequiredElement(
        container,
        '[data-workspace-layout-part="pane"][data-pane-side="left"]',
      ).hasAttribute("data-active-resize"),
    ).toBe(false);
  });

  it("uses a required consumer label and omits optional value text by default", () => {
    const markup = React.createElement(WorkspaceLayoutV2ResizeHandle, {
      ariaControls: "navigation-pane",
      ariaLabel: "Resize navigation pane",
      currentSizePx: 240,
      maxSizePx: 400,
      minSizePx: 160,
      onSizeChange: vi.fn(),
      positionPx: 240,
      resizeFrom: "left",
    });
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(markup));

    const handle = container.querySelector('[role="separator"]');
    expect(handle?.getAttribute("aria-controls")).toBe("navigation-pane");
    expect(handle?.getAttribute("aria-label")).toBe("Resize navigation pane");
    expect(handle?.hasAttribute("aria-valuetext")).toBe(false);
  });

  it("renders a semantic grip track and indicator for either pane side", () => {
    for (const [resizeFrom, positionPx] of [
      ["left", 280],
      ["right", 120],
    ] as const) {
      const markup = renderToStaticMarkup(
        <WorkspaceLayoutV2ResizeHandle
          ariaControls={`${resizeFrom}-pane`}
          ariaLabel={`Resize ${resizeFrom} pane`}
          currentSizePx={280}
          maxSizePx={480}
          minSizePx={160}
          onSizeChange={vi.fn()}
          pointerTarget="grip"
          positionPx={positionPx}
          resizeFrom={resizeFrom}
        />,
      );

      expect(markup).toContain('data-workspace-layout-part="resize-track"');
      expect(markup).toContain('data-workspace-layout-part="resize-handle"');
      expect(markup).toContain('data-resize-mode="grip"');
      expect(markup).toContain(`data-resize-side="${resizeFrom}"`);
      expect(markup).toContain('data-workspace-layout-part="resize-grip-indicator"');
      expect(markup).toContain(`style="left:${positionPx}px"`);
    }
  });
});
