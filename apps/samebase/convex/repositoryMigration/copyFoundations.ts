import {
  defineCopiedDocumentMigration,
  findRepositoryMigrationSourceMapping,
} from "./copyDocument";
import { requireMappedRepositoryId } from "./references";
import { toRepositoryProvisioningRunStep } from "./steps";

export const copyRepositoryFolders = defineCopiedDocumentMigration({
  source: "ui_vaultFolders",
  transform: async (_ctx, folder) => ({
    userId: folder.userId,
    organizationId: folder.organizationId,
    name: folder.name,
    nameKey: folder.nameKey,
    collapsed: folder.collapsed,
    position: folder.position,
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(ctx, "ui_vaultFolders", sourceId);
    if (mapping === null) return null;
    if (mapping.kind !== "copied_document" || mapping.sourceKind !== "ui_vaultFolders") {
      throw new Error(`Folder ${sourceId} has a conflicting target ID mapping.`);
    }
    return mapping.targetId;
  },
  insertTarget: async (ctx, fields) => await ctx.db.insert("ui_repositoryTree_folders", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    if ((await ctx.db.get(targetId)) === null) {
      throw new Error(`Folder target ${targetId} is missing.`);
    }
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "ui_vaultFolders",
      sourceId,
      targetKind: "ui_repositoryTree_folders",
      targetId,
    });
  },
});

export const copyRepositoryCloudflareWorkers = defineCopiedDocumentMigration({
  source: "vaultCloudflareWorkers",
  transform: async (ctx, worker) => ({
    repositoryId: await requireMappedRepositoryId(ctx, worker.vaultId),
    organizationId: worker.organizationId,
    accountId: worker.accountId,
    workerName: worker.workerName,
    workerTag: worker.workerTag,
    rootDirectory: worker.rootDirectory,
    origin: worker.origin,
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "vaultCloudflareWorkers",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" && mapping.sourceKind === "vaultCloudflareWorkers")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`Cloudflare Worker ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) => await ctx.db.insert("repositoryCloudflareWorkers", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    if ((await ctx.db.get(targetId)) === null) {
      throw new Error(`Cloudflare Worker target ${targetId} is missing.`);
    }
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "vaultCloudflareWorkers",
      sourceId,
      targetKind: "repositoryCloudflareWorkers",
      targetId,
    });
  },
});

export const copyRepositoryConvexProjects = defineCopiedDocumentMigration({
  source: "vaultConvexProjects",
  transform: async (ctx, project) => {
    const common = {
      repositoryId: await requireMappedRepositoryId(ctx, project.vaultId),
      organizationId: project.organizationId,
      teamId: project.teamId,
      projectId: project.projectId,
      origin: project.origin,
    };
    return "convexConfigPath" in project
      ? { ...common, convexConfigPath: project.convexConfigPath }
      : { ...common, convexDirectoryPath: project.convexDirectoryPath };
  },
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "vaultConvexProjects",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" && mapping.sourceKind === "vaultConvexProjects")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`Convex project ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) => await ctx.db.insert("repositoryConvexProjects", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    if ((await ctx.db.get(targetId)) === null) {
      throw new Error(`Convex project target ${targetId} is missing.`);
    }
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "vaultConvexProjects",
      sourceId,
      targetKind: "repositoryConvexProjects",
      targetId,
    });
  },
});

export const copyRepositoryProvisioningRuns = defineCopiedDocumentMigration({
  source: "workflow_vaultProvisioning_runs",
  transform: async (ctx, run) => ({
    organizationId: run.organizationId,
    userId: run.userId,
    repositoryId: await requireMappedRepositoryId(ctx, run.vaultId),
    githubRepositoryFullName: run.repositoryFullName,
    workflowId: run.workflowId,
    trigger: run.trigger,
    state: run.state,
    currentStep: toRepositoryProvisioningRunStep(run.currentStep),
    lastError: run.lastError,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
  }),
  findTargetId: async (ctx, sourceId) => {
    const mapping = await findRepositoryMigrationSourceMapping(
      ctx,
      "workflow_vaultProvisioning_runs",
      sourceId,
    );
    if (
      mapping === null ||
      (mapping.kind === "copied_document" &&
        mapping.sourceKind === "workflow_vaultProvisioning_runs")
    ) {
      return mapping?.targetId ?? null;
    }
    throw new Error(`Provisioning run ${sourceId} has a conflicting target ID mapping.`);
  },
  insertTarget: async (ctx, fields) =>
    await ctx.db.insert("workflow_repositoryProvisioning_runs", fields),
  replaceTarget: async (ctx, targetId, fields) => {
    if ((await ctx.db.get(targetId)) === null) {
      throw new Error(`Provisioning run target ${targetId} is missing.`);
    }
    await ctx.db.replace(targetId, fields);
  },
  insertMapping: async (ctx, sourceId, targetId) => {
    await ctx.db.insert("repositoryMigrationIdMaps", {
      kind: "copied_document",
      sourceKind: "workflow_vaultProvisioning_runs",
      sourceId,
      targetKind: "workflow_repositoryProvisioning_runs",
      targetId,
    });
  },
});
