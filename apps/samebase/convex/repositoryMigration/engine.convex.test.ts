/// <reference types="vite/client" />

import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";

async function insertFrozenFixture() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      name: "Migration Operator",
      email: "migration@example.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "migration-installation",
      githubOwnerId: "migration-owner",
      githubOwnerLogin: "migration-owner",
      githubOwnerLoginNormalized: "migration-owner",
      githubOwnerType: "organization",
    });
    await ctx.db.insert("repositoryWriteGates", {
      scope: "global",
      mode: "frozen",
      changedAt: 1,
    });
    return { organizationId, userId };
  });
  return { ids, t };
}

async function insertNotConnectedVaults(
  count: number,
  organizationId: Id<"organizations">,
  t: ReturnType<typeof makeConvexTest>,
) {
  return await t.run(async (ctx) => {
    const vaultIds: Id<"vaults">[] = [];
    for (let index = 0; index < count; index += 1) {
      vaultIds.push(
        await ctx.db.insert("vaults", {
          state: "not_connected",
          organizationId,
          deletion: { state: "not_deleting" },
        }),
      );
    }
    return vaultIds;
  });
}

describe("repository migration engine", () => {
  it("resumes bounded batches and reuses typed repository mappings", async () => {
    const { ids, t } = await insertFrozenFixture();
    const vaultIds = await insertNotConnectedVaults(2, ids.organizationId, t);

    const first = await t.mutation(internal.repositoryMigration.cycles.copyRepositoryPlaceholders, {
      cursor: null,
      batchSize: 1,
      dryRun: false,
      oneBatchOnly: true,
    });
    expect(first.processed).toBe(1);
    expect(first.isDone).toBe(false);

    const second = await t.mutation(
      internal.repositoryMigration.cycles.copyRepositoryPlaceholders,
      {
        cursor: first.continueCursor,
        batchSize: 1,
        dryRun: false,
        oneBatchOnly: true,
      },
    );
    expect(second.processed).toBe(1);
    const completion = await t.mutation(
      internal.repositoryMigration.cycles.copyRepositoryPlaceholders,
      {
        cursor: second.continueCursor,
        batchSize: 1,
        dryRun: false,
        oneBatchOnly: true,
      },
    );
    expect(completion.processed).toBe(0);
    expect(completion.isDone).toBe(true);

    const beforeRetry = await t.run(async (ctx) => {
      return await ctx.db.query("repositoryMigrationIdMaps").collect();
    });
    await t.mutation(internal.repositoryMigration.cycles.copyRepositoryPlaceholders, {
      cursor: null,
      batchSize: 10,
      dryRun: false,
      oneBatchOnly: true,
    });
    const afterRetry = await t.run(async (ctx) => ({
      mappings: await ctx.db.query("repositoryMigrationIdMaps").collect(),
      repositories: await ctx.db.query("repositories").collect(),
    }));

    expect(afterRetry.repositories).toHaveLength(2);
    expect(afterRetry.mappings).toHaveLength(2);
    expect(afterRetry.mappings.map((mapping) => mapping.targetId).sort()).toEqual(
      beforeRetry.map((mapping) => mapping.targetId).sort(),
    );
    expect(afterRetry.mappings).toEqual(
      expect.arrayContaining(
        vaultIds.map((vaultId) =>
          expect.objectContaining({
            kind: "copied_document",
            sourceKind: "vaults",
            sourceId: vaultId,
            targetKind: "repositories",
          }),
        ),
      ),
    );
  });

  it("copies retry cycles through one temporary deleted-repository tombstone", async () => {
    const { ids, t } = await insertFrozenFixture();
    const vaultId = (await insertNotConnectedVaults(1, ids.organizationId, t))[0];
    const sourceRunIds = await t.run(async (ctx) => {
      const initialRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "failed",
        organizationId: ids.organizationId,
        userId: ids.userId,
        vaultId,
        repositoryFullName: "migration-owner/deleted-repository",
        createdAt: 10,
        updatedAt: 20,
        attempt: { kind: "initial" },
        workflow: { state: "not_started" },
        currentStep: "lock_vault",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "existing_repository",
              ghRepoId: "github-repository-id",
              owner: "migration-owner",
              name: "deleted-repository",
              repositoryFullName: "migration-owner/deleted-repository",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
        lastError: "Retry required.",
        completedAt: 20,
      });
      const retryRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "succeeded",
        organizationId: ids.organizationId,
        userId: ids.userId,
        vaultId,
        repositoryFullName: "migration-owner/deleted-repository",
        createdAt: 30,
        updatedAt: 40,
        attempt: { kind: "retry", retryOf: initialRunId },
        workflow: { state: "started", workflowId: "deletion-workflow" },
        currentStep: "finish",
        snapshot: { state: "scrubbed_after_success" },
        completedAt: 40,
      });
      await ctx.db.delete(vaultId);
      return { initialRunId, retryRunId };
    });

    await t.mutation(internal.repositoryMigration.cycles.copyDeletedRepositoryTombstones, {
      cursor: null,
      batchSize: 10,
      dryRun: false,
      oneBatchOnly: true,
    });
    await t.mutation(internal.repositoryMigration.cycles.copyDeletionRunPlaceholders, {
      cursor: null,
      batchSize: 10,
      dryRun: false,
      oneBatchOnly: true,
    });
    await t.mutation(internal.repositoryMigration.cycles.finalizeDeletionRuns, {
      cursor: null,
      batchSize: 10,
      dryRun: false,
      oneBatchOnly: true,
    });
    await t.mutation(internal.repositoryMigration.cycles.removeDeletedRepositoryTombstones, {
      cursor: null,
      batchSize: 10,
      dryRun: false,
      oneBatchOnly: true,
    });

    const copied = await t.run(async (ctx) => {
      const identity = await ctx.db
        .query("repositoryMigrationIdMaps")
        .withIndex("by_source", (query) => query.eq("sourceKind", "vaults").eq("sourceId", vaultId))
        .unique();
      const initialMapping = await ctx.db
        .query("repositoryMigrationIdMaps")
        .withIndex("by_source", (query) =>
          query
            .eq("sourceKind", "workflow_vaultDeletion_runs")
            .eq("sourceId", sourceRunIds.initialRunId),
        )
        .unique();
      const retryMapping = await ctx.db
        .query("repositoryMigrationIdMaps")
        .withIndex("by_source", (query) =>
          query
            .eq("sourceKind", "workflow_vaultDeletion_runs")
            .eq("sourceId", sourceRunIds.retryRunId),
        )
        .unique();
      if (
        identity?.kind !== "deleted_repository_identity" ||
        initialMapping?.sourceKind !== "workflow_vaultDeletion_runs" ||
        retryMapping?.sourceKind !== "workflow_vaultDeletion_runs"
      ) {
        throw new Error("Expected typed deletion mappings.");
      }
      return {
        identity,
        initialRun: await ctx.db.get(initialMapping.targetId),
        retryRun: await ctx.db.get(retryMapping.targetId),
        tombstone: await ctx.db.get(identity.targetId),
      };
    });

    expect(copied.tombstone).toBeNull();
    if (
      copied.initialRun === null ||
      copied.initialRun.state === "migration_placeholder" ||
      copied.retryRun === null ||
      copied.retryRun.state === "migration_placeholder"
    ) {
      throw new Error("Expected finalized deletion runs.");
    }
    expect(copied.initialRun.repositoryId).toBe(copied.identity.targetId);
    expect(copied.retryRun.repositoryId).toBe(copied.identity.targetId);
    expect(copied.retryRun.attempt).toEqual({
      kind: "retry",
      retryOf: copied.initialRun._id,
    });
  });

  it("detects a mapping whose migration-owned target is missing", async () => {
    const { ids, t } = await insertFrozenFixture();
    const vaultId = (await insertNotConnectedVaults(1, ids.organizationId, t))[0];
    await t.mutation(internal.repositoryMigration.cycles.copyRepositoryPlaceholders, {
      cursor: null,
      batchSize: 10,
      dryRun: false,
      oneBatchOnly: true,
    });
    await t.run(async (ctx) => {
      const mapping = await ctx.db
        .query("repositoryMigrationIdMaps")
        .withIndex("by_source", (query) => query.eq("sourceKind", "vaults").eq("sourceId", vaultId))
        .unique();
      if (mapping === null || mapping.sourceKind !== "vaults") {
        throw new Error("Expected repository mapping.");
      }
      await ctx.db.delete(mapping.targetId);
    });

    await expect(
      t.mutation(internal.repositoryMigration.verify.verifyMappedDocuments, {
        cursor: null,
        batchSize: 10,
        dryRun: false,
        oneBatchOnly: true,
      }),
    ).rejects.toThrow("points to a missing target document");
  });

  it("detects copied business fields that differ from the source", async () => {
    const { ids, t } = await insertFrozenFixture();
    const sourceFolderId = await t.run(async (ctx) => {
      return await ctx.db.insert("ui_vaultFolders", {
        userId: ids.userId,
        organizationId: ids.organizationId,
        name: "Migration folder",
        nameKey: "migration folder",
        collapsed: false,
        position: 1,
      });
    });
    await t.mutation(internal.repositoryMigration.copyFoundations.copyRepositoryFolders, {
      cursor: null,
      batchSize: 10,
      dryRun: false,
      oneBatchOnly: true,
    });
    await t.run(async (ctx) => {
      const mapping = await ctx.db
        .query("repositoryMigrationIdMaps")
        .withIndex("by_source", (query) =>
          query.eq("sourceKind", "ui_vaultFolders").eq("sourceId", sourceFolderId),
        )
        .unique();
      if (mapping === null || mapping.sourceKind !== "ui_vaultFolders") {
        throw new Error("Expected folder mapping.");
      }
      await ctx.db.patch(mapping.targetId, { name: "Incorrect folder" });
    });

    await expect(
      t.mutation(internal.repositoryMigration.copyFoundations.verifyRepositoryFolders, {
        cursor: null,
        batchSize: 10,
        dryRun: false,
        oneBatchOnly: true,
      }),
    ).rejects.toThrow("has incorrect target fields");
  });

  it("detects target rows that have no copied source mapping", async () => {
    const { ids, t } = await insertFrozenFixture();
    await t.run(async (ctx) => {
      await ctx.db.insert("repositories", {
        state: "not_connected",
        organizationId: ids.organizationId,
        deletion: { state: "not_deleting" },
        createdAt: 100,
      });
    });

    await expect(
      t.mutation(internal.repositoryMigration.verifyTargets.verifyRepositoryTargets, {
        cursor: null,
        batchSize: 10,
        dryRun: false,
        oneBatchOnly: true,
      }),
    ).rejects.toThrow("has no copied source mapping");
  });

  it("clears mapped roots but preserves source and unowned target rows", async () => {
    const { ids, t } = await insertFrozenFixture();
    const vaultId = (await insertNotConnectedVaults(1, ids.organizationId, t))[0];
    await t.mutation(internal.repositoryMigration.cycles.copyRepositoryPlaceholders, {
      cursor: null,
      batchSize: 10,
      dryRun: false,
      oneBatchOnly: true,
    });
    const unownedRepositoryId = await t.run(async (ctx) => {
      return await ctx.db.insert("repositories", {
        state: "not_connected",
        organizationId: ids.organizationId,
        deletion: { state: "not_deleting" },
        createdAt: 100,
      });
    });

    await t.mutation(internal.repositoryMigration.clear.clearRepositoryRootTargets, {
      cursor: null,
      batchSize: 10,
      dryRun: false,
      oneBatchOnly: true,
    });

    const remaining = await t.run(async (ctx) => ({
      source: await ctx.db.get(vaultId),
      unownedTarget: await ctx.db.get(unownedRepositoryId),
      mappings: await ctx.db.query("repositoryMigrationIdMaps").collect(),
      targetCount: (await ctx.db.query("repositories").collect()).length,
    }));
    expect(remaining.source).not.toBeNull();
    expect(remaining.unownedTarget).not.toBeNull();
    expect(remaining.mappings).toHaveLength(0);
    expect(remaining.targetCount).toBe(1);
  });
});
