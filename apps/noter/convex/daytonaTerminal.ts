"use node";

import {
  Configuration as DaytonaApiConfiguration,
  SandboxApi,
} from "@daytonaio/api-client";
import { Daytona, type Sandbox } from "@daytonaio/sdk";
import { randomUUID } from "crypto";
import { Infer, v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getUserId } from "./common";
import {
  canonicalizeCommitPinnedDaytonaBranch,
  DAYTONA_COMMIT_PINNED_BRANCH,
} from "./daytonaSnapshotPolicy";

const { object, id, string, optional, number, boolean } = v;

const DEFAULT_WORKSPACE_DIR = "/home/daytona/workspace";
const DEFAULT_CODEX_AUTH_DIR = "/";
const DAYTONA_API_URL_ENV = "DAYTONA_API_URL";
const DAYTONA_API_TOKEN_ENV = "DAYTONA_API_TOKEN";
const DAYTONA_API_KEY_ENV = "DAYTONA_API_KEY";
const DAYTONA_TOOLBOX_AUTH_PORT = 1;
const DEFAULT_TERMINAL_COLS = 120;
const DEFAULT_TERMINAL_ROWS = 32;
const MIN_TERMINAL_COLS = 20;
const MIN_TERMINAL_ROWS = 8;
const MAX_TERMINAL_COLS = 320;
const MAX_TERMINAL_ROWS = 120;
const DAYTONA_DEV_SERVER_TMUX_SESSION = "noter-dev-server";
const CODEX_DEVICE_AUTH_COMMAND =
  "clear >/dev/null 2>&1; codex login --device-auth; exit\n";

const openWorkspacePtySessionArgs = object({
  vaultId: id("vaults"),
  branch: optional(string()),
  cols: optional(number()),
  rows: optional(number()),
});

const openWorkspacePtySessionResult = object({
  ok: boolean(),
  sessionId: optional(string()),
  webSocketUrl: optional(string()),
  previewToken: optional(string()),
  sandboxName: optional(string()),
  message: optional(string()),
});

const openWorkspaceDevServerPtySessionArgs = object({
  vaultId: id("vaults"),
  branch: optional(string()),
  cols: optional(number()),
  rows: optional(number()),
});

const openWorkspaceDevServerPtySessionResult = object({
  ok: boolean(),
  sessionId: optional(string()),
  webSocketUrl: optional(string()),
  previewToken: optional(string()),
  sandboxName: optional(string()),
  message: optional(string()),
});

const resizeWorkspacePtySessionArgs = object({
  vaultId: id("vaults"),
  branch: optional(string()),
  sessionId: string(),
  cols: number(),
  rows: number(),
});

const resizeWorkspacePtySessionResult = object({
  ok: boolean(),
  message: optional(string()),
});

const closeWorkspacePtySessionArgs = object({
  vaultId: id("vaults"),
  branch: optional(string()),
  sessionId: string(),
});

const closeWorkspacePtySessionResult = object({
  ok: boolean(),
  message: optional(string()),
});

const openCodexAuthPtySessionArgs = object({
  cols: optional(number()),
  rows: optional(number()),
});

const openCodexAuthPtySessionResult = object({
  ok: boolean(),
  sessionId: optional(string()),
  webSocketUrl: optional(string()),
  previewToken: optional(string()),
  sandboxName: optional(string()),
  message: optional(string()),
});

const resizeCodexAuthPtySessionArgs = object({
  sessionId: string(),
  cols: number(),
  rows: number(),
});

const resizeCodexAuthPtySessionResult = object({
  ok: boolean(),
  message: optional(string()),
});

const closeCodexAuthPtySessionArgs = object({
  sessionId: string(),
});

const closeCodexAuthPtySessionResult = object({
  ok: boolean(),
  message: optional(string()),
});

