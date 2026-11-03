#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { generateConvexAuthKeys, generateCredentialKeys } from "./lib/convexAuthKeys.ts";
import { readEnvFile, type EnvFile } from "./lib/envFile.ts";
import { resolveRepoRoot } from "./lib/scriptRuntime.ts";
import { samebaseAppFilePath } from "./lib/trackedFilePath.ts";
import path from "node:path";
import {
  listListeningPids,
  parsePort,
  sleep,
} from "../apps/samebase/scripts/convex-local-utils.ts";

const repoRoot = resolveRepoRoot();
const appDir = path.join(repoRoot, "apps", "samebase");
const localEnvPath = path.join(appDir, ".env.local");
const versionModulePath = path.join(appDir, ".convex-hosting", "version.js");
const serverBuildPath = path.join(appDir, "dist", "server", "server.js");
const FUNCTIONS_READY_MARKER = "Convex functions ready!";
/**
The development deployment of the project, the personal one of the Convex CLI login. It holds the
GitHub App that convex/convex.config.ts requires, and the GitHub owner of the seeded organization.
*/
const DEVELOPMENT_DEPLOYMENT = "nicu:samebase-com:dev";
const DEVELOPMENT_DEPLOYMENT_VARIABLES = [
  "GITHUB_APP_CLIENT_ID",
  "GITHUB_APP_CLIENT_SECRET",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_SLUG",
  "DEV_SEED_GITHUB_INSTALLATION_ID",
  "DEV_SEED_GITHUB_OWNER_ID",
  "DEV_SEED_GITHUB_OWNER_LOGIN",
  "DEV_SEED_GITHUB_OWNER_TYPE",
] as const;
// A deploy key in the shell points the Convex CLI at its own deployment, before the anonymous mode
// and before `--deployment`.
const shellEnv: NodeJS.ProcessEnv = { ...process.env };
delete shellEnv.CONVEX_DEPLOY_KEY;
const localConvexEnv: NodeJS.ProcessEnv = { ...shellEnv, CONVEX_AGENT_MODE: "anonymous" };

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

  for (const name of DEVELOPMENT_DEPLOYMENT_VARIABLES) {
    setLocalConvexEnv(name, readDevelopmentConvexEnv(name));
  }
  // convex/deploymentProfile.ts reads it as the local_worktree profile, which seeds the password
  // account below. The CI bootstrap sets the same value.
  setLocalConvexEnv("CONVEX_AGENT_MODE", "anonymous");
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
  // A backend set up before worktrees had hub clients holds the CI placeholders. Convex refuses to
  // remove them, since convex/convex.config.ts requires the variables, and the registration below
  // keeps existing values, so only a new backend gets clients.
  if (readLocalConvexEnv("HUB_CLIENT_ID") === "no-hub") {
    console.warn(
      "This worktree's local backend has no identity hub client, so GitHub sign-in and the Connect buttons fail. To get them, delete apps/samebase/.convex/local, which holds the local data, and run `pnpm run dev --once`.",
    );
  }
  // Two clients of the identity hub on this backend's own site URL: one signs in with GitHub and
  // Google, one connects GitHub, Convex, and Cloudflare. A backend that has a client keeps it, so
  // each worktree registers once. The Convex CLI login reaches the hub.
  for (const script of ["hub:client", "hub:resource-client"]) {
    const result = spawnSync(process.execPath, ["--run", script], {
      cwd: appDir,
      env: localConvexEnv,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      exitWithError(`Failed to register the local backend with the identity hub (${script})`);
    }
  }

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

function readDevelopmentConvexEnv(name: string): string {
  const result = spawnSync(
    "npx",
    ["convex", "env", "get", name, "--deployment", DEVELOPMENT_DEPLOYMENT],
    { cwd: appDir, env: shellEnv, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  if (result.status !== 0) {
    exitWithError(
      `Failed to read ${name} from ${DEVELOPMENT_DEPLOYMENT}. Log in with \`npx convex login\`.`,
    );
  }
  // The CLI ends the value with a newline, and answers an empty line when the variable is absent.
  const value = result.stdout.replace(/\r?\n$/, "");
  if (value.length === 0) {
    exitWithError(`${DEVELOPMENT_DEPLOYMENT} has no ${name}`);
  }
  return value;
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
