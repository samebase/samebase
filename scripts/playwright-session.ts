#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { readOptionalEnvValue, readPositiveIntegerEnvValue } from "./lib/env.ts";
import { fail, isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { trackedFilePath } from "./lib/trackedFilePath.ts";

const DEFAULT_WORKTREE_DEV_VITE_PORT = 5174;
const DEFAULT_RECORDINGS_DIRNAME = "samebase-browser-recordings";

const HELP_TEXT = `Usage: scripts/playwright-session.ts <command>

Commands:
  open          Open the deterministic branch-owned Playwright browser.
  record-start  Open the browser and start video + tracing capture.
  record-stop   Persist artifacts, close the session, and clear local state.
  help          Show this help message.
`;

type ExecResult = {
  stdout: string;
};

function resolvePlaywrightUrl(env: NodeJS.ProcessEnv): string {
  const explicitUrl = readOptionalEnvValue(env.PLAYWRIGHT_URL);
  if (explicitUrl !== null) {
    return explicitUrl;
  }

  const vitePort =
    readPositiveIntegerEnvValue(env.WORKTREE_DEV_VITE_PORT, "WORKTREE_DEV_VITE_PORT", HELP_TEXT) ??
    DEFAULT_WORKTREE_DEV_VITE_PORT;
  return `http://127.0.0.1:${vitePort}`;
}

function resolveRecordingsDir(env: NodeJS.ProcessEnv): string {
  const explicitDir = readOptionalEnvValue(env.PLAYWRIGHT_RECORD_DIR);
  if (explicitDir !== null) {
    return explicitDir;
  }

  return path.join(os.tmpdir(), DEFAULT_RECORDINGS_DIRNAME);
}

function getActiveSessionPath(repoRoot: string): string {
  return path.join(repoRoot, ".playwright-cli", "active-session");
}

function getBranchBrowserScriptPath(repoRoot: string): string {
  return path.join(repoRoot, trackedFilePath("scripts/playwright-branch-browser.ts"));
}

function runBranchBrowser(
  repoRoot: string,
  args: readonly string[],
  options: {
    capture?: boolean;
    env?: NodeJS.ProcessEnv;
  } = {},
): ExecResult {
  const result = spawnSync(process.execPath, [getBranchBrowserScriptPath(repoRoot), ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...options.env,
    },
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.status !== 0) {
    fail(
      `playwright-branch-browser ${args.join(" ")} failed with exit code ${result.status ?? 1}.`,
      result.status ?? 1,
    );
  }

  return {
    stdout: result.stdout,
  };
}

function resolveSessionName(repoRoot: string): string {
  return runBranchBrowser(repoRoot, ["session"], {
    capture: true,
  }).stdout.trim();
}

function resolveProfileDir(repoRoot: string, session: string): string {
  const profileDir = runBranchBrowser(repoRoot, ["profile"], {
    capture: true,
  }).stdout.trim();
  if (profileDir.length > 0) {
    return profileDir;
  }

  return path.join(repoRoot, ".playwright-cli", "profiles", session);
}

function ensurePlaywrightStateDir(repoRoot: string): void {
  mkdirSync(path.join(repoRoot, ".playwright-cli"), { recursive: true });
}

function persistActiveSession(repoRoot: string, session: string): void {
  ensurePlaywrightStateDir(repoRoot);
  writeFileSync(getActiveSessionPath(repoRoot), `${session}\n`, "utf8");
}

function readActiveSession(repoRoot: string): string | null {
  const explicitSession = readOptionalEnvValue(process.env.PLAYWRIGHT_SESSION);
  if (explicitSession !== null) {
    return explicitSession;
  }

  const activeSessionPath = getActiveSessionPath(repoRoot);
  if (!existsSync(activeSessionPath)) {
    return null;
  }

  const session = readFileSync(activeSessionPath, "utf8").trim();
  return session.length > 0 ? session : null;
}

function clearActiveSession(repoRoot: string): void {
  rmSync(getActiveSessionPath(repoRoot), { force: true });
}

function formatTimestamp(date: Date): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function handleOpen(repoRoot: string): void {
  const session = resolveSessionName(repoRoot);
  const url = resolvePlaywrightUrl(process.env);
  const recordingsDir = resolveRecordingsDir(process.env);

  mkdirSync(recordingsDir, { recursive: true });
  ensurePlaywrightStateDir(repoRoot);
  runBranchBrowser(repoRoot, ["open", url]);
  persistActiveSession(repoRoot, session);

  console.log(
    `Opened Playwright session ${session} at ${url} using profile ${resolveProfileDir(repoRoot, session)}`,
  );
}

function handleRecordStart(repoRoot: string): void {
  const session = resolveSessionName(repoRoot);
  const url = resolvePlaywrightUrl(process.env);
  const recordingsDir = resolveRecordingsDir(process.env);

  mkdirSync(recordingsDir, { recursive: true });
  ensurePlaywrightStateDir(repoRoot);
  runBranchBrowser(repoRoot, ["open", url]);
  runBranchBrowser(repoRoot, ["cli", "tracing-start"]);
  runBranchBrowser(repoRoot, ["cli", "video-start"]);
  persistActiveSession(repoRoot, session);

  console.log(
    `Recording started for session ${session} at ${url} using profile ${resolveProfileDir(repoRoot, session)}`,
  );
}

function handleRecordStop(repoRoot: string): void {
  const session = readActiveSession(repoRoot);
  if (session === null) {
    fail(
      "No active Playwright session. Run `pnpm playwright:record:start` first or set PLAYWRIGHT_SESSION.",
    );
  }

  const timestamp = formatTimestamp(new Date());
  const recordingsDir = resolveRecordingsDir(process.env);
  mkdirSync(recordingsDir, { recursive: true });

  const prefix = path.join(recordingsDir, `${session}-${timestamp}`);
  // Keep every artifact command pinned to the recorded session, even if the
  // caller's shell points PLAYWRIGHT_SESSION somewhere else.
  const sessionEnv = { PLAYWRIGHT_SESSION: session };

  const snapshot = runBranchBrowser(repoRoot, ["cli", "snapshot"], {
    capture: true,
    env: sessionEnv,
  });
  writeFileSync(`${prefix}.snapshot.txt`, snapshot.stdout, "utf8");
  runBranchBrowser(repoRoot, ["cli", "screenshot", `--filename=${prefix}.png`], {
    env: sessionEnv,
  });
  runBranchBrowser(repoRoot, ["cli", "video-stop", `--filename=${prefix}.webm`], {
    env: sessionEnv,
  });
  const trace = runBranchBrowser(repoRoot, ["cli", "tracing-stop"], {
    capture: true,
    env: sessionEnv,
  });
  writeFileSync(`${prefix}.trace.txt`, trace.stdout, "utf8");
  runBranchBrowser(repoRoot, ["cli", "close"], {
    env: sessionEnv,
  });
  clearActiveSession(repoRoot);

  console.log(`Saved recording artifacts to ${recordingsDir}`);
}

async function main(): Promise<void> {
  const command = process.argv.at(2);
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    console.log(HELP_TEXT);
    return;
  }

  const repoRoot = resolveRepoRoot();
  if (command === "open") {
    handleOpen(repoRoot);
    return;
  }
  if (command === "record-start") {
    handleRecordStart(repoRoot);
    return;
  }
  if (command === "record-stop") {
    handleRecordStop(repoRoot);
    return;
  }

  fail(`Unknown command: ${command}\n\n${HELP_TEXT}`);
}

if (isMainModule(import.meta.url)) {
  await runMain(main);
}
