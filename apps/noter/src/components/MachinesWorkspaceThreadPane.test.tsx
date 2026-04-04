import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CodexAppServerThread } from "@/lib/codexAppServerResearch";

vi.mock("@/components/ChatInput", () => ({
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

vi.mock("@/components/StaticMarkdownDocument", () => ({
  StaticMarkdownDocument: ({
    className,
    value,
  }: {
    className?: string;
    value: string;
  }) => (
    <div data-component="StaticMarkdownDocument" className={className}>
      {value}
    </div>
  ),
}));

import { MachinesWorkspaceThreadPane } from "./MachinesWorkspaceThreadPane";

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
  it("renders the thread as one static markdown transcript", () => {
    const markup = renderToStaticMarkup(
      <MachinesWorkspaceThreadPane
        thread={THREAD_FIXTURE}
        selectedThreadId={THREAD_FIXTURE.id}
        pendingConversation={null}
        selectedMachineDisplayName="Research MacBook Pro"
        selectedMachineHostname="research-mbp.local"
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
    expect(
      (markup.match(/data-component="StaticMarkdownDocument"/g) ?? []).length,
    ).toBe(1);
    expect(markup).toContain(
      'data-testid="machines-workspace-thread-transcript"',
    );
    expect(markup).toContain("## @user");
    expect(markup).toContain("- item-id: item-user");
    expect(markup).toContain("- turn-id: turn-machine-workspace-test");
    expect(markup).toContain("User message with `code`");
    expect(markup).toContain("## @assistant");
    expect(markup).toContain("- item-id: item-agent");
    expect(markup).toContain("Assistant message with");
    expect(markup).not.toContain(
      "data-component=&quot;ProsemarkReadOnly&quot;",
    );
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
        selectedMachineDisplayName="Research MacBook Pro"
        selectedMachineHostname="research-mbp.local"
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
    expect(markup).toContain("noter · New worktree");
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
        selectedMachineDisplayName="Research MacBook Pro"
        selectedMachineHostname="research-mbp.local"
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
});
