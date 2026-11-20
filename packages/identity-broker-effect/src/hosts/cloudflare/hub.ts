// The Cloudflare host of the hub (design section 7), in Alchemy's Effect form: the Worker runs the
// core (parsing, pages, signing, upstream calls) and reaches the state through one Durable Object,
// `Hub`, whose RPC method `run(name, args)` runs one command of the closed registry as one
// `transactionSync` step.
//
// `hubWorker(options)` makes one hub's Worker; an app's stack deploys the hub that its own module
// makes with it, such as the test hub of src/hub.ts.
//
// The Worker's script name, the class name `Hub` and the instance name (`HUB_INSTANCE`) are the
// address of all data: renaming one of them starts from empty storage. The object's binding has
// the class name too.
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { Cause, Clock, ConfigProvider, Effect, Layer, Schema } from "effect";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import type { ConnectionSettings } from "../../connections/providers.ts";
import { makeConnections } from "../../connections/routes.ts";
import { hubLogger, makeHandle, type CoreServices, type Registration } from "../../core/router.ts";
import { Fetch, type HubConfig, Keys, Random, type SignInPage } from "../../core/services.ts";
import { SIGN_IN_RETENTION_MS } from "../../core/signIn.ts";
import {
  decodeArgs,
  decodeName,
  decodeResult,
  isReadOnly,
  runStep,
  type Args,
  type CommandName,
} from "../../store/commands.ts";
import { ensureLayout, sqlTx, type Exec } from "../../store/sql.ts";
import { Store, StoreUnavailable } from "../../store/Store.ts";
import { hubSettings, type HubSettings } from "../settings.ts";
import { secretsStoreConfig, type SecretsStoreSettings } from "./secretsStore.ts";

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
            // The connections part's batch of expired requests and codes, then the core's.
            const more = yield* Effect.sync(
              () =>
                decodeResult(
                  "connections.cleanup",
                  step("connections.cleanup", { now: plan.cutoff }, now),
                ).more ||
                decodeResult(
                  "lifecycle.cleanup",
                  step(
                    "lifecycle.cleanup",
                    { now: plan.cutoff, signInRetentionMs: SIGN_IN_RETENTION_MS },
                    now,
                  ),
                ).more,
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
          return yield* Effect.sync(() => {
            const command = decodeName(name);
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

/**
 * One hub. Each secret of its settings is a `Config` read: it declares a secret binding of the
 * Worker at deploy, with the value of the deploying shell's variable of that name, and reads that
 * binding when the Worker starts. A name of `secretsStore` reads its Secrets Store secret instead.
 */
export type HubOptions = Omit<HubSettings, "issuer"> & {
  /** The module whose default export is this hub's Worker: the caller's `import.meta.url`. */
  readonly main: string;
  /** The Worker's script name, the first part of the address of all data. */
  readonly name: string;
  /**
   * The one registration layer that the hub mounts, from that layer's module, such as
   * `stack({ keys })` of src/layers/stack/routes.ts.
   */
  readonly registration: Registration;
  /**
   * The connection providers of the hub (src/connections/providers.ts). Without it the hub
   * mounts no connection route.
   */
  readonly connections?: ConnectionSettings;
  /**
   * The configuration names that the hub reads from the account's Cloudflare Secrets Store. The
   * deploy binds each secret by name and never reads its value.
   */
  readonly secretsStore?: SecretsStoreSettings;
} & (
    | { readonly issuer: string; readonly domain?: never }
    | {
        /**
         * The hub's custom domain, such as `auth.example.com`, in a Cloudflare zone of the
         * Worker's account. The issuer is then `https://<domain>`.
         */
        readonly domain: string;
        readonly issuer?: never;
      }
  );

/**
 * The Worker's runtime over its settings: every service of the core on Cloudflare, the hub's
 * logger, and `fetch`. The core takes the Web `Request` and gives a Web `Response`;
 * `HttpServerResponse.raw` hands that `Response` to the platform unchanged (status, body and each
 * `Set-Cookie` field). The hub mounts the `registration` layer, and the connections part when
 * `connections` names providers, whose secrets it reads when the Worker starts. `hubWorker` gives
 * it the settings of its options; the conformance test stack (test/conformance) gives it local
 * settings.
 */
export const hubRuntime = <E, R>(
  settings: Layer.Layer<HubConfig | SignInPage, E, R>,
  registration: Registration,
  connections?: ConnectionSettings,
) =>
  Effect.gen(function* () {
    const part =
      connections === undefined
        ? undefined
        : yield* makeConnections(connections).pipe(Effect.orDie);
    const handle = makeHandle(registration, part);
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
    // Alchemy throws a failed start as it is, and workerd logs a thrown value that is no Error
    // (Effect's ConfigError is one) as "[object Object]". So the start fails with an Error that
    // names each failure and its message, for example "ConfigError: SourceError: ...".
    Effect.catchCause((cause) =>
      Effect.die(
        new Error(
          `The hub cannot start: ${Cause.prettyErrors(cause)
            .map((error) => `${error.name}: ${error.message}`)
            .join("; ")}`,
        ),
      ),
    ),
  );

/**
 * `runtime` with the names of `secretsStore` read from the account's Secrets Store. At deploy each
 * secret is bound to the Worker by its name in the store of that name. The Init runs there only to
 * declare bindings and never serves, so each of these names reads as empty. In the Worker each
 * name reads its binding once, when the Worker starts.
 */
const withSecretsStore = <A, E, R>(
  secretsStore: SecretsStoreSettings | undefined,
  runtime: Effect.Effect<A, E, R>,
) =>
  secretsStore === undefined
    ? runtime
    : Effect.gen(function* () {
        const names = new Set(Object.keys(secretsStore.secrets));
        const ambient = yield* ConfigProvider.ConfigProvider;
        if ((yield* Alchemy.ALCHEMY_PHASE) === "runtime") {
          const env = yield* Cloudflare.WorkerEnvironment;
          return yield* runtime.pipe(
            Effect.provideService(
              ConfigProvider.ConfigProvider,
              secretsStoreConfig(env, names, ambient),
            ),
          );
        }
        const store = Cloudflare.SecretsStore.Store.lookup({ name: secretsStore.store });
        yield* (yield* Cloudflare.Worker).bind("SecretsStore", {
          env: Object.fromEntries(
            Object.entries(secretsStore.secrets).map(([name, secret]) => [
              name,
              Cloudflare.SecretsStore.Secret.lookup({ storeId: store.storeId, name: secret }),
            ]),
          ),
        });
        return yield* runtime.pipe(
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            secretsStoreConfig(
              Object.fromEntries([...names].map((name) => [name, ""])),
              names,
              ambient,
            ),
          ),
        );
      });

/**
 * The Worker of one hub. The module named by `options.main` default-exports it, so the bundle's
 * entry imports this Worker; the bundle exports the object's class `Hub` itself.
 */
export const hubWorker = (options: HubOptions) => {
  const issuer = options.domain === undefined ? options.issuer : `https://${options.domain}`;
  return class Hub extends Cloudflare.Worker<Hub>()(
    "Hub",
    {
      name: options.name,
      main: options.main,
      // A hub on a custom domain has that one address.
      ...(options.domain === undefined
        ? { workersDev: true }
        : { domain: options.domain, workersDev: false }),
      // A layer can fetch an app's host, such as the GitHub layer's verification file, and the app
      // can be another Worker on workers.dev in this account. Without the flag Cloudflare answers
      // such a fetch with error 1042.
      compatibility: { date: "2026-10-28", flags: ["global_fetch_strictly_public"] },
      // A callback URL carries the provider's code and state, so no invocation log records it.
      // The hub writes only its own allow-listed lines (src/core/router.ts).
      observability: { enabled: true, logs: { enabled: true, invocationLogs: false } },
      // The object runs the new rules right after a deploy, not up to 5 minutes later.
      codeUpdateStrategy: { mode: "immediate" },
    },
    withSecretsStore(
      options.secretsStore,
      hubRuntime(hubSettings({ ...options, issuer }), options.registration, options.connections),
    ),
  ) {};
};
