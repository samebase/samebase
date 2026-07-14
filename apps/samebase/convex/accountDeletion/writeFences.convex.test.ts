import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
import { INITIAL_ACCOUNT_DELETION_DATA_PROGRESS } from "./model";

async function seedDeletingUserWithConnectedVault() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "deleting@example.com",
      isApproved: true,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const provisioningRunId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "owner/repository",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 2,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId: provisioningRunId,
      ghRepoId: "repository-id",
      owner: "owner",
      name: "repository",
      defaultBranch: "main",
      visibility: "private",
      connectedAt: 2,
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60_000,
    });
    const deletionRunId = await ctx.db.insert("accountDeletionRuns", {
      identity: { state: "active", userId, email: "deleting@example.com" },
      completionCapability: "write-fence-test",
      state: "running",
      workflow: { state: "started", workflowId: "deletion-workflow", attempt: 1 },
      currentStep: "request_accepted",
      requestedAt: 3,
      updatedAt: 3,
      initiatingSessionId: sessionId,
      retryCount: 0,
      outcomes: {
        billing: { state: "not_started" },
        providerRevocation: { state: "not_started" },
        completionEmail: { state: "not_started" },
      },
      dataDeletion: INITIAL_ACCOUNT_DELETION_DATA_PROGRESS,
    });
    await ctx.db.patch(userId, {
      accountDeletion: {
        state: "deleting",
        runId: deletionRunId,
        requestedAt: 3,
      },
    });
    return { userId, vaultId, provisioningRunId };
  });
  return { ids, t };
}

describe("account deletion late-write fences", () => {
  it("rejects late vault, vault deletion, staging, and OAuth writes", async () => {
    const { ids, t } = await seedDeletingUserWithConnectedVault();
    const accountDeletionError = "Account deletion is in progress.";

    await expect(
      t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
        userId: ids.userId,
        ghRepoOwner: "Ada",
        ghRepoName: "Late-App",
      }),
    ).rejects.toThrow(accountDeletionError);
    await expect(
      t.mutation(internal.vault.deletion.runs.createInitialRun, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        options: {
          removeCodespaces: false,
          removeGithubRepo: false,
          removeConvexProvision: false,
          removeCloudflareProvision: false,
        },
      }),
    ).rejects.toThrow(accountDeletionError);
    await expect(
      t.mutation(internal.fileStaging.duplicateBranchStaging, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        sourceBranch: "main",
        targetBranch: "draft",
        stagedFiles: [],
      }),
    ).rejects.toThrow(accountDeletionError);
    await expect(
      t.mutation(internal.oauthState.createOauthState, {
        provider: "cloudflare_mcp",
        userId: ids.userId,
        state: "late-oauth-state",
        createdAt: 1,
        expiresAt: 2,
      }),
    ).rejects.toThrow(accountDeletionError);
  });

  it("rejects a provisioning run created by in-flight provider work", async () => {
    const { ids, t } = await seedDeletingUserWithConnectedVault();

    await expect(
      t.mutation(internal.appProvisioning.runs.createForVault, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        trigger: "retry",
      }),
    ).rejects.toThrow("App provisioning is unavailable during account deletion.");
    await t.run(async (ctx) => {
      expect(await ctx.db.query("appProvisioningRuns").collect()).toHaveLength(1);
    });
  });

  it("rejects refresh demand created by in-flight setup work", async () => {
    const { ids, t } = await seedDeletingUserWithConnectedVault();

    await expect(
      t.mutation(internal.repositoryRefresh.enqueueSourceSetupRepositoryRefresh, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: ids.provisioningRunId,
      }),
    ).rejects.toThrow("Repository refresh is unavailable during account deletion.");
    await t.run(async (ctx) => {
      expect(await ctx.db.query("repositoryRefreshRequests").collect()).toEqual([]);
    });
  });
});
