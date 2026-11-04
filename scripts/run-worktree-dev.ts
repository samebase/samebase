#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { execa, execaSync } from "execa";

import {
  failUnexpectedArgument,
  isHelpArg,
  parsePositiveIntegerOption,
  requireOptionValue,
} from "./lib/cliArgs.ts";
import { readBooleanEnvValue, readPositiveIntegerEnvValue } from "./lib/env.ts";
import { fail, isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { trackedFilePath } from "./lib/trackedFilePath.ts";
import { waitForLocalBackend } from "../apps/samebase/scripts/convex-local-utils.ts";
import {
  LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
  LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
} from "../runtime/localWorktreePasswordAuth.ts";
import { buildPrimaryDevCommand, buildPrimaryDevEnvironment } from "./run-primary-dev.ts";

const DEFAULT_WORKTREE_DEV_VITE_PORT = 5174;
/** How long a start waits for the dev server's local backend before it skips the hub clients. */
const BACKEND_READY_TIMEOUT_MS = 60_000;
// Refresh existing worktrees once so their local backend registers with the identity hub.
const ONCE_BOOTSTRAP_MARKER = "worktree-anonymous-seed-auth-bootstrap-v8";

const HELP_TEXT = `Usage: scripts/run-worktree-dev.ts [options]

Bootstrap the worktree dev flow, then optionally launch the long-running
frontend and anonymous local backend dev processes.

Options:
  --once                     Bootstrap and seed the worktree backend, then exit.
  --no-branch                Skip detached-HEAD branch creation during bootstrap.
  --vite-port <port>         Frontend port for the long-running dev server.
                             Default: ${DEFAULT_WORKTREE_DEV_VITE_PORT}
  --force-bootstrap          Ignore the completed --once marker and rerun seed/auth setup.
  -h, --help                 Show this help message.
`;

type WorktreeDevOptions = {
  once: boolean;
  enableBranch: boolean;
  forceBootstrap: boolean;
  vitePort: number;
  showHelp: boolean;
};

type CommandSpec = {
  label: string;
  cwd: string;
  command: string;
  args: string[];
  /**
  always = runs at every start, before the dev server

  once-bootstrap = the seed, at a start without the marker

  backend-ready = runs beside the dev server once its local backend answers, at a start that skips
  the seed

  long-running = the dev server
  */
  phase: "always" | "once-bootstrap" | "backend-ready" | "long-running";
  env?: NodeJS.ProcessEnv;
  stdio?: ["ignore", "inherit", "inherit"];
};

const LOCAL_WORKTREE_PASSWORD_AUTH_VITE_ENV = {
  VITE_LOCAL_WORKTREE_PASSWORD_EMAIL: LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
  VITE_LOCAL_WORKTREE_PASSWORD_VALUE: LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
} as const;

function readDefaultVitePort(env: NodeJS.ProcessEnv): number {
  return (
    readPositiveIntegerEnvValue(env.WORKTREE_DEV_VITE_PORT, "WORKTREE_DEV_VITE_PORT", HELP_TEXT) ??
    DEFAULT_WORKTREE_DEV_VITE_PORT
  );
}

export function parseWorktreeDevArgs(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): WorktreeDevOptions {
  const options: WorktreeDevOptions = {
    once: false,
    enableBranch: !readBooleanEnvValue(env.WORKTREE_DEV_NO_BRANCH),
    forceBootstrap: false,
    vitePort: readDefaultVitePort(env),
    showHelp: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (isHelpArg(arg)) {
      options.showHelp = true;
      continue;
    }
    if (arg === "--once") {
      options.once = true;
      continue;
    }
    if (arg === "--no-branch") {
      options.enableBranch = false;
      continue;
    }
    if (arg === "--force-bootstrap") {
      options.forceBootstrap = true;
      continue;
    }
    if (arg === "--vite-port") {
      options.vitePort = parsePositiveIntegerOption(
        requireOptionValue(args, index, arg, HELP_TEXT),
        arg,
        HELP_TEXT,
      );
      index += 1;
      continue;
    }
    if (arg.startsWith("--vite-port=")) {
      options.vitePort = parsePositiveIntegerOption(
        arg.slice("--vite-port=".length),
        "--vite-port",
        HELP_TEXT,
      );
      continue;
    }
    failUnexpectedArgument(arg, HELP_TEXT);
  }

  return options;
}

export function buildWorktreeDevBootstrapArgs(options: WorktreeDevOptions): string[] {
  const args = ["--anon"];
  if (!options.enableBranch) {
    args.push("--no-branch");
  }
  return args;
}

/**
 * The dependency bootstrap finishes before the seed, which starts the local backend that writes
 * .env.local.
 */
export function buildWorktreeDevCommandPlan(
  options: WorktreeDevOptions,
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): CommandSpec[] {
  // Convex uses CONVEX_DEPLOY_KEY to choose the target before anonymous mode.
  const anonymousEnv: NodeJS.ProcessEnv = {
    ...env,
    CONVEX_AGENT_MODE: "anonymous",
  };
  delete anonymousEnv.CONVEX_DEPLOY_KEY;

  const plan: CommandSpec[] = [
    {
      label: "stop existing local backend listeners",
      cwd: repoRoot,
      command: process.execPath,
      args: [path.join(repoRoot, trackedFilePath("scripts/killport.ts"))],
      phase: "always",
    },
    {
      label: "bootstrap the current worktree",
      cwd: repoRoot,
      command: process.execPath,
      args: [
        path.join(repoRoot, trackedFilePath("scripts/bootstrap-worktree.ts")),
        ...buildWorktreeDevBootstrapArgs(options),
      ],
      phase: "always",
    },
    {
      label: "generate tracked file path types",
      cwd: repoRoot,
      command: process.execPath,
      args: [path.join(repoRoot, trackedFilePath("scripts/generate-tracked-file-paths.ts"))],
      phase: "always",
    },
    {
      label: "bootstrap and seed the anonymous local backend",
      cwd: repoRoot,
      command: process.execPath,
      args: [path.join(repoRoot, trackedFilePath("scripts/convex-seed-dev-auth.ts"))],
      phase: "once-bootstrap",
      // Convex uses TTY stdin as the condition to refresh tracked AI files during
      // first-time local deployment setup. Backend bootstrap needs no input.
      stdio: ["ignore", "inherit", "inherit"],
    },
  ];

  if (options.once) {
    return plan;
  }

  const primaryDevCommand = buildPrimaryDevCommand([], "dev:raw");
  // The seed registers both identity hub clients, or renews them. A start that skips the seed still
  // renews them, so a development client expires only 14 days after the last start.
  const hubClientSteps = ["hub:client", "hub:resource-client"].map((script): CommandSpec => ({
    label: `register or renew the identity hub client (${script})`,
    cwd: path.join(repoRoot, "apps", "samebase"),
    command: process.execPath,
    args: ["--run", script],
    env: anonymousEnv,
    phase: "backend-ready",
  }));

  return [
    ...plan,
    ...hubClientSteps,
    {
      label: "launch the long-running worktree dev server",
      cwd: repoRoot,
      command: primaryDevCommand.command,
      args: primaryDevCommand.args,
      env: buildPrimaryDevEnvironment({
        ...anonymousEnv,
        ...LOCAL_WORKTREE_PASSWORD_AUTH_VITE_ENV,
        VITE_PORT: String(options.vitePort),
      }),
      phase: "long-running",
    },
  ];
}

/**
 * What one start runs: the blocking steps in order, then the long-running dev server, and beside
 * it the backend-ready steps once its local backend answers. A start that runs the seed has no
 * backend-ready steps, because the seed runs the same commands.
 */
export function selectWorktreeDevSteps(
  plan: CommandSpec[],
  onceBootstrapAlreadyCompleted: boolean,
) {
  return {
    blocking: plan.filter(
      (spec) =>
        spec.phase === "always" ||
        (spec.phase === "once-bootstrap" && !onceBootstrapAlreadyCompleted),
    ),
    backendReady: onceBootstrapAlreadyCompleted
      ? plan.filter((spec) => spec.phase === "backend-ready")
      : [],
    longRunning: plan.find((spec) => spec.phase === "long-running"),
  };
}

function onceBootstrapMarkerPath(repoRoot: string): string {
  return path.join(repoRoot, ".tmp", "worktree-dev-once-bootstrap");
}

function hasCompletedOnceBootstrap(options: WorktreeDevOptions, repoRoot: string): boolean {
  if (options.once || options.forceBootstrap) {
    return false;
  }

  const markerPath = onceBootstrapMarkerPath(repoRoot);
  if (!existsSync(markerPath)) {
    return false;
  }

  return readFileSync(markerPath, "utf8").trim() === ONCE_BOOTSTRAP_MARKER;
}

function writeOnceBootstrapMarker(repoRoot: string): void {
  const markerPath = onceBootstrapMarkerPath(repoRoot);
  mkdirSync(path.dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, `${ONCE_BOOTSTRAP_MARKER}\n`, "utf8");
}

function runBlockingCommand(spec: CommandSpec): void {
  const result = execaSync(spec.command, spec.args, {
    cwd: spec.cwd,
    env: spec.env,
    extendEnv: spec.env === undefined,
    reject: false,
    stdio: spec.stdio ?? "inherit",
  });
  if (result.exitCode !== 0) {
    fail(`${spec.label} failed with exit code ${result.exitCode ?? 1}.`, result.exitCode ?? 1);
  }
}

/**
 * Runs the backend-ready steps once the local backend of apps/samebase answers. A failure is a
 * warning: the dev server keeps running, and the next start tries again.
 */
async function runWhenBackendIsReady(specs: CommandSpec[], repoRoot: string): Promise<void> {
  if (specs.length === 0) {
    return;
  }
  if (
    !(await waitForLocalBackend(BACKEND_READY_TIMEOUT_MS, path.join(repoRoot, "apps", "samebase")))
  ) {
    console.warn("The local backend did not answer, so the identity hub clients were not renewed.");
    return;
  }

  for (const spec of specs) {
    const result = await execa(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      extendEnv: spec.env === undefined,
      reject: false,
      stdio: "inherit",
    });
    if (result.exitCode !== 0) {
      console.warn(
        `Could not ${spec.label} (exit code ${result.exitCode ?? 1}). The next start tries again.`,
      );
    }
  }
}

