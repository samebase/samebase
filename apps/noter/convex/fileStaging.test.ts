import { describe, expect, it } from "vitest";

import {
  canAccessVaultStaging,
  clearAllStaging,
  selectRepositoryTreeForBranch,
  summarizeStagedFilesByBranch,
} from "./fileStaging";

type ClearAllStagingHandler = (
  ctx: {
    db: {
      get: (id: string) => Promise<{
        userId: string;
        ghRepoOwner: string;
        ghRepoName: string;
      } | null>;
      query: (table: string) => {
        withIndex: (
          indexName: string,
          buildIndex: (q: {
            eq: (
              field: string,
              value: string,
            ) => { eq: (field: string, value: string) => unknown };
          }) => unknown,
        ) => {
          collect: () => Promise<
            Array<{ _id: string; vaultId: string; branch: string }>
          >;
        };
      };
      delete: (id: string) => Promise<void>;
    };
    scheduler: {
      runAfter: (
        delayMs: number,
        fnRef: unknown,
        args: unknown,
      ) => Promise<void>;
    };
  },
  args: {
    vaultId: string;
    branch?: string;
    skipTreeUpdate?: boolean;
  },
) => Promise<null>;

function isClearAllStagingHandler(
  value: unknown,
): value is ClearAllStagingHandler {
  return typeof value === "function";
}

function getClearAllStagingHandler(): ClearAllStagingHandler {
  const handler = Reflect.get(clearAllStaging, "_handler");
  if (!isClearAllStagingHandler(handler)) {
    throw new Error("Expected clearAllStaging to expose a test handler");
  }
  return handler;
}

function createClearAllStagingTestContext(args: {
  targetVaultId: string;
  vault: {
    userId: string;
    ghRepoOwner: string;
    ghRepoName: string;
  } | null;
  stagedFiles: Array<{ _id: string; vaultId: string; branch: string }>;
}) {
  const deletedIds: string[] = [];
  const scheduledCalls: Array<{ delayMs: number; args: unknown }> = [];
  const queriedScopes: Array<{
    table: string;
    indexName: string;
    constraints: Array<{ field: string; value: string }>;
  }> = [];

  return {
    deletedIds,
    queriedScopes,
    scheduledCalls,
    ctx: {
      db: {
        get: async (id: string) =>
          id === args.targetVaultId ? args.vault : null,
        query: (table: string) => ({
          withIndex: (
            indexName: string,
            buildIndex: (q: {
              eq: (
                field: string,
                value: string,
              ) => { eq: (field: string, value: string) => unknown };
            }) => unknown,
          ) => {
            const constraints: Array<{ field: string; value: string }> = [];
            const queryBuilder = {
              eq: (field: string, value: string) => {
                constraints.push({ field, value });
                return queryBuilder;
              },
            };
            buildIndex(queryBuilder);

            return {
              collect: async () => {
                queriedScopes.push({ table, indexName, constraints });
                if (table !== "fileStaging") {
                  return [];
                }

                const vaultIdConstraint = constraints.find(
                  (constraint) => constraint.field === "vaultId",
                )?.value;
                const branchConstraint = constraints.find(
                  (constraint) => constraint.field === "branch",
                )?.value;

                return args.stagedFiles.filter(
                  (file) =>
                    file.vaultId === vaultIdConstraint &&
                    (branchConstraint === undefined ||
                      file.branch === branchConstraint),
                );
              },
            };
          },
        }),
        delete: async (id: string) => {
          deletedIds.push(id);
        },
      },
      scheduler: {
        runAfter: async (
          delayMs: number,
          _fnRef: unknown,
          scheduledArgs: unknown,
        ) => {
          scheduledCalls.push({ delayMs, args: scheduledArgs });
        },
      },
    },
  };
}

const branchTree = [
  {
    path: "src/feature.ts",
    mode: "100644",
    type: "blob",
    sha: "feature-sha",
  },
];

const defaultTree = [
  {
    path: "src/main.ts",
    mode: "100644",
    type: "blob",
    sha: "main-sha",
  },
];

describe("selectRepositoryTreeForBranch", () => {
  it("returns the branch-scoped tree when it exists", () => {
    expect(
      selectRepositoryTreeForBranch({
        requestedBranch: "feature/login",
        defaultBranch: "main",
        branchTree,
        legacyTree: defaultTree,
      }),
    ).toEqual(branchTree);
  });

  it("falls back to legacy tree only for the default branch", () => {
    expect(
      selectRepositoryTreeForBranch({
        requestedBranch: "main",
        defaultBranch: "main",
        branchTree: null,
        legacyTree: defaultTree,
      }),
    ).toEqual(defaultTree);
  });

  it("throws for missing non-default branch trees", () => {
    expect(() =>
      selectRepositoryTreeForBranch({
        requestedBranch: "feature/login",
        defaultBranch: "main",
        branchTree: null,
        legacyTree: defaultTree,
      }),
    ).toThrow('Branch tree is not cached for "feature/login"');
  });
});

