import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { vSimpleDataDeletionGroup } from "./cleanup";

const { id, string } = v;

export const cleanupDataDeletionGroup = internalAction({
  args: {
    runId: id("accountDeletionRuns"),
    workflowId: string(),
    group: vSimpleDataDeletionGroup,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    while (
      !(await ctx.runMutation(internal.accountDeletion.cleanup.cleanupDataDeletionGroupBatch, args))
    ) {
      // Each mutation persists real progress, so retries resume from the last committed batch.
    }

    return null;
  },
});

export const cleanupVaultData = internalAction({
  args: {
    runId: id("accountDeletionRuns"),
    workflowId: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    while (
      !(await ctx.runMutation(internal.accountDeletion.cleanup.cleanupVaultDataDeletionBatch, args))
    ) {
      // Each mutation persists real progress, so retries resume from the last committed batch.
    }

    return null;
  },
});
