import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/sidebar";
import type { CodexAppServerThread } from "@/lib/codexAppServerResearch";

vi.mock("@/components/MachinesWorkspaceThreadPane", () => ({
  MachinesWorkspaceThreadPane: () => (
    <div data-component="MachinesWorkspaceThreadPane" />
  ),
}));

import {
  MACHINES_WORKSPACE_LEFT_SIDEBAR_WIDTH_PX,
  MachinesWorkspaceView,
} from "./MachinesWorkspaceView";

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

describe("MachinesWorkspaceView", () => {
  it("renders unavailable machine thread rows as disabled while keeping the reason visible", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider
        defaultOpen={true}
        defaultLeftDesktopWidthPx={MACHINES_WORKSPACE_LEFT_SIDEBAR_WIDTH_PX}
        defaultLeftMobileWidthPx={MACHINES_WORKSPACE_LEFT_SIDEBAR_WIDTH_PX}
      >
        <MachinesWorkspaceView
          hasPendingStartedThread={false}
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
          pendingConversation={null}
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
        />
      </SidebarProvider>,
    );

    expect(markup).toContain(
      "This machine is offline. Start `noter-sync run` on the machine first.",
    );
    expect(markup).toContain("Offline machine thread");
    expect(markup).toMatch(
      /<button[^>]*disabled=""[^>]*>.*Offline machine thread/s,
    );
  });

  it("renders a project-level start conversation button", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider
        defaultOpen={true}
        defaultLeftDesktopWidthPx={MACHINES_WORKSPACE_LEFT_SIDEBAR_WIDTH_PX}
        defaultLeftMobileWidthPx={MACHINES_WORKSPACE_LEFT_SIDEBAR_WIDTH_PX}
      >
        <MachinesWorkspaceView
          hasPendingStartedThread={false}
          isSubmittingTurn={false}
          machineInventories={[
            {
              hasLoadedThreadInventory: true,
              machineDisplayName: "Research MacBook Pro",
              machineHostname: "research-mbp.local",
              machineId: "machine-mac",
              machineStatus: "online",
              machineStatusReason: null,
              pinnedThreadIds: [],
              threads: [THREAD_FIXTURE],
            },
          ]}
          pendingConversation={null}
          pendingPinThreadKey={null}
          selectedMachineId="machine-mac"
          selectedMachineDisplayName="Research MacBook Pro"
          selectedMachineHostname="research-mbp.local"
          selectedMachineStatusReason={null}
          selectedThread={THREAD_FIXTURE}
          selectedThreadError={null}
          selectedThreadLoading={false}
          selectedThreadId={THREAD_FIXTURE.id}
          turnDraft=""
          onProjectStartConversation={() => {}}
          onTurnDraftChange={() => {}}
          onTurnSubmit={() => {}}
        />
      </SidebarProvider>,
    );

    expect(markup).toContain("Start new conversation in noter");
  });

  it("disables project-level start buttons while a turn submission is pending", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider
        defaultOpen={true}
        defaultLeftDesktopWidthPx={MACHINES_WORKSPACE_LEFT_SIDEBAR_WIDTH_PX}
        defaultLeftMobileWidthPx={MACHINES_WORKSPACE_LEFT_SIDEBAR_WIDTH_PX}
      >
        <MachinesWorkspaceView
          hasPendingStartedThread={false}
          isSubmittingTurn={true}
          machineInventories={[
            {
              hasLoadedThreadInventory: true,
              machineDisplayName: "Research MacBook Pro",
              machineHostname: "research-mbp.local",
              machineId: "machine-mac",
              machineStatus: "online",
              machineStatusReason: null,
              pinnedThreadIds: [],
              threads: [THREAD_FIXTURE],
            },
          ]}
          pendingConversation={null}
          pendingPinThreadKey={null}
          selectedMachineId="machine-mac"
          selectedMachineDisplayName="Research MacBook Pro"
          selectedMachineHostname="research-mbp.local"
          selectedMachineStatusReason={null}
          selectedThread={THREAD_FIXTURE}
          selectedThreadError={null}
          selectedThreadLoading={false}
          selectedThreadId={THREAD_FIXTURE.id}
          turnDraft=""
          onProjectStartConversation={() => {}}
          onTurnDraftChange={() => {}}
          onTurnSubmit={() => {}}
        />
      </SidebarProvider>,
    );

    expect(markup).toMatch(
      /<button[^>]*aria-label="Start new conversation in noter"[^>]*disabled=""[^>]*>/,
    );
  });
});
