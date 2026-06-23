import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const { boolean, null: vNull, number, object, optional, string, union } = v;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

const clearCloudflarePreviewFieldsResult = object({
  scanned: number(),
  patched: number(),
  isDone: boolean(),
  continueCursor: union(string(), vNull()),
});

type DeprecatedRemoteBranchCloudflarePreviewFields = {
  cloudflareBranchPreviewUrl?: string;
  cloudflarePreviewPullRequestNumber?: number;
  cloudflarePreviewUrl?: string;
  cloudflarePreviewCommitSha?: string;
  cloudflarePreviewStatus?: string;
  cloudflarePreviewLogsUrl?: string;
  cloudflarePreviewCommentCreatedAt?: number;
};

function normalizeBatchSize(batchSize: number | undefined): number {
  if (!Number.isFinite(batchSize) || batchSize === undefined) {
    return DEFAULT_BATCH_SIZE;
  }
  return Math.max(1, Math.min(Math.floor(batchSize), MAX_BATCH_SIZE));
}

function hasDeprecatedCloudflarePreviewFields(
  branch: DeprecatedRemoteBranchCloudflarePreviewFields,
): boolean {
  return (
    branch.cloudflareBranchPreviewUrl !== undefined ||
    branch.cloudflarePreviewPullRequestNumber !== undefined ||
    branch.cloudflarePreviewUrl !== undefined ||
    branch.cloudflarePreviewCommitSha !== undefined ||
    branch.cloudflarePreviewStatus !== undefined ||
    branch.cloudflarePreviewLogsUrl !== undefined ||
    branch.cloudflarePreviewCommentCreatedAt !== undefined
  );
}

export const clearCloudflarePreviewFieldsFromRemoteBranches = internalMutation({
  args: {
    cursor: optional(union(string(), vNull())),
    batchSize: optional(number()),
  },
  returns: clearCloudflarePreviewFieldsResult,
  handler: async (ctx, args) => {
    const batchSize = normalizeBatchSize(args.batchSize);
    const page = await ctx.db.query("vaultRemoteBranches").paginate({
      cursor: args.cursor ?? null,
      numItems: batchSize,
    });
    let patched = 0;

    for (const branch of page.page) {
      if (!hasDeprecatedCloudflarePreviewFields(branch)) {
        continue;
      }
      await ctx.db.patch(branch._id, {
        cloudflareBranchPreviewUrl: undefined,
        cloudflarePreviewPullRequestNumber: undefined,
        cloudflarePreviewUrl: undefined,
        cloudflarePreviewCommitSha: undefined,
        cloudflarePreviewStatus: undefined,
        cloudflarePreviewLogsUrl: undefined,
        cloudflarePreviewCommentCreatedAt: undefined,
      });
      patched += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.remoteBranchMigrations.clearCloudflarePreviewFieldsFromRemoteBranches,
        {
          cursor: page.continueCursor,
          batchSize,
        },
      );
    }

    return {
      scanned: page.page.length,
      patched,
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
    };
  },
});
