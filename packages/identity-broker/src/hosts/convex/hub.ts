// The Convex host of the hub. The core runs in an `httpAction`, one run per request, and reaches
// the state through the component `identityBroker` (component/), where each command of the closed
// registry is its own query or mutation, run as one transaction. An app gives
// `convexHub` its reference to the component and its hub (`hub(options)` of the main export), adds
// the hub's routes to its `httpRouter`, and calls `cleanup` from a daily cron.
//
// The secrets are Effect `Config` reads of the deployment's environment variables, which Convex
// gives as `process.env`. Effect's default configuration provider does not work here: it reads
// `import.meta.env`, and the Convex runtime throws at any `import.meta` ("import.meta
// unsupported"). So the hub gives its own provider (`deploymentEnv`).
import { httpActionGeneric, internalActionGeneric, type HttpRouter } from "convex/server";
import { v } from "convex/values";
import { Clock, ConfigProvider, Effect, Schema } from "effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { cleanupBatch, Store, StoreUnavailable } from "../../index.ts";
import { decodeName } from "../../store/commands.ts";
import type { ComponentApi } from "./component/_generated/component.ts";
import type { CommandFunction, CommandFunctions, CommandInput } from "./functions.ts";
import { commandFunctions } from "./references.ts";

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

/** What the Store uses of a Convex action's context. */
type Runner = {
  readonly runQuery: (
    query: Extract<CommandFunction, { kind: "query" }>["reference"],
    args: CommandInput,
  ) => Promise<unknown>;
  readonly runMutation: (
    mutation: Extract<CommandFunction, { kind: "mutation" }>["reference"],
    args: CommandInput,
  ) => Promise<unknown>;
};

/**
 * The Store of one action: one call of the command's own function, never retried (a lost reply
 * is an unknown outcome). Its step clock `now` is Effect's `Clock` when the command starts. Any
 * failure of the call becomes `StoreUnavailable` with no text: the error can carry a defect's
 * message, which must reach no response and no log line.
 */
export const convexStore = (ctx: Runner, functions: CommandFunctions) =>
  Store.of({
    run: Effect.fn("Store.run")(function* (name: string, args: unknown) {
      const now = yield* Clock.currentTimeMillis;
      const command = functions[decodeName(name)];
      return yield* Effect.tryPromise({
        try: () =>
          command.kind === "query"
            ? ctx.runQuery(command.reference, { args, now })
            : ctx.runMutation(command.reference, { args, now }),
        catch: () => new StoreUnavailable(),
      });
    }),
  });

/**
 * One hub on Convex, from `hub(options)` or `hubRuntime` of the main export. It runs in each
 * request, so each request reads the deployment's environment variables of that moment. Each key
 * of the stack layer is the deployment variable that its `Config` names, which the app's stack
 * sets in the `env` of the hub's `Convex.Deployment`.
 */
export const convexHub = (
  component: ComponentApi,
  hub: Effect.Effect<
    {
      readonly fetch: Effect.Effect<
        HttpServerResponse.HttpServerResponse,
        never,
        HttpServerRequest.HttpServerRequest
      >;
    },
    never,
    Store
  >,
) => {
  const functions = commandFunctions(component);

  /**
   * Every request of the hub. The core takes the Web `Request` and gives the Web `Response`, which
   * the action returns unchanged. A failure to build the hub (a missing or wrong setting) rejects,
   * and Convex answers 500.
   */
  const fetch = httpActionGeneric((ctx, request) =>
    Effect.runPromise(
      Effect.flatMap(hub, (built) => built.fetch).pipe(
        Effect.map((response) => HttpServerResponse.toWeb(response)),
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(request),
        ),
        Effect.provideService(Store, convexStore(ctx, functions)),
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
     * The daily cleanup, for the app's cron: batches with one cutoff, the time it starts, until
     * none is left. The cutoff never moves, so the batches end. A failed batch fails the action,
     * and the next day's run deletes what is left.
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
              more = yield* cleanupBatch(cutoff);
            }
            return null;
          }).pipe(Effect.provideService(Store, convexStore(ctx, functions))),
        ),
    }),
  };
};
