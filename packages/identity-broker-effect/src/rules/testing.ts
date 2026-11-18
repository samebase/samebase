// Test support: the same test body on the memory host and on the node:sqlite host. The caller
// passes the database factory, so this file needs no Node types.
import { Effect } from "effect";
import { makeMemoryStore } from "../hosts/memory.ts";
import { makeSqliteStore, type SqliteDatabase } from "../hosts/nodeSqlite.ts";
import type { Doc, IndexName, TableName } from "../store/tables.ts";
import { Tx } from "../store/Tx.ts";

export type TestHost = Pick<
  ReturnType<typeof makeMemoryStore>,
  "run" | "withTx" | "setNow" | "now" | "store" | "layer"
>;

/** `[name, make]` for each host, for `describe.each`. */
export const testHosts = (
  newDatabase: () => SqliteDatabase,
): ReadonlyArray<readonly [string, (options?: { readonly now: number }) => TestHost]> => [
  ["memory", (options) => makeMemoryStore(options)],
  ["node:sqlite", (options) => makeSqliteStore(newDatabase(), options)],
];

/** Inserts `docs` into `table` in one step. */
export const seed = <T extends TableName>(host: TestHost, table: T, docs: ReadonlyArray<Doc<T>>) =>
  host.withTx(
    Effect.gen(function* () {
      const tx = yield* Tx;
      for (const doc of docs) {
        yield* tx.insert(table, doc);
      }
    }),
  );

/** Every document of `table`, in the order of `index`. */
export const rowsOf = <T extends TableName>(host: TestHost, table: T, index: IndexName<T>) =>
  host.withTx(
    Effect.gen(function* () {
      const tx = yield* Tx;
      return (yield* tx.query(table, index, { eq: [], order: "asc", limit: 10_000 })).map(
        (row) => row.doc,
      );
    }),
  );

/** Replaces the one document of `table` that `index` finds by `eq`, with `change` applied. */
export const patch = <T extends TableName>(
  host: TestHost,
  table: T,
  index: IndexName<T>,
  eq: ReadonlyArray<string | number>,
  change: (doc: Doc<T>) => Doc<T>,
) =>
  host.withTx(
    Effect.gen(function* () {
      const tx = yield* Tx;
      const rows = yield* tx.query(table, index, { eq, order: "asc", limit: 2 });
      const row = rows.at(0);
      if (row === undefined || rows.length > 1) {
        return yield* Effect.die(new Error(`patch needs exactly one ${table} row`));
      }
      yield* tx.replace(table, row.id, change(row.doc));
    }),
  );

/** Deletes every document of `table` that `index` finds by `eq`. */
export const remove = <T extends TableName>(
  host: TestHost,
  table: T,
  index: IndexName<T>,
  eq: ReadonlyArray<string | number>,
) =>
  host.withTx(
    Effect.gen(function* () {
      const tx = yield* Tx;
      for (const row of yield* tx.query(table, index, { eq, order: "asc", limit: 10_000 })) {
        yield* tx.delete(table, row.id);
      }
    }),
  );
