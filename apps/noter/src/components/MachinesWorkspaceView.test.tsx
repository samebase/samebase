import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { WorkspaceLayoutV2MemorySidebarProvider } from "@/components/workspace-layout-v2/WorkspaceLayoutV2MemorySidebarProvider";
import type { CodexAppServerThread } from "@/lib/codexAppServerResearch";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "@/lib/workspacePaneSizes";

vi.mock("@/components/MachinesWorkspaceThreadPane", () => ({
  MachinesWorkspaceThreadHeader: ({
    selectedMachineDisplayName,
    thread,
  }: {
    selectedMachineDisplayName: string | null;
    thread: CodexAppServerThread | null;
  }) => (
    <div data-component="MachinesWorkspaceThreadHeader">
      {selectedMachineDisplayName}
      {thread?.name}
    </div>
  ),
  MachinesWorkspaceThreadPane: () => <div data-component="MachinesWorkspaceThreadPane" />,
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

function MachinesWorkspaceTestSidebarProvider({ children }: { children: ReactNode }) {
  return (
    <WorkspaceLayoutV2MemorySidebarProvider
      initialState={{
        leftDesktopOpen: true,
        leftDesktopWidthPx: MACHINES_WORKSPACE_LEFT_SIDEBAR_WIDTH_PX,
        leftMobileWidthPx: MACHINES_WORKSPACE_LEFT_SIDEBAR_WIDTH_PX,
        mobilePane: "main",
        mobileSurface: { kind: "unmerged" },
        rightDesktopOpen: false,
        rightDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
        rightMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
      }}
    >
      {children}
    </WorkspaceLayoutV2MemorySidebarProvider>
  );
}

describe("MachinesWorkspaceView", () => {
  it("renders unavailable machine thread rows as disabled while keeping the reason visible", () => {
    const markup = renderToStaticMarkup(
      <MachinesWorkspaceTestSidebarProvider>
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
      </MachinesWorkspaceTestSidebarProvider>,
    );

    expect(markup).toContain(
      "This machine is offline. Start `noter-sync run` on the machine first.",
    );
    expect(markup).toContain("Offline machine thread");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>.*Offline machine thread/s);
  });

  it("renders a project-level start conversation button", () => {
    const markup = renderToStaticMarkup(
      <MachinesWorkspaceTestSidebarProvider>
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
      </MachinesWorkspaceTestSidebarProvider>,
    );

    expect(markup).toContain("Start new conversation in noter");
  });

  it("renders the selected machine and thread title in the shared main header", () => {
    const markup = renderToStaticMarkup(
      <MachinesWorkspaceTestSidebarProvider>
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
          onTurnDraftChange={() => {}}
          onTurnSubmit={() => {}}
        />
      </MachinesWorkspaceTestSidebarProvider>,
    );

    expect(markup).toContain('data-component="MachinesWorkspaceThreadHeader"');
    expect(markup).toContain("Research MacBook Pro");
    expect(markup).toContain("Offline machine thread");
  });

  it("disables project-level start buttons while a turn submission is pending", () => {
    const markup = renderToStaticMarkup(
      <MachinesWorkspaceTestSidebarProvider>
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
      </MachinesWorkspaceTestSidebarProvider>,
    );

    expect(markup).toMatch(
      /<button[^>]*aria-label="Start new conversation in noter"[^>]*disabled=""[^>]*>/,
    );
  });

  it("shows the pending spinner only for the project row that started the conversation", () => {
    const markup = renderToStaticMarkup(
      <MachinesWorkspaceTestSidebarProvider>
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
            {
              hasLoadedThreadInventory: true,
              machineDisplayName: "Research Windows Workstation",
              machineHostname: "research-win.local",
              machineId: "machine-win",
              machineStatus: "online",
              machineStatusReason: null,
              pinnedThreadIds: [],
              threads: [
                {
                  ...THREAD_FIXTURE,
                  id: "thread-machine-workspace-test-win",
                },
              ],
            },
          ]}
          pendingConversation={{
            envMode: "worktree",
            machineId: "machine-mac",
            projectId: THREAD_FIXTURE.project.id,
            projectLabel: THREAD_FIXTURE.project.label,
            projectRootCwd: THREAD_FIXTURE.project.rootCwd,
          }}
          pendingPinThreadKey={null}
          selectedMachineId="machine-mac"
          selectedMachineDisplayName="Research MacBook Pro"
          selectedMachineHostname="research-mbp.local"
          selectedMachineStatusReason={null}
          selectedThread={null}
          selectedThreadError={null}
          selectedThreadLoading={false}
          selectedThreadId={null}
          turnDraft=""
          onProjectStartConversation={() => {}}
          onTurnDraftChange={() => {}}
          onTurnSubmit={() => {}}
        />
      </MachinesWorkspaceTestSidebarProvider>,
    );

    const macSectionStart = markup.indexOf("Research MacBook Pro");
    const winSectionStart = markup.indexOf("Research Windows Workstation");
    const macSection =
      macSectionStart === -1 || winSectionStart === -1
        ? ""
        : markup.slice(macSectionStart, winSectionStart);
    const winSection = winSectionStart === -1 ? "" : markup.slice(winSectionStart);

    expect(macSection.match(/animate-spin/g)?.length ?? 0).toBe(1);
    expect(winSection).not.toContain("animate-spin");
  });
});
