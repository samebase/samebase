// The Cloudflare host of the hub (design section 7), in Alchemy's Effect form: the Worker runs the
// core (parsing, pages, signing, upstream calls) and reaches the state through one Durable Object,
// `Hub`, whose RPC method `run(name, args)` runs one command of the closed registry as one
// `transactionSync` step.
//
// The Worker's script name, the class name `Hub` and the instance name `hub` are the address of
// all data: renaming one of them starts from empty storage. The object's binding has the class
// name too.
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { Config, Context, Effect, Schema } from "effect";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { github } from "../../core/connectors/github.ts";
import { google } from "../../core/connectors/google.ts";
import { registrationRoutes } from "../../core/hub/routes.ts";
import { makeHandle } from "../../core/router.ts";
import { Fetch, HubConfig, Keys, makeHubConfig, Random } from "../../core/services.ts";
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
import {
  alarmPlan,
  AllowedRepositories,
  allowListPolicy,
  nextDailyAt,
  FALLBACK_MS,
} from "./settings.ts";

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
const decodeCleanupPayload = Schema.decodeUnknownSync(CleanupPayload);
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
       * One command as one all-or-nothing step: a fresh `Tx`, closed in `finally` before the
       * transaction callback returns or throws, so a rule that suspends cannot write later. The
       * step clock is read once, at entry. A defect throws and rolls the step back. Returns the
       * encoded result.
       */
      const step = <N extends CommandName>(name: N, args: Args<N>): unknown => {
        const now = Date.now();
        return storage.transactionSync(() => {
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
      };

      // Daily cleanup in bounded batches, as Alchemy's durable callback: its row and the native
      // alarm live in the object's own `alchemy_*` tables. Each batch schedules the next one with
      // the run's cutoff, or the next daily run; the job is then never absent. A failed batch is
      // tried again after `FALLBACK_MS`. The failure carries no text: a defect's message must
      // reach no log line.
      const cleanup: Alchemy.Callback<typeof CleanupPayload.Encoded> = yield* Alchemy.makeCallback(
        "cleanup",
        (payload: typeof CleanupPayload.Encoded) =>
          Effect.sync(() => {
            const now = Date.now();
            const plan = alarmPlan(decodeCleanupPayload(payload).cutoff, now);
            const result = decodeResult(
              "lifecycle.cleanup",
              step("lifecycle.cleanup", {
                now: plan.cutoff,
                signInRetentionMs: SIGN_IN_RETENTION_MS,
              }),
            );
            return { now, next: plan.after(result.more) };
          }).pipe(
            // `progress` grows with each batch, so a run of batches keeps a fresh retry budget.
            Effect.flatMap(({ now, next }) =>
              cleanup.schedule(CLEANUP_JOB, {
                at: next.alarmAt,
                payload: next.store === undefined ? {} : { cutoff: next.store },
                progress: now,
              }),
            ),
            Effect.catchCause(() => Effect.fail("cleanup_failed")),
          ),
        { retry: { delay: FALLBACK_MS } },
      );
      if ((yield* cleanup.getStatus(CLEANUP_JOB).pipe(Effect.orDie)) === undefined) {
        yield* cleanup
          .schedule(CLEANUP_JOB, { at: nextDailyAt(Date.now()), payload: {} })
          .pipe(Effect.orDie);
      }

      return {
        /** The RPC method of the Worker: a name of the closed registry and its arguments, as JSON. */
        run: (name: string, args: string) =>
          Effect.sync(() => {
            const command = Schema.decodeUnknownSync(CommandNameSchema)(name);
            return JSON.stringify(step(command, decodeArgs(command, parseJson(args))));
          }),
      };
    });
  }),
) {}

/**
 * The Store of the Worker: one RPC call per command, never retried (a lost reply is an unknown
 * outcome). Any failure becomes `StoreUnavailable` with no text: the RPC error can carry a
 * defect's message, which must reach no response and no log line.
 */
