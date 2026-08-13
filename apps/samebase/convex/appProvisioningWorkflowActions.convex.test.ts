import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubMocks = vi.hoisted(() => ({
  createForAuthenticatedUser: vi.fn(),
  getBranch: vi.fn(),
  getRepository: vi.fn(),
  getTree: vi.fn(),
  resolveAppAccess: vi.fn(),
  resolveRepositoryAccess: vi.fn(),
  resolveVaultAccessForProvisioningRun: vi.fn(),
  resolveUserOctokitForProvisioningRun: vi.fn(),
}));

vi.mock("./githubAppAccess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./githubAppAccess")>();
  return {
    ...actual,
    resolveGitHubAppAccessForProvisioningRun: githubMocks.resolveAppAccess,
    resolveGitHubRepositoryAccess: githubMocks.resolveRepositoryAccess,
    resolveGitHubVaultAccessForProvisioningRun: githubMocks.resolveVaultAccessForProvisioningRun,
  };
});

vi.mock("./githubUserAuthorizations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./githubUserAuthorizations")>();
  return {
    ...actual,
    resolveGitHubUserOctokitForProvisioningRun: githubMocks.resolveUserOctokitForProvisioningRun,
  };
});

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

async function createExistingRepositoryRun() {
  const t = makeConvexTest();
  const { organizationId, userId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "existing-repository@example.invalid",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "1001",
      githubOwnerId: "1",
      githubOwnerLogin: "before-owner",
      githubOwnerLoginNormalized: "before-owner",
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
    await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      plan: "free",
      status: "inactive",
    });
    return { organizationId, userId };
  });
  const { runId, vaultId } = await t.mutation(
    internal.vault.records.createInitializingExistingRepositoryVaultForUser,
    {
      organizationId,
      userId,
      ghRepoOwner: "before-owner",
      ghRepoName: "before-repository",
    },
  );
  return { organizationId, runId, t, userId, vaultId };
}

async function createManagedRepositoryRun() {
  const t = makeConvexTest();
  const { organizationId, runId, userId, vaultId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "managed-repository@example.invalid",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "1001",
      githubOwnerId: "1",
      githubOwnerLogin: "before-owner",
      githubOwnerLoginNormalized: "before-owner",
      githubOwnerType: "user",
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
      repositoryFullName: "before-owner/managed-repository",
      trigger: "create",
      state: "running",
      currentStep: "create_github_repo",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.replace(vaultId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      state: "provisioning",
      githubMode: "create_repository",
      runId,
      startedAt: 1,
      name: "managed-repository",
      visibility: "private",
    });
    return { organizationId, runId, userId, vaultId };
  });
  return { organizationId, runId, t, userId, vaultId };
}

beforeEach(() => {
  vi.clearAllMocks();
  githubMocks.resolveAppAccess.mockResolvedValue({
    organizationId: "organization-id",
    githubInstallationId: "1001",
    githubOwnerId: "1",
    githubOwnerLogin: "before-owner",
    githubOwnerType: "user",
  });
  githubMocks.resolveRepositoryAccess.mockResolvedValue({
    octokit: {
      rest: {
        repos: {
          get: githubMocks.getRepository,
          getBranch: githubMocks.getBranch,
        },
        git: { getTree: githubMocks.getTree },
      },
    },
    ghRepoId: "1296269",
    githubOwnerId: "1",
    githubOwnerLogin: "listed-owner",
    repositoryName: "listed-repository",
    repositoryDefaultBranch: "listed-branch",
  });
  githubMocks.resolveVaultAccessForProvisioningRun.mockResolvedValue({
    octokit: {
      rest: {
        repos: {
          get: githubMocks.getRepository,
          getBranch: githubMocks.getBranch,
        },
        git: { getTree: githubMocks.getTree },
      },
    },
    ghRepoId: "1296269",
    githubOwnerId: "1",
    githubOwnerLogin: "listed-owner",
    repositoryName: "listed-repository",
    repositoryDefaultBranch: "listed-branch",
  });
  githubMocks.resolveUserOctokitForProvisioningRun.mockResolvedValue({
    rest: { repos: { createForAuthenticatedUser: githubMocks.createForAuthenticatedUser } },
  });
  // Subset of GitHub's official GET /repos/{owner}/{repo} response example.
  // https://docs.github.com/en/rest/repos/repos#get-a-repository
  githubMocks.getRepository.mockResolvedValue({
    data: {
      id: 1_296_269,
      name: "after-repository",
      private: true,
      default_branch: "master",
      owner: { id: 1, login: "before-owner" },
    },
  });
  githubMocks.getBranch.mockResolvedValue({ data: { name: "master" } });
  githubMocks.getTree.mockResolvedValue({ data: { sha: "tree-sha", tree: [], truncated: false } });
  // Subset of GitHub's official POST /user/repos response example.
  // https://docs.github.com/en/rest/repos/repos#create-a-repository-for-the-authenticated-user
  githubMocks.createForAuthenticatedUser.mockResolvedValue({
    data: {
      id: 1_296_269,
      name: "managed-repository",
      private: true,
      default_branch: "main",
      owner: { id: 1, login: "before-owner" },
    },
  });
});

