import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const callCloudflareMcpToolMock = vi.hoisted(() => vi.fn());

vi.mock("../../cloudflareMcp", () => ({
  callCloudflareMcpTool: callCloudflareMcpToolMock,
}));

import { internal } from "../../_generated/api";
import { makeConvexTest } from "../../test.setup";

const convexProject = (projectId: string, teamId: string) => ({
  id: projectId,
  name: `Project ${projectId}`,
  slug: `project-${projectId}`,
  teamId,
  teamSlug: "ada-team",
  createTime: 1,
  devDeploymentName: null,
  prodDeploymentName: null,
});

async function createConvexDeletionRun(projects: { teamId: string; projectId: string }[]) {
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
      teamId: "100",
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
            owner: "ada",
            name: "demo",
            repositoryFullName: "ada/demo",
          },
          codespaces: { action: "skip", reason: "not_requested" },
          convex: { action: "delete_projects", projects },
          cloudflare: { action: "skip", reason: "not_requested" },
          githubRepository: { action: "skip", reason: "not_requested" },
        },
      },
    });

    return { runId, userId };
  });
  return { ids, t };
}

async function createGitHubDeletionRun() {
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
      repositoryFullName: "ada/old-name",
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
            name: "old-name",
            repositoryFullName: "ada/old-name",
          },
          codespaces: { action: "skip", reason: "not_requested" },
          convex: { action: "skip", reason: "not_requested" },
          cloudflare: { action: "skip", reason: "not_requested" },
          githubRepository: {
            action: "delete_repository",
            ghRepoId: "123",
            owner: "ada",
            name: "old-name",
          },
        },
      },
    });

    return { runId, userId };
  });
  return { ids, t };
}

