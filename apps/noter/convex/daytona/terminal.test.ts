import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DAYTONA_CODEX_HOME, DAYTONA_CODEX_SHARED_HOME } from "./sandboxUser";

const originalDaytonaApiUrl = process.env.DAYTONA_API_URL;
const originalDaytonaApiToken = process.env.DAYTONA_API_TOKEN;

const mockState = vi.hoisted(() => {
  let sandbox: unknown = null;
  const state = {
    get sandbox() {
      return sandbox;
    },
    set sandbox(value: unknown) {
      sandbox = value;
    },
    requestedSessionId: "",
    daytonaGet: vi.fn(async () => {
      if (!sandbox) {
        throw new Error("Sandbox mock is missing.");
      }
      return sandbox;
    }),
    daytonaList: vi.fn(async () => ({ items: [] })),
    getToolboxProxyUrl: vi.fn(async () => ({
      data: { url: "https://toolbox.example" },
    })),
    sentInputs: new Array<string>(),
  };
  state.daytonaGet.mockImplementation(async () => {
    if (!state.sandbox) {
      throw new Error("Sandbox mock is missing.");
    }
    return state.sandbox;
  });
  return state;
});

vi.mock("../common", () => ({
  getUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@daytonaio/api-client", () => ({
  Configuration: class Configuration {},
  SandboxApi: class SandboxApi {
    async getToolboxProxyUrl() {
      return await mockState.getToolboxProxyUrl();
    }
  },
}));

vi.mock("@daytonaio/sdk", () => ({
  Daytona: class Daytona {
    async get() {
      return await mockState.daytonaGet();
    }

    async list() {
      return await mockState.daytonaList();
    }
  },
}));

type FakeCommandResult = {
  exitCode: number;
  result: string;
};

type FakeCreatePtyOptions = {
  id?: string;
  cwd?: string;
  envs?: Record<string, string>;
  cols?: number;
  rows?: number;
  onData?: (data: Uint8Array) => void | Promise<void>;
};

type FakePtyHandle = {
  sessionId: string;
  waitForConnection: () => Promise<void>;
  sendInput: (input: string) => Promise<void>;
  disconnect: () => Promise<void>;
};

type FakeConnectedPtyHandle = {
  waitForConnection: () => Promise<void>;
  sendInput: (input: string) => Promise<void>;
  disconnect: () => Promise<void>;
};

type FakeSandbox = {
  id: string;
  name: string;
  state: string;
  user: string;
  env: Record<string, string>;
  labels: Record<string, string>;
  volumes: Array<{ mountPath: string }>;
  createdAt: number;
  process: {
    executeCommand: (command: string) => Promise<FakeCommandResult>;
    createPty: (options: FakeCreatePtyOptions) => Promise<FakePtyHandle>;
    connectPty: (
      sessionId: string,
      options: { onData?: (data: Uint8Array) => void | Promise<void> },
    ) => Promise<FakeConnectedPtyHandle>;
    killPtySession: (sessionId: string) => Promise<void>;
  };
  getPreviewLink: (port: number) => Promise<{ token: string }>;
};

import {
  closeWorkspacePtySession,
  openCodexAuthPtySession,
  openWorkspaceDevServerPtySession,
  openWorkspacePtySession,
} from "./terminal";

function readActionHandler(
  value: unknown,
): (...args: unknown[]) => Promise<unknown> {
  if (
    (typeof value !== "function" && typeof value !== "object") ||
    value === null
  ) {
    throw new Error("Expected a registered Convex action.");
  }
  const handler = Reflect.get(value, "_handler");
  if (typeof handler !== "function") {
    throw new Error("Registered Convex action is missing its handler.");
  }
  return handler;
}

