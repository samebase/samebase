"use node";

import { action, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { type Infer, v } from "convex/values";
import { internal } from "./_generated/api";

const executeCommandResult = v.object({
  stdout: v.string(),
  stderr: v.string(),
  exitCode: v.number(),
  success: v.boolean(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function jsonStringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "\"[unserializable]\"";
  }
}

/**
 * Execute a command in the Codespace
 */
export const executeCommand = action({
  args: {
    codespaceId: v.id("codespaces"),
    command: v.string(),
    workingDir: v.optional(v.string()),
    timeoutMs: v.optional(v.number()),
  },
  returns: executeCommandResult,
  handler: async (ctx, args): Promise<Infer<typeof executeCommandResult>> => {
    // Get codespace record with agentUrl and agentToken
    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(
        `Codespace is not running (current state: ${codespace.state})`,
      );
    }

    // Call agent via HTTP
    const response = await fetch(`${codespace.agentUrl}/exec`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${codespace.agentToken}`,
      },
      body: JSON.stringify({
        command: args.command,
        workingDir: args.workingDir,
        timeoutMs: args.timeoutMs || 60000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Agent request failed: ${response.statusText}`);
    }

    return await response.json();
  },
});

const writeFileToCodespaceResult = v.object({
  success: v.boolean(),
  filePath: v.string(),
});
/**
 * Write a file to the Codespace
 */
export const writeFileToCodespace = action({
  args: {
    codespaceId: v.id("codespaces"),
    filePath: v.string(),
    content: v.string(),
  },
  returns: writeFileToCodespaceResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof writeFileToCodespaceResult>> => {
    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(
        `Codespace is not running (current state: ${codespace.state})`,
      );
    }

    const response = await fetch(`${codespace.agentUrl}/files/write`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${codespace.agentToken}`,
      },
      body: JSON.stringify({
        filePath: args.filePath,
        content: args.content,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to write file: ${error}`);
    }

    return await response.json();
  },
});

/**
 * Read a file from the Codespace
 */
const readFileFromCodespaceResult = v.object({
  content: v.string(),
  filePath: v.string(),
});
export const readFileFromCodespace = action({
  args: {
    codespaceId: v.id("codespaces"),
    filePath: v.string(),
  },
  returns: readFileFromCodespaceResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof readFileFromCodespaceResult>> => {
    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(
        `Codespace is not running (current state: ${codespace.state})`,
      );
    }

    const response = await fetch(
      `${codespace.agentUrl}/files/read?filePath=${encodeURIComponent(
        args.filePath,
      )}`,
      {
        headers: {
          Authorization: `Bearer ${codespace.agentToken}`,
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to read file: ${error}`);
    }

    return await response.json();
  },
});

/**
 * List files in a directory in the Codespace
 */
const listFilesResult = v.object({
  files: v.array(
    v.object({
      name: v.string(),
      isDirectory: v.boolean(),
      isFile: v.boolean(),
      path: v.string(),
    }),
  ),
  dirPath: v.string(),
});
export const listFiles = action({
  args: {
    codespaceId: v.id("codespaces"),
    dirPath: v.optional(v.string()),
  },
  returns: listFilesResult,
  handler: async (ctx, args): Promise<Infer<typeof listFilesResult>> => {
    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(
        `Codespace is not running (current state: ${codespace.state})`,
      );
    }

    const url = new URL(`${codespace.agentUrl}/files/list`);
    if (args.dirPath) {
      url.searchParams.set("dirPath", args.dirPath);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${codespace.agentToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list files: ${error}`);
    }

    return await response.json();
  },
});

/**
 * Delete a file or directory in the Codespace
 */
