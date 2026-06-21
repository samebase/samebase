"use node";

import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { type Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../functions";
import { isRecord, readBoolean, readNumber, readString } from "../jsonUtils";
import { starterTemplateManifest } from "../starterSeedManifest.generated";
import { assertCodespacesEnabled } from "../../shared/featureFlags";
import { buildUrlWithSearchParams } from "../../shared/urlSearchParams";

const executeCommandResult = v.object({
  stdout: v.string(),
  stderr: v.string(),
  exitCode: v.number(),
  success: v.boolean(),
});
type ListFilesSearchParams = {
  dirPath: string | undefined;
};

function jsonStringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return '"[unserializable]"';
  }
}

const CODEX_AGENT_PACKAGE_JSON_PATH = ".codespace-agent/package.json";
const CODEX_AGENT_SERVER_PATH = ".codespace-agent/server.ts";
const CODEX_AGENT_SYNC_LOCK_DIR = ".codespace-agent/.sync-lock";
const CODEX_AGENT_SYNC_STATUS_PATH = ".codespace-agent/.sync-status.json";
const CODEX_AGENT_SYNC_BACKUP_PACKAGE_JSON_PATH = ".codespace-agent/.sync-backup-package.json";
const CODEX_AGENT_SYNC_BACKUP_SERVER_PATH = ".codespace-agent/.sync-backup-server.ts";
const CODEX_AGENT_RESTART_TIMEOUT_MS = 30000;
const CODEX_AGENT_RESTART_POLL_INTERVAL_MS = 1000;
const CODEX_AGENT_INSTALL_TIMEOUT_MS = 120000;
const CODEX_AGENT_SYNC_LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const CODEX_AGENT_SYNC_SETTLE_TIMEOUT_MS =
  CODEX_AGENT_RESTART_TIMEOUT_MS * 2 + CODEX_AGENT_INSTALL_TIMEOUT_MS;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shellQuote(value: string): string {
  return `'${value.split("'").join(`'"'"'`)}'`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getBundledCodespaceAgentAsset(path: string): string {
  const content = starterTemplateManifest.files[path];
  if (typeof content !== "string") {
    throw new Error(`Starter template manifest missing ${path}`);
  }
  return content;
}

/**
 * Execute a command in the Codespace
 */
