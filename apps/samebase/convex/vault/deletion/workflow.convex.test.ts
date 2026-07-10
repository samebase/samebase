import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../../_generated/api";
import { makeConvexTest } from "../../test.setup";
import { VAULT_LOCAL_CLEANUP_BATCH_SIZE } from "./cleanup";

describe("vault deletion workflow", () => {
  async function createConnectedVault() {
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
        repositoryFullName: "ada/delete-me",
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
        name: "delete-me",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 4,
      });
      await ctx.db.insert("vaultBranchTrees", {
        vaultId,
        branch: "main",
        treeSHA: "tree",
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [],
        },
        lastTreeRefreshAt: 5,
      });

      return { userId, vaultId };
    });

    return { ids, t };
  }

  it("queues a durable run and gate before scheduled workflow work", async () => {
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
        repositoryFullName: "ada/delete-me",
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
        name: "delete-me",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 4,
      });
      await ctx.db.insert("vaultBranchTrees", {
        vaultId,
        branch: "main",
        treeSHA: "tree",
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [],
        },
        lastTreeRefreshAt: 5,
      });

      return { userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });
    const { deletionRunId } = await asUser.action(api.vault.actions.deleteVault, {
      vaultId: ids.vaultId,
      removeCodespaces: false,
      removeGithubRepo: false,
      removeConvexProvision: false,
      removeCloudflareProvision: false,
    });

    const queued = await t.run(async (ctx) => {
      return {
        run: await ctx.db.get(deletionRunId),
        vault: await ctx.db.get(ids.vaultId),
        events: await ctx.db
          .query("vaultDeletionEvents")
          .withIndex("by_run_and_created_at", (q) => q.eq("runId", deletionRunId))
          .collect(),
      };
    });

    expect(queued.vault?.deletion).toMatchObject({
      state: "deleting",
      runId: deletionRunId,
    });
    expect(queued.run).toMatchObject({
      state: "running",
      repositoryFullName: "ada/delete-me",
      snapshot: {
        state: "retained_for_retry",
        plan: {
          target: {
            kind: "samebase_managed_repository",
            ghRepoId: "123",
          },
          githubRepository: {
            action: "skip",
            reason: "not_requested",
          },
        },
      },
    });
    expect(queued.events.map((event) => event.step)).toContain("initialize_deletion");

    expect(queued.vault).toMatchObject({ _id: ids.vaultId });
  });

  it("plans Cloudflare cleanup from Worker origin for connected repository vaults", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "cloudflare",
        userId,
        auth: {
          method: "api_key",
          credential: "test-cloudflare-api-key",
        },
        defaultAccount: {
          state: "selected",
          accountId: "cloudflare-account",
          accountName: "Cloudflare Account",
        },
        createdAt: 1,
        updatedAt: 2,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/existing-repo",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 3,
        updatedAt: 4,
        completedAt: 5,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "existing-repo",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 8,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        userId,
        appRoot: ".",
        accountId: "cloudflare-account",
        workerName: "existing-repo-worker",
        workerTag: "worker-tag",
        origin: "provisioned",
        deployment: {
          builds: { state: "not_connected" },
          convexBuildAccess: { state: "not_wired" },
        },
        connectedAt: 6,
        lastObservedAt: 7,
      });

      return { userId, vaultId };
    });

    const { deletionRunId } = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      userId: ids.userId,
      vaultId: ids.vaultId,
      options: {
        removeCodespaces: false,
        removeGithubRepo: false,
        removeConvexProvision: false,
        removeCloudflareProvision: true,
      },
    });

    const run = await t.run(async (ctx) => await ctx.db.get(deletionRunId));

    expect(run?.snapshot.state).toBe("retained_for_retry");
    if (run?.snapshot.state !== "retained_for_retry") {
      throw new Error("Deletion run did not retain a retry plan.");
    }
    expect(run.snapshot.plan).toMatchObject({
      target: {
        kind: "existing_repository",
      },
      cloudflare: {
        action: "delete_worker",
        accountId: "cloudflare-account",
        workerName: "existing-repo-worker",
        workerTag: "worker-tag",
      },
    });
  });

  it("returns dashboard deletion state and closes live repository lookups", async () => {
    const { ids, t } = await createConnectedVault();
    const { deletionRunId } = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      userId: ids.userId,
      vaultId: ids.vaultId,
      options: {
        removeCodespaces: false,
        removeGithubRepo: false,
        removeConvexProvision: false,
        removeCloudflareProvision: false,
      },
    });
    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const [vaults, liveRepositoryVault] = await Promise.all([
      asUser.query(api.vault.dashboard.getUserVaults),
      t.query(internal.vault.records.getByRepositoryFullName, {
        userId: ids.userId,
        repositoryFullName: "ada/delete-me",
      }),
    ]);

    expect(liveRepositoryVault).toBeNull();
    expect(vaults).toHaveLength(1);
    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      repositoryFullName: "ada/delete-me",
      deletion: {
        state: "deleting",
        runId: deletionRunId,
        currentStep: "initialize_deletion",
        message: "Queued vault deletion.",
      },
    });
  });

  it("blocks branch refresh writes after deletion starts", async () => {
    const { ids, t } = await createConnectedVault();
    await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      userId: ids.userId,
      vaultId: ids.vaultId,
      options: {
        removeCodespaces: false,
        removeGithubRepo: false,
        removeConvexProvision: false,
        removeCloudflareProvision: false,
      },
    });

    const claim = await t.mutation(internal.vault.branches.claimTreeRefresh, {
      vaultId: ids.vaultId,
      force: true,
    });
    await t.mutation(internal.vault.branches.syncVaultRemoteBranches, {
      vaultId: ids.vaultId,
      syncedAt: 10,
      branches: [
        {
          name: "main",
          headCommitSha: "abc",
          aheadBehindState: "unavailable",
          pullRequestState: "preserve",
          isDefault: true,
          isProtected: false,
        },
      ],
    });
    const remoteBranches = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultRemoteBranches")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
    });

    expect(claim).toEqual({ claimed: false });
    expect(remoteBranches).toHaveLength(0);
  });

  it("returns the dashboard delete disabled reason while source setup runs", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
    });
    await t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
      userId,
      ghRepoOwner: "ada",
      ghRepoName: "existing-app",
    });
    const asUser = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });

    const vaults = await asUser.query(api.vault.dashboard.getUserVaults);

    expect(vaults).toHaveLength(1);
    expect(vaults[0]).toMatchObject({
      repositoryFullName: "ada/existing-app",
      deletion: {
        state: "not_deleting",
        deleteAction: {
          state: "disabled",
          reason: "Vault source setup is still running.",
        },
      },
    });
  });

  it("finishes local cleanup through workflow cleanup batches", async () => {
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
        repositoryFullName: "ada/delete-me",
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
        name: "delete-me",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 4,
      });
      for (let index = 0; index < VAULT_LOCAL_CLEANUP_BATCH_SIZE + 1; index += 1) {
        await ctx.db.insert("vaultBranchTrees", {
          vaultId,
          branch: `branch-${index}`,
          treeSHA: `tree-${index}`,
          treeData: {
            sha: `tree-${index}`,
            truncated: false,
            tree: [],
          },
          lastTreeRefreshAt: 5 + index,
        });
      }
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        userId,
        appRoot: ".",
        accountId: "cloudflare-account",
        workerName: "delete-me-worker",
        workerTag: "worker-tag",
        origin: "provisioned",
        deployment: {
          builds: { state: "not_connected" },
          convexBuildAccess: { state: "not_wired" },
        },
        connectedAt: 6,
        lastObservedAt: 7,
      });

      return { userId, vaultId };
    });
    const { deletionRunId } = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      userId: ids.userId,
      vaultId: ids.vaultId,
      options: {
        removeCodespaces: false,
        removeGithubRepo: false,
        removeConvexProvision: false,
        removeCloudflareProvision: false,
      },
    });
    await t.mutation(internal.vault.deletion.runs.markWorkflowStarted, {
      runId: deletionRunId,
      workflowId: "workflow-test",
    });
    await t.mutation(internal.vault.deletion.runs.claimWorkflowRun, {
      runId: deletionRunId,
      vaultId: ids.vaultId,
      userId: ids.userId,
    });
    let sourceCleanupBatches = 0;
    for (const step of [
      "cleanup_editor_state",
      "cleanup_source_caches",
      "cleanup_runtime_state",
      "cleanup_access_state",
      "detach_agent_context",
      "cleanup_provisioning_history",
    ] as const) {
      await t.mutation(internal.vault.deletion.runs.appendRunEvent, {
        runId: deletionRunId,
        step,
        level: "info",
        message: "Cleaning vault data.",
        state: "running",
      });

      let cleanupResult = await t.mutation(
        internal.vault.deletion.cleanup.cleanupVaultLocalDataStepBatch,
        {
          vaultId: ids.vaultId,
          userId: ids.userId,
          step,
        },
      );
      if (step === "cleanup_source_caches") {
        sourceCleanupBatches += 1;
      }

      for (; cleanupResult.state === "needs_more"; ) {
        cleanupResult = await t.mutation(
          internal.vault.deletion.cleanup.cleanupVaultLocalDataStepBatch,
          {
            vaultId: ids.vaultId,
            userId: ids.userId,
            step,
          },
        );
        if (step === "cleanup_source_caches") {
          sourceCleanupBatches += 1;
        }
      }
    }
    await t.mutation(internal.vault.deletion.runs.appendRunEvent, {
      runId: deletionRunId,
      step: "delete_vault",
      level: "info",
      message: "Removing vault.",
      state: "running",
    });
    await t.mutation(internal.vault.deletion.cleanup.deleteVaultRow, {
      vaultId: ids.vaultId,
      userId: ids.userId,
    });
    await t.mutation(internal.vault.deletion.runs.finishWorkflowRun, {
      runId: deletionRunId,
    });

    const completed = await t.run(async (ctx) => {
      return {
        run: await ctx.db.get(deletionRunId),
        vault: await ctx.db.get(ids.vaultId),
        branchTrees: await ctx.db
          .query("vaultBranchTrees")
          .withIndex("by_vault_and_branch", (q) => q.eq("vaultId", ids.vaultId))
          .collect(),
        cloudflareWorkers: await ctx.db
          .query("vaultCloudflareWorkers")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .collect(),
        events: await ctx.db
          .query("vaultDeletionEvents")
          .withIndex("by_run_and_created_at", (q) => q.eq("runId", deletionRunId))
          .collect(),
      };
    });

    expect(completed.vault).toBeNull();
    expect(completed.branchTrees).toHaveLength(0);
    expect(completed.cloudflareWorkers).toHaveLength(0);
    expect(sourceCleanupBatches).toBeGreaterThan(1);
    expect(completed.run).toMatchObject({
      state: "succeeded",
      currentStep: "finish",
      snapshot: { state: "scrubbed_after_success" },
    });
    expect(completed.events.map((event) => event.step)).toEqual(
      expect.arrayContaining(["lock_vault", "delete_vault", "finish"]),
    );
  });

  it("rejects source provisioning before creating a deletion run", async () => {
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
        repositoryFullName: "ada/provisioning",
        trigger: "create",
        state: "running",
        currentStep: "create_github_repo",
        createdAt: 1,
        updatedAt: 2,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "provisioning",
        githubMode: "create_repository",
        runId,
        startedAt: 3,
        owner: "ada",
        name: "provisioning",
        visibility: "private",
      });

      return { userId, vaultId };
    });

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
    ).rejects.toThrow("source setup is still running");

    const snapshot = await t.run(async (ctx) => {
      const vault = await ctx.db.get(ids.vaultId);
      const runs = await ctx.db
        .query("vaultDeletionRuns")
        .withIndex("by_vault_and_updated_at", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
      return { runs, vault };
    });
    expect(snapshot.vault?.deletion).toEqual({ state: "not_deleting" });
    expect(snapshot.runs).toHaveLength(0);
  });

  it("rejects GitHub repository deletion for existing-repository vaults", async () => {
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
        repositoryFullName: "ada/existing",
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
        ghRepoId: "456",
        owner: "ada",
        name: "existing",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 4,
      });

      return { userId, vaultId };
    });

    await expect(
      t.mutation(internal.vault.deletion.runs.createInitialRun, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        options: {
          removeCodespaces: false,
          removeGithubRepo: true,
          removeConvexProvision: false,
          removeCloudflareProvision: false,
        },
      }),
    ).rejects.toThrow("cannot remove the GitHub repository");
  });

  it("blocks a new deletion run while a non-deleted Codespace is retained", async () => {
    const { ids, t } = await createConnectedVault();
    const codespaceId = await t.run(async (ctx) => {
      return await ctx.db.insert("codespaces", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        ghCodespaceId: "github-codespace-1",
        ghCodespaceName: "ada-delete-me",
        state: "running",
        createdAt: 10,
        commitSha: "abc123",
        branch: "main",
      });
    });

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
    ).rejects.toThrow("retained Codespaces state still requires cleanup");

    const snapshot = await t.run(async (ctx) => ({
      codespace: await ctx.db.get(codespaceId),
      runs: await ctx.db
        .query("vaultDeletionRuns")
        .withIndex("by_vault_and_updated_at", (q) => q.eq("vaultId", ids.vaultId))
        .collect(),
      vault: await ctx.db.get(ids.vaultId),
    }));
    expect(snapshot.codespace?.state).toBe("running");
    expect(snapshot.runs).toHaveLength(0);
    expect(snapshot.vault?.deletion).toEqual({ state: "not_deleting" });
  });

  it("preserves a non-deleted Codespace when runtime cleanup is already running", async () => {
    const { ids, t } = await createConnectedVault();
    const codespaceId = await t.run(async (ctx) => {
      return await ctx.db.insert("codespaces", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        ghCodespaceId: "github-codespace-2",
        ghCodespaceName: "ada-delete-me-running",
        state: "stopped",
        createdAt: 11,
        commitSha: "def456",
        branch: "main",
      });
    });

    await expect(
      t.mutation(internal.vault.deletion.cleanup.cleanupVaultLocalDataStepBatch, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        step: "cleanup_runtime_state",
      }),
    ).rejects.toThrow("retained Codespaces state still requires cleanup");

    expect(await t.run(async (ctx) => await ctx.db.get(codespaceId))).not.toBeNull();
  });

  it("deletes Codespace tombstones after clearing the active pointer", async () => {
    const { ids, t } = await createConnectedVault();
    const codespaceId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("codespaces", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        ghCodespaceId: "github-codespace-3",
        ghCodespaceName: "ada-delete-me-deleted",
        state: "deleted",
        createdAt: 12,
        deletedAt: 13,
        commitSha: "ghi789",
        branch: "main",
      });
      await ctx.db.patch(ids.vaultId, { activeCodespaceId: id });
      return id;
    });

    const result = await t.mutation(
      internal.vault.deletion.cleanup.cleanupVaultLocalDataStepBatch,
      {
        vaultId: ids.vaultId,
        userId: ids.userId,
        step: "cleanup_runtime_state",
      },
    );
    expect(result).toEqual({
      state: "needs_more",
      table: "codespaces",
      rowsChanged: 1,
    });

    const snapshot = await t.run(async (ctx) => ({
      codespace: await ctx.db.get(codespaceId),
      vault: await ctx.db.get(ids.vaultId),
    }));
    expect(snapshot.codespace).toBeNull();
    expect(snapshot.vault?.activeCodespaceId).toBeUndefined();
  });

  it("blocks deletion when the active Codespace belongs to another vault", async () => {
    const { ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      const otherVaultId = await ctx.db.insert("vaults", {
        userId: ids.userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const codespaceId = await ctx.db.insert("codespaces", {
        vaultId: otherVaultId,
        userId: ids.userId,
        ghCodespaceId: "github-codespace-other-vault",
        ghCodespaceName: "ada-other-vault",
        state: "deleted",
        createdAt: 14,
        deletedAt: 15,
        commitSha: "other123",
        branch: "main",
      });
      await ctx.db.patch(ids.vaultId, { activeCodespaceId: codespaceId });
    });

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
    ).rejects.toThrow("retained Codespaces state still requires cleanup");

    const snapshot = await t.run(async (ctx) => ({
      runs: await ctx.db
        .query("vaultDeletionRuns")
        .withIndex("by_vault_and_updated_at", (q) => q.eq("vaultId", ids.vaultId))
        .collect(),
      vault: await ctx.db.get(ids.vaultId),
    }));
    expect(snapshot.runs).toHaveLength(0);
    expect(snapshot.vault?.deletion).toEqual({ state: "not_deleting" });
  });

  it("preserves retained Codespaces whose user does not match the vault", async () => {
    const { ids, t } = await createConnectedVault();
    const codespaceId = await t.run(async (ctx) => {
      const otherUserId = await ctx.db.insert("users", {
        name: "Grace",
        email: "grace@example.com",
        isApproved: true,
      });
      return await ctx.db.insert("codespaces", {
        vaultId: ids.vaultId,
        userId: otherUserId,
        ghCodespaceId: "github-codespace-wrong-user",
        ghCodespaceName: "grace-delete-me",
        state: "stopped",
        createdAt: 16,
        commitSha: "wronguser123",
        branch: "main",
      });
    });

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
    ).rejects.toThrow("retained Codespaces state still requires cleanup");

    const snapshot = await t.run(async (ctx) => ({
      codespace: await ctx.db.get(codespaceId),
      runs: await ctx.db
        .query("vaultDeletionRuns")
        .withIndex("by_vault_and_updated_at", (q) => q.eq("vaultId", ids.vaultId))
        .collect(),
      vault: await ctx.db.get(ids.vaultId),
    }));
    expect(snapshot.codespace?.state).toBe("stopped");
    expect(snapshot.runs).toHaveLength(0);
    expect(snapshot.vault?.deletion).toEqual({ state: "not_deleting" });
  });

  it("blocks a retry when a non-deleted Codespace appears after the first run", async () => {
    const { ids, t } = await createConnectedVault();
    const initial = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      userId: ids.userId,
      vaultId: ids.vaultId,
      options: {
        removeCodespaces: false,
        removeGithubRepo: false,
        removeConvexProvision: false,
        removeCloudflareProvision: false,
      },
    });
    await t.mutation(internal.vault.deletion.runs.markWorkflowFailed, {
      runId: initial.deletionRunId,
      message: "Provider cleanup failed.",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("codespaces", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        ghCodespaceId: "github-codespace-4",
        ghCodespaceName: "ada-delete-me-retry",
        state: "failed",
        createdAt: 14,
        commitSha: "jkl012",
        branch: "main",
      });
    });

    await expect(
      t.mutation(internal.vault.deletion.runs.createRetryRun, {
        userId: ids.userId,
        failedRunId: initial.deletionRunId,
      }),
    ).rejects.toThrow("retained Codespaces state still requires cleanup");

    const runs = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultDeletionRuns")
        .withIndex("by_vault_and_updated_at", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
    });
    expect(runs).toHaveLength(1);
  });

  it("skips Codespaces cleanup while the feature is disabled", async () => {
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
        repositoryFullName: "ada/codespaces",
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
        ghRepoId: "789",
        owner: "ada",
        name: "codespaces",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 4,
      });

      return { userId, vaultId };
    });

    const result = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      userId: ids.userId,
      vaultId: ids.vaultId,
      options: {
        removeCodespaces: true,
        removeGithubRepo: false,
        removeConvexProvision: false,
        removeCloudflareProvision: false,
      },
    });

    const snapshot = await t.run(async (ctx) => {
      const vault = await ctx.db.get(ids.vaultId);
      const runs = await ctx.db
        .query("vaultDeletionRuns")
        .withIndex("by_vault_and_updated_at", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
      return { runs, vault };
    });
    expect(snapshot.vault?.deletion).toMatchObject({
      state: "deleting",
      runId: result.deletionRunId,
    });
    expect(snapshot.runs).toHaveLength(1);
    expect(snapshot.runs[0]).toMatchObject({
      snapshot: {
        state: "retained_for_retry",
        plan: {
          codespaces: {
            action: "skip",
            reason: "feature_disabled",
          },
        },
      },
    });
  });

  it("retries a failed retained snapshot with a new run", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "nicu@samebase.com",
        isApproved: true,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const setupRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/retry-me",
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
        runId: setupRunId,
        ghRepoId: "789",
        owner: "ada",
        name: "retry-me",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 4,
      });

      return { userId, vaultId };
    });
    const initial = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      userId: ids.userId,
      vaultId: ids.vaultId,
      options: {
        removeCodespaces: false,
        removeGithubRepo: false,
        removeConvexProvision: false,
        removeCloudflareProvision: false,
      },
    });
    await t.mutation(internal.vault.deletion.runs.markWorkflowFailed, {
      runId: initial.deletionRunId,
      message: "Provider cleanup failed.",
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });
    const retry = await asUser.action(api.vault.actions.retryDeleteVault, {
      runId: initial.deletionRunId,
    });

    const snapshot = await t.run(async (ctx) => {
      return {
        failedRun: await ctx.db.get(initial.deletionRunId),
        retryRun: await ctx.db.get(retry.deletionRunId),
        vault: await ctx.db.get(ids.vaultId),
      };
    });

    expect(snapshot.failedRun).toMatchObject({
      state: "failed",
      snapshot: { state: "retained_for_retry" },
    });
    expect(snapshot.retryRun).toMatchObject({
      state: "running",
      attempt: {
        kind: "retry",
        retryOf: initial.deletionRunId,
      },
      snapshot: { state: "retained_for_retry" },
    });
    expect(snapshot.vault?.deletion).toMatchObject({
      state: "deleting",
      runId: retry.deletionRunId,
    });
  });

  it("rejects a retry when retained provider connections are missing", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const githubConnectionId = await ctx.db.insert("providerConnections", {
        kind: "github",
        userId,
        auth: {
          method: "api_key",
          credential: "test-github-api-key",
        },
        username: "ada",
        createdAt: 1,
        updatedAt: 2,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const setupRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/retry-missing-provider",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 3,
        updatedAt: 4,
        completedAt: 5,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId: setupRunId,
        ghRepoId: "789",
        owner: "ada",
        name: "retry-missing-provider",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 6,
      });

      return { githubConnectionId, userId, vaultId };
    });
    const initial = await t.mutation(internal.vault.deletion.runs.createInitialRun, {
      userId: ids.userId,
      vaultId: ids.vaultId,
      options: {
        removeCodespaces: false,
        removeGithubRepo: true,
        removeConvexProvision: false,
        removeCloudflareProvision: false,
      },
    });
    await t.mutation(internal.vault.deletion.runs.markWorkflowFailed, {
      runId: initial.deletionRunId,
      message: "Provider cleanup failed.",
    });
    await t.run(async (ctx) => {
      await ctx.db.delete(ids.githubConnectionId);
    });

    await expect(
      t.mutation(internal.vault.deletion.runs.createRetryRun, {
        userId: ids.userId,
        failedRunId: initial.deletionRunId,
      }),
    ).rejects.toThrow("GitHub is not connected.");

    const snapshot = await t.run(async (ctx) => {
      const vault = await ctx.db.get(ids.vaultId);
      const runs = await ctx.db
        .query("vaultDeletionRuns")
        .withIndex("by_vault_and_updated_at", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
      return { runs, vault };
    });
    expect(snapshot.vault?.deletion).toMatchObject({
      state: "delete_failed",
      runId: initial.deletionRunId,
    });
    expect(snapshot.runs).toHaveLength(1);
  });
});
