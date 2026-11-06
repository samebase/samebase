#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { generateConvexAuthKeys, generateCredentialKeys } from "./lib/convexAuthKeys.ts";
import { readEnvFile } from "./lib/envFile.ts";
import { resolveRepoRoot } from "./lib/scriptRuntime.ts";
import { samebaseAppFilePath } from "./lib/trackedFilePath.ts";
import path from "node:path";
import {
  listListeningPids,
  parsePort,
  readLocalDeploymentName,
  sleep,
} from "../apps/samebase/scripts/convex-local-utils.ts";

const repoRoot = resolveRepoRoot();
const appDir = path.join(repoRoot, "apps", "samebase");
const localEnvPath = path.join(appDir, ".env.local");
const versionModulePath = path.join(appDir, ".convex-hosting", "version.js");
const serverBuildPath = path.join(appDir, "dist", "server", "server.js");
const FUNCTIONS_READY_MARKER = "Convex functions ready!";
/**
The Convex project of samebase.com. Each folder gets its own logged-in local deployment in it, which
imports the project's default variables for development: the GitHub App, the GitHub owner of the
seeded organization, and the off values of the six identity hub variables.
*/
const LOCAL_DEPLOYMENT_SELECTOR = "nicu:samebase-com:local";
// A deploy key in the shell points the Convex CLI at its own deployment, before the selection in
// .env.local.
const localConvexEnv: NodeJS.ProcessEnv = { ...process.env };
delete localConvexEnv.CONVEX_DEPLOY_KEY;

ensureLoggedInLocalDeployment();

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
  backendPort = await waitForOwnBackend();
  if (backendPort === null) {
    exitWithError(`The local backend of ${appDir} did not start`);
  }

  // convex/convex.config.ts requires the signing keys of the Convex Auth component, so they exist
  // before the deploy below pushes. A worktree backend keeps the keys it already has.
  if (readLocalConvexEnv("AUTH_PRIVATE_KEY") === null || readLocalConvexEnv("AUTH_JWKS") === null) {
    for (const [name, value] of Object.entries(generateConvexAuthKeys())) {
      setLocalConvexEnv(name, value);
    }
  }
  // convex/convex.config.ts requires the provider credential key ring. A worktree backend keeps the
  // ring it already has: its credential rows are sealed under it.
  if (readLocalConvexEnv("CREDENTIAL_KEYS") === null) {
    for (const [name, value] of Object.entries(generateCredentialKeys())) {
      setLocalConvexEnv(name, value);
    }
  }
  // The identity hub clients come later, from the Alchemy stage that `pnpm run dev` runs once the
  // long-running backend answers. Until then the off values of the project's defaults hold.

  // convex/http.ts imports .convex-hosting/version.js, which only a deploy writes, and the server
  // build dist/server/server.js, which only a build writes, so the first push of a fresh worktree
  // fails. One `deploy --dev` builds the site, uploads it to the backend above, writes both files,
  // and pushes with its own `convex run --push`. On macOS and Linux the
  // watcher never sees the new file, so that push is the one to wait for. On Windows the watcher
  // re-pushes as well, the two pushes race, and the deploy's later `convex run` calls then
  // sometimes abort inside the Convex CLI after the push landed; the worktree needs the push, not
  // the upload, so a failed deploy is fatal only when the functions never become ready. `node
  // --run` puts node_modules/.bin on PATH and appends the arguments to the script's last command.
  if (existsSync(versionModulePath) && existsSync(serverBuildPath)) {
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
  if (result.status !== 0) {
    exitWithError(`Failed to read ${name} from local Convex env`);
  }
  // The CLI exits 0 with an empty stdout when the variable is absent. A failed read must not count
  // as absence: the caller would then generate new keys over the ones the backend's rows need.
  const value = result.stdout.trim();
  return value.length > 0 ? value : null;
}

/**
 * Gives this folder a logged-in local deployment when it has none or an anonymous one. The
 * anonymous folder goes with its data: no worktree's local data is kept. `--select` writes the new
 * deployment to .env.local, and a cloud deploy key there would win over it, so it goes first.
 */
function ensureLoggedInLocalDeployment(): void {
  const name = readLocalDeploymentName(appDir);
  if (name?.startsWith("local-")) {
    return;
  }
  if (name !== null) {
    console.log(`Deleting the anonymous local deployment ${name} of this folder and its data.`);
  }
  rmSync(path.join(appDir, ".convex", "local", "default"), { recursive: true, force: true });
  if (existsSync(localEnvPath)) {
    const lines = readFileSync(localEnvPath, "utf8").split(/\r?\n/);
    writeFileSync(
      localEnvPath,
      lines.filter((line) => !line.trim().startsWith("CONVEX_DEPLOY_KEY=")).join("\n"),
      "utf8",
    );
  }
  const result = spawnSync(
    "npx",
    ["convex", "deployment", "create", LOCAL_DEPLOYMENT_SELECTOR, "--select"],
    { cwd: appDir, env: localConvexEnv, stdio: ["ignore", "inherit", "inherit"] },
  );
  if (result.status !== 0) {
    console.error(
      `Failed to create a local deployment of ${LOCAL_DEPLOYMENT_SELECTOR}. Log in with \`npx convex login\`.`,
    );
    process.exit(1);
  }
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

/**
 * The port of this folder's backend once it answers with the folder's deployment name. Each try
 * reads .env.local again: `deployment create` writes the default port, and `convex dev` then
 * writes the fixed port of the folder, where another folder's backend can never answer.
 */
async function waitForOwnBackend(): Promise<number | null> {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (backend.exitCode !== null || backend.signalCode !== null) {
      return null;
    }
    const localEnv = readEnvFile(localEnvPath);
    const port = localEnv === null ? null : resolveBackendPort(localEnv.vars);
    if (port !== null) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/instance_name`, {
          signal: AbortSignal.timeout(500),
        });
        if (response.ok && (await response.text()).trim() === readLocalDeploymentName(appDir)) {
          return port;
        }
      } catch {
        // ignore and retry
      }
    }
    await sleep(250);
  }
  return null;
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
