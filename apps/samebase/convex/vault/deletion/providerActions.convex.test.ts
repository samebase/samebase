import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { RequestError } from "@octokit/request-error";

const githubMocks = vi.hoisted(() => ({
  createInstallationOctokit: vi.fn(),
  resolveDeletionAccess: vi.fn(),
  resolveRepositoryIdentity: vi.fn(),
  deleteRepository: vi.fn(),
}));

vi.mock("../../githubApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../githubApp")>();
  return {
    ...actual,
    createGitHubRepositoriesInstallationOctokit: githubMocks.createInstallationOctokit,
  };
});

vi.mock("../../githubAppAccess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../githubAppAccess")>();
  return {
    ...actual,
    resolveGitHubAppAccessForVaultDeletionRun: githubMocks.resolveDeletionAccess,
  };
});

vi.mock("../../githubRepoApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../githubRepoApi")>();
  return {
    ...actual,
    resolveGitHubInstallationRepositoryIdentity: githubMocks.resolveRepositoryIdentity,
  };
});

import { internal } from "../../_generated/api";
import { makeConvexTest } from "../../test.setup";

async function seedGitHubRepositoryDeletionRun() {
  const t = makeConvexTest();
  const runId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "github-repository-deletion@example.invalid",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "1001",
      githubOwnerId: "101",
      githubOwnerType: "organization",
      githubOwnerLogin: "before-rename",
      githubOwnerLoginNormalized: "before-rename",
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
    const runId = await ctx.db.insert("workflow_vaultDeletion_runs", {
      state: "running",
      organizationId,
      userId,
      vaultId,
      repositoryFullName: "before-rename/repository",
      createdAt: 1,
      updatedAt: 1,
      attempt: { kind: "initial" },
      workflow: { state: "started", workflowId: "delete-workflow" },
      currentStep: "delete_github_repo",
      snapshot: {
        state: "retained_for_retry",
        plan: {
          target: {
            kind: "samebase_managed_repository",
            ghRepoId: "10001",
            owner: "before-rename",
            name: "repository",
            repositoryFullName: "before-rename/repository",
          },
          convex: { action: "skip", reason: "not_requested" },
          cloudflare: { action: "skip", reason: "not_requested" },
          githubRepository: {
            action: "delete_repository",
            ghRepoId: "10001",
            owner: "before-rename",
            name: "repository",
          },
        },
      },
    });
    await ctx.db.patch(vaultId, {
      deletion: { state: "deleting", runId, requestedAt: 1 },
    });
    return runId;
  });
  return { runId, t };
}

beforeEach(() => {
  vi.clearAllMocks();
  githubMocks.resolveDeletionAccess.mockResolvedValue({
    githubInstallationId: "1001",
    githubOwnerId: "101",
    githubOwnerLogin: "before-rename",
  });
  githubMocks.createInstallationOctokit.mockResolvedValue({
    rest: { repos: { delete: githubMocks.deleteRepository } },
  });
  githubMocks.resolveRepositoryIdentity.mockResolvedValue({
    repositoryId: "10001",
    ownerId: "101",
    ownerLogin: "before-rename",
    repositoryName: "repository",
    defaultBranch: "main",
  });
  githubMocks.deleteRepository.mockResolvedValue({});
});

describe("retained GitHub repository deletion", () => {
  it("continues only after GitHub confirms repository deletion", async () => {
    const { runId, t } = await seedGitHubRepositoryDeletionRun();

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteGitHubRepository, { runId }),
    ).resolves.toBeNull();
    expect(githubMocks.resolveRepositoryIdentity).toHaveBeenCalledTimes(1);
    expect(githubMocks.deleteRepository).toHaveBeenCalledOnce();
    expect(githubMocks.deleteRepository).toHaveBeenCalledWith({
      owner: "before-rename",
      repo: "repository",
    });
  });

  it("requires verified reconnect after the GitHub owner login changes", async () => {
    const { runId, t } = await seedGitHubRepositoryDeletionRun();
    githubMocks.resolveRepositoryIdentity.mockResolvedValueOnce({
      repositoryId: "10001",
      ownerId: "101",
      ownerLogin: "after-rename",
      repositoryName: "repository",
      defaultBranch: "main",
    });

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteGitHubRepository, { runId }),
    ).rejects.toThrow(
      "GitHub owner login changed. An organization owner must reconnect the GitHub App.",
    );
    expect(githubMocks.deleteRepository).not.toHaveBeenCalled();
  });

  it("uses the current owner login after verified reconnect", async () => {
    const { runId, t } = await seedGitHubRepositoryDeletionRun();
    githubMocks.resolveDeletionAccess.mockResolvedValueOnce({
      githubInstallationId: "1001",
      githubOwnerId: "101",
      githubOwnerLogin: "after-rename",
    });
    githubMocks.resolveRepositoryIdentity.mockResolvedValueOnce({
      repositoryId: "10001",
      ownerId: "101",
      ownerLogin: "after-rename",
      repositoryName: "repository",
      defaultBranch: "main",
    });

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteGitHubRepository, { runId }),
    ).resolves.toBeNull();
    expect(githubMocks.deleteRepository).toHaveBeenCalledWith({
      owner: "after-rename",
      repo: "repository",
    });
  });

  it("retains the vault when GitHub returns not found after identity resolution", async () => {
    const { runId, t } = await seedGitHubRepositoryDeletionRun();
    githubMocks.deleteRepository.mockRejectedValueOnce(
      new RequestError("GitHub repository was not found.", 404, {
        request: {
          method: "DELETE",
          url: "https://api.github.com/repos/before-rename/repository",
          headers: {},
        },
      }),
    );

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteGitHubRepository, { runId }),
    ).rejects.toThrow("GitHub repository was not found.");
    expect(githubMocks.resolveRepositoryIdentity).toHaveBeenCalledOnce();
    expect(githubMocks.deleteRepository).toHaveBeenCalledOnce();
  });

  it("retains the vault when the installation has lost repository access", async () => {
    const { runId, t } = await seedGitHubRepositoryDeletionRun();
    githubMocks.resolveRepositoryIdentity.mockRejectedValueOnce(
      new Error("GitHub App installation cannot access the vault repository."),
    );

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteGitHubRepository, { runId }),
    ).rejects.toThrow("GitHub App installation cannot access the vault repository.");
    expect(githubMocks.deleteRepository).not.toHaveBeenCalled();
  });
});
