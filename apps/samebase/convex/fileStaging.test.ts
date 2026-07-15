import { describe, expect, it } from "vite-plus/test";
import { internal } from "./_generated/api";

import {
  buildDeletionSnapshotSeed,
  buildDeletedFileRestoreCandidate,
  buildClearAllStagingPlan,
  canAccessVaultStaging,
  clearAllStagingBatchImpl,
  clearMatchingStagingSnapshotImpl,
  clearAllStagingImpl,
  selectRepositoryTreeForBranch,
  shouldDeleteSupersededStagedBinaryUpload,
  summarizeStagedFilesByBranch,
} from "./fileStaging";

const branchTree = [
  {
    path: "src/feature.ts",
    mode: "100644",
    type: "blob",
    sha: "feature-sha",
  },
];

function createClearAllStagingTestContext(args: {
  stagedFiles: Array<{
    _id: string;
    _creationTime: number;
    vaultId: string;
    branch: string;
    lastEditTime: number;
  }>;
}) {
  const deletedIds: string[] = [];
  const scheduledCalls: Array<{
    delayMs: number;
    fnRef: unknown;
    args: unknown;
  }> = [];
  const queriedScopes: Array<{
    table: string;
    indexName: string;
    constraints: Array<{
      operator: "eq" | "lt";
      field: string;
      value: string | number;
    }>;
    paginationOpts: {
      numItems: number;
      cursor: string | null;
      maximumRowsRead?: number;
      maximumBytesRead?: number;
    };
  }> = [];

  return {
    deletedIds,
    queriedScopes,
    scheduledCalls,
    ctx: {
      db: {
        query: (table: string) => ({
          withIndex: (
            indexName: string,
            buildIndex: (q: {
              eq: (field: string, value: string | number) => unknown;
              lt: (field: string, value: string | number) => unknown;
            }) => unknown,
          ) => {
            const constraints: Array<{
              operator: "eq" | "lt";
              field: string;
              value: string | number;
            }> = [];
            const queryBuilder = {
              eq: (field: string, value: string | number) => {
                constraints.push({ operator: "eq" as const, field, value });
                return queryBuilder;
              },
              lt: (field: string, value: string | number) => {
                constraints.push({ operator: "lt" as const, field, value });
                return queryBuilder;
              },
            };
            buildIndex(queryBuilder);

            return {
              paginate: async (paginationOpts: {
                numItems: number;
                cursor: string | null;
                maximumRowsRead?: number;
                maximumBytesRead?: number;
              }) => {
                queriedScopes.push({ table, indexName, constraints, paginationOpts });
                if (table !== "fileStaging") {
                  return { page: [], isDone: true, continueCursor: "" };
                }

                const vaultIdConstraint = constraints.find(
                  (constraint) => constraint.operator === "eq" && constraint.field === "vaultId",
                )?.value;
                const branchConstraint = constraints.find(
                  (constraint) => constraint.operator === "eq" && constraint.field === "branch",
                )?.value;
                const beforeCreationTime = constraints.find(
                  (constraint) =>
                    constraint.operator === "lt" && constraint.field === "_creationTime",
                )?.value;
                if (beforeCreationTime !== undefined && typeof beforeCreationTime !== "number") {
                  throw new Error("Creation-time constraints must be numeric.");
                }

                const matchingFiles = args.stagedFiles
                  .filter(
                    (file) =>
                      file.vaultId === vaultIdConstraint &&
                      (branchConstraint === undefined || file.branch === branchConstraint) &&
                      (beforeCreationTime === undefined || file._creationTime < beforeCreationTime),
                  )
                  .sort(
                    (left, right) =>
                      left._creationTime - right._creationTime || left._id.localeCompare(right._id),
                  );
                const offset = paginationOpts.cursor === null ? 0 : Number(paginationOpts.cursor);
                if (!Number.isInteger(offset) || offset < 0) {
                  throw new Error("Pagination cursor must contain a non-negative integer.");
                }
                const batchSize = Math.min(
                  paginationOpts.numItems,
                  paginationOpts.maximumRowsRead ?? paginationOpts.numItems,
                );
                const page = matchingFiles.slice(offset, offset + batchSize);
                const nextOffset = offset + page.length;

                return {
                  page,
                  isDone: nextOffset >= matchingFiles.length,
                  continueCursor: String(nextOffset),
                };
              },
            };
          },
        }),
        delete: async (id: string) => {
          deletedIds.push(id);
        },
      },
      scheduler: {
        runAfter: async (delayMs: number, fnRef: unknown, scheduledArgs: unknown) => {
          scheduledCalls.push({ delayMs, fnRef, args: scheduledArgs });
        },
      },
    },
  };
}

