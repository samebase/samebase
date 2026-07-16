import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
import { readProviderSetupFailedNextAction } from "./dashboard";
import { VAULT_LOCAL_CLEANUP_BATCH_SIZE } from "./deletion/cleanup";

const appRoot = ".";

describe("vault dashboard Convex contract", () => {
  it("fails the legacy all-vault aggregate above its hard read bound", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      for (let index = 0; index < 26; index += 1) {
        await ctx.db.insert("vaults", {
          userId,
          deletion: { state: "not_deleting" },
          state: "not_connected",
        });
      }
      return userId;
    });
    const asUser = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(asUser.query(api.vault.dashboard.getUserVaults)).rejects.toThrow(
      "The legacy vault aggregate supports at most 25 vaults.",
    );
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
        ghRepoId: "existing-app-initializing-id",
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
      ghRepoId: "existing-app-initializing-id",
      routeRepositoryKey: "ada/existing-app",
      routeOwner: "Ada",
      routeName: "Existing-App",
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
        ghRepoId: "existing-app-running-id",
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
      routeRepositoryFullName: "ada/existing-app",
      githubRepositoryFullName: "ada/existing-app",
      state: "copying_files",
      sourceSetup: {
        status: "running",
        runId: ids.runId,
        step: "run_created",
        updatedAt: expect.any(Number),
      },
    });
  });

  it("returns one user vault by repository with the list query's exact result", async () => {
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
        ghRepoId: "123",
        ghRepoOwner: "ada",
        ghRepoName: "existing-app",
      },
    );
    await t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
      userId,
      vaultId: ids.vaultId,
      runId: ids.runId,
      ghRepoId: "123",
      ghRepoNodeId: "R_123",
      ghRepoOwner: "ada",
      ghRepoName: "existing-app",
      defaultBranch: "main",
      visibility: "public",
    });
    const asUser = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });

    const [selectedVault, observationTarget, vaults] = await Promise.all([
      asUser.query(api.vault.dashboard.getUserVaultByRepository, {
        repositoryFullName: "ADA/EXISTING-APP",
      }),
      asUser.query(api.vault.dashboard.getRepositoryObservationTargetByRepository, {
        repositoryFullName: "ADA/EXISTING-APP",
      }),
      asUser.query(api.vault.dashboard.getUserVaults),
    ]);

    expect(selectedVault).toEqual(vaults[0]);
    expect(selectedVault).toMatchObject({
      _id: ids.vaultId,
      hasConnectedGitHubRepository: true,
      routeRepositoryFullName: "ada/existing-app",
      githubRepositoryFullName: "ada/existing-app",
      state: "copying_files",
    });
    expect(observationTarget).toEqual({ vaultId: ids.vaultId });
  });

  it("returns null when the user has no vault for the repository", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
    });
    const asUser = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(
      asUser.query(api.vault.dashboard.getUserVaultByRepository, {
        repositoryFullName: "ada/missing",
      }),
    ).resolves.toBeNull();
  });

  it("does not return another user's vault by repository", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const ownerUserId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const viewerUserId = await ctx.db.insert("users", {
        name: "Grace",
        email: "grace@example.com",
        isApproved: true,
      });
      return { ownerUserId, viewerUserId };
    });
    await t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
      userId: ids.ownerUserId,
      ghRepoId: "other-user-existing-app-id",
      ghRepoOwner: "ada",
      ghRepoName: "existing-app",
    });
    const asOtherUser = t.withIdentity({
      subject: `${ids.viewerUserId}|test-session`,
      tokenIdentifier: `test:${ids.viewerUserId}`,
    });

    await expect(
      asOtherUser.query(api.vault.dashboard.getUserVaultByRepository, {
        repositoryFullName: "ada/existing-app",
      }),
    ).resolves.toBeNull();
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
        ghRepoId: "mcp-existing-app-id",
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
      routeRepositoryFullName: "ada/existing-app",
      githubRepositoryFullName: "ada/existing-app",
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

  it("rejects duplicate stable GitHub repository identities", async () => {
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
      ghRepoId: "duplicate-repository-id",
      ghRepoOwner: "Ada",
      ghRepoName: "Existing-App",
    });

    await expect(
      t.mutation(internal.vault.records.createInitializingExistingRepositoryVaultForUser, {
        userId,
        ghRepoId: "duplicate-repository-id",
        ghRepoOwner: "Renamed-Owner",
        ghRepoName: "Renamed-App",
      }),
    ).rejects.toThrow("Vault already exists for this GitHub repository.");
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
        ghRepoId: "123",
        ghRepoOwner: "ada",
        ghRepoName: "existing-app",
      },
    );

    await t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId,
      ghRepoId: "123",
      ghRepoNodeId: "R_123",
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
      ghRepoNodeId: "R_123",
      githubOwner: "Ada",
      githubName: "Existing-App",
      routeRepositoryKey: "ada/existing-app",
      routeOwner: "ada",
      routeName: "existing-app",
      defaultBranch: "main",
      visibility: "private",
    });

    await expect(
      t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId,
        ghRepoId: "123",
        ghRepoNodeId: "R_different",
        ghRepoOwner: "Ada",
        ghRepoName: "Existing-App",
        defaultBranch: "main",
        visibility: "private",
      }),
    ).rejects.toThrow("Connected vault repository identity cannot be changed.");
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
        ghRepoId: "missing-repo-id",
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
      ghRepoId: "missing-repo-id",
      routeRepositoryKey: "ada/missing-repo",
      routeOwner: "ada",
      routeName: "missing-repo",
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "imported",
        routeRepositoryKey: "ada/imported",
        routeOwner: "ada",
        routeName: "imported",
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
      routeRepositoryFullName: "ada/imported",
      githubRepositoryFullName: "ada/imported",
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

  it("converts a root app to a folder app when no root providers exist", async () => {
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "demo",
        routeRepositoryKey: "ada/demo",
        routeOwner: "ada",
        routeName: "demo",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        appRoot,
        createdAt: 21,
      });
      await ctx.db.insert("vaultInfrastructureTargets", {
        vaultId,
        appRoot,
        convex: {
          state: "planned",
          projectName: "demo",
        },
        cloudflare: {
          state: "planned",
          accountId: "cloudflare-account",
          workerName: "demo",
          build: {
            rootDirectory: "/",
            buildCommand: "pnpm run build",
            deployCommand: "pnpm run deploy",
            previewDeployCommand: "pnpm run deploy:preview",
            pathIncludes: ["*"],
            pathExcludes: [],
          },
        },
        createdAt: 22,
        updatedAt: 22,
      });

      return { userId, vaultId };
    });
    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    await asUser.mutation(api.vault.dashboard.createVaultAppRoot, {
      vaultId: ids.vaultId,
      appRoot: "apps/samebase",
    });

    const appRoots = await t.run(async (ctx) => {
      const apps = await ctx.db
        .query("vaultApps")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
      return apps.map((app) => app.appRoot).sort();
    });

    expect(appRoots).toEqual(["apps/samebase"]);
  });

  it("lists app-root folder suggestions from the cached default branch tree", async () => {
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "demo",
        routeRepositoryKey: "ada/demo",
        routeOwner: "ada",
        routeName: "demo",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        appRoot: "apps",
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
      asUser.query(api.vault.dashboard.listVaultAppRootFolderSuggestions, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual(["apps/samebase", "packages"]);
  });

  it("blocks monorepo conversion while root providers are attached", async () => {
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "demo",
        routeRepositoryKey: "ada/demo",
        routeOwner: "ada",
        routeName: "demo",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        appRoot,
        createdAt: 21,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId,
        userId,
        appRoot,
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "demo",
        deploymentName: "demo-prod",
        deploymentType: "prod",
        cloudUrl: "https://demo.convex.cloud",
        siteUrl: "https://demo.convex.site",
        previewDeployment: { state: "not_ensured" },
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
        origin: "selected_existing",
        connectedAt: 22,
        lastObservedAt: 22,
      });

      return { userId, vaultId };
    });
    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    await expect(
      asUser.mutation(api.vault.dashboard.createVaultAppRoot, {
        vaultId: ids.vaultId,
        appRoot: "apps/samebase",
      }),
    ).rejects.toThrow("Disconnect root providers before converting this vault to a monorepo.");
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
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      return { events, run, vault };
    });

    expect(result.vault).toMatchObject({
      state: "provisioning",
      githubMode: "create_repository",
      runId: ids.runId,
      routeOwner: "ada",
      routeName: "early-vault",
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "source-setup-failed",
        routeRepositoryKey: "ada/source-setup-failed",
        routeOwner: "ada",
        routeName: "source-setup-failed",
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
      routeRepositoryFullName: "ada/source-setup-failed",
      githubRepositoryFullName: "ada/source-setup-failed",
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "missing-run",
        routeRepositoryKey: "ada/missing-run",
        routeOwner: "ada",
        routeName: "missing-run",
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "provider-state",
        routeRepositoryKey: "ada/provider-state",
        routeOwner: "ada",
        routeName: "provider-state",
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
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId,
        userId,
        appRoot,
        projectId: "convex-project",
        teamSlug: "provider-state-team",
        projectSlug: "provider-state-project",
        deploymentName: "provider-state-prod",
        deploymentType: "prod",
        cloudUrl: "https://provider-state.convex.cloud",
        siteUrl: "https://provider-state.convex.site",
        previewDeployment: { state: "not_ensured" },
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "cloudflare-retry",
        routeRepositoryKey: "ada/cloudflare-retry",
        routeOwner: "ada",
        routeName: "cloudflare-retry",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId,
        userId,
        appRoot,
        projectId: "convex-project",
        teamSlug: "cloudflare-retry-team",
        projectSlug: "cloudflare-retry-project",
        deploymentName: "cloudflare-retry-prod",
        deploymentType: "prod",
        cloudUrl: "https://cloudflare-retry.convex.cloud",
        siteUrl: "https://cloudflare-retry.convex.site",
        previewDeployment: { state: "not_ensured" },
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "cloudflare-retry",
        routeRepositoryKey: "ada/cloudflare-retry",
        routeOwner: "ada",
        routeName: "cloudflare-retry",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId,
        userId,
        appRoot,
        projectId: "convex-project",
        teamSlug: "cloudflare-retry-team",
        projectSlug: "cloudflare-retry-project",
        deploymentName: "cloudflare-retry-prod",
        deploymentType: "prod",
        cloudUrl: "https://cloudflare-retry.convex.cloud",
        siteUrl: "https://cloudflare-retry.convex.site",
        previewDeployment: { state: "not_ensured" },
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "existing-cloudflare",
        routeRepositoryKey: "ada/existing-cloudflare",
        routeOwner: "ada",
        routeName: "existing-cloudflare",
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "existing-convex",
        routeRepositoryKey: "ada/existing-convex",
        routeOwner: "ada",
        routeName: "existing-convex",
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

  it("keeps active provider ownership visible but lets connected resources recover failed ownership", async () => {
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
          ghRepoNodeId: "R_123",
          githubOwner: "ada",
          githubName: `provider-${testCase.label}`,
          routeRepositoryKey: `ada/provider-${testCase.label.toLowerCase()}`,
          routeOwner: "ada",
          routeName: `provider-${testCase.label}`,
          visibility: "private",
          defaultBranch: "main",
          connectedAt: 20,
        });
        await ctx.db.insert("vaultConvexDeployments", {
          vaultId,
          userId,
          appRoot,
          projectId: "convex-project",
          teamSlug: `provider-${testCase.label}-team`,
          projectSlug: `provider-${testCase.label}-project`,
          deploymentName: `provider-${testCase.label}-prod`,
          deploymentType: "prod",
          cloudUrl: `https://provider-${testCase.label}.convex.cloud`,
          siteUrl: `https://provider-${testCase.label}.convex.site`,
          deployKeys: {
            production: { state: "not_created" },
            preview: { state: "not_created" },
          },
          previewDeployment: { state: "not_ensured" },
          origin: "provisioned",
          connectedAt: 24,
          lastObservedAt: 24,
        });
        await ctx.db.insert("vaultCloudflareWorkers", {
          vaultId,
          userId,
          appRoot: ".",
          accountId: "cloudflare-account",
          workerName: `provider-${testCase.label}-worker`,
          workerTag: `provider-${testCase.label}-worker-tag`,
          workersDevUrl: `https://provider-${testCase.label}.example.workers.dev`,
          origin: "provisioned",
          deployment: {
            builds: { state: "not_connected" },
            convexBuildAccess: { state: "not_wired" },
          },
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "provider-handoff",
        routeRepositoryKey: "ada/provider-handoff",
        routeOwner: "ada",
        routeName: "provider-handoff",
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "completed-provider-run",
        routeRepositoryKey: "ada/completed-provider-run",
        routeOwner: "ada",
        routeName: "completed-provider-run",
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "demo",
        routeRepositoryKey: "ada/demo",
        routeOwner: "ada",
        routeName: "demo",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId,
        userId,
        appRoot,
        projectId: "project-1",
        teamSlug: "demo-team",
        projectSlug: "demo-project",
        deploymentName: "demo-production",
        deploymentType: "prod",
        cloudUrl: "https://demo-production.convex.cloud",
        siteUrl: "https://demo-production.convex.site",
        previewDeployment: { state: "not_ensured" },
        deployKeys: {
          production: { state: "not_created" },
          preview: { state: "not_created" },
        },
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

      return { userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    const vaults = await asUser.query(api.vault.dashboard.getUserVaults);

    expect(vaults[0]?.convexDeployments[0]).toMatchObject({
      appRoot,
      projectId: "project-1",
      projectSlug: "demo-project",
      teamSlug: "demo-team",
      projectSettingsDashboardUrl: "https://dashboard.convex.dev/t/demo-team/demo-project/settings",
      deploymentDashboardUrl:
        "https://dashboard.convex.dev/t/demo-team/demo-project/demo-production",
    });
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "upstream-state",
        routeRepositoryKey: "ada/upstream-state",
        routeOwner: "ada",
        routeName: "upstream-state",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      const roots = [
        "apps/manual-convex",
        "apps/managed-convex",
        "apps/manual-worker",
        "apps/managed-worker",
      ];
      for (const root of roots) {
        await ctx.db.insert("vaultApps", {
          vaultId,
          userId,
          appRoot: root,
          createdAt: 21,
        });
      }
      for (const root of ["apps/manual-convex", "apps/managed-convex"]) {
        await ctx.db.insert("vaultConvexDeployments", {
          vaultId,
          userId,
          appRoot: root,
          projectId: `${root}-project`,
          teamSlug: "ada-team",
          projectSlug: root.replace("/", "-"),
          deploymentName: `${root.replace("/", "-")}-production`,
          deploymentType: "prod",
          cloudUrl: `https://${root.replace("/", "-")}.convex.cloud`,
          siteUrl: `https://${root.replace("/", "-")}.convex.site`,
          upstream: { state: "missing_upstream" },
          previewDeployment: { state: "not_ensured" },
          deployKeys: {
            production: { state: "not_created" },
            preview: { state: "not_created" },
          },
          origin: root === "apps/managed-convex" ? "provisioned" : "selected_existing",
          connectedAt: 25,
          lastObservedAt: 25,
        });
      }
      for (const root of ["apps/manual-worker", "apps/managed-worker"]) {
        await ctx.db.insert("vaultCloudflareWorkers", {
          vaultId,
          userId,
          appRoot: root,
          accountId: "cloudflare-account",
          workerName: `${root.replace("/", "-")}-worker`,
          workerTag: `${root.replace("/", "-")}-tag`,
          workersDevUrl: `https://${root.replace("/", "-")}.example.workers.dev`,
          origin: root === "apps/managed-worker" ? "provisioned" : "selected_existing",
          upstream: { state: "missing_upstream" },
          deployment: {
            builds: { state: "not_connected" },
            convexBuildAccess: { state: "not_wired" },
          },
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
    const convexByRoot = new Map(
      vaults[0].convexDeployments.map((deployment) => [deployment.appRoot, deployment]),
    );
    const workersByRoot = new Map(
      vaults[0].cloudflareWorkers.map((worker) => [worker.appRoot, worker]),
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

  it("exposes Cloudflare GitHub and Convex deploy-key repair states", async () => {
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "cloudflare-state",
        routeRepositoryKey: "ada/cloudflare-state",
        routeOwner: "ada",
        routeName: "cloudflare-state",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });

      for (const appRoot of [".", "apps/api", "apps/web"]) {
        await ctx.db.insert("vaultApps", {
          vaultId,
          userId,
          appRoot,
          createdAt: 21,
        });
      }

      for (const appRoot of ["apps/api", "apps/web"]) {
        await ctx.db.insert("vaultConvexDeployments", {
          vaultId,
          userId,
          appRoot,
          projectId: `${appRoot}-project`,
          teamSlug: "ada-team",
          projectSlug: `${appRoot.replace("/", "-")}-project`,
          deploymentName: `${appRoot.replace("/", "-")}-production`,
          deploymentType: "prod",
          cloudUrl: `https://${appRoot.replace("/", "-")}.convex.cloud`,
          siteUrl: `https://${appRoot.replace("/", "-")}.convex.site`,
          previewDeployment: { state: "not_ensured" },
          deployKeys: {
            production: { state: "not_created" },
            preview: { state: "not_created" },
          },
          origin: "provisioned",
          connectedAt: 25,
          lastObservedAt: 25,
        });
      }

      const connectedBuilds = {
        state: "connected" as const,
        rootDirectory: "apps/api",
        buildCommand: "pnpm run build",
        deployCommand: "pnpm run deploy",
        previewDeployCommand: "pnpm run deploy:preview",
        pathIncludes: ["apps/api/*"],
        pathExcludes: [],
        production: {
          triggerUuid: "production-trigger",
          buildTokenUuid: "production-token",
        },
        preview: {
          triggerUuid: "preview-trigger",
          buildTokenUuid: "preview-token",
        },
      };
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        userId,
        appRoot: ".",
        accountId: "cloudflare-account",
        workerName: "not-connected-worker",
        workerTag: "not-connected-worker-tag",
        workersDevUrl: "https://not-connected-worker.example.workers.dev",
        origin: "provisioned",
        deployment: {
          builds: { state: "not_connected" },
          convexBuildAccess: { state: "not_wired" },
        },
        connectedAt: 26,
        lastObservedAt: 26,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        userId,
        appRoot: "apps/api",
        accountId: "cloudflare-account",
        workerName: "missing-keys-worker",
        workerTag: "missing-keys-worker-tag",
        workersDevUrl: "https://missing-keys-worker.example.workers.dev",
        origin: "provisioned",
        deployment: {
          builds: connectedBuilds,
          convexBuildAccess: { state: "not_wired" },
        },
        connectedAt: 27,
        lastObservedAt: 27,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        userId,
        appRoot: "apps/web",
        accountId: "cloudflare-account",
        workerName: "set-keys-worker",
        workerTag: "set-keys-worker-tag",
        workersDevUrl: "https://set-keys-worker.example.workers.dev",
        origin: "provisioned",
        deployment: {
          builds: {
            ...connectedBuilds,
            rootDirectory: "apps/web",
            pathIncludes: ["apps/web/*"],
            production: {
              triggerUuid: "web-production-trigger",
              buildTokenUuid: "web-production-token",
            },
            preview: {
              triggerUuid: "web-preview-trigger",
              buildTokenUuid: "web-preview-token",
            },
          },
          convexBuildAccess: { state: "wired" },
        },
        connectedAt: 28,
        lastObservedAt: 28,
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
    expect(vaults).toHaveLength(1);
    const workersByName = new Map(
      vaults[0].cloudflareWorkers.map((worker) => [worker.workerName, worker]),
    );

    expect(workersByName.get("not-connected-worker")).toMatchObject({
      githubRepositoryConnection: { state: "not_connected" },
      convexDeployKeys: { state: "not_applicable" },
    });
    expect(workersByName.get("missing-keys-worker")).toMatchObject({
      githubRepositoryConnection: { state: "connected" },
      convexDeployKeys: { state: "missing" },
    });
    expect(workersByName.get("set-keys-worker")).toMatchObject({
      githubRepositoryConnection: { state: "connected" },
      convexDeployKeys: { state: "set" },
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
        ghRepoNodeId: "R_123",
        githubOwner: "ada",
        githubName: "domain-order",
        routeRepositoryKey: "ada/domain-order",
        routeOwner: "ada",
        routeName: "domain-order",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 20,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        userId,
        appRoot: ".",
        accountId: "cloudflare-account",
        workerName: "domain-order-worker",
        workerTag: "domain-order-worker-tag",
        workersDevUrl: "https://domain-order.example.workers.dev",
        origin: "provisioned",
        deployment: {
          builds: { state: "not_connected" },
          convexBuildAccess: { state: "not_wired" },
        },
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
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId,
        userId,
        appRoot,
        projectId: "delete-convex-project",
        teamSlug: "delete-team",
        projectSlug: "delete-convex",
        deploymentName: "delete-convex-prod",
        deploymentType: "prod",
        cloudUrl: "https://delete-convex.convex.cloud",
        siteUrl: "https://delete-convex.convex.site",
        previewDeployment: { state: "not_ensured" },
        deployKeys: {
          production: { state: "created", id: "delete-convex-key" },
          preview: { state: "created", id: "delete-preview-convex-key" },
        },
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
        "vaultResourceLinksState",
        "fileStaging",
        "collaborativeUpdates",
        "blobs",
        "folderExpansionState",
        "vaultBranchTrees",
        "vaultDomains",
        "vaultConvexDeployments",
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
        threadMetadata: await ctx.db
          .query("chatMessageMetadata")
          .withIndex("by_threadId", (q) => q.eq("threadId", "thread-1"))
          .collect(),
      };
    });

    expect(snapshot.vault).toBeNull();
    expect(snapshot.resourceLinksState).toHaveLength(0);
    expect(snapshot.branchTrees).toHaveLength(0);
    expect(snapshot.prodRequestsForVault).toHaveLength(0);
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
