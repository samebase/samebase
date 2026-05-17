import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { CodexAppServerThread } from "#src/lib/codexAppServerResearch.ts";

vi.mock("#src/components/ChatInput.tsx", () => ({
  ChatInput: ({
    placeholder,
    value,
  }: {
    placeholder?: string;
    value?: string;
  }) => (
    <div data-component="ChatInput" data-placeholder={placeholder}>
      {value}
    </div>
  ),
}));

vi.mock("#src/components/ProsemarkReadOnly.tsx", () => ({
  ProsemarkReadOnly: ({
    className,
    value,
  }: {
    className?: string;
    value: string;
  }) => (
    <div data-component="ProsemarkReadOnly" className={className}>
      {value}
    </div>
  ),
}));

import {
  MachinesWorkspaceThreadHeader,
  MachinesWorkspaceThreadPane,
} from "./MachinesWorkspaceThreadPane";

const THREAD_FIXTURE: CodexAppServerThread = {
  agentNickname: null,
  agentRole: null,
  cliVersion: "0.117.0-alpha.10",
  createdAt: 1_775_541_200,
  cwd: "/Users/fixture/.codex/worktrees/demo/noter",
  gitInfo: null,
  id: "thread-machine-workspace-test",
  modelProvider: "openai",
  name: "Use ProseMark in /machines",
  path: "/Users/fixture/.codex/sessions/2026/04/02/thread.jsonl",
  preview: "Switch the main thread pane to the shared readonly renderer.",
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
  turns: [
    {
      errorMessage: null,
      id: "turn-machine-workspace-test",
      items: [
        {
          id: "item-user",
          raw: {
            text: "User message with `code`",
          },
          summary: "User message with code",
          type: "userMessage",
        },
        {
          id: "item-agent",
          raw: {
            text: "Assistant message with\n\n- a bullet",
          },
          summary: "Assistant message with a bullet",
          type: "agentMessage",
        },
      ],
      raw: null,
      status: "completed",
    },
  ],
  updatedAt: 1_775_541_282,
  workspace: {
    isProjectRoot: true,
    label: null,
  },
};

describe("MachinesWorkspaceThreadPane", () => {
  it("renders both user and assistant messages through ProsemarkReadOnly", () => {
    const markup = renderToStaticMarkup(
      <MachinesWorkspaceThreadPane
        thread={THREAD_FIXTURE}
        selectedThreadId={THREAD_FIXTURE.id}
        pendingConversation={null}
        selectedMachineStatusReason={null}
        hasPendingStartedThread={false}
        isLoading={false}
        errorMessage={null}
        isSubmittingTurn={false}
        turnDraft=""
        onTurnDraftChange={() => {}}
        onTurnSubmit={() => {}}
      />,
    );

    expect(markup).not.toContain("<pre");
    expect(markup).not.toContain("cm-static-markdown");
    expect(
      (markup.match(/data-component="ProsemarkReadOnly"/g) ?? []).length,
    ).toBe(2);
    expect(markup).toContain("User message with `code`");
    expect(markup).toContain("Assistant message with");
  });

  it("renders a draft worktree conversation empty state before the first message", () => {
    const markup = renderToStaticMarkup(
      <MachinesWorkspaceThreadPane
        thread={null}
        selectedThreadId={null}
        pendingConversation={{
          envMode: "worktree",
          projectLabel: "noter",
        }}
        selectedMachineStatusReason={null}
        hasPendingStartedThread={false}
        isLoading={false}
        errorMessage={null}
        isSubmittingTurn={false}
        turnDraft=""
        onTurnDraftChange={() => {}}
        onTurnSubmit={() => {}}
      />,
    );

    expect(markup).toContain("New conversation");
    expect(markup).toContain(
      "Send the first prompt to create a new worktree conversation in noter.",
    );
  });

  it("shows hydration copy while a newly started thread is still loading into inventory", () => {
    const markup = renderToStaticMarkup(
      <MachinesWorkspaceThreadPane
        thread={null}
        selectedThreadId="thread-machine-workspace-test"
        pendingConversation={null}
        selectedMachineStatusReason={null}
        hasPendingStartedThread={true}
        isLoading={false}
        errorMessage={null}
        isSubmittingTurn={false}
        turnDraft=""
        onTurnDraftChange={() => {}}
        onTurnSubmit={() => {}}
      />,
    );

    expect(markup).toContain("New conversation");
    expect(markup).toContain(
      "Waiting for the new conversation to hydrate. Its first message will appear here once the machine inventory refreshes.",
    );
    expect(markup).toContain(
      'data-placeholder="Waiting for the new conversation to hydrate..."',
    );
  });

  it("renders the moved header metadata in the shared route header component", () => {
    const markup = renderToStaticMarkup(
      <MachinesWorkspaceThreadHeader
        thread={null}
        selectedThreadId={null}
        pendingConversation={{
          envMode: "worktree",
          projectLabel: "noter",
        }}
        selectedMachineDisplayName="Research MacBook Pro"
        selectedMachineHostname="research-mbp.local"
        selectedMachineStatusReason={null}
        hasPendingStartedThread={false}
        isLoading={false}
      />,
    );

    expect(markup).toContain("Research MacBook Pro");
    expect(markup).toContain("noter · New worktree");
    expect(markup).toContain("New conversation");
    expect(markup).toContain("machines-workspace-thread-header-title-toggle");
    expect(markup).toContain("line-clamp-2");
    expect(markup).toContain("sm:line-clamp-1");
  });
});
