import { describe, expect, it } from "vitest";

import { normalizeCodexAppServerEvent } from "./codexAppServerResearch";

describe("normalizeCodexAppServerEvent", () => {
  it("maps runtime readiness into a stable category", () => {
    expect(
      normalizeCodexAppServerEvent({
        method: "codex/runtime_ready",
        params: { startedAt: 123 },
      }),
    ).toMatchObject({
      kind: "runtime.ready",
      level: "success",
      title: "Runtime ready",
    });
  });

  it("summarizes runtime exits with code and signal details", () => {
    expect(
      normalizeCodexAppServerEvent({
        method: "codex/runtime_exit",
        params: { code: 130, signal: "SIGINT" },
      }),
    ).toMatchObject({
      kind: "runtime.exit",
      level: "warning",
      title: "Runtime exited",
      summary: "code 130, signal SIGINT",
    });
  });

  it("surfaces runtime stderr lines", () => {
    expect(
      normalizeCodexAppServerEvent({
        method: "codex/runtime_stderr",
        params: { line: "No matching routes found" },
      }),
    ).toMatchObject({
      kind: "runtime.stderr",
      level: "warning",
      title: "Runtime stderr",
      summary: "No matching routes found",
    });
  });

  it("enriches command approvals with a readable summary", () => {
    expect(
      normalizeCodexAppServerEvent({
        method: "item/commandExecution/requestApproval",
        params: {
          itemId: "cmd-1",
          commandText: "git status",
          cwd: "/repo",
        },
      }),
    ).toMatchObject({
      kind: "approval.requested",
      itemId: "cmd-1",
      summary: "git status",
    });
  });

  it("maps file change approvals into the same approval bucket", () => {
    expect(
      normalizeCodexAppServerEvent({
        method: "item/fileChange/requestApproval",
        params: {
          itemId: "change-1",
          cwd: "/repo",
        },
      }),
    ).toMatchObject({
      kind: "approval.requested",
      itemId: "change-1",
      summary: "/repo",
    });
  });

  it("maps file read approvals into the same approval bucket", () => {
    expect(
      normalizeCodexAppServerEvent({
        method: "item/fileRead/requestApproval",
        params: {
          itemId: "read-1",
          cwd: "/repo",
        },
      }),
    ).toMatchObject({
      kind: "approval.requested",
      itemId: "read-1",
      summary: "/repo",
    });
  });

  it("summarizes command execution item lifecycle events", () => {
    expect(
      normalizeCodexAppServerEvent({
        method: "item/started",
        params: {
          item: {
            id: "item-1",
            type: "commandExecution",
            command: "pnpm test",
            cwd: "/repo",
          },
        },
      }),
    ).toMatchObject({
      kind: "item.started",
      itemId: "item-1",
      itemType: "commandExecution",
      summary: "pnpm test (/repo)",
    });
  });

  it("summarizes completed file change items", () => {
    expect(
      normalizeCodexAppServerEvent({
        method: "item/completed",
        params: {
          item: {
            id: "item-2",
            type: "fileChange",
            changes: [{ path: "README.md" }, { path: "AGENTS.md" }],
          },
        },
      }),
    ).toMatchObject({
      kind: "item.completed",
      level: "success",
      itemId: "item-2",
      itemType: "fileChange",
      summary: "2 changes",
      title: "fileChange completed",
    });
  });

  it("keeps codex provider events visible but normalized", () => {
    expect(
      normalizeCodexAppServerEvent({
        method: "codex/event/exec_command_begin",
        params: {
          turnId: "turn-1",
          msg: {
            event_type: "exec_command_begin",
            call_id: "call-1",
          },
        },
      }),
    ).toMatchObject({
      kind: "provider.event",
      title: "exec_command_begin",
      summary: "exec_command_begin (call-1)",
      turnId: "turn-1",
    });
  });

  it("falls back to a generic provider notification bucket", () => {
    expect(
      normalizeCodexAppServerEvent({
        method: "thread/resumed",
        params: { threadId: "thread-1" },
      }),
    ).toMatchObject({
      kind: "provider.notification",
      title: "thread/resumed",
      summary: "thread-1",
    });
  });
});
