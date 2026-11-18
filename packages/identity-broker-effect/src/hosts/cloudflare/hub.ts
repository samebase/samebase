// The Cloudflare host of the hub (design section 7): the Worker runs the core (parsing, pages,
// signing, upstream calls) and reaches the state through one Durable Object, `Hub`, whose RPC
// method `run(name, args)` runs one command of the closed registry as one `transactionSync` step.
// The class name `Hub`, the binding `HUB` and the instance name `hub` are the address of all data:
// renaming one of them starts from empty storage.
import { DurableObject } from "cloudflare:workers";
import { Context, Effect, Redacted, Schema } from "effect";
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

/** The bindings of alchemy.run.ts. */
export interface Env {
  readonly HUB: DurableObjectNamespace<Hub>;
  readonly ISSUER: string;
  readonly ALLOWED_REPOSITORIES: string;
  readonly IDENTITY_BROKER_KEYS: string;
  readonly GOOGLE_CLIENT_ID: string;
  readonly GOOGLE_CLIENT_SECRET: string;
  readonly AUTH_GITHUB_CLIENT_ID: string;
  readonly AUTH_GITHUB_CLIENT_SECRET: string;
}

const parseJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

/** The key of the active cleanup run's cutoff in the object's synchronous key-value storage. */
const CUTOFF_KEY = "cleanupCutoff";
const decodeCutoff = Schema.decodeUnknownSync(Schema.UndefinedOr(Schema.Number));

/** The one object of the hub. It does storage only: every state step runs here, synchronously. */
export class Hub extends DurableObject<Env> {
  private readonly exec: Exec;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    this.exec = (statement, params) => sql.exec(statement, ...params).toArray();
    // Before the object takes its first call: the layout, and the daily cleanup alarm if none is
    // armed. A changed layout throws here, so the object refuses every call.
    void ctx.blockConcurrencyWhile(async () => {
      ctx.storage.transactionSync(() => ensureLayout(this.exec));
      if ((await ctx.storage.getAlarm()) === null) {
        await ctx.storage.setAlarm(nextDailyAt(Date.now()));
      }
    });
  }

  /**
   * One command as one all-or-nothing step: a fresh `Tx`, closed in `finally` before the
   * transaction callback returns or throws, so a rule that suspends cannot write later. The step
   * clock is read once, at entry. A defect throws and rolls the step back. Returns the encoded
   * result.
   */
  private step<N extends CommandName>(name: N, args: Args<N>): unknown {
    const now = Date.now();
    return this.ctx.storage.transactionSync(() => {
      let open = true;
      try {
        return runStep(
          name,
          args,
          now,
          sqlTx(this.exec, () => open, isReadOnly(name)),
        );
      } finally {
        open = false;
      }
    });
  }

  /** The RPC method of the Worker: a name of the closed registry and its arguments, as JSON. */
  run(name: string, args: string): string {
    const command = Schema.decodeUnknownSync(CommandNameSchema)(name);
    return JSON.stringify(this.step(command, decodeArgs(command, parseJson(args))));
  }

  /** One bounded cleanup batch per delivery; the schedule is `alarmPlan` in settings.ts. */
  override async alarm(): Promise<void> {
    const now = Date.now();
    await this.ctx.storage.setAlarm(now + FALLBACK_MS);
    const plan = alarmPlan(decodeCutoff(this.ctx.storage.kv.get(CUTOFF_KEY)), now);
    const result = decodeResult(
      "lifecycle.cleanup",
      this.step("lifecycle.cleanup", { now: plan.cutoff, signInRetentionMs: SIGN_IN_RETENTION_MS }),
    );
    const next = plan.after(result.more);
    // No await since the step: the key write commits with the batch.
    if (next.store === undefined) {
      this.ctx.storage.kv.delete(CUTOFF_KEY);
    } else {
      this.ctx.storage.kv.put(CUTOFF_KEY, next.store);
    }
    await this.ctx.storage.setAlarm(next.alarmAt);
  }
}

/**
 * The Store of the Worker: one RPC call per command, never retried (a lost reply is an unknown
 * outcome). A rejection becomes `StoreUnavailable` with no text: the RPC error can carry a defect's
 * message, which must reach no response and no log line.
 */
const rpcStore = (env: Env) =>
  Store.of({
    run: (name, args) =>
      Effect.tryPromise({
        // A stub per call: a stub made in one request refuses I/O in the next one.
        try: () =>
          env.HUB.getByName("hub").run(
            name,
            JSON.stringify(Schema.encodeSync(commands[name].args)(args)),
          ),
        catch: () => new StoreUnavailable(),
      }).pipe(Effect.map((text) => decodeResult(name, parseJson(text)))),
  });

/** The services of the core, built once per isolate from the bindings. */
const services = (env: Env) =>
  Context.make(
    HubConfig,
    makeHubConfig({
      issuer: env.ISSUER,
      // The order of the Convex hub (apps/identity-hub/convex/broker.ts): each asks the provider
      // for its account screen on every sign-in.
      connectors: [
        google({
          clientId: Redacted.make(env.GOOGLE_CLIENT_ID),
          clientSecret: Redacted.make(env.GOOGLE_CLIENT_SECRET),
          selectAccount: true,
        }),
        github({
          clientId: Redacted.make(env.AUTH_GITHUB_CLIENT_ID),
          clientSecret: Redacted.make(env.AUTH_GITHUB_CLIENT_SECRET),
          selectAccount: true,
        }),
      ],
      registration: {
        name: "Samebase identity hub (Effect test)",
        terms: "https://samebase.com/terms",
        privacy: "https://samebase.com/privacy",
        policy: allowListPolicy(
          Schema.decodeUnknownSync(AllowedRepositories)(env.ALLOWED_REPOSITORIES),
        ),
      },
    }),
  ).pipe(
    Context.add(Keys, Keys.of({ read: () => Redacted.make(env.IDENTITY_BROKER_KEYS) })),
    Context.add(Random, Random.crypto),
    Context.add(Fetch, Fetch.global),
    Context.add(Store, rpcStore(env)),
  );

const handle = makeHandle({ registerRoutes: registrationRoutes });
let built: Context.Context<HubConfig | Keys | Random | Fetch | Store> | undefined;

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    built ??= services(env);
    return Effect.runPromise(handle(request).pipe(Effect.provideContext(built)));
  },
} satisfies ExportedHandler<Env>;
