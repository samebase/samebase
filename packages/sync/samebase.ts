// No dependencies by design: this file should stay easy to inspect, easy to
// reason about, and easy to serve directly as hosted `/samebase.ts`.
//
// Audit guide:
// 1. Validate that this file was served from `/samebase.ts` on `https:` (or
//    explicit localhost `http:` during local testing).
// 2. Run `codex --version` to confirm the Codex CLI is on PATH.
// 3. Write one JSON config file under `~/.samebase/config.json` by default.
// 4. Print Samebase's `/machines/connect` approval URL.
// 5. Reuse the stored machine credential for later heartbeat publishing.
//
// It does not install background services, modify project files, or download
// and execute any other code after this file starts running.
// The file you run is the installer source. Preview or local deploys can ship
// their own hosted response without teaching users a separate targeting flag.
// If we add a visible installer version comment later, it should be updated
// manually only when this installer file changes, and every hosted output should
// match it exactly instead of stamping deploy-specific metadata.

import { execFile, spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  chmodSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir, hostname, platform, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

export const SAMEBASE_SYNC_SCRIPT_PATHNAME = "/samebase.ts";
export const SAMEBASE_CONNECT_CONFIG_PATHNAME = "/samebase-connect.json";
export const MACHINE_CONNECT_ROUTE = "/machines/connect";
export const SAMEBASE_STATE_DIRNAME = ".samebase";
export const SAMEBASE_CONFIG_FILENAME = "config.json";
export const SAMEBASE_CONFIG_PATHNAME = ".samebase/config.json";
export const CONNECTED_MACHINE_BOOTSTRAP_PATHNAME = "/connected-machines/bootstrap";
export const CONNECTED_MACHINE_HEARTBEAT_PATHNAME = "/connected-machines/heartbeat";
export const CONNECTED_MACHINE_HEARTBEAT_INTERVAL_MS = 15_000;
export const CONNECTED_MACHINE_CAPABILITIES = ["presence"];
export const NETWORK_TIMEOUT_MS = 15_000;
export const LOCAL_CODEX_CONTROL_HOST = "127.0.0.1";
export const LOCAL_CODEX_CONTROL_PORT = 0;
// When the command does not pass an explicit source URL, default to production.
export const SAMEBASE_SYNC_SOURCE_URL = "https://samebase.com/samebase.ts";
const MACHINE_CREDENTIAL_AUTH_ERROR_NAME = "MachineCredentialAuthError";
const MACHINE_CONTROL_AUTH_ERROR_NAME = "MachineControlAuthError";
const MACHINE_CONTROL_SERVICE_ERROR_NAME = "MachineControlServiceError";
const MACHINE_CONTROL_TOKEN_AUDIENCE = "machine-control";
const MACHINE_CONTROL_TOKEN_CACHE_TTL_MS = 30_000;
const MACHINE_CONTROL_INTROSPECTION_TIMEOUT_MS = 2_000;
const MACHINE_CONTROL_INTROSPECTION_BACKOFF_MS = [200, 500];
const MACHINE_CONTROL_INTROSPECTION_PATHNAME = "/connected-machines/control/introspect";
const MACHINE_CONTROL_READINESS_PROBE_TOKEN = "mmct_readiness_probe";
const CLOUDFLARED_TUNNEL_START_TIMEOUT_MS = 30_000;
const CLOUDFLARED_TUNNEL_SHUTDOWN_TIMEOUT_MS = 5_000;
const CODEX_RPC_TIMEOUT_MS = 120_000;
const CODEX_INIT_TIMEOUT_MS = 30_000;
const CODEX_EVENT_BUFFER_SIZE = 500;
const CODEX_REQUEST_BUFFER_SIZE = 100;
const CODEX_APPROVAL_CONTEXT_BUFFER_SIZE = 100;
const CODEX_MACHINE_WORKTREE_BRANCH_PREFIX = "codex-machine";
const CODEX_MACHINE_WORKTREE_CREATE_RETRY_LIMIT = 3;
const CODEX_THREAD_LIST_RECOVERY_PAGE_LIMIT = 200;
const MAX_THREAD_PROJECT_INFO_CACHE_SIZE = 500;
const DEFAULT_THREAD_SOURCE_KINDS = ["cli", "vscode", "exec", "appServer"];
const CODEX_GLOBAL_STATE_FILENAME = ".codex-global-state.json";
const CODEX_GLOBAL_STATE_LOCK_RETRY_MS = 25;
const CODEX_GLOBAL_STATE_LOCK_TIMEOUT_MS = 2_000;
const execFileAsync = promisify(execFile);

function isLoopbackHostname(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function base64UrlEncode(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

function buildConnectorVersion(codexVersion) {
  return `samebase-sync (${codexVersion})`;
}

function buildMachineId() {
  return `machine_${randomToken(12)}`;
}

function normalizeMachineOs(platformName) {
  if (platformName === "darwin") {
    return "macos";
  }
  if (platformName === "win32") {
    return "windows";
  }
  return "linux";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonOrNull(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Parse the tiny public CLI surface without pulling in a dependency. The first
 * shipped commands intentionally stay narrow so the install surface remains
 * easy to audit and mirrors the single commands shown by the web app.
 */
export function parseCliArgs(argv) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    return { command: "help" };
  }

  const command = argv[0];
  const remainingArgs = argv.slice(1);
  let stateDirectory = null;
  let sourceUrl = null;

  for (let index = 0; index < remainingArgs.length; index += 1) {
    const arg = remainingArgs[index];

    if (arg === "--state-dir") {
      const nextValue = remainingArgs[index + 1];
      if (nextValue === undefined) {
        throw new Error("Missing value for --state-dir");
      }
      if (stateDirectory !== null) {
        throw new Error("Duplicate option: --state-dir");
      }
      const trimmedNextValue = nextValue.trim();
      if (trimmedNextValue.length === 0) {
        throw new Error("The --state-dir option must not be empty.");
      }
      if (trimmedNextValue.startsWith("-")) {
        throw new Error(`Invalid value for --state-dir: ${nextValue}`);
      }
      stateDirectory = nextValue;
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (command === "connect") {
      if (sourceUrl !== null) {
        throw new Error(`Unexpected argument: ${arg}`);
      }
      sourceUrl = arg;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (command === "connect") {
    return {
      command: "connect",
      sourceUrl,
      stateDirectory,
    };
  }

  if (command === "run") {
    return {
      command: "run",
      stateDirectory,
    };
  }

  throw new Error(`Unknown command: ${command}`);
}

/**
 * The installer only trusts the exact hosted file shape we expect. Keeping the
 * source URL narrow makes the browser handoff and the stored config easier to
 * reason about.
 */
export function validateSourceUrl(value) {
  const sourceUrl = new URL(value);
  const isLoopbackHttp = sourceUrl.protocol === "http:" && isLoopbackHostname(sourceUrl.hostname);
  if (sourceUrl.protocol !== "https:" && !isLoopbackHttp) {
    throw new Error(
      "The installer source URL must use https, except for explicit localhost testing.",
    );
  }
  if (sourceUrl.pathname !== SAMEBASE_SYNC_SCRIPT_PATHNAME) {
    throw new Error(`The installer source URL must point to ${SAMEBASE_SYNC_SCRIPT_PATHNAME}.`);
  }
  if (
    sourceUrl.username.length > 0 ||
    sourceUrl.password.length > 0 ||
    sourceUrl.search.length > 0 ||
    sourceUrl.hash.length > 0
  ) {
    throw new Error(
      "The installer source URL must not include credentials, query params, or hashes.",
    );
  }
  return sourceUrl;
}

/**
 * The runtime config file is deploy-scoped, so it is allowed to carry the
 * Convex HTTP base even though `/samebase.ts` itself stays byte-for-byte identical
 * across deploys.
 */
export function buildSamebaseConnectConfigUrl(sourceUrl) {
  return new URL(SAMEBASE_CONNECT_CONFIG_PATHNAME, sourceUrl).toString();
}

export function buildMachineConnectUrl(sourceUrl, requestId) {
  const machineConnectUrl = new URL(MACHINE_CONNECT_ROUTE, sourceUrl);
  machineConnectUrl.search =
    typeof requestId === "string" && requestId.length > 0
      ? `openedByCli&requestId=${encodeURIComponent(requestId)}`
      : "openedByCli";
  return machineConnectUrl.toString();
}

export function buildBootstrapUrl(convexSiteUrl) {
  return new URL(CONNECTED_MACHINE_BOOTSTRAP_PATHNAME, convexSiteUrl).toString();
}

export function buildHeartbeatUrl(convexSiteUrl) {
  return new URL(CONNECTED_MACHINE_HEARTBEAT_PATHNAME, convexSiteUrl).toString();
}

function buildMachineControlIntrospectionUrl(convexSiteUrl) {
  return new URL(MACHINE_CONTROL_INTROSPECTION_PATHNAME, convexSiteUrl).toString();
}

function createInitialLiveControlState() {
  return {
    controlStatus: "unavailable",
    controlStatusDetail: "Live control is unavailable.",
    controlUrl: null,
    controlUrlUpdatedAt: Date.now(),
  };
}

function updateLiveControlState(state, updates) {
  const nextControlStatus =
    typeof updates.controlStatus === "string" ? updates.controlStatus : state.controlStatus;
  const nextControlStatusDetail =
    typeof updates.controlStatusDetail === "string"
      ? updates.controlStatusDetail
      : updates.controlStatusDetail === null
        ? null
        : state.controlStatusDetail;
  const nextControlUrl =
    typeof updates.controlUrl === "string"
      ? updates.controlUrl
      : updates.controlUrl === null
        ? null
        : state.controlUrl;
  const nextUpdatedAt =
    typeof updates.controlUrlUpdatedAt === "number"
      ? updates.controlUrlUpdatedAt
      : nextControlStatus !== state.controlStatus ||
          nextControlStatusDetail !== state.controlStatusDetail ||
          nextControlUrl !== state.controlUrl
        ? Date.now()
        : state.controlUrlUpdatedAt;

  state.controlStatus = nextControlStatus;
  state.controlStatusDetail = nextControlStatusDetail;
  state.controlUrl = nextControlUrl;
  state.controlUrlUpdatedAt = nextUpdatedAt;
}

function buildHeartbeatCapabilities(controlStatus) {
  return controlStatus === "ready" ? ["presence", "liveControl"] : CONNECTED_MACHINE_CAPABILITIES;
}

export function buildMachineHeartbeatBody(args) {
  const liveControlState =
    typeof args.readLiveControlState === "function" ? args.readLiveControlState() : null;
  const controlStatus =
    typeof liveControlState?.controlStatus === "string"
      ? liveControlState.controlStatus
      : undefined;
  const controlStatusDetail =
    typeof liveControlState?.controlStatusDetail === "string"
      ? liveControlState.controlStatusDetail
      : undefined;
  const controlUrl =
    typeof liveControlState?.controlUrl === "string" ? liveControlState.controlUrl : undefined;
  const controlUrlUpdatedAt =
    typeof liveControlState?.controlUrlUpdatedAt === "number"
      ? liveControlState.controlUrlUpdatedAt
      : undefined;

  return {
    allowedRoots: [],
    capabilities: buildHeartbeatCapabilities(controlStatus),
    connectorVersion: args.connectorVersion,
    displayName: args.displayName,
    hostname: args.hostname,
    machineId: args.machineId,
    os: args.os,
    status: args.status,
    ...(controlStatus ? { controlStatus } : {}),
    ...(controlStatusDetail ? { controlStatusDetail } : {}),
    ...(controlUrl ? { controlUrl } : {}),
    ...(typeof controlUrlUpdatedAt === "number" ? { controlUrlUpdatedAt } : {}),
  };
}

function buildCodexCliMissingMessage() {
  return "The `codex` command was not found. This flow needs the Codex CLI on your PATH. The Codex desktop app alone does not guarantee that the shell command exists. After Node.js is available, run `npm install -g @openai/codex` and retry.";
}

function codexCommandWasNotFound(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function codexShellOutputWasNotFound(output) {
  return /not recognized as an internal or external command/i.test(output);
}

function readCommandOutput(stdout, stderr) {
  return `${stdout ?? ""}${stderr ?? ""}`.trim();
}

/**
 * Browser/UI code uses repo-style OS names while Node exposes platform ids
 * like `win32` and `darwin`, so normalize once before branching on runtime
 * behavior that needs the Windows `.cmd` path or `curl.exe`.
 */
function normalizeRuntimePlatform(currentPlatform = process.platform) {
  switch (currentPlatform) {
    case "windows":
      return "win32";
    case "macos":
      return "darwin";
    default:
      return currentPlatform;
  }
}

/**
 * npm installs the Windows Codex CLI entrypoint as a `.cmd` wrapper. Resolve
 * that shim to the real script entrypoint on Windows so one-off commands avoid
 * both the quoted `/c` bug and cmd.exe metacharacter expansion.
 */
export function buildCodexSpawnInvocation(args, currentPlatform = process.platform, options = {}) {
  if (normalizeRuntimePlatform(currentPlatform) === "win32") {
    return buildCodexRuntimeSpawnInvocation(args, currentPlatform, options);
  }

  return {
    args,
    command: "codex",
  };
}

export function buildCodexSpawnOptions(options = {}) {
  return options;
}

/**
 * Mirror Windows PATH lookup locally so the runtime can resolve the same npm
 * shim that `cmd.exe` would have found without keeping the long-lived server
 * attached to a shell wrapper process.
 */
function resolveWindowsPathCommand(command, env = process.env) {
  const searchPath = [env.Path, env.PATH]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join(";");
  const pathExtensions = env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD";
  const commandHasExtension = path.extname(command).length > 0;
  const executableExtensions = commandHasExtension
    ? [""]
    : pathExtensions
        .split(";")
        .map((extension) => extension.trim())
        // Windows treats PATHEXT case-insensitively, but CI can probe a
        // case-sensitive filesystem while resolving lowercase npm shims.
        .map((extension) => extension.toLowerCase())
        .filter((extension) => extension.length > 0);

  for (const rawDirectory of searchPath.split(";")) {
    const directory = rawDirectory.trim().replace(/^"(.*)"$/, "$1");
    if (directory.length === 0) {
      continue;
    }

    for (const extension of executableExtensions) {
      const candidate = path.join(
        directory,
        extension.length > 0 ? `${command}${extension}` : command,
      );
      try {
        if (statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {}
    }
  }

  return null;
}

/**
 * npm's Windows global bins are `.cmd` shims that point at the real JS file.
 * Read that target so the runtime can launch the Codex server under the
 * current Node process tree and stop it reliably later.
 */
function readWindowsCmdShimTarget(shimPath) {
  const matches = readFileSync(shimPath, "utf8").match(/"%(?:~dp0|dp0%)\\([^"]+?)"\s+%[*]/);
  return matches?.[1] ?? null;
}

function resolveWindowsCmdShimScriptPath(shimPath, shimTarget) {
  try {
    return realpathSync(path.resolve(path.dirname(shimPath), ...shimTarget.split(/[\\/]+/)));
  } catch (error) {
    if (codexCommandWasNotFound(error)) {
      return null;
    }
    throw error;
  }
}

const WINDOWS_VOLTA_WHICH_TIMEOUT_MS = 5_000;

/**
 * Volta's top-level Windows shim delegates to `volta run codex`, so ask Volta
 * which package-local command it would execute and then resolve that package's
 * npm-style `.cmd` shim the same way we do for global npm installs.
 */
function resolveWindowsVoltaPackageShimPath(shimPath, env = process.env, cwd = process.cwd()) {
  const shimContents = readFileSync(shimPath, "utf8").trim();
  if (!/^@echo off\r?\nvolta run %~n0 %\*$/i.test(shimContents)) {
    return null;
  }

  const voltaPath = resolveWindowsPathCommand("volta", env);
  if (voltaPath === null) {
    return null;
  }

  const result = spawnSync(voltaPath, ["which", path.parse(shimPath).name], {
    cwd,
    env,
    encoding: "utf8",
    timeout: WINDOWS_VOLTA_WHICH_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    return null;
  }

  const packageCommandPath =
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? null;
  if (packageCommandPath === null) {
    return null;
  }

  const candidatePaths =
    path.extname(packageCommandPath).length > 0
      ? [packageCommandPath]
      : [`${packageCommandPath}.cmd`, `${packageCommandPath}.bat`];

  for (const candidatePath of candidatePaths) {
    try {
      if (statSync(candidatePath).isFile()) {
        return candidatePath;
      }
    } catch {}
  }

  return null;
}

/**
 * npm's Windows shims prefer a sibling `node.exe` and otherwise fall back to
 * resolving `node` on PATH. Mirror that choice so long-lived runtimes use the
 * same interpreter as the CLI wrapper that passed `--version`.
 */
function resolveWindowsCmdShimNodeCommand(shimPath, env = process.env) {
  const bundledNodePath = path.join(path.dirname(shimPath), "node.exe");

  try {
    if (statSync(bundledNodePath).isFile()) {
      return realpathSync(bundledNodePath);
    }
  } catch {}

  const pathNode = resolveWindowsPathCommand("node", env);
  if (pathNode !== null) {
    return pathNode;
  }

  throw new Error(
    `${buildCodexCliMissingMessage()} The Windows CLI shim could not resolve its Node runtime.`,
  );
}

function resolveWindowsShimInvocation(shimPath, env = process.env, options = {}) {
  const directTarget = readWindowsCmdShimTarget(shimPath);
  if (directTarget !== null) {
    const scriptPath = resolveWindowsCmdShimScriptPath(shimPath, directTarget);
    if (scriptPath === null) {
      return null;
    }

    return {
      nodeCommand: resolveWindowsCmdShimNodeCommand(shimPath, env),
      scriptPath,
    };
  }

  const voltaPackageShimPath = resolveWindowsVoltaPackageShimPath(shimPath, env, options.cwd);
  if (voltaPackageShimPath === null) {
    return null;
  }

  const voltaTarget = readWindowsCmdShimTarget(voltaPackageShimPath);
  if (voltaTarget === null) {
    return null;
  }

  const scriptPath = resolveWindowsCmdShimScriptPath(voltaPackageShimPath, voltaTarget);
  if (scriptPath === null) {
    return null;
  }

  return {
    nodeCommand: resolveWindowsCmdShimNodeCommand(voltaPackageShimPath, env),
    scriptPath,
  };
}

/**
 * Resolve the Windows Codex shim to its real JS entrypoint and launch that
 * under Node so literal args survive shell parsing and long-lived runtimes do
 * not strand an orphaned `cmd.exe` wrapper.
 */
export function buildCodexRuntimeSpawnInvocation(
  args,
  currentPlatform = process.platform,
  options = {},
) {
  if (normalizeRuntimePlatform(currentPlatform) !== "win32") {
    return {
      args,
      command: "codex",
    };
  }

  const runtimeEnv = options.env ?? process.env;
  const codexPath = resolveWindowsPathCommand("codex", runtimeEnv);
  if (codexPath === null) {
    throw new Error(buildCodexCliMissingMessage());
  }

  const extension = path.extname(codexPath).toLowerCase();
  if (extension === ".cmd" || extension === ".bat") {
    const shimInvocation = resolveWindowsShimInvocation(codexPath, runtimeEnv, options);
    if (shimInvocation === null) {
      throw new Error(
        `${buildCodexCliMissingMessage()} The Windows CLI shim could not be resolved to its script entrypoint.`,
      );
    }

    return {
      args: [shimInvocation.scriptPath, ...args],
      command: shimInvocation.nodeCommand,
    };
  }

  return {
    args,
    command: codexPath,
  };
}

function stopCodexProcess(processHandle, args = {}) {
  return new Promise((resolve) => {
    if (!processHandle || processHandle.exitCode !== null) {
      resolve();
      return;
    }

    const runtimePlatform = normalizeRuntimePlatform(args.currentPlatform);
    if (runtimePlatform === "win32" && typeof processHandle.pid === "number") {
      const taskkillArgs = ["/PID", String(processHandle.pid), "/T"];
      if (args.force === true) {
        taskkillArgs.push("/F");
      }

      const killer = spawn("taskkill", taskkillArgs, {
        stdio: "ignore",
      });
      killer.once("error", () => {
        try {
          processHandle.kill(args.force === true ? "SIGKILL" : "SIGTERM");
        } catch {}
        resolve();
      });
      killer.once("exit", () => {
        resolve();
      });
      return;
    }

    try {
      processHandle.kill(args.force === true ? "SIGKILL" : "SIGTERM");
    } catch {}
    resolve();
  });
}

function runCodexCommand(args, options = {}) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const invocation = buildCodexSpawnInvocation(args, process.platform, options);
    const timeoutMs =
      typeof options.timeout === "number" && Number.isFinite(options.timeout)
        ? options.timeout
        : null;
    const processHandle = spawn(
      invocation.command,
      invocation.args,
      buildCodexSpawnOptions({
        ...options,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: undefined,
      }),
    );
    const timeoutId =
      timeoutMs === null
        ? null
        : setTimeout(() => {
            timedOut = true;
            void stopCodexProcess(processHandle, {
              currentPlatform: process.platform,
              force: true,
            });
          }, timeoutMs);

    processHandle.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    processHandle.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    processHandle.once("error", (error) => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      reject(codexCommandWasNotFound(error) ? new Error(buildCodexCliMissingMessage()) : error);
    });
    processHandle.once("close", (code, signal) => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      if (timedOut && timeoutMs !== null) {
        reject(new Error(`codex ${args.join(" ")} timed out after ${timeoutMs}ms.`));
        return;
      }

      if (code === 0) {
        resolve({ stderr, stdout });
        return;
      }

      const commandOutput = readCommandOutput(stdout, stderr);
      if (codexShellOutputWasNotFound(commandOutput)) {
        reject(new Error(buildCodexCliMissingMessage()));
        return;
      }

      reject(
        new Error(
          commandOutput.length > 0
            ? `codex ${args.join(" ")} failed: ${commandOutput}`
            : signal
              ? `codex ${args.join(" ")} failed with signal ${signal}.`
              : `codex ${args.join(" ")} failed.`,
        ),
      );
    });
  });
}

/**
 * We only need proof that the Codex CLI exists locally and is callable from
 * PATH. `codex --version` is the smallest safe command that gives us that
 * signal.
 */
export function detectCodexVersion(options = {}) {
  const invocation = buildCodexSpawnInvocation(["--version"], process.platform, options);
  const result = spawnSync(
    invocation.command,
    invocation.args,
    buildCodexSpawnOptions({
      ...options,
      encoding: "utf8",
    }),
  );
  const commandOutput = readCommandOutput(result.stdout, result.stderr);

  if (codexCommandWasNotFound(result.error)) {
    throw new Error(buildCodexCliMissingMessage());
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    if (codexShellOutputWasNotFound(commandOutput)) {
      throw new Error(buildCodexCliMissingMessage());
    }

    throw new Error(
      commandOutput.length > 0
        ? `codex --version failed: ${commandOutput}`
        : "codex --version failed.",
    );
  }

  return commandOutput;
}

/**
 * Normalize the selected state directory to an absolute path once so config
 * reads, writes, and printed commands all refer to the same location.
 */
export function getSamebaseStateDirectory(args = {}) {
  const configuredStateDirectory = args.stateDirectory?.trim();
  if (configuredStateDirectory && configuredStateDirectory.length > 0) {
    return path.isAbsolute(configuredStateDirectory)
      ? configuredStateDirectory
      : path.resolve(args.cwd ?? process.cwd(), configuredStateDirectory);
  }

  const homeDirectory = args.homeDirectory ?? homedir();
  return path.join(homeDirectory, SAMEBASE_STATE_DIRNAME);
}

export function getSamebaseConfigPath(args = {}) {
  return path.join(
    getSamebaseStateDirectory({
      cwd: args.cwd,
      homeDirectory: args.homeDirectory,
      stateDirectory: args.stateDirectory,
    }),
    SAMEBASE_CONFIG_FILENAME,
  );
}

function describeSamebaseConfigPath(args = {}) {
  const configuredStateDirectory = args.stateDirectory?.trim();
  if (configuredStateDirectory && configuredStateDirectory.length > 0) {
    return getSamebaseConfigPath({
      cwd: args.cwd,
      homeDirectory: args.homeDirectory,
      stateDirectory: args.stateDirectory,
    });
  }

  return path.join("~", SAMEBASE_STATE_DIRNAME, SAMEBASE_CONFIG_FILENAME);
}

export function readLocalConfig(args = {}) {
  const configPath = getSamebaseConfigPath({
    homeDirectory: args.homeDirectory,
    stateDirectory: args.stateDirectory,
  });
  try {
    return parseJsonOrNull(readFileSync(configPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Keep one small JSON config file per Codex instance. Re-running the bootstrap
 * updates the current source URL while preserving the original install time.
 */
export function writeLocalConfig(args) {
  const configPath = getSamebaseConfigPath({
    homeDirectory: args.homeDirectory,
    stateDirectory: args.stateDirectory,
  });
  const existingRecord = readLocalConfig({
    homeDirectory: args.homeDirectory,
    stateDirectory: args.stateDirectory,
  });
  const nowIso = new Date().toISOString();
  const nextRecord = {
    codexVersion: args.codexVersion,
    installedAt:
      typeof existingRecord?.installedAt === "string" ? existingRecord.installedAt : nowIso,
    machineId: args.machineId,
    sourceUrl: args.sourceUrl,
    updatedAt: nowIso,
    ...(typeof args.machineCredential === "string"
      ? { machineCredential: args.machineCredential }
      : typeof existingRecord?.machineCredential === "string"
        ? { machineCredential: existingRecord.machineCredential }
        : {}),
  };

  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(nextRecord, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(configPath, 0o600);

  return configPath;
}

function readStoredMachineConfig(args = {}) {
  const storedConfig = readLocalConfig({
    homeDirectory: args.homeDirectory,
    stateDirectory: args.stateDirectory,
  });
  const sourceUrl = storedConfig?.sourceUrl;
  const machineId = storedConfig?.machineId;
  const machineCredential = storedConfig?.machineCredential;

  if (typeof sourceUrl !== "string" || sourceUrl.length === 0) {
    throw new Error(
      `Missing \`sourceUrl\` in ${describeSamebaseConfigPath({
        stateDirectory: args.stateDirectory,
      })}. Run \`samebase-sync connect\` first.`,
    );
  }
  if (typeof machineId !== "string" || machineId.length === 0) {
    throw new Error(
      `Missing \`machineId\` in ${describeSamebaseConfigPath({
        stateDirectory: args.stateDirectory,
      })}. Run \`samebase-sync connect\` first.`,
    );
  }
  if (typeof machineCredential !== "string" || machineCredential.length === 0) {
    throw new Error(
      `Missing \`machineCredential\` in ${describeSamebaseConfigPath({
        stateDirectory: args.stateDirectory,
      })}. Finish \`samebase-sync connect\` first.`,
    );
  }

  return {
    machineCredential,
    machineId,
    sourceUrl: validateSourceUrl(sourceUrl).toString(),
  };
}

export function validateConvexSiteUrl(value) {
  const convexSiteUrl = new URL(value);
  const isLoopbackHttp =
    convexSiteUrl.protocol === "http:" && isLoopbackHostname(convexSiteUrl.hostname);
  if (convexSiteUrl.protocol !== "https:" && !isLoopbackHttp) {
    throw new Error(
      "The runtime Convex site URL must use https, except for explicit localhost testing.",
    );
  }
  if (convexSiteUrl.username || convexSiteUrl.password) {
    throw new Error("The runtime Convex site URL must not include credentials.");
  }
  if (convexSiteUrl.search.length > 0 || convexSiteUrl.hash.length > 0) {
    throw new Error("The runtime Convex site URL must not include query params or hashes.");
  }
  if (convexSiteUrl.pathname !== "/") {
    throw new Error("The runtime Convex site URL must be an origin with no path.");
  }
  convexSiteUrl.hash = "";
  return convexSiteUrl;
}

function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function createHttpError(statusCode, message, errorName = "HttpError") {
  const error = new Error(message);
  error.name = errorName;
  error.statusCode = statusCode;
  return error;
}

function createMachineControlServiceError(message, retryable) {
  const error = createHttpError(503, message, MACHINE_CONTROL_SERVICE_ERROR_NAME);
  error.retryable = retryable;
  return error;
}

function readHttpErrorStatusCode(error) {
  return typeof error?.statusCode === "number" ? error.statusCode : 500;
}

function describeProcessExit(code, signal) {
  if (typeof code === "number") {
    return `code=${code}`;
  }
  if (typeof signal === "string") {
    return `signal=${signal}`;
  }
  return "unknown exit status";
}

function asRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
}

function readString(value) {
  return typeof value === "string" ? value : undefined;
}

function readBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry) => typeof entry === "string");
}

function readPinnedThreadIds(value) {
  return Array.from(new Set(readStringArray(value)));
}

function readHeaderValue(value) {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }

  return typeof value === "string" ? value : undefined;
}

function readBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  const [scheme, token, ...rest] = authorizationHeader.trim().split(/\s+/);
  if (scheme !== "Bearer" || !token || rest.length > 0) {
    return null;
  }

  return token;
}

function normalizeOrigin(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function normalizeAllowedOrigins(origins) {
  return Array.from(
    new Set(
      (Array.isArray(origins) ? origins : [origins])
        .map(normalizeOrigin)
        .filter((origin) => typeof origin === "string"),
    ),
  );
}

function readLoopbackOriginKey(value) {
  const origin = normalizeOrigin(value);
  if (origin === null) {
    return null;
  }

  try {
    const url = new URL(origin);
    return isLoopbackHostname(url.hostname) ? `${url.protocol}//${url.hostname}` : null;
  } catch {
    return null;
  }
}

/**
 * Keep loopback-origin relaxation scoped to the configured loopback origin and
 * ignore only the port so local dev can survive Vite port changes without
 * silently broadening an explicit allowlist into "any loopback origin".
 */
function originMatchesAllowedOrigins(requestOrigin, allowedOrigins) {
  if (allowedOrigins.includes(requestOrigin)) {
    return true;
  }

  const requestLoopbackOriginKey = readLoopbackOriginKey(requestOrigin);
  if (requestLoopbackOriginKey === null) {
    return false;
  }

  return allowedOrigins.some(
    (allowedOrigin) => readLoopbackOriginKey(allowedOrigin) === requestLoopbackOriginKey,
  );
}

function appendVaryHeader(res, value) {
  const existingHeader = res.getHeader("Vary");
  const existingValues =
    typeof existingHeader === "string"
      ? existingHeader
          .split(",")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      : Array.isArray(existingHeader)
        ? existingHeader
            .flatMap((entry) =>
              String(entry)
                .split(",")
                .map((item) => item.trim()),
            )
            .filter((entry) => entry.length > 0)
        : [];

  const nextValues = Array.from(new Set([...existingValues, value]));
  if (nextValues.length > 0) {
    res.setHeader("Vary", nextValues.join(", "));
  }
}

function addCorsHeaders(args) {
  if (args.origin === null) {
    return;
  }

  appendVaryHeader(args.res, "Origin");
  args.res.setHeader("Access-Control-Allow-Origin", args.origin);
  args.res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  args.res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  args.res.setHeader("Access-Control-Max-Age", "600");
}

function machineControlErrorIsRetryable(error) {
  if (typeof error?.retryable === "boolean") {
    return error.retryable;
  }

  return error instanceof TypeError || error?.name === "AbortError";
}

export function parseCloudflaredQuickTunnelUrl(line) {
  if (typeof line !== "string") {
    return null;
  }

  const match = line.match(/https:\/\/[a-z0-9.-]+\.trycloudflare\.com\b/i);
  return match?.[0] ?? null;
}

function normalizePathForDisplay(value) {
  return value.split("\\").join("/");
}

function resolveCodexHomeDirectory() {
  const configuredHome = process.env.CODEX_HOME?.trim();
  if (configuredHome && configuredHome.length > 0) {
    return configuredHome;
  }

  return path.join(homedir(), ".codex");
}

async function readDesktopPinnedThreadIds() {
  try {
    const parsedGlobalState = await readDesktopGlobalState();
    return readPinnedThreadIds(parsedGlobalState["pinned-thread-ids"]);
  } catch {
    return [];
  }
}

function resolveDesktopGlobalStatePath() {
  return path.join(resolveCodexHomeDirectory(), CODEX_GLOBAL_STATE_FILENAME);
}

function resolveDesktopGlobalStateLockPath() {
  return `${resolveDesktopGlobalStatePath()}.lock`;
}

function desktopGlobalStateWasNotFound(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function desktopGlobalStateLockIsHeld(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function desktopGlobalStateDirectorySyncIsUnsupported(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["EINVAL", "EISDIR", "ENOTSUP", "EPERM", "UNKNOWN"].includes(error.code)
  );
}

// Serialize local callers before they contend on the lockfile so pin/unpin
// requests keep a deterministic order within this process too.
let desktopGlobalStateUpdateQueue = Promise.resolve();

async function acquireDesktopGlobalStateLock() {
  const globalStateLockPath = resolveDesktopGlobalStateLockPath();
  const waitDeadline = Date.now() + CODEX_GLOBAL_STATE_LOCK_TIMEOUT_MS;
  mkdirSync(path.dirname(globalStateLockPath), { recursive: true });

  for (;;) {
    try {
      return openSync(globalStateLockPath, "wx", 0o600);
    } catch (error) {
      if (!desktopGlobalStateLockIsHeld(error)) {
        throw error;
      }
      if (Date.now() >= waitDeadline) {
        throw new Error(`Timed out waiting to update ${CODEX_GLOBAL_STATE_FILENAME}`);
      }
      await sleep(CODEX_GLOBAL_STATE_LOCK_RETRY_MS);
    }
  }
}

function releaseDesktopGlobalStateLock(lockFileDescriptor) {
  try {
    closeSync(lockFileDescriptor);
  } finally {
    try {
      unlinkSync(resolveDesktopGlobalStateLockPath());
    } catch (error) {
      if (!desktopGlobalStateWasNotFound(error)) {
        throw error;
      }
    }
  }
}

function syncDirectoryIfSupported(directoryPath) {
  let directoryFileDescriptor = null;

  try {
    directoryFileDescriptor = openSync(directoryPath, "r");
    fsyncSync(directoryFileDescriptor);
  } catch (error) {
    if (!desktopGlobalStateDirectorySyncIsUnsupported(error)) {
      throw error;
    }
  } finally {
    if (typeof directoryFileDescriptor === "number") {
      closeSync(directoryFileDescriptor);
    }
  }
}

async function readDesktopGlobalState() {
  const globalStatePath = resolveDesktopGlobalStatePath();
  const rawGlobalState = await readFile(globalStatePath, "utf8");
  const parsedGlobalState = asRecord(JSON.parse(rawGlobalState));
  if (parsedGlobalState === null) {
    throw new Error(`${CODEX_GLOBAL_STATE_FILENAME} must contain a JSON object`);
  }
  return parsedGlobalState;
}

async function writeDesktopGlobalState(record) {
  const globalStatePath = resolveDesktopGlobalStatePath();
  const globalStateDirectoryPath = path.dirname(globalStatePath);
  const tempGlobalStatePath = path.join(
    globalStateDirectoryPath,
    `${path.basename(globalStatePath)}.${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.tmp`,
  );
  const serializedGlobalState = `${JSON.stringify(record, null, 2)}\n`;
  let tempFileDescriptor = null;

  mkdirSync(globalStateDirectoryPath, { recursive: true });

  try {
    tempFileDescriptor = openSync(tempGlobalStatePath, "wx", 0o600);
    writeFileSync(tempFileDescriptor, serializedGlobalState, {
      encoding: "utf8",
    });
    fsyncSync(tempFileDescriptor);
    closeSync(tempFileDescriptor);
    tempFileDescriptor = null;
    renameSync(tempGlobalStatePath, globalStatePath);
    syncDirectoryIfSupported(globalStateDirectoryPath);
  } catch (error) {
    if (typeof tempFileDescriptor === "number") {
      closeSync(tempFileDescriptor);
    }
    try {
      unlinkSync(tempGlobalStatePath);
    } catch (unlinkError) {
      if (!desktopGlobalStateWasNotFound(unlinkError)) {
        throw unlinkError;
      }
    }
    throw error;
  }
}

async function updateDesktopPinnedThreadIds(updatePinnedThreadIds) {
  const runUpdate = async () => {
    const lockFileDescriptor = await acquireDesktopGlobalStateLock();
    let nextGlobalState;

    try {
      try {
        nextGlobalState = await readDesktopGlobalState();
      } catch (error) {
        if (!desktopGlobalStateWasNotFound(error)) {
          throw error;
        }
        nextGlobalState = {};
      }

      const nextPinnedThreadIds = readPinnedThreadIds(
        updatePinnedThreadIds(readPinnedThreadIds(nextGlobalState["pinned-thread-ids"])),
      );
      nextGlobalState["pinned-thread-ids"] = nextPinnedThreadIds;
      await writeDesktopGlobalState(nextGlobalState);
      return nextPinnedThreadIds;
    } finally {
      releaseDesktopGlobalStateLock(lockFileDescriptor);
    }
  };

  const nextUpdate = desktopGlobalStateUpdateQueue.then(runUpdate, runUpdate);
  desktopGlobalStateUpdateQueue = nextUpdate.then(
    () => undefined,
    () => undefined,
  );
  return nextUpdate;
}

function readPathLeaf(value) {
  const normalized = normalizePathForDisplay(value);
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? value;
}

function readCodexWorktreeId(value) {
  const match = normalizePathForDisplay(value).match(/\/worktrees\/([^/]+)\//);
  return match?.[1] ?? null;
}

/**
 * Use the shared git common dir as the project identity so sibling worktrees
 * collapse into one project while keeping their individual cwd labels.
 */
function buildThreadProjectInfo(args) {
  const normalizedCwd = normalizePathForDisplay(path.resolve(args.cwd));
  const normalizedProjectRoot = normalizePathForDisplay(path.resolve(args.projectRoot));
  const isProjectRoot = normalizedCwd === normalizedProjectRoot;

  if (isProjectRoot) {
    return {
      project: {
        id: normalizedProjectRoot,
        label: readPathLeaf(normalizedProjectRoot),
        rootCwd: normalizedProjectRoot,
      },
      workspace: {
        label: null,
        isProjectRoot: true,
      },
      resolvedFromGit: args.resolvedFromGit,
    };
  }

  const codexWorktreeId = readCodexWorktreeId(normalizedCwd);
  const cwdLeaf = readPathLeaf(normalizedCwd);
  const projectRootLeaf = readPathLeaf(normalizedProjectRoot);
  const cwdParentLeaf = readPathLeaf(path.dirname(normalizedCwd));
  const projectParentLeaf = readPathLeaf(path.dirname(normalizedProjectRoot));
  const workspaceLabel =
    codexWorktreeId ??
    (cwdLeaf !== projectRootLeaf ? cwdLeaf : null) ??
    (cwdParentLeaf !== projectParentLeaf ? cwdParentLeaf : null) ??
    cwdLeaf;

  return {
    project: {
      id: normalizedProjectRoot,
      label: projectRootLeaf,
      rootCwd: normalizedProjectRoot,
    },
    workspace: {
      label: workspaceLabel,
      isProjectRoot: false,
    },
    resolvedFromGit: args.resolvedFromGit,
  };
}

function buildFallbackThreadProjectInfo(cwd) {
  return buildThreadProjectInfo({
    cwd,
    projectRoot: cwd,
    resolvedFromGit: false,
  });
}

const threadProjectInfoByCwd = new Map();

function getCachedThreadProjectInfo(cwd) {
  return threadProjectInfoByCwd.get(cwd);
}

function setCachedThreadProjectInfo(cwd, promise) {
  threadProjectInfoByCwd.set(cwd, promise);

  if (threadProjectInfoByCwd.size <= MAX_THREAD_PROJECT_INFO_CACHE_SIZE) {
    return;
  }

  const oldestKey = threadProjectInfoByCwd.keys().next().value;
  if (oldestKey !== undefined) {
    threadProjectInfoByCwd.delete(oldestKey);
  }
}

async function readThreadProjectInfo(cwd) {
  const cached = getCachedThreadProjectInfo(cwd);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const fallback = buildFallbackThreadProjectInfo(cwd);

    try {
      const { stdout } = await execFileAsync(
        "git",
        ["-C", cwd, "rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"],
        {
          timeout: 5_000,
          maxBuffer: 64 * 1024,
        },
      );

      const [topLevelLine, commonDirLine] = stdout
        .trim()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (!topLevelLine || !commonDirLine) {
        return fallback;
      }

      const resolvedTopLevel = path.isAbsolute(topLevelLine)
        ? topLevelLine
        : path.resolve(cwd, topLevelLine);
      const resolvedCommonDir = path.isAbsolute(commonDirLine)
        ? commonDirLine
        : path.resolve(cwd, commonDirLine);
      const projectRoot =
        path.basename(resolvedCommonDir) === ".git"
          ? path.dirname(resolvedCommonDir)
          : resolvedTopLevel;

      return buildThreadProjectInfo({
        cwd,
        projectRoot,
        resolvedFromGit: true,
      });
    } catch {
      return fallback;
    }
  })();

  setCachedThreadProjectInfo(cwd, promise);
  return promise;
}

function buildMachineWorktreeBranchName() {
  return `${CODEX_MACHINE_WORKTREE_BRANCH_PREFIX}/${randomToken(6).toLowerCase()}`;
}

function worktreeCreateErrorLooksRetryable(error) {
  const message = describeError(error);
  return /already exists|already checked out|already registered|already used/i.test(message);
}

/**
 * Keep machine-created worktrees under CODEX_HOME so they line up with the
 * existing sidebar worktree labelling and stay outside user repos by default.
 */
async function createMachineGitWorktree(cwd) {
  const projectRoot = path.resolve(cwd);
  const projectLeaf = readPathLeaf(projectRoot) || "repo";
  const worktreesRoot = path.join(resolveCodexHomeDirectory(), "worktrees");
  mkdirSync(worktreesRoot, { recursive: true });

  for (let attempt = 0; attempt < CODEX_MACHINE_WORKTREE_CREATE_RETRY_LIMIT; attempt += 1) {
    const branch = buildMachineWorktreeBranchName();
    const worktreeRoot = await mkdtemp(
      path.join(worktreesRoot, `${CODEX_MACHINE_WORKTREE_BRANCH_PREFIX}-`),
    );
    const worktreePath = path.join(worktreeRoot, projectLeaf);

    try {
      await execFileAsync(
        "git",
        ["-C", projectRoot, "worktree", "add", "-b", branch, worktreePath],
        {
          timeout: 30_000,
          maxBuffer: 128 * 1024,
        },
      );

      return {
        worktree: {
          branch,
          cwd: normalizePathForDisplay(worktreePath),
        },
      };
    } catch (error) {
      await rm(worktreeRoot, { recursive: true, force: true }).catch(() => undefined);

      if (
        worktreeCreateErrorLooksRetryable(error) &&
        attempt < CODEX_MACHINE_WORKTREE_CREATE_RETRY_LIMIT - 1
      ) {
        continue;
      }

      throw new Error(
        `Failed to create a git worktree from ${projectRoot}: ${describeError(error)}`,
      );
    }
  }
}

function cloneJsonValue(value) {
  if (value === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function normalizeTurnInput(body) {
  const rawInput =
    body.input !== undefined ? body.input : typeof body.text === "string" ? body.text : undefined;

  if (rawInput === undefined) {
    return undefined;
  }

  if (Array.isArray(rawInput)) {
    return rawInput;
  }

  if (typeof rawInput === "string") {
    return [{ type: "text", text: rawInput }];
  }

  if (asRecord(rawInput)) {
    return [rawInput];
  }

  return undefined;
}

function normalizeSandboxMode(value) {
  if (value === "read-only" || value === "workspace-write" || value === "danger-full-access") {
    return value;
  }

  const record = asRecord(value);
  if (record?.type === "readOnly") {
    return "read-only";
  }
  if (record?.type === "workspaceWrite") {
    return "workspace-write";
  }
  if (record?.type === "dangerFullAccess") {
    return "danger-full-access";
  }
  return undefined;
}

function normalizeSandboxPolicy(value) {
  if (asRecord(value)) {
    const cloned = cloneJsonValue(value);
    return asRecord(cloned) ?? undefined;
  }

  if (value === "read-only") {
    return { type: "readOnly" };
  }
  if (value === "workspace-write") {
    return { type: "workspaceWrite" };
  }
  if (value === "danger-full-access") {
    return { type: "dangerFullAccess" };
  }
  return undefined;
}

function applyThreadSandbox(params, body) {
  const sandbox =
    body.sandbox !== undefined
      ? normalizeSandboxMode(body.sandbox)
      : normalizeSandboxMode(body.sandboxPolicy);
  if (sandbox !== undefined) {
    params.sandbox = sandbox;
  }
}

function applyTurnSandboxPolicy(params, body) {
  const sandboxPolicy =
    body.sandboxPolicy !== undefined
      ? normalizeSandboxPolicy(body.sandboxPolicy)
      : normalizeSandboxPolicy(body.sandbox);
  if (sandboxPolicy !== undefined) {
    params.sandboxPolicy = sandboxPolicy;
  }
}

function applyCommonTurnOptions(params, body) {
  if (typeof body.cwd === "string") {
    params.cwd = body.cwd;
  }
  if (body.approvalPolicy !== undefined) {
    params.approvalPolicy = body.approvalPolicy;
  }
  applyTurnSandboxPolicy(params, body);
  if (typeof body.model === "string") {
    params.model = body.model;
  }
  if (typeof body.personality === "string") {
    params.personality = body.personality;
  }
}

function applySettingsOverrides(params, settings) {
  const record = asRecord(settings);
  if (!record) {
    return;
  }

  if (params.model === undefined && typeof record.model === "string") {
    params.model = record.model;
  }

  const effort =
    typeof record.effort === "string"
      ? record.effort
      : typeof record.reasoningEffort === "string"
        ? record.reasoningEffort
        : typeof record.reasoning_effort === "string"
          ? record.reasoning_effort
          : undefined;
  if (params.effort === undefined && effort !== undefined) {
    params.effort = effort;
  }

  const summary =
    typeof record.summary === "string"
      ? record.summary
      : typeof record.reasoningSummary === "string"
        ? record.reasoningSummary
        : typeof record.reasoning_summary === "string"
          ? record.reasoning_summary
          : undefined;
  if (params.summary === undefined && summary !== undefined) {
    params.summary = summary;
  }
}

function truncateText(value, maxLength = 120) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function describeThreadSource(value) {
  if (typeof value === "string") {
    return value;
  }

  const record = asRecord(value);
  if (!record) {
    return "unknown";
  }

  const subAgent = record.subAgent;
  if (typeof subAgent === "string") {
    return `subAgent:${subAgent}`;
  }

  const subAgentRecord = asRecord(subAgent);
  if (subAgentRecord) {
    const nestedKey = Object.keys(subAgentRecord)[0];
    if (nestedKey) {
      return `subAgent:${nestedKey}`;
    }
  }

  const key = Object.keys(record)[0];
  if (key) {
    return key;
  }

  return "unknown";
}

function summarizeUserMessageContent(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const firstText = value.find((entry) => {
    const record = asRecord(entry);
    return record?.type === "text" && typeof record.text === "string";
  });
  const firstTextRecord = asRecord(firstText);
  if (typeof firstTextRecord?.text === "string") {
    return truncateText(firstTextRecord.text);
  }

  if (value.length === 0) {
    return "Empty user message";
  }

  return `${value.length} input item${value.length === 1 ? "" : "s"}`;
}

function summarizeThreadItem(record) {
  const itemType = readString(record.type) ?? "unknown";

  if (itemType === "userMessage") {
    return summarizeUserMessageContent(record.content);
  }

  if (itemType === "agentMessage") {
    const text = readString(record.text);
    return text ? truncateText(text) : null;
  }

  if (itemType === "commandExecution") {
    const command = readString(record.command);
    const cwd = readString(record.cwd);
    if (command && cwd) {
      return `${command} (${cwd})`;
    }
    return command ?? cwd ?? null;
  }

  if (itemType === "fileChange") {
    const changes = Array.isArray(record.changes) ? record.changes.length : 0;
    return `${changes} change${changes === 1 ? "" : "s"}`;
  }

  if (itemType === "reasoning") {
    const summary = readStringArray(record.summary).at(0);
    const content = readStringArray(record.content).at(0);
    return summary ?? content ?? "Reasoning";
  }

  if (itemType === "mcpToolCall") {
    const server = readString(record.server);
    const tool = readString(record.tool);
    if (server && tool) {
      return `${server}/${tool}`;
    }
    return server ?? tool ?? null;
  }

  if (itemType === "dynamicToolCall" || itemType === "collabAgentToolCall") {
    return readString(record.tool) ?? null;
  }

  if (itemType === "webSearch") {
    return readString(record.query) ?? null;
  }

  if (itemType === "imageView") {
    return readString(record.path) ?? null;
  }

  if (itemType === "imageGeneration") {
    return readString(record.result) ?? null;
  }

  if (itemType === "enteredReviewMode" || itemType === "exitedReviewMode") {
    return readString(record.review) ?? null;
  }

  if (itemType === "contextCompaction") {
    return "Context compaction";
  }

  return readString(record.text) ?? readString(record.command) ?? null;
}

function normalizeThreadItem(value) {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    id: readString(record.id) ?? null,
    type: readString(record.type) ?? "unknown",
    summary: summarizeThreadItem(record),
    raw: cloneJsonValue(value),
  };
}

function normalizeThreadTurn(value) {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const id = readString(record.id);
  const status = readString(record.status);
  if (!id || !status) {
    return null;
  }

  const items = Array.isArray(record.items)
    ? record.items.map((item) => normalizeThreadItem(item)).filter((item) => item !== null)
    : [];

  return {
    id,
    status,
    errorMessage: readString(asRecord(record.error)?.message) ?? null,
    items,
    raw: cloneJsonValue(value),
  };
}

function normalizeThreadStatus(value) {
  const record = asRecord(value);
  return {
    type: readString(record?.type) ?? "unknown",
    activeFlags: readStringArray(record?.activeFlags),
    raw: cloneJsonValue(value),
  };
}

function deriveThreadPreviewFallback(record) {
  const explicitName = readString(record.name)?.trim();
  if (explicitName) {
    return explicitName;
  }

  if (!Array.isArray(record.turns)) {
    return "";
  }

  for (const turn of record.turns) {
    const normalizedTurn = normalizeThreadTurn(turn);
    if (!normalizedTurn) {
      continue;
    }

    const summary = normalizedTurn.items
      .map((item) => item.summary)
      .find((itemSummary) => typeof itemSummary === "string" && itemSummary.length > 0);
    if (summary) {
      return summary;
    }
  }

  return "";
}

function normalizeThread(value) {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const id = readString(record.id);
  const preview = readString(record.preview) ?? deriveThreadPreviewFallback(record);
  const cwd = readString(record.cwd);
  const updatedAt = readNumber(record.updatedAt);
  const createdAt = readNumber(record.createdAt);
  if (!id || !cwd || createdAt === undefined) {
    return null;
  }
  if (updatedAt === undefined) {
    return null;
  }

  const gitInfo = asRecord(record.gitInfo);
  const fallbackProjectInfo = buildFallbackThreadProjectInfo(cwd);
  const turns = Array.isArray(record.turns)
    ? record.turns.map((turn) => normalizeThreadTurn(turn)).filter((turn) => turn !== null)
    : [];

  return {
    id,
    name: readString(record.name) ?? null,
    preview,
    cwd,
    project: fallbackProjectInfo.project,
    workspace: fallbackProjectInfo.workspace,
    createdAt,
    updatedAt,
    cliVersion: readString(record.cliVersion) ?? null,
    modelProvider: readString(record.modelProvider) ?? null,
    sourceLabel: describeThreadSource(record.source),
    source: cloneJsonValue(record.source),
    status: normalizeThreadStatus(record.status),
    gitInfo: gitInfo
      ? {
          branch: readString(gitInfo.branch) ?? null,
          originUrl: readString(gitInfo.originUrl) ?? null,
          sha: readString(gitInfo.sha) ?? null,
        }
      : null,
    path: typeof record.path === "string" ? normalizePathForDisplay(record.path) : null,
    agentNickname: readString(record.agentNickname) ?? null,
    agentRole: readString(record.agentRole) ?? null,
    turns,
    raw: cloneJsonValue(value),
  };
}

async function enrichThreadProjectInfo(thread) {
  const projectInfo = await readThreadProjectInfo(thread.cwd);
  return applyThreadProjectInfo(thread, projectInfo);
}

function applyThreadProjectInfo(thread, projectInfo) {
  return {
    ...thread,
    project: projectInfo.project,
    workspace: projectInfo.workspace,
  };
}

function readThreadProjectAliasKey(thread) {
  const originUrl = thread.gitInfo?.originUrl;
  if (!originUrl) {
    return null;
  }

  return `${originUrl}::${readPathLeaf(thread.cwd)}`;
}

/**
 * Some older Codex sessions point at worktree paths that no longer exist, so
 * Git cannot resolve their common dir directly. When the same repo still has a
 * live thread elsewhere on disk, reuse that canonical project root and keep
 * only the dead worktree label as per-thread metadata.
 */
function alignFallbackThreadProjects(entries) {
  const canonicalProjectInfoByAliasKey = new Map();

  for (const entry of entries) {
    if (!entry.projectInfo.resolvedFromGit) {
      continue;
    }

    const aliasKey = readThreadProjectAliasKey(entry.thread);
    if (!aliasKey) {
      continue;
    }

    if (!canonicalProjectInfoByAliasKey.has(aliasKey)) {
      canonicalProjectInfoByAliasKey.set(aliasKey, entry.projectInfo);
    }
  }

  return entries.map((entry) => {
    if (entry.projectInfo.resolvedFromGit) {
      return applyThreadProjectInfo(entry.thread, entry.projectInfo);
    }

    const aliasKey = readThreadProjectAliasKey(entry.thread);
    if (!aliasKey) {
      return applyThreadProjectInfo(entry.thread, entry.projectInfo);
    }

    const canonicalProjectInfo = canonicalProjectInfoByAliasKey.get(aliasKey);
    if (!canonicalProjectInfo) {
      return applyThreadProjectInfo(entry.thread, entry.projectInfo);
    }

    return applyThreadProjectInfo(
      entry.thread,
      buildThreadProjectInfo({
        cwd: entry.thread.cwd,
        projectRoot: canonicalProjectInfo.project.rootCwd,
        resolvedFromGit: false,
      }),
    );
  });
}

function withApprovalContext(args) {
  const baseParams = asRecord(cloneJsonValue(args.params)) ?? {};
  baseParams.requestId = args.requestId;

  const itemId = readString(baseParams.itemId);
  const context = itemId !== undefined ? args.approvalContextByItemId.get(itemId) : undefined;
  if (!context) {
    return baseParams;
  }

  if (args.method === "item/fileChange/requestApproval") {
    if (context.fileChanges !== undefined) {
      baseParams.fileChanges = cloneJsonValue(context.fileChanges);
    }
    if (context.changeList !== undefined) {
      baseParams.changes = cloneJsonValue(context.changeList);
    }
  }

  if (args.method === "item/commandExecution/requestApproval") {
    if (context.command !== undefined) {
      baseParams.command = cloneJsonValue(context.command);
    }
    if (context.commandText !== undefined) {
      baseParams.commandText = context.commandText;
    }
    if (context.cwd !== undefined) {
      baseParams.cwd = context.cwd;
    }
    if (context.commandActions !== undefined) {
      baseParams.commandActions = cloneJsonValue(context.commandActions);
    }
    if (context.parsedCommand !== undefined) {
      baseParams.parsedCommand = cloneJsonValue(context.parsedCommand);
    }
  }

  return baseParams;
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (rawBody.length === 0) {
    return {};
  }

  return JSON.parse(rawBody);
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(payload));
  res.end(payload);
}

function createMachineControlAuth(args = {}) {
  const allowedOrigins = normalizeAllowedOrigins(args.allowedOrigins ?? []);
  const positiveValidationCache = new Map();

  if (!args.introspectionUrl || !args.machineId) {
    return {
      applyCors(req, res) {
        const requestOrigin = normalizeOrigin(readHeaderValue(req.headers.origin));
        if (requestOrigin === null) {
          return;
        }

        if (!originMatchesAllowedOrigins(requestOrigin, allowedOrigins)) {
          throw createHttpError(
            403,
            `Origin is not allowed: ${requestOrigin}`,
            MACHINE_CONTROL_AUTH_ERROR_NAME,
          );
        }

        addCorsHeaders({
          origin: requestOrigin,
          res,
        });
      },
      async authorizeRequest() {},
      getStatus(options = {}) {
        if (options.includeSensitive === false) {
          return {
            enforced: false,
            machineId: null,
            mode: "disabled",
          };
        }

        return {
          allowedOrigins,
          enforced: false,
          machineId: null,
          mode: "disabled",
          positiveCacheSize: 0,
        };
      },
      maybeHandlePreflight(req, res) {
        if (req.method !== "OPTIONS") {
          return false;
        }

        this.applyCors(req, res);
        res.statusCode = 204;
        res.end();
        return true;
      },
    };
  }

  async function introspectMachineControlToken(token) {
    const now = Date.now();
    const cachedValidation = positiveValidationCache.get(token);
    if (cachedValidation) {
      if (cachedValidation.cacheExpiresAt > now && cachedValidation.expiresAt > now) {
        return cachedValidation;
      }

      positiveValidationCache.delete(token);
    }

    let lastInfrastructureError = null;
    const totalAttempts = MACHINE_CONTROL_INTROSPECTION_BACKOFF_MS.length + 1;

    for (let attemptIndex = 0; attemptIndex < totalAttempts; attemptIndex += 1) {
      try {
        const response = await fetchWithTimeout(
          args.introspectionUrl,
          {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              machineId: args.machineId,
              token,
            }),
          },
          "Machine control token introspection request",
          MACHINE_CONTROL_INTROSPECTION_TIMEOUT_MS,
        );

        if (response.status === 502 || response.status === 503 || response.status === 504) {
          throw createMachineControlServiceError(
            `Machine control introspection failed: HTTP ${response.status}.`,
            true,
          );
        }

        const { parsed, text } = await readJsonResponse(response);
        if (
          response.status === 400 ||
          response.status === 401 ||
          response.status === 403 ||
          response.status === 404
        ) {
          throw createHttpError(
            401,
            typeof parsed?.error === "string" && parsed.error.length > 0
              ? parsed.error
              : text || "Machine control token was rejected.",
            MACHINE_CONTROL_AUTH_ERROR_NAME,
          );
        }

        if (!response.ok) {
          throw createMachineControlServiceError(
            `Machine control introspection failed: HTTP ${response.status}.`,
            false,
          );
        }

        const active = readBoolean(parsed?.active);
        const audience = readString(parsed?.audience);
        const expiresAt = readNumber(parsed?.expiresAt);
        const machineId = readString(parsed?.machineId);
        const userId = readString(parsed?.userId);

        if (active !== true) {
          throw createHttpError(
            401,
            "Machine control token is inactive.",
            MACHINE_CONTROL_AUTH_ERROR_NAME,
          );
        }

        if (
          audience !== MACHINE_CONTROL_TOKEN_AUDIENCE ||
          typeof expiresAt !== "number" ||
          typeof machineId !== "string" ||
          typeof userId !== "string"
        ) {
          throw createMachineControlServiceError(
            "Machine control introspection response is malformed.",
            false,
          );
        }

        if (machineId !== args.machineId) {
          throw createHttpError(
            401,
            "Machine control token does not match this machine.",
            MACHINE_CONTROL_AUTH_ERROR_NAME,
          );
        }

        const cachedResult = {
          active,
          audience,
          cacheExpiresAt: Math.min(expiresAt, now + MACHINE_CONTROL_TOKEN_CACHE_TTL_MS),
          expiresAt,
          machineId,
          userId,
        };
        positiveValidationCache.set(token, cachedResult);
        return cachedResult;
      } catch (error) {
        if (error instanceof Error && error.name === MACHINE_CONTROL_AUTH_ERROR_NAME) {
          throw error;
        }

        if (!machineControlErrorIsRetryable(error)) {
          if (error instanceof Error && error.name === MACHINE_CONTROL_SERVICE_ERROR_NAME) {
            throw error;
          }

          throw createMachineControlServiceError(
            error instanceof Error
              ? error.message
              : "Machine control auth is temporarily unavailable.",
            false,
          );
        }

        lastInfrastructureError = error;
        const hasRemainingAttempts = attemptIndex < totalAttempts - 1;
        if (!hasRemainingAttempts) {
          break;
        }

        const baseDelay = MACHINE_CONTROL_INTROSPECTION_BACKOFF_MS[attemptIndex] ?? 0;
        const jitter = Math.floor(Math.random() * 100);
        await sleep(baseDelay + jitter);
      }
    }

    throw createMachineControlServiceError(
      lastInfrastructureError instanceof Error
        ? lastInfrastructureError.message
        : "Machine control auth is temporarily unavailable.",
      true,
    );
  }

  return {
    applyCors(req, res) {
      const requestOrigin = normalizeOrigin(readHeaderValue(req.headers.origin));
      if (requestOrigin === null) {
        return;
      }

      if (!originMatchesAllowedOrigins(requestOrigin, allowedOrigins)) {
        throw createHttpError(
          403,
          `Origin is not allowed: ${requestOrigin}`,
          MACHINE_CONTROL_AUTH_ERROR_NAME,
        );
      }

      addCorsHeaders({
        origin: requestOrigin,
        res,
      });
    },
    async authorizeRequest(req) {
      const bearerToken = readBearerToken(readHeaderValue(req.headers.authorization));
      if (!bearerToken) {
        throw createHttpError(401, "Missing bearer token.", MACHINE_CONTROL_AUTH_ERROR_NAME);
      }

      await introspectMachineControlToken(bearerToken);
    },
    getStatus(options = {}) {
      if (options.includeSensitive === false) {
        return {
          enforced: true,
          machineId: null,
          mode: "machine-control",
        };
      }

      return {
        allowedOrigins,
        enforced: true,
        machineId: args.machineId,
        mode: "machine-control",
        positiveCacheSize: positiveValidationCache.size,
      };
    },
    maybeHandlePreflight(req, res) {
      if (req.method !== "OPTIONS") {
        return false;
      }

      this.applyCors(req, res);
      res.statusCode = 204;
      res.end();
      return true;
    },
  };
}

function buildCodexLocalControlStatus(args) {
  return {
    ...(args.runtimeStatus ?? {}),
    service: {
      auth: args.authStatus,
      loopbackOnly: args.loopbackOnly,
      routeBasePath: args.routeBasePath,
    },
  };
}

export function localControlStatusIsReady(status, machineId) {
  const statusRecord = asRecord(status);
  const serviceRecord = asRecord(statusRecord?.service);
  if (!serviceRecord || serviceRecord.loopbackOnly !== true) {
    return false;
  }

  const authRecord = asRecord(serviceRecord.auth);
  if (!authRecord || authRecord.enforced !== true || authRecord.readinessProbePassed !== true) {
    return false;
  }

  const authMachineId = authRecord.machineId;

  return (
    authMachineId === machineId || authMachineId === null || typeof authMachineId === "undefined"
  );
}

async function readFilesRecursively(args) {
  const currentDir = args.currentDir ?? args.rootDir;
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(
        ...(await readFilesRecursively({
          rootDir: args.rootDir,
          currentDir: entryPath,
        })),
      );
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    files.push({
      path: path.relative(args.rootDir, entryPath),
      content: await readFile(entryPath, "utf8"),
    });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export class CodexLocalControlRuntime {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.process = null;
    this.startPromise = null;
    this.initialized = false;
    this.nextRpcId = 1;
    this.pendingRequests = new Map();
    this.approvalRequests = new Map();
    this.approvalContextByItemId = new Map();
    this.stdoutBuffer = "";
    this.events = [];
    this.nextEventCursor = 1;
    this.startedAt = null;
    this.lastError = null;
    this.lastExitCode = null;
    this.lastExitSignal = null;
    this.currentThreadId = null;
  }

  isRunning() {
    return Boolean(this.process && !this.process.killed && this.process.exitCode === null);
  }

  getSnapshot() {
    return {
      running: this.isRunning(),
      initialized: this.initialized,
      startedAt: this.startedAt,
      currentThreadId: this.currentThreadId,
      lastError: this.lastError,
      lastExitCode: this.lastExitCode,
      lastExitSignal: this.lastExitSignal,
      pendingRequestCount: this.pendingRequests.size,
      pendingApprovalCount: this.approvalRequests.size,
      eventCursor: this.nextEventCursor - 1,
    };
  }

  pushEvent(method, params) {
    this.events.push({
      cursor: this.nextEventCursor++,
      at: Date.now(),
      method,
      params,
      normalized: null,
    });

    if (this.events.length > CODEX_EVENT_BUFFER_SIZE) {
      this.events.shift();
    }
  }

  rejectPendingRequests(message) {
    for (const [requestId, pendingRequest] of this.pendingRequests.entries()) {
      clearTimeout(pendingRequest.timeoutId);
      pendingRequest.reject(new Error(message));
      this.pendingRequests.delete(requestId);
    }
  }

  resetRuntimeState(exitCode = null, exitSignal = null) {
    this.initialized = false;
    this.stdoutBuffer = "";
    this.currentThreadId = null;
    this.approvalRequests.clear();
    this.approvalContextByItemId.clear();
    this.process = null;
    this.lastExitCode = exitCode;
    this.lastExitSignal = exitSignal;
    this.rejectPendingRequests("Codex app-server process ended");
  }

  rememberApprovalContext(method, params) {
    const record = asRecord(params);
    if (!record) {
      return;
    }

    if (method === "item/started" || method === "item/completed") {
      const item = asRecord(record.item);
      if (!item || typeof item.id !== "string") {
        return;
      }

      if (item.type === "fileChange") {
        const previous = this.approvalContextByItemId.get(item.id) ?? {};
        this.approvalContextByItemId.set(item.id, {
          ...previous,
          changeList: cloneJsonValue(item.changes),
        });
        return;
      }

      if (item.type === "commandExecution") {
        const previous = this.approvalContextByItemId.get(item.id) ?? {};
        this.approvalContextByItemId.set(item.id, {
          ...previous,
          commandText: typeof item.command === "string" ? item.command : undefined,
          cwd: typeof item.cwd === "string" ? item.cwd : undefined,
          commandActions: cloneJsonValue(item.commandActions),
        });
      }

      while (this.approvalContextByItemId.size > CODEX_APPROVAL_CONTEXT_BUFFER_SIZE) {
        const oldestKey = this.approvalContextByItemId.keys().next().value;
        if (oldestKey === undefined) {
          break;
        }
        this.approvalContextByItemId.delete(oldestKey);
      }

      return;
    }

    if (!method.startsWith("codex/event/")) {
      return;
    }

    const message = asRecord(record.msg);
    if (!message || typeof message.call_id !== "string") {
      return;
    }

    const previous = this.approvalContextByItemId.get(message.call_id) ?? {};

    if (
      method === "codex/event/apply_patch_approval_request" ||
      method === "codex/event/patch_apply_begin" ||
      method === "codex/event/patch_apply_end"
    ) {
      this.approvalContextByItemId.set(message.call_id, {
        ...previous,
        fileChanges: cloneJsonValue(message.changes),
      });
      return;
    }

    if (method === "codex/event/exec_command_begin" || method === "codex/event/exec_command_end") {
      this.approvalContextByItemId.set(message.call_id, {
        ...previous,
        command: cloneJsonValue(message.command),
        cwd: typeof message.cwd === "string" ? message.cwd : undefined,
        parsedCommand: cloneJsonValue(message.parsed_cmd),
      });
    }
  }

  parseMessageLine(line) {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      return;
    }

    const record = asRecord(message);
    if (!record) {
      return;
    }

    const hasId = Object.prototype.hasOwnProperty.call(record, "id");
    const hasMethod = typeof record.method === "string";
    const hasResult = Object.prototype.hasOwnProperty.call(record, "result");
    const hasError = Object.prototype.hasOwnProperty.call(record, "error");

    if (hasMethod) {
      this.rememberApprovalContext(record.method ?? "", record.params);
    }

    if (hasId && (hasResult || hasError)) {
      const requestId = record.id;
      if (requestId === undefined) {
        return;
      }
      const pendingRequest = this.pendingRequests.get(requestId);
      if (!pendingRequest) {
        return;
      }

      clearTimeout(pendingRequest.timeoutId);
      this.pendingRequests.delete(requestId);

      if (hasError) {
        const errorMessage =
          readString(asRecord(record.error)?.message) ??
          `Codex RPC ${pendingRequest.method} failed`;
        pendingRequest.reject(new Error(errorMessage));
        return;
      }

      pendingRequest.resolve(record.result);
      return;
    }

    if (hasId && hasMethod) {
      const requestId = record.id;
      if (requestId === undefined) {
        return;
      }
      const approvalParams = withApprovalContext({
        requestId,
        method: record.method ?? "",
        params: record.params,
        approvalContextByItemId: this.approvalContextByItemId,
      });
      this.approvalRequests.set(requestId, {
        id: requestId,
        method: record.method ?? "",
        params: approvalParams,
        createdAt: Date.now(),
      });

      if (this.approvalRequests.size > CODEX_REQUEST_BUFFER_SIZE) {
        const oldestKey = this.approvalRequests.keys().next().value;
        if (oldestKey !== undefined) {
          this.approvalRequests.delete(oldestKey);
        }
      }

      this.pushEvent(record.method ?? "", approvalParams);
      return;
    }

    if (hasMethod) {
      this.pushEvent(record.method ?? "", record.params);
    }
  }

  writeMessage(message) {
    if (!this.process || !this.isRunning()) {
      throw new Error("Codex app-server is not running");
    }

    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  async sendRequestNoEnsure(args) {
    if (!this.isRunning()) {
      throw new Error("Codex app-server is not running");
    }

    const requestId = this.nextRpcId++;
    return await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Codex RPC timeout for method: ${args.method}`));
      }, args.timeoutMs ?? CODEX_RPC_TIMEOUT_MS);

      this.pendingRequests.set(requestId, {
        method: args.method,
        timeoutId,
        resolve,
        reject,
      });

      try {
        this.writeMessage({
          id: requestId,
          method: args.method,
          params: args.params ?? {},
        });
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
        reject(error instanceof Error ? error : new Error(describeError(error)));
      }
    });
  }

  sendNotificationNoEnsure(method, params) {
    this.writeMessage({ method, params });
  }

  async ensureCodexBinary() {
    let stdout = "";
    let stderr = "";
    try {
      ({ stdout, stderr } = await runCodexCommand(["--version"], {
        cwd: this.workspaceRoot,
        timeout: 10_000,
      }));
    } catch (error) {
      if (codexCommandWasNotFound(error)) {
        throw new Error(buildCodexCliMissingMessage());
      }
      throw error;
    }
    const version = readCommandOutput(stdout, stderr);
    if (version.length === 0) {
      throw new Error(
        "codex --version returned an empty response. Confirm that the Codex CLI is available on PATH.",
      );
    }
    return version;
  }

  async getStatus() {
    try {
      const codexVersion = await this.ensureCodexBinary();
      return {
        workspaceRoot: this.workspaceRoot,
        codexInstalled: true,
        codexVersion,
        codexInstallError: null,
        runtime: this.getSnapshot(),
      };
    } catch (error) {
      return {
        workspaceRoot: this.workspaceRoot,
        codexInstalled: false,
        codexVersion: null,
        codexInstallError: describeError(error),
        runtime: this.getSnapshot(),
      };
    }
  }

  async stopRuntime() {
    if (!this.process || this.process.exitCode !== null) {
      return { success: true, runtime: this.getSnapshot() };
    }

    const processToStop = this.process;
    await new Promise((resolve) => {
      let completed = false;
      const runtimePlatform = normalizeRuntimePlatform();
      const finish = () => {
        if (completed) {
          return;
        }
        completed = true;
        resolve();
      };

      const timeoutId = setTimeout(() => {
        if (processToStop.exitCode === null) {
          void stopCodexProcess(processToStop, {
            currentPlatform: runtimePlatform,
            force: true,
          }).then(finish);
          return;
        }
        finish();
      }, 5_000);

      processToStop.once("exit", () => {
        clearTimeout(timeoutId);
        finish();
      });

      void stopCodexProcess(processToStop, {
        currentPlatform: runtimePlatform,
      });
    });

    return { success: true, runtime: this.getSnapshot() };
  }

  async ensureRuntime(forceRestart) {
    if (forceRestart) {
      await this.stopRuntime();
    }

    if (this.initialized && this.isRunning()) {
      return { success: true, runtime: this.getSnapshot() };
    }

    if (this.startPromise) {
      await this.startPromise;
      return { success: true, runtime: this.getSnapshot() };
    }

    this.startPromise = (async () => {
      const version = await this.ensureCodexBinary();
      this.pushEvent("codex/runtime_stderr", {
        line: `Launching codex app-server (${version})`,
      });
      const runtimeSpawnOptions = {
        cwd: this.workspaceRoot,
        env: process.env,
      };
      const invocation = buildCodexRuntimeSpawnInvocation(
        ["app-server", "--listen", "stdio://"],
        process.platform,
        runtimeSpawnOptions,
      );

      const processHandle = spawn(
        invocation.command,
        invocation.args,
        buildCodexSpawnOptions({
          ...runtimeSpawnOptions,
          stdio: ["pipe", "pipe", "pipe"],
        }),
      );

      this.process = processHandle;
      this.initialized = false;
      this.startedAt = Date.now();
      this.lastError = null;
      this.lastExitCode = null;
      this.lastExitSignal = null;

      processHandle.stdout.on("data", (chunk) => {
        this.stdoutBuffer += chunk.toString();
        let newlineIndex = this.stdoutBuffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = this.stdoutBuffer.slice(0, newlineIndex);
          this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
          this.parseMessageLine(line);
          newlineIndex = this.stdoutBuffer.indexOf("\n");
        }
      });

      processHandle.stderr.on("data", (chunk) => {
        for (const line of chunk.toString().split("\n")) {
          const trimmed = line.trim();
          if (trimmed.length === 0) {
            continue;
          }
          this.pushEvent("codex/runtime_stderr", { line: trimmed });
        }
      });

      processHandle.on("error", (error) => {
        this.lastError = describeError(error);
        this.pushEvent("codex/runtime_stderr", {
          line: `Process error: ${this.lastError}`,
        });
      });

      processHandle.on("exit", (code, signal) => {
        this.lastError = `Codex app-server exited (code=${code}, signal=${signal})`;
        this.resetRuntimeState(code, signal);
        this.pushEvent("codex/runtime_exit", { code, signal });
      });

      try {
        await this.sendRequestNoEnsure({
          method: "initialize",
          params: {
            clientInfo: {
              name: "samebase_sync_local_control",
              title: "Samebase Sync Local Control",
              version: "0.1.0",
            },
          },
          timeoutMs: CODEX_INIT_TIMEOUT_MS,
        });
        this.sendNotificationNoEnsure("initialized", {});
        this.initialized = true;
        this.pushEvent("codex/runtime_ready", { startedAt: this.startedAt });
      } catch (error) {
        this.lastError = describeError(error);
        await this.stopRuntime();
        throw error;
      }
    })();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }

    return { success: true, runtime: this.getSnapshot() };
  }

  async listEvents(since) {
    return {
      events: this.events.filter((event) => event.cursor > since),
      nextCursor: this.nextEventCursor - 1,
    };
  }

  async listRequests() {
    return {
      requests: Array.from(this.approvalRequests.values()).sort(
        (left, right) => left.createdAt - right.createdAt,
      ),
    };
  }

  /**
   * The desktop sidebar can pin older sessions that fall outside the current
   * `thread/list` page. Read those by id so the research browser can mirror the
   * same pinned section instead of silently dropping them.
   */
  async readThreadSummary(threadId) {
    try {
      const result = await this.sendRequestNoEnsure({
        method: "thread/read",
        params: {
          threadId,
          includeTurns: false,
        },
      });
      const normalizedThread = normalizeThread(asRecord(result)?.thread);
      if (normalizedThread === null) {
        return null;
      }

      return enrichThreadProjectInfo(normalizedThread);
    } catch {
      return null;
    }
  }

  async readThreadSummaryFromList(threadId) {
    try {
      for (const archived of ["false", "true"]) {
        const seenCursors = new Set();
        let cursor = null;

        for (;;) {
          const searchParams = new URLSearchParams();
          searchParams.set("archived", archived);
          searchParams.set("limit", String(CODEX_THREAD_LIST_RECOVERY_PAGE_LIMIT));
          if (cursor) {
            searchParams.set("cursor", cursor);
          }

          const result = await this.listThreads(searchParams, {
            repairMissingPinnedThreads: false,
          });
          const matchedThread = result.threads.find((thread) => thread.id === threadId) ?? null;
          if (matchedThread) {
            return matchedThread;
          }

          if (
            typeof result.nextCursor !== "string" ||
            result.nextCursor.length === 0 ||
            seenCursors.has(result.nextCursor)
          ) {
            break;
          }

          seenCursors.add(result.nextCursor);
          cursor = result.nextCursor;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Keep the browser contract focused on the subset Samebase needs for a future
   * machine connector, while preserving the raw provider payload on each thread
   * for protocol inspection.
   */
  async listThreads(searchParams, options = {}) {
    const repairMissingPinnedThreads = options.repairMissingPinnedThreads !== false;
    const pinnedThreadIds = await readDesktopPinnedThreadIds();
    const params = {};
    const archived = searchParams.get("archived");
    if (archived === "true") {
      params.archived = true;
    }
    if (archived === "false") {
      params.archived = false;
    }

    const cursor = searchParams.get("cursor");
    if (cursor) {
      params.cursor = cursor;
    }

    const cwd = searchParams.get("cwd");
    if (cwd) {
      params.cwd = cwd;
    }

    const limitValue = Number.parseInt(searchParams.get("limit") ?? "", 10);
    if (Number.isFinite(limitValue) && limitValue > 0) {
      params.limit = limitValue;
    }

    const searchTerm = searchParams.get("searchTerm");
    if (searchTerm) {
      params.searchTerm = searchTerm;
    }
    const normalizedSearchTerm = searchTerm?.trim().toLowerCase() ?? "";

    const sortKey = searchParams.get("sortKey");
    if (sortKey === "created_at" || sortKey === "updated_at") {
      params.sortKey = sortKey;
    }

    const sourceKinds = searchParams.get("sourceKinds");
    if (sourceKinds) {
      params.sourceKinds = sourceKinds
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    } else {
      params.sourceKinds = DEFAULT_THREAD_SOURCE_KINDS;
    }

    const result = await this.sendRequestNoEnsure({
      method: "thread/list",
      params,
    });
    let threads = Array.isArray(asRecord(result)?.data)
      ? alignFallbackThreadProjects(
          await Promise.all(
            asRecord(result)
              .data.map((thread) => normalizeThread(thread))
              .filter((thread) => thread !== null)
              .map(async (thread) => ({
                thread,
                projectInfo: await readThreadProjectInfo(thread.cwd),
              })),
          ),
        )
      : [];

    const missingPinnedThreadIds = pinnedThreadIds.filter(
      (threadId) => !threads.some((thread) => thread.id === threadId),
    );
    if (repairMissingPinnedThreads && missingPinnedThreadIds.length > 0) {
      const missingPinnedThreads = (
        await Promise.all(
          missingPinnedThreadIds.map(async (threadId) => {
            return (
              (await this.readThreadSummary(threadId)) ??
              (await this.readThreadSummaryFromList(threadId))
            );
          }),
        )
      )
        .filter((thread) => thread !== null)
        .filter((thread) => {
          if (normalizedSearchTerm.length === 0) {
            return true;
          }

          const haystack = [
            thread.id,
            thread.name ?? "",
            thread.preview,
            thread.cwd,
            thread.path ?? "",
            thread.project.rootCwd,
            thread.workspace.label ?? "",
            thread.gitInfo?.branch ?? "",
          ]
            .join("\n")
            .toLowerCase();
          return haystack.includes(normalizedSearchTerm);
        })
        .filter((thread) =>
          archived === "true"
            ? normalizePathForDisplay(thread.path ?? "").includes("/archived_sessions/")
            : archived === "false"
              ? !normalizePathForDisplay(thread.path ?? "").includes("/archived_sessions/")
              : true,
        );

      threads = [...threads, ...missingPinnedThreads].sort(
        (left, right) => right.updatedAt - left.updatedAt,
      );
    }

    return {
      threads,
      pinnedThreadIds,
      nextCursor: readString(asRecord(result)?.nextCursor) ?? null,
      runtime: this.getSnapshot(),
    };
  }

  async readThread(threadId) {
    const result = await this.sendRequestNoEnsure({
      method: "thread/read",
      params: {
        threadId,
        includeTurns: true,
      },
    });
    const threadRecord = asRecord(result)?.thread;
    const normalizedThread = normalizeThread(threadRecord);
    // Recovery path: older thread/read payloads can omit required summary
    // fields, so rebuild metadata from list/search helpers and keep the richer
    // turn payload from the original thread/read response.
    const fallbackThread =
      normalizedThread === null
        ? ((await this.readThreadSummaryFromList(threadId)) ??
          (await this.readThreadSummary(threadId)))
        : null;
    const thread =
      normalizedThread === null ? fallbackThread : await enrichThreadProjectInfo(normalizedThread);
    if (!thread || !threadRecord) {
      throw new Error("thread/read returned an invalid thread payload");
    }

    const turns = Array.isArray(threadRecord.turns)
      ? threadRecord.turns.map((turn) => normalizeThreadTurn(turn)).filter((turn) => turn !== null)
      : thread.turns;

    if (normalizedThread === null) {
      return {
        thread: {
          ...thread,
          name: readString(threadRecord.name) ?? thread.name,
          preview:
            readString(threadRecord.preview) ??
            (threadRecord.preview !== undefined
              ? deriveThreadPreviewFallback(threadRecord)
              : thread.preview),
          cliVersion: readString(threadRecord.cliVersion) ?? thread.cliVersion,
          modelProvider: readString(threadRecord.modelProvider) ?? thread.modelProvider,
          sourceLabel:
            threadRecord.source !== undefined
              ? describeThreadSource(threadRecord.source)
              : thread.sourceLabel,
          source:
            threadRecord.source !== undefined ? cloneJsonValue(threadRecord.source) : thread.source,
          status:
            threadRecord.status !== undefined
              ? normalizeThreadStatus(threadRecord.status)
              : thread.status,
          gitInfo:
            asRecord(threadRecord.gitInfo) !== null
              ? {
                  branch: readString(asRecord(threadRecord.gitInfo).branch) ?? null,
                  originUrl: readString(asRecord(threadRecord.gitInfo).originUrl) ?? null,
                  sha: readString(asRecord(threadRecord.gitInfo).sha) ?? null,
                }
              : thread.gitInfo,
          path:
            typeof threadRecord.path === "string"
              ? normalizePathForDisplay(threadRecord.path)
              : thread.path,
          agentNickname: readString(threadRecord.agentNickname) ?? thread.agentNickname,
          agentRole: readString(threadRecord.agentRole) ?? thread.agentRole,
          turns,
          raw: cloneJsonValue(threadRecord),
        },
        runtime: this.getSnapshot(),
      };
    }

    return {
      thread,
      runtime: this.getSnapshot(),
    };
  }

  /**
   * Surface the provider's in-memory thread inventory separately from the
   * persisted thread list so Samebase can distinguish "currently loaded in the
   * runtime" from "known on disk".
   */
  async listLoadedThreads(searchParams) {
    const params = {};

    const cursor = searchParams.get("cursor");
    if (cursor) {
      params.cursor = cursor;
    }

    const limitValue = Number.parseInt(searchParams.get("limit") ?? "", 10);
    if (Number.isFinite(limitValue) && limitValue > 0) {
      params.limit = limitValue;
    }

    const result = await this.sendRequestNoEnsure({
      method: "thread/loaded/list",
      params,
    });

    return {
      threadIds: readStringArray(asRecord(result)?.data),
      nextCursor: readString(asRecord(result)?.nextCursor) ?? null,
      runtime: this.getSnapshot(),
    };
  }

  async respondApproval(body) {
    const record = asRecord(body);
    const requestId = record?.requestId;
    const decision = readString(record?.decision);
    if ((typeof requestId !== "string" && typeof requestId !== "number") || !decision) {
      throw new Error("requestId and decision are required");
    }

    const pendingRequest = this.approvalRequests.get(requestId);
    if (!pendingRequest) {
      throw new Error("Approval request not found");
    }

    await this.ensureRuntime(false);
    const result = { decision };
    if (decision === "accept" && record?.acceptSettings !== undefined) {
      result.acceptSettings = record.acceptSettings;
    }

    this.writeMessage({
      id: requestId,
      result,
    });
    this.approvalRequests.delete(requestId);

    return {
      success: true,
      requestId,
      decision,
      requests: await this.listRequests(),
    };
  }

  async threadStart(body) {
    const record = asRecord(body) ?? {};
    const params = {};
    if (typeof record.model === "string") {
      params.model = record.model;
    }
    if (typeof record.cwd === "string") {
      params.cwd = record.cwd;
    }
    if (record.approvalPolicy !== undefined) {
      params.approvalPolicy = record.approvalPolicy;
    }
    applyThreadSandbox(params, record);
    if (typeof record.personality === "string") {
      params.personality = record.personality;
    }
    const persistExtendedHistory = readBoolean(record.persistExtendedHistory);
    if (persistExtendedHistory !== undefined) {
      params.persistExtendedHistory = persistExtendedHistory;
    }

    const result = await this.sendRequestNoEnsure({
      method: "thread/start",
      params,
    });
    const threadId = readString(asRecord(asRecord(result)?.thread)?.id);
    if (threadId) {
      this.currentThreadId = threadId;
    }
    return { result, runtime: this.getSnapshot() };
  }

  async worktreeCreate(body) {
    const record = asRecord(body) ?? {};
    const cwd = readString(record.cwd);
    if (!cwd) {
      throw new Error("cwd is required");
    }

    return await createMachineGitWorktree(cwd);
  }

  /**
   * Persisted threads can exist on disk even when the current app-server
   * process has not loaded them into memory yet.
   */
  async resumeThreadById(args) {
    const params = { threadId: args.threadId };
    applyCommonTurnOptions(params, args.body);
    delete params.sandboxPolicy;
    applyThreadSandbox(params, args.body);

    const result = await this.sendRequestNoEnsure({
      method: "thread/resume",
      params,
    });
    this.currentThreadId = args.threadId;
    return result;
  }

  async threadResume(body) {
    const record = asRecord(body) ?? {};
    const threadId = readString(record.threadId);
    if (!threadId) {
      throw new Error("threadId is required");
    }

    const result = await this.resumeThreadById({
      threadId,
      body: record,
    });
    return { result, runtime: this.getSnapshot() };
  }

  async threadArchive(body) {
    const record = asRecord(body) ?? {};
    const threadId = readString(record.threadId);
    if (!threadId) {
      throw new Error("threadId is required");
    }

    const result = await this.sendRequestNoEnsure({
      method: "thread/archive",
      params: { threadId },
    });

    return { result, runtime: this.getSnapshot() };
  }

  async threadUnarchive(body) {
    const record = asRecord(body) ?? {};
    const threadId = readString(record.threadId);
    if (!threadId) {
      throw new Error("threadId is required");
    }

    const result = await this.sendRequestNoEnsure({
      method: "thread/unarchive",
      params: { threadId },
    });

    return { result, runtime: this.getSnapshot() };
  }

  async threadPin(body) {
    const record = asRecord(body) ?? {};
    const threadId = readString(record.threadId);
    if (!threadId) {
      throw new Error("threadId is required");
    }

    const pinnedThreadIds = await updateDesktopPinnedThreadIds((currentPinnedThreadIds) => [
      threadId,
      ...currentPinnedThreadIds.filter((currentThreadId) => currentThreadId !== threadId),
    ]);

    return {
      pinnedThreadIds,
      runtime: this.getSnapshot(),
    };
  }

  async threadUnpin(body) {
    const record = asRecord(body) ?? {};
    const threadId = readString(record.threadId);
    if (!threadId) {
      throw new Error("threadId is required");
    }

    const pinnedThreadIds = await updateDesktopPinnedThreadIds((currentPinnedThreadIds) =>
      currentPinnedThreadIds.filter((currentThreadId) => currentThreadId !== threadId),
    );

    return {
      pinnedThreadIds,
      runtime: this.getSnapshot(),
    };
  }

  async turnStart(body) {
    const record = asRecord(body) ?? {};
    const threadId = readString(record.threadId) ?? this.currentThreadId;
    if (!threadId) {
      throw new Error("threadId is required");
    }

    const input = normalizeTurnInput(record);
    if (input === undefined) {
      throw new Error("input or text is required");
    }

    const params = {
      threadId,
      input,
    };
    applyCommonTurnOptions(params, record);
    if (record.outputSchema !== undefined) {
      params.outputSchema = record.outputSchema;
    }
    if (record.effort !== undefined) {
      params.effort = record.effort;
    }
    if (record.summary !== undefined) {
      params.summary = record.summary;
    }
    applySettingsOverrides(params, record.settings);

    const timeoutValue = record.timeoutMs;
    const timeoutMs =
      typeof timeoutValue === "number" && Number.isFinite(timeoutValue)
        ? timeoutValue
        : CODEX_RPC_TIMEOUT_MS;

    let result;
    try {
      result = await this.sendRequestNoEnsure({
        method: "turn/start",
        params,
        timeoutMs,
      });
    } catch (error) {
      const canRetryAfterResume =
        error instanceof Error &&
        error.message.startsWith("thread not found:") &&
        threadId.length > 0;
      if (!canRetryAfterResume) {
        throw error;
      }

      await this.resumeThreadById({
        threadId,
        body: record,
      });
      result = await this.sendRequestNoEnsure({
        method: "turn/start",
        params,
        timeoutMs,
      });
    }

    this.currentThreadId = threadId;
    return { result, runtime: this.getSnapshot() };
  }

  async turnInterrupt(body) {
    const record = asRecord(body) ?? {};
    const threadId = readString(record.threadId) ?? this.currentThreadId;
    const turnId = readString(record.turnId);
    if (!threadId) {
      throw new Error("threadId is required");
    }
    if (!turnId) {
      throw new Error("turnId is required");
    }

    const result = await this.sendRequestNoEnsure({
      method: "turn/interrupt",
      params: { threadId, turnId },
    });
    return { result, runtime: this.getSnapshot() };
  }

  async generateProtocol(args) {
    const tempDir = await mkdtemp(path.join(tmpdir(), `samebase-codex-${args.mode}-`));
    try {
      const commandArgs = [
        "app-server",
        args.mode === "json-schema" ? "generate-json-schema" : "generate-ts",
        "--out",
        tempDir,
      ];
      if (args.experimental) {
        commandArgs.push("--experimental");
      }

      await runCodexCommand(commandArgs, {
        cwd: this.workspaceRoot,
        timeout: 60_000,
      });

      const files = await readFilesRecursively({ rootDir: tempDir });
      return {
        generatedAt: Date.now(),
        experimental: args.experimental,
        files,
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

function normalizeRouteBasePath(value) {
  if (!value || value === "/") {
    return "";
  }

  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function createCodexLocalControlRouter(args) {
  const routeBasePath = normalizeRouteBasePath(args.routeBasePath ?? "");
  const machineControlAuth = createMachineControlAuth(args.machineControlAuth ?? {});
  const serviceStatus = args.serviceStatus ?? {
    loopbackOnly: args.loopbackOnly === true,
  };

  return async function codexLocalControlRouter(req, res, next = () => {}) {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (routeBasePath.length > 0 && !url.pathname.startsWith(routeBasePath)) {
      next();
      return;
    }

    if (machineControlAuth.maybeHandlePreflight(req, res)) {
      return;
    }

    const routePath =
      routeBasePath.length > 0
        ? url.pathname.slice(routeBasePath.length) || "/"
        : url.pathname || "/";

    try {
      machineControlAuth.applyCors(req, res);

      if (req.method === "GET" && routePath === "/status") {
        const authStatus = machineControlAuth.getStatus({
          includeSensitive: false,
        });
        const authIsEnforced = authStatus.enforced === true;
        const bearerToken = readBearerToken(readHeaderValue(req.headers.authorization));

        if (authIsEnforced && !bearerToken) {
          // Keep the loopback readiness probe working without exposing runtime
          // snapshots or workspace metadata through the public tunnel.
          sendJson(
            res,
            200,
            buildCodexLocalControlStatus({
              authStatus,
              loopbackOnly: serviceStatus.loopbackOnly,
              routeBasePath,
            }),
          );
          return;
        }

        if (authIsEnforced) {
          await machineControlAuth.authorizeRequest(req);
        }

        sendJson(
          res,
          200,
          buildCodexLocalControlStatus({
            authStatus: machineControlAuth.getStatus({
              includeSensitive: true,
            }),
            loopbackOnly: serviceStatus.loopbackOnly,
            routeBasePath,
            runtimeStatus: await args.runtime.getStatus(),
          }),
        );
        return;
      }

      await machineControlAuth.authorizeRequest(req);

      if (req.method === "POST" && routePath === "/runtime/ensure") {
        const body = asRecord(await readJsonBody(req)) ?? {};
        sendJson(res, 200, await args.runtime.ensureRuntime(body.forceRestart === true));
        return;
      }

      if (req.method === "POST" && routePath === "/runtime/stop") {
        sendJson(res, 200, await args.runtime.stopRuntime());
        return;
      }

      if (req.method === "GET" && routePath === "/events") {
        const sinceParam = Number.parseInt(url.searchParams.get("since") ?? "0", 10);
        const since = Number.isFinite(sinceParam) ? sinceParam : 0;
        sendJson(res, 200, await args.runtime.listEvents(since));
        return;
      }

      if (req.method === "GET" && routePath === "/requests") {
        sendJson(res, 200, await args.runtime.listRequests());
        return;
      }

      if (req.method === "GET" && routePath === "/threads") {
        await args.runtime.ensureRuntime(false);
        sendJson(res, 200, await args.runtime.listThreads(url.searchParams));
        return;
      }

      if (req.method === "GET" && routePath === "/threads/loaded") {
        await args.runtime.ensureRuntime(false);
        sendJson(res, 200, await args.runtime.listLoadedThreads(url.searchParams));
        return;
      }

      if (req.method === "GET" && routePath.startsWith("/threads/")) {
        const encodedThreadId = routePath.slice("/threads/".length);
        const threadId = decodeURIComponent(encodedThreadId);
        if (threadId.length === 0) {
          sendJson(res, 400, { error: "threadId is required" });
          return;
        }

        await args.runtime.ensureRuntime(false);
        sendJson(res, 200, await args.runtime.readThread(threadId));
        return;
      }

      if (req.method === "POST" && routePath === "/approval/respond") {
        sendJson(res, 200, await args.runtime.respondApproval(await readJsonBody(req)));
        return;
      }

      if (req.method === "POST" && routePath === "/thread/start") {
        await args.runtime.ensureRuntime(false);
        sendJson(res, 200, await args.runtime.threadStart(await readJsonBody(req)));
        return;
      }

      if (req.method === "POST" && routePath === "/worktree/create") {
        sendJson(res, 200, await args.runtime.worktreeCreate(await readJsonBody(req)));
        return;
      }

      if (req.method === "POST" && routePath === "/thread/resume") {
        await args.runtime.ensureRuntime(false);
        sendJson(res, 200, await args.runtime.threadResume(await readJsonBody(req)));
        return;
      }

      if (req.method === "POST" && routePath === "/thread/archive") {
        await args.runtime.ensureRuntime(false);
        sendJson(res, 200, await args.runtime.threadArchive(await readJsonBody(req)));
        return;
      }

      if (req.method === "POST" && routePath === "/thread/unarchive") {
        await args.runtime.ensureRuntime(false);
        sendJson(res, 200, await args.runtime.threadUnarchive(await readJsonBody(req)));
        return;
      }

      if (req.method === "POST" && routePath === "/thread/pin") {
        sendJson(res, 200, await args.runtime.threadPin(await readJsonBody(req)));
        return;
      }

      if (req.method === "POST" && routePath === "/thread/unpin") {
        sendJson(res, 200, await args.runtime.threadUnpin(await readJsonBody(req)));
        return;
      }

      if (req.method === "POST" && routePath === "/turn/start") {
        await args.runtime.ensureRuntime(false);
        sendJson(res, 200, await args.runtime.turnStart(await readJsonBody(req)));
        return;
      }

      if (req.method === "POST" && routePath === "/turn/interrupt") {
        await args.runtime.ensureRuntime(false);
        sendJson(res, 200, await args.runtime.turnInterrupt(await readJsonBody(req)));
        return;
      }

      if (req.method === "GET" && routePath === "/protocol/json-schema") {
        sendJson(
          res,
          200,
          await args.runtime.generateProtocol({
            mode: "json-schema",
            experimental: url.searchParams.has("experimental"),
          }),
        );
        return;
      }

      if (req.method === "GET" && routePath === "/protocol/ts") {
        sendJson(
          res,
          200,
          await args.runtime.generateProtocol({
            mode: "ts",
            experimental: url.searchParams.has("experimental"),
          }),
        );
        return;
      }

      sendJson(res, 404, {
        error: `Unknown Codex research route: ${routePath}`,
      });
    } catch (error) {
      sendJson(res, readHttpErrorStatusCode(error), {
        error: describeError(error),
      });
    }
  };
}

function readServerAddress(server) {
  const address = server.address();
  if (address && typeof address === "object") {
    return {
      host:
        address.address === "::" || address.address === "0.0.0.0"
          ? LOCAL_CODEX_CONTROL_HOST
          : address.address,
      port: address.port,
    };
  }

  throw new Error("Local control server did not expose a TCP address");
}

export async function startLocalCodexControlServer(args = {}) {
  const runtime = new CodexLocalControlRuntime(args.workspaceRoot ?? process.cwd());
  const serviceStatus = {
    loopbackOnly: false,
  };
  const router = createCodexLocalControlRouter({
    machineControlAuth: args.machineControlAuth ?? {},
    routeBasePath: args.routeBasePath ?? "",
    runtime,
    serviceStatus,
  });
  const server = createServer((req, res) => {
    void router(req, res);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(
      args.port ?? LOCAL_CODEX_CONTROL_PORT,
      args.host ?? LOCAL_CODEX_CONTROL_HOST,
      () => {
        server.removeListener("error", reject);
        resolve();
      },
    );
  });

  const address = readServerAddress(server);
  serviceStatus.loopbackOnly = isLoopbackHostname(address.host);

  return {
    runtime,
    server,
    host: address.host,
    port: address.port,
    origin: `http://${address.host}:${address.port}`,
    async close() {
      await runtime.stopRuntime();
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  const parsed = parseJsonOrNull(text);
  return {
    parsed,
    text,
  };
}

/**
 * Bound installer/runtime requests so dead network paths fail clearly instead
 * of hanging the terminal forever.
 */
async function fetchWithTimeout(resource, init, timeoutLabel, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  timeoutId.unref();

  try {
    return await fetch(resource, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error(
        `${timeoutLabel} timed out after ${timeoutMs / 1000} seconds.`,
      );
      timeoutError.name = "AbortError";
      timeoutError.retryable = true;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchSamebaseConnectConfig(sourceUrl) {
  const configUrl = buildSamebaseConnectConfigUrl(sourceUrl);
  const response = await fetchWithTimeout(
    configUrl,
    {
      headers: {
        accept: "application/json",
      },
    },
    `Could not download ${SAMEBASE_CONNECT_CONFIG_PATHNAME}`,
  );

  if (!response.ok) {
    throw new Error(
      `Could not download ${SAMEBASE_CONNECT_CONFIG_PATHNAME}: HTTP ${response.status}.`,
    );
  }

  const { parsed, text } = await readJsonResponse(response);
  const convexSiteUrl = parsed?.convexSiteUrl;
  if (typeof convexSiteUrl !== "string" || convexSiteUrl.length === 0) {
    throw new Error(
      `${SAMEBASE_CONNECT_CONFIG_PATHNAME} is missing a valid "convexSiteUrl" string.`,
    );
  }

  try {
    return validateConvexSiteUrl(convexSiteUrl).toString();
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : `Invalid ${SAMEBASE_CONNECT_CONFIG_PATHNAME}: ${text}`,
    );
  }
}

async function readLocalControlStatus(localControlOrigin) {
  const response = await fetchWithTimeout(
    `${localControlOrigin}/status`,
    {
      headers: {
        accept: "application/json",
      },
    },
    "Local control status request",
  );

  if (!response.ok) {
    throw new Error(`Local control status request failed: HTTP ${response.status}.`);
  }

  const { parsed, text } = await readJsonResponse(response);
  const status = asRecord(parsed);
  if (!status) {
    throw new Error(`Local control status response is invalid: ${text}`);
  }

  // Prove the auth path is live before we publish a public tunnel. A fake
  // bearer token should fail closed with 401; anything else means the
  // connector is not actually ready for remote traffic yet.
  const authProbeResponse = await fetchWithTimeout(
    `${localControlOrigin}/status`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${MACHINE_CONTROL_READINESS_PROBE_TOKEN}`,
      },
    },
    "Local control auth probe",
  );

  if (authProbeResponse.status !== 401) {
    if (authProbeResponse.ok) {
      throw new Error("Local control auth probe unexpectedly accepted a synthetic bearer token.");
    }

    throw new Error(`Local control auth probe failed: HTTP ${authProbeResponse.status}.`);
  }

  const serviceRecord = asRecord(status.service);
  const authRecord = asRecord(serviceRecord?.auth);
  return {
    ...status,
    service: {
      ...(serviceRecord ?? {}),
      auth: {
        ...(authRecord ?? {}),
        readinessProbePassed: true,
      },
    },
  };
}

async function ensureCloudflaredBinary() {
  try {
    const { stdout, stderr } = await execFileAsync("cloudflared", ["--version"], {
      cwd: process.cwd(),
      timeout: 10_000,
    });
    const version = `${stdout}${stderr}`.trim();
    if (version.length === 0) {
      throw new Error("cloudflared --version returned an empty response");
    }
    return version;
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message.includes("spawn cloudflared ENOENT")
        ? "The `cloudflared` command was not found. Install cloudflared before using mobile live control."
        : describeError(error),
    );
  }
}

async function stopChildProcess(childProcess, signal = "SIGTERM") {
  if (childProcess.exitCode !== null || childProcess.killed) {
    return;
  }

  await new Promise((resolve) => {
    let completed = false;
    const finish = () => {
      if (completed) {
        return;
      }
      completed = true;
      resolve();
    };

    const timeoutId = setTimeout(() => {
      if (childProcess.exitCode === null) {
        childProcess.kill("SIGKILL");
      }
      finish();
    }, CLOUDFLARED_TUNNEL_SHUTDOWN_TIMEOUT_MS);
    timeoutId.unref();

    childProcess.once("exit", () => {
      clearTimeout(timeoutId);
      finish();
    });

    childProcess.kill(signal);
  });
}

function startCloudflaredQuickTunnel(args) {
  const childProcess = spawn(
    "cloudflared",
    [
      "tunnel",
      "--no-autoupdate",
      "--url",
      args.localControlOrigin,
      "--metrics",
      "localhost:0",
      "--loglevel",
      "info",
    ],
    {
      cwd: args.workspaceRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let isClosing = false;
  let sawQuickTunnelUrl = false;
  let lastQuickTunnelUrl = null;

  const startTimeoutId = setTimeout(() => {
    if (sawQuickTunnelUrl || isClosing) {
      return;
    }

    updateLiveControlState(args.liveControlState, {
      controlStatus: "unavailable",
      controlStatusDetail: "Timed out waiting for Cloudflare quick tunnel readiness.",
      controlUrl: null,
    });
    void stopChildProcess(childProcess);
  }, CLOUDFLARED_TUNNEL_START_TIMEOUT_MS);
  startTimeoutId.unref();

  const handleLine = (line) => {
    const quickTunnelUrl = parseCloudflaredQuickTunnelUrl(line);
    if (!quickTunnelUrl || quickTunnelUrl === lastQuickTunnelUrl) {
      return;
    }

    sawQuickTunnelUrl = true;
    lastQuickTunnelUrl = quickTunnelUrl;
    clearTimeout(startTimeoutId);
    updateLiveControlState(args.liveControlState, {
      controlStatus: "ready",
      controlStatusDetail: "Live control ready.",
      controlUrl: quickTunnelUrl,
    });
    console.log(`cloudflared quick tunnel ready: ${quickTunnelUrl}`);
  };

  for (const stream of [childProcess.stdout, childProcess.stderr]) {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          handleLine(line);
        }
        newlineIndex = buffer.indexOf("\n");
      }
    });
  }

  childProcess.on("error", (error) => {
    clearTimeout(startTimeoutId);
    if (isClosing) {
      return;
    }

    updateLiveControlState(args.liveControlState, {
      controlStatus: "unavailable",
      controlStatusDetail: `cloudflared failed: ${describeError(error)}`,
      controlUrl: null,
    });
  });

  childProcess.on("exit", (code, signal) => {
    clearTimeout(startTimeoutId);
    if (isClosing) {
      return;
    }

    updateLiveControlState(args.liveControlState, {
      controlStatus: "unavailable",
      controlStatusDetail: sawQuickTunnelUrl
        ? `cloudflared exited (${describeProcessExit(code, signal)}).`
        : `cloudflared exited before publishing a quick tunnel URL (${describeProcessExit(code, signal)}).`,
      controlUrl: null,
    });
    console.warn(
      sawQuickTunnelUrl
        ? `cloudflared exited unexpectedly (${describeProcessExit(code, signal)}).`
        : `cloudflared exited before readiness (${describeProcessExit(code, signal)}).`,
    );
  });

  return {
    async close() {
      isClosing = true;
      clearTimeout(startTimeoutId);
      updateLiveControlState(args.liveControlState, {
        controlStatus: "unavailable",
        controlStatusDetail: "Live control stopped.",
        controlUrl: null,
      });
      await stopChildProcess(childProcess);
    },
  };
}

async function postJson(args) {
  const response = await fetchWithTimeout(
    args.url,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(args.authorization ? { authorization: `Bearer ${args.authorization}` } : {}),
      },
      body: JSON.stringify(args.body),
    },
    args.timeoutLabel,
  );

  const { parsed, text } = await readJsonResponse(response);
  if (!response.ok) {
    const message =
      typeof parsed?.error === "string" && parsed.error.length > 0
        ? parsed.error
        : text || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return parsed;
}

async function createMachineRegistration(args) {
  const convexSiteUrl = await fetchSamebaseConnectConfig(args.sourceUrl);
  const requestId = `mreq_${randomToken(16)}`;
  const machineCredential = `mmc_${randomToken(24)}`;
  const credentialHash = await sha256Hex(machineCredential);

  await postJson({
    url: buildBootstrapUrl(convexSiteUrl),
    timeoutLabel: "Machine bootstrap request",
    body: {
      connectorVersion: args.connectorVersion,
      credentialHash,
      displayName: args.displayName,
      hostname: args.hostname,
      machineId: args.machineId,
      os: args.os,
      requestId,
    },
  });

  return {
    machineConnectUrl: buildMachineConnectUrl(args.sourceUrl, requestId),
    machineCredential,
  };
}

async function publishMachineHeartbeat(args) {
  try {
    await postJson({
      url: args.heartbeatUrl,
      authorization: args.machineCredential,
      timeoutLabel: "Machine heartbeat request",
      body: buildMachineHeartbeatBody(args),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "invalid machine credential") {
      const authError = new Error(
        "This machine is not approved yet. Finish approval in Samebase and retry `samebase-sync run`.",
      );
      authError.name = MACHINE_CREDENTIAL_AUTH_ERROR_NAME;
      throw authError;
    }
    throw error;
  }
}

function readDirectDownloadCommand(currentPlatform = process.platform) {
  return normalizeRuntimePlatform(currentPlatform) === "win32" ? "curl.exe -fsSL" : "curl -fsSL";
}

/**
 * Quote a path for the shell command snippets we print for operators.
 * PowerShell escapes a single quote by doubling it, while POSIX shells close
 * the quote, emit a literal single quote, and reopen it.
 */
function shellSingleQuote(value, currentPlatform = process.platform) {
  return normalizeRuntimePlatform(currentPlatform) === "win32"
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function buildOptionalStateDirArg(stateDirectory, currentPlatform = process.platform) {
  return typeof stateDirectory === "string" && stateDirectory.trim().length > 0
    ? ` --state-dir ${shellSingleQuote(stateDirectory, currentPlatform)}`
    : "";
}

export function buildDirectConnectCommand(
  sourceUrl,
  currentPlatform = process.platform,
  stateDirectory = null,
) {
  return `${readDirectDownloadCommand(currentPlatform)} '${sourceUrl}' | node --input-type=module - connect${buildOptionalStateDirArg(stateDirectory, currentPlatform)} '${sourceUrl}'`;
}

export function buildDirectRunCommand(
  sourceUrl,
  currentPlatform = process.platform,
  stateDirectory = null,
) {
  return `${readDirectDownloadCommand(currentPlatform)} '${sourceUrl}' | node --input-type=module - run${buildOptionalStateDirArg(stateDirectory, currentPlatform)}`;
}

export function formatHelpText() {
  return `Usage:
  samebase-sync connect [--state-dir <path>] [source-url]
  samebase-sync run [--state-dir <path>]

Examples:
  # published package path (after publish)
  npx @samebase/sync connect
  npx @samebase/sync run
  # local file
  node ./samebase.ts connect
  node ./samebase.ts run
  # direct hosted file in production (macOS/Linux shell)
  ${buildDirectConnectCommand("https://samebase.com/samebase.ts", "darwin")}
  ${buildDirectRunCommand("https://samebase.com/samebase.ts", "darwin")}
  # direct hosted file in production (Windows PowerShell)
  ${buildDirectConnectCommand("https://samebase.com/samebase.ts", "win32")}
  ${buildDirectRunCommand("https://samebase.com/samebase.ts", "win32")}
  # preview or local explicit override
  ${buildDirectConnectCommand("https://preview.samebase.com/samebase.ts", "darwin")}
  ${buildDirectConnectCommand("https://preview.samebase.com/samebase.ts", "win32")}
  # worktree-isolated state
  ${buildDirectRunCommand("https://preview.samebase.com/samebase.ts", "darwin", "/home/you/.samebase/worktrees/ceff")}`;
}

/**
 * Emit machine-readable markdown so a person can read the output directly and
 * an LLM can explain what happened from a terminal transcript.
 */
export function formatBootstrapReadyMarkdown(args) {
  return `# samebase sync bootstrap ready

- source: ${args.sourceUrl}
- codex: ${args.codexVersion}
- machine: ${args.machineId}
- state: ${args.configPath}
- next: ${args.machineConnectUrl}
- run: ${args.runCommand}`;
}

/**
 * Keep the first connector snapshot self-explanatory so long-running terminal
 * sessions preserve the initial live-control diagnosis.
 */
export function formatConnectorRunningMarkdown(args) {
  const liveControlDetailLine =
    typeof args.liveControlDetail === "string" && args.liveControlDetail.length
      ? `\n- live-control-detail: ${args.liveControlDetail}`
      : "";

  return `# samebase sync connector running

- source: ${args.sourceUrl}
- machine: ${args.machineId}
- local-control: ${args.localControlOrigin}
- live-control: ${args.liveControlStatus}${liveControlDetailLine}
- status: publishing heartbeats until this process exits`;
}

async function runConnectCommand(parsedArgs) {
  const sourceUrl = validateSourceUrl(parsedArgs.sourceUrl ?? SAMEBASE_SYNC_SOURCE_URL).toString();
  const codexVersion = detectCodexVersion();
  const existingRecord = readLocalConfig({
    stateDirectory: parsedArgs.stateDirectory,
  });
  const machineId =
    typeof existingRecord?.machineId === "string" && existingRecord.machineId.length > 0
      ? existingRecord.machineId
      : buildMachineId();
  const displayName = hostname();
  const os = normalizeMachineOs(platform());
  const connectorVersion = buildConnectorVersion(codexVersion);
  const registration = await createMachineRegistration({
    connectorVersion,
    displayName,
    hostname: displayName,
    machineId,
    os,
    sourceUrl,
  });
  const configPath = writeLocalConfig({
    codexVersion,
    machineCredential: registration.machineCredential,
    machineId,
    sourceUrl,
    stateDirectory: parsedArgs.stateDirectory,
  });

  console.log(
    formatBootstrapReadyMarkdown({
      codexVersion,
      configPath,
      machineConnectUrl: registration.machineConnectUrl,
      machineId,
      runCommand: buildDirectRunCommand(sourceUrl, process.platform, parsedArgs.stateDirectory),
      sourceUrl,
    }),
  );
}

export async function runHeartbeatLoop(args) {
  /** @type {() => void} */
  let requestStop = () => {};
  const heartbeatLoopState = {
    shouldPublishOfflineHeartbeat: true,
  };
  const stopPromise = new Promise((resolve) => {
    requestStop = () => resolve("stop");
  });
  const handleStop = () => {
    requestStop();
  };

  process.once("SIGINT", handleStop);
  process.once("SIGTERM", handleStop);

  try {
    for (;;) {
      try {
        await publishMachineHeartbeat({
          connectorVersion: args.connectorVersion,
          displayName: args.displayName,
          heartbeatUrl: args.heartbeatUrl,
          hostname: args.hostname,
          machineCredential: args.machineCredential,
          machineId: args.machineId,
          os: args.os,
          readLiveControlState: args.readLiveControlState,
          status: "online",
        });
      } catch (error) {
        if (error instanceof Error && error.name === MACHINE_CREDENTIAL_AUTH_ERROR_NAME) {
          heartbeatLoopState.shouldPublishOfflineHeartbeat = false;
          throw error;
        }

        console.warn(
          error instanceof Error ? error.message : "Could not publish the online heartbeat.",
        );
      }

      const wakeReason = await Promise.race([
        sleep(CONNECTED_MACHINE_HEARTBEAT_INTERVAL_MS).then(() => "tick"),
        stopPromise,
      ]);
      if (wakeReason === "stop") {
        break;
      }
    }
  } finally {
    process.removeListener("SIGINT", handleStop);
    process.removeListener("SIGTERM", handleStop);

    if (heartbeatLoopState.shouldPublishOfflineHeartbeat) {
      try {
        await publishMachineHeartbeat({
          connectorVersion: args.connectorVersion,
          displayName: args.displayName,
          heartbeatUrl: args.heartbeatUrl,
          hostname: args.hostname,
          machineCredential: args.machineCredential,
          machineId: args.machineId,
          os: args.os,
          readLiveControlState: args.readLiveControlState,
          status: "offline",
        });
      } catch (error) {
        console.warn(
          error instanceof Error ? error.message : "Could not publish the offline heartbeat.",
        );
      }
    }
  }
}

async function runConnectorCommand(parsedArgs) {
  const codexVersion = detectCodexVersion();
  const storedConfig = readStoredMachineConfig({
    stateDirectory: parsedArgs.stateDirectory,
  });
  const convexSiteUrl = await fetchSamebaseConnectConfig(storedConfig.sourceUrl);
  const displayName = hostname();
  const os = normalizeMachineOs(platform());
  const connectorVersion = buildConnectorVersion(codexVersion);
  const liveControlState = createInitialLiveControlState();
  const localControlServer = await startLocalCodexControlServer({
    machineControlAuth: {
      allowedOrigins: [new URL(storedConfig.sourceUrl).origin],
      introspectionUrl: buildMachineControlIntrospectionUrl(convexSiteUrl),
      machineId: storedConfig.machineId,
    },
    workspaceRoot: process.cwd(),
  });
  let quickTunnelHandle = null;

  try {
    let localControlStatus = null;
    try {
      localControlStatus = await readLocalControlStatus(localControlServer.origin);
    } catch (error) {
      updateLiveControlState(liveControlState, {
        controlStatus: "unavailable",
        controlStatusDetail: `Local control status probe failed: ${describeError(error)}`,
        controlUrl: null,
      });
    }

    if (
      localControlStatus &&
      !localControlStatusIsReady(localControlStatus, storedConfig.machineId)
    ) {
      updateLiveControlState(liveControlState, {
        controlStatus: "unavailable",
        controlStatusDetail: "Local control auth is not ready for live tunnel publication.",
        controlUrl: null,
      });
    }

    if (localControlStatusIsReady(localControlStatus, storedConfig.machineId)) {
      try {
        await ensureCloudflaredBinary();
        updateLiveControlState(liveControlState, {
          controlStatus: "starting",
          controlStatusDetail: "Starting Cloudflare quick tunnel.",
          controlUrl: null,
        });
        quickTunnelHandle = startCloudflaredQuickTunnel({
          liveControlState,
          localControlOrigin: localControlServer.origin,
          workspaceRoot: process.cwd(),
        });
      } catch (error) {
        updateLiveControlState(liveControlState, {
          controlStatus: "unavailable",
          controlStatusDetail: describeError(error),
          controlUrl: null,
        });
      }
    }

    console.log(
      formatConnectorRunningMarkdown({
        liveControlDetail: liveControlState.controlStatusDetail,
        liveControlStatus: liveControlState.controlStatus,
        localControlOrigin: localControlServer.origin,
        machineId: storedConfig.machineId,
        sourceUrl: storedConfig.sourceUrl,
      }),
    );

    await runHeartbeatLoop({
      connectorVersion,
      displayName,
      heartbeatUrl: buildHeartbeatUrl(convexSiteUrl),
      hostname: displayName,
      machineCredential: storedConfig.machineCredential,
      machineId: storedConfig.machineId,
      os,
      readLiveControlState: () => liveControlState,
    });
  } finally {
    await quickTunnelHandle?.close();
    await localControlServer.close();
  }
}

/**
 * Happy path:
 * 1. Validate the hosted source URL.
 * 2. Confirm the Codex CLI exists locally and is available on PATH.
 * 3. Persist one local config file.
 * 4. Print a markdown summary.
 * 5. Print the approval URL for the operator to open manually.
 * 6. Later, reuse the stored machine credential to publish heartbeats.
 */
export async function main(argv) {
  const parsedArgs = parseCliArgs(argv);
  if (parsedArgs.command === "help") {
    console.log(formatHelpText());
    return;
  }

  if (parsedArgs.command === "connect") {
    await runConnectCommand(parsedArgs);
    return;
  }

  await runConnectorCommand(parsedArgs);
}

/**
 * Support both `node ./samebase.ts` and stdin execution from
 * `curl ... | node --input-type=module -`.
 */
export function resolveEntrypointUrl(entrypoint) {
  try {
    return pathToFileURL(realpathSync(entrypoint)).href;
  } catch {
    return pathToFileURL(path.resolve(entrypoint)).href;
  }
}

/**
 * Support both `node ./samebase.ts` and stdin execution from
 * `curl ... | node --input-type=module -`.
 */
function isDirectExecution() {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }

  if (entrypoint === "-") {
    return /\[eval\d+\]$/.test(new URL(import.meta.url).pathname);
  }

  return import.meta.url === resolveEntrypointUrl(entrypoint);
}

if (isDirectExecution()) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
