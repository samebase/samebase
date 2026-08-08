import { describe, expect, it } from "vite-plus/test";

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("refreshRepositoryTree authorization", () => {
  it("rejects another organization's cached vault before returning ready", async () => {
    const t = makeConvexTest();
    const { outsiderId, vaultId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        email: "tree-owner@example.invalid",
        isApproved: true,
      });
      const outsiderId = await ctx.db.insert("users", {
        email: "tree-outsider@example.invalid",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubInstallationId: "1001",
        githubOwnerId: "101",
        githubOwnerLogin: "tree-owner",
        githubOwnerLoginNormalized: "tree-owner",
        githubOwnerType: "organization",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: ownerId,
        role: "owner",
      });
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ownerId,
        vaultId,
        repositoryFullName: "tree-owner/repository",
        trigger: "connect_existing_repository",
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
        githubMode: "connect_existing_repository",
        runId,
        ghRepoId: "10001",
        name: "repository",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 4,
      });
      await ctx.db.insert("observations_vaultRepository_branchTrees", {
        vaultId,
        branch: "main",
        commitSHA: "commit-sha",
        treeData: { sha: "tree-sha", truncated: false, tree: [] },
        lastTreeRefreshAt: Date.now(),
      });
      return { outsiderId, vaultId };
    });
    const asOutsider = t.withIdentity({
      subject: `${outsiderId}|tree-outsider`,
      tokenIdentifier: `test:${outsiderId}`,
    });

    await expect(
      asOutsider.action(api.github.refreshRepositoryTree, {
        vaultId,
        branch: "main",
        intent: "passive",
      }),
    ).rejects.toThrow("Vault not found.");
  });

  it("rejects an authorized non-live vault before returning a cached result", async () => {
    const t = makeConvexTest();
    const { userId, vaultId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "tree-member@example.invalid",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubInstallationId: "2002",
        githubOwnerId: "202",
        githubOwnerLogin: "tree-member",
        githubOwnerLoginNormalized: "tree-member",
        githubOwnerType: "organization",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
        role: "owner",
      });
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      await ctx.db.insert("observations_vaultRepository_branchTrees", {
        vaultId,
        branch: "main",
        commitSHA: "commit-sha",
        treeData: { sha: "tree-sha", truncated: false, tree: [] },
        lastTreeRefreshAt: Date.now(),
      });
      return { userId, vaultId };
    });
    const asMember = t.withIdentity({
      subject: `${userId}|tree-member`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(
      asMember.action(api.github.refreshRepositoryTree, {
        vaultId,
        branch: "main",
        intent: "passive",
      }),
    ).rejects.toThrow("Vault not found.");
  });
});
