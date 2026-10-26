import { v, type Infer } from "convex/values";
import { fileBlob, fileBlobFields } from "@samebase/git-workspace/model";
import { internalMutation } from "./_generated/server";
import { components } from "./_generated/api";
import { isLiveConnectedRepository } from "./repository/state";

const { id, string } = v;

/** Host lifecycle check and component cache publication share one transaction. */
export const saveFileBlob = internalMutation({
  args: {
    ...fileBlobFields,
    repositoryId: id("repositories"),
    ext: string(),
    mime: string(),
  },
  returns: v.union(fileBlob, v.null()),
  handler: async (ctx, args): Promise<Infer<typeof fileBlob> | null> => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!isLiveConnectedRepository(repository)) {
      if (args.storageId) {
        await ctx.runMutation(components.gitWorkspace.storage.releaseUnreferenced, {
          storageIds: [args.storageId],
        });
      }
      return null;
    }
    return await ctx.runMutation(components.gitWorkspace.blobs.save, {
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
