import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveDaytonaDevServerCommand } from "./devServerCommand";

const testDir = mkdtempSync(path.join(os.tmpdir(), "noter-daytona-local-"));
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../",
);
const scriptPath = path.join(
  repoRoot,
  "scripts",
  "daytona-write-source-env.js",
);

describe("daytonaLocalBootstrap", () => {
  it("prefers the explicit Daytona wrapper target over make run", () => {
    expect(
      resolveDaytonaDevServerCommand({
        hasDaytonaLocalTarget: true,
        hasRunTarget: true,
        hasPackageJson: true,
        hasAnonTarget: true,
      }),
    ).toBe("make daytona-local");
  });

  it("writes a cloud dev source env file from DAYTONA_CONVEX_DEPLOY_KEY", () => {
    const outputPath = path.join(testDir, "daytona-source.local");
    const result = spawnSync("node", [scriptPath, "--output", outputPath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DAYTONA_CONVEX_DEPLOY_KEY: "dev:quiet-robin-508|secret-token",
        CONVEX_DEPLOYMENT: "local-1c49",
      },
    });

    expect(result.status).toBe(0);
    expect(readFileSync(outputPath, "utf8")).toBe(
      "CONVEX_DEPLOYMENT=dev:quiet-robin-508\n",
    );
  });

  it("removes stale source env output in optional mode when no cloud dev source is available", () => {
    const outputPath = path.join(testDir, "missing-source.local");
    writeFileSync(outputPath, "CONVEX_DEPLOYMENT=dev:stale\n", "utf8");

    const result = spawnSync(
      "node",
      [scriptPath, "--output", outputPath, "--optional"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          DAYTONA_CONVEX_DEPLOY_KEY: "",
          CONVEX_DEPLOYMENT: "local-1c49",
        },
      },
    );

    expect(result.status).toBe(0);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects non-dev Daytona source deployments", () => {
    const outputPath = path.join(testDir, "invalid-source.local");
    const result = spawnSync("node", [scriptPath, "--output", outputPath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DAYTONA_CONVEX_DEPLOY_KEY: "prod:noter|secret-token",
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("cloud dev deployment");
    expect(existsSync(outputPath)).toBe(false);
  });
});
