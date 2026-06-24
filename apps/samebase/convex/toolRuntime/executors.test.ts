import { describe, expect, it } from "vite-plus/test";

import { executeRuntimeTool } from "./executors";
import type { ResolvedToolContext } from "./types";

type MutationCall = {
  ref: unknown;
  args: Record<string, unknown>;
};

type QueryCall = {
  ref: unknown;
  args: Record<string, unknown>;
};

type ActionCall = {
  ref: unknown;
  args: Record<string, unknown>;
};

type ActionHandler = (args: Record<string, unknown>) => unknown;
type QueryHandler = (args: Record<string, unknown>) => unknown;
type MutationHandler = (args: Record<string, unknown>) => unknown;

function makeResolvedContext(args?: {
  actionCalls?: ActionCall[];
  actionHandler?: ActionHandler;
  queryCalls?: QueryCall[];
  queryHandler?: QueryHandler;
  mutationHandler?: MutationHandler;
  mutationCalls?: MutationCall[];
  branch?: string;
  threadId?: string;
}): ResolvedToolContext {
  const actionCalls = args?.actionCalls ?? [];
  const queryCalls = args?.queryCalls ?? [];
  const mutationCalls = args?.mutationCalls ?? [];

  const ctx = {
    runAction: async (
      _actionRef: unknown,
      actionArgs: Record<string, unknown>,
    ): Promise<unknown> => {
      actionCalls.push({ ref: _actionRef, args: actionArgs });
      if (args?.actionHandler) {
        return args.actionHandler(actionArgs);
      }
      return null;
    },
    runQuery: async (_queryRef: unknown, queryArgs: Record<string, unknown>): Promise<unknown> => {
      queryCalls.push({ ref: _queryRef, args: queryArgs });
      if (args?.queryHandler) {
        return args.queryHandler(queryArgs);
      }
      return null;
    },
    runMutation: async (
      _mutationRef: unknown,
      mutationArgs: Record<string, unknown>,
    ): Promise<unknown> => {
      mutationCalls.push({ ref: _mutationRef, args: mutationArgs });
      if (args?.mutationHandler) {
        return args.mutationHandler(mutationArgs);
      }
      return null;
    },
  };

  return {
    // @ts-expect-error Minimal ActionCtx shape for executor unit tests.
    ctx,
    surface: "agent",
    // @ts-expect-error Synthetic id is sufficient for isolated unit tests.
    userId: "users_test",
    grantedScopes: [],
    vault: {
      // @ts-expect-error Synthetic id is sufficient for isolated unit tests.
      _id: "vault_test",
      // @ts-expect-error Synthetic id is sufficient for isolated unit tests.
      userId: "users_test",
      owner: "owner",
      name: "repo",
      state: "ready",
    },
    branch: args?.branch ?? "main",
    threadId: args?.threadId,
    githubAccessToken: "gho_test",
  };
}

