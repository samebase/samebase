import { describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { INITIAL_ACCOUNT_DELETION_DATA_PROGRESS } from "../accountDeletion/model";
import { makeConvexTest } from "../test.setup";
import {
  MANUAL_PROVIDER_ACTION_LIMIT_MS,
  MANUAL_PROVIDER_WRITE_EXPIRY_MS,
  readVaultInfrastructureState,
  requireManualProviderActionDeadline,
  requireManualProviderWriteCheckpoint,
} from "./infrastructureOperation";

type ConvexTest = ReturnType<typeof makeConvexTest>;

async function createConnectedVault() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {});
    await ctx.db.insert("organizationMemberships", { organizationId, userId });
    const githubProviderConnectionId = await ctx.db.insert("providerConnections", {
      state: "connected",
      kind: "github",
      organizationId,
      connectedByUserId: userId,
      accountId: "github-account",
      auth: { method: "api_key", credential: "github-token" },
      username: "ada",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(organizationId, {
      selectedGithubProviderConnectionId: githubProviderConnectionId,
    });
    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      requestedByUserId: userId,
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
      organizationId,
      githubProviderConnectionId,
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

describe("vault infrastructure operation reads", () => {
  it("keeps source-only repository sync out of provider operations", async () => {
    const { ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.runId, {
        state: "running",
        currentStep: "sync_tree",
        updatedAt: 30,
        completedAt: undefined,
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

  it("blocks only while a manual provider write is active", async () => {
    const { ids, t } = await createConnectedVault();
    await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
      vaultId: ids.vaultId,
      userId: ids.userId,
      actionId: "manual-action",
      action: "create_convex_project",
    });

    const active = await t.run(async (ctx) => {
      const vault = await ctx.db.get(ids.vaultId);
      if (!vault || vault.state !== "connected") {
        throw new Error("Connected vault fixture is missing.");
      }
      return await readVaultInfrastructureState(ctx, vault);
    });
    expect(active.operation.kind).toBe("manual_provider_write");

    await t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
      vaultId: ids.vaultId,
      actionId: "manual-action",
      result: "failed",
    });

    const terminal = await t.run(async (ctx) => {
      const vault = await ctx.db.get(ids.vaultId);
      if (!vault || vault.state !== "connected") {
        throw new Error("Connected vault fixture is missing.");
      }
      return await readVaultInfrastructureState(ctx, vault);
    });
    expect(terminal.operation).toEqual({ kind: "none" });
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
        action: "create_convex_project",
      });

      await expect(
        t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
          vaultId: ids.vaultId,
          userId: ids.userId,
          actionId: "second-action",
          action: "create_cloudflare_worker",
        }),
      ).rejects.toThrow("Another vault infrastructure operation is active.");

      await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({
        owner: {
          kind: "manual_provider_write",
          requestedByUserId: ids.userId,
          actionId: "first-action",
          action: "create_convex_project",
          expiresAt: 1_000 + MANUAL_PROVIDER_WRITE_EXPIRY_MS,
        },
        state: "active",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a claim after account deletion starts", async () => {
    const { ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      const now = Date.now();
      const sessionId = await ctx.db.insert("authSessions", {
        userId: ids.userId,
        expirationTime: now + 60_000,
      });
      const deletionRunId = await ctx.db.insert("workflow_accountDeletion_runs", {
        identity: {
          state: "active",
          userId: ids.userId,
          email: "ada@example.com",
        },
        completionCapability: "a".repeat(64),
        state: "queued",
        currentStep: "request_accepted",
        requestedAt: now,
        updatedAt: now,
        initiatingSessionId: sessionId,
        workflow: { state: "not_started" },
        retryCount: 0,
        outcomes: {
          billing: { state: "not_started" },
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
        dataDeletion: INITIAL_ACCOUNT_DELETION_DATA_PROGRESS,
      });
      await ctx.db.patch(ids.userId, {
        accountDeletion: { state: "deleting", runId: deletionRunId, requestedAt: now },
      });
    });

    await expect(
      t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "late-action",
        action: "create_convex_project",
      }),
    ).rejects.toThrow("Account deletion is in progress.");
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
        action: "create_convex_project",
      });
      await t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
        vaultId: ids.vaultId,
        actionId: "old-action",
        result: "succeeded",
      });

      vi.setSystemTime(2_000);
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "new-action",
        action: "create_cloudflare_worker",
      });

      await expect(
        t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
          vaultId: ids.vaultId,
          actionId: "old-action",
          result: "failed",
        }),
      ).rejects.toThrow("Manual provider action no longer owns the vault write.");
      await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({
        owner: { actionId: "new-action" },
        state: "active",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets an in-flight provider result record after the provider-call deadline", async () => {
    const { ids, t } = await createConnectedVault();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "timed-out-action",
        action: "create_convex_project",
      });
      vi.setSystemTime(1_000 + MANUAL_PROVIDER_ACTION_LIMIT_MS);

      expect(() =>
        requireManualProviderActionDeadline(1_000 + MANUAL_PROVIDER_ACTION_LIMIT_MS),
      ).toThrow("Manual provider action time limit expired.");
      await expect(
        t.run(async (ctx) => {
          await requireManualProviderWriteCheckpoint(ctx, {
            vaultId: ids.vaultId,
            actionId: "timed-out-action",
          });
          return true;
        }),
      ).resolves.toBe(true);

      await t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
        vaultId: ids.vaultId,
        actionId: "timed-out-action",
        result: "succeeded",
      });
      await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({
        state: "succeeded",
        lastWriteAt: { convex: 1_000 + MANUAL_PROVIDER_ACTION_LIMIT_MS },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("expires a silent action and requests a fresh provider read", async () => {
    const { ids, t } = await createConnectedVault();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "silent-action",
        action: "create_convex_project",
      });

      vi.setSystemTime(1_000 + MANUAL_PROVIDER_WRITE_EXPIRY_MS - 1);
      await t.mutation(internal.vault.infrastructureOperation.expireManualProviderWrite, {
        vaultId: ids.vaultId,
        actionId: "silent-action",
      });
      await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({ state: "active" });

      vi.setSystemTime(1_000 + MANUAL_PROVIDER_WRITE_EXPIRY_MS);
      await expect(
        t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
          vaultId: ids.vaultId,
          actionId: "silent-action",
          result: "succeeded",
        }),
      ).rejects.toThrow("Manual provider action state changed before result was recorded.");
      await t.mutation(internal.vault.infrastructureOperation.expireManualProviderWrite, {
        vaultId: ids.vaultId,
        actionId: "silent-action",
      });
      await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({
        owner: { actionId: "silent-action" },
        state: "failed",
        lastWriteAt: { convex: 1_000 + MANUAL_PROVIDER_WRITE_EXPIRY_MS },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let an old expiry change a newer action", async () => {
    const { ids, t } = await createConnectedVault();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "old-action",
        action: "create_convex_project",
      });
      await t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
        vaultId: ids.vaultId,
        actionId: "old-action",
        result: "succeeded",
      });

      vi.setSystemTime(2_000);
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "new-action",
        action: "create_cloudflare_worker",
      });
      vi.setSystemTime(1_000 + MANUAL_PROVIDER_WRITE_EXPIRY_MS);
      await t.mutation(internal.vault.infrastructureOperation.expireManualProviderWrite, {
        vaultId: ids.vaultId,
        actionId: "old-action",
      });

      await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({
        owner: { actionId: "new-action" },
        state: "active",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates provider refresh times independently", async () => {
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
        action: "create_convex_project",
      });
      await t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
        vaultId: ids.vaultId,
        actionId: "convex-action",
        result: "succeeded",
      });

      vi.setSystemTime(200);
      await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
        vaultId: ids.vaultId,
        userId: ids.userId,
        actionId: "cloudflare-action",
        action: "create_cloudflare_worker",
      });
      await t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
        vaultId: ids.vaultId,
        actionId: "cloudflare-action",
        result: "failed",
      });

      await expect(readProviderWrite(t, ids.vaultId)).resolves.toMatchObject({
        state: "failed",
        lastWriteAt: { convex: 100, cloudflare: 200 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("records one result for a two-provider action", async () => {
    const { ids, t } = await createConnectedVault();
    await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
      vaultId: ids.vaultId,
      userId: ids.userId,
      actionId: "key-rotation",
      action: "rotate_convex_deploy_keys_for_workers_builds",
    });

    vi.useFakeTimers();
    vi.setSystemTime(900);
    try {
      await t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
        vaultId: ids.vaultId,
        actionId: "key-rotation",
        result: "succeeded",
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
