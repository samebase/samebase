import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
import { VAULT_LOCAL_CLEANUP_BATCH_SIZE } from "./deletion/cleanup";

describe("vault dashboard Convex contract", () => {
  it("records initializing existing repository connection before external GitHub work", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
    });

    const ids = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        userId,
        ghRepoOwner: "Ada",
        ghRepoName: "Existing-App",
      },
    );
    const result = await t.run(async (ctx) => {
      const vault = await ctx.db.get(ids.vaultId);
      const run = await ctx.db.get(ids.runId);
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      return { events, run, vault };
    });

    expect(result.vault).toMatchObject({
      state: "provisioning",
      githubMode: "connect_existing_repository",
      runId: ids.runId,
      owner: "Ada",
      name: "Existing-App",
    });
    expect(result.run).toMatchObject({
      vaultId: ids.vaultId,
      currentStep: "run_created",
      state: "queued",
      trigger: "connect_existing_repository",
      repositoryFullName: "Ada/Existing-App",
    });
    expect(result.events).toMatchObject([
      {
        vaultId: ids.vaultId,
        runId: ids.runId,
        step: "initialize_vault",
        message: "Queued existing repository connection.",
      },
    ]);
  });

  it("exposes initializing existing repository source setup", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
    });
    const ids = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        userId,
        ghRepoOwner: "ada",
        ghRepoName: "existing-app",
      },
    );

    const asUser = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });
    const vaults = await asUser.query(api.vault.dashboard.getUserVaults);

    expect(vaults).toHaveLength(1);
    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      hasConnectedGitHubRepository: false,
      repositoryFullName: "ada/existing-app",
      state: "copying_files",
      sourceSetup: {
        status: "running",
        runId: ids.runId,
        step: "run_created",
        updatedAt: expect.any(Number),
      },
    });
  });

  it("rejects duplicate existing repository targets before GitHub fetch", async () => {
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
      ghRepoOwner: "Ada",
      ghRepoName: "Existing-App",
    });

    await expect(
      t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
        userId,
        ghRepoOwner: "ada",
        ghRepoName: "existing-app",
      }),
    ).rejects.toThrow("Vault already exists for this repository.");
  });

  it("connects existing repository vaults with run provenance and no providers", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
    });
    const ids = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        userId,
        ghRepoOwner: "ada",
        ghRepoName: "existing-app",
      },
    );

    await t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId,
      ghRepoId: "123",
      ghRepoOwner: "Ada",
      ghRepoName: "Existing-App",
      defaultBranch: "main",
      visibility: "private",
    });

    const vault = await t.run(async (ctx) => {
      return await ctx.db.get(ids.vaultId);
    });

    expect(vault).toMatchObject({
      state: "connected",
      githubMode: "connect_existing_repository",
      runId: ids.runId,
      ghRepoId: "123",
      owner: "Ada",
      name: "Existing-App",
      defaultBranch: "main",
      visibility: "private",
      convex: { state: "not_configured" },
      cloudflare: { state: "not_configured" },
    });
  });

  it("marks existing repository setup failed before GitHub connects", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
    });
    const ids = await t.mutation(
      internal.vault.records.createInitializingExistingRepositoryVaultForUser,
      {
        userId,
        ghRepoOwner: "ada",
        ghRepoName: "missing-repo",
      },
    );

    await t.mutation(internal.vault.records.markGithubProvisioningFailed, {
      runId: ids.runId,
    });

    const vault = await t.run(async (ctx) => {
      return await ctx.db.get(ids.vaultId);
    });

    expect(vault).toMatchObject({
      state: "failed",
      githubMode: "connect_existing_repository",
      runId: ids.runId,
      owner: "ada",
      name: "missing-repo",
    });
  });

  it("preserves connected existing repository identity after tree sync failure", async () => {
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
        repositoryFullName: "ada/imported",
        workflowId: "workflow-1",
        trigger: "connect_existing_repository",
        state: "running",
        currentStep: "sync_tree",
        createdAt: 10,
        updatedAt: 30,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "imported",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
        convex: { state: "not_configured" },
        cloudflare: { state: "not_configured" },
      });

      return { runId, userId, vaultId };
    });

    await t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow-1",
      message: "GitHub tree sync failed.",
    });

    const result = await t.run(async (ctx) => {
      const vault = await ctx.db.get(ids.vaultId);
      const run = await ctx.db.get(ids.runId);
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      return { events, run, vault };
    });

    expect(result.vault).toMatchObject({
      state: "connected",
      githubMode: "connect_existing_repository",
      runId: ids.runId,
      ghRepoId: "123",
    });
    expect(result.run).toMatchObject({
      state: "failed",
      currentStep: "sync_tree",
      lastError: "Provisioning failed during sync_tree.",
    });
    expect(result.events).toMatchObject([
      {
        runId: ids.runId,
        step: "sync_tree",
        level: "error",
        message: "Provisioning failed during sync_tree.",
      },
    ]);

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });
    const vaults = await asUser.query(api.vault.dashboard.getUserVaults);

    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      hasConnectedGitHubRepository: true,
      repositoryFullName: "ada/imported",
      state: "copying_files",
      sourceSetup: {
        status: "failed",
        runId: ids.runId,
        step: "sync_tree",
        message: "Provisioning failed during sync_tree.",
        updatedAt: expect.any(Number),
      },
    });
  });

  it("records initializing vault creation before external GitHub work", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
    });

    const ids = await t.mutation(
      internal.vault.records.createInitializingNoterManagedVaultForUser,
      {
        userId,
        ghRepoOwner: "ada",
        ghRepoName: "early-vault",
        visibility: "private",
        convexProjectName: "early-vault",
        cloudflareAccountId: "cloudflare-account",
        cloudflareWorkerName: "early-vault",
      },
    );
    const result = await t.run(async (ctx) => {
      const vault = await ctx.db.get(ids.vaultId);
      const run = await ctx.db.get(ids.runId);
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      return { events, run, vault };
    });

    expect(result.vault).toMatchObject({
      state: "provisioning",
      githubMode: "create_repository",
      runId: ids.runId,
      owner: "ada",
      name: "early-vault",
    });
    expect(result.run).toMatchObject({
      vaultId: ids.vaultId,
      currentStep: "run_created",
      state: "queued",
    });
    expect(result.events).toMatchObject([
      {
        vaultId: ids.vaultId,
        runId: ids.runId,
        step: "initialize_vault",
        message: "Created the initializing Noter vault.",
      },
    ]);
  });

  it("exposes post-GitHub source setup failures from the current run", async () => {
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
        repositoryFullName: "ada/source-setup-failed",
        trigger: "create",
        state: "failed",
        currentStep: "sync_tree",
        lastError: "Fallback sync failure.",
        createdAt: 10,
        updatedAt: 30,
        completedAt: 30,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "source-setup-failed",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
        convex: { state: "not_configured" },
        cloudflare: { state: "not_configured" },
      });
      await ctx.db.insert("appProvisioningEvents", {
        userId,
        vaultId,
        repositoryFullName: "ada/source-setup-failed",
        runId,
        step: "sync_tree",
        level: "error",
        message: "Initial tree sync failed.",
        createdAt: 31,
      });

      return { runId, userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const vaults = await asUser.query(api.vault.dashboard.getUserVaults);

    expect(vaults).toHaveLength(1);
    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      hasConnectedGitHubRepository: true,
      repositoryFullName: "ada/source-setup-failed",
      state: "copying_files",
      sourceSetup: {
        status: "failed",
        runId: ids.runId,
        step: "sync_tree",
        message: "Initial tree sync failed.",
        updatedAt: 30,
      },
    });
  });

  it("surfaces a missing setup run instead of hiding source setup", async () => {
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
        repositoryFullName: "ada/missing-run",
        trigger: "create",
        state: "running",
        currentStep: "sync_tree",
        createdAt: 10,
        updatedAt: 30,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "missing-run",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
        convex: { state: "not_configured" },
        cloudflare: { state: "not_configured" },
      });
      await ctx.db.delete(runId);

      return { runId, userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const vaults = await asUser.query(api.vault.dashboard.getUserVaults);

    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      hasConnectedGitHubRepository: true,
      state: "copying_files",
      sourceSetup: {
        status: "failed",
        runId: ids.runId,
        step: "run_created",
        message: "Provisioning run not found.",
        updatedAt: 20,
      },
    });
  });

  it("derives provider setup from vault provider states instead of infrastructure metadata", async () => {
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
        repositoryFullName: "ada/provider-state",
        trigger: "create",
        state: "running",
        currentStep: "ensure_cloudflare",
        createdAt: 10,
        updatedAt: 30,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "provider-state",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
        convex: {
          state: "connected",
          projectId: "convex-project",
          projectSlug: "provider-state-project",
          deploymentName: "provider-state-prod",
          connectedAt: 24,
        },
        cloudflare: { state: "not_configured" },
      });
      await ctx.db.insert("vaultBranchTrees", {
        vaultId,
        branch: "main",
        treeSHA: "tree",
        commitSHA: "commit",
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [],
        },
        lastTreeRefreshAt: 29,
      });
      await ctx.db.insert("vaultInfrastructure", {
        vaultId,
        convexProjectId: "stale-convex-project",
        convexTeamSlug: "provider-state-team",
        convexProjectSlug: "stale-project",
        convexDeploymentName: "stale-prod",
        convexDeploymentType: "prod",
        convexCloudUrl: "https://stale.convex.cloud",
        convexSiteUrl: "https://stale.convex.site",
        convexDeployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
      });

      return { runId, userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const vaults = await asUser.query(api.vault.dashboard.getUserVaults);

    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      state: "ready",
      hasConvexProvision: true,
      hasCloudflareProvision: false,
      providerSetup: {
        status: "running",
        provider: "cloudflare",
        runId: ids.runId,
        step: "ensure_cloudflare",
        updatedAt: 30,
      },
    });
    expect(vaults[0]).not.toHaveProperty("cloudflareWorkersDevUrl");
    expect(vaults[0]).not.toHaveProperty("cloudflareProjectDashboardUrl");
  });

  it("uses the active infrastructure retry run while Cloudflare is not configured", async () => {
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
      const createRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/cloudflare-retry",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 10,
        updatedAt: 30,
        completedAt: 30,
      });
      const retryRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/cloudflare-retry",
        trigger: "retry",
        state: "running",
        currentStep: "ensure_cloudflare",
        createdAt: 40,
        updatedAt: 45,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId: createRunId,
        ghRepoId: "123",
        owner: "ada",
        name: "cloudflare-retry",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
        convex: {
          state: "connected",
          projectId: "convex-project",
          projectSlug: "cloudflare-retry-project",
          deploymentName: "cloudflare-retry-prod",
          connectedAt: 24,
        },
        cloudflare: { state: "not_configured" },
      });
      await ctx.db.insert("vaultBranchTrees", {
        vaultId,
        branch: "main",
        treeSHA: "tree",
        commitSHA: "commit",
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [],
        },
        lastTreeRefreshAt: 29,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId: retryRunId,
        provisioningVersion: 2,
        state: "active",
        updatedAt: 44,
      });

      return { retryRunId, userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const vaults = await asUser.query(api.vault.dashboard.getUserVaults);

    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      providerSetup: {
        status: "running",
        provider: "cloudflare",
        runId: ids.retryRunId,
        step: "ensure_cloudflare",
        updatedAt: 45,
      },
    });
  });

  it("keeps active provider ownership visible but lets connected resources recover failed ownership", async () => {
    const cases = [
      {
        label: "active",
        ownershipState: "active",
        runState: "running",
        expectedSetup: {
          status: "running",
          provider: "cloudflare",
        },
      },
      {
        label: "failed",
        ownershipState: "failed",
        runState: "failed",
        expectedSetup: {
          status: "ready",
        },
      },
      {
        label: "succeeded",
        ownershipState: "succeeded",
        runState: "succeeded",
        expectedSetup: {
          status: "ready",
        },
      },
      {
        label: "none",
        ownershipState: null,
        runState: "succeeded",
        expectedSetup: {
          status: "ready",
        },
      },
    ] as const;

    for (const testCase of cases) {
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
          repositoryFullName: `ada/provider-${testCase.label}`,
          trigger: "retry",
          state: testCase.runState,
          currentStep: "record_domains",
          createdAt: 10,
          updatedAt: 45,
          ...(testCase.runState === "failed" ? { lastError: "Domain recording failed." } : {}),
          ...(testCase.runState === "succeeded" ? { completedAt: 45 } : {}),
        });

        await ctx.db.replace(vaultId, {
          userId,
          deletion: { state: "not_deleting" },
          state: "connected",
          githubMode: "create_repository",
          runId,
          ghRepoId: "123",
          owner: "ada",
          name: `provider-${testCase.label}`,
          visibility: "private",
          defaultBranch: "main",
          connectedAt: 20,
          convex: {
            state: "connected",
            projectId: "convex-project",
            projectSlug: `provider-${testCase.label}-project`,
            deploymentName: `provider-${testCase.label}-prod`,
            connectedAt: 24,
          },
          cloudflare: {
            state: "connected",
            accountId: "cloudflare-account",
            workerName: `provider-${testCase.label}-worker`,
            workerTag: `provider-${testCase.label}-worker-tag`,
            workersDevUrl: `https://provider-${testCase.label}.example.workers.dev`,
            origin: "provisioned",
            connectedAt: 26,
            lastObservedAt: 26,
          },
        });
        await ctx.db.insert("vaultBranchTrees", {
          vaultId,
          branch: "main",
          treeSHA: "tree",
          commitSHA: "commit",
          treeData: {
            sha: "tree",
            truncated: false,
            tree: [],
          },
          lastTreeRefreshAt: 29,
        });
        if (testCase.ownershipState) {
          await ctx.db.insert("vaultInfrastructureOwnership", {
            vaultId,
            runId,
            provisioningVersion: 2,
            state: testCase.ownershipState,
            updatedAt: 44,
          });
        }

        return { userId, vaultId };
      });

      const asUser = t.withIdentity({
        subject: `${ids.userId}|test-session`,
        tokenIdentifier: `test:${ids.userId}`,
      });

      const vaults = await asUser.query(api.vault.dashboard.getUserVaults);

      expect(vaults[0]).toMatchObject({
        _id: ids.vaultId,
        providerSetup: testCase.expectedSetup,
      });
    }
  });

  it("keeps setup progress visible between tree sync and provider claim", async () => {
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
        repositoryFullName: "ada/provider-handoff",
        trigger: "create",
        state: "running",
        currentStep: "sync_tree",
        createdAt: 10,
        updatedAt: 30,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "provider-handoff",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
        convex: { state: "not_configured" },
        cloudflare: { state: "not_configured" },
      });
      await ctx.db.insert("vaultBranchTrees", {
        vaultId,
        branch: "main",
        treeSHA: "tree",
        commitSHA: "commit",
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [],
        },
        lastTreeRefreshAt: 29,
      });

      return { runId, userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const vaults = await asUser.query(api.vault.dashboard.getUserVaults);

    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      state: "ready",
      sourceSetup: { status: "ready" },
      providerSetup: {
        status: "running",
        provider: "convex",
        runId: ids.runId,
        step: "sync_tree",
        updatedAt: 30,
      },
    });
  });

  it("does not surface completed provider runs as active", async () => {
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
        repositoryFullName: "ada/completed-provider-run",
        trigger: "retry",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 10,
        updatedAt: 30,
        completedAt: 30,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "completed-provider-run",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
        convex: {
          state: "provisioning",
          runId,
          startedAt: 25,
        },
        cloudflare: { state: "not_configured" },
      });
      await ctx.db.insert("vaultBranchTrees", {
        vaultId,
        branch: "main",
        treeSHA: "tree",
        commitSHA: "commit",
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [],
        },
        lastTreeRefreshAt: 29,
      });

      return { runId, userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const vaults = await asUser.query(api.vault.dashboard.getUserVaults);

    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      providerSetup: {
        status: "failed",
        provider: "convex",
        runId: ids.runId,
        step: "finish",
        updatedAt: 30,
      },
    });
  });

  it("does not use the Convex team id as a display scope", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        userId,
        auth: {
          method: "api_key",
          credential: "convex-management-token",
        },
        teamId: "38516",
        createdAt: 1,
        updatedAt: 1,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/demo",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 10,
        updatedAt: 30,
        completedAt: 30,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "demo",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
        convex: {
          state: "connected",
          projectId: "project-1",
          projectSlug: "demo-project",
          deploymentName: "demo-production",
          connectedAt: 25,
        },
        cloudflare: { state: "not_configured" },
      });
      await ctx.db.insert("vaultBranchTrees", {
        vaultId,
        branch: "main",
        treeSHA: "tree",
        commitSHA: "commit",
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [],
        },
        lastTreeRefreshAt: 29,
      });

      return { userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const vaults = await asUser.query(api.vault.dashboard.getUserVaults);

    expect(vaults[0]?.convexProjectSlug).toBe("demo-project");
    expect(vaults[0]?.convexTeamSlug).toBeUndefined();
    expect(vaults[0]?.convexProjectSettingsDashboardUrl).toBeUndefined();
    expect(vaults[0]?.convexDeploymentDashboardUrl).toBeUndefined();
  });

  it("returns infrastructure domains in a stable display order", async () => {
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
        repositoryFullName: "ada/domain-order",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 10,
        updatedAt: 30,
        completedAt: 30,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "domain-order",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
        convex: {
          state: "connected",
          projectId: "convex-project",
          projectSlug: "domain-order-project",
          deploymentName: "domain-order-prod",
          connectedAt: 24,
        },
        cloudflare: {
          state: "connected",
          accountId: "cloudflare-account",
          workerName: "domain-order-worker",
          workerTag: "domain-order-worker-tag",
          workersDevUrl: "https://domain-order.example.workers.dev",
          origin: "provisioned",
          connectedAt: 26,
          lastObservedAt: 26,
        },
      });
      await ctx.db.insert("vaultDomains", {
        vaultId,
        branch: "z-feature",
        kind: "branch_preview",
        url: "https://z-feature.example.workers.dev",
        source: "cloudflare_workers_default",
        active: true,
        lastSyncedAt: 30,
      });
      await ctx.db.insert("vaultDomains", {
        vaultId,
        branch: "main",
        kind: "main",
        url: "https://b-main.example.workers.dev",
        source: "cloudflare_workers_default",
        active: true,
        lastSyncedAt: 31,
      });
      await ctx.db.insert("vaultDomains", {
        vaultId,
        branch: "a-feature",
        kind: "branch_preview",
        url: "https://a-feature.example.workers.dev",
        source: "cloudflare_workers_default",
        active: true,
        lastSyncedAt: 32,
      });
      await ctx.db.insert("vaultDomains", {
        vaultId,
        branch: "main",
        kind: "main",
        url: "https://a-main.example.workers.dev",
        source: "cloudflare_workers_custom",
        active: true,
        lastSyncedAt: 33,
      });

      return { userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const infrastructure = await asUser.query(api.vault.dashboard.getVaultInfrastructure, {
      vaultId: ids.vaultId,
    });
    if (!infrastructure) {
      throw new Error("Vault infrastructure result is missing.");
    }

    expect(infrastructure.domains.map((domain) => domain.url)).toEqual([
      "https://a-main.example.workers.dev",
      "https://b-main.example.workers.dev",
      "https://a-feature.example.workers.dev",
      "https://z-feature.example.workers.dev",
    ]);
  });

  it("keeps the vault row until branch-heavy local cleanup finishes", async () => {
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

      for (let index = 0; index < VAULT_LOCAL_CLEANUP_BATCH_SIZE + 1; index++) {
        await ctx.db.insert("vaultBranchTrees", {
          vaultId,
          branch: `branch-${index}`,
          treeSHA: `tree-${index}`,
          treeData: {
            sha: `tree-${index}`,
            truncated: false,
            tree: [],
          },
          lastTreeRefreshAt: index,
        });
      }

      return { userId, vaultId };
    });

    const firstResult = await t.mutation(
      internal.vault.deletion.cleanup.deleteVaultLocalDataBatch,
      ids,
    );

    expect(firstResult).toEqual({
      state: "needs_more",
      table: "vaultBranchTrees",
      rowsChanged: VAULT_LOCAL_CLEANUP_BATCH_SIZE,
    });
    await expect(
      t.run(async (ctx) => {
        const vault = await ctx.db.get(ids.vaultId);
        const branchTrees = await ctx.db
          .query("vaultBranchTrees")
          .withIndex("by_vault_and_branch", (q) => q.eq("vaultId", ids.vaultId))
          .collect();
        return { branchTreeCount: branchTrees.length, vault };
      }),
    ).resolves.toMatchObject({
      branchTreeCount: 1,
      vault: { _id: ids.vaultId },
    });

    let result = firstResult;
    while (result.state === "needs_more") {
      result = await t.mutation(internal.vault.deletion.cleanup.deleteVaultLocalDataBatch, ids);
    }

    expect(result).toEqual({ state: "deleted" });
    await expect(
      t.run(async (ctx) => {
        return await ctx.db.get(ids.vaultId);
      }),
    ).resolves.toBeNull();
  });

  it("cleans the vault-wide local registry and preserves prod access audit", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const collaboratorId = await ctx.db.insert("users", {
        name: "Grace",
        email: "grace@example.com",
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
      const storageId = await ctx.storage.store(new Blob(["cached"], { type: "text/plain" }));
      const stagedStorageId = await ctx.storage.store(new Blob(["staged"], { type: "text/plain" }));

      await ctx.db.insert("vaultBranchFilters", {
        userId,
        vaultId,
        hiddenLabels: [],
        includeDrafts: false,
      });
      await ctx.db.insert("vaultBranchFilters", {
        userId: collaboratorId,
        vaultId,
        hiddenLabels: ["wip"],
        includeDrafts: true,
      });
      await ctx.db.insert("fileStaging", {
        ownerId: userId,
        vaultId,
        fileDeleted: false,
        kind: "text",
        filePath: "README.md",
        initialFilePath: "README.md",
        content: "hello",
        initialContent: "hello",
        parentCommitSha: null,
        lastEditTime: 4,
        lastEditUserId: userId,
        branch: "main",
        version: 1,
      });
      await ctx.db.insert("fileStaging", {
        ownerId: userId,
        vaultId,
        fileDeleted: false,
        kind: "binary",
        filePath: "image.png",
        initialFilePath: "image.png",
        content: "",
        initialContent: "",
        storageId: stagedStorageId,
        mime: "image/png",
        size: 6,
        stagedBlobSha: "staged-blob-sha",
        parentCommitSha: null,
        lastEditTime: 5,
        lastEditUserId: userId,
        branch: "main",
        version: 1,
      });
      await ctx.db.insert("collaborativeUpdates", {
        vaultId,
        branch: "main",
        filePath: "README.md",
        version: 1,
        clientId: "client-1",
        changes: "[]",
        userId,
        timestamp: 6,
      });
      await ctx.db.insert("blobs", {
        vaultId,
        sha: "blob-sha",
        size: 6,
        storageId,
        mime: "text/plain",
        ext: "txt",
      });
      await ctx.db.insert("folderExpansionState", {
        userId: collaboratorId,
        vaultId,
        folderPath: "/",
        isExpanded: true,
      });
      await ctx.db.insert("vaultRemoteBranches", {
        vaultId,
        name: "main",
        headCommitSha: "commit",
        isDefault: true,
        isProtected: false,
        remoteState: "active",
        lastSyncedAt: 6,
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
        lastTreeRefreshAt: 7,
      });
      await ctx.db.insert("vaultDomains", {
        vaultId,
        branch: "main",
        kind: "main",
        url: "https://delete-me.example.workers.dev",
        source: "cloudflare_workers_default",
        active: true,
        lastSyncedAt: 8,
      });
      await ctx.db.insert("vaultInfrastructure", {
        vaultId,
        convexProjectId: "delete-convex-project",
        convexTeamSlug: "delete-team",
        convexProjectSlug: "delete-convex",
        convexDeploymentName: "delete-convex-prod",
        convexDeploymentType: "prod",
        convexCloudUrl: "https://delete-convex.convex.cloud",
        convexSiteUrl: "https://delete-convex.convex.site",
        convexDeployKeys: {
          production: { state: "created", id: "delete-convex-key" },
          preview: { state: "created", id: "delete-preview-convex-key" },
        },
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId,
        provisioningVersion: 1,
        state: "succeeded",
        updatedAt: 9,
      });
      await ctx.db.insert("codespaces", {
        vaultId,
        userId,
        ghCodespaceId: "codespace-id",
        ghCodespaceName: "codespace-name",
        state: "stopped",
        createdAt: 10,
        commitSha: "commit",
        branch: "main",
      });
      await ctx.db.insert("agentGraphNodeLayout", {
        userId: collaboratorId,
        vaultId,
        nodeId: "README.md",
        width: 120,
        height: 80,
        updatedAt: 11,
      });
      await ctx.db.insert("agentThreadContext", {
        threadId: "thread-1",
        userId: collaboratorId,
        vaultId,
        repositoryFullName: "ada/delete-me",
        branch: "main",
        filePath: "README.md",
        createdAt: 12,
      });
      const requestId = await ctx.db.insert("aiProdAccessRequests", {
        threadId: "thread-1",
        requesterUserId: userId,
        vaultId,
        scope: "vault",
        provider: "convex",
        resourceKind: "logs",
        toolName: "readLogs",
        paramsJson: "{}",
        status: "approved",
        redactionLevel: "default",
        approvedBy: collaboratorId,
        approvedAt: 13,
      });
      const auditId = await ctx.db.insert("aiProdAccessAudit", {
        requestId,
        actorUserId: collaboratorId,
        action: "approved",
        toolName: "readLogs",
        endpoint: "convex:logs",
        argumentHash: "hash",
        createdAt: 14,
      });
      await ctx.db.insert("appProvisioningEvents", {
        userId,
        vaultId,
        repositoryFullName: "ada/delete-me",
        runId,
        step: "finish",
        level: "info",
        message: "Finished.",
        createdAt: 15,
      });

      return {
        auditId,
        requestId,
        stagedStorageId,
        storageId,
        userId,
        vaultId,
      };
    });

    const tables: string[] = [];
    let result = await t.mutation(internal.vault.deletion.cleanup.deleteVaultLocalDataBatch, {
      vaultId: ids.vaultId,
      userId: ids.userId,
    });
    while (result.state === "needs_more") {
      tables.push(result.table);
      result = await t.mutation(internal.vault.deletion.cleanup.deleteVaultLocalDataBatch, {
        vaultId: ids.vaultId,
        userId: ids.userId,
      });
    }

    expect(result).toEqual({ state: "deleted" });
    expect(tables).toEqual(
      expect.arrayContaining([
        "vaultBranchFilters",
        "fileStaging",
        "collaborativeUpdates",
        "blobs",
        "folderExpansionState",
        "vaultRemoteBranches",
        "vaultBranchTrees",
        "vaultDomains",
        "vaultInfrastructure",
        "vaultInfrastructureOwnership",
        "codespaces",
        "agentGraphNodeLayout",
        "aiProdAccessRequests",
        "agentThreadContext",
        "appProvisioningEvents",
        "appProvisioningRuns",
      ]),
    );

    const snapshot = await t.run(async (ctx) => {
      const request = await ctx.db.get(ids.requestId);
      const audit = await ctx.db.get(ids.auditId);
      const storage = await ctx.db.system.get("_storage", ids.storageId);
      const stagedStorage = await ctx.db.system.get("_storage", ids.stagedStorageId);
      return {
        audit,
        request,
        stagedStorage,
        storage,
        vault: await ctx.db.get(ids.vaultId),
        branchFilters: await ctx.db
          .query("vaultBranchFilters")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .collect(),
        branchTrees: await ctx.db
          .query("vaultBranchTrees")
          .withIndex("by_vault_and_branch", (q) => q.eq("vaultId", ids.vaultId))
          .collect(),
        prodRequestsForVault: await ctx.db
          .query("aiProdAccessRequests")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .collect(),
      };
    });

    expect(snapshot.vault).toBeNull();
    expect(snapshot.branchFilters).toHaveLength(0);
    expect(snapshot.branchTrees).toHaveLength(0);
    expect(snapshot.prodRequestsForVault).toHaveLength(0);
    expect(snapshot.storage).toBeNull();
    expect(snapshot.stagedStorage).toBeNull();
    expect(snapshot.request).toMatchObject({
      _id: ids.requestId,
      status: "expired",
      scope: "vault",
      error: "Vault was deleted before production access was used.",
    });
    expect(snapshot.request?.vaultId).toBeUndefined();
    expect(snapshot.audit).toMatchObject({
      _id: ids.auditId,
      requestId: ids.requestId,
    });
  });
});
