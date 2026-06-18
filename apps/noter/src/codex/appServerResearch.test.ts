import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  CodexAppServerRequestError,
  normalizeCodexAppServerEvent,
  requestCodexAppServerJson,
} from "./appServerResearch";

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

describe("requestCodexAppServerJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("supports custom base URLs and headers for tunneled machine requests", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      }),
    );

    await expect(
      requestCodexAppServerJson<{ ok: boolean }>({
        baseUrl: "https://machine-live-control.trycloudflare.com",
        headers: {
          Authorization: "Bearer machine-token",
        },
        path: "/status",
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://machine-live-control.trycloudflare.com/status",
      expect.objectContaining({
        headers: expect.any(Headers),
        method: "GET",
      }),
    );
    const fetchHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(fetchHeaders.get("Authorization")).toBe("Bearer machine-token");
  });

  it("throws a typed error with status when the request fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Machine control token expired." }), {
        headers: {
          "Content-Type": "application/json",
        },
        status: 401,
      }),
    );

    await expect(
      requestCodexAppServerJson({
        baseUrl: "https://machine-live-control.trycloudflare.com",
        path: "/threads",
      }),
    ).rejects.toEqual(
      expect.objectContaining<CodexAppServerRequestError>({
        message: "Machine control token expired.",
        name: "CodexAppServerRequestError",
        status: 401,
      }),
    );
  });

  it("falls back to a typed error when the tunnel returns non-JSON", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("<html>bad gateway</html>", {
        headers: {
          "Content-Type": "text/html",
        },
        status: 502,
      }),
    );

    await expect(
      requestCodexAppServerJson({
        baseUrl: "https://machine-live-control.trycloudflare.com",
        path: "/threads",
      }),
    ).rejects.toEqual(
      expect.objectContaining<CodexAppServerRequestError>({
        message: "<html>bad gateway</html>",
        name: "CodexAppServerRequestError",
        status: 502,
      }),
    );
  });
});
