import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

async function createUser(name: string) {
  const t = makeConvexTest();
  const userId = await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        name,
        email: `${name.toLowerCase()}@example.com`,
        isApproved: true,
      }),
  );
  return { t, userId };
}

describe("repository connection memberships", () => {
  it("returns bounded memberships in input order across every retained vault state", async () => {
    const { t, userId } = await createUser("Ada");
    const otherUserId = await t.run(
      async (ctx) =>
        await ctx.db.insert("users", {
          name: "Grace",
          email: "grace@example.com",
          isApproved: true,
        }),
    );

    const connected = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        userId,
        ghRepoId: "101",
        ghRepoOwner: "Ada",
        ghRepoName: "connected",
      },
    );
    await t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
      userId,
      vaultId: connected.vaultId,
      runId: connected.runId,
      ghRepoId: "101",
      ghRepoNodeId: "R_101",
      ghRepoOwner: "Ada",
      ghRepoName: "connected",
      defaultBranch: "main",
      visibility: "public",
    });

    await t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
      userId,
      ghRepoId: "102",
      ghRepoOwner: "Ada",
      ghRepoName: "provisioning",
    });
    const failed = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        userId,
        ghRepoId: "103",
        ghRepoOwner: "Ada",
        ghRepoName: "failed",
      },
    );
    await t.mutation(internal.vault.records.markGithubProvisioningFailed, {
      runId: failed.runId,
    });

    const deleting = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        userId,
        ghRepoId: "104",
        ghRepoOwner: "Ada",
        ghRepoName: "deleting",
      },
    );
    await t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
      userId,
      vaultId: deleting.vaultId,
      runId: deleting.runId,
      ghRepoId: "104",
      ghRepoNodeId: "R_104",
      ghRepoOwner: "Ada",
      ghRepoName: "deleting",
      defaultBranch: "main",
      visibility: "public",
    });
    await t.run(async (ctx) => {
      const deletionRunId = await ctx.db.insert("vaultDeletionRuns", {
        userId,
        vaultId: deleting.vaultId,
        repositoryFullName: "Ada/deleting",
        createdAt: 1,
        updatedAt: 2,
        attempt: { kind: "initial" },
        state: "succeeded",
        workflow: { state: "started", workflowId: "completed-deletion" },
        currentStep: "finish",
        snapshot: { state: "scrubbed_after_success" },
        completedAt: 3,
      });
      await ctx.db.patch(deleting.vaultId, {
        deletion: { state: "deleting", runId: deletionRunId, requestedAt: 3 },
      });
    });

    const other = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        userId: otherUserId,
        ghRepoId: "105",
        ghRepoOwner: "Grace",
        ghRepoName: "private-to-grace",
      },
    );
    await t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
      userId: otherUserId,
      vaultId: other.vaultId,
      runId: other.runId,
      ghRepoId: "105",
      ghRepoNodeId: "R_105",
      ghRepoOwner: "Grace",
      ghRepoName: "private-to-grace",
      defaultBranch: "main",
      visibility: "private",
    });

    const asAda = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });
    await expect(
      asAda.query(api.vault.dashboard.getRepositoryConnectionMemberships, {
        repositories: [
          { githubRepositoryId: 999, repositoryFullName: "Ada/missing" },
          { githubRepositoryId: 103, repositoryFullName: "Ada/failed" },
          { githubRepositoryId: 101, repositoryFullName: "Ada/connected" },
          { githubRepositoryId: 102, repositoryFullName: "Ada/provisioning" },
          { githubRepositoryId: 104, repositoryFullName: "Ada/deleting" },
          { githubRepositoryId: 105, repositoryFullName: "Grace/private-to-grace" },
        ],
      }),
    ).resolves.toEqual([
      { repositoryFullName: "Ada/missing", connected: false },
      { repositoryFullName: "Ada/failed", connected: true },
      { repositoryFullName: "Ada/connected", connected: true },
      { repositoryFullName: "Ada/provisioning", connected: true },
      { repositoryFullName: "Ada/deleting", connected: true },
      { repositoryFullName: "Grace/private-to-grace", connected: false },
    ]);
    await expect(
      asAda.query(api.vault.dashboard.getRepositoryConnectionMemberships, {
        repositories: [{ githubRepositoryId: null, repositoryFullName: "aDA/ConNeCtEd" }],
      }),
    ).resolves.toEqual([{ repositoryFullName: "aDA/ConNeCtEd", connected: true }]);
  });

  it("rejects more than 25 repository identities", async () => {
    const { t, userId } = await createUser("Ada");
    const asAda = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(
      asAda.query(api.vault.dashboard.getRepositoryConnectionMemberships, {
        repositories: Array.from({ length: 26 }, (_, index) => ({
          githubRepositoryId: index + 1,
          repositoryFullName: `Ada/repository-${index + 1}`,
        })),
      }),
    ).rejects.toThrow("At most 25 repository memberships can be checked at once.");
  });

  it("rejects duplicate stable ids and repository names", async () => {
    const { t, userId } = await createUser("Ada");
    const asAda = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(
      asAda.query(api.vault.dashboard.getRepositoryConnectionMemberships, {
        repositories: [
          { githubRepositoryId: 101, repositoryFullName: "Ada/first-name" },
          { githubRepositoryId: 101, repositoryFullName: "Ada/renamed" },
        ],
      }),
    ).rejects.toThrow("Repository membership inputs must be unique.");
    await expect(
      asAda.query(api.vault.dashboard.getRepositoryConnectionMemberships, {
        repositories: [
          { githubRepositoryId: null, repositoryFullName: "Ada/same-name" },
          { githubRepositoryId: 102, repositoryFullName: "ada/SAME-NAME" },
        ],
      }),
    ).rejects.toThrow("Repository membership inputs must be unique.");
  });
});