describe("summarizeStagedFilesByBranch", () => {
  it("returns per-branch category counts for changed files only", () => {
    const summaries = summarizeStagedFilesByBranch([
      {
        branch: "feature/login",
        fileDeleted: false,
        parentCommitSha: "abc123",
        filePath: "src/app.ts",
        initialFilePath: "src/app.ts",
        content: "new content",
        initialContent: "old content",
      },
      {
        branch: "feature/login",
        fileDeleted: false,
        parentCommitSha: "abc123",
        filePath: "src/new-name.ts",
        initialFilePath: "src/old-name.ts",
        content: "same",
        initialContent: "same",
      },
      {
        branch: "feature/login",
        fileDeleted: false,
        parentCommitSha: "abc123",
        filePath: "src/new-login.ts",
        initialFilePath: "src/old-login.ts",
        content: "updated",
        initialContent: "original",
      },
      {
        branch: "main",
        fileDeleted: true,
        parentCommitSha: "abc123",
        filePath: "README.md",
        initialFilePath: "README.md",
        content: "",
        initialContent: "# Readme",
      },
      {
        branch: "main",
        fileDeleted: false,
        parentCommitSha: null,
        filePath: "src/new.ts",
        initialFilePath: "src/new.ts",
        content: "hello",
        initialContent: "",
      },
      {
        branch: "main",
        fileDeleted: false,
        parentCommitSha: "abc123",
        filePath: "src/unchanged.ts",
        initialFilePath: "src/unchanged.ts",
        content: "same",
        initialContent: "same",
      },
    ]);

    expect(summaries).toEqual([
      {
        branch: "feature/login",
        counts: {
          modified: 1,
          deleted: 0,
          new: 0,
          renamed: 1,
          renamedAndModified: 1,
          total: 3,
        },
      },
      {
        branch: "main",
        counts: {
          modified: 0,
          deleted: 1,
          new: 1,
          renamed: 0,
          renamedAndModified: 0,
          total: 2,
        },
      },
    ]);
  });
});

describe("canAccessVaultStaging", () => {
  it("allows owner access", () => {
    expect(
      canAccessVaultStaging({
        vaultOwnerId: "users:owner",
        requesterUserId: "users:owner",
      }),
    ).toBe(true);
  });

  it("rejects non-owner access", () => {
    expect(
      canAccessVaultStaging({
        vaultOwnerId: "users:owner",
        requesterUserId: "users:other",
      }),
    ).toBe(false);
  });
});

describe("clearAllStaging", () => {
  it("deletes staging only for the requested branch and refreshes that branch", async () => {
    const handler = getClearAllStagingHandler();
    const targetVaultId = "vault-1";
    const targetBranch = "feature/login";
    const context = createClearAllStagingTestContext({
      targetVaultId,
      vault: {
        userId: "users:owner",
        ghRepoOwner: "octo",
        ghRepoName: "repo",
      },
      stagedFiles: [
        { _id: "feature-1", vaultId: targetVaultId, branch: targetBranch },
        { _id: "feature-2", vaultId: targetVaultId, branch: targetBranch },
        { _id: "main-1", vaultId: targetVaultId, branch: "main" },
        { _id: "other-vault", vaultId: "vault-2", branch: targetBranch },
      ],
    });

    await handler(context.ctx, {
      vaultId: targetVaultId,
      branch: targetBranch,
    });

    expect(context.queriedScopes).toEqual([
      {
        table: "fileStaging",
        indexName: "by_vault_and_branch",
        constraints: [
          { field: "vaultId", value: targetVaultId },
          { field: "branch", value: targetBranch },
        ],
      },
    ]);
    expect(context.deletedIds).toEqual(["feature-1", "feature-2"]);
    expect(context.scheduledCalls).toEqual([
      {
        delayMs: 0,
        args: {
          vaultId: targetVaultId,
          branch: targetBranch,
        },
      },
      {
        delayMs: 0,
        args: {
          userId: "users:owner",
          owner: "octo",
          repo: "repo",
          branch: targetBranch,
        },
      },
    ]);
  });
});
