#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateConvexAuthKeys } from "./lib/convexAuthKeys.ts";
import { samebaseAppFilePath } from "./lib/trackedFilePath.ts";

const samebaseAppDirectory = path.join("apps", "samebase");
const convexCliPath = path.join("node_modules", "convex", "bin", "main.js");
const seedLocalPasswordAccountScriptPath = samebaseAppFilePath(
  "scripts/seed-local-password-account.ts",
);
const convexBootstrapLogPath = path.join(tmpdir(), "convex-bootstrap.log");
const envLocalPath = path.join("apps", "samebase", ".env.local");
const versionModulePath = path.join(samebaseAppDirectory, ".convex-hosting", "version.js");
const serverBuildPath = path.join(samebaseAppDirectory, "dist", "server", "server.js");
const convexEnvSetMaxAttempts = 4;
const convexEnvLocalWaitTimeoutMs = 300_000;
const keepBackendRunning = process.argv.slice(2).includes("--keep-running");

await main();

async function main(): Promise<void> {
  // Node 24 only accepts inherited fd numbers here, not a WriteStream object.
  const logFileDescriptor = openSync(convexBootstrapLogPath, "w");
  const bootstrapProcess = spawn(
    process.execPath,
    [samebaseAppFilePath("scripts/convex-dev.ts"), "--typecheck=disable", "--tail-logs=disable"],
    {
      cwd: samebaseAppDirectory,
      env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" },
      stdio: ["ignore", logFileDescriptor, logFileDescriptor],
    },
  );

  try {
    await sleep(2_000);
    if (hasChildExited(bootstrapProcess)) {
      await failWithLog("Convex bootstrap exited early:");
    }

    // CI checks and browser jobs both rely on the same local anonymous Convex bootstrap.
    await waitFor(
      async () => {
        const fileContents = await readOptionalFile(envLocalPath);
        if (!fileContents) {
          return false;
        }
        return (
          fileContents.includes("CONVEX_DEPLOYMENT=") && fileContents.includes("VITE_CONVEX_URL=")
        );
      },
      convexEnvLocalWaitTimeoutMs,
      "Timed out waiting for apps/samebase/.env.local to include Convex local env values.",
      bootstrapProcess,
    );
    await waitFor(
      async () => {
        const convexClientUrl = await readGeneratedEnvValue("VITE_CONVEX_URL");
        if (!convexClientUrl) {
          return false;
        }
        const convexInstanceUrl = new URL("instance_name", `${convexClientUrl}/`).toString();
        try {
          const response = await fetch(convexInstanceUrl);
          return response.ok;
        } catch {
          return false;
        }
      },
      90_000,
      "Timed out waiting for the local Convex instance to become reachable.",
      bootstrapProcess,
    );

    for (const [key, value] of [
      ...Object.entries(generateConvexAuthKeys()),
      ["AUTH_GITHUB_CLIENT_ID", "ci-placeholder"],
      ["AUTH_GITHUB_CLIENT_SECRET", "ci-placeholder"],
      ["AUTH_GOOGLE_CLIENT_ID", "ci-placeholder"],
      ["AUTH_GOOGLE_CLIENT_SECRET", "ci-placeholder"],
      ["CONVEX_AGENT_MODE", "anonymous"],
      ["GITHUB_APP_CLIENT_ID", "ci-placeholder"],
      ["GITHUB_APP_CLIENT_SECRET", "ci-placeholder"],
      ["GITHUB_APP_ID", "1"],
      ["GITHUB_APP_OAUTH_CALLBACK_URL", "https://example.com/github/callback"],
      ["GITHUB_APP_PRIVATE_KEY", "ci-placeholder"],
      ["GITHUB_APP_SLUG", "samebase-ci"],
    ] as const) {
      await runConvexEnvSet(key, value);
    }

    // convex/http.ts imports .convex-hosting/version.js, which only a deploy writes, and the server
    // build dist/server/server.js, so the first push of a fresh checkout fails. One `deploy --dev`
    // builds the site, uploads it to the running backend, writes both files, and pushes. A checkout
    // that has both files waits for the watcher's own push.
    if (existsSync(versionModulePath) && existsSync(serverBuildPath)) {
      await waitForFunctionsReady(bootstrapProcess);
    } else {
      await deployLocalSite(bootstrapProcess);
    }
    runLocalPasswordAccountSeed();
  } catch (error) {
    await stopProcess(bootstrapProcess);
    await printLogTail();
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }
    process.exit(1);
  } finally {
    closeSync(logFileDescriptor);
  }

  if (keepBackendRunning) {
    bootstrapProcess.unref();
  } else {
    await stopProcess(bootstrapProcess);
  }
  await printLogTail();
}

/**
 * Retries transient Convex env-set failures only, preserving fail-fast behavior
 * for fatal errors and the idempotent single-key write contract.
 */
