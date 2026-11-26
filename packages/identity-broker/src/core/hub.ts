import { Cause, Config, ConfigProvider, Context, Effect, Exit, Layer, Logger } from "effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { makeConnections } from "../connections/routes.ts";
import type { ConnectionSettings } from "../connections/providers.ts";
import { defaultKeys, hubSettings, type HubSettings } from "../hosts/settings.ts";
import { Store } from "../store/Store.ts";
import {
  hubLogger,
  makeHandle,
  serverError,
  type CoreServices,
  type PublicRegistration,
  type Registration,
} from "./router.ts";
import {
  Fetch,
  HubConfig,
  HubConfigError,
  Keys,
  parseIssuer,
  Random,
  SignInPage,
  type ServiceSettings,
} from "./services.ts";

type Hub<R = never> = {
  readonly fetch: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    never,
    HttpServerRequest.HttpServerRequest | R
  >;
};

type HubOptions<R> = HubSettings<R> & {
  /** Without it the hub mounts no connection route. */
  readonly connections?: ConnectionSettings<R>;
} & (
    | { readonly registration: Registration & { readonly public?: never } }
    | {
        readonly registration: PublicRegistration;
        readonly service: ServiceSettings;
      }
  );

// workerd logs a thrown value that is no Error, such as Effect's ConfigError, as "[object Object]".
const cannotStart = Effect.catchCause((cause: Cause.Cause<unknown>) =>
  Effect.die(
    new Error(
      `The hub cannot start: ${Cause.prettyErrors(cause)
        .map((error) => `${error.name}: ${error.message}`)
        .join("; ")}`,
    ),
  ),
);

/**
 * The hub over its settings, built when this runs. The scope of `settings` closes when the build
 * ends, so `settings` must hold no finalizer that a request needs.
 */
export const hubRuntime = <E, R, RC = never>(
  settings: Layer.Layer<HubConfig | SignInPage | Keys, E, R>,
  registration: Registration,
  connections?: ConnectionSettings<RC>,
): Effect.Effect<Hub, never, Store | R | RC> =>
  Effect.gen(function* () {
    const part =
      connections === undefined
        ? undefined
        : yield* makeConnections(connections).pipe(Effect.orDie);
    const handle = makeHandle(registration, part);
    // Only the hub's own services: a lazy build runs in request 1, whose request and scope must
    // not reach a later request.
    const services = Context.pick(
      Store,
      HubConfig,
      SignInPage,
      Keys,
      Random,
      Fetch,
      ConfigProvider.ConfigProvider,
      Logger.CurrentLoggers,
    )(yield* Effect.context<CoreServices>());
    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const web = yield* HttpServerRequest.toWeb(request).pipe(Effect.orDie);
        // `raw` hands the core's `Response` on unchanged, each `Set-Cookie` field too.
        return HttpServerResponse.raw(yield* handle(web).pipe(Effect.provideContext(services)));
      }),
    };
  }).pipe(
    Effect.provide(Layer.mergeAll(settings, Random.layer, Fetch.layer, hubLogger)),
    cannotStart,
  );

/** Reads each `Config` secret now; with another kind of secret the hub builds at the first request. */
export const hub = <R = never>(options: HubOptions<R>): Effect.Effect<Hub<R>, never, Store> =>
  Effect.gen(function* () {
    const build = hubRuntime(hubSettings(options), options.registration, options.connections);
    const connectors = Object.values(options.connectors);
    const providers = Object.values(options.connections ?? {});
    const credentials = [...connectors, ...providers].flatMap((client) => [
      client.clientId,
      client.clientSecret,
    ]);
    const secrets = [options.keys ?? defaultKeys, ...credentials];
    if (secrets.every((secret) => Config.isConfig(secret))) {
      // @ts-expect-error Each secret is a `Config` here, and a `Config` needs no service.
      const now: Effect.Effect<Hub, never, Store> = build;
      return yield* now;
    }
    for (const secret of secrets) {
      if (Config.isConfig(secret)) {
        const config: Config.Config<unknown> = secret;
        yield* config.pipe(cannotStart);
      }
    }
    yield* Effect.gen(function* () {
      yield* parseIssuer(options.issuer);
      if (connectors.length === 0) {
        return yield* new HubConfigError({ message: "At least one connector is required" });
      }
      if (options.connections !== undefined && providers.length === 0) {
        return yield* Effect.die(new Error("The connections setting names no provider"));
      }
    }).pipe(cannotStart);
    // Also carries the start's configuration provider, which each build reads.
    const start = yield* Effect.context<Store>();
    let built: Hub | undefined;
    const fetch: Hub<R>["fetch"] = Effect.gen(function* () {
      if (built === undefined) {
        const exit = yield* Effect.exit(Effect.provideContext(build, start));
        if (Exit.isFailure(exit)) {
          const reason = Cause.prettyErrors(exit.cause)
            .map((error) => error.message)
            .join("; ");
          return HttpServerResponse.raw(
            yield* serverError({ category: "start_failed", reason }).pipe(
              Effect.provide(hubLogger),
            ),
          );
        }
        built = exit.value;
      }
      return yield* built.fetch;
    });
    return { fetch };
  });
