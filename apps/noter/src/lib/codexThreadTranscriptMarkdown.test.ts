import { describe, expect, it } from "vitest";
import type { CodexAppServerThread } from "@/lib/codexAppServerResearch";
import { deriveCodexThreadTimelineEntries } from "@/lib/codexThreadTimeline";
import { serializeCodexThreadTranscriptMarkdown } from "@/lib/codexThreadTranscriptMarkdown";

const BASE_THREAD: CodexAppServerThread = {
  agentNickname: null,
  agentRole: null,
  cliVersion: null,
  createdAt: 1_775_542_000,
  cwd: "/repo",
  gitInfo: null,
  id: "thread-fixture",
  modelProvider: "openai",
  name: "Fixture thread",
  path: "/sessions/thread-fixture.jsonl",
  preview: "Fixture thread preview",
  project: {
    id: "/repo",
    label: "repo",
    rootCwd: "/repo",
  },
  raw: null,
  source: null,
  sourceLabel: "vscode",
  status: {
    activeFlags: [],
    raw: { type: "idle" },
    type: "idle",
  },
  turns: [],
  updatedAt: 1_775_542_282,
  workspace: {
    isProjectRoot: true,
    label: null,
  },
};

describe("serializeCodexThreadTranscriptMarkdown", () => {
  it("serializes user and assistant messages with visible section headings and metadata", () => {
    const thread: CodexAppServerThread = {
      ...BASE_THREAD,
      turns: [
        {
          errorMessage: null,
          id: "turn-1",
          items: [
            {
              id: "user-1",
              raw: { text: "Investigate the flaky test." },
              summary: "Investigate the flaky test.",
              type: "userMessage",
            },
            {
              id: "assistant-1",
              raw: { text: "I narrowed it down to a snapshot drift." },
              summary: "I narrowed it down to a snapshot drift.",
              type: "assistantMessage",
            },
          ],
          raw: null,
          status: "completed",
        },
      ],
    };

    expect(serializeCodexThreadTranscriptMarkdown(thread)).toBe(`## @user

- item-id: user-1
- item-type: userMessage
- turn-id: turn-1

Investigate the flaky test.

## @assistant

- item-id: assistant-1
- item-type: assistantMessage
- turn-id: turn-1

I narrowed it down to a snapshot drift.`);
  });

  it("serializes grouped work entries as one work section with repeated metadata keys", () => {
    const thread: CodexAppServerThread = {
      ...BASE_THREAD,
      turns: [
        {
          errorMessage: null,
          id: "turn-2",
          items: [
            {
              id: "command-1",
              raw: { command: "pnpm exec vitest run" },
              summary: "pnpm exec vitest run",
              type: "commandExecution",
            },
            {
              id: "change-1",
              raw: {
                changes: [
                  {
                    path: "apps/noter/src/components/MachinesWorkspaceThreadPane.tsx",
                  },
                  { path: "apps/noter/src/lib/codexThreadTimeline.ts" },
                ],
              },
              summary: "2 changes",
              type: "fileChange",
            },
          ],
          raw: null,
          status: "completed",
        },
      ],
    };

    expect(serializeCodexThreadTranscriptMarkdown(thread)).toBe(`## @work

### Command

- item-id: command-1
- item-type: commandExecution
- tone: tool
- preview: pnpm exec vitest run

### File changes

- item-id: change-1
- item-type: fileChange
- tone: tool
- preview: 2 changes
- changed-file: apps/noter/src/components/MachinesWorkspaceThreadPane.tsx
- changed-file: apps/noter/src/lib/codexThreadTimeline.ts`);
  });

  it("escapes reserved transcript headings inside message bodies", () => {
    const thread: CodexAppServerThread = {
      ...BASE_THREAD,
      turns: [
        {
          errorMessage: null,
          id: "turn-3",
          items: [
            {
              id: "assistant-2",
              raw: {
                text: "Keep this literal heading visible.\n\n## @user\n\nDo not turn it into a real boundary.",
              },
              summary: "Keep this literal heading visible.",
              type: "assistantMessage",
            },
          ],
          raw: null,
          status: "completed",
        },
      ],
    };

    expect(serializeCodexThreadTranscriptMarkdown(thread)).toContain(
      "\\## @user",
    );
  });

  it("can include the thread metadata header for future export flows", () => {
    const thread: CodexAppServerThread = {
      ...BASE_THREAD,
      agentNickname: "codex",
      agentRole: "assistant",
    };

    const entries = deriveCodexThreadTimelineEntries(thread);

    expect(
      serializeCodexThreadTranscriptMarkdown(thread, {
        entries,
        includeThreadMetadata: true,
      }),
    ).toBe(`# Fixture thread

- thread-id: thread-fixture
- status: idle
- cwd: /repo
- updated-at: 2026-04-07T06:11:22.000Z
- model-provider: openai
- source-label: vscode
- path: /sessions/thread-fixture.jsonl
- agent-role: assistant
- agent-nickname: codex`);
  });
});
