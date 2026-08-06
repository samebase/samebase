import { v } from "convex/values";

import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalMutation, internalQuery } from "../_generated/server";

const { boolean, literal, number, object, union } = v;

const CLEANUP_BATCH_SIZE = 100;
const ASSIGNMENTS_REMAIN_ERROR =
  "Vault folder assignments must be empty before vault folders can be removed.";

const vCleanupStatus = object({
  assignmentsEmpty: boolean(),
  foldersEmpty: boolean(),
  phase: union(literal("assignments"), literal("folders"), literal("complete")),
});

const vCleanupBatchResult = object({
  rowsDeleted: number(),
  status: vCleanupStatus,
});

async function readCleanupStatus(ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">) {
  const [assignment, folder] = await Promise.all([
    ctx.db.query("ui_vaultFolderAssignments").first(),
    ctx.db.query("ui_vaultFolders").first(),
  ]);
  const assignmentsEmpty = assignment === null;
  const foldersEmpty = folder === null;
  return {
    assignmentsEmpty,
    foldersEmpty,
    phase: !assignmentsEmpty ? "assignments" : !foldersEmpty ? "folders" : "complete",
  } as const;
}

/** Proves the current ordered cleanup phase without reading either table without a bound. */
export const getRemovalStatus = internalQuery({
  args: {},
  returns: vCleanupStatus,
  handler: async (ctx) => await readCleanupStatus(ctx),
});

export const deleteAssignmentBatch = internalMutation({
  args: {},
  returns: vCleanupBatchResult,
  handler: async (ctx) => {
    const assignments = await ctx.db.query("ui_vaultFolderAssignments").take(CLEANUP_BATCH_SIZE);
    for (const assignment of assignments) {
      await ctx.db.delete(assignment._id);
    }
    return {
      rowsDeleted: assignments.length,
      status: await readCleanupStatus(ctx),
    };
  },
});

export const deleteFolderBatch = internalMutation({
  args: {},
  returns: vCleanupBatchResult,
  handler: async (ctx) => {
    if ((await ctx.db.query("ui_vaultFolderAssignments").first()) !== null) {
      throw new Error(ASSIGNMENTS_REMAIN_ERROR);
    }
    const folders = await ctx.db.query("ui_vaultFolders").take(CLEANUP_BATCH_SIZE);
    for (const folder of folders) {
      await ctx.db.delete(folder._id);
    }
    return {
      rowsDeleted: folders.length,
      status: await readCleanupStatus(ctx),
    };
  },
});
