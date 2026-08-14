import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubMocks = vi.hoisted(() => ({
  createRepositoryOctokit: vi.fn(),
  createStarterSeedClient: vi.fn(),
  getBranch: vi.fn(),
  getRepository: vi.fn(),
  listRepositories: vi.fn(),
  resolveAppAccess: vi.fn(),
  seedRepository: vi.fn(),
}));

vi.mock("./githubApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./githubApp")>();
  return {
    ...actual,
    createGitHubRepositoryInstallationOctokit: githubMocks.createRepositoryOctokit,
  };
});

vi.mock("./githubAppAccess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./githubAppAccess")>();
  return {
    ...actual,
    resolveGitHubAppAccessForProvisioningRun: githubMocks.resolveAppAccess,
  };
});

vi.mock("./starterSeed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./starterSeed")>();
  return {
    ...actual,
    createStarterSeedGitClient: githubMocks.createStarterSeedClient,
    seedRepositoryWithStarter: githubMocks.seedRepository,
  };
});

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

// Subset of GitHub's official GET /installation/repositories response example.
// https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-app-installation
function installationRepositoryFixture() {
  return {
    id: 1_296_269,
    name: "Hello-World",
    full_name: "octocat/Hello-World",
    default_branch: "master",
    private: true,
    owner: {
      id: 1,
      login: "octocat",
    },
  };
}

async function createExistingRepositoryRun() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "stable-repository-workflow@example.test",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "1001",
      githubOwnerId: "1",
      githubOwnerLogin: "octocat",
      githubOwnerLoginNormalized: "octocat",
      githubOwnerType: "organization",
      convexTeam: { teamId: "convex-team" },
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
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
      repositoryFullName: "octocat/Old-World",
      trigger: "connect_existing_repository",
      state: "queued",
      currentStep: "run_created",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.replace(vaultId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      state: "provisioning",
      githubMode: "connect_existing_repository",
      runId,
      startedAt: 1,
      ghRepoId: "1296269",
      name: "Old-World",
    });
    return { runId, userId, vaultId };
  });
  return { ...ids, t };
}

async function createManagedRepositoryRun() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "managed-stable-repository-workflow@example.test",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "1001",
      githubOwnerId: "1",
      githubOwnerLogin: "octocat",
      githubOwnerLoginNormalized: "octocat",
      githubOwnerType: "organization",
      convexTeam: { teamId: "convex-team" },
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
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
      repositoryFullName: "octocat/Old-World",
      trigger: "create",
      state: "running",
      currentStep: "connect_github",
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
      ghRepoId: "1296269",
      name: "Old-World",
      visibility: "private",
      defaultBranch: "master",
      connectedAt: 1,
    });
    return { runId, userId, vaultId };
  });
  return { ...ids, t };
}

beforeEach(() => {
  vi.clearAllMocks();
  const repository = installationRepositoryFixture();
  githubMocks.listRepositories.mockResolvedValue({
    data: { total_count: 1, repositories: [repository] },
  });
  githubMocks.getRepository.mockResolvedValue({ data: repository });
  githubMocks.getBranch.mockResolvedValue({ data: { name: "master" } });
  githubMocks.createStarterSeedClient.mockReturnValue({});
  githubMocks.seedRepository.mockResolvedValue(undefined);
  githubMocks.createRepositoryOctokit.mockResolvedValue({
    request: githubMocks.listRepositories,
    rest: {
      repos: {
        get: githubMocks.getRepository,
        getBranch: githubMocks.getBranch,
      },
    },
  });
  githubMocks.resolveAppAccess.mockResolvedValue({
    organizationId: "organization-id",
    githubInstallationId: "1001",
    githubOwnerId: "1",
    githubOwnerLogin: "octocat",
    githubOwnerType: "organization",
  });
});

describe("existing repository provisioning identity", () => {
  it("finds a renamed repository by the selected stable ID", async () => {
    const { runId, t, userId, vaultId } = await createExistingRepositoryRun();

    await expect(
      t.action(internal.appProvisioningWorkflowActions.fetchExistingGitHubRepository, {
        runId,
        userId,
        vaultId,
        ghRepoId: "1296269",
      }),
    ).resolves.toEqual({
      ghRepoId: "1296269",
      ownerName: "octocat",
      repoName: "Hello-World",
      defaultBranch: "master",
      visibility: "private",
    });
    expect(githubMocks.createRepositoryOctokit).toHaveBeenCalledWith("1001", "1296269");
    expect(githubMocks.getRepository).toHaveBeenCalledWith({
      owner: "octocat",
      repo: "Hello-World",
    });
  });

  it("rejects a reused route that returns another repository ID", async () => {
    const { runId, t, userId, vaultId } = await createExistingRepositoryRun();
    githubMocks.getRepository.mockResolvedValue({
      data: { ...installationRepositoryFixture(), id: 2_345_678 },
    });

    await expect(
      t.action(internal.appProvisioningWorkflowActions.fetchExistingGitHubRepository, {
        runId,
        userId,
        vaultId,
        ghRepoId: "1296269",
      }),
    ).rejects.toThrow("GitHub repository response did not match the selected repository.");
  });
});

describe("managed repository provisioning identity", () => {
  it("seeds the created repository by stable ID at its current coordinates", async () => {
    const { runId, t, userId, vaultId } = await createManagedRepositoryRun();

    await expect(
      t.action(internal.appProvisioningWorkflowActions.seedStarterRepository, {
        runId,
        userId,
        vaultId,
        ghRepoId: "1296269",
      }),
    ).resolves.toBeNull();

    expect(githubMocks.createRepositoryOctokit).toHaveBeenCalledWith("1001", "1296269");
    expect(githubMocks.getRepository).toHaveBeenCalledWith({
      owner: "octocat",
      repo: "Hello-World",
    });
    expect(githubMocks.seedRepository).toHaveBeenCalledWith({
      client: {},
      owner: "octocat",
      repo: "Hello-World",
      defaultBranch: "master",
    });
  });
});
