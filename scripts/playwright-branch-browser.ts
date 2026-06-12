#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isRecord } from "@noter-md/dependent";

const HELP_TEXT = `Usage: scripts/playwright-branch-browser.ts <command> [args]

Commands:
  session                Print the deterministic Playwright session name.
  profile                Print the branch-owned browser profile directory.
  open [url] [--headed]  Open the branch session without unloading a dirty tab.
  verify [url]           Launch headed, assert no restore-pages prompt, close.
  cli <command> [args]   Run @playwright/cli inside the branch session.
  help                   Show this help message.

Environment:
  PLAYWRIGHT_SESSION     Override the computed session name.`;

const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const EXPLICIT_SESSION_PATTERN = /^[A-Za-z0-9._-]+$/;
const PLAYWRIGHT_CLI_BROWSER_NAME = "chromium";
const PLAYWRIGHT_CLI_CHANNEL = "chromium";
const SESSION_REPO_SEGMENT_MAX_LENGTH = 5;
const SESSION_BRANCH_SEGMENT_MAX_LENGTH = 3;
const SESSION_HASH_LENGTH = 6;
const SESSION_CONFIG_SALT = `${PLAYWRIGHT_CLI_BROWSER_NAME}-${PLAYWRIGHT_CLI_CHANNEL}-v1`;
const VERIFY_TIMEOUT_MS = 5_000;
const VERIFY_POLL_INTERVAL_MS = 200;
const RESTORE_PAGES_WINDOW_TITLE = "Restore pages?";
const BROWSER_THEME_SATURATION = 0.64;
const BROWSER_THEME_LIGHTNESS = 0.56;

class PlaywrightBranchBrowserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaywrightBranchBrowserError";
  }
}

if (isMainModule()) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    handleMainError(error);
  }
}

type PlaywrightCliConfig = {
  browser: {
    browserName: "chromium";
    launchOptions: {
      channel: "chromium";
      args: string[];
    };
  };
};

function main(args: string[]): void {
  const [command, ...rest] = args;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(HELP_TEXT);
    return;
  }

  if (command === "session") {
    console.log(getSessionName());
    return;
  }

  if (command === "profile") {
    console.log(getProfileDir(getSessionName()));
    return;
  }

  if (command === "open") {
    openBranchSession(parseOpenCommandArgs(rest));
    return;
  }

  if (command === "verify") {
    verifyRestorePagesSuppression(parseOpenCommandArgs(rest));
    return;
  }

  if (command === "cli") {
    if (rest.length === 0) {
      fail("Missing playwright-cli command. Use `cli <command> [args]`.");
    }

    runPlaywrightCli([`-s=${getSessionName()}`, ...rest]);
    return;
  }

  fail(`Unknown command: ${command}`);
}

/**
 * Re-entering a branch session should never unload the current working tab.
 * Opening a fresh tab keeps unsaved editor state intact and avoids native
 * beforeunload popups when a branch window is already in use.
 */
function openBranchSession(options: { url?: string; headed: boolean }): void {
  const session = getSessionName();
  const cliArgs = [`-s=${session}`];
  const initialSessionState = getSessionState(session);

  if (initialSessionState === "unknown") {
    fail(
      `Could not determine whether Playwright session "${session}" is already running. Refusing to reopen it because that could replace an unsaved browser tab.`,
    );
  }

  if (initialSessionState === "open") {
    const reuseArgs = [...cliArgs, "tab-new"];
    if (options.url) {
      reuseArgs.push(options.url);
    }

    const reuseResult = runPlaywrightCli(reuseArgs, {
      allowFailure: true,
      stdio: "pipe",
    });

    if (reuseResult.status === 0) {
      writeCapturedOutput(reuseResult);
      return;
    }

    if (requiresSessionReopen(reuseResult, session)) {
      writeCapturedOutput(reuseResult);
    } else {
      writeCapturedOutput(reuseResult);

      // `open` stops an existing session before recreating it, so only fall
      // back when we can prove the original session is already gone.
      if (getSessionState(session) !== "missing") {
        fail(
          `Playwright session "${session}" rejected 'tab-new'. Leaving the existing browser untouched so unsaved changes are not lost.`,
        );
      }
    }
  }

  const profileDir = getProfileDir(session);
  mkdirSync(profileDir, { recursive: true });
  sanitizeChromeCrashRecoveryState(profileDir);
  ensureConfiguredBrowserInstalled();

  const openArgs = [...cliArgs, "open"];
  if (options.url) {
    openArgs.push(options.url);
  }

  openArgs.push("--persistent", `--profile=${profileDir}`);
  if (options.headed) {
    openArgs.push("--headed");
  }
  runPlaywrightCli(openArgs);
}

