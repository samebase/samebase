import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { components } from "./_generated/api";

/** Root storage and component reference checks share the caller's mutation. */
export async function deleteReleasedStagingStorage(
  ctx: Pick<MutationCtx, "db" | "storage" | "runQuery">,
  releasedStorageIds: string[],
) {
  for (const storageKey of new Set(releasedStorageIds)) {
    const storageId = ctx.db.system.normalizeId("_storage", storageKey);
    if (!storageId) throw new Error("Staged storage reference is invalid.");
    const staged = await ctx.runQuery(components.gitWorkspace.staging.hasStorageReference, {
      storageId: storageKey,
    });
    if (staged) continue;
    const cached = await ctx.db
      .query("observations_repositoryFiles_blobs")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .first();
    if (!cached) await ctx.storage.delete(storageId);
  }
}

// MARK: Public

// MARK: Internal

export const getBlobBySha = internalQuery({
  args: {
    sha: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("observations_repositoryFiles_blobs")
      .withIndex("by_sha", (q) => q.eq("sha", args.sha))
      .first();
  },
});

/**
 * Internal mutation to save a file blob to the database
 */
export const saveFileBlob = internalMutation({
  args: {
    repositoryId: v.id("repositories"),
    sha: v.string(),
    size: v.number(),
    text: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    ext: v.string(),
    mime: v.string(),

    // only used for debugging
    debugFilePath: v.optional(v.string()),
  },
  returns: v.id("observations_repositoryFiles_blobs"),
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository) {
      throw new Error("Repository not found");
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
      .query("observations_repositoryFiles_blobs")
      .withIndex("by_sha", (q) => q.eq("sha", args.sha))
      .first();

    if (existingBlob) {
      console.log(`File blob already exists for SHA: ${args.sha}`);
      return existingBlob._id;
    }

    return await ctx.db.insert("observations_repositoryFiles_blobs", {
      repositoryId: args.repositoryId,
      sha: args.sha,
      size: args.size,
      text: args.text,
      storageId: args.storageId,
      ext: args.ext,
      mime: args.mime,
    });
  },
});
