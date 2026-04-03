// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexAppServerThread } from "@/lib/codexAppServerResearch";
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

  it("keeps the main pane anchored while left and right desktop sidebars toggle", async () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    await act(async () => {
      mountedRoot.render(
        <MachinesWorkspaceV2View
          dataTestId="machines-v2"
          isSubmittingTurn={false}
          machineInventories={[
            {
              hasLoadedThreadInventory: true,
              machineDisplayName: "Offline Linux Box",
              machineHostname: "linux-box.local",
              machineId: "machine-linux",
              machineStatus: "offline",
              machineStatusReason:
                "This machine is offline. Start `noter-sync run` on the machine first.",
              pinnedThreadIds: [],
              threads: [THREAD_FIXTURE],
            },
          ]}
          selectedMachineId="machine-linux"
          selectedMachineDisplayName="Offline Linux Box"
          selectedMachineHostname="linux-box.local"
          selectedMachineStatusReason="This machine is offline. Start `noter-sync run` on the machine first."
          selectedThread={null}
          selectedThreadError={null}
          selectedThreadLoading={false}
          selectedThreadId={THREAD_FIXTURE.id}
          pendingPinThreadKey={null}
          turnDraft=""
          onTurnDraftChange={() => {}}
          onTurnSubmit={() => {}}
        />,
      );
    });

    const shell = rootElement.querySelector<HTMLElement>(
      '[data-testid="machines-v2"]',
    );
    expect(shell).not.toBeNull();
    if (shell === null) {
      return;
    }

    const track = shell.firstElementChild;
    expect(track).toBeInstanceOf(HTMLDivElement);
    if (!(track instanceof HTMLDivElement)) {
      return;
    }

    const leftPane =
      rootElement.querySelector<HTMLElement>('[data-pane="left"]');
    const mainPane =
      rootElement.querySelector<HTMLElement>('[data-pane="main"]');
    const rightPane = rootElement.querySelector<HTMLElement>(
      '[data-pane="right"]',
    );
    expect(leftPane).not.toBeNull();
    expect(mainPane).not.toBeNull();
    expect(rightPane).not.toBeNull();
    expect(mainPane?.className).toContain("col-start-2");
    expect(rightPane?.className).toContain("col-start-3");
    expect(track.style.gridTemplateColumns).toBe("288px minmax(0, 1fr) 0px");

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

    expect(track.style.gridTemplateColumns).toBe("0px minmax(0, 1fr) 0px");
    expect(leftPane?.style.width).toBe("0px");
    expect(mainPane?.className).toContain("col-start-2");
    expect(rightPane?.className).toContain("col-start-3");

    await act(async () => {
      rightToggleButton.click();
    });

    expect(track.style.gridTemplateColumns).toBe("0px minmax(0, 1fr) 288px");
    expect(rightPane?.style.width).toBe("288px");
    expect(mainPane?.className).toContain("col-start-2");
  });

  it("keeps the configured desktop sidebar width even when the shell is narrower", async () => {
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
    const mountedRoot = root;

    await act(async () => {
      mountedRoot.render(
        <MachinesWorkspaceV2View
          dataTestId="machines-v2"
          isSubmittingTurn={false}
          machineInventories={[
            {
              hasLoadedThreadInventory: true,
              machineDisplayName: "Offline Linux Box",
              machineHostname: "linux-box.local",
              machineId: "machine-linux",
              machineStatus: "offline",
              machineStatusReason:
                "This machine is offline. Start `noter-sync run` on the machine first.",
              pinnedThreadIds: [],
              threads: [THREAD_FIXTURE],
            },
          ]}
          selectedMachineId="machine-linux"
          selectedMachineDisplayName="Offline Linux Box"
          selectedMachineHostname="linux-box.local"
          selectedMachineStatusReason="This machine is offline. Start `noter-sync run` on the machine first."
          selectedThread={null}
          selectedThreadError={null}
          selectedThreadLoading={false}
          selectedThreadId={THREAD_FIXTURE.id}
          pendingPinThreadKey={null}
          turnDraft=""
          onTurnDraftChange={() => {}}
          onTurnSubmit={() => {}}
        />,
      );
    });

    const shell = rootElement.querySelector<HTMLElement>(
      '[data-testid="machines-v2"]',
    );
    expect(shell).not.toBeNull();
    if (shell === null) {
      return;
    }

    const track = shell.firstElementChild;
    expect(track).toBeInstanceOf(HTMLDivElement);
    if (!(track instanceof HTMLDivElement)) {
      return;
    }

    const leftPane =
      rootElement.querySelector<HTMLElement>('[data-pane="left"]');
    expect(leftPane).not.toBeNull();
    expect(track.style.gridTemplateColumns).toBe("288px minmax(0, 1fr) 0px");
    expect(leftPane?.style.width).toBe("288px");
  });
});