function createSandbox(executedCommands: string[] = []): FakeSandbox {
  const textEncoder = new TextEncoder();
  return {
    id: "sandbox-1",
    name: "noter-sandbox",
    state: "started",
    user: "daytona",
    env: {
      CODEX_HOME: DAYTONA_CODEX_HOME,
    },
    labels: {
      "noter.vault_id": "vault-1",
      "noter.branch": "main",
      "noter.commit_sha": "commit-sha-1",
    },
    volumes: [{ mountPath: "/home/daytona/.codex-shared" }],
    createdAt: Date.now(),
    process: {
      executeCommand: async (command: string) => {
        executedCommands.push(command);
        if (command.includes(`cat '${DAYTONA_CODEX_HOME}/config.toml'`)) {
          return {
            exitCode: 0,
            result: "",
          };
        }
        return {
          exitCode: 0,
          result: "",
        };
      },
      createPty: async (options) => {
        mockState.requestedSessionId = options.id ?? "";
        if (typeof options.onData === "function") {
          await options.onData(textEncoder.encode("prompt$ "));
        }
        return {
          sessionId: "actual-pty-session-1",
          waitForConnection: async () => {},
          sendInput: async (input) => {
            mockState.sentInputs.push(input);
            if (
              typeof options.onData === "function" &&
              input.includes("noter-dev-server")
            ) {
              await options.onData(textEncoder.encode("dev-server logs\n"));
            }
          },
          disconnect: async () => {},
        };
      },
      connectPty: async (_sessionId, options) => {
        return {
          waitForConnection: async () => {},
          sendInput: async (_input) => {
            if (typeof options.onData === "function") {
              await options.onData(textEncoder.encode("dev-server logs\n"));
            }
          },
          disconnect: async () => {},
        };
      },
      killPtySession: async () => {},
    },
    getPreviewLink: async (port) => {
      expect(port).toBe(1);
      return { token: "preview-token-1" };
    },
  };
}

function createWorkspaceActionContext() {
  return {
    auth: {},
    runQuery: async (_reference: unknown, args: unknown) => {
      const candidateArgs =
        typeof args === "object" && args !== null ? args : {};
      const id = Reflect.get(candidateArgs, "id");
      const branchName = Reflect.get(candidateArgs, "branchName");
      if (id === "vault-1") {
        return {
          _id: "vault-1",
          userId: "user-1",
          ghRepoName: "noter",
          commitSHA: "commit-sha-1",
          daytonaSandboxId: "sandbox-1",
          daytonaSandboxName: "noter-sandbox",
          daytonaSandboxProvisioningMode: undefined,
        };
      }
      if (branchName === "main") {
        return {
          headCommitSha: "commit-sha-1",
        };
      }
      throw new Error(
        `Unexpected runQuery args: ${JSON.stringify(candidateArgs)}`,
      );
    },
    runMutation: async () => null,
  };
}

function createCodexAuthActionContext() {
  return {
    auth: {},
    runQuery: async (_reference: unknown, args: unknown) => {
      const candidateArgs =
        typeof args === "object" && args !== null ? args : {};
      const kind = Reflect.get(candidateArgs, "kind");
      const userId = Reflect.get(candidateArgs, "userId");
      if (kind === "codex" && userId === "user-1") {
        return {
          kind: "codex",
          auth: {
            authSandboxId: "sandbox-1",
          },
        };
      }
      throw new Error(
        `Unexpected runQuery args: ${JSON.stringify(candidateArgs)}`,
      );
    },
    runMutation: async () => null,
  };
}

