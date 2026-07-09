#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

import { readEnvFile } from "./lib/envFile.ts";
import { resolveRepoRoot } from "./lib/scriptRuntime.ts";
import { WORKTREE_ENV_ALLOWLIST } from "./worktree-env-allowlist.ts";
import {
  listListeningPids,
  parsePort,
  sleep,
} from "../apps/samebase/scripts/convex-local-utils.ts";

const repoRoot = resolveRepoRoot();
const appDir = path.join(repoRoot, "apps", "samebase");
const localEnvPath = path.join(appDir, ".env.local");
const seedEnvPath = path.join(appDir, ".env.anon-seed.local");

const localEnv = readEnvFile(localEnvPath);
if (!localEnv) {
  exitWithError(`Local env file not found: ${localEnvPath}`);
}

const seedEnv = readEnvFile(seedEnvPath);
if (!seedEnv) {
  exitWithError(
    `Missing required worktree seed env file: ${seedEnvPath}\n` +
      `Worktree bootstrap requires ${seedEnvPath} before auth seeding can continue.\n` +
      "Run `node ./scripts/convex-sync-dev-env.ts` to generate it, then retry `pnpm dev:worktree`.",
  );
}

const backendPort = resolveBackendPort(localEnv.vars);
if (!backendPort) {
  exitWithError(`Local env file does not contain VITE_CONVEX_URL or CONVEX_URL: ${localEnvPath}`);
}

const seedEntries = Object.entries(seedEnv.vars).filter(([name]) =>
  WORKTREE_ENV_ALLOWLIST.has(name),
);
const BACKEND_READY_MARKERS = ["Convex functions ready!", "Preparing to watch files..."];

let backendReady = false;
let backendOutputTail = "";

const backend = spawn(
  "node",
  ["scripts/convex-dev.ts", "--tail-logs=disable", "--typecheck=disable", "--codegen=disable"],
  {
    cwd: appDir,
    env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

attachBackendStream(backend.stdout, process.stdout);
attachBackendStream(backend.stderr, process.stderr);

const waitForBackendExit = async () => {
  if (backend.exitCode !== null || backend.signalCode !== null) {
    return;
  }
  backend.kill("SIGTERM");
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (backend.exitCode !== null || backend.signalCode !== null) {
      return;
    }
    await sleep(100);
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (backend.exitCode === null && backend.signalCode === null) {
    backend.kill("SIGKILL");
  }
};

const terminateListeningPidsOnPort = async (port: number): Promise<void> => {
  const toPid = (value: string): number | null => {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  };

  const killPids = (pids: string[], signal: NodeJS.Signals) => {
    for (const pidString of pids) {
      const pid = toPid(pidString);
      if (pid === null) continue;
      try {
        process.kill(pid, signal);
      } catch {
        // ignore
      }
    }
  };

  let pids = listListeningPids(port);
  if (pids.length === 0) {
    return;
  }

  // convex dev can leave behind the underlying `convex-local` process if the
  // node wrapper is terminated abruptly. Ensure we leave the port clean for
  // subsequent `convex dev` invocations in `pnpm dev:worktree`.
  killPids(pids, "SIGTERM");

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await sleep(100);
    pids = listListeningPids(port);
    if (pids.length === 0) {
      return;
    }
  }

  killPids(pids, "SIGKILL");
};

let exitCode = 0;
try {
  const ready = await waitForBackend(backendPort);
  if (!ready) {
    exitWithError(`Local backend did not start on port ${backendPort}`);
  }

  for (const [name, value] of seedEntries) {
    const result = spawnSync("npx", ["convex", "env", "set", name, "--env-file", localEnvPath], {
      cwd: appDir,
      input: value,
      encoding: "utf8",
      stdio: ["pipe", "inherit", "inherit"],
    });
    if (result.status !== 0) {
      exitWithError(`Failed to set ${name} in local Convex env`);
    }
  }

  const runResult = spawnSync(
    "npx",
    [
      "convex",
      "run",
      "devAuth:seedPasswordAccount",
      "--env-file",
      localEnvPath,
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
    ],
    { cwd: appDir, stdio: "inherit" },
  );
  if (runResult.status !== 0) {
    exitWithError("Failed to run devAuth:seedPasswordAccount");
  }
} catch (error) {
  exitCode = 1;
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
} finally {
  await waitForBackendExit();
  await terminateListeningPidsOnPort(backendPort);
}

process.exit(exitCode);

function resolveBackendPort(vars: Record<string, string | undefined>): number | null {
  for (const key of ["CONVEX_URL", "VITE_CONVEX_URL"]) {
    const url = vars[key];
    if (typeof url !== "string" || url.trim().length === 0) {
      continue;
    }
    const port = parsePort(url);
    if (port !== null) {
      return port;
    }
  }
  return null;
}

async function waitForBackend(port: number): Promise<boolean> {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (backend.exitCode !== null || backend.signalCode !== null) {
      return false;
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/instance_name`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok && backendReady) {
        return true;
      }
    } catch {
      // ignore and retry
    }
    await sleep(250);
  }
  return false;
}

function exitWithError(message: string): never {
  throw new Error(message);
}

function attachBackendStream(
  stream: import("node:stream").Readable | null,
  target: NodeJS.WriteStream,
): void {
  if (!stream) {
    return;
  }

  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    if (typeof chunk !== "string") {
      return;
    }
    target.write(chunk);
    if (backendReady) {
      return;
    }

    backendOutputTail = `${backendOutputTail}${chunk}`.slice(-2048);
    if (BACKEND_READY_MARKERS.some((marker) => backendOutputTail.includes(marker))) {
      backendReady = true;
    }
  });
}
