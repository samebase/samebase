// The Cloudflare host of the hub (design section 7), in Alchemy's Effect form: the Worker runs the
// core (parsing, pages, signing, upstream calls) and reaches the state through one Durable Object,
// `Hub`, whose RPC method `run(name, args)` runs one command of the closed registry as one
// `transactionSync` step.
//
// `hubWorker(options)` makes one hub's Worker; an app's stack deploys the hub that its own module
// makes with it. This module's default export is the test hub.
//
// The Worker's script name, the class name `Hub` and the instance name `hub` are the address of
// all data: renaming one of them starts from empty storage. The object's binding has the class
// name too.
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { Clock, Config, Effect, Layer, Schema } from "effect";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { registrationRoutes } from "../../core/hub/routes.ts";
import { hubLogger, makeHandle, type CoreServices } from "../../core/router.ts";
import { Fetch, type HubConfig, Keys, Random } from "../../core/services.ts";
import { SIGN_IN_RETENTION_MS } from "../../core/signIn.ts";
import { commands, CommandNameSchema } from "../../rules/commands.ts";
import { ensureLayout, sqlTx, type Exec } from "../../store/sql.ts";
import {
  decodeArgs,
  decodeResult,
  isReadOnly,
  runStep,
  Store,
  StoreUnavailable,
  type Args,
  type CommandName,
} from "../../store/Store.ts";
import { hubSettings, type HubSettings } from "../settings.ts";
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
      const step = <N extends CommandName>(name: N, args: Args<N>, now: number): unknown =>
        storage.transactionSync(() => {
          let open = true;
          try {
            return runStep(
              name,
              args,
              now,
              sqlTx(exec, () => open, isReadOnly(name)),
            );
          } finally {
            open = false;
          }
        });

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
            const result = yield* Effect.sync(() =>
              decodeResult(
                "lifecycle.cleanup",
                step(
                  "lifecycle.cleanup",
                  { now: plan.cutoff, signInRetentionMs: SIGN_IN_RETENTION_MS },
                  now,
                ),
              ),
            );
            const next = plan.after(result.more);
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
          return yield* Effect.sync(() => {
            const command = Schema.decodeUnknownSync(CommandNameSchema)(name);
            return JSON.stringify(step(command, decodeArgs(command, parseJson(args)), now));
          });
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
const HubStore = Layer.effect(
  Store,
  Effect.gen(function* () {
    const hubs = yield* HubObject;
    return Store.of({
      run: Effect.fn("Store.run")(function* <N extends CommandName>(name: N, args: Args<N>) {
        const text = yield* Effect.suspend(() =>
          // A stub per call: a stub made in one request refuses I/O in the next one.
          hubs
            .getByName("hub")
            .run(name, JSON.stringify(Schema.encodeSync(commands[name].args)(args))),
        ).pipe(Effect.catchCause(() => Effect.fail(new StoreUnavailable())));
        return decodeResult(name, parseJson(text));
      }),
    });
  }),
);

/**
 * One hub. Each secret of its settings is a `Config` read: it declares a secret binding of the
 * Worker at deploy, with the value of the deploying shell's variable of that name, and reads that
 * binding when the Worker starts.
 */
export type HubOptions = HubSettings & {
  /** The module whose default export is this hub's Worker: the caller's `import.meta.url`. */
  readonly main: string;
  /** The Worker's script name, the first part of the address of all data. */
  readonly name: string;
};

/**
 * The Worker's runtime over its settings: every service of the core on Cloudflare, the hub's
 * logger, and `fetch`. The core takes the Web `Request` and gives a Web `Response`;
 * `HttpServerResponse.raw` hands that `Response` to the platform unchanged (status, body and each
 * `Set-Cookie` field). `hubWorker` gives it the settings of its options; the conformance test stack
 * (test/conformance) gives it local settings.
 */
export const hubRuntime = <E, R>(settings: Layer.Layer<HubConfig, E, R>) =>
  Effect.gen(function* () {
    const handle = makeHandle({ registerRoutes: registrationRoutes });
    // Built once per isolate, when the Worker starts.
    const services = yield* Effect.context<CoreServices>();
    return {
      fetch: Effect.gen(function* () {
        const request = yield* Cloudflare.Request;
        return HttpServerResponse.raw(yield* handle(request).pipe(Effect.provideContext(services)));
      }),
    };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(settings, Keys.layer, Random.layer, Fetch.layer, HubStore, hubLogger),
    ),
  );

/**
 * The Worker of one hub. The module named by `options.main` default-exports it, so the bundle's
 * entry imports this Worker; the bundle exports the object's class `Hub` itself.
 */
export const hubWorker = (options: HubOptions) =>
  class Hub extends Cloudflare.Worker<Hub>()(
    "Hub",
    {
      name: options.name,
      main: options.main,
      workersDev: true,
      // The hub reads the verification file of an app that can be another Worker on workers.dev
      // in this account. Without the flag Cloudflare answers such a fetch with error 1042.
      compatibility: { date: "2026-10-28", flags: ["global_fetch_strictly_public"] },
      // A callback URL carries the provider's code and state, so no invocation log records it.
      // The hub writes only its own allow-listed lines (src/core/router.ts).
      observability: { enabled: true, logs: { enabled: true, invocationLogs: false } },
      // The object runs the new rules right after a deploy, not up to 5 minutes later.
      codeUpdateStrategy: { mode: "immediate" },
    },
    hubRuntime(hubSettings(options)),
  ) {};

/**
 * The test hub, deployed at the stage `dev-spike` of alchemy.run.ts. Its issuer is the workers.dev
 * address of its script.
 */
export default hubWorker({
  main: import.meta.url,
  name: "identity-broker-effect-dev-spike",
  issuer: "https://identity-broker-effect-dev-spike.pfp.workers.dev",
  connectors: {
    google: {
      clientId: Config.Redacted("GOOGLE_CLIENT_ID"),
      clientSecret: Config.Redacted("GOOGLE_CLIENT_SECRET"),
    },
    github: {
      clientId: Config.Redacted("AUTH_GITHUB_CLIENT_ID"),
      clientSecret: Config.Redacted("AUTH_GITHUB_CLIENT_SECRET"),
    },
  },
  // samebase/samebase and the samebase organization.
  allowedRepositories: [{ repositoryId: "1021726325", ownerId: "285392744" }],
  registration: {
    name: "Samebase identity hub (Effect test)",
    terms: "https://samebase.com/terms",
    privacy: "https://samebase.com/privacy",
  },
});
