import { describe, expect, it, vi } from "vite-plus/test";

import { components, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("legacy repository inventory cleanup", () => {
  it("rejects finalization before retired Workpool quiescence starts", async () => {
    const t = makeConvexTest();

    await expect(
      t.mutation(internal.legacyRepositoryInventoryCleanup.finalize, {}),
    ).rejects.toThrow("Retired repository refresh cleanup was never started.");
  });

  it("deletes every legacy table, records completion, and reruns idempotently", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const t = makeConvexTest();
    await t.run(async (ctx) => {
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

      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("repositoryRefreshRequests", {
          userId,
          vaultId,
          dedupeKey: `repository:${index}`,
          demand: { scope: "repository", source: "dashboard" },
          lifecycle: {
            state: "succeeded",
            startedAt: index,
            completedAt: index + 1,
            result: { kind: "refreshed" },
          },
          createdAt: index,
          updatedAt: index + 1,
        });
      }
      await ctx.db.insert("vaultBranchFilters", {
        userId,
        vaultId,
        hiddenLabels: ["ignore"],
        includeDrafts: false,
      });
      await ctx.db.insert("vaultRemoteBranches", {
        vaultId,
        name: "main",
        headCommitSha: "abc123",
        isDefault: true,
        isProtected: false,
        remoteState: "active",
        defaultRank: 0,
        stateRank: 0,
        commitRank: -1,
        lastSyncedAt: 1,
      });
      await ctx.db.insert("githubCommitCheckSnapshots", {
        githubRepositoryId: "1",
        commitSha: "abc123",
        state: "success",
        totalCount: 1,
        checkRunCount: 1,
        statusContextCount: 0,
        successCount: 1,
        failureCount: 0,
        runningCount: 0,
        neutralCount: 0,
        unknownCount: 0,
        syncedAt: 1,
      });
      await ctx.db.insert("githubCommitCheckItems", {
        githubRepositoryId: "1",
        commitSha: "abc123",
        source: "check_run",
        sourceKey: "1",
        name: "test",
        state: "success",
        status: "completed",
        syncedAt: 1,
      });
    });

    try {
      await expect(
        t.query(internal.legacyRepositoryInventoryCleanup.preflight, {}),
      ).resolves.toEqual({
        safeToDelete: false,
        graceComplete: false,
        queued: false,
        scheduled: false,
        running: false,
      });
      await expect(t.query(internal.legacyRepositoryInventoryCleanup.verify, {})).resolves.toEqual({
        complete: false,
        remaining: {
          repositoryRefreshRequests: true,
          vaultBranchFilters: true,
          vaultRemoteBranches: true,
          githubCommitCheckSnapshots: true,
          githubCommitCheckItems: true,
        },
      });

      await expect(
        t.mutation(internal.legacyRepositoryInventoryCleanup.quiesce, {}),
      ).resolves.toEqual({ state: "waiting", canceled: 0, waitUntil: 901_000 });
      vi.setSystemTime(901_000);
      await expect(
        t.mutation(internal.legacyRepositoryInventoryCleanup.quiesce, {}),
      ).resolves.toEqual({ state: "done", canceled: 0 });
      await expect(
        t.query(internal.legacyRepositoryInventoryCleanup.preflight, {}),
      ).resolves.toEqual({
        safeToDelete: true,
        graceComplete: true,
        queued: false,
        scheduled: false,
        running: false,
      });

      await expect(
        t.mutation(internal.legacyRepositoryInventoryCleanup.finalize, {}),
      ).rejects.toThrow("Legacy repository inventory rows remain.");

      await t.mutation(internal.legacyRepositoryInventoryCleanup.run, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await expect(t.query(internal.legacyRepositoryInventoryCleanup.verify, {})).resolves.toEqual({
        complete: true,
        remaining: {
          repositoryRefreshRequests: false,
          vaultBranchFilters: false,
          vaultRemoteBranches: false,
          githubCommitCheckSnapshots: false,
          githubCommitCheckItems: false,
        },
      });

      const statuses = await t.query(components.migrations.lib.getStatus, {});
      expect(
        statuses
          .map(({ isDone, name, processed, state }) => ({ isDone, name, processed, state }))
          .sort((left, right) => left.name.localeCompare(right.name)),
      ).toEqual([
        {
          isDone: true,
          name: "legacyRepositoryInventoryCleanup:deleteGitHubCommitCheckItems",
          processed: 1,
          state: "success",
        },
        {
          isDone: true,
          name: "legacyRepositoryInventoryCleanup:deleteGitHubCommitCheckSnapshots",
          processed: 1,
          state: "success",
        },
        {
          isDone: true,
          name: "legacyRepositoryInventoryCleanup:deleteRepositoryRefreshRequests",
          processed: 101,
          state: "success",
        },
        {
          isDone: true,
          name: "legacyRepositoryInventoryCleanup:deleteVaultBranchFilters",
          processed: 1,
          state: "success",
        },
        {
          isDone: true,
          name: "legacyRepositoryInventoryCleanup:deleteVaultRemoteBranches",
          processed: 1,
          state: "success",
        },
      ]);

      await t.mutation(internal.legacyRepositoryInventoryCleanup.run, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await expect(t.query(components.migrations.lib.getStatus, {})).resolves.toEqual(statuses);
      await expect(t.query(internal.legacyRepositoryInventoryCleanup.verify, {})).resolves.toEqual({
        complete: true,
        remaining: {
          repositoryRefreshRequests: false,
          vaultBranchFilters: false,
          vaultRemoteBranches: false,
          githubCommitCheckSnapshots: false,
          githubCommitCheckItems: false,
        },
      });

      await t.mutation(internal.legacyRepositoryInventoryCleanup.finalize, {});
      await expect(
        t.run(async (ctx) => {
          return await ctx.db.query("legacyRepositoryInventoryCleanupState").first();
        }),
      ).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rolls a local dry run back", async () => {
    const t = makeConvexTest();
    await t.run(async (ctx) => {
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
      await ctx.db.insert("repositoryRefreshRequests", {
        userId,
        vaultId,
        dedupeKey: "repository:dry-run",
        demand: { scope: "repository", source: "dashboard" },
        lifecycle: {
          state: "succeeded",
          startedAt: 1,
          completedAt: 2,
          result: { kind: "refreshed" },
        },
        createdAt: 1,
        updatedAt: 2,
      });
    });

    await t.mutation(internal.legacyRepositoryInventoryCleanup.deleteRepositoryRefreshRequests, {
      dryRun: true,
    });

    await expect(t.query(internal.legacyRepositoryInventoryCleanup.verify, {})).resolves.toEqual({
      complete: false,
      remaining: {
        repositoryRefreshRequests: true,
        vaultBranchFilters: false,
        vaultRemoteBranches: false,
        githubCommitCheckSnapshots: false,
        githubCommitCheckItems: false,
      },
    });
  });

  it("quiesces active retired refresh work before deletion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const t = makeConvexTest();
    await t.run(async (ctx) => {
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
      await ctx.db.insert("repositoryRefreshRequests", {
        userId,
        vaultId,
        dedupeKey: "repository:active",
        demand: { scope: "repository", source: "dashboard" },
        lifecycle: { state: "running", startedAt: 1, leaseExpiresAt: 2_000, workpoolJobId: "job" },
        createdAt: 1,
        updatedAt: 1,
      });
    });

    try {
      await expect(
        t.query(internal.legacyRepositoryInventoryCleanup.preflight, {}),
      ).resolves.toEqual({
        safeToDelete: false,
        graceComplete: false,
        queued: false,
        scheduled: false,
        running: true,
      });

      await expect(
        t.mutation(internal.legacyRepositoryInventoryCleanup.quiesce, {}),
      ).resolves.toEqual({ state: "waiting", canceled: 0, waitUntil: 901_000 });
      await expect(
        t.query(internal.legacyRepositoryInventoryCleanup.preflight, {}),
      ).resolves.toMatchObject({ safeToDelete: false, running: true });

      vi.setSystemTime(2_000);
      await expect(
        t.mutation(internal.legacyRepositoryInventoryCleanup.quiesce, {}),
      ).resolves.toEqual({ state: "waiting", canceled: 1, waitUntil: 901_000 });
      await expect(
        t.query(internal.legacyRepositoryInventoryCleanup.preflight, {}),
      ).resolves.toEqual({
        safeToDelete: false,
        graceComplete: false,
        queued: false,
        scheduled: false,
        running: false,
      });

      vi.setSystemTime(901_000);
      await expect(
        t.mutation(internal.legacyRepositoryInventoryCleanup.quiesce, {}),
      ).resolves.toEqual({ state: "done", canceled: 0 });
      await expect(
        t.query(internal.legacyRepositoryInventoryCleanup.preflight, {}),
      ).resolves.toEqual({
        safeToDelete: true,
        graceComplete: true,
        queued: false,
        scheduled: false,
        running: false,
      });

      await t.mutation(internal.legacyRepositoryInventoryCleanup.run, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      await expect(
        t.query(internal.legacyRepositoryInventoryCleanup.verify, {}),
      ).resolves.toMatchObject({ complete: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits out rowless retired Workpool actions before reporting quiescence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const t = makeConvexTest();

    try {
      await expect(
        t.mutation(internal.legacyRepositoryInventoryCleanup.quiesce, {}),
      ).resolves.toEqual({ state: "waiting", canceled: 0, waitUntil: 901_000 });
      await expect(
        t.query(internal.legacyRepositoryInventoryCleanup.preflight, {}),
      ).resolves.toEqual({
        safeToDelete: false,
        graceComplete: false,
        queued: false,
        scheduled: false,
        running: false,
      });

      vi.setSystemTime(900_999);
      await expect(
        t.mutation(internal.legacyRepositoryInventoryCleanup.quiesce, {}),
      ).resolves.toEqual({ state: "waiting", canceled: 0, waitUntil: 901_000 });

      vi.setSystemTime(901_000);
      await expect(
        t.mutation(internal.legacyRepositoryInventoryCleanup.quiesce, {}),
      ).resolves.toEqual({ state: "done", canceled: 0 });
      await expect(
        t.query(internal.legacyRepositoryInventoryCleanup.preflight, {}),
      ).resolves.toEqual({
        safeToDelete: true,
        graceComplete: true,
        queued: false,
        scheduled: false,
        running: false,
      });
      await expect(
        t.mutation(internal.legacyRepositoryInventoryCleanup.finalize, {}),
      ).rejects.toThrow("Legacy repository inventory migrations are not complete.");
    } finally {
      vi.useRealTimers();
    }
  });
});