const rpcStore = (hubs: Cloudflare.DurableObject<HubObject>) =>
  Store.of({
    run: (name, args) =>
      Effect.suspend(() =>
        // A stub per call: a stub made in one request refuses I/O in the next one.
        hubs
          .getByName("hub")
          .run(name, JSON.stringify(Schema.encodeSync(commands[name].args)(args))),
      ).pipe(
        Effect.catchCause(() => Effect.fail(new StoreUnavailable())),
        Effect.map((text) => decodeResult(name, parseJson(text))),
      ),
  });

/** The services of the core, from the Worker's bindings. */
const services = (hubs: Cloudflare.DurableObject<HubObject>) =>
  Effect.gen(function* () {
    const issuer = yield* Config.String("ISSUER");
    const allowed = yield* Config.schema(AllowedRepositories, "ALLOWED_REPOSITORIES");
    const keys = yield* Config.Redacted("IDENTITY_BROKER_KEYS");
    return Context.make(
      HubConfig,
      makeHubConfig({
        issuer,
        // The order of the Convex hub (apps/identity-hub/convex/broker.ts): each asks the
        // provider for its account screen on every sign-in.
        connectors: [
          google({
            clientId: yield* Config.Redacted("GOOGLE_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("GOOGLE_CLIENT_SECRET"),
            selectAccount: true,
          }),
          github({
            clientId: yield* Config.Redacted("AUTH_GITHUB_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("AUTH_GITHUB_CLIENT_SECRET"),
            selectAccount: true,
          }),
        ],
        registration: {
          name: "Samebase identity hub (Effect test)",
          terms: "https://samebase.com/terms",
          privacy: "https://samebase.com/privacy",
          policy: allowListPolicy(allowed),
        },
      }),
    ).pipe(
      Context.add(Keys, Keys.of({ read: () => keys })),
      Context.add(Random, Random.crypto),
      Context.add(Fetch, Fetch.global),
      Context.add(Store, rpcStore(hubs)),
    );
  });

const handle = makeHandle({ registerRoutes: registrationRoutes });

/**
 * The Worker. The core takes the Web `Request` and gives a Web `Response`; `HttpServerResponse.raw`
 * hands that `Response` to the platform unchanged (status, body and each `Set-Cookie` field).
 */
export default class Hub extends Cloudflare.Worker<Hub>()(
  "Hub",
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    const name = `identity-broker-effect-${stage}`;
    return {
      name,
      main: import.meta.url,
      workersDev: true,
      // The hub reads the verification file of an app that can be another Worker on workers.dev
      // in this account. Without the flag Cloudflare answers such a fetch with error 1042.
      compatibility: { date: "2026-10-28", flags: ["global_fetch_strictly_public"] },
      // A callback URL carries the provider's code and state, so no invocation log records it.
      // The hub writes only its own allow-listed lines (src/core/router.ts).
      observability: { enabled: true, logs: { enabled: true, invocationLogs: false } },
      // The object runs the new rules right after a deploy, not up to 5 minutes later.
      codeUpdateStrategy: { mode: "immediate" },
      env: {
        ISSUER: `https://${name}.pfp.workers.dev`,
        // samebase/samebase and the samebase organization: public ids.
        ALLOWED_REPOSITORIES: JSON.stringify([
          { repositoryId: "1021726325", ownerId: "285392744" },
        ]),
        IDENTITY_BROKER_KEYS: Config.Redacted("IDENTITY_BROKER_KEYS"),
        GOOGLE_CLIENT_ID: Config.Redacted("GOOGLE_CLIENT_ID"),
        GOOGLE_CLIENT_SECRET: Config.Redacted("GOOGLE_CLIENT_SECRET"),
        AUTH_GITHUB_CLIENT_ID: Config.Redacted("AUTH_GITHUB_CLIENT_ID"),
        AUTH_GITHUB_CLIENT_SECRET: Config.Redacted("AUTH_GITHUB_CLIENT_SECRET"),
      },
    };
  }),
  Effect.gen(function* () {
    const hubs = yield* HubObject;
    // Built once per isolate, on the first request: bindings are read only at runtime.
    const built = yield* Effect.cached(services(hubs).pipe(Effect.orDie));
    return {
      fetch: Effect.gen(function* () {
        const request = yield* Cloudflare.Request;
        const response = yield* handle(request).pipe(Effect.provideContext(yield* built));
        return HttpServerResponse.raw(response);
      }),
    };
  }),
) {}
