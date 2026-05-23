#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

import { fail, isMainModule, runMain } from "./lib/scriptRuntime.ts";

const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

export type WorktreeKind = "main" | "linked";

/**
 * Git sets a private GIT_DIR for linked worktrees while pointing GIT_COMMON_DIR
 * back at the main checkout's .git directory.
 */
export function classifyWorktree(gitDir: string, gitCommonDir: string): WorktreeKind {
  return gitDir === gitCommonDir ? "main" : "linked";
}

export function resolveWorktreeKind(cwd = process.cwd()): WorktreeKind {
  const result = spawnSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"],
    {
      cwd,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    fail("Run `pnpm dev` from inside a Git checkout.");
  }

  const lines = result.stdout.trim().split(/\r?\n/);
  const gitDir = lines[0];
  const gitCommonDir = lines[1];
  if (!gitDir || !gitCommonDir) {
    fail("Git did not return enough worktree metadata to choose a dev startup path.");
  }

  return classifyWorktree(gitDir, gitCommonDir);
}

export function buildContextDevArgs(kind: WorktreeKind, args: string[]): string[] {
  const script = kind === "main" ? "dev:primary" : "dev:worktree";
  return [script, ...args];
}

async function main(): Promise<void> {
  const child = spawn(
    PNPM_COMMAND,
    buildContextDevArgs(resolveWorktreeKind(), process.argv.slice(2)),
    {
      stdio: "inherit",
    },
  );

  await new Promise<void>((resolve, reject) => {
    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Dev startup failed with exit code ${code ?? 1}.`));
    });
  });
}

if (isMainModule(import.meta.url)) {
  await runMain(main);
}
