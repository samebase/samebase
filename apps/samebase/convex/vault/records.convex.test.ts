/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
import schema from "../schema";

const modules = import.meta.glob([
  "../**/*.ts",
  "../_generated/*.js",
  "!../**/*.test.ts",
  "!../**/*.convex.test.ts",
  "!../**/*.generated.ts",
  "!../test.setup.ts",
]);

describe("vault records Convex contract", () => {
  it("rolls back managed app admission when Workflow start fails", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {});
      await ctx.db.insert("organizationMemberships", { organizationId, userId });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      return userId;
    });

    await expect(
      t.mutation(internal.vault.records.createInitializingSamebaseManagedVaultForUser, {
        userId,
        ghRepoOwner: "Ada",
        ghRepoName: "Failed-App",
        visibility: "private",
        description: null,
        convexProjectName: "failed-app",
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        cloudflareWorkerName: "failed-app",
      }),
    ).rejects.toThrow();

    await expect(
      t.run(async (ctx) => ({
        vaults: await ctx.db.query("vaults").collect(),
        runs: await ctx.db.query("workflow_vaultProvisioning_runs").collect(),
        locks: await ctx.db.query("workflow_vaultProvisioning_writeLocks").collect(),
        plans: await ctx.db.query("workflow_vaultProvisioning_plans").collect(),
      })),
    ).resolves.toEqual({
      vaults: [],
      runs: [],
      locks: [],
      plans: [],
    });
  });

  it("defaults connection resource links open for new vaults", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {});
      await ctx.db.insert("organizationMemberships", { organizationId, userId });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      return { organizationId, userId };
    });

    const existingRepository = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        userId: ids.userId,
        ghRepoOwner: "Ada",
        ghRepoName: "Existing-App",
      },
    );
    const samebaseManaged = await t.mutation(
      internal.vault.records.createInitializingSamebaseManagedVaultForUser,
      {
        userId: ids.userId,
        ghRepoOwner: "Ada",
        ghRepoName: "Created-App",
        visibility: "private",
        description: null,
        convexProjectName: "created-app",
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        cloudflareWorkerName: "created-app",
      },
    );
    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    await expect(
      t.run(async (ctx) => await ctx.db.get(samebaseManaged.runId)),
    ).resolves.toMatchObject({
      requestedByUserId: ids.userId,
      workflowId: expect.any(String),
    });
    await expect(
      t.run(async (ctx) =>
        Promise.all([
          ctx.db.get(existingRepository.vaultId),
          ctx.db.get(samebaseManaged.vaultId),
          ctx.db.get(existingRepository.runId),
        ]),
      ),
    ).resolves.toEqual([
      expect.objectContaining({ organizationId: ids.organizationId, userId: ids.userId }),
      expect.objectContaining({ organizationId: ids.organizationId, userId: ids.userId }),
      expect.objectContaining({ requestedByUserId: ids.userId, userId: ids.userId }),
    ]);
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
    await expect(
      t.run(async (ctx) => {
        return await ctx.db
          .query("workflow_vaultProvisioning_writeLocks")
          .withIndex("by_vault", (q) => q.eq("vaultId", samebaseManaged.vaultId))
          .unique();
      }),
    ).resolves.toMatchObject({
      owner: { kind: "managed_run", runId: samebaseManaged.runId },
      state: "active",
      lastWriteAt: {},
    });
    await expect(
      t.run(async (ctx) => {
        return await ctx.db
          .query("workflow_vaultProvisioning_plans")
          .withIndex("by_vault", (q) => q.eq("vaultId", samebaseManaged.vaultId))
          .unique();
      }),
    ).resolves.toMatchObject({
      convex: {
        state: "planned",
        projectName: "created-app",
        teamId: "convex-team",
      },
      cloudflare: {
        state: "planned",
        accountId: "cloudflare-account",
        workerName: "created-app",
        rootDirectory: "/",
      },
    });
    await expect(
      t.run(async (ctx) => {
        return await ctx.db
          .query("workflow_vaultProvisioning_writeLocks")
          .withIndex("by_vault", (q) => q.eq("vaultId", existingRepository.vaultId))
          .unique();
      }),
    ).resolves.toBeNull();
  });

  it("rejects a new vault when the user has no exact organization membership", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
    });

    await expect(
      t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
        userId,
        ghRepoOwner: "Ada",
        ghRepoName: "Missing-Organization",
      }),
    ).rejects.toThrow("Organization membership is required.");
    await expect(t.run(async (ctx) => await ctx.db.query("vaults").collect())).resolves.toEqual([]);
  });

  it("fails closed above the accepted Phase 1 organization membership count", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", {});
      const userIds = [];
      for (const email of ["one@example.com", "two@example.com", "three@example.com"]) {
        const userId = await ctx.db.insert("users", { email, isApproved: true });
        await ctx.db.insert("organizationMemberships", { organizationId, userId });
        userIds.push(userId);
      }
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      const userId = userIds[0];
      if (!userId) {
        throw new Error("Expected a user fixture.");
      }
      return userId;
    });

    await expect(
      t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
        userId,
        ghRepoOwner: "Ada",
        ghRepoName: "Too-Many-Members",
      }),
    ).rejects.toThrow("Phase 1 repository uniqueness supports at most two organization members.");
  });

  it("rejects case-insensitive duplicate Samebase-managed repository targets", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const otherUserId = await ctx.db.insert("users", {
        name: "Grace",
        email: "grace@example.com",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {});
      await ctx.db.insert("organizationMemberships", { organizationId, userId });
      await ctx.db.insert("organizationMemberships", { organizationId, userId: otherUserId });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      return { otherUserId, userId };
    });

    const existing = await t.mutation(
      internal.vault.records.createInitializingSamebaseManagedVaultForUser,
      {
        userId: ids.userId,
        ghRepoOwner: "Ada",
        ghRepoName: "Example-App",
        visibility: "private",
        description: null,
        convexProjectName: "example-app",
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        cloudflareWorkerName: "example-app",
      },
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(existing.vaultId, { organizationId: undefined });
    });

    await expect(
      t.mutation(internal.vault.records.createInitializingSamebaseManagedVaultForUser, {
        userId: ids.otherUserId,
        ghRepoOwner: " ada ",
        ghRepoName: " example-app ",
        visibility: "private",
        description: null,
        convexProjectName: "example-app-2",
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        cloudflareWorkerName: "example-app-2",
      }),
    ).rejects.toThrow("Vault already exists for this repository.");
  });

  it("rejects a duplicate GitHub repository ID from a same-organization legacy vault", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const firstUserId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const secondUserId = await ctx.db.insert("users", {
        name: "Grace",
        email: "grace@example.com",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {});
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: firstUserId,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: secondUserId,
      });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      const legacyVaultId = await ctx.db.insert("vaults", {
        userId: firstUserId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const legacyRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: firstUserId,
        vaultId: legacyVaultId,
        repositoryFullName: "ada/legacy",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 2,
      });
      await ctx.db.replace(legacyVaultId, {
        userId: firstUserId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId: legacyRunId,
        ghRepoId: "shared-github-repository",
        owner: "ada",
        name: "legacy",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 3,
      });
      return { secondUserId };
    });
    const target = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        userId: ids.secondUserId,
        ghRepoOwner: "grace",
        ghRepoName: "new-target",
      },
    );

    await expect(
      t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
        vaultId: target.vaultId,
        runId: target.runId,
        userId: ids.secondUserId,
        ghRepoId: "shared-github-repository",
        ghRepoOwner: "ada",
        ghRepoName: "legacy",
        defaultBranch: "main",
        visibility: "private",
      }),
    ).rejects.toThrow("Vault already exists for this GitHub repository.");
  });

  it("rejects malformed repository full names with extra path segments", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada",
        email: "nicu@samebase.com",
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
      const firstFailedRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
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
      const secondFailedRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
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
      const connectedRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
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

  it("keeps an explicit branch independent from the cached branch catalog", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "nicu@samebase.com",
        isApproved: true,
      });
      const otherUserId = await ctx.db.insert("users", {
        name: "Grace",
        email: "nicuchiciuc@gmail.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId,
        vaultId,
        repositoryFullName: "ada/exact-branch",
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
        owner: "ada",
        name: "exact-branch",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 4,
      });
      await ctx.db.insert("observations_vaultRepository_branchTrees", {
        vaultId,
        branch: "main",
        commitSHA: "main-commit",
        treeData: {
          sha: "main-tree",
          truncated: false,
          tree: [],
        },
        lastTreeRefreshAt: 5,
      });
      return { userId, otherUserId, vaultId };
    });
    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const unhydratedBranch = await asUser.query(api.vault.records.getVaultByRepository, {
      repositoryFullName: "ada/exact-branch",
      branch: "feature/pr",
    });
    expect(unhydratedBranch).toMatchObject({
      resolvedBranch: "feature/pr",
      branchTreeState: "unhydrated",
    });
    expect(unhydratedBranch).not.toHaveProperty("treeSHA");
    expect(unhydratedBranch).not.toHaveProperty("treeData");

    await t.mutation(internal.vault.branches.upsertVaultBranchTree, {
      vaultId: ids.vaultId,
      branch: "feature/pr",
      commitSHA: "feature-commit",
      treeData: {
        sha: "feature-tree",
        truncated: false,
        tree: [],
      },
    });
    await expect(
      asUser.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "ada/exact-branch",
        branch: "feature/pr",
      }),
    ).resolves.toMatchObject({
      resolvedBranch: "feature/pr",
      branchTreeState: "ready",
      treeSHA: "feature-tree",
      commitSHA: "feature-commit",
    });
    await expect(
      asUser.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "ada/exact-branch",
      }),
    ).resolves.toMatchObject({
      resolvedBranch: "main",
      branchTreeState: "ready",
      treeSHA: "main-tree",
    });

    const asOtherUser = t.withIdentity({
      subject: `${ids.otherUserId}|other-session`,
      tokenIdentifier: `test:${ids.otherUserId}`,
    });
    await expect(
      asOtherUser.query(api.vault.records.getVaultByRepository, {
        repositoryFullName: "ada/exact-branch",
        branch: "feature/pr",
      }),
    ).resolves.toBeNull();
  });
});
