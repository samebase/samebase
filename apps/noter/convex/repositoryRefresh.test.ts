import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { MAX_DASHBOARD_REFRESH_DEMAND_BATCH_SIZE } from "./repositoryRefresh";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

async function createConnectedVault() {
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
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/refresh-me",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 3,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: "123",
      owner: "ada",
      name: "refresh-me",
      defaultBranch: "main",
      visibility: "private",
      convex: { state: "not_configured" },
      cloudflare: { state: "not_configured" },
      connectedAt: 4,
    });

    return { runId, userId, vaultId };
  });

  const asUser = t.withIdentity({
    subject: `${ids.userId}|test-session`,
    tokenIdentifier: `test:${ids.userId}`,
  });

  return { asUser, ids, t };
}

async function getRefreshRequest(
  t: ConvexTest,
  requestId: Id<"repositoryRefreshRequests">,
): Promise<Doc<"repositoryRefreshRequests">> {
  const request = await t.run(async (ctx) => {
    return await ctx.db.get(requestId);
  });
  if (!request) {
    throw new Error("Repository refresh request not found.");
  }
  return request;
}

async function listRefreshRequests(t: ConvexTest) {
  return await t.run(async (ctx) => {
    return await ctx.db.query("repositoryRefreshRequests").collect();
  });
}

function readSingleDashboardResult(
  results: (typeof api.repositoryRefresh.enqueueDashboardRepositoryRefresh)["_returnType"],
) {
  expect(results).toHaveLength(1);
  const entry = results[0];
  return entry.result;
}

