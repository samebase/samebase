import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Internal mutation to save a file blob to the database
 */
export const saveFileBlob = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    filePath: v.string(),
    content: v.bytes(),
    sha: v.string(),
  },
  returns: v.id("fileBlobs"),
  handler: async (ctx, args) => {
    // Get vault info for ghRepoId
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      throw new Error("Vault not found");
    }

    // Check if file blob already exists
    const existingBlob = await ctx.db
      .query("fileBlobs")
      .withIndex("by_vault_and_sha", (q) =>
        q.eq("vaultId", args.vaultId).eq("sha", args.sha),
      )
      .first();

    if (existingBlob) {
      console.log(`File blob already exists for SHA: ${args.sha}`);
      return existingBlob._id;
    }

    return await ctx.db.insert("fileBlobs", {
      vaultId: args.vaultId,
      ghRepoId: vault.ghRepoId,
      sha: args.sha,
      filePath: args.filePath,
      content: args.content,
    });
  },
});

/**
 * Query to get file blob by vault and SHA
 */
export const getFileBlob = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    sha: v.string(),
  },
  handler: async (ctx, args) => {
    const blob = await ctx.db
      .query("fileBlobs")
      .withIndex("by_vault_and_sha", (q) =>
        q.eq("vaultId", args.vaultId).eq("sha", args.sha),
      )
      .first();

    if (!blob) {
      return null;
    }

    return {
      _id: blob._id,
      filePath: blob.filePath,
      content: blob.content,
      sha: blob.sha,
    };
  },
});

/**
 * Get all file blobs for a vault (useful for debugging or file listing)
 */
export const getVaultFileBlobs = internalMutation({
  args: {
    vaultId: v.id("vaults"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    {
      _id: Id<"fileBlobs">;
      filePath: string;
      sha: string;
      size: number;
    }[]
  > => {
    const blobs = await ctx.db
      .query("fileBlobs")
      .filter((q) => q.eq(q.field("vaultId"), args.vaultId))
      .collect();

    return blobs.map((blob) => ({
      _id: blob._id,
      filePath: blob.filePath,
      sha: blob.sha,
      size: blob.content.byteLength,
    }));
  },
});

/**
 * Delete all file blobs for a vault (cleanup function)
 */
export const deleteVaultFileBlobs = internalMutation({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const blobs = await ctx.db
      .query("fileBlobs")
      .filter((q) => q.eq(q.field("vaultId"), args.vaultId))
      .collect();

    for (const blob of blobs) {
      await ctx.db.delete(blob._id);
    }

    return blobs.length;
  },
});
