#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

import {
  readEnvFile,
  readLocalDevOriginState,
  usesLocalConvexDeployment,
} from "../apps/samebase/scripts/convex-local-utils.ts";
import { fail, isMainModule, runMain } from "./lib/scriptRuntime.ts";
import { samebaseAppFilePath } from "./lib/trackedFilePath.ts";

const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const TEST_GITHUB_OWNER = "samebase-live-tests";
const APP_CREATION_TEST_TITLE =
  "creates and fully provisions a temporary app, then removes its resources";
const WORKTREE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

const HELP_TEXT = `Usage: pnpm test:app-creation-live

Run the isolated app-creation product contract against the pnpm dev server for
the current linked worktree. The command reads the active URL and worktree id.
It writes only to the samebase-live-tests provider accounts.

Start this worktree with pnpm dev before you run the test.`;

type GitWorktreeContext = {
  repoRoot: string;
  gitDir: string;
  gitCommonDir: string;
};

export function deriveLiveTestWorktreeId({
  repoRoot,
  gitDir,
  gitCommonDir,
}: GitWorktreeContext): string {
  if (path.resolve(gitDir) === path.resolve(gitCommonDir)) {
    throw new Error(
      "The app-creation live test needs an isolated linked worktree. Start that worktree with `pnpm dev`, then run this command there.",
    );
  }

  const repoSegments = path.resolve(repoRoot).split(path.sep);
  const codexDirectoryIndex = repoSegments.findIndex(
    (segment, index) => segment === ".codex" && repoSegments[index + 1] === "worktrees",
  );
  const codexWorktreeId =
    codexDirectoryIndex === -1 ? undefined : repoSegments[codexDirectoryIndex + 2];
  const worktreeId = codexWorktreeId ?? path.basename(path.resolve(gitDir));

  if (!WORKTREE_ID_PATTERN.test(worktreeId)) {
    throw new Error(
      `Cannot use worktree id "${worktreeId}". It must contain only lower-case letters, numbers, and internal hyphens.`,
    );
  }

  return worktreeId;
}

export function buildAppCreationPlaywrightArgs(): string[] {
  return [
    "exec",
    "playwright",
    "test",
    "-c",
    samebaseAppFilePath("playwright.live.config.ts"),
    samebaseAppFilePath("e2e/vault-create-app.live.spec.ts"),
    "--project=chromium-desktop",
    "--grep",
    APP_CREATION_TEST_TITLE,
  ];
}

function readGitWorktreeContext(): GitWorktreeContext {
  const result = spawnSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-dir", "--git-common-dir"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    fail("Run this command from inside a Samebase linked worktree.");
  }

  const [repoRoot, gitDir, gitCommonDir] = result.stdout.trim().split(/\r?\n/);
  if (!repoRoot || !gitDir || !gitCommonDir) {
    fail("Git did not return enough worktree metadata for the live test.");
  }

  return { repoRoot, gitDir, gitCommonDir };
}

function requireLoopbackOrigin(origin: string): string {
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    fail(`The active pnpm dev URL is invalid: ${origin}`);
  }

  if (parsedOrigin.protocol !== "http:" || !LOOPBACK_HOSTNAMES.has(parsedOrigin.hostname)) {
    fail(`The app-creation live test only runs against a loopback pnpm dev URL, not ${origin}.`);
  }

  return origin;
}

function requireRunningProcess(processId: number): void {
  try {
    process.kill(processId, 0);
  } catch {
    fail(
      "The recorded pnpm dev process is not running. Restart this worktree with `pnpm dev`, then try again.",
    );
  }
}

async function requireIsolatedLocalBackend(appDir: string): Promise<void> {
  if (!usesLocalConvexDeployment(appDir)) {
    fail("The app-creation live test requires this worktree to use its local Convex backend.");
  }

  const env = readEnvFile(appDir);
  const configuredUrl = env.CONVEX_URL ?? env.VITE_CONVEX_URL;
  if (!configuredUrl) {
    fail("The worktree .env.local file has no Convex URL.");
  }

  const instanceUrl = new URL("/instance_name", configuredUrl);
  let instanceName: string;
  try {
    const response = await fetch(instanceUrl, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      fail(`The local Convex backend identity check returned HTTP ${response.status}.`);
    }
    instanceName = (await response.text()).trim();
  } catch (error) {
    throw new Error("Cannot verify the local Convex backend for this worktree.", {
      cause: error,
    });
  }

  if (
    instanceName !== "anonymous-agent" &&
    !instanceName.startsWith("anonymous-") &&
    !instanceName.startsWith("local-")
  ) {
    fail(`Refusing to run against Convex instance ${instanceName || "<empty>"}.`);
  }
}

async function requireRunningDevServer(origin: string): Promise<void> {
  try {
    const response = await fetch(origin, {
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });
    await response.body?.cancel();
  } catch (error) {
    throw new Error(
      `Cannot reach ${origin}. Start this worktree with \`pnpm dev\` and try again.`,
      {
        cause: error,
      },
    );
  }
}

function runAppCreationTest(appDir: string, origin: string, worktreeId: string): void {
  console.log(`Live app-creation URL: ${origin}`);
  console.log(`Test GitHub owner: ${TEST_GITHUB_OWNER}`);
  console.log(`Temporary resource prefix: tmp-${worktreeId}-app-create`);

  const result = spawnSync(PNPM_COMMAND, buildAppCreationPlaywrightArgs(), {
    cwd: appDir,
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: origin,
      PLAYWRIGHT_TEST_GITHUB_OWNER: TEST_GITHUB_OWNER,
      PLAYWRIGHT_WORKTREE_ID: worktreeId,
    },
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    fail(`The app-creation live test stopped because of signal ${result.signal}.`);
  }
  if (result.status !== 0) {
    fail(
      `The app-creation live test failed with exit code ${result.status ?? 1}.`,
      result.status ?? 1,
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["-h", "--help"].includes(args[0] ?? "")) {
    console.log(HELP_TEXT);
    return;
  }
  if (args.length > 0) {
    fail(HELP_TEXT);
  }

  const gitContext = readGitWorktreeContext();
  const worktreeId = deriveLiveTestWorktreeId(gitContext);
  const appDir = path.join(gitContext.repoRoot, "apps", "samebase");
  const originState = readLocalDevOriginState(appDir);
  if (!originState) {
    fail("No active pnpm dev URL exists for this worktree. Start `pnpm dev`, then try again.");
  }

  requireRunningProcess(originState.processId);
  const origin = requireLoopbackOrigin(originState.origin);
  await requireIsolatedLocalBackend(appDir);
  await requireRunningDevServer(origin);
  runAppCreationTest(appDir, origin, worktreeId);
}

if (isMainModule(import.meta.url)) {
  await runMain(main);
}