describe("vault deletion Convex provider actions", () => {
  afterEach(() => {
    callCloudflareMcpToolMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("continues deleting remaining Convex projects after a not-found project", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(`${input.method} ${input.url}`);
        if (input.method === "GET" && input.url.endsWith("/projects/1001")) {
          return new Response("missing", { status: 404 });
        }
        if (input.method === "GET" && input.url.endsWith("/projects/1002")) {
          return Response.json(convexProject("1002", "100"));
        }
        if (input.method === "POST" && input.url.endsWith("/projects/1002/delete")) {
          return new Response("", { status: 200 });
        }

        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );
    const { ids, t } = await createConvexDeletionRun([
      { teamId: "100", projectId: "1001" },
      { teamId: "100", projectId: "1002" },
    ]);

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteConvex, ids),
    ).resolves.toBeNull();

    expect(requests).toEqual([
      "GET https://api.convex.dev/v1/projects/1001",
      "GET https://api.convex.dev/v1/projects/1002",
      "POST https://api.convex.dev/v1/projects/1002/delete",
    ]);
  });

  it("does not delete any Convex project when preflight contradicts team ownership", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(`${input.method} ${input.url}`);
        return Response.json(convexProject("1001", "999"));
      }),
    );
    const { ids, t } = await createConvexDeletionRun([{ teamId: "100", projectId: "1001" }]);

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteConvex, ids),
    ).rejects.toThrow("Convex project identity no longer matches the deletion plan.");

    expect(requests).toEqual(["GET https://api.convex.dev/v1/projects/1001"]);
    expect(requests.some((request) => request.includes("/delete"))).toBe(false);
  });

  it.each([
    {
      description: "the only target belongs to another team",
      projects: [{ teamId: "200", projectId: "2001" }],
    },
    {
      description: "the retained plan spans multiple teams",
      projects: [
        { teamId: "100", projectId: "1001" },
        { teamId: "200", projectId: "2001" },
      ],
    },
  ])("makes no provider call when $description", async ({ projects }) => {
    const fetch = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    const { ids, t } = await createConvexDeletionRun(projects);

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteConvex, ids),
    ).rejects.toThrow("Reconnect the Convex team that owns this resource.");

    expect(fetch).not.toHaveBeenCalled();
  });

  it("deletes a renamed GitHub repository through its retained stable ID", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const { pathname } = new URL(request.url);
        requests.push(`${request.method} ${pathname}`);
        if (request.method === "GET" && pathname === "/repositories/123") {
          return Response.json({
            id: 123,
            name: "renamed-repository",
            owner: { login: "current-owner" },
          });
        }
        if (request.method === "DELETE" && pathname === "/repos/current-owner/renamed-repository") {
          return new Response(null, { status: 204 });
        }
        throw new Error(`Unexpected GitHub request: ${request.method} ${pathname}`);
      }),
    );
    const { ids, t } = await createGitHubDeletionRun();

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteGitHubRepository, ids),
    ).resolves.toBeNull();

    expect(requests).toEqual([
      "GET /repositories/123",
      "DELETE /repos/current-owner/renamed-repository",
    ]);
    expect(requests).not.toContain("DELETE /repos/ada/old-name");
  });

  it("does not delete a reused GitHub name when the retained repository ID is gone", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const { pathname } = new URL(request.url);
        requests.push(`${request.method} ${pathname}`);
        return Response.json({ message: "Not Found" }, { status: 404 });
      }),
    );
    const { ids, t } = await createGitHubDeletionRun();

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteGitHubRepository, ids),
    ).resolves.toBeNull();

    expect(requests).toEqual(["GET /repositories/123"]);
    expect(requests.some((request) => request.startsWith("DELETE "))).toBe(false);
  });

  it("makes no provider calls when Cloudflare and Convex resources are retained", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
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
              owner: "ada",
              name: "demo",
              repositoryFullName: "ada/demo",
            },
            codespaces: { action: "skip", reason: "not_requested" },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });

      return { runId, userId };
    });

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteCloudflare, ids),
    ).resolves.toBeNull();
    await expect(
      t.action(internal.vault.deletion.providerActions.deleteConvex, ids),
    ).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(callCloudflareMcpToolMock).not.toHaveBeenCalled();
  });

  it("deletes build triggers only as part of an explicitly selected Worker deletion", async () => {
    callCloudflareMcpToolMock
      .mockResolvedValueOnce(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: {
            created_on: "2026-06-22T00:00:00Z",
            id: "worker-tag",
            logpush: false,
            name: "manual-worker",
            observability: { enabled: false, head_sampling_rate: 1 },
            references: {
              dispatch_namespace_outbounds: [],
              domains: [],
              durable_objects: [],
              queues: [],
              workers: [],
            },
            subdomain: { enabled: false },
            tags: [],
            tail_consumers: [],
            updated_on: "2026-06-22T00:00:00Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: [{ trigger_uuid: "production-trigger" }, { trigger_uuid: "preview-trigger" }],
        }),
      )
      .mockResolvedValue(JSON.stringify({ success: true, errors: [], messages: [], result: null }));
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
        auth: { method: "api_key", credential: "cloudflare-token" },
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
              owner: "ada",
              name: "demo",
              repositoryFullName: "ada/demo",
            },
            codespaces: { action: "skip", reason: "not_requested" },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: {
              action: "delete_worker",
              accountId: "cloudflare-account",
              workerName: "manual-worker",
              workerTag: "worker-tag",
            },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });

      return { runId, userId };
    });

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteCloudflare, ids),
    ).resolves.toBeNull();

    const calls = callCloudflareMcpToolMock.mock.calls.map((call) => JSON.stringify(call));
    expect(calls).toHaveLength(5);
    expect(calls[0]).toContain("/accounts/cloudflare-account/workers/workers/worker-tag");
    expect(calls[1]).toContain("/accounts/cloudflare-account/builds/workers/worker-tag/triggers");
    expect(calls.slice(2, 4)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/accounts/cloudflare-account/builds/triggers/production-trigger"),
        expect.stringContaining("/accounts/cloudflare-account/builds/triggers/preview-trigger"),
      ]),
    );
    expect(calls[4]).toContain("/accounts/cloudflare-account/workers/workers/worker-tag");
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
              owner: "ada",
              name: "demo",
              repositoryFullName: "ada/demo",
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
});
