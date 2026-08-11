import { RequestError } from "@octokit/request-error";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const managedAppProviderMocks = vi.hoisted(() => ({
  configureCloudflareWorkerBuildsForGitHub: vi.fn(),
  createCloudflareWorker: vi.fn(),
  createConvexDeployKey: vi.fn(),
  createConvexPreviewDeployKey: vi.fn(),
  createGitHubRepository: vi.fn(),
  deleteConvexDeployKeyByName: vi.fn(),
  deleteConvexPreviewDeployKeyByName: vi.fn(),
  getGitHubBranch: vi.fn(),
  getGitHubRepository: vi.fn(),
  getGitHubTree: vi.fn(),
  isCloudflareWorkerNameAvailable: vi.fn(),
  listCloudflareAccountsForToken: vi.fn(),
  listConvexManagementProjects: vi.fn(),
  readCloudflareWorkerIdentity: vi.fn(),
  readConvexProductionDeployment: vi.fn(),
  requestConvexManagementApi: vi.fn(),
  rotateConvexDeployKeysForCloudflareWorkerBuilds: vi.fn(),
  seedRepositoryWithStarter: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    readonly rest = {
      git: {
        getTree: managedAppProviderMocks.getGitHubTree,
      },
      repos: {
        createInOrg: managedAppProviderMocks.createGitHubRepository,
        get: managedAppProviderMocks.getGitHubRepository,
        getBranch: managedAppProviderMocks.getGitHubBranch,
      },
    };
  },
}));

vi.mock("./cloudflareAccountDiscovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cloudflareAccountDiscovery")>();
  return {
    ...actual,
    listCloudflareAccountsForToken: managedAppProviderMocks.listCloudflareAccountsForToken,
  };
});

vi.mock("./cloudflareResources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cloudflareResources")>();
  return {
    ...actual,
    configureCloudflareWorkerBuildsForGitHub:
      managedAppProviderMocks.configureCloudflareWorkerBuildsForGitHub,
    createCloudflareWorker: managedAppProviderMocks.createCloudflareWorker,
    isCloudflareWorkerNameAvailable: managedAppProviderMocks.isCloudflareWorkerNameAvailable,
    readCloudflareWorkerIdentity: managedAppProviderMocks.readCloudflareWorkerIdentity,
    rotateConvexDeployKeysForCloudflareWorkerBuilds:
      managedAppProviderMocks.rotateConvexDeployKeysForCloudflareWorkerBuilds,
  };
});

vi.mock("./convexManagementApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./convexManagementApi/client")>();
  return {
    ...actual,
    listConvexManagementProjects: managedAppProviderMocks.listConvexManagementProjects,
    requestConvexManagementApi: managedAppProviderMocks.requestConvexManagementApi,
  };
});

vi.mock("./infraProvisioning", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./infraProvisioning")>();
  return {
    ...actual,
    createConvexDeployKey: managedAppProviderMocks.createConvexDeployKey,
    createConvexPreviewDeployKey: managedAppProviderMocks.createConvexPreviewDeployKey,
    deleteConvexDeployKeyByName: managedAppProviderMocks.deleteConvexDeployKeyByName,
    deleteConvexPreviewDeployKeyByName: managedAppProviderMocks.deleteConvexPreviewDeployKeyByName,
  };
});

vi.mock("./starterSeed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./starterSeed")>();
  return {
    ...actual,
    seedRepositoryWithStarter: managedAppProviderMocks.seedRepositoryWithStarter,
  };
});

vi.mock("./vault/convexProjectResources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vault/convexProjectResources")>();
  return {
    ...actual,
    readConvexProductionDeployment: managedAppProviderMocks.readConvexProductionDeployment,
  };
});

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function createComposedVault() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "composed-app-installation",
      githubOwnerId: "composed-app-owner",
      githubOwnerLogin: "ada",
      githubOwnerLoginNormalized: "ada",
      githubOwnerType: "user",
      convexTeam: { teamId: "convex-team" },
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
      },
    });
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      organizationId,
      userId,
      vaultId,
      repositoryFullName: "ada/composed-app",
      trigger: "create",
      state: "running",
      currentStep: "sync_tree",
      createdAt: 10,
      updatedAt: 20,
    });
    await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
      vaultId,
      owner: { kind: "managed_run", runId },
      state: "active",
      lastWriteAt: {},
      updatedAt: 20,
    });
    await ctx.db.replace(vaultId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "create_repository",
      runId,
      ghRepoId: "123",
      name: "composed-app",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
    });
    const planId = await ctx.db.insert("workflow_vaultProvisioning_plans", {
      vaultId,
      convexConfigPath: "convex.json",
      convex: {
        state: "planned",
        projectName: "composed-app",
      },
      cloudflare: {
        state: "planned",
        workerName: "composed-app",
        rootDirectory: "/",
      },
      createdAt: 30,
      updatedAt: 30,
    });
    return {
      organizationId,
      planId,
      runId,
      userId,
      vaultId,
    };
  });
  return { ids, t };
}