function resolveDaytonaApiConfig():
  | { ok: true; baseUrl: string; token: string }
  | { ok: false; message: string } {
  const baseUrl = process.env[DAYTONA_API_URL_ENV]?.trim() ?? "";
  const token =
    process.env[DAYTONA_API_TOKEN_ENV] ??
    process.env[DAYTONA_API_KEY_ENV] ??
    "";
  const missing = [
    baseUrl.length === 0 ? DAYTONA_API_URL_ENV : null,
    token.length === 0
      ? `${DAYTONA_API_TOKEN_ENV} (or ${DAYTONA_API_KEY_ENV})`
      : null,
  ].filter((value): value is string => value !== null);

  if (missing.length > 0) {
    return {
      ok: false,
      message:
        missing.length === 0
          ? "Daytona is not configured."
          : `Daytona is not configured. Missing ${missing.join(", ")}.`,
    };
  }

  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    return {
      ok: false,
      message: `DAYTONA_API_URL must start with http:// or https:// (received "${baseUrl}").`,
    };
  }

  return {
    ok: true,
    baseUrl,
    token,
  };
}

function createDaytonaClient(args: {
  baseUrl: string;
  token: string;
}): Daytona {
  return new Daytona({
    apiKey: args.token,
    apiUrl: args.baseUrl,
  });
}

function createSandboxApi(args: {
  baseUrl: string;
  token: string;
}): SandboxApi {
  const configuration = new DaytonaApiConfiguration({
    accessToken: args.token,
    basePath: args.baseUrl,
  });
  return new SandboxApi(configuration);
}

function readSandboxLabel(candidate: Sandbox, key: string): string {
  const value = candidate.labels[key];
  return typeof value === "string" ? value.trim() : "";
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const status = Reflect.get(error, "status");
    if (typeof status === "number" && status === 404) {
      return true;
    }
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes("not found") || message.includes("404");
  }
  return false;
}

function clampTerminalSize(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.round(value);
  return Math.min(maximum, Math.max(minimum, rounded));
}

function buildWorkspacePtySessionId(vaultId: Id<"vaults">): string {
  return `noter-pty-${vaultId}-${randomUUID()}`;
}

function buildWorkspaceDevServerPtySessionId(vaultId: Id<"vaults">): string {
  return `noter-dev-server-pty-${vaultId}-${randomUUID()}`;
}

function buildCodexAuthPtySessionId(): string {
  return `noter-codex-auth-pty-${randomUUID()}`;
}

