import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { resolveWorktreeKind } from "./run-dev.ts";

describe("run-dev", () => {
  it("detects main and linked Git worktrees", () => {
    const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "samebase-app-run-dev-test-"));
    const mainWorktree = path.join(temporaryDirectory, "main");
    const linkedWorktree = path.join(temporaryDirectory, "linked");

    try {
      execFileSync("git", ["init", "--initial-branch=main", mainWorktree], { stdio: "pipe" });
      execFileSync(
        "git",
        [
          "-C",
          mainWorktree,
          "-c",
          "user.name=Samebase test",
          "-c",
          "user.email=test@samebase.com",
          "commit",
          "--allow-empty",
          "-m",
          "Initial commit",
        ],
        { stdio: "pipe" },
      );
      execFileSync("git", ["-C", mainWorktree, "worktree", "add", "--detach", linkedWorktree], {
        stdio: "pipe",
      });

      expect(resolveWorktreeKind(mainWorktree)).toBe("main");
      expect(resolveWorktreeKind(linkedWorktree)).toBe("linked");
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
