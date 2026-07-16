import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../../_generated/api";
import { makeConvexTest } from "../../test.setup";

async function makeGitHubRepositoryDeletionTest() {
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
      githubAccountId: 7,
      createdAt: 1,
      updatedAt: 1,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("vaultDeletionRuns", {
      userId,
      vaultId,
      repositoryFullName: "old-owner/old-name",
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
            ghRepoNodeId: "R_123",
            routeRepositoryFullName: "old-owner/old-name",
          },
          codespaces: { action: "skip", reason: "not_requested" },
          convex: { action: "skip", reason: "not_requested" },
          cloudflare: { action: "skip", reason: "not_requested" },
          githubRepository: {
            action: "delete_repository",
            deletionRepositoryName: "samebase-delete-test",
          },
        },
      },
    });

    return { runId, userId };
  });

  return { ids, t };
}

async function githubRepositoryIdentityResponse(request: Request): Promise<Response> {
  const repository = {
    __typename: "Repository",
    id: "R_123",
    databaseId: 123,
    name: "samebase-delete-test",
    nameWithOwner: "canonical-owner/samebase-delete-test",
    owner: { login: "canonical-owner", databaseId: 456 },
  };
  const rateLimit = {
    cost: 1,
    limit: 5_000,
    remaining: 4_000,
    resetAt: "2026-07-16T12:00:00.000Z",
  };
  return Response.json({
    data: (await request.clone().text()).includes("RenameRepositoryForDeletion")
      ? { updateRepository: { repository }, rateLimit }
      : { repository, rateLimit },
  });
}

describe("vault deletion Convex provider actions", () => {
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
      const runId = await ctx.db.insert("vaultDeletionRuns", {
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
              ghRepoNodeId: "R_123",
              routeRepositoryFullName: "ada/demo",
            },
            codespaces: { action: "skip", reason: "not_requested" },
            convex: {
              action: "delete_projects",
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
      const runId = await ctx.db.insert("vaultDeletionRuns", {
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
              ghRepoNodeId: "R_123",
              routeRepositoryFullName: "ada/demo",
            },
            codespaces: { action: "skip", reason: "not_requested" },
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

  it("resolves the stable repository id before deleting canonical GitHub coordinates", async () => {
    const requests: Array<{ method: string; url: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        requests.push({ method: request.method, url: request.url });

        if (request.method === "POST" && request.url === "https://api.github.com/graphql") {
          return await githubRepositoryIdentityResponse(request);
        }
        if (
          request.method === "GET" &&
          request.url === "https://api.github.com/repos/canonical-owner/samebase-delete-test"
        ) {
          return Response.json({ id: 123 });
        }
        if (
          request.method === "DELETE" &&
          request.url === "https://api.github.com/repos/canonical-owner/samebase-delete-test"
        ) {
          return new Response(null, { status: 204 });
        }

        throw new Error(`Unexpected GitHub request: ${request.method} ${request.url}`);
      }),
    );
    const { ids, t } = await makeGitHubRepositoryDeletionTest();

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteGitHubRepository, ids),
    ).resolves.toBeNull();

    expect(requests).toEqual([
      { method: "POST", url: "https://api.github.com/graphql" },
      { method: "POST", url: "https://api.github.com/graphql" },
      {
        method: "GET",
        url: "https://api.github.com/repos/canonical-owner/samebase-delete-test",
      },
      {
        method: "DELETE",
        url: "https://api.github.com/repos/canonical-owner/samebase-delete-test",
      },
    ]);
  });

  it("fails closed when the current connection cannot resolve the stable repository id", async () => {
    const requests: Array<{ method: string; url: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        requests.push({ method: request.method, url: request.url });
        if (request.method === "POST" && request.url === "https://api.github.com/graphql") {
          return Response.json({
            data: {
              updateRepository: null,
              rateLimit: {
                cost: 1,
                limit: 5_000,
                remaining: 4_000,
                resetAt: "2026-07-16T12:00:00.000Z",
              },
            },
            errors: [
              {
                type: "NOT_FOUND",
                path: ["updateRepository"],
                message: "Could not resolve to a node with the global id.",
              },
            ],
          });
        }
        throw new Error(`Unexpected GitHub request: ${request.method} ${request.url}`);
      }),
    );
    const { ids, t } = await makeGitHubRepositoryDeletionTest();

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteGitHubRepository, ids),
    ).rejects.toThrow("Could not resolve to a node with the global id.");

    expect(requests).toEqual([{ method: "POST", url: "https://api.github.com/graphql" }]);
  });

  it("refuses to delete when canonical coordinates resolve to a reused repository name", async () => {
    const requests: Array<{ method: string; url: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        requests.push({ method: request.method, url: request.url });
        if (request.method === "POST" && request.url === "https://api.github.com/graphql") {
          return await githubRepositoryIdentityResponse(request);
        }
        if (
          request.method === "GET" &&
          request.url === "https://api.github.com/repos/canonical-owner/samebase-delete-test"
        ) {
          return Response.json({ id: 999 });
        }
        throw new Error(`Unexpected GitHub request: ${request.method} ${request.url}`);
      }),
    );
    const { ids, t } = await makeGitHubRepositoryDeletionTest();

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteGitHubRepository, ids),
    ).rejects.toThrow("GitHub returned another repository immediately before deletion.");

    expect(requests).toEqual([
      { method: "POST", url: "https://api.github.com/graphql" },
      { method: "POST", url: "https://api.github.com/graphql" },
      {
        method: "GET",
        url: "https://api.github.com/repos/canonical-owner/samebase-delete-test",
      },
    ]);
  });
});
