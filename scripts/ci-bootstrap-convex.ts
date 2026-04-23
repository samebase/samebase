#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const convexBootstrapLogPath = path.join(tmpdir(), "convex-bootstrap.log");
const envLocalPath = path.join("apps", "noter", ".env.local");
const convexInstanceUrl = "http://127.0.0.1:3210/instance_name";
const convexEnvSetRetryDelayMs = 1_000;
const convexEnvSetRetryAttempts = 5;

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
        return fileContents?.includes("CONVEX_DEPLOYMENT=") ?? false;
      },
      60_000,
      "Timed out waiting for apps/noter/.env.local to include CONVEX_DEPLOYMENT.",
    );
    await waitFor(
      async () => {
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
      await runWithRetry(PNPM_COMMAND, [
        "--filter",
        "noter",
        "exec",
        "convex",
        "env",
        "set",
        key,
        value,
      ]);
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

async function runWithRetry(command: string, args: string[]): Promise<void> {
  for (let attempt = 1; attempt <= convexEnvSetRetryAttempts; attempt += 1) {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      stdio: "pipe",
    });

    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);

    if (result.status === 0) {
      return;
    }

    const output = `${result.stdout}\n${result.stderr}`;
    const isRetryableFailure =
      output.includes("503 Service Unavailable") &&
      output.includes("OptimisticConcurrencyControlFailure");

    if (!isRetryableFailure || attempt === convexEnvSetRetryAttempts) {
      throw new Error(
        `Command failed with exit code ${result.status ?? 1}: ${formatCommand(command, args)}`,
      );
    }

    // The anonymous local backend can still be finalizing bootstrap while these
    // env writes begin, so retry the transient OCC error instead of failing CI.
    console.warn(
      `Retrying transient Convex env bootstrap failure (${attempt}/${convexEnvSetRetryAttempts})...`,
    );
    await sleep(convexEnvSetRetryDelayMs * attempt);
  }
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].join(" ");
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
