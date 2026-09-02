import type { GenericMutationCtx, WithoutSystemFields } from "convex/server";

import type { DataModel, Doc } from "../_generated/dataModel";
import { requireFrozenRepositoryMigrationWrite } from "./maintenance";
import { repositoryMigrations } from "./migrations";
import {
  requireMappedDeletionRunId,
  requireMappedDeletionHistoryRepositoryId,
  requireMappedProvisioningRunId,
} from "./references";
import { toRepositoryDeletionPlan, toRepositoryDeletionStep } from "./steps";

type MigrationMutationCtx = GenericMutationCtx<DataModel>;
type RepositoryDeletionRunFields = WithoutSystemFields<Doc<"workflow_repositoryDeletion_runs">>;
type FinalRepositoryDeletionRunFields = Exclude<
  RepositoryDeletionRunFields,
  { state: "migration_placeholder" }
>;
type RepositoryDeletionAttempt = FinalRepositoryDeletionRunFields["attempt"];
type FinalRepositoryFields = Exclude<
  WithoutSystemFields<Doc<"repositories">>,
  { state: "migration_placeholder" | "migration_tombstone" }
>;
type RepositoryDeletionState = FinalRepositoryFields["deletion"];

export const copyRepositoryPlaceholders = repositoryMigrations.define({
  table: "vaults",
  migrateOne: async (ctx, vault) => {
    await requireFrozenRepositoryMigrationWrite(ctx);
    const mapping = await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_source", (query) => query.eq("sourceKind", "vaults").eq("sourceId", vault._id))
      .unique();

    if (mapping !== null) {
      if (mapping.kind !== "copied_document" || mapping.sourceKind !== "vaults") {
        throw new Error(`Vault ${vault._id} has a conflicting repository ID mapping.`);
      }
      if ((await ctx.db.get(mapping.targetId)) === null) {
        throw new Error(`Vault ${vault._id} maps to a missing repository document.`);
      }
      return;
    }

    const repositoryId = await ctx.db.insert("repositories", {
      state: "migration_placeholder",
      createdAt: vault._creationTime,
    });
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "vaults",
      sourceId: vault._id,
      targetKind: "repositories",
      targetId: repositoryId,
    });
  },
});

export const copyDeletedRepositoryTombstones = repositoryMigrations.define({
  table: "workflow_vaultDeletion_runs",
  migrateOne: async (ctx, run) => {
    await requireFrozenRepositoryMigrationWrite(ctx);
    if (run.state !== "succeeded" || (await ctx.db.get(run.vaultId)) !== null) {
      return;
    }

    const mapping = await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_source", (query) =>
        query.eq("sourceKind", "vaults").eq("sourceId", run.vaultId),
      )
      .unique();

    if (mapping !== null) {
      if (mapping.kind !== "deleted_repository_identity") {
        throw new Error(`Deleted vault ${run.vaultId} has a conflicting repository ID mapping.`);
      }
      const target = await ctx.db.get(mapping.targetId);
      if (target !== null && target.state !== "migration_tombstone") {
        throw new Error(`Deleted vault ${run.vaultId} maps to a non-tombstone repository.`);
      }
      return;
    }

    const repositoryId = await ctx.db.insert("repositories", {
      state: "migration_tombstone",
      createdAt: run.createdAt,
    });
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "deleted_repository_identity",
      sourceKind: "vaults",
      sourceId: run.vaultId,
      targetKind: "repositories",
      targetId: repositoryId,
      evidenceRunId: run._id,
    });
  },
});

export const copyDeletionRunPlaceholders = repositoryMigrations.define({
  table: "workflow_vaultDeletion_runs",
  migrateOne: async (ctx, run) => {
    await requireFrozenRepositoryMigrationWrite(ctx);
    const repositoryId = await requireMappedDeletionHistoryRepositoryId(ctx, run.vaultId);
    const mapping = await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_source", (query) =>
        query.eq("sourceKind", "workflow_vaultDeletion_runs").eq("sourceId", run._id),
      )
      .unique();

    if (mapping !== null) {
      if (
        mapping.kind !== "copied_document" ||
        mapping.sourceKind !== "workflow_vaultDeletion_runs"
      ) {
        throw new Error(`Deletion run ${run._id} has a conflicting target ID mapping.`);
      }
      if ((await ctx.db.get(mapping.targetId)) === null) {
        throw new Error(`Deletion run ${run._id} maps to a missing target document.`);
      }
      return;
    }

    const targetRunId = await ctx.db.insert("workflow_repositoryDeletion_runs", {
      state: "migration_placeholder",
      repositoryId,
      githubRepositoryFullName: run.repositoryFullName,
      createdAt: run.createdAt,
    });
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "workflow_vaultDeletion_runs",
      sourceId: run._id,
      targetKind: "workflow_repositoryDeletion_runs",
      targetId: targetRunId,
    });
  },
});