function quoteForBash(input: string): string {
  return `'${input.replace(/'/g, `'\\''`)}'`;
}

async function ensureSandboxStarted(sandbox: Sandbox): Promise<void> {
  if (sandbox.state?.trim().toLowerCase() === "started") {
    return;
  }
  await sandbox.start();
  await sandbox.refreshData();
}

async function resolveDaytonaSandboxForVault(args: {
  ctx: ActionCtx;
  daytona: Daytona;
  vaultId: Id<"vaults">;
  daytonaSandboxId?: string;
  daytonaSandboxName?: string;
  requestedBranch?: string;
  requestedCommitSha?: string;
}): Promise<
  | { ok: true; sandbox: Sandbox; sandboxName: string | undefined }
  | { ok: false; message: string }
> {
  const requestedBranchValue = args.requestedBranch?.trim();
  const requestedBranch = requestedBranchValue
    ? canonicalizeCommitPinnedDaytonaBranch(requestedBranchValue)
    : undefined;
  const requestedCommitSha = args.requestedCommitSha?.trim();

  const matchesRequestedBranch = (candidate: Sandbox) => {
    if (!requestedBranch) {
      return true;
    }
    const branchLabel = readSandboxLabel(candidate, "noter.branch");
    if (branchLabel !== requestedBranch) {
      return false;
    }
    if (!requestedCommitSha) {
      return true;
    }
    const commitLabel = readSandboxLabel(candidate, "noter.commit_sha");
    return commitLabel === requestedCommitSha;
  };

  let sandbox: Sandbox | null = null;
  let sandboxName = args.daytonaSandboxName;

  if (args.daytonaSandboxId) {
    try {
      const persistedSandbox = await args.daytona.get(args.daytonaSandboxId);
      if (matchesRequestedBranch(persistedSandbox)) {
        sandbox = persistedSandbox;
        sandboxName = persistedSandbox.name;
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  if (!sandbox) {
    const labels: Record<string, string> = {
      "noter.vault_id": args.vaultId,
    };
    if (requestedBranch) {
      labels["noter.branch"] = requestedBranch;
    }
    if (requestedCommitSha) {
      labels["noter.commit_sha"] = requestedCommitSha;
    }

    const matches = await args.daytona.list(labels, 1, 5);
    if (matches.items.length === 0) {
      return {
        ok: false,
        message: requestedBranch
          ? `No Daytona sandbox found for branch ${requestedBranch}. Click Launch Daytona first.`
          : "No Daytona sandbox is connected to this vault yet. Click Launch Daytona first.",
      };
    }

    const match = matches.items[0];
    if (!match.id) {
      return {
        ok: false,
        message: requestedBranch
          ? `No Daytona sandbox found for branch ${requestedBranch}. Click Launch Daytona first.`
          : "No Daytona sandbox is connected to this vault yet. Click Launch Daytona first.",
      };
    }

    const matchedSandbox = await args.daytona.get(match.id);
    if (!matchesRequestedBranch(matchedSandbox)) {
      return {
        ok: false,
        message: requestedBranch
          ? `No Daytona sandbox found for branch ${requestedBranch}. Click Launch Daytona first.`
          : "No Daytona sandbox is connected to this vault yet. Click Launch Daytona first.",
      };
    }

    sandbox = matchedSandbox;
    sandboxName = sandbox.name;
    await args.ctx.runMutation(internal.vault.updateVaultDaytonaSandbox, {
      vaultId: args.vaultId,
      sandboxId: sandbox.id,
      sandboxName: sandbox.name,
      createdAt:
        typeof sandbox.createdAt === "number" ? sandbox.createdAt : Date.now(),
    });
  }

  return {
    ok: true,
    sandbox,
    sandboxName,
  };
}

async function resolveWorkspacePtyContext(args: {
  ctx: ActionCtx;
  vaultId: Id<"vaults">;
  branch?: string;
}): Promise<
  | {
      ok: true;
      sandbox: Sandbox;
      sandboxName: string | undefined;
      repoDir: string;
      baseUrl: string;
      token: string;
    }
  | { ok: false; message: string }
> {
  const userId = await getUserId(args.ctx);
  const vault = await args.ctx.runQuery(internal.vault.getById, {
    id: args.vaultId,
  });

  if (!vault || vault.userId !== userId) {
    throw new Error("Vault not found");
  }

  const apiConfig = resolveDaytonaApiConfig();
  if (!apiConfig.ok) {
    return {
      ok: false,
      message: apiConfig.message,
    };
  }

  const daytona = createDaytonaClient(apiConfig);
  const requestedBranch = args.branch?.trim();
  const resolvedSandbox = await resolveDaytonaSandboxForVault({
    ctx: args.ctx,
    daytona,
    vaultId: args.vaultId,
    daytonaSandboxId: vault.daytonaSandboxId,
    daytonaSandboxName: vault.daytonaSandboxName,
    requestedBranch,
    requestedCommitSha:
      canonicalizeCommitPinnedDaytonaBranch(
        requestedBranch || DAYTONA_COMMIT_PINNED_BRANCH,
      ) === DAYTONA_COMMIT_PINNED_BRANCH
        ? vault.commitSHA?.trim()
        : undefined,
  });

  if (!resolvedSandbox.ok) {
    return resolvedSandbox;
  }

  return {
    ok: true,
    sandbox: resolvedSandbox.sandbox,
    sandboxName: resolvedSandbox.sandboxName,
    repoDir: `${DEFAULT_WORKSPACE_DIR}/${vault.ghRepoName}`,
    baseUrl: apiConfig.baseUrl,
    token: apiConfig.token,
  };
}

async function resolveCodexAuthPtyContext(args: { ctx: ActionCtx }): Promise<
  | {
      ok: true;
      sandbox: Sandbox;
      sandboxName: string | undefined;
      baseUrl: string;
      token: string;
    }
  | { ok: false; message: string }
> {
  const userId = await getUserId(args.ctx);
  const connection = await args.ctx.runQuery(
    internal.providerConnections.getByUserAndKind,
    {
      userId,
      kind: "codex",
    },
  );

  if (connection?.kind !== "codex") {
    return {
      ok: false,
      message: "Codex is not configured in Daytona yet.",
    };
  }

  const authSandboxId = connection.auth.authSandboxId?.trim() ?? "";
  if (authSandboxId.length === 0) {
    return {
      ok: false,
      message:
        "Codex auth sandbox is missing. Click Reconnect in Daytona first.",
    };
  }

  const apiConfig = resolveDaytonaApiConfig();
  if (!apiConfig.ok) {
    return {
      ok: false,
      message: apiConfig.message,
    };
  }

  const daytona = createDaytonaClient(apiConfig);
  try {
    const sandbox = await daytona.get(authSandboxId);
    return {
      ok: true,
      sandbox,
      sandboxName: sandbox.name,
      baseUrl: apiConfig.baseUrl,
      token: apiConfig.token,
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        ok: false,
        message:
          "Codex auth sandbox is missing. Click Reconnect in Daytona first.",
      };
    }
    throw error;
  }
}

async function getPtyConnection(args: {
  sandbox: Sandbox;
  baseUrl: string;
  token: string;
  sessionId: string;
}): Promise<{ webSocketUrl: string; previewToken: string }> {
  const sandboxApi = createSandboxApi({
    baseUrl: args.baseUrl,
    token: args.token,
  });
  const toolboxProxyUrlResponse = await sandboxApi.getToolboxProxyUrl(
    args.sandbox.id,
  );
  const toolboxProxyUrl = toolboxProxyUrlResponse.data.url.trim();
  if (toolboxProxyUrl.length === 0) {
    throw new Error("Daytona toolbox URL is missing.");
  }

  const previewLink = await args.sandbox.getPreviewLink(
    DAYTONA_TOOLBOX_AUTH_PORT,
  );
  const previewToken = previewLink.token.trim();
  if (previewToken.length === 0) {
    throw new Error("Daytona toolbox token is missing.");
  }

  const webSocketBaseUrl = toolboxProxyUrl
    .replace(/^http/, "ws")
    .replace(/\/+$/, "");
  return {
    webSocketUrl: `${webSocketBaseUrl}/${args.sandbox.id}/process/pty/${args.sessionId}/connect`,
    previewToken,
  };
}

async function openPtySession(args: {
  sandbox: Sandbox;
  baseUrl: string;
  token: string;
  sessionId: string;
  cwd: string;
  cols: number;
  rows: number;
  initialInput?: string;
}): Promise<{ webSocketUrl: string; previewToken: string }> {
  await ensureSandboxStarted(args.sandbox);
  const ptyHandle = await args.sandbox.process.createPty({
    id: args.sessionId,
    cwd: args.cwd,
    envs: {
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    },
    cols: args.cols,
    rows: args.rows,
    onData: async () => {},
  });
  await ptyHandle.waitForConnection();
  if (args.initialInput) {
    await ptyHandle.sendInput(args.initialInput);
  }
  await ptyHandle.disconnect();

  return getPtyConnection({
    sandbox: args.sandbox,
    baseUrl: args.baseUrl,
    token: args.token,
    sessionId: args.sessionId,
  });
}

export const openWorkspacePtySession = action({
  args: openWorkspacePtySessionArgs,
  returns: openWorkspacePtySessionResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof openWorkspacePtySessionResult>> => {
    const resolved = await resolveWorkspacePtyContext({
      ctx,
      vaultId: args.vaultId,
      branch: args.branch,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        message: resolved.message,
      };
    }

    const cols = clampTerminalSize(
      args.cols,
      DEFAULT_TERMINAL_COLS,
      MIN_TERMINAL_COLS,
      MAX_TERMINAL_COLS,
    );
    const rows = clampTerminalSize(
      args.rows,
      DEFAULT_TERMINAL_ROWS,
      MIN_TERMINAL_ROWS,
      MAX_TERMINAL_ROWS,
    );
    const sessionId = buildWorkspacePtySessionId(args.vaultId);

    try {
      const connection = await openPtySession({
        sandbox: resolved.sandbox,
        baseUrl: resolved.baseUrl,
        token: resolved.token,
        sessionId,
        cwd: resolved.repoDir,
        cols,
        rows,
      });

      return {
        ok: true,
        sessionId,
        webSocketUrl: connection.webSocketUrl,
        previewToken: connection.previewToken,
        sandboxName: resolved.sandboxName,
        message: resolved.sandboxName
          ? `Terminal session ready for ${resolved.sandboxName}.`
          : "Terminal session ready.",
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to open Daytona terminal session.",
      };
    }
  },
});

export const openWorkspaceDevServerPtySession = action({
  args: openWorkspaceDevServerPtySessionArgs,
  returns: openWorkspaceDevServerPtySessionResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof openWorkspaceDevServerPtySessionResult>> => {
    const resolved = await resolveWorkspacePtyContext({
      ctx,
      vaultId: args.vaultId,
      branch: args.branch,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        message: resolved.message,
      };
    }

    const cols = clampTerminalSize(
      args.cols,
      DEFAULT_TERMINAL_COLS,
      MIN_TERMINAL_COLS,
      MAX_TERMINAL_COLS,
    );
    const rows = clampTerminalSize(
      args.rows,
      DEFAULT_TERMINAL_ROWS,
      MIN_TERMINAL_ROWS,
      MAX_TERMINAL_ROWS,
    );
    const sessionId = buildWorkspaceDevServerPtySessionId(args.vaultId);
    const tmuxCheckCommand = `bash -lc ${quoteForBash(
      `tmux has-session -t ${quoteForBash(DAYTONA_DEV_SERVER_TMUX_SESSION)}`,
    )}`;

    try {
      const tmuxCheckResult = await resolved.sandbox.process.executeCommand(
        tmuxCheckCommand,
        undefined,
        undefined,
        30,
      );
      if (tmuxCheckResult.exitCode !== 0) {
        return {
          ok: false,
          message:
            "Daytona dev server session is not available in tmux yet. Launch Daytona first.",
        };
      }

      const connection = await openPtySession({
        sandbox: resolved.sandbox,
        baseUrl: resolved.baseUrl,
        token: resolved.token,
        sessionId,
        cwd: resolved.repoDir,
        cols,
        rows,
      });

      return {
        ok: true,
        sessionId,
        webSocketUrl: connection.webSocketUrl,
        previewToken: connection.previewToken,
        sandboxName: resolved.sandboxName,
        message: resolved.sandboxName
          ? `Dev server terminal ready for ${resolved.sandboxName}.`
          : "Dev server terminal ready.",
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to open Daytona dev server terminal session.",
      };
    }
  },
});

export const openCodexAuthPtySession = action({
  args: openCodexAuthPtySessionArgs,
  returns: openCodexAuthPtySessionResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof openCodexAuthPtySessionResult>> => {
    const resolved = await resolveCodexAuthPtyContext({ ctx });
    if (!resolved.ok) {
      return {
        ok: false,
        message: resolved.message,
      };
    }

    const cols = clampTerminalSize(
      args.cols,
      DEFAULT_TERMINAL_COLS,
      MIN_TERMINAL_COLS,
      MAX_TERMINAL_COLS,
    );
    const rows = clampTerminalSize(
      args.rows,
      DEFAULT_TERMINAL_ROWS,
      MIN_TERMINAL_ROWS,
      MAX_TERMINAL_ROWS,
    );
    const sessionId = buildCodexAuthPtySessionId();

    try {
      const connection = await openPtySession({
        sandbox: resolved.sandbox,
        baseUrl: resolved.baseUrl,
        token: resolved.token,
        sessionId,
        cwd: DEFAULT_CODEX_AUTH_DIR,
        cols,
        rows,
        initialInput: CODEX_DEVICE_AUTH_COMMAND,
      });

      return {
        ok: true,
        sessionId,
        webSocketUrl: connection.webSocketUrl,
        previewToken: connection.previewToken,
        sandboxName: resolved.sandboxName,
        message: resolved.sandboxName
          ? `Terminal session ready for ${resolved.sandboxName}.`
          : "Terminal session ready.",
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to open Daytona terminal session.",
      };
    }
  },
});

export const resizeWorkspacePtySession = action({
  args: resizeWorkspacePtySessionArgs,
  returns: resizeWorkspacePtySessionResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof resizeWorkspacePtySessionResult>> => {
    const resolved = await resolveWorkspacePtyContext({
      ctx,
      vaultId: args.vaultId,
      branch: args.branch,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        message: resolved.message,
      };
    }

    const cols = clampTerminalSize(
      args.cols,
      DEFAULT_TERMINAL_COLS,
      MIN_TERMINAL_COLS,
      MAX_TERMINAL_COLS,
    );
    const rows = clampTerminalSize(
      args.rows,
      DEFAULT_TERMINAL_ROWS,
      MIN_TERMINAL_ROWS,
      MAX_TERMINAL_ROWS,
    );

    try {
      if (resolved.sandbox.state?.trim().toLowerCase() !== "started") {
        return {
          ok: false,
          message: "Daytona sandbox is not running.",
        };
      }
      await resolved.sandbox.process.resizePtySession(
        args.sessionId,
        cols,
        rows,
      );
      return {
        ok: true,
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to resize Daytona terminal session.",
      };
    }
  },
});

export const closeWorkspacePtySession = action({
  args: closeWorkspacePtySessionArgs,
  returns: closeWorkspacePtySessionResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof closeWorkspacePtySessionResult>> => {
    const resolved = await resolveWorkspacePtyContext({
      ctx,
      vaultId: args.vaultId,
      branch: args.branch,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        message: resolved.message,
      };
    }

    try {
      if (resolved.sandbox.state?.trim().toLowerCase() !== "started") {
        return {
          ok: true,
        };
      }
      await resolved.sandbox.process.killPtySession(args.sessionId);
      return {
        ok: true,
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        return {
          ok: true,
        };
      }
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to close Daytona terminal session.",
      };
    }
  },
});

export const resizeCodexAuthPtySession = action({
  args: resizeCodexAuthPtySessionArgs,
  returns: resizeCodexAuthPtySessionResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof resizeCodexAuthPtySessionResult>> => {
    const resolved = await resolveCodexAuthPtyContext({ ctx });
    if (!resolved.ok) {
      return {
        ok: false,
        message: resolved.message,
      };
    }

    const cols = clampTerminalSize(
      args.cols,
      DEFAULT_TERMINAL_COLS,
      MIN_TERMINAL_COLS,
      MAX_TERMINAL_COLS,
    );
    const rows = clampTerminalSize(
      args.rows,
      DEFAULT_TERMINAL_ROWS,
      MIN_TERMINAL_ROWS,
      MAX_TERMINAL_ROWS,
    );

    try {
      if (resolved.sandbox.state?.trim().toLowerCase() !== "started") {
        return {
          ok: false,
          message: "Daytona sandbox is not running.",
        };
      }
      await resolved.sandbox.process.resizePtySession(
        args.sessionId,
        cols,
        rows,
      );
      return {
        ok: true,
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to resize Daytona terminal session.",
      };
    }
  },
});

export const closeCodexAuthPtySession = action({
  args: closeCodexAuthPtySessionArgs,
  returns: closeCodexAuthPtySessionResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof closeCodexAuthPtySessionResult>> => {
    const resolved = await resolveCodexAuthPtyContext({ ctx });
    if (!resolved.ok) {
      return {
        ok: false,
        message: resolved.message,
      };
    }

    try {
      if (resolved.sandbox.state?.trim().toLowerCase() !== "started") {
        return {
          ok: true,
        };
      }
      await resolved.sandbox.process.killPtySession(args.sessionId);
      return {
        ok: true,
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        return {
          ok: true,
        };
      }
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to close Daytona terminal session.",
      };
    }
  },
});
