import { describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";
import {
  MANUAL_PROVIDER_ACTION_LIMIT_MS,
  MANUAL_PROVIDER_WRITE_EXPIRY_MS,
  readRepositoryInfrastructureState,
  requireManualProviderActionDeadline,
  requireManualProviderWriteCheckpoint,
} from "./infrastructureOperation";
import { REPOSITORY_ACTIONS_OWN_PROVIDERS_MESSAGE } from "./provisioningPlan";

type ConvexTest = ReturnType<typeof makeConvexTest>;

async function createConnectedRepository() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "manual-provider-write-installation",
      githubOwnerId: "manual-provider-write-owner",
      githubOwnerLogin: "ada",
      githubOwnerLoginNormalized: "ada",
      githubOwnerType: "user",
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
        lastUsedBuildTokenUuid: "previous-build-token",
      },
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId,
      repositoryId,
      githubRepositoryFullName: "ada/manual-provider-write",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 10,
      updatedAt: 20,
      completedAt: 20,
    });
    await ctx.db.replace(repositoryId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      githubRepositoryDatabaseId: "123",
      githubRepositoryName: "manual-provider-write",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 20,
    });
    return { organizationId, runId, userId, repositoryId };
  });

  return { ids, t };
}

async function readProviderWrite(t: ConvexTest, repositoryId: Id<"repositories">) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("workflow_repositoryProvisioning_writeLocks")
      .withIndex("by_repository", (q) => q.eq("repositoryId", repositoryId))
      .unique();
  });
}

describe("repository infrastructure operation reads", () => {
  it("keeps source-only repository sync out of provider operations", async () => {
    const { ids, t } = await createConnectedRepository();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.runId, {
        state: "running",
        currentStep: "sync_tree",
        updatedAt: 30,
        completedAt: undefined,
      });
    });

    const infrastructure = await t.run(async (ctx) => {
      const repository = await ctx.db.get(ids.repositoryId);
      if (!repository || repository.state !== "connected") {
        throw new Error("Connected repository fixture is missing.");
      }
      return await readRepositoryInfrastructureState(ctx, repository);
    });

    expect(infrastructure.operation).toEqual({ kind: "none" });
  });

  it("refuses every manual provider write to a repository_actions repository", async () => {
    const { ids, t } = await createConnectedRepository();
    await t.run(async (ctx) => {
      await ctx.db.insert("workflow_repositoryProvisioning_plans", {
        provisioning: "repository_actions",
        repositoryId: ids.repositoryId,
        convexConfigPath: "convex.json",
        ciSecrets: { state: "written", writtenAt: 30, credentialRevision: 25 },
        convexAccessToken: {
          state: "minted",
          name: "samebase/ada/manual-provider-write",
          mintedAt: 30,
        },
        seed: { state: "seeded", seededAt: 31, manifestVersion: "samebase-base-actions-test" },
        createdAt: 30,
        updatedAt: 30,
      });
    });

    for (const action of [
      "create_convex_project",
      "connect_cloudflare_worker",
      "create_cloudflare_worker",
      "configure_workers_builds_for_github",
      "rotate_convex_deploy_keys_for_workers_builds",
    ] as const) {
      await expect(
        t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
          repositoryId: ids.repositoryId,
          userId: ids.userId,
          actionId: `manual-${action}`,
          action,
        }),
      ).rejects.toMatchObject({ data: REPOSITORY_ACTIONS_OWN_PROVIDERS_MESSAGE });
    }
    await expect(readProviderWrite(t, ids.repositoryId)).resolves.toBeNull();
  });

  it("blocks only while a manual provider write is active", async () => {
    const { ids, t } = await createConnectedRepository();
    await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
      repositoryId: ids.repositoryId,
      userId: ids.userId,
      actionId: "manual-action",
      action: "create_convex_project",
    });

    const active = await t.run(async (ctx) => {
      const repository = await ctx.db.get(ids.repositoryId);
      if (!repository || repository.state !== "connected") {
        throw new Error("Connected repository fixture is missing.");
      }
      return await readRepositoryInfrastructureState(ctx, repository);
    });
    expect(active.operation.kind).toBe("manual_provider_write");

    await t.mutation(internal.repository.infrastructureOperation.finishManualProviderWriteResult, {
      repositoryId: ids.repositoryId,
      actionId: "manual-action",
      result: "failed",
    });

    const terminal = await t.run(async (ctx) => {
      const repository = await ctx.db.get(ids.repositoryId);
      if (!repository || repository.state !== "connected") {
        throw new Error("Connected repository fixture is missing.");
      }
      return await readRepositoryInfrastructureState(ctx, repository);
    });
    expect(terminal.operation).toEqual({ kind: "none" });
  });
});

