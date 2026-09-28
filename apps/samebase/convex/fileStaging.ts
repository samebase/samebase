import { v, type Infer } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./functions";
import { findRepositoryForUser } from "./organizationAccess";
import type { GitHubTree } from "./repository/model";
import {
  hasStagedFileChanges,
  hasStagedFileContentChange,
  readStagedFileKind,
  type StagedFileChangeCandidate,
} from "./stagingChanges";
import { assertConnectedRepository, isLiveConnectedRepository } from "./repository/state";
import { readActiveUser } from "./identity/lifecycle";

export const AUTO_COMMIT_DELAY_MS = 2 * 1000;
const { array, boolean, id, literal, number, object, optional, string, union } = v;

const repositoryIdValidator = id("repositories");
const fileStagingIdValidator = id("repositoryStagedFiles");
const storageIdValidator = id("_storage");
const userIdValidator = id("users");
const branchValidator = string();
const filePathValidator = string();
const contentValidator = string();
const stagedFileKindValidator = union(literal("text"), literal("binary"));
const nullableStringValidator = union(string(), v.null());
const nullResultValidator = v.null();
type StagingCleanupTarget = {
  repositoryId: Id<"repositories">;
  branch?: string;
  filePath?: string;
  cutoffTimestamp: number;
};

const stagedFileValidator = object({
  _id: fileStagingIdValidator,
  _creationTime: number(),
  repositoryId: repositoryIdValidator,
  fileDeleted: boolean(),
  kind: optional(stagedFileKindValidator),
  filePath: filePathValidator,
  initialFilePath: filePathValidator,
  content: contentValidator,
  initialContent: contentValidator,
  storageId: optional(storageIdValidator),
  mime: optional(string()),
  size: optional(number()),
  stagedBlobSha: optional(string()),
  parentCommitSha: nullableStringValidator,
  lastEditTime: number(),
  lastEditUserId: userIdValidator,
  branch: branchValidator,
  version: number(),
});
type StagedFile = Infer<typeof stagedFileValidator>;
const stagedFileSnapshotValidator = object({
  _id: fileStagingIdValidator,
  repositoryId: repositoryIdValidator,
  fileDeleted: boolean(),
  kind: optional(stagedFileKindValidator),
  filePath: filePathValidator,
  initialFilePath: filePathValidator,
  content: contentValidator,
  initialContent: contentValidator,
  storageId: optional(storageIdValidator),
  mime: optional(string()),
  size: optional(number()),
  stagedBlobSha: optional(string()),
  parentCommitSha: nullableStringValidator,
  lastEditTime: number(),
  lastEditUserId: userIdValidator,
  branch: branchValidator,
  version: number(),
});
type StagedFileSnapshot = Infer<typeof stagedFileSnapshotValidator>;

const stagedFileOrNullValidator = union(stagedFileValidator, v.null());
const stagedFileListValidator = array(stagedFileValidator);
const stagedFileSnapshotListValidator = array(stagedFileSnapshotValidator);
const stagedFilesCategoryCountsValidator = object({
  modified: number(),
  deleted: number(),
  new: number(),
  renamed: number(),
  renamedAndModified: number(),
  total: number(),
});
const stagedFilesBranchSummaryValidator = object({
  branch: branchValidator,
  counts: stagedFilesCategoryCountsValidator,
});
const stagedFilesBranchSummaryListValidator = array(stagedFilesBranchSummaryValidator);
const stagedFilesBranchSummariesByRepositoryValidator = object({
  repositoryId: repositoryIdValidator,
  branchSummaries: stagedFilesBranchSummaryListValidator,
});
const stagedFilesBranchSummariesByRepositoryListValidator = array(
  stagedFilesBranchSummariesByRepositoryValidator,
);
const uploadUrlResultValidator = object({
  uploadUrl: string(),
});

const getByNewPathArgsValidator = {
  repositoryId: repositoryIdValidator,
  branch: branchValidator,
  newPath: filePathValidator,
};

const listStagedFilesArgsValidator = {
  repositoryId: repositoryIdValidator,
  branch: branchValidator,
  includeUnchanged: optional(boolean()),
};

const listAllStagedFilesArgsValidator = {
  repositoryId: repositoryIdValidator,
  branch: optional(branchValidator),
  includeUnchanged: optional(boolean()),
};
const duplicateBranchStagingArgsValidator = {
  repositoryId: repositoryIdValidator,
  sourceBranch: branchValidator,
  targetBranch: branchValidator,
  stagedFiles: stagedFileSnapshotListValidator,
  userId: userIdValidator,
};
const clearMatchingStagingSnapshotArgsValidator = {
  repositoryId: repositoryIdValidator,
  branch: branchValidator,
  stagedFiles: stagedFileSnapshotListValidator,
};
const committedStagedFileValidator = object({
  snapshot: stagedFileSnapshotValidator,
  committedContent: contentValidator,
  committedBlobSha: nullableStringValidator,
});
const clearCommittedStagingArgsValidator = {
  repositoryId: repositoryIdValidator,
  branch: branchValidator,
  committedFiles: array(committedStagedFileValidator),
};

const deletionArgsValidator = {
  repositoryId: repositoryIdValidator,
  filePath: filePathValidator,
  parentCommitSha: nullableStringValidator,
  branch: branchValidator,
};

const revertDeletedFileArgsValidator = {
  repositoryId: repositoryIdValidator,
  filePath: filePathValidator,
  branch: branchValidator,
};

const createFileArgsValidator = {
  repositoryId: repositoryIdValidator,
  filePath: filePathValidator,
  content: contentValidator,
  branch: branchValidator,
};

const updateStagedFileContentArgsValidator = {
  stagingId: fileStagingIdValidator,
  content: contentValidator,
  expectedVersion: number(),
};

const saveToStagingArgsValidator = {
  repositoryId: repositoryIdValidator,
  initialFilePath: filePathValidator,
  content: contentValidator,
  initialContent: contentValidator,
  parentCommitSha: nullableStringValidator,
  branch: branchValidator,
  userId: userIdValidator,
};
const saveBinaryUploadToStagingArgsValidator = {
  repositoryId: repositoryIdValidator,
  filePath: filePathValidator,
  branch: branchValidator,
  storageId: storageIdValidator,
  mime: string(),
  size: number(),
  stagedBlobSha: string(),
  replaceExisting: boolean(),
  userId: userIdValidator,
};

