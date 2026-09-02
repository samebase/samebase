import type { GenericMutationCtx, TableNamesInDataModel } from "convex/server";
import {
  compareValues,
  convexToJson,
  jsonToConvex,
  type GenericId,
  type Value,
} from "convex/values";

import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { requireFrozenRepositoryMigrationWrite } from "./maintenance";
import type { RepositoryMigrationSourceTable } from "./manifest";
import { repositoryMigrations } from "./migrations";

type MigrationMutationCtx = GenericMutationCtx<DataModel>;

type ConvexDocument = {
  _id: GenericId<string>;
  _creationTime: number;
  [field: string]: Value | undefined;
};

export function hasExactBusinessFields(currentDocument: ConvexDocument, expectedFields: Value) {
  const currentFields = Object.fromEntries(
    Object.entries(currentDocument).filter(
      ([field]) => field !== "_id" && field !== "_creationTime",
    ),
  );
  const normalizedExpectedFields = jsonToConvex(convexToJson(expectedFields));
  return compareValues(currentFields, normalizedExpectedFields) === 0;
}

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
  TargetId extends Id<TableNamesInDataModel<DataModel>>,
  TargetFields extends Value,
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
  const copy = repositoryMigrations.define({
    table: source,
    migrateOne: async (ctx, sourceDocument) => {
      await requireFrozenRepositoryMigrationWrite(ctx);
      const targetFields = await transform(ctx, sourceDocument);
      const existingTargetId = await findTargetId(ctx, sourceDocument._id);

      if (existingTargetId !== null) {
        const existingTarget = await ctx.db.get(existingTargetId);
        if (existingTarget !== null && hasExactBusinessFields(existingTarget, targetFields)) {
          return;
        }
        await replaceTarget(ctx, existingTargetId, targetFields);
        return;
      }

      const targetId = await insertTarget(ctx, targetFields);
      await insertMapping(ctx, sourceDocument._id, targetId);
    },
  });

  const verify = repositoryMigrations.define({
    table: source,
    migrateOne: async (ctx, sourceDocument) => {
      await requireFrozenRepositoryMigrationWrite(ctx);
      const targetId = await findTargetId(ctx, sourceDocument._id);
      if (targetId === null) {
        throw new Error(`Source ${source}:${sourceDocument._id} has no target ID mapping.`);
      }
      const targetDocument = await ctx.db.get(targetId);
      if (targetDocument === null) {
        throw new Error(
          `Source ${source}:${sourceDocument._id} maps to a missing target document.`,
        );
      }
      const expectedFields = await transform(ctx, sourceDocument);
      if (!hasExactBusinessFields(targetDocument, expectedFields)) {
        throw new Error(`Source ${source}:${sourceDocument._id} has incorrect target fields.`);
      }
    },
  });

  return { copy, verify };
}
