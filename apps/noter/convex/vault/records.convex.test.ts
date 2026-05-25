import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

describe("vault records Convex contract", () => {
  it("rejects case-insensitive duplicate Noter-managed repository targets", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
    });

    await t.mutation(internal.vault.records.createInitializingNoterManagedVaultForUser, {
      userId,
      ghRepoOwner: "Ada",
      ghRepoName: "Example-App",
      visibility: "private",
      convexProjectName: "example-app",
      cloudflareAccountId: "cloudflare-account",
      cloudflareWorkerName: "example-app",
    });

    await expect(
      t.mutation(internal.vault.records.createInitializingNoterManagedVaultForUser, {
        userId,
        ghRepoOwner: " ada ",
        ghRepoName: " example-app ",
        visibility: "private",
        convexProjectName: "example-app-2",
        cloudflareAccountId: "cloudflare-account",
        cloudflareWorkerName: "example-app-2",
      }),
    ).rejects.toThrow("Vault already exists for this repository.");
  });

  it("rejects malformed repository full names with extra path segments", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
    });
    const asUser = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(
      asUser.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "ada/example/extra",
      }),
    ).rejects.toThrow("Invalid repository full name");
  });

  it("checks all matching repository rows for other connected vaults", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const firstFailedVaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const firstFailedRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId: firstFailedVaultId,
        repositoryFullName: "ada/shared",
        trigger: "create",
        state: "failed",
        currentStep: "create_github_repo",
        createdAt: 1,
        updatedAt: 2,
        lastError: "failed",
      });
      await ctx.db.replace(firstFailedVaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "failed",
        githubMode: "create_repository",
        runId: firstFailedRunId,
        owner: "ada",
        name: "shared",
        visibility: "private",
        failedAt: 4,
      });

      const secondFailedVaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const secondFailedRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId: secondFailedVaultId,
        repositoryFullName: "ada/shared",
        trigger: "create",
        state: "failed",
        currentStep: "create_github_repo",
        createdAt: 5,
        updatedAt: 6,
        lastError: "failed",
      });
      await ctx.db.replace(secondFailedVaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "failed",
        githubMode: "create_repository",
        runId: secondFailedRunId,
        owner: "ada",
        name: "shared",
        visibility: "private",
        failedAt: 8,
      });

      const connectedVaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const connectedRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId: connectedVaultId,
        repositoryFullName: "ada/shared",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 9,
        updatedAt: 10,
        completedAt: 11,
      });
      await ctx.db.replace(connectedVaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId: connectedRunId,
        ghRepoId: "123",
        owner: "ada",
        name: "shared",
        defaultBranch: "main",
        visibility: "private",
        convex: { state: "not_configured" },
        connectedAt: 12,
      });

      return { firstFailedVaultId };
    });

    await expect(
      t.query(internal.vault.records.hasOtherVaultsForRepository, {
        owner: "ada",
        repo: "shared",
        excludeVaultId: ids.firstFailedVaultId,
      }),
    ).resolves.toBe(true);
  });
});