describe("repository refresh demand ingest", () => {
  it("coalesces duplicate dashboard demand without rewriting queued rows", async () => {
    const { asUser, ids, t } = await createConnectedVault();

    const first = readSingleDashboardResult(
      await asUser.mutation(
        api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
        {
          vaultIds: [ids.vaultId],
          trigger: "page_load",
        },
      ),
    );
    expect(first.kind).toBe("created");
    if (first.kind !== "created") {
      throw new Error("Expected created result.");
    }

    const before = await getRefreshRequest(t, first.requestId);
    const second = readSingleDashboardResult(
      await asUser.mutation(
        api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
        {
          vaultIds: [ids.vaultId],
          trigger: "visibility",
        },
      ),
    );

    expect(second).toEqual({
      kind: "already_queued",
      requestId: first.requestId,
    });
    await expect(getRefreshRequest(t, first.requestId)).resolves.toEqual(
      before,
    );
  });

  it("enqueues dashboard demand for multiple vaults in one mutation", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const secondVaultId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        userId: ids.userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId,
        repositoryFullName: "ada/second-refresh",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
      await ctx.db.replace(vaultId, {
        userId: ids.userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId,
        ghRepoId: "456",
        owner: "ada",
        name: "second-refresh",
        defaultBranch: "main",
        visibility: "private",
        convex: { state: "not_configured" },
        cloudflare: { state: "not_configured" },
        connectedAt: 4,
      });
      return vaultId;
    });

    const results = await asUser.mutation(
      api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
      {
        vaultIds: [ids.vaultId, secondVaultId],
        trigger: "page_load",
      },
    );

    expect(results).toMatchObject([
      {
        vaultId: ids.vaultId,
        result: { kind: "created" },
      },
      {
        vaultId: secondVaultId,
        result: { kind: "created" },
      },
    ]);
    await expect(listRefreshRequests(t)).resolves.toHaveLength(2);
  });

  it("bounds dashboard demand batches", async () => {
    const { asUser, ids } = await createConnectedVault();
    const tooManyVaultIds = Array.from(
      { length: MAX_DASHBOARD_REFRESH_DEMAND_BATCH_SIZE + 1 },
      () => ids.vaultId,
    );

    await expect(
      asUser.mutation(api.repositoryRefresh.enqueueDashboardRepositoryRefresh, {
        vaultIds: tooManyVaultIds,
        trigger: "page_load",
      }),
    ).rejects.toThrow("Too many dashboard repository refresh demands.");
  });

  it("deduplicates repeated vault ids inside one dashboard batch", async () => {
    const { asUser, ids, t } = await createConnectedVault();

    const results = await asUser.mutation(
      api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
      {
        vaultIds: [ids.vaultId, ids.vaultId],
        trigger: "page_load",
      },
    );

    expect(results).toMatchObject([
      {
        vaultId: ids.vaultId,
        result: { kind: "created" },
      },
    ]);
    await expect(listRefreshRequests(t)).resolves.toHaveLength(1);
  });

  it("upgrades queued dashboard demand when manual demand arrives", async () => {
    const { asUser, ids, t } = await createConnectedVault();

    const dashboard = readSingleDashboardResult(
      await asUser.mutation(
        api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
        {
          vaultIds: [ids.vaultId],
          trigger: "page_load",
        },
      ),
    );
    expect(dashboard.kind).toBe("created");
    if (dashboard.kind !== "created") {
      throw new Error("Expected created result.");
    }
    const before = await getRefreshRequest(t, dashboard.requestId);
    if (before.lifecycle.state !== "queued") {
      throw new Error("Expected queued request.");
    }

    const manual = await asUser.mutation(
      api.repositoryRefresh.enqueueManualRepositoryRefresh,
      {
        vaultId: ids.vaultId,
      },
    );
    expect(manual).toEqual({
      kind: "updated",
      requestId: dashboard.requestId,
    });

    const after = await getRefreshRequest(t, dashboard.requestId);
    expect(after.demand).toEqual({
      scope: "repository",
      source: "manual",
      trigger: "dashboard_status_click",
    });
    expect(after.createdAt).toBe(before.createdAt);
    if (after.lifecycle.state !== "queued") {
      throw new Error("Expected queued request.");
    }
    expect(after.lifecycle.queuedAt).toBe(before.lifecycle.queuedAt);
    expect(after.lifecycle.notBefore).toBeGreaterThanOrEqual(
      before.lifecycle.notBefore,
    );
    expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
  });

  it("reuses running demand unchanged", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const created = readSingleDashboardResult(
      await asUser.mutation(
        api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
        {
          vaultIds: [ids.vaultId],
          trigger: "page_load",
        },
      ),
    );
    expect(created.kind).toBe("created");
    if (created.kind !== "created") {
      throw new Error("Expected created result.");
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(created.requestId, {
        lifecycle: {
          state: "running",
          attempt: 1,
          startedAt: 20,
          workpoolJobId: "job-1",
        },
        updatedAt: 20,
      });
    });
    const before = await getRefreshRequest(t, created.requestId);

    const duplicate = await asUser.mutation(
      api.repositoryRefresh.enqueueManualRepositoryRefresh,
      {
        vaultId: ids.vaultId,
      },
    );

    expect(duplicate).toEqual({
      kind: "already_running",
      requestId: created.requestId,
    });
    await expect(getRefreshRequest(t, created.requestId)).resolves.toEqual(
      before,
    );
  });

  it("creates a new row when the matching row is terminal history", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const created = readSingleDashboardResult(
      await asUser.mutation(
        api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
        {
          vaultIds: [ids.vaultId],
          trigger: "page_load",
        },
      ),
    );
    expect(created.kind).toBe("created");
    if (created.kind !== "created") {
      throw new Error("Expected created result.");
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(created.requestId, {
        lifecycle: {
          state: "succeeded",
          attempt: 1,
          startedAt: 20,
          completedAt: 21,
          result: {
            kind: "no_work_needed",
          },
        },
        updatedAt: 21,
      });
    });

    const next = readSingleDashboardResult(
      await asUser.mutation(
        api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
        {
          vaultIds: [ids.vaultId],
          trigger: "visibility",
        },
      ),
    );

    expect(next.kind).toBe("created");
    if (next.kind !== "created") {
      throw new Error("Expected created result.");
    }
    expect(next.requestId).not.toBe(created.requestId);
    await expect(listRefreshRequests(t)).resolves.toHaveLength(2);
  });

  it("blocks demand after vault deletion starts", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await t.mutation(internal.vaultDeletionRuns.createInitialRun, {
      userId: ids.userId,
      vaultId: ids.vaultId,
      options: {
        removeCodespaces: false,
        removeGithubRepo: false,
        removeConvexProvision: false,
        removeCloudflareProvision: false,
      },
    });

    await expect(
      asUser.mutation(api.repositoryRefresh.enqueueDashboardRepositoryRefresh, {
        vaultIds: [ids.vaultId],
        trigger: "page_load",
      }),
    ).resolves.toEqual([
      {
        vaultId: ids.vaultId,
        result: {
          kind: "blocked",
          reason: "vault_deleting",
        },
      },
    ]);
    await expect(listRefreshRequests(t)).resolves.toHaveLength(0);
  });

  it("enqueues source setup demand for existing repository completion", async () => {
    const { ids, t } = await createConnectedVault();

    const result = await t.mutation(
      internal.repositoryRefresh.enqueueSourceSetupRepositoryRefresh,
      {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: ids.runId,
        mode: "connect_existing_repository",
      },
    );

    expect(result.kind).toBe("created");
    if (result.kind !== "created") {
      throw new Error("Expected created result.");
    }
    await expect(getRefreshRequest(t, result.requestId)).resolves.toMatchObject(
      {
        userId: ids.userId,
        vaultId: ids.vaultId,
        demand: {
          scope: "repository",
          source: "source_setup",
          runId: ids.runId,
          mode: "connect_existing_repository",
        },
        lifecycle: {
          state: "queued",
        },
      },
    );
  });
});
