/// <reference types="vite-plus/client" />
// Proof 1: the SQL adapter on node:sqlite and the Convex host (under convex-test) pass the host
// test kit against the memory adapter, and a step that dies, or suspends, leaves the state from
// before the step. convex-test runs the Convex adapter's code, not Convex itself;
// test/convex-app/backend.test.ts plays the same steps on a real Convex backend.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { convexTest } from "convex-test";
import { Cause, Clock, Effect, Exit } from "effect";
import { expect, test } from "vite-plus/test";
import { checkStore, sqliteTestStore, type HostUnderTest } from "../core/testing/harness.ts";
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

test("a store saved by 0.36.0 keeps every row and gets the tables that this build adds", () => {
  // The layout text that 0.36.0 records in `meta`, read from that version's `layoutStatements`.
  const stored = readFileSync(new URL("./layout-0.36.0.sql", import.meta.url), "utf8").trimEnd();
  const saved = (layout: string) => {
    const database = new DatabaseSync(":memory:");
    database.exec(`${layout};\nCREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    database.prepare(`INSERT INTO meta (key, value) VALUES ('layout', ?)`).run(layout);
    return database;
  };
  const database = saved(stored);
  const tenant = { tenantId: "gh-1", ownerId: "65", ownerProofIssuedAt: 0 };
  const app = { appId: "gh-1-app", tenantId: "gh-1" };
  const stop = { key: "github:owner:9", at: 1 };
  const card = {
    clientId: "cl_one",
    redirectUris: ["https://app.example.com/callback"],
    tokenEndpointAuthMethod: "client_secret_post" as const,
    secretHash: "hash",
    connectors: ["fake"],
    connections: [],
    gates: ["github:repository:1", "github:owner:65"],
    confirm: true,
    budget: "github:gh-1",
    ref: "github:gh-1",
    createdAt: 1,
    github: {
      appId: "gh-1-app",
      app: "app",
      deploymentType: "production" as const,
      clientName: "prod",
      softwareVersion: "abc",
      registrationTokenHash: "token-hash",
      renewedAt: 1,
      registeredBy: {
        kind: "github" as const,
        githubRepository: "octo-org/octo-repo",
        githubOwnerId: "65",
        githubActorId: "12",
        githubActorLogin: "octocat",
        commitSha: "sha",
      },
      enrollment: ["fake"],
    },
  };
  sqliteStep(database, (tx) =>
    Effect.runSync(
      Effect.gen(function* () {
        yield* tx.insert("tenants", tenant);
        yield* tx.insert("apps", app);
        yield* tx.insert("stops", stop);
        yield* tx.insert("clients", card);
      }),
    ),
  );

  const store = sqliteTestStore(database, 2);
  expect(store.db.contents()).toMatchObject({
    tenants: [tenant],
    apps: [app],
    stops: [stop],
    clients: [card],
    registrations: [],
    blocks: [],
    blockEvents: [],
    everyAppExemptions: [],
  });
  const block = { action: "block", kind: "owner", reason: "Spam", adminEmail: "a@b.c" } as const;
  expect(store.run("github.changeBlock", { ...block, githubId: "66" })).toEqual({ changed: true });
  expect(
    store.run("github.clients", { allowList: "any", configured: ["fake"] }).clients,
  ).toMatchObject([{ clientId: "cl_one", ownerId: "65" }]);
  // The upgraded layout is this build's: the store opens again as it is.
  expect(sqliteTestStore(database, 3).db.contents().blocks).toHaveLength(1);

  // A table of 0.36.0 that lacks an index is no addition: the store is refused.
  expect(() => sqliteTestStore(saved(stored.slice(0, stored.lastIndexOf(";\n"))), 2)).toThrow(
    "layout",
  );
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
