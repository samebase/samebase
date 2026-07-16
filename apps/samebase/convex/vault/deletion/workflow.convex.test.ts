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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "delete-me",
        routeRepositoryKey: "ada/delete-me",
        routeOwner: "ada",
        routeName: "delete-me",
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "delete-me",
        routeRepositoryKey: "ada/delete-me",
        routeOwner: "ada",
        routeName: "delete-me",
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "existing-repo",
        routeRepositoryKey: "ada/existing-repo",
        routeOwner: "ada",
        routeName: "existing-repo",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 8,
      });
      const appId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "/",
        createdAt: 6,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        userId,
        appId,
        accountId: "cloudflare-account",
        workerName: "existing-repo-worker",
        workerTag: "worker-tag",
        origin: "provisioned",
        builds: { state: "not_connected" },
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
      routeRepositoryFullName: "ada/delete-me",
      deletion: {
        state: "deleting",
        runId: deletionRunId,
        currentStep: "initialize_deletion",
        message: "Queued vault deletion.",
      },
    });
  });

  it("blocks branch tree refresh writes after deletion starts", async () => {
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

    expect(claim).toEqual({ claimed: false });
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
      ghRepoId: "existing-app-repository-id",
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
      routeRepositoryFullName: "ada/existing-app",
      deletion: {
        state: "not_deleting",
        deleteAction: {
          state: "disabled",
          reason: "Vault source setup is still running.",
        },
      },
    });
  });

  it("refuses to delete a vault row while its repository summary remains", async () => {
    const { ids, t } = await createConnectedVault();
    await t.run(
      async (ctx) =>
        await ctx.db.insert("vaultRepositorySummaries", {
          userId: ids.userId,
          vaultId: ids.vaultId,
          refreshEligibleAt: 0,
          lifecycle: { state: "idle" },
          publication: { state: "unobserved" },
        }),
    );

    await expect(
      t.mutation(internal.vault.deletion.cleanup.deleteVaultRow, {
        vaultId: ids.vaultId,
        userId: ids.userId,
      }),
    ).rejects.toThrow("Repository summary remains during vault deletion.");
    await expect(t.run(async (ctx) => await ctx.db.get(ids.vaultId))).resolves.not.toBeNull();
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "delete-me",
        routeRepositoryKey: "ada/delete-me",
        routeOwner: "ada",
        routeName: "delete-me",
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
      const appId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "/",
        createdAt: 6,
      });
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        userId,
        appId,
        accountId: "cloudflare-account",
        workerName: "delete-me-worker",
        workerTag: "worker-tag",
        origin: "provisioned",
        builds: { state: "not_connected" },
        connectedAt: 6,
        lastObservedAt: 7,
      });
      const convexDeploymentId = await ctx.db.insert("vaultConvexDeployments", {
        vaultId,
        userId,
        appId,
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "delete-me",
        deploymentName: "delete-me-production",
        deploymentType: "prod",
        cloudUrl: "https://delete-me-production.convex.cloud",
        siteUrl: "https://delete-me-production.convex.site",
        previewDeployment: { state: "not_ensured" },
        origin: "selected_existing",
        connectedAt: 6,
        lastObservedAt: 7,
      });
      await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId,
        userId,
        workerId,
        convexDeploymentId,
        wiring: {
          state: "not_wired",
          deployKeys: {
            production: { state: "not_created" },
            preview: { state: "not_created" },
          },
        },
        createdAt: 6,
        updatedAt: 7,
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
    const runtimeCleanupTables: string[] = [];
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
      if (step === "cleanup_runtime_state" && cleanupResult.state === "needs_more") {
        runtimeCleanupTables.push(cleanupResult.table);
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
        if (step === "cleanup_runtime_state" && cleanupResult.state === "needs_more") {
          runtimeCleanupTables.push(cleanupResult.table);
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
        apps: await ctx.db
          .query("vaultApps")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .collect(),
        convexDeployments: await ctx.db
          .query("vaultConvexDeployments")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .collect(),
        workerDeploymentDependencies: await ctx.db
          .query("vaultWorkerDeploymentDependencies")
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
    expect(completed.apps).toHaveLength(0);
    expect(completed.convexDeployments).toHaveLength(0);
    expect(completed.workerDeploymentDependencies).toHaveLength(0);
    expect(sourceCleanupBatches).toBeGreaterThan(1);
    expect(runtimeCleanupTables).toEqual([
      "vaultWorkerDeploymentDependencies",
      "vaultConvexDeployments",
      "vaultCloudflareWorkers",
      "vaultApps",
    ]);
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
        routeRepositoryKey: "ada/provisioning",
        routeOwner: "ada",
        routeName: "provisioning",
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
        ghRepoNodeId: "R_456",
        githubOwner: "ada",
        githubName: "existing",
        routeRepositoryKey: "ada/existing",
        routeOwner: "ada",
        routeName: "existing",
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
        ghRepoNodeId: "R_789",
        githubOwner: "ada",
        githubName: "codespaces",
        routeRepositoryKey: "ada/codespaces",
        routeOwner: "ada",
        routeName: "codespaces",
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
        ghRepoNodeId: "R_789",
        githubOwner: "ada",
        githubName: "retry-me",
        routeRepositoryKey: "ada/retry-me",
        routeOwner: "ada",
        routeName: "retry-me",
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
        githubAccountId: 101,
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
        ghRepoNodeId: "R_789",
        githubOwner: "ada",
        githubName: "retry-missing-provider",
        routeRepositoryKey: "ada/retry-missing-provider",
        routeOwner: "ada",
        routeName: "retry-missing-provider",
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
