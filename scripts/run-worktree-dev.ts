#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
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
import {
  DEFAULT_LOCAL_SITE_PORT,
  readLocalDeploymentName,
  resolveLocalDevPort,
  waitForLocalBackend,
} from "../apps/samebase/scripts/convex-local-utils.ts";
import { normalizeEnvValue } from "../apps/samebase/scripts/normalizeEnvValue.ts";
import {
  LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
  LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
} from "../runtime/localWorktreePasswordAuth.ts";
import { resolveWorktreeContext } from "./run-context-dev.ts";

const DEFAULT_WORKTREE_DEV_VITE_PORT = 5174;
/** How long a start waits for the dev server's local backend before it skips the hub clients. */
const BACKEND_READY_TIMEOUT_MS = 60_000;
// A start reruns the seed when the marker has another value, such as after a change of the seed.
const ONCE_BOOTSTRAP_MARKER = "local-deployment-seed-v1";

const vitePlusEntrypoint = fileURLToPath(import.meta.resolve("vite-plus/bin"));
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const HELP_TEXT = `Usage: scripts/run-worktree-dev.ts [options]

Set up this checkout's logged-in Convex local deployment, then optionally launch the long-running
frontend and local backend dev processes. The main checkout and every linked worktree use it.

Options:
  --once                     Bootstrap and seed the local backend, then exit.
  --no-branch                Skip detached-HEAD branch creation during bootstrap.
  --vite-port <port>         Frontend port for the long-running dev server.
                             Default: ${DEFAULT_LOCAL_SITE_PORT} in the main checkout,
                             ${DEFAULT_WORKTREE_DEV_VITE_PORT} in a linked worktree
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

  backend-ready = runs beside the dev server once its local backend answers

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

function readDefaultVitePort(env: NodeJS.ProcessEnv, fallback: number): number {
  return (
    readPositiveIntegerEnvValue(env.WORKTREE_DEV_VITE_PORT, "WORKTREE_DEV_VITE_PORT", HELP_TEXT) ??
    fallback
  );
}

export function parseWorktreeDevArgs(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  defaultVitePort = DEFAULT_WORKTREE_DEV_VITE_PORT,
): WorktreeDevOptions {
  const options: WorktreeDevOptions = {
    once: false,
    enableBranch: !readBooleanEnvValue(env.WORKTREE_DEV_NO_BRANCH),
    forceBootstrap: false,
    vitePort: readDefaultVitePort(env, defaultVitePort),
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

/**
 * The stage of samebase.com's Alchemy stack for this checkout: `dev-<user name>` in the main
 * checkout, `dev-<folder name>` in a linked worktree, in lowercase `[a-z0-9-]`.
 */
export function resolveDevStage(
  kind: "main" | "linked",
  repoRoot: string,
  userName: string,
): string {
  const name = kind === "main" ? userName : path.basename(repoRoot);
  return `dev-${name.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`;
}

function parseLoopbackOriginPort(origin: string): string | null {
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.protocol !== "http:") {
      return null;
    }
    if (!LOOPBACK_HOSTNAMES.has(parsedOrigin.hostname)) {
      return null;
    }
    return parsedOrigin.port.length > 0 ? parsedOrigin.port : null;
  } catch {
    return null;
  }
}

/**
 * Pin the chosen local frontend port into both env vars so the backend's `SITE_URL` sync and the
 * Vite wrapper cannot drift onto different localhost ports.
 */
export function buildDevServerEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const nextEnv = { ...env };
  const explicitOrigin = normalizeEnvValue(env.DEV_ENV_ORIGIN);
  if (explicitOrigin !== undefined) {
    const explicitLoopbackPort = parseLoopbackOriginPort(explicitOrigin);
    if (explicitLoopbackPort !== null && normalizeEnvValue(env.VITE_PORT) === undefined) {
      nextEnv.VITE_PORT = explicitLoopbackPort;
    }
    return nextEnv;
  }

  const vitePort = resolveLocalDevPort(env);
  nextEnv.VITE_PORT = vitePort;
  nextEnv.DEV_ENV_ORIGIN = `http://localhost:${vitePort}`;
  return nextEnv;
}

/**
 * The dependency bootstrap finishes before the seed, which makes the folder's local deployment and
 * writes .env.local.
 */
