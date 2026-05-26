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
import {
  readBooleanEnvValue,
  readOptionalEnvValue,
  readPositiveIntegerEnvValue,
} from "./lib/env.ts";
import { fail, isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import {
  LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
  LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
} from "../runtime/localWorktreePasswordAuth.ts";
import { buildPrimaryDevArgs, buildPrimaryDevEnvironment } from "./run-primary-dev.ts";

const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const DEFAULT_WORKTREE_DEV_VITE_PORT = 5174;
const ONCE_BOOTSTRAP_MARKER = "worktree-anonymous-seed-auth-bootstrap-v1";

const HELP_TEXT = `Usage: scripts/run-worktree-dev.ts [options]

Bootstrap the worktree dev flow, then optionally launch the long-running
frontend and anonymous local backend dev processes.

Options:
  --once                     Bootstrap and seed the worktree backend, then exit.
  --no-branch                Skip detached-HEAD branch creation during bootstrap.
  --vite-port <port>         Frontend port for the long-running dev server.
                             Default: ${DEFAULT_WORKTREE_DEV_VITE_PORT}
  --force-bootstrap          Ignore the completed --once marker and rerun seed/auth setup.
  --source-env <path>        Explicit cloud dev source env file for local seed generation.
  --source-deploy-key <key>  Explicit cloud deploy key for source-env queries.
  --allow-missing-source-env Allow local-only seed generation when no cloud source env exists.
  -h, --help                 Show this help message.
`;

type WorktreeDevOptions = {
  once: boolean;
  enableBranch: boolean;
  forceBootstrap: boolean;
  vitePort: number;
  sourceEnv: string | null;
  sourceDeployKey: string | null;
  allowMissingSourceEnv: boolean;
  showHelp: boolean;
};

type CommandSpec = {
  label: string;
  cwd: string;
  command: string;
  args: string[];
  phase: "always" | "once-bootstrap" | "long-running";
  env?: NodeJS.ProcessEnv;
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
    sourceEnv: readOptionalEnvValue(env.WORKTREE_DEV_SOURCE_ENV),
    sourceDeployKey: readOptionalEnvValue(env.WORKTREE_DEV_SOURCE_DEPLOY_KEY),
    allowMissingSourceEnv: readBooleanEnvValue(env.WORKTREE_DEV_ALLOW_MISSING_SOURCE_ENV),
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
    if (arg === "--allow-missing-source-env") {
      options.allowMissingSourceEnv = true;
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
    if (arg === "--source-env") {
      options.sourceEnv = requireOptionValue(args, index, arg, HELP_TEXT);
      index += 1;
      continue;
    }
    if (arg === "--source-deploy-key") {
      options.sourceDeployKey = requireOptionValue(args, index, arg, HELP_TEXT);
      index += 1;
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

export function buildWorktreeDevSeedEnvArgs(
  options: WorktreeDevOptions,
  mode: "check-prereqs" | "sync",
): string[] {
  const args: string[] = [];
  if (mode === "check-prereqs") {
    args.push("--check-prereqs");
  }
  if (options.allowMissingSourceEnv) {
    args.push("--allow-missing-source-env");
  }
  if (options.sourceEnv) {
    args.push("--source-env", options.sourceEnv);
  }
  return args;
}

/**
 * Preserve the existing make-order semantics: the one-off local bootstrap must
 * finish before env sync and auth seeding can depend on the generated .env.local.
 */
export function buildWorktreeDevCommandPlan(
  options: WorktreeDevOptions,
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): CommandSpec[] {
  const appDir = path.join(repoRoot, "apps", "noter");
  const seedEnv = options.sourceDeployKey
    ? {
        ...env,
        CONVEX_DEPLOY_KEY: options.sourceDeployKey,
      }
    : env;
  const anonymousEnv = {
    ...env,
    CONVEX_AGENT_MODE: "anonymous",
  };

  const plan: CommandSpec[] = [
    {
      label: "stop existing local backend listeners",
      cwd: repoRoot,
      command: process.execPath,
      args: [path.join(repoRoot, "scripts", "killport.ts")],
      phase: "always",
    },
    {
      label: "validate anonymous seed env prerequisites",
      cwd: repoRoot,
      command: process.execPath,
      args: [
        path.join(repoRoot, "scripts", "convex-sync-dev-env.ts"),
        ...buildWorktreeDevSeedEnvArgs(options, "check-prereqs"),
      ],
      env: seedEnv,
      phase: "once-bootstrap",
    },
    {
      label: "bootstrap the current worktree",
      cwd: repoRoot,
      command: process.execPath,
      args: [
        path.join(repoRoot, "scripts", "bootstrap-worktree.ts"),
        ...buildWorktreeDevBootstrapArgs(options),
      ],
      phase: "always",
    },
    {
      label: "bootstrap the anonymous local backend once",
      cwd: appDir,
      command: process.execPath,
      args: [
        path.join(appDir, "scripts", "convex-dev.ts"),
        "--once",
        "--codegen=enable",
        "--tail-logs=disable",
        "--typecheck=disable",
      ],
      env: anonymousEnv,
      phase: "always",
    },
    {
      label: "sync allowlisted seed env values into the local backend",
      cwd: repoRoot,
      command: process.execPath,
      args: [
        path.join(repoRoot, "scripts", "convex-sync-dev-env.ts"),
        ...buildWorktreeDevSeedEnvArgs(options, "sync"),
      ],
      env: seedEnv,
      phase: "once-bootstrap",
    },
    {
      label: "seed the local password-auth development account",
      cwd: repoRoot,
      command: process.execPath,
      args: [path.join(repoRoot, "scripts", "convex-seed-dev-auth.ts")],
      phase: "once-bootstrap",
    },
    {
      label: "refresh anonymous auth keys",
      cwd: appDir,
      command: process.execPath,
      args: [
        path.join(appDir, "scripts", "convex-dev.ts"),
        "--refresh-anon-auth",
        "--once",
        "--codegen=disable",
        "--tail-logs=disable",
        "--typecheck=disable",
      ],
      env: anonymousEnv,
      phase: "once-bootstrap",
    },
  ];

  if (options.once) {
    return plan;
  }

  return [
    ...plan,
    {
      label: "launch the long-running worktree dev server",
      cwd: repoRoot,
      command: PNPM_COMMAND,
      args: buildPrimaryDevArgs([], "dev:raw"),
      env: buildPrimaryDevEnvironment({
        ...anonymousEnv,
        ...LOCAL_WORKTREE_PASSWORD_AUTH_VITE_ENV,
        VITE_PORT: String(options.vitePort),
      }),
      phase: "long-running",
    },
  ];
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
    stdio: "inherit",
  });
  if (result.exitCode !== 0) {
    fail(`${spec.label} failed with exit code ${result.exitCode ?? 1}.`, result.exitCode ?? 1);
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
    console.log("Worktree --once bootstrap already completed; skipping seed/auth setup.");
  } else if (options.forceBootstrap) {
    console.log("Forcing anonymous seed/auth setup.");
  }

  let ranOnceBootstrap = false;
  for (const spec of plan) {
    if (onceBootstrapAlreadyCompleted && spec.phase === "once-bootstrap") {
      continue;
    }
    if (spec.phase === "long-running") {
      if (!onceBootstrapAlreadyCompleted && ranOnceBootstrap) {
        writeOnceBootstrapMarker(repoRoot);
      }
      await runStreamingCommand(spec);
      return;
    }
    runBlockingCommand(spec);
    if (spec.phase === "once-bootstrap") {
      ranOnceBootstrap = true;
    }
  }

  if (!onceBootstrapAlreadyCompleted && ranOnceBootstrap) {
    writeOnceBootstrapMarker(repoRoot);
  }
}

if (isMainModule(import.meta.url)) {
  await runMain(main);
}
