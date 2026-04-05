import { describe, expect, it } from "vitest";
import type {
  CodexAppServerStatusResponse,
  CodexAppServerThread,
} from "@/lib/codexAppServerResearch";
import {
  buildMachinesTranscriptPrototypeBlocks,
  pickMachinesTranscriptPrototypeThreadId,
} from "@/lib/machinesTranscriptPrototype";

const BASE_THREAD = {
  agentNickname: null,
  agentRole: null,
  cliVersion: "0.118.0",
  createdAt: 1_775_254_856,
  cwd: "/Users/nicu/.codex/worktrees/6892/noter",
  gitInfo: null,
  id: "thread-1",
  modelProvider: "openai",
  name: "Fixture thread",
  path: null,
  preview: "Fixture preview",
  project: {
    id: "/Users/nicu/dev/my/noter",
    label: "noter",
    rootCwd: "/Users/nicu/dev/my/noter",
  },
  raw: null,
  source: "vscode",
  sourceLabel: "vscode",
  status: {
    activeFlags: [],
    raw: { type: "notLoaded" },
    type: "notLoaded",
  },
  turns: [
    {
      errorMessage: null,
      id: "turn-1",
      items: [
        {
          id: "item-user",
          raw: {
            text: "Select across messages without editor boundaries.",
          },
          summary: "Select across messages without editor boundaries.",
          type: "userMessage",
        },
        {
          id: "item-tool",
          raw: {
            command: "pnpm exec vitest run",
          },
          summary: "pnpm exec vitest run",
          type: "commandExecution",
        },
        {
          id: "item-assistant",
          raw: {
            text: "Use one selectable transcript flow for the whole thread.",
          },
          summary: "Use one selectable transcript flow for the whole thread.",
          type: "agentMessage",
        },
      ],
      raw: null,
      status: "completed",
    },
  ],
  updatedAt: 1_775_429_773,
  workspace: {
    isProjectRoot: false,
    label: "6892",
  },
} as const satisfies CodexAppServerThread;

const BASE_STATUS = {
  codexInstallError: null,
  codexInstalled: true,
  codexVersion: "codex-cli 0.118.0",
  runtime: {
    currentThreadId: null,
    eventCursor: 0,
    initialized: false,
    lastError: null,
    lastExitCode: null,
    lastExitSignal: null,
    pendingApprovalCount: 0,
    pendingRequestCount: 0,
    running: false,
    startedAt: null,
  },
  workspaceRoot: "/Users/nicu/.codex/worktrees/6892/noter",
} as const satisfies CodexAppServerStatusResponse;

describe("buildMachinesTranscriptPrototypeBlocks", () => {
  it("keeps user and assistant messages while collapsing tool activity", () => {
    expect(buildMachinesTranscriptPrototypeBlocks(BASE_THREAD)).toEqual([
      {
        body: "Select across messages without editor boundaries.",
        from: "user",
        id: "item-user",
        itemId: "item-user",
        itemType: "userMessage",
        kind: "message",
        turnId: undefined,
      },
      {
        body: "Command: pnpm exec vitest run",
        id: "work-group-thread-1-0",
        itemId: "item-tool",
        itemType: "commandExecution",
        kind: "work",
        title: "Command",
        tone: "tool",
      },
      {
        body: "Use one selectable transcript flow for the whole thread.",
        from: "assistant",
        id: "item-assistant",
        itemId: "item-assistant",
        itemType: "agentMessage",
        kind: "message",
        turnId: undefined,
      },
    ]);
  });
});

describe("pickMachinesTranscriptPrototypeThreadId", () => {
  it("prefers the live current thread id when available", () => {
    expect(
      pickMachinesTranscriptPrototypeThreadId({
        status: {
          ...BASE_STATUS,
          runtime: {
            ...BASE_STATUS.runtime,
            currentThreadId: "thread-current",
          },
        },
        threads: [BASE_THREAD],
      }),
    ).toBe("thread-current");
  });

  it("falls back to the latest thread from the current workspace", () => {
    expect(
      pickMachinesTranscriptPrototypeThreadId({
        status: BASE_STATUS,
        threads: [
          {
            ...BASE_THREAD,
            cwd: "/Users/nicu/.codex/worktrees/other/noter",
            id: "thread-other",
          },
          BASE_THREAD,
        ],
      }),
    ).toBe("thread-1");
  });
});
