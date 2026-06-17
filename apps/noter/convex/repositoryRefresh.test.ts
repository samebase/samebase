import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { isRateLimitError } from "@convex-dev/rate-limiter";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";
import { MAX_DASHBOARD_REFRESH_DEMAND_VAULTS } from "../shared/repositoryRefresh";
import {
  makeRepositoryRefreshRequest,
  markRepositoryRefreshRequestScheduled,
  type RepositoryRefreshDemand,
} from "./repositoryRefreshModel";

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
      connectedAt: args.connectedAt,
    });
    return vaultId;
  });
}

async function createNotConnectedVault() {
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
    return { userId, vaultId };
  });
  const asUser = t.withIdentity({
    subject: `${ids.userId}|test-session`,
    tokenIdentifier: `test:${ids.userId}`,
  });
  return { asUser, ids, t };
}

async function readSingleRefreshRequest(t: ConvexTest): Promise<Doc<"repositoryRefreshRequests">> {
  const requests = await listRefreshRequests(t);
  expect(requests).toHaveLength(1);
  return requests[0];
}

async function insertScheduledRepositoryRefreshRequest(
  t: ConvexTest,
  args: {
    userId: Id<"users">;
    vaultId: Id<"vaults">;
    demand?: RepositoryRefreshDemand;
    workpoolJobId?: string;
  },
): Promise<Id<"repositoryRefreshRequests">> {
  return await t.run(async (ctx) => {
    const queued = makeRepositoryRefreshRequest({
      userId: args.userId,
      vaultId: args.vaultId,
      now: 100,
      demand:
        args.demand ??
        ({
          scope: "repository",
          source: "dashboard",
        } satisfies RepositoryRefreshDemand),
    });
    const scheduled = markRepositoryRefreshRequestScheduled(queued, {
      now: 101,
      workpoolJobId: args.workpoolJobId ?? "job-1",
    });
    return await ctx.db.insert("repositoryRefreshRequests", scheduled);
  });
}

