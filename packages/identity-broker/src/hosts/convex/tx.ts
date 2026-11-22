// A `Tx` over Convex's `ctx.db`, for one query or mutation. The tables are those of `schema.ts`,
// whose names arrive at run time, so the database is the generic reader or writer of
// `convex/server`. `RowId.key` is the document's `_id`. A document is written in its encoded form
// and read back through its table's Effect Schema, after the system fields are removed. The step
// ends when the function returns, so no write can reach the database after it.
import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
  GenericDocument,
} from "convex/server";
import { Effect, Schema } from "effect";
import {
  checkQuery,
  RowId,
  tables,
  type Doc,
  type IndexName,
  type IndexValue,
  type Query,
  type Row as RowOf,
  type TableName,
  type Tables,
  type TxShape,
} from "../../index.ts";

type Row<T extends TableName> = RowOf<Tables, T>;

/**
 * A Convex document value, from the JSON text of an encoded document of `tables.ts`. JSON text has
 * no `-0`, so a stored `-0` is `0`, as the contract needs: a Convex index keeps `-0` as a value of
 * its own, before `0`.
 */
const toFields = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.MutableJson)),
);
const decodeId = Schema.decodeUnknownSync(Schema.String);
/** `-0` as `0`, for the same reason as in `toFields`. */
const indexValue = (value: IndexValue): IndexValue => (value === 0 ? 0 : value);

/** The calls of a Convex index range that `query` makes. */
interface Range {
  eq(field: string, value: IndexValue): Range;
  gt(field: string, value: IndexValue): Range;
  gte(field: string, value: IndexValue): Range;
  lt(field: string, value: IndexValue): Range;
  lte(field: string, value: IndexValue): Range;
}

const encode = (table: TableName, doc: unknown) =>
  toFields(JSON.stringify(Schema.encodeUnknownSync(tables[table].schema)(doc)));

const idOf = <T extends TableName>(
  db: GenericDatabaseReader<GenericDataModel>,
  table: T,
  id: RowId<T>,
) => {
  const normalized = db.normalizeId(table, id.key);
  if (normalized === null) {
    throw new Error(`Not a row id of ${table}: ${id.key}`);
  }
  return normalized;
};

/** The `Tx` of a query, for a read-only command: a write dies. */
export const convexReadTx = (db: GenericDatabaseReader<GenericDataModel>): TxShape<Tables> => {
  const readOnly = () => Effect.die(new Error("A read-only step wrote"));
  const rowOf = <T extends TableName>(table: T, stored: GenericDocument): Row<T> => {
    const { _id, _creationTime, ...fields } = stored;
    return {
      id: new RowId(table, decodeId(_id)),
      doc: Schema.decodeUnknownSync(tables[table].schema)(fields),
    };
  };
  return {
    insert: readOnly,
    get: <T extends TableName>(table: T, id: RowId<T>) =>
      Effect.promise(async (): Promise<Row<T> | undefined> => {
        const stored = await db.get(table, idOf(db, table, id));
        return stored === null ? undefined : rowOf(table, stored);
      }),
    replace: readOnly,
    delete: readOnly,
    query: <T extends TableName>(table: T, index: IndexName<T>, query: Query) =>
      Effect.promise(async (): Promise<ReadonlyArray<Row<T>>> => {
        const checked = checkQuery(tables, table, index, query);
        const range = (q: Range) => {
          let at = q;
          checked.eq.forEach((value, field) => {
            const path = checked.fields[field]?.path;
            if (path === undefined) {
              throw new Error(`${table}.${index}: the prefix is longer than the index`);
            }
            at = at.eq(path, indexValue(value));
          });
          const path = checked.rangeField?.path;
          if (path !== undefined && checked.lower !== undefined) {
            at = at[checked.lower.op](path, indexValue(checked.lower.value));
          }
          if (path !== undefined && checked.upper !== undefined) {
            at = at[checked.upper.op](path, indexValue(checked.upper.value));
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

/** The `Tx` of a mutation. */
export const convexTx = (db: GenericDatabaseWriter<GenericDataModel>): TxShape<Tables> => ({
  ...convexReadTx(db),
  insert: <T extends TableName>(table: T, doc: Doc<T>) =>
    Effect.promise(async () => new RowId(table, await db.insert(table, encode(table, doc)))),
  replace: <T extends TableName>(table: T, id: RowId<T>, doc: Doc<T>) =>
    Effect.promise(() => db.replace(table, idOf(db, table, id), encode(table, doc))),
  delete: <T extends TableName>(table: T, id: RowId<T>) =>
    Effect.promise(() => db.delete(table, idOf(db, table, id))),
});