async function runConvexEnvSet(key: string, value: string): Promise<void> {
  const args = [convexCliPath, "env", "set", "--", key, value];

  for (let attempt = 1; attempt <= convexEnvSetMaxAttempts; attempt += 1) {
    const result = spawnSync(process.execPath, args, {
      cwd: samebaseAppDirectory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.status === 0) {
      writeProcessOutput(result.stdout, result.stderr);
      return;
    }

    const output = `${result.stdout}\n${result.stderr}`;
    if (attempt < convexEnvSetMaxAttempts && isTransientConvexEnvSetFailure(output)) {
      console.warn(
        `Retrying convex env set for ${key} after transient local backend conflict (${attempt}/${convexEnvSetMaxAttempts}).`,
      );
      await sleep(attempt * 1_000);
      continue;
    }

    writeProcessOutput(result.stdout, result.stderr);
    throw new Error(`convex env set ${key} failed with exit code ${result.status ?? "unknown"}.`);
  }

  throw new Error(`convex env set ${key} retry loop ended unexpectedly.`);
}

async function waitForFunctionsReady(bootstrapProcess: ReturnType<typeof spawn>): Promise<void> {
  await waitFor(
    async () =>
      (await readOptionalFile(convexBootstrapLogPath))?.includes("Convex functions ready!") ??
      false,
    180_000,
    "Timed out waiting for Convex functions to become ready.",
    bootstrapProcess,
  );
}

/**
 * `node --run` puts node_modules/.bin on PATH and appends the arguments to the script's last
 * command. The deploy pushes with its own `convex run --push`. On Linux the watcher never sees the
 * new version file, so that push is the one CI waits for. On Windows the watcher re-pushes as well,
 * the two pushes race, and the deploy's later `convex run` calls then sometimes abort inside the
 * Convex CLI after the push landed. CI needs the push, not the upload, so a failed deploy is fatal
 * only when the functions never become ready.
 */
async function deployLocalSite(bootstrapProcess: ReturnType<typeof spawn>): Promise<void> {
  const result = spawnSync(process.execPath, ["--run", "deploy", "--", "--dev"], {
    cwd: samebaseAppDirectory,
    env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" },
    stdio: "inherit",
  });
  if (result.status === 0) {
    return;
  }
  const failure = `The site deploy to the local backend failed with exit code ${result.status ?? "unknown"}`;
  console.warn(`${failure}; waiting for the watcher's own push.`);
  try {
    await waitForFunctionsReady(bootstrapProcess);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${failure} and the functions never became ready: ${reason}`);
  }
}

function runLocalPasswordAccountSeed(): void {
  const result = spawnSync(process.execPath, [seedLocalPasswordAccountScriptPath], {
    cwd: samebaseAppDirectory,
    encoding: "utf8",
    env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  writeProcessOutput(result.stdout, result.stderr);
  if (result.status !== 0) {
    throw new Error(
      `Local password account seed failed with exit code ${result.status ?? "unknown"}.`,
    );
  }
}

function isTransientConvexEnvSetFailure(output: string): boolean {
  return (
    output.includes("OptimisticConcurrencyControlFailure") ||
    output.includes("503 Service Unavailable")
  );
}

function writeProcessOutput(stdout: string, stderr: string): void {
  if (stdout.length > 0) {
    process.stdout.write(stdout);
  }
  if (stderr.length > 0) {
    process.stderr.write(stderr);
  }
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  failureMessage: string,
  childProcess: ReturnType<typeof spawn>,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    if (hasChildExited(childProcess)) {
      throw new Error(`Convex bootstrap exited before readiness: ${failureMessage}`);
    }
    await sleep(1_000);
  }
  throw new Error(failureMessage);
}

function hasChildExited(childProcess: ReturnType<typeof spawn>): boolean {
  return childProcess.exitCode !== null || childProcess.signalCode !== null;
}

async function stopProcess(childProcess: ReturnType<typeof spawn>): Promise<void> {
  if (hasChildExited(childProcess)) {
    return;
  }

  // CI should always make forward progress even if Convex ignores SIGTERM.
  childProcess.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    let resolved = false;
    let killTimeout: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      if (killTimeout !== undefined) {
        clearTimeout(killTimeout);
      }
      resolve();
    };

    childProcess.once("exit", () => finish());
    killTimeout = setTimeout(() => {
      if (childProcess.exitCode === null) {
        childProcess.kill("SIGKILL");
      }
    }, 5_000);
  });
}

async function readOptionalFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function readGeneratedEnvValue(key: string): Promise<string | null> {
  const fileContents = await readOptionalFile(envLocalPath);
  if (!fileContents) {
    return null;
  }

  const prefix = `${key}=`;
  for (const line of fileContents.split("\n")) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0 || trimmedLine.startsWith("#")) {
      continue;
    }
    if (!trimmedLine.startsWith(prefix)) {
      continue;
    }

    return trimmedLine
      .slice(prefix.length)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }

  return null;
}

async function printLogTail(): Promise<void> {
  const logContents = await readOptionalFile(convexBootstrapLogPath);
  if (!logContents) {
    return;
  }

  const tail = logContents.split("\n").slice(-80).join("\n").trim();
  if (tail.length > 0) {
    console.log(tail);
  }
}

async function failWithLog(message: string): Promise<never> {
  console.error(message);
  await printLogTail();
  process.exit(1);
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