const renameArgsValidator = {
  repositoryId: repositoryIdValidator,
  initialFilePath: filePathValidator,
  branch: branchValidator,
  newPath: filePathValidator,
  userId: userIdValidator,
};

const getByOriginalPathArgsValidator = {
  repositoryId: repositoryIdValidator,
  originalFilePath: filePathValidator,
  branch: branchValidator,
};

type StagedFilesCategoryCounts = Infer<typeof stagedFilesCategoryCountsValidator>;
type StagedFilesCategory = Exclude<keyof StagedFilesCategoryCounts, "total">;
type StagedFileSummaryInput = StagedFileChangeCandidate & Pick<StagedFile, "branch">;
type StagingAccessCtx = Pick<QueryCtx | MutationCtx, "db">;

function emptyStagedFilesCategoryCounts(): StagedFilesCategoryCounts {
  return {
    modified: 0,
    deleted: 0,
    new: 0,
    renamed: 0,
    renamedAndModified: 0,
    total: 0,
  };
}

function classifyStagedFile(file: StagedFileSummaryInput): StagedFilesCategory | null {
  if (!hasStagedFileChanges(file)) {
    return null;
  }
  if (file.fileDeleted) {
    return "deleted";
  }
  if (file.parentCommitSha === null) {
    return "new";
  }
  if (file.filePath !== file.initialFilePath) {
    return hasStagedFileContentChange(file) ? "renamedAndModified" : "renamed";
  }
  return "modified";
}

async function getRepositoryForStagingAccess(
  ctx: StagingAccessCtx,
  args: {
    repositoryId: Infer<typeof repositoryIdValidator>;
    userId: Infer<typeof userIdValidator>;
  },
): Promise<Doc<"repositories"> | null> {
  return await findRepositoryForUser(ctx.db, args);
}

async function assertRepositoryForStagingAccess(
  ctx: StagingAccessCtx,
  args: {
    repositoryId: Infer<typeof repositoryIdValidator>;
    userId: Infer<typeof userIdValidator>;
  },
) {
  const repository = await getRepositoryForStagingAccess(ctx, args);
  if (!repository) {
    throw new Error("Unauthorized");
  }
  return repository;
}

async function assertConnectedRepositoryForStagingWrite(
  ctx: MutationCtx,
  args: {
    repositoryId: Infer<typeof repositoryIdValidator>;
    userId: Infer<typeof userIdValidator>;
  },
) {
  const repository = await assertRepositoryForStagingAccess(ctx, args);
  const user = await ctx.db.get(args.userId);
  if (!user || readActiveUser(user) === null) {
    throw new Error("Account deletion is in progress.");
  }
  return assertConnectedRepository(repository);
}

export function selectRepositoryTreeForBranch(args: {
  requestedBranch: string;
  branchTree: GitHubTree[] | null;
}): GitHubTree[] {
  if (args.branchTree) {
    return args.branchTree;
  }
  throw new Error(
    `Branch tree is not cached for "${args.requestedBranch}". Refresh branch and retry.`,
  );
}

async function resolveRepositoryTreeForRepository(args: {
  ctx: MutationCtx;
  repositoryId: Infer<typeof repositoryIdValidator>;
  requestedBranch: string;
}): Promise<GitHubTree[]> {
  const branchTree = await args.ctx.runQuery(internal.repository.branches.getRepositoryBranchTree, {
    repositoryId: args.repositoryId,
    branch: args.requestedBranch,
  });
  return selectRepositoryTreeForBranch({
    requestedBranch: args.requestedBranch,
    branchTree: branchTree?.treeData.tree ?? null,
  });
}

export function summarizeStagedFilesByBranch(
  files: StagedFileSummaryInput[],
): Array<{ branch: string; counts: StagedFilesCategoryCounts }> {
  const countsByBranch = new Map<string, StagedFilesCategoryCounts>();
  for (const file of files) {
    const category = classifyStagedFile(file);
    if (!category) {
      continue;
    }

    const existing = countsByBranch.get(file.branch) ?? emptyStagedFilesCategoryCounts();
    existing[category] += 1;
    existing.total += 1;
    countsByBranch.set(file.branch, existing);
  }

  return Array.from(countsByBranch.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([branch, counts]) => ({ branch, counts }));
}

export function buildDeletedFileRestoreCandidate(
  file: StagedFileChangeCandidate,
): StagedFileChangeCandidate {
  return {
    ...file,
    fileDeleted: false,
  };
}

export function buildDeletionSnapshotSeed(args: {
  parentCommitSha: string | null;
  blob: {
    text?: string;
    mime?: string;
    size?: number;
  } | null;
}): {
  initialContent: string;
  kind: "text" | "binary";
  mime?: string;
  size?: number;
  stagedBlobSha?: string;
} {
  if (!args.parentCommitSha || !args.blob) {
    return {
      initialContent: "",
      kind: "text",
    };
  }

  if (typeof args.blob.text === "string") {
    return {
      initialContent: args.blob.text,
      kind: "text",
    };
  }

  return {
    initialContent: "",
    kind: "binary",
    mime: args.blob.mime,
    size: args.blob.size,
    stagedBlobSha: args.parentCommitSha,
  };
}

export function shouldDeleteSupersededStagedBinaryUpload(args: {
  existingStaging: {
    kind?: "text" | "binary";
    storageId?: string | null;
    stagedBlobSha?: string | null;
    parentCommitSha: string | null;
  };
  nextStorageId: string;
  storageReferenceCount: number;
}): boolean {
  if (readStagedFileKind(args.existingStaging.kind) !== "binary") {
    return false;
  }

  if (
    typeof args.existingStaging.storageId !== "string" ||
    args.existingStaging.storageId === args.nextStorageId
  ) {
    return false;
  }

  if (typeof args.existingStaging.stagedBlobSha !== "string" || args.storageReferenceCount !== 1) {
    return false;
  }

  return args.existingStaging.stagedBlobSha !== args.existingStaging.parentCommitSha;
}

