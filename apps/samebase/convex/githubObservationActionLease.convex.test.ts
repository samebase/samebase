import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { GITHUB_OBSERVATION_ACTION_LEASE_DURATION_MS } from "./githubObservationActionLease";
import { makeConvexTest } from "./test.setup";

const now = 1_700_000_000_000;
const accountDeletionWorkflowId = "github-observation-action-lease-test";

type ConvexTest = ReturnType<typeof makeConvexTest>;

async function createConnectedVault(t: ConvexTest, userId: Id<"users">, name: string) {
  return await t.run(async (ctx) => {
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: `ada/${name}`,
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: `database-${name}`,
      ghRepoNodeId: `node-${name}`,
      repositoryKey: `ada/${name.toLowerCase()}`,
      owner: "ada",
      name,
      defaultBranch: "main",
      visibility: "private",
      connectedAt: now,
    });
    return vaultId;
  });
}

async function createFixture(vaultCount = 1) {
  const t = makeConvexTest();
  const userId = await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        email: "ada@example.com",
        isApproved: true,
      }),
  );
  const vaultIds: Id<"vaults">[] = [];
  for (let index = 0; index < vaultCount; index += 1) {
    vaultIds.push(await createConnectedVault(t, userId, `repository-${index}`));
  }
  return { t, userId, vaultIds };
}

async function readLeases(t: ConvexTest, userId: Id<"users">) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("githubObservationActionLeases")
        .withIndex("by_userId_and_expiresAt", (q) => q.eq("userId", userId))
        .collect(),
  );
}

async function seedRunningAccountDeletion(t: ConvexTest, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    const initiatingSessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: now + 60_000,
    });
    const runId = await ctx.db.insert("accountDeletionRuns", {
      identity: { state: "active", userId, email: "ada@example.com" },
      completionCapability: "github-observation-action-lease-test",
      state: "running",
      workflow: { state: "started", workflowId: accountDeletionWorkflowId, attempt: 1 },
      currentStep: "delete_samebase_data",
      requestedAt: now,
      updatedAt: now,
      initiatingSessionId,
      retryCount: 0,
      outcomes: {
        billing: { state: "not_applicable" },
        providerRevocation: {
          state: "completed",
          github: { state: "not_connected" },
          cloudflare: { state: "not_connected" },
          convex: { state: "not_connected" },
        },
        completionEmail: { state: "sent" },
      },
    });
    await ctx.db.patch(userId, {
      accountDeletion: { state: "deleting", runId, requestedAt: now },
    });
    return runId;
  });
}

describe("GitHub observation action leases", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("acquires one bounded lease group and releases every row in the group", async () => {
    const { t, userId, vaultIds } = await createFixture(2);

    await expect(
      t.mutation(internal.githubObservationActionLease.acquire, {
        userId,
        leaseGroupId: "summary-group",
        vaultIds,
      }),
    ).resolves.toBe(true);
    await expect(readLeases(t, userId)).resolves.toMatchObject([
      {
        vaultId: vaultIds[0],
        leaseGroupId: "summary-group",
        expiresAt: now + GITHUB_OBSERVATION_ACTION_LEASE_DURATION_MS,
      },
      {
        vaultId: vaultIds[1],
        leaseGroupId: "summary-group",
        expiresAt: now + GITHUB_OBSERVATION_ACTION_LEASE_DURATION_MS,
      },
    ]);

    await expect(
      t.mutation(internal.githubObservationActionLease.release, {
        leaseGroupId: "summary-group",
      }),
    ).resolves.toBeNull();
    await expect(readLeases(t, userId)).resolves.toEqual([]);
  });

  it("refuses new leases after either account or vault deletion is gated", async () => {
    const accountFixture = await createFixture();
    await seedRunningAccountDeletion(accountFixture.t, accountFixture.userId);
    await expect(
      accountFixture.t.mutation(internal.githubObservationActionLease.acquire, {
        userId: accountFixture.userId,
        leaseGroupId: "after-account-deletion",
        vaultIds: accountFixture.vaultIds,
      }),
    ).resolves.toBe(false);

    const vaultFixture = await createFixture();
    await vaultFixture.t.run(async (ctx) => {
      const vaultId = vaultFixture.vaultIds[0];
      const deletionRunId = await ctx.db.insert("vaultDeletionRuns", {
        userId: vaultFixture.userId,
        vaultId,
        repositoryFullName: "ada/repository-0",
        createdAt: now,
        updatedAt: now,
        attempt: { kind: "initial" },
        state: "succeeded",
        workflow: { state: "started", workflowId: "completed-vault-deletion" },
        currentStep: "finish",
        snapshot: { state: "scrubbed_after_success" },
        completedAt: now,
      });
      await ctx.db.patch(vaultId, {
        deletion: { state: "delete_failed", runId: deletionRunId, failedAt: now },
      });
    });
    await expect(
      vaultFixture.t.mutation(internal.githubObservationActionLease.acquire, {
        userId: vaultFixture.userId,
        leaseGroupId: "after-vault-deletion",
        vaultIds: vaultFixture.vaultIds,
      }),
    ).resolves.toBe(false);
    await expect(readLeases(vaultFixture.t, vaultFixture.userId)).resolves.toEqual([]);
  });

  it("makes vault deletion wait for active work and reaps an expired action", async () => {
    const { t, userId, vaultIds } = await createFixture();
    await t.mutation(internal.githubObservationActionLease.acquire, {
      userId,
      leaseGroupId: "vault-observation",
      vaultIds,
    });

    await expect(
      t.mutation(internal.githubObservationActionLease.inspectForVaultDeletion, {
        userId,
        vaultId: vaultIds[0],
      }),
    ).resolves.toEqual({
      state: "waiting",
      retryAfterMs: GITHUB_OBSERVATION_ACTION_LEASE_DURATION_MS,
    });

    vi.setSystemTime(now + GITHUB_OBSERVATION_ACTION_LEASE_DURATION_MS + 1);
    await expect(
      t.mutation(internal.githubObservationActionLease.inspectForVaultDeletion, {
        userId,
        vaultId: vaultIds[0],
      }),
    ).resolves.toEqual({ state: "done" });
    await expect(readLeases(t, userId)).resolves.toEqual([]);
  });

  it("makes account deletion wait for active work and permits finalization after release", async () => {
    const { t, userId, vaultIds } = await createFixture();
    await t.mutation(internal.githubObservationActionLease.acquire, {
      userId,
      leaseGroupId: "account-observation",
      vaultIds,
    });
    const runId = await seedRunningAccountDeletion(t, userId);
    const args = { runId, workflowId: accountDeletionWorkflowId };

    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, args),
    ).resolves.toEqual({
      state: "waiting",
      blocker: "active_github_observation",
      retryAfterMs: GITHUB_OBSERVATION_ACTION_LEASE_DURATION_MS,
    });

    await t.mutation(internal.githubObservationActionLease.release, {
      leaseGroupId: "account-observation",
    });
    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, args),
    ).resolves.toEqual({ state: "done" });
  });
});
