import { v, type Infer } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getUserId } from "./common";
import type { GithubTreeType } from "./schema";
import {
  hasStagedFileChanges,
  type StagedFileChangeCandidate,
} from "./stagingChanges";

export const AUTO_COMMIT_DELAY_MS = 2 * 1000;
const {
  array,
  boolean,
  id,
  literal,
  null: nullValue,
  number,
  object,
  optional,
  string,
  union,
} = v;

const vaultIdValidator = id("vaults");
const fileStagingIdValidator = id("fileStaging");
const userIdValidator = id("users");
const branchValidator = string();
const filePathValidator = string();
const contentValidator = string();
const nullableStringValidator = union(string(), nullValue());
const nullResultValidator = nullValue();

const stagedFileValidator = object({
  _id: fileStagingIdValidator,
  _creationTime: number(),
  ownerId: userIdValidator,
  vaultId: vaultIdValidator,
  fileDeleted: boolean(),
  filePath: filePathValidator,
  initialFilePath: filePathValidator,
  content: contentValidator,
  initialContent: contentValidator,
  parentCommitSha: nullableStringValidator,
  lastEditTime: number(),
  lastEditUserId: userIdValidator,
  branch: branchValidator,
  version: number(),
});
type StagedFile = Infer<typeof stagedFileValidator>;

const stagedFileOrNullValidator = union(stagedFileValidator, nullValue());
const stagedFileListValidator = array(stagedFileValidator);
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
const stagedFilesBranchSummaryListValidator = array(
  stagedFilesBranchSummaryValidator,
);

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

const deletionArgsValidator = {
  vaultId: vaultIdValidator,
  filePath: filePathValidator,
  parentCommitSha: nullableStringValidator,
  branch: branchValidator,
};

const createFileArgsValidator = {
  vaultId: vaultIdValidator,
  filePath: filePathValidator,
  content: contentValidator,
  branch: branchValidator,
};

const saveToStagingArgsValidator = {
  vaultId: vaultIdValidator,
  initialFilePath: filePathValidator,
  content: contentValidator,
  initialContent: contentValidator,
  parentCommitSha: nullableStringValidator,
  branch: branchValidator,
  userId: optional(userIdValidator),
};

const internalDeletionArgsValidator = {
  vaultId: vaultIdValidator,
  filePath: filePathValidator,
  parentCommitSha: nullableStringValidator,
  branch: branchValidator,
  userId: userIdValidator,
};

const renameArgsValidator = {
  vaultId: vaultIdValidator,
  initialFilePath: filePathValidator,
  branch: branchValidator,
  newPath: filePathValidator,
};

const getByOriginalPathArgsValidator = {
  vaultId: vaultIdValidator,
  originalFilePath: filePathValidator,
  branch: branchValidator,
};

type StagedFilesCategoryCounts = Infer<
  typeof stagedFilesCategoryCountsValidator
>;
type StagedFilesCategory = Exclude<keyof StagedFilesCategoryCounts, "total">;
type StagedFileSummaryInput = StagedFileChangeCandidate &
  Pick<StagedFile, "branch">;

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

function classifyStagedFile(
  file: StagedFileSummaryInput,
): StagedFilesCategory | null {
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
    return file.content !== file.initialContent
      ? "renamedAndModified"
      : "renamed";
  }
  return "modified";
}

export function canAccessVaultStaging(args: {
  vaultOwnerId: string | undefined;
  requesterUserId: string;
}): boolean {
  return args.vaultOwnerId === args.requesterUserId;
}

export function selectRepositoryTreeForBranch(args: {
  requestedBranch: string;
  defaultBranch?: string;
  branchTree: GithubTreeType[] | null;
  legacyTree: GithubTreeType[];
}): GithubTreeType[] {
  if (args.branchTree) {
    return args.branchTree;
  }
  if (args.defaultBranch === args.requestedBranch) {
    return args.legacyTree;
  }
  throw new Error(
    `Branch tree is not cached for "${args.requestedBranch}". Refresh branch and retry.`,
  );
}

type VaultRemoteBranchForResolution = {
  name: string;
  isDefault: boolean;
  remoteState: "active" | "deleted_upstream";
};

function resolveDefaultBranchFromRemoteBranches(
  branches: VaultRemoteBranchForResolution[],
): string | undefined {
  return (
    branches.find(
      (branch) => branch.remoteState === "active" && branch.isDefault,
    )?.name ?? branches.find((branch) => branch.remoteState === "active")?.name
  );
}

