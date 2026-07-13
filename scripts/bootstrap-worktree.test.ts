import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vite-plus/test";

import { resolveRepoRoot } from "./lib/scriptRuntime.ts";
import { trackedFilePath } from "./lib/trackedFilePath.ts";

describe("bootstrap-worktree", () => {
  it("starts without installed workspace dependencies", () => {
    const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "samebase-bootstrap-test-"));

    try {
      const isolatedScriptPath = path.join(temporaryDirectory, "bootstrap-worktree.ts");
      copyFileSync(
        path.join(resolveRepoRoot(), trackedFilePath("scripts/bootstrap-worktree.ts")),
        isolatedScriptPath,
      );

      const output = execFileSync(process.execPath, [isolatedScriptPath, "--help"], {
        encoding: "utf8",
      });

      expect(output).toContain("Usage: scripts/bootstrap-worktree.ts");
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
