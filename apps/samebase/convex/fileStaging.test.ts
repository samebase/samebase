import { describe, expect, it } from "vite-plus/test";
import { internal } from "./_generated/api";

import {
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
  targetRepositoryId: string;
  repository: {
    userId: string;
    state: "connected";
    deletion: { state: "not_deleting" };
    owner: string;
    name: string;
    defaultBranch: string;
  } | null;
  stagedFiles: Array<{ _id: string; repositoryId: string; branch: string }>;
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
  let cleanupLeaseSequence = 0;

  return {
    deletedIds,
    queriedScopes,
    scheduledCalls,
    ctx: {
      db: {
        get: async (id: string) => (id === args.targetRepositoryId ? args.repository : null),
        insert: async () => `cleanup-lease-${++cleanupLeaseSequence}`,
        patch: async () => {},
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
                if (table !== "repositoryStagedFiles") {
                  return [];
                }

                const repositoryIdConstraint = constraints.find(
                  (constraint) => constraint.field === "repositoryId",
                )?.value;
                const branchConstraint = constraints.find(
                  (constraint) => constraint.field === "branch",
                )?.value;

                return args.stagedFiles.filter(
                  (file) =>
                    file.repositoryId === repositoryIdConstraint &&
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
    repositoryId: string;
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
  let cleanupLeaseSequence = 0;

  return {
    deletedIds,
    scheduledCalls,
    ctx: {
      db: {
        get: async (id: string) => stagingById.get(id) ?? null,
        insert: async () => `cleanup-lease-${++cleanupLeaseSequence}`,
        patch: async () => {},
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
  it("uses a branch-scoped query and refresh plan when a branch is provided", () => {
    expect(
      buildClearAllStagingPlan({
        repositoryId: "repository-1",
        branch: "feature/login",
        cleanupCutoffTimestamp: 123,
        repository: {
          userId: "users:owner",
          defaultBranch: "main",
        },
      }),
    ).toEqual({
      stagingQuery: {
        indexName: "by_repository_and_branch",
        repositoryId: "repository-1",
        branch: "feature/login",
      },
      deleteCollaborativeUpdatesArgs: {
        repositoryId: "repository-1",
        branch: "feature/login",
        cutoffTimestamp: 123,
      },
      treeRefreshArgs: {
        userId: "users:owner",
        repositoryId: "repository-1",
        branch: "feature/login",
      },
    });
  });

  it("falls back to repository-wide clearing when no branch is provided", () => {
    expect(
      buildClearAllStagingPlan({
        repositoryId: "repository-1",
        cleanupCutoffTimestamp: 456,
        repository: {
          userId: "users:owner",
          defaultBranch: "main",
        },
      }),
    ).toEqual({
      stagingQuery: {
        indexName: "by_repository",
        repositoryId: "repository-1",
      },
      deleteCollaborativeUpdatesArgs: {
        repositoryId: "repository-1",
        branch: undefined,
        cutoffTimestamp: 456,
      },
      treeRefreshArgs: {
        userId: "users:owner",
        repositoryId: "repository-1",
        branch: "main",
      },
    });
  });

  it("skips tree refresh when the repository is missing", () => {
    expect(
      buildClearAllStagingPlan({
        repositoryId: "repository-1",
        branch: "feature/login",
        cleanupCutoffTimestamp: 789,
        repository: null,
      }),
    ).toEqual({
      stagingQuery: {
        indexName: "by_repository_and_branch",
        repositoryId: "repository-1",
        branch: "feature/login",
      },
      deleteCollaborativeUpdatesArgs: {
        repositoryId: "repository-1",
        branch: "feature/login",
        cutoffTimestamp: 789,
      },
      treeRefreshArgs: null,
    });
  });

  it("clears only the requested branch and refreshes that branch", async () => {
    const targetRepositoryId = "repository-1";
    const targetBranch = "feature/login";
    const context = createClearAllStagingTestContext({
      targetRepositoryId,
      repository: {
        userId: "users:owner",
        state: "connected",
        deletion: { state: "not_deleting" },
        owner: "octo",
        name: "repo",
        defaultBranch: "main",
      },
      stagedFiles: [
        { _id: "feature-1", repositoryId: targetRepositoryId, branch: targetBranch },
        { _id: "feature-2", repositoryId: targetRepositoryId, branch: targetBranch },
        { _id: "main-1", repositoryId: targetRepositoryId, branch: "main" },
        { _id: "other-repository", repositoryId: "repository-2", branch: targetBranch },
      ],
    });

    // @ts-expect-error Regression test uses a minimal MutationCtx stub that only includes accessed fields.
    await clearAllStagingImpl(context.ctx, {
      repositoryId: targetRepositoryId,
      userId: "users:owner",
      branch: targetBranch,
    });

    expect(context.queriedScopes).toEqual([
      {
        table: "repositoryStagedFiles",
        indexName: "by_repository_and_branch",
        constraints: [
          { field: "repositoryId", value: targetRepositoryId },
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
          repositoryId: targetRepositoryId,
          branch: targetBranch,
          cutoffTimestamp: expect.any(Number),
          leaseId: "cleanup-lease-1",
          operationId: expect.stringContaining("staging-cleanup:cleanup-lease-1:"),
          operationName: "staging_cleanup",
        },
      },
      {
        delayMs: 0,
        fnRef: internal.github.updateRepositoryTree,
        args: {
          userId: "users:owner",
          repositoryId: targetRepositoryId,
          branch: targetBranch,
        },
      },
    ]);
  });
});

describe("clearMatchingStagingSnapshotImpl", () => {
  it("clears only the unchanged snapshot rows and scopes cleanup by file path", async () => {
    const context = createClearMatchingStagingSnapshotTestContext({
      stagedFiles: [
        {
          _id: "matching-1",
          _creationTime: 1,
          repositoryId: "repository-1",
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
          repositoryId: "repository-1",
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
      repositoryId: "repository-1",
      branch: "main",
      stagedFiles: [
        {
          _id: "matching-1",
          repositoryId: "repository-1",
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
          repositoryId: "repository-1",
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
          repositoryId: "repository-1",
          branch: "main",
          filePath: "src/new-name.ts",
          cutoffTimestamp: 201,
          leaseId: "cleanup-lease-1",
          operationId: expect.stringContaining("staging-cleanup:cleanup-lease-1:"),
          operationName: "staging_cleanup",
        },
      },
      {
        delayMs: 0,
        fnRef: internal.fileStaging.deleteCollaborativeUpdatesForFilePathBatch,
        args: {
          repositoryId: "repository-1",
          branch: "main",
          filePath: "src/old-name.ts",
          cutoffTimestamp: 201,
          leaseId: "cleanup-lease-2",
          operationId: expect.stringContaining("staging-cleanup:cleanup-lease-2:"),
          operationName: "staging_cleanup",
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
