#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { generateConvexAuthKeys } from "./lib/convexAuthKeys.ts";
import { readEnvFile, type EnvFile } from "./lib/envFile.ts";
import { resolveRepoRoot } from "./lib/scriptRuntime.ts";
import { samebaseAppFilePath, trackedFilePath } from "./lib/trackedFilePath.ts";
import path from "node:path";
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
const versionModulePath = path.join(appDir, ".convex-hosting", "version.js");
const FUNCTIONS_READY_MARKER = "Convex functions ready!";
const localConvexEnv: NodeJS.ProcessEnv = {
  ...process.env,
  CONVEX_AGENT_MODE: "anonymous",
};
// Source deploy keys only authorize env sync. Local Convex commands must never receive them.
delete localConvexEnv.CONVEX_DEPLOY_KEY;
delete localConvexEnv.WORKTREE_DEV_SOURCE_DEPLOY_KEY;

let functionsReady = false;
let backendOutputTail = "";

const backend = spawn(
  "node",
  [
    samebaseAppFilePath("scripts/convex-dev.ts"),
    "--tail-logs=disable",
    "--typecheck=disable",
    "--codegen=enable",
  ],
  {
    cwd: appDir,
    env: localConvexEnv,
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
let backendPort: number | null = null;
try {
  const localEnv = await waitForLocalEnv();
  if (localEnv === null) {
    exitWithError(`Local backend did not write ${localEnvPath}`);
  }
  backendPort = resolveBackendPort(localEnv.vars);
  if (backendPort === null) {
    exitWithError(`Local env file does not contain VITE_CONVEX_URL or CONVEX_URL: ${localEnvPath}`);
  }

  const ready = await waitForBackend(backendPort);
  if (!ready) {
    exitWithError(`Local backend did not start on port ${backendPort}`);
  }

  const syncResult = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, trackedFilePath("scripts/convex-sync-dev-env.ts")),
      ...process.argv.slice(2),
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );
  if (syncResult.status !== 0) {
    exitWithError("Failed to sync the worktree seed environment");
  }

  const seedEnv = readEnvFile(seedEnvPath);
  if (seedEnv === null) {
    exitWithError(`Missing required worktree seed env file: ${seedEnvPath}`);
  }
  const seedEntries = Object.entries(seedEnv.vars).filter(([name]) =>
    WORKTREE_ENV_ALLOWLIST.has(name),
  );

  for (const [name, value] of seedEntries) {
    setLocalConvexEnv(name, value);
  }
  // convex/convex.config.ts requires the signing keys of the Convex Auth component, so they exist
  // before the deploy below pushes. A worktree backend keeps the keys it already has.
  if (readLocalConvexEnv("AUTH_PRIVATE_KEY") === null || readLocalConvexEnv("AUTH_JWKS") === null) {
    for (const [name, value] of Object.entries(generateConvexAuthKeys())) {
      setLocalConvexEnv(name, value);
    }
  }

  // convex/http.ts imports .convex-hosting/version.js, which only a deploy writes, so the first
  // push of a fresh worktree fails. One `deploy --dev` builds the site, uploads it to the backend
  // above, writes the file, and pushes with its own `convex run --push`. On macOS and Linux the
  // watcher never sees the new file, so that push is the one to wait for. On Windows the watcher
  // re-pushes as well, the two pushes race, and the deploy's later `convex run` calls then
  // sometimes abort inside the Convex CLI after the push landed; the worktree needs the push, not
  // the upload, so a failed deploy is fatal only when the functions never become ready. `node
  // --run` puts node_modules/.bin on PATH and appends the arguments to the script's last command.
  if (existsSync(versionModulePath)) {
    if (!(await waitForFunctions())) {
      exitWithError("Local Convex functions did not become ready after seed environment setup");
    }
  } else {
    const deployResult = spawnSync(process.execPath, ["--run", "deploy", "--", "--dev"], {
      cwd: appDir,
      env: localConvexEnv,
      stdio: "inherit",
    });
    if (deployResult.status !== 0) {
      console.warn(
        "The site deploy to the local backend failed; waiting for the watcher's own push.",
      );
      if (!(await waitForFunctions())) {
        exitWithError("Failed to deploy the site to the local backend");
      }
    }
  }

  const runResult = spawnSync(
    process.execPath,
    [samebaseAppFilePath("scripts/seed-local-password-account.ts")],
    { cwd: appDir, env: localConvexEnv, stdio: "inherit" },
  );
  if (runResult.status !== 0) {
    exitWithError("Failed to seed the local password account");
  }
} catch (error) {
  exitCode = 1;
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
} finally {
  await waitForBackendExit();
  if (backendPort !== null) {
    await terminateListeningPidsOnPort(backendPort);
  }
}

process.exitCode = exitCode;

function readLocalConvexEnv(name: string): string | null {
  const result = spawnSync("npx", ["convex", "env", "get", name, "--env-file", localEnvPath], {
    cwd: appDir,
    env: localConvexEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const value = result.status === 0 ? result.stdout.trim() : "";
  return value.length > 0 ? value : null;
}

function setLocalConvexEnv(name: string, value: string): void {
  const result = spawnSync("npx", ["convex", "env", "set", name, "--env-file", localEnvPath], {
    cwd: appDir,
    env: localConvexEnv,
    input: value,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) {
    exitWithError(`Failed to set ${name} in local Convex env`);
  }
}

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

async function waitForLocalEnv(): Promise<EnvFile | null> {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (backend.exitCode !== null || backend.signalCode !== null) {
      return null;
    }
    const localEnv = readEnvFile(localEnvPath);
    if (localEnv !== null && resolveBackendPort(localEnv.vars) !== null) {
      return localEnv;
    }
    await sleep(250);
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
      if (response.ok) {
        return true;
      }
    } catch {
      // ignore and retry
    }
    await sleep(250);
  }
  return false;
}

async function waitForFunctions(): Promise<boolean> {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (functionsReady) {
      return true;
    }
    if (backend.exitCode !== null || backend.signalCode !== null) {
      return false;
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
    backendOutputTail = `${backendOutputTail}${chunk}`.slice(-2048);
    if (backendOutputTail.includes(FUNCTIONS_READY_MARKER)) {
      functionsReady = true;
    }
  });
}
