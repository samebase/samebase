// Proof 1: the memory adapter and the SQL adapter on node:sqlite agree on every operation list, and
// a step that dies, or suspends, leaves the state from before the step.
import { DatabaseSync } from "node:sqlite";
import { Cause, Effect, Exit } from "effect";
import fc from "fast-check";
import { expect, test } from "vite-plus/test";
import { sqliteStep } from "../hosts/nodeSqlite.ts";
import { MemoryDb } from "./memory.ts";
import { ensureLayout } from "./sql.ts";
import { declarations, type Doc, type IndexName } from "./tables.ts";
import { Tx, type Bound, type IndexValue, type Query, type RowId, type TxShape } from "./Tx.ts";

type Table = "signIns" | "signInPageExemptions" | "clients";

const strings = fc.oneof(
  fc.constantFrom("", "a", "b", "ab", "é", "\u{1F600}", "�", "", "￿", "\u{10000}", "a\u0000"),
  fc.string({ unit: "binary", maxLength: 3 }),
);
const numbers = fc.oneof(
  fc.constantFrom(-1, 0, 1, 2.5, 10, 1e12),
  fc.integer({ min: -3, max: 3 }),
  fc
    .double({ noNaN: true, noDefaultInfinity: true })
    .map((value) => (Object.is(value, -0) ? 0 : value)),
);
const maybe = <A>(arbitrary: fc.Arbitrary<A>) => fc.option(arbitrary, { nil: undefined, freq: 3 });

const signIn = fc.record({ appId: strings, at: numbers }).map(({ appId, at }): Doc<"signIns"> => ({
  appId,
  clientId: "c",
  connector: "github",
  sub: "s",
  at,
}));
const exemption = fc
  .oneof(
    fc.constant({ scope: "every_app" as const }),
    fc.record({ scope: fc.constant("repository" as const), tenantId: strings, ownerId: strings }),
  )
  .map((target): Doc<"signInPageExemptions"> => ({ target, reason: "r" }));
const client = fc
  .record({
    clientId: strings,
    appId: strings,
    deploymentType: fc.constantFrom(
      "production" as const,
      "preview" as const,
      "development" as const,
    ),
    createdAt: numbers,
    lastSignInAt: maybe(numbers),
    removeAt: maybe(numbers),
  })
  .map((fields): Doc<"clients"> => ({
    clientId: fields.clientId,
    appId: fields.appId,
    secretHash: "h",
    tokenEndpointAuthMethod: "client_secret_basic",
    redirectUris: ["https://a.example/cb"],
    deploymentType: fields.deploymentType,
    clientName: "prod",
    softwareVersion: "1",
    createdAt: fields.createdAt,
    ...(fields.lastSignInAt === undefined ? {} : { lastSignInAt: fields.lastSignInAt }),
    registrationTokenHash: "r",
    ...(fields.removeAt === undefined ? {} : { removeAt: fields.removeAt }),
    renewedAt: 0,
    app: "a",
    registeredBy: {
      kind: "initial_access_token",
      githubRepository: "o/r",
      githubOwnerId: "1",
      issuedAt: 0,
    },
    connectors: ["github"],
  }));

const docOf = { signIns: signIn, signInPageExemptions: exemption, clients: client };

const indexNames: { readonly [T in Table]: ReadonlyArray<IndexName<T>> } = {
  signIns: ["by_app_id_and_at", "by_at"],
  signInPageExemptions: ["by_target"],
  clients: [
    "by_client_id",
    "by_app_id",
    "by_app_id_and_deployment_type",
    "by_deployment_type_and_activity",
    "by_remove_at",
  ],
};

const valueFor = (type: "string" | "number"): fc.Arbitrary<IndexValue> => {
  const present: fc.Arbitrary<IndexValue> =
    type === "string" ? strings : fc.oneof(numbers, fc.constantFrom(-1, 0, 1, 10));
  return maybe(present);
};

/** A query op: what it asks, for the counterexample, and how to run it on a `Tx`. */
interface QueryOp {
  readonly kind: "query";
  readonly asks: { readonly table: Table; readonly index: string; readonly query: Query };
  readonly run: (tx: TxShape) => Effect.Effect<ReadonlyArray<unknown>>;
}

const queryOp = <T extends Table>(table: T, index: IndexName<T>, query: Query): QueryOp => ({
  kind: "query",
  asks: { table, index, query },
  run: (tx) => tx.query(table, index, query).pipe(Effect.map((rows) => rows.map((row) => row.doc))),
});