function parseOpenCommandArgs(args: string[]): {
  url?: string;
  headed: boolean;
} {
  const headed = args.includes("--headed");
  const url = args.find((arg) => arg !== "--headed");
  return url ? { url, headed } : { headed };
}

/**
 * Saved session configs can outlive a Playwright CLI upgrade. In that case the
 * first command fails before the registry entry disappears, but re-opening the
 * session is the documented recovery path.
 */
function requiresSessionReopen(
  result: import("node:child_process").SpawnSyncReturns<string>,
  session: string,
): boolean {
  const output = `${result.stdout}\n${result.stderr}`;
  const escapedSession = session.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`session '${escapedSession}' is v`, "i").test(output);
}

function writeCapturedOutput(result: import("node:child_process").SpawnSyncReturns<string>): void {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

function getSessionName(): string {
  const explicitSession = process.env.PLAYWRIGHT_SESSION?.trim();
  if (explicitSession) {
    return getSafeExplicitSession(explicitSession);
  }

  const repoRoot = getRepoRoot();
  const branchIdentifier = getBranchIdentifier();
  return buildDerivedSessionName(repoRoot, branchIdentifier);
}

function getProfileDir(session: string): string {
  return path.join(getRepoRoot(), ".playwright-cli", "profiles", session);
}

/**
 * Every branch-owned persistent browser should inherit the same launch flags so
 * Chrome crash recovery UI never blocks automation after an unclean exit.
 */
export function buildPlaywrightCliConfig(repoRoot: string = getRepoRoot()): PlaywrightCliConfig {
  return {
    browser: {
      browserName: PLAYWRIGHT_CLI_BROWSER_NAME,
      launchOptions: {
        channel: PLAYWRIGHT_CLI_CHANNEL,
        args: getPlaywrightCliChromiumArgs(repoRoot),
      },
    },
  };
}

export function getPlaywrightCliConfigPath(repoRoot: string): string {
  return path.join(repoRoot, ".playwright-cli", "cli.config.json");
}

export function ensurePlaywrightCliConfig(repoRoot: string): string {
  const configPath = getPlaywrightCliConfigPath(repoRoot);
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    `${JSON.stringify(buildPlaywrightCliConfig(repoRoot), null, 2)}\n`,
    "utf8",
  );
  return configPath;
}

/**
 * The repo wrapper pins a non-default browser channel, but `playwright-cli`
 * only auto-installs browsers when it owns the default config file. Ensure the
 * exact bundled Chromium build exists before launch so `open` works on a fresh
 * machine and after CLI upgrades.
 */
function ensureConfiguredBrowserInstalled(): void {
  const repoRoot = getRepoRoot();
  const playwrightCliPath = getBundledPlaywrightCliPath(repoRoot);
  const executablePath = getBundledBrowserExecutablePath(playwrightCliPath);

  if (existsSync(executablePath)) {
    return;
  }

  const installResult = spawnSync("node", [playwrightCliPath, "install", PLAYWRIGHT_CLI_CHANNEL], {
    encoding: "utf8",
    stdio: "inherit",
  });

  if (installResult.status !== 0 || !existsSync(executablePath)) {
    fail(
      `Failed to install Playwright browser "${PLAYWRIGHT_CLI_CHANNEL}" for ${playwrightCliPath}.`,
    );
  }
}

