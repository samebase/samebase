import { describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";
import {
  MANUAL_PROVIDER_RECOVERY_LEASE_MS,
  MANUAL_PROVIDER_WRITE_EXPIRY_MS,
  readVaultInfrastructureState,
} from "./infrastructureOperation";

type ConvexTest = ReturnType<typeof makeConvexTest>;

const convexTarget = {
  action: "create_convex_project",
  state: "requested",
  projectName: "manual-convex",
  codeLocation: {
    kind: "config",
    convexConfigPath: "convex.json",
    blobSha: "convex-config-blob",
  },
} as const;

const cloudflareTarget = {
  action: "create_cloudflare_worker",
  state: "requested",
  accountId: "cloudflare-account",
  workerName: "manual-worker",
  rootDirectory: "/",
} as const;

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
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId,
      vaultId,
      repositoryFullName: "ada/manual-provider-write",
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
      runId,
      ghRepoId: "123",
      owner: "ada",
      name: "manual-provider-write",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 20,
    });
    return { runId, userId, vaultId };
  });

  return { ids, t };
}

async function readProviderWrite(t: ConvexTest, vaultId: Id<"vaults">) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("workflow_vaultProvisioning_writeLocks")
      .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
      .unique();
  });
}

async function requireRecovery(t: ConvexTest, vaultId: Id<"vaults">): Promise<void> {
  await t.run(async (ctx) => {
    const write = await ctx.db
      .query("workflow_vaultProvisioning_writeLocks")
      .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
      .unique();
    if (!write || write.owner.kind !== "manual_provider_write") {
      throw new Error("Manual provider write fixture is missing.");
    }
    await ctx.db.replace(write._id, {
      vaultId: write.vaultId,
      owner: write.owner,
      state: "recovery_required",
      lastWriteAt: write.lastWriteAt,
      updatedAt: Date.now(),
    });
  });
}

describe("vault infrastructure operation reads", () => {
  it("does not block on a running existing repository connection", async () => {
    const { ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-provider-write",
        trigger: "connect_existing_repository",
        state: "running",
        currentStep: "sync_tree",
        createdAt: 30,
        updatedAt: 30,
      });
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId: ids.vaultId,
        owner: { kind: "managed_run", runId },
        state: "active",
        lastWriteAt: {},
        updatedAt: 30,
      });
    });

    const infrastructure = await t.run(async (ctx) => {
      const vault = await ctx.db.get(ids.vaultId);
      if (!vault || vault.state !== "connected") {
        throw new Error("Connected vault fixture is missing.");
      }
      return await readVaultInfrastructureState(ctx, vault);
    });

    expect(infrastructure.operation).toEqual({ kind: "none" });
  });

  it("selects one equal-time managed run deterministically", async () => {
    const { ids, t } = await createConnectedVault();
    const runIds = await t.run(async (ctx) => {
      const queuedRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-provider-write",
        trigger: "create",
        state: "queued",
        currentStep: "run_created",
        createdAt: 30,
        updatedAt: 40,
      });
      const runningRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-provider-write",
        trigger: "retry",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 31,
        updatedAt: 40,
      });
      return { queuedRunId, runningRunId };
    });

    const infrastructure = await t.run(async (ctx) => {
      const vault = await ctx.db.get(ids.vaultId);
      if (!vault || vault.state !== "connected") {
        throw new Error("Connected vault fixture is missing.");
      }
      return await readVaultInfrastructureState(ctx, vault);
    });
    const expectedRunId =
      runIds.runningRunId < runIds.queuedRunId ? runIds.runningRunId : runIds.queuedRunId;

    expect(infrastructure.operation).toMatchObject({
      kind: "managed_run",
      runId: expectedRunId,
      updatedAt: 40,
    });
  });
});

