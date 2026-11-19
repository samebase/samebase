/// <reference types="vite-plus/client" />
// Proof 1: the memory adapter, the SQL adapter on node:sqlite and the Convex adapter (under
// convex-test) agree on every operation list, and a step that dies, or suspends, leaves the state
// from before the step. convex-test runs the Convex adapter's code, not Convex itself;
// test/convex-app/backend.test.ts plays the same steps on a real Convex backend.
import { DatabaseSync } from "node:sqlite";
import { convexTest } from "convex-test";
import { Cause, Effect, Exit, Schema } from "effect";
import fc from "fast-check";
import { expect, test } from "vite-plus/test";
import { api } from "../../test/convex-app/convex/_generated/api.js";
import appSchema from "../../test/convex-app/convex/schema.ts";
import {
  dyingStep,
  edgeStep,
  foundOf,
  longStep,
  memoryPlayer,
  negativeZero,
  play,
  sameKey,
  stepLists,
  type Player,
} from "../hosts/convex/testing.ts";
import { sqliteStep } from "../hosts/nodeSqlite.ts";
import { MemoryDb } from "./memory.ts";
import { ensureLayout } from "./sql.ts";
import { playStep, StepOutput } from "./testing.ts";
import { Tx, type TxShape } from "./Tx.ts";

const appModules = import.meta.glob("../../test/convex-app/convex/**/*.ts");
const decodeOutput = Schema.decodeUnknownSync(StepOutput);

const freshSqlite = () => {
  const database = new DatabaseSync(":memory:");
  sqliteStep(database, () => ensureLayout((sql, params) => database.prepare(sql).all(...params)));
  return database;
};

const sqlitePlayer = (database: DatabaseSync): Player => {
  return async (input) =>
    sqliteStep(database, (tx) =>
      Effect.runSync(playStep(input).pipe(Effect.provideService(Tx, tx))),
    );
};

/** The app's `step` mutation of test/convex-app, the one that the real backend runs. */
const convexTestPlayer = (): Player => {
  const t = convexTest(appSchema, appModules);
  return async (input) => decodeOutput(await t.mutation(api.ops.step, { step: input }));
};

const same = (after: unknown, before: unknown) => expect(after).toEqual(before);

test("memory and node:sqlite give equal results for random operation lists", async () => {
  await fc.assert(
    fc.asyncProperty(stepLists, async (steps) => {
      const database = freshSqlite();
      const fromMemory = await play(steps, memoryPlayer(), same);
      const fromSqlite = await play(steps, sqlitePlayer(database), same);
      expect(fromSqlite).toEqual(fromMemory);
      database.close();
    }),
    { numRuns: 400 },
  );
  // 400 runs take about 6 s on a CI runner, above the default limit of one test.
}, 60_000);

test("memory and the Convex adapter under convex-test give equal results", async () => {
  await fc.assert(
    fc.asyncProperty(stepLists, async (steps) => {
      const fromMemory = await play(steps, memoryPlayer(), same);
      const fromConvex = await play(steps, convexTestPlayer(), same);
      expect(fromConvex).toEqual(fromMemory);
    }),
    { numRuns: 200 },
  );
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

test("equal index keys keep insertion order, and a replace keeps the row's place", async () => {
  const database = freshSqlite();
  for (const player of [memoryPlayer(), sqlitePlayer(database), convexTestPlayer()]) {
    expect((await player(sameKey.step)).log).toEqual(sameKey.log);
  }
});

test("fixed steps at the edges give equal results, and a step that dies writes nothing", async () => {
  const steps = [longStep, edgeStep, dyingStep];
  const fromMemory = await play(steps, memoryPlayer(), same);
  expect(fromMemory.at(-2)).toBe("rolled back");
  expect(fromMemory.slice(0, -2)).not.toContain("rolled back");
  for (const player of [sqlitePlayer(freshSqlite()), convexTestPlayer()]) {
    expect(await play(steps, player, same)).toEqual(fromMemory);
  }
});

test("-0 and 0 are one index value", async () => {
  for (const player of [memoryPlayer(), sqlitePlayer(freshSqlite()), convexTestPlayer()]) {
    expect(foundOf(await player(negativeZero.step))).toEqual(negativeZero.found);
  }
});

test("a rule that suspends between two writes stores neither, and its late write meets a closed Tx", async () => {
  type Runner = <A>(body: (tx: TxShape) => A) => A;
  const memory = new MemoryDb();
  const database = freshSqlite();
  const runners: ReadonlyArray<Runner> = [
    (body) => memory.step(body),
    (body) => sqliteStep(database, body),
  ];
  for (const runner of runners) {
    let late: Exit.Exit<unknown> | undefined;
    const rule = Effect.gen(function* () {
      const tx = yield* Tx;
      yield* tx.insert("signIns", { appId: "a", clientId: "1", connector: "c", sub: "s", at: 1 });
      yield* Effect.promise(() => Promise.resolve());
      late = yield* Effect.exit(
        tx.insert("signIns", { appId: "a", clientId: "2", connector: "c", sub: "s", at: 2 }),
      );
    });
    expect(() =>
      runner((tx) => Effect.runSync(rule.pipe(Effect.provideService(Tx, tx)))),
    ).toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const count = runner((tx) =>
      Effect.runSync(
        Effect.gen(function* () {
          const rows = yield* (yield* Tx).query("signIns", "by_at", {
            eq: [],
            order: "asc",
            limit: 10,
          });
          return rows.length;
        }).pipe(Effect.provideService(Tx, tx)),
      ),
    );
    expect(count).toBe(0);
    expect(late !== undefined && Exit.isFailure(late) && Cause.hasDies(late.cause)).toBe(true);
  }
});
