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
        owner: { kind: "manual_provider_write", action: "create_cloudflare_worker" },
        state: "succeeded",
        lastWriteAt: {
          convex: expect.any(Number),
          cloudflare: expect.any(Number),
        },
      },
    });
  });

  it("keeps the generic create path working without a Convex connection", async () => {
    const { ids, viewer } = await createWorkerFixture(false);

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
  });
});