async function toRepositoryDeletionAttempt(
  ctx: MigrationMutationCtx,
  attempt: Doc<"workflow_vaultDeletion_runs">["attempt"],
): Promise<RepositoryDeletionAttempt> {
  if (attempt.kind === "initial") {
    return attempt;
  }
  return {
    kind: "retry",
    retryOf: await requireMappedDeletionRunId(ctx, attempt.retryOf),
  };
}

async function toRepositoryDeletionRun(
  ctx: MigrationMutationCtx,
  run: Doc<"workflow_vaultDeletion_runs">,
): Promise<FinalRepositoryDeletionRunFields> {
  const base = {
    organizationId: run.organizationId,
    userId: run.userId,
    repositoryId: await requireMappedDeletionHistoryRepositoryId(ctx, run.vaultId),
    githubRepositoryFullName: run.repositoryFullName,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    attempt: await toRepositoryDeletionAttempt(ctx, run.attempt),
  };

  switch (run.state) {
    case "queued":
      return {
        ...base,
        state: run.state,
        workflow: run.workflow,
        currentStep: run.currentStep,
        snapshot: {
          state: run.snapshot.state,
          plan: toRepositoryDeletionPlan(run.snapshot.plan),
        },
      };
    case "running":
      return {
        ...base,
        state: run.state,
        workflow: run.workflow,
        currentStep: toRepositoryDeletionStep(run.currentStep),
        snapshot: {
          state: run.snapshot.state,
          plan: toRepositoryDeletionPlan(run.snapshot.plan),
        },
      };
    case "failed":
      return {
        ...base,
        state: run.state,
        workflow: run.workflow,
        currentStep: toRepositoryDeletionStep(run.currentStep),
        snapshot: {
          state: run.snapshot.state,
          plan: toRepositoryDeletionPlan(run.snapshot.plan),
        },
        lastError: run.lastError,
        completedAt: run.completedAt,
      };
    case "succeeded":
      return {
        ...base,
        state: run.state,
        workflow: run.workflow,
        currentStep: run.currentStep,
        snapshot: run.snapshot,
        completedAt: run.completedAt,
      };
    default:
      run satisfies never;
      throw new Error("Unknown deletion run state.");
  }
}

export const finalizeDeletionRuns = repositoryMigrations.define({
  table: "workflow_vaultDeletion_runs",
  migrateOne: async (ctx, run) => {
    await requireFrozenRepositoryMigrationWrite(ctx);
    const targetRunId = await requireMappedDeletionRunId(ctx, run._id);
    if ((await ctx.db.get(targetRunId)) === null) {
      throw new Error(`Deletion run ${run._id} maps to a missing target document.`);
    }
    await ctx.db.replace(targetRunId, await toRepositoryDeletionRun(ctx, run));
  },
});

async function toRepositoryDeletionState(
  ctx: MigrationMutationCtx,
  deletion: Doc<"vaults">["deletion"],
): Promise<RepositoryDeletionState> {
  switch (deletion.state) {
    case "not_deleting":
      return deletion;
    case "deleting":
      return {
        state: deletion.state,
        runId: await requireMappedDeletionRunId(ctx, deletion.runId),
        requestedAt: deletion.requestedAt,
      };
    case "delete_failed":
      return {
        state: deletion.state,
        runId: await requireMappedDeletionRunId(ctx, deletion.runId),
        failedAt: deletion.failedAt,
      };
    default:
      deletion satisfies never;
      throw new Error("Unknown deletion state.");
  }
}

