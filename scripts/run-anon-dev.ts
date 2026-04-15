#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

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
import {
  fail,
  isMainModule,
  resolveRepoRoot,
  runMain,
} from "./lib/scriptRuntime.ts";

const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const DEFAULT_ANON_VITE_PORT = 5174;

const HELP_TEXT = `Usage: scripts/run-anon-dev.ts [options]

Bootstrap the anonymous local worktree flow, then optionally launch the
long-running frontend and backend dev processes.

Options:
  --once                     Bootstrap and seed the anonymous local backend, then exit.
  --no-branch                Skip detached-HEAD branch creation during bootstrap.
  --vite-port <port>         Frontend port for the long-running dev server.
                             Default: ${DEFAULT_ANON_VITE_PORT}
  --source-env <path>        Explicit cloud dev source env file for local seed generation.
  --source-deploy-key <key>  Explicit cloud deploy key for source-env queries.
  --allow-missing-source-env Allow local-only seed generation when no cloud source env exists.
  -h, --help                 Show this help message.
`;

type AnonOptions = {
  once: boolean;
  enableBranch: boolean;
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
  env?: NodeJS.ProcessEnv;
  longRunning?: boolean;
};

function readDefaultVitePort(env: NodeJS.ProcessEnv): number {
  return (
    readPositiveIntegerEnvValue(
      env.ANON_VITE_PORT,
      "ANON_VITE_PORT",
      HELP_TEXT,
    ) ?? DEFAULT_ANON_VITE_PORT
  );
}

export function parseAnonArgs(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): AnonOptions {
  const options: AnonOptions = {
    once: false,
    enableBranch: !readBooleanEnvValue(env.ANON_NO_BRANCH),
    vitePort: readDefaultVitePort(env),
    sourceEnv: readOptionalEnvValue(env.ANON_SOURCE_ENV),
    sourceDeployKey: readOptionalEnvValue(env.ANON_SOURCE_DEPLOY_KEY),
    allowMissingSourceEnv: readBooleanEnvValue(
      env.ANON_ALLOW_MISSING_SOURCE_ENV,
    ),
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

export function buildAnonBootstrapArgs(options: AnonOptions): string[] {
  const args = ["--anon"];
  if (!options.enableBranch) {
    args.push("--no-branch");
  }
  return args;
}

export function buildAnonSeedEnvArgs(
  options: AnonOptions,
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
export function buildAnonCommandPlan(
  options: AnonOptions,
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
    },
    {
      label: "validate anonymous seed env prerequisites",
      cwd: repoRoot,
      command: process.execPath,
      args: [
        path.join(repoRoot, "scripts", "convex-sync-dev-env.ts"),
        ...buildAnonSeedEnvArgs(options, "check-prereqs"),
      ],
      env: seedEnv,
    },
    {
      label: "bootstrap the current worktree",
      cwd: repoRoot,
      command: process.execPath,
      args: [
        path.join(repoRoot, "scripts", "bootstrap-worktree.ts"),
        ...buildAnonBootstrapArgs(options),
      ],
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
    },
    {
      label: "sync allowlisted seed env values into the local backend",
      cwd: repoRoot,
      command: process.execPath,
      args: [
        path.join(repoRoot, "scripts", "convex-sync-dev-env.ts"),
        ...buildAnonSeedEnvArgs(options, "sync"),
      ],
      env: seedEnv,
    },
    {
      label: "seed the local password-auth development account",
      cwd: repoRoot,
      command: process.execPath,
      args: [path.join(repoRoot, "scripts", "convex-seed-dev-auth.ts")],
    },
    {
      label: "refresh anonymous auth keys",
      cwd: appDir,
      command: process.execPath,
      args: [
        path.join(appDir, "scripts", "convex-dev.ts"),
        "--refresh-anon-auth",
        "--codegen=disable",
        "--tail-logs=disable",
        "--typecheck=disable",
      ],
      env: anonymousEnv,
    },
  ];

  if (options.once) {
    return plan;
  }

  return [
    ...plan,
    {
      label: "launch the long-running anonymous dev server",
      cwd: repoRoot,
      command: PNPM_COMMAND,
      args: ["dev"],
      env: {
        ...anonymousEnv,
        VITE_PORT: String(options.vitePort),
      },
      longRunning: true,
    },
  ];
}

function runBlockingCommand(spec: CommandSpec): void {
  const result = spawnSync(spec.command, spec.args, {
    cwd: spec.cwd,
    env: spec.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    fail(
      `${spec.label} failed with exit code ${result.status ?? 1}.`,
      result.status ?? 1,
    );
  }
}

function runStreamingCommand(spec: CommandSpec): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(new Error(`${spec.label} failed: ${error.message}`));
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${spec.label} failed with exit code ${code ?? 1}.`));
    });
  });
}

async function main(): Promise<void> {
  const options = parseAnonArgs(process.argv.slice(2));
  if (options.showHelp) {
    console.log(HELP_TEXT);
    return;
  }

  const repoRoot = resolveRepoRoot();
  const plan = buildAnonCommandPlan(options, repoRoot);
  for (const spec of plan) {
    if (spec.longRunning) {
      await runStreamingCommand(spec);
      return;
    }
    runBlockingCommand(spec);
  }
}

if (isMainModule(import.meta.url)) {
  await runMain(main);
}
