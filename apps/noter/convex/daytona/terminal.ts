"use node";

import {
  Configuration as DaytonaApiConfiguration,
  SandboxApi,
} from "@daytonaio/api-client";
import { Daytona, type Sandbox } from "@daytonaio/sdk";
import { randomUUID } from "crypto";
import { Infer, v } from "convex/values";
import {
  upsertCodexDefaultModelConfig,
  upsertCodexNoAltScreenConfig,
  upsertCodexProjectTrustConfig,
} from "../../../../runtime/codexConfig.js";
import { action, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getUserId } from "../common";
import {
  canonicalizeCommitPinnedDaytonaBranch,
  DAYTONA_COMMIT_PINNED_BRANCH,
} from "./snapshotPolicy";
import {
  DAYTONA_PROVISIONING_MODE_LABEL,
  parseDaytonaProvisioningMode,
} from "./provisioning";
import {
  buildSwitchPtySessionToSandboxUserInput,
  DAYTONA_CODEX_HOME,
  DAYTONA_PREFERRED_INTERACTIVE_SHELL,
  DAYTONA_SANDBOX_HOME,
  DAYTONA_SANDBOX_USER,
  DAYTONA_WORKSPACE_DIR,
  ensureProjectedCodexHomeInSandbox,
  ensureSandboxFishTooling,
  ensureSandboxPreferredInteractiveShell,
  ensureSandboxPathWritableByUser,
  executeCommandAsSandboxUser,
  syncCodexConfigToSharedInSandbox,
} from "./sandboxUser";
import {
  buildAttachDevServerTmuxCommand,
  buildCreateOrAttachShellTmuxCommand,
} from "./tmuxSessions";

const { object, id, string, optional, number, boolean } = v;

const DEFAULT_WORKSPACE_DIR = DAYTONA_WORKSPACE_DIR;
const DEFAULT_CODEX_AUTH_DIR = DAYTONA_SANDBOX_HOME;
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
const CODEX_DEVICE_AUTH_COMMAND =
  "clear >/dev/null 2>&1; codex login --device-auth; exit\n";
const DAYTONA_DEV_LOG = "/tmp/noter-dev.log";
const DEFAULT_PTY_IDLE_CAPTURE_MS = 150;
const DEFAULT_PTY_CAPTURE_TIMEOUT_MS = 600;
const CODEX_CONFIG_SYNC_TIMEOUT_SECONDS = 30;

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
  sandboxId: optional(string()),
  sandboxName: optional(string()),
  initialInput: optional(string()),
  initialOutput: optional(string()),
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
  sandboxId: optional(string()),
  sandboxName: optional(string()),
  initialInput: optional(string()),
  initialOutput: optional(string()),
  message: optional(string()),
});