async function readDeletionSnapshotSeed(
  ctx: MutationCtx,
  parentCommitSha: string | null,
): Promise<{
  initialContent: string;
  kind: "text" | "binary";
  mime?: string;
  size?: number;
  stagedBlobSha?: string;
}> {
  const blob = parentCommitSha
    ? await ctx.runQuery(internal.gitOperations.getBlobBySha, {
        sha: parentCommitSha,
      })
    : null;

  return buildDeletionSnapshotSeed({
    parentCommitSha,
    blob,
  });
}

// MARK: Public

export const generateUploadUrl = mutation({
  access: "access_files_write",
  args: {
    repositoryId: repositoryIdValidator,
  },
  returns: uploadUrlResultValidator,
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
    };
  },
});

export const deletePendingUploadBlob = mutation({
  access: "access_files_write",
  args: {
    repositoryId: repositoryIdValidator,
    storageId: storageIdValidator,
  },
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });

    const stagedFile = await ctx.db
      .query("repositoryStagedFiles")
      .withIndex("by_repository_and_storageId", (q) =>
        q.eq("repositoryId", args.repositoryId).eq("storageId", args.storageId),
      )
      .first();
    const cachedBlob = await ctx.db
      .query("observations_repositoryFiles_blobs")
      .withIndex("by_repository_and_storageId", (q) =>
        q.eq("repositoryId", args.repositoryId).eq("storageId", args.storageId),
      )
      .first();
    if (stagedFile || cachedBlob) {
      throw new Error("Cannot delete a blob that is already attached to staging.");
    }

    await ctx.storage.delete(args.storageId);
    return null;
  },
});

export const getByNewPath = query({
  access: "access_files_read",
  args: getByNewPathArgsValidator,
  returns: stagedFileOrNullValidator,
  handler: async (ctx, args) => {
    const repository = await getRepositoryForStagingAccess(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    if (!repository) {
      return null;
    }

    const staging = await ctx.db
      .query("repositoryStagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.newPath),
      )
      .first();

    return staging;
  },
});

export const getByNewPathInternal = internalQuery({
  args: getByNewPathArgsValidator,
  returns: stagedFileOrNullValidator,
  handler: async (ctx, args) => {
    return await ctx.db
      .query("repositoryStagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.newPath),
      )
      .first();
  },
});

// List all files currently in staging for a repository
export const listStagedFiles = query({
  access: "access_files_read",
  args: listStagedFilesArgsValidator,
  returns: stagedFileListValidator,
  handler: async (ctx, args) => {
    const repository = await getRepositoryForStagingAccess(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    if (!repository) {
      return [];
    }
    const files = await ctx.db
      .query("repositoryStagedFiles")
      .withIndex("by_repository_and_branch", (q) =>
        q.eq("repositoryId", args.repositoryId).eq("branch", args.branch),
      )
      .collect();

    return args.includeUnchanged ? files : files.filter(hasStagedFileChanges);
  },
});

export const listStagedFilesBranchSummaries = query({
  access: "access_files_read",
  args: {
    repositoryId: repositoryIdValidator,
  },
  returns: stagedFilesBranchSummaryListValidator,
  handler: async (ctx, args) => {
    const repository = await getRepositoryForStagingAccess(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    if (!repository) {
      return [];
    }
    const files = await ctx.db
      .query("repositoryStagedFiles")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .collect();
    return summarizeStagedFilesByBranch(files);
  },
});

export const listStagedFilesBranchSummariesByRepository = query({
  access: "access_files_read",
  args: {
    repositoryIds: array(repositoryIdValidator),
  },
  returns: stagedFilesBranchSummariesByRepositoryListValidator,
  handler: async (ctx, args) => {
    const summariesByRepository: Infer<typeof stagedFilesBranchSummariesByRepositoryListValidator> =
      [];
    const uniqueRepositoryIds = new Set(args.repositoryIds);

    for (const repositoryId of uniqueRepositoryIds) {
      const repository = await getRepositoryForStagingAccess(ctx, {
        repositoryId,
        userId: ctx.viewer.userId,
      });
      if (!repository) {
        continue;
      }

      const files = await ctx.db
        .query("repositoryStagedFiles")
        .withIndex("by_repository", (q) => q.eq("repositoryId", repositoryId))
        .collect();
      summariesByRepository.push({
        repositoryId,
        branchSummaries: summarizeStagedFilesByBranch(files),
      });
    }

    return summariesByRepository;
  },
});

export const listAllStagedFiles = internalQuery({
  args: listAllStagedFilesArgsValidator,
  returns: stagedFileListValidator,
  handler: async (ctx, args) => {
    const files =
      args.branch === undefined
        ? await ctx.db
            .query("repositoryStagedFiles")
            .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
            .collect()
        : await (() => {
            const branch = args.branch;
            return ctx.db
              .query("repositoryStagedFiles")
              .withIndex("by_repository_and_branch", (q) =>
                q.eq("repositoryId", args.repositoryId).eq("branch", branch),
              )
              .collect();
          })();

    return args.includeUnchanged ? files : files.filter(hasStagedFileChanges);
  },
});

export const duplicateBranchStaging = internalMutation({
  args: duplicateBranchStagingArgsValidator,
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });

    if (args.sourceBranch === args.targetBranch) {
      throw new Error("Source and target branches must differ.");
    }

    const existingTargetFiles = await ctx.db
      .query("repositoryStagedFiles")
      .withIndex("by_repository_and_branch", (q) =>
        q.eq("repositoryId", args.repositoryId).eq("branch", args.targetBranch),
      )
      .collect();
    if (existingTargetFiles.some(hasStagedFileChanges)) {
      throw new Error("Target branch already has staged changes.");
    }

    for (const file of args.stagedFiles) {
      if (file.repositoryId !== args.repositoryId) {
        throw new Error("Staging snapshot belongs to a different repository.");
      }
      if (file.branch !== args.sourceBranch) {
        throw new Error("Staging snapshot belongs to a different branch.");
      }
      if (!hasStagedFileChanges(file)) {
        continue;
      }

      await ctx.db.insert("repositoryStagedFiles", {
        repositoryId: file.repositoryId,
        fileDeleted: file.fileDeleted,
        kind: file.kind,
        filePath: file.filePath,
        initialFilePath: file.initialFilePath,
        content: file.content,
        initialContent: file.initialContent,
        storageId: file.storageId,
        mime: file.mime,
        size: file.size,
        stagedBlobSha: file.stagedBlobSha,
        parentCommitSha: file.parentCommitSha,
        lastEditTime: file.lastEditTime,
        lastEditUserId: file.lastEditUserId,
        branch: args.targetBranch,
        version: file.version,
      });
    }

    return null;
  },
});

