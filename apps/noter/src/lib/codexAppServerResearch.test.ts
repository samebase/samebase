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
