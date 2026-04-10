import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveDaytonaDevServerCommand } from "./devServerCommand";
import { buildDaytonaSandboxEnvVars } from "./sandboxEnv";

let testDir = "";
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../",
);
const scriptPath = path.join(
  repoRoot,
  "scripts",
  "daytona-write-source-env.js",
);
const convexSyncDevEnvScriptPath = path.join(
  repoRoot,
  "scripts",
  "convex-sync-dev-env.js",
);
const makefilePath = path.join(repoRoot, "Makefile");
const buildIsolatedChildEnv = (
  overrides: Record<string, string> = {},
): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...overrides,
  };

  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_PREFIX;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_OBJECT_DIRECTORY;
  delete env.GIT_COMMON_DIR;

  return env;
};

describe("daytonaLocalBootstrap", () => {
  beforeAll(() => {
    testDir = mkdtempSync(path.join(os.tmpdir(), "noter-daytona-local-"));
  });

  afterAll(() => {
    if (testDir.length > 0 && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

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
        repo: "noter-md/noter",
        branch: "main",
        commitSha: "abc123",
        codexHome: "/home/daytona/.codex",
        daytonaConvexDeployKey: "dev:quiet-robin-508|secret-token",
      }),
    ).toEqual({
      NOTER_VAULT_ID: "vault-123",
      NOTER_REPO: "noter-md/noter",
      NOTER_BRANCH: "main",
      NOTER_COMMIT_SHA: "abc123",
      CODEX_HOME: "/home/daytona/.codex",
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
      ["CONVEX_DEPLOYMENT=dev:quiet-robin-508", ""].join("\n"),
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
          CONVEX_DEPLOYMENT: "local:1c49",
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

  it("fails fast when the source env file is missing CONVEX_DEPLOY_KEY", () => {
    const sourceEnvPath = path.join(testDir, "missing-deploy-key.env.local");
    writeFileSync(
      sourceEnvPath,
      ["CONVEX_DEPLOYMENT=dev:quiet-robin-508", ""].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "node",
      [
        convexSyncDevEnvScriptPath,
        "--check-prereqs",
        "--source-env",
        sourceEnvPath,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: buildIsolatedChildEnv({
          CONVEX_DEPLOY_KEY: "",
        }),
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Missing CONVEX_DEPLOY_KEY in source env file",
    );
    expect(result.stderr).toContain(sourceEnvPath);
  });

  it("validates the source env file when CONVEX_DEPLOY_KEY is present", () => {
    const sourceEnvPath = path.join(testDir, "with-deploy-key.env.local");
    writeFileSync(
      sourceEnvPath,
      [
        "CONVEX_DEPLOYMENT=dev:quiet-robin-508 # team: nicu, project: noter",
        "CONVEX_DEPLOY_KEY=dev:quiet-robin-508|secret-token",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "node",
      [
        convexSyncDevEnvScriptPath,
        "--check-prereqs",
        "--source-env",
        sourceEnvPath,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: buildIsolatedChildEnv({
          CONVEX_DEPLOY_KEY: "",
        }),
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Validated worktree seed source env");
    expect(result.stdout).toContain(sourceEnvPath);
  });

  it("allows daytona-local fallback when no source env is discoverable", () => {
    const emptyDir = mkdtempSync(
      path.join(os.tmpdir(), "noter-no-source-env-"),
    );

    try {
      const result = spawnSync(
        "node",
        [
          convexSyncDevEnvScriptPath,
          "--check-prereqs",
          "--allow-missing-source-env",
        ],
        {
          cwd: emptyDir,
          encoding: "utf8",
          env: buildIsolatedChildEnv(),
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        "No cloud dev source env found; allowing local-only seed env.",
      );
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("runs the source env preflight before make anon", () => {
    const makefile = readFileSync(makefilePath, "utf8");

    expect(makefile).toContain(
      "node ./scripts/convex-sync-dev-env.js --check-prereqs",
    );
    expect(makefile).toContain("--allow-missing-source-env");
    expect(makefile).toContain(
      "KILLPORT_GOAL = $(firstword $(filter-out killport,$(MAKECMDGOALS)))",
    );
    expect(makefile).toContain("apps/noter/.env.local");
    expect(makefile).toMatch(
      /^anon:\s*\n\s*\$\(MAKE\) killport\n\s*\$\(ANON_VALIDATE_SOURCE_ENV_CMD\)/m,
    );
    expect(makefile).toMatch(
      /^anon-once:\s*\n\s*\$\(MAKE\) killport\n\s*\$\(ANON_VALIDATE_SOURCE_ENV_CMD\)/m,
    );
    expect(makefile).toMatch(/^killport:\s*$/m);
    expect(makefile).not.toContain("kill-port:");
    expect(makefile).toContain("ANON_ALLOW_MISSING_SOURCE_ENV=1; \\");
  });

  it("killport reads the stored anon backend port from apps/noter/.env.local", async () => {
    const killportDir = mkdtempSync(path.join(testDir, "killport-"));
    const envDir = path.join(killportDir, "apps", "noter");
    mkdirSync(envDir, { recursive: true });

    const listener = await startListeningChild();
    try {
      writeFileSync(
        path.join(envDir, ".env.local"),
        `VITE_CONVEX_URL=http://127.0.0.1:${listener.port}\n`,
      );

      const result = spawnSync("make", ["-f", makefilePath, "killport"], {
        cwd: killportDir,
        encoding: "utf8",
        env: buildIsolatedChildEnv(),
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        `Sent SIGTERM to ${listener.pid} on port ${listener.port}.`,
      );
      await listener.exited;
    } finally {
      listener.child.kill("SIGKILL");
      await listener.exited;
      rmSync(killportDir, { recursive: true, force: true });
    }
  });
});

const startListeningChild = async () => {
  const child = spawn(
    process.execPath,
    [
      "-e",
      `import { createServer } from "node:net";
const server = createServer();
process.on("SIGTERM", () => process.exit(0));
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address && typeof address !== "string") console.log(address.port);
});
setInterval(() => {}, 1000);`,
    ],
    {
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  const portChunk = await new Promise<Buffer>((resolve, reject) => {
    child.stdout.once("data", (chunk: Buffer) => resolve(chunk));
    child.once("error", reject);
  });
  const port = Number(String(portChunk).trim());

  return {
    child,
    pid: child.pid ?? -1,
    port,
    exited: once(child, "exit").then(() => undefined),
  };
};
