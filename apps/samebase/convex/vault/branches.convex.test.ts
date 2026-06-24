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
