import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../../_generated/api";
import { makeConvexTest } from "../../test.setup";

function cloudflareResponse(result: unknown): Response {
  return Response.json({
    success: true,
    errors: [],
    messages: [],
    result,
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
              owner: "ada",
              name: "demo",
              repositoryFullName: "ada/demo",
            },
            codespaces: { action: "skip", reason: "not_requested" },
            convex: {
              action: "delete_projects",
              projectIds: ["1001", "1002"],
            },
            convexDependencyDeployKeys: { action: "skip", reason: "not_recorded" },
            cloudflare: { action: "skip", reason: "not_requested" },
            cloudflareBuildTriggers: { action: "skip", reason: "not_recorded" },
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

  it("revokes each relation-owned deploy key once while retaining the Convex project", async () => {
    const requests: Array<{ body: string; url: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        requests.push({ body: await request.clone().text(), url: request.url });
        if (request.url.endsWith("/delete_deploy_key")) {
          return new Response("", { status: 200 });
        }
        if (request.url.endsWith("/delete_preview_deploy_key")) {
          return new Response("missing", { status: 404 });
        }

        throw new Error(`Unexpected Convex request: ${request.url}`);
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
              owner: "ada",
              name: "demo",
              repositoryFullName: "ada/demo",
            },
            codespaces: { action: "skip", reason: "not_requested" },
            convex: { action: "skip", reason: "not_requested" },
            convexDependencyDeployKeys: {
              action: "revoke",
              dependencies: [
                {
                  dependencyId: "dependency-1",
                  deployKeys: {
                    production: {
                      state: "created",
                      name: "production-key-name",
                      deploymentName: "convex-production",
                    },
                    preview: {
                      state: "created",
                      name: "preview-key-name",
                      projectId: "1001",
                    },
                  },
                },
              ],
            },
            cloudflare: { action: "skip", reason: "not_requested" },
            cloudflareBuildTriggers: { action: "skip", reason: "not_recorded" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });

      return { runId, userId };
    });

    await expect(
      t.action(internal.vault.deletion.providerActions.deleteConvex, ids),
    ).resolves.toBeNull();

    expect(requests).toEqual([
      {
        url: "https://api.convex.dev/v1/deployments/convex-production/delete_deploy_key",
        body: JSON.stringify({ id: "production-key-name" }),
      },
      {
        url: "https://api.convex.dev/v1/projects/1001/delete_preview_deploy_key",
        body: JSON.stringify({ id: "preview-key-name" }),
      },
    ]);
  });

  it("detaches retained Worker triggers before Convex keys and tolerates a missing trigger", async () => {
    const requests: Array<{ method: string; url: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        requests.push({ method: request.method, url: request.url });

        if (
          request.method === "GET" &&
          request.url ===
            "https://api.cloudflare.com/client/v4/accounts/cloudflare-account/builds/workers/worker-tag/triggers"
        ) {
          return cloudflareResponse([
            { trigger_uuid: "production-trigger" },
            { trigger_uuid: "preview-trigger" },
          ]);
        }
        if (
          request.method === "DELETE" &&
          request.url ===
            "https://api.cloudflare.com/client/v4/accounts/cloudflare-account/builds/triggers/production-trigger"
        ) {
          return cloudflareResponse(null);
        }
        if (
          request.method === "DELETE" &&
          request.url ===
            "https://api.cloudflare.com/client/v4/accounts/cloudflare-account/builds/triggers/preview-trigger"
        ) {
          return Response.json(
            {
              success: false,
              errors: [{ code: 10007, message: "trigger not found" }],
              messages: [],
              result: null,
            },
            { status: 404 },
          );
        }
        if (
          request.method === "POST" &&
          (request.url.endsWith("/delete_deploy_key") ||
            request.url.endsWith("/delete_preview_deploy_key"))
        ) {
          return new Response(null, { status: 200 });
        }

        throw new Error(`Unexpected provider request: ${request.method} ${request.url}`);
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
        kind: "cloudflare",
        userId,
        auth: {
          method: "oauth",
          credential: "cloudflare-token",
          refreshCredential: "cloudflare-refresh-token",
          credentialExpiresAt: 4_102_444_800_000,
        },
        defaultAccount: {
          state: "selected",
          accountId: "cloudflare-account",
          accountName: "Ada Cloud",
        },
        createdAt: 1,
        updatedAt: 1,
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
            convexDependencyDeployKeys: {
              action: "revoke",
              dependencies: [
                {
                  dependencyId: "dependency-1",
                  deployKeys: {
                    production: {
                      state: "created",
                      name: "production-key-name",
                      deploymentName: "convex-production",
                    },
                    preview: {
                      state: "created",
                      name: "preview-key-name",
                      projectId: "1001",
                    },
                  },
                },
              ],
            },
            cloudflare: { action: "skip", reason: "not_requested" },
            cloudflareBuildTriggers: {
              action: "detach",
              workers: [
                {
                  accountId: "cloudflare-account",
                  workerTag: "worker-tag",
                },
              ],
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
    await expect(
      t.action(internal.vault.deletion.providerActions.deleteConvex, ids),
    ).resolves.toBeNull();

    expect(requests).toEqual([
      {
        method: "GET",
        url: "https://api.cloudflare.com/client/v4/accounts/cloudflare-account/builds/workers/worker-tag/triggers",
      },
      {
        method: "DELETE",
        url: "https://api.cloudflare.com/client/v4/accounts/cloudflare-account/builds/triggers/production-trigger",
      },
      {
        method: "DELETE",
        url: "https://api.cloudflare.com/client/v4/accounts/cloudflare-account/builds/triggers/preview-trigger",
      },
      {
        method: "POST",
        url: "https://api.convex.dev/v1/deployments/convex-production/delete_deploy_key",
      },
      {
        method: "POST",
        url: "https://api.convex.dev/v1/projects/1001/delete_preview_deploy_key",
      },
    ]);
    expect(requests.some((request) => request.url.includes("/workers/workers/"))).toBe(false);
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
            convexDependencyDeployKeys: { action: "skip", reason: "not_recorded" },
            cloudflare: { action: "delete_workers", workers: [] },
            cloudflareBuildTriggers: { action: "skip", reason: "not_recorded" },
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
