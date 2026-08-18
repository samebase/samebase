import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const providerMocks = vi.hoisted(() => ({
  createCloudflareWorker: vi.fn(),
  listCloudflareAccountsForToken: vi.fn(),
  readCloudflareWorkerIdentity: vi.fn(),
  requireCloudflareBuildTokenUuid: vi.fn(),
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
    createCloudflareWorker: providerMocks.createCloudflareWorker,
    readCloudflareWorkerIdentity: providerMocks.readCloudflareWorkerIdentity,
    requireCloudflareBuildTokenUuid: providerMocks.requireCloudflareBuildTokenUuid,
  };
});

import { internal } from "../_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

async function createManagedWorkerFixture() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "create-worker-without-build-token@example.test",
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
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      cloudflare: {
        auth: { method: "api_key", credential: "cloudflare-token" },
        connectedByUserId: userId,
        updatedAt: 1,
      },
    });
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
      state: "running",
      currentStep: "attach_worker",
      createdAt: 1,
      updatedAt: 1,
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
    await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
      vaultId,
      owner: { kind: "managed_run", runId },
      state: "active",
      lastWriteAt: {},
      updatedAt: 1,
    });
    await ctx.db.insert("workflow_vaultProvisioning_plans", {
      vaultId,
      convexConfigPath: "convex.json",
      convex: { state: "planned", projectName: "managed-app" },
      cloudflare: {
        state: "planned",
        workerName: "managed-app",
        rootDirectory: "/",
        buildTokenUuid: null,
      },
      createdAt: 1,
      updatedAt: 1,
    });
    return { organizationId, runId, userId, vaultId };
  });
  return { ids, t };
}

beforeEach(() => {
  vi.clearAllMocks();
  providerMocks.listCloudflareAccountsForToken.mockResolvedValue([
    { accountId: "cloudflare-account", accountName: "Cloudflare account" },
  ]);
  providerMocks.readCloudflareWorkerIdentity.mockResolvedValue(null);
  providerMocks.createCloudflareWorker.mockResolvedValue({
    workerName: "managed-app",
    workerTag: "worker-tag",
  });
});

describe("managed Cloudflare Worker creation", () => {
  it("creates and attaches the Worker without reading Builds tokens when the plan token is null", async () => {
    const { ids, t } = await createManagedWorkerFixture();

    const workerId = await t.action(internal.vault.cloudflare.ensureCloudflareWorkerConnection, {
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      accountId: "cloudflare-account",
      workerName: "managed-app",
    });

    await expect(
      t.run(async (ctx) => ({
        plan: await ctx.db
          .query("workflow_vaultProvisioning_plans")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique(),
        worker: await ctx.db.get(workerId),
      })),
    ).resolves.toMatchObject({
      plan: {
        cloudflare: {
          state: "created",
          buildTokenUuid: null,
          workerName: "managed-app",
          workerTag: "worker-tag",
        },
      },
      worker: {
        organizationId: ids.organizationId,
        accountId: "cloudflare-account",
        workerName: "managed-app",
        workerTag: "worker-tag",
      },
    });
    expect(providerMocks.listCloudflareAccountsForToken).toHaveBeenCalledWith({
      token: "cloudflare-token",
      transport: "direct",
      accountId: "cloudflare-account",
    });
    expect(providerMocks.readCloudflareWorkerIdentity).toHaveBeenCalledWith({
      token: "cloudflare-token",
      transport: "direct",
      accountId: "cloudflare-account",
      workerName: "managed-app",
    });
    expect(providerMocks.createCloudflareWorker).toHaveBeenCalledWith({
      token: "cloudflare-token",
      transport: "direct",
      accountId: "cloudflare-account",
      workerName: "managed-app",
    });
    expect(providerMocks.requireCloudflareBuildTokenUuid).not.toHaveBeenCalled();
  });
});
