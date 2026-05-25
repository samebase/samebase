import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

const appRoot = ".";

async function createAttachableVaultWithOwnership(args: { ownershipState: "active" | "failed" }) {
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
    const runState = args.ownershipState === "active" ? "running" : "failed";
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/manual-cloudflare",
      trigger: "retry",
      state: runState,
      currentStep: "ensure_cloudflare",
      createdAt: 10,
      updatedAt: 20,
      ...(runState === "failed" ? { lastError: "Cloudflare provisioning failed." } : {}),
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "create_repository",
      runId,
      ghRepoId: "123",
      owner: "ada",
      name: "manual-cloudflare",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
    });
    await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      appRoot,
      createdAt: 25,
    });
    await ctx.db.insert("vaultInfrastructureOwnership", {
      vaultId,
      runId,
      provisioningVersion: 2,
      state: args.ownershipState,
      updatedAt: 20,
    });

    return { userId, vaultId };
  });

  return { ids, t };
}

async function createCloudflareConnectionVault() {
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
    const sourceRunId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/manual-cloudflare",
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
      name: "manual-cloudflare",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
    });
    await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      appRoot,
      createdAt: 25,
    });
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/manual-cloudflare",
      trigger: "connect_cloudflare_worker",
      state: "queued",
      currentStep: "run_created",
      createdAt: 30,
      updatedAt: 30,
    });

    return { runId, userId, vaultId };
  });

  return { ids, t };
}

describe("vault Cloudflare attachment mutations", () => {
  it("claims, attaches, and finishes a durable Cloudflare Worker connection run", async () => {
    const { ids, t } = await createCloudflareConnectionVault();

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkerForRun, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ attached: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareWorkerConnection, {
        ...ids,
        appRoot,
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(ids.runId);
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      const worker = await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
      return { events, ownership, run, worker };
    });

    expect(result.ownership).toMatchObject({
      runId: ids.runId,
      state: "succeeded",
    });
    expect(result.run).toMatchObject({
      state: "succeeded",
      currentStep: "finish",
    });
    expect(result.worker).toMatchObject({
      appRoot,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      origin: "selected_existing",
    });
    expect(result.events.map((event) => event.step)).toEqual([
      "claim_infra",
      "ensure_cloudflare",
      "finish",
    ]);
  });

  it("attaches multiple Cloudflare Workers to one vault by app root", async () => {
    const { ids, t } = await createCloudflareConnectionVault();

    await t.mutation(internal.vault.cloudflareMutations.attachWorker, {
      vaultId: ids.vaultId,
      userId: ids.userId,
      appRoot,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      origin: "selected_existing",
    });
    await t.mutation(internal.vault.cloudflareMutations.attachWorker, {
      vaultId: ids.vaultId,
      userId: ids.userId,
      appRoot: "apps/admin",
      accountId: "cloudflare-account",
      workerName: "admin-cloudflare-worker",
      workerTag: "admin-cloudflare-worker-tag",
      origin: "selected_existing",
    });

    const workers = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
    });

    expect(
      workers
        .map((worker) => ({
          appRoot: worker.appRoot,
          workerName: worker.workerName,
          vaultId: worker.vaultId,
        }))
        .sort((left, right) => left.appRoot.localeCompare(right.appRoot)),
    ).toEqual([
      {
        appRoot,
        workerName: "manual-cloudflare-worker",
        vaultId: ids.vaultId,
      },
      {
        appRoot: "apps/admin",
        workerName: "admin-cloudflare-worker",
        vaultId: ids.vaultId,
      },
    ]);
  });

  it("lets the durable claim supersede stale active ownership", async () => {
    const { ids, t } = await createCloudflareConnectionVault();
    const staleRunId = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger: "connect_cloudflare_worker",
        state: "running",
        currentStep: "ensure_cloudflare",
        createdAt: 10,
        updatedAt: 20,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId: ids.vaultId,
        runId,
        provisioningVersion: 1,
        state: "active",
        updatedAt: 1,
      });

      return runId;
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ claimed: true });

    const result = await t.run(async (ctx) => {
      const [staleRun, ownership] = await Promise.all([
        ctx.db.get(staleRunId),
        ctx.db
          .query("vaultInfrastructureOwnership")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .first(),
      ]);

      return { ownership, staleRun };
    });

    expect(result.ownership).toMatchObject({
      runId: ids.runId,
      provisioningVersion: 2,
      state: "active",
    });
    expect(result.staleRun).toMatchObject({
      state: "canceled",
      currentStep: "claim_infra",
    });
  });

  it("reports an unattached run so created Workers can be rolled back", async () => {
    const { ids, t } = await createCloudflareConnectionVault();

    await t.mutation(internal.vault.cloudflareMutations.claimCloudflareWorkerConnection, {
      ...ids,
      appRoot,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      origin: "provisioned",
    });
    await t.run(async (ctx) => {
      const otherRunId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-cloudflare",
        trigger: "connect_cloudflare_worker",
        state: "running",
        currentStep: "ensure_cloudflare",
        createdAt: 40,
        updatedAt: 40,
      });
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      if (!ownership) {
        throw new Error("Expected active ownership.");
      }
      await ctx.db.patch(ownership._id, {
        runId: otherRunId,
        updatedAt: 40,
      });
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkerForRun, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "provisioned",
      }),
    ).resolves.toEqual({ attached: false });

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(ids.runId);

      return { run };
    });

    expect(result.run).toMatchObject({
      state: "canceled",
      currentStep: "claim_infra",
    });
    expect(result.run).toBeTruthy();
  });

  it("keeps rollback from deleting a Worker that became the connected resource", async () => {
    const { ids, t } = await createCloudflareConnectionVault();

    await t.run(async (ctx) => {
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "provisioned",
        deployment: { state: "not_configured" },
        connectedAt: 50,
        lastObservedAt: 50,
      });
    });

    await expect(
      t.query(internal.vault.cloudflareMutations.readCreatedWorkerRollbackSafety, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
      }),
    ).resolves.toEqual({ shouldDelete: false });
    await expect(
      t.query(internal.vault.cloudflareMutations.readCreatedWorkerRollbackSafety, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "different-worker",
      }),
    ).resolves.toEqual({ shouldDelete: true });
  });

  it("rejects manual attachment while infrastructure ownership is active", async () => {
    const { ids, t } = await createAttachableVaultWithOwnership({
      ownershipState: "active",
    });

    await expect(
      t.query(internal.vault.cloudflareMutations.requireCloudflareWorkerConnectionVault, {
        ...ids,
        appRoot,
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.vault.cloudflareMutations.requireAttachableVault, {
        ...ids,
        appRoot,
      }),
    ).rejects.toThrow("Cloudflare provisioning is already running.");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorker, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
      }),
    ).rejects.toThrow("Cloudflare provisioning is already running.");
  });

  it("allows manual recovery after failed infrastructure ownership", async () => {
    const { ids, t } = await createAttachableVaultWithOwnership({
      ownershipState: "failed",
    });

    await expect(
      t.query(internal.vault.cloudflareMutations.requireAttachableVault, {
        ...ids,
        appRoot,
      }),
    ).resolves.toBeNull();
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorker, {
        ...ids,
        appRoot,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
      }),
    ).resolves.toBeNull();

    const worker = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_appRoot", (q) =>
          q.eq("vaultId", ids.vaultId).eq("appRoot", appRoot),
        )
        .first();
    });

    expect(worker).toMatchObject({
      appRoot,
      accountId: "cloudflare-account",
      workerName: "manual-cloudflare-worker",
      workerTag: "manual-cloudflare-worker-tag",
      origin: "selected_existing",
    });
  });
});
