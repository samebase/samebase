import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vite-plus/test";

import {
  buildCodexSpawnInvocation,
  buildCodexRuntimeSpawnInvocation,
  detectCodexVersion,
  buildMachineHeartbeatBody,
  buildNoterConnectConfigUrl,
  CodexLocalControlRuntime,
  buildCodexSpawnOptions,
  buildDirectConnectCommand,
  buildDirectRunCommand,
  buildMachineConnectUrl,
  createCodexLocalControlRouter,
  formatBootstrapReadyMarkdown,
  formatConnectorRunningMarkdown,
  formatHelpText,
  getNoterConfigPath,
  getNoterStateDirectory,
  localControlStatusIsReady,
  NOTER_SYNC_SOURCE_URL,
  parseCliArgs,
  parseCloudflaredQuickTunnelUrl,
  readLocalConfig,
  resolveEntrypointUrl,
  runHeartbeatLoop,
  startLocalCodexControlServer,
  validateConvexSiteUrl,
  validateSourceUrl,
  writeLocalConfig,
} from "./noter.ts";

function readLocalGitEnvKeys() {
  const result = spawnSync("git", ["rev-parse", "--local-env-vars"], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      `Expected git rev-parse --local-env-vars to succeed: ${result.stderr}`,
    );
  }

  return result.stdout.split(/\r?\n/u).filter((value) => value.length > 0);
}

const LOCAL_GIT_ENV_KEYS = readLocalGitEnvKeys();

function buildIsolatedGitEnv() {
  const env = { ...process.env };

  // Hooks export repo-local Git variables. Ask Git for the full list so test
  // repos do not accidentally mutate the caller's real worktree state.
  for (const key of LOCAL_GIT_ENV_KEYS) {
    delete env[key];
  }

  return env;
}

type ThreadSummaryFixture = {
  id: string;
  name: string | null;
  preview: string;
  cwd: string;
  project: {
    id: string;
    label: string;
    rootCwd: string;
  };
  workspace: {
    label: string | null;
    isProjectRoot: boolean;
  };
  createdAt: number;
  updatedAt: number;
  cliVersion: string;
  modelProvider: string;
  sourceLabel: string;
  source: string;
  status: {
    type: string;
    activeFlags: string[];
    raw: {
      type: string;
    };
  };
  gitInfo: null;
  path: string;
  agentNickname: string | null;
  agentRole: string | null;
  turns: unknown[];
  raw: null;
};

function buildThreadSummaryFixture(
  overrides: Partial<ThreadSummaryFixture> = {},
): ThreadSummaryFixture {
  return {
    id: "thread-fixture",
    name: null,
    preview: "Fixture thread",
    cwd: "/tmp/noter",
    project: {
      id: "/tmp/noter",
      label: "noter",
      rootCwd: "/tmp/noter",
    },
    workspace: {
      label: null,
      isProjectRoot: true,
    },
    createdAt: 1,
    updatedAt: 2,
    cliVersion: "0.114.0",
    modelProvider: "openai",
    sourceLabel: "vscode",
    source: "vscode",
    status: {
      type: "idle",
      activeFlags: [],
      raw: { type: "idle" },
    },
    gitInfo: null,
    path: "/tmp/noter/thread.jsonl",
    agentNickname: null,
    agentRole: null,
    turns: [],
    raw: null,
    ...overrides,
  };
}

