#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export type WorktreeKind = "main" | "linked";

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

function resolveWorktreeContext(cwd = process.cwd()): WorktreeContext {
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

export function buildContextBootstrapArgs(kind: WorktreeKind, args: string[]): string[] {
  const bootstrapArgs = kind === "linked" ? ["--anon"] : [];
  if (args.includes("--no-branch")) {
    bootstrapArgs.push("--no-branch");
  }
  return bootstrapArgs;
}

export function selectDevRunner(kind: WorktreeKind): string {
  return kind === "main" ? "run-primary-dev.ts" : "run-worktree-dev.ts";
}

function runDependencyBootstrap(context: WorktreeContext, args: string[]): void {
  const result = spawnSync(
    process.execPath,
    [
      path.join(context.repoRoot, "scripts", "bootstrap-worktree.ts"),
      ...buildContextBootstrapArgs(context.kind, args),
    ],
    {
      cwd: context.repoRoot,
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

async function runDev(context: WorktreeContext, args: string[]): Promise<void> {
  const runnerPath = path.join(context.repoRoot, "scripts", selectDevRunner(context.kind));

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath, ...args], {
      cwd: context.repoRoot,
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
  const context = resolveWorktreeContext();
  runDependencyBootstrap(context, args);
  await runDev(context, args);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
