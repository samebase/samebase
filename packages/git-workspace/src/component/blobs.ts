import { v } from "convex/values";
// eslint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host wrappers enforce access.
import { mutation, query } from "./_generated/server.js";
import { fileBlob, fileBlobFields } from "../model.js";

const { array, boolean, number, object, string, union } = v;

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
  args: { ...fileBlobFields, ext: string(), mime: string() },
  returns: v.id("fileBlobs"),
  handler: async (ctx, args) => {
    // Empty text is also valid. A blob is stored inline or in host storage.
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
    if (existing) return existing._id;
    return await ctx.db.insert("fileBlobs", args);
  },
});

export const hasStorageReference = query({
  args: { storageId: string() },
  returns: boolean(),
  handler: async (ctx, args) =>
    (await ctx.db
      .query("fileBlobs")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first()) !== null,
});

export const deleteRepositoryBatch = mutation({
  args: { repositoryId: string() },
  returns: object({ rowsChanged: number(), releasedStorageIds: array(string()) }),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("fileBlobs")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .take(50);
    const storageIds = new Set<string>();
    for (const row of rows) {
      if (row.storageId) storageIds.add(row.storageId);
      await ctx.db.delete(row._id);
    }
    return { rowsChanged: rows.length, releasedStorageIds: [...storageIds] };
  },
});