function matchesStagedFileSnapshot(args: {
  current: StagedFile;
  snapshot: StagedFileSnapshot;
}): boolean {
  return (
    args.current._id === args.snapshot._id &&
    args.current.repositoryId === args.snapshot.repositoryId &&
    args.current.fileDeleted === args.snapshot.fileDeleted &&
    args.current.kind === args.snapshot.kind &&
    args.current.filePath === args.snapshot.filePath &&
    args.current.initialFilePath === args.snapshot.initialFilePath &&
    args.current.content === args.snapshot.content &&
    args.current.initialContent === args.snapshot.initialContent &&
    args.current.storageId === args.snapshot.storageId &&
    args.current.mime === args.snapshot.mime &&
    args.current.size === args.snapshot.size &&
    args.current.stagedBlobSha === args.snapshot.stagedBlobSha &&
    args.current.parentCommitSha === args.snapshot.parentCommitSha &&
    args.current.lastEditTime === args.snapshot.lastEditTime &&
    args.current.lastEditUserId === args.snapshot.lastEditUserId &&
    args.current.branch === args.snapshot.branch &&
    args.current.version === args.snapshot.version
  );
}

function listSnapshotCleanupPaths(snapshot: StagedFileSnapshot): string[] {
  return Array.from(new Set([snapshot.filePath, snapshot.initialFilePath]));
}

type ClearMatchingStagingSnapshotArgs = {
  repositoryId: Infer<typeof repositoryIdValidator>;
  branch: string;
  stagedFiles: StagedFileSnapshot[];
};

async function scheduleCollaborativeUpdatesCleanup(
  ctx: MutationCtx,
  target: Omit<StagingCleanupTarget, "filePath">,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.fileStaging.deleteCollaborativeUpdatesBatch, {
    repositoryId: target.repositoryId,
    branch: target.branch,
    cutoffTimestamp: target.cutoffTimestamp,
  });
}

async function scheduleCollaborativeFileUpdatesCleanup(
  ctx: MutationCtx,
  target: Required<StagingCleanupTarget>,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.fileStaging.deleteCollaborativeUpdatesForFilePathBatch, {
    repositoryId: target.repositoryId,
    branch: target.branch,
    filePath: target.filePath,
    cutoffTimestamp: target.cutoffTimestamp,
  });
}

/**
 * Clear only the source-branch staging rows that still match the exact snapshot
 * committed onto a draft branch, so newer default-branch edits survive.
 */
export async function clearMatchingStagingSnapshotImpl(
  ctx: MutationCtx,
  args: ClearMatchingStagingSnapshotArgs,
) {
  const cleanupCutoffByFilePath = new Map<string, number>();

  for (const snapshot of args.stagedFiles) {
    if (snapshot.repositoryId !== args.repositoryId) {
      throw new Error("Staging snapshot belongs to a different repository.");
    }
    if (snapshot.branch !== args.branch) {
      throw new Error("Staging snapshot belongs to a different branch.");
    }

    const current = await ctx.db.get(snapshot._id);
    if (!current || !matchesStagedFileSnapshot({ current, snapshot })) {
      continue;
    }

    await ctx.db.delete(current._id);

    const cutoffTimestamp = snapshot.lastEditTime + 1;
    for (const filePath of listSnapshotCleanupPaths(snapshot)) {
      cleanupCutoffByFilePath.set(
        filePath,
        Math.max(cleanupCutoffByFilePath.get(filePath) ?? 0, cutoffTimestamp),
      );
    }
  }

  for (const [filePath, cutoffTimestamp] of cleanupCutoffByFilePath) {
    await scheduleCollaborativeFileUpdatesCleanup(ctx, {
      repositoryId: args.repositoryId,
      branch: args.branch,
      filePath,
      cutoffTimestamp,
    });
  }

  return null;
}

export const clearMatchingStagingSnapshot = internalMutation({
  args: clearMatchingStagingSnapshotArgsValidator,
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    return await clearMatchingStagingSnapshotImpl(ctx, args);
  },
});

/**
 * Clear the `branch` staging rows that a commit wrote to GitHub. `snapshot` is
 * the row the commit read, `committedContent` is what it wrote at
 * `snapshot.filePath`, and `committedBlobSha` is that blob, or null when the
 * commit deleted the file. A row edited after the snapshot keeps its edits: its
 * base becomes the committed blob, with the snapshot content its edits started
 * from as `initialContent`, so the next rebase replays only the newer edits.
 */
export const clearCommittedStaging = internalMutation({
  args: clearCommittedStagingArgsValidator,
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    for (const { snapshot, committedContent, committedBlobSha } of args.committedFiles) {
      if (snapshot.repositoryId !== args.repositoryId) {
        throw new Error("Staging snapshot belongs to a different repository.");
      }
      if (snapshot.branch !== args.branch) {
        throw new Error("Staging snapshot belongs to a different branch.");
      }

      const current = await ctx.db.get(snapshot._id);
      if (!current) {
        continue;
      }

      if (
        matchesStagedFileSnapshot({ current, snapshot }) ||
        (current.fileDeleted === snapshot.fileDeleted &&
          current.kind === snapshot.kind &&
          current.filePath === snapshot.filePath &&
          current.storageId === snapshot.storageId &&
          current.stagedBlobSha === snapshot.stagedBlobSha &&
          (current.fileDeleted || current.content === committedContent))
      ) {
        await ctx.db.delete(current._id);
        for (const filePath of new Set([current.filePath, current.initialFilePath])) {
          await scheduleCollaborativeFileUpdatesCleanup(ctx, {
            repositoryId: args.repositoryId,
            branch: args.branch,
            filePath,
            cutoffTimestamp: current.lastEditTime + 1,
          });
        }
        continue;
      }

      await ctx.db.patch(
        current._id,
        committedBlobSha === null
          ? { initialFilePath: current.filePath, initialContent: "", parentCommitSha: null }
          : {
              initialFilePath: snapshot.filePath,
              initialContent: snapshot.content,
              parentCommitSha: committedBlobSha,
            },
      );
    }

    return null;
  },
});

