import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

async function createConnectedVaultForBranchResolution() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
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
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/inventory",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 3,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: "123",
      ghRepoNodeId: "R_123",
      repositoryKey: "ada/inventory",
      owner: "ada",
      name: "inventory",
      defaultBranch: "main",
      visibility: "private",
      connectedAt: 4,
    });
    return { userId, vaultId };
  });
  return {
    t,
    ids,
    asUser: t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    }),
  };
}

describe("vault records Convex contract", () => {
  it("defaults connection resource links open for new vaults", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
    });

    const existingRepository = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        userId,
        ghRepoId: "existing-app-repository-id",
        ghRepoOwner: "Ada",
        ghRepoName: "Existing-App",
      },
    );
    const samebaseManaged = await t.mutation(
      internal.vault.records.createInitializingSamebaseManagedVaultForUser,
      {
        userId,
        ghRepoOwner: "Ada",
        ghRepoName: "Created-App",
        visibility: "private",
        convexProjectName: "created-app",
        cloudflareAccountId: "cloudflare-account",
        cloudflareWorkerName: "created-app",
      },
    );
    const asUser = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(asUser.query(api.vault.dashboard.getUserVaultResourceLinksState)).resolves.toEqual(
      expect.arrayContaining([
        {
          vaultId: existingRepository.vaultId,
          resourceLinksOpen: true,
        },
        {
          vaultId: samebaseManaged.vaultId,
          resourceLinksOpen: true,
        },
      ]),
    );
  });

  it("creates the repository summary when a Samebase-managed vault connects to GitHub", async () => {
    const t = makeConvexTest();
    const userId = await t.run(
      async (ctx) =>
        await ctx.db.insert("users", {
          name: "Ada",
          email: "ada@example.com",
          isApproved: true,
        }),
    );
    const initialized = await t.mutation(
      internal.vault.records.createInitializingSamebaseManagedVaultForUser,
      {
        userId,
        ghRepoOwner: "Ada",
        ghRepoName: "Created-App",
        visibility: "private",
        convexProjectName: "created-app",
        cloudflareAccountId: "cloudflare-account",
        cloudflareWorkerName: "created-app",
      },
    );

    await t.mutation(internal.vault.records.connectSamebaseManagedVaultGitHub, {
      vaultId: initialized.vaultId,
      runId: initialized.runId,
      userId,
      ghRepoId: "created-app-database-id",
      ghRepoNodeId: "created-app-node-id",
      ghRepoOwner: "Ada",
      ghRepoName: "Created-App",
      defaultBranch: "main",
      visibility: "private",
    });

    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("vaultRepositorySummaries")
            .withIndex("by_vault", (q) => q.eq("vaultId", initialized.vaultId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      userId,
      vaultId: initialized.vaultId,
      refreshEligibleAt: 0,
      lifecycle: { state: "idle" },
      publication: { state: "unobserved" },
    });
  });

  it("rejects case-insensitive duplicate Samebase-managed repository targets", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
    });

    await t.mutation(internal.vault.records.createInitializingSamebaseManagedVaultForUser, {
      userId,
      ghRepoOwner: "Ada",
      ghRepoName: "Example-App",
      visibility: "private",
      convexProjectName: "example-app",
      cloudflareAccountId: "cloudflare-account",
      cloudflareWorkerName: "example-app",
    });

    await expect(
      t.mutation(internal.vault.records.createInitializingSamebaseManagedVaultForUser, {
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

  it("rejects case-insensitive duplicate existing repository targets with different ids", async () => {
    const t = makeConvexTest();
    const userId = await t.run(
      async (ctx) =>
        await ctx.db.insert("users", {
          name: "Ada",
          email: "ada@example.com",
          isApproved: true,
        }),
    );

    await t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
      userId,
      ghRepoId: "first-id",
      ghRepoOwner: "Ada",
      ghRepoName: "Example-App",
    });

    await expect(
      t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
        userId,
        ghRepoId: "different-id",
        ghRepoOwner: "ada",
        ghRepoName: "example-app",
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

  it("keeps a requested branch until the first complete inventory can validate it", async () => {
    const { asUser } = await createConnectedVaultForBranchResolution();

    await expect(
      asUser.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "ada/inventory",
        branch: "feature/new",
      }),
    ).resolves.toMatchObject({
      defaultBranch: "main",
      resolvedBranch: "feature/new",
      branchNotFound: false,
    });
  });

  it("uses the active inventory to resolve exact branches and reject missing branches", async () => {
    const { asUser, ids, t } = await createConnectedVaultForBranchResolution();
    const checks = {
      state: "success" as const,
      totalCount: 0,
      checkRunCount: 0,
      statusContextCount: 0,
      successCount: 0,
      failureCount: 0,
      runningCount: 0,
      neutralCount: 0,
      unknownCount: 0,
    };
    await t.run(async (ctx) => {
      const snapshotId = await ctx.db.insert("vaultRepositoryInventorySnapshots", {
        state: "ready",
        vaultId: ids.vaultId,
        branchCount: 2,
        pullRequestCount: 0,
        labelCount: 0,
        labelChunkCount: 0,
        labelFacetCount: 0,
        noLabelPullRequestCount: 0,
        repositoryNodeId: "R_inventory",
        repositoryFullName: "Ada/Inventory",
        defaultBranch: "trunk",
        fingerprint: "inventory",
        crawlCost: 1,
        summaryDefaultBranch: {
          state: "ready",
          name: "trunk",
          headSha: "trunk-sha",
          checkState: "none",
        },
      });
      const filterViewId = await ctx.db.insert("vaultRepositoryInventoryFilterViews", {
        state: "complete",
        vaultId: ids.vaultId,
        snapshotId,
        filterRevision: 0,
        totalPullRequestCount: 0,
        processedPullRequestCount: 0,
        visiblePullRequestCount: 0,
      });
      await ctx.db.insert("vaultRepositoryInventories", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        wantedUntil: 10,
        writeVersion: 1,
        lifecycle: { state: "idle" },
        publication: {
          snapshotId,
          filterViewId,
          filterRevision: 0,
          repositoryNodeId: "R_inventory",
          repositoryFullName: "Ada/Inventory",
          defaultBranch: "trunk",
          publishedAt: 10,
          checkedAt: 10,
          fingerprint: "inventory",
        },
      });
      await ctx.db.insert("vaultRepositoryInventoryItems", {
        kind: "branch",
        vaultId: ids.vaultId,
        snapshotId,
        sortGroup: 0,
        sortTime: 0,
        rowKey: "branch:trunk",
        name: "trunk",
        isDefault: true,
        comparison: { state: "ready", aheadBy: 0, behindBy: 0 },
        headCommit: {
          sha: "trunk-sha",
          checks,
        },
      });
      await ctx.db.insert("vaultRepositoryInventoryItems", {
        kind: "branch",
        vaultId: ids.vaultId,
        snapshotId,
        sortGroup: 2,
        sortTime: -10,
        rowKey: "branch:Feature/Case",
        name: "Feature/Case",
        isDefault: false,
        comparison: { state: "ready", aheadBy: 4, behindBy: 2 },
        headCommit: {
          sha: "feature-sha",
          checks,
        },
      });
    });

    await expect(
      asUser.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "ada/inventory",
        branch: "Feature/Case",
      }),
    ).resolves.toMatchObject({
      defaultBranch: "trunk",
      resolvedBranch: "Feature/Case",
      branchNotFound: false,
    });
    await expect(
      asUser.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "ada/inventory",
      }),
    ).resolves.toMatchObject({
      defaultBranch: "trunk",
      resolvedBranch: "trunk",
      branchNotFound: false,
    });
    await expect(
      asUser.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "ada/inventory",
        branch: "feature/case",
      }),
    ).resolves.toMatchObject({
      defaultBranch: "trunk",
      resolvedBranch: "trunk",
      branchNotFound: true,
    });
  });
});
