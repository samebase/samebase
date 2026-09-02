import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  requireRepositoryOperationLease,
  requireRepositoryOperationStart,
} from "./repositoryMigration/maintenance";

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
    leaseId: v.optional(v.id("repositoryOperationLeases")),
    operationId: v.optional(v.string()),
    operationName: v.optional(v.string()),
  },
  returns: v.id("observations_repositoryFiles_blobs"),
  handler: async (ctx, args) => {
    if (
      args.leaseId === undefined &&
      args.operationId === undefined &&
      args.operationName === undefined
    ) {
      await requireRepositoryOperationStart(ctx);
    } else if (
      args.leaseId === undefined ||
      args.operationId === undefined ||
      args.operationName === undefined
    ) {
      throw new Error("Repository operation lease identity is incomplete.");
    } else {
      await requireRepositoryOperationLease(ctx, {
        leaseId: args.leaseId,
        operationId: args.operationId,
        operationName: args.operationName,
      });
    }
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
