import { v, type Infer } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./functions";
import { findVaultForUser } from "./organizationAccess";
import type { GithubTree } from "./vault/model";
import {
  hasStagedFileChanges,
  hasStagedFileContentChange,
  readStagedFileKind,
  type StagedFileChangeCandidate,
} from "./stagingChanges";
import { assertConnectedVault, isLiveConnectedVault } from "./vault/state";
import { readActiveUser } from "./userLifecycle";

export const AUTO_COMMIT_DELAY_MS = 2 * 1000;
const { array, boolean, id, literal, number, object, optional, string, union } = v;

const vaultIdValidator = id("vaults");
const fileStagingIdValidator = id("vaultStagedFiles");
const storageIdValidator = id("_storage");
const userIdValidator = id("users");
const branchValidator = string();
const filePathValidator = string();
const contentValidator = string();
const stagedFileKindValidator = union(literal("text"), literal("binary"));
const nullableStringValidator = union(string(), v.null());
const nullResultValidator = v.null();

const stagedFileValidator = object({
  _id: fileStagingIdValidator,
  _creationTime: number(),
  vaultId: vaultIdValidator,
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
  vaultId: vaultIdValidator,
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
const stagedFilesBranchSummariesByVaultValidator = object({
  vaultId: vaultIdValidator,
  branchSummaries: stagedFilesBranchSummaryListValidator,
});
const stagedFilesBranchSummariesByVaultListValidator = array(
  stagedFilesBranchSummariesByVaultValidator,
);
const uploadUrlResultValidator = string();

const getByNewPathArgsValidator = {
  vaultId: vaultIdValidator,
  branch: branchValidator,
  newPath: filePathValidator,
};

const listStagedFilesArgsValidator = {
  vaultId: vaultIdValidator,
  branch: branchValidator,
  includeUnchanged: optional(boolean()),
};

const listAllStagedFilesArgsValidator = {
  vaultId: vaultIdValidator,
  branch: optional(branchValidator),
  includeUnchanged: optional(boolean()),
};
const duplicateBranchStagingArgsValidator = {
  vaultId: vaultIdValidator,
  sourceBranch: branchValidator,
  targetBranch: branchValidator,
  stagedFiles: stagedFileSnapshotListValidator,
  userId: userIdValidator,
};
const clearMatchingStagingSnapshotArgsValidator = {
  vaultId: vaultIdValidator,
  branch: branchValidator,
  stagedFiles: stagedFileSnapshotListValidator,
};

const deletionArgsValidator = {
  vaultId: vaultIdValidator,
  filePath: filePathValidator,
  parentCommitSha: nullableStringValidator,
  branch: branchValidator,
};

const revertDeletedFileArgsValidator = {
  vaultId: vaultIdValidator,
  filePath: filePathValidator,
  branch: branchValidator,
};

const createFileArgsValidator = {
  vaultId: vaultIdValidator,
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
  vaultId: vaultIdValidator,
  initialFilePath: filePathValidator,
  content: contentValidator,
  initialContent: contentValidator,
  parentCommitSha: nullableStringValidator,
  branch: branchValidator,
  userId: userIdValidator,
};
const saveBinaryUploadToStagingArgsValidator = {
  vaultId: vaultIdValidator,
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
  vaultId: vaultIdValidator,
  initialFilePath: filePathValidator,
  branch: branchValidator,
  newPath: filePathValidator,
  userId: userIdValidator,
};

const getByOriginalPathArgsValidator = {
  vaultId: vaultIdValidator,
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

async function getVaultForStagingAccess(
  ctx: StagingAccessCtx,
  args: {
    vaultId: Infer<typeof vaultIdValidator>;
    userId: Infer<typeof userIdValidator>;
  },
): Promise<Doc<"vaults"> | null> {
  return await findVaultForUser(ctx.db, args);
}

async function assertVaultForStagingAccess(
  ctx: StagingAccessCtx,
  args: {
    vaultId: Infer<typeof vaultIdValidator>;
    userId: Infer<typeof userIdValidator>;
  },
) {
  const vault = await getVaultForStagingAccess(ctx, args);
  if (!vault) {
    throw new Error("Unauthorized");
  }
  return vault;
}

async function assertConnectedVaultForStagingWrite(
  ctx: StagingAccessCtx,
  args: {
    vaultId: Infer<typeof vaultIdValidator>;
    userId: Infer<typeof userIdValidator>;
  },
) {
  const vault = await assertVaultForStagingAccess(ctx, args);
  const user = await ctx.db.get(args.userId);
  if (!user || readActiveUser(user) === null) {
    throw new Error("Account deletion is in progress.");
  }
  return assertConnectedVault(vault);
}

export function selectRepositoryTreeForBranch(args: {
  requestedBranch: string;
  branchTree: GithubTree[] | null;
}): GithubTree[] {
  if (args.branchTree) {
    return args.branchTree;
  }
  throw new Error(
    `Branch tree is not cached for "${args.requestedBranch}". Refresh branch and retry.`,
  );
}

async function resolveRepositoryTreeForVault(args: {
  ctx: MutationCtx;
  vaultId: Infer<typeof vaultIdValidator>;
  requestedBranch: string;
}): Promise<GithubTree[]> {
  const branchTree = await args.ctx.runQuery(internal.vault.branches.getVaultBranchTree, {
    vaultId: args.vaultId,
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
    vaultId: vaultIdValidator,
  },
  returns: uploadUrlResultValidator,
  handler: async (ctx, args) => {
    await assertConnectedVaultForStagingWrite(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });
    return await ctx.storage.generateUploadUrl();
  },
});

export const deletePendingUploadBlob = mutation({
  access: "access_files_write",
  args: {
    vaultId: vaultIdValidator,
    storageId: storageIdValidator,
  },
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    await assertConnectedVaultForStagingWrite(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });

    const stagedFile = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_storageId", (q) =>
        q.eq("vaultId", args.vaultId).eq("storageId", args.storageId),
      )
      .first();
    const cachedBlob = await ctx.db
      .query("observations_vaultFiles_blobs")
      .withIndex("by_vault_and_storageId", (q) =>
        q.eq("vaultId", args.vaultId).eq("storageId", args.storageId),
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
    const vault = await getVaultForStagingAccess(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });
    if (!vault) {
      return null;
    }

    const staging = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch).eq("filePath", args.newPath),
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
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch).eq("filePath", args.newPath),
      )
      .first();
  },
});