const DELETION_BATCH_SIZE = 500;

type ClearAllStagingPlan<RepositoryId extends string = string, UserId extends string = string> = {
  stagingQuery:
    | { indexName: "by_repository"; repositoryId: RepositoryId }
    | {
        indexName: "by_repository_and_branch";
        repositoryId: RepositoryId;
        branch: string;
      };
  deleteCollaborativeUpdatesArgs: {
    repositoryId: RepositoryId;
    branch?: string;
    cutoffTimestamp: number;
  };
  treeRefreshArgs: {
    userId: UserId;
    repositoryId: RepositoryId;
    branch: string;
  } | null;
};

export function buildClearAllStagingPlan<RepositoryId extends string, UserId extends string>(args: {
  repositoryId: RepositoryId;
  branch?: string;
  cleanupCutoffTimestamp: number;
  repository: {
    userId: UserId;
    defaultBranch: string;
  } | null;
}): ClearAllStagingPlan<RepositoryId, UserId> {
  return {
    stagingQuery:
      args.branch === undefined
        ? {
            indexName: "by_repository",
            repositoryId: args.repositoryId,
          }
        : {
            indexName: "by_repository_and_branch",
            repositoryId: args.repositoryId,
            branch: args.branch,
          },
    deleteCollaborativeUpdatesArgs: {
      repositoryId: args.repositoryId,
      branch: args.branch,
      cutoffTimestamp: args.cleanupCutoffTimestamp,
    },
    treeRefreshArgs: args.repository
      ? {
          userId: args.repository.userId,
          repositoryId: args.repositoryId,
          branch: args.branch ?? args.repository.defaultBranch,
        }
      : null,
  };
}

type ClearAllStagingArgs = {
  repositoryId: Infer<typeof repositoryIdValidator>;
  userId: Infer<typeof userIdValidator>;
  branch?: string;
  skipTreeUpdate?: boolean;
};

export async function clearAllStagingImpl(ctx: MutationCtx, args: ClearAllStagingArgs) {
  // Get repository info to schedule tree update
  const repository = await ctx.db.get(args.repositoryId);
  const cleanupCutoffTimestamp = Date.now() + 1;
  const plan = buildClearAllStagingPlan({
    repositoryId: args.repositoryId,
    branch: args.branch,
    cleanupCutoffTimestamp,
    repository:
      repository && isLiveConnectedRepository(repository)
        ? {
            userId: args.userId,
            defaultBranch: repository.defaultBranch,
          }
        : null,
  });

  const stagingFiles =
    plan.stagingQuery.indexName === "by_repository"
      ? await ctx.db
          .query("repositoryStagedFiles")
          .withIndex("by_repository", (q) => q.eq("repositoryId", plan.stagingQuery.repositoryId))
          .collect()
      : await (() => {
          const branchScopedQuery = plan.stagingQuery;
          return ctx.db
            .query("repositoryStagedFiles")
            .withIndex("by_repository_and_branch", (q) =>
              q
                .eq("repositoryId", branchScopedQuery.repositoryId)
                .eq("branch", branchScopedQuery.branch),
            )
            .collect();
        })();

  for (const staging of stagingFiles) {
    await ctx.db.delete(staging._id);
  }

  // Delete collaborative updates in batches to avoid hitting read limits.
  // Schedule the first batch. It will chain further batches if needed.
  await scheduleCollaborativeUpdatesCleanup(ctx, {
    repositoryId: plan.deleteCollaborativeUpdatesArgs.repositoryId,
    branch: plan.deleteCollaborativeUpdatesArgs.branch,
    cutoffTimestamp: plan.deleteCollaborativeUpdatesArgs.cutoffTimestamp,
  });

  // Update tree to ensure it's fresh after clearing staging
  // Skip when called from commitAllStaged (tree is already updated there)
  if (plan.treeRefreshArgs && !args.skipTreeUpdate) {
    await ctx.scheduler.runAfter(0, internal.github.updateRepositoryTree, {
      userId: plan.treeRefreshArgs.userId,
      repositoryId: plan.treeRefreshArgs.repositoryId,
      branch: plan.treeRefreshArgs.branch,
    });
  }

  return null;
}

// Clear staging for a specific file (used after successful commit)
export const clearAllStaging = mutation({
  access: "access_files_write",
  args: {
    repositoryId: repositoryIdValidator,
    branch: optional(branchValidator),
    skipTreeUpdate: optional(boolean()),
  },
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    await assertRepositoryForStagingAccess(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });

    return await clearAllStagingImpl(ctx, { ...args, userId: ctx.viewer.userId });
  },
});

export const clearAllStagingForOperation = internalMutation({
  args: {
    repositoryId: repositoryIdValidator,
    userId: userIdValidator,
    branch: optional(branchValidator),
    skipTreeUpdate: optional(boolean()),
  },
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });
    return await clearAllStagingImpl(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
      branch: args.branch,
      skipTreeUpdate: args.skipTreeUpdate,
    });
  },
});

