// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProsemarkMobilePaneDrag } from "@/components/useProsemarkMobilePaneDrag";
import { WorkspaceMobilePaneDragProvider } from "@/components/workspace-layout/workspaceMobilePaneDrag";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
const originalPointerEvent = globalThis.PointerEvent;

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

function dispatchPointerEvent(
  target: HTMLElement,
  type: string,
  args: {
    button?: number;
    clientX: number;
    clientY: number;
    isPrimary?: boolean;
    pointerId: number;
    pointerType: string;
  },
) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  });

  Object.defineProperty(event, "button", {
    value: args.button ?? 0,
  });
  Object.defineProperty(event, "clientX", {
    value: args.clientX,
  });
  Object.defineProperty(event, "clientY", {
    value: args.clientY,
  });
  Object.defineProperty(event, "isPrimary", {
    value: args.isPrimary ?? true,
  });
  Object.defineProperty(event, "pointerId", {
    value: args.pointerId,
  });
  Object.defineProperty(event, "pointerType", {
    value: args.pointerType,
  });

  target.dispatchEvent(event);
}

function installPointerCaptureMocks(target: HTMLElement) {
  const capturedPointerIds = new Set<number>();

  Object.defineProperty(target, "setPointerCapture", {
    configurable: true,
    value: vi.fn((pointerId: number) => {
      capturedPointerIds.add(pointerId);
    }),
  });
  Object.defineProperty(target, "releasePointerCapture", {
    configurable: true,
    value: vi.fn((pointerId: number) => {
      capturedPointerIds.delete(pointerId);
    }),
  });
  Object.defineProperty(target, "hasPointerCapture", {
    configurable: true,
    value: vi.fn((pointerId: number) => capturedPointerIds.has(pointerId)),
  });
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
  settleMobileShell,
}: {
  enabled?: boolean;
  dragMobileShellBy: (deltaX: number) => boolean;
  isAvailable?: boolean;
  settleMobileShell: () => void;
}) {
  return (
    <WorkspaceMobilePaneDragProvider
      value={{
        dragMobileShellBy,
        isAvailable,
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
    Reflect.set(globalThis, "PointerEvent", originalPointerEvent);
  });

  it("delegates horizontal touch pointer drags into the workspace shell", () => {
    const dragMobileShellBy = vi.fn(() => true);
    const settleMobileShell = vi.fn();
    Reflect.set(globalThis, "PointerEvent", Event);

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
    installPointerCaptureMocks(host);

    act(() => {
      dispatchPointerEvent(host, "pointerdown", {
        clientX: 100,
        clientY: 120,
        pointerId: 1,
        pointerType: "touch",
      });
      dispatchPointerEvent(host, "pointermove", {
        clientX: 140,
        clientY: 122,
        pointerId: 1,
        pointerType: "touch",
      });
      dispatchPointerEvent(host, "pointermove", {
        clientX: 185,
        clientY: 124,
        pointerId: 1,
        pointerType: "touch",
      });
      dispatchPointerEvent(host, "pointerup", {
        clientX: 185,
        clientY: 124,
        pointerId: 1,
        pointerType: "touch",
      });
    });

    expect(dragMobileShellBy).toHaveBeenNthCalledWith(1, 40);
    expect(dragMobileShellBy).toHaveBeenNthCalledWith(2, 45);
    expect(settleMobileShell).toHaveBeenCalledTimes(1);
  });

  it("leaves vertical touch pointer gestures to the editor surface", () => {
    const dragMobileShellBy = vi.fn(() => true);
    const settleMobileShell = vi.fn();
    Reflect.set(globalThis, "PointerEvent", Event);

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
    installPointerCaptureMocks(host);

    act(() => {
      dispatchPointerEvent(host, "pointerdown", {
        clientX: 100,
        clientY: 120,
        pointerId: 1,
        pointerType: "touch",
      });
      dispatchPointerEvent(host, "pointermove", {
        clientX: 112,
        clientY: 170,
        pointerId: 1,
        pointerType: "touch",
      });
      dispatchPointerEvent(host, "pointerup", {
        clientX: 112,
        clientY: 170,
        pointerId: 1,
        pointerType: "touch",
      });
    });

    expect(dragMobileShellBy).not.toHaveBeenCalled();
    expect(settleMobileShell).not.toHaveBeenCalled();
  });

  it("falls back to legacy touch events when Pointer Events are unavailable", () => {
    const dragMobileShellBy = vi.fn(() => true);
    const settleMobileShell = vi.fn();
    Reflect.deleteProperty(globalThis, "PointerEvent");

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
      dispatchTouchEvent(host, "touchend", {
        touches: [],
        changedTouches: [createTouch(1, 140, 122)],
      });
    });

    expect(dragMobileShellBy).toHaveBeenCalledWith(40);
    expect(settleMobileShell).toHaveBeenCalledTimes(1);
  });

  it("continues mixed pointerdown plus touchmove gestures on Pointer Event browsers", () => {
    const dragMobileShellBy = vi.fn(() => true);
    const settleMobileShell = vi.fn();
    Reflect.set(globalThis, "PointerEvent", Event);

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
      dispatchPointerEvent(host, "pointerdown", {
        clientX: 100,
        clientY: 120,
        pointerId: 1,
        pointerType: "touch",
      });
      dispatchTouchEvent(host, "touchstart", {
        touches: [createTouch(1, 100, 120)],
        changedTouches: [createTouch(1, 100, 120)],
      });
      dispatchTouchEvent(host, "touchmove", {
        touches: [createTouch(1, 145, 123)],
        changedTouches: [createTouch(1, 145, 123)],
      });
      dispatchTouchEvent(host, "touchend", {
        touches: [],
        changedTouches: [createTouch(1, 145, 123)],
      });
    });

    expect(dragMobileShellBy).toHaveBeenCalledWith(45);
    expect(settleMobileShell).toHaveBeenCalledTimes(1);
  });

  it("ignores legacy touch continuation after pointermove takes over", () => {
    const dragMobileShellBy = vi.fn(() => true);
    const settleMobileShell = vi.fn();
    Reflect.set(globalThis, "PointerEvent", Event);

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
    installPointerCaptureMocks(host);

    act(() => {
      dispatchPointerEvent(host, "pointerdown", {
        clientX: 100,
        clientY: 120,
        pointerId: 1,
        pointerType: "touch",
      });
      dispatchTouchEvent(host, "touchstart", {
        touches: [createTouch(1, 100, 120)],
        changedTouches: [createTouch(1, 100, 120)],
      });
      dispatchPointerEvent(host, "pointermove", {
        clientX: 145,
        clientY: 123,
        pointerId: 1,
        pointerType: "touch",
      });
      dispatchTouchEvent(host, "touchmove", {
        touches: [createTouch(1, 190, 126)],
        changedTouches: [createTouch(1, 190, 126)],
      });
      dispatchTouchEvent(host, "touchend", {
        touches: [],
        changedTouches: [createTouch(1, 190, 126)],
      });
      dispatchPointerEvent(host, "pointerup", {
        clientX: 145,
        clientY: 123,
        pointerId: 1,
        pointerType: "touch",
      });
    });

    expect(dragMobileShellBy).toHaveBeenCalledTimes(1);
    expect(dragMobileShellBy).toHaveBeenCalledWith(45);
    expect(settleMobileShell).toHaveBeenCalledTimes(1);
  });

  it("keeps blocked horizontal drags on the editor surface when the shell cannot move", () => {
    const dragMobileShellBy = vi.fn(() => false);
    const settleMobileShell = vi.fn();
    Reflect.set(globalThis, "PointerEvent", Event);

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
    installPointerCaptureMocks(host);

    act(() => {
      dispatchPointerEvent(host, "pointerdown", {
        clientX: 100,
        clientY: 120,
        pointerId: 1,
        pointerType: "touch",
      });
      dispatchPointerEvent(host, "pointermove", {
        clientX: 145,
        clientY: 122,
        pointerId: 1,
        pointerType: "touch",
      });
      dispatchPointerEvent(host, "pointerup", {
        clientX: 145,
        clientY: 122,
        pointerId: 1,
        pointerType: "touch",
      });
    });

    expect(dragMobileShellBy).toHaveBeenCalledWith(45);
    expect(settleMobileShell).not.toHaveBeenCalled();
  });

  it("ignores pen pointers so stylus input stays with the editor", () => {
    const dragMobileShellBy = vi.fn(() => true);
    const settleMobileShell = vi.fn();
    Reflect.set(globalThis, "PointerEvent", Event);

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
    installPointerCaptureMocks(host);

    act(() => {
      dispatchPointerEvent(host, "pointerdown", {
        clientX: 100,
        clientY: 120,
        pointerId: 1,
        pointerType: "pen",
      });
      dispatchPointerEvent(host, "pointermove", {
        clientX: 150,
        clientY: 122,
        pointerId: 1,
        pointerType: "pen",
      });
      dispatchPointerEvent(host, "pointerup", {
        clientX: 150,
        clientY: 122,
        pointerId: 1,
        pointerType: "pen",
      });
    });

    expect(dragMobileShellBy).not.toHaveBeenCalled();
    expect(settleMobileShell).not.toHaveBeenCalled();
  });

  it("ignores mouse pointers so drag selection stays with the editor", () => {
    const dragMobileShellBy = vi.fn(() => true);
    const settleMobileShell = vi.fn();
    Reflect.set(globalThis, "PointerEvent", Event);

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
    installPointerCaptureMocks(host);

    act(() => {
      dispatchPointerEvent(host, "pointerdown", {
        clientX: 100,
        clientY: 120,
        pointerId: 1,
        pointerType: "mouse",
      });
      dispatchPointerEvent(host, "pointermove", {
        clientX: 150,
        clientY: 122,
        pointerId: 1,
        pointerType: "mouse",
      });
      dispatchPointerEvent(host, "pointerup", {
        clientX: 150,
        clientY: 122,
        pointerId: 1,
        pointerType: "mouse",
      });
    });

    expect(dragMobileShellBy).not.toHaveBeenCalled();
    expect(settleMobileShell).not.toHaveBeenCalled();
  });
});
