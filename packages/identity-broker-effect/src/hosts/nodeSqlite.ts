// A Store over node:sqlite, for tests: each command runs between BEGIN and COMMIT, with a fresh
// `Tx` that is closed before the transaction ends. The database is passed in, so this file needs
// no Node types and the shape is the one of `DatabaseSync`.
import { Effect, Layer } from "effect";
import {
  decodeArgs,
  decodeName,
  decodeResult,
  encodeArgs,
  isReadOnly,
  runStep,
  type Args,
  type CommandName,
  type Result,
} from "../store/commands.ts";
import { ensureLayout, sqlTx, type Exec, type SqlValue } from "../store/sql.ts";
import { Store } from "../store/Store.ts";
import type { Tables } from "../store/tables.ts";
import type { TxShape } from "../store/Tx.ts";

/** The part of node:sqlite's `DatabaseSync` that the host uses. */
export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): { all(...params: Array<SqlValue>): ReadonlyArray<Record<string, unknown>> };
}

/** Runs `body` between BEGIN and COMMIT over a fresh `Tx`; a throw rolls back and is rethrown. */
export const sqliteStep = <A>(
  database: SqliteDatabase,
  body: (tx: TxShape<Tables>) => A,
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

  const runEncoded = (input: string, args: unknown): unknown => {
    const name = decodeName(input);
    const decoded = decodeArgs(name, args);
    return sqliteStep(database, (tx) => runStep(name, decoded, now, tx), {
      readOnly: isReadOnly(name),
    });
  };

  const store = Store.of({ run: (name, args) => Effect.sync(() => runEncoded(name, args)) });

  return {
    store,
    layer: Layer.succeed(Store, store),
    run: <N extends CommandName>(name: N, args: Args<N>): Result<N> =>
      decodeResult(name, runEncoded(name, encodeArgs(name, args))),
    setNow: (ms: number) => {
      now = ms;
    },
    now: () => now,
    withTx: <A>(body: (tx: TxShape<Tables>) => Effect.Effect<A>): A =>
      sqliteStep(database, (tx) => Effect.runSync(body(tx))),
  };
};