// Delete collaborative updates in batches to stay under the 4096 read limit.
export const deleteCollaborativeUpdatesBatch = internalMutation({
  args: {
    repositoryId: repositoryIdValidator,
    branch: optional(branchValidator),
    cutoffTimestamp: number(),
  },
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    const cutoffTimestamp = args.cutoffTimestamp;
    const updatesQuery =
      args.branch === undefined
        ? ctx.db
            .query("repositoryStagedFileUpdates")
            .withIndex("by_repository_and_timestamp", (q) =>
              q.eq("repositoryId", args.repositoryId).lt("timestamp", cutoffTimestamp),
            )
        : (() => {
            const branch = args.branch;
            return ctx.db
              .query("repositoryStagedFileUpdates")
              .withIndex("by_repositoryId_and_branch_and_timestamp", (q) =>
                q
                  .eq("repositoryId", args.repositoryId)
                  .eq("branch", branch)
                  .lt("timestamp", cutoffTimestamp),
              );
          })();
    const updates = [];
    for await (const update of updatesQuery) {
      updates.push(update);
      if (updates.length === DELETION_BATCH_SIZE) {
        break;
      }
    }

    for (const update of updates) {
      await ctx.db.delete(update._id);
    }

    // If we got a full batch, there are likely more; schedule another round.
    if (updates.length === DELETION_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.fileStaging.deleteCollaborativeUpdatesBatch, {
        repositoryId: args.repositoryId,
        branch: args.branch,
        cutoffTimestamp: args.cutoffTimestamp,
      });
    }

    return null;
  },
});

// Delete collaborative updates for one file path in batches to preserve newer
// edits on the same branch while removing history for a committed snapshot.
export const deleteCollaborativeUpdatesForFilePathBatch = internalMutation({
  args: {
    repositoryId: repositoryIdValidator,
    branch: branchValidator,
    filePath: filePathValidator,
    cutoffTimestamp: number(),
  },
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    const updates = [];
    for await (const update of ctx.db
      .query("repositoryStagedFileUpdates")
      .withIndex("by_repositoryId_and_branch_and_filePath_and_timestamp", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath)
          .lt("timestamp", args.cutoffTimestamp),
      )) {
      updates.push(update);
      if (updates.length === DELETION_BATCH_SIZE) {
        break;
      }
    }

    for (const update of updates) {
      await ctx.db.delete(update._id);
    }

    if (updates.length === DELETION_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.fileStaging.deleteCollaborativeUpdatesForFilePathBatch,
        {
          repositoryId: args.repositoryId,
          branch: args.branch,
          filePath: args.filePath,
          cutoffTimestamp: args.cutoffTimestamp,
        },
      );
    }

    return null;
  },
});

// Mark a file for deletion in staging
export const markFileForDeletion = mutation({
  access: "access_files_write",
  args: deletionArgsValidator,
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });

    const existingStaging = await ctx.db
      .query("repositoryStagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath),
      )
      .first();

    const currentTimestamp = Date.now();

    if (existingStaging) {
      // Update existing staging to mark as deleted
      await ctx.db.patch(existingStaging._id, {
        fileDeleted: true,
        lastEditTime: currentTimestamp,
        lastEditUserId: ctx.viewer.userId,
        branch: args.branch,
      });
    } else {
      const snapshotSeed = await readDeletionSnapshotSeed(ctx, args.parentCommitSha);

      // Create new staging record for deletion
      await ctx.db.insert("repositoryStagedFiles", {
        repositoryId: args.repositoryId,
        filePath: args.filePath,
        initialFilePath: args.filePath,
        fileDeleted: true,
        // Keep original text when available so deleted files remain inspectable.
        kind: snapshotSeed.kind,
        content: snapshotSeed.initialContent,
        initialContent: snapshotSeed.initialContent,
        mime: snapshotSeed.mime,
        size: snapshotSeed.size,
        stagedBlobSha: snapshotSeed.stagedBlobSha,
        parentCommitSha: args.parentCommitSha,
        lastEditTime: currentTimestamp,
        lastEditUserId: ctx.viewer.userId,
        branch: args.branch,
        version: 0,
      });
    }

    return null;
  },
});

async function createFileInStagingImpl(
  ctx: MutationCtx,
  args: {
    repositoryId: Infer<typeof repositoryIdValidator>;
    filePath: string;
    content: string;
    branch: string;
    userId: Infer<typeof userIdValidator>;
  },
) {
  await assertConnectedRepositoryForStagingWrite(ctx, {
    repositoryId: args.repositoryId,
    userId: args.userId,
  });

  // Check if there's already a staging record for this file
  const existingStaging = await ctx.db
    .query("repositoryStagedFiles")
    .withIndex("by_repository_and_branch_and_initial_path", (q) =>
      q
        .eq("repositoryId", args.repositoryId)
        .eq("branch", args.branch)
        .eq("initialFilePath", args.filePath),
    )
    .first();

  if (existingStaging) {
    throw new Error("File already exists in staging");
  }

  const existingPathInStaging = await ctx.db
    .query("repositoryStagedFiles")
    .withIndex("by_repository_and_branch_and_path", (q) =>
      q
        .eq("repositoryId", args.repositoryId)
        .eq("branch", args.branch)
        .eq("filePath", args.filePath),
    )
    .first();
  if (existingPathInStaging) {
    throw new Error("A staged file already uses this path");
  }

  const repositoryTree = await resolveRepositoryTreeForRepository({
    ctx,
    repositoryId: args.repositoryId,
    requestedBranch: args.branch,
  });
  const existsInRepository = repositoryTree.some(
    (entry: GitHubTree) => entry.type === "blob" && entry.path === args.filePath,
  );
  if (existsInRepository) {
    throw new Error("File already exists in repository");
  }

  const currentTimestamp = Date.now();

  // Create new staging record for a new file (parentCommitSha is null)
  await ctx.db.insert("repositoryStagedFiles", {
    repositoryId: args.repositoryId,
    filePath: args.filePath,
    initialFilePath: args.filePath,
    fileDeleted: false,
    kind: "text",
    content: args.content,
    initialContent: "", // New files have no initial content
    parentCommitSha: null, // New files have no parent commit
    lastEditTime: currentTimestamp,
    lastEditUserId: args.userId,
    branch: args.branch,
    version: 0,
  });

  return null;
}

// Create a new file in staging (instead of immediately committing to GitHub)
export const createFileInStaging = mutation({
  access: "access_files_write",
  args: createFileArgsValidator,
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    return await createFileInStagingImpl(ctx, {
      repositoryId: args.repositoryId,
      filePath: args.filePath,
      content: args.content,
      branch: args.branch,
      userId: ctx.viewer.userId,
    });
  },
});

