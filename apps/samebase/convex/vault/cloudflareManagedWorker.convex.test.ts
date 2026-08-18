import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const providerMocks = vi.hoisted(() => ({
  configureCloudflareWorkerBuildsForGitHub: vi.fn(),
  createCloudflareWorker: vi.fn(),
  createConvexDeployKey: vi.fn(),
  createConvexPreviewDeployKey: vi.fn(),
  createRepositoryOctokit: vi.fn(),
  deleteConvexDeployKeyByName: vi.fn(),
  deleteConvexPreviewDeployKeyByName: vi.fn(),
  getRepository: vi.fn(),
  listCloudflareAccountsForToken: vi.fn(),
  readCloudflareWorkerIdentity: vi.fn(),
  readConvexProductionDeployment: vi.fn(),
  requireCloudflareBuildTokenUuid: vi.fn(),
  rotateConvexDeployKeysForCloudflareWorkerBuilds: vi.fn(),
}));

vi.mock("../cloudflareAccountDiscovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cloudflareAccountDiscovery")>();
  return {
    ...actual,
    listCloudflareAccountsForToken: providerMocks.listCloudflareAccountsForToken,
  };
});

vi.mock("../cloudflareResources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cloudflareResources")>();
  return {
    ...actual,
    configureCloudflareWorkerBuildsForGitHub:
      providerMocks.configureCloudflareWorkerBuildsForGitHub,
    createCloudflareWorker: providerMocks.createCloudflareWorker,
    readCloudflareWorkerIdentity: providerMocks.readCloudflareWorkerIdentity,
    requireCloudflareBuildTokenUuid: providerMocks.requireCloudflareBuildTokenUuid,
    rotateConvexDeployKeysForCloudflareWorkerBuilds:
      providerMocks.rotateConvexDeployKeysForCloudflareWorkerBuilds,
  };
});

vi.mock("../infraProvisioning", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../infraProvisioning")>();
  return {
    ...actual,
    createConvexDeployKey: providerMocks.createConvexDeployKey,
    createConvexPreviewDeployKey: providerMocks.createConvexPreviewDeployKey,
    deleteConvexDeployKeyByName: providerMocks.deleteConvexDeployKeyByName,
    deleteConvexPreviewDeployKeyByName: providerMocks.deleteConvexPreviewDeployKeyByName,
  };
});

vi.mock("./convexProjectResources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./convexProjectResources")>();
  return {
    ...actual,
    readConvexProductionDeployment: providerMocks.readConvexProductionDeployment,
  };
});

vi.mock("../githubApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../githubApp")>();
  return {
    ...actual,
    createGitHubRepositoryInstallationOctokit: providerMocks.createRepositoryOctokit,
  };
});

import { api } from "../_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

async function createWorkerFixture(managedContinuation: boolean) {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "create-managed-worker@example.test",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "managed-worker-installation",
      githubOwnerId: "managed-worker-owner",
      githubOwnerLogin: "samebase",
      githubOwnerLoginNormalized: "samebase",
      githubOwnerType: "organization",
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
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    if (managedContinuation) {
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
    } else {
      await ctx.db.insert("organizationProviderCredentials", {
        organizationId,
        cloudflare: {
          auth: { method: "api_key", credential: "cloudflare-token" },
          connectedByUserId: userId,
          updatedAt: 1,
        },
      });
    }
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
      repositoryFullName: "samebase/managed-app",
      trigger: "create",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 1,
      completedAt: 1,
    });
    await ctx.db.replace(vaultId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "create_repository",
      runId,
      ghRepoId: "repository-1",
      name: "managed-app",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 1,
    });
    if (managedContinuation) {
      await ctx.db.insert("workflow_vaultProvisioning_plans", {
        vaultId,
        convexConfigPath: "convex.json",
        convex: {
          state: "created",
          projectName: "managed-app",
          projectId: "convex-project",
        },
        cloudflare: {
          state: "planned",
          workerName: "hidden-placeholder",
          rootDirectory: "/",
          buildTokenUuid: null,
        },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("vaultConvexProjects", {
        vaultId,
        organizationId,
        teamId: "convex-team",
        projectId: "convex-project",
        convexConfigPath: "convex.json",
        origin: "provisioned",
      });
    }
    return { organizationId, userId, vaultId };
  });
  return {
    ids,
    t,
    viewer: t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  providerMocks.listCloudflareAccountsForToken.mockResolvedValue([
    { accountId: "cloudflare-account", accountName: "Cloudflare account" },
  ]);
  providerMocks.readCloudflareWorkerIdentity.mockResolvedValue(null);
  providerMocks.createCloudflareWorker.mockImplementation(async (args: { workerName: string }) => ({
    workerName: args.workerName,
    workerTag: "worker-tag",
  }));
  providerMocks.requireCloudflareBuildTokenUuid.mockResolvedValue("build-token");
  providerMocks.getRepository.mockResolvedValue({
    data: {
      id: "repository-1",
      default_branch: "main",
      owner: { id: "managed-worker-owner" },
    },
  });
  providerMocks.createRepositoryOctokit.mockResolvedValue({
    rest: { repos: { get: providerMocks.getRepository } },
  });
  providerMocks.configureCloudflareWorkerBuildsForGitHub.mockImplementation(
    async (args: { afterBuildsConfigured?: () => void | Promise<void> }) => {
      await args.afterBuildsConfigured?.();
      return {
        state: "connected",
        rootDirectory: "/",
        buildCommand: "pnpm run build",
        deployCommand: "pnpm run deploy",
        previewDeployCommand: "pnpm run deploy:preview",
        pathIncludes: ["*"],
        pathExcludes: [],
        production: { triggerUuid: "production-trigger" },
        preview: { triggerUuid: "preview-trigger" },
      };
    },
  );
  providerMocks.readConvexProductionDeployment.mockResolvedValue({ name: "production-deployment" });
  providerMocks.createConvexDeployKey.mockResolvedValue({ deployKey: "production-key" });
  providerMocks.createConvexPreviewDeployKey.mockResolvedValue({ deployKey: "preview-key" });
  providerMocks.deleteConvexDeployKeyByName.mockResolvedValue(undefined);
  providerMocks.deleteConvexPreviewDeployKeyByName.mockResolvedValue(undefined);
  providerMocks.rotateConvexDeployKeysForCloudflareWorkerBuilds.mockResolvedValue(undefined);
});

