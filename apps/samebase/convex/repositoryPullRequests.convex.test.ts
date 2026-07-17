import { describe, expect, it } from "vite-plus/test";

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

async function insertUserAndConnectedVault() {
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
      repositoryFullName: "ada/observed",
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
      ghRepoId: "42",
      owner: "ada",
      name: "observed",
      defaultBranch: "main",
      visibility: "private",
      connectedAt: 4,
    });
    return { userId, vaultId };
  });
  return { t, ...ids };
}

describe("repository pull request actions", () => {
  it("reports the missing GitHub connection without making a provider request", async () => {
    const { t, userId, vaultId } = await insertUserAndConnectedVault();
    const asOwner = t.withIdentity({
      subject: `${userId}|owner-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(
      asOwner.action(api.repositoryPullRequests.listOpenPullRequests, {
        vaultId,
        cursor: null,
        pageSize: 25,
        filters: {
          hiddenLabels: [],
          includeDrafts: false,
          includeNoLabel: true,
        },
      }),
    ).resolves.toEqual({
      state: "provider_unavailable",
      reason: "github_connection_unavailable",
    });
    await expect(
      asOwner.action(api.repositoryCloudflareBuilds.observePullRequestHeads, {
        vaultId,
        heads: [],
      }),
    ).resolves.toEqual({
      state: "provider_unavailable",
      reason: "github_connection_unavailable",
    });
  });

  it("does not expose another user's vault through the provider action", async () => {
    const { t, vaultId } = await insertUserAndConnectedVault();
    const otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Grace",
        email: "grace@example.com",
        isApproved: true,
      });
    });
    const asOtherUser = t.withIdentity({
      subject: `${otherUserId}|other-session`,
      tokenIdentifier: `test:${otherUserId}`,
    });

    await expect(
      asOtherUser.action(api.repositoryPullRequests.listOpenPullRequests, {
        vaultId,
        cursor: null,
        pageSize: 25,
        filters: {
          hiddenLabels: [],
          includeDrafts: false,
          includeNoLabel: true,
        },
      }),
    ).rejects.toThrow("Vault not found");
    await expect(
      asOtherUser.action(api.repositoryCloudflareBuilds.observePullRequestHeads, {
        vaultId,
        heads: [],
      }),
    ).rejects.toThrow("Vault not found");
  });
});