describe("executeRuntimeTool write dispatch", () => {
  it("dispatches create_app through the app provisioning action", async () => {
    const actionCalls: ActionCall[] = [];
    const context = makeResolvedContext({
      actionCalls,
      actionHandler: () => ({
        vaultId: "vault_created",
        runId: "run_created",
      }),
    });

    const output = await executeRuntimeTool({
      toolName: "create_app",
      context,
      input: {
        name: "todo-app",
        owner: "samebase",
        convexProjectName: "todo-app",
        cloudflareWorkerName: "todo-app",
        description: "A focused todo app",
        private: false,
      },
    });

    expect(actionCalls).toHaveLength(1);
    expect(typeof actionCalls[0]?.ref).toBe("object");
    expect(actionCalls[0].args).toEqual({
      userId: "users_test",
      name: "todo-app",
      owner: "samebase",
      convexProjectName: "todo-app",
      cloudflareWorkerName: "todo-app",
      description: "A focused todo app",
      private: false,
    });
    expect(output.structuredContent).toEqual({
      vaultId: "vault_created",
      runId: "run_created",
    });
    expect(output.text).toBe(
      JSON.stringify(
        {
          vaultId: "vault_created",
          runId: "run_created",
        },
        null,
        2,
      ),
    );
  });

  it("dispatches edit_file through collaborative mutation when file is staged", async () => {
    const queryCalls: QueryCall[] = [];
    const mutationCalls: MutationCall[] = [];
    const context = makeResolvedContext({
      queryCalls,
      mutationCalls,
      queryHandler: (queryArgs) => {
        if (queryArgs.newPath === "README.md") {
          return {
            content: "old",
            fileDeleted: false,
            filePath: "README.md",
            initialFilePath: "README.md",
            parentCommitSha: "abc123",
            version: 7,
          };
        }
        return null;
      },
    });

    const output = await executeRuntimeTool({
      toolName: "edit_file",
      context,
      input: { path: "README.md", content: "new" },
    });

    expect(output.text).toBe("File edited: README.md");
    expect(queryCalls).toHaveLength(1);
    expect(typeof queryCalls[0]?.ref).toBe("object");
    expect(mutationCalls).toHaveLength(1);
    expect(typeof mutationCalls[0]?.ref).toBe("object");
    expect(mutationCalls[0].args).toMatchObject({
      vaultId: "vault_test",
      filePath: "README.md",
      branch: "main",
      expectedVersion: 7,
      newContent: "new",
      userId: "users_test",
    });
  });

  it("dispatches replace_in_file for staged files", async () => {
    const queryCalls: QueryCall[] = [];
    const mutationCalls: MutationCall[] = [];
    const context = makeResolvedContext({
      queryCalls,
      mutationCalls,
      queryHandler: (queryArgs) => {
        if (queryArgs.newPath === "README.md") {
          return {
            content: "hello old world",
            fileDeleted: false,
            filePath: "README.md",
            initialFilePath: "README.md",
            parentCommitSha: "abc123",
            version: 3,
          };
        }
        return null;
      },
    });

    const output = await executeRuntimeTool({
      toolName: "replace_in_file",
      context,
      input: {
        path: "README.md",
        replacements: [{ oldText: "old", newText: "new" }],
      },
    });

    expect(output.text).toContain('"applied": 1');
    expect(queryCalls).toHaveLength(1);
    expect(typeof queryCalls[0]?.ref).toBe("object");
    expect(mutationCalls).toHaveLength(1);
    expect(typeof mutationCalls[0]?.ref).toBe("object");
    expect(mutationCalls[0].args).toMatchObject({
      vaultId: "vault_test",
      filePath: "README.md",
      branch: "main",
      expectedVersion: 3,
      userId: "users_test",
    });
    expect(typeof mutationCalls[0].args.serializedChangeSet).toBe("string");
  });

  it("dispatches create_file through staging mutation", async () => {
    const queryCalls: QueryCall[] = [];
    const mutationCalls: MutationCall[] = [];
    const context = makeResolvedContext({ queryCalls, mutationCalls });

    const output = await executeRuntimeTool({
      toolName: "create_file",
      context,
      input: { path: "src/new.ts", content: "export const v = 1;" },
    });

    expect(output.text).toBe("File created: src/new.ts");
    expect(queryCalls).toHaveLength(3);
    expect(new Set(queryCalls.map((call) => call.ref)).size).toBe(3);
    expect(mutationCalls).toHaveLength(1);
    expect(typeof mutationCalls[0]?.ref).toBe("object");
    expect(mutationCalls[0].args).toMatchObject({
      vaultId: "vault_test",
      initialFilePath: "src/new.ts",
      content: "export const v = 1;",
      initialContent: "",
      parentCommitSha: null,
      branch: "main",
      userId: "users_test",
    });
  });

  it("returns missing-file error when read_file targets a renamed staged original path", async () => {
    const context = makeResolvedContext({
      queryHandler: (queryArgs) => {
        if (queryArgs.newPath === "src/old.ts") {
          return null;
        }
        if (queryArgs.originalFilePath === "src/old.ts") {
          return {
            content: "staged content",
            fileDeleted: false,
            filePath: "src/new.ts",
            initialFilePath: "src/old.ts",
            parentCommitSha: "abc123",
            version: 2,
          };
        }
        return null;
      },
    });

    const output = await executeRuntimeTool({
      toolName: "read_file",
      context,
      input: { path: "src/old.ts" },
    });

    expect(output.text).toBe("Error: src/old.ts does not exist");
  });

  it("rejects edit_file when the path does not exist in the staged view", async () => {
    const mutationCalls: MutationCall[] = [];
    const context = makeResolvedContext({
      mutationCalls,
      queryHandler: (queryArgs) => {
        if (queryArgs.newPath === "README.md" || queryArgs.originalFilePath === "README.md") {
          return {
            content: "",
            fileDeleted: true,
            filePath: "README.md",
            initialFilePath: "README.md",
            parentCommitSha: "abc123",
            version: 4,
          };
        }
        return null;
      },
    });

    await expect(
      executeRuntimeTool({
        toolName: "edit_file",
        context,
        input: { path: "README.md", content: "new content" },
      }),
    ).rejects.toThrow("edit_file failed: README.md does not exist; use create_file");
    expect(mutationCalls).toHaveLength(0);
  });

  it("rejects create_file when the path already has staged history", async () => {
    const mutationCalls: MutationCall[] = [];
    const context = makeResolvedContext({
      mutationCalls,
      queryHandler: (queryArgs) => {
        if (queryArgs.originalFilePath === "src/new.ts") {
          return {
            content: "old",
            fileDeleted: false,
            filePath: "src/new-renamed.ts",
            initialFilePath: "src/new.ts",
            parentCommitSha: "abc123",
            version: 1,
          };
        }
        return null;
      },
    });

    await expect(
      executeRuntimeTool({
        toolName: "create_file",
        context,
        input: { path: "src/new.ts", content: "new file" },
      }),
    ).rejects.toThrow("create_file failed: src/new.ts already exists; use edit_file");
    expect(mutationCalls).toHaveLength(0);
  });

  it("dispatches delete_file with staged metadata when current path is staged", async () => {
    const queryCalls: QueryCall[] = [];
    const mutationCalls: MutationCall[] = [];
    const context = makeResolvedContext({
      queryCalls,
      mutationCalls,
      queryHandler: (queryArgs) => {
        if (queryArgs.newPath === "src/renamed.ts") {
          return {
            content: "to delete",
            fileDeleted: false,
            filePath: "src/renamed.ts",
            initialFilePath: "src/old.ts",
            parentCommitSha: "def456",
            version: 2,
          };
        }
        return null;
      },
    });

    const output = await executeRuntimeTool({
      toolName: "delete_file",
      context,
      input: { path: "src/renamed.ts" },
    });

    expect(output.text).toBe("File marked for deletion: src/renamed.ts");
    expect(queryCalls).toHaveLength(1);
    expect(typeof queryCalls[0]?.ref).toBe("object");
    expect(mutationCalls).toHaveLength(1);
    expect(typeof mutationCalls[0]?.ref).toBe("object");
    expect(mutationCalls[0].args).toMatchObject({
      vaultId: "vault_test",
      filePath: "src/renamed.ts",
      parentCommitSha: "def456",
      branch: "main",
      userId: "users_test",
    });
  });

  it("throws for unsupported tool names", async () => {
    const context = makeResolvedContext();

    await expect(
      executeRuntimeTool({
        toolName: "not_a_tool",
        context,
        input: {},
      }),
    ).rejects.toThrow("No executor for tool: not_a_tool");
  });

  it("creates a prod-read proposal payload through shared runtime executor", async () => {
    const mutationCalls: MutationCall[] = [];
    const context = makeResolvedContext({
      mutationCalls,
      threadId: "thread_123",
      mutationHandler: () => ({ requestId: "request_123" }),
    });

    const output = await executeRuntimeTool({
      toolName: "request_convex_data_read",
      context,
      input: { table: "vaults", scope: "global", limit: 5 },
    });

    expect(output.text).toContain("I need your approval before reading Convex");
    expect(output.structuredContent).toMatchObject({
      type: "prod_read_proposal",
      requestId: "request_123",
      scope: "global",
      provider: "convex",
      resourceKind: "data_query",
      toolName: "request_convex_data_read",
      status: "proposed",
    });
    expect(mutationCalls).toHaveLength(1);
    expect(typeof mutationCalls[0]?.ref).toBe("object");
    expect(mutationCalls[0].args).toMatchObject({
      threadId: "thread_123",
      requesterUserId: "users_test",
      scope: "global",
      provider: "convex",
      resourceKind: "data_query",
      toolName: "request_convex_data_read",
    });
    expect(typeof mutationCalls[0].args.paramsJson).toBe("string");
  });

  it("resolves the default Cloudflare account before proposing a Workers inventory read", async () => {
    const actionCalls: ActionCall[] = [];
    const mutationCalls: MutationCall[] = [];
    const context = makeResolvedContext({
      actionCalls,
      mutationCalls,
      threadId: "thread_123",
      actionHandler: () => ({
        auth: { method: "api_key", credential: "cloudflare_token" },
        defaultAccount: {
          state: "selected",
          accountId: "cloudflare_account_123",
          accountName: "Main account",
        },
      }),
      mutationHandler: () => ({ requestId: "request_123" }),
    });

    const output = await executeRuntimeTool({
      toolName: "request_cloudflare_workers_inventory_read",
      context,
      input: { limit: 10 },
    });

    expect(output.text).toContain("I need your approval before reading Cloudflare");
    expect(actionCalls).toHaveLength(1);
    expect(actionCalls[0].args).toEqual({ userId: "users_test" });
    expect(mutationCalls).toHaveLength(1);
    expect(mutationCalls[0].args).toMatchObject({
      threadId: "thread_123",
      requesterUserId: "users_test",
      provider: "cloudflare",
      resourceKind: "workers_inventory",
      toolName: "request_cloudflare_workers_inventory_read",
      paramsJson: JSON.stringify({
        accountId: "cloudflare_account_123",
        limit: 10,
      }),
    });
  });

  it("uses an explicit Cloudflare account without reading the default selection", async () => {
    const actionCalls: ActionCall[] = [];
    const mutationCalls: MutationCall[] = [];
    const context = makeResolvedContext({
      actionCalls,
      mutationCalls,
      threadId: "thread_123",
      mutationHandler: () => ({ requestId: "request_123" }),
    });

    await executeRuntimeTool({
      toolName: "request_cloudflare_workers_inventory_read",
      context,
      input: { accountId: "cloudflare_account_explicit" },
    });

    expect(actionCalls).toHaveLength(0);
    expect(mutationCalls).toHaveLength(1);
    expect(mutationCalls[0].args).toMatchObject({
      paramsJson: JSON.stringify({
        accountId: "cloudflare_account_explicit",
      }),
    });
  });
});
