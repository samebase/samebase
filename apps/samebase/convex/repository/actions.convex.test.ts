import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubMocks = vi.hoisted(() => ({
  createInstallationOctokit: vi.fn(),
  createRepositoryOctokit: vi.fn(),
  getBranch: vi.fn(),
  getRepository: vi.fn(),
  getTree: vi.fn(),
  listRepositories: vi.fn(),
}));

vi.mock("../githubApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../githubApp")>();
  return {
    ...actual,
    createGitHubInstallationOctokit: githubMocks.createInstallationOctokit,
    createGitHubRepositoryInstallationOctokit: githubMocks.createRepositoryOctokit,
  };
});

import { api } from "../_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

// Subset of GitHub's official GET /installation/repositories response example.
// https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-app-installation
function installationRepositoryFixture() {
  return {
    id: 1_296_269,
    name: "plugin",
    full_name: "samebase/plugin",
    default_branch: "main",
    private: true,
    owner: {
      id: 1,
      login: "samebase",
    },
  };
}

async function createConnectRepositoryFixture() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "connect-by-repository-id@example.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "1001",
      githubOwnerId: "1",
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
    return { organizationId, userId };
  });

  return {
    ...ids,
    t,
    viewer: t.withIdentity({
      subject: ids.userId,
      tokenIdentifier: `test:${ids.userId}`,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const selectedRepository = installationRepositoryFixture();
  const reusedOldRouteRepository = {
    ...selectedRepository,
    id: 2_345_678,
    name: "agent-plugins",
    full_name: "samebase/agent-plugins",
  };
  githubMocks.listRepositories.mockResolvedValue({
    data: { total_count: 1, repositories: [selectedRepository] },
  });
  githubMocks.getRepository.mockImplementation(async (args: { owner: string; repo: string }) => ({
    data: args.repo === "agent-plugins" ? reusedOldRouteRepository : selectedRepository,
  }));
  githubMocks.getBranch.mockResolvedValue({
    data: {
      commit: {
        sha: "0123456789012345678901234567890123456789",
        commit: { tree: { sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd" } },
      },
    },
  });
  githubMocks.getTree.mockResolvedValue({
    data: {
      sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      truncated: false,
      tree: [],
    },
  });
  const octokit = {
    request: githubMocks.listRepositories,
    rest: {
      git: { getTree: githubMocks.getTree },
      repos: {
        get: githubMocks.getRepository,
        getBranch: githubMocks.getBranch,
      },
    },
  };
  githubMocks.createInstallationOctokit.mockReturnValue(octokit);
  githubMocks.createRepositoryOctokit.mockResolvedValue(octokit);
});

describe("connect existing repository identity", () => {
  it("connects the selected ID at its current route when the old route belongs to another repo", async () => {
    const { organizationId, t, viewer } = await createConnectRepositoryFixture();

    const result = await viewer.action(api.repository.connect, {
      organizationId,
      githubRepositoryDatabaseId: "1296269",
    });

    expect(result.githubRepositoryFullName).toBe("samebase/plugin");
    expect(githubMocks.createRepositoryOctokit).toHaveBeenCalledWith("1001", "1296269");
    expect(githubMocks.getRepository).toHaveBeenCalledWith({
      owner: "samebase",
      repo: "plugin",
    });
    expect(githubMocks.getRepository).not.toHaveBeenCalledWith({
      owner: "samebase",
      repo: "agent-plugins",
    });
    await expect(
      t.run(async (ctx) => await ctx.db.get(result.repositoryId)),
    ).resolves.toMatchObject({
      githubRepositoryDatabaseId: "1296269",
      githubRepositoryName: "plugin",
    });
  });
});