const queryOf = <T extends Table>(table: T): fc.Arbitrary<QueryOp> =>
  fc.constantFrom(...indexNames[table]).chain((index) => {
    const fields = declarations[table].indexes[index] ?? [];
    return fc.integer({ min: 0, max: fields.length }).chain((prefix) => {
      const rangeField = fields.at(prefix);
      const bound = (ops: ReadonlyArray<Bound["op"]>) =>
        rangeField === undefined
          ? fc.constant(undefined)
          : maybe(fc.record({ op: fc.constantFrom(...ops), value: valueFor(rangeField.type) }));
      return fc
        .record({
          eq: fc.tuple(...fields.slice(0, prefix).map((field) => valueFor(field.type))),
          lower: bound(["gt", "gte"]),
          upper: bound(["lt", "lte"]),
          order: fc.constantFrom("asc" as const, "desc" as const),
          limit: fc.integer({ min: 0, max: 6 }),
        })
        .map(({ eq, lower, upper, order, limit }) => {
          const range = [lower, upper].filter((item) => item !== undefined);
          return queryOp(table, index, {
            eq,
            order,
            limit,
            ...(range.length === 0 ? {} : { range }),
          });
        });
    });
  });

const tableArb = fc.constantFrom<Table>("signIns", "signInPageExemptions", "clients");

type Op =
  | { readonly kind: "insert"; readonly table: Table; readonly doc: Doc<Table> }
  | { readonly kind: "replace"; readonly ref: number; readonly doc: Doc<Table> }
  | { readonly kind: "delete"; readonly ref: number }
  | { readonly kind: "get"; readonly ref: number }
  | QueryOp;

const opArb: fc.Arbitrary<Op> = tableArb.chain((table) =>
  fc.oneof(
    { weight: 4, arbitrary: docOf[table].map((doc): Op => ({ kind: "insert", table, doc })) },
    {
      weight: 2,
      arbitrary: fc
        .record({ ref: fc.nat(), doc: docOf[table] })
        .map(({ ref, doc }): Op => ({ kind: "replace", ref, doc })),
    },
    { weight: 1, arbitrary: fc.nat().map((ref): Op => ({ kind: "delete", ref })) },
    { weight: 1, arbitrary: fc.nat().map((ref): Op => ({ kind: "get", ref })) },
    { weight: 4, arbitrary: queryOf(table) },
  ),
);

const stepArb = fc.record({
  ops: fc.array(opArb, { maxLength: 8 }),
  dieAt: maybe(fc.nat({ max: 8 })),
});

interface Ref {
  readonly table: Table;
  readonly id: RowId<Table>;
}

/** Runs the ops of one step and records what each one gave, as JSON-like values. */
const stepProgram = (
  ops: ReadonlyArray<Op>,
  dieAt: number | undefined,
  refs: Array<Ref>,
  log: Array<unknown>,
) =>
  Effect.gen(function* () {
    const tx = yield* Tx;
    const pending: Array<Ref> = [];
    const refAt = (ref: number) => {
      const all = [...refs, ...pending];
      return all.length === 0 ? undefined : all[ref % all.length];
    };
    for (const [at, op] of ops.entries()) {
      if (at === dieAt) {
        return yield* Effect.die(new Error("a defect in the middle of a step"));
      }
      const outcome = yield* Effect.exit(
        Effect.gen(function* () {
          switch (op.kind) {
            case "insert": {
              const id = yield* tx.insert(op.table, op.doc);
              pending.push({ table: op.table, id });
              return "inserted";
            }
            case "replace": {
              const ref = refAt(op.ref);
              if (ref === undefined) return "no ref";
              yield* tx.replace(ref.table, ref.id, op.doc);
              return "replaced";
            }
            case "delete": {
              const ref = refAt(op.ref);
              if (ref === undefined) return "no ref";
              yield* tx.delete(ref.table, ref.id);
              return "deleted";
            }
            case "get": {
              const ref = refAt(op.ref);
              if (ref === undefined) return "no ref";
              return (yield* tx.get(ref.table, ref.id))?.doc ?? null;
            }
            case "query":
              return yield* op.run(tx);
            default:
              return op satisfies never;
          }
        }),
      );
      log.push(Exit.isSuccess(outcome) ? outcome.value : "defect");
    }
    refs.push(...pending);
  });