async function resolveRepositoryTreeForVault(args: {
  ctx: MutationCtx;
  vaultId: Infer<typeof vaultIdValidator>;
  requestedBranch: string;
  legacyTree: GithubTreeType[];
}): Promise<GithubTreeType[]> {
  const branchTree = await args.ctx.runQuery(
    internal.vault.getVaultBranchTree,
    {
      vaultId: args.vaultId,
      branch: args.requestedBranch,
    },
  );
  const remoteBranches = await args.ctx.db
    .query("vaultRemoteBranches")
    .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
    .collect();
  const defaultBranch = resolveDefaultBranchFromRemoteBranches(remoteBranches);
  return selectRepositoryTreeForBranch({
    requestedBranch: args.requestedBranch,
    defaultBranch,
    branchTree: branchTree?.treeData.tree ?? null,
    legacyTree: args.legacyTree,
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

    const existing =
      countsByBranch.get(file.branch) ?? emptyStagedFilesCategoryCounts();
    existing[category] += 1;
    existing.total += 1;
    countsByBranch.set(file.branch, existing);
  }

  return Array.from(countsByBranch.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([branch, counts]) => ({ branch, counts }));
}

// MARK: Public

export const getByNewPath = query({
  args: getByNewPathArgsValidator,
  returns: stagedFileOrNullValidator,
  handler: async (ctx, args) => {
    const staging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q
          .eq("vaultId", args.vaultId)
          .eq("branch", args.branch)
          .eq("filePath", args.newPath),
      )
      .first();

    return staging;
  },
});

// List all files currently in staging for a vault
export const listStagedFiles = query({
  args: listStagedFilesArgsValidator,
  returns: stagedFileListValidator,
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_branch", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch),
      )
      .collect();

    return args.includeUnchanged ? files : files.filter(hasStagedFileChanges);
  },
});

export const listStagedFilesBranchSummaries = query({
  args: {
    vaultId: vaultIdValidator,
  },
  returns: stagedFilesBranchSummaryListValidator,
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const vault = await ctx.db.get(args.vaultId);
    if (
      !canAccessVaultStaging({
        vaultOwnerId: vault?.userId,
        requesterUserId: userId,
      })
    ) {
      return [];
    }
    const files = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();
    return summarizeStagedFilesByBranch(files);
  },
});

export const listAllStagedFiles = internalQuery({
  args: listAllStagedFilesArgsValidator,
  returns: stagedFileListValidator,
  handler: async (ctx, args) => {
    const files =
      args.branch === undefined
        ? await ctx.db
            .query("fileStaging")
            .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
            .collect()
        : await (() => {
            const branch = args.branch;
            return ctx.db
              .query("fileStaging")
              .withIndex("by_vault_and_branch", (q) =>
                q.eq("vaultId", args.vaultId).eq("branch", branch),
              )
              .collect();
          })();

    return args.includeUnchanged ? files : files.filter(hasStagedFileChanges);
  },
});

const DELETION_BATCH_SIZE = 500;

type ClearAllStagingPlan<
  VaultId extends string = string,
  UserId extends string = string,
> = {
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
    owner: string;
    repo: string;
    branch?: string;
  } | null;
};

export function buildClearAllStagingPlan<
  VaultId extends string,
  UserId extends string,
>(args: {
  vaultId: VaultId;
  branch?: string;
  cleanupCutoffTimestamp: number;
  vault: {
    userId: UserId;
    ghRepoOwner: string;
    ghRepoName: string;
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
          owner: args.vault.ghRepoOwner,
          repo: args.vault.ghRepoName,
          branch: args.branch,
        }
      : null,
  };
}

type ClearAllStagingArgs = {
  vaultId: Infer<typeof vaultIdValidator>;
  branch?: string;
  skipTreeUpdate?: boolean;
};

export async function clearAllStagingImpl(
  ctx: MutationCtx,
  args: ClearAllStagingArgs,
) {
  // Get vault info to schedule tree update
  const vault = await ctx.db.get(args.vaultId);
  const cleanupCutoffTimestamp = Date.now() + 1;
  const plan = buildClearAllStagingPlan({
    vaultId: args.vaultId,
    branch: args.branch,
    cleanupCutoffTimestamp,
    vault: vault
      ? {
          userId: vault.userId,
          ghRepoOwner: vault.ghRepoOwner,
          ghRepoName: vault.ghRepoName,
        }
      : null,
  });

  const stagingFiles =
    plan.stagingQuery.indexName === "by_vault"
      ? await ctx.db
          .query("fileStaging")
          .withIndex("by_vault", (q) =>
            q.eq("vaultId", plan.stagingQuery.vaultId),
          )
          .collect()
      : await (() => {
          const branchScopedQuery = plan.stagingQuery;
          return ctx.db
            .query("fileStaging")
            .withIndex("by_vault_and_branch", (q) =>
              q
                .eq("vaultId", branchScopedQuery.vaultId)
                .eq("branch", branchScopedQuery.branch),
            )
            .collect();
        })();

  for (const staging of stagingFiles) {
    await ctx.db.delete(staging._id);
  }

  // Delete collaborative updates in batches to avoid hitting read limits.
  // Schedule the first batch — it will chain further batches if needed.
  await ctx.scheduler.runAfter(
    0,
    internal.fileStaging.deleteCollaborativeUpdatesBatch,
    plan.deleteCollaborativeUpdatesArgs,
  );

  // Update tree to ensure it's fresh after clearing staging
  // Skip when called from commitAllStaged (tree is already updated there)
  if (plan.treeRefreshArgs && !args.skipTreeUpdate) {
    await ctx.scheduler.runAfter(
      0,
      internal.github.updateRepositoryTree,
      plan.treeRefreshArgs,
    );
  }

  return null;
}

