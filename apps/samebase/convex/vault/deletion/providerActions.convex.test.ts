import { RequestError } from "@octokit/request-error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const octokitMocks = vi.hoisted(() => ({
  getRepository: vi.fn(),
  deleteRepository: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    readonly rest = {
      repos: {
        get: octokitMocks.getRepository,
        delete: octokitMocks.deleteRepository,
      },
    };
  },
}));

import { internal } from "../../_generated/api";
import { makeConvexTest } from "../../test.setup";

async function createGitHubDeletionFixture() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    await ctx.db.insert("providerConnections", {
      kind: "github",
      userId,
      auth: {
        method: "api_key",
        credential: "github-token",
      },
      username: "ada",
      createdAt: 1,
      updatedAt: 1,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultDeletion_runs", {
      userId,
      vaultId,
      repositoryFullName: "ada/demo",
      createdAt: 2,
      updatedAt: 2,
      attempt: { kind: "initial" },
      state: "running",
      workflow: { state: "started", workflowId: "workflow-1" },
      currentStep: "delete_github_repo",
      snapshot: {
        state: "retained_for_retry",
        plan: {
          target: {
            kind: "samebase_managed_repository",
            ghRepoId: "123",
            owner: "ada",
            name: "demo",
            repositoryFullName: "ada/demo",
          },
          convex: { action: "skip", reason: "not_requested" },
          cloudflare: { action: "skip", reason: "not_requested" },
          githubRepository: {
            action: "delete_repository",
            ghRepoId: "123",
            owner: "ada",
            name: "demo",
          },
        },
      },
    });

    return { runId, userId };
  });

  return { ids, t };
}

describe("vault deletion Convex provider actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("continues deleting remaining Convex projects after a not-found project", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input.url);
        if (input.url.includes("/projects/1001/delete")) {
          return new Response("missing", { status: 404 });
        }
        if (input.url.includes("/projects/1002/delete")) {
          return new Response("", { status: 200 });
        }

        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        userId,
        auth: {
          method: "api_key",
          credential: "convex-token",
        },
        teamId: "team-id",
        teamSlug: "ada-team",
        createdAt: 1,
        updatedAt: 1,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        userId,
        vaultId,
        repositoryFullName: "ada/demo",
        createdAt: 2,
        updatedAt: 2,
        attempt: { kind: "initial" },
        state: "running",
        workflow: { state: "started", workflowId: "workflow-1" },
        currentStep: "delete_convex",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "existing_repository",
              ghRepoId: "123",
              owner: "ada",
              name: "demo",
              repositoryFullName: "ada/demo",
            },
            convex: {
              action: "delete_projects",
              teamId: "team-id",
              projectIds: ["1001", "1002"],
            },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });

      return { runId, userId };
    });

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteConvex, ids),
    ).resolves.toBeNull();

    expect(requests.filter((url) => url.includes("/projects/"))).toEqual([
      "https://api.convex.dev/v1/projects/1001/delete",
      "https://api.convex.dev/v1/projects/1002/delete",
    ]);
  });

  it("does not delete a project after the connected Convex team changes", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        userId,
        auth: { method: "api_key", credential: "convex-token" },
        teamId: "other-team",
        teamSlug: "other-team",
        createdAt: 1,
        updatedAt: 1,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        userId,
        vaultId,
        repositoryFullName: "ada/demo",
        createdAt: 2,
        updatedAt: 2,
        attempt: { kind: "initial" },
        state: "running",
        workflow: { state: "started", workflowId: "workflow-1" },
        currentStep: "delete_convex",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "existing_repository",
              ghRepoId: "123",
              owner: "ada",
              name: "demo",
              repositoryFullName: "ada/demo",
            },
            convex: { action: "delete_project", teamId: "original-team", projectId: "1001" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });
      return { runId, userId };
    });

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteConvex, ids),
    ).rejects.toThrow("Connect the Convex team that owns these projects before removing them.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects retained Cloudflare plans with no workers to delete", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      await ctx.db.insert("providerConnections", {
        kind: "cloudflare",
        userId,
        auth: {
          method: "api_key",
          credential: "cloudflare-token",
        },
        defaultAccount: {
          state: "selected",
          accountId: "cloudflare-account",
          accountName: "Ada Cloud",
        },
        createdAt: 1,
        updatedAt: 1,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        userId,
        vaultId,
        repositoryFullName: "ada/demo",
        createdAt: 2,
        updatedAt: 2,
        attempt: { kind: "initial" },
        state: "running",
        workflow: { state: "started", workflowId: "workflow-1" },
        currentStep: "delete_cloudflare",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "existing_repository",
              ghRepoId: "123",
              owner: "ada",
              name: "demo",
              repositoryFullName: "ada/demo",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "delete_workers", workers: [] },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });

      return { runId, userId };
    });

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteCloudflare, ids),
    ).rejects.toThrow("Cloudflare deletion plan must include at least one Worker.");
  });

  it("deletes the GitHub repository when its id matches the plan", async () => {
    octokitMocks.getRepository.mockResolvedValue({ data: { id: 123 } });
    octokitMocks.deleteRepository.mockResolvedValue({});
    const { ids, t } = await createGitHubDeletionFixture();

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteGitHubRepository, ids),
    ).resolves.toBeNull();

    expect(octokitMocks.getRepository).toHaveBeenCalledWith({
      owner: "ada",
      repo: "demo",
    });
    expect(octokitMocks.deleteRepository).toHaveBeenCalledWith({
      owner: "ada",
      repo: "demo",
    });
  });

  it("treats a missing GitHub repository as already deleted", async () => {
    octokitMocks.getRepository.mockRejectedValue(
      new RequestError("Not Found", 404, {
        request: {
          method: "GET",
          url: "https://api.github.com/repos/ada/demo",
          headers: {},
        },
      }),
    );
    const { ids, t } = await createGitHubDeletionFixture();

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteGitHubRepository, ids),
    ).resolves.toBeNull();
    expect(octokitMocks.deleteRepository).not.toHaveBeenCalled();
  });

  it("does not delete a reused GitHub owner and repository name", async () => {
    octokitMocks.getRepository.mockResolvedValue({ data: { id: 456 } });
    const { ids, t } = await createGitHubDeletionFixture();

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteGitHubRepository, ids),
    ).rejects.toThrow("GitHub repository identity changed.");
    expect(octokitMocks.deleteRepository).not.toHaveBeenCalled();
  });
});