const deleteFileResult = v.object({
  success: v.boolean(),
  filePath: v.string(),
});
export const deleteFile = action({
  args: {
    codespaceId: v.id("codespaces"),
    filePath: v.string(),
    recursive: v.optional(v.boolean()),
  },
  returns: deleteFileResult,
  handler: async (ctx, args): Promise<Infer<typeof deleteFileResult>> => {
    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(
        `Codespace is not running (current state: ${codespace.state})`,
      );
    }

    const response = await fetch(`${codespace.agentUrl}/files/delete`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${codespace.agentToken}`,
      },
      body: JSON.stringify({
        filePath: args.filePath,
        recursive: args.recursive || false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete file: ${error}`);
    }

    return await response.json();
  },
});

/**
 * Get file metadata in the Codespace
 */
const getFileStatResult = v.object({
  filePath: v.string(),
  size: v.number(),
  isDirectory: v.boolean(),
  isFile: v.boolean(),
  modifiedAt: v.string(),
  createdAt: v.string(),
});
export const getFileStat = action({
  args: {
    codespaceId: v.id("codespaces"),
    filePath: v.string(),
  },
  returns: getFileStatResult,
  handler: async (ctx, args): Promise<Infer<typeof getFileStatResult>> => {
    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(
        `Codespace is not running (current state: ${codespace.state})`,
      );
    }

    const response = await fetch(
      `${codespace.agentUrl}/files/stat?filePath=${encodeURIComponent(
        args.filePath,
      )}`,
      {
        headers: {
          Authorization: `Bearer ${codespace.agentToken}`,
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get file stat: ${error}`);
    }

    return await response.json();
  },
});

/**
 * Check health of the HTTP agent
 */
const checkAgentHealthResult = v.object({
  healthy: v.boolean(),
  status: v.optional(v.string()),
  uptime: v.optional(v.number()),
  timestamp: v.optional(v.number()),
});
export const checkAgentHealth = action({
  args: {
    codespaceId: v.id("codespaces"),
  },
  returns: checkAgentHealthResult,
  handler: async (ctx, args): Promise<Infer<typeof checkAgentHealthResult>> => {
    const codespace = await ctx.runQuery(
      internal.codespacesMutations.getCodespace,
      {
        codespaceId: args.codespaceId,
      },
    );

    if (!codespace) {
      return { healthy: false };
    }

    if (!codespace.agentUrl) {
      return { healthy: false };
    }

    try {
      const response = await fetch(`${codespace.agentUrl}/health`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        return { healthy: false };
      }

      const data = await response.json();

      // Update health status in database
      await ctx.runMutation(internal.codespacesMutations.updateAgentHealth, {
        codespaceId: args.codespaceId,
        healthy: true,
        lastHealthCheckAt: Date.now(),
      });

      return {
        healthy: true,
        status: data.status,
        uptime: data.uptime,
        timestamp: data.timestamp,
      };
    } catch (error) {
      // Update health status in database
      await ctx.runMutation(internal.codespacesMutations.updateAgentHealth, {
        codespaceId: args.codespaceId,
        healthy: false,
        lastHealthCheckAt: Date.now(),
      });

      return { healthy: false };
    }
  },
});

const codexRuntimeStatusResult = v.object({
  running: v.boolean(),
  initialized: v.boolean(),
  startedAt: v.optional(v.number()),
  currentThreadId: v.optional(v.string()),
  lastError: v.optional(v.string()),
  lastExitCode: v.optional(v.number()),
  lastExitSignal: v.optional(v.string()),
  pendingRequestCount: v.number(),
  pendingApprovalCount: v.number(),
  eventCursor: v.number(),
});

const codexStatusResult = v.object({
  codexInstalled: v.boolean(),
  codexVersion: v.optional(v.string()),
  codexInstallError: v.optional(v.string()),
  runtime: codexRuntimeStatusResult,
});

const startCodexThreadResult = v.object({
  threadId: v.string(),
  preview: v.optional(v.string()),
});

const startCodexTurnResult = v.object({
  turnId: v.string(),
});

const codexEventsResult = v.object({
  nextCursor: v.number(),
  events: v.array(
    v.object({
      cursor: v.number(),
      at: v.number(),
      method: v.string(),
      paramsJson: v.string(),
    }),
  ),
});

async function getActiveRunningCodespace(
  ctx: ActionCtx,
  codespaceId: Id<"codespaces">,
): Promise<{
  agentUrl: string;
  agentToken: string;
}> {
  const codespace = await ctx.runQuery(
    internal.codespacesMutations.getCodespace,
    {
      codespaceId,
    },
  );

  if (!codespace) {
    throw new Error("Codespace not found");
  }
  const agentUrl = codespace.agentUrl;
  const agentToken = codespace.agentToken;
  if (!agentUrl || !agentToken) {
    throw new Error("Codespace agent not available");
  }
  if (codespace.state !== "running") {
    throw new Error(
      `Codespace is not running (current state: ${codespace.state})`,
    );
  }

  return {
    agentUrl,
    agentToken,
  };
}

function normalizeCodexStatus(payload: unknown): Infer<typeof codexStatusResult> {
  const runtimeDefault: Infer<typeof codexRuntimeStatusResult> = {
    running: false,
    initialized: false,
    startedAt: undefined,
    currentThreadId: undefined,
    lastError: undefined,
    lastExitCode: undefined,
    lastExitSignal: undefined,
    pendingRequestCount: 0,
    pendingApprovalCount: 0,
    eventCursor: 0,
  };

  if (!isRecord(payload)) {
    return {
      codexInstalled: false,
      codexVersion: undefined,
      codexInstallError: "Invalid Codex status payload",
      runtime: runtimeDefault,
    };
  }

  const runtimeRecord = isRecord(payload.runtime) ? payload.runtime : {};
  const runtime: Infer<typeof codexRuntimeStatusResult> = {
    running: readBoolean(runtimeRecord, "running") ?? false,
    initialized: readBoolean(runtimeRecord, "initialized") ?? false,
    startedAt: readNumber(runtimeRecord, "startedAt"),
    currentThreadId: readString(runtimeRecord, "currentThreadId"),
    lastError: readString(runtimeRecord, "lastError"),
    lastExitCode: readNumber(runtimeRecord, "lastExitCode"),
    lastExitSignal: readString(runtimeRecord, "lastExitSignal"),
    pendingRequestCount: readNumber(runtimeRecord, "pendingRequestCount") ?? 0,
    pendingApprovalCount: readNumber(runtimeRecord, "pendingApprovalCount") ?? 0,
    eventCursor: readNumber(runtimeRecord, "eventCursor") ?? 0,
  };

  return {
    codexInstalled: readBoolean(payload, "codexInstalled") ?? false,
    codexVersion: readString(payload, "codexVersion"),
    codexInstallError: readString(payload, "codexInstallError"),
    runtime,
  };
}

async function fetchCodexStatusFromAgent(args: {
  agentUrl: string;
  agentToken: string;
}): Promise<Infer<typeof codexStatusResult>> {
  const response = await fetch(`${args.agentUrl}/codex/status`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${args.agentToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Codex status: ${error}`);
  }

  const payload = await response.json();
  return normalizeCodexStatus(payload);
}

/**
 * Get Codex app-server runtime status for a Codespace
 */
export const getCodexStatus = action({
  args: {
    codespaceId: v.id("codespaces"),
  },
  returns: codexStatusResult,
  handler: async (ctx, args): Promise<Infer<typeof codexStatusResult>> => {
    const codespace = await getActiveRunningCodespace(ctx, args.codespaceId);
    return await fetchCodexStatusFromAgent({
      agentUrl: codespace.agentUrl,
      agentToken: codespace.agentToken,
    });
  },
});

/**
 * Ensure Codex app-server runtime is running for this Codespace
 */
export const ensureCodexRuntime = action({
  args: {
    codespaceId: v.id("codespaces"),
    forceRestart: v.optional(v.boolean()),
  },
  returns: codexStatusResult,
  handler: async (ctx, args): Promise<Infer<typeof codexStatusResult>> => {
    const codespace = await getActiveRunningCodespace(ctx, args.codespaceId);
    const response = await fetch(`${codespace.agentUrl}/codex/runtime/ensure`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${codespace.agentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        forceRestart: args.forceRestart ?? false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to ensure Codex runtime: ${error}`);
    }

    return await fetchCodexStatusFromAgent({
      agentUrl: codespace.agentUrl,
      agentToken: codespace.agentToken,
    });
  },
});

/**
 * Start a Codex thread in the Codespace runtime
 */
export const startCodexThread = action({
  args: {
    codespaceId: v.id("codespaces"),
    model: v.optional(v.string()),
    cwd: v.optional(v.string()),
    approvalPolicy: v.optional(v.string()),
  },
  returns: startCodexThreadResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof startCodexThreadResult>> => {
    const codespace = await getActiveRunningCodespace(ctx, args.codespaceId);
    const response = await fetch(`${codespace.agentUrl}/codex/thread/start`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${codespace.agentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        cwd: args.cwd,
        approvalPolicy: args.approvalPolicy,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to start Codex thread: ${error}`);
    }

    const payload = await response.json();
    if (!isRecord(payload) || !isRecord(payload.thread)) {
      throw new Error("Invalid response from Codex thread/start");
    }

    const threadId = readString(payload.thread, "id");
    if (!threadId) {
      throw new Error("Codex thread/start response missing thread id");
    }

    return {
      threadId,
      preview: readString(payload.thread, "preview"),
    };
  },
});

/**
 * Start a Codex turn in the Codespace runtime
 */
export const startCodexTurn = action({
  args: {
    codespaceId: v.id("codespaces"),
    threadId: v.optional(v.string()),
    text: v.string(),
    cwd: v.optional(v.string()),
    approvalPolicy: v.optional(v.string()),
  },
  returns: startCodexTurnResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof startCodexTurnResult>> => {
    const codespace = await getActiveRunningCodespace(ctx, args.codespaceId);
    const response = await fetch(`${codespace.agentUrl}/codex/turn/start`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${codespace.agentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        threadId: args.threadId,
        text: args.text,
        cwd: args.cwd,
        approvalPolicy: args.approvalPolicy,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to start Codex turn: ${error}`);
    }

    const payload = await response.json();
    if (!isRecord(payload) || !isRecord(payload.turn)) {
      throw new Error("Invalid response from Codex turn/start");
    }

    const turnId = readString(payload.turn, "id");
    if (!turnId) {
      throw new Error("Codex turn/start response missing turn id");
    }

    return {
      turnId,
    };
  },
});

/**
 * Poll Codex runtime events buffered by the Codespace agent
 */
export const getCodexEvents = action({
  args: {
    codespaceId: v.id("codespaces"),
    since: v.optional(v.number()),
  },
  returns: codexEventsResult,
  handler: async (ctx, args): Promise<Infer<typeof codexEventsResult>> => {
    const codespace = await getActiveRunningCodespace(ctx, args.codespaceId);
    const since = args.since ?? 0;
    const response = await fetch(
      `${codespace.agentUrl}/codex/events?since=${encodeURIComponent(since)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${codespace.agentToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch Codex events: ${error}`);
    }

    const payload = await response.json();
    if (!isRecord(payload)) {
      throw new Error("Invalid response from Codex events endpoint");
    }

    const nextCursor = readNumber(payload, "nextCursor") ?? since;
    const eventsValue = payload.events;
    const events: Infer<typeof codexEventsResult>["events"] = [];

    if (Array.isArray(eventsValue)) {
      for (const event of eventsValue) {
        if (!isRecord(event)) {
          continue;
        }
        const cursor = readNumber(event, "cursor");
        const at = readNumber(event, "at");
        const method = readString(event, "method");
        if (cursor === undefined || at === undefined || !method) {
          continue;
        }
        events.push({
          cursor,
          at,
          method,
          paramsJson: jsonStringifySafe(event.params),
        });
      }
    }

    return {
      nextCursor,
      events,
    };
  },
});