function createClearMatchingStagingSnapshotTestContext(args: {
  stagedFiles: Array<{
    _id: string;
    _creationTime: number;
    ownerId: string;
    vaultId: string;
    fileDeleted: boolean;
    filePath: string;
    initialFilePath: string;
    content: string;
    initialContent: string;
    parentCommitSha: string | null;
    lastEditTime: number;
    lastEditUserId: string;
    branch: string;
    version: number;
  }>;
}) {
  const deletedIds: string[] = [];
  const scheduledCalls: Array<{
    delayMs: number;
    fnRef: unknown;
    args: unknown;
  }> = [];
  const stagingById = new Map(args.stagedFiles.map((file) => [file._id, file] as const));

  return {
    deletedIds,
    scheduledCalls,
    ctx: {
      db: {
        get: async (id: string) => stagingById.get(id) ?? null,
        delete: async (id: string) => {
          deletedIds.push(id);
        },
      },
      scheduler: {
        runAfter: async (delayMs: number, fnRef: unknown, scheduledArgs: unknown) => {
          scheduledCalls.push({ delayMs, fnRef, args: scheduledArgs });
        },
      },
    },
  };
}

describe("selectRepositoryTreeForBranch", () => {
  it("returns the branch-scoped tree when it exists", () => {
    expect(
      selectRepositoryTreeForBranch({
        requestedBranch: "feature/login",
        branchTree,
      }),
    ).toEqual(branchTree);
  });

  it("throws for missing branch trees", () => {
    expect(() =>
      selectRepositoryTreeForBranch({
        requestedBranch: "feature/login",
        branchTree: null,
      }),
    ).toThrow('Branch tree is not cached for "feature/login"');
  });

  it("throws for default branch before the legacy tree cache is synced", () => {
    expect(() =>
      selectRepositoryTreeForBranch({
        requestedBranch: "main",
        branchTree: null,
      }),
    ).toThrow('Branch tree is not cached for "main"');
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
      {
        branch: "main",
        fileDeleted: true,
        parentCommitSha: null,
        filePath: "src/tmp.ts",
        initialFilePath: "src/tmp.ts",
        content: "temp",
        initialContent: "",
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

describe("buildDeletedFileRestoreCandidate", () => {
  it("clears the deleted flag while preserving rename and content changes", () => {
    expect(
      buildDeletedFileRestoreCandidate({
        fileDeleted: true,
        parentCommitSha: "abc123",
        filePath: "src/new-name.ts",
        initialFilePath: "src/old-name.ts",
        content: "updated",
        initialContent: "original",
      }),
    ).toEqual({
      fileDeleted: false,
      parentCommitSha: "abc123",
      filePath: "src/new-name.ts",
      initialFilePath: "src/old-name.ts",
      content: "updated",
      initialContent: "original",
    });
  });

  it("restores an existing file back to an unchanged candidate", () => {
    expect(
      buildDeletedFileRestoreCandidate({
        fileDeleted: true,
        parentCommitSha: "abc123",
        filePath: "README.md",
        initialFilePath: "README.md",
        content: "# Readme",
        initialContent: "# Readme",
      }),
    ).toEqual({
      fileDeleted: false,
      parentCommitSha: "abc123",
      filePath: "README.md",
      initialFilePath: "README.md",
      content: "# Readme",
      initialContent: "# Readme",
    });
  });

  it("restores a newly created file back to a new-file candidate", () => {
    expect(
      buildDeletedFileRestoreCandidate({
        fileDeleted: true,
        parentCommitSha: null,
        filePath: "src/new.ts",
        initialFilePath: "src/new.ts",
        content: "hello",
        initialContent: "",
      }),
    ).toEqual({
      fileDeleted: false,
      parentCommitSha: null,
      filePath: "src/new.ts",
      initialFilePath: "src/new.ts",
      content: "hello",
      initialContent: "",
    });
  });
});

describe("buildClearAllStagingPlan", () => {
  it("uses a branch-scoped query when a branch is provided", () => {
    expect(
      buildClearAllStagingPlan({
        vaultId: "vault-1",
        branch: "feature/login",
        cleanupCutoffTimestamp: 123,
      }),
    ).toEqual({
      stagingQuery: {
        indexName: "by_vault_and_branch",
        vaultId: "vault-1",
        branch: "feature/login",
      },
      deleteCollaborativeUpdatesArgs: {
        vaultId: "vault-1",
        branch: "feature/login",
        cutoffTimestamp: 123,
      },
    });
  });

  it("falls back to vault-wide clearing when no branch is provided", () => {
    expect(
      buildClearAllStagingPlan({
        vaultId: "vault-1",
        cleanupCutoffTimestamp: 456,
      }),
    ).toEqual({
      stagingQuery: {
        indexName: "by_vault",
        vaultId: "vault-1",
      },
      deleteCollaborativeUpdatesArgs: {
        vaultId: "vault-1",
        branch: undefined,
        cutoffTimestamp: 456,
      },
    });
  });

  it("clears only the requested branch without scheduling a provider refresh", async () => {
    const targetVaultId = "vault-1";
    const targetBranch = "feature/login";
    const context = createClearAllStagingTestContext({
      stagedFiles: [
        {
          _id: "feature-1",
          _creationTime: 1,
          vaultId: targetVaultId,
          branch: targetBranch,
          lastEditTime: 1,
        },
        {
          _id: "feature-2",
          _creationTime: 2,
          vaultId: targetVaultId,
          branch: targetBranch,
          lastEditTime: 2,
        },
        {
          _id: "main-1",
          _creationTime: 3,
          vaultId: targetVaultId,
          branch: "main",
          lastEditTime: 3,
        },
        {
          _id: "other-vault",
          _creationTime: 4,
          vaultId: "vault-2",
          branch: targetBranch,
          lastEditTime: 4,
        },
      ],
    });

    // @ts-expect-error Regression test uses a minimal MutationCtx stub that only includes accessed fields.
    await clearAllStagingImpl(context.ctx, {
      vaultId: targetVaultId,
      branch: targetBranch,
    });

    expect(context.queriedScopes).toEqual([
      {
        table: "fileStaging",
        indexName: "by_vault_and_branch",
        constraints: [
          { operator: "eq", field: "vaultId", value: targetVaultId },
          { operator: "eq", field: "branch", value: targetBranch },
          {
            operator: "lt",
            field: "_creationTime",
            value: expect.any(Number),
          },
        ],
        paginationOpts: {
          numItems: 10,
          cursor: null,
          maximumRowsRead: 10,
          maximumBytesRead: 8_388_608,
        },
      },
    ]);
    expect(context.deletedIds).toEqual(["feature-1", "feature-2"]);
    expect(context.scheduledCalls).toEqual([
      {
        delayMs: 0,
        fnRef: internal.fileStaging.deleteCollaborativeUpdatesBatch,
        args: {
          vaultId: targetVaultId,
          branch: targetBranch,
          cutoffTimestamp: expect.any(Number),
        },
      },
    ]);
  });

  it("clears every staged branch without scheduling provider refreshes", async () => {
    const targetVaultId = "vault-1";
    const context = createClearAllStagingTestContext({
      stagedFiles: [
        {
          _id: "main-1",
          _creationTime: 1,
          vaultId: targetVaultId,
          branch: "main",
          lastEditTime: 1,
        },
        {
          _id: "feature-1",
          _creationTime: 2,
          vaultId: targetVaultId,
          branch: "feature/login",
          lastEditTime: 2,
        },
        {
          _id: "main-2",
          _creationTime: 3,
          vaultId: targetVaultId,
          branch: "main",
          lastEditTime: 3,
        },
        {
          _id: "other-vault",
          _creationTime: 4,
          vaultId: "vault-2",
          branch: "other",
          lastEditTime: 4,
        },
      ],
    });

    // @ts-expect-error Regression test uses a minimal MutationCtx stub that only includes accessed fields.
    await clearAllStagingImpl(context.ctx, { vaultId: targetVaultId });

    expect(context.deletedIds).toEqual(["main-1", "feature-1", "main-2"]);
    expect(context.scheduledCalls).toHaveLength(1);
    expect(context.scheduledCalls[0]?.fnRef).toEqual(
      internal.fileStaging.deleteCollaborativeUpdatesBatch,
    );
  });

  it("continues vault-wide clearing in bounded batches without deleting newer edits", async () => {
    const targetVaultId = "vault-1";
    const cutoffTimestamp = 1_000;
    const context = createClearAllStagingTestContext({
      stagedFiles: [
        ...Array.from({ length: 12 }, (_, index) => ({
          _id: `staging-${String(index + 1).padStart(2, "0")}`,
          _creationTime: Math.floor(index / 2) + 1,
          vaultId: targetVaultId,
          branch: index % 2 === 0 ? "main" : "feature/login",
          lastEditTime: index === 4 ? cutoffTimestamp : 100,
        })),
        {
          _id: "created-after-clear",
          _creationTime: cutoffTimestamp,
          vaultId: targetVaultId,
          branch: "main",
          lastEditTime: cutoffTimestamp,
        },
      ],
    });

    // @ts-expect-error Regression test uses a minimal MutationCtx stub that only includes accessed fields.
    await clearAllStagingBatchImpl(context.ctx, {
      vaultId: targetVaultId,
      cutoffTimestamp,
      paginationOpts: {
        numItems: 10,
        cursor: null,
        maximumRowsRead: 10,
        maximumBytesRead: 8_388_608,
      },
    });

    expect(context.deletedIds).toEqual([
      "staging-01",
      "staging-02",
      "staging-03",
      "staging-04",
      "staging-06",
      "staging-07",
      "staging-08",
      "staging-09",
      "staging-10",
    ]);
    expect(context.queriedScopes).toEqual([
      {
        table: "fileStaging",
        indexName: "by_vault",
        constraints: [
          { operator: "eq", field: "vaultId", value: targetVaultId },
          { operator: "lt", field: "_creationTime", value: cutoffTimestamp },
        ],
        paginationOpts: {
          numItems: 10,
          cursor: null,
          maximumRowsRead: 10,
          maximumBytesRead: 8_388_608,
        },
      },
    ]);
    expect(context.scheduledCalls).toHaveLength(1);
    expect(context.scheduledCalls.at(-1)?.args).toEqual({
      vaultId: targetVaultId,
      branch: undefined,
      cutoffTimestamp,
      paginationOpts: {
        numItems: 10,
        cursor: "10",
        maximumRowsRead: 10,
        maximumBytesRead: 8_388_608,
      },
    });

    // @ts-expect-error Regression test uses a minimal MutationCtx stub that only includes accessed fields.
    await clearAllStagingBatchImpl(context.ctx, {
      vaultId: targetVaultId,
      cutoffTimestamp,
      paginationOpts: {
        numItems: 10,
        cursor: "10",
        maximumRowsRead: 10,
        maximumBytesRead: 8_388_608,
      },
    });

    expect(context.deletedIds).toEqual([
      "staging-01",
      "staging-02",
      "staging-03",
      "staging-04",
      "staging-06",
      "staging-07",
      "staging-08",
      "staging-09",
      "staging-10",
      "staging-11",
      "staging-12",
    ]);
    expect(context.queriedScopes.at(-1)).toEqual({
      table: "fileStaging",
      indexName: "by_vault",
      constraints: [
        { operator: "eq", field: "vaultId", value: targetVaultId },
        { operator: "lt", field: "_creationTime", value: cutoffTimestamp },
      ],
      paginationOpts: {
        numItems: 10,
        cursor: "10",
        maximumRowsRead: 10,
        maximumBytesRead: 8_388_608,
      },
    });
    expect(context.scheduledCalls).toHaveLength(1);
  });
});

describe("clearMatchingStagingSnapshotImpl", () => {
  it("clears only the unchanged snapshot rows and scopes cleanup by file path", async () => {
    const context = createClearMatchingStagingSnapshotTestContext({
      stagedFiles: [
        {
          _id: "matching-1",
          _creationTime: 1,
          ownerId: "users:owner",
          vaultId: "vault-1",
          fileDeleted: false,
          filePath: "src/new-name.ts",
          initialFilePath: "src/old-name.ts",
          content: "updated",
          initialContent: "original",
          parentCommitSha: "sha-1",
          lastEditTime: 200,
          lastEditUserId: "users:owner",
          branch: "main",
          version: 3,
        },
        {
          _id: "changed-1",
          _creationTime: 2,
          ownerId: "users:owner",
          vaultId: "vault-1",
          fileDeleted: false,
          filePath: "src/keep.ts",
          initialFilePath: "src/keep.ts",
          content: "newer content",
          initialContent: "original",
          parentCommitSha: "sha-2",
          lastEditTime: 450,
          lastEditUserId: "users:other",
          branch: "main",
          version: 4,
        },
      ],
    });

    // @ts-expect-error Regression test uses a minimal MutationCtx stub that only includes accessed fields.
    await clearMatchingStagingSnapshotImpl(context.ctx, {
      vaultId: "vault-1",
      branch: "main",
      stagedFiles: [
        {
          _id: "matching-1",
          ownerId: "users:owner",
          vaultId: "vault-1",
          fileDeleted: false,
          filePath: "src/new-name.ts",
          initialFilePath: "src/old-name.ts",
          content: "updated",
          initialContent: "original",
          parentCommitSha: "sha-1",
          lastEditTime: 200,
          lastEditUserId: "users:owner",
          branch: "main",
          version: 3,
        },
        {
          _id: "changed-1",
          ownerId: "users:owner",
          vaultId: "vault-1",
          fileDeleted: false,
          filePath: "src/keep.ts",
          initialFilePath: "src/keep.ts",
          content: "original retry snapshot",
          initialContent: "original",
          parentCommitSha: "sha-2",
          lastEditTime: 300,
          lastEditUserId: "users:owner",
          branch: "main",
          version: 2,
        },
      ],
    });

    expect(context.deletedIds).toEqual(["matching-1"]);
    expect(context.scheduledCalls).toEqual([
      {
        delayMs: 0,
        fnRef: internal.fileStaging.deleteCollaborativeUpdatesForFilePathBatch,
        args: {
          vaultId: "vault-1",
          branch: "main",
          filePath: "src/new-name.ts",
          cutoffTimestamp: 201,
        },
      },
      {
        delayMs: 0,
        fnRef: internal.fileStaging.deleteCollaborativeUpdatesForFilePathBatch,
        args: {
          vaultId: "vault-1",
          branch: "main",
          filePath: "src/old-name.ts",
          cutoffTimestamp: 201,
        },
      },
    ]);
  });
});

describe("buildDeletionSnapshotSeed", () => {
  it("preserves the base blob sha for binary deletion seeds", () => {
    expect(
      buildDeletionSnapshotSeed({
        parentCommitSha: "blob-sha",
        blob: {
          mime: "image/png",
          size: 42,
        },
      }),
    ).toEqual({
      initialContent: "",
      kind: "binary",
      mime: "image/png",
      size: 42,
      stagedBlobSha: "blob-sha",
    });
  });

  it("keeps inline text content for text deletion seeds", () => {
    expect(
      buildDeletionSnapshotSeed({
        parentCommitSha: "blob-sha",
        blob: {
          text: "hello\n",
        },
      }),
    ).toEqual({
      initialContent: "hello\n",
      kind: "text",
    });
  });
});

describe("shouldDeleteSupersededStagedBinaryUpload", () => {
  it("cleans up superseded uploaded blobs that are no longer referenced", () => {
    expect(
      shouldDeleteSupersededStagedBinaryUpload({
        existingStaging: {
          kind: "binary",
          storageId: "storage-old",
          stagedBlobSha: "uploaded-sha",
          parentCommitSha: "base-sha",
        },
        nextStorageId: "storage-new",
        storageReferenceCount: 1,
      }),
    ).toBe(true);
  });

  it("keeps repository-backed binary blobs in place during replacements", () => {
    expect(
      shouldDeleteSupersededStagedBinaryUpload({
        existingStaging: {
          kind: "binary",
          storageId: "storage-old",
          stagedBlobSha: "base-sha",
          parentCommitSha: "base-sha",
        },
        nextStorageId: "storage-new",
        storageReferenceCount: 1,
      }),
    ).toBe(false);
  });
});
