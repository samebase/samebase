import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubMocks = vi.hoisted(() => ({
  createRepositoryOctokit: vi.fn(),
  createStarterSeedClient: vi.fn(),
  createUserOctokit: vi.fn(),
  createUserRepository: vi.fn(),
  discoverPreviewSeedGitHubAppInstallations: vi.fn(),
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
    createGitHubUserOctokit: githubMocks.createUserOctokit,
    discoverPreviewSeedGitHubAppInstallations:
      githubMocks.discoverPreviewSeedGitHubAppInstallations,
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
import { starterTemplateManifest } from "./starterSeedManifest.generated";
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
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
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
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId,
      repositoryId,
      githubRepositoryFullName: "octocat/Old-World",
      trigger: "connect_existing_repository",
      state: "queued",
      currentStep: "run_created",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.replace(repositoryId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "provisioning",
      githubMode: "connect_existing_repository",
      runId,
      startedAt: 1,
      githubRepositoryDatabaseId: "1296269",
      githubRepositoryName: "Old-World",
    });
    return { runId, userId, repositoryId };
  });
  return { ...ids, t };
}

async function createManagedRepositoryRun(
  args: {
    email?: string;
    githubOwnerLogin?: string;
    githubOwnerType?: "organization" | "user";
    passwordAccount?: true;
  } = {},
) {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const email = args.email ?? "managed-stable-repository-workflow@example.test";
    const userId = await ctx.db.insert("users", {
      state: "active",
      email,
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    if (args.passwordAccount) {
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "password",
        providerAccountId: email,
      });
    }
    const githubOwnerLogin = args.githubOwnerLogin ?? "octocat";
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "1001",
      githubOwnerId: "1",
      githubOwnerLogin,
      githubOwnerLoginNormalized: githubOwnerLogin.toLowerCase(),
      githubOwnerType: args.githubOwnerType ?? "organization",
      convexTeam: { teamId: "convex-team" },
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
      },
    });
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId,
      repositoryId,
      githubRepositoryFullName: "octocat/Old-World",
      trigger: "create",
      state: "running",
      currentStep: "connect_github_repository",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.replace(repositoryId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "connected",
      githubMode: "create_repository",
      runId,
      githubRepositoryDatabaseId: "1296269",
      githubRepositoryName: "Old-World",
      visibility: "private",
      defaultBranch: "master",
      connectedAt: 1,
    });
    return { runId, userId, repositoryId };
  });
  return { ...ids, t };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
  const repository = installationRepositoryFixture();
  githubMocks.listRepositories.mockResolvedValue({
    data: { total_count: 1, repositories: [repository] },
  });
  githubMocks.getRepository.mockResolvedValue({ data: repository });
  githubMocks.getBranch.mockResolvedValue({ data: { name: "master" } });
  githubMocks.createStarterSeedClient.mockReturnValue({});
  githubMocks.createUserOctokit.mockReturnValue({
    rest: { repos: { createForAuthenticatedUser: githubMocks.createUserRepository } },
  });
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
    const { runId, t, userId, repositoryId } = await createExistingRepositoryRun();

    await expect(
      t.action(internal.repositoryProvisioningWorkflowActions.fetchExistingGitHubRepository, {
        runId,
        userId,
        repositoryId,
        githubRepositoryDatabaseId: "1296269",
      }),
    ).resolves.toEqual({
      githubRepositoryDatabaseId: "1296269",
      githubOwnerLogin: "octocat",
      githubRepositoryName: "Hello-World",
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
    const { runId, t, userId, repositoryId } = await createExistingRepositoryRun();
    githubMocks.getRepository.mockResolvedValue({
      data: { ...installationRepositoryFixture(), id: 2_345_678 },
    });

    await expect(
      t.action(internal.repositoryProvisioningWorkflowActions.fetchExistingGitHubRepository, {
        runId,
        userId,
        repositoryId,
        githubRepositoryDatabaseId: "1296269",
      }),
    ).rejects.toThrow("GitHub repository response did not match the selected repository.");
  });
});

describe("managed repository provisioning identity", () => {
  it("rechecks the seeded personal GitHub credential before repository creation", async () => {
    vi.stubEnv("CONVEX_DEPLOYMENT", "preview:personal-repository-workflow");
    vi.stubEnv("DEV_SEED_AUTH_EMAIL", "preview@example.test");
    vi.stubEnv("DEV_SEED_AUTH_PASSWORD", "preview-password");
    vi.stubEnv("DEV_SEED_GITHUB_API_KEY", "preview-api-key");
    githubMocks.discoverPreviewSeedGitHubAppInstallations.mockResolvedValue([
      {
        githubInstallationId: "1001",
        githubOwnerId: "1",
        githubOwnerType: "user",
        githubOwnerLogin: "nicu-chiciuc",
      },
    ]);
    githubMocks.resolveAppAccess.mockResolvedValue({
      organizationId: "organization-id",
      githubInstallationId: "1001",
      githubOwnerId: "1",
      githubOwnerLogin: "nicu-chiciuc",
      githubOwnerType: "user",
    });
    githubMocks.createUserRepository.mockResolvedValue({
      data: {
        id: 2_345_678,
        name: "preview-personal-app",
        default_branch: "main",
        private: true,
        owner: { id: 1, login: "nicu-chiciuc" },
      },
    });
    const { runId, t, userId, repositoryId } = await createManagedRepositoryRun({
      email: "preview@example.test",
      githubOwnerLogin: "nicu-chiciuc",
      githubOwnerType: "user",
      passwordAccount: true,
    });

    await expect(
      t.action(internal.repositoryProvisioningWorkflowActions.createGitHubRepository, {
        runId,
        userId,
        repositoryId,
        githubRepositoryName: "preview-personal-app",
        githubOwnerLogin: "nicu-chiciuc",
        description: null,
        private: true,
      }),
    ).resolves.toEqual({
      githubRepositoryDatabaseId: "2345678",
      githubOwnerLogin: "nicu-chiciuc",
      githubRepositoryName: "preview-personal-app",
      defaultBranch: "main",
      visibility: "private",
    });
    expect(githubMocks.discoverPreviewSeedGitHubAppInstallations).toHaveBeenCalledWith(
      "preview-api-key",
    );
    expect(githubMocks.createUserOctokit).toHaveBeenCalledWith("preview-api-key");
    expect(githubMocks.createUserRepository).toHaveBeenCalledWith({
      name: "preview-personal-app",
      auto_init: false,
      private: true,
    });
    await expect(
      t.run(async (ctx) => await ctx.db.query("githubUserAuthorizations").collect()),
    ).resolves.toEqual([]);
  });

  it("seeds the created repository by stable ID at its current coordinates", async () => {
    const { runId, t, userId, repositoryId } = await createManagedRepositoryRun();

    await expect(
      t.action(internal.repositoryProvisioningWorkflowActions.seedStarterRepository, {
        runId,
        userId,
        repositoryId,
        githubRepositoryDatabaseId: "1296269",
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
      manifest: starterTemplateManifest,
    });
  });
});