export const createFileInStagingForOperation = internalMutation({
  args: {
    repositoryId: repositoryIdValidator,
    filePath: filePathValidator,
    content: contentValidator,
    branch: branchValidator,
    userId: userIdValidator,
  },
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    return await createFileInStagingImpl(ctx, args);
  },
});

export const revertDeletedFileInStaging = mutation({
  access: "access_files_write",
  args: revertDeletedFileArgsValidator,
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });

    const existingStaging = await ctx.db
      .query("repositoryStagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath),
      )
      .first();

    if (!existingStaging) {
      throw new Error("Deleted staged file not found");
    }

    if (!existingStaging.fileDeleted) {
      throw new Error("Staged file is not deleted");
    }

    // Keep the staging row and only clear the deletion flag so any pending
    // rename/content edits remain intact and unchanged files naturally fall out
    // of staged views via the existing hasStagedFileChanges filter.
    const restoredFile = buildDeletedFileRestoreCandidate(existingStaging);

    await ctx.db.patch(existingStaging._id, {
      fileDeleted: restoredFile.fileDeleted,
      lastEditTime: Date.now(),
      lastEditUserId: ctx.viewer.userId,
      branch: args.branch,
    });

    return null;
  },
});

export const updateStagedFileContent = mutation({
  access: "access_files_write",
  args: updateStagedFileContentArgsValidator,
  returns: stagedFileValidator,
  handler: async (ctx, args) => {
    const existingStaging = await ctx.db.get(args.stagingId);

    if (!existingStaging) {
      throw new Error("Staged file not found");
    }

    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: existingStaging.repositoryId,
      userId: ctx.viewer.userId,
    });

    if (existingStaging.fileDeleted) {
      throw new Error("Cannot update content for a deleted staged file.");
    }

    if (readStagedFileKind(existingStaging.kind) === "binary") {
      throw new Error("Cannot edit binary staged content as text.");
    }

    if (existingStaging.content === args.content) {
      return existingStaging;
    }

    await ctx.runMutation(internal.collaborative.pushContentUpdate, {
      repositoryId: existingStaging.repositoryId,
      filePath: existingStaging.filePath,
      branch: existingStaging.branch,
      expectedVersion: args.expectedVersion,
      newContent: args.content,
      userId: ctx.viewer.userId,
    });

    const updatedStaging = await ctx.db.get(existingStaging._id);
    if (!updatedStaging) {
      throw new Error("Staged file disappeared while saving");
    }

    return updatedStaging;
  },
});

// MARK: Internal

// Save file content to staging for real-time editing
export const saveToStaging = internalMutation({
  args: saveToStagingArgsValidator,
  returns: stagedFileValidator,
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });

    const existingStaging = await ctx.db
      .query("repositoryStagedFiles")
      .withIndex("by_repository_and_branch_and_initial_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("initialFilePath", args.initialFilePath),
      )
      .first();

    // console.log("saveToStaging", { args, existingStaging });

    const currentTimestamp = Date.now();

    if (existingStaging) {
      if (readStagedFileKind(existingStaging.kind) === "binary") {
        throw new Error("Cannot overwrite binary staged content as text.");
      }

      // Codemirror gives lots of updates
      if (existingStaging.content === args.content) {
        return existingStaging;
      }

      // Update existing staging
      await ctx.db.patch(existingStaging._id, {
        kind: "text",
        content: args.content,
        lastEditTime: currentTimestamp,
        lastEditUserId: args.userId,
        branch: args.branch,
      });
    } else {
      // Create new staging record
      await ctx.db.insert("repositoryStagedFiles", {
        repositoryId: args.repositoryId,
        filePath: args.initialFilePath,
        initialFilePath: args.initialFilePath,
        fileDeleted: false,
        kind: "text",
        content: args.content,
        initialContent: args.initialContent,
        parentCommitSha: args.parentCommitSha,
        lastEditTime: currentTimestamp,
        lastEditUserId: args.userId,
        branch: args.branch,
        version: 0,
      });
    }

    const staging = await ctx.db
      .query("repositoryStagedFiles")
      .withIndex("by_repository_and_branch_and_initial_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("initialFilePath", args.initialFilePath),
      )
      .first();

    if (!staging) {
      throw new Error("Should not happen. Staging not found after saving?!?");
    }

    return staging;
  },
});

