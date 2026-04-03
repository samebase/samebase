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

vi.mock("@/components/MachinesWorkspaceThreadPane", () => ({
  MachinesWorkspaceThreadPane: () => (
    <div data-component="MachinesWorkspaceThreadPane" />
  ),
}));

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

  beforeEach(() => {
    installMobileMatchMedia();
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
  });

  it("renders the route-owned mobile shell and keeps both sidebar triggers", async () => {
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
    const leftToggleButtons = rootElement.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Toggle Left Sidebar"]',
    );
    const rightToggleButtons = rootElement.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Toggle Right Sidebar"]',
    );
    expect(shell).not.toBeNull();
    expect(track).not.toBeNull();
    expect(leftToggleButtons).toHaveLength(3);
    expect(rightToggleButtons).toHaveLength(3);
    if (shell === null || track === null) {
      return;
    }

    expect(shell.dataset.mobilePane).toBe("main");
    expect(track.style.getPropertyValue("--workspace-left-sidebar-width")).toBe(
      "288px",
    );
    expect(
      track.style.getPropertyValue("--workspace-right-sidebar-width"),
    ).toBe("288px");

    await act(async () => {
      leftToggleButtons[0].click();
    });
    expect(shell.dataset.mobilePane).toBe("left");
    expect(track.style.transform).toBe("translate3d(0px, 0, 0)");

    await act(async () => {
      rightToggleButtons[0].click();
    });
    expect(shell.dataset.mobilePane).toBe("right");
    expect(track.style.transform).toBe("translate3d(-576px, 0, 0)");
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
    const leftToggleButton = rootElement.querySelector<HTMLButtonElement>(
      'button[aria-label="Toggle Left Sidebar"]',
    );
    expect(shell).not.toBeNull();
    expect(mainPane).not.toBeNull();
    expect(leftToggleButton).not.toBeNull();
    if (shell === null || mainPane === null || leftToggleButton === null) {
      return;
    }

    await act(async () => {
      leftToggleButton.click();
    });
    expect(shell.dataset.mobilePane).toBe("left");

    await act(async () => {
      mainPane.click();
    });
    expect(shell.dataset.mobilePane).toBe("left");
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
