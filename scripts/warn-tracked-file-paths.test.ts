import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { trackedFilePathsOutputPath } from "./generate-tracked-file-paths.ts";
import {
  formatTrackedFilePathsFreshnessWarning,
  readTrackedFilePathsFreshness,
} from "./warn-tracked-file-paths.ts";

function createRepoWithTrackedGeneratedFile(): string {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "tracked-file-paths-warning-test-"));
  execFileSync("git", ["init"], { cwd: repoRoot });

  const generatedOutputPath = path.join(repoRoot, trackedFilePathsOutputPath);
  mkdirSync(path.dirname(generatedOutputPath), { recursive: true });
  writeFileSync(
    generatedOutputPath,
    "export const trackedFilePaths = [] as const;\nexport type TrackedFilePath = never;\n",
    "utf8",
  );
  execFileSync("git", ["add", trackedFilePathsOutputPath], { cwd: repoRoot });

  return repoRoot;
}

describe("warn-tracked-file-paths", () => {
  it("reports generated output diffs as stale without failing", () => {
    const repoRoot = createRepoWithTrackedGeneratedFile();

    try {
      expect(readTrackedFilePathsFreshness(repoRoot)).toBe("fresh");

      writeFileSync(
        path.join(repoRoot, trackedFilePathsOutputPath),
        'export const trackedFilePaths = ["new-file.ts"] as const;\nexport type TrackedFilePath = (typeof trackedFilePaths)[number];\n',
        "utf8",
      );

      expect(readTrackedFilePathsFreshness(repoRoot)).toBe("stale");
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("documents that stale generated output is warning-only", () => {
    expect(formatTrackedFilePathsFreshnessWarning()).toContain("warning-only");
    expect(formatTrackedFilePathsFreshnessWarning()).toContain("referenced files disappear");
  });
});
