#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

type WorktreeKind = "main" | "linked";

type WorktreeContext = {
  kind: WorktreeKind;
  repoRoot: string;
};

/**
 * Git sets a private GIT_DIR for linked worktrees while pointing GIT_COMMON_DIR
 * back at the main checkout's .git directory.
 */
export function classifyWorktree(gitDir: string, gitCommonDir: string): WorktreeKind {
  return gitDir === gitCommonDir ? "main" : "linked";
}

export function resolveWorktreeContext(cwd = process.cwd()): WorktreeContext {
  const result = spawnSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-dir", "--git-common-dir"],
    {
      cwd,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error("Run `pnpm dev` from inside a Git checkout.");
  }

  const lines = result.stdout.trim().split(/\r?\n/);
  const repoRoot = lines[0];
  const gitDir = lines[1];
  const gitCommonDir = lines[2];
  if (!repoRoot || !gitDir || !gitCommonDir) {
    throw new Error("Git did not return enough worktree metadata to choose a dev startup path.");
  }

  return {
    kind: classifyWorktree(gitDir, gitCommonDir),
    repoRoot,
  };
}

export function buildContextBootstrapArgs(args: string[]): string[] {
  return args.includes("--no-branch") ? ["--no-branch"] : [];
}

/** Installs the dependencies, which the dev runner imports, before it starts. */
function runDependencyBootstrap(repoRoot: string, args: string[]): void {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "bootstrap-worktree.ts"), ...buildContextBootstrapArgs(args)],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    process.kill(process.pid, result.signal);
    return;
  }
  if (result.status !== 0) {
    throw new Error(`Dependency bootstrap failed with exit code ${result.status ?? 1}.`);
  }
}

/** The main checkout and every linked worktree start through the same runner. */
async function runDev(repoRoot: string, args: string[]): Promise<void> {
  const runnerPath = path.join(repoRoot, "scripts", "run-worktree-dev.ts");

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath, ...args], {
      cwd: repoRoot,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { repoRoot } = resolveWorktreeContext();
  runDependencyBootstrap(repoRoot, args);
  await runDev(repoRoot, args);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
