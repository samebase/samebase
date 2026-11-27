/// <reference types="vite-plus/client" />
// Proof 1: the SQL adapter on node:sqlite and the Convex host (under convex-test) pass the host
// test kit against the memory adapter, and a step that dies, or suspends, leaves the state from
// before the step. convex-test runs the Convex adapter's code, not Convex itself;
// test/convex-app/backend.test.ts plays the same steps on a real Convex backend.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { convexTest } from "convex-test";
import { Cause, Clock, Effect, Exit, Schema } from "effect";
import { expect, test } from "vite-plus/test";
import { checkStore, sqliteTestStore, type HostUnderTest } from "../core/testing/harness.ts";
import { api } from "../hosts/convex/component/_generated/api.ts";
import componentSchema from "../hosts/convex/component/schema.ts";
import { convexStore } from "../hosts/convex/broker.ts";
import { commandFunctions } from "../hosts/convex/references.ts";
import { convexTx } from "../hosts/convex/tx.ts";
import { sqliteStep } from "../hosts/nodeSqlite.ts";
import { decodeCommand } from "./commands.ts";
import { MemoryDb } from "./memory.ts";
import { ensureLayout, layoutStatements } from "./sql.ts";
import { microtaskScheduler, Store } from "./Store.ts";
import { tables, type Tables } from "./tables.ts";
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
            // that `mutationGeneric` gives a command as `GenericDatabaseWriter<GenericDataModel>`.
            convexTx(ctx.db),
          ),
          { scheduler: microtaskScheduler() },
        ),
      ),
    store: convexStore({ runQuery: t.query, runMutation: t.mutation }, commandFunctions(api)),
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

/**
 * Cards as 0.44.0 stores them, written by that version's own commands (`github.createClient` for a
 * production and a preview client, `stack.createClient`, and a sign-in to its code exchange, which
 * wrote `lastSignInAt`).
 */
const cards044 = [
  {
    clientId: "cl_production",
    redirectUris: ["https://app.test/cb"],
    tokenEndpointAuthMethod: "client_secret_basic",
    secretHash: "4f2b8a0c1e9d7b6a5f3e2d1c0b9a8f7e6d5c4b3a29180f7e6d5c4b3a2918a0b1",
    connectors: ["g"],
    connections: [],
    gates: ["github:repository:1", "github:owner:65"],
    confirm: true,
    budget: "github:gh-1",
    ref: "github:gh-1",
    createdAt: 1800000000000,
    github: {
      appId: "gh-1-web",
      app: "web",
      deploymentType: "production",
      clientName: "prod",
      softwareVersion: "1",
      registrationTokenHash: "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a29180f7e6d5c4b3a2918a0b1c2d3e4",
      renewedAt: 1800000000000,
      registeredBy: {
        kind: "github",
        githubRepository: "owner-65/repo",
        githubOwnerId: "65",
        githubActorId: "9",
        githubActorLogin: "actor",
        commitSha: "sha",
      },
      enrollment: ["g"],
    },
    lastSignInAt: 1800000001000,
  },
  {
    clientId: "cl_preview",
    redirectUris: ["https://app.test/cb"],
    tokenEndpointAuthMethod: "client_secret_post",
    secretHash: "4f2b8a0c1e9d7b6a5f3e2d1c0b9a8f7e6d5c4b3a29180f7e6d5c4b3a2918a0b1",
    connectors: ["g"],
    connections: [],
    gates: ["github:repository:1", "github:owner:65"],
    confirm: true,
    budget: "github:gh-1",
    ref: "github:gh-1",
    removeAt: 1801209600000,
    createdAt: 1800000000000,
    github: {
      appId: "gh-1-web",
      app: "web",
      deploymentType: "preview",
      clientName: "pr-1",
      softwareVersion: "1",
      registrationTokenHash: "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809",
      renewedAt: 1800000000000,
      registeredBy: {
        kind: "github",
        githubRepository: "owner-65/repo",
        githubOwnerId: "65",
        githubActorId: "9",
        githubActorLogin: "actor",
        commitSha: "sha",
      },
      enrollment: ["g"],
    },
  },
  {
    clientId: "cl_stack",
    redirectUris: ["https://app-pr-1.example.workers.dev/callback"],
    tokenEndpointAuthMethod: "client_secret_post",
    secretHash: "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0",
    connectors: ["g"],
    connections: ["cloudflare"],
    gates: ["stack:preview"],
    confirm: false,
    budget: "stack:preview",
    ref: "stack:preview:pr-1",
    removeAt: 1801209600000,
    createdAt: 1800000000000,
    stack: {
      key: "preview",
      name: "pr-1",
      softwareId: "apps/example",
      softwareVersion: "abc",
      registrationTokenHash: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
      enrollment: ["g"],
    },
  },
];

test("a store of 0.44.0 opens as it is: the same SQL layout, and its cards decode on every store", async () => {
  // The layout text that 0.44.0 records in `meta`, read from that version's `layoutStatements`: a
  // changed layout would stop a live Durable Object until a migration.
  const stored = readFileSync(new URL("./layout-0.44.0.sql", import.meta.url), "utf8").trimEnd();
  expect(layoutStatements.join(";\n")).toBe(stored);
  const decode = Schema.decodeUnknownSync(tables.clients.schema);
  const byClientId = (rows: ReadonlyArray<{ readonly doc: unknown }>) => rows.map((row) => row.doc);

  // Memory: the store checks each document on its write.
  const memory = new MemoryDb();
  expect(cards044.map((card) => decode(card))).toEqual(cards044);
  memory.step((tx) =>
    Effect.runSync(Effect.forEach(cards044, (card) => tx.insert("clients", decode(card)))),
  );
  expect(memory.contents().clients).toEqual(cards044);

  // SQL: the rows as 0.44.0 wrote them, the document text and its key columns.
  const database = freshSqlite();
  for (const card of cards044) {
    database
      .prepare(
        `INSERT INTO "clients" (doc, "clientId", "ref", "removeAt", "github.appId", "github.deploymentType") VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        JSON.stringify(card),
        card.clientId,
        card.ref,
        card.removeAt ?? null,
        card.github?.appId ?? null,
        card.github?.deploymentType ?? null,
      );
  }
  const read = (tx: TxShape<Tables>) =>
    Effect.runSync(
      Effect.forEach(cards044, (card) =>
        tx.query("clients", "by_client_id", { eq: [card.clientId], order: "asc", limit: 2 }),
      ),
    ).flat();
  expect(byClientId(sqliteStep(database, read))).toEqual(cards044);

  // Convex: convex-test checks each raw document against the component's schema, and the
  // adapter decodes it on its read.
  const t = convexTest(componentSchema, componentModules);
  const fromConvex = await t.run(async (ctx) => {
    for (const card of cards044) {
      await ctx.db.insert("clients", card);
    }
    return await Effect.runPromise(
      Effect.forEach(cards044, (card) =>
        // @ts-expect-error convex-test types `ctx.db` with the data model of the component's
        // schema, whose tables come from a string-keyed record. At run time it is the reader
        // that `queryGeneric` gives a command as `GenericDatabaseReader<GenericDataModel>`.
        convexTx(ctx.db).query("clients", "by_client_id", {
          eq: [card.clientId],
          order: "asc",
          limit: 2,
        }),
      ).pipe(Effect.map((rows) => byClientId(rows.flat()))),
      { scheduler: microtaskScheduler() },
    );
  });
  expect(fromConvex).toEqual(cards044);
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
