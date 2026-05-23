#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readLocalDevOriginState } from "../apps/noter/scripts/convex-local-utils.ts";

type ChildProcess = import("node:child_process").ChildProcess;

type StdioOptions = import("node:child_process").StdioOptions;

type ShareMode = "worktree" | "local";

type ParsedArgs = {
  mode: ShareMode;
  preferredPort: number;
  showHelp: boolean;
};

type ExitState = {
  exited: boolean;
  code: number | null;
  signal: NodeJS.Signals | null;
};

type ChildExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

type RunCommandArgs = {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdio?: StdioOptions;
};

type WaitForUrlReadyArgs = {
  url: string;
  label: string;
  timeoutMs: number;
  exitState: ExitState;
};

type WaitForFrontendOriginArgs = {
  repoRoot: string;
  minimumWrittenAt: number;
  timeoutMs: number;
  exitState: ExitState;
  devLabel: string;
};

type DevLaunchArgs = {
  repoRoot: string;
  frontendPort: number;
  frontendOrigin: string;
  modeConfig: ShareModeConfig;
};

type CloudflaredQuickTunnelArgs = {
  repoRoot: string;
  frontendOrigin: string;
};

type CloudflaredQuickTunnelProcess = {
  childProcess: ChildProcess;
  exitState: ExitState;
  exitPromise: Promise<ChildExit>;
  readyPromise: Promise<string>;
  close: () => Promise<void>;
};

type ShareModeConfig = {
  bootstrapCommand: string;
  bootstrapArgs: string[];
  devCommand: string;
  buildDevArgs: (frontendPort: number) => string[];
  /**
   * `null` means this mode pins the frontend port via CLI args instead of an
   * injected env var. Non-null means `startDevServer` must inject the named
   * env var so the child dev command binds the probed share port deterministically.
   */
  devTargetPortVar: string | null;
  defaultStartPort: number;
  shareLabel: string;
  devLabel: string;
  readyLabel: string;
  bootstrapMessage: string;
  startMessage: (origin: string) => string;
};

const FRONTEND_READY_TIMEOUT_MS = 120_000;
const CLOUDFLARED_READY_TIMEOUT_MS = 60_000;
const PROCESS_SHUTDOWN_TIMEOUT_MS = 10_000;
const APPS_NOTER_DIRNAME = "apps/noter";
const QUICK_TUNNEL_URL_PATTERN = /https:\/\/[a-z0-9.-]+\.trycloudflare\.com\b/i;
const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const CONFIGURED_CONVEX_ENV_KEYS: readonly string[] = ["VITE_CONVEX_URL", "CONVEX_URL"];

const SHARE_MODE_CONFIG: Record<ShareMode, ShareModeConfig> = {
  worktree: {
    bootstrapCommand: PNPM_COMMAND,
    bootstrapArgs: ["run", "dev:worktree:once"],
    devCommand: PNPM_COMMAND,
    buildDevArgs: (frontendPort) => [
      "run",
      "dev:worktree",
      "--",
      "--vite-port",
      String(frontendPort),
    ],
    devTargetPortVar: null,
    defaultStartPort: 5174,
    shareLabel: "Worktree share",
    devLabel: "worktree dev",
    readyLabel: "worktree frontend",
    bootstrapMessage: "Bootstrapping worktree dev environment with `pnpm dev:worktree:once`.",
    startMessage: (origin) => `Starting worktree dev on ${origin} with a private Convex proxy.`,
  },
  local: {
    bootstrapCommand: PNPM_COMMAND,
    bootstrapArgs: ["run", "bootstrap"],
    devCommand: PNPM_COMMAND,
    buildDevArgs: () => ["run", "dev:primary"],
    devTargetPortVar: "VITE_PORT",
    defaultStartPort: 5173,
    shareLabel: "Local share",
    devLabel: "local dev",
    readyLabel: "local frontend",
    bootstrapMessage: "Bootstrapping local environment with `pnpm run bootstrap`.",
    startMessage: (origin) => `Starting local dev on ${origin} with a private Convex proxy.`,
  },
};

/**
 * `pnpm share:worktree` and `pnpm share:local` both expose one public frontend URL
 * while keeping the configured Convex backend behind Vite's same-origin proxy.
 */
function getHelpText(): string {
  return `Usage: node scripts/worktree-share.ts [options]

Start the local Noter dev server and publish the frontend over a Cloudflare
quick tunnel while keeping the configured Convex backend behind Vite's
same-origin proxy path.

Options:
  --mode <worktree|local>
      Share mode. Defaults to worktree.
      worktree default port: ${SHARE_MODE_CONFIG.worktree.defaultStartPort}
      local default port:    ${SHARE_MODE_CONFIG.local.defaultStartPort}
  --port <port>
      Preferred frontend port for the selected mode.
  -h, --help
      Show this help message.
`;
}