async function runStreamingCommand(spec: CommandSpec): Promise<void> {
  const result = await execa(spec.command, spec.args, {
    cwd: spec.cwd,
    env: spec.env,
    extendEnv: spec.env === undefined,
    reject: false,
    stdio: "inherit",
  });

  if (result.signal) {
    process.kill(process.pid, result.signal);
    return;
  }
  if (result.exitCode === 0) {
    return;
  }
  throw new Error(`${spec.label} failed with exit code ${result.exitCode ?? 1}.`);
}

async function main(): Promise<void> {
  const options = parseWorktreeDevArgs(process.argv.slice(2));
  if (options.showHelp) {
    console.log(HELP_TEXT);
    return;
  }

  const repoRoot = resolveRepoRoot();
  const plan = buildWorktreeDevCommandPlan(options, repoRoot);
  const onceBootstrapAlreadyCompleted = hasCompletedOnceBootstrap(options, repoRoot);
  if (onceBootstrapAlreadyCompleted) {
    console.log(
      "Worktree --once bootstrap already completed; skipping seed/auth setup. The identity hub clients are renewed once the local backend is up.",
    );
  } else if (options.forceBootstrap) {
    console.log("Forcing anonymous seed/auth setup.");
  }

  const steps = selectWorktreeDevSteps(plan, onceBootstrapAlreadyCompleted);
  for (const spec of steps.blocking) {
    runBlockingCommand(spec);
  }
  if (!onceBootstrapAlreadyCompleted) {
    writeOnceBootstrapMarker(repoRoot);
  }
  if (steps.longRunning === undefined) {
    return;
  }

  await Promise.all([
    runStreamingCommand(steps.longRunning),
    runWhenBackendIsReady(steps.backendReady, repoRoot),
  ]);
}

if (isMainModule(import.meta.url)) {
  await runMain(main);
}
