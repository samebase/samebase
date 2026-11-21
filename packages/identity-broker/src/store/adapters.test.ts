/// <reference types="vite-plus/client" />
// Proof 1: the SQL adapter on node:sqlite and the Convex host (under convex-test) pass the host
// test kit against the memory adapter, and a step that dies, or suspends, leaves the state from
// before the step. convex-test runs the Convex adapter's code, not Convex itself;
// test/convex-app/backend.test.ts plays the same steps on a real Convex backend.
import { DatabaseSync } from "node:sqlite";
import { convexTest } from "convex-test";
import { Cause, Clock, Effect, Exit } from "effect";
import { expect, test } from "vite-plus/test";
import { checkStore, type HostUnderTest } from "../core/testing/harness.ts";
import { api } from "../hosts/convex/component/_generated/api.ts";
import componentSchema from "../hosts/convex/component/schema.ts";
import { convexStore } from "../hosts/convex/hub.ts";
import { convexTx } from "../hosts/convex/tx.ts";
import { sqliteStep } from "../hosts/nodeSqlite.ts";
import { decodeCommand } from "./commands.ts";
import { MemoryDb } from "./memory.ts";
import { ensureLayout } from "./sql.ts";
import { microtaskScheduler, Store } from "./Store.ts";
import type { Tables } from "./tables.ts";
import type { TxShape } from "./Tx.ts";

const componentModules = import.meta.glob("../hosts/convex/component/**/*.ts");

const freshSqlite = () => {
  const database = new DatabaseSync(":memory:");
  sqliteStep(database, () => ensureLayout((sql, params) => database.prepare(sql).all(...params)));
  return database;
};

/** node:sqlite as a host writes it: its step clock is Effect's `Clock`. */
const sqliteHost = (): HostUnderTest => {
  const database = freshSqlite();
  return {
    transaction: async (body) => sqliteStep(database, (tx) => Effect.runSync(body(tx))),
    store: Store.of({
      run: (name, args) =>
        Effect.map(Clock.currentTimeMillis, (now) => {
          const command = decodeCommand(name, args);
          return sqliteStep(database, (tx) => command.run(now, tx), {
            readOnly: command.readOnly,
          });
        }),
    }),
  };
};

/** The Convex host on a fresh convex-test backend whose app is the component's functions. */
const convexTestHost = (): HostUnderTest => {
  const t = convexTest(componentSchema, componentModules);
  return {
    transaction: (body) =>
      t.run((ctx) =>
        Effect.runPromise(
          body(
            // @ts-expect-error convex-test types `ctx.db` with the data model of the component's
            // schema, whose tables come from a string-keyed record. At run time it is the writer
            // that `mutationGeneric` gives commands.run as `GenericDatabaseWriter<GenericDataModel>`.
            convexTx(ctx.db),
          ),
          { scheduler: microtaskScheduler() },
        ),
      ),
    store: convexStore({ runMutation: t.mutation }, api.commands.run),
  };
};

test("node:sqlite passes the host test kit", async () => {
  await checkStore(sqliteHost, { runs: 400 });
  // 400 runs take about 6 s on a CI runner, above the default limit of one test.
}, 60_000);

test("the Convex host under convex-test passes the host test kit", async () => {
  await checkStore(convexTestHost, { runs: 200 });
}, 60_000);

test("a database with another stored layout is refused", () => {
  const database = freshSqlite();
  const exec = (sql: string, params: ReadonlyArray<string | number | null>) =>
    database.prepare(sql).all(...params);
  expect(() => sqliteStep(database, () => ensureLayout(exec))).not.toThrow();
  database.exec(
    `UPDATE meta SET value = 'CREATE TABLE "apps" (id INTEGER PRIMARY KEY)' WHERE key = 'layout'`,
  );
  expect(() => sqliteStep(database, () => ensureLayout(exec))).toThrow("layout");
});

test("a rule that suspends between two writes stores neither, and its late write meets a closed Tx", async () => {
  type Runner = <A>(body: (tx: TxShape<Tables>) => A) => A;
  const memory = new MemoryDb();
  const database = freshSqlite();
  const runners: ReadonlyArray<Runner> = [
    (body) => memory.step(body),
    (body) => sqliteStep(database, body),
  ];
  for (const runner of runners) {
    let late: Exit.Exit<unknown> | undefined;
    const rule = (tx: TxShape<Tables>) =>
      Effect.gen(function* () {
        yield* tx.insert("signIns", { clientId: "1", ref: "a", connector: "c", sub: "s", at: 1 });
        yield* Effect.promise(() => Promise.resolve());
        late = yield* Effect.exit(
          tx.insert("signIns", { clientId: "2", ref: "a", connector: "c", sub: "s", at: 2 }),
        );
      });
    expect(() => runner((tx) => Effect.runSync(rule(tx)))).toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const count = runner((tx) =>
      Effect.runSync(
        tx
          .query("signIns", "by_at", { eq: [], order: "asc", limit: 10 })
          .pipe(Effect.map((rows) => rows.length)),
      ),
    );
    expect(count).toBe(0);
    expect(late !== undefined && Exit.isFailure(late) && Cause.hasDies(late.cause)).toBe(true);
  }
});
