import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

describe("vault branch mutations", () => {
  it("returns branch-head commit checks for branches without PRs", async () => {
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
        repositoryFullName: "ada/branch-checks",
        trigger: "create",
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
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "branch-checks",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 4,
      });
      return { userId, vaultId };
    });

    await t.mutation(internal.vault.branches.syncVaultRemoteBranches, {
      vaultId: ids.vaultId,
      syncedAt: 10,
      branches: [
        {
          name: "main",
          headCommitSha: "abc123",
          lastCommitAt: 8,
          aheadBy: 0,
          behindBy: 0,
          aheadBehindState: "resolved",
          pullRequestState: "resolved",
          isDefault: true,
          isProtected: true,
        },
        {
          name: "feature/no-pr",
          headCommitSha: "abc123",
          lastCommitAt: 8,
          aheadBy: 0,
          behindBy: 0,
          aheadBehindState: "resolved",
          pullRequestState: "resolved",
          isDefault: false,
          isProtected: false,
        },
      ],
    });
    await t.mutation(internal.commitChecks.replaceGitHubCommitCheckSnapshot, {
      githubRepositoryId: "123",
      commitSha: "abc123",
      syncedAt: 20,
      items: [
        {
          source: "check_run",
          sourceKey: "101",
          name: "supply-chain",
          providerName: "GitHub Actions",
          state: "success",
          status: "completed",
          conclusion: "success",
          targetUrl: "https://github.com/ada/branch-checks/actions/runs/101",
          githubUrl: "https://github.com/ada/branch-checks/actions/runs/101",
          completedAt: 19,
          updatedAt: 19,
        },
      ],
    });
    await t.mutation(internal.commitChecks.replaceGitHubCommitCheckSnapshot, {
      githubRepositoryId: "123",
      commitSha: "stale456",
      syncedAt: 20,
      items: [
        {
          source: "check_run",
          sourceKey: "102",
          name: "old-tip",
          state: "success",
          status: "completed",
        },
      ],
    });
    await t.mutation(internal.vault.branches.syncVaultRemoteBranches, {
      vaultId: ids.vaultId,
      syncedAt: 30,
      branches: [
        {
          name: "main",
          headCommitSha: "abc123",
          lastCommitAt: 8,
          aheadBy: 0,
          behindBy: 0,
          aheadBehindState: "resolved",
          pullRequestState: "resolved",
          isDefault: true,
          isProtected: true,
        },
        {
          name: "feature/no-pr",
          headCommitSha: "abc123",
          lastCommitAt: 8,
          aheadBy: 0,
          behindBy: 0,
          aheadBehindState: "resolved",
          pullRequestState: "resolved",
          isDefault: false,
          isProtected: false,
        },
      ],
    });
    await t.mutation(internal.vault.branches.syncVaultBranchPreviewDomainFromCheckSnapshot, {
      vaultId: ids.vaultId,
      branchName: "feature/no-pr",
      previewUrl: "https://feature-no-pr.example.workers.dev",
      syncedAt: 40,
    });

    const asOwner = t.withIdentity({
      subject: `${ids.userId}|owner-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });
    const branches = await asOwner.query(api.vault.branches.getVaultRemoteBranches, {
      vaultId: ids.vaultId,
    });

    expect(branches).toMatchObject([
      {
        name: "main",
        commits: [
          {
            sha: "abc123",
            authoredAt: 8,
            checks: {
              state: "success",
              totalCount: 1,
              checkRunCount: 1,
              statusContextCount: 0,
              successCount: 1,
              primaryTargetUrl: "https://github.com/ada/branch-checks/actions/runs/101",
              primaryLogUrl: "https://github.com/ada/branch-checks/actions/runs/101",
              syncedAt: 20,
            },
          },
        ],
      },
      {
        name: "feature/no-pr",
        previewUrl: "https://feature-no-pr.example.workers.dev",
        commits: [
          {
            sha: "abc123",
            checks: {
              state: "success",
              totalCount: 1,
              primaryTargetUrl: "https://github.com/ada/branch-checks/actions/runs/101",
            },
          },
        ],
      },
    ]);
    expect(branches[0]?.pullRequestNumber).toBeUndefined();
    expect(branches[1]?.pullRequestNumber).toBeUndefined();
    await t.mutation(internal.vault.branches.syncVaultBranchPreviewDomainFromCheckSnapshot, {
      vaultId: ids.vaultId,
      branchName: "feature/no-pr",
      syncedAt: 50,
    });
    const branchesAfterMissingPreview = await asOwner.query(
      api.vault.branches.getVaultRemoteBranches,
      {
        vaultId: ids.vaultId,
      },
    );
    expect(branchesAfterMissingPreview[1]?.previewUrl).toBeUndefined();
    await expect(
      t.run(async (ctx) => {
        const staleSnapshot = await ctx.db
          .query("githubCommitCheckSnapshots")
          .withIndex("by_githubRepositoryId_and_commitSha", (q) =>
            q.eq("githubRepositoryId", "123").eq("commitSha", "stale456"),
          )
          .first();
        const staleItems = await ctx.db
          .query("githubCommitCheckItems")
          .withIndex("by_githubRepositoryId_and_commitSha", (q) =>
            q.eq("githubRepositoryId", "123").eq("commitSha", "stale456"),
          )
          .collect();
        return {
          staleSnapshot,
          staleItemCount: staleItems.length,
        };
      }),
    ).resolves.toEqual({
      staleSnapshot: null,
      staleItemCount: 0,
    });
  });

  it("writes and backfills indexable branch sort fields", async () => {
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
        repositoryFullName: "ada/branch-sort-fields",
        trigger: "create",
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
        githubMode: "create_repository",
        runId,
        ghRepoId: "456",
        owner: "ada",
        name: "branch-sort-fields",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 4,
      });
      const legacyBranchId = await ctx.db.insert("vaultRemoteBranches", {
        vaultId,
        name: "legacy",
        headCommitSha: "legacy-sha",
        lastCommitAt: 50,
        isDefault: false,
        isProtected: false,
        remoteState: "active",
        lastSyncedAt: 5,
      });
      return { userId, vaultId, legacyBranchId };
    });

    await expect(
      t.query(internal.vault.branches.checkVaultRemoteBranchSortFieldsBackfill, {
        batchSize: 10,
      }),
    ).resolves.toMatchObject({
      scanned: 1,
      missingBranchIds: [ids.legacyBranchId],
      isDone: true,
    });
    await expect(
      t.mutation(internal.vault.branches.backfillVaultRemoteBranchSortFieldsBatch, {
        batchSize: 10,
        dryRun: true,
      }),
    ).resolves.toMatchObject({
      scanned: 1,
      patched: 1,
      isDone: true,
      dryRun: true,
    });
    await expect(
      t.run(async (ctx) => {
        const branch = await ctx.db.get(ids.legacyBranchId);
        return branch?.defaultRank;
      }),
    ).resolves.toBeNull();
    await expect(
      t.mutation(internal.vault.branches.backfillVaultRemoteBranchSortFieldsBatch, {
        batchSize: 10,
      }),
    ).resolves.toMatchObject({
      scanned: 1,
      patched: 1,
      isDone: true,
      dryRun: false,
    });
    await expect(
      t.run(async (ctx) => {
        const branch = await ctx.db.get(ids.legacyBranchId);
        return {
          defaultRank: branch?.defaultRank,
          stateRank: branch?.stateRank,
          commitRank: branch?.commitRank,
        };
      }),
    ).resolves.toEqual({
      defaultRank: 1,
      stateRank: 0,
      commitRank: -50,
    });

    await t.mutation(internal.vault.branches.syncVaultRemoteBranches, {
      vaultId: ids.vaultId,
      syncedAt: 20,
      branches: [
        {
          name: "legacy",
          headCommitSha: "legacy-sha",
          aheadBehindState: "preserve",
          pullRequestState: "preserve",
          isDefault: false,
          isProtected: false,
        },
        {
          name: "main",
          headCommitSha: "main-sha",
          lastCommitAt: 100,
          aheadBehindState: "unavailable",
          pullRequestState: "preserve",
          isDefault: true,
          isProtected: true,
        },
        {
          name: "feature/no-commit",
          headCommitSha: "feature-sha",
          aheadBehindState: "unavailable",
          pullRequestState: "preserve",
          isDefault: false,
          isProtected: false,
        },
      ],
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("fileStaging", {
        ownerId: ids.userId,
        vaultId: ids.vaultId,
        fileDeleted: false,
        filePath: "README.md",
        initialFilePath: "README.md",
        content: "changed",
        initialContent: "original",
        parentCommitSha: "feature-sha",
        lastEditTime: 21,
        lastEditUserId: ids.userId,
        branch: "feature/no-commit",
        version: 1,
      });
    });
    await t.mutation(internal.vault.branches.syncVaultRemoteBranches, {
      vaultId: ids.vaultId,
      syncedAt: 30,
      branches: [
        {
          name: "legacy",
          headCommitSha: "legacy-sha",
          aheadBehindState: "preserve",
          pullRequestState: "preserve",
          isDefault: false,
          isProtected: false,
        },
        {
          name: "main",
          headCommitSha: "main-sha",
          aheadBehindState: "unavailable",
          pullRequestState: "preserve",
          isDefault: true,
          isProtected: true,
        },
      ],
    });

    await expect(
      t.run(async (ctx) => {
        const branches = await ctx.db
          .query("vaultRemoteBranches")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .collect();
        return branches
          .map((branch) => ({
            name: branch.name,
            remoteState: branch.remoteState,
            defaultRank: branch.defaultRank,
            stateRank: branch.stateRank,
            commitRank: branch.commitRank,
          }))
          .sort((left, right) => left.name.localeCompare(right.name));
      }),
    ).resolves.toEqual([
      {
        name: "feature/no-commit",
        remoteState: "deleted_upstream",
        defaultRank: 1,
        stateRank: 1,
        commitRank: Number.MAX_SAFE_INTEGER,
      },
      {
        name: "legacy",
        remoteState: "active",
        defaultRank: 1,
        stateRank: 0,
        commitRank: -50,
      },
      {
        name: "main",
        remoteState: "active",
        defaultRank: 0,
        stateRank: 0,
        commitRank: -100,
      },
    ]);
  });

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
