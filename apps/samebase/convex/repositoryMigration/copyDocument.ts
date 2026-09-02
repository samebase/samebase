import type { GenericMutationCtx } from "convex/server";

import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { requireFrozenRepositoryMigrationWrite } from "./maintenance";
import type { RepositoryMigrationSourceTable } from "./manifest";
import { repositoryMigrations } from "./migrations";

type MigrationMutationCtx = GenericMutationCtx<DataModel>;

export async function findRepositoryMigrationSourceMapping(
  ctx: MigrationMutationCtx,
  sourceKind: Doc<"repositoryMigrationIdMaps">["sourceKind"],
  sourceId: Doc<"repositoryMigrationIdMaps">["sourceId"],
) {
  return await ctx.db
    .query("repositoryMigrationIdMaps")
    .withIndex("by_source", (query) => query.eq("sourceKind", sourceKind).eq("sourceId", sourceId))
    .unique();
}

export function defineCopiedDocumentMigration<
  Source extends RepositoryMigrationSourceTable,
  TargetId,
  TargetFields,
>({
  source,
  transform,
  findTargetId,
  insertTarget,
  replaceTarget,
  insertMapping,
}: {
  source: Source;
  transform: (ctx: MigrationMutationCtx, sourceDocument: Doc<Source>) => Promise<TargetFields>;
  findTargetId: (ctx: MigrationMutationCtx, sourceId: Id<Source>) => Promise<TargetId | null>;
  insertTarget: (ctx: MigrationMutationCtx, fields: TargetFields) => Promise<TargetId>;
  replaceTarget: (
    ctx: MigrationMutationCtx,
    targetId: TargetId,
    fields: TargetFields,
  ) => Promise<void>;
  insertMapping: (
    ctx: MigrationMutationCtx,
    sourceId: Id<Source>,
    targetId: TargetId,
  ) => Promise<void>;
}) {
  return repositoryMigrations.define({
    table: source,
    migrateOne: async (ctx, sourceDocument) => {
      await requireFrozenRepositoryMigrationWrite(ctx);
      const targetFields = await transform(ctx, sourceDocument);
      const existingTargetId = await findTargetId(ctx, sourceDocument._id);

      if (existingTargetId !== null) {
        await replaceTarget(ctx, existingTargetId, targetFields);
        return;
      }

      const targetId = await insertTarget(ctx, targetFields);
      await insertMapping(ctx, sourceDocument._id, targetId);
    },
  });
}
