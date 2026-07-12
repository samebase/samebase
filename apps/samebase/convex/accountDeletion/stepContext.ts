import { v } from "convex/values";

import { internalQuery } from "../_generated/server";

const { id, object, string, union } = v;

export const getActiveIdentity = internalQuery({
  args: {
    runId: id("accountDeletionRuns"),
  },
  returns: union(
    v.null(),
    object({
      userId: id("users"),
      email: string(),
    }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null || run.identity.state !== "active") {
      return null;
    }
    return {
      userId: run.identity.userId,
      email: run.identity.email,
    };
  },
});
