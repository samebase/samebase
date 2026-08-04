import { describe, expect, it } from "vite-plus/test";
import { internal } from "./_generated/api";

import {
  advanceCommittedStagingSnapshotImpl,
  buildDeletionSnapshotSeed,
  buildDeletedFileRestoreCandidate,
  buildClearAllStagingPlan,
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
  targetVaultId: string;
  vault: {
    state: "connected";
    deletion: { state: "not_deleting" };
    owner: string;
    name: string;
    defaultBranch: string;
  } | null;
  stagedFiles: Array<{ _id: string; vaultId: string; branch: string }>;
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
    constraints: Array<{ field: string; value: string }>;
  }> = [];

  return {
    deletedIds,
    queriedScopes,
    scheduledCalls,
    ctx: {
      db: {
        get: async (id: string) => (id === args.targetVaultId ? args.vault : null),
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
                if (table !== "vaultStagedFiles") {
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
                    (branchConstraint === undefined || file.branch === branchConstraint),
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
    vaultId: string;
    fileDeleted: boolean;
    kind: "text" | "binary";
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
    stagingById,
    ctx: {
      db: {
        get: async (id: string) => stagingById.get(id) ?? null,
        patch: async (id: string, value: Record<string, unknown>) => {
          const current = stagingById.get(id);
          if (!current) {
            throw new Error("Staged file not found");
          }
          Object.assign(current, value);
        },
        delete: async (id: string) => {
          deletedIds.push(id);
          stagingById.delete(id);
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

  it("throws for the default branch before its exact tree observation exists", () => {
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
        kind: "text",
        fileDeleted: false,
        parentCommitSha: "abc123",
        filePath: "src/app.ts",
        initialFilePath: "src/app.ts",
        content: "new content",
        initialContent: "old content",
      },
      {
        branch: "feature/login",
        kind: "text",
        fileDeleted: false,
        parentCommitSha: "abc123",
        filePath: "src/new-name.ts",
        initialFilePath: "src/old-name.ts",
        content: "same",
        initialContent: "same",
      },
      {
        branch: "feature/login",
        kind: "text",
        fileDeleted: false,
        parentCommitSha: "abc123",
        filePath: "src/new-login.ts",
        initialFilePath: "src/old-login.ts",
        content: "updated",
        initialContent: "original",
      },
      {
        branch: "main",
        kind: "text",
        fileDeleted: true,
        parentCommitSha: "abc123",
        filePath: "README.md",
        initialFilePath: "README.md",
        content: "",
        initialContent: "# Readme",
      },
      {
        branch: "main",
        kind: "text",
        fileDeleted: false,
        parentCommitSha: null,
        filePath: "src/new.ts",
        initialFilePath: "src/new.ts",
        content: "hello",
        initialContent: "",
      },
      {
        branch: "main",
        kind: "text",
        fileDeleted: false,
        parentCommitSha: "abc123",
        filePath: "src/unchanged.ts",
        initialFilePath: "src/unchanged.ts",
        content: "same",
        initialContent: "same",
      },
      {
        branch: "main",
        kind: "text",
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

describe("buildDeletedFileRestoreCandidate", () => {
  it("clears the deleted flag while preserving rename and content changes", () => {
    expect(
      buildDeletedFileRestoreCandidate({
        kind: "text",
        fileDeleted: true,
        parentCommitSha: "abc123",
        filePath: "src/new-name.ts",
        initialFilePath: "src/old-name.ts",
        content: "updated",
        initialContent: "original",
      }),
    ).toEqual({
      kind: "text",
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
        kind: "text",
        fileDeleted: true,
        parentCommitSha: "abc123",
        filePath: "README.md",
        initialFilePath: "README.md",
        content: "# Readme",
        initialContent: "# Readme",
      }),
    ).toEqual({
      kind: "text",
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
        kind: "text",
        fileDeleted: true,
        parentCommitSha: null,
        filePath: "src/new.ts",
        initialFilePath: "src/new.ts",
        content: "hello",
        initialContent: "",
      }),
    ).toEqual({
      kind: "text",
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
  it("uses a branch-scoped query and refresh plan when a branch is provided", () => {
    expect(
      buildClearAllStagingPlan({
        vaultId: "vault-1",
        userId: "users:owner",
        branch: "feature/login",
        cleanupCutoffTimestamp: 123,
        vault: {
          owner: "octo",
          name: "repo",
          defaultBranch: "main",
        },
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
      treeRefreshArgs: {
        userId: "users:owner",
        owner: "octo",
        repo: "repo",
        branch: "feature/login",
      },
    });
  });

  it("falls back to vault-wide clearing when no branch is provided", () => {
    expect(
      buildClearAllStagingPlan({
        vaultId: "vault-1",
        userId: "users:owner",
        cleanupCutoffTimestamp: 456,
        vault: {
          owner: "octo",
          name: "repo",
          defaultBranch: "main",
        },
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
      treeRefreshArgs: {
        userId: "users:owner",
        owner: "octo",
        repo: "repo",
        branch: "main",
      },
    });
  });

  it("skips tree refresh when the vault is missing", () => {
    expect(
      buildClearAllStagingPlan({
        vaultId: "vault-1",
        userId: "users:owner",
        branch: "feature/login",
        cleanupCutoffTimestamp: 789,
        vault: null,
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
        cutoffTimestamp: 789,
      },
      treeRefreshArgs: null,
    });
  });

  it("clears only the requested branch and refreshes that branch", async () => {
    const targetVaultId = "vault-1";
    const targetBranch = "feature/login";
    const context = createClearAllStagingTestContext({
      targetVaultId,
      vault: {
        state: "connected",
        deletion: { state: "not_deleting" },
        owner: "octo",
        name: "repo",
        defaultBranch: "main",
      },
      stagedFiles: [
        { _id: "feature-1", vaultId: targetVaultId, branch: targetBranch },
        { _id: "feature-2", vaultId: targetVaultId, branch: targetBranch },
        { _id: "main-1", vaultId: targetVaultId, branch: "main" },
        { _id: "other-vault", vaultId: "vault-2", branch: targetBranch },
      ],
    });

    // @ts-expect-error Regression test uses a minimal MutationCtx stub that only includes accessed fields.
    await clearAllStagingImpl(context.ctx, {
      vaultId: targetVaultId,
      userId: "users:owner",
      branch: targetBranch,
    });

    expect(context.queriedScopes).toEqual([
      {
        table: "vaultStagedFiles",
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
        fnRef: internal.fileStaging.deleteCollaborativeUpdatesBatch,
        args: {
          vaultId: targetVaultId,
          branch: targetBranch,
          cutoffTimestamp: expect.any(Number),
        },
      },
      {
        delayMs: 0,
        fnRef: internal.github.updateRepositoryTree,
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

describe("clearMatchingStagingSnapshotImpl", () => {
  it("clears the committed snapshot and preserves an edit made during the commit", async () => {
    const context = createClearMatchingStagingSnapshotTestContext({
      stagedFiles: [
        {
          _id: "matching-1",
          _creationTime: 1,
          vaultId: "vault-1",
          fileDeleted: false,
          kind: "text",
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
          vaultId: "vault-1",
          fileDeleted: false,
          kind: "text",
          filePath: "src/keep.ts",
          initialFilePath: "src/keep.ts",
          content: "edit after the commit snapshot",
          initialContent: "original",
          parentCommitSha: "sha-2",
          lastEditTime: 450,
          lastEditUserId: "users:owner",
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
          vaultId: "vault-1",
          fileDeleted: false,
          kind: "text",
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
          vaultId: "vault-1",
          fileDeleted: false,
          kind: "text",
          filePath: "src/keep.ts",
          initialFilePath: "src/keep.ts",
          content: "content in the commit snapshot",
          initialContent: "original",
          parentCommitSha: "sha-2",
          lastEditTime: 300,
          lastEditUserId: "users:owner",
          branch: "main",
          version: 3,
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

describe("advanceCommittedStagingSnapshotImpl", () => {
  const committedTextSnapshot = {
    _id: "staging-1",
    vaultId: "vault-1",
    fileDeleted: false,
    kind: "text" as const,
    filePath: "src/app.ts",
    initialFilePath: "src/app.ts",
    content: "committed edit",
    initialContent: "original",
    parentCommitSha: "sha-old",
    lastEditTime: 200,
    lastEditUserId: "users:owner",
    branch: "main",
    version: 3,
  };
  const committedTextBaseline = {
    state: "present" as const,
    kind: "text" as const,
    filePath: "src/app.ts",
    content: "committed edit",
    parentCommitSha: "sha-new",
  };

  it("keeps the same clean row and version for a delayed editor save", async () => {
    const context = createClearMatchingStagingSnapshotTestContext({
      stagedFiles: [{ _creationTime: 1, ...committedTextSnapshot }],
    });

    // @ts-expect-error Regression test uses a minimal MutationCtx stub that only includes accessed fields.
    await advanceCommittedStagingSnapshotImpl(context.ctx, {
      vaultId: "vault-1",
      branch: "main",
      files: [{ snapshot: committedTextSnapshot, baseline: committedTextBaseline }],
    });

    expect(context.stagingById.get("staging-1")).toMatchObject({
      _id: "staging-1",
      content: "committed edit",
      initialContent: "committed edit",
      parentCommitSha: "sha-new",
      version: 3,
    });
    expect(context.deletedIds).toEqual([]);
    expect(context.scheduledCalls).toEqual([]);
  });

  it("keeps a newer local edit and moves only its Git baseline", async () => {
    const context = createClearMatchingStagingSnapshotTestContext({
      stagedFiles: [
        {
          _creationTime: 1,
          ...committedTextSnapshot,
          content: "edit saved during commit",
          lastEditTime: 300,
          version: 4,
        },
      ],
    });

    // @ts-expect-error Regression test uses a minimal MutationCtx stub that only includes accessed fields.
    await advanceCommittedStagingSnapshotImpl(context.ctx, {
      vaultId: "vault-1",
      branch: "main",
      files: [{ snapshot: committedTextSnapshot, baseline: committedTextBaseline }],
    });

    expect(context.stagingById.get("staging-1")).toMatchObject({
      content: "edit saved during commit",
      initialContent: "committed edit",
      parentCommitSha: "sha-new",
      version: 4,
    });
    expect(context.deletedIds).toEqual([]);
    expect(context.scheduledCalls).toEqual([]);
  });

  it("removes an exact committed deletion and its update history", async () => {
    const snapshot = {
      ...committedTextSnapshot,
      fileDeleted: true,
      content: "original",
    };
    const context = createClearMatchingStagingSnapshotTestContext({
      stagedFiles: [{ _creationTime: 1, ...snapshot }],
    });

    // @ts-expect-error Regression test uses a minimal MutationCtx stub that only includes accessed fields.
    await advanceCommittedStagingSnapshotImpl(context.ctx, {
      vaultId: "vault-1",
      branch: "main",
      files: [{ snapshot, baseline: { state: "deleted" } }],
    });

    expect(context.stagingById.has("staging-1")).toBe(false);
    expect(context.deletedIds).toEqual(["staging-1"]);
    expect(context.scheduledCalls).toEqual([
      {
        delayMs: 0,
        fnRef: internal.fileStaging.deleteCollaborativeUpdatesForFilePathBatch,
        args: {
          vaultId: "vault-1",
          branch: "main",
          filePath: "src/app.ts",
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
