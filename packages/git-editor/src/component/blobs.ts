import { v } from "convex/values";
// eslint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host wrappers enforce access.
import { mutation, query } from "./_generated/server.js";
import { fileBlob, fileBlobFields } from "../model.js";
import { deleteUnreferencedStorage } from "./storage.js";

const { id, number, optional, string, union } = v;

export const getBySha = query({
  args: { sha: string() },
  returns: union(fileBlob, v.null()),
  handler: async (ctx, args) =>
    await ctx.db
      .query("fileBlobs")
      .withIndex("by_sha", (q) => q.eq("sha", args.sha))
      .first(),
});

export const save = mutation({
  args: { ...fileBlobFields, storageId: optional(id("_storage")), ext: string(), mime: string() },
  returns: fileBlob,
  handler: async (ctx, args) => {
    // Empty text is also valid. A blob is stored inline or in component storage.
    const textDefined = typeof args.text === "string";
    if (textDefined && args.storageId)
      throw new Error("Only one of text or storageId should be provided");
    if (!textDefined && !args.storageId)
      throw new Error("One of text or storageId must be provided");

    // Git blob SHAs identify content across repositories.
    const existing = await ctx.db
      .query("fileBlobs")
      .withIndex("by_sha", (q) => q.eq("sha", args.sha))
      .first();
    if (existing) {
      if (args.storageId) await deleteUnreferencedStorage(ctx, [args.storageId]);
      return existing;
    }
    const blobId = await ctx.db.insert("fileBlobs", args);
    const saved = await ctx.db.get(blobId);
    if (!saved) throw new Error("Cached blob disappeared after insert.");
    return saved;
  },
});

export const deleteRepositoryBatch = mutation({
  args: { repositoryId: string() },
  returns: number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("fileBlobs")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .take(50);
    for (const row of rows) await ctx.db.delete(row._id);
    await deleteUnreferencedStorage(
      ctx,
      rows.flatMap((row) => (row.storageId ? [row.storageId] : [])),
    );
    return rows.length;
  },
});