export function parseCloudflaredQuickTunnelUrl(line: unknown): string | null {
  if (typeof line !== "string") {
    return null;
  }

  const match = line.match(QUICK_TUNNEL_URL_PATTERN);
  return match?.[0] ?? null;
}

export function readLocalConvexUrlFromEnvContents(contents: unknown): string | null {
  if (typeof contents !== "string" || contents.length === 0) {
    return null;
  }

  for (const key of CONFIGURED_CONVEX_ENV_KEYS) {
    const value = readEnvAssignmentValue(contents, key);
    if (value) {
      return value;
    }
  }

  return null;
}

/**
 * Split incoming stream chunks into complete newline-delimited log lines while
 * preserving any final partial line for a later `end` flush.
 */
export function appendBufferedLines(
  buffer: string,
  chunk: unknown,
): { buffer: string; lines: string[] } {
  let nextBuffer = `${buffer}${String(chunk)}`;

  const lines: string[] = [];
  let newlineIndex = nextBuffer.indexOf("\n");
  while (newlineIndex !== -1) {
    const line = nextBuffer.slice(0, newlineIndex).trim();
    nextBuffer = nextBuffer.slice(newlineIndex + 1);
    if (line.length > 0) {
      lines.push(line);
    }
    newlineIndex = nextBuffer.indexOf("\n");
  }

  return {
    buffer: nextBuffer,
    lines,
  };
}

export function flushBufferedLine(buffer: string): string | null {
  const line = buffer.trim();
  return line.length > 0 ? line : null;
}

function readEnvAssignmentValue(contents: string, key: string): string | null {
  const prefix = `${key}=`;
  for (const line of contents.split(/\r?\n/)) {
    if (!line.startsWith(prefix)) {
      continue;
    }

    const rawValue = line.slice(prefix.length).trim();
    if (rawValue.length === 0) {
      return null;
    }

    const quoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"));
    return quoted ? rawValue.slice(1, -1) : rawValue;
  }

  return null;
}

function parseArgs(argv: string[]): ParsedArgs {
  let mode: ShareMode = "worktree";

  let preferredPort: number | null = null;
  let showHelp = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      showHelp = true;
      continue;
    }
    if (arg === "--mode") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`Missing value for ${arg}.\n\n${getHelpText()}`);
      }
      mode = parseMode(value);
      index += 1;
      continue;
    }
    if (arg === "--port") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`Missing value for ${arg}.\n\n${getHelpText()}`);
      }
      preferredPort = parsePort(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${getHelpText()}`);
  }

  return {
    mode,
    preferredPort: preferredPort ?? SHARE_MODE_CONFIG[mode].defaultStartPort,
    showHelp,
  };
}

function parseMode(value: string): ShareMode {
  if (value === "worktree" || value === "local") {
    return value;
  }

  throw new Error(`Invalid mode "${value}". Expected "worktree" or "local".`);
}

function parsePort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port "${value}".`);
  }
  return parsed;
}

function resolveRepoRoot(): string {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(scriptDirectory, "..");
}

function resolveAppsNoterDir(repoRoot: string): string {
  return path.join(repoRoot, APPS_NOTER_DIRNAME);
}

function readConfiguredConvexUrl(repoRoot: string): string {
  const envPath = path.join(resolveAppsNoterDir(repoRoot), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing ${APPS_NOTER_DIRNAME}/.env.local after bootstrap.`);
  }

  const value = readLocalConvexUrlFromEnvContents(fs.readFileSync(envPath, "utf8"));
  if (!value) {
    throw new Error(
      `Could not find VITE_CONVEX_URL or CONVEX_URL in ${APPS_NOTER_DIRNAME}/.env.local.`,
    );
  }
  return value;
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, "127.0.0.1");
  });
}

/**
 * Probe a preferred frontend port range before launch so share mode can ask
 * Vite for one stable port. `apps/noter/scripts/run-vite-dev.ts` still makes
 * the final bind decision, so this remains best-effort and
 * `NOTER_DEV_STRICT_PORT=1` intentionally fails fast if a late race loses.
 */
async function findAvailablePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`Could not find an available frontend port starting at ${startPort}.`);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeProcessExit(code: number | null, signal: NodeJS.Signals | null): string {
  if (signal) {
    return `signal ${signal}`;
  }
  return typeof code === "number" ? `code ${code}` : "unknown exit";
}

function createExitState(): ExitState {
  return {
    exited: false,
    code: null,
    signal: null,
  };
}

function waitForChildExit(childProcess: ChildProcess, exitState: ExitState): Promise<ChildExit> {
  return new Promise((resolve) => {
    childProcess.once("exit", (code, signal) => {
      exitState.exited = true;
      exitState.code = code;
      exitState.signal = signal;
      resolve({ code, signal });
    });
  });
}

function runCommand(args: RunCommandArgs): Promise<void> {
  return new Promise((resolve, reject) => {
    const childProcess: ChildProcess = spawn(args.command, args.args, {
      cwd: args.cwd,
      env: args.env,
      stdio: args.stdio ?? "inherit",
    });

    childProcess.once("error", reject);
    childProcess.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${args.command} ${args.args.join(" ")} exited with ${describeProcessExit(code, signal)}.`,
        ),
      );
    });
  });
}

