import { v, type Infer } from "convex/values";
import { fileBlob } from "@samebase/git-workspace/model";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { isLiveConnectedRepository } from "./repository/state";

const { id, optional, string } = v;
const hostFileBlob = fileBlob.extend({ storageId: optional(id("_storage")) });
type HostFileBlob = Infer<typeof hostFileBlob>;

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
    const cached = await ctx.runQuery(components.gitWorkspace.blobs.hasStorageReference, {
      storageId: storageKey,
    });
    if (!cached) await ctx.storage.delete(storageId);
  }
}

export const getBlobBySha = internalQuery({
  args: { sha: string() },
  returns: v.union(hostFileBlob, v.null()),
  handler: async (ctx, args): Promise<HostFileBlob | null> => {
    const blob = await ctx.runQuery(components.gitWorkspace.blobs.getBySha, { sha: args.sha });
    if (!blob) return null;
    const storageId =
      blob.storageId === undefined
        ? undefined
        : ctx.db.system.normalizeId("_storage", blob.storageId);
    if (storageId === null) throw new Error("Cached storage reference is invalid.");
    return { ...blob, storageId };
  },
});

/** Internal mutation to save a file blob to the component cache. */
export const saveFileBlob = internalMutation({
  args: {
    repositoryId: id("repositories"),
    sha: string(),
    size: v.number(),
    text: optional(string()),
    storageId: optional(id("_storage")),
    ext: string(),
    mime: string(),
  },
  returns: v.union(hostFileBlob, v.null()),
  handler: async (ctx, args): Promise<HostFileBlob | null> => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!isLiveConnectedRepository(repository)) {
      if (args.storageId) await deleteReleasedStagingStorage(ctx, [args.storageId]);
      return null;
    }
    await ctx.runMutation(components.gitWorkspace.blobs.save, {
      repositoryId: args.repositoryId,
      sha: args.sha,
      size: args.size,
      text: args.text,
      storageId: args.storageId,
      ext: args.ext,
      mime: args.mime,
    });
    // A concurrent reader can already have cached this SHA with another upload.
    // The chosen cache row protects its bytes while the unused upload is released.
    if (args.storageId) await deleteReleasedStagingStorage(ctx, [args.storageId]);
    return await ctx.runQuery(internal.gitOperations.getBlobBySha, { sha: args.sha });
  },
});
