import { describe, expect, it } from "vitest";
import type { CodexAppServerThread } from "@/lib/codexAppServerResearch";
import {
  deriveCodexThreadTimelineEntries,
  readCodexThreadItemDisplayText,
} from "@/lib/codexThreadTimeline";

const BASE_THREAD: CodexAppServerThread = {
  agentNickname: null,
  agentRole: null,
  cliVersion: null,
  createdAt: 1,
  cwd: "/repo",
  gitInfo: null,
  id: "thread-fixture",
  modelProvider: "openai",
  name: "Fixture thread",
  path: null,
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
  updatedAt: 2,
  workspace: {
    isProjectRoot: true,
    label: null,
  },
};

describe("readCodexThreadItemDisplayText", () => {
  it("falls back to text content arrays when the raw item has no top-level text", () => {
    expect(
      readCodexThreadItemDisplayText({
        id: "assistant-item",
        raw: {
          content: [{ text: "First paragraph" }, { text: "Second paragraph" }],
        },
        summary: "Summary",
        type: "assistantMessage",
      }),
    ).toBe("First paragraph\nSecond paragraph");
  });
});

describe("deriveCodexThreadTimelineEntries", () => {
  it("collapses consecutive tool items into one work group between messages", () => {
    const entries = deriveCodexThreadTimelineEntries({
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
              id: "command-1",
              raw: { command: "pnpm test", cwd: "/repo" },
              summary: "pnpm test",
              type: "commandExecution",
            },
            {
              id: "change-1",
              raw: {
                changes: [
                  { path: "README.md" },
                  { path: "apps/noter/src/App.tsx" },
                ],
              },
              summary: "2 changes",
              type: "fileChange",
            },
            {
              id: "assistant-1",
              raw: { text: "I narrowed it down to a snapshot drift." },
              summary: "I narrowed it down to a snapshot drift.",
              type: "agentMessage",
            },
          ],
          raw: null,
          status: "completed",
        },
      ],
    });

    expect(entries.map((entry) => entry.kind)).toEqual([
      "message",
      "work",
      "message",
    ]);

    const workGroup = entries[1];
    expect(workGroup).toMatchObject({
      kind: "work",
    });
    if (workGroup.kind !== "work") {
      throw new Error("Expected a work group.");
    }

    expect(workGroup.entries.map((entry) => entry.title)).toEqual([
      "Command",
      "File changes",
    ]);
    expect(workGroup.entries[0]?.preview).toBe("pnpm test");
    expect(workGroup.entries[1]?.changedFiles).toEqual([
      "README.md",
      "apps/noter/src/App.tsx",
    ]);
  });

  it("marks failing command items as error-toned work entries", () => {
    const entries = deriveCodexThreadTimelineEntries({
      ...BASE_THREAD,
      turns: [
        {
          errorMessage: null,
          id: "turn-2",
          items: [
            {
              id: "command-error",
              raw: {
                command: "pnpm lint",
                exitCode: 1,
                status: "failed",
              },
              summary: "pnpm lint",
              type: "commandExecution",
            },
          ],
          raw: null,
          status: "completed",
        },
      ],
    });

    expect(entries).toHaveLength(1);
    const workGroup = entries[0];
    if (workGroup.kind !== "work") {
      throw new Error("Expected one work group.");
    }
    expect(workGroup.entries[0].tone).toBe("error");
  });
});
