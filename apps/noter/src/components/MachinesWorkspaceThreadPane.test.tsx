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

vi.mock("@/components/ProsemarkReadOnly", () => ({
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
  it("renders both user and assistant messages through ProsemarkReadOnly", () => {
    const markup = renderToStaticMarkup(
      <MachinesWorkspaceThreadPane
        thread={THREAD_FIXTURE}
        selectedThreadId={THREAD_FIXTURE.id}
        selectedMachineDisplayName="Research MacBook Pro"
        selectedMachineHostname="research-mbp.local"
        selectedMachineStatusReason={null}
        isLoading={false}
        errorMessage={null}
        isSubmittingTurn={false}
        model="gpt-5.4"
        reasoningEffort="xhigh"
        turnDraft=""
        onModelChange={() => {}}
        onReasoningEffortChange={() => {}}
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
});
