import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../../_generated/api";
import { makeConvexTest } from "../../test.setup";

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
      const runId = await ctx.db.insert("operations_vaultDeletionRuns", {
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
      const runId = await ctx.db.insert("operations_vaultDeletionRuns", {
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
