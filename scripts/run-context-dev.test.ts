import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { resolveRepoRoot } from "./lib/scriptRuntime.ts";
import { trackedFilePath } from "./lib/trackedFilePath.ts";
import { buildContextBootstrapArgs, classifyWorktree, selectDevRunner } from "./run-context-dev.ts";

describe("run-context-dev", () => {
  it("uses the primary dev runner when Git dir and common dir match", () => {
    expect(classifyWorktree("/repo/.git", "/repo/.git")).toBe("main");
    expect(selectDevRunner("main")).toBe("run-primary-dev.ts");
  });

  it("uses the anonymous worktree runner when Git dir is per-worktree", () => {
    expect(classifyWorktree("/repo/.git/worktrees/feature", "/repo/.git")).toBe("linked");
    expect(selectDevRunner("linked")).toBe("run-worktree-dev.ts");
    expect(buildContextBootstrapArgs("linked", ["--once"])).toEqual(["--anon"]);
  });

  it("forwards the branch override to the dependency bootstrap", () => {
    expect(buildContextBootstrapArgs("main", ["--no-branch"])).toEqual(["--no-branch"]);
    expect(buildContextBootstrapArgs("linked", ["--once", "--no-branch"])).toEqual([
      "--anon",
      "--no-branch",
    ]);
  });

  it("loads without installed workspace dependencies", () => {
    const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "samebase-context-dev-test-"));

    try {
      const isolatedScriptPath = path.join(temporaryDirectory, "run-context-dev.ts");
      copyFileSync(
        path.join(resolveRepoRoot(), trackedFilePath("scripts/run-context-dev.ts")),
        isolatedScriptPath,
      );

      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `await import(${JSON.stringify(pathToFileURL(isolatedScriptPath).href)})`,
        ],
        { stdio: "pipe" },
      );
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