// Clear staging for a specific file (used after successful commit)
export const clearAllStaging = mutation({
  args: {
    vaultId: vaultIdValidator,
    branch: optional(branchValidator),
    skipTreeUpdate: optional(boolean()),
  },
  returns: nullResultValidator,
  handler: clearAllStagingImpl,
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
              .query("collaborativeUpdates")
              .withIndex("by_vault_and_timestamp", (q) =>
                q.eq("vaultId", args.vaultId),
              )
          : ctx.db
              .query("collaborativeUpdates")
              .withIndex("by_vault_and_timestamp", (q) =>
                q.eq("vaultId", args.vaultId).lt("timestamp", cutoffTimestamp),
              )
        : (() => {
            const branch = args.branch;
            return cutoffTimestamp === undefined
              ? ctx.db
                  .query("collaborativeUpdates")
                  .withIndex("by_vaultId_and_branch_and_timestamp", (q) =>
                    q.eq("vaultId", args.vaultId).eq("branch", branch),
                  )
              : ctx.db
                  .query("collaborativeUpdates")
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

    // If we got a full batch, there are likely more — schedule another round.
    if (updates.length === DELETION_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.fileStaging.deleteCollaborativeUpdatesBatch,
        {
          vaultId: args.vaultId,
          branch: args.branch,
          cutoffTimestamp: args.cutoffTimestamp,
        },
      );
    }

    return null;
  },
});

// Mark a file for deletion in staging
export const markFileForDeletion = mutation({
  args: deletionArgsValidator,
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const existingStaging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q
          .eq("vaultId", args.vaultId)
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
        lastEditUserId: userId,
        branch: args.branch,
      });
    } else {
      let preservedInitialContent = "";
      if (args.parentCommitSha) {
        const blob = await ctx.runQuery(internal.gitOperations.getBlobBySha, {
          sha: args.parentCommitSha,
        });
        if (typeof blob?.text === "string") {
          preservedInitialContent = blob.text;
        }
      }

      // Create new staging record for deletion
      await ctx.db.insert("fileStaging", {
        ownerId: userId,
        vaultId: args.vaultId,
        filePath: args.filePath,
        initialFilePath: args.filePath,
        fileDeleted: true,
        // Keep original text when available so deleted files remain inspectable.
        content: preservedInitialContent,
        initialContent: preservedInitialContent,
        parentCommitSha: args.parentCommitSha,
        lastEditTime: currentTimestamp,
        lastEditUserId: userId,
        branch: args.branch,
        version: 0,
      });
    }

    return null;
  },
});

// Create a new file in staging (instead of immediately committing to GitHub)
export const createFileInStaging = mutation({
  args: createFileArgsValidator,
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });
    if (!vault) {
      throw new Error("Vault not found");
    }

    // Check if there's already a staging record for this file
    const existingStaging = await ctx.db
      .query("fileStaging")
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
      .query("fileStaging")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q
          .eq("vaultId", args.vaultId)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath),
      )
      .first();
    if (existingPathInStaging) {
      throw new Error("A staged file already uses this path");
    }

    const repositoryTree = await resolveRepositoryTreeForVault({
      ctx,
      vaultId: args.vaultId,
      requestedBranch: args.branch,
      legacyTree: vault.treeData.tree,
    });
    const existsInRepository = repositoryTree.some(
      (entry: GithubTreeType) =>
        entry.type === "blob" && entry.path === args.filePath,
    );
    if (existsInRepository) {
      throw new Error("File already exists in repository");
    }

    const currentTimestamp = Date.now();

    // Create new staging record for a new file (parentCommitSha is null)
    await ctx.db.insert("fileStaging", {
      ownerId: userId,
      vaultId: args.vaultId,
      filePath: args.filePath,
      initialFilePath: args.filePath,
      fileDeleted: false,
      content: args.content,
      initialContent: "", // New files have no initial content
      parentCommitSha: null, // New files have no parent commit
      lastEditTime: currentTimestamp,
      lastEditUserId: userId,
      branch: args.branch,
      version: 0,
    });

    return null;
  },
});

// MARK: Internal

