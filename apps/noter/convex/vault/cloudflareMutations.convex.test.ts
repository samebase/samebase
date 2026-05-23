import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

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
      convex: {
        state: "connected",
        projectId: "convex-project",
        projectSlug: "manual-cloudflare",
        deploymentName: "manual-cloudflare-prod",
        connectedAt: 14,
      },
      cloudflare: { state: "not_configured" },
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
      convex: { state: "not_configured" },
      cloudflare: { state: "not_configured" },
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
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorkerForRun, {
        ...ids,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
      }),
    ).resolves.toEqual({ attached: true });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.finishCloudflareWorkerConnection, ids),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const [vault, run] = await Promise.all([ctx.db.get(ids.vaultId), ctx.db.get(ids.runId)]);
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      return { events, ownership, run, vault };
    });

    expect(result.ownership).toMatchObject({
      runId: ids.runId,
      state: "succeeded",
    });
    expect(result.run).toMatchObject({
      state: "succeeded",
      currentStep: "finish",
    });
    expect(result.vault).toMatchObject({
      cloudflare: {
        state: "connected",
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
      },
    });
    expect(result.events.map((event) => event.step)).toEqual([
      "claim_infra",
      "ensure_cloudflare",
      "finish",
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
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "provisioned",
      }),
    ).resolves.toEqual({ attached: false });

    const result = await t.run(async (ctx) => {
      const [run, vault] = await Promise.all([ctx.db.get(ids.runId), ctx.db.get(ids.vaultId)]);

      return { run, vault };
    });

    expect(result.run).toMatchObject({
      state: "canceled",
      currentStep: "claim_infra",
    });
    expect(result.vault).toMatchObject({
      cloudflare: { state: "not_configured" },
    });
  });

  it("keeps rollback from deleting a Worker that became the connected resource", async () => {
    const { ids, t } = await createCloudflareConnectionVault();

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.vaultId, {
        cloudflare: {
          state: "connected",
          accountId: "cloudflare-account",
          workerName: "manual-cloudflare-worker",
          workerTag: "manual-cloudflare-worker-tag",
          origin: "provisioned",
          connectedAt: 50,
          lastObservedAt: 50,
        },
      });
    });

    await expect(
      t.query(internal.vault.cloudflareMutations.readCreatedWorkerRollbackSafety, {
        ...ids,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
      }),
    ).resolves.toEqual({ shouldDelete: false });
    await expect(
      t.query(internal.vault.cloudflareMutations.readCreatedWorkerRollbackSafety, {
        ...ids,
        accountId: "cloudflare-account",
        workerName: "different-worker",
        workerTag: "different-worker-tag",
      }),
    ).resolves.toEqual({ shouldDelete: true });
  });

  it("rejects manual attachment while infrastructure ownership is active", async () => {
    const { ids, t } = await createAttachableVaultWithOwnership({
      ownershipState: "active",
    });

    await expect(
      t.query(internal.vault.cloudflareMutations.requireCloudflareWorkerConnectionVault, ids),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.vault.cloudflareMutations.requireAttachableVault, ids),
    ).rejects.toThrow("Cloudflare provisioning is already running.");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorker, {
        ...ids,
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
      t.query(internal.vault.cloudflareMutations.requireAttachableVault, ids),
    ).resolves.toBeNull();
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorker, {
        ...ids,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
      }),
    ).resolves.toBeNull();

    const vault = await t.run(async (ctx) => await ctx.db.get(ids.vaultId));

    expect(vault).toMatchObject({
      cloudflare: {
        state: "connected",
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
      },
    });
  });
});
