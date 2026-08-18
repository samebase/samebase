import { RequestError } from "@octokit/request-error";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const providerMocks = vi.hoisted(() => ({
  createGitHubInstallationOctokit: vi.fn(),
  getRepository: vi.fn(),
  isCloudflareWorkerNameAvailable: vi.fn(),
  listCloudflareBuildTokens: vi.fn(),
  listConvexManagementProjects: vi.fn(),
  requireCloudflareBuildTokenUuid: vi.fn(),
}));

vi.mock("../githubApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../githubApp")>();
  return {
    ...actual,
    createGitHubInstallationOctokit: providerMocks.createGitHubInstallationOctokit,
  };
});

vi.mock("../convexManagementApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../convexManagementApi/client")>();
  return {
    ...actual,
    listConvexManagementProjects: providerMocks.listConvexManagementProjects,
  };
});

vi.mock("../cloudflareResources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cloudflareResources")>();
  return {
    ...actual,
    isCloudflareWorkerNameAvailable: providerMocks.isCloudflareWorkerNameAvailable,
    listCloudflareBuildTokens: providerMocks.listCloudflareBuildTokens,
    requireCloudflareBuildTokenUuid: providerMocks.requireCloudflareBuildTokenUuid,
  };
});

import { api } from "../_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

function githubRequestError(status: number): RequestError {
  return new RequestError(`GitHub request failed with status ${status}.`, status, {
    request: {
      method: "GET",
      url: "https://api.github.com/repos/samebase/new-app",
      headers: {},
    },
  });
}

async function createRepositoryFixture() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "create-without-build-token@example.test",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "installation-1",
      githubOwnerId: "owner-1",
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

  return {
    ...ids,
    t,
    viewer: t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  providerMocks.createGitHubInstallationOctokit.mockReturnValue({
    rest: { repos: { get: providerMocks.getRepository } },
  });
  providerMocks.getRepository.mockRejectedValue(githubRequestError(404));
  providerMocks.isCloudflareWorkerNameAvailable.mockResolvedValue(true);
  providerMocks.listConvexManagementProjects.mockResolvedValue([]);
  providerMocks.requireCloudflareBuildTokenUuid.mockResolvedValue("selected-token");
});

describe("create repository Workers Builds token admission", () => {
  it("accepts null and stores it when Cloudflare confirms that the token list is empty", async () => {
    const { organizationId, t, viewer } = await createRepositoryFixture();
    providerMocks.listCloudflareBuildTokens.mockResolvedValue([]);

    const result = await viewer.action(api.vault.actions.createRepository, {
      organizationId,
      name: "new-app",
      convexProjectName: "new-app",
      cloudflareWorkerName: "new-app",
      cloudflareBuildTokenUuid: null,
    });

    await expect(
      t.run(async (ctx) => {
        return await ctx.db
          .query("workflow_vaultProvisioning_plans")
          .withIndex("by_vault", (q) => q.eq("vaultId", result.vaultId))
          .unique();
      }),
    ).resolves.toMatchObject({ cloudflare: { buildTokenUuid: null } });
    expect(providerMocks.listCloudflareBuildTokens).toHaveBeenCalledWith({
      token: "cloudflare-token",
      transport: "direct",
      accountId: "cloudflare-account",
    });
    expect(providerMocks.requireCloudflareBuildTokenUuid).not.toHaveBeenCalled();
  });

  it("rejects null before creating a vault when Cloudflare has an available token", async () => {
    const { organizationId, t, viewer } = await createRepositoryFixture();
    providerMocks.listCloudflareBuildTokens.mockResolvedValue([
      { name: "Existing token", uuid: "existing-token" },
    ]);

    await expect(
      viewer.action(api.vault.actions.createRepository, {
        organizationId,
        name: "new-app",
        convexProjectName: "new-app",
        cloudflareWorkerName: "new-app",
        cloudflareBuildTokenUuid: null,
      }),
    ).rejects.toThrow("A Cloudflare Workers Builds token is available. Select it and retry.");
    await expect(
      t.run(async (ctx) => ({
        plans: await ctx.db.query("workflow_vaultProvisioning_plans").take(1),
        vaults: await ctx.db.query("vaults").take(1),
      })),
    ).resolves.toEqual({ plans: [], vaults: [] });
    expect(providerMocks.requireCloudflareBuildTokenUuid).not.toHaveBeenCalled();
  });
});
