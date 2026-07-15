import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";

async function seedVault(): Promise<{
  t: ReturnType<typeof makeConvexTest>;
  vaultId: Id<"vaults">;
}> {
  const t = makeConvexTest();
  const vaultId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    return await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
  });
  return { t, vaultId };
}

describe("vault branch trees", () => {
  it("stores and updates each requested branch independently", async () => {
    const { t, vaultId } = await seedVault();

    await t.mutation(internal.vault.branches.upsertVaultBranchTree, {
      vaultId,
      branch: "main",
      commitSHA: "main-commit-1",
      treeData: {
        sha: "main-tree-1",
        truncated: false,
        tree: [
          {
            path: "README.md",
            mode: "100644",
            type: "blob",
            sha: "readme-1",
          },
        ],
      },
    });
    await t.mutation(internal.vault.branches.upsertVaultBranchTree, {
      vaultId,
      branch: "feature/inventory",
      commitSHA: "feature-commit-1",
      treeData: {
        sha: "feature-tree-1",
        truncated: false,
        tree: [],
      },
    });

    await t.mutation(internal.vault.branches.upsertVaultBranchTree, {
      vaultId,
      branch: "main",
      commitSHA: "main-commit-2",
      treeData: {
        sha: "main-tree-2",
        truncated: false,
        tree: [],
      },
    });

    const main = await t.query(internal.vault.branches.getVaultBranchTree, {
      vaultId,
      branch: "main",
    });
    const feature = await t.query(internal.vault.branches.getVaultBranchTree, {
      vaultId,
      branch: "feature/inventory",
    });

    expect(main).toMatchObject({
      branch: "main",
      treeSHA: "main-tree-2",
      commitSHA: "main-commit-2",
      treeData: { sha: "main-tree-2", tree: [] },
    });
    expect(feature).toMatchObject({
      branch: "feature/inventory",
      treeSHA: "feature-tree-1",
      commitSHA: "feature-commit-1",
      treeData: { sha: "feature-tree-1", tree: [] },
    });
    await expect(
      t.run(async (ctx) => {
        return await ctx.db.query("vaultBranchTrees").take(3);
      }),
    ).resolves.toHaveLength(2);
  });

  it("keeps a newer refresh claim locked against stale releases", async () => {
    const { t, vaultId } = await seedVault();
    const claim = await t.mutation(internal.vault.branches.claimTreeRefresh, {
      vaultId,
      force: true,
    });
    if (claim.startedAt === undefined) {
      throw new Error("Expected a refresh claim timestamp");
    }

    await expect(
      t.mutation(internal.vault.branches.claimTreeRefresh, { vaultId }),
    ).resolves.toEqual({ claimed: false, reason: "in_progress" });
    await expect(
      t.mutation(internal.vault.branches.releaseTreeRefresh, {
        vaultId,
        startedAt: claim.startedAt + 1,
      }),
    ).resolves.toEqual({ released: false });

    const cooldownUntil = Date.now() + 60_000;
    await expect(
      t.mutation(internal.vault.branches.releaseTreeRefresh, {
        vaultId,
        startedAt: claim.startedAt,
        markRefreshed: false,
        failureKind: "rate_limited",
        failureMessage: "GitHub asked us to wait.",
        cooldownUntil,
      }),
    ).resolves.toEqual({ released: true });
    const failedVault = await t.run(async (ctx) => await ctx.db.get(vaultId));
    expect(failedVault).toMatchObject({
      treeRefreshFailureKind: "rate_limited",
      treeRefreshFailureMessage: "GitHub asked us to wait.",
      treeRefreshCooldownUntil: cooldownUntil,
    });
    expect(failedVault?.treeRefreshStartedAt).toBeUndefined();
  });

  it("ignores stale fallback failures and preserves the later cooldown", async () => {
    const { t, vaultId } = await seedVault();
    await t.run(async (ctx) => {
      await ctx.db.patch(vaultId, {
        treeRefreshStartedAt: 200,
        treeRefreshCooldownUntil: 500,
      });
    });

    await t.mutation(internal.vault.branches.recordTreeRefreshFailure, {
      vaultId,
      startedAt: 199,
      failureKind: "failed",
      failureMessage: "stale failure",
      cooldownUntil: 700,
    });
    const vaultAfterStaleFailure = await t.run(async (ctx) => await ctx.db.get(vaultId));
    expect(vaultAfterStaleFailure).toMatchObject({
      treeRefreshStartedAt: 200,
      treeRefreshCooldownUntil: 500,
    });
    expect(vaultAfterStaleFailure?.lastTreeRefreshFailedAt).toBeUndefined();

    await t.mutation(internal.vault.branches.recordTreeRefreshFailure, {
      vaultId,
      startedAt: 200,
      failureKind: "rate_limited",
      failureMessage: "current failure",
      cooldownUntil: 400,
    });
    await expect(t.run(async (ctx) => await ctx.db.get(vaultId))).resolves.toMatchObject({
      treeRefreshStartedAt: 200,
      lastTreeRefreshFailedAt: expect.any(Number),
      treeRefreshFailureKind: "rate_limited",
      treeRefreshFailureMessage: "current failure",
      treeRefreshCooldownUntil: 500,
    });
  });
});
