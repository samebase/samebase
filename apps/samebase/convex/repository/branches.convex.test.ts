import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

describe("repository branch mutations", () => {
  it("publishes an exact branch tree only for the active refresh claim", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubInstallationId: "claimed-tree-installation",
        githubOwnerId: "claimed-tree-owner",
        githubOwnerLogin: "ada",
        githubOwnerLoginNormalized: "ada",
        githubOwnerType: "user",
      });
      await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
      const repositoryId = await ctx.db.insert("repositories", {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        createdAt: 1,
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId,
        userId,
        repositoryId,
        githubRepositoryFullName: "ada/claimed-tree",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
      await ctx.db.replace(repositoryId, {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        createdAt: 1,
        state: "connected",
        githubMode: "create_repository",
        runId,
        githubRepositoryDatabaseId: "123",
        githubRepositoryName: "claimed-tree",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 4,
        treeRefreshStartedAt: 200,
      });
      return { repositoryId };
    });
    const treeData = {
      sha: "feature-tree",
      truncated: false,
      tree: [],
    };

    await expect(
      t.mutation(internal.repository.branches.upsertClaimedRepositoryBranchTree, {
        repositoryId: ids.repositoryId,
        branch: "feature/pr",
        startedAt: 100,
        commitSHA: "feature-commit",
        treeData,
      }),
    ).resolves.toEqual({ written: false });
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("observations_repository_branchTrees")
          .withIndex("by_repository_and_branch", (q) =>
            q.eq("repositoryId", ids.repositoryId).eq("branch", "feature/pr"),
          )
          .collect(),
      ),
    ).resolves.toEqual([]);

    await expect(
      t.mutation(internal.repository.branches.upsertClaimedRepositoryBranchTree, {
        repositoryId: ids.repositoryId,
        branch: "feature/pr",
        startedAt: 200,
        commitSHA: "feature-commit",
        treeData,
      }),
    ).resolves.toEqual({ written: true });
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("observations_repository_branchTrees")
          .withIndex("by_repository_and_branch", (q) =>
            q.eq("repositoryId", ids.repositoryId).eq("branch", "feature/pr"),
          )
          .unique(),
      ),
    ).resolves.toMatchObject({
      repositoryId: ids.repositoryId,
      branch: "feature/pr",
      commitSHA: "feature-commit",
      treeData,
    });

    await expect(
      t.mutation(internal.repository.branches.upsertRepositoryBranchTree, {
        repositoryId: ids.repositoryId,
        branch: "feature/truncated",
        commitSHA: "incomplete-commit",
        treeData: { ...treeData, truncated: true },
      }),
    ).rejects.toThrow("GitHub returned an incomplete recursive repository tree.");
  });
});
