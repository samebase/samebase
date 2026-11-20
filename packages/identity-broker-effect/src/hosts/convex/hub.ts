// The Convex host of the hub. The core runs in an `httpAction`, one run per request, and reaches
// the state through the component `identityBroker` (component/), whose one mutation
// `commands.run` runs one command of the closed registry as one transaction. An app gives
// `convexHub` its reference to the component, its settings (`hubSettings` of ../settings.ts) and
// the routes of its registration layer, adds the hub's routes to its `httpRouter`, and calls `cleanup` from a daily cron.
//
// The secrets are Effect `Config` reads of the deployment's environment variables, which Convex
// gives as `process.env`. Effect's default configuration provider does not work here: it reads
// `import.meta.env`, and the Convex runtime throws at any `import.meta` ("import.meta
// unsupported"). So the hub gives its own provider (`deploymentEnv`).
import {
  httpActionGeneric,
  internalActionGeneric,
  type FunctionReference,
  type HttpRouter,
} from "convex/server";
import { v } from "convex/values";
import { Clock, ConfigProvider, Effect, Layer, Schema } from "effect";
import { command } from "../../core/command.ts";
import { hubLogger, makeHandle, type Registration } from "../../core/router.ts";
import { Fetch, type HubConfig, Keys, Random, type SignInPage } from "../../core/services.ts";
import { SIGN_IN_RETENTION_MS } from "../../core/signIn.ts";
import { Store, StoreUnavailable } from "../../store/Store.ts";
import type { ComponentApi } from "./component/_generated/component.ts";

const parseJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

const decodeEnvValue = Schema.decodeUnknownSync(Schema.UndefinedOr(Schema.String));

/**
 * The deployment's environment variables, read by name when a `Config` reads them. Convex's
 * `process.env` answers a name but lists none (its keys are not enumerable), and Effect's
 * `ConfigProvider.fromEnv` reads only the listed keys. A path is joined with `_`, as there. The
 * Workers types that this package compiles with leave `process` untyped, so each value is decoded.
 */
const deploymentEnv = ConfigProvider.make((path) =>
  Effect.sync(() => {
    const value = decodeEnvValue(process.env[path.join("_")]);
    return value === undefined ? undefined : ConfigProvider.makeValue(value);
  }),
);

/**
 * The mutation `commands.run` of component/commands.ts: `components.<name>.commands.run` of an
 * app, or the component's own when its functions are the app (the convex-test suite).
 */
type RunCommand = FunctionReference<
  "mutation",
  "public" | "internal",
  { name: string; args: string; now: number },
  string,
  string | undefined
>;

/** What the Store uses of a Convex action's context. */
type Runner = {
  readonly runMutation: (
    mutation: RunCommand,
    args: { name: string; args: string; now: number },
  ) => Promise<string>;
};

/**
 * The Store of one action: one `commands.run` mutation per command, never retried (a lost reply
 * is an unknown outcome). Its step clock `now` is Effect's `Clock` when the command starts. Any
 * failure of the mutation becomes `StoreUnavailable` with no text: the error can carry a defect's
 * message, which must reach no response and no log line.
 */
export const convexStore = (ctx: Runner, run: RunCommand) =>
  Store.of({
    run: Effect.fn("Store.run")(function* (name: string, args: unknown) {
      const now = yield* Clock.currentTimeMillis;
      const text = yield* Effect.tryPromise({
        try: () => ctx.runMutation(run, { name, args: JSON.stringify(args), now }),
        catch: () => new StoreUnavailable(),
      });
      return parseJson(text);
    }),
  });

/**
 * One hub on Convex. `settings` is built in each request, so each request reads the deployment's
 * environment variables of that moment. `registration` is the one registration layer that the hub
 * mounts, from that layer's module. Each key of the stack layer
 * (`stack({ keys })` of src/layers/stack/routes.ts) is the deployment variable that its `Config`
 * names, such as `Config.Redacted("HUB_PREVIEW_KEY")`, read when a registration arrives: the app's
 * stack sets it in the `env` of the hub's `Convex.Deployment`.
 */
export const convexHub = <E>(
  component: ComponentApi,
  settings: Layer.Layer<HubConfig | SignInPage, E>,
  registration: Registration,
) => {
  const handle = makeHandle(registration);

  /**
   * Every request of the hub. The core takes the Web `Request` and gives the Web `Response`, which
   * the action returns unchanged. A failure to build the services (a missing or wrong setting)
   * rejects, and Convex answers 500.
   */
  const fetch = httpActionGeneric((ctx, request) =>
    Effect.runPromise(
      handle(request).pipe(
        Effect.provide(
          Layer.mergeAll(
            settings,
            Keys.layer,
            Random.layer,
            Fetch.layer,
            Layer.succeed(Store, convexStore(ctx, component.commands.run)),
            hubLogger,
          ),
        ),
        Effect.provideService(ConfigProvider.ConfigProvider, deploymentEnv),
      ),
    ),
  );

  return {
    /**
     * Routes every path of the site to the hub, for each method that the hub serves: the core's
     * router answers 404 for a path it does not serve. An exact path or a longer prefix of the
     * app's own wins over these, as Convex's router orders them. HEAD runs the GET route.
     */
    addHttpRoutes: (http: HttpRouter): void => {
      for (const method of ["GET", "POST", "PUT", "DELETE"] as const) {
        http.route({ pathPrefix: "/", method, handler: fetch });
      }
    },

    /**
     * The daily cleanup, for the app's cron: batches of `lifecycle.cleanup` with one cutoff, the
     * time it starts, until a batch reports no `more`. The cutoff never moves, so the batches end.
     * Each batch is its own transaction; a failed batch fails the action, and the next day's run
     * deletes what is left.
     */
    cleanup: internalActionGeneric({
      args: {},
      returns: v.null(),
      handler: (ctx) =>
        Effect.runPromise(
          Effect.gen(function* () {
            const cutoff = yield* Clock.currentTimeMillis;
            let more = true;
            while (more) {
              ({ more } = yield* command("lifecycle.cleanup", {
                now: cutoff,
                signInRetentionMs: SIGN_IN_RETENTION_MS,
              }));
            }
            return null;
          }).pipe(Effect.provideService(Store, convexStore(ctx, component.commands.run))),
        ),
    }),
  };
};
