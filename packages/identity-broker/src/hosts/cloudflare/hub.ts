// The Cloudflare host of the hub (design section 7), in Alchemy's Effect form: the Worker runs the
// core (parsing, pages, signing, upstream calls) and reaches the state through one Durable Object,
// `Hub`, whose RPC method `run(name, args)` runs one command of the closed registry as one
// `transactionSync` step.
//
// An app's own Worker runs `hub(options)` with `DurableObjectStore`, such as the test hub of src/hub.ts.
//
// The Worker's script name, the class name `Hub` and the instance name (`HUB_INSTANCE`) are the
// address of all data: renaming one of them starts from empty storage. The object's binding has
// the class name too.
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { Clock, Effect, Layer, Schema } from "effect";
import {
  cleanupBatch,
  decodeCommand,
  ensureLayout,
  sqlTx,
  Store,
  StoreUnavailable,
  type Exec,
} from "../../index.ts";

/**
 * The one object of a hub, by name. The store with the connection tables started with this name: an
 * object of another name holds another layout, which this build refuses. A new name starts an empty
 * store, so each client registers again on its next deploy.
 */
export const HUB_INSTANCE = "connections";
import { alarmPlan, nextDailyAt, FALLBACK_MS } from "./settings.ts";

declare global {
  // Alchemy reads `main: import.meta.url` in Node and in the bundle; workerd gives each module its
  // URL, but @cloudflare/workers-types does not declare it.
  interface ImportMeta {
    url: string;
  }
}

const parseJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

/** The payload of the cleanup job: the cutoff of the run in progress, if one is. */
const CleanupPayload = Schema.Struct({ cutoff: Schema.optionalKey(Schema.Number) });
const decodeCleanupPayload = Schema.decodeUnknownEffect(CleanupPayload);
/** The id of the one pending cleanup job. */
const CLEANUP_JOB = "cleanup";

/** The one object of the hub. It does storage only: every state step runs here, synchronously. */
export class HubObject extends Cloudflare.DurableObject<HubObject>()(
  "Hub",
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;
    // Per object start, before the object takes its first call.
    return Effect.gen(function* () {
      const storage = state.raw.storage;
      const exec: Exec = (statement, params) => storage.sql.exec(statement, ...params).toArray();
      // A changed layout throws here, so the object refuses every call.
      yield* Effect.sync(() => storage.transactionSync(() => ensureLayout(exec)));

      /**
       * One command as one all-or-nothing step at `now`, the step clock that the caller read at
       * command entry: a fresh `Tx`, closed in `finally` before the transaction callback returns
       * or throws, so a rule that suspends cannot write later. A defect throws and rolls the step
       * back. Returns the encoded result.
       */
      const step = (name: string, args: unknown, now: number): unknown => {
        const command = decodeCommand(name, args);
        return storage.transactionSync(() => {
          let open = true;
          try {
            return command.run(
              now,
              sqlTx(exec, () => open, command.readOnly),
            );
          } finally {
            open = false;
          }
        });
      };

      // Daily cleanup in bounded batches, as Alchemy's durable callback: its row and the native
      // alarm live in the object's own `alchemy_*` tables. Each batch schedules the next one with
      // the run's cutoff, or the next daily run; the job is then never absent. A failed batch is
      // tried again after `FALLBACK_MS`. The failure carries no text: a defect's message must
      // reach no log line.
      const cleanup: Alchemy.Callback<typeof CleanupPayload.Encoded> = yield* Alchemy.makeCallback(
        "cleanup",
        Effect.fn("HubObject.cleanup")(
          function* (payload: typeof CleanupPayload.Encoded) {
            const now = yield* Clock.currentTimeMillis;
            const plan = alarmPlan((yield* decodeCleanupPayload(payload)).cutoff, now);
            const more = yield* cleanupBatch(plan.cutoff).pipe(
              Effect.provideService(
                Store,
                Store.of({ run: (name, args) => Effect.sync(() => step(name, args, now)) }),
              ),
            );
            const next = plan.after(more);
            // `progress` grows with each batch, so a run of batches keeps a fresh retry budget.
            yield* cleanup.schedule(CLEANUP_JOB, {
              at: next.alarmAt,
              payload: next.store === undefined ? {} : { cutoff: next.store },
              progress: now,
            });
          },
          Effect.catchCause(() => Effect.fail("cleanup_failed")),
        ),
        { retry: { delay: FALLBACK_MS } },
      );
      if ((yield* cleanup.getStatus(CLEANUP_JOB).pipe(Effect.orDie)) === undefined) {
        yield* cleanup
          .schedule(CLEANUP_JOB, {
            at: nextDailyAt(yield* Clock.currentTimeMillis),
            payload: {},
          })
          .pipe(Effect.orDie);
      }

      return {
        /** The RPC method of the Worker: a name of the closed registry and its arguments, as JSON. */
        run: Effect.fn("HubObject.run")(function* (name: string, args: string) {
          const now = yield* Clock.currentTimeMillis;
          return yield* Effect.sync(() => JSON.stringify(step(name, parseJson(args), now)));
        }),
      };
    });
  }),
) {}

/**
 * The Store of the Worker: one RPC call per command, never retried (a lost reply is an unknown
 * outcome). Any failure becomes `StoreUnavailable` with no text: the RPC error can carry a
 * defect's message, which must reach no response and no log line. The Layer yields `HubObject`,
 * so a Worker that is given this Layer binds the object.
 */
export const DurableObjectStore = Layer.effect(
  Store,
  Effect.gen(function* () {
    const hubs = yield* HubObject;
    return Store.of({
      run: Effect.fn("Store.run")(function* (name: string, args: unknown) {
        const text = yield* Effect.suspend(() =>
          // A stub per call: a stub made in one request refuses I/O in the next one.
          hubs.getByName(HUB_INSTANCE).run(name, JSON.stringify(args)),
        ).pipe(Effect.catchCause(() => Effect.fail(new StoreUnavailable())));
        return parseJson(text);
      }),
    });
  }),
);

/** The props of a hub's Worker, for the app's own Worker class to spread. */
export const hubWorkerProps = {
  // A layer can fetch an app's Worker on workers.dev in this account; without the flag that is error 1042.
  compatibility: { date: "2026-10-28", flags: ["global_fetch_strictly_public"] },
  // A callback URL carries the provider's code and state, so no invocation log records it.
  observability: { enabled: true, logs: { enabled: true, invocationLogs: false } },
  // The object runs the new rules right after a deploy, not up to 5 minutes later.
  codeUpdateStrategy: { mode: "immediate" as const },
};