async function attachComposedResources({
  ids,
  t,
}: Awaited<ReturnType<typeof createComposedVault>>) {
  return await t.run(async (ctx) => {
    const plan = await ctx.db.get(ids.planId);
    if (!plan) {
      throw new Error("Expected provisioning plan.");
    }
    await ctx.db.patch(plan._id, {
      convex: {
        state: "created",
        projectName: "composed-app",
        projectId: "convex-project",
      },
      cloudflare: {
        state: "created",
        workerName: "composed-app",
        workerTag: "composed-worker-tag",
        rootDirectory: plan.cloudflare.rootDirectory,
      },
    });
    const convexProjectId = await ctx.db.insert("vaultConvexProjects", {
      vaultId: ids.vaultId,
      organizationId: ids.organizationId,
      teamId: "convex-team",
      projectId: "convex-project",
      convexConfigPath: "convex.json",
      origin: "provisioned",
    });
    const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId: ids.vaultId,
      organizationId: ids.organizationId,
      accountId: "cloudflare-account",
      workerName: "composed-app",
      workerTag: "composed-worker-tag",
      origin: "provisioned",
    });
    return { convexProjectId, workerId };
  });
}

describe("app provisioning workflow composition", () => {
  it("maps the provisioning root to the Convex config path and reads exact attachments", async () => {
    const { ids, t } = await createComposedVault();

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        runId: ids.runId,
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      convexConfigPath: "convex.json",
      convex: {
        state: "missing",
        projectName: "composed-app",
      },
      cloudflare: {
        state: "missing",
        accountId: "cloudflare-account",
        workerName: "composed-app",
      },
    });

    const attachments = await attachComposedResources({ ids, t });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        runId: ids.runId,
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toMatchObject({
      convex: { state: "attached", convexProjectId: attachments.convexProjectId },
      cloudflare: { state: "attached", workerId: attachments.workerId },
    });
  });

  it("keeps managed provider freshness when infrastructure ownership completes", async () => {
    const { ids, t } = await createComposedVault();
    await attachComposedResources({ ids, t });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      await t.mutation(internal.appProvisioningWorkflow.claimComposedInfrastructureProvisioning, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: ids.runId,
      });
      vi.setSystemTime(2_000);
      await t.mutation(internal.vault.infrastructureOperation.recordManagedProviderWrites, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        providers: ["cloudflare"],
      });
      vi.setSystemTime(3_000);
      await t.mutation(internal.vault.infrastructureOperation.recordManagedProviderWrites, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        providers: ["convex", "cloudflare"],
      });
      vi.setSystemTime(4_000);
      await t.mutation(internal.appProvisioningWorkflow.finishComposedInfrastructureProvisioning, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: ids.runId,
      });
    } finally {
      vi.useRealTimers();
    }

    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_vaultProvisioning_writeLocks")
            .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      owner: { kind: "managed_run", runId: ids.runId },
      state: "succeeded",
      lastWriteAt: {
        convex: 3_000,
        cloudflare: 3_000,
      },
      updatedAt: 4_000,
    });
  });

  it("does not finish a managed lock owned by a newer run", async () => {
    const { ids, t } = await createComposedVault();
    const newerRunId = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        organizationId: ids.organizationId,
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/composed-app",
        trigger: "retry",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 40,
        updatedAt: 40,
      });
      const writeLock = await ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      if (!writeLock) {
        throw new Error("Expected managed write lock.");
      }
      await ctx.db.replace(writeLock._id, {
        vaultId: ids.vaultId,
        owner: { kind: "managed_run", runId },
        state: "active",
        lastWriteAt: { cloudflare: 41 },
        updatedAt: 42,
      });
      return runId;
    });

    await expect(
      t.mutation(internal.appProvisioningWorkflow.finishComposedInfrastructureProvisioning, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: ids.runId,
      }),
    ).rejects.toThrow("Composed infrastructure run no longer holds the provisioning write lock.");
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_vaultProvisioning_writeLocks")
            .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      owner: { kind: "managed_run", runId: newerRunId },
      state: "active",
      lastWriteAt: { cloudflare: 41 },
      updatedAt: 42,
    });
  });

  it("records a managed provider failure without a finish event", async () => {
    const { ids, t } = await createComposedVault();
    await attachComposedResources({ ids, t });
    await t.mutation(internal.appProvisioningWorkflow.claimComposedInfrastructureProvisioning, {
      userId: ids.userId,
      vaultId: ids.vaultId,
      runId: ids.runId,
    });
    await t.mutation(internal.appProvisioningRuns.appendRunEvent, {
      runId: ids.runId,
      step: "rotate_convex_deploy_keys_for_workers_builds",
      level: "info",
      message: "Rotating Convex deploy keys for Workers Builds.",
      state: "running",
    });
    await t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
      runId: ids.runId,
      workflowId: "workflow",
      message: "Could not set build variables.",
    });

    const result = await t.run(async (ctx) => {
      const events = await ctx.db
        .query("workflow_vaultProvisioning_events")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      return {
        run: await ctx.db.get(ids.runId),
        write: await ctx.db
          .query("workflow_vaultProvisioning_writeLocks")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique(),
        steps: events.map((event) => event.step),
      };
    });
    expect(result.run).toMatchObject({
      state: "failed",
      currentStep: "rotate_convex_deploy_keys_for_workers_builds",
    });
    expect(result.write).toMatchObject({
      owner: { kind: "managed_run", runId: ids.runId },
      state: "failed",
    });
    expect(result.steps).not.toContain("finish");
  });

  it("never takes an active provisioning lock from another run", async () => {
    const { ids, t } = await createComposedVault();
    const retryRunId = await t.run(async (ctx) => {
      return await ctx.db.insert("workflow_vaultProvisioning_runs", {
        organizationId: ids.organizationId,
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/composed-app",
        trigger: "retry",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 100,
        updatedAt: 100,
      });
    });

    await expect(
      t.mutation(internal.appProvisioningWorkflow.claimComposedInfrastructureProvisioning, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: retryRunId,
      }),
    ).resolves.toEqual({ claimed: false });

    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_vaultProvisioning_writeLocks")
            .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      owner: { kind: "managed_run", runId: ids.runId },
      state: "active",
    });
  });
});