describe("repository refresh demand ingest", () => {
  beforeEach(() => {
    // convex-test runs scheduled Workpool timers automatically; these tests
    // inspect demand rows and call worker mutations explicitly when needed.
    vi.useFakeTimers();
  });

  afterEach(async () => {
    // Let pending Workpool promises settle before timer cleanup.
    await Promise.resolve();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("coalesces duplicate dashboard demand without rewriting scheduled rows", async () => {
    const { asUser, t } = await createConnectedVault();

    await expect(
      asUser.mutation(api.repositoryRefresh.enqueueDashboardRepositoryRefresh),
    ).resolves.toBeNull();
    const first = await readSingleRefreshRequest(t);
    expect(first.demand).toEqual({
      scope: "repository",
      source: "dashboard",
    });
    expect(first.lifecycle.state).toBe("scheduled");

    const before = await getRefreshRequest(t, first._id);
    await expect(
      asUser.mutation(api.repositoryRefresh.enqueueDashboardRepositoryRefresh),
    ).resolves.toBeNull();

    await expect(getRefreshRequest(t, first._id)).resolves.toEqual(before);
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

    await expect(
      asUser.mutation(api.repositoryRefresh.enqueueDashboardRepositoryRefresh),
    ).resolves.toBeNull();

    const requests = await listRefreshRequests(t);
    expect(requests).toHaveLength(2);
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vaultId: ids.vaultId,
          demand: {
            scope: "repository",
            source: "dashboard",
          },
        }),
        expect.objectContaining({
          vaultId: secondVaultId,
          demand: {
            scope: "repository",
            source: "dashboard",
          },
        }),
      ]),
    );
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

    await expect(
      asUser.mutation(api.repositoryRefresh.enqueueDashboardRepositoryRefresh),
    ).resolves.toBeNull();

    const requests = await listRefreshRequests(t);
    expect(requests.map((request) => request.vaultId)).toEqual([ids.vaultId]);
  });

  it("keeps dashboard vault-page continuation inside Convex", async () => {
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

    const firstPage = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaults")
        .withIndex("by_userId_and_state_and_deletion_state", (q) =>
          q.eq("userId", ids.userId).eq("state", "connected").eq("deletion.state", "not_deleting"),
        )
        .paginate({
          cursor: null,
          numItems: MAX_DASHBOARD_REFRESH_DEMAND_VAULTS,
        });
    });
    if (firstPage.isDone) {
      throw new Error("Expected another dashboard vault page.");
    }

    await expect(
      asUser.mutation(api.repositoryRefresh.enqueueDashboardRepositoryRefresh),
    ).resolves.toBeNull();

    await expect(listRefreshRequests(t)).resolves.toHaveLength(MAX_DASHBOARD_REFRESH_DEMAND_VAULTS);

    await t.mutation(internal.repositoryRefresh.enqueueDashboardRepositoryRefreshPage, {
      userId: ids.userId,
      cursor: firstPage.continueCursor,
    });

    await expect(listRefreshRequests(t)).resolves.toHaveLength(
      MAX_DASHBOARD_REFRESH_DEMAND_VAULTS + 1,
    );
  });

  it("upgrades queued dashboard demand from before the runner claimed it", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    const requestId = await t.run(async (ctx) => {
      return await ctx.db.insert(
        "repositoryRefreshRequests",
        makeRepositoryRefreshRequest({
          userId: ids.userId,
          vaultId: ids.vaultId,
          now: 100,
          demand: {
            scope: "repository",
            source: "dashboard",
          },
        }),
      );
    });
    const before = await getRefreshRequest(t, requestId);
    if (before.lifecycle.state !== "queued") {
      throw new Error("Expected queued request.");
    }

    const manual = await asUser.mutation(api.repositoryRefresh.enqueueManualRepositoryRefresh, {
      vaultId: ids.vaultId,
    });
    expect(manual).toEqual({
      kind: "updated",
      requestId,
    });

    const after = await getRefreshRequest(t, requestId);
    expect(after.demand).toEqual({
      scope: "repository",
      source: "manual",
    });
    expect(after.createdAt).toBe(before.createdAt);
    if (after.lifecycle.state !== "scheduled") {
      throw new Error("Expected scheduled request.");
    }
    expect(after.lifecycle.workpoolJobId).toEqual(expect.any(String));
    expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
  });

  it("upgrades scheduled dashboard demand before the worker starts", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await asUser.mutation(api.repositoryRefresh.enqueueDashboardRepositoryRefresh);
    const before = await readSingleRefreshRequest(t);
    if (before.lifecycle.state !== "scheduled") {
      throw new Error("Expected scheduled request.");
    }

    const manual = await asUser.mutation(api.repositoryRefresh.enqueueManualRepositoryRefresh, {
      vaultId: ids.vaultId,
    });

    expect(manual).toEqual({
      kind: "updated",
      requestId: before._id,
    });
    const after = await getRefreshRequest(t, before._id);
    expect(after.demand).toEqual({
      scope: "repository",
      source: "manual",
    });
    expect(after.lifecycle).toMatchObject({
      state: "scheduled",
      workpoolJobId: before.lifecycle.workpoolJobId,
      scheduledAt: before.lifecycle.scheduledAt,
    });
  });

  it("blocks manual demand for non-connected owned vaults", async () => {
    const { asUser, ids, t } = await createNotConnectedVault();

    await expect(
      asUser.mutation(api.repositoryRefresh.enqueueManualRepositoryRefresh, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      kind: "blocked",
      reason: "vault_not_connected",
    });
    await expect(listRefreshRequests(t)).resolves.toHaveLength(0);
  });

  it("rate limits manual demand per viewer", async () => {
    const { asUser, ids } = await createConnectedVault();

    await asUser.mutation(api.repositoryRefresh.enqueueManualRepositoryRefresh, {
      vaultId: ids.vaultId,
    });
    await asUser.mutation(api.repositoryRefresh.enqueueManualRepositoryRefresh, {
      vaultId: ids.vaultId,
    });
    await asUser.mutation(api.repositoryRefresh.enqueueManualRepositoryRefresh, {
      vaultId: ids.vaultId,
    });

    let rejection: unknown = null;
    try {
      await asUser.mutation(api.repositoryRefresh.enqueueManualRepositoryRefresh, {
        vaultId: ids.vaultId,
      });
    } catch (error) {
      rejection = error;
    }

    expect(isRateLimitError(rejection)).toBe(true);
  });

  it("reuses running demand unchanged", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await asUser.mutation(api.repositoryRefresh.enqueueDashboardRepositoryRefresh);
    const created = await readSingleRefreshRequest(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(created._id, {
        lifecycle: {
          state: "running",
          startedAt: 20,
          leaseExpiresAt: Date.now() + 60_000,
          workpoolJobId: "job-1",
        },
        updatedAt: 20,
      });
    });
    const before = await getRefreshRequest(t, created._id);

    const duplicate = await asUser.mutation(api.repositoryRefresh.enqueueManualRepositoryRefresh, {
      vaultId: ids.vaultId,
    });

    expect(duplicate).toEqual({
      kind: "already_running",
      requestId: created._id,
    });
    await expect(getRefreshRequest(t, created._id)).resolves.toEqual(before);
  });

  it("worker start cancels scheduled work after vault deletion starts", async () => {
    const { ids, t } = await createConnectedVault();
    const requestId = await insertScheduledRepositoryRefreshRequest(t, {
      userId: ids.userId,
      vaultId: ids.vaultId,
    });
    await t.mutation(internal.vault.deletion.runs.createInitialRun, {
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
      t.mutation(internal.repositoryRefresh.startRepositoryRefreshRequest, {
        requestId,
      }),
    ).resolves.toEqual({
      kind: "cancel",
      reason: "vault_deleting",
    });
  });

  it("worker start creates the running lease only when work begins", async () => {
    const { ids, t } = await createConnectedVault();
    const requestId = await insertScheduledRepositoryRefreshRequest(t, {
      userId: ids.userId,
      vaultId: ids.vaultId,
    });
    const request = await getRefreshRequest(t, requestId);
    if (request.lifecycle.state !== "scheduled") {
      throw new Error("Expected scheduled request.");
    }

    await expect(
      t.mutation(internal.repositoryRefresh.startRepositoryRefreshRequest, {
        requestId,
      }),
    ).resolves.toMatchObject({
      kind: "ready",
      userId: ids.userId,
      vaultId: ids.vaultId,
      owner: "ada",
      repo: "refresh-me",
      demand: {
        scope: "repository",
      },
    });

    const running = await getRefreshRequest(t, request._id);
    expect(running.lifecycle).toMatchObject({
      state: "running",
      workpoolJobId: request.lifecycle.workpoolJobId,
    });
    if (running.lifecycle.state !== "running") {
      throw new Error("Expected running request.");
    }
    expect(running.lifecycle.startedAt).toBeGreaterThanOrEqual(request.lifecycle.scheduledAt);
    expect(running.lifecycle.leaseExpiresAt).toBeGreaterThan(running.lifecycle.startedAt);
  });

  it("ignores failed completion from a stale Workpool job", async () => {
    const { ids, t } = await createConnectedVault();
    const requestId = await insertScheduledRepositoryRefreshRequest(t, {
      userId: ids.userId,
      vaultId: ids.vaultId,
    });
    const request = await getRefreshRequest(t, requestId);
    if (request.lifecycle.state !== "scheduled") {
      throw new Error("Expected scheduled request.");
    }

    await t.mutation(internal.repositoryRefresh.finishRepositoryRefreshRequestFailed, {
      requestId: request._id,
      workpoolJobId: "stale-job",
      failure: {
        kind: "provider_error",
        cooldownUntil: 200,
        message: "Stale job failed late.",
      },
    });

    await expect(getRefreshRequest(t, request._id)).resolves.toEqual(request);
  });

  it("marks Workpool cancellation with its own cancel reason", async () => {
    const { ids, t } = await createConnectedVault();
    const requestId = await insertScheduledRepositoryRefreshRequest(t, {
      userId: ids.userId,
      vaultId: ids.vaultId,
    });
    const request = await getRefreshRequest(t, requestId);
    if (request.lifecycle.state !== "scheduled") {
      throw new Error("Expected scheduled request.");
    }

    await t.mutation(internal.repositoryRefresh.finishRepositoryRefreshRequestCanceled, {
      requestId: request._id,
      workpoolJobId: request.lifecycle.workpoolJobId,
      reason: "worker_canceled",
    });

    await expect(getRefreshRequest(t, request._id)).resolves.toMatchObject({
      lifecycle: {
        state: "canceled",
        reason: "worker_canceled",
      },
    });
  });

  it("creates a new row when the matching row is terminal history", async () => {
    const { asUser, t } = await createConnectedVault();
    await asUser.mutation(api.repositoryRefresh.enqueueDashboardRepositoryRefresh);
    const created = await readSingleRefreshRequest(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(created._id, {
        lifecycle: {
          state: "succeeded",
          startedAt: 20,
          completedAt: 21,
          result: {
            kind: "no_work_needed",
          },
        },
        updatedAt: 21,
      });
    });

    await asUser.mutation(api.repositoryRefresh.enqueueDashboardRepositoryRefresh);

    const requests = await listRefreshRequests(t);
    expect(requests).toHaveLength(2);
    expect(requests.map((request) => request._id)).toContain(created._id);
    expect(requests.some((request) => request._id !== created._id)).toBe(true);
  });

  it("skips dashboard demand after vault deletion starts", async () => {
    const { asUser, ids, t } = await createConnectedVault();
    await t.mutation(internal.vault.deletion.runs.createInitialRun, {
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
      asUser.mutation(api.repositoryRefresh.enqueueDashboardRepositoryRefresh),
    ).resolves.toBeNull();
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
    await expect(getRefreshRequest(t, result.requestId)).resolves.toMatchObject({
      userId: ids.userId,
      vaultId: ids.vaultId,
      demand: {
        scope: "repository",
        source: "source_setup",
        runId: ids.runId,
      },
      lifecycle: {
        state: "scheduled",
      },
    });
  });

  it("completes existing repository setup and enqueues refresh atomically", async () => {
    const { ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.runId, {
        state: "running",
        currentStep: "sync_tree",
        completedAt: undefined,
      });
    });

    const result = await t.mutation(
      internal.repositoryRefresh.completeExistingRepositoryConnectionAndEnqueueRefresh,
      {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: ids.runId,
      },
    );

    expect(result.kind).toBe("created");
    const run = await t.run(async (ctx) => {
      return await ctx.db.get(ids.runId);
    });
    expect(run).toMatchObject({
      state: "succeeded",
      currentStep: "finish",
    });
    const events = await t.run(async (ctx) => {
      return await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
    });
    expect(events).toEqual([
      expect.objectContaining({
        step: "finish",
        level: "info",
        message: "Connected existing repository.",
      }),
    ]);
    await expect(listRefreshRequests(t)).resolves.toHaveLength(1);
  });

  it("rejects existing repository completion before the finish boundary", async () => {
    const { ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.runId, {
        state: "running",
        currentStep: "connect_github",
        completedAt: undefined,
      });
    });

    await expect(
      t.mutation(internal.repositoryRefresh.completeExistingRepositoryConnectionAndEnqueueRefresh, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: ids.runId,
      }),
    ).rejects.toThrow("Existing repository workflow has not reached the finish boundary.");
    await expect(listRefreshRequests(t)).resolves.toHaveLength(0);
    const run = await t.run(async (ctx) => {
      return await ctx.db.get(ids.runId);
    });
    expect(run).toMatchObject({
      state: "running",
      currentStep: "connect_github",
    });
  });

  it("rejects existing repository completion before the vault is connected", async () => {
    const { ids, t } = await createNotConnectedVault();
    const runId = await t.run(async (ctx) => {
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/refresh-me",
        trigger: "connect_existing_repository",
        state: "running",
        currentStep: "sync_tree",
        createdAt: 1,
        updatedAt: 2,
      });
    });

    await expect(
      t.mutation(internal.repositoryRefresh.completeExistingRepositoryConnectionAndEnqueueRefresh, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId,
      }),
    ).rejects.toThrow("Existing repository vault is not connected.");
    await expect(listRefreshRequests(t)).resolves.toHaveLength(0);
    const run = await t.run(async (ctx) => {
      return await ctx.db.get(runId);
    });
    expect(run).toMatchObject({
      state: "running",
      currentStep: "sync_tree",
    });
  });

  it("accepts create source setup demand from the provisioning run", async () => {
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
    await expect(getRefreshRequest(t, result.requestId)).resolves.toMatchObject({
      demand: {
        scope: "repository",
        source: "source_setup",
        runId: createRunId,
      },
    });
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
      t.mutation(internal.repositoryRefresh.enqueueSourceSetupRepositoryRefresh, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: otherRunId,
      }),
    ).rejects.toThrow("Source setup run does not match refresh demand.");
  });

  it("rejects source setup demand before the run succeeds", async () => {
    const { ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.runId, {
        state: "running",
        currentStep: "finish",
        completedAt: undefined,
      });
    });

    await expect(
      t.mutation(internal.repositoryRefresh.enqueueSourceSetupRepositoryRefresh, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: ids.runId,
      }),
    ).rejects.toThrow("Source setup run has not succeeded.");
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
      t.mutation(internal.repositoryRefresh.enqueueSourceSetupRepositoryRefresh, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: retryRunId,
      }),
    ).rejects.toThrow("Retry run is not source setup refresh demand.");
  });
});
