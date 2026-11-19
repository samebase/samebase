// A `Tx` over Convex's `ctx.db`, for one mutation. The tables are those of `schema.ts`, whose names
// arrive at run time, so the database is the generic writer of `convex/server`. `RowId.key` is the
// document's `_id`. A document is written in its encoded form and read back through its table's
// Effect Schema, after the system fields are removed. The step ends when the mutation returns, so
// no write can reach the database after it.
import type { GenericDatabaseWriter, GenericDataModel, GenericDocument } from "convex/server";
import { Effect, Schema } from "effect";
import { tables, type Doc, type IndexName, type TableName } from "../../store/tables.ts";
import {
  checkQuery,
  RowId,
  type IndexValue,
  type Query,
  type Row,
  type TxShape,
} from "../../store/Tx.ts";

/** A Convex document value. The encoded documents of `tables.ts` are JSON. */
const toFields = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.MutableJson));
const decodeId = Schema.decodeUnknownSync(Schema.String);

/** The calls of a Convex index range that `query` makes. */
interface Range {
  eq(field: string, value: IndexValue): Range;
  gt(field: string, value: IndexValue): Range;
  gte(field: string, value: IndexValue): Range;
  lt(field: string, value: IndexValue): Range;
  lte(field: string, value: IndexValue): Range;
}

export const convexTx = (db: GenericDatabaseWriter<GenericDataModel>): TxShape => {
  const encode = (table: TableName, doc: unknown) =>
    toFields(Schema.encodeUnknownSync(tables[table].schema)(doc));
  const rowOf = <T extends TableName>(table: T, stored: GenericDocument): Row<T> => {
    const { _id, _creationTime, ...fields } = stored;
    return {
      id: new RowId(table, decodeId(_id)),
      doc: Schema.decodeUnknownSync(tables[table].schema)(fields),
    };
  };
  const idOf = <T extends TableName>(table: T, id: RowId<T>) => {
    const normalized = db.normalizeId(table, id.key);
    if (normalized === null) {
      throw new Error(`Not a row id of ${table}: ${id.key}`);
    }
    return normalized;
  };

  return {
    insert: <T extends TableName>(table: T, doc: Doc<T>) =>
      Effect.promise(async () => new RowId(table, await db.insert(table, encode(table, doc)))),
    get: <T extends TableName>(table: T, id: RowId<T>) =>
      Effect.promise(async (): Promise<Row<T> | undefined> => {
        const stored = await db.get(table, idOf(table, id));
        return stored === null ? undefined : rowOf(table, stored);
      }),
    replace: <T extends TableName>(table: T, id: RowId<T>, doc: Doc<T>) =>
      Effect.promise(() => db.replace(table, idOf(table, id), encode(table, doc))),
    delete: <T extends TableName>(table: T, id: RowId<T>) =>
      Effect.promise(() => db.delete(table, idOf(table, id))),
    query: <T extends TableName>(table: T, index: IndexName<T>, query: Query) =>
      Effect.promise(async (): Promise<ReadonlyArray<Row<T>>> => {
        const checked = checkQuery(table, index, query);
        const range = (q: Range) => {
          let at = q;
          checked.eq.forEach((value, field) => {
            const path = checked.fields[field]?.path;
            if (path === undefined) {
              throw new Error(`${table}.${index}: the prefix is longer than the index`);
            }
            at = at.eq(path, value);
          });
          const path = checked.rangeField?.path;
          if (path !== undefined && checked.lower !== undefined) {
            at = at[checked.lower.op](path, checked.lower.value);
          }
          if (path !== undefined && checked.upper !== undefined) {
            at = at[checked.upper.op](path, checked.upper.value);
          }
          return at;
        };
        const stored = await db
          .query(table)
          // @ts-expect-error Convex's range builder returns itself from eq, gt, gte, lt and lte at
          // run time; its type counts the fields of an index known at compile time, which a generic
          // data model has not.
          .withIndex(index, range)
          .order(checked.order)
          .take(checked.limit);
        return stored.map((row) => rowOf(table, row));
      }),
  };
};
