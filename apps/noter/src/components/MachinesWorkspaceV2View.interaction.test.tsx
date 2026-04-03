// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexAppServerThread } from "@/lib/codexAppServerResearch";
import {
  readMachinesV2MobileDragOffsetRange,
  readMachinesV2SettledMobilePane,
} from "@/lib/machinesWorkspaceV2MobileShell";
import { MachinesWorkspaceV2View } from "./MachinesWorkspaceV2View";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
const originalPointerEvent = globalThis.PointerEvent;

vi.mock("@/components/MachinesWorkspaceThreadPane", () => ({
  MachinesWorkspaceThreadPane: () => (
    <div data-component="MachinesWorkspaceThreadPane" />
  ),
}));

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

function dispatchLostPointerCaptureEvent(
  target: HTMLElement,
  pointerId: number,
) {
  const event = new Event("lostpointercapture", {
    bubbles: true,
    cancelable: false,
  });

  Object.defineProperty(event, "pointerId", {
    value: pointerId,
  });

  target.dispatchEvent(event);
}

function dragMobileShell(
  shell: HTMLElement,
  args: {
    endX: number;
    startX: number;
    startY?: number;
    touchIdentifier: number;
  },
) {
  const startY = args.startY ?? 120;
  const startTouch = createTouch(args.touchIdentifier, args.startX, startY);
  const endTouch = createTouch(args.touchIdentifier, args.endX, startY);

  act(() => {
    dispatchTouchEvent(shell, "touchstart", {
      changedTouches: [startTouch],
      touches: [startTouch],
    });
    dispatchTouchEvent(shell, "touchmove", {
      changedTouches: [endTouch],
      touches: [endTouch],
    });
    dispatchTouchEvent(shell, "touchend", {
      changedTouches: [endTouch],
      touches: [],
    });
  });
}

function startMobileShellDrag(
  shell: HTMLElement,
  args: {
    startX: number;
    startY?: number;
    touchIdentifier: number;
  },
) {
  const startY = args.startY ?? 120;
  const startTouch = createTouch(args.touchIdentifier, args.startX, startY);

  act(() => {
    dispatchTouchEvent(shell, "touchstart", {
      changedTouches: [startTouch],
      touches: [startTouch],
    });
  });
}

function moveMobileShellDrag(
  shell: HTMLElement,
  args: {
    moveX: number;
    moveY?: number;
    touchIdentifier: number;
  },
) {
  const moveY = args.moveY ?? 120;
  const moveTouch = createTouch(args.touchIdentifier, args.moveX, moveY);

  act(() => {
    dispatchTouchEvent(shell, "touchmove", {
      changedTouches: [moveTouch],
      touches: [moveTouch],
    });
  });
}

function finishMobileShellDrag(
  shell: HTMLElement,
  args: {
    endX: number;
    endY?: number;
    touchIdentifier: number;
  },
) {
  const endY = args.endY ?? 120;
  const endTouch = createTouch(args.touchIdentifier, args.endX, endY);

  act(() => {
    dispatchTouchEvent(shell, "touchend", {
      changedTouches: [endTouch],
      touches: [],
    });
  });
}

const THREAD_FIXTURE: CodexAppServerThread = {
  agentNickname: null,
  agentRole: null,
  cliVersion: "0.117.0-alpha.10",
  createdAt: 1_775_541_200,
  cwd: "/Users/fixture/dev/noter",
  gitInfo: null,
  id: "thread-machine-workspace-test",
  modelProvider: "openai",
  name: "Offline machine thread",
  path: "/Users/fixture/.codex/sessions/2026/04/02/thread.jsonl",
  preview: "Keep stale inventory visible but disabled.",
  project: {
    id: "/Users/fixture/dev/noter",
    label: "noter",
    rootCwd: "/Users/fixture/dev/noter",
  },
  raw: null,
  source: "vscode",
  sourceLabel: "vscode",
  status: {
    activeFlags: [],
    raw: { type: "idle" },
    type: "idle",
  },
  turns: [],
  updatedAt: 1_775_541_282,
  workspace: {
    isProjectRoot: true,
    label: null,
  },
};