/** Every row of the three tables, in each index's order. */
const everything = Effect.gen(function* () {
  const tx = yield* Tx;
  const out: Array<unknown> = [];
  for (const order of ["asc", "desc"] as const) {
    const scan: Query = { eq: [], order, limit: 1_000 };
    const reads = [
      ...indexNames.signIns.map((index) => queryOp("signIns", index, scan)),
      ...indexNames.signInPageExemptions.map((index) =>
        queryOp("signInPageExemptions", index, scan),
      ),
      ...indexNames.clients.map((index) => queryOp("clients", index, scan)),
    ];
    for (const read of reads) {
      out.push(yield* read.run(tx));
    }
  }
  return out;
});

const freshSqlite = () => {
  const database = new DatabaseSync(":memory:");
  sqliteStep(database, () => ensureLayout((sql, params) => database.prepare(sql).all(...params)));
  return database;
};

type Runner = <A>(body: (tx: TxShape) => A) => A;

const play = (
  steps: ReadonlyArray<{ ops: ReadonlyArray<Op>; dieAt: number | undefined }>,
  runStep: Runner,
) => {
  const refs: Array<Ref> = [];
  const log: Array<unknown> = [];
  for (const { ops, dieAt } of steps) {
    const before = runStep((tx) => Effect.runSync(everything.pipe(Effect.provideService(Tx, tx))));
    const stepLog: Array<unknown> = [];
    const refsBefore = refs.length;
    try {
      runStep((tx) =>
        Effect.runSync(stepProgram(ops, dieAt, refs, stepLog).pipe(Effect.provideService(Tx, tx))),
      );
      log.push(stepLog);
    } catch {
      log.push(["rolled back", stepLog]);
      refs.length = refsBefore;
      const after = runStep((tx) => Effect.runSync(everything.pipe(Effect.provideService(Tx, tx))));
      expect(after).toEqual(before);
    }
  }
  log.push(runStep((tx) => Effect.runSync(everything.pipe(Effect.provideService(Tx, tx)))));
  return log;
};

test("memory and node:sqlite give equal results for random operation lists", () => {
  fc.assert(
    fc.property(fc.array(stepArb, { minLength: 1, maxLength: 8 }), (steps) => {
      const memory = new MemoryDb();
      const database = freshSqlite();
      const fromMemory = play(steps, (body) => memory.step(body));
      const fromSqlite = play(steps, (body) => sqliteStep(database, body));
      expect(fromSqlite).toEqual(fromMemory);
      database.close();
    }),
    { numRuns: 400 },
  );
});

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

test("equal index keys keep insertion order, and a replace keeps the row's place", () => {
  const memory = new MemoryDb();
  const database = freshSqlite();
  const program = Effect.gen(function* () {
    const tx = yield* Tx;
    const first = yield* tx.insert("signIns", {
      appId: "a",
      clientId: "1",
      connector: "c",
      sub: "s",
      at: 1,
    });
    yield* tx.insert("signIns", { appId: "a", clientId: "2", connector: "c", sub: "s", at: 1 });
    yield* tx.replace("signIns", first, {
      appId: "a",
      clientId: "1b",
      connector: "c",
      sub: "s",
      at: 1,
    });
    const asc = yield* tx.query("signIns", "by_app_id_and_at", {
      eq: ["a", 1],
      order: "asc",
      limit: 5,
    });
    const desc = yield* tx.query("signIns", "by_app_id_and_at", {
      eq: ["a"],
      order: "desc",
      limit: 5,
    });
    return [asc.map((row) => row.doc.clientId), desc.map((row) => row.doc.clientId)];
  });
  const expected = [
    ["1b", "2"],
    ["2", "1b"],
  ];
  expect(memory.step((tx) => Effect.runSync(program.pipe(Effect.provideService(Tx, tx))))).toEqual(
    expected,
  );
  expect(
    sqliteStep(database, (tx) => Effect.runSync(program.pipe(Effect.provideService(Tx, tx)))),
  ).toEqual(expected);
});

test("a rule that suspends between two writes stores neither, and its late write meets a closed Tx", async () => {
  const runners: ReadonlyArray<readonly [string, Runner, () => number]> = (() => {
    const memory = new MemoryDb();
    const database = freshSqlite();
    const count = (runner: Runner) => () =>
      runner((tx) =>
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
    const memoryRunner: Runner = (body) => memory.step(body);
    const sqliteRunner: Runner = (body) => sqliteStep(database, body);
    return [
      ["memory", memoryRunner, count(memoryRunner)],
      ["sqlite", sqliteRunner, count(sqliteRunner)],
    ];
  })();
  for (const [, runner, count] of runners) {
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
    expect(count()).toBe(0);
    expect(late !== undefined && Exit.isFailure(late) && Cause.hasDies(late.cause)).toBe(true);
  }
});
