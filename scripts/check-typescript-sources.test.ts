import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const guardPath = fileURLToPath(new URL("./check-typescript-sources.ts", import.meta.url));

function createTemporaryRepo(): string {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "samebase-typescript-sources-test-"));
  spawnSync("git", ["init"], { cwd: repoRoot, encoding: "utf8" });
  return repoRoot;
}

function trackFile(repoRoot: string, filePath: string): void {
  const absolutePath = path.join(repoRoot, filePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, "", "utf8");
  spawnSync("git", ["add", filePath], { cwd: repoRoot, encoding: "utf8" });
}

function runGuard(repoRoot: string) {
  return spawnSync(process.execPath, [guardPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

describe("check-typescript-sources CLI", () => {
  it("accepts TypeScript and the exact generated JavaScript outputs", () => {
    const repoRoot = createTemporaryRepo();

    try {
      trackFile(repoRoot, "scripts/check.ts");
      trackFile(repoRoot, "apps/samebase/convex/_generated/api.js");
      trackFile(repoRoot, "apps/samebase/convex/_generated/server.js");
      trackFile(repoRoot, "apps/samebase/convex/cloudflareApi/validators.generated.js");
      trackFile(repoRoot, "apps/samebase/convex/convexManagementApi/validators.generated.js");

      const result = runGuard(repoRoot);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("All tracked handwritten source files use TypeScript.");
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("rejects a tracked handwritten JavaScript file through the real CLI", () => {
    const repoRoot = createTemporaryRepo();

    try {
      trackFile(repoRoot, "scripts/manual.mjs");

      const result = runGuard(repoRoot);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("scripts/manual.mjs");
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("rejects generated-looking JavaScript outside the exact allowlist", () => {
    const repoRoot = createTemporaryRepo();

    try {
      trackFile(repoRoot, "apps/samebase/convex/_generated/manual.js");
      trackFile(repoRoot, "scripts/tool.generated.js");

      const result = runGuard(repoRoot);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("apps/samebase/convex/_generated/manual.js");
      expect(result.stderr).toContain("scripts/tool.generated.js");
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