export function buildWorktreeDevCommandPlan(
  options: WorktreeDevOptions,
  repoRoot: string,
  stage: string,
  env: NodeJS.ProcessEnv = process.env,
): CommandSpec[] {
  // A deploy key in the shell points the Convex CLI at its own deployment, before the folder's
  // local deployment.
  const localEnv: NodeJS.ProcessEnv = { ...env };
  delete localEnv.CONVEX_DEPLOY_KEY;

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
        ...(options.enableBranch ? [] : ["--no-branch"]),
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
      label: "set up and seed the local deployment",
      cwd: repoRoot,
      command: process.execPath,
      args: [path.join(repoRoot, trackedFilePath("scripts/convex-seed-dev-auth.ts"))],
      env: localEnv,
      phase: "once-bootstrap",
      // Convex uses TTY stdin as the condition to refresh tracked AI files during
      // first-time local deployment setup. Backend bootstrap needs no input.
      stdio: ["ignore", "inherit", "inherit"],
    },
  ];

  if (options.once) {
    return plan;
  }

  return [
    ...plan,
    // The stage registers both identity hub clients on the local backend's site port, or renews
    // them, and writes their variables to the local deployment. It runs at each start, so a
    // development client expires only 14 days after the last start.
    {
      label: `deploy the Alchemy stage ${stage}`,
      cwd: path.join(repoRoot, "apps", "samebase"),
      command: "pnpm",
      args: ["exec", "alchemy", "deploy", "--stage", stage, "--yes", "--no-input"],
      env: localEnv,
      phase: "backend-ready",
    },
    {
      label: "launch the long-running worktree dev server",
      cwd: repoRoot,
      command: process.execPath,
      args: [vitePlusEntrypoint, "run", "--filter=samebase", "dev:raw"],
      env: buildDevServerEnvironment({
        ...localEnv,
        ...LOCAL_WORKTREE_PASSWORD_AUTH_VITE_ENV,
        VITE_PORT: String(options.vitePort),
      }),
      phase: "long-running",
    },
  ];
}

/**
 * What one start runs: the blocking steps in order, then the long-running dev server, and beside
 * it the backend-ready steps once its local backend answers.
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
    backendReady: plan.filter((spec) => spec.phase === "backend-ready"),
    longRunning: plan.find((spec) => spec.phase === "long-running"),
  };
}

function onceBootstrapMarkerPath(repoRoot: string): string {
  return path.join(repoRoot, ".tmp", "worktree-dev-once-bootstrap");
}

/**
 * The seed ran in this folder and its local deployment is a logged-in one. A folder with an
 * anonymous deployment, or none, runs the seed, which replaces it.
 */
function hasCompletedOnceBootstrap(options: WorktreeDevOptions, repoRoot: string): boolean {
  if (options.once || options.forceBootstrap) {
    return false;
  }
  if (!readLocalDeploymentName(path.join(repoRoot, "apps", "samebase"))?.startsWith("local-")) {
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
 * Runs the backend-ready steps once the local backend of apps/samebase answers. Their output stays
 * out of the dev server's log: each step prints one line. A failure is a warning: the dev server
 * keeps running, and the next start tries again.
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
      stdio: ["ignore", "ignore", "ignore"],
    });
    if (result.exitCode === 0) {
      console.log(`Done: ${spec.label}.`);
    } else {
      console.warn(
        `Could not ${spec.label} (exit code ${result.exitCode ?? 1}). Run \`${[spec.command, ...spec.args].join(" ")}\` in apps/samebase to see why; the next start tries again.`,
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
  const context = resolveWorktreeContext();
  const options = parseWorktreeDevArgs(
    process.argv.slice(2),
    process.env,
    context.kind === "main" ? DEFAULT_LOCAL_SITE_PORT : DEFAULT_WORKTREE_DEV_VITE_PORT,
  );
  if (options.showHelp) {
    console.log(HELP_TEXT);
    return;
  }

  const repoRoot = resolveRepoRoot();
  const stage = resolveDevStage(context.kind, repoRoot, userInfo().username);
  const plan = buildWorktreeDevCommandPlan(options, repoRoot, stage);
  const onceBootstrapAlreadyCompleted = hasCompletedOnceBootstrap(options, repoRoot);
  if (onceBootstrapAlreadyCompleted) {
    console.log(
      `Worktree --once bootstrap already completed; skipping seed/auth setup. The stage ${stage} renews the identity hub clients once the local backend is up.`,
    );
  } else if (options.forceBootstrap) {
    console.log("Forcing local deployment seed/auth setup.");
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