describe("manual provider write ownership", () => {
  it("rejects a second claim while the first action owns the vault", async () => {
    const { ids, t } = await createConnectedVault();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "first-action",
        target: convexTarget,
      });

      await expect(
        t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
          vaultId: ids.vaultId,
          userId: ids.userId,
          actionId: "second-action",
          target: cloudflareTarget,
        }),
      ).rejects.toThrow("Another vault infrastructure operation is active.");

      await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({
        owner: {
          kind: "manual_provider_write",
          actionId: "first-action",
          expiresAt: 1_000 + MANUAL_PROVIDER_WRITE_EXPIRY_MS,
        },
        state: "active",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects delayed completion from an older action", async () => {
    const { ids, t } = await createConnectedVault();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "old-action",
        target: convexTarget,
      });
      await t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "old-action",
        action: "create_convex_project",
        completion: {
          expectedState: "active",
          result: "succeeded",
          providerResult: "complete",
        },
      });

      vi.setSystemTime(2_000);
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "new-action",
        target: cloudflareTarget,
      });

      await expect(
        t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
          vaultId: ids.vaultId,
          userId: ids.userId,
          actionId: "old-action",
          action: "create_convex_project",
          completion: {
            expectedState: "active",
            result: "failed",
            providerResult: "complete",
          },
        }),
      ).rejects.toThrow("Manual provider action no longer owns the vault write.");
      await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({
        owner: {
          kind: "manual_provider_write",
          actionId: "new-action",
        },
        state: "active",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts one recovery attempt when the active write expires", async () => {
    const { ids, t } = await createConnectedVault();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "expiring-action",
        target: convexTarget,
      });

      vi.setSystemTime(1_000 + MANUAL_PROVIDER_WRITE_EXPIRY_MS);
      await t.mutation(internal.vault.infrastructureOperation.enterManualProviderWriteRecovery, {
        vaultId: ids.vaultId,
        actionId: "expiring-action",
      });

      await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({
        owner: {
          kind: "manual_provider_write",
          actionId: "expiring-action",
        },
        state: "recovering",
        recoveryDeadlineAt: 1_000 + MANUAL_PROVIDER_WRITE_EXPIRY_MS + 5 * 60 * 1_000,
        recoveryLeaseExpiresAt:
          1_000 + MANUAL_PROVIDER_WRITE_EXPIRY_MS + MANUAL_PROVIDER_RECOVERY_LEASE_MS,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a concurrent recovery claim", async () => {
    const { ids, t } = await createConnectedVault();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "concurrent-recovery",
        target: convexTarget,
      });
      await requireRecovery(t, ids.vaultId);
      const recovery = await t.mutation(
        internal.vault.infrastructureOperation.claimManualProviderRecovery,
        {
          vaultId: ids.vaultId,
          userId: ids.userId,
        },
      );

      await expect(
        t.mutation(internal.vault.infrastructureOperation.claimManualProviderRecovery, {
          vaultId: ids.vaultId,
          userId: ids.userId,
        }),
      ).rejects.toThrow("Manual provider recovery is not available.");
      await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({
        state: "recovering",
        recoveryAttemptId: recovery.recoveryAttemptId,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the exact failed recovery attempt to recovery required", async () => {
    const { ids, t } = await createConnectedVault();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "failed-recovery",
        target: convexTarget,
      });
      await requireRecovery(t, ids.vaultId);
      const recovery = await t.mutation(
        internal.vault.infrastructureOperation.claimManualProviderRecovery,
        {
          vaultId: ids.vaultId,
          userId: ids.userId,
        },
      );
      await t.mutation(
        internal.vault.infrastructureOperation.returnManualProviderRecoveryAttemptToRequired,
        {
          vaultId: ids.vaultId,
          actionId: "failed-recovery",
          recoveryAttemptId: recovery.recoveryAttemptId,
        },
      );

      await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({
        state: "recovery_required",
        lastWriteAt: {},
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns an abandoned exact attempt after its watchdog lease", async () => {
    const { ids, t } = await createConnectedVault();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "abandoned-recovery",
        target: convexTarget,
      });
      await requireRecovery(t, ids.vaultId);
      const recovery = await t.mutation(
        internal.vault.infrastructureOperation.claimManualProviderRecovery,
        {
          vaultId: ids.vaultId,
          userId: ids.userId,
        },
      );
      vi.setSystemTime(1_000 + MANUAL_PROVIDER_RECOVERY_LEASE_MS);
      await t.mutation(internal.vault.infrastructureOperation.watchManualProviderRecoveryAttempt, {
        vaultId: ids.vaultId,
        actionId: "abandoned-recovery",
        recoveryAttemptId: recovery.recoveryAttemptId,
      });

      await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({
        state: "recovery_required",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("finishes a known failure before any provider write without a refresh time", async () => {
    const { ids, t } = await createConnectedVault();
    await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
      vaultId: ids.vaultId,
      userId: ids.userId,
      actionId: "known-pre-provider-failure",
      target: convexTarget,
    });

    await t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
      vaultId: ids.vaultId,
      userId: ids.userId,
      actionId: "known-pre-provider-failure",
      action: "create_convex_project",
      completion: {
        expectedState: "active",
        result: "failed",
        providerResult: "not_started",
      },
    });

    await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({
      state: "failed",
      lastWriteAt: {},
    });
  });

  it("does not let an old attempt reset or finish a newer attempt", async () => {
    const { ids, t } = await createConnectedVault();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "stale-attempt",
        target: convexTarget,
      });
      await requireRecovery(t, ids.vaultId);
      const first = await t.mutation(
        internal.vault.infrastructureOperation.claimManualProviderRecovery,
        {
          vaultId: ids.vaultId,
          userId: ids.userId,
        },
      );
      await t.mutation(
        internal.vault.infrastructureOperation.returnManualProviderRecoveryAttemptToRequired,
        {
          vaultId: ids.vaultId,
          actionId: "stale-attempt",
          recoveryAttemptId: first.recoveryAttemptId,
        },
      );
      const second = await t.mutation(
        internal.vault.infrastructureOperation.claimManualProviderRecovery,
        {
          vaultId: ids.vaultId,
          userId: ids.userId,
        },
      );
      await t.mutation(
        internal.vault.infrastructureOperation.returnManualProviderRecoveryAttemptToRequired,
        {
          vaultId: ids.vaultId,
          actionId: "stale-attempt",
          recoveryAttemptId: first.recoveryAttemptId,
        },
      );
      await expect(
        t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
          vaultId: ids.vaultId,
          userId: ids.userId,
          actionId: "stale-attempt",
          action: "create_convex_project",
          completion: {
            expectedState: "recovering",
            recoveryAttemptId: first.recoveryAttemptId,
            result: "succeeded",
            providerResult: "complete",
          },
        }),
      ).rejects.toThrow("Manual provider recovery attempt changed before result was recorded.");

      await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({
        state: "recovering",
        recoveryAttemptId: second.recoveryAttemptId,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates provider timestamps independently", async () => {
    const { ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId: ids.vaultId,
        owner: { kind: "managed_run", runId: ids.runId },
        state: "succeeded",
        lastWriteAt: { cloudflare: 50 },
        updatedAt: 50,
      });
    });

    vi.useFakeTimers();
    try {
      vi.setSystemTime(100);
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "convex-action",
        target: convexTarget,
      });
      await t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "convex-action",
        action: "create_convex_project",
        completion: {
          expectedState: "active",
          result: "succeeded",
          providerResult: "complete",
        },
      });

      vi.setSystemTime(200);
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "cloudflare-action",
        target: cloudflareTarget,
      });
      await t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "cloudflare-action",
        action: "create_cloudflare_worker",
        completion: {
          expectedState: "active",
          result: "failed",
          providerResult: "complete",
        },
      });

      await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({
        state: "failed",
        lastWriteAt: {
          convex: 100,
          cloudflare: 200,
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("records one complete two-provider result atomically", async () => {
    const { ids, t } = await createConnectedVault();
    const target = await t.run(async (ctx) => {
      const convexProjectId = await ctx.db.insert("vaultConvexProjects", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        convexConfigPath: "convex.json",
        teamId: "team",
        projectId: "project",
        origin: "selected_existing",
      });
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        accountId: "account",
        workerName: "worker",
        workerTag: "worker-tag",
        origin: "selected_existing",
      });
      return {
        action: "rotate_convex_deploy_keys_for_workers_builds" as const,
        workerId,
        convexProjectId,
      };
    });
    await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
      vaultId: ids.vaultId,
      userId: ids.userId,
      actionId: "partial-rotation",
      target,
    });

    vi.useFakeTimers();
    vi.setSystemTime(900);
    try {
      await t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "partial-rotation",
        action: "rotate_convex_deploy_keys_for_workers_builds",
        completion: {
          expectedState: "active",
          result: "succeeded",
          providerResult: "complete",
        },
      });
      await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({
        state: "succeeded",
        lastWriteAt: { convex: 900, cloudflare: 900 },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
