import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

import { DAYTONA_CODEX_HOME } from "./sandboxUser";
import { DAYTONA_PAUSED_MESSAGE } from "../../shared/daytonaPause";

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
      createPty: async options => {
        mockState.requestedSessionId = options.id ?? "";
        if (typeof options.onData === "function") {
          await options.onData(textEncoder.encode("prompt$ "));
        }
        return {
          sessionId: "actual-pty-session-1",
          waitForConnection: async () => {},
          sendInput: async input => {
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
          sendInput: async _input => {
            if (typeof options.onData === "function") {
              await options.onData(textEncoder.encode("dev-server logs\n"));
            }
          },
          disconnect: async () => {},
        };
      },
      killPtySession: async () => {},
    },
    getPreviewLink: async port => {
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

  async function expectPausedActionResult(
    action: unknown,
    context: unknown,
    args: Record<string, unknown>,
  ) {
    const handler = readActionHandler(action);
    const result = await handler(context, args);

    expect(result).toMatchObject({
      ok: false,
      message: DAYTONA_PAUSED_MESSAGE,
    });
    expect(mockState.requestedSessionId).toBe("");
    expect(mockState.daytonaGet).not.toHaveBeenCalled();
    expect(mockState.getToolboxProxyUrl).not.toHaveBeenCalled();
  }

  it("rejects workspace PTY opens while Daytona is paused", async () => {
    await expectPausedActionResult(
      openWorkspacePtySession,
      createWorkspaceActionContext(),
      {
        vaultId: "vault-1",
        branch: "main",
        cols: 120,
        rows: 32,
      },
    );
  });

  it("rejects dev server PTY opens while Daytona is paused", async () => {
    await expectPausedActionResult(
      openWorkspaceDevServerPtySession,
      createWorkspaceActionContext(),
      {
        vaultId: "vault-1",
        branch: "main",
        cols: 120,
        rows: 32,
      },
    );
  });

  it("rejects Codex auth PTY opens while Daytona is paused", async () => {
    await expectPausedActionResult(
      openCodexAuthPtySession,
      createCodexAuthActionContext(),
      {
        cols: 120,
        rows: 32,
      },
    );
  });

  it("rejects PTY closes while Daytona is paused", async () => {
    await expectPausedActionResult(
      closeWorkspacePtySession,
      createWorkspaceActionContext(),
      {
        vaultId: "vault-1",
        branch: "main",
        sessionId: "workspace-pty-1",
      },
    );
  });
});
