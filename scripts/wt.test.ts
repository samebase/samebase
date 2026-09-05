import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vite-plus/test";

import { resolveRepoRoot } from "./lib/scriptRuntime.ts";
import { trackedFilePath } from "./lib/trackedFilePath.ts";

it("wt skips unavailable worktrees without pruning their registrations", () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "samebase-wt-test-"));
  const repoRoot = path.join(temporaryDirectory, "repo");
  const scriptPath = path.join(resolveRepoRoot(), trackedFilePath("scripts/wt.ts"));

  try {
    mkdirSync(repoRoot);
    const git = (args: string[]) =>
      execFileSync("git", ["-c", "core.hooksPath=", ...args], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

    git(["init", "--initial-branch=main"]);
    git([
      "-c",
      "user.name=Worktree Test",
      "-c",
      "user.email=worktree@example.com",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-m",
      "Initial commit",
    ]);

    for (const branch of ["a-missing", "b-stale", "c-locked", "d-live"]) {
      const worktreePath = path.join(temporaryDirectory, branch);
      git(["worktree", "add", "-b", branch, worktreePath]);
      if (branch === "c-locked") {
        git(["worktree", "lock", worktreePath]);
      }
      if (branch === "b-stale") {
        rmSync(path.join(worktreePath, ".git"));
      } else if (branch !== "d-live") {
        rmSync(worktreePath, { recursive: true, force: true });
      } else {
        writeFileSync(path.join(worktreePath, "untracked.txt"), "local changes\n");
      }
    }

    const registeredWorktrees = git(["worktree", "list", "--porcelain"]);
    for (const command of ["list", "status"]) {
      const output = execFileSync(process.execPath, [scriptPath, command], {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(output).toMatch(/main\s+clean\s+S0 U0 \?0 \+0 -0/);
      expect(output).toMatch(/d-live\s+dirty\s+S0 U0 \?1 \+0 -0/);
      expect(output).not.toContain("a-missing");
      expect(output).not.toContain("b-stale");
      expect(output).not.toContain("c-locked");
    }
    expect(git(["worktree", "list", "--porcelain"])).toBe(registeredWorktrees);

    rmSync(path.join(temporaryDirectory, "d-live", "untracked.txt"));
    const cleanupOutput = execFileSync(
      process.execPath,
      [scriptPath, "clean", "--apply", "--base", "main"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
      },
    );

    expect(cleanupOutput).toContain("done. removed 1, failed 0");
    const remainingWorktrees = git(["worktree", "list", "--porcelain"]);
    expect(remainingWorktrees).toContain("refs/heads/a-missing");
    expect(remainingWorktrees).toContain("refs/heads/b-stale");
    expect(remainingWorktrees).toContain("refs/heads/c-locked");
    expect(remainingWorktrees).not.toContain("refs/heads/d-live");

    const branchCleanupOutput = execFileSync(
      process.execPath,
      [scriptPath, "br-clean", "--base", "main"],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(branchCleanupOutput).toContain("remove candidates (1):\n- d-live");
    expect(branchCleanupOutput).toContain("manual checks (3):");
    for (const branch of ["a-missing", "b-stale", "c-locked"]) {
      expect(branchCleanupOutput).toContain(`- ${branch} (checked out in `);
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