async function waitForUrlReady(args: WaitForUrlReadyArgs): Promise<void> {
  const deadline = Date.now() + args.timeoutMs;

  while (Date.now() < deadline) {
    if (args.exitState.exited) {
      throw new Error(
        `${args.label} exited before readiness (${describeProcessExit(
          args.exitState.code,
          args.exitState.signal,
        )}).`,
      );
    }

    try {
      const response = await fetch(args.url, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the deadline so startup races stay quiet.
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${args.label} readiness at ${args.url}.`);
}

async function waitForFrontendOrigin(args: WaitForFrontendOriginArgs): Promise<string> {
  const appsNoterDir = resolveAppsNoterDir(args.repoRoot);
  const deadline = Date.now() + args.timeoutMs;

  while (Date.now() < deadline) {
    if (args.exitState.exited) {
      throw new Error(
        `${args.devLabel} exited before publishing a frontend origin (${describeProcessExit(
          args.exitState.code,
          args.exitState.signal,
        )}).`,
      );
    }

    const localDevOriginState = readLocalDevOriginState(appsNoterDir);
    if (localDevOriginState !== null && localDevOriginState.writtenAt >= args.minimumWrittenAt) {
      return localDevOriginState.origin;
    }

    await sleep(250);
  }

  throw new Error("Timed out waiting for the local frontend origin state.");
}

async function ensureCloudflaredBinary(repoRoot: string): Promise<void> {
  try {
    const output = execFileSync("cloudflared", ["--version"], {
      cwd: repoRoot,
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (typeof output !== "string" || output.trim().length === 0) {
      throw new Error("cloudflared --version returned an empty response.");
    }
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message.includes("spawnSync cloudflared ENOENT")
        ? "The `cloudflared` command was not found. Install cloudflared before using the share targets."
        : describeError(error),
    );
  }
}

function startDevServer(args: DevLaunchArgs): ChildProcess {
  // `devTargetPortVar === null` means this mode already threads the chosen port
  // through CLI args, so injecting an env var here would be redundant and could
  // fight the explicit command contract.
  const portEnv =
    args.modeConfig.devTargetPortVar === null
      ? {}
      : { [args.modeConfig.devTargetPortVar]: String(args.frontendPort) };
  const childProcess: ChildProcess = spawn(
    args.modeConfig.devCommand,
    args.modeConfig.buildDevArgs(args.frontendPort),
    {
      cwd: args.repoRoot,
      env: {
        ...process.env,
        ...portEnv,
        DEV_ENV_ORIGIN: args.frontendOrigin,
        NOTER_DEV_ALLOWED_HOSTS: ".trycloudflare.com",
        NOTER_DEV_PORT: String(args.frontendPort),
        NOTER_DEV_STRICT_PORT: "1",
      },
      detached: true,
      stdio: "inherit",
    },
  );

  return childProcess;
}

function startCloudflaredQuickTunnel(
  args: CloudflaredQuickTunnelArgs,
): CloudflaredQuickTunnelProcess {
  const childProcess: ChildProcess = spawn(
    "cloudflared",
    [
      "tunnel",
      "--no-autoupdate",
      "--url",
      args.frontendOrigin,
      "--metrics",
      "localhost:0",
      "--loglevel",
      "info",
    ],
    {
      cwd: args.repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (childProcess.stdout === null || childProcess.stderr === null) {
    throw new Error("cloudflared did not expose stdout/stderr pipes.");
  }

  const outputStreams: import("node:stream").Readable[] = [
    childProcess.stdout,
    childProcess.stderr,
  ];

  let isClosing = false;
  let sawTunnelUrl = false;

  let lastTunnelUrl: string | null = null;

  let resolveReady: (url: string) => void = () => {};

  let rejectReady: (error: Error) => void = () => {};

  const readyPromise: Promise<string> = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const exitState = createExitState();
  const exitPromise = waitForChildExit(childProcess, exitState);

  const readyTimeoutId = setTimeout(() => {
    if (isClosing || sawTunnelUrl) {
      return;
    }
    rejectReady(new Error("Timed out waiting for Cloudflare quick tunnel readiness."));
    void stopChildProcess(childProcess);
  }, CLOUDFLARED_READY_TIMEOUT_MS);
  readyTimeoutId.unref();

  const handleLine = (line: string): void => {
    const tunnelUrl = parseCloudflaredQuickTunnelUrl(line);
    if (!tunnelUrl || tunnelUrl === lastTunnelUrl) {
      return;
    }

    sawTunnelUrl = true;
    lastTunnelUrl = tunnelUrl;
    clearTimeout(readyTimeoutId);
    resolveReady(tunnelUrl);
  };

  for (const stream of outputStreams) {
    let buffer = "";

    stream.on("data", (chunk) => {
      const nextChunkState = appendBufferedLines(buffer, chunk);
      buffer = nextChunkState.buffer;
      for (const line of nextChunkState.lines) {
        handleLine(line);
      }
    });

    stream.on("end", () => {
      const remainingLine = flushBufferedLine(buffer);
      buffer = "";
      if (remainingLine !== null) {
        handleLine(remainingLine);
      }
    });
  }

  childProcess.once("error", (error) => {
    clearTimeout(readyTimeoutId);
    rejectReady(new Error(`cloudflared failed to start: ${describeError(error)}`));
  });

  childProcess.once("close", () => {
    clearTimeout(readyTimeoutId);
    if (isClosing) {
      return;
    }
    rejectReady(
      new Error(
        sawTunnelUrl
          ? `cloudflared exited unexpectedly (${describeProcessExit(
              exitState.code,
              exitState.signal,
            )}).`
          : `cloudflared exited before publishing a quick tunnel URL (${describeProcessExit(
              exitState.code,
              exitState.signal,
            )}).`,
      ),
    );
  });

  return {
    childProcess,
    exitState,
    exitPromise,
    readyPromise,
    async close() {
      isClosing = true;
      clearTimeout(readyTimeoutId);
      await stopChildProcess(childProcess);
    },
  };
}

async function stopChildProcess(
  childProcess: ChildProcess,
  signal: NodeJS.Signals = "SIGTERM",
): Promise<void> {
  if (childProcess.exitCode !== null || childProcess.killed) {
    return;
  }

  const stopped: Promise<void> = new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      resolve();
    };

    const timeoutId = setTimeout(() => {
      if (childProcess.exitCode === null) {
        childProcess.kill("SIGKILL");
      }
      finish();
    }, PROCESS_SHUTDOWN_TIMEOUT_MS);
    timeoutId.unref();

    childProcess.once("exit", () => {
      clearTimeout(timeoutId);
      finish();
    });

    childProcess.kill(signal);
  });

  await stopped;
}

async function stopProcessGroup(
  childProcess: ChildProcess,
  signal: NodeJS.Signals = "SIGTERM",
): Promise<void> {
  if (childProcess.exitCode !== null) {
    return;
  }

  const stopped: Promise<void> = new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      resolve();
    };

    const timeoutId = setTimeout(() => {
      try {
        if (typeof childProcess.pid === "number") {
          process.kill(-childProcess.pid, "SIGKILL");
        }
      } catch {
        childProcess.kill("SIGKILL");
      }
      finish();
    }, PROCESS_SHUTDOWN_TIMEOUT_MS);
    timeoutId.unref();

    childProcess.once("exit", () => {
      clearTimeout(timeoutId);
      finish();
    });

    try {
      if (typeof childProcess.pid === "number") {
        process.kill(-childProcess.pid, signal);
      } else {
        childProcess.kill(signal);
      }
    } catch {
      childProcess.kill(signal);
    }
  });

  await stopped;
}

async function setLocalSiteUrl(repoRoot: string, publicTunnelUrl: string): Promise<void> {
  const publicOrigin = new URL(publicTunnelUrl).origin;
  await runCommand({
    command: "npx",
    args: ["convex", "env", "set", "SITE_URL", publicOrigin],
    cwd: resolveAppsNoterDir(repoRoot),
    env: process.env,
  });
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function main(): Promise<void> {
  const parsedArgs = parseArgs(process.argv.slice(2));
  if (parsedArgs.showHelp) {
    console.log(getHelpText());
    return;
  }

  const modeConfig = SHARE_MODE_CONFIG[parsedArgs.mode];
  const repoRoot = resolveRepoRoot();
  const frontendPort = await findAvailablePort(parsedArgs.preferredPort);
  if (frontendPort !== parsedArgs.preferredPort) {
    console.log(
      `Port ${parsedArgs.preferredPort} is busy; using ${frontendPort} for ${modeConfig.shareLabel.toLowerCase()} instead.`,
    );
  }

  await ensureCloudflaredBinary(repoRoot);

  console.log(modeConfig.bootstrapMessage);
  await runCommand({
    command: modeConfig.bootstrapCommand,
    args: modeConfig.bootstrapArgs,
    cwd: repoRoot,
    env: process.env,
  });

  // Throws if .env.local is missing or lacks a Convex URL after bootstrap.
  void readConfiguredConvexUrl(repoRoot);
  const requestedFrontendOrigin = `http://127.0.0.1:${frontendPort}`;
  console.log(modeConfig.startMessage(requestedFrontendOrigin));

  const frontendLaunchStartedAt = Date.now();
  const devChild = startDevServer({
    repoRoot,
    frontendPort,
    frontendOrigin: requestedFrontendOrigin,
    modeConfig,
  });
  const devExitState = createExitState();
  const devExitPromise = waitForChildExit(devChild, devExitState);

  let tunnelProcess: CloudflaredQuickTunnelProcess | null = null;
  let shuttingDown = false;

  /**
   * Signal handlers can trip shutdown concurrently with the foreground await
   * path, so read the flag through a function instead of trusting local flow.
   */
  const hasStartedShutdown = (): boolean => shuttingDown;

  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (tunnelProcess !== null) {
      await tunnelProcess.close();
    }
    await stopProcessGroup(devChild);
  };

  process.once("SIGINT", () => {
    void shutdown().finally(() => {
      process.exitCode = 130;
    });
  });
  process.once("SIGTERM", () => {
    void shutdown().finally(() => {
      process.exitCode = 143;
    });
  });

  try {
    const frontendOrigin = await waitForFrontendOrigin({
      repoRoot,
      minimumWrittenAt: frontendLaunchStartedAt,
      timeoutMs: FRONTEND_READY_TIMEOUT_MS,
      exitState: devExitState,
      devLabel: modeConfig.devLabel,
    });
    if (frontendOrigin !== requestedFrontendOrigin) {
      console.log(
        `Requested ${requestedFrontendOrigin}, but the frontend started on ${frontendOrigin}.`,
      );
    }

    await waitForUrlReady({
      url: frontendOrigin,
      label: modeConfig.readyLabel,
      timeoutMs: FRONTEND_READY_TIMEOUT_MS,
      exitState: devExitState,
    });

    const activeTunnelProcess = startCloudflaredQuickTunnel({
      repoRoot,
      frontendOrigin,
    });
    tunnelProcess = activeTunnelProcess;

    const quickTunnelUrl = await activeTunnelProcess.readyPromise;
    await setLocalSiteUrl(repoRoot, quickTunnelUrl);

    console.log("");
    console.log(`${modeConfig.shareLabel} ready.`);
    console.log(`- Local:  ${frontendOrigin}`);
    console.log(`- Public: ${quickTunnelUrl}`);
    console.log("Press Ctrl-C to stop the local dev server and quick tunnel.");

    const exitingChild = await Promise.race([
      devExitPromise.then(() => "dev"),
      activeTunnelProcess.exitPromise.then(() => "cloudflared"),
    ]);

    if (hasStartedShutdown()) {
      return;
    }

    if (exitingChild === "dev") {
      throw new Error(
        `${modeConfig.devLabel} exited unexpectedly (${describeProcessExit(
          devExitState.code,
          devExitState.signal,
        )}).`,
      );
    }

    throw new Error(
      `Cloudflare quick tunnel exited unexpectedly (${describeProcessExit(
        activeTunnelProcess.exitState.code,
        activeTunnelProcess.exitState.signal,
      )}).`,
    );
  } finally {
    await shutdown();
  }
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  if (typeof entryPoint !== "string" || entryPoint.length === 0) {
    return false;
  }

  return path.resolve(entryPoint) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  void main().catch((error) => {
    console.error(describeError(error));
    process.exitCode = 1;
  });
}
