import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

const accountId = "00000000000000000000000000000001";

async function createCloudflareConnectedVault() {
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
        credentialExpiresAt: 4_000_000_000_000,
      },
      defaultAccount: {
        state: "selected",
        accountId,
        accountName: "Ada Cloudflare",
      },
      createdAt: 1,
      updatedAt: 1,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId,
      vaultId,
      repositoryFullName: "ada/demo",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 2,
      updatedAt: 2,
      completedAt: 2,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: "123",
      owner: "ada",
      name: "demo",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 2,
    });
    const appId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory: "/",
      createdAt: 3,
    });
    const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId,
      userId,
      appId,
      accountId,
      workerName: "missing-worker",
      workerTag: "worker-tag",
      origin: "selected_existing",
      createdAt: 4,
    });
    return { appId, runId, userId, vaultId, workerId };
  });

  return {
    ...ids,
    asUser: t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    }),
    t,
  };
}

function cloudflareResponse(result: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({
      success: status >= 200 && status < 300,
      errors: status === 404 ? [{ code: 10007, message: "Worker not found" }] : [],
      messages: [],
      result,
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

describe("vault Cloudflare Worker operations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("lets the New App workflow reach provider configuration for GitHub Builds", async () => {
    const { runId, t, userId, vaultId, workerId } = await createCloudflareConnectedVault();
    await t.run(async (ctx) => {
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
    });
    const fetchMock = vi.fn(async () => {
      throw new Error("Provider configuration reached.");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      t.action(internal.vault.cloudflare.configureWorkersBuildsForGitHubForWorkflow, {
        runId,
        userId,
        vaultId,
        workerId,
      }),
    ).rejects.toThrow("Provider configuration reached.");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("removes an attachment only after Cloudflare confirms its Worker identity is missing", async () => {
    const { asUser, t, vaultId, workerId } = await createCloudflareConnectedVault();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : String(input);
        if (new URL(url).pathname === "/client/v4/accounts") {
          return cloudflareResponse([{ id: accountId, name: "Ada Cloudflare", type: "standard" }]);
        }
        return cloudflareResponse(null, 404);
      }),
    );

    await expect(
      asUser.action(api.vault.cloudflare.removeMissingWorker, { vaultId, workerId }),
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => await ctx.db.get(workerId))).resolves.toBeNull();
  });

  it("keeps an attachment when the connected credential cannot access its account", async () => {
    const { asUser, t, vaultId, workerId } = await createCloudflareConnectedVault();
    const fetchMock = vi.fn(async () => cloudflareResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      asUser.action(api.vault.cloudflare.removeMissingWorker, { vaultId, workerId }),
    ).rejects.toThrow("Cloudflare account is not available for this connection.");
    expect(fetchMock).toHaveBeenCalledOnce();
    await expect(t.run(async (ctx) => await ctx.db.get(workerId))).resolves.toMatchObject({
      workerTag: "worker-tag",
    });
  });

  it("keeps an attachment while the same Worker identity still exists", async () => {
    const { asUser, t, vaultId, workerId } = await createCloudflareConnectedVault();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : String(input);
        if (new URL(url).pathname === "/client/v4/accounts") {
          return cloudflareResponse([{ id: accountId, name: "Ada Cloudflare", type: "standard" }]);
        }
        return cloudflareResponse({
          created_on: "2026-07-20T00:00:00Z",
          id: "worker-tag",
          logpush: false,
          name: "missing-worker",
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
          updated_on: "2026-07-20T00:00:00Z",
        });
      }),
    );

    await expect(
      asUser.action(api.vault.cloudflare.removeMissingWorker, { vaultId, workerId }),
    ).rejects.toThrow("Cloudflare Worker still exists.");
    await expect(t.run(async (ctx) => await ctx.db.get(workerId))).resolves.toMatchObject({
      workerTag: "worker-tag",
    });
  });

  it("stops a managed retry when the previous Worker create result is unknown", async () => {
    const { appId, t, userId, vaultId, workerId } = await createCloudflareConnectedVault();
    const runId = await t.run(async (ctx) => {
      await ctx.db.delete(workerId);
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId,
        vaultId,
        repositoryFullName: "ada/demo",
        trigger: "retry",
        state: "running",
        currentStep: "attach_worker",
        createdAt: 30,
        updatedAt: 30,
      });
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        runId,
        state: "active",
        updatedAt: 30,
      });
      await ctx.db.insert("workflow_vaultProvisioning_plans", {
        vaultId,
        userId,
        appRoot: ".",
        convex: { state: "planned", projectName: "demo" },
        cloudflare: {
          state: "creating",
          accountId,
          workerName: "demo",
          build: {
            rootDirectory: "/",
            buildCommand: "pnpm run build",
            deployCommand: "pnpm run deploy",
            previewDeployCommand: "pnpm run deploy:preview",
            pathIncludes: ["*"],
            pathExcludes: [],
          },
        },
        createdAt: 30,
        updatedAt: 30,
      });
      return runId;
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      t.action(internal.vault.cloudflare.ensureCloudflareWorkerConnection, {
        vaultId,
        runId,
        userId,
        appId,
        accountId,
        workerName: "demo",
      }),
    ).rejects.toThrow("previous Cloudflare Worker create may have completed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not delete a newly created Worker after its attachment loses a race", async () => {
    const { asUser, t, userId, vaultId } = await createCloudflareConnectedVault();
    const appId = await t.run(async (ctx) => {
      const app = await ctx.db
        .query("vaultApps")
        .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
        .unique();
      if (!app) {
        throw new Error("Test app not found.");
      }
      return app._id;
    });
    const existingAttachmentId = await t.run(async (ctx) => {
      return await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        userId,
        appId,
        accountId,
        workerName: "rollback-worker",
        workerTag: "old-tag",
        origin: "selected_existing",
        createdAt: 5,
      });
    });
    const requests: { method: string; url: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        const method = input instanceof Request ? input.method : (init?.method ?? "GET");
        requests.push({ method, url });
        if (method === "GET" && new URL(url).pathname === "/client/v4/accounts") {
          return cloudflareResponse([{ id: accountId, name: "Ada Cloudflare", type: "standard" }]);
        }
        if (method === "GET" && url.includes("/workers/workers/rollback-worker")) {
          return cloudflareResponse(null, 404);
        }
        if (method === "POST" && url.endsWith("/workers/workers")) {
          return cloudflareResponse({
            id: "new-tag",
            name: "rollback-worker",
            created_on: "2026-07-20T00:00:00Z",
            updated_on: "2026-07-20T00:00:00Z",
            logpush: false,
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
          });
        }
        throw new Error(`Unexpected Cloudflare request: ${method} ${url}`);
      }),
    );

    await expect(
      asUser.action(api.vault.cloudflare.createWorker, {
        vaultId,
        appId,
        accountId,
        workerName: "rollback-worker",
      }),
    ).rejects.toThrow("Cloudflare Worker is already attached.");
    expect(
      requests.some(
        (request) =>
          request.method === "DELETE" && request.url.includes("/workers/workers/new-tag"),
      ),
    ).toBe(false);
    await expect(
      t.run(async (ctx) => await ctx.db.get(existingAttachmentId)),
    ).resolves.toMatchObject({ workerTag: "old-tag" });
  });
});