// List all files currently in staging for a vault
export const listStagedFiles = query({
  access: "access_files_read",
  args: listStagedFilesArgsValidator,
  returns: stagedFileListValidator,
  handler: async (ctx, args) => {
    const vault = await getVaultForStagingAccess(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });
    if (!vault) {
      return [];
    }
    const files = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch),
      )
      .collect();

    return args.includeUnchanged ? files : files.filter(hasStagedFileChanges);
  },
});

export const listStagedFilesBranchSummaries = query({
  access: "access_files_read",
  args: {
    vaultId: vaultIdValidator,
  },
  returns: stagedFilesBranchSummaryListValidator,
  handler: async (ctx, args) => {
    const vault = await getVaultForStagingAccess(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });
    if (!vault) {
      return [];
    }
    const files = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();
    return summarizeStagedFilesByBranch(files);
  },
});

export const listStagedFilesBranchSummariesByVault = query({
  access: "access_files_read",
  args: {
    vaultIds: array(vaultIdValidator),
  },
  returns: stagedFilesBranchSummariesByVaultListValidator,
  handler: async (ctx, args) => {
    const summariesByVault: Infer<typeof stagedFilesBranchSummariesByVaultListValidator> = [];
    const uniqueVaultIds = new Set(args.vaultIds);

    for (const vaultId of uniqueVaultIds) {
      const vault = await getVaultForStagingAccess(ctx, {
        vaultId,
        userId: ctx.viewer.userId,
      });
      if (!vault) {
        continue;
      }

      const files = await ctx.db
        .query("vaultStagedFiles")
        .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
        .collect();
      summariesByVault.push({
        vaultId,
        branchSummaries: summarizeStagedFilesByBranch(files),
      });
    }

    return summariesByVault;
  },
});

