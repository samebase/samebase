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
        .query("workflow_vaultProvisioning_events")
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

  it("lists observed default-branch folders as repository root suggestions", async () => {
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
    await t.run(async (ctx) => {
      await ctx.db.replace(ids.vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId: ids.runId,
        ghRepoId: "123",
        owner: "ada",
        name: "existing-app",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("observations_vaultRepository_branchTrees", {
        vaultId: ids.vaultId,
        branch: "main",
        commitSHA: "commit",
        lastTreeRefreshAt: 30,
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [
            { path: "docs/readme.md", mode: "100644", type: "blob", sha: "docs-readme" },
            { path: "packages", mode: "040000", type: "tree", sha: "packages" },
            { path: "apps/portal", mode: "040000", type: "tree", sha: "apps-portal" },
            { path: "apps", mode: "040000", type: "tree", sha: "apps" },
          ],
        },
      });
    });
    const asUser = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(
      asUser.query(api.vault.dashboard.listVaultRepositoryFolderSuggestions, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual(["apps", "apps/portal", "packages"]);
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

  it("lists pull request filters in stable vault order", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const firstVaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const secondVaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const vaultIds = [firstVaultId, secondVaultId].sort((left, right) =>
        left.localeCompare(right),
      );

      for (const vaultId of [...vaultIds].reverse()) {
        await ctx.db.insert("ui_vaultPullRequests_filters", {
          userId,
          vaultId,
          hiddenLabels: [`hidden-${vaultId}`],
          includeDrafts: false,
          includeNoLabel: true,
        });
      }

      return { userId, vaultIds };
    });
    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const filters = await asUser.query(api.vault.dashboard.getUserVaultPullRequestFilters);

    expect(filters.map((filter) => filter.vaultId)).toEqual(ids.vaultIds);
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
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
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
        .query("workflow_vaultProvisioning_events")
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
      internal.vault.records.createInitializingSamebaseManagedVaultForUser,
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
        .query("workflow_vaultProvisioning_events")
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
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
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
      await ctx.db.insert("workflow_vaultProvisioning_events", {
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
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
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
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
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
      await ctx.db.insert("observations_vaultRepository_branchTrees", {
        vaultId,
        branch: "main",
        commitSHA: "commit",
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [],
        },
        lastTreeRefreshAt: 29,
      });
      await ctx.db.insert("vaultConvexProjects", {
        vaultId,
        userId,
        convexConfigPath: "convex.json",
        teamId: "provider-state-team-id",
        projectId: "convex-project",
        origin: "provisioned",
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
      hasConvexProvision: true,
      hasCloudflareProvision: false,
      providerSetup: {
        status: "running",
        provider: "cloudflare",
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
      const createRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
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
      const retryRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
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
      await ctx.db.insert("vaultConvexProjects", {
        vaultId,
        userId,
        convexConfigPath: "convex.json",
        teamId: "cloudflare-retry-team-id",
        projectId: "convex-project",
        origin: "provisioned",
      });
      await ctx.db.insert("observations_vaultRepository_branchTrees", {
        vaultId,
        branch: "main",
        commitSHA: "commit",
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [],
        },
        lastTreeRefreshAt: 29,
      });
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
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
      const createRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
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
      const retryRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
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
      await ctx.db.insert("vaultConvexProjects", {
        vaultId,
        userId,
        convexConfigPath: "convex.json",
        teamId: "cloudflare-retry-team-id",
        projectId: "convex-project",
        origin: "provisioned",
      });
      await ctx.db.insert("observations_vaultRepository_branchTrees", {
        vaultId,
        branch: "main",
        commitSHA: "commit",
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [],
        },
        lastTreeRefreshAt: 29,
      });
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        runId: retryRunId,
        state: "failed",
        updatedAt: 44,
      });
      await ctx.db.insert("workflow_vaultProvisioning_events", {
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
        runId: ids.retryRunId,
        step: "attach_worker",
        message: expectedMessage,
        updatedAt: 45,
      },
    });
  });

  it("shows an active provider write lock but recovers after a failed lock", async () => {
    const cases = [
      {
        label: "active",
        writeLockState: "active",
        runState: "running",
        expectedSetup: {
          status: "running",
          provider: "cloudflare",
        },
      },
      {
        label: "failed",
        writeLockState: "failed",
        runState: "failed",
        expectedSetup: {
          status: "ready",
        },
      },
      {
        label: "succeeded",
        writeLockState: "succeeded",
        runState: "succeeded",
        expectedSetup: {
          status: "ready",
        },
      },
      {
        label: "none",
        writeLockState: null,
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
        const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
          userId,
          vaultId,
          repositoryFullName: `ada/provider-${testCase.label}`,
          trigger: "retry",
          state: testCase.runState,
          currentStep: "configure_workers_builds_for_github",
          createdAt: 10,
          updatedAt: 45,
          ...(testCase.runState === "failed" ? { lastError: "Worker setup failed." } : {}),
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
        await ctx.db.insert("vaultConvexProjects", {
          vaultId,
          userId,
          convexConfigPath: "convex.json",
          teamId: `provider-${testCase.label}-team-id`,
          projectId: "convex-project",
          origin: "provisioned",
        });
        await ctx.db.insert("vaultCloudflareWorkers", {
          vaultId,
          userId,
          accountId: "cloudflare-account",
          workerName: `provider-${testCase.label}-worker`,
          workerTag: `provider-${testCase.label}-worker-tag`,
          origin: "provisioned",
        });
        await ctx.db.insert("observations_vaultRepository_branchTrees", {
          vaultId,
          branch: "main",
          commitSHA: "commit",
          treeData: {
            sha: "tree",
            truncated: false,
            tree: [],
          },
          lastTreeRefreshAt: 29,
        });
        if (testCase.writeLockState) {
          await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
            vaultId,
            runId,
            state: testCase.writeLockState,
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

  it("keeps source setup progress visible before provider provisioning starts", async () => {
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
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
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
      await ctx.db.insert("observations_vaultRepository_branchTrees", {
        vaultId,
        branch: "main",
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
      sourceSetup: {
        status: "running",
        runId: ids.runId,
        step: "sync_tree",
        updatedAt: 30,
      },
      providerSetup: { status: "not_applicable" },
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
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
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
      await ctx.db.insert("observations_vaultRepository_branchTrees", {
        vaultId,
        branch: "main",
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

  it("keeps provisioned Convex cleanup available after vault deletion fails", async () => {
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
      const provisioningRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId,
        vaultId,
        repositoryFullName: "ada/delete-retry",
        trigger: "create",
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
        githubMode: "create_repository",
        runId: provisioningRunId,
        ghRepoId: "123",
        owner: "ada",
        name: "delete-retry",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 2,
      });
      await ctx.db.insert("vaultConvexProjects", {
        vaultId,
        userId,
        convexConfigPath: "convex.json",
        teamId: "team-id",
        projectId: "project-id",
        origin: "provisioned",
      });
      const deletionRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "failed",
        userId,
        vaultId,
        repositoryFullName: "ada/delete-retry",
        createdAt: 4,
        updatedAt: 5,
        attempt: { kind: "initial" },
        workflow: { state: "started", workflowId: "delete-workflow" },
        currentStep: "delete_convex",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "samebase_managed_repository",
              ghRepoId: "123",
              owner: "ada",
              name: "delete-retry",
              repositoryFullName: "ada/delete-retry",
            },
            convex: { action: "delete_project", teamId: "team-id", projectId: "project-id" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
        lastError: "Convex deletion failed.",
        completedAt: 5,
      });
      await ctx.db.patch(vaultId, {
        deletion: { state: "delete_failed", runId: deletionRunId, failedAt: 5 },
      });

      return { userId, vaultId };
    });
    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const vaults = await asUser.query(api.vault.dashboard.getUserVaults);

    expect(vaults[0]).toMatchObject({
      _id: ids.vaultId,
      deletion: { state: "delete_failed" },
      hasConvexProvision: true,
      canRemoveConvexProvision: true,
    });
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
        await ctx.db.insert("observations_vaultRepository_branchTrees", {
          vaultId,
          branch: `branch-${index}`,
          commitSHA: `commit-${index}`,
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
      table: "observations_vaultRepository_branchTrees",
      rowsChanged: VAULT_LOCAL_CLEANUP_BATCH_SIZE,
    });
    await expect(
      t.run(async (ctx) => {
        const vault = await ctx.db.get(ids.vaultId);
        const branchTrees = await ctx.db
          .query("observations_vaultRepository_branchTrees")
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

  it("cleans the vault-wide local registry and stored files", async () => {
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
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
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

      await ctx.db.insert("ui_vaultPullRequests_filters", {
        userId,
        vaultId,
        hiddenLabels: [],
        includeDrafts: false,
        includeNoLabel: true,
      });
      await ctx.db.insert("ui_vaultPullRequests_filters", {
        userId: collaboratorId,
        vaultId,
        hiddenLabels: ["wip"],
        includeDrafts: true,
        includeNoLabel: false,
      });
      await ctx.db.insert("ui_vaultResourceLinks_settings", {
        userId,
        vaultId,
        resourceLinksOpen: true,
        updatedAt: 4,
      });
      await ctx.db.insert("vaultStagedFiles", {
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
      await ctx.db.insert("vaultStagedFiles", {
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
      await ctx.db.insert("vaultStagedFileUpdates", {
        vaultId,
        branch: "main",
        filePath: "README.md",
        version: 1,
        clientId: "client-1",
        changes: "[]",
        userId,
        timestamp: 6,
      });
      await ctx.db.insert("observations_vaultFiles_blobs", {
        vaultId,
        sha: "blob-sha",
        size: 6,
        storageId,
        mime: "text/plain",
        ext: "txt",
      });
      await ctx.db.insert("ui_vaultFileTree_folderExpansions", {
        userId: collaboratorId,
        vaultId,
        folderPath: "/",
        isExpanded: true,
      });
      await ctx.db.insert("observations_vaultRepository_branchTrees", {
        vaultId,
        branch: "main",
        commitSHA: "commit",
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [],
        },
        lastTreeRefreshAt: 7,
      });
      await ctx.db.insert("vaultConvexProjects", {
        vaultId,
        userId,
        convexConfigPath: "convex.json",
        teamId: "delete-team-id",
        projectId: "delete-convex-project",
        origin: "provisioned",
      });
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        runId,
        state: "succeeded",
        updatedAt: 9,
      });
      await ctx.db.insert("workflow_vaultProvisioning_events", {
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
        "ui_vaultPullRequests_filters",
        "ui_vaultResourceLinks_settings",
        "vaultStagedFiles",
        "vaultStagedFileUpdates",
        "observations_vaultFiles_blobs",
        "ui_vaultFileTree_folderExpansions",
        "observations_vaultRepository_branchTrees",
        "vaultConvexProjects",
        "workflow_vaultProvisioning_writeLocks",
        "workflow_vaultProvisioning_events",
        "workflow_vaultProvisioning_runs",
      ]),
    );

    const snapshot = await t.run(async (ctx) => {
      const storage = await ctx.db.system.get("_storage", ids.storageId);
      const stagedStorage = await ctx.db.system.get("_storage", ids.stagedStorageId);
      return {
        stagedStorage,
        storage,
        vault: await ctx.db.get(ids.vaultId),
        pullRequestFilters: await ctx.db
          .query("ui_vaultPullRequests_filters")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .collect(),
        resourceLinksState: await ctx.db
          .query("ui_vaultResourceLinks_settings")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .collect(),
        branchTrees: await ctx.db
          .query("observations_vaultRepository_branchTrees")
          .withIndex("by_vault_and_branch", (q) => q.eq("vaultId", ids.vaultId))
          .collect(),
      };
    });

    expect(snapshot.vault).toBeNull();
    expect(snapshot.pullRequestFilters).toHaveLength(0);
    expect(snapshot.resourceLinksState).toHaveLength(0);
    expect(snapshot.branchTrees).toHaveLength(0);
    expect(snapshot.storage).toBeNull();
    expect(snapshot.stagedStorage).toBeNull();
  });
});
