import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
import { readProviderSetupFailedNextAction } from "./dashboard";
import { VAULT_LOCAL_CLEANUP_BATCH_SIZE } from "./deletion/cleanup";

describe("vault dashboard Convex contract", () => {
  it("normalizes app roots and rejects a duplicate identity", async () => {
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
        repositoryFullName: "ada/monorepo",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 10,
        updatedAt: 20,
        completedAt: 20,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "monorepo",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      return { userId, vaultId };
    });
    const user = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const appId = await user.mutation(api.vault.dashboard.createVaultApp, {
      vaultId: ids.vaultId,
      rootDirectory: " apps/web ",
    });
    await expect(
      user.mutation(api.vault.dashboard.createVaultApp, {
        vaultId: ids.vaultId,
        rootDirectory: "apps/web",
      }),
    ).rejects.toThrow("Vault already has this root directory.");

    await expect(t.run(async (ctx) => await ctx.db.get(appId))).resolves.toMatchObject({
      vaultId: ids.vaultId,
      userId: ids.userId,
      rootDirectory: "apps/web",
    });
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("vaultApps")
            .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
            .collect(),
      ),
    ).resolves.toHaveLength(1);
  });

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

  it("exposes user vaults through the MCP user bridge", async () => {
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

    const vaults = await t.query(internal.vault.dashboard.getUserVaultsForUser, {
      userId,
    });

    expect(vaults).toHaveLength(1);
    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      repositoryFullName: "ada/existing-app",
    });
  });

  it("blocks the MCP user bridge for users without dashboard access", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: false,
      });
    });

    await expect(
      t.query(internal.vault.dashboard.getUserVaultsForUser, {
        userId,
      }),
    ).rejects.toThrow("Access denied");
  });

  it("persists vault resource link expansion per user vault", async () => {
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

      return { userId, vaultId };
    });
    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    await expect(asUser.query(api.vault.dashboard.getUserVaultResourceLinksState)).resolves.toEqual(
      [],
    );

    await asUser.mutation(api.vault.dashboard.setVaultResourceLinksOpen, {
      vaultId: ids.vaultId,
      resourceLinksOpen: true,
    });
    await expect(asUser.query(api.vault.dashboard.getUserVaultResourceLinksState)).resolves.toEqual(
      [
        {
          vaultId: ids.vaultId,
          resourceLinksOpen: true,
        },
      ],
    );

    await asUser.mutation(api.vault.dashboard.setVaultResourceLinksOpen, {
      vaultId: ids.vaultId,
      resourceLinksOpen: false,
    });
    await expect(asUser.query(api.vault.dashboard.getUserVaultResourceLinksState)).resolves.toEqual(
      [
        {
          vaultId: ids.vaultId,
          resourceLinksOpen: false,
        },
      ],
    );
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

  it("lists root-directory suggestions from the cached default branch tree", async () => {
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
        repositoryFullName: "ada/demo",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 10,
        updatedAt: 20,
        completedAt: 20,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "demo",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "apps",
        createdAt: 21,
      });
      await ctx.db.insert("vaultBranchTrees", {
        vaultId,
        branch: "main",
        treeSHA: "tree",
        commitSHA: "commit",
        lastTreeRefreshAt: 30,
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [
            { path: "docs/readme.md", mode: "100644", type: "blob", sha: "docs-readme" },
            { path: "apps/samebase", mode: "040000", type: "tree", sha: "apps-samebase" },
            { path: "apps", mode: "040000", type: "tree", sha: "apps" },
            { path: "packages", mode: "040000", type: "tree", sha: "packages" },
          ],
        },
      });

      return { userId, vaultId };
    });
    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    await expect(
      asUser.query(api.vault.dashboard.listVaultRootDirectorySuggestions, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual(["apps/samebase", "packages"]);
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
      internal.vault.records.createInitializingSamebaseManagedVaultForUser,
      {
        userId,
        ghRepoOwner: "ada",
        ghRepoName: "early-vault",
        visibility: "private",
        convexTeamId: "convex-team",
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
        message: "Created the initializing Samebase vault.",
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
        currentStep: "attach_worker",
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
      const appId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "/",
        createdAt: 23,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        upstream: { state: "present" },
        vaultId,
        userId,
        appId,
        teamId: "convex-team",
        projectId: "convex-project",
        teamSlug: "provider-state-team",
        projectSlug: "provider-state-project",
        deploymentName: "provider-state-prod",
        deploymentType: "prod",
        cloudUrl: "https://provider-state.convex.cloud",
        siteUrl: "https://provider-state.convex.site",
        origin: "provisioned",
        connectedAt: 24,
        lastObservedAt: 24,
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
      removableConvexProjectCount: 1,
      removableCloudflareWorkerCount: 0,
      providerSetup: {
        status: "running",
        provider: "cloudflare",
        source: "managed",
        runId: ids.runId,
        step: "attach_worker",
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
        currentStep: "attach_worker",
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
      });
      const appId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "/",
        createdAt: 23,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        upstream: { state: "present" },
        vaultId,
        userId,
        appId,
        teamId: "convex-team",
        projectId: "convex-project",
        teamSlug: "cloudflare-retry-team",
        projectSlug: "cloudflare-retry-project",
        deploymentName: "cloudflare-retry-prod",
        deploymentType: "prod",
        cloudUrl: "https://cloudflare-retry.convex.cloud",
        siteUrl: "https://cloudflare-retry.convex.site",
        origin: "provisioned",
        connectedAt: 24,
        lastObservedAt: 24,
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
        source: "managed",
        runId: ids.retryRunId,
        step: "attach_worker",
        updatedAt: 45,
      },
    });
  });

  it("uses the failed provider run lastError instead of reconstructing from events", async () => {
    const t = makeConvexTest();
    const expectedMessage =
      "Cloudflare Workers and Pages GitHub App is not authorized for ada/cloudflare-retry. Follow Cloudflare's recovery steps at https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#reinstall-the-cloudflare-github-app: uninstall the GitHub App first, then reinstall/connect GitHub from Workers & Pages and include ada/cloudflare-retry, then retry.";
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
        state: "failed",
        currentStep: "attach_worker",
        lastError: expectedMessage,
        createdAt: 40,
        updatedAt: 45,
        completedAt: 45,
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
      });
      const appId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "/",
        createdAt: 23,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        upstream: { state: "present" },
        vaultId,
        userId,
        appId,
        teamId: "convex-team",
        projectId: "convex-project",
        teamSlug: "cloudflare-retry-team",
        projectSlug: "cloudflare-retry-project",
        deploymentName: "cloudflare-retry-prod",
        deploymentType: "prod",
        cloudUrl: "https://cloudflare-retry.convex.cloud",
        siteUrl: "https://cloudflare-retry.convex.site",
        origin: "provisioned",
        connectedAt: 24,
        lastObservedAt: 24,
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
        state: "failed",
        updatedAt: 44,
      });
      await ctx.db.insert("appProvisioningEvents", {
        userId,
        vaultId,
        repositoryFullName: "ada/cloudflare-retry",
        runId: retryRunId,
        step: "attach_worker",
        level: "error",
        message: "Provisioning failed during attach_worker.",
        createdAt: 45,
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
        status: "failed",
        provider: "cloudflare",
        source: "managed",
        runId: ids.retryRunId,
        step: "attach_worker",
        message: expectedMessage,
        updatedAt: 45,
      },
    });
  });

  it("shows an active manual Cloudflare Worker connection on existing-repository vaults", async () => {
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
      const sourceRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/existing-cloudflare",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 10,
        updatedAt: 20,
        completedAt: 20,
      });
      const cloudflareRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/existing-cloudflare",
        trigger: "connect_cloudflare_worker",
        state: "running",
        currentStep: "attach_worker",
        createdAt: 30,
        updatedAt: 40,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId: sourceRunId,
        ghRepoId: "123",
        owner: "ada",
        name: "existing-cloudflare",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 22,
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
        lastTreeRefreshAt: 24,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId: cloudflareRunId,
        state: "active",
        updatedAt: 35,
      });

      return { cloudflareRunId, userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const vaults = await asUser.query(api.vault.dashboard.getUserVaults);

    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      isSamebaseManaged: false,
      providerSetup: {
        status: "running",
        provider: "cloudflare",
        source: "manual",
        runId: ids.cloudflareRunId,
        step: "attach_worker",
        updatedAt: 40,
      },
    });
  });

  it("keeps failed manual Convex ownership on the Convex provider row after attach", async () => {
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
      const sourceRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/existing-convex",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 10,
        updatedAt: 20,
        completedAt: 20,
      });
      const convexRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/existing-convex",
        trigger: "connect_convex_deployment",
        state: "failed",
        currentStep: "finish",
        lastError: "Convex finish failed.",
        createdAt: 30,
        updatedAt: 40,
        completedAt: 40,
      });

      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId: sourceRunId,
        ghRepoId: "123",
        owner: "ada",
        name: "existing-convex",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 22,
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
        lastTreeRefreshAt: 24,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId: convexRunId,
        state: "failed",
        updatedAt: 38,
      });

      return { convexRunId, userId, vaultId };
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
        source: "manual",
        runId: ids.convexRunId,
        step: "finish",
        updatedAt: 40,
      },
    });
  });

  it("keeps active and failed provider ownership visible when resources exist", async () => {
    const cases = [
      {
        label: "active",
        ownershipState: "active",
        runState: "running",
        expectedSetup: {
          status: "running",
          provider: "cloudflare",
          source: "managed",
        },
      },
      {
        label: "failed",
        ownershipState: "failed",
        runState: "failed",
        expectedSetup: {
          status: "failed",
          provider: "cloudflare",
          source: "managed",
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
        });
        const appId = await ctx.db.insert("vaultApps", {
          vaultId,
          userId,
          rootDirectory: "/",
          createdAt: 23,
        });
        await ctx.db.insert("vaultConvexDeployments", {
          upstream: { state: "present" },
          vaultId,
          userId,
          appId,
          teamId: "convex-team",
          projectId: "convex-project",
          teamSlug: `provider-${testCase.label}-team`,
          projectSlug: `provider-${testCase.label}-project`,
          deploymentName: `provider-${testCase.label}-prod`,
          deploymentType: "prod",
          cloudUrl: `https://provider-${testCase.label}.convex.cloud`,
          siteUrl: `https://provider-${testCase.label}.convex.site`,
          origin: "provisioned",
          connectedAt: 24,
          lastObservedAt: 24,
        });
        await ctx.db.insert("vaultCloudflareWorkers", {
          upstream: { state: "present" },
          vaultId,
          userId,
          appId,
          accountId: "cloudflare-account",
          workerName: `provider-${testCase.label}-worker`,
          workerTag: `provider-${testCase.label}-worker-tag`,
          workersDev: {
            state: "available",
            url: `https://provider-${testCase.label}.example.workers.dev`,
          },
          origin: "provisioned",
          builds: { state: "not_connected" },
          connectedAt: 26,
          lastObservedAt: 26,
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
        source: "managed",
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
        status: "not_applicable",
      },
    });
  });

  it("returns Convex deployment dashboard metadata", async () => {
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
      });
      const appId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "/",
        createdAt: 24,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        upstream: { state: "present" },
        vaultId,
        userId,
        appId,
        teamId: "convex-team",
        projectId: "project-1",
        teamSlug: "demo-team",
        projectSlug: "demo-project",
        deploymentName: "demo-production",
        deploymentType: "prod",
        cloudUrl: "https://demo-production.convex.cloud",
        siteUrl: "https://demo-production.convex.site",
        origin: "provisioned",
        connectedAt: 25,
        lastObservedAt: 25,
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

      return { appId, userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const vaults = await asUser.query(api.vault.dashboard.getUserVaults);

    expect(vaults[0]?.convexDeployments[0]).toMatchObject({
      appId: ids.appId,
      projectId: "project-1",
      projectSlug: "demo-project",
      teamSlug: "demo-team",
      projectSettingsDashboardUrl: "https://dashboard.convex.dev/t/demo-team/demo-project/settings",
      deploymentDashboardUrl:
        "https://dashboard.convex.dev/t/demo-team/demo-project/demo-production",
    });
  });

  it("keeps web, mobile, and shared backend apps distinct", async () => {
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
        repositoryFullName: "samebase/shared-convex-monorepo-fixture",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 10,
        updatedAt: 20,
        completedAt: 20,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId,
        ghRepoId: "shared-convex-monorepo",
        owner: "samebase",
        name: "shared-convex-monorepo-fixture",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      const webAppId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "apps/web",
        createdAt: 21,
      });
      const mobileAppId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "apps/mobile",
        createdAt: 22,
      });
      const backendAppId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "packages/backend",
        createdAt: 23,
      });
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        upstream: { state: "present" },
        vaultId,
        userId,
        appId: webAppId,
        accountId: "cloudflare-account",
        workerName: "fixture-web",
        workerTag: "fixture-web-tag",
        workersDev: { state: "available", url: "https://fixture-web.example.workers.dev" },
        origin: "selected_existing",
        builds: {
          state: "connected",
          production: {
            triggerUuid: "fixture-production-trigger",
            buildTokenUuid: "fixture-production-token",
          },
          preview: {
            triggerUuid: "fixture-preview-trigger",
            buildTokenUuid: "fixture-preview-token",
          },
        },
        connectedAt: 24,
        lastObservedAt: 24,
      });
      const convexDeploymentId = await ctx.db.insert("vaultConvexDeployments", {
        upstream: { state: "present" },
        vaultId,
        userId,
        appId: backendAppId,
        teamId: "convex-team",
        projectId: "fixture-backend-project",
        teamSlug: "samebase",
        projectSlug: "fixture-backend",
        deploymentName: "fixture-backend-production",
        deploymentType: "prod",
        cloudUrl: "https://fixture-backend.convex.cloud",
        siteUrl: "https://fixture-backend.convex.site",
        origin: "selected_existing",
        connectedAt: 25,
        lastObservedAt: 25,
      });
      const dependencyId = await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId,
        userId,
        workerId,
        convexDeploymentId,
        wiring: {
          state: "wired",
          deployKeys: {
            production: {
              state: "created",
              teamId: "convex-team",
              name: "fixture-production-key",
              deploymentName: "fixture-backend-production",
            },
            preview: {
              state: "created",
              teamId: "convex-team",
              name: "fixture-preview-key",
              projectId: "fixture-backend-project",
            },
          },
        },
        createdAt: 26,
        updatedAt: 26,
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
        lastTreeRefreshAt: 27,
      });

      return {
        backendAppId,
        convexDeploymentId,
        dependencyId,
        mobileAppId,
        userId,
        vaultId,
        webAppId,
        workerId,
      };
    });
    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const [vault] = await asUser.query(api.vault.dashboard.getUserVaults);

    expect(vault.apps).toEqual([
      { appId: ids.mobileAppId, rootDirectory: "apps/mobile" },
      { appId: ids.webAppId, rootDirectory: "apps/web" },
      { appId: ids.backendAppId, rootDirectory: "packages/backend" },
    ]);
    expect(vault.cloudflareWorkers).toMatchObject([
      {
        workerId: ids.workerId,
        appId: ids.webAppId,
        workerName: "fixture-web",
      },
    ]);
    expect(vault.convexDeployments).toMatchObject([
      {
        convexDeploymentId: ids.convexDeploymentId,
        appId: ids.backendAppId,
        projectId: "fixture-backend-project",
      },
    ]);
    expect(vault.workerDeploymentDependencies).toEqual([
      {
        dependencyId: ids.dependencyId,
        workerId: ids.workerId,
        convexDeploymentId: ids.convexDeploymentId,
        wiring: { state: "wired" },
      },
    ]);
  });

  it("exposes missing-upstream provider resources with repair actions", async () => {
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
        repositoryFullName: "ada/upstream-state",
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
        name: "upstream-state",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      const manualConvexAppId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "apps/manual-convex",
        createdAt: 21,
      });
      const managedConvexAppId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "apps/managed-convex",
        createdAt: 21,
      });
      const manualWorkerAppId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "apps/manual-worker",
        createdAt: 21,
      });
      const managedWorkerAppId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "apps/managed-worker",
        createdAt: 21,
      });
      for (const [rootDirectory, appId] of [
        ["apps/manual-convex", manualConvexAppId],
        ["apps/managed-convex", managedConvexAppId],
      ] as const) {
        await ctx.db.insert("vaultConvexDeployments", {
          vaultId,
          userId,
          appId,
          teamId: "convex-team",
          projectId: `${rootDirectory}-project`,
          teamSlug: "ada-team",
          projectSlug: rootDirectory.replace("/", "-"),
          deploymentName: `${rootDirectory.replace("/", "-")}-production`,
          deploymentType: "prod",
          cloudUrl: `https://${rootDirectory.replace("/", "-")}.convex.cloud`,
          siteUrl: `https://${rootDirectory.replace("/", "-")}.convex.site`,
          upstream: { state: "missing_upstream" },
          origin: rootDirectory === "apps/managed-convex" ? "provisioned" : "selected_existing",
          connectedAt: 25,
          lastObservedAt: 25,
        });
      }
      for (const [rootDirectory, appId] of [
        ["apps/manual-worker", manualWorkerAppId],
        ["apps/managed-worker", managedWorkerAppId],
      ] as const) {
        await ctx.db.insert("vaultCloudflareWorkers", {
          vaultId,
          userId,
          appId,
          accountId: "cloudflare-account",
          workerName: `${rootDirectory.replace("/", "-")}-worker`,
          workerTag: `${rootDirectory.replace("/", "-")}-tag`,
          workersDev: {
            state: "available",
            url: `https://${rootDirectory.replace("/", "-")}.example.workers.dev`,
          },
          origin: rootDirectory === "apps/managed-worker" ? "provisioned" : "selected_existing",
          upstream: { state: "missing_upstream" },
          builds: { state: "not_connected" },
          connectedAt: 26,
          lastObservedAt: 26,
        });
      }
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
    expect(vaults).toHaveLength(1);
    const rootDirectoryByAppId = new Map(
      vaults[0].apps.map((app) => [app.appId, app.rootDirectory]),
    );
    const convexByRoot = new Map(
      vaults[0].convexDeployments.map((deployment) => [
        rootDirectoryByAppId.get(deployment.appId),
        deployment,
      ]),
    );
    const workersByRoot = new Map(
      vaults[0].cloudflareWorkers.map((worker) => [rootDirectoryByAppId.get(worker.appId), worker]),
    );

    expect(convexByRoot.get("apps/manual-convex")).toMatchObject({
      upstream: {
        state: "missing_upstream",
        nextAction: "connect_convex_deployment",
      },
    });
    expect(convexByRoot.get("apps/managed-convex")).toMatchObject({
      upstream: {
        state: "missing_upstream",
        nextAction: "retry_infrastructure_provisioning",
      },
    });
    expect(workersByRoot.get("apps/manual-worker")).toMatchObject({
      upstream: {
        state: "missing_upstream",
        nextAction: "connect_cloudflare_worker",
      },
    });
    expect(workersByRoot.get("apps/managed-worker")).toMatchObject({
      upstream: {
        state: "missing_upstream",
        nextAction: "retry_infrastructure_provisioning",
      },
    });
  });

  it("exposes Worker GitHub and explicit Convex dependency repair states", async () => {
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
        repositoryFullName: "ada/cloudflare-state",
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
        name: "cloudflare-state",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });

      const rootAppId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "/",
        createdAt: 21,
      });
      const apiAppId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "apps/api",
        createdAt: 21,
      });
      const webAppId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "apps/web",
        createdAt: 21,
      });
      const apiDeploymentId = await ctx.db.insert("vaultConvexDeployments", {
        upstream: { state: "present" },
        vaultId,
        userId,
        appId: apiAppId,
        teamId: "convex-team",
        projectId: "api-project",
        teamSlug: "ada-team",
        projectSlug: "api-project",
        deploymentName: "api-production",
        deploymentType: "prod",
        cloudUrl: "https://api.convex.cloud",
        siteUrl: "https://api.convex.site",
        origin: "provisioned",
        connectedAt: 25,
        lastObservedAt: 25,
      });
      const webDeploymentId = await ctx.db.insert("vaultConvexDeployments", {
        vaultId,
        userId,
        appId: webAppId,
        teamId: "convex-team",
        projectId: "web-project",
        teamSlug: "ada-team",
        projectSlug: "web-project",
        deploymentName: "web-production",
        deploymentType: "prod",
        cloudUrl: "https://web.convex.cloud",
        siteUrl: "https://web.convex.site",
        origin: "provisioned",
        upstream: { state: "missing_upstream" },
        connectedAt: 25,
        lastObservedAt: 25,
      });
      const connectedBuilds = {
        state: "connected" as const,
        production: {
          triggerUuid: "production-trigger",
          buildTokenUuid: "production-token",
        },
        preview: {
          triggerUuid: "preview-trigger",
          buildTokenUuid: "preview-token",
        },
      };
      const notConnectedWorkerId = await ctx.db.insert("vaultCloudflareWorkers", {
        upstream: { state: "present" },
        vaultId,
        userId,
        appId: rootAppId,
        accountId: "cloudflare-account",
        workerName: "not-connected-worker",
        workerTag: "not-connected-worker-tag",
        workersDev: {
          state: "available",
          url: "https://not-connected-worker.example.workers.dev",
        },
        origin: "provisioned",
        builds: { state: "not_connected" },
        connectedAt: 26,
        lastObservedAt: 26,
      });
      const missingKeysWorkerId = await ctx.db.insert("vaultCloudflareWorkers", {
        upstream: { state: "present" },
        vaultId,
        userId,
        appId: apiAppId,
        accountId: "cloudflare-account",
        workerName: "missing-keys-worker",
        workerTag: "missing-keys-worker-tag",
        workersDev: {
          state: "available",
          url: "https://missing-keys-worker.example.workers.dev",
        },
        origin: "provisioned",
        builds: connectedBuilds,
        connectedAt: 27,
        lastObservedAt: 27,
      });
      const setKeysWorkerId = await ctx.db.insert("vaultCloudflareWorkers", {
        upstream: { state: "present" },
        vaultId,
        userId,
        appId: webAppId,
        accountId: "cloudflare-account",
        workerName: "set-keys-worker",
        workerTag: "set-keys-worker-tag",
        workersDev: { state: "available", url: "https://set-keys-worker.example.workers.dev" },
        origin: "provisioned",
        builds: {
          ...connectedBuilds,
          production: {
            triggerUuid: "web-production-trigger",
            buildTokenUuid: "web-production-token",
          },
          preview: {
            triggerUuid: "web-preview-trigger",
            buildTokenUuid: "web-preview-token",
          },
        },
        connectedAt: 28,
        lastObservedAt: 28,
      });
      await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId,
        userId,
        workerId: missingKeysWorkerId,
        convexDeploymentId: apiDeploymentId,
        wiring: {
          state: "not_wired",
          deployKeys: {
            production: { state: "not_created" },
            preview: { state: "not_created" },
          },
        },
        createdAt: 29,
        updatedAt: 29,
      });
      await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId,
        userId,
        workerId: setKeysWorkerId,
        convexDeploymentId: webDeploymentId,
        wiring: {
          state: "wired",
          deployKeys: {
            production: {
              state: "created",
              teamId: "convex-team",
              name: "web-production-key",
              deploymentName: "shared-prod",
            },
            preview: {
              state: "created",
              teamId: "convex-team",
              name: "web-preview-key",
              projectId: "shared-project",
            },
          },
        },
        createdAt: 29,
        updatedAt: 29,
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

      return {
        apiDeploymentId,
        missingKeysWorkerId,
        notConnectedWorkerId,
        setKeysWorkerId,
        userId,
        vaultId,
        webDeploymentId,
      };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const [vault] = await asUser.query(api.vault.dashboard.getUserVaults);
    const workersById = new Map(vault.cloudflareWorkers.map((worker) => [worker.workerId, worker]));
    const dependenciesByWorkerId = new Map(
      vault.workerDeploymentDependencies.map((dependency) => [dependency.workerId, dependency]),
    );

    expect(workersById.get(ids.notConnectedWorkerId)).toMatchObject({
      githubRepositoryConnection: {
        state: "not_connected",
        nextAction: "wire_builds",
      },
    });
    expect(workersById.get(ids.missingKeysWorkerId)).toMatchObject({
      githubRepositoryConnection: { state: "connected" },
    });
    expect(dependenciesByWorkerId.get(ids.missingKeysWorkerId)).toMatchObject({
      convexDeploymentId: ids.apiDeploymentId,
      wiring: {
        state: "not_wired",
        nextAction: "wire_convex_build_access",
      },
    });
    expect(workersById.get(ids.setKeysWorkerId)).toMatchObject({
      githubRepositoryConnection: { state: "connected" },
    });
    expect(dependenciesByWorkerId.get(ids.setKeysWorkerId)).toMatchObject({
      convexDeploymentId: ids.webDeploymentId,
      wiring: {
        state: "not_wired",
        nextAction: "wire_convex_build_access",
      },
    });
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
      });
      const appId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "/",
        createdAt: 25,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        upstream: { state: "present" },
        vaultId,
        userId,
        appId,
        accountId: "cloudflare-account",
        workerName: "domain-order-worker",
        workerTag: "domain-order-worker-tag",
        workersDev: { state: "available", url: "https://domain-order.example.workers.dev" },
        origin: "provisioned",
        builds: { state: "not_connected" },
        connectedAt: 26,
        lastObservedAt: 26,
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
      await ctx.db.insert("vaultResourceLinksState", {
        userId,
        vaultId,
        resourceLinksOpen: true,
        updatedAt: 4,
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
        defaultRank: 0,
        stateRank: 0,
        commitRank: Number.MAX_SAFE_INTEGER,
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
      const appId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "/",
        createdAt: 9,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        upstream: { state: "present" },
        vaultId,
        userId,
        appId,
        teamId: "convex-team",
        projectId: "delete-convex-project",
        teamSlug: "delete-team",
        projectSlug: "delete-convex",
        deploymentName: "delete-convex-prod",
        deploymentType: "prod",
        cloudUrl: "https://delete-convex.convex.cloud",
        siteUrl: "https://delete-convex.convex.site",
        origin: "provisioned",
        connectedAt: 9,
        lastObservedAt: 9,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId,
        runId,
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
      await ctx.db.insert("chatMessageMetadata", {
        messageId: "message-1",
        threadId: "thread-1",
        type: "tool_activity",
        payloadJson: "{}",
        createdAt: 12,
      });
      await ctx.db.insert("repositoryRefreshRequests", {
        userId,
        vaultId,
        dedupeKey: `${vaultId}:main`,
        demand: { scope: "branch", branch: "main", source: "file_view" },
        lifecycle: { state: "canceled", canceledAt: 12, reason: "vault_deleting" },
        createdAt: 12,
        updatedAt: 12,
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
    await expect(
      t.mutation(internal.chat.index.saveMessageMetadataInternal, {
        messageId: "late-message",
        threadId: "thread-1",
        type: "tool_activity",
        payloadJson: "{}",
      }),
    ).rejects.toThrow("Agent thread context not found.");
    expect(tables).toEqual(
      expect.arrayContaining([
        "vaultBranchFilters",
        "vaultResourceLinksState",
        "fileStaging",
        "collaborativeUpdates",
        "blobs",
        "folderExpansionState",
        "vaultRemoteBranches",
        "vaultBranchTrees",
        "vaultDomains",
        "vaultConvexDeployments",
        "vaultApps",
        "vaultInfrastructureOwnership",
        "codespaces",
        "agentGraphNodeLayout",
        "aiProdAccessRequests",
        "agentThreadContext",
        "repositoryRefreshRequests",
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
        resourceLinksState: await ctx.db
          .query("vaultResourceLinksState")
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
        refreshRequests: await ctx.db
          .query("repositoryRefreshRequests")
          .withIndex("by_vaultId_and_updatedAt", (q) => q.eq("vaultId", ids.vaultId))
          .collect(),
        threadMetadata: await ctx.db
          .query("chatMessageMetadata")
          .withIndex("by_threadId", (q) => q.eq("threadId", "thread-1"))
          .collect(),
      };
    });

    expect(snapshot.vault).toBeNull();
    expect(snapshot.branchFilters).toHaveLength(0);
    expect(snapshot.resourceLinksState).toHaveLength(0);
    expect(snapshot.branchTrees).toHaveLength(0);
    expect(snapshot.prodRequestsForVault).toHaveLength(0);
    expect(snapshot.refreshRequests).toHaveLength(0);
    expect(snapshot.threadMetadata).toHaveLength(0);
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

describe("provider setup failed nextAction", () => {
  it("maps managed failures to the run retry regardless of trigger", () => {
    expect(readProviderSetupFailedNextAction({ provider: "convex", source: "managed" })).toBe(
      "retry_infrastructure_provisioning",
    );
    expect(
      readProviderSetupFailedNextAction({
        provider: "cloudflare",
        source: "managed",
        trigger: "create",
      }),
    ).toBe("retry_infrastructure_provisioning");
  });

  it("maps failed manual runs to the action that failed, by trigger", () => {
    expect(
      readProviderSetupFailedNextAction({
        provider: "convex",
        source: "manual",
        trigger: "connect_convex_deployment",
      }),
    ).toBe("connect_convex_deployment");
    expect(
      readProviderSetupFailedNextAction({
        provider: "cloudflare",
        source: "manual",
        trigger: "connect_cloudflare_worker",
      }),
    ).toBe("connect_cloudflare_worker");
    expect(
      readProviderSetupFailedNextAction({
        provider: "cloudflare",
        source: "manual",
        trigger: "wire_builds",
      }),
    ).toBe("wire_builds");
    expect(
      readProviderSetupFailedNextAction({
        provider: "cloudflare",
        source: "manual",
        trigger: "wire_convex_build_access",
      }),
    ).toBe("wire_convex_build_access");
    expect(
      readProviderSetupFailedNextAction({
        provider: "cloudflare",
        source: "manual",
        trigger: "verify_infrastructure",
      }),
    ).toBe("verify_infrastructure");
  });

  it("falls back to the provider's connect flow when the run row is missing", () => {
    expect(readProviderSetupFailedNextAction({ provider: "convex", source: "manual" })).toBe(
      "connect_convex_deployment",
    );
    expect(readProviderSetupFailedNextAction({ provider: "cloudflare", source: "manual" })).toBe(
      "connect_cloudflare_worker",
    );
  });
});
