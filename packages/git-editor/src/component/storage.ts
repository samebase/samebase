import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.js";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host wrappers enforce access.
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server.js";

async function hasStorageReference(ctx: Pick<QueryCtx, "db">, storageId: Id<"_storage">) {
  const staged = await ctx.db
    .query("stagedFiles")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
  if (staged) return true;
  return (
    (await ctx.db
      .query("fileBlobs")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .first()) !== null
  );
}

/** Reference removal and byte deletion share the caller's component transaction. */
export async function deleteUnreferencedStorage(ctx: MutationCtx, storageIds: Id<"_storage">[]) {
  for (const storageId of new Set(storageIds)) {
    if (!(await hasStorageReference(ctx, storageId))) await ctx.storage.delete(storageId);
  }
}

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const getUrl = query({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => await ctx.storage.getUrl(args.storageId),
});

export const deletePendingUpload = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await hasStorageReference(ctx, args.storageId))
      throw new Error("Cannot delete a blob that is already attached to staging.");
    await ctx.storage.delete(args.storageId);
    return null;
  },
});

export const releaseUnreferenced = mutation({
  args: { storageIds: v.array(v.id("_storage")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteUnreferencedStorage(ctx, args.storageIds);
    return null;
  },
});