const resizeWorkspacePtySessionArgs = object({
  vaultId: id("vaults"),
  branch: optional(string()),
  sandboxId: optional(string()),
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
  sandboxId: optional(string()),
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
  initialInput: optional(string()),
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
      message: `Daytona is not configured. Missing ${missing.join(", ")}.`,
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

function readSandboxEnv(candidate: Sandbox, key: string): string {
  const value = candidate.env[key];
  return typeof value === "string" ? value.trim() : "";
}

function hasLegacyCodexHomeMount(sandbox: Sandbox): boolean {
  const volumes = Array.isArray(sandbox.volumes) ? sandbox.volumes : [];
  return volumes.some((volume) => volume.mountPath === DAYTONA_CODEX_HOME);
}

function hasCompatibleTerminalSandboxSetup(sandbox: Sandbox): boolean {
  if (sandbox.user.trim() !== DAYTONA_SANDBOX_USER) {
    return false;
  }

  const codexHome = readSandboxEnv(sandbox, "CODEX_HOME");
  if (codexHome.length > 0 && codexHome !== DAYTONA_CODEX_HOME) {
    return false;
  }

  return !hasLegacyCodexHomeMount(sandbox);
}

function getSandboxCreatedAtMs(sandbox: Sandbox): number {
  if (typeof sandbox.createdAt === "number") {
    return sandbox.createdAt;
  }
  if (typeof sandbox.createdAt === "string") {
    const createdAtMs = Date.parse(sandbox.createdAt);
    if (Number.isFinite(createdAtMs)) {
      return createdAtMs;
    }
  }
  return 0;
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

function quoteForShell(input: string): string {
  return `'${input.replace(/'/g, `'\\''`)}'`;
}

type TemplateValue = string | number | boolean | null | undefined;

function stripIndent(
  strings: TemplateStringsArray,
  ...values: TemplateValue[]
): string {
  let combined = "";
  for (let index = 0; index < strings.length; index += 1) {
    combined += strings[index];
    if (index < values.length) {
      combined += String(values[index]);
    }
  }

  const trimmed = combined.trim();
  if (trimmed.length === 0) {
    return "";
  }

  const lines = trimmed.split("\n");
  let minIndent: number | null = null;
  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    const match = line.match(/^ +/);
    const indent = match ? match[0].length : 0;
    if (minIndent === null || indent < minIndent) {
      minIndent = indent;
      if (minIndent === 0) {
        break;
      }
    }
  }

  if (!minIndent) {
    return trimmed;
  }

  return lines.map((line) => line.slice(minIndent)).join("\n");
}

function buildNonExecTmuxCommand(command: string): string {
  return command.startsWith("exec ") ? command.slice(5) : command;
}

function buildInteractiveShellInput(command: string): string {
  return `bash -lc ${quoteForShell(command)}\n`;
}

function buildOpenWorkspaceShellCommand(cwd: string): string {
  const tmuxCommand = buildNonExecTmuxCommand(
    buildCreateOrAttachShellTmuxCommand({ cwd }),
  );
  return stripIndent`
    if command -v tmux >/dev/null 2>&1; then
      ${tmuxCommand}
      tmux_status=$?
      if [ "$tmux_status" -eq 0 ]; then
        exit 0
      fi
    fi
    cd ${quoteForShell(cwd)}
    exec "$SHELL" -l
  `;
}

function buildOpenWorkspaceDevServerCommand(): string {
  const tmuxCommand = buildNonExecTmuxCommand(
    buildAttachDevServerTmuxCommand(),
  );
  return stripIndent`
    if command -v tmux >/dev/null 2>&1; then
      ${tmuxCommand}
      tmux_status=$?
      if [ "$tmux_status" -eq 0 ]; then
        exit 0
      fi
    fi
    clear >/dev/null 2>&1
    stty -echo -icanon -isig
    exec tail -n 200 -F ${quoteForShell(DAYTONA_DEV_LOG)} </dev/null
  `;
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
  requestedProvisioningMode?: "snapshot_backed" | "live_debug";
}): Promise<
  | { ok: true; sandbox: Sandbox; sandboxName: string | undefined }
  | { ok: false; message: string }
> {
  const requestedBranchValue = args.requestedBranch?.trim();
  const requestedBranch = requestedBranchValue
    ? canonicalizeCommitPinnedDaytonaBranch(requestedBranchValue)
    : undefined;
  const requestedCommitSha = args.requestedCommitSha?.trim();
  const requestedProvisioningMode = args.requestedProvisioningMode;

  const matchesRequestedRef = (candidate: Sandbox) => {
    if (requestedBranch) {
      const branchLabel = readSandboxLabel(candidate, "noter.branch");
      if (branchLabel !== requestedBranch) {
        return false;
      }
    }
    if (requestedCommitSha) {
      const commitLabel = readSandboxLabel(candidate, "noter.commit_sha");
      if (commitLabel !== requestedCommitSha) {
        return false;
      }
    }
    return true;
  };
  const matchesRequestedProvisioningMode = (candidate: Sandbox) => {
    if (!requestedProvisioningMode) {
      return true;
    }
    return (
      readSandboxLabel(candidate, DAYTONA_PROVISIONING_MODE_LABEL) ===
      requestedProvisioningMode
    );
  };
  const matchesRequestedVault = (candidate: Sandbox) => {
    return readSandboxLabel(candidate, "noter.vault_id") === args.vaultId;
  };

  let sandbox: Sandbox | null = null;
  let sandboxName = args.daytonaSandboxName;

  if (args.daytonaSandboxId) {
    try {
      const persistedSandbox = await args.daytona.get(args.daytonaSandboxId);
      if (
        matchesRequestedVault(persistedSandbox) &&
        matchesRequestedRef(persistedSandbox) &&
        matchesRequestedProvisioningMode(persistedSandbox)
      ) {
        if (hasCompatibleTerminalSandboxSetup(persistedSandbox)) {
          sandbox = persistedSandbox;
          sandboxName = persistedSandbox.name;
        } else {
          console.warn("daytona:terminal:delete-incompatible-sandbox", {
            sandboxId: persistedSandbox.id,
            sandboxName: persistedSandbox.name,
            reason: "legacy_codex_home_mount",
          });
          await persistedSandbox.delete();
        }
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
    if (requestedProvisioningMode) {
      labels[DAYTONA_PROVISIONING_MODE_LABEL] = requestedProvisioningMode;
    }

    const matches = await args.daytona.list(labels, 1, 5);
    if (matches.items.length === 0) {
      return {
        ok: false,
        message: requestedBranch
          ? `No Daytona sandbox found for branch ${requestedBranch}. Click Create sandbox first.`
          : "No Daytona sandbox is connected to this vault yet. Click Create sandbox first.",
      };
    }

    const compatibleMatches: Sandbox[] = [];
    for (const match of matches.items) {
      if (!match.id) {
        continue;
      }
      const matchedSandbox = await args.daytona.get(match.id);
      if (
        !matchesRequestedRef(matchedSandbox) ||
        !matchesRequestedProvisioningMode(matchedSandbox)
      ) {
        continue;
      }
      if (!hasCompatibleTerminalSandboxSetup(matchedSandbox)) {
        console.warn("daytona:terminal:delete-incompatible-sandbox", {
          sandboxId: matchedSandbox.id,
          sandboxName: matchedSandbox.name,
          reason: "legacy_codex_home_mount",
        });
        await matchedSandbox.delete();
        continue;
      }
      compatibleMatches.push(matchedSandbox);
    }

    if (compatibleMatches.length === 0) {
      return {
        ok: false,
        message: requestedBranch
          ? `No Daytona sandbox found for branch ${requestedBranch}. Click Create sandbox first.`
          : "No Daytona sandbox is connected to this vault yet. Click Create sandbox first.",
      };
    }

    compatibleMatches.sort(
      (left, right) =>
        getSandboxCreatedAtMs(right) - getSandboxCreatedAtMs(left),
    );
    sandbox = compatibleMatches[0];
    sandboxName = sandbox.name;
    await args.ctx.runMutation(internal.vault.updateVaultDaytonaSandbox, {
      vaultId: args.vaultId,
      sandboxId: sandbox.id,
      sandboxName: sandbox.name,
      createdAt:
        typeof sandbox.createdAt === "number" ? sandbox.createdAt : Date.now(),
      provisioningMode: parseDaytonaProvisioningMode(
        readSandboxLabel(sandbox, DAYTONA_PROVISIONING_MODE_LABEL),
      ),
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
  sandboxId?: string;
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
  const resolvedBranch = canonicalizeCommitPinnedDaytonaBranch(
    requestedBranch || DAYTONA_COMMIT_PINNED_BRANCH,
  );
  const branchRecord = !args.sandboxId
    ? await args.ctx.runQuery(internal.vault.getVaultRemoteBranch, {
        vaultId: args.vaultId,
        branchName: resolvedBranch,
      })
    : null;
  const branchCommitSha = branchRecord?.headCommitSha.trim();
  const requestedCommitSha =
    !args.sandboxId && branchCommitSha
      ? branchCommitSha
      : !args.sandboxId && resolvedBranch === DAYTONA_COMMIT_PINNED_BRANCH
        ? vault.commitSHA?.trim()
        : undefined;
  const resolvedSandbox = await resolveDaytonaSandboxForVault({
    ctx: args.ctx,
    daytona,
    vaultId: args.vaultId,
    daytonaSandboxId: args.sandboxId?.trim() || vault.daytonaSandboxId,
    daytonaSandboxName: vault.daytonaSandboxName,
    requestedBranch: resolvedBranch,
    requestedCommitSha,
    requestedProvisioningMode: vault.daytonaSandboxProvisioningMode,
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

function readCodexHomeInSandbox(sandbox: Sandbox): string | null {
  const codexHome =
    typeof sandbox.env.CODEX_HOME === "string" ? sandbox.env.CODEX_HOME : "";
  const trimmed = codexHome.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function readCodexConfigInSandbox(args: {
  sandbox: Sandbox;
  codexHome: string;
}): Promise<string> {
  const result = await args.sandbox.process.executeCommand(
    `bash -lc ${quoteForShell(
      `if [ -f ${quoteForShell(`${args.codexHome}/config.toml`)} ]; then cat ${quoteForShell(`${args.codexHome}/config.toml`)}; fi`,
    )}`,
    undefined,
    undefined,
    CODEX_CONFIG_SYNC_TIMEOUT_SECONDS,
  );
  if (result.exitCode !== 0) {
    throw new Error(
      result.result.trim() || "Failed to read Codex config in sandbox.",
    );
  }
  return result.result;
}

async function writeCodexConfigInSandbox(args: {
  sandbox: Sandbox;
  codexHome: string;
  configToml: string;
}): Promise<void> {
  const encodedConfig = Buffer.from(args.configToml, "utf8").toString("base64");
  const configPath = `${args.codexHome}/config.toml`;
  const writeScript = stripIndent`
    set -e
    config_path=${quoteForShell(configPath)}
    mkdir -p ${quoteForShell(args.codexHome)}
    rm -f "$config_path"
    umask 077
    printf '%s' ${quoteForShell(encodedConfig)} | base64 --decode > "$config_path"
  `;
  const result = await executeCommandAsSandboxUser({
    sandbox: args.sandbox,
    command: writeScript,
    timeoutSeconds: CODEX_CONFIG_SYNC_TIMEOUT_SECONDS,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      result.result.trim() || "Failed to write Codex config in sandbox.",
    );
  }
}

async function ensureCodexConfigInSandbox(args: {
  sandbox: Sandbox;
  trustedProjectPath?: string;
}): Promise<void> {
  const codexHome = readCodexHomeInSandbox(args.sandbox);
  if (!codexHome) {
    return;
  }

  const existingConfig = await readCodexConfigInSandbox({
    sandbox: args.sandbox,
    codexHome,
  });
  const nextConfig = (() => {
    const withDefaultModel = upsertCodexDefaultModelConfig(existingConfig);
    const withNoAltScreen = upsertCodexNoAltScreenConfig(withDefaultModel);
    const trustedProjectPath = args.trustedProjectPath?.trim();
    if (!trustedProjectPath) {
      return withNoAltScreen;
    }
    return upsertCodexProjectTrustConfig(withNoAltScreen, trustedProjectPath);
  })();
  if (nextConfig === existingConfig) {
    return;
  }

  await writeCodexConfigInSandbox({
    sandbox: args.sandbox,
    codexHome,
    configToml: nextConfig,
  });
  await syncCodexConfigToSharedInSandbox({
    sandbox: args.sandbox,
    timeoutSeconds: CODEX_CONFIG_SYNC_TIMEOUT_SECONDS,
  });
}

async function openPtySession(args: {
  sandbox: Sandbox;
  baseUrl: string;
  token: string;
  sessionId: string;
  cwd: string;
  cols: number;
  rows: number;
  captureInitialOutput?: boolean;
  initialInput?: string;
  trustedProjectPath?: string;
}): Promise<{
  sessionId: string;
  webSocketUrl: string;
  previewToken: string;
  initialOutput?: string;
}> {
  await ensureSandboxStarted(args.sandbox);
  try {
    await ensureCodexConfigInSandbox({
      sandbox: args.sandbox,
      trustedProjectPath: args.trustedProjectPath,
    });
  } catch (error) {
    console.warn("daytona:pty:codex-config-sync-skipped", {
      sandboxId: args.sandbox.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    await ensureSandboxPreferredInteractiveShell({
      sandbox: args.sandbox,
      timeoutSeconds: 30,
    });
  } catch (error) {
    console.warn("daytona:pty:interactive-shell-sync-skipped", {
      sandboxId: args.sandbox.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    await ensureSandboxFishTooling({
      sandbox: args.sandbox,
      timeoutSeconds: 30,
    });
  } catch (error) {
    console.warn("daytona:pty:fish-tooling-sync-skipped", {
      sandboxId: args.sandbox.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const textDecoder = new TextDecoder();
  const outputChunks: string[] = [];
  const lastChunkAtRef = { current: Date.now() };
  const sawOutputRef = { current: false };
  const shouldCaptureOutput =
    args.captureInitialOutput === true ||
    (typeof args.initialInput === "string" && args.initialInput.length > 0);
  let ptyHandle: Awaited<ReturnType<Sandbox["process"]["createPty"]>> | null =
    null;
  try {
    ptyHandle = await args.sandbox.process.createPty({
      id: args.sessionId,
      cwd: args.cwd,
      envs: {
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        HOME: DAYTONA_SANDBOX_HOME,
        USER: DAYTONA_SANDBOX_USER,
        LOGNAME: DAYTONA_SANDBOX_USER,
        CODEX_HOME: DAYTONA_CODEX_HOME,
        SHELL: DAYTONA_PREFERRED_INTERACTIVE_SHELL,
      },
      cols: args.cols,
      rows: args.rows,
      onData: async (data) => {
        if (!shouldCaptureOutput) {
          return;
        }
        outputChunks.push(textDecoder.decode(data, { stream: true }));
        lastChunkAtRef.current = Date.now();
        sawOutputRef.current = true;
      },
    });
    await ptyHandle.waitForConnection();
    const connectedSessionId = ptyHandle.sessionId;
    if (typeof args.initialInput === "string" && args.initialInput.length > 0) {
      await ptyHandle.sendInput(args.initialInput);
    }
    if (shouldCaptureOutput) {
      await waitForPtyOutputIdle({
        lastChunkAtRef,
        sawOutputRef,
      });
    }
    await ptyHandle.disconnect();

    const connection = await getPtyConnection({
      sandbox: args.sandbox,
      baseUrl: args.baseUrl,
      token: args.token,
      sessionId: connectedSessionId,
    });
    const initialOutput =
      args.captureInitialOutput === true
        ? `${outputChunks.join("")}${textDecoder.decode()}`
        : undefined;
    return {
      sessionId: connectedSessionId,
      ...connection,
      initialOutput:
        typeof initialOutput === "string" && initialOutput.length > 0
          ? initialOutput
          : undefined,
    };
  } catch (error) {
    const cleanupSessionId = ptyHandle?.sessionId ?? args.sessionId;
    try {
      await args.sandbox.process.killPtySession(cleanupSessionId);
    } catch (killError) {
      if (!isNotFoundError(killError)) {
        console.warn("daytona:pty:cleanup:failed", {
          sandboxId: args.sandbox.id,
          sessionId: cleanupSessionId,
          message:
            killError instanceof Error ? killError.message : String(killError),
        });
      }
    }
    if (ptyHandle) {
      try {
        await ptyHandle.disconnect();
      } catch {
        // Best-effort disconnect only.
      }
    }
    throw error;
  }
}

async function waitForPtyOutputIdle(args: {
  lastChunkAtRef: { current: number };
  sawOutputRef: { current: boolean };
  idleMs?: number;
  timeoutMs?: number;
}): Promise<void> {
  const idleMs = args.idleMs ?? DEFAULT_PTY_IDLE_CAPTURE_MS;
  const timeoutMs = args.timeoutMs ?? DEFAULT_PTY_CAPTURE_TIMEOUT_MS;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (
      args.sawOutputRef.current &&
      Date.now() - args.lastChunkAtRef.current >= idleMs
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
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
      await ensureSandboxStarted(resolved.sandbox);
      await ensureProjectedCodexHomeInSandbox({
        sandbox: resolved.sandbox,
        timeoutSeconds: 300,
      });
      await ensureSandboxPathWritableByUser({
        sandbox: resolved.sandbox,
        path: resolved.repoDir,
        timeoutSeconds: 300,
      });
      const connection = await openPtySession({
        sandbox: resolved.sandbox,
        baseUrl: resolved.baseUrl,
        token: resolved.token,
        sessionId,
        cwd: resolved.repoDir,
        cols,
        rows,
        initialInput: buildSwitchPtySessionToSandboxUserInput({
          cwd: resolved.repoDir,
        }),
        trustedProjectPath: resolved.repoDir,
      });

      return {
        ok: true,
        sessionId: connection.sessionId,
        webSocketUrl: connection.webSocketUrl,
        previewToken: connection.previewToken,
        sandboxId: resolved.sandbox.id,
        sandboxName: resolved.sandboxName,
        initialInput: buildInteractiveShellInput(
          buildOpenWorkspaceShellCommand(resolved.repoDir),
        ),
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

    try {
      await ensureSandboxStarted(resolved.sandbox);
      await ensureProjectedCodexHomeInSandbox({
        sandbox: resolved.sandbox,
        timeoutSeconds: 300,
      });
      await ensureSandboxPathWritableByUser({
        sandbox: resolved.sandbox,
        path: resolved.repoDir,
        timeoutSeconds: 300,
      });
      const connection = await openPtySession({
        sandbox: resolved.sandbox,
        baseUrl: resolved.baseUrl,
        token: resolved.token,
        sessionId,
        cwd: resolved.repoDir,
        cols,
        rows,
        initialInput: buildSwitchPtySessionToSandboxUserInput({
          cwd: resolved.repoDir,
        }),
        trustedProjectPath: resolved.repoDir,
      });

      return {
        ok: true,
        sessionId: connection.sessionId,
        webSocketUrl: connection.webSocketUrl,
        previewToken: connection.previewToken,
        sandboxId: resolved.sandbox.id,
        sandboxName: resolved.sandboxName,
        initialInput: buildInteractiveShellInput(
          buildOpenWorkspaceDevServerCommand(),
        ),
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
      await ensureSandboxStarted(resolved.sandbox);
      await ensureProjectedCodexHomeInSandbox({
        sandbox: resolved.sandbox,
        timeoutSeconds: 300,
      });
      const connection = await openPtySession({
        sandbox: resolved.sandbox,
        baseUrl: resolved.baseUrl,
        token: resolved.token,
        sessionId,
        cwd: DEFAULT_CODEX_AUTH_DIR,
        cols,
        rows,
        initialInput: buildSwitchPtySessionToSandboxUserInput({
          cwd: DEFAULT_CODEX_AUTH_DIR,
        }),
      });

      return {
        ok: true,
        sessionId: connection.sessionId,
        webSocketUrl: connection.webSocketUrl,
        previewToken: connection.previewToken,
        sandboxName: resolved.sandboxName,
        initialInput: CODEX_DEVICE_AUTH_COMMAND,
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
      sandboxId: args.sandboxId,
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
      sandboxId: args.sandboxId,
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
      await syncCodexConfigToSharedInSandbox({
        sandbox: resolved.sandbox,
        timeoutSeconds: CODEX_CONFIG_SYNC_TIMEOUT_SECONDS,
      });
      return {
        ok: true,
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        try {
          await syncCodexConfigToSharedInSandbox({
            sandbox: resolved.sandbox,
            timeoutSeconds: CODEX_CONFIG_SYNC_TIMEOUT_SECONDS,
          });
        } catch (syncError) {
          return {
            ok: false,
            message:
              syncError instanceof Error
                ? syncError.message
                : "Failed to sync Codex config after the terminal session ended.",
          };
        }
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
      await syncCodexConfigToSharedInSandbox({
        sandbox: resolved.sandbox,
        timeoutSeconds: CODEX_CONFIG_SYNC_TIMEOUT_SECONDS,
      });
      return {
        ok: true,
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        try {
          await syncCodexConfigToSharedInSandbox({
            sandbox: resolved.sandbox,
            timeoutSeconds: CODEX_CONFIG_SYNC_TIMEOUT_SECONDS,
          });
        } catch (syncError) {
          return {
            ok: false,
            message:
              syncError instanceof Error
                ? syncError.message
                : "Failed to sync Codex config after the terminal session ended.",
          };
        }
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
