#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const convexBootstrapLogPath = path.join(tmpdir(), "convex-bootstrap.log");
const envLocalPath = path.join("apps", "noter", ".env.local");
const convexEnvSetMaxAttempts = 4;

await main();

async function main(): Promise<void> {
  // Node 24 only accepts inherited fd numbers here, not a WriteStream object.
  const logFileDescriptor = openSync(convexBootstrapLogPath, "w");
  const bootstrapProcess = spawn(
    PNPM_COMMAND,
    [
      "--filter",
      "noter",
      "exec",
      "convex",
      "dev",
      "--until-success",
      "--typecheck=disable",
      "--tail-logs=disable",
    ],
    {
      env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" },
      stdio: ["ignore", logFileDescriptor, logFileDescriptor],
    },
  );

  try {
    await sleep(2_000);
    if (bootstrapProcess.exitCode !== null) {
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
          fileContents.includes("CONVEX_DEPLOYMENT=") &&
          fileContents.includes("VITE_CONVEX_URL=")
        );
      },
      60_000,
      "Timed out waiting for apps/noter/.env.local to include Convex local env values.",
    );
    await waitFor(
      async () => {
        const convexClientUrl = await readGeneratedEnvValue("VITE_CONVEX_URL");
        if (!convexClientUrl) {
          return false;
        }
        const convexInstanceUrl = new URL(
          "instance_name",
          `${convexClientUrl}/`,
        ).toString();
        try {
          const response = await fetch(convexInstanceUrl);
          return response.ok;
        } catch {
          return false;
        }
      },
      90_000,
      "Timed out waiting for the local Convex instance to become reachable.",
    );

    for (const [key, value] of [
      ["PROVIDER_GITHUB_OAUTH_CLIENT_ID", "ci-placeholder"],
      ["PROVIDER_GITHUB_OAUTH_CLIENT_SECRET", "ci-placeholder"],
      [
        "PROVIDER_GITHUB_OAUTH_REDIRECT_URL",
        "https://example.com/oauth/github/callback",
      ],
    ] as const) {
      await runConvexEnvSet(key, value);
    }

    await waitFor(
      async () =>
        (await readOptionalFile(convexBootstrapLogPath))?.includes(
          "Convex functions ready!",
        ) ?? false,
      180_000,
      "Timed out waiting for Convex functions to become ready.",
    );
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

  await stopProcess(bootstrapProcess);
  await printLogTail();
}

/**
 * Retries transient Convex env-set failures only, preserving fail-fast behavior
 * for fatal errors and the idempotent single-key write contract.
 */
async function runConvexEnvSet(key: string, value: string): Promise<void> {
  const args = [
    "--filter",
    "noter",
    "exec",
    "convex",
    "env",
    "set",
    key,
    value,
  ];

  for (let attempt = 1; attempt <= convexEnvSetMaxAttempts; attempt += 1) {
    const result = spawnSync(PNPM_COMMAND, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.status === 0) {
      writeProcessOutput(result.stdout, result.stderr);
      return;
    }

    const output = `${result.stdout}\n${result.stderr}`;
    if (
      attempt < convexEnvSetMaxAttempts &&
      isTransientConvexEnvSetFailure(output)
    ) {
      console.warn(
        `Retrying convex env set for ${key} after transient local backend conflict (${attempt}/${convexEnvSetMaxAttempts}).`,
      );
      await sleep(attempt * 1_000);
      continue;
    }

    writeProcessOutput(result.stdout, result.stderr);
    throw new Error(
      `convex env set ${key} failed with exit code ${result.status ?? "unknown"}.`,
    );
  }

  throw new Error(`convex env set ${key} retry loop ended unexpectedly.`);
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
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await sleep(1_000);
  }
  throw new Error(failureMessage);
}

async function stopProcess(
  childProcess: ReturnType<typeof spawn>,
): Promise<void> {
  if (childProcess.exitCode !== null) {
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
