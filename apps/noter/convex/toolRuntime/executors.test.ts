import { describe, expect, it } from "vitest";

import { executeRuntimeTool } from "./executors";
import type { ResolvedToolContext } from "./types";

type MutationCall = {
  args: Record<string, unknown>;
};

type QueryHandler = (args: Record<string, unknown>) => unknown;

function makeResolvedContext(args?: {
  queryHandler?: QueryHandler;
  mutationCalls?: MutationCall[];
  branch?: string;
}): ResolvedToolContext {
  const mutationCalls = args?.mutationCalls ?? [];

  const ctx = {
    runQuery: async (
      _queryRef: unknown,
      queryArgs: Record<string, unknown>,
    ): Promise<unknown> => {
      if (args?.queryHandler) {
        return args.queryHandler(queryArgs);
      }
      return null;
    },
    runMutation: async (
      _mutationRef: unknown,
      mutationArgs: Record<string, unknown>,
    ): Promise<null> => {
      mutationCalls.push({ args: mutationArgs });
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
      ghRepoOwner: "owner",
      ghRepoName: "repo",
      state: "ready",
    },
    branch: args?.branch ?? "main",
    githubAccessToken: "gho_test",
  };
}

describe("executeRuntimeTool write dispatch", () => {
  it("dispatches edit_file through collaborative mutation when file is staged", async () => {
    const mutationCalls: MutationCall[] = [];
    const context = makeResolvedContext({
      mutationCalls,
      queryHandler: (queryArgs) => {
        if (typeof queryArgs.originalFilePath === "string") {
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
    expect(mutationCalls).toHaveLength(1);
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
    const mutationCalls: MutationCall[] = [];
    const context = makeResolvedContext({
      mutationCalls,
      queryHandler: (queryArgs) => {
        if (typeof queryArgs.originalFilePath === "string") {
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
    expect(mutationCalls).toHaveLength(1);
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
    const mutationCalls: MutationCall[] = [];
    const context = makeResolvedContext({ mutationCalls });

    const output = await executeRuntimeTool({
      toolName: "create_file",
      context,
      input: { path: "src/new.ts", content: "export const v = 1;" },
    });

    expect(output.text).toBe("File created: src/new.ts");
    expect(mutationCalls).toHaveLength(1);
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

  it("dispatches delete_file with staged metadata when available", async () => {
    const mutationCalls: MutationCall[] = [];
    const context = makeResolvedContext({
      mutationCalls,
      queryHandler: (queryArgs) => {
        if (typeof queryArgs.originalFilePath === "string") {
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
      input: { path: "src/old.ts" },
    });

    expect(output.text).toBe("File marked for deletion: src/old.ts");
    expect(mutationCalls).toHaveLength(1);
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
});
