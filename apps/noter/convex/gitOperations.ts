import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// MARK: Public

// MARK: Internal

export const getBlobBySha = internalQuery({
  args: {
    sha: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("blobs")
      .withIndex("by_sha", (q) => q.eq("sha", args.sha))
      .first();
  },
});

/**
 * Internal mutation to save a file blob to the database
 */
export const saveFileBlob = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    sha: v.string(),
    size: v.number(),
    text: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    ext: v.string(),
    mime: v.string(),

    // only used for debugging
    debugFilePath: v.optional(v.string()),
  },
  returns: v.id("blobs"),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      throw new Error("Vault not found");
    }

    // empty text is also valid
    const textDefined = typeof args.text === "string";

    // Only text or storageId should be provided
    if (textDefined && args.storageId) {
      console.log("saveFileBlob", args);
      throw new Error("Only one of text or storageId should be provided");
    }
    if (!textDefined && !args.storageId) {
      console.log("saveFileBlob", args);
      throw new Error("One of text or storageId must be provided");
    }

    // Check if file blob already exists
    const existingBlob = await ctx.db
      .query("blobs")
      .withIndex("by_sha", (q) => q.eq("sha", args.sha))
      .first();

    if (existingBlob) {
      console.log(`File blob already exists for SHA: ${args.sha}`);
      return existingBlob._id;
    }

    return await ctx.db.insert("blobs", {
      vaultId: args.vaultId,
      sha: args.sha,
      size: args.size,
      text: args.text,
      storageId: args.storageId,
      ext: args.ext,
      mime: args.mime,
    });
  },
});