describe("manual Cloudflare Worker creation", () => {
  it("finishes the tokenless managed plan with its exact Convex project and one build owner", async () => {
    const { ids, t, viewer } = await createWorkerFixture(true);

    const workerId = await viewer.action(api.vault.cloudflare.createWorker, {
      vaultId: ids.vaultId,
      accountId: "cloudflare-account",
      workerName: "chosen-worker",
      rootDirectory: "/",
      buildTokenUuid: "build-token",
    });

    expect(providerMocks.configureCloudflareWorkerBuildsForGitHub).toHaveBeenCalledWith(
      expect.objectContaining({
        workerName: "chosen-worker",
        workerTag: "worker-tag",
        initialBuild: { state: "deferred" },
      }),
    );
    expect(providerMocks.rotateConvexDeployKeysForCloudflareWorkerBuilds).toHaveBeenCalledOnce();
    expect(providerMocks.rotateConvexDeployKeysForCloudflareWorkerBuilds).toHaveBeenCalledWith(
      expect.objectContaining({
        workerName: "chosen-worker",
        workerTag: "worker-tag",
        build: {
          rootDirectory: "/",
          production: { triggerUuid: "production-trigger" },
          preview: { triggerUuid: "preview-trigger" },
        },
        convexProject: { teamId: "convex-team", projectId: "convex-project" },
      }),
    );
    await expect(
      t.run(async (ctx) => ({
        organization: await ctx.db.get(ids.organizationId),
        plan: await ctx.db
          .query("workflow_vaultProvisioning_plans")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique(),
        worker: await ctx.db.get(workerId),
        write: await ctx.db
          .query("workflow_vaultProvisioning_writeLocks")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique(),
      })),
    ).resolves.toMatchObject({
      organization: {
        cloudflareAccount: { lastUsedBuildTokenUuid: "build-token" },
      },
      plan: {
        convex: { state: "created", projectId: "convex-project" },
        cloudflare: {
          state: "created",
          workerName: "chosen-worker",
          workerTag: "worker-tag",
          buildTokenUuid: null,
        },
      },
      worker: {
        accountId: "cloudflare-account",
        workerName: "chosen-worker",
        workerTag: "worker-tag",
        origin: "provisioned",
      },
      write: {
        owner: {
          kind: "manual_provider_write",
          action: "create_cloudflare_worker_with_convex",
        },
        state: "succeeded",
        lastWriteAt: {
          convex: expect.any(Number),
          cloudflare: expect.any(Number),
        },
      },
    });
  });

  it("uses the managed continuation again after its Worker attachment is removed", async () => {
    const { ids, t, viewer } = await createWorkerFixture(true);

    const firstWorkerId = await viewer.action(api.vault.cloudflare.createWorker, {
      vaultId: ids.vaultId,
      accountId: "cloudflare-account",
      workerName: "first-worker",
      rootDirectory: "/",
      buildTokenUuid: "build-token",
    });
    await viewer.action(api.vault.cloudflare.detachWorker, {
      vaultId: ids.vaultId,
      workerId: firstWorkerId,
    });
    const replacementWorkerId = await viewer.action(api.vault.cloudflare.createWorker, {
      vaultId: ids.vaultId,
      accountId: "cloudflare-account",
      workerName: "replacement-worker",
      rootDirectory: "/",
      buildTokenUuid: "build-token",
    });

    expect(providerMocks.configureCloudflareWorkerBuildsForGitHub).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        workerName: "replacement-worker",
        initialBuild: { state: "deferred" },
      }),
    );
    expect(providerMocks.rotateConvexDeployKeysForCloudflareWorkerBuilds).toHaveBeenCalledTimes(2);
    await expect(
      t.run(async (ctx) => ({
        plan: await ctx.db
          .query("workflow_vaultProvisioning_plans")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique(),
        workers: await ctx.db
          .query("vaultCloudflareWorkers")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .take(2),
      })),
    ).resolves.toMatchObject({
      plan: {
        cloudflare: {
          state: "created",
          workerName: "replacement-worker",
          workerTag: "worker-tag",
        },
      },
      workers: [{ _id: replacementWorkerId, workerName: "replacement-worker" }],
    });
  });

  it("recovers a managed create that failed after recording its first Worker", async () => {
    const { ids, t, viewer } = await createWorkerFixture(true);
    providerMocks.configureCloudflareWorkerBuildsForGitHub.mockRejectedValueOnce(
      new Error("Builds configuration failed."),
    );

    await expect(
      viewer.action(api.vault.cloudflare.createWorker, {
        vaultId: ids.vaultId,
        accountId: "cloudflare-account",
        workerName: "failed-worker",
        rootDirectory: "/",
        buildTokenUuid: "build-token",
      }),
    ).rejects.toThrow("Builds configuration failed.");
    const failedState = await t.run(async (ctx) => ({
      plan: await ctx.db
        .query("workflow_vaultProvisioning_plans")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique(),
      worker: await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique(),
      write: await ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique(),
    }));
    expect(failedState).toMatchObject({
      plan: { cloudflare: { state: "created", workerName: "failed-worker" } },
      worker: { workerName: "failed-worker" },
      write: {
        owner: { action: "create_cloudflare_worker_with_convex" },
        state: "failed",
        lastWriteAt: { convex: expect.any(Number), cloudflare: expect.any(Number) },
      },
    });
    if (!failedState.worker) {
      throw new Error("Failed Worker attachment was not recorded.");
    }

    await viewer.action(api.vault.cloudflare.detachWorker, {
      vaultId: ids.vaultId,
      workerId: failedState.worker._id,
    });
    await viewer.action(api.vault.cloudflare.createWorker, {
      vaultId: ids.vaultId,
      accountId: "cloudflare-account",
      workerName: "recovered-worker",
      rootDirectory: "/",
      buildTokenUuid: "build-token",
    });

    expect(providerMocks.configureCloudflareWorkerBuildsForGitHub).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        workerName: "recovered-worker",
        initialBuild: { state: "deferred" },
      }),
    );
    expect(providerMocks.rotateConvexDeployKeysForCloudflareWorkerBuilds).toHaveBeenCalledOnce();
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("workflow_vaultProvisioning_plans")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique(),
      ),
    ).resolves.toMatchObject({
      cloudflare: { state: "created", workerName: "recovered-worker" },
    });
  });

  it("keeps an additional Worker generic while the managed Worker is attached", async () => {
    const { ids, viewer } = await createWorkerFixture(true);

    await viewer.action(api.vault.cloudflare.createWorker, {
      vaultId: ids.vaultId,
      accountId: "cloudflare-account",
      workerName: "managed-worker",
      rootDirectory: "/",
      buildTokenUuid: "build-token",
    });
    providerMocks.createCloudflareWorker.mockImplementationOnce(
      async (args: { workerName: string }) => ({
        workerName: args.workerName,
        workerTag: "additional-worker-tag",
      }),
    );
    await viewer.action(api.vault.cloudflare.createWorker, {
      vaultId: ids.vaultId,
      accountId: "cloudflare-account",
      workerName: "additional-worker",
      rootDirectory: "/",
      buildTokenUuid: "build-token",
    });

    expect(providerMocks.configureCloudflareWorkerBuildsForGitHub).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        workerName: "additional-worker",
        initialBuild: expect.objectContaining({ state: "requested" }),
      }),
    );
    expect(providerMocks.createConvexDeployKey).toHaveBeenCalledOnce();
    expect(providerMocks.rotateConvexDeployKeysForCloudflareWorkerBuilds).toHaveBeenCalledOnce();
  });

  it("keeps the generic create path working without a Convex connection", async () => {
    const { ids, t, viewer } = await createWorkerFixture(false);

    await expect(
      viewer.action(api.vault.cloudflare.createWorker, {
        vaultId: ids.vaultId,
        accountId: "cloudflare-account",
        workerName: "chosen-worker",
        rootDirectory: "/",
        buildTokenUuid: "build-token",
      }),
    ).resolves.toBeDefined();

    expect(providerMocks.configureCloudflareWorkerBuildsForGitHub).toHaveBeenCalledWith(
      expect.objectContaining({
        initialBuild: expect.objectContaining({ state: "requested" }),
      }),
    );
    expect(providerMocks.readConvexProductionDeployment).not.toHaveBeenCalled();
    expect(providerMocks.createConvexDeployKey).not.toHaveBeenCalled();
    expect(providerMocks.rotateConvexDeployKeysForCloudflareWorkerBuilds).not.toHaveBeenCalled();
    const write = await t.run(async (ctx) =>
      ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique(),
    );
    expect(write).toMatchObject({
      owner: { action: "create_cloudflare_worker" },
      state: "succeeded",
      lastWriteAt: { cloudflare: expect.any(Number) },
    });
    expect(write?.lastWriteAt.convex).toBeUndefined();
  });
});