// Save file content to staging for real-time editing
export const saveToStaging = internalMutation({
  args: saveToStagingArgsValidator,
  returns: stagedFileValidator,
  handler: async (ctx, args) => {
    const userId = args.userId ?? (await getUserId(ctx));

    const existingStaging = await ctx.db
      .query("fileStaging")
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
      // Codemirror gives lots of updates
      if (existingStaging.content === args.content) {
        return existingStaging;
      }

      // Update existing staging
      await ctx.db.patch(existingStaging._id, {
        content: args.content,
        lastEditTime: currentTimestamp,
        lastEditUserId: userId,
        branch: args.branch,
      });
    } else {
      // Create new staging record
      await ctx.db.insert("fileStaging", {
        ownerId: userId,
        vaultId: args.vaultId,
        filePath: args.initialFilePath,
        initialFilePath: args.initialFilePath,
        fileDeleted: false,
        content: args.content,
        initialContent: args.initialContent,
        parentCommitSha: args.parentCommitSha,
        lastEditTime: currentTimestamp,
        lastEditUserId: userId,
        branch: args.branch,
        version: 0,
      });
    }

    const staging = await ctx.db
      .query("fileStaging")
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

// Internal version of markFileForDeletion — callable from agent actions
// without auth context.
export const internalMarkFileForDeletion = internalMutation({
  args: internalDeletionArgsValidator,
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    const existingStaging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q
          .eq("vaultId", args.vaultId)
          .eq("branch", args.branch)
          .eq("filePath", args.filePath),
      )
      .first();

    const currentTimestamp = Date.now();

    if (existingStaging) {
      await ctx.db.patch(existingStaging._id, {
        fileDeleted: true,
        lastEditTime: currentTimestamp,
        lastEditUserId: args.userId,
        branch: args.branch,
      });
    } else {
      let preservedInitialContent = "";
      if (args.parentCommitSha) {
        const blob = await ctx.runQuery(internal.gitOperations.getBlobBySha, {
          sha: args.parentCommitSha,
        });
        if (typeof blob?.text === "string") {
          preservedInitialContent = blob.text;
        }
      }

      await ctx.db.insert("fileStaging", {
        ownerId: args.userId,
        vaultId: args.vaultId,
        filePath: args.filePath,
        initialFilePath: args.filePath,
        fileDeleted: true,
        content: preservedInitialContent,
        initialContent: preservedInitialContent,
        parentCommitSha: args.parentCommitSha,
        lastEditTime: currentTimestamp,
        lastEditUserId: args.userId,
        branch: args.branch,
        version: 0,
      });
    }

    return null;
  },
});

export const rename = internalMutation({
  args: renameArgsValidator,
  returns: stagedFileValidator,
  handler: async (ctx, args): Promise<StagedFile> => {
    await getUserId(ctx);

    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    const file = await ctx.db
      .query("fileStaging")
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
      .query("fileStaging")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q
          .eq("vaultId", args.vaultId)
          .eq("branch", args.branch)
          .eq("filePath", args.newPath),
      )
      .first();
    if (existingAtNewPath && existingAtNewPath._id !== file._id) {
      throw new Error("A staged file already uses this path");
    }

    const repositoryTree = await resolveRepositoryTreeForVault({
      ctx,
      vaultId: args.vaultId,
      requestedBranch: args.branch,
      legacyTree: vault.treeData.tree,
    });
    const existsInRepository = repositoryTree.some(
      (entry: GithubTreeType) =>
        entry.type === "blob" &&
        entry.path === args.newPath &&
        entry.path !== file.initialFilePath,
    );
    if (existsInRepository) {
      throw new Error("A repository file already exists at this path");
    }

    await ctx.db.patch(file._id, {
      filePath: args.newPath,
    });

    const updatedFile = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_branch_and_path", (q) =>
        q
          .eq("vaultId", args.vaultId)
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
      .query("fileStaging")
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
  },
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    const cleanupCutoffTimestamp = Date.now() + 1;
    for (const instruction of args.instructions) {
      if (instruction.action === "delete") {
        await ctx.db.delete(instruction.stagingId);
      } else {
        const patch: Record<string, unknown> = {
          parentCommitSha: instruction.parentCommitSha,
        };
        if (instruction.initialContent !== undefined) {
          patch.initialContent = instruction.initialContent;
        }
        await ctx.db.patch(instruction.stagingId, patch);
      }
    }

    // Clean up collaborative updates for deleted staging records
    // (schedule batched deletion to avoid hitting read limits)
    const hasDeletes = args.instructions.some((i) => i.action === "delete");
    if (hasDeletes) {
      await ctx.scheduler.runAfter(
        0,
        internal.fileStaging.deleteCollaborativeUpdatesBatch,
        {
          vaultId: args.vaultId,
          cutoffTimestamp: cleanupCutoffTimestamp,
        },
      );
    }

    return null;
  },
});