async function toRepository(
  ctx: MigrationMutationCtx,
  vault: Doc<"vaults">,
): Promise<FinalRepositoryFields> {
  const createdAt = vault._creationTime;
  const deletion = await toRepositoryDeletionState(ctx, vault.deletion);

  switch (vault.state) {
    case "not_connected":
      return {
        state: vault.state,
        organizationId: vault.organizationId,
        convexTeamId: vault.convexTeamId,
        cloudflareAccountId: vault.cloudflareAccountId,
        deletion,
        createdAt,
      };
    case "provisioning": {
      const runId = await requireMappedProvisioningRunId(ctx, vault.runId);
      if (vault.githubMode === "create_repository") {
        return {
          state: vault.state,
          githubMode: vault.githubMode,
          organizationId: vault.organizationId,
          convexTeamId: vault.convexTeamId,
          cloudflareAccountId: vault.cloudflareAccountId,
          deletion,
          runId,
          startedAt: vault.startedAt,
          githubRepositoryName: vault.name,
          visibility: vault.visibility,
          createdAt,
        };
      }
      return {
        state: vault.state,
        githubMode: vault.githubMode,
        organizationId: vault.organizationId,
        convexTeamId: vault.convexTeamId,
        cloudflareAccountId: vault.cloudflareAccountId,
        deletion,
        runId,
        startedAt: vault.startedAt,
        githubRepositoryDatabaseId: vault.ghRepoId,
        githubRepositoryName: vault.name,
        createdAt,
      };
    }
    case "connected": {
      const runId = await requireMappedProvisioningRunId(ctx, vault.runId);
      if (vault.githubMode === "create_repository") {
        return {
          state: vault.state,
          githubMode: vault.githubMode,
          organizationId: vault.organizationId,
          convexTeamId: vault.convexTeamId,
          cloudflareAccountId: vault.cloudflareAccountId,
          deletion,
          treeRefreshStartedAt: vault.treeRefreshStartedAt,
          lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
          treeRefreshFailureKind: vault.treeRefreshFailureKind,
          treeRefreshFailureMessage: vault.treeRefreshFailureMessage,
          treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
          runId,
          githubRepositoryDatabaseId: vault.ghRepoId,
          defaultBranch: vault.defaultBranch,
          connectedAt: vault.connectedAt,
          githubRepositoryName: vault.name,
          visibility: vault.visibility,
          createdAt,
        };
      }
      return {
        state: vault.state,
        githubMode: vault.githubMode,
        organizationId: vault.organizationId,
        convexTeamId: vault.convexTeamId,
        cloudflareAccountId: vault.cloudflareAccountId,
        deletion,
        treeRefreshStartedAt: vault.treeRefreshStartedAt,
        lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
        treeRefreshFailureKind: vault.treeRefreshFailureKind,
        treeRefreshFailureMessage: vault.treeRefreshFailureMessage,
        treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
        runId,
        githubRepositoryDatabaseId: vault.ghRepoId,
        defaultBranch: vault.defaultBranch,
        connectedAt: vault.connectedAt,
        githubRepositoryName: vault.name,
        visibility: vault.visibility,
        createdAt,
      };
    }
    case "failed": {
      const runId = await requireMappedProvisioningRunId(ctx, vault.runId);
      if (vault.githubMode === "create_repository") {
        return {
          state: vault.state,
          githubMode: vault.githubMode,
          organizationId: vault.organizationId,
          convexTeamId: vault.convexTeamId,
          cloudflareAccountId: vault.cloudflareAccountId,
          deletion,
          runId,
          failedAt: vault.failedAt,
          githubRepositoryName: vault.name,
          visibility: vault.visibility,
          createdAt,
        };
      }
      return {
        state: vault.state,
        githubMode: vault.githubMode,
        organizationId: vault.organizationId,
        convexTeamId: vault.convexTeamId,
        cloudflareAccountId: vault.cloudflareAccountId,
        deletion,
        runId,
        failedAt: vault.failedAt,
        githubRepositoryDatabaseId: vault.ghRepoId,
        githubRepositoryName: vault.name,
        createdAt,
      };
    }
    default:
      vault satisfies never;
      throw new Error("Unknown vault state.");
  }
}

export const finalizeRepositories = repositoryMigrations.define({
  table: "vaults",
  migrateOne: async (ctx, vault) => {
    await requireFrozenRepositoryMigrationWrite(ctx);
    const mapping = await ctx.db
      .query("repositoryMigrationIdMaps")
      .withIndex("by_source", (query) => query.eq("sourceKind", "vaults").eq("sourceId", vault._id))
      .unique();
    if (mapping === null || mapping.kind !== "copied_document" || mapping.sourceKind !== "vaults") {
      throw new Error(`Vault ${vault._id} has no copied repository ID mapping.`);
    }
    if ((await ctx.db.get(mapping.targetId)) === null) {
      throw new Error(`Vault ${vault._id} maps to a missing repository document.`);
    }
    await ctx.db.replace(mapping.targetId, await toRepository(ctx, vault));
  },
});

export const removeDeletedRepositoryTombstones = repositoryMigrations.define({
  table: "repositoryMigrationIdMaps",
  migrateOne: async (ctx, mapping) => {
    await requireFrozenRepositoryMigrationWrite(ctx);
    if (mapping.kind !== "deleted_repository_identity") {
      return;
    }
    const target = await ctx.db.get(mapping.targetId);
    if (target === null) {
      return;
    }
    if (target.state !== "migration_tombstone") {
      throw new Error(`Deleted repository identity ${mapping.sourceId} has a live target.`);
    }
    await ctx.db.delete(mapping.targetId);
  },
});