function installDesktopMatchMedia() {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1280,
    writable: true,
  });

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("max-width") ? false : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function installMobileMatchMedia() {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 390,
    writable: true,
  });

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function buildProps() {
  return {
    dataTestId: "machines-v2",
    isSubmittingTurn: false,
    machineInventories: [
      {
        hasLoadedThreadInventory: true,
        machineDisplayName: "Offline Linux Box",
        machineHostname: "linux-box.local",
        machineId: "machine-linux",
        machineStatus: "offline" as const,
        machineStatusReason:
          "This machine is offline. Start `noter-sync run` on the machine first.",
        pinnedThreadIds: [],
        threads: [THREAD_FIXTURE],
      },
    ],
    selectedMachineId: "machine-linux",
    selectedMachineDisplayName: "Offline Linux Box",
    selectedMachineHostname: "linux-box.local",
    selectedMachineStatusReason:
      "This machine is offline. Start `noter-sync run` on the machine first.",
    selectedThread: null,
    selectedThreadError: null,
    selectedThreadLoading: false,
    selectedThreadId: THREAD_FIXTURE.id,
    pendingPinThreadKey: null,
    turnDraft: "",
    onTurnDraftChange: () => {},
    onTurnSubmit: () => {},
  };
}

describe("MachinesWorkspaceV2View desktop pane layout", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;
  let getBoundingClientRectSpy: { mockRestore: () => void } | null = null;

  beforeEach(() => {
    installDesktopMatchMedia();
  });

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
    getBoundingClientRectSpy?.mockRestore();
    getBoundingClientRectSpy = null;
  });

  it("keeps the main pane visible while the desktop sidebars toggle", async () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    await act(async () => {
      root?.render(<MachinesWorkspaceV2View {...buildProps()} />);
    });

    const shell = rootElement.querySelector<HTMLElement>(
      '[data-testid="machines-v2"]',
    );
    const track = rootElement.querySelector<HTMLElement>(
      '[data-sidebar-track="static"]',
    );
    const threadPane = rootElement.querySelector<HTMLElement>(
      '[data-component="MachinesWorkspaceThreadPane"]',
    );
    expect(shell).not.toBeNull();
    expect(track).not.toBeNull();
    expect(threadPane).not.toBeNull();
    if (track === null) {
      return;
    }

    expect(track.style.gridTemplateColumns).toBe(
      "var(--workspace-left-sidebar-width) minmax(0, 1fr) var(--workspace-right-sidebar-width)",
    );
    expect(track.style.getPropertyValue("--workspace-left-sidebar-width")).toBe(
      "288px",
    );
    expect(
      track.style.getPropertyValue("--workspace-right-sidebar-width"),
    ).toBe("288px");

    const leftToggleButton = rootElement.querySelector<HTMLButtonElement>(
      'button[aria-label="Toggle Left Sidebar"]',
    );
    const rightToggleButton = rootElement.querySelector<HTMLButtonElement>(
      'button[aria-label="Toggle Right Sidebar"]',
    );
    expect(leftToggleButton).not.toBeNull();
    expect(rightToggleButton).not.toBeNull();
    if (leftToggleButton === null || rightToggleButton === null) {
      return;
    }

    await act(async () => {
      leftToggleButton.click();
    });

    expect(track.style.gridTemplateColumns).toBe(
      "0px minmax(0, 1fr) var(--workspace-right-sidebar-width)",
    );
    expect(threadPane).not.toBeNull();
    expect(
      rootElement.querySelectorAll('[hidden][aria-hidden="true"]'),
    ).toHaveLength(2);

    await act(async () => {
      rightToggleButton.click();
    });

    expect(track.style.gridTemplateColumns).toBe("0px minmax(0, 1fr) 0px");
    expect(threadPane).not.toBeNull();
    expect(
      rootElement.querySelectorAll('[hidden][aria-hidden="true"]'),
    ).toHaveLength(4);

    await act(async () => {
      rightToggleButton.click();
    });

    expect(track.style.gridTemplateColumns).toBe(
      "0px minmax(0, 1fr) var(--workspace-right-sidebar-width)",
    );
    expect(threadPane).not.toBeNull();
  });

  it("keeps the configured sidebar widths even when the shell is narrower", async () => {
    getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => ({
        bottom: 600,
        height: 600,
        left: 0,
        right: 200,
        top: 0,
        width: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }));

    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    await act(async () => {
      root?.render(<MachinesWorkspaceV2View {...buildProps()} />);
    });

    const track = rootElement.querySelector<HTMLElement>(
      '[data-sidebar-track="static"]',
    );
    expect(track).not.toBeNull();
    if (track === null) {
      return;
    }

    expect(track.style.getPropertyValue("--workspace-left-sidebar-width")).toBe(
      "288px",
    );
    expect(
      track.style.getPropertyValue("--workspace-right-sidebar-width"),
    ).toBe("288px");
  });
});

