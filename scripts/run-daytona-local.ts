#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { parsePositiveIntegerOption } from "./lib/cliArgs.ts";
import {
  readOptionalEnvValue,
  readPositiveIntegerEnvValue,
} from "./lib/env.ts";
import {
  fail,
  isMainModule,
  resolveRepoRoot,
  runMain,
} from "./lib/scriptRuntime.ts";

const DEFAULT_DAYTONA_VITE_PORT = 5173;
const DEFAULT_DAYTONA_SOURCE_ENV = "apps/noter/.env.daytona-source.local";

type DaytonaLocalOptions = {
  once: boolean;
  showHelp: boolean;
  sourceDeployKey: string | null;
  sourceEnv: string;
  vitePort: number;
};

const HELP_TEXT = `Usage: scripts/run-daytona-local.ts [options]

Start the Daytona-local anonymous bootstrap flow using the package-script
runtime instead of Makefile wrappers.

Options:
  --once                     Run one bootstrap cycle, then exit.
  --source-env <path>        Explicit source env file path.
  --source-deploy-key <key>  Explicit source deploy key.
  --vite-port <port>         Frontend port override. Default: ${DEFAULT_DAYTONA_VITE_PORT}
  -h, --help                 Show this help message.
`;

export function parseDaytonaLocalArgs(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): DaytonaLocalOptions {
  let once = false;
  let showHelp = false;
  let sourceDeployKey =
    readOptionalEnvValue(env.DAYTONA_CONVEX_DEPLOY_KEY) ?? null;
  let sourceEnv =
    readOptionalEnvValue(env.DAYTONA_SOURCE_ENV) ?? DEFAULT_DAYTONA_SOURCE_ENV;
  let vitePort =
    readPositiveIntegerEnvValue(
      env.DAYTONA_VITE_PORT,
      "DAYTONA_VITE_PORT",
      HELP_TEXT,
    ) ?? DEFAULT_DAYTONA_VITE_PORT;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      showHelp = true;
      continue;
    }
    if (arg === "--once") {
      once = true;
      continue;
    }
    if (arg === "--source-env") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        fail(`Missing value for --source-env\n\n${HELP_TEXT}`);
      }
      sourceEnv = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--source-env=")) {
      sourceEnv = arg.slice("--source-env=".length);
      continue;
    }
    if (arg === "--source-deploy-key") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        fail(`Missing value for --source-deploy-key\n\n${HELP_TEXT}`);
      }
      sourceDeployKey = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--source-deploy-key=")) {
      sourceDeployKey = arg.slice("--source-deploy-key=".length);
      continue;
    }
    if (arg === "--vite-port") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        fail(`Missing value for --vite-port\n\n${HELP_TEXT}`);
      }
      vitePort = parsePositiveIntegerOption(value, "--vite-port", HELP_TEXT);
      index += 1;
      continue;
    }
    if (arg.startsWith("--vite-port=")) {
      vitePort = parsePositiveIntegerOption(
        arg.slice("--vite-port=".length),
        "--vite-port",
        HELP_TEXT,
      );
      continue;
    }
    fail(`Unknown argument: ${arg}\n\n${HELP_TEXT}`);
  }

  return {
    once,
    showHelp,
    sourceDeployKey,
    sourceEnv,
    vitePort,
  };
}

export function buildDaytonaAnonArgs(
  options: DaytonaLocalOptions,
  sourceEnvAvailable: boolean,
): string[] {
  const args = ["--no-branch", "--vite-port", String(options.vitePort)];

  if (sourceEnvAvailable) {
    args.push("--source-env", options.sourceEnv);
    if (options.sourceDeployKey !== null) {
      args.push("--source-deploy-key", options.sourceDeployKey);
    }
  } else {
    args.push("--allow-missing-source-env");
  }

  if (options.once) {
    args.push("--once");
  }

  return args;
}

function runBlockingNodeScript(scriptPath: string, args: readonly string[]) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    fail(
      `${path.basename(scriptPath)} failed with exit code ${result.status ?? 1}.`,
      result.status ?? 1,
    );
  }
}

function runStreamingNodeScript(scriptPath: string, args: readonly string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(
        new Error(`${path.basename(scriptPath)} failed: ${error.message}`),
      );
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
      reject(
        new Error(
          `${path.basename(scriptPath)} failed with exit code ${code ?? 1}.`,
        ),
      );
    });
  });
}

async function main(): Promise<void> {
  const options = parseDaytonaLocalArgs(process.argv.slice(2));
  if (options.showHelp) {
    console.log(HELP_TEXT);
    return;
  }

  const repoRoot = resolveRepoRoot();
  const sourceEnvPath = path.resolve(repoRoot, options.sourceEnv);
  const daytonaWriteSourceEnvPath = path.join(
    repoRoot,
    "scripts",
    "daytona-write-source-env.ts",
  );
  const runAnonDevPath = path.join(repoRoot, "scripts", "run-anon-dev.ts");

  runBlockingNodeScript(daytonaWriteSourceEnvPath, [
    "--output",
    sourceEnvPath,
    "--optional",
  ]);

  await runStreamingNodeScript(
    runAnonDevPath,
    buildDaytonaAnonArgs(options, existsSync(sourceEnvPath)),
  );
}

if (isMainModule(import.meta.url)) {
  await runMain(main);
}
