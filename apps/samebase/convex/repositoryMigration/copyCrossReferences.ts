import {
  defineCopiedDocumentMigration,
  findRepositoryMigrationSourceMapping,
} from "./copyDocument";
import {
  requireMappedConvexProjectId,
  requireMappedDeletionHistoryRepositoryId,
  requireMappedDeletionRunId,
  requireMappedFolderId,
  requireMappedProvisioningRunId,
  requireMappedRepositoryId,
} from "./references";
import { toRepositoryDeletionStep, toRepositoryProvisioningStep } from "./steps";

const repositoryFolderAssignmentsMigration = defineCopiedDocumentMigration({
  source: "ui_vaultFolderAssignments",
  transform: async (ctx, assignment) => ({
    userId: assignment.userId,
    organizationId: assignment.organizationId,
    repositoryId: await requireMappedRepositoryId(ctx, assignment.vaultId),
    folderId: await requireMappedFolderId(ctx, assignment.folderId),
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "ui_vaultFolderAssignments",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" && mapping.sourceKind === "ui_vaultFolderAssignments")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`Folder assignment ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) =>
    await ctx.db.insert("ui_repositoryTree_folderAssignments", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "ui_vaultFolderAssignments",
      sourceId,
      targetKind: "ui_repositoryTree_folderAssignments",
      targetId,
    });
  },
});
export const copyRepositoryFolderAssignments = repositoryFolderAssignmentsMigration.copy;
export const verifyRepositoryFolderAssignments = repositoryFolderAssignmentsMigration.verify;

const repositoryConvexSchemaSnapshotsMigration = defineCopiedDocumentMigration({
  source: "observations_vaultConvexSchema_snapshots",
  transform: async (ctx, snapshot) => ({
    repositoryId: await requireMappedRepositoryId(ctx, snapshot.vaultId),
    convexProjectId: await requireMappedConvexProjectId(ctx, snapshot.convexProjectId),
    deploymentName: snapshot.deploymentName,
    schemaHash: snapshot.schemaHash,
    graph: snapshot.graph,
    declaredSchemaJson: snapshot.declaredSchemaJson,
    inferredSchemaJson: snapshot.inferredSchemaJson,
    fetchedAt: snapshot.fetchedAt,
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "observations_vaultConvexSchema_snapshots",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" &&
        mapping.sourceKind === "observations_vaultConvexSchema_snapshots")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`Schema snapshot ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) =>
    await ctx.db.insert("observations_repositoryConvexSchema_snapshots", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "observations_vaultConvexSchema_snapshots",
      sourceId,
      targetKind: "observations_repositoryConvexSchema_snapshots",
      targetId,
    });
  },
});
export const copyRepositoryConvexSchemaSnapshots = repositoryConvexSchemaSnapshotsMigration.copy;
export const verifyRepositoryConvexSchemaSnapshots =
  repositoryConvexSchemaSnapshotsMigration.verify;

const repositoryConvexSchemaGraphNodeLayoutsMigration = defineCopiedDocumentMigration({
  source: "ui_vaultConvexSchemaGraph_nodeLayouts",
  transform: async (ctx, layout) => ({
    userId: layout.userId,
    repositoryId: await requireMappedRepositoryId(ctx, layout.vaultId),
    convexProjectId: await requireMappedConvexProjectId(ctx, layout.convexProjectId),
    nodeId: layout.nodeId,
    x: layout.x,
    y: layout.y,
    updatedAt: layout.updatedAt,
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "ui_vaultConvexSchemaGraph_nodeLayouts",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" &&
        mapping.sourceKind === "ui_vaultConvexSchemaGraph_nodeLayouts")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`Schema node layout ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) =>
    await ctx.db.insert("ui_repositoryConvexSchemaGraph_nodeLayouts", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "ui_vaultConvexSchemaGraph_nodeLayouts",
      sourceId,
      targetKind: "ui_repositoryConvexSchemaGraph_nodeLayouts",
      targetId,
    });
  },
});
export const copyRepositoryConvexSchemaGraphNodeLayouts =
  repositoryConvexSchemaGraphNodeLayoutsMigration.copy;
export const verifyRepositoryConvexSchemaGraphNodeLayouts =
  repositoryConvexSchemaGraphNodeLayoutsMigration.verify;