describe("managed app creation flow", () => {
  it("creates a ready managed app through the public Create action and full workflow", async () => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.stubEnv("GITHUB_APP_ID", "42");
    vi.stubEnv("GITHUB_APP_SLUG", "samebase-test");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-id");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "private-key");
    vi.stubEnv("GITHUB_APP_OAUTH_CALLBACK_URL", "https://samebase.test/oauth/github/callback");

    let repositoryCreated = false;
    managedAppProviderMocks.getGitHubRepository.mockImplementation(async () => {
      if (!repositoryCreated) {
        throw new RequestError("GitHub repository was not found.", 404, {
          request: {
            method: "GET",
            url: "https://api.github.com/repos/samebase/managed-app",
            headers: {},
          },
        });
      }
      return {
        data: {
          id: 4_567,
          name: "managed-app",
          private: true,
          default_branch: "main",
          owner: { id: 123, login: "samebase" },
        },
      };
    });
    managedAppProviderMocks.createGitHubRepository.mockImplementation(async () => {
      repositoryCreated = true;
      return {
        data: {
          id: 4_567,
          name: "managed-app",
          private: true,
          default_branch: "main",
          owner: { id: 123, login: "samebase" },
        },
      };
    });
    managedAppProviderMocks.getGitHubBranch.mockResolvedValue({
      data: {
        commit: {
          sha: "starter-commit",
          commit: { tree: { sha: "starter-tree" } },
        },
      },
    });
    managedAppProviderMocks.getGitHubTree.mockResolvedValue({
      data: {
        sha: "starter-tree",
        truncated: false,
        tree: [],
      },
    });
    managedAppProviderMocks.seedRepositoryWithStarter.mockResolvedValue(undefined);
    managedAppProviderMocks.listConvexManagementProjects.mockResolvedValue([]);
    managedAppProviderMocks.requestConvexManagementApi.mockImplementation(
      async (_token: string, method: string, path: string) => {
        switch (`${method} ${path}`) {
          case "POST /teams/{team_id}/create_project":
            return {
              id: "convex-project",
              projectId: "convex-project",
              slug: "managed-app",
              deploymentName: "prod-deployment",
            };
          case "GET /projects/{project_id}":
            return {
              createTime: 1,
              id: "convex-project",
              name: "managed-app",
              slug: "managed-app",
              teamId: "convex-team",
              teamSlug: "samebase",
              prodDeploymentName: "prod-deployment",
            };
          default:
            throw new Error(`Unexpected Convex provider operation: ${method} ${path}`);
        }
      },
    );
    managedAppProviderMocks.isCloudflareWorkerNameAvailable.mockResolvedValue(true);
    managedAppProviderMocks.listCloudflareAccountsForToken.mockResolvedValue([
      {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
      },
    ]);
    managedAppProviderMocks.readCloudflareWorkerIdentity.mockResolvedValue(null);
    managedAppProviderMocks.createCloudflareWorker.mockResolvedValue({
      workerName: "managed-app",
      workerTag: "worker-tag",
    });
    managedAppProviderMocks.configureCloudflareWorkerBuildsForGitHub.mockResolvedValue({
      state: "connected",
      rootDirectory: "/",
      buildCommand: "pnpm run build",
      deployCommand: "pnpm run deploy",
      previewDeployCommand: "pnpm run deploy:preview",
      pathIncludes: ["*"],
      pathExcludes: [],
      production: {
        triggerUuid: "production-trigger",
        buildTokenUuid: "production-build-token",
      },
      preview: {
        triggerUuid: "preview-trigger",
        buildTokenUuid: "preview-build-token",
      },
    });
    managedAppProviderMocks.readConvexProductionDeployment.mockResolvedValue({
      name: "prod-deployment",
    });
    managedAppProviderMocks.deleteConvexDeployKeyByName.mockResolvedValue(undefined);
    managedAppProviderMocks.deleteConvexPreviewDeployKeyByName.mockResolvedValue(undefined);
    managedAppProviderMocks.createConvexDeployKey.mockResolvedValue({
      deployKey: "production-deploy-key",
    });
    managedAppProviderMocks.createConvexPreviewDeployKey.mockResolvedValue({
      deployKey: "preview-deploy-key",
    });
    managedAppProviderMocks.rotateConvexDeployKeysForCloudflareWorkerBuilds.mockResolvedValue(
      undefined,
    );
    const unexpectedFetch = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      throw new Error(`Unexpected provider request: ${url}`);
    });
    vi.stubGlobal("fetch", unexpectedFetch);

    const t = makeConvexTest();
    const { organizationId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "managed-app-owner@example.test",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "123",
        githubOwnerType: "organization",
        githubOwnerLogin: "samebase",
        githubOwnerLoginNormalized: "samebase",
        githubInstallationId: "456",
        convexTeam: { teamId: "convex-team" },
        cloudflareAccount: {
          accountId: "cloudflare-account",
          accountName: "Cloudflare account",
        },
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
        role: "owner",
      });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      await ctx.db.insert("organizationProviderCredentials", {
        organizationId,
        convex: {
          auth: { method: "api_key", credential: "convex-token" },
          connectedByUserId: userId,
          updatedAt: 1,
        },
        cloudflare: {
          auth: { method: "api_key", credential: "cloudflare-token" },
          connectedByUserId: userId,
          updatedAt: 1,
        },
      });
      return { organizationId, userId };
    });
    const asUser = t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    });

    const { runId, vaultId } = await asUser.action(api.vault.actions.createRepository, {
      organizationId,
      name: "managed-app",
      convexProjectName: "managed-app",
      cloudflareWorkerName: "managed-app",
      private: true,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [dashboardVaults, workflowState] = await Promise.all([
      asUser.query(api.vault.dashboard.getUserVaults),
      t.run(async (ctx) => {
        const [run, vault, plan, writeLock, branchTree] = await Promise.all([
          ctx.db.get(runId),
          ctx.db.get(vaultId),
          ctx.db
            .query("workflow_vaultProvisioning_plans")
            .withIndex("by_vault", (query) => query.eq("vaultId", vaultId))
            .unique(),
          ctx.db
            .query("workflow_vaultProvisioning_writeLocks")
            .withIndex("by_vault", (query) => query.eq("vaultId", vaultId))
            .unique(),
          ctx.db
            .query("observations_vaultRepository_branchTrees")
            .withIndex("by_vault_and_branch", (query) =>
              query.eq("vaultId", vaultId).eq("branch", "main"),
            )
            .unique(),
        ]);
        return { branchTree, plan, run, vault, writeLock };
      }),
    ]);

    expect(workflowState).toMatchObject({
      branchTree: {
        branch: "main",
        commitSHA: "starter-commit",
        vaultId,
      },
      plan: {
        convex: {
          state: "created",
          projectName: "managed-app",
          projectId: "convex-project",
        },
        cloudflare: {
          state: "created",
          workerName: "managed-app",
          workerTag: "worker-tag",
          rootDirectory: "/",
        },
      },
      run: {
        currentStep: "finish",
        state: "succeeded",
        vaultId,
      },
      vault: {
        state: "connected",
        githubMode: "create_repository",
        ghRepoId: "4567",
        name: "managed-app",
      },
      writeLock: {
        owner: { kind: "managed_run", runId },
        state: "succeeded",
      },
    });
    expect(dashboardVaults).toMatchObject([
      {
        _id: vaultId,
        repositoryFullName: "samebase/managed-app",
        sourceSetup: { status: "ready" },
        providerSetup: { status: "ready" },
        hasConnectedGitHubRepository: true,
        hasConvexProvision: true,
        hasCloudflareProvision: true,
        convexProjects: [
          {
            teamId: "convex-team",
            projectId: "convex-project",
            codeLocation: { kind: "config", convexConfigPath: "convex.json" },
          },
        ],
        cloudflareWorkers: [
          {
            accountId: "cloudflare-account",
            workerName: "managed-app",
            workerTag: "worker-tag",
          },
        ],
        providerPlan: {
          convex: { state: "created", projectId: "convex-project" },
          cloudflare: { state: "created", workerTag: "worker-tag" },
        },
      },
    ]);
    expect(managedAppProviderMocks.seedRepositoryWithStarter).toHaveBeenCalledOnce();
    expect(managedAppProviderMocks.configureCloudflareWorkerBuildsForGitHub).toHaveBeenCalledOnce();
    expect(managedAppProviderMocks.configureCloudflareWorkerBuildsForGitHub).toHaveBeenCalledWith({
      owner: "samebase",
      repo: "managed-app",
      ghRepoId: "4567",
      ghRepoOwnerId: "123",
      defaultBranch: "main",
      initialBuild: { state: "deferred" },
      vaultId,
      workerName: "managed-app",
      workerTag: "worker-tag",
      existingBuilds: "preserve_repository",
      cloudflareToken: "cloudflare-token",
      cloudflareAuthMethod: "api_key",
      accountId: "cloudflare-account",
      buildConfig: {
        rootDir: "/",
        buildCommand: "pnpm run build",
        deployCommand: "pnpm run deploy",
        previewDeployCommand: "pnpm run deploy:preview",
        pathIncludes: ["*"],
        pathExcludes: [],
      },
      beforeProviderWrite: undefined,
    });
    expect(
      managedAppProviderMocks.rotateConvexDeployKeysForCloudflareWorkerBuilds,
    ).toHaveBeenCalledOnce();
    expect(
      managedAppProviderMocks.rotateConvexDeployKeysForCloudflareWorkerBuilds,
    ).toHaveBeenCalledWith({
      defaultBranch: "main",
      readInitialBuildCommitHash: expect.any(Function),
      expectedRepoId: "4567",
      repositoryFullName: "samebase/managed-app",
      rootDirectory: "/",
      vaultId,
      workerName: "managed-app",
      workerTag: "worker-tag",
      cloudflareToken: "cloudflare-token",
      cloudflareAuthMethod: "api_key",
      accountId: "cloudflare-account",
      build: {
        rootDirectory: "/",
        production: { triggerUuid: "production-trigger" },
        preview: { triggerUuid: "preview-trigger" },
      },
      convex: {
        production: { deployKey: "production-deploy-key" },
        preview: { deployKey: "preview-deploy-key" },
      },
      convexProject: {
        teamId: "convex-team",
        projectId: "convex-project",
      },
      beforeProviderWrite: undefined,
    });
    expect(unexpectedFetch).not.toHaveBeenCalled();
  });
});