describe("MachinesWorkspaceV2View mobile pane model", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;
  let getBoundingClientRectSpy: { mockRestore: () => void } | null = null;

  beforeEach(() => {
    installMobileMatchMedia();
    getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => ({
        bottom: 844,
        height: 844,
        left: 0,
        right: 390,
        top: 0,
        width: 390,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }));
  });

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
    getBoundingClientRectSpy?.mockRestore();
    getBoundingClientRectSpy = null;
    Reflect.set(globalThis, "PointerEvent", originalPointerEvent);
  });

  it("renders one persistent mobile header without sidebar buttons", async () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    await act(async () => {
      root?.render(<MachinesWorkspaceV2View {...buildProps()} />);
    });

    const shell = rootElement.querySelector<HTMLElement>(
      '[data-sidebar-shell="v2-mobile"]',
    );
    const header = rootElement.querySelector<HTMLElement>(
      '[data-mobile-header="main"]',
    );
    const track = rootElement.querySelector<HTMLElement>(
      '[data-sidebar-track="v2-mobile"]',
    );
    const sidebarButtons = rootElement.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Toggle Left Sidebar"], button[aria-label="Toggle Right Sidebar"]',
    );
    expect(shell).not.toBeNull();
    expect(header).not.toBeNull();
    expect(track).not.toBeNull();
    expect(sidebarButtons).toHaveLength(0);
    if (shell === null || track === null || header === null) {
      return;
    }

    expect(shell.dataset.mobilePane).toBe("main");
    expect(track.style.getPropertyValue("--workspace-left-sidebar-width")).toBe(
      "288px",
    );
    expect(
      track.style.getPropertyValue("--workspace-right-sidebar-width"),
    ).toBe("288px");
  });

  it("opens both mobile sidebars through drag gestures", async () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    await act(async () => {
      root?.render(<MachinesWorkspaceV2View {...buildProps()} />);
    });

    const shell = rootElement.querySelector<HTMLElement>(
      '[data-sidebar-shell="v2-mobile"]',
    );
    const track = rootElement.querySelector<HTMLElement>(
      '[data-sidebar-track="v2-mobile"]',
    );
    expect(shell).not.toBeNull();
    expect(track).not.toBeNull();
    if (shell === null || track === null) {
      return;
    }

    dragMobileShell(shell, {
      endX: 360,
      startX: 180,
      touchIdentifier: 1,
    });
    expect(shell.dataset.mobilePane).toBe("left");
    expect(track.style.transform).toBe("translate3d(0px, 0, 0)");

    dragMobileShell(shell, {
      endX: 20,
      startX: 220,
      touchIdentifier: 2,
    });
    expect(shell.dataset.mobilePane).toBe("main");
    expect(track.style.transform).toBe("translate3d(-288px, 0, 0)");

    dragMobileShell(shell, {
      endX: 20,
      startX: 220,
      touchIdentifier: 3,
    });
    expect(shell.dataset.mobilePane).toBe("right");
    expect(track.style.transform).toBe("translate3d(-576px, 0, 0)");
  });

  it("resizes both mobile sidebars without swiping the pane track", async () => {
    Reflect.set(globalThis, "PointerEvent", Event);

    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    await act(async () => {
      root?.render(<MachinesWorkspaceV2View {...buildProps()} />);
    });

    const shell = rootElement.querySelector<HTMLElement>(
      '[data-sidebar-shell="v2-mobile"]',
    );
    const track = rootElement.querySelector<HTMLElement>(
      '[data-sidebar-track="v2-mobile"]',
    );
    expect(shell).not.toBeNull();
    expect(track).not.toBeNull();
    if (shell === null || track === null) {
      return;
    }

    dragMobileShell(shell, {
      endX: 360,
      startX: 180,
      touchIdentifier: 1,
    });

    const leftResizeHandle = rootElement.querySelector<HTMLElement>(
      '[data-testid="machines-v2-mobile-left-resize-handle"]',
    );
    expect(leftResizeHandle).not.toBeNull();
    if (leftResizeHandle === null) {
      return;
    }
    installPointerCaptureMocks(leftResizeHandle);

    act(() => {
      dispatchTouchEvent(leftResizeHandle, "touchstart", {
        changedTouches: [createTouch(11, 288, 120)],
        touches: [createTouch(11, 288, 120)],
      });
      dispatchPointerEvent(leftResizeHandle, "pointerdown", {
        clientX: 288,
        clientY: 120,
        pointerId: 1,
        pointerType: "touch",
      });
      dispatchTouchEvent(leftResizeHandle, "touchmove", {
        changedTouches: [createTouch(11, 320, 120)],
        touches: [createTouch(11, 320, 120)],
      });
      dispatchPointerEvent(leftResizeHandle, "pointermove", {
        clientX: 320,
        clientY: 120,
        pointerId: 1,
        pointerType: "touch",
      });
      dispatchTouchEvent(leftResizeHandle, "touchend", {
        changedTouches: [createTouch(11, 320, 120)],
        touches: [],
      });
      dispatchPointerEvent(leftResizeHandle, "pointerup", {
        clientX: 320,
        clientY: 120,
        pointerId: 1,
        pointerType: "touch",
      });
      dispatchLostPointerCaptureEvent(leftResizeHandle, 1);
    });

    expect(track.style.getPropertyValue("--workspace-left-sidebar-width")).toBe(
      "320px",
    );
    expect(shell.dataset.mobilePane).toBe("left");
    expect(track.style.transform).toBe("translate3d(0px, 0, 0)");

    dragMobileShell(shell, {
      endX: 20,
      startX: 220,
      touchIdentifier: 2,
    });
    dragMobileShell(shell, {
      endX: 20,
      startX: 220,
      touchIdentifier: 3,
    });

    const rightResizeHandle = rootElement.querySelector<HTMLElement>(
      '[data-testid="machines-v2-mobile-right-resize-handle"]',
    );
    expect(rightResizeHandle).not.toBeNull();
    if (rightResizeHandle === null) {
      return;
    }
    installPointerCaptureMocks(rightResizeHandle);

    act(() => {
      dispatchTouchEvent(rightResizeHandle, "touchstart", {
        changedTouches: [createTouch(12, 102, 120)],
        touches: [createTouch(12, 102, 120)],
      });
      dispatchPointerEvent(rightResizeHandle, "pointerdown", {
        clientX: 102,
        clientY: 120,
        pointerId: 2,
        pointerType: "touch",
      });
      dispatchTouchEvent(rightResizeHandle, "touchmove", {
        changedTouches: [createTouch(12, 70, 120)],
        touches: [createTouch(12, 70, 120)],
      });
      dispatchPointerEvent(rightResizeHandle, "pointermove", {
        clientX: 70,
        clientY: 120,
        pointerId: 2,
        pointerType: "touch",
      });
      dispatchTouchEvent(rightResizeHandle, "touchend", {
        changedTouches: [createTouch(12, 70, 120)],
        touches: [],
      });
      dispatchPointerEvent(rightResizeHandle, "pointerup", {
        clientX: 70,
        clientY: 120,
        pointerId: 2,
        pointerType: "touch",
      });
      dispatchLostPointerCaptureEvent(rightResizeHandle, 2);
    });

    expect(
      track.style.getPropertyValue("--workspace-right-sidebar-width"),
    ).toBe("320px");
    expect(shell.dataset.mobilePane).toBe("right");
    expect(track.style.transform).toBe("translate3d(-640px, 0, 0)");
  });

  it("does not add tap-to-dismiss overlay behavior on top of the main pane", async () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    await act(async () => {
      root?.render(<MachinesWorkspaceV2View {...buildProps()} />);
    });

    const shell = rootElement.querySelector<HTMLElement>(
      '[data-sidebar-shell="v2-mobile"]',
    );
    const mainPane = rootElement.querySelector<HTMLElement>(
      '[data-testid="machines-v2-mobile-main-pane"]',
    );
    expect(shell).not.toBeNull();
    expect(mainPane).not.toBeNull();
    if (shell === null || mainPane === null) {
      return;
    }

    dragMobileShell(shell, {
      endX: 360,
      startX: 180,
      touchIdentifier: 1,
    });
    expect(shell.dataset.mobilePane).toBe("left");

    await act(async () => {
      mainPane.click();
    });
    expect(shell.dataset.mobilePane).toBe("left");
  });

  it("does not arm pane swipes from the mobile resize lane", async () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    await act(async () => {
      root?.render(<MachinesWorkspaceV2View {...buildProps()} />);
    });

    const shell = rootElement.querySelector<HTMLElement>(
      '[data-sidebar-shell="v2-mobile"]',
    );
    const track = rootElement.querySelector<HTMLElement>(
      '[data-sidebar-track="v2-mobile"]',
    );
    expect(shell).not.toBeNull();
    expect(track).not.toBeNull();
    if (shell === null || track === null) {
      return;
    }

    dragMobileShell(shell, {
      endX: 360,
      startX: 180,
      touchIdentifier: 1,
    });
    expect(shell.dataset.mobilePane).toBe("left");
    expect(track.style.transform).toBe("translate3d(0px, 0, 0)");

    dragMobileShell(shell, {
      endX: 228,
      startX: 286,
      touchIdentifier: 2,
    });
    expect(shell.dataset.mobilePane).toBe("left");
    expect(track.style.transform).toBe("translate3d(0px, 0, 0)");
    expect(track.style.getPropertyValue("--workspace-left-sidebar-width")).toBe(
      "288px",
    );
  });

  it("hides the mobile resize handle while swiping from a sidebar back to main", async () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    await act(async () => {
      root?.render(<MachinesWorkspaceV2View {...buildProps()} />);
    });

    const shell = rootElement.querySelector<HTMLElement>(
      '[data-sidebar-shell="v2-mobile"]',
    );
    const track = rootElement.querySelector<HTMLElement>(
      '[data-sidebar-track="v2-mobile"]',
    );
    expect(shell).not.toBeNull();
    expect(track).not.toBeNull();
    if (shell === null || track === null) {
      return;
    }

    dragMobileShell(shell, {
      endX: 360,
      startX: 180,
      touchIdentifier: 1,
    });
    expect(shell.dataset.mobilePane).toBe("left");
    expect(
      rootElement.querySelector(
        '[data-testid="machines-v2-mobile-left-resize-handle"]',
      ),
    ).not.toBeNull();

    startMobileShellDrag(shell, {
      startX: 320,
      touchIdentifier: 2,
    });
    moveMobileShellDrag(shell, {
      moveX: 160,
      moveY: 122,
      touchIdentifier: 2,
    });

    expect(shell.dataset.mobilePane).toBe("left");
    expect(track.style.transform).toBe("translate3d(-160px, 0, 0)");
    expect(
      rootElement.querySelector(
        '[data-testid="machines-v2-mobile-left-resize-handle"]',
      ),
    ).toBeNull();

    finishMobileShellDrag(shell, {
      endX: 160,
      endY: 122,
      touchIdentifier: 2,
    });
    expect(shell.dataset.mobilePane).toBe("main");
  });

  it("only allows adjacent settling in one gesture", () => {
    expect(
      readMachinesV2MobileDragOffsetRange({
        currentPane: "left",
        leftSidebarWidthPx: 288,
        rightSidebarWidthPx: 288,
      }),
    ).toEqual({
      maxOffsetPx: 0,
      minOffsetPx: -288,
    });
    expect(
      readMachinesV2MobileDragOffsetRange({
        currentPane: "right",
        leftSidebarWidthPx: 288,
        rightSidebarWidthPx: 288,
      }),
    ).toEqual({
      maxOffsetPx: 288,
      minOffsetPx: 0,
    });
    expect(
      readMachinesV2SettledMobilePane({
        currentPane: "left",
        dragOffsetPx: -200,
        leftSidebarWidthPx: 288,
        rightSidebarWidthPx: 288,
      }),
    ).toBe("main");
    expect(
      readMachinesV2SettledMobilePane({
        currentPane: "right",
        dragOffsetPx: 200,
        leftSidebarWidthPx: 288,
        rightSidebarWidthPx: 288,
      }),
    ).toBe("main");
    expect(
      readMachinesV2SettledMobilePane({
        currentPane: "main",
        dragOffsetPx: -200,
        leftSidebarWidthPx: 288,
        rightSidebarWidthPx: 288,
      }),
    ).toBe("right");
  });
});