const repositoryProvisioningPlansMigration = defineCopiedDocumentMigration({
  source: "workflow_vaultProvisioning_plans",
  transform: async (ctx, plan) => ({
    repositoryId: await requireMappedRepositoryId(ctx, plan.vaultId),
    convexConfigPath: plan.convexConfigPath,
    convex: plan.convex,
    cloudflare: plan.cloudflare,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "workflow_vaultProvisioning_plans",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" &&
        mapping.sourceKind === "workflow_vaultProvisioning_plans")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`Provisioning plan ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) =>
    await ctx.db.insert("workflow_repositoryProvisioning_plans", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "workflow_vaultProvisioning_plans",
      sourceId,
      targetKind: "workflow_repositoryProvisioning_plans",
      targetId,
    });
  },
});
export const copyRepositoryProvisioningPlans = repositoryProvisioningPlansMigration.copy;
export const verifyRepositoryProvisioningPlans = repositoryProvisioningPlansMigration.verify;

const repositoryProvisioningWriteLocksMigration = defineCopiedDocumentMigration({
  source: "workflow_vaultProvisioning_writeLocks",
  transform: async (ctx, lock) => {
    const repositoryId = await requireMappedRepositoryId(ctx, lock.vaultId);
    if (lock.owner.kind === "managed_run") {
      return {
        repositoryId,
        lastWriteAt: lock.lastWriteAt,
        updatedAt: lock.updatedAt,
        owner: {
          kind: lock.owner.kind,
          runId: await requireMappedProvisioningRunId(ctx, lock.owner.runId),
        },
        state: lock.state,
      };
    }
    return {
      repositoryId,
      lastWriteAt: lock.lastWriteAt,
      updatedAt: lock.updatedAt,
      owner: lock.owner,
      state: lock.state,
    };
  },
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "workflow_vaultProvisioning_writeLocks",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" &&
        mapping.sourceKind === "workflow_vaultProvisioning_writeLocks")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`Provisioning write lock ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) =>
    await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "workflow_vaultProvisioning_writeLocks",
      sourceId,
      targetKind: "workflow_repositoryProvisioning_writeLocks",
      targetId,
    });
  },
});
export const copyRepositoryProvisioningWriteLocks = repositoryProvisioningWriteLocksMigration.copy;
export const verifyRepositoryProvisioningWriteLocks =
  repositoryProvisioningWriteLocksMigration.verify;

const repositoryProvisioningEventsMigration = defineCopiedDocumentMigration({
  source: "workflow_vaultProvisioning_events",
  transform: async (ctx, event) => ({
    userId: event.userId,
    repositoryId: await requireMappedRepositoryId(ctx, event.vaultId),
    githubRepositoryFullName: event.repositoryFullName,
    runId: await requireMappedProvisioningRunId(ctx, event.runId),
    step: toRepositoryProvisioningStep(event.step),
    level: event.level,
    message: event.message,
    createdAt: event.createdAt,
    sourceOrder: {
      creationTime: event._creationTime,
      documentId: event._id,
    },
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "workflow_vaultProvisioning_events",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" &&
        mapping.sourceKind === "workflow_vaultProvisioning_events")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`Provisioning event ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) =>
    await ctx.db.insert("workflow_repositoryProvisioning_events", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "workflow_vaultProvisioning_events",
      sourceId,
      targetKind: "workflow_repositoryProvisioning_events",
      targetId,
    });
  },
});
export const copyRepositoryProvisioningEvents = repositoryProvisioningEventsMigration.copy;
export const verifyRepositoryProvisioningEvents = repositoryProvisioningEventsMigration.verify;

const repositoryDeletionEventsMigration = defineCopiedDocumentMigration({
  source: "workflow_vaultDeletion_events",
  transform: async (ctx, event) => ({
    organizationId: event.organizationId,
    userId: event.userId,
    repositoryId: await requireMappedDeletionHistoryRepositoryId(ctx, event.vaultId),
    githubRepositoryFullName: event.repositoryFullName,
    runId: await requireMappedDeletionRunId(ctx, event.runId),
    step: toRepositoryDeletionStep(event.step),
    level: event.level,
    message: event.message,
    createdAt: event.createdAt,
    sourceOrder: {
      creationTime: event._creationTime,
      documentId: event._id,
    },
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "workflow_vaultDeletion_events",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" && mapping.sourceKind === "workflow_vaultDeletion_events")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`Deletion event ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) =>
    await ctx.db.insert("workflow_repositoryDeletion_events", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "workflow_vaultDeletion_events",
      sourceId,
      targetKind: "workflow_repositoryDeletion_events",
      targetId,
    });
  },
});
export const copyRepositoryDeletionEvents = repositoryDeletionEventsMigration.copy;
export const verifyRepositoryDeletionEvents = repositoryDeletionEventsMigration.verify;
