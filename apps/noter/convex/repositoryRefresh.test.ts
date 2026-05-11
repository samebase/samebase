import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";
import { MAX_DASHBOARD_REFRESH_DEMAND_VAULTS } from "../shared/repositoryRefresh";

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

async function insertConnectedVaultForUser(
  t: ConvexTest,
  args: {
    userId: Id<"users">;
    repositoryFullName: string;
    ghRepoId: string;
    owner: string;
    name: string;
    connectedAt: number;
  },
): Promise<Id<"vaults">> {
  return await t.run(async (ctx) => {
    const vaultId = await ctx.db.insert("vaults", {
      userId: args.userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId: args.userId,
      vaultId,
      repositoryFullName: args.repositoryFullName,
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 3,
    });
    await ctx.db.replace(vaultId, {
      userId: args.userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: args.ghRepoId,
      owner: args.owner,
      name: args.name,
      defaultBranch: "main",
      visibility: "private",
      convex: { state: "not_configured" },
      cloudflare: { state: "not_configured" },
      connectedAt: args.connectedAt,
    });
    return vaultId;
  });
}

function readSingleDashboardResult(
  page: (typeof api.repositoryRefresh.enqueueDashboardRepositoryRefresh)["_returnType"],
) {
  expect(page.results).toHaveLength(1);
  const entry = page.results[0];
  return entry.result;
}

describe("repository refresh demand ingest", () => {
  it("coalesces duplicate dashboard demand without rewriting queued rows", async () => {
    const { asUser, t } = await createConnectedVault();

    const first = readSingleDashboardResult(
      await asUser.mutation(
        api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
        {
          trigger: "page_load",
          cursor: null,
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
          trigger: "visibility",
          cursor: null,
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

  it("selects all connected dashboard vaults on the backend", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const secondVaultId = await insertConnectedVaultForUser(t, {
      userId: ids.userId,
      repositoryFullName: "ada/second-refresh",
      ghRepoId: "456",
      owner: "ada",
      name: "second-refresh",
      connectedAt: 5,
    });

    const results = await asUser.mutation(
      api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
      {
        trigger: "page_load",
        cursor: null,
      },
    );

    expect(results.results).toMatchObject([
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

  it("does not enqueue dashboard demand for another user's vault", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Grace",
        email: "grace@example.com",
        isApproved: true,
      });
    });
    await insertConnectedVaultForUser(t, {
      userId: otherUserId,
      repositoryFullName: "grace/private-refresh",
      ghRepoId: "999",
      owner: "grace",
      name: "private-refresh",
      connectedAt: 5,
    });

    const results = await asUser.mutation(
      api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
      {
        trigger: "page_load",
        cursor: null,
      },
    );

    expect(results.results).toMatchObject([
      {
        vaultId: ids.vaultId,
        result: { kind: "created" },
      },
    ]);
    await expect(listRefreshRequests(t)).resolves.toHaveLength(1);
  });

  it("continues backend-selected dashboard vault pages", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    for (let index = 1; index <= MAX_DASHBOARD_REFRESH_DEMAND_VAULTS; index++) {
      await insertConnectedVaultForUser(t, {
        userId: ids.userId,
        repositoryFullName: `ada/refresh-${index}`,
        ghRepoId: `bulk-${index}`,
        owner: "ada",
        name: `refresh-${index}`,
        connectedAt: index + 4,
      });
    }

    const results = await asUser.mutation(
      api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
      {
        trigger: "page_load",
        cursor: null,
      },
    );

    expect(results.results).toHaveLength(MAX_DASHBOARD_REFRESH_DEMAND_VAULTS);
    expect(results.isDone).toBe(false);
    if (!results.continueCursor) {
      throw new Error("Expected continuation cursor.");
    }
    const next = await asUser.mutation(
      api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
      {
        trigger: "page_load",
        cursor: results.continueCursor,
      },
    );

    expect(next.results).toHaveLength(1);
    expect(next.isDone).toBe(true);
    expect(next.continueCursor).toBeNull();
    await expect(listRefreshRequests(t)).resolves.toHaveLength(
      MAX_DASHBOARD_REFRESH_DEMAND_VAULTS + 1,
    );
  });

  it("upgrades queued dashboard demand when manual demand arrives", async () => {
    const { asUser, ids, t } = await createConnectedVault();

    const dashboard = readSingleDashboardResult(
      await asUser.mutation(
        api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
        {
          trigger: "page_load",
          cursor: null,
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
          trigger: "page_load",
          cursor: null,
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
    const { asUser, t } = await createConnectedVault();
    const created = readSingleDashboardResult(
      await asUser.mutation(
        api.repositoryRefresh.enqueueDashboardRepositoryRefresh,
        {
          trigger: "page_load",
          cursor: null,
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
          trigger: "visibility",
          cursor: null,
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

  it("skips dashboard demand after vault deletion starts", async () => {
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
        trigger: "page_load",
        cursor: null,
      }),
    ).resolves.toEqual({
      results: [],
      isDone: true,
      continueCursor: null,
    });
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

  it("derives source setup mode from the provisioning run", async () => {
    const { ids, t } = await createConnectedVault();
    const createRunId = await t.run(async (ctx) => {
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/refresh-me",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
    });

    const result = await t.mutation(
      internal.repositoryRefresh.enqueueSourceSetupRepositoryRefresh,
      {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: createRunId,
      },
    );

    expect(result.kind).toBe("created");
    if (result.kind !== "created") {
      throw new Error("Expected created result.");
    }
    await expect(getRefreshRequest(t, result.requestId)).resolves.toMatchObject(
      {
        demand: {
          scope: "repository",
          source: "source_setup",
          runId: createRunId,
          mode: "create_repository",
        },
      },
    );
  });

  it("rejects source setup demand for mismatched runs", async () => {
    const { ids, t } = await createConnectedVault();
    const otherRunId = await t.run(async (ctx) => {
      const otherVaultId = await ctx.db.insert("vaults", {
        userId: ids.userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: otherVaultId,
        repositoryFullName: "ada/other",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
    });

    await expect(
      t.mutation(
        internal.repositoryRefresh.enqueueSourceSetupRepositoryRefresh,
        {
          userId: ids.userId,
          vaultId: ids.vaultId,
          runId: otherRunId,
        },
      ),
    ).rejects.toThrow("Source setup run does not match refresh demand.");
  });

  it("rejects source setup demand for retry runs", async () => {
    const { ids, t } = await createConnectedVault();
    const retryRunId = await t.run(async (ctx) => {
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/refresh-me",
        trigger: "retry",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
    });

    await expect(
      t.mutation(
        internal.repositoryRefresh.enqueueSourceSetupRepositoryRefresh,
        {
          userId: ids.userId,
          vaultId: ids.vaultId,
          runId: retryRunId,
        },
      ),
    ).rejects.toThrow("Retry run is not source setup refresh demand.");
  });
});
