// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMobilePaneDragProvider } from "@/components/workspaceMobilePaneDrag";
import { useProsemarkMobilePaneDrag } from "@/components/useProsemarkMobilePaneDrag";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function createTouch(identifier: number, clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    identifier,
  };
}

function createTouchList(
  touches: ReadonlyArray<ReturnType<typeof createTouch>>,
): {
  length: number;
  item: (index: number) => ReturnType<typeof createTouch> | null;
} {
  return {
    length: touches.length,
    item: (index) => touches[index] ?? null,
  };
}

function dispatchTouchEvent(
  target: HTMLElement,
  type: string,
  args: {
    changedTouches: ReadonlyArray<ReturnType<typeof createTouch>>;
    touches: ReadonlyArray<ReturnType<typeof createTouch>>;
  },
) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  });
  const touches = createTouchList(args.touches);
  const changedTouches = createTouchList(args.changedTouches);

  Object.defineProperty(event, "touches", { value: touches });
  Object.defineProperty(event, "targetTouches", { value: touches });
  Object.defineProperty(event, "changedTouches", { value: changedTouches });

  target.dispatchEvent(event);
}

function TestSurface({ enabled = true }: { enabled?: boolean }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mobilePaneDrag = useProsemarkMobilePaneDrag(enabled, containerRef);

  return (
    <div
      ref={containerRef}
      data-testid="mobile-pane-drag-host"
      style={{ touchAction: mobilePaneDrag.touchAction }}
      {...mobilePaneDrag.containerProps}
    />
  );
}

function TestHarness({
  enabled = true,
  dragMobileShellBy,
  isAvailable = true,
  isMainPaneActive = true,
  settleMobileShell,
}: {
  enabled?: boolean;
  dragMobileShellBy: (deltaX: number) => void;
  isAvailable?: boolean;
  isMainPaneActive?: boolean;
  settleMobileShell: () => void;
}) {
  return (
    <WorkspaceMobilePaneDragProvider
      value={{
        dragMobileShellBy,
        isAvailable,
        isMainPaneActive,
        settleMobileShell,
      }}
    >
      <TestSurface enabled={enabled} />
    </WorkspaceMobilePaneDragProvider>
  );
}

describe("useProsemarkMobilePaneDrag", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root !== null) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    rootElement?.remove();
    rootElement = null;
  });

  it("delegates horizontal touch drags into the workspace shell", () => {
    const dragMobileShellBy = vi.fn();
    const settleMobileShell = vi.fn();

    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    act(() => {
      mountedRoot.render(
        <TestHarness
          dragMobileShellBy={dragMobileShellBy}
          settleMobileShell={settleMobileShell}
        />,
      );
    });

    const host = rootElement.querySelector<HTMLElement>(
      '[data-testid="mobile-pane-drag-host"]',
    );
    expect(host).not.toBeNull();
    if (host === null) {
      return;
    }

    act(() => {
      dispatchTouchEvent(host, "touchstart", {
        touches: [createTouch(1, 100, 120)],
        changedTouches: [createTouch(1, 100, 120)],
      });
      dispatchTouchEvent(host, "touchmove", {
        touches: [createTouch(1, 140, 122)],
        changedTouches: [createTouch(1, 140, 122)],
      });
      dispatchTouchEvent(host, "touchmove", {
        touches: [createTouch(1, 185, 124)],
        changedTouches: [createTouch(1, 185, 124)],
      });
      dispatchTouchEvent(host, "touchend", {
        touches: [],
        changedTouches: [createTouch(1, 185, 124)],
      });
    });

    expect(dragMobileShellBy).toHaveBeenNthCalledWith(1, 40);
    expect(dragMobileShellBy).toHaveBeenNthCalledWith(2, 45);
    expect(settleMobileShell).toHaveBeenCalledTimes(1);
  });

  it("leaves vertical touch gestures to the editor surface", () => {
    const dragMobileShellBy = vi.fn();
    const settleMobileShell = vi.fn();

    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    act(() => {
      mountedRoot.render(
        <TestHarness
          dragMobileShellBy={dragMobileShellBy}
          settleMobileShell={settleMobileShell}
        />,
      );
    });

    const host = rootElement.querySelector<HTMLElement>(
      '[data-testid="mobile-pane-drag-host"]',
    );
    expect(host).not.toBeNull();
    if (host === null) {
      return;
    }

    act(() => {
      dispatchTouchEvent(host, "touchstart", {
        touches: [createTouch(1, 100, 120)],
        changedTouches: [createTouch(1, 100, 120)],
      });
      dispatchTouchEvent(host, "touchmove", {
        touches: [createTouch(1, 112, 170)],
        changedTouches: [createTouch(1, 112, 170)],
      });
      dispatchTouchEvent(host, "touchend", {
        touches: [],
        changedTouches: [createTouch(1, 112, 170)],
      });
    });

    expect(dragMobileShellBy).not.toHaveBeenCalled();
    expect(settleMobileShell).not.toHaveBeenCalled();
  });
});
