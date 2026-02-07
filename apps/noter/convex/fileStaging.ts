import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { getUserId } from "./common";

export const AUTO_COMMIT_DELAY_MS = 2 * 1000;

// MARK: Public

export const getByNewPath = query({
  args: {
    vaultId: v.id("vaults"),
    newPath: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const staging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("filePath", args.newPath),
      )
      .first();

    return staging;
  },
});

// List all files currently in staging for a vault
export const listStagedFiles = query({
  args: {
    vaultId: v.id("vaults"),
    includeUnchanged: v.optional(v.boolean()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .filter((q) =>
        args.includeUnchanged
          ? q.eq(true, true)
          : q.or(
              // content changed
              q.neq(q.field("content"), q.field("initialContent")),
              // file deleted
              q.eq(q.field("fileDeleted"), true),
              // file renamed
              q.neq(q.field("filePath"), q.field("initialFilePath")),
              // new file (parentCommitSha is null)
              q.eq(q.field("parentCommitSha"), null),
            ),
      )
      .collect();

    return files;
  },
});

const DELETION_BATCH_SIZE = 500;

// Clear staging for a specific file (used after successful commit)
export const clearAllStaging = mutation({
  args: {
    vaultId: v.id("vaults"),
    skipTreeUpdate: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get vault info to schedule tree update
    const vault = await ctx.db.get(args.vaultId);

    const stagingFiles = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();

    for (const staging of stagingFiles) {
      await ctx.db.delete(staging._id);
    }

    // Delete collaborative updates in batches to avoid hitting read limits.
    // Schedule the first batch — it will chain further batches if needed.
    await ctx.scheduler.runAfter(
      0,
      internal.fileStaging.deleteCollaborativeUpdatesBatch,
      { vaultId: args.vaultId },
    );

    // Update tree to ensure it's fresh after clearing staging
    // Skip when called from commitAllStaged (tree is already updated there)
    if (vault && !args.skipTreeUpdate) {
      await ctx.scheduler.runAfter(0, internal.github.updateRepositoryTree, {
        userId: vault.userId,
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
      });
    }

    return null;
  },
});

// Delete collaborative updates in batches to stay under the 4096 read limit.
export const deleteCollaborativeUpdatesBatch = internalMutation({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const updates = await ctx.db
      .query("collaborativeUpdates")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .take(DELETION_BATCH_SIZE);

    for (const update of updates) {
      await ctx.db.delete(update._id);
    }

    // If we got a full batch, there are likely more — schedule another round.
    if (updates.length === DELETION_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.fileStaging.deleteCollaborativeUpdatesBatch,
        { vaultId: args.vaultId },
      );
    }

    return null;
  },
});

// Mark a file for deletion in staging
export const markFileForDeletion = mutation({
  args: {
    vaultId: v.id("vaults"),
    filePath: v.string(),
    parentCommitSha: v.union(v.string(), v.null()),
    branch: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    // Check if there's already a staging record for this file
    const existingStaging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("filePath", args.filePath),
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
      // Create new staging record for deletion
      await ctx.db.insert("fileStaging", {
        ownerId: userId,
        vaultId: args.vaultId,
        filePath: args.filePath,
        initialFilePath: args.filePath,
        fileDeleted: true,
        content: "", // Empty content for deleted files
        initialContent: "", // We don't need the original content for deletions
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
  args: {
    vaultId: v.id("vaults"),
    filePath: v.string(),
    content: v.string(),
    branch: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    // Check if there's already a staging record for this file
    const existingStaging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_initial_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("initialFilePath", args.filePath),
      )
      .first();

    if (existingStaging) {
      throw new Error("File already exists in staging");
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
  args: {
    vaultId: v.id("vaults"),
    initialFilePath: v.string(),
    content: v.string(),
    initialContent: v.string(),
    parentCommitSha: v.union(v.string(), v.null()),
    branch: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    // Check if there's already a staging record for this file
    const existingStaging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_initial_path", (q) =>
        q
          .eq("vaultId", args.vaultId)
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

      console.log({
        old: existingStaging.content,
        new: args.content,
      });

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
      .withIndex("by_vault_and_initial_path", (q) =>
        q
          .eq("vaultId", args.vaultId)
          .eq("initialFilePath", args.initialFilePath),
      )
      .first();

    if (!staging) {
      throw new Error("Should not happen. Staging not found after saving?!?");
    }

    return staging;
  },
});

export const rename = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    initialFilePath: v.string(),
    newPath: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    _id: Id<"fileStaging">;
    _creationTime: number;
    ownerId: Id<"users">;
    vaultId: Id<"vaults">;
    fileDeleted: boolean;
    filePath: string;
    initialFilePath: string;
    content: string;
    initialContent: string;
    parentCommitSha: string | null;
    lastEditTime: number;
    lastEditUserId: Id<"users">;
    branch: string;
    version: number;
  }> => {
    await getUserId(ctx);

    const vault = await ctx.runQuery(internal.vault.getById, {
      id: args.vaultId,
    });

    if (!vault) {
      throw new Error("Vault not found");
    }

    const file = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_initial_path", (q) =>
        q
          .eq("vaultId", args.vaultId)
          .eq("initialFilePath", args.initialFilePath),
      )
      .first();

    if (!file) {
      throw new Error("File not found");
    }

    await ctx.db.patch(file._id, {
      filePath: args.newPath,
    });

    const updatedFile = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_path", (q) =>
        q.eq("vaultId", args.vaultId).eq("filePath", args.newPath),
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
  args: {
    vaultId: v.id("vaults"),
    originalFilePath: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const staging = await ctx.db
      .query("fileStaging")
      .withIndex("by_vault_and_initial_path", (q) =>
        q
          .eq("vaultId", args.vaultId)
          .eq("initialFilePath", args.originalFilePath),
      )
      .first();

    return staging;
  },
});

// Reconcile staging records after pulling a fresh tree from GitHub.
// Accepts a list of instructions describing what to do with each staging record.
const reconcileInstructionValidator = v.union(
  v.object({
    action: v.literal("delete"),
    stagingId: v.id("fileStaging"),
  }),
  v.object({
    action: v.literal("update"),
    stagingId: v.id("fileStaging"),
    parentCommitSha: v.union(v.string(), v.null()),
    initialContent: v.optional(v.string()),
  }),
);

export const reconcileStagingWithTree = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    instructions: v.array(reconcileInstructionValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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
        { vaultId: args.vaultId },
      );
    }

    return null;
  },
});