function getBundledPlaywrightCliPath(repoRoot: string): string {
  const result = spawnSync(
    PNPM_COMMAND,
    [
      "--dir",
      path.join(repoRoot, "apps/noter"),
      "exec",
      "node",
      "-p",
      "require.resolve('@playwright/cli/playwright-cli.js')",
    ],
    {
      encoding: "utf8",
      stdio: "pipe",
    },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    fail("Failed to resolve the bundled @playwright/cli entrypoint.");
  }

  const cliEntryPath = result.stdout.trim();
  return path.resolve(path.dirname(cliEntryPath), "..", "..", "playwright", "cli.js");
}

function getBundledBrowserExecutablePath(playwrightCliPath: string): string {
  const resolveExecutableProgram = `const path = require("node:path")
const playwrightCliPath = process.argv[1]
const browserName = process.argv[2]
const registryPath = require.resolve("playwright-core/lib/server/registry/index", {
  paths: [path.dirname(playwrightCliPath)],
})
const { registry } = require(registryPath)
const executable = registry.findExecutable(browserName)
if (!executable) {
  process.exit(1)
}
process.stdout.write(executable.executablePath())`;

  const result = spawnSync(
    "node",
    ["-e", resolveExecutableProgram, playwrightCliPath, PLAYWRIGHT_CLI_CHANNEL],
    {
      encoding: "utf8",
      stdio: "pipe",
    },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    fail(
      `Failed to resolve the executable path for Playwright browser "${PLAYWRIGHT_CLI_CHANNEL}".`,
    );
  }

  return result.stdout.trim();
}

/**
 * Chrome persists crash markers in the profile itself. Clearing them before
 * each persistent launch prevents the restore-pages prompt from resurfacing
 * after an unclean browser exit.
 */
export function sanitizeChromeCrashRecoveryState(profileDir: string): void {
  updateJsonFile(path.join(profileDir, "Variations"), (variationsState) => {
    variationsState.variations_crash_streak = 0;
    variationsState["user_experience_metrics.stability.exited_cleanly"] = true;
    return variationsState;
  });

  updateJsonFile(path.join(profileDir, "Local State"), (localState) => {
    localState.variations_crash_streak = 0;
    return localState;
  });

  updateJsonFile(path.join(profileDir, "Default", "Preferences"), (preferences) => {
    if (isRecord(preferences.profile)) {
      preferences.profile.exit_type = "Normal";
    }

    const sessionEventLog = isRecord(preferences.sessions)
      ? preferences.sessions.event_log
      : undefined;

    if (isRecord(preferences.sessions) && Array.isArray(sessionEventLog)) {
      preferences.sessions.event_log = clearCrashFlagsFromSessionEventLog(sessionEventLog);
    }

    return preferences;
  });
}

function getRepoRoot(): string {
  return runGit(["rev-parse", "--show-toplevel"]);
}

function getBranchIdentifier(): string {
  const branchName = tryRunGit(["symbolic-ref", "-q", "--short", "HEAD"]);
  if (branchName) {
    return branchName;
  }

  const shortSha = runGit(["rev-parse", "--short", "HEAD"]);
  return `detached-${shortSha}`;
}

function getSessionState(session: string): "open" | "closed" | "missing" | "unknown" {
  const sessionDetails = getSessionDetails(session);
  if (!sessionDetails) {
    return "unknown";
  }
  return sessionDetails.status;
}