describe("openWorkspacePtySession", () => {
  beforeEach(() => {
    process.env.DAYTONA_API_URL = "https://daytona.example";
    process.env.DAYTONA_API_TOKEN = "token-1";
    mockState.sandbox = createSandbox();
    mockState.requestedSessionId = "";
    mockState.sentInputs = [];
    mockState.daytonaGet.mockClear();
    mockState.daytonaList.mockClear();
    mockState.getToolboxProxyUrl.mockClear();
  });

  afterEach(() => {
    if (originalDaytonaApiUrl === undefined) {
      delete process.env.DAYTONA_API_URL;
    } else {
      process.env.DAYTONA_API_URL = originalDaytonaApiUrl;
    }
    if (originalDaytonaApiToken === undefined) {
      delete process.env.DAYTONA_API_TOKEN;
    } else {
      process.env.DAYTONA_API_TOKEN = originalDaytonaApiToken;
    }
  });

  it("returns the actual Daytona PTY session id after createPty rewrites it", async () => {
    const handler = readActionHandler(openWorkspacePtySession);
    const result = await handler(createWorkspaceActionContext(), {
      vaultId: "vault-1",
      branch: "main",
      cols: 120,
      rows: 32,
    });

    expect(mockState.requestedSessionId).toMatch(/^noter-pty-vault-1-/);
    expect(mockState.requestedSessionId).not.toBe("actual-pty-session-1");
    expect(result).toMatchObject({
      ok: true,
      sessionId: "actual-pty-session-1",
      webSocketUrl:
        "wss://toolbox.example/sandbox-1/process/pty/actual-pty-session-1/connect",
      previewToken: "preview-token-1",
      sandboxId: "sandbox-1",
      sandboxName: "noter-sandbox",
      initialInput: expect.stringContaining("noter-shell"),
    });
    expect(mockState.sentInputs).toHaveLength(1);
    expect(mockState.sentInputs[0]).toContain('su -m -s "$target_shell"');
    expect(mockState.sentInputs[0]).toContain("/home/daytona/workspace/noter");
    if (typeof result !== "object" || result === null) {
      throw new Error("Expected workspace PTY result to be an object.");
    }
    const initialInput = Reflect.get(result, "initialInput");
    expect(initialInput).toContain("tmux_status=$?");
    expect(initialInput).toContain('exec "$SHELL" -l');
    expect(initialInput).not.toContain("exec tmux");
  });

  it("writes Codex config as the sandbox user into the local Codex home", async () => {
    const executedCommands: string[] = [];
    mockState.sandbox = createSandbox(executedCommands);

    const handler = readActionHandler(openWorkspacePtySession);
    const result = await handler(createWorkspaceActionContext(), {
      vaultId: "vault-1",
      branch: "main",
      cols: 120,
      rows: 32,
    });

    expect(result).toMatchObject({ ok: true });
    const configWriteCommand = executedCommands.find((command) =>
      command.includes('base64 --decode > "$config_path"'),
    );
    expect(configWriteCommand).toBeDefined();
    expect(configWriteCommand).toContain(`${DAYTONA_CODEX_HOME}/config.toml`);
    expect(configWriteCommand).toContain(
      'exec su -m -s /bin/bash "$target_user" -c',
    );
    expect(configWriteCommand).not.toContain(DAYTONA_CODEX_SHARED_HOME);
  });

  it("repairs fisher/pure before creating a workspace shell PTY", async () => {
    const commands: string[] = [];
    const sandbox = createSandbox();
    sandbox.process.executeCommand = async (command: string) => {
      commands.push(command);
      if (command.includes(`cat '${DAYTONA_CODEX_HOME}/config.toml'`)) {
        return {
          exitCode: 0,
          result: "",
        };
      }
      return {
        exitCode: 0,
        result: "",
      };
    };
    sandbox.process.createPty = async (options) => {
      commands.push("createPty");
      mockState.requestedSessionId = options.id ?? "";
      return {
        sessionId: "actual-pty-session-1",
        waitForConnection: async () => {},
        sendInput: async (input) => {
          mockState.sentInputs.push(input);
        },
        disconnect: async () => {},
      };
    };
    mockState.sandbox = sandbox;

    const handler = readActionHandler(openWorkspacePtySession);
    const result = await handler(createWorkspaceActionContext(), {
      vaultId: "vault-1",
      branch: "main",
      cols: 120,
      rows: 32,
    });

    expect(result).toMatchObject({
      ok: true,
      sessionId: "actual-pty-session-1",
    });
    const fisherCommandIndex = commands.findIndex((command) =>
      command.includes('fish -lc "$verify_command"'),
    );
    const createPtyIndex = commands.indexOf("createPty");
    expect(fisherCommandIndex).toBeGreaterThanOrEqual(0);
    expect(commands[fisherCommandIndex]).toContain(
      "fisher install $fisher_plugin $pure_plugin",
    );
    expect(createPtyIndex).toBeGreaterThan(fisherCommandIndex);
  });
  it("returns the actual Daytona PTY session id for dev server PTYs too", async () => {
    const handler = readActionHandler(openWorkspaceDevServerPtySession);
    const result = await handler(createWorkspaceActionContext(), {
      vaultId: "vault-1",
      branch: "main",
      cols: 120,
      rows: 32,
    });

    expect(mockState.requestedSessionId).toMatch(
      /^noter-dev-server-pty-vault-1-/,
    );
    expect(mockState.requestedSessionId).not.toBe("actual-pty-session-1");
    expect(result).toMatchObject({
      ok: true,
      sessionId: "actual-pty-session-1",
      webSocketUrl:
        "wss://toolbox.example/sandbox-1/process/pty/actual-pty-session-1/connect",
      previewToken: "preview-token-1",
      sandboxId: "sandbox-1",
      sandboxName: "noter-sandbox",
      initialInput: expect.stringContaining("noter-dev-server"),
    });
    expect(mockState.sentInputs).toHaveLength(1);
    expect(mockState.sentInputs[0]).toContain('su -m -s "$target_shell"');
    expect(mockState.sentInputs[0]).toContain("/home/daytona/workspace/noter");
    if (typeof result !== "object" || result === null) {
      throw new Error("Expected dev server PTY result to be an object.");
    }
    const initialInput = Reflect.get(result, "initialInput");
    expect(initialInput).toContain("attach-session -r -t");
    expect(initialInput).toContain("tmux_status=$?");
    expect(initialInput).toContain("tail -n 200 -F");
    expect(initialInput).toContain("/tmp/noter-dev.log");
    expect(initialInput).not.toContain("exec tmux");
  });

  it("cleans up dev server PTYs using the rewritten session id on failure", async () => {
    const sandbox = createSandbox();
    const killedSessionIds: string[] = [];
    sandbox.process.createPty = async (options) => {
      mockState.requestedSessionId = options.id ?? "";
      return {
        sessionId: "actual-pty-session-1",
        waitForConnection: async () => {},
        sendInput: async () => {
          throw new Error("simulated sendInput failure");
        },
        disconnect: async () => {},
      };
    };
    sandbox.process.killPtySession = async (sessionId) => {
      killedSessionIds.push(sessionId);
    };
    mockState.sandbox = sandbox;

    const handler = readActionHandler(openWorkspaceDevServerPtySession);
    const result = await handler(createWorkspaceActionContext(), {
      vaultId: "vault-1",
      branch: "main",
      cols: 120,
      rows: 32,
    });

    expect(mockState.requestedSessionId).toMatch(
      /^noter-dev-server-pty-vault-1-/,
    );
    expect(mockState.requestedSessionId).not.toBe("actual-pty-session-1");
    expect(killedSessionIds).toEqual(["actual-pty-session-1"]);
    expect(result).toMatchObject({
      ok: false,
      message: "simulated sendInput failure",
    });
  });

  it("returns the actual Daytona PTY session id for Codex auth PTYs too", async () => {
    const handler = readActionHandler(openCodexAuthPtySession);
    const result = await handler(createCodexAuthActionContext(), {
      cols: 120,
      rows: 32,
    });

    expect(mockState.requestedSessionId).toMatch(/^noter-codex-auth-pty-/);
    expect(mockState.requestedSessionId).not.toBe("actual-pty-session-1");
    expect(result).toMatchObject({
      ok: true,
      sessionId: "actual-pty-session-1",
      webSocketUrl:
        "wss://toolbox.example/sandbox-1/process/pty/actual-pty-session-1/connect",
      previewToken: "preview-token-1",
      sandboxName: "noter-sandbox",
    });
  });

  it("syncs the local Codex config back to the shared volume when a workspace PTY closes", async () => {
    const executedCommands: string[] = [];
    const sandbox = createSandbox(executedCommands);
    const killedSessionIds: string[] = [];
    sandbox.process.killPtySession = async (sessionId) => {
      killedSessionIds.push(sessionId);
    };
    mockState.sandbox = sandbox;

    const handler = readActionHandler(closeWorkspacePtySession);
    const result = await handler(createWorkspaceActionContext(), {
      vaultId: "vault-1",
      branch: "main",
      sessionId: "workspace-pty-1",
    });

    expect(result).toMatchObject({ ok: true });
    expect(killedSessionIds).toEqual(["workspace-pty-1"]);
    const syncCommand = executedCommands.find(
      (command) =>
        command.includes(`${DAYTONA_CODEX_SHARED_HOME}/config.toml`) &&
        command.includes('cat "$local_path" > "$shared_path"'),
    );
    expect(syncCommand).toBeDefined();
    expect(syncCommand).toContain('exec su -m -s /bin/bash "$target_user" -c');
  });
});
