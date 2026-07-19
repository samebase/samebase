import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

const appRoot = ".";
const accountId = "0123456789abcdef0123456789abcdef";

function cloudflareResponse(result: unknown): Response {
  return Response.json({ success: true, errors: [], messages: [], result });
}

function cloudflareNotFoundResponse(): Response {
  return Response.json(
    {
      success: false,
      errors: [{ code: 10007, message: "Worker not found" }],
      messages: [],
      result: null,
    },
    { status: 404 },
  );
}

function workerResult(args: { workerName: string; workerTag: string }) {
  return {
    created_on: "2026-07-19T00:00:00Z",
    id: args.workerName,
    logpush: false,
    name: args.workerName,
    observability: {
      enabled: false,
      head_sampling_rate: 1,
    },
    references: {
      dispatch_namespace_outbounds: [],
      domains: [],
      durable_objects: [],
      queues: [],
      workers: [],
    },
    subdomain: {
      enabled: false,
    },
    tag: args.workerTag,
    tags: [],
    tail_consumers: [],
    updated_on: "2026-07-19T00:00:00Z",
  };
}

async function createCloudflareReplacementRun() {
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
    const sourceRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId,
      vaultId,
      repositoryFullName: "ada/demo",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 10,
      updatedAt: 20,
      completedAt: 20,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId: sourceRunId,
      ghRepoId: "123",
      owner: "ada",
      name: "demo",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 20,
    });
    await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      appRoot,
      createdAt: 21,
    });
    const attachmentId = await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId,
      userId,
      appRoot,
      accountId,
      workerName: "deleted-worker",
      workerTag: "deleted-worker-tag",
      origin: "provisioned",
      connectedAt: 22,
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId,
      vaultId,
      repositoryFullName: "ada/demo",
      trigger: "connect_cloudflare_worker",
      state: "queued",
      currentStep: "run_created",
      createdAt: 30,
      updatedAt: 30,
    });
    return { attachmentId, runId, userId, vaultId };
  });
  const attachmentIntent = await t.query(
    internal.vault.cloudflareMutations.requireCloudflareWorkerConnectionVault,
    {
      userId: ids.userId,
      vaultId: ids.vaultId,
      appRoot,
    },
  );
  await t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
    runId: ids.runId,
    userId: ids.userId,
    vaultId: ids.vaultId,
    appRoot,
    accountId,
    workerName: "replacement-worker",
    origin: "selected_existing",
    attachmentIntent,
  });
  return { attachmentIntent, ids, t };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("vault Cloudflare Worker connection actions", () => {
  it("rechecks that the old Worker is missing before replacing its attachment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input);
        const path = new URL(url).pathname;
        switch (path) {
          case `/client/v4/accounts/${accountId}/workers/workers/deleted-worker`:
            return cloudflareNotFoundResponse();
          case "/client/v4/accounts":
            return cloudflareResponse([
              { id: accountId, name: "Ada Cloudflare", type: "standard" },
            ]);
          case `/client/v4/accounts/${accountId}/workers/scripts`:
            return cloudflareResponse([
              workerResult({
                workerName: "replacement-worker",
                workerTag: "replacement-worker-tag",
              }),
            ]);
          case `/client/v4/accounts/${accountId}/builds/workers/replacement-worker-tag/triggers`:
            return cloudflareResponse([]);
          case `/client/v4/accounts/${accountId}/workers/scripts/replacement-worker/subdomain`:
            return cloudflareResponse({ enabled: false });
          default:
            throw new Error(`Unexpected Cloudflare request: ${path}`);
        }
      }),
    );
    const { attachmentIntent, ids, t } = await createCloudflareReplacementRun();

    await expect(
      t.action(internal.vault.cloudflare.ensureCloudflareWorkerConnection, {
        runId: ids.runId,
        userId: ids.userId,
        vaultId: ids.vaultId,
        appRoot,
        accountId,
        workerName: "replacement-worker",
        origin: "selected_existing",
        attachmentIntent,
      }),
    ).resolves.toBeNull();

    const worker = await t.run(async (ctx) => await ctx.db.get(ids.attachmentId));
    expect(worker).toMatchObject({
      _id: ids.attachmentId,
      workerName: "replacement-worker",
      workerTag: "replacement-worker-tag",
      origin: "selected_existing",
    });
  });

  it("refuses replacement while the attached Worker identity still exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input);
        const path = new URL(url).pathname;
        if (path === `/client/v4/accounts/${accountId}/workers/workers/deleted-worker`) {
          return cloudflareResponse({
            ...workerResult({
              workerName: "deleted-worker",
              workerTag: "deleted-worker-tag",
            }),
            id: "deleted-worker-tag",
          });
        }
        throw new Error(`Unexpected Cloudflare request: ${path}`);
      }),
    );
    const { attachmentIntent, ids, t } = await createCloudflareReplacementRun();

    await expect(
      t.action(internal.vault.cloudflare.ensureCloudflareWorkerConnection, {
        runId: ids.runId,
        userId: ids.userId,
        vaultId: ids.vaultId,
        appRoot,
        accountId,
        workerName: "replacement-worker",
        origin: "selected_existing",
        attachmentIntent,
      }),
    ).rejects.toThrow("still exists and cannot be replaced");

    const worker = await t.run(async (ctx) => await ctx.db.get(ids.attachmentId));
    expect(worker).toMatchObject({
      workerName: "deleted-worker",
      workerTag: "deleted-worker-tag",
      connectedAt: 22,
    });
  });
});