function runPlaywrightCli(
  args: string[],
  options: { allowFailure?: boolean; stdio?: "inherit" | "pipe" } = {},
): import("node:child_process").SpawnSyncReturns<string> {
  const repoRoot = getRepoRoot();
  const configPath = ensurePlaywrightCliConfig(repoRoot);
  const result = spawnSync(
    PNPM_COMMAND,
    [
      "--dir",
      path.join(repoRoot, "apps/noter"),
      "exec",
      "playwright-cli",
      `--config=${configPath}`,
      ...args,
    ],
    {
      encoding: "utf8",
      stdio: options.stdio ?? "inherit",
    },
  );

  if (!options.allowFailure && result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function runGit(args: string[]): string {
  const value = tryRunGit(args);
  if (!value) {
    fail(`Git command failed: git ${args.join(" ")}`);
  }
  return value;
}

function tryRunGit(args: string[]): string {
  const result = spawnSync("git", args, {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return "";
  }

  return result.stdout.trim();
}

function updateJsonFile(
  filePath: string,
  update: (value: Record<string, unknown>) => Record<string, unknown>,
): void {
  if (!existsSync(filePath)) {
    return;
  }

  const nextValue = update(parseJsonObject(readFileSync(filePath, "utf8")));
  writeFileSync(filePath, `${JSON.stringify(nextValue)}\n`, "utf8");
}

function parseJsonObject(rawJson: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(rawJson);
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function clearCrashFlagsFromSessionEventLog(eventLog: unknown[]): unknown[] {
  return eventLog.map((entry) => (isRecord(entry) ? { ...entry, crashed: false } : entry));
}

/**
 * Worktree-owned browsers should be visually distinct at a glance. Chromium's
 * built-in autogenerated theme switch lets us tint the browser chrome without
 * sharing a theme extension or profile data between worktrees.
 */
export function getPlaywrightCliChromiumArgs(repoRoot: string): string[] {
  const { red, green, blue } = getDeterministicBrowserThemeColor(repoRoot);

  return [
    "--disable-session-crashed-bubble",
    `--install-autogenerated-theme=${red},${green},${blue}`,
  ];
}

type RgbColor = { red: number; green: number; blue: number };

export function getDeterministicBrowserThemeColor(repoRoot: string): RgbColor {
  const hue = getStableHueDegrees(repoRoot);
  return hslToRgb(hue / 360, BROWSER_THEME_SATURATION, BROWSER_THEME_LIGHTNESS);
}

function getStableHueDegrees(repoRoot: string): number {
  const hueToken = createHash("sha256")
    .update(`browser-theme\0${repoRoot}`)
    .digest()
    .readUInt16BE(0);

  return Math.round((hueToken / 0xffff) * 359);
}

function hslToRgb(hue: number, saturation: number, lightness: number): RgbColor {
  if (saturation === 0) {
    const grayscale = Math.round(lightness * 255);
    return {
      red: grayscale,
      green: grayscale,
      blue: grayscale,
    };
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return {
    red: toRgbChannel(hueToRgb(p, q, hue + 1 / 3)),
    green: toRgbChannel(hueToRgb(p, q, hue)),
    blue: toRgbChannel(hueToRgb(p, q, hue - 1 / 3)),
  };
}

function hueToRgb(p: number, q: number, hue: number): number {
  let normalizedHue = hue;

  if (normalizedHue < 0) {
    normalizedHue += 1;
  }
  if (normalizedHue > 1) {
    normalizedHue -= 1;
  }
  if (normalizedHue < 1 / 6) {
    return p + (q - p) * 6 * normalizedHue;
  }
  if (normalizedHue < 1 / 2) {
    return q;
  }
  if (normalizedHue < 2 / 3) {
    return p + (q - p) * (2 / 3 - normalizedHue) * 6;
  }

  return p;
}

function toRgbChannel(value: number): number {
  return Math.round(value * 255);
}

function slugify(value: string): string {
  const normalized = value
    .trim()
    .replaceAll(/[^A-Za-z0-9._-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "");

  return normalized || "unknown";
}

/**
 * Stable session names need to stay below local Unix socket path limits while
 * still being recognizable in Playwright CLI listings.
 */
function truncateSessionSegment(value: string, maxLength: number): string {
  const truncated = value.slice(0, maxLength).replaceAll(/^-|-$/g, "");
  return truncated || "unknown";
}

/**
 * Most worktree branches use the `codex/` prefix, which is not useful inside a
 * derived session name and only increases the socket path length.
 */
function normalizeBranchSessionSegment(branchIdentifier: string): string {
  return branchIdentifier.startsWith("codex/")
    ? branchIdentifier.slice("codex/".length)
    : branchIdentifier;
}

function abbreviateBranchSessionSegment(branchIdentifier: string): string {
  const normalizedBranch = slugify(normalizeBranchSessionSegment(branchIdentifier));
  const segments = normalizedBranch.split("-").filter(Boolean);

  if (segments.length > 1) {
    return truncateSessionSegment(
      segments.map((segment) => segment[0]).join(""),
      SESSION_BRANCH_SEGMENT_MAX_LENGTH,
    );
  }

  return truncateSessionSegment(normalizedBranch, SESSION_BRANCH_SEGMENT_MAX_LENGTH);
}

function getSafeExplicitSession(explicitSession: string): string {
  if (!EXPLICIT_SESSION_PATTERN.test(explicitSession)) {
    fail('PLAYWRIGHT_SESSION may only contain letters, numbers, ".", "_" and "-".');
  }

  return explicitSession;
}

export function buildDerivedSessionName(repoRoot: string, branchIdentifier: string): string {
  const repoName = truncateSessionSegment(
    slugify(path.basename(repoRoot)),
    SESSION_REPO_SEGMENT_MAX_LENGTH,
  );
  const branchName = abbreviateBranchSessionSegment(branchIdentifier);
  const stableSuffix = createHash("sha256")
    .update(`${SESSION_CONFIG_SALT}\0${repoRoot}\0${branchIdentifier}`)
    .digest("hex")
    .slice(0, SESSION_HASH_LENGTH);

  return `${repoName}-${branchName}-${stableSuffix}`;
}

export function parseSessionDetailsFromListOutput(
  output: string,
  session: string,
): {
  status: "open" | "closed";
  browserType?: string;
  userDataDir?: string;
  headed?: boolean;
} | null {
  const escapedSession = session.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sessionHeaderPattern = new RegExp(`^-\\s+${escapedSession}(?::|\\s|$)`);
  const lines = output.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!sessionHeaderPattern.test(line)) {
      continue;
    }

    const details: {
      status: "open" | "closed";
      browserType?: string;
      userDataDir?: string;
      headed?: boolean;
    } = {
      status: "open",
    };

    for (let detailIndex = index + 1; detailIndex < lines.length; detailIndex += 1) {
      const detailLine = lines[detailIndex] ?? "";
      if (detailLine.startsWith("- ")) {
        break;
      }

      const trimmedDetailLine = detailLine.trim();
      if (!trimmedDetailLine.startsWith("- ")) {
        continue;
      }

      const detailMatch = /^-\s+([^:]+):\s*(.*)$/.exec(trimmedDetailLine);
      if (!detailMatch) {
        continue;
      }

      const [, key, rawValue] = detailMatch;
      if (key === "status" && (rawValue === "open" || rawValue === "closed")) {
        details.status = rawValue;
      }
      if (key === "browser-type" && rawValue) {
        details.browserType = rawValue;
      }
      if (key === "user-data-dir" && rawValue) {
        details.userDataDir = rawValue;
      }
      if (key === "headed" && (rawValue === "true" || rawValue === "false")) {
        details.headed = rawValue === "true";
      }
    }

    return details;
  }

  return null;
}

export function parseSessionStateFromListOutput(
  output: string,
  session: string,
): "open" | "closed" | "missing" {
  return parseSessionDetailsFromListOutput(output, session)?.status ?? "missing";
}

/**
 * Verification needs the real native browser window, not the page DOM. It
 * closes only the branch-owned profile, relaunches it in headed mode, then
 * polls the macOS window list for a restore-pages popup from that exact PID.
 */
function verifyRestorePagesSuppression(options: { url?: string; headed: boolean }): void {
  const session = getSessionName();
  const profileDir = getProfileDir(session);

  closeBranchSession(session, profileDir);

  try {
    openBranchSession({
      url: options.url,
      headed: true,
    });

    const sessionDetails = waitForSessionDetails(session);
    if (sessionDetails.browserType !== PLAYWRIGHT_CLI_CHANNEL) {
      fail(
        `Expected Playwright session "${session}" to resolve to "${PLAYWRIGHT_CLI_CHANNEL}", got "${sessionDetails.browserType ?? "unknown"}".`,
      );
    }

    const browserProcess = waitForProfileBrowserProcess(profileDir);
    const windowTitles = observeWindowTitlesForPid(browserProcess.pid);
    assertObservedWindowTitles(windowTitles, browserProcess.pid);

    if (windowTitles.has(RESTORE_PAGES_WINDOW_TITLE)) {
      fail(
        `Playwright session "${session}" still showed "${RESTORE_PAGES_WINDOW_TITLE}" for profile ${profileDir}.`,
      );
    }

    console.log(
      `Verified Playwright session "${session}" launched without "${RESTORE_PAGES_WINDOW_TITLE}".`,
    );
  } finally {
    closeBranchSession(session, profileDir);
  }
}

function getSessionDetails(session: string): {
  status: "open" | "closed" | "missing" | "unknown";
  browserType?: string;
  userDataDir?: string;
  headed?: boolean;
} | null {
  const result = runPlaywrightCli(["list", "--all"], {
    allowFailure: true,
    stdio: "pipe",
  });

  if (result.status !== 0) {
    return null;
  }

  const sessionDetails = parseSessionDetailsFromListOutput(
    `${result.stdout}\n${result.stderr}`,
    session,
  );

  if (!sessionDetails) {
    return {
      status: "missing",
    };
  }

  return sessionDetails;
}

function closeBranchSession(session: string, profileDir: string): void {
  if (getSessionState(session) === "open") {
    runPlaywrightCli([`-s=${session}`, "close"], {
      allowFailure: true,
      stdio: "pipe",
    });
  }

  terminateProfileBrowserProcesses(profileDir);
  waitForProfileBrowserToClose(profileDir);
}

function terminateProfileBrowserProcesses(profileDir: string): void {
  for (const { pid } of listProfileBrowserProcesses(profileDir)) {
    try {
      process.kill(pid);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") {
        continue;
      }

      fail(`Failed to terminate branch browser process ${pid} for ${profileDir}.`);
    }
  }
}

function assertObservedWindowTitles(windowTitles: Set<string>, pid: number): void {
  if (windowTitles.size > 0) {
    return;
  }

  fail(`Did not observe any onscreen browser windows for PID ${pid}.`);
}

function waitForProfileBrowserToClose(profileDir: string): void {
  waitForCondition(
    () => listProfileBrowserProcesses(profileDir).length === 0,
    VERIFY_TIMEOUT_MS,
    `Timed out waiting for browser processes using ${profileDir} to exit.`,
  );
}

function waitForSessionDetails(session: string): {
  status: "open" | "closed";
  browserType?: string;
  userDataDir?: string;
  headed?: boolean;
} {
  return waitForValue(
    () => {
      const sessionDetails = getSessionDetails(session);
      if (sessionDetails?.status !== "open") {
        return null;
      }

      return {
        ...sessionDetails,
        status: "open",
      };
    },
    VERIFY_TIMEOUT_MS,
    `Timed out waiting for Playwright session "${session}" to open.`,
  );
}

function waitForProfileBrowserProcess(profileDir: string): {
  pid: number;
  args: string;
} {
  return waitForValue(
    () => getPrimaryProfileBrowserProcess(profileDir),
    VERIFY_TIMEOUT_MS,
    `Timed out waiting for a browser process using ${profileDir}.`,
  );
}

function observeWindowTitlesForPid(pid: number): Set<string> {
  const seenTitles: Set<string> = new Set();
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    for (const title of getOnscreenWindowTitlesForPid(pid)) {
      seenTitles.add(title);
    }

    sleep(VERIFY_POLL_INTERVAL_MS);
  }

  return seenTitles;
}

function getOnscreenWindowTitlesForPid(pid: number): string[] {
  const swiftProgram = `import Foundation
import CoreGraphics
let targetPid = Int(CommandLine.arguments[1]) ?? -1
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
let names = windows.compactMap { window -> String? in
  guard let ownerPid = window[kCGWindowOwnerPID as String] as? Int, ownerPid == targetPid else {
    return nil
  }
  let name = window[kCGWindowName as String] as? String ?? ""
  return name.isEmpty ? nil : name
}
let data = try JSONSerialization.data(withJSONObject: names)
FileHandle.standardOutput.write(data)`;

  const result = spawnSync("swift", ["-e", swiftProgram, String(pid)], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    fail(`Failed to query onscreen browser windows for PID ${pid}.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout || "[]");
  } catch {
    return [];
  }
  return Array.isArray(parsed) ? parsed.filter((title) => typeof title === "string") : [];
}

function listProfileBrowserProcesses(profileDir: string): { pid: number; args: string }[] {
  const result = spawnSync("ps", ["-axo", "pid=,args="], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    fail(`Failed to inspect browser processes for ${profileDir}.`);
  }

  return parseProfileBrowserProcessesFromPsOutput(result.stdout, profileDir);
}

export function parseProfileBrowserProcessesFromPsOutput(
  output: string,
  profileDir: string,
): { pid: number; args: string }[] {
  const userDataDirFlag = `--user-data-dir=${profileDir}`;
  const escapedUserDataDirFlag = userDataDirFlag.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const userDataDirPattern = new RegExp(`(?:^|\\s)${escapedUserDataDirFlag}(?:\\s|$)`);

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d+)\s+(.*)$/.exec(line);
      if (!match) {
        return null;
      }

      return {
        pid: Number(match[1]),
        args: match[2],
      };
    })
    .filter((processInfo) => processInfo !== null)
    .filter((processInfo) => userDataDirPattern.test(processInfo.args));
}

/**
 * The main browser process has the profile arg but no helper subprocess flags.
 */
function getPrimaryProfileBrowserProcess(profileDir: string): { pid: number; args: string } | null {
  for (const processInfo of listProfileBrowserProcesses(profileDir)) {
    if (processInfo.args.includes("Helper")) {
      continue;
    }
    if (processInfo.args.includes("chrome_crashpad_handler")) {
      continue;
    }
    if (processInfo.args.includes(" --type=")) {
      continue;
    }
    return processInfo;
  }

  return null;
}

function waitForValue<T>(readValue: () => T | null, timeoutMs: number, timeoutMessage: string): T {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = readValue();
    if (value !== null) {
      return value;
    }
    sleep(VERIFY_POLL_INTERVAL_MS);
  }

  fail(timeoutMessage);
}

function waitForCondition(
  checkCondition: () => boolean,
  timeoutMs: number,
  timeoutMessage: string,
): void {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (checkCondition()) {
      return;
    }
    sleep(VERIFY_POLL_INTERVAL_MS);
  }

  fail(timeoutMessage);
}

function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function fail(message: string): never {
  throw new PlaywrightBranchBrowserError(message);
}

function handleMainError(error: unknown): never {
  if (error instanceof PlaywrightBranchBrowserError) {
    console.error(error.message);
    console.error(HELP_TEXT);
    process.exit(1);
  }

  throw error;
}

function isMainModule(): boolean {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
