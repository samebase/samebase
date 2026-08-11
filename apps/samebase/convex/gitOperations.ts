import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// MARK: Public

// MARK: Internal

export const getBlobBySha = internalQuery({
  args: {
    sha: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("observations_vaultFiles_blobs")
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
    storageIdIsDisposable: v.optional(v.boolean()),
    ext: v.string(),
    mime: v.string(),

    // only used for debugging
    debugFilePath: v.optional(v.string()),
  },
  returns: v.union(v.id("observations_vaultFiles_blobs"), v.null()),
  handler: async (ctx, args) => {
    const rejectAfterDisposableStorageCleanup = async (message: string) => {
      if (args.storageIdIsDisposable && args.storageId) {
        await ctx.storage.delete(args.storageId);
        return null;
      }
      throw new Error(message);
    };
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      return await rejectAfterDisposableStorageCleanup("Vault not found");
    }
    const organization = await ctx.db.get(vault.organizationId);
    if (organization === null || organization.deletion) {
      return await rejectAfterDisposableStorageCleanup("Organization is not available.");
    }

    // empty text is also valid
    const textDefined = typeof args.text === "string";

    // Only text or storageId should be provided
    if (textDefined && args.storageId) {
      return await rejectAfterDisposableStorageCleanup(
        "Only one of text or storageId should be provided",
      );
    }
    if (!textDefined && !args.storageId) {
      throw new Error("One of text or storageId must be provided");
    }

    // Check if file blob already exists
    const existingBlob = await ctx.db
      .query("observations_vaultFiles_blobs")
      .withIndex("by_sha", (q) => q.eq("sha", args.sha))
      .first();

    if (existingBlob) {
      if (args.storageIdIsDisposable && args.storageId) {
        await ctx.storage.delete(args.storageId);
      }
      return existingBlob._id;
    }

    return await ctx.db.insert("observations_vaultFiles_blobs", {
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
