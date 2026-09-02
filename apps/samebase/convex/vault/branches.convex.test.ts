import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

describe("vault branch mutations", () => {
  it("rejects a workflow branch-tree write while repository writes are frozen", async () => {
    const t = makeConvexTest();
    await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
      mode: "draining",
    });
    await t.mutation(internal.repositoryMigration.maintenance.transitionRepositoryMaintenanceMode, {
      mode: "frozen",
    });

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
        githubInstallationId: "frozen-tree-installation",
        githubOwnerId: "frozen-tree-owner",
        githubOwnerLogin: "ada",
        githubOwnerLoginNormalized: "ada",
        githubOwnerType: "user",
      });
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        organizationId,
        userId,
        vaultId,
        repositoryFullName: "ada/frozen-tree",
        trigger: "create",
        state: "running",
        currentStep: "create_github_repo",
        createdAt: 1,
        updatedAt: 2,
      });
      await ctx.db.replace(vaultId, {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        name: "frozen-tree",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 4,
      });
      return { runId, userId, vaultId };
    });

    await expect(
      t.mutation(internal.vault.branches.upsertVaultBranchTree, {
        vaultId: ids.vaultId,
        branch: "main",
        commitSHA: "frozen-commit",
        treeData: { sha: "frozen-tree", truncated: false, tree: [] },
        authority: {
          kind: "provisioning",
          runId: ids.runId,
          userId: ids.userId,
          vaultId: ids.vaultId,
        },
      }),
    ).rejects.toThrow("Repository changes are paused for maintenance");
  });

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
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        organizationId,
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
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
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
