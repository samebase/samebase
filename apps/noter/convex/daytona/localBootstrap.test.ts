import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveDaytonaDevServerCommand } from "./devServerCommand";
import { buildDaytonaSandboxEnvVars } from "./sandboxEnv";

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
        isNoterMonorepo: true,
        preferDaytonaLocalTarget: true,
      }),
    ).toBe("make daytona-local");
  });

  it("fails closed for the noter monorepo when the Daytona target is missing", () => {
    expect(
      resolveDaytonaDevServerCommand({
        hasDaytonaLocalTarget: false,
        hasRunTarget: true,
        hasPackageJson: true,
        hasAnonTarget: true,
        isNoterMonorepo: true,
        preferDaytonaLocalTarget: true,
      }),
    ).toBeNull();
  });

  it("falls back to make run when daytona-local is not preferred", () => {
    expect(
      resolveDaytonaDevServerCommand({
        hasDaytonaLocalTarget: true,
        hasRunTarget: true,
        hasPackageJson: true,
        hasAnonTarget: true,
        isNoterMonorepo: true,
        preferDaytonaLocalTarget: false,
      }),
    ).toBe("make run");
  });

  it("injects the Daytona deploy key into sandbox env vars", () => {
    expect(
      buildDaytonaSandboxEnvVars({
        vaultId: "vault-123",
        repo: "nicu-chiciuc/noter",
        branch: "main",
        commitSha: "abc123",
        codexHome: "/root/.codex",
        daytonaConvexDeployKey: "dev:quiet-robin-508|secret-token",
      }),
    ).toEqual({
      NOTER_VAULT_ID: "vault-123",
      NOTER_REPO: "nicu-chiciuc/noter",
      NOTER_BRANCH: "main",
      NOTER_COMMIT_SHA: "abc123",
      CODEX_HOME: "/root/.codex",
      DAYTONA_CONVEX_DEPLOY_KEY: "dev:quiet-robin-508|secret-token",
    });
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
      [
        "CONVEX_DEPLOYMENT=dev:quiet-robin-508",
        "CONVEX_DEPLOY_KEY=dev:quiet-robin-508|secret-token",
        "",
      ].join("\n"),
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