describe("manual provider write ownership", () => {
  it("records only after Builds configuration and before a later initial-build failure", async () => {
    const { ids, t } = await createConnectedRepository();
    await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
      repositoryId: ids.repositoryId,
      userId: ids.userId,
      actionId: "failed-builds",
      action: "configure_workers_builds_for_github",
    });
    await t.mutation(internal.repository.infrastructureOperation.finishManualProviderWriteResult, {
      repositoryId: ids.repositoryId,
      actionId: "failed-builds",
      result: "failed",
    });
    await expect(
      t.run(async (ctx) => (await ctx.db.get(ids.organizationId))?.cloudflareAccount),
    ).resolves.toMatchObject({ lastUsedBuildTokenUuid: "previous-build-token" });

    await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
      repositoryId: ids.repositoryId,
      userId: ids.userId,
      actionId: "configured-builds",
      action: "configure_workers_builds_for_github",
    });
    await t.mutation(
      internal.repository.infrastructureOperation.recordManualWorkersBuildsTokenUse,
      {
        repositoryId: ids.repositoryId,
        actionId: "configured-builds",
        buildTokenUuid: "  configured-build-token  ",
      },
    );
    await t.mutation(internal.repository.infrastructureOperation.finishManualProviderWriteResult, {
      repositoryId: ids.repositoryId,
      actionId: "configured-builds",
      result: "failed",
    });
    await expect(
      t.run(async (ctx) => (await ctx.db.get(ids.organizationId))?.cloudflareAccount),
    ).resolves.toEqual({
      accountId: "cloudflare-account",
      accountName: "Cloudflare account",
      lastUsedBuildTokenUuid: "configured-build-token",
    });
  });

  it("rejects a second claim while the first action owns the repository", async () => {
    const { ids, t } = await createConnectedRepository();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
        repositoryId: ids.repositoryId,
        userId: ids.userId,
        actionId: "first-action",
        action: "create_convex_project",
      });

      await expect(
        t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
          repositoryId: ids.repositoryId,
          userId: ids.userId,
          actionId: "second-action",
          action: "create_cloudflare_worker",
        }),
      ).rejects.toThrow(
        "Another Samebase setup or provider change is running for this repository, so nothing changed. Try again after it finishes.",
      );

      await expect(readProviderWrite(t, ids.repositoryId)).resolves.toMatchObject({
        owner: {
          kind: "manual_provider_write",
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
    const { ids, t } = await createConnectedRepository();
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
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
      });
      await ctx.db.patch(ids.userId, {
        state: "deleting",
        runId: deletionRunId,
        requestedAt: now,
      });
    });

    await expect(
      t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
        repositoryId: ids.repositoryId,
        userId: ids.userId,
        actionId: "late-action",
        action: "create_convex_project",
      }),
    ).rejects.toThrow("An active Samebase user is required.");
  });

  it("rejects delayed completion from an older action", async () => {
    const { ids, t } = await createConnectedRepository();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
        repositoryId: ids.repositoryId,
        userId: ids.userId,
        actionId: "old-action",
        action: "create_convex_project",
      });
      await t.mutation(
        internal.repository.infrastructureOperation.finishManualProviderWriteResult,
        {
          repositoryId: ids.repositoryId,
          actionId: "old-action",
          result: "succeeded",
        },
      );

      vi.setSystemTime(2_000);
      await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
        repositoryId: ids.repositoryId,
        userId: ids.userId,
        actionId: "new-action",
        action: "create_cloudflare_worker",
      });

      await expect(
        t.mutation(internal.repository.infrastructureOperation.finishManualProviderWriteResult, {
          repositoryId: ids.repositoryId,
          actionId: "old-action",
          result: "failed",
        }),
      ).rejects.toThrow("Manual provider action no longer owns the repository write.");
      await expect(readProviderWrite(t, ids.repositoryId)).resolves.toMatchObject({
        owner: { actionId: "new-action" },
        state: "active",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets an in-flight provider result record after the provider-call deadline", async () => {
    const { ids, t } = await createConnectedRepository();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
        repositoryId: ids.repositoryId,
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
            repositoryId: ids.repositoryId,
            actionId: "timed-out-action",
            userId: ids.userId,
          });
          return true;
        }),
      ).resolves.toBe(true);

      await t.mutation(
        internal.repository.infrastructureOperation.finishManualProviderWriteResult,
        {
          repositoryId: ids.repositoryId,
          actionId: "timed-out-action",
          result: "succeeded",
        },
      );
      await expect(readProviderWrite(t, ids.repositoryId)).resolves.toMatchObject({
        state: "succeeded",
        lastWriteAt: { convex: 1_000 + MANUAL_PROVIDER_ACTION_LIMIT_MS },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("expires a silent action and requests a fresh provider read", async () => {
    const { ids, t } = await createConnectedRepository();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
        repositoryId: ids.repositoryId,
        userId: ids.userId,
        actionId: "silent-action",
        action: "create_convex_project",
      });

      vi.setSystemTime(1_000 + MANUAL_PROVIDER_WRITE_EXPIRY_MS - 1);
      await t.mutation(internal.repository.infrastructureOperation.expireManualProviderWrite, {
        repositoryId: ids.repositoryId,
        actionId: "silent-action",
      });
      await expect(readProviderWrite(t, ids.repositoryId)).resolves.toMatchObject({
        state: "active",
      });

      vi.setSystemTime(1_000 + MANUAL_PROVIDER_WRITE_EXPIRY_MS);
      await expect(
        t.mutation(internal.repository.infrastructureOperation.finishManualProviderWriteResult, {
          repositoryId: ids.repositoryId,
          actionId: "silent-action",
          result: "succeeded",
        }),
      ).rejects.toThrow("Manual provider action state changed before result was recorded.");
      await t.mutation(internal.repository.infrastructureOperation.expireManualProviderWrite, {
        repositoryId: ids.repositoryId,
        actionId: "silent-action",
      });
      await expect(readProviderWrite(t, ids.repositoryId)).resolves.toMatchObject({
        owner: { actionId: "silent-action" },
        state: "failed",
        lastWriteAt: { convex: 1_000 + MANUAL_PROVIDER_WRITE_EXPIRY_MS },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let an old expiry change a newer action", async () => {
    const { ids, t } = await createConnectedRepository();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
        repositoryId: ids.repositoryId,
        userId: ids.userId,
        actionId: "old-action",
        action: "create_convex_project",
      });
      await t.mutation(
        internal.repository.infrastructureOperation.finishManualProviderWriteResult,
        {
          repositoryId: ids.repositoryId,
          actionId: "old-action",
          result: "succeeded",
        },
      );

      vi.setSystemTime(2_000);
      await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
        repositoryId: ids.repositoryId,
        userId: ids.userId,
        actionId: "new-action",
        action: "create_cloudflare_worker",
      });
      vi.setSystemTime(1_000 + MANUAL_PROVIDER_WRITE_EXPIRY_MS);
      await t.mutation(internal.repository.infrastructureOperation.expireManualProviderWrite, {
        repositoryId: ids.repositoryId,
        actionId: "old-action",
      });

      await expect(readProviderWrite(t, ids.repositoryId)).resolves.toMatchObject({
        owner: { actionId: "new-action" },
        state: "active",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates provider refresh times independently", async () => {
    const { ids, t } = await createConnectedRepository();
    await t.run(async (ctx) => {
      await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
        repositoryId: ids.repositoryId,
        owner: { kind: "managed_run", runId: ids.runId },
        state: "succeeded",
        lastWriteAt: { cloudflare: 50 },
        updatedAt: 50,
      });
    });

    vi.useFakeTimers();
    try {
      vi.setSystemTime(100);
      await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
        repositoryId: ids.repositoryId,
        userId: ids.userId,
        actionId: "convex-action",
        action: "create_convex_project",
      });
      await t.mutation(
        internal.repository.infrastructureOperation.finishManualProviderWriteResult,
        {
          repositoryId: ids.repositoryId,
          actionId: "convex-action",
          result: "succeeded",
        },
      );

      vi.setSystemTime(200);
      await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
        repositoryId: ids.repositoryId,
        userId: ids.userId,
        actionId: "cloudflare-action",
        action: "create_cloudflare_worker",
      });
      await t.mutation(
        internal.repository.infrastructureOperation.finishManualProviderWriteResult,
        {
          repositoryId: ids.repositoryId,
          actionId: "cloudflare-action",
          result: "failed",
        },
      );

      await expect(readProviderWrite(t, ids.repositoryId)).resolves.toMatchObject({
        state: "failed",
        lastWriteAt: { convex: 100, cloudflare: 200 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("records one result for a two-provider action", async () => {
    const { ids, t } = await createConnectedRepository();
    await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
      repositoryId: ids.repositoryId,
      userId: ids.userId,
      actionId: "key-rotation",
      action: "rotate_convex_deploy_keys_for_workers_builds",
    });

    vi.useFakeTimers();
    vi.setSystemTime(900);
    try {
      await t.mutation(
        internal.repository.infrastructureOperation.finishManualProviderWriteResult,
        {
          repositoryId: ids.repositoryId,
          actionId: "key-rotation",
          result: "succeeded",
        },
      );
      await expect(readProviderWrite(t, ids.repositoryId)).resolves.toMatchObject({
        state: "succeeded",
        lastWriteAt: { convex: 900, cloudflare: 900 },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
