// The deploy probe: one Worker and one SQLite Durable Object, which the real hub replaces. It
// proves the platform recipe of design.md section 7 on Cloudflare: the Effect core runs in the
// Worker, the object does storage only, and a rule runs as one `transactionSync` step behind a
// Durable Object RPC method `run(name, args)`.
import { DurableObject } from "cloudflare:workers";
import { Cause, Context, Effect, Schema } from "effect";
import { RuleArgs, RuleName, rules, Tx } from "./probeRules.ts";

/** The bindings of alchemy.run.ts. */
export interface Env {
  readonly HUB: DurableObjectNamespace<Hub>;
  readonly PROBE_SECRET: string;
}

const CounterRow = Schema.Struct({ value: Schema.Number });
const AlarmRow = Schema.Struct({ id: Schema.Number, at: Schema.Number });

/** The one object of the hub. Every state step runs here, synchronously, inside one transaction. */
export class Hub extends DurableObject<Env> {
  private readonly tx: Tx["Service"];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL)");
    sql.exec(
      "CREATE TABLE IF NOT EXISTS alarms (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL)",
    );
    this.tx = Tx.of({
      get: (key) =>
        Effect.sync(() => sql.exec("SELECT value FROM counters WHERE key = ?", key).toArray()).pipe(
          Effect.flatMap((rows) =>
            rows[0] === undefined
              ? Effect.succeed(undefined)
              : Schema.decodeUnknownEffect(CounterRow)(rows[0]).pipe(
                  Effect.map((row) => row.value),
                  Effect.orDie,
                ),
          ),
        ),
      put: (key, value) =>
        Effect.sync(() => {
          sql.exec(
            "INSERT INTO counters (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            key,
            value,
          );
        }),
    });
  }

  /** Runs one named rule as one all-or-nothing step. A defect throws, so the step rolls back. */
  run(name: string, args: unknown): number {
    const rule = rules[Schema.decodeUnknownSync(RuleName)(name)];
    const decoded = Schema.decodeUnknownSync(RuleArgs)(args);
    return this.ctx.storage.transactionSync(() =>
      Effect.runSync(rule(decoded).pipe(Effect.provideService(Tx, this.tx))),
    );
  }

  /** Sets the alarm 10 seconds ahead and returns its time. */
  async setAlarm(): Promise<number> {
    const at = Date.now() + 10_000;
    await this.ctx.storage.setAlarm(at);
    return at;
  }

  /** The rows that the alarm wrote, newest first. */
  alarmRows(): ReadonlyArray<typeof AlarmRow.Type> {
    return this.ctx.storage.sql
      .exec("SELECT id, at FROM alarms ORDER BY id DESC LIMIT 10")
      .toArray()
      .map((row) => Schema.decodeUnknownSync(AlarmRow)(row));
  }

  override alarm(): void {
    this.ctx.storage.sql.exec("INSERT INTO alarms (at) VALUES (?)", Date.now());
  }
}

class StoreUnavailable extends Schema.TaggedError<StoreUnavailable>()("StoreUnavailable", {
  message: Schema.String,
}) {}

/** The core's view of the state: named commands, plain JSON in and out. */
class Store extends Context.Service<
  Store,
  {
    readonly run: (
      name: RuleName,
      args: typeof RuleArgs.Type,
    ) => Effect.Effect<number, StoreUnavailable>;
  }
>()("identity-broker-effect/hosts/cloudflare/probe/Store") {}

const counter = { key: "counter" };

/** The probe's Effect core: Web Request in, Web Response out, state through `Store`. */
const handle = (request: Request) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const route = `${request.method} ${new URL(request.url).pathname}`;
    switch (route) {
      case "POST /increment":
        return Response.json({ count: yield* store.run("increment", counter) });
      case "POST /fail":
        return Response.json({ count: yield* store.run("failAfterWrite", counter) });
      case "GET /count":
        return Response.json({ count: yield* store.run("read", counter) });
      default:
        return Response.json({ error: "not_found", route }, { status: 404 });
    }
  });

const hub = (env: Env) => env.HUB.getByName("hub");

/** Probe-only routes that measure or reach the host directly. */
const hostRoute = async (request: Request, env: Env): Promise<Response | undefined> => {
  const route = `${request.method} ${new URL(request.url).pathname}`;
  switch (route) {
    case "POST /alarm":
      return Response.json({ alarmAt: await hub(env).setAlarm() });
    case "GET /alarm":
      return Response.json({ now: Date.now(), rows: await hub(env).alarmRows() });
    case "GET /secret-length":
      return Response.json({ length: env.PROBE_SECRET.length });
    case "GET /timing": {
      const samples: Array<number> = [];
      for (let index = 0; index < 10; index++) {
        const start = Date.now();
        await hub(env).run("read", counter);
        samples.push(Date.now() - start);
      }
      const sorted = samples.toSorted((left, right) => left - right);
      return Response.json({ samples, min: sorted[0], median: sorted[5] });
    }
    default:
      return undefined;
  }
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const direct = await hostRoute(request, env);
    if (direct) return direct;
    const store = Store.of({
      run: (name, args) =>
        Effect.tryPromise({
          try: () => hub(env).run(name, args),
          catch: (cause) => new StoreUnavailable({ message: String(cause) }),
        }),
    });
    return Effect.runPromise(
      handle(request).pipe(
        Effect.provideService(Store, store),
        Effect.catchCause((cause) =>
          Effect.sync(() => {
            console.error(Cause.pretty(cause));
            return Response.json({ error: "server_error" }, { status: 500 });
          }),
        ),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
