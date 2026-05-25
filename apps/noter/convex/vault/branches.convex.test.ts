import { describe, expect, it } from "vite-plus/test";

import { api } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

describe("vault branch mutations", () => {
  it("requires vault ownership before optimistic tree refresh writes", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const otherUserId = await ctx.db.insert("users", {
        name: "Grace",
        email: "grace@example.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId: ownerId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId: ownerId,
        vaultId,
        repositoryFullName: "ada/secure-refresh",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
      await ctx.db.replace(vaultId, {
        userId: ownerId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "secure-refresh",
        defaultBranch: "main",
        visibility: "private",
        convex: { state: "not_configured" },
        connectedAt: 4,
      });
      return { ownerId, otherUserId, vaultId };
    });

    const asOtherUser = t.withIdentity({
      subject: `${ids.otherUserId}|other-session`,
      tokenIdentifier: `test:${ids.otherUserId}`,
    });
    await expect(
      asOtherUser.mutation(api.vault.branches.startTreeRefreshOptimistic, {
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow("Vault not found");
    await expect(
      t.run(async (ctx) => (await ctx.db.get(ids.vaultId))?.treeRefreshStartedAt),
    ).resolves.toBeNull();

    const asOwner = t.withIdentity({
      subject: `${ids.ownerId}|owner-session`,
      tokenIdentifier: `test:${ids.ownerId}`,
    });
    await expect(
      asOwner.mutation(api.vault.branches.startTreeRefreshOptimistic, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toBeNull();
    await expect(
      t.run(async (ctx) => (await ctx.db.get(ids.vaultId))?.treeRefreshStartedAt),
    ).resolves.toEqual(expect.any(Number));
  });
});