describe("@noter-md/sync", () => {
  it("clears every repo-local git env var before spawning isolated repos", () => {
    const keepKey = "NOTER_TEST_KEEP_ENV";
    const previousKeepValue = process.env[keepKey];
    const previousGitValues = new Map(
      LOCAL_GIT_ENV_KEYS.map((key) => [key, process.env[key]]),
    );

    try {
      process.env[keepKey] = "keep-me";
      for (const key of LOCAL_GIT_ENV_KEYS) {
        process.env[key] = `sentinel-${key.toLowerCase()}`;
      }

      const env = buildIsolatedGitEnv();

      expect(env[keepKey]).toBe("keep-me");
      for (const key of LOCAL_GIT_ENV_KEYS) {
        expect(env[key]).toBeUndefined();
      }
    } finally {
      if (previousKeepValue === undefined) {
        delete process.env[keepKey];
      } else {
        process.env[keepKey] = previousKeepValue;
      }

      for (const [key, value] of previousGitValues) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("defaults the public connect command to noter.md with no extra CLI override", () => {
    expect(parseCliArgs(["connect"])).toEqual({
      command: "connect",
      stateDirectory: null,
      sourceUrl: null,
    });
    expect(NOTER_SYNC_SOURCE_URL).toBe("https://noter.md/noter.ts");
  });

  it("accepts the run command with no extra CLI override", () => {
    expect(parseCliArgs(["run"])).toEqual({
      command: "run",
      stateDirectory: null,
    });
  });

  it("accepts an optional explicit source URL argument for direct hosted execution", () => {
    expect(
      parseCliArgs(["connect", "https://preview.noter.md/noter.ts"]),
    ).toEqual({
      command: "connect",
      stateDirectory: null,
      sourceUrl: "https://preview.noter.md/noter.ts",
    });
  });

  it("accepts an explicit state directory for connect and run", () => {
    expect(
      parseCliArgs([
        "connect",
        "--state-dir",
        "/tmp/noter-worktree",
        "https://preview.noter.md/noter.ts",
      ]),
    ).toEqual({
      command: "connect",
      sourceUrl: "https://preview.noter.md/noter.ts",
      stateDirectory: "/tmp/noter-worktree",
    });
    expect(parseCliArgs(["run", "--state-dir", "/tmp/noter-worktree"])).toEqual(
      {
        command: "run",
        stateDirectory: "/tmp/noter-worktree",
      },
    );
  });

  it("rejects malformed explicit state directory usage", () => {
    expect(() => parseCliArgs(["connect", "--state-dir"])).toThrow(
      "Missing value for --state-dir",
    );
    expect(() =>
      parseCliArgs([
        "connect",
        "--state-dir",
        "/tmp/noter-worktree",
        "--state-dir",
        "/tmp/noter-worktree-2",
      ]),
    ).toThrow("Duplicate option: --state-dir");
    expect(() => parseCliArgs(["run", "--state-dir", ""])).toThrow(
      "The --state-dir option must not be empty.",
    );
    expect(() => parseCliArgs(["run", "--state-dir", "--help"])).toThrow(
      "Invalid value for --state-dir: --help",
    );
    expect(() => parseCliArgs(["run", "extra-arg"])).toThrow(
      "Unexpected argument: extra-arg",
    );
  });

  it("accepts https deploy URLs and localhost http URLs", () => {
    expect(
      validateSourceUrl("https://preview.noter.md/noter.ts").toString(),
    ).toBe("https://preview.noter.md/noter.ts");
    expect(validateSourceUrl("http://127.0.0.1:5174/noter.ts").toString()).toBe(
      "http://127.0.0.1:5174/noter.ts",
    );
  });

  it("normalizes legacy stored installer URLs only when explicitly allowed", () => {
    expect(() =>
      validateSourceUrl("https://preview.noter.md/noter.js"),
    ).toThrow("The installer source URL must point to /noter.ts.");
    expect(
      validateSourceUrl("https://preview.noter.md/noter.js", {
        allowLegacyInstallerPath: true,
      }).toString(),
    ).toBe("https://preview.noter.md/noter.ts");
  });

  it("rejects non-https non-localhost source URLs", () => {
    expect(() => validateSourceUrl("http://example.com/noter.ts")).toThrow(
      "The installer source URL must use https, except for explicit localhost testing.",
    );
  });

  it("accepts https and localhost runtime Convex URLs only", () => {
    expect(validateConvexSiteUrl("https://demo.convex.site").toString()).toBe(
      "https://demo.convex.site/",
    );
    expect(validateConvexSiteUrl("http://127.0.0.1:3210").toString()).toBe(
      "http://127.0.0.1:3210/",
    );
    expect(() => validateConvexSiteUrl("http://example.com")).toThrow(
      "The runtime Convex site URL must use https, except for explicit localhost testing.",
    );
  });

  it("rejects runtime Convex URLs with a path segment", () => {
    expect(() => validateConvexSiteUrl("https://demo.convex.site/api")).toThrow(
      "The runtime Convex site URL must be an origin with no path.",
    );
  });

  it("rejects installer source URLs with query params or hashes", () => {
    expect(() =>
      validateSourceUrl("https://noter.md/noter.ts?preview=1"),
    ).toThrow(
      "The installer source URL must not include credentials, query params, or hashes.",
    );
    expect(() => validateSourceUrl("https://noter.md/noter.ts#branch")).toThrow(
      "The installer source URL must not include credentials, query params, or hashes.",
    );
  });

  it("extracts a quick tunnel URL from cloudflared log lines", () => {
    expect(
      parseCloudflaredQuickTunnelUrl(
        "2026-03-31T12:47:50Z INF |  https://municipal-forests-homeless-highland.trycloudflare.com  |",
      ),
    ).toBe("https://municipal-forests-homeless-highland.trycloudflare.com");
    expect(parseCloudflaredQuickTunnelUrl("no tunnel here")).toBeNull();
  });

  it("recognizes auth-gated local control status readiness", () => {
    expect(
      localControlStatusIsReady(
        {
          service: {
            auth: {
              enforced: true,
              machineId: "machine_123",
              readinessProbePassed: true,
            },
            loopbackOnly: true,
          },
        },
        "machine_123",
      ),
    ).toBe(true);
    expect(
      localControlStatusIsReady(
        {
          service: {
            auth: {
              enforced: true,
              machineId: "machine_other",
              readinessProbePassed: true,
            },
            loopbackOnly: true,
          },
        },
        "machine_123",
      ),
    ).toBe(false);
    expect(
      localControlStatusIsReady(
        {
          service: {
            auth: {
              enforced: true,
              machineId: null,
              readinessProbePassed: true,
            },
            loopbackOnly: true,
          },
        },
        "machine_123",
      ),
    ).toBe(true);
    expect(
      localControlStatusIsReady(
        {
          service: {
            auth: {
              enforced: true,
              machineId: "machine_123",
            },
            loopbackOnly: true,
          },
        },
        "machine_123",
      ),
    ).toBe(false);
  });

  it("persists pinned thread ids in the Codex desktop global state file", async () => {
    const previousCodexHome = process.env.CODEX_HOME;
    const codexHomePath = path.join(
      tmpdir(),
      `noter-codex-home-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const globalStatePath = path.join(
      codexHomePath,
      ".codex-global-state.json",
    );
    mkdirSync(codexHomePath, { recursive: true });
    writeFileSync(
      globalStatePath,
      `${JSON.stringify(
        {
          theme: "dark",
          "pinned-thread-ids": [
            "thread-existing",
            "thread-target",
            "thread-existing",
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    process.env.CODEX_HOME = codexHomePath;

    try {
      const runtime = new CodexLocalControlRuntime("/tmp/noter");

      await expect(
        runtime.threadPin({ threadId: "thread-new" }),
      ).resolves.toMatchObject({
        pinnedThreadIds: ["thread-new", "thread-existing", "thread-target"],
      });
      await expect(
        runtime.threadPin({ threadId: "thread-target" }),
      ).resolves.toMatchObject({
        pinnedThreadIds: ["thread-target", "thread-new", "thread-existing"],
      });
      await expect(
        runtime.threadUnpin({ threadId: "thread-new" }),
      ).resolves.toMatchObject({
        pinnedThreadIds: ["thread-target", "thread-existing"],
      });

      expect(JSON.parse(readFileSync(globalStatePath, "utf8"))).toEqual({
        theme: "dark",
        "pinned-thread-ids": ["thread-target", "thread-existing"],
      });
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = previousCodexHome;
      }
      rmSync(codexHomePath, { recursive: true, force: true });
    }
  });

  it("creates the Codex desktop global state file when pinning the first thread", async () => {
    const previousCodexHome = process.env.CODEX_HOME;
    const codexHomePath = path.join(
      tmpdir(),
      `noter-codex-home-empty-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    process.env.CODEX_HOME = codexHomePath;

    try {
      const runtime = new CodexLocalControlRuntime("/tmp/noter");

      await expect(
        runtime.threadPin({ threadId: "thread-first" }),
      ).resolves.toMatchObject({
        pinnedThreadIds: ["thread-first"],
      });

      expect(
        JSON.parse(
          readFileSync(
            path.join(codexHomePath, ".codex-global-state.json"),
            "utf8",
          ),
        ),
      ).toEqual({
        "pinned-thread-ids": ["thread-first"],
      });
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = previousCodexHome;
      }
      rmSync(codexHomePath, { recursive: true, force: true });
    }
  });

  it("fails closed when the Codex desktop global state file is not a JSON object", async () => {
    const previousCodexHome = process.env.CODEX_HOME;
    const codexHomePath = path.join(
      tmpdir(),
      `noter-codex-home-invalid-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const globalStatePath = path.join(
      codexHomePath,
      ".codex-global-state.json",
    );
    mkdirSync(codexHomePath, { recursive: true });
    writeFileSync(globalStatePath, "[]\n", "utf8");
    process.env.CODEX_HOME = codexHomePath;

    try {
      const runtime = new CodexLocalControlRuntime("/tmp/noter");

      await expect(
        runtime.threadPin({ threadId: "thread-invalid" }),
      ).rejects.toThrow(".codex-global-state.json must contain a JSON object");
      expect(readFileSync(globalStatePath, "utf8")).toBe("[]\n");
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = previousCodexHome;
      }
      rmSync(codexHomePath, { recursive: true, force: true });
    }
  });

  it("serializes overlapping pinned thread updates in the shared desktop state file", async () => {
    const previousCodexHome = process.env.CODEX_HOME;
    const codexHomePath = path.join(
      tmpdir(),
      `noter-codex-home-concurrent-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const globalStatePath = path.join(
      codexHomePath,
      ".codex-global-state.json",
    );
    mkdirSync(codexHomePath, { recursive: true });
    writeFileSync(
      globalStatePath,
      `${JSON.stringify(
        {
          theme: "dark",
          "pinned-thread-ids": ["thread-existing"],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    process.env.CODEX_HOME = codexHomePath;

    try {
      const runtime = new CodexLocalControlRuntime("/tmp/noter");

      await Promise.all([
        runtime.threadPin({ threadId: "thread-first" }),
        runtime.threadPin({ threadId: "thread-second" }),
      ]);

      expect(JSON.parse(readFileSync(globalStatePath, "utf8"))).toEqual({
        theme: "dark",
        "pinned-thread-ids": [
          "thread-second",
          "thread-first",
          "thread-existing",
        ],
      });
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = previousCodexHome;
      }
      rmSync(codexHomePath, { recursive: true, force: true });
    }
  });

  it("routes thread pin and unpin mutations through the shared local control router", async () => {
    const previousCodexHome = process.env.CODEX_HOME;
    const codexHomePath = path.join(
      tmpdir(),
      `noter-codex-home-router-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const globalStatePath = path.join(
      codexHomePath,
      ".codex-global-state.json",
    );
    process.env.CODEX_HOME = codexHomePath;

    const runtime = new CodexLocalControlRuntime("/tmp/noter");
    const router = createCodexLocalControlRouter({ runtime });
    const server = createServer((req, res) => {
      void router(req, res, () => {
        res.statusCode = 404;
        res.end("not found");
      });
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve(undefined);
      });
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP server address");
      }

      const pinResponse = await fetch(
        `http://127.0.0.1:${address.port}/thread/pin`,
        {
          body: JSON.stringify({ threadId: "thread-router" }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );
      expect(pinResponse.status).toBe(200);
      await expect(pinResponse.json()).resolves.toMatchObject({
        pinnedThreadIds: ["thread-router"],
      });
      expect(JSON.parse(readFileSync(globalStatePath, "utf8"))).toEqual({
        "pinned-thread-ids": ["thread-router"],
      });

      const unpinResponse = await fetch(
        `http://127.0.0.1:${address.port}/thread/unpin`,
        {
          body: JSON.stringify({ threadId: "thread-router" }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );
      expect(unpinResponse.status).toBe(200);
      await expect(unpinResponse.json()).resolves.toMatchObject({
        pinnedThreadIds: [],
      });
      expect(JSON.parse(readFileSync(globalStatePath, "utf8"))).toEqual({
        "pinned-thread-ids": [],
      });
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = previousCodexHome;
      }
      rmSync(codexHomePath, { recursive: true, force: true });
    }
  });

  it("creates git worktrees through the shared local control router", async () => {
    const previousCodexHome = process.env.CODEX_HOME;
    const codexHomePath = path.join(
      tmpdir(),
      `noter-codex-home-worktree-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const repoPath = path.join(
      tmpdir(),
      `noter-worktree-router-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    process.env.CODEX_HOME = codexHomePath;
    mkdirSync(repoPath, { recursive: true });
    const gitEnv = buildIsolatedGitEnv();

    expect(
      spawnSync("git", ["init", "-b", "main"], { cwd: repoPath, env: gitEnv })
        .status,
    ).toBe(0);
    expect(
      spawnSync("git", ["config", "user.email", "noter-tests@example.com"], {
        cwd: repoPath,
        env: gitEnv,
      }).status,
    ).toBe(0);
    expect(
      spawnSync("git", ["config", "user.name", "Noter Tests"], {
        cwd: repoPath,
        env: gitEnv,
      }).status,
    ).toBe(0);
    writeFileSync(path.join(repoPath, "README.md"), "# Noter\n", "utf8");
    expect(
      spawnSync("git", ["add", "README.md"], { cwd: repoPath, env: gitEnv })
        .status,
    ).toBe(0);
    expect(
      spawnSync("git", ["commit", "-m", "Initial commit"], {
        cwd: repoPath,
        env: gitEnv,
      }).status,
    ).toBe(0);

    const runtime = new CodexLocalControlRuntime(repoPath);
    const router = createCodexLocalControlRouter({ runtime });
    const server = createServer((req, res) => {
      void router(req, res, () => {
        res.statusCode = 404;
        res.end("not found");
      });
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve(undefined);
      });
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP server address");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/worktree/create`,
        {
          body: JSON.stringify({ cwd: repoPath }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload).toMatchObject({
        worktree: {
          branch: expect.stringMatching(/^codex-machine\//),
          cwd: expect.stringContaining("/worktrees/"),
        },
      });
      expect(statSync(payload.worktree.cwd).isDirectory()).toBe(true);
      expect(
        spawnSync(
          "git",
          ["-C", payload.worktree.cwd, "rev-parse", "--abbrev-ref", "HEAD"],
          { env: gitEnv },
        )
          .stdout.toString()
          .trim(),
      ).toBe(payload.worktree.branch);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = previousCodexHome;
      }
      rmSync(repoPath, { recursive: true, force: true });
      rmSync(codexHomePath, { recursive: true, force: true });
    }
  });

  it("pages thread-list recovery until the requested thread is found", async () => {
    const runtime = new CodexLocalControlRuntime("/tmp/noter");
    const listThreadsMock = vi
      .spyOn(runtime, "listThreads")
      .mockResolvedValueOnce({
        nextCursor: "cursor-2",
        pinnedThreadIds: [],
        runtime: runtime.getSnapshot(),
        threads: [buildThreadSummaryFixture({ id: "thread-1" })],
      })
      .mockResolvedValueOnce({
        nextCursor: null,
        pinnedThreadIds: [],
        runtime: runtime.getSnapshot(),
        threads: [buildThreadSummaryFixture({ id: "thread-target" })],
      });

    const thread = await runtime.readThreadSummaryFromList("thread-target");

    expect(thread?.id).toBe("thread-target");
    expect(listThreadsMock).toHaveBeenCalledTimes(2);
    expect(listThreadsMock.mock.calls[0]?.[0].get("cursor")).toBeNull();
    expect(listThreadsMock.mock.calls[1]?.[0].get("cursor")).toBe("cursor-2");
  });

  it("falls back to thread-list paging when pinned thread repair misses thread/read", async () => {
    const previousCodexHome = process.env.CODEX_HOME;
    const codexHomePath = path.join(
      tmpdir(),
      `noter-codex-home-pinned-fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const globalStatePath = path.join(
      codexHomePath,
      ".codex-global-state.json",
    );
    mkdirSync(codexHomePath, { recursive: true });
    writeFileSync(
      globalStatePath,
      `${JSON.stringify({ "pinned-thread-ids": ["thread-target"] }, null, 2)}\n`,
      "utf8",
    );
    process.env.CODEX_HOME = codexHomePath;

    try {
      const runtime = new CodexLocalControlRuntime("/tmp/noter");
      vi.spyOn(runtime, "sendRequestNoEnsure").mockResolvedValue({
        data: [buildThreadSummaryFixture({ id: "thread-other" })],
        nextCursor: null,
      });
      vi.spyOn(runtime, "readThreadSummary").mockResolvedValue(null);
      const readThreadSummaryFromListMock = vi
        .spyOn(runtime, "readThreadSummaryFromList")
        .mockResolvedValue(buildThreadSummaryFixture({ id: "thread-target" }));

      const result = await runtime.listThreads(new URLSearchParams());

      expect(result.threads.map((thread) => thread.id)).toContain(
        "thread-target",
      );
      expect(readThreadSummaryFromListMock).toHaveBeenCalledWith(
        "thread-target",
      );
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = previousCodexHome;
      }
      rmSync(codexHomePath, { recursive: true, force: true });
    }
  });

  it("searches archived pages when thread-list recovery misses the active inventory", async () => {
    const runtime = new CodexLocalControlRuntime("/tmp/noter");
    const listThreadsMock = vi
      .spyOn(runtime, "listThreads")
      .mockResolvedValueOnce({
        nextCursor: null,
        pinnedThreadIds: [],
        runtime: runtime.getSnapshot(),
        threads: [buildThreadSummaryFixture({ id: "thread-other" })],
      })
      .mockResolvedValueOnce({
        nextCursor: null,
        pinnedThreadIds: [],
        runtime: runtime.getSnapshot(),
        threads: [
          buildThreadSummaryFixture({
            id: "thread-target",
            path: "/tmp/noter/archived_sessions/thread-target.jsonl",
          }),
        ],
      });

    const thread = await runtime.readThreadSummaryFromList("thread-target");

    expect(thread?.id).toBe("thread-target");
    expect(listThreadsMock).toHaveBeenCalledTimes(2);
    expect(listThreadsMock.mock.calls[0]?.[0].get("archived")).toBe("false");
    expect(listThreadsMock.mock.calls[1]?.[0].get("archived")).toBe("true");
  });

  it("falls back to thread-list summaries when thread/read omits createdAt", async () => {
    const runtime = new CodexLocalControlRuntime("/tmp/noter");
    vi.spyOn(runtime, "sendRequestNoEnsure").mockResolvedValue({
      thread: {
        id: "thread-target",
        cwd: "/tmp/noter",
        updatedAt: 20,
        turns: [
          {
            id: "turn-1",
            items: [
              {
                content: [
                  {
                    text: "Reply with exactly READY and nothing else.",
                    text_elements: [],
                    type: "text",
                  },
                ],
                id: "item-1",
                type: "userMessage",
              },
              {
                id: "item-2",
                phase: "final_answer",
                text: "READY",
                type: "agentMessage",
              },
            ],
            status: "completed",
          },
        ],
      },
    });
    vi.spyOn(runtime, "listThreads").mockResolvedValue({
      nextCursor: null,
      pinnedThreadIds: [],
      runtime: runtime.getSnapshot(),
      threads: [
        buildThreadSummaryFixture({
          createdAt: 10,
          id: "thread-target",
          preview: "Recovered preview from the thread list.",
          status: {
            type: "running",
            activeFlags: ["streaming"],
            raw: { type: "running" },
          },
          updatedAt: 20,
        }),
      ],
    });

    const result = await runtime.readThread("thread-target");

    expect(result.thread.createdAt).toBe(10);
    expect(result.thread.preview).toBe(
      "Recovered preview from the thread list.",
    );
    expect(result.thread.status.type).toBe("running");
    expect(result.thread.turns).toHaveLength(1);
    expect(result.thread.turns[0]?.items[1]?.summary).toBe("READY");
  });

  it("stores bootstrap state in one local config file", () => {
    expect(
      getNoterStateDirectory({
        homeDirectory: "/Users/noter",
      }),
    ).toBe(path.join("/Users/noter", ".noter"));
    expect(
      getNoterConfigPath({
        homeDirectory: "/Users/noter",
      }),
    ).toBe(path.join("/Users/noter", ".noter", "config.json"));
  });

  it("supports an explicit state directory for config storage", () => {
    expect(
      getNoterConfigPath({
        stateDirectory: "/tmp/noter/worktrees/ceff",
      }),
    ).toBe(path.join("/tmp/noter/worktrees/ceff", "config.json"));
    expect(
      getNoterConfigPath({
        cwd: "/Users/noter/projects/noter",
        stateDirectory: "./tmp/worktree-state",
      }),
    ).toBe(
      path.resolve(
        "/Users/noter/projects/noter",
        "tmp/worktree-state",
        "config.json",
      ),
    );
  });

  it("reads and writes local config data inside an explicit state directory", () => {
    const stateDirectory = path.join(tmpdir(), `noter-sync-${Date.now()}`);
    const configPath = path.join(stateDirectory, "config.json");

    try {
      expect(
        writeLocalConfig({
          codexVersion: "codex 0.1.2",
          machineCredential: "mmc_123",
          machineId: "machine_123",
          sourceUrl: "https://preview.noter.md/noter.ts",
          stateDirectory,
        }),
      ).toBe(configPath);

      expect(readLocalConfig({ stateDirectory })).toMatchObject({
        codexVersion: "codex 0.1.2",
        machineCredential: "mmc_123",
        machineId: "machine_123",
        sourceUrl: "https://preview.noter.md/noter.ts",
      });
    } finally {
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("keeps the first install timestamp when rewriting the local config file", () => {
    const homeDirectory = path.join(tmpdir(), `noter-sync-${Date.now()}`);
    const configPath = getNoterConfigPath({ homeDirectory });
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      `${JSON.stringify({ installedAt: "2026-03-01T00:00:00.000Z" }, null, 2)}\n`,
      "utf8",
    );

    try {
      expect(
        writeLocalConfig({
          codexVersion: "codex 0.1.2",
          homeDirectory,
          machineCredential: "mmc_123",
          machineId: "machine_123",
          sourceUrl: "https://preview.noter.md/noter.ts",
        }),
      ).toBe(configPath);

      expect(readLocalConfig({ homeDirectory })).toMatchObject({
        codexVersion: "codex 0.1.2",
        installedAt: "2026-03-01T00:00:00.000Z",
        machineCredential: "mmc_123",
        machineId: "machine_123",
        sourceUrl: "https://preview.noter.md/noter.ts",
      });
    } finally {
      rmSync(homeDirectory, { force: true, recursive: true });
    }
  });

  it.runIf(process.platform !== "win32")(
    "writes the local config file with owner-only permissions, including rewrites",
    () => {
      const homeDirectory = path.join(tmpdir(), `noter-sync-${Date.now()}`);
      const configPath = getNoterConfigPath({ homeDirectory });

      try {
        writeLocalConfig({
          codexVersion: "codex 0.1.2",
          homeDirectory,
          machineCredential: "mmc_123",
          machineId: "machine_123",
          sourceUrl: "https://preview.noter.md/noter.ts",
        });
        expect(statSync(configPath).mode & 0o777).toBe(0o600);

        chmodSync(configPath, 0o644);
        writeLocalConfig({
          codexVersion: "codex 0.1.3",
          homeDirectory,
          machineCredential: "mmc_456",
          machineId: "machine_123",
          sourceUrl: "https://preview.noter.md/noter.ts",
        });
        expect(statSync(configPath).mode & 0o777).toBe(0o600);
      } finally {
        rmSync(homeDirectory, { force: true, recursive: true });
      }
    },
  );

  it("builds the browser handoff URL for the current deploy and request id", () => {
    expect(
      buildMachineConnectUrl(
        "https://preview.noter.md/noter.ts",
        "request_123",
      ),
    ).toBe(
      "https://preview.noter.md/machines/connect?openedByCli&requestId=request_123",
    );
  });

  it("includes the state-dir flag in direct commands when requested", () => {
    expect(
      buildDirectConnectCommand(
        "https://preview.noter.md/noter.ts",
        "darwin",
        "/tmp/noter/worktrees/ceff",
      ),
    ).toContain("--state-dir '/tmp/noter/worktrees/ceff'");
    expect(
      buildDirectRunCommand(
        "https://preview.noter.md/noter.ts",
        "darwin",
        "/tmp/noter/worktrees/ceff",
      ),
    ).toContain("--state-dir '/tmp/noter/worktrees/ceff'");
  });

  it("escapes explicit state-dir paths for Windows direct commands", () => {
    expect(
      buildDirectConnectCommand(
        "https://noter.md/noter.ts",
        "win32",
        "C:\\Users\\O'Brien\\.noter",
      ),
    ).toContain("--state-dir 'C:\\Users\\O''Brien\\.noter'");
    expect(
      buildDirectRunCommand(
        "https://noter.md/noter.ts",
        "win32",
        "C:\\Users\\O'Brien\\.noter",
      ),
    ).toContain("--state-dir 'C:\\Users\\O''Brien\\.noter'");
  });

  it("escapes explicit state-dir paths for Unix direct commands", () => {
    expect(
      buildDirectConnectCommand(
        "https://noter.md/noter.ts",
        "darwin",
        "/tmp/O'Brien/.noter",
      ),
    ).toContain(`--state-dir '/tmp/O'"'"'Brien/.noter'`);
    expect(
      buildDirectRunCommand(
        "https://noter.md/noter.ts",
        "darwin",
        "/tmp/O'Brien/.noter",
      ),
    ).toContain(`--state-dir '/tmp/O'"'"'Brien/.noter'`);
  });

  it("builds the deploy-scoped runtime config URL", () => {
    expect(
      buildNoterConnectConfigUrl("https://preview.noter.md/noter.ts"),
    ).toBe("https://preview.noter.md/noter-connect.json");
  });

  it("documents the simple npm commands and advanced direct-file flows", () => {
    expect(formatHelpText()).toContain(
      "noter-sync connect [--state-dir <path>] [source-url]",
    );
    expect(formatHelpText()).toContain("noter-sync run [--state-dir <path>]");
    expect(formatHelpText()).toContain("npx @noter-md/sync connect");
    expect(formatHelpText()).toContain("npx @noter-md/sync run");
    expect(formatHelpText()).toContain("node ./noter.ts connect");
    expect(formatHelpText()).toContain("node ./noter.ts run");
    expect(formatHelpText()).toContain(
      `curl -fsSL 'https://noter.md/noter.ts' | node --input-type=module - connect 'https://noter.md/noter.ts'`,
    );
    expect(formatHelpText()).toContain(
      `curl -fsSL 'https://noter.md/noter.ts' | node --input-type=module - run`,
    );
    expect(formatHelpText()).toContain(
      `curl -fsSL 'https://preview.noter.md/noter.ts' | node --input-type=module - connect 'https://preview.noter.md/noter.ts'`,
    );
    expect(formatHelpText()).toContain(
      `curl.exe -fsSL 'https://noter.md/noter.ts' | node --input-type=module - connect 'https://noter.md/noter.ts'`,
    );
    expect(formatHelpText()).toContain(
      `curl.exe -fsSL 'https://noter.md/noter.ts' | node --input-type=module - run`,
    );
    expect(formatHelpText()).toContain(
      `curl.exe -fsSL 'https://preview.noter.md/noter.ts' | node --input-type=module - connect 'https://preview.noter.md/noter.ts'`,
    );
    expect(formatHelpText()).toContain(`/home/you/.noter/worktrees/ceff`);
  });

  it("builds Windows-safe direct hosted-file commands", () => {
    expect(
      buildDirectConnectCommand("https://noter.md/noter.ts", "win32"),
    ).toBe(
      `curl.exe -fsSL 'https://noter.md/noter.ts' | node --input-type=module - connect 'https://noter.md/noter.ts'`,
    );
    expect(
      buildDirectConnectCommand("https://noter.md/noter.ts", "windows"),
    ).toBe(
      `curl.exe -fsSL 'https://noter.md/noter.ts' | node --input-type=module - connect 'https://noter.md/noter.ts'`,
    );
    expect(buildDirectRunCommand("https://noter.md/noter.ts", "win32")).toBe(
      `curl.exe -fsSL 'https://noter.md/noter.ts' | node --input-type=module - run`,
    );
    expect(buildDirectRunCommand("https://noter.md/noter.ts", "windows")).toBe(
      `curl.exe -fsSL 'https://noter.md/noter.ts' | node --input-type=module - run`,
    );
  });

  it("keeps non-Windows Codex CLI launches direct", () => {
    expect(buildCodexSpawnInvocation(["--version"], "darwin")).toEqual({
      args: ["--version"],
      command: "codex",
    });
    expect(buildCodexSpawnInvocation(["--version"], "macos")).toEqual({
      args: ["--version"],
      command: "codex",
    });
    expect(buildCodexSpawnOptions({ cwd: "/tmp/noter" })).toEqual({
      cwd: "/tmp/noter",
    });
  });

  it("forwards detectCodexVersion env and cwd to the spawned Codex process", () => {
    const tempRoot = path.join(tmpdir(), `noter-codex-version-${Date.now()}`);
    const workspaceRoot = path.join(tempRoot, "workspace");
    const binDirectory = path.join(tempRoot, "bin");
    const originalPath = process.env.PATH;
    const originalWindowsPath = process.env.Path;
    const originalPathext = process.env.PATHEXT;
    const customEnvVar = "NOTER_TEST_CODEX_VERSION";
    const customEnvValue = "codex-custom-version";

    mkdirSync(workspaceRoot, { recursive: true });
    mkdirSync(binDirectory, { recursive: true });
    const expectedOutput = `${realpathSync(workspaceRoot)}|${customEnvValue}`;

    if (process.platform === "win32") {
      const shimPath = path.join(binDirectory, "codex.cmd");
      const bundledNodePath = path.join(binDirectory, "node.exe");
      const scriptPath = path.join(
        binDirectory,
        "node_modules",
        "@openai",
        "codex",
        "dist",
        "cli.js",
      );

      mkdirSync(path.dirname(scriptPath), { recursive: true });
      writeFileSync(
        shimPath,
        `@ECHO off\r\n"%_prog%" "%dp0%\\node_modules\\@openai\\codex\\dist\\cli.js" %*\r\n`,
        "utf8",
      );
      copyFileSync(process.execPath, bundledNodePath);
      writeFileSync(
        scriptPath,
        `process.stdout.write(\`\${process.cwd()}|\${process.env.${customEnvVar} ?? ''}\n\`)`,
        "utf8",
      );
      process.env.PATHEXT = ".CMD;.EXE";
    } else {
      const shimPath = path.join(binDirectory, "codex");
      writeFileSync(
        shimPath,
        `#!/bin/sh
printf '%s|%s\\n' "$PWD" "$${customEnvVar}"`,
        "utf8",
      );
      chmodSync(shimPath, 0o755);
    }

    process.env.PATH = binDirectory;
    process.env.Path = binDirectory;

    try {
      expect(
        detectCodexVersion({
          cwd: workspaceRoot,
          env: {
            ...process.env,
            PATH: binDirectory,
            Path: binDirectory,
            PATHEXT: process.env.PATHEXT,
            [customEnvVar]: customEnvValue,
          },
        }),
      ).toBe(expectedOutput);
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      if (originalWindowsPath === undefined) {
        delete process.env.Path;
      } else {
        process.env.Path = originalWindowsPath;
      }
      if (originalPathext === undefined) {
        delete process.env.PATHEXT;
      } else {
        process.env.PATHEXT = originalPathext;
      }
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it("routes Windows one-off and runtime Codex launches through the shim-selected Node runtime", () => {
    const tempRoot = path.join(tmpdir(), `noter-codex-shim-${Date.now()}`);
    const binDirectory = path.join(tempRoot, "bin");
    const shimPath = path.join(binDirectory, "codex.cmd");
    const bundledNodePath = path.join(binDirectory, "node.exe");
    const scriptPath = path.join(
      binDirectory,
      "node_modules",
      "@openai",
      "codex",
      "dist",
      "cli.js",
    );
    const originalPath = process.env.PATH;
    const originalWindowsPath = process.env.Path;
    const originalPathext = process.env.PATHEXT;

    mkdirSync(path.dirname(scriptPath), { recursive: true });
    writeFileSync(
      shimPath,
      `@ECHO off\r\n"%_prog%" "%dp0%\\node_modules\\@openai\\codex\\dist\\cli.js" %*\r\n`,
      "utf8",
    );
    writeFileSync(bundledNodePath, "", "utf8");
    writeFileSync(scriptPath, 'console.log("codex")\n', "utf8");
    process.env.PATH = binDirectory;
    process.env.Path = binDirectory;
    process.env.PATHEXT = ".CMD;.EXE";

    try {
      const expectedInvocation = {
        args: [realpathSync(scriptPath), "app-server", "--listen", "stdio://"],
        command: realpathSync(bundledNodePath),
      };

      expect(
        buildCodexSpawnInvocation(
          ["app-server", "--listen", "stdio://"],
          "win32",
        ),
      ).toEqual(expectedInvocation);
      expect(
        buildCodexRuntimeSpawnInvocation(
          ["app-server", "--listen", "stdio://"],
          "win32",
        ),
      ).toEqual(expectedInvocation);
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      if (originalWindowsPath === undefined) {
        delete process.env.Path;
      } else {
        process.env.Path = originalWindowsPath;
      }
      if (originalPathext === undefined) {
        delete process.env.PATHEXT;
      } else {
        process.env.PATHEXT = originalPathext;
      }
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it("resolves Windows Volta-managed Codex shims from the caller workspace cwd", async () => {
    const tempRoot = path.join(tmpdir(), `noter-codex-volta-${Date.now()}`);
    const binDirectory = path.join(tempRoot, "bin");
    const topLevelCodexShimPath = path.join(binDirectory, "codex.cmd");
    const voltaPath = path.join(binDirectory, "volta.exe");
    const workspaceA = path.join(tempRoot, "workspace-a");
    const workspaceB = path.join(tempRoot, "workspace-b");
    const packageShimBaseName = "codex-package";
    const packageShimPathA = path.join(
      workspaceA,
      `${packageShimBaseName}.cmd`,
    );
    const packageShimPathB = path.join(
      workspaceB,
      `${packageShimBaseName}.cmd`,
    );
    const bundledNodePathA = path.join(workspaceA, "node.exe");
    const bundledNodePathB = path.join(workspaceB, "node.exe");
    const scriptPathA = path.join(
      workspaceA,
      "node_modules",
      "@openai",
      "codex",
      "dist",
      "cli.js",
    );
    const scriptPathB = path.join(
      workspaceB,
      "node_modules",
      "@openai",
      "codex",
      "dist",
      "cli.js",
    );
    const originalPath = process.env.PATH;
    const originalWindowsPath = process.env.Path;
    const originalPathext = process.env.PATHEXT;

    mkdirSync(binDirectory, { recursive: true });
    mkdirSync(path.dirname(scriptPathA), { recursive: true });
    mkdirSync(path.dirname(scriptPathB), { recursive: true });
    writeFileSync(
      topLevelCodexShimPath,
      "@echo off\r\nvolta run %~n0 %*\r\n",
      "utf8",
    );
    writeFileSync(voltaPath, "", "utf8");
    writeFileSync(
      packageShimPathA,
      `@ECHO off\r\n"%_prog%" "%dp0%\\node_modules\\@openai\\codex\\dist\\cli.js" %*\r\n`,
      "utf8",
    );
    writeFileSync(
      packageShimPathB,
      `@ECHO off\r\n"%_prog%" "%dp0%\\node_modules\\@openai\\codex\\dist\\cli.js" %*\r\n`,
      "utf8",
    );
    copyFileSync(process.execPath, bundledNodePathA);
    copyFileSync(process.execPath, bundledNodePathB);
    writeFileSync(scriptPathA, 'console.log("codex-a")\n', "utf8");
    writeFileSync(scriptPathB, 'console.log("codex-b")\n', "utf8");
    process.env.PATH = binDirectory;
    process.env.Path = binDirectory;
    process.env.PATHEXT = ".CMD;.EXE";

    try {
      vi.resetModules();
      const actualChildProcess =
        await vi.importActual<typeof import("node:child_process")>(
          "node:child_process",
        );
      const spawnSyncMock = vi.fn((command, args, options) => {
        if (command !== voltaPath) {
          return actualChildProcess.spawnSync(command, args, options);
        }

        const packageCommandPath =
          options?.cwd === workspaceA
            ? path.join(workspaceA, packageShimBaseName)
            : options?.cwd === workspaceB
              ? path.join(workspaceB, packageShimBaseName)
              : null;

        return {
          output: [
            null,
            packageCommandPath ? `${packageCommandPath}\n` : "",
            "",
          ],
          pid: 1,
          signal: null,
          status: packageCommandPath === null ? 1 : 0,
          stderr: "",
          stdout: packageCommandPath ? `${packageCommandPath}\n` : "",
        };
      });
      vi.doMock("node:child_process", () => ({
        ...actualChildProcess,
        spawnSync: spawnSyncMock,
      }));
      const {
        buildCodexSpawnInvocation: buildCodexSpawnInvocationWithMock,
        buildCodexRuntimeSpawnInvocation:
          buildCodexRuntimeSpawnInvocationWithMock,
      } = await import("./noter.ts");

      expect(
        buildCodexSpawnInvocationWithMock(["--version"], "win32", {
          cwd: workspaceA,
        }),
      ).toEqual({
        args: [realpathSync(scriptPathA), "--version"],
        command: realpathSync(bundledNodePathA),
      });
      expect(
        buildCodexRuntimeSpawnInvocationWithMock(["--version"], "win32", {
          cwd: workspaceB,
        }),
      ).toEqual({
        args: [realpathSync(scriptPathB), "--version"],
        command: realpathSync(bundledNodePathB),
      });
      expect(spawnSyncMock).toHaveBeenNthCalledWith(
        1,
        voltaPath,
        ["which", "codex"],
        expect.objectContaining({
          cwd: workspaceA,
          encoding: "utf8",
          env: process.env,
          timeout: 5_000,
          windowsHide: true,
        }),
      );
      expect(spawnSyncMock).toHaveBeenNthCalledWith(
        2,
        voltaPath,
        ["which", "codex"],
        expect.objectContaining({
          cwd: workspaceB,
          encoding: "utf8",
          env: process.env,
          timeout: 5_000,
          windowsHide: true,
        }),
      );
    } finally {
      vi.doUnmock("node:child_process");
      vi.resetModules();
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      if (originalWindowsPath === undefined) {
        delete process.env.Path;
      } else {
        process.env.Path = originalWindowsPath;
      }
      if (originalPathext === undefined) {
        delete process.env.PATHEXT;
      } else {
        process.env.PATHEXT = originalPathext;
      }
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it("surfaces stale Windows Codex shims as missing CLI diagnostics", () => {
    const tempRoot = path.join(tmpdir(), `noter-codex-stale-${Date.now()}`);
    const binDirectory = path.join(tempRoot, "bin");
    const shimPath = path.join(binDirectory, "codex.cmd");
    const bundledNodePath = path.join(binDirectory, "node.exe");
    const originalPath = process.env.PATH;
    const originalWindowsPath = process.env.Path;
    const originalPathext = process.env.PATHEXT;

    mkdirSync(binDirectory, { recursive: true });
    writeFileSync(
      shimPath,
      `@ECHO off\r\n"%_prog%" "%dp0%\\missing\\cli.js" %*\r\n`,
      "utf8",
    );
    writeFileSync(bundledNodePath, "", "utf8");
    process.env.PATH = binDirectory;
    process.env.Path = binDirectory;
    process.env.PATHEXT = ".CMD;.EXE";

    try {
      expect(() => buildCodexSpawnInvocation(["--version"], "win32")).toThrow(
        /The `codex` command was not found\./,
      );
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      if (originalWindowsPath === undefined) {
        delete process.env.Path;
      } else {
        process.env.Path = originalWindowsPath;
      }
      if (originalPathext === undefined) {
        delete process.env.PATHEXT;
      } else {
        process.env.PATHEXT = originalPathext;
      }
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it.runIf(process.platform === "win32")(
    "preserves literal Windows Codex args that contain cmd metacharacters",
    () => {
      const tempRoot = path.join(tmpdir(), `noter-codex-literal-${Date.now()}`);
      const binDirectory = path.join(tempRoot, "bin");
      const shimPath = path.join(binDirectory, "codex.cmd");
      const scriptPath = path.join(binDirectory, "codex-script.js");
      const originalPath = process.env.PATH;
      const originalWindowsPath = process.env.Path;
      const originalPathext = process.env.PATHEXT;
      const nodeDirectory = path.dirname(process.execPath);
      const literalArg = "C:\\tmp\\%USERPROFILE%\\A&B\\literal^caret";

      mkdirSync(binDirectory, { recursive: true });
      writeFileSync(
        shimPath,
        [
          "@ECHO OFF",
          "SETLOCAL",
          "SET PATHEXT=%PATHEXT:;.JS;=;%",
          'node  "%~dp0\\codex-script.js" %*',
        ].join("\r\n"),
        "utf8",
      );
      writeFileSync(
        scriptPath,
        "process.stdout.write(JSON.stringify(process.argv.slice(2)))\n",
        "utf8",
      );
      process.env.PATH = `${binDirectory};${nodeDirectory}`;
      process.env.Path = `${binDirectory};${nodeDirectory}`;
      process.env.PATHEXT = ".CMD;.EXE";

      try {
        const invocation = buildCodexSpawnInvocation(
          ["echo-argv", literalArg],
          "win32",
        );
        const result = spawnSync(invocation.command, invocation.args, {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: process.env.PATH,
            PATHEXT: process.env.PATHEXT,
            Path: process.env.Path,
          },
        });

        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect(JSON.parse(result.stdout)).toEqual(["echo-argv", literalArg]);
      } finally {
        if (originalPath === undefined) {
          delete process.env.PATH;
        } else {
          process.env.PATH = originalPath;
        }
        if (originalWindowsPath === undefined) {
          delete process.env.Path;
        } else {
          process.env.Path = originalWindowsPath;
        }
        if (originalPathext === undefined) {
          delete process.env.PATHEXT;
        } else {
          process.env.PATHEXT = originalPathext;
        }
        rmSync(tempRoot, { force: true, recursive: true });
      }
    },
  );

  it.runIf(process.platform !== "win32")(
    "resolves symlinked entrypoints before checking direct execution",
    () => {
      const tempDirectory = path.join(
        tmpdir(),
        `noter-sync-link-${Date.now()}`,
      );
      mkdirSync(tempDirectory, { recursive: true });
      const symlinkPath = path.join(tempDirectory, "noter-sync");

      try {
        symlinkSync(path.resolve("packages/sync/noter.ts"), symlinkPath);

        expect(resolveEntrypointUrl(symlinkPath)).toBe(
          pathToFileURL(path.resolve("packages/sync/noter.ts")).href,
        );
      } finally {
        rmSync(tempDirectory, { force: true, recursive: true });
      }
    },
  );

  it("formats bootstrap status as markdown for terminal and LLM consumption", () => {
    const runCommand = buildDirectRunCommand("https://noter.md/noter.ts");
    expect(
      formatBootstrapReadyMarkdown({
        codexVersion: "codex 0.1.2",
        configPath: "/Users/noter/.noter/config.json",
        machineConnectUrl:
          "https://noter.md/machines/connect?openedByCli&requestId=request_123",
        machineId: "machine_123",
        runCommand,
        sourceUrl: "https://noter.md/noter.ts",
      }),
    ).toBe(`# noter sync bootstrap ready

- source: https://noter.md/noter.ts
- codex: codex 0.1.2
- machine: machine_123
- state: /Users/noter/.noter/config.json
- next: https://noter.md/machines/connect?openedByCli&requestId=request_123
- run: ${runCommand}`);
  });

  it("prints the initial live-control diagnosis in the connector summary", () => {
    expect(
      formatConnectorRunningMarkdown({
        liveControlDetail:
          "The `cloudflared` command was not found. Install cloudflared before using mobile live control.",
        liveControlStatus: "unavailable",
        localControlOrigin: "http://127.0.0.1:57479",
        machineId: "machine_123",
        sourceUrl: "https://noter.md/noter.ts",
      }),
    ).toBe(`# noter sync connector running

- source: https://noter.md/noter.ts
- machine: machine_123
- local-control: http://127.0.0.1:57479
- live-control: unavailable
- live-control-detail: The \`cloudflared\` command was not found. Install cloudflared before using mobile live control.
- status: publishing heartbeats until this process exits`);
  });

  it("builds heartbeat payloads that advertise live-control readiness", () => {
    expect(
      buildMachineHeartbeatBody({
        connectorVersion: "noter-sync (codex 0.1.2)",
        displayName: "Research MacBook Pro",
        hostname: "research-mbp.local",
        machineId: "machine_123",
        os: "macos",
        readLiveControlState: () => ({
          controlStatus: "ready",
          controlStatusDetail: "Live control ready.",
          controlUrl: "https://research-machine.trycloudflare.com",
          controlUrlUpdatedAt: 1_775_379_530_000,
        }),
        status: "online",
      }),
    ).toEqual({
      allowedRoots: [],
      capabilities: ["presence", "liveControl"],
      connectorVersion: "noter-sync (codex 0.1.2)",
      controlStatus: "ready",
      controlStatusDetail: "Live control ready.",
      controlUrl: "https://research-machine.trycloudflare.com",
      controlUrlUpdatedAt: 1_775_379_530_000,
      displayName: "Research MacBook Pro",
      hostname: "research-mbp.local",
      machineId: "machine_123",
      os: "macos",
      status: "online",
    });
  });

  it.runIf(process.platform !== "win32")(
    "stops the heartbeat loop when the machine credential is not approved",
    async () => {
      const originalFetch = global.fetch;
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid machine credential" }), {
          headers: {
            "content-type": "application/json",
          },
          status: 401,
        }),
      );
      global.fetch = fetchMock;

      try {
        await expect(
          runHeartbeatLoop({
            connectorVersion: "noter-sync (codex 0.1.2)",
            displayName: "Research MacBook Pro",
            heartbeatUrl:
              "https://demo.convex.site/connected-machines/heartbeat",
            hostname: "research-mbp.local",
            machineCredential: "mmc_invalid",
            machineId: "machine_123",
            os: "macos",
          }),
        ).rejects.toThrow(
          "This machine is not approved yet. Finish approval in Noter and retry `noter-sync run`.",
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
      } finally {
        global.fetch = originalFetch;
      }
    },
  );

  it("routes prefixed status requests through the shared local control router", async () => {
    const statusPayload = {
      workspaceRoot: "/tmp/noter",
      codexInstalled: true,
      codexVersion: "codex 0.1.2",
      codexInstallError: null,
      runtime: {
        running: false,
        initialized: false,
        startedAt: null,
        currentThreadId: null,
        lastError: null,
        lastExitCode: null,
        lastExitSignal: null,
        pendingRequestCount: 0,
        pendingApprovalCount: 0,
        eventCursor: 0,
      },
    };
    const runtime = {
      getStatus: vi.fn().mockResolvedValue(statusPayload),
    };
    const router = createCodexLocalControlRouter({
      routeBasePath: "/control",
      runtime,
    });
    const server = createServer((req, res) => {
      void router(req, res, () => {
        res.statusCode = 404;
        res.end("not found");
      });
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve(undefined);
      });
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP server address");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/control/status`,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ...statusPayload,
        service: {
          auth: {
            allowedOrigins: [],
            enforced: false,
            machineId: null,
            mode: "disabled",
            positiveCacheSize: 0,
          },
          loopbackOnly: false,
          routeBasePath: "/control",
        },
      });
      expect(runtime.getStatus).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
    }
  });

  it("rejects unauthenticated thread reads when machine-control auth is enabled", async () => {
    const runtime = {
      ensureRuntime: vi.fn().mockResolvedValue({
        runtime: {
          running: false,
        },
        success: true,
      }),
      listThreads: vi.fn(),
    };
    const router = createCodexLocalControlRouter({
      machineControlAuth: {
        allowedOrigins: ["https://noter.md"],
        introspectionUrl:
          "https://noter.md/connected-machines/control/introspect",
        machineId: "machine_123",
      },
      runtime,
    });
    const server = createServer((req, res) => {
      void router(req, res);
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve(undefined);
      });
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP server address");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/threads`, {
        headers: {
          Origin: "https://noter.md",
        },
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: "Missing bearer token.",
      });
      expect(runtime.ensureRuntime).not.toHaveBeenCalled();
      expect(runtime.listThreads).not.toHaveBeenCalled();
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "https://noter.md",
      );
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
    }
  });

  it("accepts loopback origins across localhost port changes", async () => {
    const runtime = {
      ensureRuntime: vi.fn().mockResolvedValue({
        runtime: {
          running: false,
        },
        success: true,
      }),
      listThreads: vi.fn(),
    };
    const router = createCodexLocalControlRouter({
      machineControlAuth: {
        allowedOrigins: ["http://localhost:5198"],
        introspectionUrl:
          "https://noter.md/connected-machines/control/introspect",
        machineId: "machine_123",
      },
      runtime,
    });
    const server = createServer((req, res) => {
      void router(req, res);
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve(undefined);
      });
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP server address");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/threads`, {
        headers: {
          Origin: "http://localhost:5174",
        },
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: "Missing bearer token.",
      });
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "http://localhost:5174",
      );
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
    }
  });

  it("keeps localhost-origin allowances scoped to loopback browsers", async () => {
    const runtime = {
      ensureRuntime: vi.fn(),
      listThreads: vi.fn(),
    };
    const router = createCodexLocalControlRouter({
      machineControlAuth: {
        allowedOrigins: ["http://localhost:5198"],
        introspectionUrl:
          "https://noter.md/connected-machines/control/introspect",
        machineId: "machine_123",
      },
      runtime,
    });
    const server = createServer((req, res) => {
      void router(req, res);
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve(undefined);
      });
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP server address");
      }

      const crossSchemeResponse = await fetch(
        `http://127.0.0.1:${address.port}/threads`,
        {
          headers: {
            Origin: "https://localhost:5174",
          },
        },
      );
      expect(crossSchemeResponse.status).toBe(403);
      expect(await crossSchemeResponse.json()).toEqual({
        error: "Origin is not allowed: https://localhost:5174",
      });
      expect(
        crossSchemeResponse.headers.get("access-control-allow-origin"),
      ).toBeNull();

      const crossHostnameResponse = await fetch(
        `http://127.0.0.1:${address.port}/threads`,
        {
          headers: {
            Origin: "http://127.0.0.1:5174",
          },
        },
      );
      expect(crossHostnameResponse.status).toBe(403);
      expect(await crossHostnameResponse.json()).toEqual({
        error: "Origin is not allowed: http://127.0.0.1:5174",
      });
      expect(
        crossHostnameResponse.headers.get("access-control-allow-origin"),
      ).toBeNull();

      const response = await fetch(`http://127.0.0.1:${address.port}/threads`, {
        headers: {
          Origin: "https://evil.example.com",
        },
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "Origin is not allowed: https://evil.example.com",
      });
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
    }
  });

  it("returns redacted status without runtime metadata when auth is enabled", async () => {
    const runtime = {
      getStatus: vi.fn().mockResolvedValue({
        runtime: {
          running: true,
        },
        workspaceRoot: "/repo",
      }),
    };
    const router = createCodexLocalControlRouter({
      machineControlAuth: {
        allowedOrigins: ["https://noter.md"],
        introspectionUrl:
          "https://noter.md/connected-machines/control/introspect",
        machineId: "machine_123",
      },
      runtime,
    });
    const server = createServer((req, res) => {
      void router(req, res);
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve(undefined);
      });
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP server address");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/status`, {
        headers: {
          Origin: "https://noter.md",
        },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        service: {
          auth: {
            enforced: true,
            machineId: null,
            mode: "machine-control",
          },
          loopbackOnly: false,
          routeBasePath: "",
        },
      });
      expect(runtime.getStatus).not.toHaveBeenCalled();
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "https://noter.md",
      );
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
    }
  });

  it("rejects synthetic bearer tokens on /status before exposing runtime metadata", async () => {
    const runtime = {
      getStatus: vi.fn().mockResolvedValue({
        runtime: {
          running: true,
        },
        workspaceRoot: "/repo",
      }),
    };
    const introspectionServer = createServer((_req, res) => {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          active: false,
        }),
      );
    });

    await new Promise((resolve, reject) => {
      introspectionServer.once("error", reject);
      introspectionServer.listen(0, "127.0.0.1", () => {
        introspectionServer.removeListener("error", reject);
        resolve(undefined);
      });
    });

    const introspectionAddress = introspectionServer.address();
    if (!introspectionAddress || typeof introspectionAddress === "string") {
      throw new Error("Expected a TCP introspection server address");
    }

    const router = createCodexLocalControlRouter({
      machineControlAuth: {
        allowedOrigins: ["https://noter.md"],
        introspectionUrl: `http://127.0.0.1:${introspectionAddress.port}/introspect`,
        machineId: "machine_123",
      },
      runtime,
    });
    const server = createServer((req, res) => {
      void router(req, res);
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve(undefined);
      });
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP server address");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/status`, {
        headers: {
          Authorization: "Bearer mmct_readiness_probe",
          Origin: "https://noter.md",
        },
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: "Machine control token is inactive.",
      });
      expect(runtime.getStatus).not.toHaveBeenCalled();
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
      await new Promise((resolve, reject) => {
        introspectionServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
    }
  });

  it("returns 503 from /status when machine-control introspection is unavailable", async () => {
    const runtime = {
      getStatus: vi.fn(),
    };
    const introspectionServer = createServer((_req, res) => {
      res.statusCode = 503;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          error: "temporarily unavailable",
        }),
      );
    });

    await new Promise((resolve, reject) => {
      introspectionServer.once("error", reject);
      introspectionServer.listen(0, "127.0.0.1", () => {
        introspectionServer.removeListener("error", reject);
        resolve(undefined);
      });
    });

    const introspectionAddress = introspectionServer.address();
    if (!introspectionAddress || typeof introspectionAddress === "string") {
      throw new Error("Expected a TCP introspection server address");
    }

    const router = createCodexLocalControlRouter({
      machineControlAuth: {
        allowedOrigins: ["https://noter.md"],
        introspectionUrl: `http://127.0.0.1:${introspectionAddress.port}/introspect`,
        machineId: "machine_123",
      },
      runtime,
    });
    const server = createServer((req, res) => {
      void router(req, res);
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve(undefined);
      });
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP server address");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/status`, {
        headers: {
          Authorization: "Bearer mmct_readiness_probe",
          Origin: "https://noter.md",
        },
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "Machine control introspection failed: HTTP 503.",
      });
      expect(runtime.getStatus).not.toHaveBeenCalled();
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
      await new Promise((resolve, reject) => {
        introspectionServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
    }
  });

  it("reuses cached positive machine-control introspection results", async () => {
    const runtime = {
      ensureRuntime: vi.fn().mockResolvedValue({
        runtime: {
          running: true,
        },
        success: true,
      }),
      listThreads: vi.fn().mockResolvedValue({
        nextCursor: null,
        pinnedThreadIds: [],
        runtime: {
          currentThreadId: null,
          eventCursor: 0,
          initialized: true,
          lastError: null,
          lastExitCode: null,
          lastExitSignal: null,
          pendingApprovalCount: 0,
          pendingRequestCount: 0,
          running: true,
          startedAt: null,
        },
        threads: [],
      }),
    };
    const introspectionHits = vi.fn();
    const introspectionServer = createServer((req, res) => {
      introspectionHits();
      expect(req.method).toBe("POST");
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          active: true,
          audience: "machine-control",
          expiresAt: Date.now() + 60_000,
          machineId: "machine_123",
          userId: "user_123",
        }),
      );
    });

    await new Promise((resolve, reject) => {
      introspectionServer.once("error", reject);
      introspectionServer.listen(0, "127.0.0.1", () => {
        introspectionServer.removeListener("error", reject);
        resolve(undefined);
      });
    });

    const introspectionAddress = introspectionServer.address();
    if (!introspectionAddress || typeof introspectionAddress === "string") {
      throw new Error("Expected a TCP introspection server address");
    }

    const router = createCodexLocalControlRouter({
      machineControlAuth: {
        allowedOrigins: ["https://noter.md"],
        introspectionUrl: `http://127.0.0.1:${introspectionAddress.port}/introspect`,
        machineId: "machine_123",
      },
      runtime,
    });
    const server = createServer((req, res) => {
      void router(req, res);
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve(undefined);
      });
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP server address");
      }

      const headers = {
        Authorization: "Bearer mmct_fixture",
        Origin: "https://noter.md",
      };

      const firstResponse = await fetch(
        `http://127.0.0.1:${address.port}/threads`,
        { headers },
      );
      expect(firstResponse.status).toBe(200);

      const secondResponse = await fetch(
        `http://127.0.0.1:${address.port}/threads`,
        { headers },
      );
      expect(secondResponse.status).toBe(200);

      expect(introspectionHits).toHaveBeenCalledTimes(1);
      expect(runtime.ensureRuntime).toHaveBeenCalledTimes(2);
      expect(runtime.listThreads).toHaveBeenCalledTimes(2);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
      await new Promise((resolve, reject) => {
        introspectionServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
    }
  });

  it("returns 503 when machine-control introspection stays unavailable", async () => {
    const runtime = {
      ensureRuntime: vi.fn(),
      listThreads: vi.fn(),
    };
    const introspectionServer = createServer((_req, res) => {
      res.statusCode = 503;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          error: "temporarily unavailable",
        }),
      );
    });

    await new Promise((resolve, reject) => {
      introspectionServer.once("error", reject);
      introspectionServer.listen(0, "127.0.0.1", () => {
        introspectionServer.removeListener("error", reject);
        resolve(undefined);
      });
    });

    const introspectionAddress = introspectionServer.address();
    if (!introspectionAddress || typeof introspectionAddress === "string") {
      throw new Error("Expected a TCP introspection server address");
    }

    const router = createCodexLocalControlRouter({
      machineControlAuth: {
        allowedOrigins: ["https://noter.md"],
        introspectionUrl: `http://127.0.0.1:${introspectionAddress.port}/introspect`,
        machineId: "machine_123",
      },
      runtime,
    });
    const server = createServer((req, res) => {
      void router(req, res);
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve(undefined);
      });
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP server address");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/threads`, {
        headers: {
          Authorization: "Bearer mmct_fixture",
          Origin: "https://noter.md",
        },
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "Machine control introspection failed: HTTP 503.",
      });
      expect(runtime.ensureRuntime).not.toHaveBeenCalled();
      expect(runtime.listThreads).not.toHaveBeenCalled();
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
      await new Promise((resolve, reject) => {
        introspectionServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
    }
  });

  it("returns 401 when machine-control introspection marks a token inactive", async () => {
    const runtime = {
      ensureRuntime: vi.fn(),
      listThreads: vi.fn(),
    };
    const introspectionServer = createServer((_req, res) => {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          active: false,
        }),
      );
    });

    await new Promise((resolve, reject) => {
      introspectionServer.once("error", reject);
      introspectionServer.listen(0, "127.0.0.1", () => {
        introspectionServer.removeListener("error", reject);
        resolve(undefined);
      });
    });

    const introspectionAddress = introspectionServer.address();
    if (!introspectionAddress || typeof introspectionAddress === "string") {
      throw new Error("Expected a TCP introspection server address");
    }

    const router = createCodexLocalControlRouter({
      machineControlAuth: {
        allowedOrigins: ["https://noter.md"],
        introspectionUrl: `http://127.0.0.1:${introspectionAddress.port}/introspect`,
        machineId: "machine_123",
      },
      runtime,
    });
    const server = createServer((req, res) => {
      void router(req, res);
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve(undefined);
      });
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP server address");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/threads`, {
        headers: {
          Authorization: "Bearer mmct_fixture",
          Origin: "https://noter.md",
        },
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: "Machine control token is inactive.",
      });
      expect(runtime.ensureRuntime).not.toHaveBeenCalled();
      expect(runtime.listThreads).not.toHaveBeenCalled();
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
      await new Promise((resolve, reject) => {
        introspectionServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(undefined);
        });
      });
    }
  });

  it("starts the local control server on loopback with 404s for unknown routes", async () => {
    const localControlServer = await startLocalCodexControlServer({
      workspaceRoot: process.cwd(),
    });

    try {
      expect(localControlServer.origin.startsWith("http://127.0.0.1:")).toBe(
        true,
      );

      const response = await fetch(`${localControlServer.origin}/missing`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "Unknown Codex research route: /missing",
      });
    } finally {
      await localControlServer.close();
    }
  });
});
