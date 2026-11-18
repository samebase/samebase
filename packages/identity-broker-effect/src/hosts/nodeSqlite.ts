// A Store over node:sqlite, for tests: each command runs between BEGIN and COMMIT, with a fresh
// `Tx` that is closed before the transaction ends. The database is passed in, so this file needs
// no Node types and the shape is the one of `DatabaseSync`.
import { Effect, Layer } from "effect";
import { ensureLayout, sqlTx, type Exec, type SqlValue } from "../store/sql.ts";
import {
  decodeArgs,
  decodeResult,
  isReadOnly,
  runStep,
  Store,
  type Args,
  type CommandName,
  type Result,
} from "../store/Store.ts";
import { Tx, type TxShape } from "../store/Tx.ts";

/** The part of node:sqlite's `DatabaseSync` that the host uses. */
export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): { all(...params: Array<SqlValue>): ReadonlyArray<Record<string, unknown>> };
}

/** Runs `body` between BEGIN and COMMIT over a fresh `Tx`; a throw rolls back and is rethrown. */
export const sqliteStep = <A>(
  database: SqliteDatabase,
  body: (tx: TxShape) => A,
  options: { readonly readOnly: boolean } = { readOnly: false },
): A => {
  const exec: Exec = (sql, params) => database.prepare(sql).all(...params);
  let open = true;
  database.exec("BEGIN");
  try {
    let result: A;
    try {
      result = body(sqlTx(exec, () => open, options.readOnly));
    } finally {
      open = false;
    }
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
};

export const makeSqliteStore = (
  database: SqliteDatabase,
  options: { readonly now: number } = { now: 0 },
) => {
  sqliteStep(database, () => ensureLayout((sql, params) => database.prepare(sql).all(...params)));
  let now = options.now;

  const run = <N extends CommandName>(name: N, args: Args<N>): Result<N> => {
    const decoded = decodeArgs(name, args);
    const encoded = sqliteStep(database, (tx) => runStep(name, decoded, now, tx), {
      readOnly: isReadOnly(name),
    });
    return decodeResult(name, encoded);
  };

  const store = Store.of({ run: (name, args) => Effect.sync(() => run(name, args)) });

  return {
    store,
    layer: Layer.succeed(Store, store),
    run,
    setNow: (ms: number) => {
      now = ms;
    },
    now: () => now,
    withTx: <A>(effect: Effect.Effect<A, never, Tx>): A =>
      sqliteStep(database, (tx) => Effect.runSync(effect.pipe(Effect.provideService(Tx, tx)))),
  };
};
