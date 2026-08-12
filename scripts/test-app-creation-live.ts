#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

import {
  readLocalDevOriginState,
  usesLocalConvexDeployment,
} from "../apps/samebase/scripts/convex-local-utils.ts";
import { fail, runMain } from "./lib/scriptRuntime.ts";
import { samebaseAppFilePath } from "./lib/trackedFilePath.ts";

const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const TEST_GITHUB_OWNER = "samebase-live-tests";
const WORKTREE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

function readWorktreeContext(): { appDir: string; worktreeId: string } {
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
  if (path.resolve(gitDir) === path.resolve(gitCommonDir)) {
    fail(
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
    fail(
      `Cannot use worktree id "${worktreeId}". It must contain only lower-case letters, numbers, and internal hyphens.`,
    );
  }

  return {
    appDir: path.join(repoRoot, "apps", "samebase"),
    worktreeId,
  };
}

function main(): void {
  if (process.argv.length > 2) {
    fail("Run `pnpm test:app-creation-live` without arguments.");
  }

  const { appDir, worktreeId } = readWorktreeContext();
  const originState = readLocalDevOriginState(appDir);
  if (!originState) {
    fail("No active pnpm dev URL exists for this worktree. Start `pnpm dev`, then try again.");
  }
  try {
    process.kill(originState.processId, 0);
  } catch {
    fail("The recorded pnpm dev process is not running. Restart `pnpm dev`, then try again.");
  }

  const origin = originState.origin;
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    fail(`The active pnpm dev URL is invalid: ${origin}`);
  }
  if (parsedOrigin.protocol !== "http:" || !LOOPBACK_HOSTNAMES.has(parsedOrigin.hostname)) {
    fail(`The app-creation live test only runs against a loopback pnpm dev URL, not ${origin}.`);
  }
  if (!usesLocalConvexDeployment(appDir)) {
    fail("The app-creation live test requires this worktree to use its local Convex backend.");
  }

  console.log(`Live app-creation URL: ${origin}`);
  console.log(`Test GitHub owner: ${TEST_GITHUB_OWNER}`);
  console.log(`Temporary resource prefix: tmp-${worktreeId}-app-create`);

  const result = spawnSync(
    PNPM_COMMAND,
    [
      "exec",
      "playwright",
      "test",
      "-c",
      samebaseAppFilePath("playwright.live.config.ts"),
      samebaseAppFilePath("e2e/vault-create-app.live.spec.ts"),
      "--project=chromium-desktop",
      "--grep",
      "creates and fully provisions a temporary app, then removes its resources",
    ],
    {
      cwd: appDir,
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: origin,
        PLAYWRIGHT_TEST_GITHUB_OWNER: TEST_GITHUB_OWNER,
        PLAYWRIGHT_WORKTREE_ID: worktreeId,
      },
      stdio: "inherit",
    },
  );
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

await runMain(main);
