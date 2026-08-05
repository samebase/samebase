import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

describe("vault branch mutations", () => {
  it("publishes an exact branch tree only for the active refresh claim", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubInstallationId: "claimed-tree-installation",
        githubOwnerId: "claimed-tree-owner",
        githubOwnerLogin: "ada",
        githubOwnerLoginNormalized: "ada",
        githubOwnerType: "user",
      });
      await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId,
        vaultId,
        repositoryFullName: "ada/claimed-tree",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
      await ctx.db.replace(vaultId, {
        organizationId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        name: "claimed-tree",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 4,
        treeRefreshStartedAt: 200,
      });
      return { vaultId };
    });
    const treeData = {
      sha: "feature-tree",
      truncated: false,
      tree: [],
    };

    await expect(
      t.mutation(internal.vault.branches.upsertClaimedVaultBranchTree, {
        vaultId: ids.vaultId,
        branch: "feature/pr",
        startedAt: 100,
        commitSHA: "feature-commit",
        treeData,
      }),
    ).resolves.toEqual({ written: false });
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("observations_vaultRepository_branchTrees")
          .withIndex("by_vault_and_branch", (q) =>
            q.eq("vaultId", ids.vaultId).eq("branch", "feature/pr"),
          )
          .collect(),
      ),
    ).resolves.toEqual([]);

    await expect(
      t.mutation(internal.vault.branches.upsertClaimedVaultBranchTree, {
        vaultId: ids.vaultId,
        branch: "feature/pr",
        startedAt: 200,
        commitSHA: "feature-commit",
        treeData,
      }),
    ).resolves.toEqual({ written: true });
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("observations_vaultRepository_branchTrees")
          .withIndex("by_vault_and_branch", (q) =>
            q.eq("vaultId", ids.vaultId).eq("branch", "feature/pr"),
          )
          .unique(),
      ),
    ).resolves.toMatchObject({
      vaultId: ids.vaultId,
      branch: "feature/pr",
      commitSHA: "feature-commit",
      treeData,
    });

    await expect(
      t.mutation(internal.vault.branches.upsertVaultBranchTree, {
        vaultId: ids.vaultId,
        branch: "feature/truncated",
        commitSHA: "incomplete-commit",
        treeData: { ...treeData, truncated: true },
      }),
    ).rejects.toThrow("GitHub returned an incomplete recursive repository tree.");
  });
});