describe("Samebase-managed GitHub repository creation", () => {
  it("keeps exact repository creation retries idempotent without changing owner login", async () => {
    const { organizationId, runId, t, userId, vaultId } = await createManagedRepositoryRun();
    const repository = await t.action(
      internal.appProvisioningWorkflowActions.createGitHubRepository,
      {
        runId,
        userId,
        vaultId,
        repositoryName: "managed-repository",
        githubOwnerId: "1",
        description: null,
        private: true,
      },
    );
    const connectArgs = {
      runId,
      userId,
      vaultId,
      ghRepoId: repository.ghRepoId,
      githubOwnerId: "1",
      expectedGithubOwnerLogin: "before-owner",
      expectedRepositoryName: "managed-repository",
      ownerName: repository.ownerName,
      repoName: repository.repoName,
      defaultBranch: repository.defaultBranch,
      visibility: repository.visibility,
    };

    await t.action(internal.appProvisioningWorkflowActions.createVaultForRepository, connectArgs);
    const firstSnapshot = await t.run(async (ctx) => ({
      organization: await ctx.db.get(organizationId),
      vault: await ctx.db.get(vaultId),
    }));
    await t.action(internal.appProvisioningWorkflowActions.createVaultForRepository, connectArgs);
    const retrySnapshot = await t.run(async (ctx) => ({
      organization: await ctx.db.get(organizationId),
      vault: await ctx.db.get(vaultId),
    }));

    expect(retrySnapshot).toEqual(firstSnapshot);
    expect(firstSnapshot.organization).toMatchObject({
      githubOwnerId: "1",
      githubOwnerLogin: "before-owner",
      githubOwnerLoginNormalized: "before-owner",
    });
    expect(firstSnapshot.vault).toMatchObject({
      state: "connected",
      githubMode: "create_repository",
      ghRepoId: "1296269",
      name: "managed-repository",
    });
    expect(githubMocks.resolveUserOctokitForProvisioningRun).toHaveBeenCalledWith(
      expect.any(Object),
      {
        runId,
        userId,
        vaultId,
        githubUserId: "1",
      },
    );
  });

  it("requires reconnect if the organization owner login changes before finalization", async () => {
    const { organizationId, runId, t, userId, vaultId } = await createManagedRepositoryRun();
    const repository = await t.action(
      internal.appProvisioningWorkflowActions.createGitHubRepository,
      {
        runId,
        userId,
        vaultId,
        repositoryName: "managed-repository",
        githubOwnerId: "1",
        description: null,
        private: true,
      },
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(organizationId, {
        githubOwnerLogin: "newest-owner",
        githubOwnerLoginNormalized: "newest-owner",
      });
    });

    await expect(
      t.action(internal.appProvisioningWorkflowActions.createVaultForRepository, {
        runId,
        userId,
        vaultId,
        ghRepoId: repository.ghRepoId,
        githubOwnerId: "1",
        expectedGithubOwnerLogin: "before-owner",
        expectedRepositoryName: "managed-repository",
        ownerName: repository.ownerName,
        repoName: repository.repoName,
        defaultBranch: repository.defaultBranch,
        visibility: repository.visibility,
      }),
    ).rejects.toThrow(
      "GitHub owner login changed. An organization owner must reconnect the GitHub App.",
    );

    await expect(
      t.run(async (ctx) => ({
        organization: await ctx.db.get(organizationId),
        vault: await ctx.db.get(vaultId),
      })),
    ).resolves.toMatchObject({
      organization: { githubOwnerId: "1", githubOwnerLogin: "newest-owner" },
      vault: { state: "provisioning", name: "managed-repository" },
    });
  });

  it("rejects a created repository from a different stable owner", async () => {
    const { runId, t, userId, vaultId } = await createManagedRepositoryRun();
    githubMocks.createForAuthenticatedUser.mockResolvedValueOnce({
      data: {
        id: 1_296_269,
        name: "managed-repository",
        private: true,
        default_branch: "main",
        owner: { id: 2, login: "another-owner" },
      },
    });

    await expect(
      t.action(internal.appProvisioningWorkflowActions.createGitHubRepository, {
        runId,
        userId,
        vaultId,
        repositoryName: "managed-repository",
        githubOwnerId: "1",
        description: null,
        private: true,
      }),
    ).rejects.toThrow("GitHub repository owner does not match the selected organization.");
    await expect(t.run(async (ctx) => await ctx.db.get(vaultId))).resolves.toMatchObject({
      state: "provisioning",
      name: "managed-repository",
    });
  });
});

