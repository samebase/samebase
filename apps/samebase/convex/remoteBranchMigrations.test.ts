import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("remote branch migrations", () => {
  it("clears deprecated Cloudflare preview fields without clearing check summaries", async () => {
    const t = makeConvexTest();
    const branchId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      return await ctx.db.insert("vaultRemoteBranches", {
        vaultId,
        name: "codex/check-cleanup",
        headCommitSha: "abc123",
        pullRequestNumber: 42,
        cloudflareBranchPreviewUrl: "https://branch.example.workers.dev",
        cloudflarePreviewPullRequestNumber: 42,
        cloudflarePreviewUrl: "https://deploy.example.workers.dev",
        cloudflarePreviewCommitSha: "abc123",
        cloudflarePreviewStatus: "Build successful",
        cloudflarePreviewLogsUrl: "https://dash.cloudflare.com/builds/1",
        cloudflarePreviewCommentCreatedAt: 100,
        pullRequestStatusSummary: {
          pullRequestNumber: 42,
          headCommitSha: "abc123",
          state: "success",
          totalCount: 1,
          checkRunCount: 1,
          statusContextCount: 0,
          successCount: 1,
          failureCount: 0,
          runningCount: 0,
          neutralCount: 0,
          unknownCount: 0,
          syncedAt: 200,
        },
        isDefault: false,
        isProtected: false,
        remoteState: "active",
        lastSyncedAt: 200,
      });
    });

    await t.mutation(
      internal.remoteBranchMigrations.clearCloudflarePreviewFieldsFromRemoteBranches,
      {
        batchSize: 10,
      },
    );

    const branch = await t.run(async (ctx) => {
      return await ctx.db.get(branchId);
    });
    expect(branch).toMatchObject({
      pullRequestStatusSummary: {
        pullRequestNumber: 42,
        headCommitSha: "abc123",
        state: "success",
      },
    });
    expect(branch?.cloudflareBranchPreviewUrl).toBeUndefined();
    expect(branch?.cloudflarePreviewPullRequestNumber).toBeUndefined();
    expect(branch?.cloudflarePreviewUrl).toBeUndefined();
    expect(branch?.cloudflarePreviewCommitSha).toBeUndefined();
    expect(branch?.cloudflarePreviewStatus).toBeUndefined();
    expect(branch?.cloudflarePreviewLogsUrl).toBeUndefined();
    expect(branch?.cloudflarePreviewCommentCreatedAt).toBeUndefined();
  });
});