export const listAllStagedFiles = internalQuery({
  args: listAllStagedFilesArgsValidator,
  returns: stagedFileListValidator,
  handler: async (ctx, args) => {
    const files =
      args.branch === undefined
        ? await ctx.db
            .query("vaultStagedFiles")
            .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
            .collect()
        : await (() => {
            const branch = args.branch;
            return ctx.db
              .query("vaultStagedFiles")
              .withIndex("by_vault_and_branch", (q) =>
                q.eq("vaultId", args.vaultId).eq("branch", branch),
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
    await assertConnectedVaultForStagingWrite(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
    });

    if (args.sourceBranch === args.targetBranch) {
      throw new Error("Source and target branches must differ.");
    }

    const existingTargetFiles = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.targetBranch),
      )
      .collect();
    if (existingTargetFiles.some(hasStagedFileChanges)) {
      throw new Error("Target branch already has staged changes.");
    }

    for (const file of args.stagedFiles) {
      if (file.vaultId !== args.vaultId) {
        throw new Error("Staging snapshot belongs to a different vault.");
      }
      if (file.branch !== args.sourceBranch) {
        throw new Error("Staging snapshot belongs to a different branch.");
      }
      if (!hasStagedFileChanges(file)) {
        continue;
      }

      await ctx.db.insert("vaultStagedFiles", {
        vaultId: file.vaultId,
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
    args.current.vaultId === args.snapshot.vaultId &&
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
  vaultId: Infer<typeof vaultIdValidator>;
  branch: string;
  stagedFiles: StagedFileSnapshot[];
};

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
    if (snapshot.vaultId !== args.vaultId) {
      throw new Error("Staging snapshot belongs to a different vault.");
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
    await ctx.scheduler.runAfter(
      0,
      internal.fileStaging.deleteCollaborativeUpdatesForFilePathBatch,
      {
        vaultId: args.vaultId,
        branch: args.branch,
        filePath,
        cutoffTimestamp,
      },
    );
  }

  return null;
}

export const clearMatchingStagingSnapshot = internalMutation({
  args: clearMatchingStagingSnapshotArgsValidator,
  returns: nullResultValidator,
  handler: clearMatchingStagingSnapshotImpl,
});

const DELETION_BATCH_SIZE = 500;

type ClearAllStagingPlan<VaultId extends string = string, UserId extends string = string> = {
  stagingQuery:
    | { indexName: "by_vault"; vaultId: VaultId }
    | {
        indexName: "by_vault_and_branch";
        vaultId: VaultId;
        branch: string;
      };
  deleteCollaborativeUpdatesArgs: {
    vaultId: VaultId;
    branch?: string;
    cutoffTimestamp: number;
  };
  treeRefreshArgs: {
    userId: UserId;
    vaultId: VaultId;
    branch: string;
  } | null;
};

export function buildClearAllStagingPlan<VaultId extends string, UserId extends string>(args: {
  vaultId: VaultId;
  branch?: string;
  cleanupCutoffTimestamp: number;
  vault: {
    userId: UserId;
    defaultBranch: string;
  } | null;
}): ClearAllStagingPlan<VaultId, UserId> {
  return {
    stagingQuery:
      args.branch === undefined
        ? {
            indexName: "by_vault",
            vaultId: args.vaultId,
          }
        : {
            indexName: "by_vault_and_branch",
            vaultId: args.vaultId,
            branch: args.branch,
          },
    deleteCollaborativeUpdatesArgs: {
      vaultId: args.vaultId,
      branch: args.branch,
      cutoffTimestamp: args.cleanupCutoffTimestamp,
    },
    treeRefreshArgs: args.vault
      ? {
          userId: args.vault.userId,
          vaultId: args.vaultId,
          branch: args.branch ?? args.vault.defaultBranch,
        }
      : null,
  };
}

type ClearAllStagingArgs = {
  vaultId: Infer<typeof vaultIdValidator>;
  userId: Infer<typeof userIdValidator>;
  branch?: string;
  skipTreeUpdate?: boolean;
};

export async function clearAllStagingImpl(ctx: MutationCtx, args: ClearAllStagingArgs) {
  // Get vault info to schedule tree update
  const vault = await ctx.db.get(args.vaultId);
  const cleanupCutoffTimestamp = Date.now() + 1;
  const plan = buildClearAllStagingPlan({
    vaultId: args.vaultId,
    branch: args.branch,
    cleanupCutoffTimestamp,
    vault:
      vault && isLiveConnectedVault(vault)
        ? {
            userId: args.userId,
            defaultBranch: vault.defaultBranch,
          }
        : null,
  });

  const stagingFiles =
    plan.stagingQuery.indexName === "by_vault"
      ? await ctx.db
          .query("vaultStagedFiles")
          .withIndex("by_vault", (q) => q.eq("vaultId", plan.stagingQuery.vaultId))
          .collect()
      : await (() => {
          const branchScopedQuery = plan.stagingQuery;
          return ctx.db
            .query("vaultStagedFiles")
            .withIndex("by_vault_and_branch", (q) =>
              q.eq("vaultId", branchScopedQuery.vaultId).eq("branch", branchScopedQuery.branch),
            )
            .collect();
        })();

  for (const staging of stagingFiles) {
    await ctx.db.delete(staging._id);
  }

  // Delete collaborative updates in batches to avoid hitting read limits.
  // Schedule the first batch. It will chain further batches if needed.
  await ctx.scheduler.runAfter(0, internal.fileStaging.deleteCollaborativeUpdatesBatch, {
    vaultId: plan.deleteCollaborativeUpdatesArgs.vaultId,
    branch: plan.deleteCollaborativeUpdatesArgs.branch,
    cutoffTimestamp: plan.deleteCollaborativeUpdatesArgs.cutoffTimestamp,
  });

  // Update tree to ensure it's fresh after clearing staging
  // Skip when called from commitAllStaged (tree is already updated there)
  if (plan.treeRefreshArgs && !args.skipTreeUpdate) {
    await ctx.scheduler.runAfter(0, internal.github.updateRepositoryTree, {
      userId: plan.treeRefreshArgs.userId,
      vaultId: plan.treeRefreshArgs.vaultId,
      branch: plan.treeRefreshArgs.branch,
    });
  }

  return null;
}

// Clear staging for a specific file (used after successful commit)
export const clearAllStaging = mutation({
  access: "access_files_write",
  args: {
    vaultId: vaultIdValidator,
    branch: optional(branchValidator),
    skipTreeUpdate: optional(boolean()),
  },
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    await assertVaultForStagingAccess(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });

    return await clearAllStagingImpl(ctx, { ...args, userId: ctx.viewer.userId });
  },
});

// Delete collaborative updates in batches to stay under the 4096 read limit.
export const deleteCollaborativeUpdatesBatch = internalMutation({
  args: {
    vaultId: vaultIdValidator,
    branch: optional(branchValidator),
    cutoffTimestamp: optional(number()),
  },
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    const cutoffTimestamp = args.cutoffTimestamp;
    const updatesQuery =
      args.branch === undefined
        ? cutoffTimestamp === undefined
          ? ctx.db
              .query("vaultStagedFileUpdates")
              .withIndex("by_vault_and_timestamp", (q) => q.eq("vaultId", args.vaultId))
          : ctx.db
              .query("vaultStagedFileUpdates")
              .withIndex("by_vault_and_timestamp", (q) =>
                q.eq("vaultId", args.vaultId).lt("timestamp", cutoffTimestamp),
              )
        : (() => {
            const branch = args.branch;
            return cutoffTimestamp === undefined
              ? ctx.db
                  .query("vaultStagedFileUpdates")
                  .withIndex("by_vaultId_and_branch_and_timestamp", (q) =>
                    q.eq("vaultId", args.vaultId).eq("branch", branch),
                  )
              : ctx.db
                  .query("vaultStagedFileUpdates")
                  .withIndex("by_vaultId_and_branch_and_timestamp", (q) =>
                    q
                      .eq("vaultId", args.vaultId)
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
        vaultId: args.vaultId,
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
    vaultId: vaultIdValidator,
    branch: branchValidator,
    filePath: filePathValidator,
    cutoffTimestamp: number(),
  },
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    const updates = [];
    for await (const update of ctx.db
      .query("vaultStagedFileUpdates")
      .withIndex("by_vaultId_and_branch_and_filePath_and_timestamp", (q) =>
        q
          .eq("vaultId", args.vaultId)
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
          vaultId: args.vaultId,
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
    await assertConnectedVaultForStagingWrite(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });

    const existingStaging = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch).eq("filePath", args.filePath),
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
      await ctx.db.insert("vaultStagedFiles", {
        vaultId: args.vaultId,
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

// Create a new file in staging (instead of immediately committing to GitHub)
export const createFileInStaging = mutation({
  access: "access_files_write",
  args: createFileArgsValidator,
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    await assertConnectedVaultForStagingWrite(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });

    // Check if there's already a staging record for this file
    const existingStaging = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_initial_path", (q) =>
        q
          .eq("vaultId", args.vaultId)
          .eq("branch", args.branch)
          .eq("initialFilePath", args.filePath),
      )
      .first();

    if (existingStaging) {
      throw new Error("File already exists in staging");
    }

    const existingPathInStaging = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch).eq("filePath", args.filePath),
      )
      .first();
    if (existingPathInStaging) {
      throw new Error("A staged file already uses this path");
    }

    const repositoryTree = await resolveRepositoryTreeForVault({
      ctx,
      vaultId: args.vaultId,
      requestedBranch: args.branch,
    });
    const existsInRepository = repositoryTree.some(
      (entry: GithubTree) => entry.type === "blob" && entry.path === args.filePath,
    );
    if (existsInRepository) {
      throw new Error("File already exists in repository");
    }

    const currentTimestamp = Date.now();

    // Create new staging record for a new file (parentCommitSha is null)
    await ctx.db.insert("vaultStagedFiles", {
      vaultId: args.vaultId,
      filePath: args.filePath,
      initialFilePath: args.filePath,
      fileDeleted: false,
      kind: "text",
      content: args.content,
      initialContent: "", // New files have no initial content
      parentCommitSha: null, // New files have no parent commit
      lastEditTime: currentTimestamp,
      lastEditUserId: ctx.viewer.userId,
      branch: args.branch,
      version: 0,
    });

    return null;
  },
});

export const revertDeletedFileInStaging = mutation({
  access: "access_files_write",
  args: revertDeletedFileArgsValidator,
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    await assertConnectedVaultForStagingWrite(ctx, {
      vaultId: args.vaultId,
      userId: ctx.viewer.userId,
    });

    const existingStaging = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch).eq("filePath", args.filePath),
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

    await assertConnectedVaultForStagingWrite(ctx, {
      vaultId: existingStaging.vaultId,
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
      vaultId: existingStaging.vaultId,
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
    await assertConnectedVaultForStagingWrite(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
    });

    const existingStaging = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_initial_path", (q) =>
        q
          .eq("vaultId", args.vaultId)
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
      await ctx.db.insert("vaultStagedFiles", {
        vaultId: args.vaultId,
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
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_initial_path", (q) =>
        q
          .eq("vaultId", args.vaultId)
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
    await assertConnectedVaultForStagingWrite(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
    });

    const currentTimestamp = Date.now();
    const existingStagingByPath = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch).eq("filePath", args.filePath),
      )
      .first();

    const existingStagingByInitialPath = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_initial_path", (q) =>
        q
          .eq("vaultId", args.vaultId)
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

    const repositoryTree = await resolveRepositoryTreeForVault({
      ctx,
      vaultId: args.vaultId,
      requestedBranch: args.branch,
    });
    const existingRepositoryEntry = repositoryTree.find(
      (entry: GithubTree) => entry.type === "blob" && entry.path === args.filePath,
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
        const stagedFilesByVault = await ctx.db
          .query("vaultStagedFiles")
          .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
          .collect();
        const storageReferenceCount = stagedFilesByVault.filter(
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
            vaultId: args.vaultId,
            branch: args.branch,
            filePath: args.filePath,
            previousStorageId,
            error,
          });
        }
      }

      return updatedStaging;
    }

    const insertedId = await ctx.db.insert("vaultStagedFiles", {
      vaultId: args.vaultId,
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

export const rename = internalMutation({
  args: renameArgsValidator,
  returns: stagedFileValidator,
  handler: async (ctx, args): Promise<StagedFile> => {
    await assertConnectedVaultForStagingWrite(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
    });

    const file = await ctx.db
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_initial_path", (q) =>
        q
          .eq("vaultId", args.vaultId)
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
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch).eq("filePath", args.newPath),
      )
      .first();
    if (existingAtNewPath && existingAtNewPath._id !== file._id) {
      throw new Error("A staged file already uses this path");
    }

    const repositoryTree = await resolveRepositoryTreeForVault({
      ctx,
      vaultId: args.vaultId,
      requestedBranch: args.branch,
    });
    const existsInRepository = repositoryTree.some(
      (entry: GithubTree) =>
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
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch).eq("filePath", args.newPath),
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
      .query("vaultStagedFiles")
      .withIndex("by_vault_and_branch_and_initial_path", (q) =>
        q
          .eq("vaultId", args.vaultId)
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
    vaultId: vaultIdValidator,
    instructions: array(reconcileInstructionValidator),
    userId: userIdValidator,
  },
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    await assertConnectedVaultForStagingWrite(ctx, {
      vaultId: args.vaultId,
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
      await ctx.scheduler.runAfter(0, internal.fileStaging.deleteCollaborativeUpdatesBatch, {
        vaultId: args.vaultId,
        cutoffTimestamp: cleanupCutoffTimestamp,
      });
    }

    return null;
  },
});