export const saveBinaryUploadToStaging = internalMutation({
  args: saveBinaryUploadToStagingArgsValidator,
  returns: stagedFileValidator,
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });

    const currentTimestamp = Date.now();
    const existingStagingByPath = await ctx.db
      .query("repositoryStagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath),
      )
      .first();

    const existingStagingByInitialPath = await ctx.db
      .query("repositoryStagedFiles")
      .withIndex("by_repository_and_branch_and_initial_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("initialFilePath", args.filePath),
      )
      .first();

    if (
      existingStagingByInitialPath &&
      existingStagingByPath &&
      existingStagingByInitialPath._id !== existingStagingByPath._id
    ) {
      throw new Error("An existing staged rename already owns this file path");
    }

    const existingStaging = existingStagingByPath ?? existingStagingByInitialPath;
    if (
      existingStaging &&
      existingStaging.filePath !== args.filePath &&
      existingStaging.initialFilePath === args.filePath
    ) {
      throw new Error("An existing staged rename already owns this file path");
    }

    const repositoryTree = await resolveRepositoryTreeForRepository({
      ctx,
      repositoryId: args.repositoryId,
      requestedBranch: args.branch,
    });
    const existingRepositoryEntry = repositoryTree.find(
      (entry: GitHubTree) => entry.type === "blob" && entry.path === args.filePath,
    );
    const parentCommitSha = existingRepositoryEntry?.sha ?? null;
    const isReplacement = Boolean(existingStaging) || parentCommitSha !== null;

    if (isReplacement && !args.replaceExisting) {
      throw new Error("A file already exists at this path");
    }

    if (existingStaging) {
      const previousStorageId = existingStaging.storageId;
      let shouldDeletePreviousStorage = false;
      if (typeof previousStorageId === "string" && previousStorageId !== args.storageId) {
        const stagedFilesByRepository = await ctx.db
          .query("repositoryStagedFiles")
          .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
          .collect();
        const storageReferenceCount = stagedFilesByRepository.filter(
          (file) => file.storageId === previousStorageId,
        ).length;
        shouldDeletePreviousStorage = shouldDeleteSupersededStagedBinaryUpload({
          existingStaging,
          nextStorageId: args.storageId,
          storageReferenceCount,
        });
      }
      const preservedParentCommitSha = parentCommitSha ?? existingStaging.parentCommitSha;

      await ctx.db.patch(existingStaging._id, {
        fileDeleted: false,
        kind: "binary",
        filePath: args.filePath,
        initialFilePath: existingStaging.initialFilePath,
        content: "",
        initialContent: existingStaging.initialContent,
        storageId: args.storageId,
        mime: args.mime,
        size: args.size,
        stagedBlobSha: args.stagedBlobSha,
        parentCommitSha: preservedParentCommitSha,
        lastEditTime: currentTimestamp,
        lastEditUserId: args.userId,
        branch: args.branch,
      });

      const updatedStaging = await ctx.db.get(existingStaging._id);
      if (!updatedStaging) {
        throw new Error("Staged binary upload disappeared while saving");
      }

      if (shouldDeletePreviousStorage && typeof previousStorageId === "string") {
        try {
          await ctx.storage.delete(previousStorageId);
        } catch (error) {
          console.warn("Failed to delete superseded staged upload blob", {
            repositoryId: args.repositoryId,
            branch: args.branch,
            filePath: args.filePath,
            previousStorageId,
            error,
          });
        }
      }

      return updatedStaging;
    }

    const insertedId = await ctx.db.insert("repositoryStagedFiles", {
      repositoryId: args.repositoryId,
      fileDeleted: false,
      kind: "binary",
      filePath: args.filePath,
      initialFilePath: args.filePath,
      content: "",
      initialContent: "",
      storageId: args.storageId,
      mime: args.mime,
      size: args.size,
      stagedBlobSha: args.stagedBlobSha,
      parentCommitSha,
      lastEditTime: currentTimestamp,
      lastEditUserId: args.userId,
      branch: args.branch,
      version: 0,
    });

    const insertedStaging = await ctx.db.get(insertedId);
    if (!insertedStaging) {
      throw new Error("Staged binary upload disappeared after insert");
    }

    return insertedStaging;
  },
});

export const assertMediaUploadAccess = internalMutation({
  args: {
    repositoryId: repositoryIdValidator,
    userId: userIdValidator,
  },
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, args);
    return null;
  },
});

export const rename = internalMutation({
  args: renameArgsValidator,
  returns: stagedFileValidator,
  handler: async (ctx, args): Promise<StagedFile> => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });

    const file = await ctx.db
      .query("repositoryStagedFiles")
      .withIndex("by_repository_and_branch_and_initial_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("initialFilePath", args.initialFilePath),
      )
      .first();

    if (!file) {
      throw new Error("File not found");
    }

    if (file.filePath === args.newPath) {
      return file;
    }

    const existingAtNewPath = await ctx.db
      .query("repositoryStagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.newPath),
      )
      .first();
    if (existingAtNewPath && existingAtNewPath._id !== file._id) {
      throw new Error("A staged file already uses this path");
    }

    const repositoryTree = await resolveRepositoryTreeForRepository({
      ctx,
      repositoryId: args.repositoryId,
      requestedBranch: args.branch,
    });
    const existsInRepository = repositoryTree.some(
      (entry: GitHubTree) =>
        entry.type === "blob" && entry.path === args.newPath && entry.path !== file.initialFilePath,
    );
    if (existsInRepository) {
      throw new Error("A repository file already exists at this path");
    }

    await ctx.db.patch(file._id, {
      filePath: args.newPath,
      lastEditTime: Date.now(),
      lastEditUserId: args.userId,
    });

    const updatedFile = await ctx.db
      .query("repositoryStagedFiles")
      .withIndex("by_repository_and_branch_and_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("filePath", args.newPath),
      )
      .first();

    if (!updatedFile) {
      throw new Error("File not found after rename???");
    }

    return updatedFile;
  },
});

// Get staged content for a file (with real-time updates)
export const getByOriginalPath = internalQuery({
  args: getByOriginalPathArgsValidator,
  returns: stagedFileOrNullValidator,
  handler: async (ctx, args) => {
    const staging = await ctx.db
      .query("repositoryStagedFiles")
      .withIndex("by_repository_and_branch_and_initial_path", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("branch", args.branch)
          .eq("initialFilePath", args.originalFilePath),
      )
      .first();

    return staging;
  },
});

// Reconcile staging records after pulling a fresh tree from GitHub.
// Accepts a list of instructions describing what to do with each staging record.
const reconcileInstructionValidator = union(
  object({
    action: literal("delete"),
    stagingId: fileStagingIdValidator,
  }),
  object({
    action: literal("update"),
    stagingId: fileStagingIdValidator,
    parentCommitSha: nullableStringValidator,
    initialContent: optional(contentValidator),
  }),
);

export const reconcileStagingWithTree = internalMutation({
  args: {
    repositoryId: repositoryIdValidator,
    instructions: array(reconcileInstructionValidator),
    userId: userIdValidator,
  },
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    await assertConnectedRepositoryForStagingWrite(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });

    const cleanupCutoffTimestamp = Date.now() + 1;
    for (const instruction of args.instructions) {
      if (instruction.action === "delete") {
        await ctx.db.delete(instruction.stagingId);
      } else {
        const patch: Record<string, unknown> = {
          parentCommitSha: instruction.parentCommitSha,
        };
        if (instruction.initialContent !== undefined) {
          patch["initialContent"] = instruction.initialContent;
        }
        await ctx.db.patch(instruction.stagingId, patch);
      }
    }

    // Clean up collaborative updates for deleted staging records
    // (schedule batched deletion to avoid hitting read limits)
    const hasDeletes = args.instructions.some((i) => i.action === "delete");
    if (hasDeletes) {
      await scheduleCollaborativeUpdatesCleanup(ctx, {
        repositoryId: args.repositoryId,
        cutoffTimestamp: cleanupCutoffTimestamp,
      });
    }

    return null;
  },
});