describe("existing GitHub repository discovery", () => {
  it("connects by stable identity after a repository rename", async () => {
    const { organizationId, runId, t, userId, vaultId } = await createExistingRepositoryRun();
    const fetchArgs = {
      runId,
      userId,
      vaultId,
      ghRepoId: "1296269",
      githubOwnerId: "1",
    };

    const repository = await t.action(
      internal.appProvisioningWorkflowActions.fetchExistingGitHubRepository,
      fetchArgs,
    );

    expect(repository).toEqual({
      ghRepoId: "1296269",
      ownerName: "before-owner",
      repoName: "after-repository",
      defaultBranch: "master",
      visibility: "private",
    });
    const connectArgs = {
      runId,
      userId,
      vaultId,
      ghRepoId: repository.ghRepoId,
      githubOwnerId: "1",
      expectedGithubOwnerLogin: "before-owner",
      expectedRepositoryName: "before-repository",
      ownerName: repository.ownerName,
      repoName: repository.repoName,
      defaultBranch: repository.defaultBranch,
      visibility: repository.visibility,
    };
    await t.action(
      internal.appProvisioningWorkflowActions.connectExistingRepositoryVault,
      connectArgs,
    );
    const firstSnapshot = await t.run(async (ctx) => ({
      organization: await ctx.db.get(organizationId),
      vault: await ctx.db.get(vaultId),
    }));
    await t.action(
      internal.appProvisioningWorkflowActions.connectExistingRepositoryVault,
      connectArgs,
    );
    const retrySnapshot = await t.run(async (ctx) => ({
      organization: await ctx.db.get(organizationId),
      vault: await ctx.db.get(vaultId),
    }));

    expect(retrySnapshot).toEqual(firstSnapshot);
    expect(firstSnapshot.organization).toMatchObject({
      githubOwnerId: "1",
      githubOwnerLogin: "before-owner",
      githubOwnerLoginNormalized: "before-owner",
    });
    expect(firstSnapshot.vault).toMatchObject({
      state: "connected",
      ghRepoId: "1296269",
      name: "after-repository",
    });

    await t.mutation(internal.vault.records.refreshGitHubRepositoryName, {
      userId,
      vaultId,
      expectedGhRepoId: "1296269",
      expectedGithubOwnerId: "1",
      expectedRepositoryName: "after-repository",
      repositoryName: "newest-repository",
    });
    await t.action(
      internal.appProvisioningWorkflowActions.connectExistingRepositoryVault,
      connectArgs,
    );
    await expect(
      t.run(async (ctx) => ({
        organization: await ctx.db.get(organizationId),
        vault: await ctx.db.get(vaultId),
      })),
    ).resolves.toMatchObject({
      organization: { githubOwnerLogin: "before-owner" },
      vault: { name: "newest-repository" },
    });

    expect(githubMocks.resolveAppAccess).toHaveBeenCalledWith(expect.any(Object), {
      runId,
      userId,
      vaultId,
    });
    expect(githubMocks.resolveRepositoryAccess).toHaveBeenCalledWith({
      access: expect.objectContaining({
        githubInstallationId: "1001",
        githubOwnerId: "1",
      }),
      ghRepoId: "1296269",
    });
    expect(githubMocks.getRepository).toHaveBeenNthCalledWith(1, {
      owner: "listed-owner",
      repo: "listed-repository",
    });
    expect(githubMocks.getBranch).toHaveBeenNthCalledWith(1, {
      owner: "before-owner",
      repo: "after-repository",
      branch: "master",
    });
    await expect(t.run(async (ctx) => await ctx.db.get(runId))).resolves.toMatchObject({
      repositoryFullName: "before-owner/after-repository",
    });
  });

  it("uses workflow-authorized stable access for connected provisioning reads", async () => {
    const { runId, t, userId, vaultId } = await createExistingRepositoryRun();
    const repository = await t.action(
      internal.appProvisioningWorkflowActions.fetchExistingGitHubRepository,
      {
        runId,
        userId,
        vaultId,
        ghRepoId: "1296269",
        githubOwnerId: "1",
      },
    );
    await t.action(internal.appProvisioningWorkflowActions.connectExistingRepositoryVault, {
      runId,
      userId,
      vaultId,
      ghRepoId: repository.ghRepoId,
      githubOwnerId: "1",
      expectedGithubOwnerLogin: "before-owner",
      expectedRepositoryName: "before-repository",
      ownerName: repository.ownerName,
      repoName: repository.repoName,
      defaultBranch: repository.defaultBranch,
      visibility: repository.visibility,
    });
    githubMocks.resolveVaultAccessForProvisioningRun.mockClear();

    githubMocks.getBranch.mockResolvedValueOnce({
      data: {
        commit: {
          sha: "commit-sha",
          commit: { tree: { sha: "tree-sha" } },
        },
      },
    });
    await t.action(internal.appProvisioningWorkflowActions.syncVaultTreeForRepository, {
      runId,
      userId,
      vaultId,
    });

    expect(githubMocks.resolveVaultAccessForProvisioningRun).toHaveBeenCalledWith(
      expect.any(Object),
      {
        runId,
        userId,
        vaultId,
        ghRepoId: "1296269",
        expectedRepositoryName: "after-repository",
      },
    );
  });

  it("stops before mutable-coordinate reads when stable owner verification fails", async () => {
    const { runId, t, userId, vaultId } = await createExistingRepositoryRun();
    githubMocks.resolveRepositoryAccess.mockRejectedValueOnce(
      new Error(
        "GitHub repository owner changed. Remove this vault and connect the repository under its current owner.",
      ),
    );

    await expect(
      t.action(internal.appProvisioningWorkflowActions.fetchExistingGitHubRepository, {
        runId,
        userId,
        vaultId,
        ghRepoId: "1296269",
        githubOwnerId: "1",
      }),
    ).rejects.toThrow("GitHub repository owner changed.");
    expect(githubMocks.getRepository).not.toHaveBeenCalled();
    expect(githubMocks.getBranch).not.toHaveBeenCalled();
  });
});