export const executeCommand = action({
  access: "access_machines",
  args: {
    codespaceId: v.id("codespaces"),
    command: v.string(),
    workingDir: v.optional(v.string()),
    timeoutMs: v.optional(v.number()),
  },
  returns: executeCommandResult,
  handler: async (ctx, args): Promise<Infer<typeof executeCommandResult>> => {
    assertCodespacesEnabled();
    // Get codespace record with agentUrl and agentToken
    const codespace = await ctx.runQuery(internal.codespaces.mutations.getCodespace, {
      codespaceId: args.codespaceId,
    });

    if (!codespace || codespace.userId !== ctx.viewer.userId) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(`Codespace is not running (current state: ${codespace.state})`);
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
  access: "access_machines",
  args: {
    codespaceId: v.id("codespaces"),
    filePath: v.string(),
    content: v.string(),
  },
  returns: writeFileToCodespaceResult,
  handler: async (ctx, args): Promise<Infer<typeof writeFileToCodespaceResult>> => {
    assertCodespacesEnabled();
    const codespace = await ctx.runQuery(internal.codespaces.mutations.getCodespace, {
      codespaceId: args.codespaceId,
    });

    if (!codespace || codespace.userId !== ctx.viewer.userId) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(`Codespace is not running (current state: ${codespace.state})`);
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
  access: "access_machines",
  args: {
    codespaceId: v.id("codespaces"),
    filePath: v.string(),
  },
  returns: readFileFromCodespaceResult,
  handler: async (ctx, args): Promise<Infer<typeof readFileFromCodespaceResult>> => {
    assertCodespacesEnabled();
    const codespace = await ctx.runQuery(internal.codespaces.mutations.getCodespace, {
      codespaceId: args.codespaceId,
    });

    if (!codespace || codespace.userId !== ctx.viewer.userId) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(`Codespace is not running (current state: ${codespace.state})`);
    }

    const response = await fetch(
      `${codespace.agentUrl}/files/read?filePath=${encodeURIComponent(args.filePath)}`,
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
  access: "access_machines",
  args: {
    codespaceId: v.id("codespaces"),
    dirPath: v.optional(v.string()),
  },
  returns: listFilesResult,
  handler: async (ctx, args): Promise<Infer<typeof listFilesResult>> => {
    assertCodespacesEnabled();
    const codespace = await ctx.runQuery(internal.codespaces.mutations.getCodespace, {
      codespaceId: args.codespaceId,
    });

    if (!codespace || codespace.userId !== ctx.viewer.userId) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(`Codespace is not running (current state: ${codespace.state})`);
    }

    const url = buildUrlWithSearchParams(`${codespace.agentUrl}/files/list`, {
      dirPath: args.dirPath,
    } satisfies ListFilesSearchParams);

    const response = await fetch(url, {
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
  access: "access_machines",
  args: {
    codespaceId: v.id("codespaces"),
    filePath: v.string(),
    recursive: v.optional(v.boolean()),
  },
  returns: deleteFileResult,
  handler: async (ctx, args): Promise<Infer<typeof deleteFileResult>> => {
    assertCodespacesEnabled();
    const codespace = await ctx.runQuery(internal.codespaces.mutations.getCodespace, {
      codespaceId: args.codespaceId,
    });

    if (!codespace || codespace.userId !== ctx.viewer.userId) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(`Codespace is not running (current state: ${codespace.state})`);
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
  access: "access_machines",
  args: {
    codespaceId: v.id("codespaces"),
    filePath: v.string(),
  },
  returns: getFileStatResult,
  handler: async (ctx, args): Promise<Infer<typeof getFileStatResult>> => {
    assertCodespacesEnabled();
    const codespace = await ctx.runQuery(internal.codespaces.mutations.getCodespace, {
      codespaceId: args.codespaceId,
    });

    if (!codespace || codespace.userId !== ctx.viewer.userId) {
      throw new Error("Codespace not found");
    }

    if (!codespace.agentUrl || !codespace.agentToken) {
      throw new Error("Codespace agent not available");
    }

    if (codespace.state !== "running") {
      throw new Error(`Codespace is not running (current state: ${codespace.state})`);
    }

    const response = await fetch(
      `${codespace.agentUrl}/files/stat?filePath=${encodeURIComponent(args.filePath)}`,
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
  access: "access_machines",
  args: {
    codespaceId: v.id("codespaces"),
  },
  returns: checkAgentHealthResult,
  handler: async (ctx, args): Promise<Infer<typeof checkAgentHealthResult>> => {
    assertCodespacesEnabled();
    const codespace = await ctx.runQuery(internal.codespaces.mutations.getCodespace, {
      codespaceId: args.codespaceId,
    });

    if (!codespace || codespace.userId !== ctx.viewer.userId) {
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
      await ctx.runMutation(internal.codespaces.mutations.updateAgentHealth, {
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
    } catch {
      // Update health status in database
      await ctx.runMutation(internal.codespaces.mutations.updateAgentHealth, {
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
  userId: Id<"users">,
): Promise<{
  agentUrl: string;
  agentToken: string;
}> {
  assertCodespacesEnabled();
  const codespace = await ctx.runQuery(internal.codespaces.mutations.getCodespace, {
    codespaceId,
  });

  if (!codespace || codespace.userId !== userId) {
    throw new Error("Codespace not found");
  }
  const agentUrl = codespace.agentUrl;
  const agentToken = codespace.agentToken;
  if (!agentUrl || !agentToken) {
    throw new Error("Codespace agent not available");
  }
  if (codespace.state !== "running") {
    throw new Error(`Codespace is not running (current state: ${codespace.state})`);
  }

  return {
    agentUrl,
    agentToken,
  };
}

async function readCodespaceFileOrNull(args: {
  agentUrl: string;
  agentToken: string;
  filePath: string;
}): Promise<string | null> {
  const response = await fetch(
    `${args.agentUrl}/files/read?filePath=${encodeURIComponent(args.filePath)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${args.agentToken}`,
      },
      signal: AbortSignal.timeout(10000),
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to read ${args.filePath}: ${error}`);
  }

  const payload = await response.json();
  if (!isRecord(payload)) {
    throw new Error(`Invalid response while reading ${args.filePath}`);
  }

  const content = readString(payload, "content");
  if (content === undefined) {
    throw new Error(`Codespace file read missing content for ${args.filePath}`);
  }

  return content;
}

async function writeCodespaceFile(args: {
  agentUrl: string;
  agentToken: string;
  filePath: string;
  content: string;
}): Promise<void> {
  const response = await fetch(`${args.agentUrl}/files/write`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.agentToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filePath: args.filePath,
      content: args.content,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to write ${args.filePath}: ${error}`);
  }
}

async function deleteCodespacePathIfExists(args: {
  agentUrl: string;
  agentToken: string;
  filePath: string;
}): Promise<void> {
  await executeCodespaceAgentCommand({
    agentUrl: args.agentUrl,
    agentToken: args.agentToken,
    command: `rm -rf ${shellQuote(args.filePath)}`,
    timeoutMs: 5000,
  });
}

async function executeCodespaceAgentCommandResult(args: {
  agentUrl: string;
  agentToken: string;
  command: string;
  timeoutMs: number;
}): Promise<Infer<typeof executeCommandResult>> {
  const response = await fetch(`${args.agentUrl}/exec`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.agentToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      command: args.command,
      timeoutMs: args.timeoutMs,
    }),
    signal: AbortSignal.timeout(args.timeoutMs + 5000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Codespace command failed: ${error}`);
  }

  const payload = await response.json();
  if (!isRecord(payload)) {
    throw new Error("Invalid response from Codespace command execution");
  }

  const stdout = readString(payload, "stdout");
  const stderr = readString(payload, "stderr");
  const exitCode = readNumber(payload, "exitCode");
  const success = readBoolean(payload, "success");

  if (
    stdout === undefined ||
    stderr === undefined ||
    exitCode === undefined ||
    success === undefined
  ) {
    throw new Error("Invalid Codespace command execution payload");
  }

  return {
    stdout,
    stderr,
    exitCode,
    success,
  };
}

async function executeCodespaceAgentCommand(args: {
  agentUrl: string;
  agentToken: string;
  command: string;
  timeoutMs: number;
}): Promise<void> {
  const payload = await executeCodespaceAgentCommandResult(args);

  if (!payload.success) {
    throw new Error(`Codespace command failed: ${payload.stderr || "unknown error"}`);
  }
}

async function waitForCodespaceAgent(args: {
  agentUrl: string;
  timeoutMs?: number;
}): Promise<void> {
  const deadline = Date.now() + (args.timeoutMs ?? CODEX_AGENT_RESTART_TIMEOUT_MS);
  let lastError = "Timed out waiting for Codespace agent restart";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${args.agentUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        return;
      }
      lastError = `health returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => {
      setTimeout(resolve, CODEX_AGENT_RESTART_POLL_INTERVAL_MS);
    });
  }

  throw new Error(`Codespace agent did not restart cleanly: ${lastError}`);
}

async function isCodespaceAgentHealthy(args: { agentUrl: string }): Promise<boolean> {
  try {
    const response = await fetch(`${args.agentUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function tryAcquireCodespaceAgentSyncLock(args: {
  agentUrl: string;
  agentToken: string;
  lockToken: string;
}): Promise<boolean> {
  const command = [
    "set -eu",
    `lock_dir=${shellQuote(CODEX_AGENT_SYNC_LOCK_DIR)}`,
    `lock_token=${shellQuote(args.lockToken)}`,
    `timeout_seconds=${Math.ceil(CODEX_AGENT_SYNC_LOCK_TIMEOUT_MS / 1000)}`,
    'mkdir -p ".codespace-agent"',
    'if mkdir "$lock_dir" 2>/dev/null; then',
    '  date +%s >"$lock_dir/started_at"',
    '  printf "%s\\n" "$lock_token" >"$lock_dir/token"',
    '  printf "acquired"',
    "  exit 0",
    "fi",
    "now=$(date +%s)",
    "started_at=0",
    'if [ -f "$lock_dir/started_at" ]; then',
    '  started_at=$(cat "$lock_dir/started_at" 2>/dev/null || printf "0")',
    "fi",
    'if [ $((now - started_at)) -ge "$timeout_seconds" ]; then',
    '  rm -rf "$lock_dir"',
    '  if ! mkdir "$lock_dir" 2>/dev/null; then',
    '    if [ -d "$lock_dir" ]; then',
    '      printf "busy"',
    "      exit 0",
    "    fi",
    "    exit 1",
    "  fi",
    '  date +%s >"$lock_dir/started_at"',
    '  printf "%s\\n" "$lock_token" >"$lock_dir/token"',
    '  printf "acquired"',
    "  exit 0",
    "fi",
    'printf "busy"',
  ].join("\n");

  const result = await executeCodespaceAgentCommandResult({
    agentUrl: args.agentUrl,
    agentToken: args.agentToken,
    command,
    timeoutMs: 5000,
  });

  if (!result.success) {
    throw new Error(`Codespace command failed: ${result.stderr || "unknown error"}`);
  }

  return result.stdout.trim() === "acquired";
}

async function releaseCodespaceAgentSyncLock(args: {
  agentUrl: string;
  agentToken: string;
  lockToken: string;
}): Promise<void> {
  const command = [
    "set -eu",
    `lock_dir=${shellQuote(CODEX_AGENT_SYNC_LOCK_DIR)}`,
    `lock_token=${shellQuote(args.lockToken)}`,
    'if [ ! -d "$lock_dir" ]; then',
    "  exit 0",
    "fi",
    'current_token=""',
    'if [ -f "$lock_dir/token" ]; then',
    '  current_token=$(cat "$lock_dir/token" 2>/dev/null || printf "")',
    "fi",
    'if [ "$current_token" = "$lock_token" ]; then',
    '  rm -rf "$lock_dir"',
    "fi",
  ].join("\n");

  await executeCodespaceAgentCommand({
    agentUrl: args.agentUrl,
    agentToken: args.agentToken,
    command,
    timeoutMs: 5000,
  });
}

async function isCodespaceAgentSyncLockHeld(args: {
  agentUrl: string;
  agentToken: string;
}): Promise<boolean> {
  const result = await executeCodespaceAgentCommandResult({
    agentUrl: args.agentUrl,
    agentToken: args.agentToken,
    command: `if [ -d ${shellQuote(CODEX_AGENT_SYNC_LOCK_DIR)} ]; then printf "locked"; else printf "unlocked"; fi`,
    timeoutMs: 5000,
  });

  if (!result.success) {
    throw new Error(`Codespace command failed: ${result.stderr || "unknown error"}`);
  }

  return result.stdout.trim() === "locked";
}

async function waitForCodespaceAgentSyncToSettle(args: {
  agentUrl: string;
  agentToken: string;
}): Promise<void> {
  const deadline = Date.now() + CODEX_AGENT_SYNC_LOCK_TIMEOUT_MS;
  let lastError = "Timed out waiting for Codespace agent sync";

  while (Date.now() < deadline) {
    try {
      const healthy = await isCodespaceAgentHealthy({
        agentUrl: args.agentUrl,
      });
      if (!healthy) {
        lastError = "agent is restarting";
      } else if (!(await isCodespaceAgentSyncLockHeld(args))) {
        return;
      } else {
        lastError = "sync lock still held";
      }
    } catch (error) {
      lastError = describeError(error);
    }

    await sleep(CODEX_AGENT_RESTART_POLL_INTERVAL_MS);
  }

  throw new Error(`Codespace agent sync did not settle cleanly: ${lastError}`);
}

type CodespaceAgentSyncStatus = {
  token: string;
  status: "success" | "rolled_back";
};

function parseCodespaceAgentSyncStatus(content: string | null): CodespaceAgentSyncStatus | null {
  if (content === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const token = readString(parsed, "token");
  const status = readString(parsed, "status");
  if (token === undefined) {
    return null;
  }
  if (status !== "success" && status !== "rolled_back") {
    return null;
  }

  return {
    token,
    status,
  };
}

async function waitForCodespaceAgentSyncResult(args: {
  agentUrl: string;
  agentToken: string;
  lockToken: string;
}): Promise<CodespaceAgentSyncStatus> {
  const deadline = Date.now() + CODEX_AGENT_SYNC_SETTLE_TIMEOUT_MS;
  let lastError = "Timed out waiting for Codespace agent sync result";

  while (Date.now() < deadline) {
    try {
      const healthy = await isCodespaceAgentHealthy({
        agentUrl: args.agentUrl,
      });
      if (!healthy) {
        lastError = "agent is not healthy yet";
        await sleep(CODEX_AGENT_RESTART_POLL_INTERVAL_MS);
        continue;
      }

      const lockHeld = await isCodespaceAgentSyncLockHeld(args);
      if (lockHeld) {
        lastError = "sync lock still held";
        await sleep(CODEX_AGENT_RESTART_POLL_INTERVAL_MS);
        continue;
      }

      const status = parseCodespaceAgentSyncStatus(
        await readCodespaceFileOrNull({
          agentUrl: args.agentUrl,
          agentToken: args.agentToken,
          filePath: CODEX_AGENT_SYNC_STATUS_PATH,
        }),
      );

      if (status?.token === args.lockToken) {
        return status;
      }

      lastError = status === null ? "sync status file missing" : "sync status token mismatch";
    } catch (error) {
      lastError = describeError(error);
    }

    await sleep(CODEX_AGENT_RESTART_POLL_INTERVAL_MS);
  }

  throw new Error(`Codespace agent sync did not report a completion status: ${lastError}`);
}

async function storeCodespaceAgentRollbackFile(args: {
  agentUrl: string;
  agentToken: string;
  filePath: string;
  content: string | null;
}): Promise<void> {
  if (args.content === null) {
    await deleteCodespacePathIfExists({
      agentUrl: args.agentUrl,
      agentToken: args.agentToken,
      filePath: args.filePath,
    });
    return;
  }

  await writeCodespaceFile({
    agentUrl: args.agentUrl,
    agentToken: args.agentToken,
    filePath: args.filePath,
    content: args.content,
  });
}

async function cleanupCodespaceAgentSyncArtifacts(args: {
  agentUrl: string;
  agentToken: string;
}): Promise<void> {
  const command = [
    "set -eu",
    `rm -f ${shellQuote(CODEX_AGENT_SYNC_BACKUP_PACKAGE_JSON_PATH)}`,
    `rm -f ${shellQuote(CODEX_AGENT_SYNC_BACKUP_SERVER_PATH)}`,
  ].join("\n");

  await executeCodespaceAgentCommand({
    agentUrl: args.agentUrl,
    agentToken: args.agentToken,
    command,
    timeoutMs: 5000,
  });
}

async function restoreCodespaceAgentFiles(args: {
  agentUrl: string;
  agentToken: string;
  packageContent: string | null;
  serverContent: string | null;
  packageChanged: boolean;
  serverChanged: boolean;
}): Promise<void> {
  if (args.packageChanged) {
    await storeCodespaceAgentRollbackFile({
      agentUrl: args.agentUrl,
      agentToken: args.agentToken,
      filePath: CODEX_AGENT_PACKAGE_JSON_PATH,
      content: args.packageContent,
    });
  }

  if (args.serverChanged) {
    await storeCodespaceAgentRollbackFile({
      agentUrl: args.agentUrl,
      agentToken: args.agentToken,
      filePath: CODEX_AGENT_SERVER_PATH,
      content: args.serverContent,
    });
  }

  if (args.packageChanged && args.packageContent !== null) {
    await executeCodespaceAgentCommand({
      agentUrl: args.agentUrl,
      agentToken: args.agentToken,
      command: "cd .codespace-agent && npm install --no-package-lock",
      timeoutMs: CODEX_AGENT_INSTALL_TIMEOUT_MS,
    });
  }
}

export function buildCodespaceAgentRestartCommand(args: {
  lockToken: string;
  packageChanged: boolean;
  packageBackupExists: boolean;
  serverBackupExists: boolean;
}): string {
  const successStatus = JSON.stringify({
    token: args.lockToken,
    status: "success",
  });
  const rolledBackStatus = JSON.stringify({
    token: args.lockToken,
    status: "rolled_back",
  });

  const script = [
    "set -eu",
    `lock_dir=${shellQuote(CODEX_AGENT_SYNC_LOCK_DIR)}`,
    `status_path=${shellQuote(CODEX_AGENT_SYNC_STATUS_PATH)}`,
    `backup_package_path=${shellQuote(CODEX_AGENT_SYNC_BACKUP_PACKAGE_JSON_PATH)}`,
    `backup_server_path=${shellQuote(CODEX_AGENT_SYNC_BACKUP_SERVER_PATH)}`,
    `package_path=${shellQuote(CODEX_AGENT_PACKAGE_JSON_PATH)}`,
    `server_path=${shellQuote(CODEX_AGENT_SERVER_PATH)}`,
    'pid_path="/tmp/codespace-agent.pid"',
    `package_changed=${args.packageChanged ? "1" : "0"}`,
    `package_backup_exists=${args.packageBackupExists ? "1" : "0"}`,
    `server_backup_exists=${args.serverBackupExists ? "1" : "0"}`,
    `install_timeout_seconds=${Math.ceil(CODEX_AGENT_INSTALL_TIMEOUT_MS / 1000)}`,
    `restart_timeout_seconds=${Math.ceil(CODEX_AGENT_RESTART_TIMEOUT_MS / 1000)}`,
    `poll_interval_seconds=${Math.max(1, Math.ceil(CODEX_AGENT_RESTART_POLL_INTERVAL_MS / 1000))}`,
    "stop_agent() {",
    '  server_pid=""',
    '  if [ -f "$pid_path" ]; then',
    '    server_pid=$(cat "$pid_path" 2>/dev/null || true)',
    "  fi",
    '  if [ -n "$server_pid" ] && ! ps -p "$server_pid" -o args= | grep -F "$server_path" >/dev/null 2>&1; then',
    '    server_pid=""',
    "  fi",
    '  if [ -z "$server_pid" ]; then',
    '    server_pid=$(pgrep -f "[n]ode .*(\\.codespace-agent/)?server\\.(js|ts)([[:space:]]|$)" | head -n 1 || true)',
    "  fi",
    '  if [ -n "$server_pid" ]; then',
    '    kill -TERM "$server_pid" || true',
    "  fi",
    "  for _ in 1 2 3 4 5; do",
    '    if [ -z "$server_pid" ] || ! kill -0 "$server_pid" 2>/dev/null; then',
    '      rm -f "$pid_path"',
    "      return 0",
    "    fi",
    '    sleep "$poll_interval_seconds"',
    "  done",
    '  if [ -n "$server_pid" ] && kill -0 "$server_pid" 2>/dev/null; then',
    '    kill -KILL "$server_pid" || true',
    "    for _ in 1 2 3 4 5; do",
    '      if ! kill -0 "$server_pid" 2>/dev/null; then',
    '        rm -f "$pid_path"',
    "        return 0",
    "      fi",
    '      sleep "$poll_interval_seconds"',
    "    done",
    "  fi",
    '  if [ -n "$server_pid" ] && kill -0 "$server_pid" 2>/dev/null; then',
    "    return 1",
    "  fi",
    '  rm -f "$pid_path"',
    "  return 0",
    "}",
    "start_agent() {",
    '  nohup node "$server_path" >/tmp/codespace-agent.log 2>&1 < /dev/null &',
    '  echo $! > "$pid_path"',
    "}",
    "wait_for_local_health() {",
    "  deadline=$(( $(date +%s) + restart_timeout_seconds ))",
    '  while [ "$(date +%s)" -lt "$deadline" ]; do',
    '    if curl --max-time "$poll_interval_seconds" -fsS "http://127.0.0.1:${AGENT_PORT:-3000}/health" >/dev/null 2>&1; then',
    "      return 0",
    "    fi",
    '    sleep "$poll_interval_seconds"',
    "  done",
    "  return 1",
    "}",
    "restore_backups() {",
    '  if [ "$package_backup_exists" = "1" ]; then',
    '    cp "$backup_package_path" "$package_path"',
    "  else",
    '    rm -f "$package_path"',
    "  fi",
    '  if [ "$server_backup_exists" = "1" ]; then',
    '    cp "$backup_server_path" "$server_path"',
    "  else",
    '    rm -f "$server_path"',
    "  fi",
    '  rm -f "$pid_path"',
    '  if [ "$package_changed" = "1" ] && [ "$package_backup_exists" = "1" ]; then',
    '    (cd .codespace-agent && timeout "$install_timeout_seconds" npm install --no-package-lock >/tmp/codespace-agent-rollback-install.log 2>&1) || true',
    "  fi",
    "}",
    "cleanup() {",
    '  rm -f "$backup_package_path" "$backup_server_path"',
    '  rm -f "$pid_path"',
    '  rm -rf "$lock_dir"',
    "}",
    "stop_agent",
    "start_agent",
    "if wait_for_local_health; then",
    `  printf '%s\\n' ${shellQuote(successStatus)} >"$status_path"`,
    "  cleanup",
    "  exit 0",
    "fi",
    "restore_backups",
    "stop_agent",
    "start_agent",
    "if wait_for_local_health; then",
    `  printf '%s\\n' ${shellQuote(rolledBackStatus)} >"$status_path"`,
    "  cleanup",
    "  exit 0",
    "fi",
    "cleanup",
    "exit 1",
  ].join("\n");

  return [
    "nohup bash -lc ",
    shellQuote(script),
    " >/tmp/codespace-agent-restart.log 2>&1 < /dev/null & echo restart-scheduled",
  ].join("");
}

async function restartCodespaceAgent(args: {
  agentUrl: string;
  agentToken: string;
  lockToken: string;
  packageChanged: boolean;
  packageBackupExists: boolean;
  serverBackupExists: boolean;
}): Promise<void> {
  await executeCodespaceAgentCommand({
    agentUrl: args.agentUrl,
    agentToken: args.agentToken,
    command: buildCodespaceAgentRestartCommand(args),
    timeoutMs: 5000,
  });

  await waitForCodespaceAgent({
    agentUrl: args.agentUrl,
    timeoutMs: CODEX_AGENT_SYNC_SETTLE_TIMEOUT_MS,
  });
}

async function syncBundledCodespaceAgent(args: {
  agentUrl: string;
  agentToken: string;
}): Promise<void> {
  const bundledPackageJson = getBundledCodespaceAgentAsset(CODEX_AGENT_PACKAGE_JSON_PATH);
  const bundledServer = getBundledCodespaceAgentAsset(CODEX_AGENT_SERVER_PATH);

  for (;;) {
    const currentPackageJson = await readCodespaceFileOrNull({
      agentUrl: args.agentUrl,
      agentToken: args.agentToken,
      filePath: CODEX_AGENT_PACKAGE_JSON_PATH,
    });
    const currentServer = await readCodespaceFileOrNull({
      agentUrl: args.agentUrl,
      agentToken: args.agentToken,
      filePath: CODEX_AGENT_SERVER_PATH,
    });

    const packageChanged = currentPackageJson !== bundledPackageJson;
    const serverChanged = currentServer !== bundledServer;

    if (!packageChanged && !serverChanged) {
      return;
    }

    const lockToken = crypto.randomUUID();
    const acquiredLock = await tryAcquireCodespaceAgentSyncLock({
      agentUrl: args.agentUrl,
      agentToken: args.agentToken,
      lockToken,
    });

    if (!acquiredLock) {
      await waitForCodespaceAgentSyncToSettle(args);
      continue;
    }

    let restartScheduled = false;
    let syncCompleted = false;
    let syncError: unknown = null;
    let postSyncError: unknown = null;

    try {
      const lockedPackageJson = await readCodespaceFileOrNull({
        agentUrl: args.agentUrl,
        agentToken: args.agentToken,
        filePath: CODEX_AGENT_PACKAGE_JSON_PATH,
      });
      const lockedServer = await readCodespaceFileOrNull({
        agentUrl: args.agentUrl,
        agentToken: args.agentToken,
        filePath: CODEX_AGENT_SERVER_PATH,
      });

      const lockedPackageChanged = lockedPackageJson !== bundledPackageJson;
      const lockedServerChanged = lockedServer !== bundledServer;

      if (!lockedPackageChanged && !lockedServerChanged) {
        syncCompleted = true;
      } else {
        await storeCodespaceAgentRollbackFile({
          agentUrl: args.agentUrl,
          agentToken: args.agentToken,
          filePath: CODEX_AGENT_SYNC_BACKUP_PACKAGE_JSON_PATH,
          content: lockedPackageJson,
        });
        await storeCodespaceAgentRollbackFile({
          agentUrl: args.agentUrl,
          agentToken: args.agentToken,
          filePath: CODEX_AGENT_SYNC_BACKUP_SERVER_PATH,
          content: lockedServer,
        });

        try {
          if (lockedPackageChanged) {
            await writeCodespaceFile({
              agentUrl: args.agentUrl,
              agentToken: args.agentToken,
              filePath: CODEX_AGENT_PACKAGE_JSON_PATH,
              content: bundledPackageJson,
            });
          }

          if (lockedServerChanged) {
            await writeCodespaceFile({
              agentUrl: args.agentUrl,
              agentToken: args.agentToken,
              filePath: CODEX_AGENT_SERVER_PATH,
              content: bundledServer,
            });
          }

          if (lockedPackageChanged) {
            await executeCodespaceAgentCommand({
              agentUrl: args.agentUrl,
              agentToken: args.agentToken,
              command: "cd .codespace-agent && npm install --no-package-lock",
              timeoutMs: CODEX_AGENT_INSTALL_TIMEOUT_MS,
            });
          }
        } catch (error) {
          const restorePrefix = `Failed to update bundled Codespace agent: ${describeError(error)}`;

          try {
            await restoreCodespaceAgentFiles({
              agentUrl: args.agentUrl,
              agentToken: args.agentToken,
              packageContent: lockedPackageJson,
              serverContent: lockedServer,
              packageChanged: lockedPackageChanged,
              serverChanged: lockedServerChanged,
            });
          } catch (restoreError) {
            syncError = new Error(
              `${restorePrefix}; rollback failed before restart: ${describeError(restoreError)}`,
            );
          }

          if (syncError === null) {
            syncError = error;
          }
        }

        if (syncError === null) {
          await restartCodespaceAgent({
            agentUrl: args.agentUrl,
            agentToken: args.agentToken,
            lockToken,
            packageChanged: lockedPackageChanged,
            packageBackupExists: lockedPackageJson !== null,
            serverBackupExists: lockedServer !== null,
          });
          restartScheduled = true;

          const syncStatus = await waitForCodespaceAgentSyncResult({
            agentUrl: args.agentUrl,
            agentToken: args.agentToken,
            lockToken,
          });

          if (syncStatus.status === "rolled_back") {
            syncError = new Error(
              "Bundled Codespace agent update was rolled back after the refreshed agent failed to become healthy",
            );
          } else {
            syncCompleted = true;
          }
        }
      }
    } catch (error) {
      syncError = error;
    } finally {
      if (!restartScheduled) {
        try {
          await cleanupCodespaceAgentSyncArtifacts(args);
        } catch (artifactCleanupError) {
          if (syncError === null) {
            postSyncError = artifactCleanupError;
          }
        }

        try {
          await releaseCodespaceAgentSyncLock({
            agentUrl: args.agentUrl,
            agentToken: args.agentToken,
            lockToken,
          });
        } catch (releaseError) {
          if (syncError === null && postSyncError === null) {
            postSyncError = releaseError;
          }
        }
      }
    }

    if (syncError !== null) {
      throw syncError;
    }
    if (postSyncError !== null) {
      throw postSyncError;
    }
    if (syncCompleted) {
      return;
    }
  }
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
  access: "access_machines",
  args: {
    codespaceId: v.id("codespaces"),
  },
  returns: codexStatusResult,
  handler: async (ctx, args): Promise<Infer<typeof codexStatusResult>> => {
    const codespace = await getActiveRunningCodespace(ctx, args.codespaceId, ctx.viewer.userId);
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
  access: "access_machines",
  args: {
    codespaceId: v.id("codespaces"),
    forceRestart: v.optional(v.boolean()),
  },
  returns: codexStatusResult,
  handler: async (ctx, args): Promise<Infer<typeof codexStatusResult>> => {
    const codespace = await getActiveRunningCodespace(ctx, args.codespaceId, ctx.viewer.userId);
    await syncBundledCodespaceAgent(codespace);
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
  access: "access_machines",
  args: {
    codespaceId: v.id("codespaces"),
    model: v.optional(v.string()),
    cwd: v.optional(v.string()),
    approvalPolicy: v.optional(v.string()),
  },
  returns: startCodexThreadResult,
  handler: async (ctx, args): Promise<Infer<typeof startCodexThreadResult>> => {
    const codespace = await getActiveRunningCodespace(ctx, args.codespaceId, ctx.viewer.userId);
    await syncBundledCodespaceAgent(codespace);
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
  access: "access_machines",
  args: {
    codespaceId: v.id("codespaces"),
    threadId: v.string(),
    text: v.string(),
    cwd: v.optional(v.string()),
    approvalPolicy: v.optional(v.string()),
  },
  returns: startCodexTurnResult,
  handler: async (ctx, args): Promise<Infer<typeof startCodexTurnResult>> => {
    const codespace = await getActiveRunningCodespace(ctx, args.codespaceId, ctx.viewer.userId);
    await syncBundledCodespaceAgent(codespace);
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
  access: "access_machines",
  args: {
    codespaceId: v.id("codespaces"),
    since: v.optional(v.number()),
  },
  returns: codexEventsResult,
  handler: async (ctx, args): Promise<Infer<typeof codexEventsResult>> => {
    const codespace = await getActiveRunningCodespace(ctx, args.codespaceId, ctx.viewer.userId);
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
